import { supabase, hasSupabase } from './supabase'

// ── Conversations ─────────────────────────────────────────────────────────────
export async function getConversations() {
  if (!hasSupabase) return []
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) { console.error('getConversations:', error); return [] }
  return data || []
}

export async function saveConversation({ id, name, titleKey, outName }) {
  if (!hasSupabase) return { id: id || ('local_' + Date.now()) }
  const { data: { user } } = await supabase.auth.getUser()
  const row = {
    name,
    title_key: titleKey,
    out_name:  outName || null,
    user_id:   user.id,
    updated_at: new Date().toISOString()
  }
  if (id) row.id = id
  const { data, error } = await supabase
    .from('conversations')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function removeConversation(id) {
  if (!hasSupabase) return
  const { error } = await supabase.from('conversations').delete().eq('id', id)
  if (error) console.error('removeConversation:', error)
}

// ── Messages — save in small batches with delay to avoid timeout ───────────────
export async function getMessages(convId) {
  if (!hasSupabase) return []
  // Fetch all pages (Supabase default limit is 1000 rows)
  let all = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('ts', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) { console.error('getMessages page error:', error); break }
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < PAGE) break   // last page
    from += PAGE
  }
  return all.map(dbToMsg)
}

export async function saveMessages(convId, msgs) {
  if (!hasSupabase || !msgs.length) return
  const { data: { user } } = await supabase.auth.getUser()
  const CHUNK = 200   // small chunks to avoid timeout
  let saved = 0
  for (let i = 0; i < msgs.length; i += CHUNK) {
    const chunk = msgs.slice(i, i + CHUNK).map(m => msgToDb(m, convId, user.id))
    const { error } = await supabase
      .from('messages')
      .upsert(chunk, { onConflict: 'id' })
    if (error) {
      console.error(`saveMessages chunk ${i}-${i+CHUNK} error:`, error)
      throw error
    }
    saved += chunk.length
    // Small delay between chunks to avoid rate limits
    if (i + CHUNK < msgs.length) await sleep(50)
  }
  console.log(`Saved ${saved}/${msgs.length} messages`)
}

export async function removeMessages(convId) {
  if (!hasSupabase) return
  const { error } = await supabase.from('messages').delete().eq('conversation_id', convId)
  if (error) console.error('removeMessages:', error)
}

// ── Storage ───────────────────────────────────────────────────────────────────
export async function uploadFile(file, convId) {
  if (!hasSupabase) return null
  try {
    const { data: { user } } = await supabase.auth.getUser()
    const path = `${user.id}/${convId}/${file.name}`
    const { error } = await supabase.storage
      .from('media')
      .upload(path, file, { upsert: true })
    if (error) return null
    const { data } = await supabase.storage
      .from('media')
      .createSignedUrl(path, 60 * 60 * 24 * 30) // 30 days
    return data?.signedUrl || null
  } catch(e) {
    console.error('uploadFile:', e)
    return null
  }
}

export async function getSignedUrl(convId, filename) {
  if (!hasSupabase) return null
  try {
    const { data: { user } } = await supabase.auth.getUser()
    const path = `${user.id}/${convId}/${filename}`
    const { data } = await supabase.storage
      .from('media')
      .createSignedUrl(path, 60 * 60 * 24 * 30)
    return data?.signedUrl || null
  } catch(e) { return null }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms))

function msgToDb(m, convId, userId) {
  return {
    id:              String(m.id),
    conversation_id: convId,
    user_id:         userId,
    sender:          m.sender || '',
    time_str:        m.time   || '',
    ts:              m.ts     || 0,
    is_out:          !!m.isOut,
    is_system:       !!m.isSystem,
    text:            m.text   || '',
    media_type:      m.media?.type || null,
    media_ref:       m.media?.ref  || null,
    reactions:       m.reactions   || [],
    reels:           m.reels       || [],
    urls:            m.urls        || []
  }
}

function dbToMsg(row) {
  return {
    id:       row.id,
    sender:   row.sender,
    time:     row.time_str,
    ts:       row.ts,
    isOut:    row.is_out,
    isSystem: row.is_system,
    text:     row.text,
    media:    row.media_type ? { type: row.media_type, ref: row.media_ref } : null,
    reactions: row.reactions || [],
    reels:     row.reels     || [],
    urls:      row.urls      || []
  }
}
