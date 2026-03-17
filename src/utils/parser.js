const MONS = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11}

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

// Get just the filename from any path
function basename(src) {
  if (!src) return ''
  return src.split(/[/\\]/).pop().split('?')[0]
}

function ct(t) { return (t||'').replace(/\s+/g,' ').trim() }

// Normalize title: remove diacritics, emoji, spaces for matching
export function normTitle(s) {
  if (!s) return ''
  let out = ''
  for (const ch of s.normalize('NFD')) {
    const cp = ch.codePointAt(0)
    if (cp >= 0x0300 && cp <= 0x036F) continue  // diacritics
    if (cp >= 0x1F000) continue                   // emoji
    if (cp >= 0x2600 && cp <= 0x27BF) continue   // misc symbols
    if (/\s/.test(ch)) continue
    out += ch
  }
  return out.toLowerCase()
}

export function parseIG(html, pfx) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const blocks = doc.querySelectorAll('.pam')

  // ── Conversation name ─────────────────────────────────────────────────────
  let convName = ''
  const h1 = doc.querySelector('h1')
  if (h1) convName = ct(h1.textContent)
  if (!convName) {
    const t = doc.querySelector('title')
    if (t) convName = ct(t.textContent)
  }
  if (!convName) convName = 'محادثة'

  // ── Detect outgoing sender ────────────────────────────────────────────────
  // Instagram exports: "You sent an attachment." or "You sent" appears in
  // the body of blocks where the h2 is THE OUTGOING USER
  let outName = null
  blocks.forEach(b => {
    if (outName) return
    const h2   = b.querySelector('h2')
    const body = b.querySelector('[class*="a6-p"]')
    if (!h2 || !body) return
    if (/You sent/i.test(body.textContent))
      outName = ct(h2.textContent)
  })
  // Fallback: second unique sender in file
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

  // ── Parse messages ────────────────────────────────────────────────────────
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
      id: `${pfx}_${idx}`,
      sender, time: timeStr, ts, isOut,
      text: '', media: null, urls: [], reactions: [], reels: [], isSystem: false
    }

    const bText = ct(bodyEl.textContent)

    // System messages
    if (/^(Liked a message|Reacted .* to your message|You missed a video chat|.*started a video chat)$/i.test(bText)) {
      msg.isSystem = true; msg.text = bText; msgs.push(msg); return
    }

    // Reactions
    bodyEl.querySelectorAll('[class*="a6-q"] li span').forEach(r =>
      msg.reactions.push(ct(r.textContent))
    )

    // ── Audio ──
    const aud = bodyEl.querySelector('audio')
    if (aud) {
      const src = aud.getAttribute('src') || ''
      msg.media = { type: 'audio', ref: basename(src) }
      msgs.push(msg); return
    }

    // ── Video ──
    const vid = bodyEl.querySelector('video')
    if (vid) {
      const src = vid.getAttribute('src') || ''
      msg.media = { type: 'video', ref: basename(src) }
      msgs.push(msg); return
    }

    // ── Local images (relative path = not http) ──
    for (const im of bodyEl.querySelectorAll('img')) {
      const src = im.getAttribute('src') || ''
      if (src && !src.startsWith('http')) {
        msg.media = { type: 'image', ref: basename(src) }
        msgs.push(msg); return
      }
    }

    // ── Instagram reels / posts ──
    bodyEl.querySelectorAll('a[href*="instagram.com"]').forEach(a => {
      const url = a.getAttribute('href') || ''
      const par = a.parentElement; if (!par) return
      let caption = '', username = ''
      Array.from(par.children).forEach(c => {
        if (c === a) return
        const t = ct(c.textContent)
        if (!caption && t.length > 1) caption = t
        else if (!username && t.length < 60 && !t.includes('http')) username = t
      })
      if (!caption && par.parentElement) {
        Array.from(par.parentElement.children).forEach((c, i) => {
          const t = ct(c.textContent)
          if (!c.querySelector('a') && t.length > 1 && i === 0) caption = t
          else if (!c.querySelector('a') && t.length < 60 && i === 1) username = t
        })
      }
      msg.reels.push({
        url,
        caption: caption.replace(/sent an attachment\.?/i, '').trim(),
        username
      })
    })

    // ── External URLs ──
    bodyEl.querySelectorAll('a[href]').forEach(a => {
      const url = a.getAttribute('href') || ''
      if (url.startsWith('http') && !url.includes('instagram.com'))
        msg.urls.push(url)
    })

    // ── Text content ──
    let txt = ''
    bodyEl.querySelectorAll('span[dir="rtl"],span[dir="ltr"]').forEach(s => {
      txt += s.textContent + ' '
    })
    if (!txt.trim()) {
      const w = document.createTreeWalker(bodyEl, NodeFilter.SHOW_TEXT)
      while (w.nextNode()) {
        const t = w.currentNode.textContent.trim()
        if (t && !/sent an attachment/i.test(t) && !/You sent/i.test(t))
          txt += t + ' '
      }
    }
    msg.text = txt
      .replace(/sent an attachment\.?/gi, '')
      .replace(/You sent an attachment\.?/gi, '')
      .trim()

    if (msg.text || msg.media || msg.reels.length || msg.urls.length)
      msgs.push(msg)
  })

  return { convName, outName, msgs }
}

// ── Smart blob resolver ───────────────────────────────────────────────────────
// Instagram media filenames are pure numbers: 2946744288849542.mp4
// We try: exact → no-ext → numeric ID prefix
export function resolveBlob(blobs, _unused, ref) {
  if (!ref || !blobs) return ''

  // 1. Exact match
  if (blobs[ref]) return blobs[ref]

  // 2. Without extension
  const base = ref.replace(/\.[^.]+$/, '')
  if (blobs[base]) return blobs[base]

  // 3. Numeric ID: Instagram names are like "2946744288849542.mp4"
  //    User may upload file with same number but different extension
  const numMatch = ref.match(/^(\d{8,})/)
  if (numMatch) {
    const num = numMatch[1]
    // Direct numeric key stored when file was loaded
    if (blobs[num]) return blobs[num]
    // Scan all keys for one that contains this number
    for (const [k, v] of Object.entries(blobs)) {
      if (k.includes(num)) return v
    }
  }

  return ''
}
