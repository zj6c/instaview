import { useEffect } from 'react'
import { X } from 'lucide-react'

export default function Lightbox({ src, type, onClose }) {
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!src) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/96 flex items-center justify-center"
         onClick={onClose}>
      <button onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20
                   flex items-center justify-center text-white transition-colors">
        <X size={18}/>
      </button>
      {type === 'video'
        ? <video src={src} controls autoPlay className="max-w-[92vw] max-h-[92vh] rounded-xl"
                 onClick={e => e.stopPropagation()}/>
        : <img src={src} alt="" className="max-w-[92vw] max-h-[92vh] rounded-xl object-contain"
               onClick={e => e.stopPropagation()}/>
      }
    </div>
  )
}
