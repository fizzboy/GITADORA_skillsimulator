import { supabase } from './supabase.js?v=16_0';
import { register, login, logout, changePassword, getSession, validateUsername } from './auth.js?v=16_0';
import { initAuthCaptcha, prepareAuthCaptcha, getAuthCaptchaToken, resetAuthCaptcha } from './captcha.js?v=16_0';
import { PARTS, searchSongTitles, getSongByTitleAndPart, requestSongMaster, requestSongLevelCorrection } from './songs.js?v=16_0';
import { calcSkill, formatLevel, formatRate, formatSkill, getMyScores, saveScore, deleteScore } from './scores.js?v=16_0';
const {
  isAdmin,
  getAdminSongs,
  saveMasterSong,
  deleteMasterSong,
  getAdminUsers,
  getPendingSongRequests,
  approveSongRequest,
  rejectSongRequest,
  accountAdmin
} = adminApi;

// 曲マスター表の列順。admin.jsが古くても画面自体は起動できるようローカルにも保持。
const MASTER_PARTS = adminApi.MASTER_PARTS ?? [
  'MAS-G','MAS-B','EXT-G','EXT-B','ADV-G','ADV-B','BSC-G','BSC-B'
];

// v14.3: 曲マスターの横一括編集はapp.js側にも実装。
// admin.jsのキャッシュや差し替え漏れがあっても保存できるようにする。
async function saveMasterSongRow({
  originalTitle = '',
  title,
  isHot = false,
  levels = {}
}) {
  const cleanTitle = String(title || '').trim();
  const oldTitle = String(originalTitle || '').trim();

  if (!cleanTitle) throw new Error('曲名を入力してください。');

  const filledParts = MASTER_PARTS.filter(
    part => String(levels[part] ?? '').trim() !== ''
  );

  if (!filledParts.length) {
    throw new Error('少なくとも1つの難易度を入力してください。');
  }

  // 曲名変更
  if (oldTitle && oldTitle !== cleanTitle) {
    const { error: renameError } = await supabase
      .from('songs')
      .update({ title: cleanTitle })
      .eq('title', oldTitle);

    if (renameError) throw renameError;
  }

  const { data: existing, error: existingError } = await supabase
    .from('songs')
    .select('id,part')
    .eq('title', cleanTitle);

  if (existingError) throw existingError;

  const existingByPart = new Map(
    (existing ?? []).map(row => [row.part, row])
  );

  for (const part of MASTER_PARTS) {
    const raw = String(levels[part] ?? '').trim();
    const current = existingByPart.get(part);

    if (!raw) {
      if (current) {
        const { error } = await supabase
          .from('songs')
          .delete()
          .eq('id', current.id);

        if (error) throw error;
      }
      continue;
    }

    const level = Number(raw);

    if (!Number.isFinite(level) || level <= 0 || level > 99.99) {
      throw new Error(`${part} の難易度が不正です。`);
    }

    const { error } = await supabase
      .from('songs')
      .upsert({
        is_hot: Boolean(isHot),
        title: cleanTitle,
        part,
        level: Math.round((level + Number.EPSILON) * 100) / 100
      }, {
        onConflict: 'title,part'
      });

    if (error) throw error;
  }

  // HOTは曲単位で統一
  const { error: hotError } = await supabase
    .from('songs')
    .update({ is_hot: Boolean(isHot) })
    .eq('title', cleanTitle);

  if (hotError) throw hotError;
}

async function deleteMasterSongTitle(title) {
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) return;

  const { error } = await supabase
    .from('songs')
    .delete()
    .eq('title', cleanTitle);

  if (error) throw error;
}

import * as adminApi from './admin.js?v=16_0';
import { listUserSummaries, getUserSkillTargets, getSongRateComparison, getSongOptionDistribution, getMyFavorites, addFavorite, removeFavorite, reorderFavorites } from './users.js?v=16_0';

let activeTabName = 'SKILL';
let currentAuthMode = 'login';
let scores = [];
let editingScoreId = null;
let selectedSong = null;

let adminEnabled = false;
let adminTab = 'songs';
let adminSongs = [];
let adminUsers = [];
let adminRequests = [];
let adminEditingSongId = null;
let publicUsers = [];
let favoriteUsers = [];
let viewedUserScores = [];
let currentUserId = null;
let adminPasswordUserId = null;

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));

function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }

function showAuth(mode = 'login') {
  currentAuthMode = mode;
  hide('appScreen');
  show('authScreen');

  const isLogin = mode === 'login';
  $('authTitle').textContent = isLogin ? 'ログイン' : '新規登録';
  $('authSubmit').textContent = isLogin ? 'ログイン' : '登録する';
  $('authSwitch').textContent = isLogin ? '新規登録はこちら' : 'ログインはこちら';
  $('authSwitch').dataset.mode = isLogin ? 'register' : 'login';

  $('authPassword').required = true;
  $('authPassword').disabled = false;
  $('authPassword').value = '';
  $('authPassword').placeholder = isLogin ? 'パスワードを入力' : '8文字以上で設定';
  $('authPassword').autocomplete = isLogin ? 'current-password' : 'new-password';

  $('authPasswordConfirmGroup').classList.toggle('hidden', isLogin);
  $('authPasswordConfirm').required = !isLogin;
  $('authPasswordConfirm').value = '';

  prepareAuthCaptcha().catch(error => {
    console.error('Turnstile初期化エラー:', error);
  });
}

async function showApp(session) {
  hide('authScreen');
  show('appScreen');
  currentUserId = session?.user?.id || null;

  let username =
    session?.user?.user_metadata?.username ||
    session?.user?.email?.split('@')[0] || '';

  // アカウント名変更後も常にprofiles側の最新値を表示
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', session.user.id)
      .maybeSingle();

    if (profile?.username) username = profile.username;
  } catch (e) {
    console.warn('プロフィール取得失敗:', e);
  }

  $('headerUsername').textContent = username;
  await Promise.all([loadScores(), checkAdminAccess()]);
}


let siteDialogResolver = null;

function showSiteDialog(message, title = 'お知らせ') {
  $('siteDialogTitle').textContent = title;
  $('siteDialogMessage').textContent = String(message || '');
  $('siteDialogMask').style.display = 'flex';

  return new Promise(resolve => {
    siteDialogResolver = resolve;
  });
}

function closeSiteDialog() {
  $('siteDialogMask').style.display = 'none';
  const resolve = siteDialogResolver;
  siteDialogResolver = null;
  if (resolve) resolve();
}

async function init() {
  $('partSelect').innerHTML = PARTS.map(p => `<option value="${p}">${p}</option>`).join('');
  await initAuthCaptcha();
  const session = await getSession();
  if (session) await showApp(session);
  else showAuth('login');

  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session) await showApp(session);
    else {
      adminEnabled = false;
      $('btnAdmin').classList.add('hidden');
      closeAdmin();
      showAuth('login');
    }
  });
}

async function loadScores() {
  try {
    scores = await getMyScores();
    render();
  } catch (e) {
    console.error(e);
    alert('データ取得に失敗しました: ' + e.message);
  }
}


function getOwnSkillTargetRows() {
  const bestByTitle = new Map();

  for (const row of scores) {
    if (row.pending_master) continue;
    if (/\(CLASSIC\)\s*$/i.test(String(row.title || ''))) continue;

    const current = bestByTitle.get(row.title);
    if (!current || Number(row.skill) > Number(current.skill)) {
      bestByTitle.set(row.title, row);
    }
  }

  return Array.from(bestByTitle.values())
    .sort((a, b) => Number(b.skill) - Number(a.skill));
}

function calcTargetTotals(targetRows) {
  const sorted = [...targetRows].sort((a, b) => Number(b.skill) - Number(a.skill));
  const hotRows = sorted.filter(r => r.is_hot).slice(0, 25);
  const otherRows = sorted.filter(r => !r.is_hot).slice(0, 25);

  const hot = hotRows.reduce((sum, row) => sum + Number(row.skill), 0);
  const other = otherRows.reduce((sum, row) => sum + Number(row.skill), 0);

  return { hot, other, total: hot + other, hotRows, otherRows };
}

function totals() {
  return calcTargetTotals(getOwnSkillTargetRows());
}


function getTotalSkillRank(totalValue) {
  const value = Number(totalValue) || 0;

  if (value >= 9000) return 'deep-rainbow';
  if (value >= 8500) return 'rainbow';
  if (value >= 8000) return 'gold';
  if (value >= 7500) return 'silver';
  if (value >= 7000) return 'bronze';
  if (value >= 6500) return 'red-grad';
  if (value >= 6000) return 'red';
  if (value >= 5500) return 'purple-grad';
  if (value >= 5000) return 'purple';
  if (value >= 4500) return 'blue-grad';
  if (value >= 4000) return 'blue';
  if (value >= 3500) return 'green-grad';
  if (value >= 3000) return 'green';
  if (value >= 2500) return 'yellow-grad';
  if (value >= 2000) return 'yellow';
  if (value >= 1500) return 'orange-grad';
  if (value >= 1000) return 'orange';
  return 'white';
}

function getSongSkillRank(skillValue) {
  // 曲別Skillは×50した値をTOTALスキル帯に当てはめる
  // 例: 93.00 × 50 = 4650 → BLUE Gradation
  return getTotalSkillRank((Number(skillValue) || 0) * 50);
}

function tintHeaderValues(hot, other, total) {
  const rankClass = `score-rank-${getTotalSkillRank(total)}`;

  const allRankClasses = [
    'score-rank-white',
    'score-rank-orange',
    'score-rank-orange-grad',
    'score-rank-yellow',
    'score-rank-yellow-grad',
    'score-rank-green',
    'score-rank-green-grad',
    'score-rank-blue',
    'score-rank-blue-grad',
    'score-rank-purple',
    'score-rank-purple-grad',
    'score-rank-red',
    'score-rank-red-grad',
    'score-rank-bronze',
    'score-rank-silver',
    'score-rank-gold',
    'score-rank-rainbow',
    'score-rank-deep-rainbow',
    'm-gold-text',
    'm-rainbow-text'
  ];

  ['txtGrandTotal', 'txtHotTotal', 'txtOtherTotal'].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.classList.remove(...allRankClasses);
    el.classList.add(rankClass);
  });
}

function getPartColorClass(part) {
  if (part.startsWith('MAS')) return 'p-mas';
  if (part.startsWith('EXT')) return 'p-ext';
  if (part.startsWith('ADV')) return 'p-adv';
  if (part.startsWith('BSC')) return 'p-bsc';
  return '';
}

function getFcBadgeMarkup(fc) {
  return fc ? `<span class="fc-unified-badge ${fc.toLowerCase()}">${esc(fc)}</span>` : '';
}

function getOptionBadgeMarkup(option) {
  const value = option || 'NORMAL';
  if (value === 'NORMAL') return '';
  const cls =
    value === 'RAN' ? 'opt-ran' :
    value === 'SRA' ? 'opt-sra' :
    value === 'RAN+' ? 'opt-ran-plus' :
    value === 'SRA+' ? 'opt-sra-plus' : '';
  return `<span class="opt-badge ${cls}">${esc(value)}</span>`;
}

function getHotTagMarkup(isHot) {
  return isHot ? '<span class="hot-tag">HOT</span>' : '';
}

function createCard(record, index, mode = 'MANAGE') {
  const skill = Number(record.skill);
  const fcBadge = getFcBadgeMarkup(record.fc);
  const optionBadge = getOptionBadgeMarkup(record.play_option);
  const hotTag = getHotTagMarkup(record.is_hot);
  const pendingTag = record.pending_master ? '<span class="pending-badge">申請中</span>' : '';

  const songRank = getSongSkillRank(skill);
  const boxColor = `skill-box-${songRank}`;
  const rowColor = `skill-row-${songRank}`;

  if (mode === 'SKILL') {

    return `
      <div class="sk-row ${rowColor}">
        <div class="sk-badge-column">
          <div class="part-zone"><span class="p-badge ${getPartColorClass(record.part)}">${esc(record.part)}</span></div>
          <div class="fc-zone">${fcBadge}</div>
        </div>
        <div class="sk-text-column">
          <div class="sk-title">${pendingTag}${hotTag} ${esc(record.title)}</div>
          <div class="sk-meta">
            <span class="sk-meta-lv">Lv: <strong>${formatLevel(record.level)}</strong></span>
            <span class="sk-meta-rate">Rate: <strong>${formatRate(record.achievement_rate)}%</strong></span>
            <span class="opt-slot">${optionBadge}</span>
          </div>
        </div>
        <div class="sk-val-box ${boxColor}">${formatSkill(skill)}</div>
      </div>`;
  }

  return `
    <div class="m-card" ${record.song_id ? `data-compare-song="${record.song_id}" data-compare-title="${esc(record.title)}" data-compare-part="${esc(record.part)}"` : ''}>
<div class="m-main-area">
        <div class="m-upper-row">
          <div class="part-zone"><span class="p-badge ${getPartColorClass(record.part)}">${esc(record.part)}</span></div>
          <div class="m-title-text">${pendingTag}${hotTag} ${esc(record.title)}</div>
          <div class="m-card-val-box ${boxColor}">${formatSkill(skill)}</div>
        </div>
        <div class="m-lower-row">
          <div class="fc-zone">${fcBadge}</div>
          <div class="m-flow-container">
            <span class="m-txt-lv">Lv <strong>${formatLevel(record.level)}</strong></span>
            <span class="m-txt-rate">Rate <strong>${formatRate(record.achievement_rate)}%</strong></span>
            <span class="opt-slot">${optionBadge}</span>
          </div>
          <div class="m-btn-group">
            <button class="m-action-btn btn-e" data-edit="${record.score_id}">編集</button>
            <button class="m-action-btn btn-d" data-delete="${record.score_id}">削除</button>
          </div>
        </div>
      </div>
    </div>`;
}

function renderSkill() {
  const target = calcTargetTotals(getOwnSkillTargetRows());

  $('viewSkill').innerHTML = `
    <div class="sk-section"><h2>HOT Top25</h2><div class="list-container">
      ${target.hotRows.map((r,i) => createCard(r,i+1,'SKILL')).join('') || '<div class="empty-state">まだ登録がありません</div>'}
    </div></div>
    <div class="sk-section"><h2>OTHER Top25</h2><div class="list-container">
      ${target.otherRows.map((r,i) => createCard(r,i+1,'SKILL')).join('') || '<div class="empty-state">まだ登録がありません</div>'}
    </div></div>`;
}

function renderManage() {
  const keyword = $('domSearch').value.trim().toLowerCase();
  const typeFilter = $('recordTypeFilter')?.value || '';
  const fcFilter = $('recordFcFilter')?.value || '';

  const data = scores
    .filter(r => !keyword || r.title.toLowerCase().includes(keyword))
    .filter(r => {
      if (typeFilter === 'HOT') return Boolean(r.is_hot);
      if (typeFilter === 'OTHER') return !r.is_hot;
      return true;
    })
    .filter(r => {
      const fc = r.fc || '';
      if (fcFilter === 'NONE') return fc === '';
      if (fcFilter === 'FC') return fc === 'FC';
      if (fcFilter === 'EXC') return fc === 'EXC';
      return true;
    })
    .sort((a,b) => Number(b.skill) - Number(a.skill));

  $('viewAllManage').innerHTML =
    data.map((r,i) => createCard(r,i+1)).join('') ||
    '<div class="empty-state">条件に一致する登録データがありません</div>';
}

function render() {
  const t = totals();
  $('txtHotTotal').textContent = formatSkill(t.hot);
  $('txtOtherTotal').textContent = formatSkill(t.other);
  $('txtGrandTotal').textContent = formatSkill(t.total);
  tintHeaderValues(t.hot,t.other,t.total);

  hide('viewSkill');
  hide('viewAllManage');
  hide('viewUsers');

  if (activeTabName === 'SKILL') {
    show('viewSkill');
    renderSkill();
  } else if (activeTabName === 'RECORDS') {
    show('viewAllManage');
    renderManage();
  } else {
    show('viewUsers');
    loadUsers();
  }
}

function switchTab(tab) {
  activeTabName = tab;
  document.querySelectorAll('.p-tab-btn').forEach(
    b => b.classList.toggle('active', b.dataset.tab === tab)
  );

  $('domSearch').value = '';
  $('searchArea').classList.toggle('hidden', tab !== 'RECORDS');
  window.scrollTo(0,0);
  render();
}

function openScoreModal(score = null) {
  editingScoreId = score?.score_id || null;
  selectedSong = score?.song_id ? {
    id: score.song_id,
    title: score.title,
    part: score.part,
    level: score.level,
    is_hot: score.is_hot
  } : null;

  $('domModalTitle').textContent = score ? '登録情報の編集' : 'スコア登録';
  $('formTitle').value = score?.title || '';
  $('partSelect').value = score?.part || 'MAS-G';
  $('formLevel').value = score ? formatLevel(score.level) : '';
  $('formRate').value = score ? formatRate(score.achievement_rate) : '';
  $('formFc').value = score?.fc || '';
  $('formOption').value = score?.play_option || 'NORMAL';
  $('formSkill').textContent = score ? formatSkill(score.skill) : '-';
  $('songSuggestions').innerHTML = '';
  $('btnSubmitForm').textContent = '保存する';
  hide('masterRequestArea');
  hide('levelCorrectionArea');
  hide('levelCorrectionForm');
  $('correctionLevel').value = '';
  if (selectedSong) show('levelCorrectionArea');
  $('domModal').style.display = 'flex';

  if (!score) $('formTitle').focus();
}

function closeModal() {
  $('domModal').style.display = 'none';
  editingScoreId = null;
  selectedSong = null;
}

async function suggestSongs() {
  const title = $('formTitle').value.trim();

  selectedSong = null;
  $('formLevel').value = '';
  $('formLevel').readOnly = true;
  hide('masterRequestArea');
  hide('levelCorrectionArea');
  hide('levelCorrectionForm');
  updateSkillPreview();

  if (!title) {
    $('songSuggestions').innerHTML = '';
    return;
  }

  try {
    const rows = await searchSongTitles(title);
    $('songSuggestions').innerHTML = rows.map(r => `
      <button class="suggestion"
        data-title="${esc(r.title)}"
        data-is-hot="${r.is_hot ? '1':'0'}">
        <span>${r.is_hot ? '[HOT] ' : ''}${esc(r.title)}</span>
      </button>`).join('') || '<div class="empty-state">曲マスターに該当する曲名がありません</div>';

    // 入力中は完全一致しても自動確定しない。
    // 候補をユーザーがタップした時だけ曲名を確定する。
    // これにより「Flow」入力時にFlowが存在していても
    // 「Flower remix」まで続けて入力できる。
    selectedSong = null;
    $('formLevel').value = '';
    $('formLevel').readOnly = true;
    hide('levelCorrectionArea');
    hide('levelCorrectionForm');
    hide('masterRequestArea');
    updateSkillPreview();
  } catch (e) {
    console.error(e);
  }
}

async function selectSongTitle(title) {
  $('formTitle').value = title;
  $('songSuggestions').innerHTML = '';
  await refreshSelectedPart();
}

async function refreshSelectedPart() {
  const title = $('formTitle').value.trim();
  const part = $('partSelect').value;

  selectedSong = null;
  $('formLevel').value = '';
  $('formLevel').readOnly = true;
  hide('masterRequestArea');
  hide('levelCorrectionArea');
  hide('levelCorrectionForm');
  $('correctionLevel').value = '';

  if (!title || !part) {
    updateSkillPreview();
    return;
  }

  try {
    const song = await getSongByTitleAndPart(title, part);
    if (song) {
      selectedSong = song;
      $('formLevel').value = formatLevel(song.level);
      $('formLevel').readOnly = true;
      $('btnSubmitForm').textContent = '保存する';
      hide('masterRequestArea');
      show('levelCorrectionArea');
    } else {
      setMissingMasterState();
    }
  } catch (e) {
    console.error(e);
    setMissingMasterState();
  }

  updateSkillPreview();
}

function setMissingMasterState() {
  selectedSong = null;
  $('formLevel').readOnly = false;
  $('formLevel').placeholder = '登録依頼する難易度';
  $('btnSubmitForm').textContent = '登録依頼して保存';
  show('masterRequestArea');
  hide('levelCorrectionArea');
  hide('levelCorrectionForm');
  updateSkillPreview();
}

function updateSkillPreview() {
  const level = Number($('formLevel').value);
  const rateText = $('formRate').value;
  const rate = Number(rateText);

  $('formSkill').textContent =
    $('formLevel').value && rateText !== '' && Number.isFinite(level) && Number.isFinite(rate)
      ? formatSkill(calcSkill(level,rate))
      : '-';
}

async function submitScore() {
  const title = $('formTitle').value.trim();
  const part = $('partSelect').value;
  const rate = $('formRate').value;

  if (!title) throw new Error('曲名を入力してください。');
  if (rate === '') throw new Error('達成率を入力してください。');

  if (!selectedSong || selectedSong.title !== title || selectedSong.part !== part) {
    selectedSong = await getSongByTitleAndPart(title, part);
  }

  let songId = selectedSong?.id || null;
  let requestId = null;

  // マスター未登録なら、申請とスコア保存を同時に行う
  if (!songId) {
    const level = $('formLevel').value;
    if (!level) throw new Error('登録依頼する難易度を入力してください。');

    const request = await requestSongMaster({
      title,
      part,
      proposedLevel: level
    });

    requestId = request.id;
  }

  await saveScore({
    scoreId: editingScoreId,
    songId,
    requestId,
    achievementRate: rate,
    fc: $('formFc').value,
    playOption: $('formOption').value
  });

  closeModal();
  await loadScores();
}

/* ---------- マイページ ---------- */

function formatDateOnly(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

async function loadUsers() {
  try {
    publicUsers = await listUserSummaries($('userSearch')?.value || '');
    renderUsers();
  } catch (e) {
    $('userList').innerHTML = `<div class="empty-state">ユーザー一覧の取得に失敗しました: ${esc(e.message)}</div>`;
  }
}

function renderUsers() {
  const sort = $('userSort')?.value || 'skill_desc';
  const users = [...publicUsers].sort((a, b) => {
    const skillA = Number(a.total_skill) || 0;
    const skillB = Number(b.total_skill) || 0;
    const nameA = String(a.username || '');
    const nameB = String(b.username || '');
    const dateA = a.last_recorded_at ? new Date(a.last_recorded_at).getTime() : 0;
    const dateB = b.last_recorded_at ? new Date(b.last_recorded_at).getTime() : 0;

    switch (sort) {
      case 'skill_asc': return skillA - skillB || nameA.localeCompare(nameB, 'ja');
      case 'name_asc': return nameA.localeCompare(nameB, 'ja');
      case 'name_desc': return nameB.localeCompare(nameA, 'ja');
      case 'date_desc': return dateB - dateA || skillB - skillA;
      case 'date_asc': return dateA - dateB || skillB - skillA;
      case 'skill_desc':
      default: return skillB - skillA || nameA.localeCompare(nameB, 'ja');
    }
  });

  $('userList').innerHTML = users.map(user => {
    const totalClass = `score-rank-${getTotalSkillRank(user.total_skill)}`;
    return `
      <div class="user-list-row" data-user-open="${user.user_id}" data-user-name="${esc(user.username)}">
        <div class="user-list-name">${esc(user.username)}${user.is_self ? '（自分）' : ''}</div>
        <div class="user-list-total ${totalClass}">${formatSkill(user.total_skill)}</div>
        <div class="user-list-date">${formatDateOnly(user.last_recorded_at)}</div>
        ${user.is_self
          ? '<div></div>'
          : `<button class="favorite-toggle ${user.is_favorite ? 'active' : ''}"
              data-favorite-user="${user.user_id}"
              title="お気に入り">${user.is_favorite ? '★' : '☆'}</button>`}
      </div>`;
  }).join('') || '<div class="empty-state">該当するユーザーがいません</div>';
}

async function openUserDetail(userId, username) {
  $('userDetailName').textContent = username;
  $('userDetailSkill').innerHTML = '<div class="empty-state">読み込み中...</div>';
  $('userDetailPage').style.display = 'block';

  try {
    viewedUserScores = await getUserSkillTargets(userId);
    const target = calcTargetTotals(viewedUserScores);

    $('userDetailHot').textContent = formatSkill(target.hot);
    $('userDetailOther').textContent = formatSkill(target.other);
    $('userDetailTotal').textContent = formatSkill(target.total);

    const rankClass = `score-rank-${getTotalSkillRank(target.total)}`;
    ['userDetailHot','userDetailOther','userDetailTotal'].forEach(id => {
      $(id).className = rankClass;
    });

    $('userDetailSkill').innerHTML = `
      <div class="sk-section"><h2>HOT Top25</h2><div class="list-container">
        ${target.hotRows.map((r,i) => createCard(r,i+1,'SKILL')).join('') || '<div class="empty-state">記録がありません</div>'}
      </div></div>
      <div class="sk-section"><h2>OTHER Top25</h2><div class="list-container">
        ${target.otherRows.map((r,i) => createCard(r,i+1,'SKILL')).join('') || '<div class="empty-state">記録がありません</div>'}
      </div></div>`;
  } catch (e) {
    $('userDetailSkill').innerHTML = `<div class="empty-state">取得に失敗しました: ${esc(e.message)}</div>`;
  }
}

function closeUserDetail() {
  $('userDetailPage').style.display = 'none';
  viewedUserScores = [];
}

async function toggleFavorite(userId) {
  const user = publicUsers.find(u => u.user_id === userId);
  if (!user) return;

  try {
    if (user.is_favorite) {
      await removeFavorite(userId);
    } else {
      await addFavorite(userId);
    }
    await Promise.all([loadUsers(), loadFavorites()]);
  } catch (e) {
    const message = String(e?.message || e);
    if (message.includes('5件')) {
      await showSiteDialog('お気に入り登録は5件までです。', 'お気に入り');
    } else {
      await showSiteDialog('お気に入りの更新に失敗しました。', 'エラー');
      console.error(e);
    }
  }
}

async function loadFavorites() {
  try {
    favoriteUsers = await getMyFavorites();
    renderFavorites();
  } catch (e) {
    $('favoriteUserList').innerHTML = `<div class="empty-state">お気に入りの取得に失敗しました</div>`;
    console.error(e);
  }
}

function renderFavorites() {
  $('favoriteUserList').innerHTML = favoriteUsers.map((fav, index) => `
    <div class="favorite-user-row" data-favorite-row="${fav.favorite_user_id}">
      <div class="name">${index + 1}. ${esc(fav.username)}</div>
      <button type="button" data-favorite-up="${fav.favorite_user_id}" ${index === 0 ? 'disabled' : ''}>↑</button>
      <button type="button" data-favorite-down="${fav.favorite_user_id}" ${index === favoriteUsers.length - 1 ? 'disabled' : ''}>↓</button>
      <button type="button" class="remove" data-favorite-remove="${fav.favorite_user_id}">削除</button>
    </div>
  `).join('') || '<div class="section-note">お気に入りユーザーはまだ登録されていません。</div>';
}

async function moveFavorite(userId, direction) {
  const index = favoriteUsers.findIndex(f => f.favorite_user_id === userId);
  if (index < 0) return;

  const next = index + direction;
  if (next < 0 || next >= favoriteUsers.length) return;

  const ids = favoriteUsers.map(f => f.favorite_user_id);
  [ids[index], ids[next]] = [ids[next], ids[index]];

  await reorderFavorites(ids);
  await loadFavorites();
}


function getOptionDisplayName(option) {
  switch (option) {
    case 'NORMAL': return '正規';
    case 'RAN': return 'RAN';
    case 'SRA': return 'SRA';
    case 'RAN+': return 'RAN+';
    case 'SRA+': return 'SRA+';
    default: return option || '正規';
  }
}

function formatOptionPercentage(value) {
  const num = Number(value) || 0;
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
}

async function openRateComparison(songId, title, part) {
  $('rateCompareTitle').textContent = `${title} / ${part}`;
  $('rateOptionSummary').innerHTML = '<div class="option-share-title">オプション利用割合を読み込み中...</div>';
  $('rateCompareBody').innerHTML = '<div class="empty-state">読み込み中...</div>';
  $('rateCompareMask').style.display = 'flex';

  try {
    // Rate比較は自分+自分が登録したライバルのみ。
    // オプション割合はライバル登録に関係なく全ユーザーを集計。
    const [rows, optionRows] = await Promise.all([
      getSongRateComparison(songId),
      getSongOptionDistribution(songId)
    ]);

    const visibleOptions = optionRows.filter(row => Number(row.percentage) > 0);

    $('rateOptionSummary').innerHTML = visibleOptions.length
      ? `
        <div class="option-share-title">全ユーザーのオプション利用割合</div>
        ${visibleOptions.map(row => `
          <div class="option-share-item">
            <span>${getOptionDisplayName(row.play_option)}</span>
            <strong>${formatOptionPercentage(row.percentage)}%</strong>
          </div>`
        ).join('')}
      `
      : '';

    $('rateCompareBody').innerHTML = rows.map((row, index) => `
      <div class="rate-row ${row.is_self ? 'self' : ''}">
        <div class="rate-user">
          <div>#${index + 1} ${esc(row.username)}${row.is_self ? '（自分）' : ''}</div>
          <div class="rate-badges">
            ${getFcBadgeMarkup(row.fc)}
            ${getOptionBadgeMarkup(row.play_option)}
          </div>
        </div>
        <div class="rate-value">${formatRate(row.achievement_rate)}%</div>
        <div class="rate-skill">${formatSkill(row.skill)}</div>
      </div>`
    ).join('') || '<div class="empty-state">比較できる記録がありません</div>';
  } catch (e) {
    $('rateOptionSummary').innerHTML = '';
    $('rateCompareBody').innerHTML = `<div class="empty-state">比較データの取得に失敗しました: ${esc(e.message)}</div>`;
  }
}

function closeRateComparison() {
  $('rateCompareMask').style.display = 'none';
}

async function openMyPage() {
  const { data } = await supabase.auth.getUser();
  $('mypageUsernameInput').value = data.user?.user_metadata?.username || $('headerUsername').textContent || '';
  $('newPassword').value = '';
  $('mypageModal').style.display = 'flex';
  await loadFavorites();
}

async function changeOwnUsername() {
  const username = $('mypageUsernameInput').value.trim();
  if (!username) throw new Error('アカウント名を入力してください。');

  const data = await accountAdmin('rename_self', { username });
  $('mypageUsernameInput').value = data.username;
  $('headerUsername').textContent = data.username;
  $('authUsername').value = data.username;
  await showSiteDialog('アカウント名を変更しました。\n次回から新しいアカウント名でログインしてください。', '変更完了');
}

function closeMyPage() {
  $('mypageModal').style.display = 'none';
}

async function deleteOwnAccount() {
  const ok1 = confirm('アカウントを削除します。登録したスコアもすべて削除されます。よろしいですか？');
  if (!ok1) return;
  const typed = prompt('確認のため「削除」と入力してください。');
  if (typed !== '削除') return;

  try {
    $('btnDeleteAccount').disabled = true;
    await accountAdmin('delete_self');
    try { await logout(); } catch (_) {}
    closeMyPage();
    scores = [];
    showAuth('login');
    alert('アカウントを削除しました。');
  } catch (e) {
    alert('アカウント削除に失敗しました: ' + e.message);
  } finally {
    $('btnDeleteAccount').disabled = false;
  }
}

/* ---------- 管理者 ---------- */
async function checkAdminAccess() {
  try {
    adminEnabled = await isAdmin();
  } catch (e) {
    console.error('管理者判定エラー:', e);
    adminEnabled = false;
  }
  $('btnAdmin').classList.toggle('hidden', !adminEnabled);
}

async function openAdmin() {
  if (!adminEnabled) return;
  $('adminModal').style.display = 'block';
  await switchAdminTab('songs');
}

function closeAdmin() {
  $('adminModal').style.display = 'none';
  $('adminSongFormMask').style.display = 'none';
  $('adminPasswordMask').style.display = 'none';
}

async function switchAdminTab(tab) {
  adminTab = tab;
  document.querySelectorAll('.admin-tab').forEach(
    b => b.classList.toggle('active', b.dataset.adminTab === tab)
  );
  $('adminSongToolbar').classList.toggle('hidden', tab !== 'songs');
  $('adminRequestToolbar').classList.toggle('hidden', tab !== 'requests');
  $('adminUserToolbar').classList.toggle('hidden', tab !== 'users');

  if (tab === 'songs') await loadAdminSongs();
  else if (tab === 'requests') await loadAdminRequests();
  else await loadAdminUsers();
}

async function loadAdminSongs() {
  $('adminBody').classList.add('admin-body-table');
  $('adminBody').innerHTML = '<div class="empty-state">読み込み中...</div>';

  try {
    adminSongs = await getAdminSongs($('adminSongSearch').value);

    const grouped = new Map();

    for (const row of adminSongs) {
      if (!grouped.has(row.title)) {
        grouped.set(row.title, {
          title: row.title,
          is_hot: Boolean(row.is_hot),
          levels: {}
        });
      }

      const item = grouped.get(row.title);
      item.is_hot = item.is_hot || Boolean(row.is_hot);
      item.levels[row.part] = row.level;
    }

    const rows = Array.from(grouped.values());

    $('adminBody').innerHTML = `
      <div class="master-sheet-wrap">
        <table class="master-sheet">
          <thead>
            <tr>
              <th class="master-hot-cell">HOT</th>
              <th class="master-title-cell">曲名</th>
              ${MASTER_PARTS.map(part => `<th class="master-level-cell">${part}</th>`).join('')}
              <th class="master-action-cell">操作</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row, index) => `
              <tr data-master-row="${index}" data-original-title="${esc(row.title)}">
                <td class="master-hot-cell">
                  <input type="checkbox" data-master-hot ${row.is_hot ? 'checked' : ''}>
                </td>
                <td class="master-title-cell">
                  <input type="text" data-master-title value="${esc(row.title)}">
                </td>
                ${MASTER_PARTS.map(part => `
                  <td class="master-level-cell">
                    <input
                      type="number"
                      step="0.01"
                      inputmode="decimal"
                      data-master-level="${part}"
                      value="${row.levels[part] != null ? formatLevel(row.levels[part]) : ''}"
                      placeholder="-">
                  </td>`).join('')}
                <td class="master-action-cell">
                  <div class="master-row-actions">
                    <button class="master-row-save" data-admin-save-master-row="${index}">保存</button>
                    <button class="master-row-delete" data-admin-delete-master-row="${index}">削除</button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    if (!rows.length) {
      $('adminBody').innerHTML = '<div class="empty-state">該当する曲がありません</div>';
    }
  } catch (e) {
    $('adminBody').innerHTML = `<div class="empty-state">取得失敗: ${esc(e.message)}</div>`;
  }
}

async function loadAdminRequests() {
  $('adminBody').classList.remove('admin-body-table');
  $('adminBody').innerHTML = '<div class="empty-state">読み込み中...</div>';
  try {
    adminRequests = await getPendingSongRequests($('adminRequestSearch').value);
    for (const req of adminRequests) {
      if (req.request_type === 'level_correction' && req.current_song_id) {
        const { data: currentSong } = await supabase
          .from('songs')
          .select('level')
          .eq('id', req.current_song_id)
          .maybeSingle();
        req.current_level = currentSong?.level ?? null;
      }
    }
    $('adminBody').innerHTML = adminRequests.map(req => `
      <div class="admin-card">
        <div class="admin-card-top">
          <div class="admin-card-title">${esc(req.title)}</div>
          <span class="pending-badge">${req.request_type === 'level_correction' ? '難易度修正' : '新規曲'}</span>
        </div>
        <div class="admin-card-meta">
          <span>${req.part}</span>
          ${req.request_type === 'level_correction' ? `<span>現在: ${formatLevel(req.current_level)}</span>` : ''}
          <span>依頼者: ${esc(req.profiles?.username || '-')}</span>
          <span>${new Date(req.created_at).toLocaleString('ja-JP')}</span>
        </div>
        <div style="margin-top:8px;">
          <label style="display:block;font-size:10px;font-weight:900;color:#64748b;margin-bottom:3px;">
            承認する難易度（修正可）
          </label>
          <input
            id="requestLevel_${req.id}"
            class="request-level-edit"
            type="number"
            step="0.01"
            inputmode="decimal"
            value="${formatLevel(req.proposed_level)}">
        </div>
        <div class="request-actions">
          <button class="request-approve" data-admin-approve-request="${req.id}">修正して承認</button>
          <button class="request-hot" data-admin-hot-request="${req.id}">HOTで承認</button>
          <button class="request-reject" data-admin-reject-request="${req.id}">却下</button>
        </div>
      </div>`).join('') || '<div class="empty-state">未処理の登録依頼はありません</div>';
  } catch (e) {
    $('adminBody').innerHTML = `<div class="empty-state">取得失敗: ${esc(e.message)}</div>`;
  }
}

async function loadAdminUsers() {
  $('adminBody').classList.remove('admin-body-table');
  $('adminBody').innerHTML = '<div class="empty-state">読み込み中...</div>';
  try {
    adminUsers = await getAdminUsers($('adminUserSearch').value);
    $('adminBody').innerHTML = adminUsers.map(user => `
      <div class="admin-card">
        <div class="admin-card-top">
          <div class="admin-card-title">${esc(user.username)}</div>
          <div class="admin-actions">
            <button class="admin-reset" data-admin-reset-user="${user.id}">PW変更</button>
            <button class="admin-delete" data-admin-delete-user="${user.id}">削除</button>
          </div>
        </div>
        <div class="admin-card-meta">
          <span>${new Date(user.created_at).toLocaleString('ja-JP')}</span>
        </div>
      </div>`).join('') || '<div class="empty-state">該当するユーザーがいません</div>';
  } catch (e) {
    $('adminBody').innerHTML = `<div class="empty-state">取得失敗: ${esc(e.message)}</div>`;
  }
}

function openAdminSongForm(song = null) {
  adminEditingSongId = song?.id || null;
  $('adminSongFormTitle').textContent = song ? '曲マスター編集' : '曲マスター追加';
  $('adminFormTitle').value = song?.title || '';
  $('adminFormPart').value = song?.part || 'MAS-G';
  $('adminFormLevel').value = song ? formatLevel(song.level) : '';
  $('adminFormHot').checked = Boolean(song?.is_hot);
  $('adminSongFormMask').style.display = 'flex';
}

function closeAdminSongForm() {
  $('adminSongFormMask').style.display = 'none';
  adminEditingSongId = null;
}

async function submitAdminSong() {
  await saveMasterSong({
    id: adminEditingSongId,
    isHot: $('adminFormHot').checked,
    title: $('adminFormTitle').value,
    part: $('adminFormPart').value,
    level: $('adminFormLevel').value
  });
  closeAdminSongForm();
  await loadAdminSongs();
}

function openAdminPassword(userId) {
  const user = adminUsers.find(u => u.id === userId);
  if (!user) return;
  adminPasswordUserId = userId;
  $('adminPasswordUsername').textContent = user.username;
  $('adminPasswordValue').value = '';
  $('adminPasswordMask').style.display = 'flex';
}

function closeAdminPassword() {
  $('adminPasswordMask').style.display = 'none';
  adminPasswordUserId = null;
}

async function submitAdminPassword() {
  const password = $('adminPasswordValue').value;
  if (password.length < 8) throw new Error('パスワードは8文字以上にしてください。');
  await accountAdmin('set_password', { target_user_id: adminPasswordUserId, password });
  closeAdminPassword();
  alert('パスワードを変更しました。');
}

/* ---------- イベント ---------- */
$('authForm').addEventListener('submit', async e => {
  e.preventDefault();

  const mode = currentAuthMode;
  const username = $('authUsername').value.trim();
  const password = $('authPassword').value;
  const button = $('authSubmit');
  const defaultText = mode === 'register' ? '登録する' : 'ログイン';

  try {
    button.disabled = true;
    button.textContent = '確認中...';

    if (mode === 'register') {
      if (!validateUsername(username)) {
        throw new Error('アカウント名は1〜32文字で入力してください。日本語も使用できます。');
      }
      if (password.length < 8) throw new Error('パスワードは8文字以上で設定してください。');
      if (password !== $('authPasswordConfirm').value) {
        throw new Error('確認用パスワードが一致していません。');
      }

      // RLSにより未ログイン時のprofiles直接検索には依存しない。
      // 重複はSupabase Auth側の結果でも判定する。
      const captchaToken = await getAuthCaptchaToken();
      button.textContent = '登録中...';
      const result = await register(username, password, captchaToken);

      if (result.user && !result.session) {
        throw new Error('Supabase側でメール確認が有効です。Confirm email をOFFにしてください。');
      }
      if (result.session) await showApp(result.session);
    } else {
      button.textContent = 'ログイン中...';
      await login(username, password, getAuthCaptchaToken, resetAuthCaptcha);
    }
  } catch (e) {
    const message = e?.message || String(e);
    const lower = message.toLowerCase();

    if (
      message.includes('User already registered') ||
      message.includes('already registered') ||
      message.includes('already been registered') ||
      message.includes('既に登録されています') ||
      message.includes('すでに登録されています')
    ) {
      await showSiteDialog(
        'そのアカウント名は既に登録されています。',
        '新規登録できません'
      );
    } else if (lower.includes('captcha') || message.includes('セキュリティ確認')) {
      await showSiteDialog(
        'セキュリティ確認に失敗しました。ページを再読み込みするか、しばらくして再度お試しください。',
        'セキュリティ確認エラー'
      );
    } else {
      await showSiteDialog(
        mode === 'register'
          ? '新規登録に失敗しました。入力内容を確認して再度お試しください。'
          : 'ログインに失敗しました。アカウント名またはパスワードを確認してください。',
        'エラー'
      );
      console.error(
        mode === 'register' ? '新規登録エラー:' : 'ログインエラー:',
        e
      );
    }

    // 失敗後は使い回さず、新しいTurnstileトークンを取得する。
    try { await resetAuthCaptcha(); } catch (captchaResetError) { console.error(captchaResetError); }
  } finally {
    button.disabled = false;
    if (!$('authScreen').classList.contains('hidden')) {
      button.textContent = defaultText;
    }
  }
});

$('authSwitch').addEventListener('click', () => showAuth($('authSwitch').dataset.mode));

document.querySelectorAll('.p-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

$('domSearch').addEventListener('input', renderManage);
$('recordTypeFilter').addEventListener('change', renderManage);
$('recordFcFilter').addEventListener('change', renderManage);

$('btnOpenLevelCorrection').addEventListener('click', () => {
  $('correctionLevel').value = selectedSong ? formatLevel(selectedSong.level) : '';
  $('levelCorrectionForm').classList.toggle('hidden');
});

$('btnSendLevelCorrection').addEventListener('click', async () => {
  const button = $('btnSendLevelCorrection');
  if (!selectedSong?.id) {
    await showSiteDialog('対象譜面を取得できません。', 'エラー');
    return;
  }

  const proposedLevel = $('correctionLevel').value;
  if (!proposedLevel) {
    await showSiteDialog('正しい難易度を入力してください。', '入力エラー');
    return;
  }

  const original = button.textContent;
  try {
    button.disabled = true;
    button.textContent = '送信中';
    await requestSongLevelCorrection({
      songId: selectedSong.id,
      proposedLevel
    });
    hide('levelCorrectionForm');
    await showSiteDialog('難易度修正依頼を送信しました。', '送信完了');
  } catch (e) {
    await showSiteDialog(e.message || '難易度修正依頼の送信に失敗しました。', 'エラー');
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
});
$('btnHeaderAdd').addEventListener('click', () => openScoreModal());
$('formTitle').addEventListener('input', suggestSongs);
$('partSelect').addEventListener('change', refreshSelectedPart);
$('formLevel').addEventListener('input', updateSkillPreview);
$('formRate').addEventListener('input', updateSkillPreview);
$('btnSubmitForm').addEventListener('click', async () => {
  const button = $('btnSubmitForm');
  const originalText = button.textContent;

  try {
    button.disabled = true;
    button.textContent = '保存中';

    await submitScore();
  } catch (e) {
    alert('保存に失敗しました: ' + e.message);
  } finally {
    button.disabled = false;

    // モーダルがまだ開いている場合だけ元の表示へ戻す
    if ($('domModal').style.display !== 'none') {
      if (selectedSong) {
        button.textContent = '保存する';
      } else {
        button.textContent = originalText.includes('登録依頼')
          ? '登録依頼して保存'
          : '保存する';
      }
    }
  }
});
$('btnCancelForm').addEventListener('click', closeModal);

$('headerUsername').addEventListener('click', openMyPage);
$('btnCloseMypage').addEventListener('click', closeMyPage);
$('btnDeleteAccount').addEventListener('click', deleteOwnAccount);
$('btnChangeUsername').addEventListener('click', async () => {
  const button = $('btnChangeUsername');
  const originalText = button.textContent;

  try {
    button.disabled = true;
    button.textContent = '変更中';

    await changeOwnUsername();
  } catch (e) {
    const message = e?.message || String(e);

    if (
      message.includes('既に登録されています') ||
      message.includes('すでに使用されています') ||
      message.includes('already') ||
      message.includes('duplicate')
    ) {
      await showSiteDialog(
        'そのアカウント名は既に登録されています。',
        'アカウント名を変更できません'
      );
    } else {
      await showSiteDialog('アカウント名の変更に失敗しました。', 'エラー');
      console.error('アカウント名変更エラー:', e);
    }
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
});

$('btnLogout').addEventListener('click', async () => {
  try {
    closeMyPage();
    scores = [];
    editingScoreId = null;
    selectedSong = null;
    await logout();
  } catch (e) {
    alert(e.message);
  }
});

$('btnChangePassword').addEventListener('click', async () => {
  const button = $('btnChangePassword');
  const originalText = button.textContent;

  try {
    const password = $('newPassword').value;

    if (password.length < 8) {
      throw new Error('パスワードは8文字以上で入力してください。');
    }

    button.disabled = true;
    button.textContent = '変更中';

    await changePassword(password);
    $('newPassword').value = '';

    await showSiteDialog('パスワードを変更しました。', '変更完了');
  } catch (e) {
    await showSiteDialog(e.message || 'パスワード変更に失敗しました。', 'エラー');
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
});

$('btnAdmin').addEventListener('click', openAdmin);
$('btnCloseAdmin').addEventListener('click', closeAdmin);

document.querySelectorAll('.admin-tab').forEach(btn => {
  btn.addEventListener('click', () => switchAdminTab(btn.dataset.adminTab));
});

let adminSongSearchTimer = null;
$('adminSongSearch').addEventListener('input', () => {
  clearTimeout(adminSongSearchTimer);
  adminSongSearchTimer = setTimeout(loadAdminSongs,250);
});
let adminRequestSearchTimer = null;
$('adminRequestSearch').addEventListener('input', () => {
  clearTimeout(adminRequestSearchTimer);
  adminRequestSearchTimer = setTimeout(loadAdminRequests,250);
});
let adminUserSearchTimer = null;
$('adminUserSearch').addEventListener('input', () => {
  clearTimeout(adminUserSearchTimer);
  adminUserSearchTimer = setTimeout(loadAdminUsers,250);
});

$('btnAdminAddSong').addEventListener('click', () => openAdminSongForm());
$('btnAdminCancelSong').addEventListener('click', closeAdminSongForm);
$('btnAdminSaveSong').addEventListener('click', async () => {
  try {
    $('btnAdminSaveSong').disabled = true;
    await submitAdminSong();
  } catch (e) {
    alert('保存に失敗しました: ' + e.message);
  } finally {
    $('btnAdminSaveSong').disabled = false;
  }
});

$('btnAdminPasswordCancel').addEventListener('click', closeAdminPassword);
$('btnAdminPasswordSave').addEventListener('click', async () => {
  try {
    $('btnAdminPasswordSave').disabled = true;
    await submitAdminPassword();
  } catch (e) {
    alert('変更に失敗しました: ' + e.message);
  } finally {
    $('btnAdminPasswordSave').disabled = false;
  }
});


let userSearchTimer = null;
$('userSearch').addEventListener('input', () => {
  clearTimeout(userSearchTimer);
  userSearchTimer = setTimeout(loadUsers, 250);
});

$('userSort').addEventListener('change', renderUsers);

$('btnCloseUserDetail').addEventListener('click', closeUserDetail);
$('btnCloseRateCompare').addEventListener('click', closeRateComparison);
$('rateCompareMask').addEventListener('click', e => {
  if (e.target === $('rateCompareMask')) closeRateComparison();
});

document.addEventListener('click', async e => {
  const suggestion = e.target.closest('.suggestion');
  const edit = e.target.closest('[data-edit]');
  const del = e.target.closest('[data-delete]');
  const adminEditSong = e.target.closest('[data-admin-edit-song]');
  const adminDeleteSong = e.target.closest('[data-admin-delete-song]');
  const adminDeleteUser = e.target.closest('[data-admin-delete-user]');
  const adminResetUser = e.target.closest('[data-admin-reset-user]');
  const adminApproveRequest = e.target.closest('[data-admin-approve-request]');
  const adminHotRequest = e.target.closest('[data-admin-hot-request]');
  const adminRejectRequest = e.target.closest('[data-admin-reject-request]');
  const userOpen = e.target.closest('[data-user-open]');
  const favoriteToggle = e.target.closest('[data-favorite-user]');
  const favoriteUp = e.target.closest('[data-favorite-up]');
  const favoriteDown = e.target.closest('[data-favorite-down]');
  const favoriteRemove = e.target.closest('[data-favorite-remove]');
  const compareCard = e.target.closest('[data-compare-song]');
  const adminSaveMasterRow = e.target.closest('[data-admin-save-master-row]');
  const adminDeleteMasterRow = e.target.closest('[data-admin-delete-master-row]');

  if (favoriteToggle) {
    e.preventDefault();
    e.stopPropagation();
    await toggleFavorite(favoriteToggle.dataset.favoriteUser);
    return;
  }

  if (userOpen && !favoriteToggle) {
    await openUserDetail(userOpen.dataset.userOpen, userOpen.dataset.userName);
    return;
  }

  if (favoriteUp) {
    await moveFavorite(favoriteUp.dataset.favoriteUp, -1);
    return;
  }

  if (favoriteDown) {
    await moveFavorite(favoriteDown.dataset.favoriteDown, 1);
    return;
  }

  if (favoriteRemove) {
    await removeFavorite(favoriteRemove.dataset.favoriteRemove);
    await Promise.all([loadFavorites(), loadUsers()]);
    return;
  }

  if (suggestion) {
    await selectSongTitle(suggestion.dataset.title);
  }

  if (compareCard && !edit && !del) {
    await openRateComparison(
      compareCard.dataset.compareSong,
      compareCard.dataset.compareTitle,
      compareCard.dataset.comparePart
    );
    return;
  }

  if (edit) {
    const score = scores.find(s => s.score_id === edit.dataset.edit);
    if (score) openScoreModal(score);
  }

  if (del) {
    if (!confirm('この登録データを削除しますか？')) return;
    try {
      await deleteScore(del.dataset.delete);
      await loadScores();
    } catch (e) {
      alert('削除に失敗しました: ' + e.message);
    }
  }

  if (adminSaveMasterRow) {
    const tr = adminSaveMasterRow.closest('tr[data-master-row]');
    if (!tr) return;

    const levels = {};
    MASTER_PARTS.forEach(part => {
      levels[part] = tr.querySelector(`[data-master-level="${part}"]`)?.value ?? '';
    });

    try {
      adminSaveMasterRow.disabled = true;
      await saveMasterSongRow({
        originalTitle: tr.dataset.originalTitle,
        title: tr.querySelector('[data-master-title]').value,
        isHot: tr.querySelector('[data-master-hot]').checked,
        levels
      });
      await loadAdminSongs();
    } catch (e) {
      alert('曲マスター保存に失敗しました: ' + e.message);
    } finally {
      adminSaveMasterRow.disabled = false;
    }
  }

  if (adminDeleteMasterRow) {
    const tr = adminDeleteMasterRow.closest('tr[data-master-row]');
    if (!tr) return;
    const title = tr.dataset.originalTitle;
    if (!confirm(`「${title}」の全Partを曲マスターから削除しますか？\n登録済みユーザー記録も影響を受けるため注意してください。`)) return;

    try {
      await deleteMasterSongTitle(title);
      await loadAdminSongs();
    } catch (e) {
      alert('曲マスター削除に失敗しました: ' + e.message);
    }
  }

  if (adminEditSong) {
    const song = adminSongs.find(s => s.id === adminEditSong.dataset.adminEditSong);
    if (song) openAdminSongForm(song);
  }

  if (adminDeleteSong) {
    const song = adminSongs.find(s => s.id === adminDeleteSong.dataset.adminDeleteSong);
    if (!song) return;
    if (!confirm(`「${song.title} / ${song.part}」を曲マスターから削除しますか？\nこの譜面を登録しているユーザーの記録も削除されます。`)) return;
    try {
      await deleteMasterSong(song.id);
      await loadAdminSongs();
    } catch (e) {
      alert('削除に失敗しました: ' + e.message);
    }
  }

  if (adminApproveRequest) {
    if (!confirm('この登録依頼をOTHERとして承認しますか？')) return;
    try {
      const requestId = adminApproveRequest.dataset.adminApproveRequest;
      const level = $(`requestLevel_${requestId}`).value;
      await approveSongRequest(requestId, level, false);
      await loadAdminRequests();
    } catch (e) {
      alert('承認に失敗しました: ' + e.message);
    }
  }

  if (adminHotRequest) {
    if (!confirm('この登録依頼をHOT曲として承認しますか？')) return;
    try {
      const requestId = adminHotRequest.dataset.adminHotRequest;
      const level = $(`requestLevel_${requestId}`).value;
      await approveSongRequest(requestId, level, true);
      await loadAdminRequests();
    } catch (e) {
      alert('HOT承認に失敗しました: ' + e.message);
    }
  }

  if (adminRejectRequest) {
    if (!confirm('この登録依頼を却下しますか？')) return;
    try {
      await rejectSongRequest(adminRejectRequest.dataset.adminRejectRequest);
      await loadAdminRequests();
    } catch (e) {
      alert('却下に失敗しました: ' + e.message);
    }
  }

  if (adminDeleteUser) {
    const user = adminUsers.find(u => u.id === adminDeleteUser.dataset.adminDeleteUser);
    if (!user) return;
    if (!confirm(`ユーザー「${user.username}」を削除しますか？\n登録スコアも削除され、元に戻せません。`)) return;
    try {
      await accountAdmin('delete_user', { target_user_id: user.id });
      await loadAdminUsers();
    } catch (e) {
      alert('ユーザー削除に失敗しました: ' + e.message);
    }
  }

  if (adminResetUser) {
    openAdminPassword(adminResetUser.dataset.adminResetUser);
  }
});


$('siteDialogOk').addEventListener('click', closeSiteDialog);
$('siteDialogMask').addEventListener('click', e => {
  if (e.target === $('siteDialogMask')) closeSiteDialog();
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !$('appScreen').classList.contains('hidden')) {
    loadScores().catch(console.error);
  }
});

window.addEventListener('focus', () => {
  if (!$('appScreen').classList.contains('hidden')) {
    loadScores().catch(console.error);
  }
});

init().catch(err => {
  console.error(err);
  alert('初期化に失敗しました: ' + err.message);
});
