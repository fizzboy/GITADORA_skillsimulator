import { supabase } from './supabase.js';

export async function listUserSummaries(keyword = '', instrument = 'GF') {
  const { data, error } = await supabase.rpc('list_user_summaries', {
    p_search: String(keyword || '').trim(),
    p_instrument: instrument
  });
  if (error) throw error;
  return data ?? [];
}

export async function getUserSkillTargets(userId, instrument = 'GF') {
  const { data, error } = await supabase.rpc('get_user_skill_targets', {
    p_user_id: userId,
    p_instrument: instrument
  });
  if (error) throw error;
  return data ?? [];
}

export async function getSongRateComparison(songId) {
  const { data, error } = await supabase.rpc('get_song_rate_comparison', {
    p_song_id: songId
  });
  if (error) throw error;
  return data ?? [];
}

export async function getMyFavorites(instrument = 'GF') {
  const { data, error } = await supabase.rpc('get_my_favorites', {
    p_instrument: instrument
  });
  if (error) throw error;
  return data ?? [];
}

export async function addFavorite(favoriteUserId, instrument = 'GF') {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('ログイン情報を取得できません。');

  const { data: rows, error: listError } = await supabase
    .from('user_favorites')
    .select('sort_order')
    .eq('user_id', userData.user.id)
    .eq('instrument', instrument)
    .order('sort_order', { ascending: false })
    .limit(1);

  if (listError) throw listError;

  const nextOrder = (rows?.[0]?.sort_order ?? 0) + 1;

  const { error } = await supabase
    .from('user_favorites')
    .insert({
      user_id: userData.user.id,
      favorite_user_id: favoriteUserId,
      instrument,
      sort_order: nextOrder
    });

  if (error) throw error;
}

export async function removeFavorite(favoriteUserId, instrument = 'GF') {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('ログイン情報を取得できません。');

  const { error } = await supabase
    .from('user_favorites')
    .delete()
    .eq('user_id', userData.user.id)
    .eq('favorite_user_id', favoriteUserId)
    .eq('instrument', instrument);

  if (error) throw error;
}

export async function reorderFavorites(orderedUserIds, instrument = 'GF') {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('ログイン情報を取得できません。');

  for (let i = 0; i < orderedUserIds.length; i++) {
    const { error } = await supabase
      .from('user_favorites')
      .update({ sort_order: i + 1 })
      .eq('user_id', userData.user.id)
      .eq('favorite_user_id', orderedUserIds[i])
      .eq('instrument', instrument);

    if (error) throw error;
  }
}


export async function getSongOptionDistribution(songId) {
  const { data, error } = await supabase.rpc('get_song_option_distribution', {
    p_song_id: songId
  });
  if (error) throw error;
  return data ?? [];
}
