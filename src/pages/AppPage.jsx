import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { parseIG, normTitle, resolveBlob } from '../utils/parser'
import Bubble from '../components/Bubble'
import Lightbox from '../components/Lightbox'
import {
  LogOut, Plus, Trash2, Upload, Image as ImageIcon,
  MessageCircle, ChevronLeft, X
} from 'lucide-react'

// ── Conversation store (in-memory for now, Supabase in Phase 2) ───────────────
let _convs   = {}
let _nextId  = 1

export default function AppPage() {
  const { user, signOut }    = useAuth()
  const navigate             = useNavigate()
  const [convs, setConvs]    = useState({})
  const [activeId, setActiveId] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const htmlInputRef  = useRef()
  const mediaInputRef = useRef()
  const chatBodyRef   = useRef()

  // ── Sync local state ────────────────────────────────────────────────────────
  const refreshConvs = () => setConvs({ ..._convs })

  // ── Handle HTML files ───────────────────────────────────────────────────────
  const onHtmlFiles = useCallback((files) => {
    const arr = Array.from(files).filter(f => /\.html?$/i.test(f.name))
    if (!arr.length) return
    let pending = arr.length
    const batch = []

    arr.forEach((file, i) => {
      const reader = new FileReader()
      reader.onload = ev => {
        const pfx = `f${Date.now()}_${i}`
        batch.push(parseIG(ev.target.result, pfx))
        if (--pending === 0) {
          let lastId = null
          batch.forEach(({ convName, outName, msgs }) => {
            const tk = normTitle(convName)
            let matchId = Object.keys(_convs).find(id => _convs[id].titleKey === tk) || null

            if (matchId) {
              const c = _convs[matchId]
              c.msgs.push(...msgs)
              if (!c.outName && outName) c.outName = outName
              c.msgs.sort((a, b) => (a.ts && b.ts) ? a.ts - b.ts : 0)
              lastId = matchId
            } else {
              const id = String(_nextId++)
              _convs[id] = { name: convName, titleKey: tk, msgs, blobs: {}, blobsBase: {}, outName }
              _convs[id].msgs.sort((a, b) => (a.ts && b.ts) ? a.ts - b.ts : 0)
              lastId = id
            }
          })
          refreshConvs()
          if (lastId) setActiveId(lastId)
        }
      }
      reader.readAsText(file, 'UTF-8')
    })
  }, [])

  // ── Handle media files ──────────────────────────────────────────────────────
  const onMediaFiles = useCallback((files) => {
    if (!activeId || !_convs[activeId]) return
    const conv = _convs[activeId]
    Array.from(files).forEach(f => {
      const url = URL.createObjectURL(f)
      conv.blobs[f.name] = url
      conv.blobsBase[f.name.replace(/\.[^.]+$/, '')] = url
    })
    refreshConvs()
  }, [activeId])

  // ── Delete conversation ─────────────────────────────────────────────────────
  const deleteConv = (id) => {
    delete _convs[id]
    refreshConvs()
    if (activeId === id) {
      const rem = Object.keys(_convs)
      setActiveId(rem.length ? rem[0] : null)
    }
  }

  // ── Sign out ────────────────────────────────────────────────────────────────
  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  // ── Auto-scroll to bottom ───────────────────────────────────────────────────
  useEffect(() => {
    if (chatBodyRef.current)
      setTimeout(() => { chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight }, 60)
  }, [activeId])

  // ── Drag & drop ─────────────────────────────────────────────────────────────
  const onDrop = useCallback(e => {
    e.preventDefault()
    const htmlFiles  = Array.from(e.dataTransfer.files).filter(f => /\.html?$/i.test(f.name))
    const mediaFiles = Array.from(e.dataTransfer.files).filter(f =>
      /\.(jpg|jpeg|png|gif|webp|mp4|webm|mov|mp3|ogg|opus|m4a|aac)$/i.test(f.name))
    if (htmlFiles.length)  onHtmlFiles(htmlFiles)
    if (mediaFiles.length) onMediaFiles(mediaFiles)
  }, [onHtmlFiles, onMediaFiles])

  const activeConv   = activeId ? convs[activeId] : null
  const convList     = Object.entries(convs)
  const mediaRefs    = activeConv
    ? [...new Set(activeConv.msgs.filter(m => m.media).map(m => m.media.ref).filter(Boolean))]
    : []
  const linkedCount  = activeConv
    ? mediaRefs.filter(r => resolveBlob(activeConv.blobs, activeConv.blobsBase, r)).length
    : 0

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0a]"
         onDragOver={e => e.preventDefault()} onDrop={onDrop}>

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <div className={`flex flex-col flex-shrink-0 border-r border-ig-border transition-all duration-300
                       ${sidebarOpen ? 'w-[240px]' : 'w-0 overflow-hidden'}`}
           style={{ background: '#0d0d0d' }}>

        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-3 border-b border-ig-border flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-ig-grad flex items-center justify-center text-sm flex-shrink-0">📷</div>
          <span className="text-sm font-bold flex-1 text-ig-grad">InstaView</span>
          <button onClick={() => htmlInputRef.current?.click()}
            className="w-6 h-6 rounded-full flex items-center justify-center text-ig-muted hover:text-ig-text hover:bg-white/5 transition-colors"
            title="إضافة محادثة">
            <Plus size={14}/>
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto py-1 scrollbar-none">
          {convList.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-ig-muted leading-relaxed">
              لا توجد محادثات<br/>
              <span className="opacity-60">اضغط + لرفع ملف HTML</span>
            </div>
          ) : (
            convList.map(([id, conv]) => (
              <div key={id}
                   className={`group flex items-center gap-2 px-3 py-2 mx-1 rounded-lg cursor-pointer
                               transition-all duration-150 relative
                               ${activeId === id ? 'bg-[#0c1c2e]' : 'hover:bg-white/[.04]'}`}
                   onClick={() => setActiveId(id)}>
                <div className="avatar-ring w-8 h-8 flex-shrink-0">
                  <div className="avatar-ring-inner text-xs font-bold">
                    {(conv.name||'?')[0].toUpperCase()}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate">{conv.name}</div>
                  <div className="text-[10px] text-ig-muted">{conv.msgs.length} رسالة</div>
                </div>
                <button onClick={e => { e.stopPropagation(); deleteConv(id) }}
                  className="opacity-0 group-hover:opacity-100 text-red-500/60 hover:text-red-400 transition-all p-1 rounded">
                  <Trash2 size={11}/>
                </button>
              </div>
            ))
          )}
        </div>

        {/* User footer */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-t border-ig-border flex-shrink-0">
          <div className="w-7 h-7 rounded-full bg-ig-blue/20 flex items-center justify-center text-xs text-ig-blue font-semibold flex-shrink-0">
            {user?.email?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium truncate">{user?.email || 'مستخدم'}</div>
          </div>
          <button onClick={handleSignOut} title="تسجيل الخروج"
            className="text-ig-muted hover:text-red-400 transition-colors p-1">
            <LogOut size={13}/>
          </button>
        </div>
      </div>

      {/* ── Main area ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {activeConv ? (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 py-2.5 glass border-b border-ig-border flex-shrink-0">
              <button onClick={() => setSidebarOpen(v => !v)}
                className="text-ig-muted hover:text-ig-text p-1 rounded transition-colors lg:hidden">
                <ChevronLeft size={16} className={sidebarOpen ? '' : 'rotate-180'}/>
              </button>

              <div className="avatar-ring w-9 h-9 flex-shrink-0">
                <div className="avatar-ring-inner text-sm font-bold">
                  {(activeConv.name||'?')[0].toUpperCase()}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{activeConv.name}</div>
                <div className="text-[10.5px] text-ig-muted">{activeConv.msgs.length} رسالة</div>
              </div>

              {/* Media badge */}
              {mediaRefs.length > 0 && (
                <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white
                                 ${linkedCount === mediaRefs.length ? 'bg-green-700' : 'bg-ig-blue'}`}>
                  {linkedCount}/{mediaRefs.length} وسائط
                </div>
              )}

              <button onClick={() => mediaInputRef.current?.click()}
                className="text-ig-muted hover:text-ig-text p-1.5 rounded-lg hover:bg-white/5 transition-all"
                title="إضافة وسائط">
                <ImageIcon size={16}/>
              </button>
              <button onClick={() => htmlInputRef.current?.click()}
                className="text-ig-muted hover:text-ig-text p-1.5 rounded-lg hover:bg-white/5 transition-all"
                title="إضافة ملف HTML">
                <Plus size={16}/>
              </button>
            </div>

            {/* Messages */}
            <div ref={chatBodyRef}
                 className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-1 scrollbar-none">
              {renderMessages(activeConv, setLightbox)}
            </div>

            {/* Fake input bar */}
            <div className="flex items-center gap-3 px-4 py-2.5 glass border-t border-ig-border flex-shrink-0">
              <div className="flex-1 bg-[#1a1a1a] border border-ig-border rounded-full px-4 py-2 text-xs text-ig-muted">
                أكتب رسالة…
              </div>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8"
               onDragOver={e => e.preventDefault()} onDrop={onDrop}>
            <div className="w-16 h-16 rounded-2xl bg-ig-grad flex items-center justify-center text-3xl glow-pink">📷</div>
            <div className="text-center">
              <h2 className="text-lg font-bold mb-2">مرحباً بك في InstaView</h2>
              <p className="text-sm text-ig-muted max-w-xs leading-relaxed">
                ارفع ملفات HTML المصدّرة من Instagram لعرضها بتصميم أنيق
              </p>
            </div>
            <div className="flex flex-col gap-3 w-full max-w-xs">
              <button onClick={() => htmlInputRef.current?.click()}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-ig-grad text-white text-sm font-semibold
                           hover:opacity-90 transition-all glow-pink">
                <Upload size={16}/> رفع ملف HTML
              </button>
              <div className="border-2 border-dashed border-white/10 rounded-xl py-5 text-center
                              text-xs text-ig-muted hover:border-white/20 transition-colors cursor-pointer"
                   onClick={() => htmlInputRef.current?.click()}>
                أو اسحب الملفات هنا
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <Lightbox src={lightbox.src} type={lightbox.type} onClose={() => setLightbox(null)}/>
      )}

      {/* Hidden inputs */}
      <input ref={htmlInputRef}  type="file" accept=".html,.htm" multiple
             className="hidden" onChange={e => { onHtmlFiles(e.target.files); e.target.value='' }}/>
      <input ref={mediaInputRef} type="file" accept="image/*,video/*,audio/*" multiple
             className="hidden" onChange={e => { onMediaFiles(e.target.files); e.target.value='' }}/>
    </div>
  )
}

// ── Render messages with date dividers ────────────────────────────────────────
function renderMessages(conv, setLightbox) {
  const elements = []
  let lastDate   = ''
  let lastSender = ''

  conv.msgs.forEach((msg, i) => {
    if (msg.isSystem) {
      elements.push(
        <div key={msg.id} className="flex justify-center my-1">
          <span className="text-[11px] text-gray-600 italic px-3 py-1 rounded-full bg-white/[.03]">
            {msg.text}
          </span>
        </div>
      )
      lastSender = ''
      return
    }

    // Date divider
    const ds = msg.ts
      ? new Date(msg.ts).toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : (msg.time.match(/(\w+ \d+, \d{4})/)||[])[1] || ''
    if (ds && ds !== lastDate) {
      lastDate = ds
      elements.push(
        <div key={`date_${i}`} className="flex items-center gap-3 my-3">
          <div className="flex-1 h-px bg-white/[.06]"/>
          <span className="text-[10.5px] text-gray-600 px-2 py-1 rounded-full bg-white/[.04] border border-white/[.06] flex-shrink-0">
            {ds}
          </span>
          <div className="flex-1 h-px bg-white/[.06]"/>
        </div>
      )
    }

    const isOut      = conv.outName ? msg.sender === conv.outName : msg.isOut
    const showAvatar = !isOut && msg.sender !== lastSender
    const blobUrl    = msg.media ? resolveBlob(conv.blobs, conv.blobsBase, msg.media.ref) : ''

    elements.push(
      <div key={msg.id} style={{ animationDelay: `${Math.min(i * 0.006, 0.2)}s` }}>
        <Bubble
          msg={{ ...msg, isOut }}
          showAvatar={showAvatar}
          blobUrl={blobUrl}
          onImageClick={src => setLightbox({ src, type: 'image' })}
          onVideoClick={src => setLightbox({ src, type: 'video' })}
        />
      </div>
    )
    lastSender = msg.sender
  })

  return elements
}
