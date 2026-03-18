import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react'
import Bubble from './Bubble'
import { resolveBlob } from '../utils/parser'

const BATCH = 60
const LOAD_THRESHOLD = 400

export default function VirtualMessages({ msgs, outName, blobs, setLightbox }) {
  const [end, setEnd]    = useState(BATCH)
  const containerRef     = useRef()
  const bottomRef        = useRef()
  const prevOutNameRef   = useRef(outName)

  // When conversation changes (outName changes) → scroll to bottom
  useEffect(() => {
    if (outName !== prevOutNameRef.current) {
      prevOutNameRef.current = outName
      setEnd(BATCH)
    }
    // Always scroll to bottom on mount/conv change
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' })
    }, 60)
  }, [outName])

  // Load more when near top
  const onScroll = useCallback(() => {
    const el = containerRef.current
    if (!el || end >= msgs.length) return
    if (el.scrollTop < LOAD_THRESHOLD) {
      const prevH = el.scrollHeight
      setEnd(prev => Math.min(prev + BATCH, msgs.length))
      requestAnimationFrame(() => {
        if (containerRef.current)
          containerRef.current.scrollTop = containerRef.current.scrollHeight - prevH
      })
    }
  }, [end, msgs.length])

  const visible = useMemo(
    () => msgs.slice(Math.max(0, msgs.length - end)),
    [msgs, end]
  )

  return (
    <div ref={containerRef} onScroll={onScroll}
         className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-0.5 scrollbar-none">

      {/* Load more button */}
      {end < msgs.length && (
        <div className="flex flex-col items-center gap-1 py-3">
          <button
            onClick={() => {
              const el = containerRef.current
              const prevH = el?.scrollHeight || 0
              setEnd(prev => Math.min(prev + BATCH, msgs.length))
              requestAnimationFrame(() => {
                if (el) el.scrollTop = el.scrollHeight - prevH
              })
            }}
            className="text-[11px] text-ig-muted hover:text-ig-text px-4 py-1.5 rounded-full
                       bg-white/[.04] border border-white/[.06] hover:bg-white/[.07] transition-all">
            ↑ تحميل المزيد ({msgs.length - end} رسالة أقدم)
          </button>
        </div>
      )}

      <RenderMessages
        msgs={visible}
        outName={outName}
        blobs={blobs}
        setLightbox={setLightbox}
        startIdx={Math.max(0, msgs.length - end)}
      />

      <div ref={bottomRef} style={{ height: 4, flexShrink: 0 }}/>
    </div>
  )
}

// ── Render loop ───────────────────────────────────────────────────────────────
function RenderMessages({ msgs, outName, blobs, setLightbox, startIdx }) {
  const els = []
  let lastDate   = ''
  let lastSender = ''

  msgs.forEach((msg, li) => {
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
        <div key={`d_${startIdx + li}`} className="flex items-center gap-3 my-4">
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
      <BubbleMemo
        key={msg.id}
        msg={{ ...msg, isOut }}
        showAvatar={showAv}
        blobUrl={blobUrl}
        onImageClick={src => setLightbox({ src, type: 'image' })}
        onVideoClick={src => setLightbox({ src, type: 'video' })}
      />
    )
    lastSender = msg.sender
  })

  return els
}

// Memoized bubble — skip re-render if nothing changed
const BubbleMemo = memo(Bubble, (p, n) =>
  p.blobUrl    === n.blobUrl &&
  p.msg.id     === n.msg.id &&
  p.showAvatar === n.showAvatar
)
