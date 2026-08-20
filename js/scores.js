import { supabase } from './supabase.js';

export function calcSkill(level, achievementRate) {
  const value = Number(level) * 20 * Number(achievementRate) / 100;
  return Math.floor((value + Number.EPSILON) * 100) / 100;
}

export const formatLevel = value => Number(value).toFixed(2);
export const formatRate = value => Number(value).toFixed(2);
export const formatSkill = value => Number(value).toFixed(2);

export async function getMyScores(versionId = null) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new Error('ログイン情報を取得できません。');
  }

  const { data: scoreRows, error: scoreError } = await supabase
    .from('user_scores')
    .select('id,user_id,song_id,song_request_id,achievement_rate,fc,play_option,created_at,updated_at')
    .eq('user_id', userData.user.id)
    .order('updated_at', { ascending: false });

  if (scoreError) throw scoreError;

  const rows = scoreRows ?? [];
  if (!rows.length) return [];

  const songIds = [...new Set(rows.map(r => r.song_id).filter(Boolean))];
  const requestIds = [...new Set(rows.map(r => r.song_request_id).filter(Boolean))];

  let songs = [];
  let requests = [];

  if (songIds.length) {
    const { data, error } = await supabase
      .from('songs')
      .select('id,is_hot,title,part,level,version_id')
      .in('id', songIds);
    if (error) throw error;
    songs = data ?? [];
  }

  if (requestIds.length) {
    const { data, error } = await supabase
      .from('song_requests')
      .select('id,title,part,proposed_level,status,version_id')
      .in('id', requestIds);
    if (error) throw error;
    requests = data ?? [];
  }

  const songMap = new Map(songs.map(row => [row.id, row]));
  const requestMap = new Map(requests.map(row => [row.id, row]));

  const result = [];

  for (const row of rows) {
    const song = row.song_id ? songMap.get(row.song_id) : null;
    const request = row.song_request_id ? requestMap.get(row.song_request_id) : null;

    const rowVersionId = song?.version_id ?? request?.version_id ?? null;
    if (versionId && rowVersionId !== versionId) continue;

    const level = Number(song?.level ?? request?.proposed_level);
    const rate = Number(row.achievement_rate);

    if (!Number.isFinite(level) || !Number.isFinite(rate)) continue;

    result.push({
      score_id: row.id,
      user_id: row.user_id,
      song_id: row.song_id,
      song_request_id: row.song_request_id,
      is_hot: Boolean(song?.is_hot),
      title: song?.title ?? request?.title ?? '',
      part: song?.part ?? request?.part ?? '',
      level,
      achievement_rate: rate,
      fc: row.fc,
      play_option: row.play_option,
      skill: calcSkill(level, rate),
      pending_master: Boolean(row.song_request_id),
      request_status: request?.status ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      version_id: rowVersionId
    });
  }

  return result.sort((a, b) => Number(b.skill) - Number(a.skill));
}

export async function saveScore({
  scoreId,
  songId = null,
  requestId = null,
  achievementRate,
  fc = '',
  playOption = 'NORMAL'
}) {
  const rate = Number(achievementRate);

  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new Error('達成率は0.00〜100.00の範囲で入力してください。');
  }

  if (!songId && !requestId) {
    throw new Error('曲マスターまたは登録依頼が必要です。');
  }

  if (songId && requestId) {
    throw new Error('曲マスターと登録依頼を同時には指定できません。');
  }

  const payload = {
    song_id: songId,
    song_request_id: requestId,
    achievement_rate: Math.floor((rate + Number.EPSILON) * 100) / 100,
    fc: fc || null,
    play_option: playOption || 'NORMAL'
  };

  if (scoreId) {
    const { error } = await supabase
      .from('user_scores')
      .update(payload)
      .eq('id', scoreId);

    if (error) throw error;
    return;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new Error('ログイン情報を取得できません。');
  }

  const row = {
    user_id: userData.user.id,
    ...payload
  };

  if (songId) {
    // 同一曲名でもPartごとにsongs.idは別。
    // 同じsong_idだけ更新し、別Partは別レコードとして追加する。
    const { data: existing, error: existingError } = await supabase
      .from('user_scores')
      .select('id')
      .eq('user_id', userData.user.id)
      .eq('song_id', songId)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing?.id) {
      const { error } = await supabase
        .from('user_scores')
        .update(payload)
        .eq('id', existing.id);

      if (error) throw error;
      return;
    }

    const { error } = await supabase
      .from('user_scores')
      .insert(row);

    if (error) throw error;
    return;
  }

  // 申請中の曲は「ユーザー + 申請ID」で一意
  const { error } = await supabase
    .from('user_scores')
    .upsert(row, { onConflict: 'user_id,song_request_id' });

  if (error) throw error;
}

export async function deleteScore(scoreId) {
  const { error } = await supabase
    .from('user_scores')
    .delete()
    .eq('id', scoreId);

  if (error) throw error;
}
