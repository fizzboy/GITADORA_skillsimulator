import { supabase } from './supabase.js';

export async function getGameVersions() {
  const { data, error } = await supabase
    .from('game_versions')
    .select('id,code,name,eamusement_slug,sort_order,is_current')
    .order('sort_order', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}
