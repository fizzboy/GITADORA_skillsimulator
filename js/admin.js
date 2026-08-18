import { supabase } from './supabase.js';

export async function isAdmin() {
  const { data, error } = await supabase.rpc('is_admin');
  if (error) throw error;
  return data === true;
}

export async function getAdminSongs(keyword = '') {
  let query = supabase
    .from('songs')
    .select('id,is_hot,title,part,level')
    .order('title', { ascending: true })
    .order('part', { ascending: true })
    .limit(1000);

  if (keyword.trim()) query = query.ilike('title', `%${keyword.trim()}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function saveMasterSong({ id = null, isHot = false, title, part, level }) {
  const cleanTitle = String(title || '').trim();
  const numericLevel = Number(level);

  if (!cleanTitle) throw new Error('曲名を入力してください。');
  if (!part) throw new Error('Partを選択してください。');
  if (!Number.isFinite(numericLevel)) throw new Error('難易度を入力してください。');

  const payload = {
    is_hot: Boolean(isHot),
    title: cleanTitle,
    part,
    level: Math.floor((numericLevel + Number.EPSILON) * 100) / 100
  };

  if (id) {
    const { error } = await supabase.from('songs').update(payload).eq('id', id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('songs').insert(payload);
    if (error) throw error;
  }

  // HOTは曲単位で扱うため、同名曲の全譜面へ反映
  const { error: hotError } = await supabase
    .from('songs')
    .update({ is_hot: Boolean(isHot) })
    .eq('title', cleanTitle);

  if (hotError) throw hotError;
}

export async function deleteMasterSong(id) {
  const { error } = await supabase.from('songs').delete().eq('id', id);
  if (error) throw error;
}

export async function getAdminUsers(keyword = '') {
  let query = supabase
    .from('profiles')
    .select('id,username,created_at')
    .order('created_at', { ascending: false })
    .limit(1000);

  if (keyword.trim()) query = query.ilike('username', `%${keyword.trim()}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getPendingSongRequests(keyword = '') {
  let query = supabase
    .from('song_requests')
    .select(`
      id,
      requester_id,
      title,
      part,
      proposed_level,
      status,
      created_at,
      profiles!song_requests_requester_id_fkey(username)
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1000);

  if (keyword.trim()) query = query.ilike('title', `%${keyword.trim()}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function approveSongRequest(requestId, isHot = false) {
  const { data, error } = await supabase.rpc('approve_song_request', {
    p_request_id: requestId,
    p_is_hot: Boolean(isHot)
  });
  if (error) throw error;
  return data;
}

export async function rejectSongRequest(requestId) {
  const { data, error } = await supabase.rpc('reject_song_request', {
    p_request_id: requestId
  });
  if (error) throw error;
  return data;
}

export async function accountAdmin(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke('account-admin', {
    body: { action, ...payload }
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}
