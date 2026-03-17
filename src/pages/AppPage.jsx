import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { parseIG, normTitle, resolveBlob } from '../utils/parser'
import {
  getConversations, upsertConversation, deleteConversation,
  getMessages, insertMessages, deleteMessages,
  uploadMedia, getMediaUrl
} from '../lib/db'
import Bubble from '../components/Bubble'
import Lightbox from '../components/Lightbox'
import { LogOut, Plus, Trash2, Upload, Mic, Video, Search, X, Loader2 } from 'lucide-react'

export default function AppPage() {
  const { user, signOut }       = useAuth()
  const navigate                = useNavigate()
  const [convs, setConvs]       = useState([])
  const [msgsMap, setMsgsMap]   = useState({})
  const [blobsMap, setBlobsMap] = useState({})
  const [activeId, setActiveId] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [query, setQuery]       = useState('')
  const [searching, setSearching] = useState(false)
  const [mediaToast, setMediaToast] = useState('')   // success toast message
  const htmlRef  = useRef()
  const audioRef = useRef()   // audio files input
  const videoRef = useRef()   // video files input
  const bodyRef  = useRef()

  // ── Load conversations from Supabase ────────────────────────────────────────
  useEffect(() => { loadConvs() }, [])

  async function loadConvs() {
    try {
      const data = await getConversations()
      setConvs(data.map(c => ({ id:c.id, name:c.name, titleKey:c.title_key, outName:c.out_name })))
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function loadMsgs(convId) {
    if (msgsMap[convId]) return
    try {
      const msgs = await getMessages(convId)
      setMsgsMap(p => ({ ...p, [convId]: msgs }))
      resolveStorageBlobs(convId, msgs)
    } catch(e) { console.error(e) }
  }

  async function resolveStorageBlobs(convId, msgs) {
    const refs = [...new Set(msgs.filter(m=>m.media).map(m=>m.media.ref).filter(Boolean))]
    if (!refs.length) return
    const entries = {}
    await Promise.all(refs.map(async ref => {
      const url = await getMediaUrl(convId, ref)
      if (url) {
        entries[ref] = url
        entries[ref.replace(/\.[^.]+$/,'')] = url
      }
    }))
    if (Object.keys(entries).length)
      setBlobsMap(p => ({ ...p, [convId]: { ...(p[convId]||{}), ...entries } }))
  }

  // ── HTML file handler ────────────────────────────────────────────────────────
  const onHtmlFiles = useCallback(async (files) => {
    const arr = Array.from(files).filter(f => /\.html?$/i.test(f.name))
    if (!arr.length) return
    setSaving(true)
    try {
      // Parse all files
      const batch = await Promise.all(arr.map((f,i) => new Promise(resolve => {
        const r = new FileReader()
        r.onload = ev => resolve(parseIG(ev.target.result, `f${Date.now()}_${i}`))
        r.readAsText(f, 'UTF-8')
      })))

      // Group by normTitle — same name = same conversation
      const groups = {}
      for (const result of batch) {
        const tk = normTitle(result.convName)
        if (!groups[tk]) groups[tk] = { ...result, allMsgs: [...result.msgs] }
        else {
          groups[tk].allMsgs.push(...result.msgs)
          if (!groups[tk].outName && result.outName) groups[tk].outName = result.outName
        }
      }

      let lastId = null
      for (const [tk, group] of Object.entries(groups)) {
        // Sort all messages oldest → newest
        const sorted = group.allMsgs
          .sort((a,b) => (a.ts && b.ts) ? a.ts - b.ts : 0)
        // Remove duplicate message IDs
        const unique = Array.from(new Map(sorted.map(m=>[m.id,m])).values())

        // Find if conversation already exists (by titleKey)
        const existing = convs.find(c => c.titleKey === tk)

        let convId
        if (existing) {
          convId = existing.id
          // Merge with existing messages
          const prev = msgsMap[existing.id] || []
          const merged = Array.from(
            new Map([...prev, ...unique].map(m=>[m.id,m])).values()
          ).sort((a,b) => (a.ts&&b.ts)?a.ts-b.ts:0)

          await upsertConversation({ id:convId, name:existing.name, titleKey:tk, outName:group.outName||existing.outName })
          await insertMessages(convId, merged)
          setMsgsMap(p => ({ ...p, [convId]: merged }))
          setConvs(p => p.map(c => c.id===convId ? {...c, outName:group.outName||c.outName} : c))
        } else {
          const saved = await upsertConversation({ id:undefined, name:group.convName, titleKey:tk, outName:group.outName })
          convId = saved.id
          await insertMessages(convId, unique)
          setConvs(p => [...p, { id:convId, name:group.convName, titleKey:tk, outName:group.outName }])
          setMsgsMap(p => ({ ...p, [convId]: unique }))
        }
        lastId = convId
      }

      if (lastId) {
        setActiveId(lastId)
        await loadMsgs(lastId)
      }
    } catch(e) {
      console.error(e)
      alert('خطأ: ' + e.message)
    } finally { setSaving(false) }
  }, [convs, msgsMap])

  // ── Generic media processor ──────────────────────────────────────────────────
  const processMediaFiles = useCallback(async (files, label) => {
    if (!activeId) return
    const arr = Array.from(files)
    if (!arr.length) return
    setSaving(true)
    try {
      const entries = {}
      await Promise.all(arr.map(async f => {
        const localUrl = URL.createObjectURL(f)
        entries[f.name] = localUrl
        entries[f.name.replace(/\.[^.]+$/, "")] = localUrl
        const numMatch = f.name.match(/^(\d+)/)
        if (numMatch) entries[numMatch[1]] = localUrl
        try { await uploadMedia(f, activeId) } catch(_) {}
      }))
      setBlobsMap(p => ({ ...p, [activeId]: { ...(p[activeId]||{}), ...entries } }))
      setMediaToast("✅ " + arr.length + " " + label + " تم ربطهم بنجاح")
      setTimeout(() => setMediaToast(""), 3000)
    } catch(e) { console.error(e) }
    finally { setSaving(false) }
  }, [activeId])

  const onAudioFiles = useCallback((f) => processMediaFiles(f, "تسجيل صوتي"), [processMediaFiles])
  const onVideoFiles = useCallback((f) => processMediaFiles(f, "فيديو"), [processMediaFiles])

  // ── Delete conversation ──────────────────────────────────────────────────────
  const delConv = async (id) => {
    try {
      await deleteMessages(id)
      await deleteConversation(id)
      setConvs(p => p.filter(c => c.id !== id))
      setMsgsMap(p => { const n={...p}; delete n[id]; return n })
      if (activeId === id) setActiveId(convs.filter(c=>c.id!==id)[0]?.id || null)
    } catch(e) { console.error(e) }
  }

  // ── Select conversation ──────────────────────────────────────────────────────
  const selectConv = async (id) => {
    setActiveId(id)
    setQuery('')
    setSearching(false)
    await loadMsgs(id)
  }

  // ── Auto-scroll ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (bodyRef.current && !searching)
      setTimeout(() => { bodyRef.current.scrollTop = bodyRef.current.scrollHeight }, 80)
  }, [activeId, msgsMap])

  // ── Drag & drop ──────────────────────────────────────────────────────────────
  const onDrop = useCallback(e => {
    e.preventDefault()
    const htmlFiles  = Array.from(e.dataTransfer.files).filter(f => /\.html?$/i.test(f.name))
    const mediaFiles = Array.from(e.dataTransfer.files).filter(f =>
      /\.(jpg|jpeg|png|gif|webp|mp4|webm|mov|mp3|ogg|opus|m4a|aac|mp4)$/i.test(f.name))
    if (htmlFiles.length)  onHtmlFiles(htmlFiles)
    if (mediaFiles.length) onMediaFiles(mediaFiles)
  }, [onHtmlFiles, onMediaFiles])

  // ── Derived state ────────────────────────────────────────────────────────────
  const activeConv  = convs.find(c => c.id === activeId)
  const activeMsgs  = msgsMap[activeId] || []
  const activeBlobs = blobsMap[activeId] || {}
  const filteredMsgs = query.trim()
    ? activeMsgs.filter(m => m.text?.toLowerCase().includes(query.toLowerCase()))
    : activeMsgs
  const mediaRefs   = [...new Set(activeMsgs.filter(m=>m.media).map(m=>m.media.ref).filter(Boolean))]
  const linkedCount = mediaRefs.filter(r => resolveBlob(activeBlobs, {}, r)).length

  return (
    <div className="flex h-screen overflow-hidden bg-[#090909]"
         onDragOver={e=>e.preventDefault()} onDrop={onDrop}>

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <div className="w-[235px] flex-shrink-0 flex flex-col border-l border-ig-border" style={{background:'#0c0c0c'}}>
        <div className="flex items-center gap-2 px-3 py-3 border-b border-ig-border flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-ig-grad flex items-center justify-center text-sm flex-shrink-0 shadow-lg shadow-pink-500/20">📷</div>
          <span className="text-sm font-bold flex-1"
            style={{background:'linear-gradient(90deg,#f09433,#dc2743,#bc1888)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>
            InstaView
          </span>
          <button onClick={()=>htmlRef.current?.click()}
            className="w-6 h-6 rounded-full flex items-center justify-center text-ig-muted hover:text-ig-text hover:bg-white/5 transition-all">
            <Plus size={13}/>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-1 scrollbar-none">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-ig-muted"/></div>
          ) : convs.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-ig-muted leading-relaxed">
              لا توجد محادثات<br/><span className="opacity-50">اضغط + لرفع ملف</span>
            </div>
          ) : convs.map(conv => (
            <div key={conv.id}
                 className={`group flex items-center gap-2 px-2.5 py-2 mx-1 rounded-xl cursor-pointer transition-all duration-150
                             ${activeId===conv.id ? 'bg-gradient-to-r from-blue-950/60 to-purple-950/40 border border-white/[.06]' : 'hover:bg-white/[.04]'}`}
                 onClick={()=>selectConv(conv.id)}>
              <div className="avatar-ring w-8 h-8 flex-shrink-0">
                <div className="avatar-ring-inner text-xs font-bold">{(conv.name||'?')[0].toUpperCase()}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold truncate">{conv.name}</div>
                <div className="text-[10px] text-ig-muted">{msgsMap[conv.id]?.length ?? '...'} رسالة</div>
              </div>
              <button onClick={e=>{e.stopPropagation();delConv(conv.id)}}
                className="opacity-0 group-hover:opacity-100 text-red-500/50 hover:text-red-400 transition-all p-1 rounded-lg hover:bg-red-500/10">
                <Trash2 size={11}/>
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 px-3 py-2.5 border-t border-ig-border flex-shrink-0">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-[11px] font-bold flex-shrink-0">
            {user?.email?.[0]?.toUpperCase()||'U'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10.5px] font-medium truncate opacity-60">{user?.email}</div>
          </div>
          <button onClick={async()=>{await signOut();navigate('/')}}
            className="text-ig-muted hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-red-500/10">
            <LogOut size={12}/>
          </button>
        </div>
      </div>

      {/* ── Main ─────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {activeConv ? (
          <>
            <div className="flex items-center gap-3 px-4 py-2.5 glass border-b border-ig-border flex-shrink-0">
              <div className="avatar-ring w-9 h-9 flex-shrink-0">
                <div className="avatar-ring-inner text-sm font-bold">{(activeConv.name||'?')[0].toUpperCase()}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{activeConv.name}</div>
                <div className="text-[10.5px] text-ig-muted flex items-center gap-2">
                  <span>{activeMsgs.length} رسالة</span>
                  {mediaRefs.length > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold
                      ${linkedCount===mediaRefs.length ? 'bg-green-800/50 text-green-400' : 'bg-blue-900/50 text-blue-400'}`}>
                      {linkedCount}/{mediaRefs.length} وسائط
                    </span>
                  )}
                </div>
              </div>

              <div className={`flex items-center gap-2 transition-all duration-200 overflow-hidden ${searching?'w-44':'w-7'}`}>
                {searching ? (
                  <div className="flex items-center gap-1 bg-white/[.06] rounded-xl px-2.5 py-1.5 flex-1 border border-white/10">
                    <Search size={11} className="text-ig-muted flex-shrink-0"/>
                    <input autoFocus value={query} onChange={e=>setQuery(e.target.value)}
                      placeholder="ابحث..." dir="rtl"
                      className="bg-transparent text-[12px] outline-none flex-1 text-ig-text placeholder-ig-muted w-full"/>
                    <button onClick={()=>{setSearching(false);setQuery('')}}><X size={11} className="text-ig-muted hover:text-ig-text"/></button>
                  </div>
                ) : (
                  <button onClick={()=>setSearching(true)} className="text-ig-muted hover:text-ig-text p-1.5 rounded-lg hover:bg-white/5 transition-all">
                    <Search size={15}/>
                  </button>
                )}
              </div>

              {/* Audio button */}
              <button onClick={()=>audioRef.current?.click()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold
                           bg-purple-900/40 hover:bg-purple-800/60 text-purple-300 hover:text-purple-200
                           border border-purple-700/40 hover:border-purple-500/60 transition-all"
                title="رفع تسجيلات صوتية">
                <Mic size={12}/> صوت
              </button>
              {/* Video button */}
              <button onClick={()=>videoRef.current?.click()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold
                           bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 hover:text-blue-200
                           border border-blue-700/40 hover:border-blue-500/60 transition-all"
                title="رفع فيديوهات">
                <Video size={12}/> فيديو
              </button>
              {/* Add HTML */}
              <button onClick={()=>htmlRef.current?.click()}
                className="text-ig-muted hover:text-ig-text p-1.5 rounded-lg hover:bg-white/5 transition-all"
                title="إضافة ملف HTML">
                <Plus size={15}/>
              </button>
            </div>

            <div ref={bodyRef} className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-0.5 scrollbar-none">
              {query && filteredMsgs.length===0 ? (
                <div className="flex-1 flex items-center justify-center text-ig-muted text-sm">لا توجد نتائج لـ "{query}"</div>
              ) : renderMessages(filteredMsgs, activeConv.outName, activeBlobs, setLightbox)}
            </div>

            {/* Toast notification */}
            {mediaToast && (
              <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50
                              px-4 py-2 rounded-xl text-sm font-medium text-white
                              bg-[#1a1a1a] border border-white/10 shadow-xl
                              animate-[slideUp_.3s_ease_both]">
                {mediaToast}
              </div>
            )}
            <div className="flex items-center gap-3 px-4 py-2.5 glass border-t border-ig-border flex-shrink-0">
              <div className="flex-1 bg-[#1a1a1a] border border-ig-border rounded-full px-4 py-2 text-xs text-ig-muted select-none">أكتب رسالة…</div>
              {saving && <Loader2 size={14} className="animate-spin text-ig-blue"/>}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 relative overflow-hidden">
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full opacity-10"
                   style={{background:'radial-gradient(circle, #dc2743 0%, transparent 70%)'}}/>
            </div>
            <div className="w-16 h-16 rounded-2xl bg-ig-grad flex items-center justify-center text-3xl glow-pink relative">📷</div>
            <div className="text-center relative">
              <h2 className="text-xl font-bold mb-2">مرحباً بك في InstaView</h2>
              <p className="text-sm text-ig-muted max-w-xs leading-relaxed">
                ارفع ملفات HTML المصدّرة من Instagram<br/>إذا كانت المحادثة مقسّمة ارفعهم معاً وسيُدمجون تلقائياً
              </p>
            </div>
            <button onClick={()=>htmlRef.current?.click()}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-ig-grad text-white text-sm font-semibold hover:opacity-90 active:scale-[.98] transition-all glow-pink shadow-lg shadow-pink-500/20">
              <Upload size={15}/> رفع ملف HTML
            </button>
            {saving && <div className="flex items-center gap-2 text-xs text-ig-muted"><Loader2 size={13} className="animate-spin"/> جاري الحفظ…</div>}
          </div>
        )}
      </div>

      {lightbox && <Lightbox src={lightbox.src} type={lightbox.type} onClose={()=>setLightbox(null)}/>}
      <input ref={htmlRef}  type="file" accept=".html,.htm" multiple className="hidden"
             onChange={e=>{onHtmlFiles(e.target.files);e.target.value=''}}/>
      <input ref={audioRef} type="file" accept="audio/*,.mp4,.m4a,.ogg,.opus,.mp3,.aac,.wav" multiple className="hidden"
             onChange={e=>{onAudioFiles(e.target.files);e.target.value=''}}/>
      <input ref={videoRef} type="file" accept="video/*,.mp4,.mov,.webm,.avi" multiple className="hidden"
             onChange={e=>{onVideoFiles(e.target.files);e.target.value=''}}/>
    </div>
  )
}

function renderMessages(msgs, outName, blobs, setLightbox) {
  const els = []
  let lastDate = '', lastSender = ''

  msgs.forEach((msg, i) => {
    if (msg.isSystem) {
      els.push(
        <div key={msg.id} className="flex justify-center my-2">
          <span className="text-[10.5px] text-gray-600 italic px-3 py-1 rounded-full bg-white/[.03] border border-white/[.05]">{msg.text}</span>
        </div>
      )
      lastSender = ''; return
    }

    const ds = msg.ts
      ? new Date(msg.ts).toLocaleDateString('ar-SA',{weekday:'long',year:'numeric',month:'long',day:'numeric'})
      : (msg.time?.match(/(\w+ \d+, \d{4})/)||[])[1]||''

    if (ds && ds !== lastDate) {
      lastDate = ds
      els.push(
        <div key={`d_${i}`} className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-white/[.05]"/>
          <span className="text-[10px] text-gray-600 px-2.5 py-1 rounded-full bg-white/[.03] border border-white/[.05] flex-shrink-0 font-medium">{ds}</span>
          <div className="flex-1 h-px bg-white/[.05]"/>
        </div>
      )
    }

    const isOut   = outName ? msg.sender === outName : msg.isOut
    const showAv  = !isOut && msg.sender !== lastSender
    // Resolve blob with multiple strategies
    let blobUrl = ''
    if (msg.media?.ref) {
      blobUrl = resolveBlob(blobs, {}, msg.media.ref)
    }

    els.push(
      <div key={msg.id} style={{animationDelay:`${Math.min(i*.005,.15)}s`}}>
        <Bubble
          msg={{...msg, isOut}}
          showAvatar={showAv}
          blobUrl={blobUrl}
          onImageClick={src => setLightbox({src, type:'image'})}
          onVideoClick={src => setLightbox({src, type:'video'})}
        />
      </div>
    )
    lastSender = msg.sender
  })
  return els
}
