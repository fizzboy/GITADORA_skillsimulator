import { supabase } from './supabase.js';

// 上から選びやすい順
export const GF_PARTS = ['MAS-G','MAS-B','EXT-G','EXT-B','ADV-G','ADV-B','BSC-G','BSC-B'];
export const DM_PARTS = ['MAS-D','EXT-D','ADV-D','BSC-D'];
export const PARTS = [...GF_PARTS, ...DM_PARTS];
export const partsForInstrument = instrument => instrument === 'DM' ? DM_PARTS : GF_PARTS;

// 曲マスター照合専用。
// 保存済みの正式曲名は変更せず、比較するときだけ表記ゆれを吸収する。
// ユーザー名など他の文字列には使用しない。
export function normalizeSongTitleForMatch(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[〜～]/g, '~')
    .replace(/[\s\u00A0\u3000]+/g, ' ')
    .trim()
    .toLocaleLowerCase('ja-JP');
}

async function findNormalizedSong(title, part, versionId = null) {
  const normalized = normalizeSongTitleForMatch(title);
  if (!normalized || !part || !versionId) return null;

  const { data, error } = await supabase
    .from('songs')
    .select('id,is_hot,title,part,level,version_id')
    .eq('part', part)
    .eq('version_id', versionId);

  if (error) throw error;

  return (data ?? []).find(
    row => normalizeSongTitleForMatch(row.title) === normalized
  ) ?? null;
}

async function findCanonicalSongTitle(title, versionId = null) {
  const normalized = normalizeSongTitleForMatch(title);
  if (!normalized || !versionId) return null;

  const { data, error } = await supabase
    .from('songs')
    .select('title')
    .eq('version_id', versionId);

  if (error) throw error;

  return (data ?? []).find(
    row => normalizeSongTitleForMatch(row.title) === normalized
  )?.title ?? null;
}

export async function searchSongTitles(keyword = '', instrument = 'GF', versionId = null) {
  const clean = String(keyword || '').trim();
  if (!clean) return [];

  let query = supabase
    .from('songs')
    .select('title,is_hot,part')
    .ilike('title', `%${clean}%`)
    .in('part', partsForInstrument(instrument))
    .eq('version_id', versionId)
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

export async function getSongByTitleAndPart(title, part, versionId = null) {
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle || !part) return null;

  // まず従来の完全一致。通常ケースの速度は落とさない。
  const { data, error } = await supabase
    .from('songs')
    .select('id,is_hot,title,part,level,version_id')
    .eq('title', cleanTitle)
    .eq('part', part)
    .eq('version_id', versionId)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  // 完全一致しないときだけ、曲名表記ゆれを吸収して再照合。
  return findNormalizedSong(cleanTitle, part, versionId);
}

export async function requestSongMaster({ title, part, proposedLevel, versionId }) {
  const cleanTitle = String(title || '').trim();
  const numericLevel = Number(proposedLevel);

  if (!cleanTitle) throw new Error('曲名を入力してください。');
  if (!PARTS.includes(part)) throw new Error('Partを選択してください。');
  if (!Number.isFinite(numericLevel) || numericLevel <= 0 || numericLevel > 9.99) {
    throw new Error('難易度は0.01～9.99の範囲で入力してください。');
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('ログイン情報を取得できません。');

  // 申請作成直前にもマスターを再確認。
  // 手動登録側で取りこぼしても、既存譜面があれば新規申請を作らない。
  const existingSong = await findNormalizedSong(cleanTitle, part, versionId);
  if (existingSong) {
    return {
      existing_song_id: existingSong.id,
      title: existingSong.title,
      part: existingSong.part,
      level: existingSong.level,
      is_hot: Boolean(existingSong.is_hot)
    };
  }

  // 同じ曲の別パートが既にある場合は、マスター側の正式表記を申請に使用。
  const canonicalTitle = await findCanonicalSongTitle(cleanTitle, versionId);

  const payload = {
    requester_id: userData.user.id,
    title: canonicalTitle || cleanTitle,
    part,
    version_id: versionId,
    proposed_level: Math.floor((numericLevel + Number.EPSILON) * 100) / 100
  };

  if (!payload.version_id) {
    throw new Error('バージョン情報を取得できませんでした。ページを再読み込みして再度お試しください。');
  }

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
      .eq('version_id', versionId)
      .eq('status', 'pending')
      .maybeSingle();

    if (findError) throw findError;
    if (existing) return existing;
  }

  throw error;
}


export async function requestSongLevelCorrection({ songId, proposedLevel, versionId = null }) {
  const numericLevel = Number(proposedLevel);
  if (!songId) throw new Error('対象譜面を取得できません。');
  if (!Number.isFinite(numericLevel) || numericLevel <= 0 || numericLevel > 9.99) {
    throw new Error('難易度は0.01～9.99の範囲で入力してください。');
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('ログイン情報を取得できません。');

  const { data: song, error: songError } = await supabase
    .from('songs')
    .select('id,title,part,level,version_id')
    .eq('id', songId)
    .single();
  if (songError) throw songError;

  const payload = {
    requester_id: userData.user.id,
    title: song.title,
    part: song.part,
    version_id: song.version_id || versionId,
    proposed_level: Math.floor((numericLevel + Number.EPSILON) * 100) / 100,
    request_type: 'level_correction',
    current_song_id: song.id
  };

  const { data, error } = await supabase
    .from('song_requests')
    .insert(payload)
    .select('id,title,part,version_id,proposed_level,status,request_type,current_song_id')
    .single();

  if (!error) return data;

  if (error.code === '23505') {
    throw new Error('この譜面の難易度修正依頼は既に送信されています。');
  }
  throw error;
}
