import { supabase } from './supabase.js';

export const PARTS = ['BSC-G','BSC-B','ADV-G','ADV-B','EXT-G','EXT-B','MAS-G','MAS-B'];

export async function searchSongs(keyword = '', part = '') {
  let query = supabase
    .from('songs')
    .select('id,is_hot,title,part,level')
    .order('title', { ascending: true })
    .limit(30);

  if (keyword.trim()) query = query.ilike('title', `%${keyword.trim()}%`);
  if (part) query = query.eq('part', part);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getSongByTitleAndPart(title, part) {
  const { data, error } = await supabase
    .from('songs')
    .select('id,is_hot,title,part,level')
    .eq('title', title)
    .eq('part', part)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getAllSongs() {
  const { data, error } = await supabase
    .from('songs')
    .select('id,is_hot,title,part,level')
    .order('title', { ascending: true });

  if (error) throw error;
  return data ?? [];
}
