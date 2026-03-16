import { useRef, useState } from 'react'
import { Play, Pause, ExternalLink } from 'lucide-react'

// ── URL icon map ──────────────────────────────────────────────────────────────
const URL_ICONS = {
  'youtube.com': '▶️', 'youtu.be': '▶️', 'twitter.com': '🐦', 'x.com': '🐦',
  'tiktok.com': '🎵', 'github.com': '🐙', 'spotify.com': '🎵',
  'linkedin.com': '💼', 'facebook.com': '📘', 'wikipedia.org': '📖', 'reddit.com': '🔴'
}
function urlIcon(url) {
  try {
    const d = new URL(url).hostname.replace('www.','')
    return Object.entries(URL_ICONS).find(([k]) => d.includes(k))?.[1] || '🔗'
  } catch { return '🔗' }
}
function urlDomain(url) {
  try { return new URL(url).hostname.replace('www.','') } catch { return url }
}

// ── Audio player ──────────────────────────────────────────────────────────────
function AudioBubble({ src, isOut }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)

  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    if (a.paused) { a.play(); setPlaying(true) }
    else          { a.pause(); setPlaying(false) }
  }

  const onTime = () => {
    const a = audioRef.current
    if (a && a.duration) setProgress(a.currentTime / a.duration)
  }

  const bars = Array.from({ length: 28 }, (_, i) =>
    4 + Math.abs(Math.sin(i * .65 + .8)) * 12 | 0
  )

  return (
    <div className="flex items-center gap-2 py-1 min-w-[160px]">
      <button onClick={toggle}
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all
                    ${playing ? 'bg-red-500 hover:bg-red-600' : 'bg-ig-blue hover:bg-blue-500'}`}>
        {playing ? <Pause size={12} fill="white" color="white"/> : <Play size={12} fill="white" color="white"/>}
      </button>
      <div className="flex items-center gap-[2px] flex-1 h-6">
        {bars.map((h, i) => (
          <div key={i} style={{ height: `${h}px`, flex: 1, minWidth: 2, borderRadius: 1 }}
            className={`transition-colors duration-75 ${
              i / bars.length <= progress
                ? isOut ? 'bg-white' : 'bg-ig-blue'
                : isOut ? 'bg-white/25' : 'bg-white/15'
            }`}/>
        ))}
      </div>
      <audio ref={audioRef} src={src}
        onTimeUpdate={onTime}
        onEnded={() => { setPlaying(false); setProgress(0) }}
      />
    </div>
  )
}

// ── Reel card ─────────────────────────────────────────────────────────────────
function ReelCard({ reel }) {
  const isReel = reel.url.includes('/reel/')
  return (
    <a href={reel.url} target="_blank" rel="noopener noreferrer"
       className="block mt-2 rounded-xl overflow-hidden border border-white/10 hover:border-white/20 transition-colors max-w-[220px]"
       onClick={e => e.stopPropagation()}>
      <div className="px-3 py-2 flex items-center gap-2"
           style={{ background: 'linear-gradient(135deg, #130825, #200840)' }}>
        <span className="text-base">{isReel ? '▶️' : '📸'}</span>
        <span className="text-xs font-semibold text-purple-300 truncate">{reel.username || 'instagram'}</span>
      </div>
      {reel.caption && (
        <div className="px-3 pt-2 text-[11px] text-gray-400 leading-snug line-clamp-2"
             style={{ background: '#111' }}>
          {reel.caption}
        </div>
      )}
      <div className="px-3 py-2 flex items-center gap-1 text-[11px] text-ig-blue"
           style={{ background: '#111' }}>
        <ExternalLink size={10}/> {isReel ? 'Instagram Reel' : 'Instagram Post'}
      </div>
    </a>
  )
}

// ── URL card ──────────────────────────────────────────────────────────────────
function UrlCard({ url }) {
  const icon   = urlIcon(url)
  const domain = urlDomain(url)
  const title  = url.replace(/^https?:\/\//,'').substring(0, 55)
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
       className="block mt-2 rounded-xl overflow-hidden border border-white/10 hover:border-ig-blue/40 transition-colors max-w-[230px]"
       onClick={e => e.stopPropagation()}>
      <div className="h-[80px] flex items-center justify-center text-3xl"
           style={{ background: 'linear-gradient(135deg, #0f1228, #131e34, #0b2040)' }}>
        {icon}
      </div>
      <div className="px-3 py-2 bg-[#111]">
        <div className="text-[10px] text-gray-500 mb-0.5">{domain}</div>
        <div className="text-[11.5px] font-semibold text-gray-200 leading-snug line-clamp-2">{title}</div>
      </div>
    </a>
  )
}

// ── Render text with link highlighting ────────────────────────────────────────
function MessageText({ text, isOut }) {
  const parts = text.split(/(https?:\/\/[^\s<>"']+)/g)
  return (
    <div className="text-[13.5px] leading-relaxed">
      {parts.map((p, i) =>
        /^https?:\/\//.test(p)
          ? <a key={i} href={p} target="_blank" rel="noopener noreferrer"
               className={`underline underline-offset-2 break-all ${isOut ? 'text-blue-200' : 'text-ig-blue'}`}
               onClick={e => e.stopPropagation()}>
              {p.replace(/^https?:\/\//,'').substring(0, 45)}
            </a>
          : <span key={i}>{p}</span>
      )}
    </div>
  )
}

// ── Main Bubble component ─────────────────────────────────────────────────────
export default function Bubble({ msg, showAvatar, onImageClick, onVideoClick, blobUrl }) {
  const isOut  = msg.isOut
  const isNaked = msg.media && !msg.text && !msg.reels?.length && !msg.urls?.length

  if (msg.isSystem) {
    return (
      <div className="flex justify-center my-1">
        <span className="text-[11px] text-gray-600 italic px-3 py-1 rounded-full bg-white/[.04]">
          {msg.text}
        </span>
      </div>
    )
  }

  return (
    <div className={`flex items-end gap-1.5 bubble-anim ${isOut ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className={`w-5 h-5 flex-shrink-0 ${showAvatar && !isOut ? 'visible' : 'invisible'}`}>
        <div className="avatar-ring w-5 h-5">
          <div className="avatar-ring-inner text-[8px] font-bold">
            {(msg.sender||'?')[0].toUpperCase()}
          </div>
        </div>
      </div>

      {/* Bubble */}
      <div className={`max-w-[68%] ${isNaked ? '' : `px-3 py-2 rounded-[18px] ${
        isOut
          ? 'bg-ig-blue text-white rounded-br-[4px]'
          : 'bg-[#1a1a1a] text-ig-text rounded-bl-[4px]'
      }`}`}>

        {/* Sender name for group */}
        {!isOut && showAvatar && (
          <div className="text-[10.5px] font-semibold text-ig-blue mb-1">{msg.sender}</div>
        )}

        {/* Media */}
        {msg.media && (
          <>
            {msg.media.type === 'audio' && blobUrl && (
              <AudioBubble src={blobUrl} isOut={isOut}/>
            )}
            {msg.media.type === 'video' && blobUrl && (
              <div className="relative max-w-[200px] rounded-[14px] overflow-hidden cursor-pointer mt-0.5"
                   onClick={() => onVideoClick?.(blobUrl)}>
                <video src={blobUrl} muted playsInline preload="metadata" className="w-full block"/>
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <svg width="38" height="38" fill="none" viewBox="0 0 48 48">
                    <circle cx="24" cy="24" r="21" fill="rgba(0,0,0,.5)" stroke="white" strokeWidth="1.5"/>
                    <path d="M20 17l12 7-12 7V17z" fill="white"/>
                  </svg>
                </div>
              </div>
            )}
            {msg.media.type === 'image' && blobUrl && (
              <img src={blobUrl} alt="" loading="lazy"
                   className="max-w-[200px] rounded-[14px] block cursor-zoom-in mt-0.5"
                   onClick={() => onImageClick?.(blobUrl)}/>
            )}
            {!blobUrl && (
              <div className="text-[11.5px] text-gray-500 italic py-1">
                {msg.media.type === 'audio' ? '🎵' : msg.media.type === 'video' ? '🎬' : '🖼️'} {msg.media.ref}
              </div>
            )}
          </>
        )}

        {/* Text */}
        {msg.text && <MessageText text={msg.text} isOut={isOut}/>}

        {/* Reels */}
        {msg.reels?.map((r, i) => <ReelCard key={i} reel={r}/>)}

        {/* URLs */}
        {msg.urls?.filter(u => !msg.reels?.some(r => r.url === u)).map((u, i) => <UrlCard key={i} url={u}/>)}

        {/* Reactions */}
        {msg.reactions?.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {msg.reactions.map((r, i) => (
              <span key={i} className="text-[11px] px-1.5 py-0.5 rounded-full bg-white/[.07] border border-white/10">
                {r}
              </span>
            ))}
          </div>
        )}

        {/* Time + ticks */}
        <div className={`flex items-center gap-1 mt-1 ${isOut ? 'justify-end' : 'justify-end'}`}>
          <span className={`text-[9.5px] ${isOut ? 'text-white/40' : 'text-gray-600'}`}>
            {msg.ts
              ? new Date(msg.ts).toLocaleTimeString('ar-SA', { hour: 'numeric', minute: '2-digit', hour12: true })
              : msg.time.replace(/\w+ \d+, \d{4},?\s*/,'').trim() || msg.time
            }
          </span>
          {isOut && <span className="text-[10px] text-blue-200/70">✓✓</span>}
        </div>
      </div>
    </div>
  )
}
