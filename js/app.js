import { supabase } from './supabase.js';
import { register, login, logout, changePassword, getSession, validateUsername } from './auth.js';
import { PARTS, searchSongs, getSongByTitleAndPart } from './songs.js';
import { calcSkill, formatLevel, formatRate, formatSkill, getMyScores, saveScore, deleteScore } from './scores.js';
import { isAdmin, getAdminSongs, saveMasterSong, deleteMasterSong, getAdminUsers, accountAdmin } from './admin.js';

let activeTabName = 'SKILL';
let currentAuthMode = 'login';
let scores = [];
let editingScoreId = null;
let selectedSong = null;

let adminEnabled = false;
let adminTab = 'songs';
let adminSongs = [];
let adminUsers = [];
let adminEditingSongId = null;
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
}

async function showApp(session) {
  hide('authScreen');
  show('appScreen');
  $('headerUsername').textContent =
    session?.user?.user_metadata?.username ||
    session?.user?.email?.split('@')[0] || '';

  await Promise.all([loadScores(), checkAdminAccess()]);
}

async function init() {
  $('partSelect').innerHTML = PARTS.map(p => `<option value="${p}">${p}</option>`).join('');
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

function totals() {
  const hotTop25 = scores
    .filter(s => s.is_hot)
    .sort((a,b) => Number(b.skill) - Number(a.skill))
    .slice(0,25);

  const otherTop25 = scores
    .filter(s => !s.is_hot)
    .sort((a,b) => Number(b.skill) - Number(a.skill))
    .slice(0,25);

  const hot = hotTop25.reduce((sum, s) => sum + Number(s.skill), 0);
  const other = otherTop25.reduce((sum, s) => sum + Number(s.skill), 0);
  return { hot, other, total: hot + other };
}

function tintHeaderValues(hot, other, total) {
  const update = (id, value, rainbow, gold) => {
    const el = $(id);
    el.className = 'score-val';
    if (value >= rainbow) el.classList.add('m-rainbow-text');
    else if (value >= gold) el.classList.add('m-gold-text');
  };
  update('txtHotTotal', hot, 4250, 4000);
  update('txtOtherTotal', other, 4250, 4000);
  update('txtGrandTotal', total, 8500, 8000);
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

  let boxColor = '';
  if (skill >= 180) boxColor = 'm-box-deep-rainbow';
  else if (skill >= 170) boxColor = 'm-box-rainbow';
  else if (skill >= 160) boxColor = 'm-box-gold';

  if (mode === 'SKILL') {
    let rowColor = '';
    if (skill >= 180) rowColor = 'row-deep-rainbow';
    else if (skill >= 170) rowColor = 'row-rainbow';
    else if (skill >= 160) rowColor = 'row-gold';

    return `
      <div class="sk-row ${rowColor}">
        <span class="sk-rank">#${index}</span>
        <div class="sk-badge-column">
          <div class="part-zone"><span class="p-badge ${getPartColorClass(record.part)}">${esc(record.part)}</span></div>
          <div class="fc-zone">${fcBadge}</div>
        </div>
        <div class="sk-text-column">
          <div class="sk-title">${hotTag} ${esc(record.title)}</div>
          <div class="sk-meta">
            <span class="sk-meta-lv">Lv: <strong>${formatLevel(record.level)}</strong></span>
            <span class="sk-meta-rate">Rate: <strong>${formatRate(record.achievement_rate)}%</strong></span>
            <span class="opt-slot">${optionBadge}</span>
          </div>
        </div>
        <div class="sk-val-box">${formatSkill(skill)}</div>
      </div>`;
  }

  return `
    <div class="m-card">
      <span class="sk-rank">#${index}</span>
      <div class="m-main-area">
        <div class="m-upper-row">
          <div class="part-zone"><span class="p-badge ${getPartColorClass(record.part)}">${esc(record.part)}</span></div>
          <div class="m-title-text">${hotTag} ${esc(record.title)}</div>
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
  const sorted = [...scores].sort((a,b) => Number(b.skill) - Number(a.skill));
  const hot = sorted.filter(s => s.is_hot).slice(0,25);
  const other = sorted.filter(s => !s.is_hot).slice(0,25);

  $('viewSkill').innerHTML = `
    <div class="sk-section"><h2>HOT Top25</h2><div class="list-container">
      ${hot.map((r,i) => createCard(r,i+1,'SKILL')).join('') || '<div class="empty-state">まだ登録がありません</div>'}
    </div></div>
    <div class="sk-section"><h2>OTHER Top25</h2><div class="list-container">
      ${other.map((r,i) => createCard(r,i+1,'SKILL')).join('') || '<div class="empty-state">まだ登録がありません</div>'}
    </div></div>`;
}

function renderManage() {
  const keyword = $('domSearch').value.trim().toLowerCase();
  const data = scores
    .filter(r => !keyword || r.title.toLowerCase().includes(keyword))
    .sort((a,b) => Number(b.skill) - Number(a.skill));

  $('viewAllManage').innerHTML =
    data.map((r,i) => createCard(r,i+1)).join('') ||
    '<div class="empty-state">登録データがありません</div>';
}

function render() {
  const t = totals();
  $('txtHotTotal').textContent = formatSkill(t.hot);
  $('txtOtherTotal').textContent = formatSkill(t.other);
  $('txtGrandTotal').textContent = formatSkill(t.total);
  tintHeaderValues(t.hot,t.other,t.total);

  hide('viewSkill');
  hide('viewAllManage');

  if (activeTabName === 'SKILL') {
    show('viewSkill');
    renderSkill();
  } else {
    show('viewAllManage');
    renderManage();
  }
}

function switchTab(tab) {
  activeTabName = tab;
  document.querySelectorAll('.p-tab-btn').forEach(
    b => b.classList.toggle('active', b.dataset.tab === tab)
  );
  $('domSearch').value = '';
  $('searchArea').classList.toggle('hidden', tab === 'SKILL');
  window.scrollTo(0,0);
  render();
}

function openScoreModal(score = null) {
  editingScoreId = score?.score_id || null;
  selectedSong = score ? {
    id: score.song_id,
    title: score.title,
    part: score.part,
    level: score.level,
    is_hot: score.is_hot
  } : null;

  $('domModalTitle').textContent = score ? '登録情報の編集' : 'スコア登録';
  $('formTitle').value = score?.title || '';
  $('partSelect').value = score?.part || 'EXT-G';
  $('formLevel').value = score ? formatLevel(score.level) : '';
  $('formRate').value = score ? formatRate(score.achievement_rate) : '';
  $('formFc').value = score?.fc || '';
  $('formOption').value = score?.play_option || 'NORMAL';
  $('formSkill').textContent = score ? formatSkill(score.skill) : '-';
  $('songSuggestions').innerHTML = '';
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
  const part = $('partSelect').value;

  selectedSong = null;
  $('formLevel').value = '';
  updateSkillPreview();

  if (!title) {
    $('songSuggestions').innerHTML = '';
    return;
  }

  try {
    const rows = await searchSongs(title,part);
    $('songSuggestions').innerHTML = rows.map(r => `
      <button class="suggestion"
        data-song-id="${r.id}"
        data-title="${esc(r.title)}"
        data-part="${r.part}"
        data-level="${r.level}"
        data-is-hot="${r.is_hot ? '1':'0'}">
        <span>${r.is_hot ? '[HOT] ' : ''}${esc(r.title)}</span>
        <span>${r.part} / Lv ${formatLevel(r.level)}</span>
      </button>`).join('') || '<div class="empty-state">該当する譜面がありません</div>';
  } catch (e) {
    console.error(e);
  }
}

function selectSong(song) {
  selectedSong = song;
  $('formTitle').value = song.title;
  $('partSelect').value = song.part;
  $('formLevel').value = formatLevel(song.level);
  $('songSuggestions').innerHTML = '';
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
    selectedSong = await getSongByTitleAndPart(title,part);
  }

  if (!selectedSong) {
    throw new Error('曲名とPartに一致する曲マスターがありません。候補から曲を選択してください。');
  }

  await saveScore({
    scoreId: editingScoreId,
    songId: selectedSong.id,
    achievementRate: rate,
    fc: $('formFc').value,
    playOption: $('formOption').value
  });

  closeModal();
  await loadScores();
}

/* ---------- マイページ ---------- */
async function openMyPage() {
  const { data } = await supabase.auth.getUser();
  $('mypageUsername').textContent = data.user?.user_metadata?.username || '';
  $('newPassword').value = '';
  $('mypageModal').style.display = 'flex';
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
  $('adminUserToolbar').classList.toggle('hidden', tab !== 'users');

  if (tab === 'songs') await loadAdminSongs();
  else await loadAdminUsers();
}

async function loadAdminSongs() {
  $('adminBody').innerHTML = '<div class="empty-state">読み込み中...</div>';
  try {
    adminSongs = await getAdminSongs($('adminSongSearch').value);
    $('adminBody').innerHTML = adminSongs.map(song => `
      <div class="admin-card">
        <div class="admin-card-top">
          ${song.is_hot ? '<span class="hot-tag">HOT</span>' : ''}
          <div class="admin-card-title">${esc(song.title)}</div>
          <div class="admin-actions">
            <button class="admin-edit" data-admin-edit-song="${song.id}">編集</button>
            <button class="admin-delete" data-admin-delete-song="${song.id}">削除</button>
          </div>
        </div>
        <div class="admin-card-meta">
          <span>${song.part}</span>
          <span>Lv ${formatLevel(song.level)}</span>
        </div>
      </div>`).join('') || '<div class="empty-state">該当する曲がありません</div>';
  } catch (e) {
    $('adminBody').innerHTML = `<div class="empty-state">取得失敗: ${esc(e.message)}</div>`;
  }
}

async function loadAdminUsers() {
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
  $('adminFormPart').value = song?.part || 'EXT-G';
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

  try {
    $('authSubmit').disabled = true;

    if (mode === 'register') {
      if (!validateUsername(username)) {
        throw new Error('登録名は半角英数字と _ を使用して3〜32文字で入力してください。');
      }
      if (password.length < 8) throw new Error('パスワードは8文字以上で設定してください。');
      if (password !== $('authPasswordConfirm').value) {
        throw new Error('確認用パスワードが一致していません。');
      }

      const result = await register(username,password);
      if (result.user && !result.session) {
        throw new Error('Supabase側でメール確認が有効です。Confirm email をOFFにしてください。');
      }
      if (result.session) await showApp(result.session);
    } else {
      await login(username,password);
    }
  } catch (e) {
    alert(e.message || String(e));
  } finally {
    $('authSubmit').disabled = false;
  }
});

$('authSwitch').addEventListener('click', () => showAuth($('authSwitch').dataset.mode));

document.querySelectorAll('.p-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

$('domSearch').addEventListener('input', renderManage);
$('btnHeaderAdd').addEventListener('click', () => openScoreModal());
$('formTitle').addEventListener('input', suggestSongs);
$('partSelect').addEventListener('change', suggestSongs);
$('formRate').addEventListener('input', updateSkillPreview);
$('btnSubmitForm').addEventListener('click', async () => {
  try {
    $('btnSubmitForm').disabled = true;
    await submitScore();
  } catch (e) {
    alert('保存に失敗しました: ' + e.message);
  } finally {
    $('btnSubmitForm').disabled = false;
  }
});
$('btnCancelForm').addEventListener('click', closeModal);

$('headerUsername').addEventListener('click', openMyPage);
$('btnCloseMypage').addEventListener('click', closeMyPage);
$('btnDeleteAccount').addEventListener('click', deleteOwnAccount);

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
  const password = $('newPassword').value;
  if (password.length < 8) return alert('パスワードは8文字以上にしてください。');
  try {
    await changePassword(password);
    alert('パスワードを変更しました。');
    closeMyPage();
  } catch (e) {
    alert('変更に失敗しました: ' + e.message);
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

document.addEventListener('click', async e => {
  const suggestion = e.target.closest('.suggestion');
  const edit = e.target.closest('[data-edit]');
  const del = e.target.closest('[data-delete]');
  const adminEditSong = e.target.closest('[data-admin-edit-song]');
  const adminDeleteSong = e.target.closest('[data-admin-delete-song]');
  const adminDeleteUser = e.target.closest('[data-admin-delete-user]');
  const adminResetUser = e.target.closest('[data-admin-reset-user]');

  if (suggestion) {
    selectSong({
      id: suggestion.dataset.songId,
      title: suggestion.dataset.title,
      part: suggestion.dataset.part,
      level: Number(suggestion.dataset.level),
      is_hot: suggestion.dataset.isHot === '1'
    });
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

init().catch(err => {
  console.error(err);
  alert('初期化に失敗しました: ' + err.message);
});
