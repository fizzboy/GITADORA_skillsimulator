import { supabase } from './supabase.js';

export function calcSkill(level, achievementRate) {
  const value = Number(level) * 20 * Number(achievementRate) / 100;
  return Math.floor((value + Number.EPSILON) * 100) / 100;
}

export const formatLevel = value => Number(value).toFixed(2);
export const formatRate = value => Number(value).toFixed(2);
export const formatSkill = value => Number(value).toFixed(2);

export async function getMyScores() {
  const { data, error } = await supabase
    .from('my_score_details')
    .select('*')
    .order('skill', { ascending: false });

  if (error) throw error;
  return data ?? [];
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
    const { error } = await supabase
      .from('user_scores')
      .upsert(row, { onConflict: 'user_id,song_id' });

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
