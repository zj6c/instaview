import { supabase } from './supabase'

// ── Conversations ─────────────────────────────────────────────────────────────

export async function getConversations() {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data
}

export async function upsertConversation({ id, name, titleKey, outName }) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('conversations')
    .upsert({
      id,
      user_id: user.id,
      name,
      title_key: titleKey,
      out_name: outName,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteConversation(id) {
  const { error } = await supabase.from('conversations').delete().eq('id', id)
  if (error) throw error
}

// ── Messages ──────────────────────────────────────────────────────────────────

export async function getMessages(conversationId) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('ts', { ascending: true })
  if (error) throw error
  return data.map(dbToMsg)
}

export async function insertMessages(conversationId, msgs) {
  const { data: { user } } = await supabase.auth.getUser()
  // Batch insert in chunks of 500
  const chunks = []
  for (let i = 0; i < msgs.length; i += 500)
    chunks.push(msgs.slice(i, i + 500))

  for (const chunk of chunks) {
    const rows = chunk.map(m => msgToDb(m, conversationId, user.id))
    const { error } = await supabase
      .from('messages')
      .upsert(rows, { onConflict: 'id' })
    if (error) throw error
  }
}

export async function deleteMessages(conversationId) {
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('conversation_id', conversationId)
  if (error) throw error
}

// ── Storage ───────────────────────────────────────────────────────────────────

export async function uploadMedia(file, conversationId) {
  const { data: { user } } = await supabase.auth.getUser()
  const path = `${user.id}/${conversationId}/${file.name}`
  const { error } = await supabase.storage.from('media').upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('media').getPublicUrl(path)
  return data.publicUrl
}

export async function getMediaUrl(conversationId, filename) {
  const { data: { user } } = await supabase.auth.getUser()
  const path = `${user.id}/${conversationId}/${filename}`
  const { data, error } = await supabase.storage.from('media').createSignedUrl(path, 3600)
  if (error) return null
  return data.signedUrl
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function msgToDb(m, conversationId, userId) {
  return {
    id: m.id,
    conversation_id: conversationId,
    user_id: userId,
    sender: m.sender || '',
    time_str: m.time || '',
    ts: m.ts || 0,
    is_out: m.isOut || false,
    is_system: m.isSystem || false,
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
