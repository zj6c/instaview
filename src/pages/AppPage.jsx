import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { parseIG, normTitle, resolveBlob } from '../utils/parser'
import Bubble from '../components/Bubble'
import Lightbox from '../components/Lightbox'
import { LogOut, Plus, Trash2, Upload, Mic, Video, Search, X, Loader2 } from 'lucide-react'

// ── In-memory store (works without Supabase) ──────────────────────────────────
const MEM = {}   // { [convId]: { name, titleKey, outName, msgs[], blobs{} } }
let memNextId = 1

export default function AppPage() {
  const { user, signOut } = useAuth()
  const navigate          = useNavigate()

  const [convList,  setConvList]  = useState([])   // [{id, name, titleKey, outName}]
  const [msgsMap,   setMsgsMap]   = useState({})   // {id: msg[]}
  const [blobsMap,  setBlobsMap]  = useState({})   // {id: {ref: blobUrl}}
  const [activeId,  setActiveId]  = useState(null)
  const [lightbox,  setLightbox]  = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [toast,     setToast]     = useState('')
  const [query,     setQuery]     = useState('')
  const [searching, setSearching] = useState(false)

  const htmlRef  = useRef()
  const audioRef = useRef()
  const videoRef = useRef()
  const bodyRef  = useRef()

  // ── Toast ─────────────────────────────────────────────────────────────────
  const showToast = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }, [])

  // ── Scroll to bottom ──────────────────────────────────────────────────────
  useEffect(() => {
    if (bodyRef.current && !searching)
      setTimeout(() => { bodyRef.current.scrollTop = bodyRef.current.scrollHeight }, 80)
  }, [activeId, msgsMap, searching])

  // ── HTML files handler ────────────────────────────────────────────────────
  const onHtmlFiles = useCallback(async (files) => {
    const arr = Array.from(files).filter(f => /\.html?$/i.test(f.name))
    if (!arr.length) return
    setSaving(true)
    try {
      // 1. Parse all files in parallel
      const parsed = await Promise.all(arr.map((f, i) => new Promise(res => {
        const r = new FileReader()
        r.onload = ev => res(parseIG(ev.target.result, `f${Date.now()}_${i}`))
        r.readAsText(f, 'UTF-8')
      })))

      // 2. Group by normalized title (same conversation split across files)
      const groups = {}
      for (const p of parsed) {
        const tk = normTitle(p.convName)
        if (!groups[tk]) {
          groups[tk] = { convName: p.convName, outName: p.outName, msgs: [] }
        } else {
          // Keep outName if found in either file
          if (!groups[tk].outName && p.outName) groups[tk].outName = p.outName
        }
        groups[tk].msgs.push(...p.msgs)
      }

      // 3. For each group: find existing conv or create new
      let lastId = null
      for (const [tk, g] of Object.entries(groups)) {
        // Remove duplicate msg IDs then sort oldest→newest
        const allMsgs = Array.from(
          new Map(g.msgs.map(m => [m.id, m])).values()
        ).sort((a, b) => (a.ts && b.ts) ? a.ts - b.ts : 0)

        // Find existing by titleKey
        const existing = convList.find(c => c.titleKey === tk)

        let convId
        if (existing) {
          convId = existing.id
          // Merge with existing messages
          const prev = msgsMap[convId] || MEM[convId]?.msgs || []
          const merged = Array.from(
            new Map([...prev, ...allMsgs].map(m => [m.id, m])).values()
          ).sort((a, b) => (a.ts && b.ts) ? a.ts - b.ts : 0)

          MEM[convId] = { ...MEM[convId], msgs: merged, outName: g.outName || MEM[convId]?.outName }
          setMsgsMap(p => ({ ...p, [convId]: merged }))
          setConvList(p => p.map(c => c.id === convId
            ? { ...c, outName: g.outName || c.outName }
            : c
          ))
        } else {
          convId = 'c' + (memNextId++)
          MEM[convId] = { name: g.convName, titleKey: tk, outName: g.outName, msgs: allMsgs, blobs: {} }
          const newConv = { id: convId, name: g.convName, titleKey: tk, outName: g.outName }
          setConvList(p => [...p, newConv])
          setMsgsMap(p => ({ ...p, [convId]: allMsgs }))
          setBlobsMap(p => ({ ...p, [convId]: {} }))
        }
        lastId = convId
      }

      if (lastId) {
        setActiveId(lastId)
        showToast(`✅ تم تحميل المحادثة بنجاح`)
      }
    } catch(e) {
      console.error(e)
      showToast('❌ خطأ في قراءة الملف: ' + e.message)
    } finally {
      setSaving(false)
    }
  }, [convList, msgsMap, showToast])

  // ── Media files processor ─────────────────────────────────────────────────
  const processMedia = useCallback((files, label) => {
    if (!activeId) { showToast('⚠️ اختر محادثة أولاً'); return }
    const arr = Array.from(files)
    if (!arr.length) return

    const entries = {}
    arr.forEach(f => {
      const url = URL.createObjectURL(f)
      // Store by: full name, base name (no ext), numeric ID
      entries[f.name] = url
      entries[f.name.replace(/\.[^.]+$/, '')] = url
      const num = f.name.match(/^(\d+)/)
      if (num) {
        entries[num[1]] = url
        // Also try partial numeric match for long IDs
        entries[num[1] + '.mp4']  = url
        entries[num[1] + '.mp3']  = url
        entries[num[1] + '.m4a']  = url
        entries[num[1] + '.ogg']  = url
        entries[num[1] + '.opus'] = url
      }
    })

    if (MEM[activeId]) MEM[activeId].blobs = { ...(MEM[activeId].blobs || {}), ...entries }
    setBlobsMap(p => ({ ...p, [activeId]: { ...(p[activeId] || {}), ...entries } }))

    // Count how many messages now have a matching blob
    const msgs = msgsMap[activeId] || []
    const mediaMsgs = msgs.filter(m => m.media?.ref)
    const linked = mediaMsgs.filter(m => {
      const b = { ...(blobsMap[activeId] || {}), ...entries }
      return resolveBlob(b, {}, m.media.ref)
    }).length
    showToast(`✅ ${arr.length} ${label} — تم ربط ${linked}/${mediaMsgs.length} وسائط`)
  }, [activeId, msgsMap, blobsMap, showToast])

  const onAudioFiles = useCallback(f => processMedia(f, 'تسجيل صوتي'), [processMedia])
  const onVideoFiles = useCallback(f => processMedia(f, 'فيديو'), [processMedia])

  // ── Delete conversation ───────────────────────────────────────────────────
  const delConv = useCallback((id) => {
    delete MEM[id]
    setConvList(p => p.filter(c => c.id !== id))
    setMsgsMap(p => { const n = {...p}; delete n[id]; return n })
    setBlobsMap(p => { const n = {...p}; delete n[id]; return n })
    if (activeId === id) {
      const rem = convList.filter(c => c.id !== id)
      setActiveId(rem[0]?.id || null)
    }
  }, [activeId, convList])

  // ── Select conversation ───────────────────────────────────────────────────
  const selectConv = useCallback((id) => {
    setActiveId(id)
    setQuery('')
    setSearching(false)
  }, [])

  // ── Drag & drop ───────────────────────────────────────────────────────────
  const onDrop = useCallback(e => {
    e.preventDefault()
    const html  = Array.from(e.dataTransfer.files).filter(f => /\.html?$/i.test(f.name))
    const audio = Array.from(e.dataTransfer.files).filter(f => /\.(mp3|m4a|ogg|opus|aac|wav)$/i.test(f.name))
    const video = Array.from(e.dataTransfer.files).filter(f => /\.(mp4|mov|webm|avi)$/i.test(f.name))
    if (html.length)  onHtmlFiles(html)
    if (audio.length) onAudioFiles(audio)
    if (video.length) onVideoFiles(video)
  }, [onHtmlFiles, onAudioFiles, onVideoFiles])

  // ── Derived ───────────────────────────────────────────────────────────────
  const activeConv   = convList.find(c => c.id === activeId)
  const activeMsgs   = msgsMap[activeId] || []
  const activeBlobs  = blobsMap[activeId] || {}
  const filteredMsgs = query.trim()
    ? activeMsgs.filter(m => m.text?.toLowerCase().includes(query.toLowerCase()))
    : activeMsgs
  const mediaRefs    = [...new Set(activeMsgs.filter(m => m.media?.ref).map(m => m.media.ref))]
  const linkedCount  = mediaRefs.filter(r => resolveBlob(activeBlobs, {}, r)).length

  return (
    <div className="flex h-screen overflow-hidden bg-[#090909]"
         onDragOver={e => e.preventDefault()} onDrop={onDrop}>

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <div className="w-[235px] flex-shrink-0 flex flex-col border-l border-ig-border"
           style={{ background: '#0c0c0c' }}>

        {/* Sidebar header */}
        <div className="flex items-center gap-2 px-3 py-3 border-b border-ig-border flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-ig-grad flex items-center justify-center text-sm flex-shrink-0 shadow-lg shadow-pink-500/20">
            📷
          </div>
          <span className="text-sm font-bold flex-1"
                style={{ background:'linear-gradient(90deg,#f09433,#dc2743,#bc1888)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
            InstaView
          </span>
          <button onClick={() => htmlRef.current?.click()}
            className="w-6 h-6 rounded-full flex items-center justify-center text-ig-muted hover:text-ig-text hover:bg-white/5 transition-all">
            <Plus size={13}/>
          </button>
        </div>

        {/* Conv list */}
        <div className="flex-1 overflow-y-auto py-1 scrollbar-none">
          {convList.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-ig-muted leading-relaxed">
              لا توجد محادثات<br/>
              <span className="opacity-50">اضغط + لرفع ملف HTML</span>
            </div>
          ) : convList.map(conv => (
            <div key={conv.id}
                 className={`group flex items-center gap-2 px-2.5 py-2 mx-1 rounded-xl cursor-pointer transition-all duration-150
                   ${activeId === conv.id
                     ? 'bg-gradient-to-r from-blue-950/60 to-purple-950/40 border border-white/[.06]'
                     : 'hover:bg-white/[.04]'}`}
                 onClick={() => selectConv(conv.id)}>
              <div className="avatar-ring w-8 h-8 flex-shrink-0">
                <div className="avatar-ring-inner text-xs font-bold">
                  {(conv.name||'?')[0].toUpperCase()}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold truncate">{conv.name}</div>
                <div className="text-[10px] text-ig-muted">
                  {msgsMap[conv.id]?.length ?? 0} رسالة
                </div>
              </div>
              <button onClick={e => { e.stopPropagation(); delConv(conv.id) }}
                className="opacity-0 group-hover:opacity-100 text-red-500/50 hover:text-red-400 transition-all p-1 rounded-lg hover:bg-red-500/10">
                <Trash2 size={11}/>
              </button>
            </div>
          ))}
        </div>

        {/* User footer */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-t border-ig-border flex-shrink-0">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-[11px] font-bold flex-shrink-0">
            {user?.email?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10.5px] font-medium truncate opacity-60">{user?.email}</div>
          </div>
          <button onClick={async () => { await signOut(); navigate('/') }}
            className="text-ig-muted hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-red-500/10">
            <LogOut size={12}/>
          </button>
        </div>
      </div>

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {activeConv ? (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-2 px-3 py-2 glass border-b border-ig-border flex-shrink-0">
              <div className="avatar-ring w-8 h-8 flex-shrink-0">
                <div className="avatar-ring-inner text-xs font-bold">
                  {(activeConv.name||'?')[0].toUpperCase()}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{activeConv.name}</div>
                <div className="text-[10px] text-ig-muted flex items-center gap-1.5">
                  <span>{activeMsgs.length} رسالة</span>
                  {mediaRefs.length > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold
                      ${linkedCount === mediaRefs.length ? 'bg-green-800/50 text-green-400' : 'bg-blue-900/50 text-blue-400'}`}>
                      {linkedCount}/{mediaRefs.length} وسائط
                    </span>
                  )}
                </div>
              </div>

              {/* Search */}
              {searching ? (
                <div className="flex items-center gap-1 bg-white/[.06] rounded-xl px-2.5 py-1.5 border border-white/10 w-40">
                  <Search size={11} className="text-ig-muted flex-shrink-0"/>
                  <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
                    placeholder="ابحث..." dir="rtl"
                    className="bg-transparent text-[12px] outline-none flex-1 text-ig-text placeholder-ig-muted w-full"/>
                  <button onClick={() => { setSearching(false); setQuery('') }}>
                    <X size={11} className="text-ig-muted hover:text-ig-text"/>
                  </button>
                </div>
              ) : (
                <button onClick={() => setSearching(true)}
                  className="text-ig-muted hover:text-ig-text p-1.5 rounded-lg hover:bg-white/5 transition-all">
                  <Search size={14}/>
                </button>
              )}

              {/* Audio button */}
              <button onClick={() => audioRef.current?.click()}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold
                           bg-purple-900/40 hover:bg-purple-800/60 text-purple-300 border border-purple-700/40
                           hover:border-purple-500/60 transition-all">
                <Mic size={11}/> صوت
              </button>

              {/* Video button */}
              <button onClick={() => videoRef.current?.click()}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold
                           bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 border border-blue-700/40
                           hover:border-blue-500/60 transition-all">
                <Video size={11}/> فيديو
              </button>

              {/* Add HTML */}
              <button onClick={() => htmlRef.current?.click()}
                className="text-ig-muted hover:text-ig-text p-1.5 rounded-lg hover:bg-white/5 transition-all">
                <Plus size={14}/>
              </button>
            </div>

            {/* Messages */}
            <div ref={bodyRef}
                 className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-0.5 scrollbar-none relative">
              {query && filteredMsgs.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-ig-muted text-sm">
                  لا توجد نتائج لـ "{query}"
                </div>
              ) : (
                renderMessages(filteredMsgs, activeConv.outName, activeBlobs, setLightbox)
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 px-4 py-2.5 glass border-t border-ig-border flex-shrink-0 relative">
              {toast && (
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl
                                text-xs font-medium text-white bg-[#1c1c1c] border border-white/10
                                shadow-xl whitespace-nowrap z-50">
                  {toast}
                </div>
              )}
              <div className="flex-1 bg-[#1a1a1a] border border-ig-border rounded-full px-4 py-2 text-xs text-ig-muted select-none">
                أكتب رسالة…
              </div>
              {saving && <Loader2 size={14} className="animate-spin text-ig-blue flex-shrink-0"/>}
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 relative overflow-hidden"
               onDragOver={e => e.preventDefault()} onDrop={onDrop}>
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full opacity-10"
                   style={{ background: 'radial-gradient(circle, #dc2743 0%, transparent 70%)' }}/>
            </div>
            <div className="w-16 h-16 rounded-2xl bg-ig-grad flex items-center justify-center text-3xl glow-pink relative shadow-xl">
              📷
            </div>
            <div className="text-center relative">
              <h2 className="text-xl font-bold mb-2">مرحباً في InstaView</h2>
              <p className="text-sm text-ig-muted max-w-xs leading-relaxed">
                ارفع ملفات HTML المصدّرة من Instagram<br/>
                <span className="text-ig-blue">إذا كانت المحادثة مقسّمة، ارفعهم معاً — يُدمجون تلقائياً ✨</span>
              </p>
            </div>

            <button onClick={() => htmlRef.current?.click()}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-ig-grad text-white text-sm
                         font-semibold hover:opacity-90 active:scale-[.98] transition-all
                         glow-pink shadow-lg shadow-pink-500/20">
              <Upload size={15}/> رفع ملف HTML
            </button>

            <div className="flex gap-3">
              <button onClick={() => audioRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
                           bg-purple-900/30 hover:bg-purple-800/50 text-purple-300
                           border border-purple-700/40 transition-all">
                <Mic size={14}/> رفع تسجيلات صوتية
              </button>
              <button onClick={() => videoRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
                           bg-blue-900/30 hover:bg-blue-800/50 text-blue-300
                           border border-blue-700/40 transition-all">
                <Video size={14}/> رفع فيديوهات
              </button>
            </div>

            <p className="text-xs text-ig-muted opacity-40">أو اسحب الملفات هنا</p>
            {saving && (
              <div className="flex items-center gap-2 text-xs text-ig-muted">
                <Loader2 size={13} className="animate-spin"/> جاري المعالجة…
              </div>
            )}
          </div>
        )}
      </div>

      {lightbox && <Lightbox src={lightbox.src} type={lightbox.type} onClose={() => setLightbox(null)}/>}

      <input ref={htmlRef}  type="file" accept=".html,.htm" multiple className="hidden"
             onChange={e => { onHtmlFiles(e.target.files); e.target.value = '' }}/>
      <input ref={audioRef} type="file"
             accept="audio/*,.mp4,.m4a,.ogg,.opus,.mp3,.aac,.wav" multiple className="hidden"
             onChange={e => { onAudioFiles(e.target.files); e.target.value = '' }}/>
      <input ref={videoRef} type="file"
             accept="video/*,.mp4,.mov,.webm,.avi" multiple className="hidden"
             onChange={e => { onVideoFiles(e.target.files); e.target.value = '' }}/>
    </div>
  )
}

// ── Render messages with date dividers ────────────────────────────────────────
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

    // Date divider
    const ds = msg.ts
      ? new Date(msg.ts).toLocaleDateString('ar-SA', { weekday:'long', year:'numeric', month:'long', day:'numeric' })
      : (msg.time?.match(/(\w+ \d+, \d{4})/)||[])[1] || ''

    if (ds && ds !== lastDate) {
      lastDate = ds
      els.push(
        <div key={`d_${i}`} className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-white/[.05]"/>
          <span className="text-[10px] text-gray-600 px-2.5 py-1 rounded-full bg-white/[.03] border border-white/[.05] flex-shrink-0">
            {ds}
          </span>
          <div className="flex-1 h-px bg-white/[.05]"/>
        </div>
      )
    }

    const isOut   = outName ? msg.sender === outName : msg.isOut
    const showAv  = !isOut && msg.sender !== lastSender
    const blobUrl = msg.media?.ref ? resolveBlob(blobs, {}, msg.media.ref) : ''

    els.push(
      <div key={msg.id} style={{ animationDelay: `${Math.min(i * 0.005, 0.15)}s` }}>
        <Bubble
          msg={{ ...msg, isOut }}
          showAvatar={showAv}
          blobUrl={blobUrl}
          onImageClick={src => setLightbox({ src, type: 'image' })}
          onVideoClick={src => setLightbox({ src, type: 'video' })}
        />
      </div>
    )
    lastSender = msg.sender
  })
  return els
}
