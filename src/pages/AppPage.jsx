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
import {
  LogOut, Plus, Trash2, Upload, Image as ImgIcon,
  Search, X, ChevronLeft, Loader2, MessageCircle
} from 'lucide-react'

export default function AppPage() {
  const { user, signOut }      = useAuth()
  const navigate               = useNavigate()
  const [convs, setConvs]      = useState([])        // [{id,name,titleKey,outName}]
  const [msgsMap, setMsgsMap]  = useState({})         // {convId: msg[]}
  const [blobsMap, setBlobsMap]= useState({})         // {convId: {ref:url}}
  const [activeId, setActiveId]= useState(null)
  const [lightbox, setLightbox]= useState(null)
  const [loading, setLoading]  = useState(true)
  const [saving, setSaving]    = useState(false)
  const [query, setQuery]      = useState('')
  const [searching, setSearching] = useState(false)
  const htmlRef   = useRef()
  const mediaRef  = useRef()
  const bodyRef   = useRef()

  // ── Load from Supabase on mount ─────────────────────────────────────────────
  useEffect(() => {
    loadConvs()
  }, [])

  const loadConvs = async () => {
    try {
      const data = await getConversations()
      setConvs(data.map(c => ({
        id: c.id, name: c.name, titleKey: c.title_key, outName: c.out_name
      })))
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }

  const loadMsgs = async (convId) => {
    if (msgsMap[convId]) return  // already loaded
    try {
      const msgs = await getMessages(convId)
      setMsgsMap(p => ({ ...p, [convId]: msgs }))
      // Resolve blob URLs from Supabase Storage
      await resolveStorageBlobs(convId, msgs)
    } catch(e) { console.error(e) }
  }

  const resolveStorageBlobs = async (convId, msgs) => {
    const refs = [...new Set(msgs.filter(m=>m.media).map(m=>m.media.ref).filter(Boolean))]
    const entries = {}
    await Promise.all(refs.map(async ref => {
      const url = await getMediaUrl(convId, ref)
      if (url) entries[ref] = url
    }))
    if (Object.keys(entries).length)
      setBlobsMap(p => ({ ...p, [convId]: { ...(p[convId]||{}), ...entries } }))
  }

  // ── Handle HTML files ───────────────────────────────────────────────────────
  const onHtmlFiles = useCallback(async (files) => {
    const arr = Array.from(files).filter(f => /\.html?$/i.test(f.name))
    if (!arr.length) return
    setSaving(true)
    try {
      let lastId = null
      const batch = await Promise.all(arr.map((f,i) => new Promise(resolve => {
        const r = new FileReader()
        r.onload = ev => resolve(parseIG(ev.target.result, `f${Date.now()}_${i}`))
        r.readAsText(f, 'UTF-8')
      })))

      for (const { convName, outName, msgs } of batch) {
        const tk = normTitle(convName)
        const existing = convs.find(c => c.titleKey === tk)

        let convId
        if (existing) {
          convId = existing.id
          await upsertConversation({ id:existing.id, name:existing.name, titleKey:tk, outName:outName||existing.outName })
          // Merge new messages
          const prev = msgsMap[existing.id] || []
          const allMsgs = [...prev, ...msgs].sort((a,b)=>(a.ts&&b.ts)?a.ts-b.ts:0)
          const unique = Array.from(new Map(allMsgs.map(m=>[m.id,m])).values())
          await insertMessages(convId, unique)
          setMsgsMap(p => ({ ...p, [convId]: unique }))
          setConvs(p => p.map(c => c.id===convId ? {...c, outName:outName||c.outName} : c))
        } else {
          const sorted = msgs.sort((a,b)=>(a.ts&&b.ts)?a.ts-b.ts:0)
          const saved = await upsertConversation({ id:undefined, name:convName, titleKey:tk, outName })
          convId = saved.id
          await insertMessages(convId, sorted)
          setConvs(p => [...p, { id:convId, name:convName, titleKey:tk, outName }])
          setMsgsMap(p => ({ ...p, [convId]: sorted }))
        }
        lastId = convId
      }
      if (lastId) { setActiveId(lastId); await loadMsgs(lastId) }
    } catch(e) { console.error(e); alert('خطأ في رفع الملف: ' + e.message) }
    finally { setSaving(false) }
  }, [convs, msgsMap])

  // ── Handle media files ──────────────────────────────────────────────────────
  const onMediaFiles = useCallback(async (files) => {
    if (!activeId) return
    setSaving(true)
    try {
      const entries = {}
      await Promise.all(Array.from(files).map(async f => {
        const url = await uploadMedia(f, activeId)
        entries[f.name] = url
        const base = f.name.replace(/\.[^.]+$/,'')
        entries[base] = url
      }))
      setBlobsMap(p => ({ ...p, [activeId]: { ...(p[activeId]||{}), ...entries } }))
    } catch(e) { console.error(e); alert('خطأ في رفع الوسائط: ' + e.message) }
    finally { setSaving(false) }
  }, [activeId])

  // ── Delete conversation ─────────────────────────────────────────────────────
  const delConv = async (id) => {
    try {
      await deleteMessages(id)
      await deleteConversation(id)
      setConvs(p => p.filter(c => c.id !== id))
      setMsgsMap(p => { const n={...p}; delete n[id]; return n })
      if (activeId === id) setActiveId(convs.find(c=>c.id!==id)?.id || null)
    } catch(e) { console.error(e) }
  }

  // ── Select conversation ─────────────────────────────────────────────────────
  const selectConv = async (id) => {
    setActiveId(id)
    setQuery('')
    setSearching(false)
    await loadMsgs(id)
  }

  // ── Auto-scroll ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (bodyRef.current && !searching)
      setTimeout(() => { bodyRef.current.scrollTop = bodyRef.current.scrollHeight }, 80)
  }, [activeId, msgsMap])

  // ── Derived ─────────────────────────────────────────────────────────────────
  const activeConv = convs.find(c => c.id === activeId)
  const activeMsgs = msgsMap[activeId] || []
  const activeBlobs = blobsMap[activeId] || {}
  const filteredMsgs = query.trim()
    ? activeMsgs.filter(m => m.text?.toLowerCase().includes(query.toLowerCase()))
    : activeMsgs
  const mediaRefs   = [...new Set(activeMsgs.filter(m=>m.media).map(m=>m.media.ref).filter(Boolean))]
  const linkedCount = mediaRefs.filter(r => resolveBlob(activeBlobs,{},r)).length

  // ── Drag & drop ─────────────────────────────────────────────────────────────
  const onDrop = useCallback(e => {
    e.preventDefault()
    const html  = Array.from(e.dataTransfer.files).filter(f=>/\.html?$/i.test(f.name))
    const media = Array.from(e.dataTransfer.files).filter(f=>/\.(jpg|jpeg|png|gif|webp|mp4|webm|mov|mp3|ogg|opus|m4a|aac)$/i.test(f.name))
    if (html.length)  onHtmlFiles(html)
    if (media.length) onMediaFiles(media)
  }, [onHtmlFiles, onMediaFiles])

  return (
    <div className="flex h-screen overflow-hidden bg-[#090909]"
         onDragOver={e=>e.preventDefault()} onDrop={onDrop}>

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <div className="w-[235px] flex-shrink-0 flex flex-col border-l border-ig-border"
           style={{background:'#0c0c0c'}}>

        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-3 border-b border-ig-border flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-ig-grad flex items-center justify-center text-sm flex-shrink-0
                          shadow-lg shadow-pink-500/20">📷</div>
          <span className="text-sm font-bold flex-1"
                style={{background:'linear-gradient(90deg,#f09433,#dc2743,#bc1888)',
                        WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>
            InstaView
          </span>
          <button onClick={()=>htmlRef.current?.click()}
            className="w-6 h-6 rounded-full flex items-center justify-center text-ig-muted
                       hover:text-ig-text hover:bg-white/5 transition-all"
            title="رفع محادثة">
            <Plus size={13}/>
          </button>
        </div>

        {/* Conv list */}
        <div className="flex-1 overflow-y-auto py-1 scrollbar-none">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={18} className="animate-spin text-ig-muted"/>
            </div>
          ) : convs.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-ig-muted leading-relaxed">
              لا توجد محادثات<br/>
              <span className="opacity-50">اضغط + لرفع ملف</span>
            </div>
          ) : convs.map(conv => (
            <div key={conv.id}
                 className={`group flex items-center gap-2 px-2.5 py-2 mx-1 rounded-xl cursor-pointer
                             transition-all duration-150
                             ${activeId===conv.id
                               ? 'bg-gradient-to-r from-blue-950/60 to-purple-950/40 border border-white/[.06]'
                               : 'hover:bg-white/[.04]'
                             }`}
                 onClick={()=>selectConv(conv.id)}>
              <div className="avatar-ring w-8 h-8 flex-shrink-0">
                <div className="avatar-ring-inner text-xs font-bold">
                  {(conv.name||'?')[0].toUpperCase()}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold truncate">{conv.name}</div>
                <div className="text-[10px] text-ig-muted">
                  {msgsMap[conv.id]?.length || '...'} رسالة
                </div>
              </div>
              <button onClick={e=>{e.stopPropagation();delConv(conv.id)}}
                className="opacity-0 group-hover:opacity-100 text-red-500/50 hover:text-red-400
                           transition-all p-1 rounded-lg hover:bg-red-500/10">
                <Trash2 size={11}/>
              </button>
            </div>
          ))}
        </div>

        {/* User footer */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-t border-ig-border flex-shrink-0">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-600 to-purple-600
                          flex items-center justify-center text-[11px] font-bold flex-shrink-0">
            {user?.email?.[0]?.toUpperCase()||'U'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10.5px] font-medium truncate opacity-70">{user?.email}</div>
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
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 py-2.5 glass border-b border-ig-border flex-shrink-0">
              <div className="avatar-ring w-9 h-9 flex-shrink-0">
                <div className="avatar-ring-inner text-sm font-bold">
                  {(activeConv.name||'?')[0].toUpperCase()}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{activeConv.name}</div>
                <div className="text-[10.5px] text-ig-muted">
                  {activeMsgs.length} رسالة
                  {mediaRefs.length>0 && (
                    <span className={`mr-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold
                                     ${linkedCount===mediaRefs.length?'bg-green-800/50 text-green-400':'bg-blue-900/50 text-blue-400'}`}>
                      {linkedCount}/{mediaRefs.length} وسائط
                    </span>
                  )}
                </div>
              </div>

              {/* Search */}
              <div className={`flex items-center gap-2 transition-all duration-200 overflow-hidden
                              ${searching?'w-44':'w-7'}`}>
                {searching ? (
                  <div className="flex items-center gap-1 bg-white/[.06] rounded-xl px-2.5 py-1.5 flex-1 border border-white/10">
                    <Search size={11} className="text-ig-muted flex-shrink-0"/>
                    <input autoFocus value={query} onChange={e=>setQuery(e.target.value)}
                      placeholder="ابحث..." dir="rtl"
                      className="bg-transparent text-[12px] outline-none flex-1 text-ig-text placeholder-ig-muted w-full"/>
                    <button onClick={()=>{setSearching(false);setQuery('')}}>
                      <X size={11} className="text-ig-muted hover:text-ig-text"/>
                    </button>
                  </div>
                ) : (
                  <button onClick={()=>setSearching(true)}
                    className="text-ig-muted hover:text-ig-text p-1.5 rounded-lg hover:bg-white/5 transition-all">
                    <Search size={15}/>
                  </button>
                )}
              </div>

              <button onClick={()=>mediaRef.current?.click()}
                className="text-ig-muted hover:text-ig-text p-1.5 rounded-lg hover:bg-white/5 transition-all"
                title="رفع وسائط">
                <ImgIcon size={15}/>
              </button>
              <button onClick={()=>htmlRef.current?.click()}
                className="text-ig-muted hover:text-ig-text p-1.5 rounded-lg hover:bg-white/5 transition-all"
                title="إضافة ملف">
                <Plus size={15}/>
              </button>
            </div>

            {/* Messages */}
            <div ref={bodyRef} className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-0.5 scrollbar-none">
              {query && filteredMsgs.length===0 ? (
                <div className="flex-1 flex items-center justify-center text-ig-muted text-sm">
                  لا توجد نتائج لـ "{query}"
                </div>
              ) : renderMessages(
                  filteredMsgs,
                  activeConv.outName,
                  activeBlobs,
                  setLightbox
                )
              }
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 px-4 py-2.5 glass border-t border-ig-border flex-shrink-0">
              <div className="flex-1 bg-[#1a1a1a] border border-ig-border rounded-full px-4 py-2
                              text-xs text-ig-muted select-none">
                أكتب رسالة…
              </div>
              {saving && <Loader2 size={14} className="animate-spin text-ig-blue"/>}
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 relative overflow-hidden">
            {/* BG glow */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full opacity-10"
                   style={{background:'radial-gradient(circle, #dc2743 0%, transparent 70%)'}}/>
            </div>
            <div className="w-16 h-16 rounded-2xl bg-ig-grad flex items-center justify-center text-3xl glow-pink relative">
              📷
            </div>
            <div className="text-center relative">
              <h2 className="text-xl font-bold mb-2">مرحباً بك في InstaView</h2>
              <p className="text-sm text-ig-muted max-w-xs leading-relaxed">
                ارفع ملفات HTML المصدّرة من Instagram<br/>لعرضها وحفظها بشكل دائم
              </p>
            </div>
            <button onClick={()=>htmlRef.current?.click()}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-ig-grad text-white
                         text-sm font-semibold hover:opacity-90 active:scale-[.98] transition-all
                         glow-pink shadow-lg shadow-pink-500/20">
              <Upload size={15}/> رفع ملف HTML
            </button>
            <p className="text-xs text-ig-muted opacity-40">أو اسحب الملفات هنا</p>
            {saving && (
              <div className="flex items-center gap-2 text-xs text-ig-muted">
                <Loader2 size={13} className="animate-spin"/> جاري الحفظ…
              </div>
            )}
          </div>
        )}
      </div>

      {lightbox&&<Lightbox src={lightbox.src} type={lightbox.type} onClose={()=>setLightbox(null)}/>}
      <input ref={htmlRef}  type="file" accept=".html,.htm" multiple className="hidden"
             onChange={e=>{onHtmlFiles(e.target.files);e.target.value=''}}/>
      <input ref={mediaRef} type="file" accept="image/*,video/*,audio/*" multiple className="hidden"
             onChange={e=>{onMediaFiles(e.target.files);e.target.value=''}}/>
    </div>
  )
}

// ── Render messages ───────────────────────────────────────────────────────────
function renderMessages(msgs, outName, blobs, setLightbox) {
  const els = []
  let lastDate = '', lastSender = ''

  msgs.forEach((msg, i) => {
    if (msg.isSystem) {
      els.push(
        <div key={msg.id} className="flex justify-center my-2">
          <span className="text-[10.5px] text-gray-600 italic px-3 py-1 rounded-full bg-white/[.03] border border-white/[.05]">
            {msg.text}
          </span>
        </div>
      )
      lastSender = ''
      return
    }

    const ds = msg.ts
      ? new Date(msg.ts).toLocaleDateString('ar-SA',{weekday:'long',year:'numeric',month:'long',day:'numeric'})
      : (msg.time?.match(/(\w+ \d+, \d{4})/)||[])[1]||''

    if (ds && ds!==lastDate) {
      lastDate = ds
      els.push(
        <div key={`d_${i}`} className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-white/[.05]"/>
          <span className="text-[10px] text-gray-600 px-2.5 py-1 rounded-full bg-white/[.03]
                           border border-white/[.05] flex-shrink-0 font-medium">{ds}</span>
          <div className="flex-1 h-px bg-white/[.05]"/>
        </div>
      )
    }

    const isOut     = outName ? msg.sender===outName : msg.isOut
    const showAv    = !isOut && msg.sender!==lastSender
    const blobUrl   = msg.media ? resolveBlob(blobs, {}, msg.media.ref) : ''

    els.push(
      <div key={msg.id} style={{animationDelay:`${Math.min(i*.005,.15)}s`}}>
        <Bubble
          msg={{...msg,isOut}}
          showAvatar={showAv}
          blobUrl={blobUrl}
          onImageClick={src=>setLightbox({src,type:'image'})}
          onVideoClick={src=>setLightbox({src,type:'video'})}
        />
      </div>
    )
    lastSender = msg.sender
  })
  return els
}
