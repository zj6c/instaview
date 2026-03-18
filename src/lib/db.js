import { supabase, hasSupabase } from './supabase'

// ── Conversations ─────────────────────────────────────────────────────────────
export async function getConversations() {
  if (!hasSupabase) return []
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function saveConversation({ id, name, titleKey, outName }) {
  if (!hasSupabase) return { id: id || ('local_' + Date.now()) }
  const { data: { user } } = await supabase.auth.getUser()
  const row = { name, title_key: titleKey, out_name: outName || null, user_id: user.id, updated_at: new Date().toISOString() }
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
  await supabase.from('conversations').delete().eq('id', id)
}

// ── Messages ──────────────────────────────────────────────────────────────────
export async function getMessages(convId) {
  if (!hasSupabase) return []
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', convId)
    .order('ts', { ascending: true })
  if (error) throw error
  return (data || []).map(dbToMsg)
}

export async function saveMessages(convId, msgs) {
  if (!hasSupabase || !msgs.length) return
  const { data: { user } } = await supabase.auth.getUser()
  // Batch in chunks of 500
  for (let i = 0; i < msgs.length; i += 500) {
    const chunk = msgs.slice(i, i + 500).map(m => msgToDb(m, convId, user.id))
    const { error } = await supabase.from('messages').upsert(chunk, { onConflict: 'id' })
    if (error) throw error
  }
}

export async function removeMessages(convId) {
  if (!hasSupabase) return
  await supabase.from('messages').delete().eq('conversation_id', convId)
}

// ── Storage ───────────────────────────────────────────────────────────────────
export async function uploadFile(file, convId) {
  if (!hasSupabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  const path = `${user.id}/${convId}/${file.name}`
  const { error } = await supabase.storage.from('media').upload(path, file, { upsert: true })
  if (error) return null
  const { data } = await supabase.storage.from('media').createSignedUrl(path, 60 * 60 * 24 * 7) // 7 days
  return data?.signedUrl || null
}

export async function getSignedUrl(convId, filename) {
  if (!hasSupabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  const path = `${user.id}/${convId}/${filename}`
  const { data } = await supabase.storage.from('media').createSignedUrl(path, 60 * 60 * 24 * 7)
  return data?.signedUrl || null
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function msgToDb(m, convId, userId) {
  return {
    id: String(m.id),
    conversation_id: convId,
    user_id: userId,
    sender: m.sender || '',
    time_str: m.time || '',
    ts: m.ts || 0,
    is_out: !!m.isOut,
    is_system: !!m.isSystem,
    text: m.text || '',
    media_type: m.media?.type || null,
    media_ref: m.media?.ref || null,
    reactions: m.reactions || [],
    reels: m.reels || [],
    urls: m.urls || []
  }
}

function dbToMsg(row) {
  return {
    id: row.id,
    sender: row.sender,
    time: row.time_str,
    ts: row.ts,
    isOut: row.is_out,
    isSystem: row.is_system,
    text: row.text,
    media: row.media_type ? { type: row.media_type, ref: row.media_ref } : null,
    reactions: row.reactions || [],
    reels: row.reels || [],
    urls: row.urls || []
  }
}
