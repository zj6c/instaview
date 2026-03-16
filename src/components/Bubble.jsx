import { useRef, useState } from 'react'
import { Play, Pause, ExternalLink } from 'lucide-react'

const URL_ICONS = {
  'youtube.com':'▶️','youtu.be':'▶️','twitter.com':'🐦','x.com':'🐦',
  'tiktok.com':'🎵','github.com':'🐙','spotify.com':'🎵',
  'linkedin.com':'💼','facebook.com':'📘','wikipedia.org':'📖','reddit.com':'🔴'
}
function urlIcon(url) {
  try { const d=new URL(url).hostname.replace('www.',''); return Object.entries(URL_ICONS).find(([k])=>d.includes(k))?.[1]||'🔗' } catch { return '🔗' }
}
function urlDomain(url) { try { return new URL(url).hostname.replace('www.','') } catch { return url } }

// ── Audio ─────────────────────────────────────────────────────────────────────
function AudioBubble({ src, isOut }) {
  const ref = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [prog, setProg] = useState(0)
  const bars = Array.from({length:28},(_,i)=>4+Math.abs(Math.sin(i*.65+.8))*12|0)

  const toggle = () => {
    const a = ref.current; if (!a) return
    if (a.paused) { a.play(); setPlaying(true) }
    else { a.pause(); setPlaying(false) }
  }

  return (
    <div className="flex items-center gap-2.5 py-1 min-w-[170px]">
      <button onClick={toggle}
        className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0
                    shadow-lg transition-all duration-200 active:scale-95
                    ${playing
                      ? 'bg-red-500 shadow-red-500/30'
                      : isOut ? 'bg-white/20 hover:bg-white/30' : 'bg-ig-blue shadow-ig-blue/30 hover:bg-blue-500'
                    }`}>
        {playing
          ? <Pause size={13} fill="white" color="white"/>
          : <Play  size={13} fill="white" color="white" style={{marginLeft:1}}/>
        }
      </button>
      <div className="flex items-end gap-[2px] flex-1 h-7">
        {bars.map((h,i)=>(
          <div key={i} style={{height:`${h}px`,flex:1,minWidth:2,borderRadius:2}}
            className={`transition-all duration-100 ${
              i/bars.length<=prog
                ? isOut ? 'bg-white' : 'bg-ig-blue'
                : isOut ? 'bg-white/30' : 'bg-white/10'
            }`}/>
        ))}
      </div>
      <audio ref={ref} src={src}
        onTimeUpdate={()=>{ const a=ref.current; if(a?.duration) setProg(a.currentTime/a.duration) }}
        onEnded={()=>{ setPlaying(false); setProg(0) }}/>
    </div>
  )
}

// ── Reel card ─────────────────────────────────────────────────────────────────
function ReelCard({ reel }) {
  const isReel = reel.url.includes('/reel/')
  return (
    <a href={reel.url} target="_blank" rel="noopener noreferrer"
       className="block mt-2 rounded-2xl overflow-hidden border border-white/10
                  hover:border-white/25 transition-all duration-200 max-w-[220px]
                  hover:shadow-lg hover:shadow-black/40 hover:-translate-y-0.5"
       onClick={e=>e.stopPropagation()}>
      <div className="px-3 py-2.5 flex items-center gap-2"
           style={{background:'linear-gradient(135deg,#130825,#1e0a38,#200840)'}}>
        <span className="text-base">{isReel?'▶️':'📸'}</span>
        <span className="text-xs font-semibold text-purple-300 truncate">{reel.username||'instagram'}</span>
        <ExternalLink size={10} className="text-purple-400 mr-auto flex-shrink-0"/>
      </div>
      {reel.caption&&(
        <div className="px-3 py-2 text-[11px] text-gray-400 leading-snug line-clamp-2"
             style={{background:'rgba(17,17,17,0.95)'}}>
          {reel.caption}
        </div>
      )}
      <div className="px-3 py-1.5 flex items-center gap-1 text-[10.5px] text-purple-400/80"
           style={{background:'rgba(17,17,17,0.95)'}}>
        {isReel?'Instagram Reel':'Instagram Post'}
      </div>
    </a>
  )
}

// ── URL card ──────────────────────────────────────────────────────────────────
function UrlCard({ url }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
       className="block mt-2 rounded-2xl overflow-hidden border border-white/10
                  hover:border-ig-blue/50 transition-all duration-200 max-w-[230px]
                  hover:shadow-lg hover:shadow-ig-blue/10 hover:-translate-y-0.5"
       onClick={e=>e.stopPropagation()}>
      <div className="h-[75px] flex items-center justify-center text-3xl relative overflow-hidden"
           style={{background:'linear-gradient(135deg,#0f1228,#131e34,#0b2040)'}}>
        <div className="absolute inset-0 opacity-30"
             style={{backgroundImage:'radial-gradient(circle at 50% 50%, #3797f020, transparent 70%)'}}/>
        {urlIcon(url)}
      </div>
      <div className="px-3 py-2" style={{background:'rgba(15,15,15,0.97)'}}>
        <div className="text-[10px] text-gray-600 mb-0.5">{urlDomain(url)}</div>
        <div className="text-[11.5px] font-medium text-gray-300 leading-snug line-clamp-1">
          {url.replace(/^https?:\/\//,'').substring(0,50)}
        </div>
      </div>
    </a>
  )
}

// ── Text with links ───────────────────────────────────────────────────────────
function MsgText({ text, isOut }) {
  const parts = text.split(/(https?:\/\/[^\s<>"']+)/g)
  return (
    <div className="text-[13.5px] leading-[1.55] whitespace-pre-wrap">
      {parts.map((p,i)=>
        /^https?:\/\//.test(p)
          ? <a key={i} href={p} target="_blank" rel="noopener noreferrer"
               className={`underline underline-offset-2 break-all transition-opacity hover:opacity-80
                           ${isOut?'text-blue-100':'text-ig-blue'}`}
               onClick={e=>e.stopPropagation()}>
              {p.replace(/^https?:\/\//,'').substring(0,45)}
            </a>
          : <span key={i}>{p}</span>
      )}
    </div>
  )
}

// ── Main Bubble ───────────────────────────────────────────────────────────────
export default function Bubble({ msg, showAvatar, blobUrl, onImageClick, onVideoClick }) {
  const isOut  = msg.isOut
  const naked  = msg.media && !msg.text && !msg.reels?.length && !msg.urls?.length

  if (msg.isSystem) return (
    <div className="flex justify-center my-1.5">
      <span className="text-[10.5px] text-gray-600 italic px-3 py-1 rounded-full
                       bg-white/[.03] border border-white/[.05]">
        {msg.text}
      </span>
    </div>
  )

  const timeStr = msg.ts
    ? new Date(msg.ts).toLocaleTimeString('ar-SA',{hour:'numeric',minute:'2-digit',hour12:true})
    : msg.time?.replace(/\w+ \d+, \d{4},?\s*/,'').trim()||msg.time||''

  return (
    <div className={`flex items-end gap-1.5 group
                     ${isOut?'flex-row-reverse':'flex-row'}`}
         style={{animation:'bubbleIn .15s ease both'}}>

      {/* Avatar */}
      <div className={`w-6 h-6 flex-shrink-0 transition-opacity ${showAvatar&&!isOut?'opacity-100':'opacity-0'}`}>
        <div className="avatar-ring w-6 h-6">
          <div className="avatar-ring-inner text-[9px] font-bold">
            {(msg.sender||'?')[0].toUpperCase()}
          </div>
        </div>
      </div>

      {/* Bubble content */}
      <div className={`max-w-[68%] ${naked?'':
        isOut
          ? 'bg-ig-blue text-white rounded-[20px] rounded-br-[5px] px-3.5 py-2.5 shadow-lg shadow-ig-blue/20'
          : 'bg-[#1c1c1c] text-ig-text rounded-[20px] rounded-bl-[5px] px-3.5 py-2.5 shadow-md shadow-black/30'
      } transition-all duration-150`}>

        {/* Sender name */}
        {!isOut&&showAvatar&&(
          <div className="text-[10.5px] font-semibold text-ig-blue mb-1.5 tracking-wide">
            {msg.sender}
          </div>
        )}

        {/* Media */}
        {msg.media&&(
          <>
            {msg.media.type==='audio'&&blobUrl&&<AudioBubble src={blobUrl} isOut={isOut}/>}
            {msg.media.type==='audio'&&!blobUrl&&(
              <div className="flex items-center gap-2 py-1 text-[11.5px] opacity-50">
                <span>🎵</span><span className="truncate max-w-[150px]">{msg.media.ref}</span>
              </div>
            )}
            {msg.media.type==='video'&&blobUrl&&(
              <div className="relative max-w-[200px] rounded-[16px] overflow-hidden cursor-pointer
                              shadow-xl hover:shadow-2xl transition-shadow duration-200"
                   onClick={()=>onVideoClick?.(blobUrl)}>
                <video src={blobUrl} muted playsInline preload="metadata" className="w-full block"/>
                <div className="absolute inset-0 flex items-center justify-center bg-black/25
                                hover:bg-black/15 transition-colors duration-200">
                  <div className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm
                                  flex items-center justify-center shadow-xl">
                    <Play size={18} fill="white" color="white" style={{marginLeft:2}}/>
                  </div>
                </div>
              </div>
            )}
            {msg.media.type==='video'&&!blobUrl&&(
              <div className="text-[11.5px] opacity-50 flex items-center gap-2 py-1">
                <span>🎬</span><span className="truncate max-w-[150px]">{msg.media.ref}</span>
              </div>
            )}
            {msg.media.type==='image'&&blobUrl&&(
              <img src={blobUrl} alt="" loading="lazy"
                   className="max-w-[200px] rounded-[16px] block cursor-zoom-in shadow-xl
                              hover:scale-[1.02] transition-transform duration-200"
                   onClick={()=>onImageClick?.(blobUrl)}/>
            )}
            {msg.media.type==='image'&&!blobUrl&&(
              <div className="text-[11.5px] opacity-50 flex items-center gap-2 py-1">
                <span>🖼️</span><span className="truncate max-w-[150px]">{msg.media.ref}</span>
              </div>
            )}
          </>
        )}

        {/* Text */}
        {msg.text&&<MsgText text={msg.text} isOut={isOut}/>}

        {/* Reels */}
        {msg.reels?.map((r,i)=><ReelCard key={i} reel={r}/>)}

        {/* URLs */}
        {msg.urls?.filter(u=>!msg.reels?.some(r=>r.url===u)).map((u,i)=><UrlCard key={i} url={u}/>)}

        {/* Reactions */}
        {msg.reactions?.length>0&&(
          <div className="mt-1.5 flex flex-wrap gap-1">
            {msg.reactions.map((r,i)=>(
              <span key={i} className="text-[11px] px-2 py-0.5 rounded-full
                                       bg-black/20 border border-white/10 backdrop-blur-sm">
                {r}
              </span>
            ))}
          </div>
        )}

        {/* Time */}
        <div className={`flex items-center gap-1 mt-1.5 ${isOut?'justify-end':'justify-end'}`}>
          <span className={`text-[9.5px] ${isOut?'text-white/45':'text-gray-600'}`}>{timeStr}</span>
          {isOut&&<span className="text-[10px] text-blue-200/60">✓✓</span>}
        </div>
      </div>
    </div>
  )
}
