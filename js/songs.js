import { supabase } from './supabase.js';

// 上から選びやすい順
export const GF_PARTS = ['MAS-G','MAS-B','EXT-G','EXT-B','ADV-G','ADV-B','BSC-G','BSC-B'];
export const DM_PARTS = ['MAS-D','EXT-D','ADV-D','BSC-D'];
export const PARTS = [...GF_PARTS, ...DM_PARTS];
export const partsForInstrument = instrument => instrument === 'DM' ? DM_PARTS : GF_PARTS;

export async function searchSongTitles(keyword = '', instrument = 'GF') {
  const clean = String(keyword || '').trim();
  if (!clean) return [];

  let query = supabase
    .from('songs')
    .select('title,is_hot,part')
    .ilike('title', `%${clean}%`)
    .in('part', partsForInstrument(instrument))
    .order('title', { ascending: true })
    .limit(200);

  const { data, error } = await query;
  if (error) throw error;

  // 譜面ごとではなく曲名ごとに1件だけ返す
  const map = new Map();
  for (const row of data ?? []) {
    if (!map.has(row.title)) {
      map.set(row.title, {
        title: row.title,
        is_hot: Boolean(row.is_hot)
      });
    } else if (row.is_hot) {
      map.get(row.title).is_hot = true;
    }
  }

  return Array.from(map.values()).slice(0, 30);
}

export async function getSongByTitleAndPart(title, part) {
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle || !part) return null;

  const { data, error } = await supabase
    .from('songs')
    .select('id,is_hot,title,part,level')
    .eq('title', cleanTitle)
    .eq('part', part)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function requestSongMaster({ title, part, proposedLevel }) {
  const cleanTitle = String(title || '').trim();
  const numericLevel = Number(proposedLevel);

  if (!cleanTitle) throw new Error('曲名を入力してください。');
  if (!PARTS.includes(part)) throw new Error('Partを選択してください。');
  if (!Number.isFinite(numericLevel) || numericLevel <= 0 || numericLevel > 99.99) {
    throw new Error('登録依頼する難易度を入力してください。');
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('ログイン情報を取得できません。');

  const payload = {
    requester_id: userData.user.id,
    title: cleanTitle,
    part,
    proposed_level: Math.floor((numericLevel + Number.EPSILON) * 100) / 100
  };

  const { data, error } = await supabase
    .from('song_requests')
    .insert(payload)
    .select('id,title,part,proposed_level,status')
    .single();

  if (!error) return data;

  if (error.code === '23505') {
    const { data: existing, error: findError } = await supabase
      .from('song_requests')
      .select('id,title,part,proposed_level,status')
      .eq('requester_id', userData.user.id)
      .eq('title', cleanTitle)
      .eq('part', part)
      .eq('status', 'pending')
      .maybeSingle();

    if (findError) throw findError;
    if (existing) return existing;
  }

  throw error;
}


export async function requestSongLevelCorrection({ songId, proposedLevel }) {
  const numericLevel = Number(proposedLevel);
  if (!songId) throw new Error('対象譜面を取得できません。');
  if (!Number.isFinite(numericLevel) || numericLevel <= 0 || numericLevel > 99.99) {
    throw new Error('正しい難易度を入力してください。');
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('ログイン情報を取得できません。');

  const { data: song, error: songError } = await supabase
    .from('songs')
    .select('id,title,part,level')
    .eq('id', songId)
    .single();
  if (songError) throw songError;

  const payload = {
    requester_id: userData.user.id,
    title: song.title,
    part: song.part,
    proposed_level: Math.floor((numericLevel + Number.EPSILON) * 100) / 100,
    request_type: 'level_correction',
    current_song_id: song.id
  };

  const { data, error } = await supabase
    .from('song_requests')
    .insert(payload)
    .select('id,title,part,proposed_level,status,request_type,current_song_id')
    .single();

  if (!error) return data;

  if (error.code === '23505') {
    throw new Error('この譜面の難易度修正依頼は既に送信されています。');
  }
  throw error;
}
