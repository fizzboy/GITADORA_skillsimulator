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
    level: Math.round(numericLevel * 100) / 100
  };

  if (id) {
    const { error } = await supabase.from('songs').update(payload).eq('id', id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('songs').insert(payload);
  if (error) throw error;
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

export async function accountAdmin(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke('account-admin', {
    body: { action, ...payload }
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}
