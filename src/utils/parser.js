const MONS = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 }

export function parseTS(s) {
  if (!s) return 0
  const m = s.match(/(\w+)\s+(\d+),?\s+(\d{4})\s+(\d+):(\d+)(?::(\d+))?\s*(am|pm)?/i)
  if (!m) return 0
  const mon = MONS[(m[1]||'').toLowerCase().slice(0,3)]
  if (mon === undefined) return 0
  let h = +m[4]
  const ap = (m[7]||'').toLowerCase()
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  return new Date(+m[3], mon, +m[2], h, +m[5], +(m[6]||0)).getTime()
}

function fn(src) { return src ? src.split(/[/\\]/).pop().split('?')[0] : '' }
function ct(t)   { return (t||'').replace(/\s+/g,' ').trim() }

export function normTitle(s) {
  return s.replace(/[\u0300-\u036f]/g,'')
          .replace(/\p{Emoji}/gu,'')
          .replace(/\s+/g,'')
          .toLowerCase()
}

export function parseIG(html, pfx) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const blocks = doc.querySelectorAll('.pam')

  // Conv name
  let convName = ''
  const h1 = doc.querySelector('h1')
  if (h1) convName = ct(h1.textContent)
  if (!convName) { const t = doc.querySelector('title'); if (t) convName = ct(t.textContent) }
  if (!convName) convName = 'محادثة'

  // Detect outgoing sender
  let outName = null
  blocks.forEach(b => {
    const h2   = b.querySelector('h2')
    const body = b.querySelector('[class*="a6-p"]')
    if (!h2 || !body || outName) return
    if (/You sent|You missed/i.test(body.textContent)) outName = ct(h2.textContent)
  })
  if (!outName) {
    const seen = []
    blocks.forEach(b => {
      const h2 = b.querySelector('h2')
      if (!h2) return
      const s = ct(h2.textContent)
      if (s && !seen.includes(s)) seen.push(s)
    })
    if (seen.length >= 2) outName = seen[1]
  }

  const msgs = []
  blocks.forEach((b, idx) => {
    const h2     = b.querySelector('h2')
    const timeEl = b.querySelector('[class*="a6-o"]')
    const bodyEl = b.querySelector('[class*="a6-p"]')
    if (!h2 || !bodyEl) return

    const sender  = ct(h2.textContent)
    const timeStr = timeEl ? ct(timeEl.textContent) : ''
    const ts      = parseTS(timeStr)
    const isOut   = outName ? sender === outName : false
    const msg = {
      id: `${pfx}_${idx}`, sender, time: timeStr, ts, isOut,
      text: '', media: null, urls: [], reactions: [], reels: [], isSystem: false
    }

    const bText = ct(bodyEl.textContent)
    if (/^(Liked a message|Reacted .* to your message|You missed a video chat|.*started a video chat)$/i.test(bText)) {
      msg.isSystem = true; msg.text = bText; msgs.push(msg); return
    }

    bodyEl.querySelectorAll('[class*="a6-q"] li span').forEach(r => msg.reactions.push(ct(r.textContent)))

    const aud = bodyEl.querySelector('audio')
    if (aud) { msg.media = { type: 'audio', ref: fn(aud.getAttribute('src')||'') }; msgs.push(msg); return }
    const vid = bodyEl.querySelector('video')
    if (vid) { msg.media = { type: 'video', ref: fn(vid.getAttribute('src')||'') }; msgs.push(msg); return }
    for (const im of bodyEl.querySelectorAll('img')) {
      const src = im.getAttribute('src')||''
      if (src && !src.startsWith('http')) { msg.media = { type: 'image', ref: fn(src) }; msgs.push(msg); return }
    }

    bodyEl.querySelectorAll('a[href*="instagram.com"]').forEach(a => {
      const url = a.getAttribute('href')||''
      const par = a.parentElement; if (!par) return
      let caption = '', username = ''
      Array.from(par.children).forEach(c => {
        if (c === a) return
        const t = ct(c.textContent)
        if (!caption && t && t.length > 1) caption = t
        else if (!username && t && t.length < 60 && !t.includes('http')) username = t
      })
      if (!caption && par.parentElement) {
        Array.from(par.parentElement.children).forEach((c, i) => {
          const t = ct(c.textContent)
          if (!c.querySelector('a') && t && t.length > 1 && i === 0) caption = t
          else if (!c.querySelector('a') && t && t.length < 60 && i === 1) username = t
        })
      }
      msg.reels.push({ url, caption: caption.replace(/sent an attachment\.?/i,'').trim(), username })
    })

    bodyEl.querySelectorAll('a[href]').forEach(a => {
      const url = a.getAttribute('href')||''
      if (url.startsWith('http') && !url.includes('instagram.com')) msg.urls.push(url)
    })

    let txt = ''
    bodyEl.querySelectorAll('span[dir="rtl"],span[dir="ltr"]').forEach(s => { txt += s.textContent + ' ' })
    if (!txt.trim()) {
      const w = document.createTreeWalker(bodyEl, NodeFilter.SHOW_TEXT)
      while (w.nextNode()) {
        const t = w.currentNode.textContent.trim()
        if (t && !/sent an attachment/i.test(t) && !/You sent/i.test(t)) txt += t + ' '
      }
    }
    msg.text = txt.replace(/sent an attachment\.?/gi,'').replace(/You sent an attachment\.?/gi,'').trim()
    if (msg.text || msg.media || msg.reels.length || msg.urls.length) msgs.push(msg)
  })

  return { convName, outName, msgs }
}

export function resolveBlob(blobs, blobsBase, ref) {
  if (!ref) return ''
  if (blobs[ref]) return blobs[ref]
  const base = ref.replace(/\.[^.]+$/,'')
  if (blobsBase[base]) return blobsBase[base]
  const nm = ref.match(/\d{8,}/)
  if (nm) for (const [k,v] of Object.entries(blobs)) if (k.includes(nm[0])) return v
  return ''
}

export function gti(f) {
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(f) ? 'image'
       : /\.(mp4|webm|mov)$/i.test(f)           ? 'video'
       : /\.(mp3|ogg|opus|m4a|aac)$/i.test(f)   ? 'audio' : 'file'
}
