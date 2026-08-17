import { supabase } from './supabase.js';
import {
  register, login, logout, changePassword, getSession,
  generateInitialPassword, validateUsername
} from './auth.js';
import { PARTS, searchSongs, getSongByTitleAndPart } from './songs.js';
import {
  calcSkill, formatLevel, formatRate, formatSkill,
  getMyScores, saveScore, deleteScore
} from './scores.js';

let activeTabName = 'SKILL';
let currentAuthMode = 'login';
let scores = [];
let editingScoreId = null;
let selectedSong = null;

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

  $('authPassword').required = isLogin;
  $('authPassword').disabled = !isLogin;
  $('authPassword').value = '';
  $('authPassword').placeholder = isLogin ? 'パスワードを入力' : '登録時に自動生成されます';
}

function showApp(session) {
  hide('authScreen');
  show('appScreen');
  $('headerUsername').textContent = session?.user?.user_metadata?.username || session?.user?.email?.split('@')[0] || '';
  loadScores();
}

async function init() {
  $('partSelect').innerHTML = PARTS.map(p => `<option value="${p}">${p}</option>`).join('');
  const session = await getSession();
  if (session) showApp(session);
  else showAuth('login');

  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) showApp(session);
    else showAuth('login');
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

function getFilteredScores() {
  const keyword = $('domSearch').value.trim().toLowerCase();
  return scores.filter(r => {
    if (activeTabName === 'HOT' && r.type !== 'HOT') return false;
    if (activeTabName === 'OTHER' && r.type !== 'OTHER') return false;
    if (keyword && !r.title.toLowerCase().includes(keyword)) return false;
    return true;
  });
}

function totals() {
  const hot = scores.filter(s => s.type === 'HOT').reduce((a, b) => a + Number(b.skill), 0);
  const other = scores.filter(s => s.type === 'OTHER').reduce((a, b) => a + Number(b.skill), 0);
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

function createCard(record, index, mode = 'MANAGE') {
  const skill = Number(record.skill);
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
        </div>
        <div class="sk-text-column">
          <div class="sk-title">${esc(record.title)}</div>
          <div class="sk-meta">
            <span class="sk-meta-lv">Lv: <strong>${formatLevel(record.level)}</strong></span>
            <span class="sk-meta-rate">Rate: <strong>${formatRate(record.achievement_rate)}%</strong></span>
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
          <div class="m-title-text">${esc(record.title)}</div>
          <div class="m-card-val-box ${boxColor}">${formatSkill(skill)}</div>
        </div>
        <div class="m-lower-row">
          <div class="m-flow-container">
            <span class="m-txt-lv">Lv <strong>${formatLevel(record.level)}</strong></span>
            <span class="m-txt-rate">Rate <strong>${formatRate(record.achievement_rate)}%</strong></span>
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
  const sorted = [...scores].sort((a, b) => Number(b.skill) - Number(a.skill));
  const hot = sorted.filter(s => s.type === 'HOT').slice(0, 25);
  const other = sorted.filter(s => s.type === 'OTHER').slice(0, 25);

  $('viewSkill').innerHTML = `
    <div class="sk-section"><h2>HOT Top25</h2><div class="list-container">
      ${hot.map((r, i) => createCard(r, i + 1, 'SKILL')).join('')}
    </div></div>
    <div class="sk-section"><h2>OTHER Top25</h2><div class="list-container">
      ${other.map((r, i) => createCard(r, i + 1, 'SKILL')).join('')}
    </div></div>`;
}

function renderManage() {
  const data = getFilteredScores().sort((a, b) => Number(b.skill) - Number(a.skill));
  const target = activeTabName === 'HOT' ? 'viewHotManage' :
                 activeTabName === 'OTHER' ? 'viewOtherManage' : 'viewAllManage';
  $(target).innerHTML = data.map((r, i) => createCard(r, i + 1)).join('');
}

function render() {
  const t = totals();
  $('txtHotTotal').textContent = formatSkill(t.hot);
  $('txtOtherTotal').textContent = formatSkill(t.other);
  $('txtGrandTotal').textContent = formatSkill(t.total);
  tintHeaderValues(t.hot, t.other, t.total);

  ['viewSkill','viewHotManage','viewOtherManage','viewAllManage'].forEach(id => hide(id));
  if (activeTabName === 'SKILL') { show('viewSkill'); renderSkill(); }
  else {
    show(activeTabName === 'HOT' ? 'viewHotManage' :
         activeTabName === 'OTHER' ? 'viewOtherManage' : 'viewAllManage');
    renderManage();
  }
}

function switchTab(tab) {
  activeTabName = tab;
  document.querySelectorAll('.p-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $('domSearch').value = '';
  $('searchArea').classList.toggle('hidden', tab === 'SKILL');
  $('btnHeaderAdd').classList.toggle('hidden', tab === 'ALL');
  window.scrollTo(0, 0);
  render();
}

function openScoreModal(score = null) {
  editingScoreId = score?.score_id || null;
  selectedSong = score ? { id: score.song_id, title: score.title, part: score.part, level: score.level } : null;
  $('domModalTitle').textContent = score ? '登録情報の編集' : '曲の新規追加';
  $('formTitle').value = score?.title || '';
  $('partSelect').value = score?.part || 'MAS-G';
  $('formRate').value = score ? formatRate(score.achievement_rate) : '';
  $('formLevel').value = score ? formatLevel(score.level) : '';
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
  if (!title) { $('songSuggestions').innerHTML = ''; return; }
  try {
    const rows = await searchSongs(title, part);
    $('songSuggestions').innerHTML = rows.map(r => `
      <button class="suggestion" data-song-id="${r.id}" data-title="${esc(r.title)}" data-part="${r.part}" data-level="${r.level}">
        ${esc(r.title)} <span>${r.part} / Lv ${formatLevel(r.level)}</span>
      </button>`).join('');
  } catch (e) {
    console.error(e);
  }
}

function selectSong(song) {
  selectedSong = song;
  $('formTitle').value = song.title;
  $('partSelect').value = song.part;
  $('formLevel').value = formatLevel(song.level);
  updateSkillPreview();
  $('songSuggestions').innerHTML = '';
}

function updateSkillPreview() {
  const level = Number($('formLevel').value);
  const rate = Number($('formRate').value);
  $('formSkill').textContent =
    Number.isFinite(level) && Number.isFinite(rate) ? formatSkill(calcSkill(level, rate)) : '-';
}

async function submitScore() {
  const title = $('formTitle').value.trim();
  const part = $('partSelect').value;
  const rate = $('formRate').value;

  if (!title) throw new Error('曲名を入力してください。');

  if (!selectedSong || selectedSong.title !== title || selectedSong.part !== part) {
    selectedSong = await getSongByTitleAndPart(title, part);
  }
  if (!selectedSong) throw new Error('曲名とパートに一致する曲データがありません。');

  await saveScore({
    scoreId: editingScoreId,
    songId: selectedSong.id,
    achievementRate: rate
  });

  closeModal();
  await loadScores();
}

async function openMyPage() {
  const { data } = await supabase.auth.getUser();
  $('mypageUsername').textContent = data.user?.user_metadata?.username || '';
  $('newPassword').value = '';
  $('mypageModal').style.display = 'flex';
}

function closeMyPage() { $('mypageModal').style.display = 'none'; }


let pendingCredentialUsername = '';
let pendingCredentialPassword = '';

function showCredentialModal(username, password) {
  pendingCredentialUsername = username;
  pendingCredentialPassword = password;

  $('credentialUsername').textContent = username;
  $('credentialPassword').value = password;
  $('copyStatus').textContent = '';
  $('credentialModal').style.display = 'flex';
}

function closeCredentialModalAndPrepareLogin() {
  $('credentialModal').style.display = 'none';
  showAuth('login');
  $('authUsername').value = pendingCredentialUsername;
  $('authPassword').value = pendingCredentialPassword;
}

async function copyInitialPassword() {
  const password = $('credentialPassword').value;
  try {
    await navigator.clipboard.writeText(password);
    $('copyStatus').textContent = 'コピーしました';
  } catch (_) {
    $('credentialPassword').focus();
    $('credentialPassword').select();
    document.execCommand('copy');
    $('copyStatus').textContent = 'コピーしました';
  }
}

$('authForm').addEventListener('submit', async e => {
  e.preventDefault();
  const mode = currentAuthMode;
  const username = $('authUsername').value.trim();
  try {
    $('authSubmit').disabled = true;
    if (mode === 'register') {
      if (!validateUsername(username)) throw new Error('登録名は半角英数字と _ を使用して3〜32文字で入力してください。');
      const password = generateInitialPassword();
      const result = await register(username, password);

      // Email confirmation must be disabled in Supabase for this username-only flow.
      if (result.user && !result.session) {
        throw new Error('Supabase側でメール確認が有効です。Authentication > Providers > Email の Confirm email をOFFにしてください。');
      }

      alert(`登録完了しました。\n\n登録名: ${username}\n初期パスワード: ${password}\n\nこのパスワードを保存してください。ログイン後、マイページから変更できます。`);
      $('authPassword').value = password;
      $('authSwitch').dataset.mode = 'login';
      $('authTitle').textContent = 'ログイン';
      $('authSubmit').textContent = 'ログイン';
      $('authSwitch').textContent = '新規登録はこちら';
    } else {
      await login(username, $('authPassword').value);
    }
  } catch (err) {
    alert(err.message || String(err));
  } finally {
    $('authSubmit').disabled = false;
  }
});


$('btnCopyPassword').addEventListener('click', copyInitialPassword);
$('btnUseCredentials').addEventListener('click', closeCredentialModalAndPrepareLogin);

$('authSwitch').addEventListener('click', () => {
  showAuth($('authSwitch').dataset.mode);
});

document.querySelectorAll('.p-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

$('domSearch').addEventListener('input', renderManage);
$('btnHeaderAdd').addEventListener('click', () => openScoreModal());
$('formTitle').addEventListener('input', suggestSongs);
$('partSelect').addEventListener('change', () => { selectedSong = null; suggestSongs(); });
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

document.addEventListener('click', async e => {
  const edit = e.target.closest('[data-edit]');
  const del = e.target.closest('[data-delete]');
  const suggestion = e.target.closest('.suggestion');

  if (suggestion) {
    selectSong({
      id: suggestion.dataset.songId,
      title: suggestion.dataset.title,
      part: suggestion.dataset.part,
      level: Number(suggestion.dataset.level)
    });
  }
  if (edit) {
    const score = scores.find(s => s.score_id === edit.dataset.edit);
    if (score) openScoreModal(score);
  }
  if (del) {
    if (!confirm('このデータを削除しますか？')) return;
    try {
      await deleteScore(del.dataset.delete);
      await loadScores();
    } catch (err) {
      alert('削除に失敗しました: ' + err.message);
    }
  }
});

$('headerUsername').addEventListener('click', openMyPage);
$('btnLogout').addEventListener('click', async () => {
  try { await logout(); } catch (e) { alert(e.message); }
});
$('btnCloseMypage').addEventListener('click', closeMyPage);
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

init().catch(err => {
  console.error(err);
  alert('初期化に失敗しました: ' + err.message);
});
