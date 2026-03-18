import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { parseIG, normTitle, resolveBlob } from '../utils/parser'
import { hasSupabase } from '../lib/supabase'
import {
  getConversations, saveConversation, removeConversation,
  getMessages, saveMessages, removeMessages,
  uploadFile, getSignedUrl
} from '../lib/db'
import Bubble from '../components/Bubble'
import VirtualMessages from '../components/VirtualMessages'
import Lightbox from '../components/Lightbox'
import {
  LogOut, Plus, Trash2, Upload,
  Mic, Video, Image as ImageIcon,
  Search, X, Loader2, CloudOff
} from 'lucide-react'

// In-memory store — always works, Supabase adds persistence on top
const MEM = {}
let memId = 1

// Save messages in background without blocking UI
async function saveMessagesBackground(convId, msgs, showToast) {
  try {
    const total = msgs.length
    showToast(`☁️ جاري الحفظ… (${total} رسالة)`, 'info')
    await saveMessages(convId, msgs)
    showToast(`✅ تم حفظ ${total} رسالة في Supabase`, 'ok')
  } catch(e) {
    console.error('Background save error:', e)
    showToast(`⚠️ حُفظ جزئياً — ${e.message}`, 'warn')
  }
}

export default function AppPage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const [convList,  setConvList]  = useState([])
  const [msgsMap,   setMsgsMap]   = useState({})
  const [blobsMap,  setBlobsMap]  = useState({})
  const [activeId,  setActiveId]  = useState(null)
  const [lightbox,  setLightbox]  = useState(null)
  const [loadingDB, setLoadingDB] = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [toast,     setToast]     = useState({ msg: '', type: 'ok' })
  const [query,     setQuery]     = useState('')
  const [searching, setSearching] = useState(false)

  const htmlRef  = useRef()
  const audioRef = useRef()
  const videoRef = useRef()
  const imageRef = useRef()
  const bodyRef  = useRef()

  // ── Toast ──────────────────────────────────────────────────────────────────
  const showToast = useCallback((msg, type = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast({ msg: '', type: 'ok' }), 3500)
  }, [])

  // ── Load from Supabase on mount ────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      if (!hasSupabase) { setLoadingDB(false); return }
      try {
        const convs = await getConversations()
        if (convs.length) {
          const list = convs.map(c => ({
            id: c.id, name: c.name, titleKey: c.title_key, outName: c.out_name
          }))
          setConvList(list)
          // Load messages for first conv
          if (list.length) {
            const msgs = await getMessages(list[0].id)
            setMsgsMap({ [list[0].id]: msgs })
            setActiveId(list[0].id)
            // Resolve media URLs from storage
            resolveStorageUrls(list[0].id, msgs)
          }
        }
      } catch(e) {
        console.error('DB load error:', e)
      } finally {
        setLoadingDB(false)
      }
    }
    init()
  }, [])

  // ── Resolve media from Supabase Storage ────────────────────────────────────
  const resolveStorageUrls = useCallback(async (convId, msgs) => {
    if (!hasSupabase) return
    const refs = [...new Set(msgs.filter(m => m.media?.ref).map(m => m.media.ref))]
    if (!refs.length) return
    const entries = {}
    await Promise.all(refs.map(async ref => {
      const url = await getSignedUrl(convId, ref)
      if (url) {
        entries[ref] = url
        entries[ref.replace(/\.[^.]+$/, '')] = url
        const num = ref.match(/^(\d{8,})/)
        if (num) entries[num[1]] = url
      }
    }))
    if (Object.keys(entries).length)
      setBlobsMap(p => ({ ...p, [convId]: { ...(p[convId] || {}), ...entries } }))
  }, [])

  // ── Load messages for a conversation ──────────────────────────────────────
  const loadMsgs = useCallback(async (convId) => {
    // Already in memory
    if (msgsMap[convId]?.length) return
    if (!hasSupabase) return
    try {
      const msgs = await getMessages(convId)
      setMsgsMap(p => ({ ...p, [convId]: msgs }))
      resolveStorageUrls(convId, msgs)
    } catch(e) { console.error(e) }
  }, [msgsMap, resolveStorageUrls])

  // ── HTML files ─────────────────────────────────────────────────────────────
  const onHtmlFiles = useCallback(async (files) => {
    const arr = Array.from(files).filter(f => /\.html?$/i.test(f.name))
    if (!arr.length) return
    setSaving(true)
    try {
      // 1. Parse all in parallel
      const parsed = await Promise.all(arr.map((f, i) => new Promise(res => {
        const r = new FileReader()
        r.onload = ev => res(parseIG(ev.target.result, `f${Date.now()}_${i}`))
        r.readAsText(f, 'UTF-8')
      })))

      // 2. Group by normalized title
      const groups = {}
      for (const p of parsed) {
        const tk = normTitle(p.convName)
        if (!groups[tk]) groups[tk] = { convName: p.convName, outName: p.outName, msgs: [] }
        else if (!groups[tk].outName && p.outName) groups[tk].outName = p.outName
        groups[tk].msgs.push(...p.msgs)
      }

      let lastId = null
      for (const [tk, g] of Object.entries(groups)) {
        // Deduplicate + sort
        const allMsgs = Array.from(new Map(g.msgs.map(m => [m.id, m])).values())
          .sort((a, b) => (a.ts && b.ts) ? a.ts - b.ts : 0)

        const existing = convList.find(c => c.titleKey === tk)
        let convId

        if (existing) {
          convId = existing.id
          const prev = msgsMap[convId] || MEM[convId]?.msgs || []
          const merged = Array.from(
            new Map([...prev, ...allMsgs].map(m => [m.id, m])).values()
          ).sort((a, b) => (a.ts && b.ts) ? a.ts - b.ts : 0)

          MEM[convId] = { ...MEM[convId], msgs: merged }
          setMsgsMap(p => ({ ...p, [convId]: merged }))
          setConvList(p => p.map(c => c.id === convId
            ? { ...c, outName: g.outName || c.outName } : c))

          // Save to Supabase
          if (hasSupabase) {
            await saveConversation({ id: convId, name: existing.name, titleKey: tk, outName: g.outName || existing.outName })
            // Save in background — don't block UI
            saveMessagesBackground(convId, merged, showToast)
          }
        } else {
          let convId2
          if (hasSupabase) {
            const saved = await saveConversation({ name: g.convName, titleKey: tk, outName: g.outName })
            convId2 = saved.id
          } else {
            convId2 = 'c' + (memId++)
          }
          convId = convId2
          MEM[convId] = { name: g.convName, titleKey: tk, outName: g.outName, msgs: allMsgs, blobs: {} }
          setConvList(p => [...p, { id: convId, name: g.convName, titleKey: tk, outName: g.outName }])
          setMsgsMap(p => ({ ...p, [convId]: allMsgs }))
          setBlobsMap(p => ({ ...p, [convId]: {} }))

          if (hasSupabase) saveMessagesBackground(convId, allMsgs, showToast)
        }
        lastId = convId
      }

      if (lastId) {
        setActiveId(lastId)
        showToast('✅ تم تحميل المحادثة بنجاح')
      }
    } catch(e) {
      console.error(e)
      showToast('❌ خطأ: ' + e.message, 'err')
    } finally { setSaving(false) }
  }, [convList, msgsMap, showToast])

  // ── Media processor (audio / video / image) ────────────────────────────────
  const processMedia = useCallback(async (files, type, label) => {
    if (!activeId) { showToast('⚠️ اختر محادثة أولاً', 'warn'); return }
    const arr = Array.from(files)
    if (!arr.length) return
    setSaving(true)
    try {
      const entries = {}
      await Promise.all(arr.map(async f => {
        // Local blob URL — instant playback
        const localUrl = URL.createObjectURL(f)
        const name     = f.name
        const noExt    = name.replace(/\.[^.]+$/, '')
        
        // Store by all possible key formats Instagram might use
        entries[name]  = localUrl   // exact: "2946744288849542.mp4"
        entries[noExt] = localUrl   // no ext: "2946744288849542"
        
        // If purely numeric (Instagram IDs), store with all common extensions
        // because Instagram photos sometimes have no extension in HTML
        if (/^\d{8,}$/.test(noExt)) {
          ;['.mp4','.mp3','.m4a','.ogg','.opus','.jpg','.jpeg','.png','.gif','.webp','.mov','.webm'].forEach(ext => {
            entries[noExt + ext] = localUrl
          })
        }
        
        // Upload to Supabase in background (non-blocking)
        if (hasSupabase) {
          uploadFile(f, activeId).then(url => {
            if (url) setBlobsMap(p => ({
              ...p,
              [activeId]: { ...(p[activeId]||{}), [name]: url, [noExt]: url }
            }))
          }).catch(() => {})
        }
      }))

      setBlobsMap(p => ({ ...p, [activeId]: { ...(p[activeId] || {}), ...entries } }))

      // Count linked media
      const msgs = msgsMap[activeId] || []
      const mediaMsgs = msgs.filter(m => m.media?.ref)
      const allBlobs = { ...(blobsMap[activeId] || {}), ...entries }
      const linked = mediaMsgs.filter(m => resolveBlob(allBlobs, {}, m.media.ref)).length
      showToast(`✅ ${arr.length} ${label} — ${linked}/${mediaMsgs.length} وسائط مرتبطة`)
    } catch(e) {
      console.error(e)
      showToast('❌ خطأ في رفع الوسائط', 'err')
    } finally { setSaving(false) }
  }, [activeId, msgsMap, blobsMap, showToast])

  const onAudioFiles = useCallback(f => processMedia(f, 'audio', 'تسجيل صوتي'), [processMedia])
  const onVideoFiles = useCallback(f => processMedia(f, 'video', 'فيديو'), [processMedia])
  const onImageFiles = useCallback(f => processMedia(f, 'image', 'صورة'), [processMedia])

  // ── Delete conversation ────────────────────────────────────────────────────
  const delConv = useCallback(async (id) => {
    try {
      if (hasSupabase) {
        await removeMessages(id)
        await removeConversation(id)
      }
      delete MEM[id]
      setConvList(p => p.filter(c => c.id !== id))
      setMsgsMap(p => { const n = {...p}; delete n[id]; return n })
      setBlobsMap(p => { const n = {...p}; delete n[id]; return n })
      if (activeId === id)
        setActiveId(convList.filter(c => c.id !== id)[0]?.id || null)
    } catch(e) { console.error(e) }
  }, [activeId, convList])

  // ── Select conversation ────────────────────────────────────────────────────
  const selectConv = useCallback(async (id) => {
    setActiveId(id)
    setQuery('')
    setSearching(false)
    await loadMsgs(id)
  }, [loadMsgs])

  // ── Auto scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (bodyRef.current && !searching)
      setTimeout(() => { bodyRef.current.scrollTop = bodyRef.current.scrollHeight }, 80)
  }, [activeId, msgsMap, searching])

  // ── Drag & drop ────────────────────────────────────────────────────────────
  const onDrop = useCallback(e => {
    e.preventDefault()
    const all = Array.from(e.dataTransfer.files)
    const html  = all.filter(f => /\.html?$/i.test(f.name))
    const audio = all.filter(f => /\.(mp3|m4a|ogg|opus|aac|wav)$/i.test(f.name))
    const video = all.filter(f => /\.(mp4|mov|webm|avi)$/i.test(f.name))
    const image = all.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name))
    if (html.length)  onHtmlFiles(html)
    if (audio.length) onAudioFiles(audio)
    if (video.length) onVideoFiles(video)
    if (image.length) onImageFiles(image)
  }, [onHtmlFiles, onAudioFiles, onVideoFiles, onImageFiles])

  // ── Derived ────────────────────────────────────────────────────────────────
  const activeConv   = convList.find(c => c.id === activeId)
  const activeMsgs   = msgsMap[activeId] || []
  const activeBlobs  = blobsMap[activeId] || {}
  const filteredMsgs = query.trim()
    ? activeMsgs.filter(m => m.text?.toLowerCase().includes(query.toLowerCase()))
    : activeMsgs
  const mediaRefs   = [...new Set(activeMsgs.filter(m => m.media?.ref).map(m => m.media.ref))]
  const linkedCount = mediaRefs.filter(r => resolveBlob(activeBlobs, {}, r)).length

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden bg-[#090909]"
         onDragOver={e => e.preventDefault()} onDrop={onDrop}>

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <div className="w-[235px] flex-shrink-0 flex flex-col border-l border-ig-border" style={{ background: '#0c0c0c' }}>

        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-3 border-b border-ig-border flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-ig-grad flex items-center justify-center text-sm flex-shrink-0 shadow-lg shadow-pink-500/20">📷</div>
          <span className="text-sm font-bold flex-1"
            style={{ background:'linear-gradient(90deg,#f09433,#dc2743,#bc1888)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
            InstaView
          </span>
          {!hasSupabase && <CloudOff size={12} className="text-yellow-500/60" title="يعمل بدون Supabase"/>}
          <button onClick={() => htmlRef.current?.click()}
            className="w-6 h-6 rounded-full flex items-center justify-center text-ig-muted hover:text-ig-text hover:bg-white/5 transition-all">
            <Plus size={13}/>
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto py-1 scrollbar-none">
          {loadingDB ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Loader2 size={18} className="animate-spin text-ig-muted"/>
              <span className="text-[10px] text-ig-muted">جاري التحميل…</span>
            </div>
          ) : convList.length === 0 ? (
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
                <div className="avatar-ring-inner text-xs font-bold">{(conv.name||'?')[0].toUpperCase()}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold truncate">{conv.name}</div>
                <div className="text-[10px] text-ig-muted">{msgsMap[conv.id]?.length ?? '...'} رسالة</div>
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

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {activeConv ? (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-1.5 px-3 py-2 glass border-b border-ig-border flex-shrink-0 flex-wrap">

              {/* Avatar + name */}
              <div className="avatar-ring w-8 h-8 flex-shrink-0">
                <div className="avatar-ring-inner text-xs font-bold">{(activeConv.name||'?')[0].toUpperCase()}</div>
              </div>
              <div className="flex-1 min-w-0 mr-1">
                <div className="text-sm font-semibold truncate">{activeConv.name}</div>
                <div className="text-[10px] text-ig-muted flex items-center gap-1.5">
                  <span>{activeMsgs.length} رسالة</span>
                  {mediaRefs.length > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold
                      ${linkedCount === mediaRefs.length ? 'bg-green-800/50 text-green-400' : 'bg-orange-900/50 text-orange-400'}`}>
                      {linkedCount}/{mediaRefs.length} وسائط
                    </span>
                  )}
                </div>
              </div>

              {/* Search */}
              {searching ? (
                <div className="flex items-center gap-1 bg-white/[.06] rounded-xl px-2.5 py-1.5 border border-white/10 w-36">
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
                  className="text-ig-muted hover:text-ig-text p-1.5 rounded-lg hover:bg-white/5 transition-all" title="بحث">
                  <Search size={14}/>
                </button>
              )}

              {/* Media buttons */}
              <button onClick={() => audioRef.current?.click()}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold
                           bg-purple-900/40 hover:bg-purple-800/60 text-purple-300 border border-purple-700/40 transition-all"
                title="رفع تسجيلات صوتية">
                <Mic size={11}/> صوت
              </button>

              <button onClick={() => videoRef.current?.click()}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold
                           bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 border border-blue-700/40 transition-all"
                title="رفع فيديوهات">
                <Video size={11}/> فيديو
              </button>

              <button onClick={() => imageRef.current?.click()}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold
                           bg-pink-900/40 hover:bg-pink-800/60 text-pink-300 border border-pink-700/40 transition-all"
                title="رفع صور">
                <ImageIcon size={11}/> صور
              </button>

              {/* Add HTML */}
              <button onClick={() => htmlRef.current?.click()}
                className="text-ig-muted hover:text-ig-text p-1.5 rounded-lg hover:bg-white/5 transition-all" title="إضافة ملف HTML">
                <Plus size={14}/>
              </button>
            </div>

            {/* Messages — VirtualScroll for performance */}
            {query && filteredMsgs.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-ig-muted text-sm py-20">
                لا توجد نتائج لـ "{query}"
              </div>
            ) : (
              <VirtualMessages
                msgs={filteredMsgs}
                outName={activeConv.outName}
                blobs={activeBlobs}
                setLightbox={setLightbox}
              />
            )}

            {/* Footer */}
            <div className="relative flex items-center gap-3 px-4 py-2.5 glass border-t border-ig-border flex-shrink-0">
              {toast.msg && (
                <div className={`absolute -top-11 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl
                                text-xs font-medium text-white shadow-xl whitespace-nowrap z-50 border
                                transition-all duration-300
                                ${toast.type === 'err' ? 'bg-red-900/90 border-red-700/50' :
                                  toast.type === 'warn' ? 'bg-yellow-900/90 border-yellow-700/50' :
                                  'bg-[#1c1c1c] border-white/10'}`}>
                  {toast.msg}
                </div>
              )}
              <div className="flex-1 bg-[#1a1a1a] border border-ig-border rounded-full px-4 py-2 text-xs text-ig-muted select-none">
                أكتب رسالة…
              </div>
              {saving && <Loader2 size={14} className="animate-spin text-ig-blue flex-shrink-0"/>}
            </div>
          </>
        ) : (
          /* ── Empty / welcome state ── */
          <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 relative overflow-hidden"
               onDragOver={e => e.preventDefault()} onDrop={onDrop}>
            {/* BG glow */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full opacity-10"
                   style={{ background: 'radial-gradient(circle, #dc2743 0%, transparent 70%)' }}/>
            </div>

            <div className="w-16 h-16 rounded-2xl bg-ig-grad flex items-center justify-center text-3xl glow-pink relative shadow-xl">📷</div>

            <div className="text-center relative">
              <h2 className="text-xl font-bold mb-2">مرحباً في InstaView</h2>
              <p className="text-sm text-ig-muted max-w-sm leading-relaxed">
                ارفع ملفات HTML المصدّرة من Instagram<br/>
                <span className="text-ig-blue text-xs">إذا كانت المحادثة مقسّمة، ارفعهم معاً — يُدمجون تلقائياً ✨</span>
              </p>
            </div>

            {/* Main upload button */}
            <button onClick={() => htmlRef.current?.click()}
              className="flex items-center gap-2 px-7 py-3 rounded-xl bg-ig-grad text-white text-sm
                         font-semibold hover:opacity-90 active:scale-[.98] transition-all
                         glow-pink shadow-lg shadow-pink-500/20">
              <Upload size={15}/> رفع ملف HTML
            </button>

            {/* Media buttons row */}
            <div className="flex gap-2 flex-wrap justify-center">
              <button onClick={() => audioRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium
                           bg-purple-900/30 hover:bg-purple-800/50 text-purple-300
                           border border-purple-700/40 transition-all">
                <Mic size={13}/> تسجيلات صوتية
              </button>
              <button onClick={() => videoRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium
                           bg-blue-900/30 hover:bg-blue-800/50 text-blue-300
                           border border-blue-700/40 transition-all">
                <Video size={13}/> فيديوهات
              </button>
              <button onClick={() => imageRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium
                           bg-pink-900/30 hover:bg-pink-800/50 text-pink-300
                           border border-pink-700/40 transition-all">
                <ImageIcon size={13}/> صور
              </button>
            </div>

            <p className="text-xs text-ig-muted opacity-40">أو اسحب الملفات هنا</p>

            {toast.msg && (
              <div className="text-xs text-ig-muted bg-white/[.05] px-4 py-2 rounded-xl border border-white/10">
                {toast.msg}
              </div>
            )}

            {saving && (
              <div className="flex items-center gap-2 text-xs text-ig-muted">
                <Loader2 size={13} className="animate-spin"/> جاري الحفظ في Supabase…
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && <Lightbox src={lightbox.src} type={lightbox.type} onClose={() => setLightbox(null)}/>}

      {/* Hidden file inputs */}
      <input ref={htmlRef}  type="file" accept=".html,.htm" multiple className="hidden"
             onChange={e => { onHtmlFiles(e.target.files); e.target.value = '' }}/>
      <input ref={audioRef} type="file" accept="audio/*,.mp4,.m4a,.ogg,.opus,.mp3,.aac,.wav" multiple className="hidden"
             onChange={e => { onAudioFiles(e.target.files); e.target.value = '' }}/>
      <input ref={videoRef} type="file" accept="video/*,.mp4,.mov,.webm,.avi" multiple className="hidden"
             onChange={e => { onVideoFiles(e.target.files); e.target.value = '' }}/>
      <input ref={imageRef} type="file" accept="image/*,.jpg,.jpeg,.png,.gif,.webp" multiple className="hidden"
             onChange={e => { onImageFiles(e.target.files); e.target.value = '' }}/>
    </div>
  )
}

// ── Render messages ────────────────────────────────────────────────────────────
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

    const isOut  = outName ? msg.sender === outName : msg.isOut
    const showAv = !isOut && msg.sender !== lastSender
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
