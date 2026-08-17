import { supabase } from './supabase.js';

export function calcSkill(level, achievementRate) {
  const value = Number(level) * 20 * Number(achievementRate) / 100;
  return Math.floor((value + Number.EPSILON) * 100) / 100;
}

export function formatLevel(value) {
  return Number(value).toFixed(2);
}

export function formatRate(value) {
  return Number(value).toFixed(2);
}

export function formatSkill(value) {
  return Number(value).toFixed(2);
}

export async function getMyScores() {
  const { data, error } = await supabase
    .from('my_score_details')
    .select('*')
    .order('skill', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function saveScore({ scoreId, songId, achievementRate, fc = '', playOption = 'NORMAL' }) {
  const rate = Number(achievementRate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new Error('達成率は0.00〜100.00の範囲で入力してください。');
  }

  const roundedRate = Math.floor((rate + Number.EPSILON) * 100) / 100;
  const normalizedFc = fc || null;
  const normalizedOption = playOption || 'NORMAL';

  if (scoreId) {
    const { data, error } = await supabase
      .from('user_scores')
      .update({
        song_id: songId,
        achievement_rate: roundedRate,
        fc: normalizedFc,
        play_option: normalizedOption
      })
      .eq('id', scoreId)
      .select('id')
      .single();
    if (error) throw error;
    return data;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('ログイン情報を取得できません。');

  const { data, error } = await supabase
    .from('user_scores')
    .upsert({
      user_id: userData.user.id,
      song_id: songId,
      achievement_rate: roundedRate,
      fc: normalizedFc,
      play_option: normalizedOption
    }, { onConflict: 'user_id,song_id' })
    .select('id')
    .single();

  if (error) throw error;
  return data;
}

export async function deleteScore(scoreId) {
  const { error } = await supabase
    .from('user_scores')
    .delete()
    .eq('id', scoreId);
  if (error) throw error;
}
