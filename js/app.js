
/* === v21 FIX28: SINGLE SOURCE OF TRUTH / SKILL COLOR TABLE ===
   サイト表示・ユーザーリスト・共有画像は、すべてこのテーブルを参照する。
   配色を変更するときは原則ここだけ変更する。
*/
const SKILL_COLOR_TABLE = Object.freeze([
  { min: 9000, rank: 'deep-rainbow', type: 'gradient', direction: '90deg',
    stops: [['#e60000',0],['#f05a00',14.2857],['#e6b800',28.5714],['#12a936',42.8571],['#00aeb5',57.1429],['#1559e6',71.4286],['#681fd1',85.7143],['#bf16ad',100]] },
  { min: 8500, rank: 'rainbow', type: 'gradient', direction: '90deg',
    stops: [['#ff8787',0],['#ffad6f',14.2857],['#f0d967',28.5714],['#7bd889',42.8571],['#6fd3d0',57.1429],['#7ca9f5',71.4286],['#aa88eb',85.7143],['#df82d4',100]] },
  { min: 8000, rank: 'gold', type: 'gradient', direction: '180deg',
    stops: [['#d89a00',0],['#ffd83d',58],['#ffffff',100]] },
  { min: 7500, rank: 'silver', type: 'gradient', direction: '180deg',
    stops: [['#8e99a5',0],['#d8dde3',58],['#ffffff',100]] },
  { min: 7000, rank: 'bronze', type: 'gradient', direction: '180deg',
    stops: [['#7d3f20',0],['#c77b45',52],['#ffffff',100]] },
  { min: 6500, rank: 'red-grad', type: 'gradient', direction: '180deg',
    stops: [['#c70023',0],['#ff4d68',58],['#ffffff',100]] },
  { min: 6000, rank: 'red', type: 'solid', color: '#ff1638' },
  { min: 5500, rank: 'purple-grad', type: 'gradient', direction: '180deg',
    stops: [['#a400d2',0],['#ea5cff',58],['#ffffff',100]] },
  { min: 5000, rank: 'purple', type: 'solid', color: '#e02cff' },
  { min: 4500, rank: 'blue-grad', type: 'gradient', direction: '180deg',
    stops: [['#0966d9',0],['#53adff',58],['#ffffff',100]] },
  { min: 4000, rank: 'blue', type: 'solid', color: '#2f91ff' },
  { min: 3500, rank: 'green-grad', type: 'gradient', direction: '180deg',
    stops: [['#0c9f2b',0],['#44e45b',55],['#ffffff',100]] },
  { min: 3000, rank: 'green', type: 'solid', color: '#22d13b' },
  { min: 2500, rank: 'yellow-grad', type: 'gradient', direction: '180deg',
    stops: [['#f5c400',0],['#ffe94d',55],['#ffffff',100]] },
  { min: 2000, rank: 'yellow', type: 'solid', color: '#ffe600' },
  { min: 1500, rank: 'orange-grad', type: 'gradient', direction: '180deg',
    stops: [['#ff5a00',0],['#ff9b43',58],['#ffffff',100]] },
  { min: 1000, rank: 'orange', type: 'solid', color: '#ff7a22' },
  { min: 0, rank: 'white', type: 'solid', color: '#ffffff' }
]);

const SKILL_COLOR_BY_RANK = Object.freeze(
  Object.fromEntries(SKILL_COLOR_TABLE.map(row => [row.rank, row]))
);

function getSkillColorRowByTotalValue(totalValue) {
  const value = Number(totalValue) || 0;
  return SKILL_COLOR_TABLE.find(row => value >= row.min) || SKILL_COLOR_TABLE[SKILL_COLOR_TABLE.length - 1];
}

function skillColorCss(row) {
  if (!row) return '#ffffff';
  if (row.type === 'solid') return row.color;
  return `linear-gradient(${row.direction || '90deg'}, ${row.stops.map(([color,pos]) => `${color} ${pos}%`).join(', ')})`;
}

function skillColorVerticalCss(row) {
  if (!row) return '#ffffff';

  // 単色ランクは完全な単色。
  // TOTAL / HOT / OTHER / ユーザーリスト / ライバル管理など、
  // score-rank-* を使う表示はすべて同じ単色になる。
  if (row.type === 'solid') {
    return row.color;
  }

  // RAINBOW文字だけは、CSSのline-box内で文字そのものが占める高さが狭いため、
  // 0～100%をそのまま使うと中央の緑～青付近しか見えない。
  // 色・順番は左右帯と完全に同じまま、停止位置だけ12～88%へ圧縮して
  // 赤～紫まで文字の中に見えるようにする。
  if (row.rank === 'rainbow' || row.rank === 'deep-rainbow') {
    const stops = row.stops.map(([color,pos]) => {
      const mapped = 12 + (Number(pos) / 100) * 76;
      return `${color} ${mapped}%`;
    });
    return `linear-gradient(180deg, ${stops.join(', ')})`;
  }

  // グラデーションランクだけ0%=上、100%=下。
  return `linear-gradient(180deg, ${row.stops.map(([color,pos]) => `${color} ${pos}%`).join(', ')})`;
}

function installSkillColorCss() {
  const old = document.getElementById('skill-color-table-style');
  if (old) old.remove();

  const style = document.createElement('style');
  style.id = 'skill-color-table-style';

  style.textContent = SKILL_COLOR_TABLE.map(row => {
    const paint = row.type === 'solid' ? row.color : skillColorCss(row);

    // TOTAL / HOT / OTHER / ユーザーリスト等の文字色
    const textPaint = skillColorVerticalCss(row);
    const textRule = row.type === 'solid'
      ? `.score-rank-${row.rank}{background:none!important;-webkit-background-clip:border-box!important;background-clip:border-box!important;-webkit-text-fill-color:${row.color}!important;color:${row.color}!important;filter:none!important;}`
      : `.score-rank-${row.rank}{background:${textPaint}!important;-webkit-background-clip:text!important;background-clip:text!important;-webkit-text-fill-color:transparent!important;color:transparent!important;filter:none!important;}`;

    // 曲別Skillは数字を白で固定し、左右の帯だけをスキルカラーにする。
    // 左右帯は「上→下」の縦グラデーションに統一する。
    // 配色そのものは同じSKILL_COLOR_TABLEを参照。
    // background-position / background-size を使うため、単色もgradient image化する。
    // これで WHITE / ORANGE / YELLOW / GREEN / BLUE / PURPLE / RED など
    // 非グラデーション帯も、グラデーション帯と同じ左右カラー帯になる。
    const sidePaint = row.type === 'solid'
      ? `linear-gradient(180deg, ${row.color} 0%, ${row.color} 100%)`
      : skillColorVerticalCss(row);

    const songBoxRule =
      `.skill-box-${row.rank}{` +
      `background-image:${sidePaint},${sidePaint}!important;` +
      `background-position:left top,right top!important;` +
      `background-size:5px 100%,5px 100%!important;` +
      `background-repeat:no-repeat,no-repeat!important;` +
      `background-color:#101827!important;` +
      `color:#ffffff!important;-webkit-text-fill-color:#ffffff!important;` +
      `font-weight:900!important;` +
      `text-shadow:0 1px 2px rgba(0,0,0,.95)!important;` +
      `border-top:1px solid #334155!important;border-bottom:1px solid #334155!important;` +
      `border-left:0!important;border-right:0!important;` +
      `box-sizing:border-box!important;}` +
      `body.light-mode .skill-box-${row.rank}{` +
      `background-image:${sidePaint},${sidePaint}!important;` +
      `background-position:left top,right top!important;` +
      `background-size:5px 100%,5px 100%!important;` +
      `background-repeat:no-repeat,no-repeat!important;` +
      `background-color:#f3f4f6!important;` +
      `color:#ffffff!important;-webkit-text-fill-color:#ffffff!important;` +
      `-webkit-text-stroke:.45px #111827!important;` +
      `text-shadow:0 1px 2px rgba(0,0,0,.9)!important;` +
      `border-top:1px solid #cbd5e1!important;border-bottom:1px solid #cbd5e1!important;` +
      `border-left:0!important;border-right:0!important;` +
      `box-sizing:border-box!important;}`;

    // スキル対象・登録曲の「外枠だけ」は45度グラデーションにする。
    // スキル値の左右帯、ヘッダー、共有画像には sidePaint をそのまま使うため影響しない。
    const borderPaint = row.type === 'solid'
      ? row.color
      : `linear-gradient(170deg, ${row.stops.map(([color,pos]) => `${color} ${pos}%`).join(', ')})`;

    const cardBorderRule =
      `.m-card:has(.skill-box-${row.rank}),` +
      `.sk-row:has(.skill-box-${row.rank}){--song-skill-border:${borderPaint};}`;

    return textRule + songBoxRule + cardBorderRule;
  }).join('\n');

  document.head.appendChild(style);
}
installSkillColorCss();

function skillColorCanvasPaint(ctx, row, left, top, width, height) {
  if (!row) return '#ffffff';
  if (row.type === 'solid') return row.color;

  const horizontal = (row.direction || '90deg') === '90deg';
  const g = horizontal
    ? ctx.createLinearGradient(left, top, left + width, top)
    : ctx.createLinearGradient(left, top, left, top + height);

  row.stops.forEach(([color,pos]) => g.addColorStop(pos / 100, color));
  return g;
}

function skillColorCanvasVerticalPaint(ctx, row, left, top, width, height) {
  if (!row) return '#ffffff';

  const g = ctx.createLinearGradient(left, top, left, top + height);

  // 単色ランクも画面と同条件:
  // 上 = ランク色 / 下 = 白
  if (row.type === 'solid') {
    g.addColorStop(0, row.color);
    g.addColorStop(1, '#ffffff');
    return g;
  }

  row.stops.forEach(([color,pos]) => {
    g.addColorStop(Number(pos) / 100, color);
  });
  return g;
}
import { supabase } from './supabase.js?v=21_57';
import { register, login, logout, changePassword, getSession, validateUsername } from './auth.js?v=21_84';
import { initAuthCaptcha, prepareAuthCaptcha, getAuthCaptchaToken, resetAuthCaptcha } from './captcha.js?v=21_84';
import { PARTS, GF_PARTS, DM_PARTS, partsForInstrument, normalizeSongTitleForMatch, searchSongTitles, getSongByTitleAndPart, requestSongMaster, requestSongLevelCorrection } from './songs.js?v=21_116';
import { calcSkill, formatLevel, formatRate, formatSkill, getMyScores, saveScore, deleteScore } from './scores.js?v=21_110';
import { getGameVersions } from './versions.js?v=21_57';
const {
  isAdmin,
  getAdminSongs,
  getAdminSongMasterPage,
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
  'MAS-G','MAS-B','MAS-D','EXT-G','EXT-B','EXT-D','ADV-G','ADV-B','ADV-D','BSC-G','BSC-B','BSC-D'
];

const EAMUSEMENT_ORIGIN = 'https://p.eagate.573.jp';
function getEamusementSlug() {
  return activeVersion?.eamusement_slug || 'gitadora_galaxywave_delta';
}
function getEamusementSyncEntry() {
  return `https://p.eagate.573.jp/game/gfdm/${getEamusementSlug()}/p/playdata/skill.html?gtype=gf&stype=1`;
}
let skillSyncInProgress = false;

function setSkillSyncStatus(message, state = '') {
  const el = $('skillSyncStatus');
  if (!el) return;
  el.textContent = String(message || '');
  el.className = `skill-sync-status ${state}`.trim();
}

function buildSkillSyncBookmarklet() {
  // 同期本体は外部JS側。ブックマークレットは読み込みだけにして最短化する。
  return "javascript:void(!function(d){var s=d.createElement('script');s.src='https://gitadorafc.github.io/skillsimulator/js/eamusement-sync.js?t='+Date.now();d.head.appendChild(s)}(document))";
}

function captureSkillSyncHash() {
  if (!location.hash.startsWith('#skill-sync=')) return;
  try {
    const raw = decodeURIComponent(location.hash.slice('#skill-sync='.length));
    const payload = JSON.parse(raw);
    sessionStorage.setItem('gitadora_pending_skill_sync', JSON.stringify(payload));
  } catch (e) {
    console.error('skill sync hash parse error', e);
  } finally {
    history.replaceState(null, '', location.pathname + location.search);
  }
}

async function importSkillSyncRecords(payload) {
  if (skillSyncInProgress) return;

  const records = Array.isArray(payload?.records) ? payload.records : [];
  if (!records.length) {
    setSkillSyncStatus('同期データを取得できませんでした。e-amusementへのログイン状態を確認してください。', 'error');
    return;
  }

  const unique = new Map();
  for (const row of records) {
    const title = String(row?.title || '').trim();
    const part = String(row?.part || '');
    const rate = Number(row?.rate);
    const level = Number(row?.level);

    if (!title || !PARTS.includes(part)) continue;
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) continue;
    if (!Number.isFinite(level) || level <= 0 || level > 99.99) continue;

    unique.set(`${normalizeSongTitleForMatch(title)}\u0000${part}`, {
      title,
      part,
      rate: Math.floor((rate + Number.EPSILON) * 100) / 100,
      level: Math.floor((level + Number.EPSILON) * 100) / 100
    });
  }

  const rows = [...unique.values()];
  if (!rows.length) {
    setSkillSyncStatus('有効な同期データがありませんでした。', 'error');
    return;
  }

  skillSyncInProgress = true;
  $('skillSyncMask').style.display = 'flex';

  try {
    setSkillSyncStatus(`同期中… ${rows.length}件を一括処理しています`, 'running');

    // v20: 100件をブラウザから1件ずつ保存せず、DB側RPCで一括処理。
    // ネットワーク往復を大幅に減らし、FC/オプションは既存値を維持する。
    const { data, error } = await supabase.rpc('sync_skill_records', {
      p_records: rows,
      p_version_id: activeVersionId
    });

    if (error) throw error;

    const result = Array.isArray(data) ? data[0] : data;
    const saved = Number(result?.saved_count) || 0;
    const requested = Number(result?.requested_count) || 0;
    const skipped = Number(result?.skipped_count) || 0;

    await loadScores();

    const countText = payload?.counts
      ? `GF HOT ${payload.counts.GF_HOT ?? 0} / GF OTHER ${payload.counts.GF_OTHER ?? 0} / DM HOT ${payload.counts.DM_HOT ?? 0} / DM OTHER ${payload.counts.DM_OTHER ?? 0}`
      : `${rows.length}件`;

    setSkillSyncStatus(
      `同期完了\n取得: ${countText}\n登録・更新: ${saved}件　登録依頼: ${requested}件${skipped ? `　スキップ: ${skipped}件` : ''}`,
      'success'
    );
  } catch (e) {
    console.error(e);
    setSkillSyncStatus(`同期に失敗しました: ${e?.message || e}`, 'error');
  } finally {
    skillSyncInProgress = false;
  }
}

async function processPendingSkillSync() {
  const raw = sessionStorage.getItem('gitadora_pending_skill_sync');
  if (!raw) return;
  sessionStorage.removeItem('gitadora_pending_skill_sync');
  try {
    await importSkillSyncRecords(JSON.parse(raw));
  } catch (e) {
    console.error(e);
    setSkillSyncStatus(`同期に失敗しました: ${e?.message || e}`, 'error');
  }
}

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
      .eq('title', oldTitle)
      .eq('version_id', activeVersionId);

    if (renameError) throw renameError;
  }

  const { data: existing, error: existingError } = await supabase
    .from('songs')
    .select('id,part')
    .eq('title', cleanTitle)
    .eq('version_id', activeVersionId);

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
        version_id: activeVersionId,
        level: Math.round((level + Number.EPSILON) * 100) / 100
      }, {
        onConflict: 'version_id,title,part'
      });

    if (error) throw error;
  }

  // HOTは曲単位で統一
  const { error: hotError } = await supabase
    .from('songs')
    .update({ is_hot: Boolean(isHot) })
    .eq('title', cleanTitle)
    .eq('version_id', activeVersionId);

  if (hotError) throw hotError;
}

async function deleteMasterSongTitle(title) {
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) return;

  const { error } = await supabase
    .from('songs')
    .delete()
    .eq('title', cleanTitle)
    .eq('version_id', activeVersionId);

  if (error) throw error;
}

import * as adminApi from './admin.js?v=21_57';
import { listUserSummaries, getUserSkillTargets, getSongRateComparison, getSongPersonalBestHistory, getSongOptionDistribution, getMyFavorites, addFavorite, removeFavorite } from './users.js?v=3_4_5';

let activeInstrument = localStorage.getItem('gitadora_instrument') === 'DM' ? 'DM' : 'GF';
let userListSort = { key: activeInstrument === 'DM' ? 'dm' : 'gf', dir: 'desc' };
const USER_LIST_PAGE_SIZE = 30;
let userListPage = 0;
let activeTabName = 'SKILL';
let gameVersions = [];
let activeVersionId = localStorage.getItem('gitadora_version_id') || null;
let activeVersion = null;
let currentAuthMode = 'login';
let scores = [];
let editingScoreId = null;
let selectedSong = null;
let scoreModalScrollY = 0;

let adminEnabled = false;
let adminAccessChecked = false;
let primaryAdminEnabled = false;
let adminTab = 'songs';
let adminSongs = [];
let adminUsers = [];
let adminSongPage = 0;
const ADMIN_SONG_PAGE_SIZE = 100;
let adminRequests = [];
let adminFeedback = [];
let adminEditingSongId = null;
let adminNewSongRowVisible = false;
let publicUsers = [];
let favoriteUsers = { GF: [], DM: [] };
let viewedUserScores = [];
let currentUserId = null;
let viewedUserId = null;
let viewedUserName = '';
let viewedUserProfile = null;
let viewedUserRegisteredScores = [];
let adminPasswordUserId = null;

const $ = id => document.getElementById(id);

let globalModalScrollY = 0;
let globalModalScrollLocked = false;

const GLOBAL_SCROLL_LOCK_OVERLAYS = [
  '#menuMask',
  '#featureSettingsMask',
  '#feedbackMask',
  '#supportMask',
  '#howToMask',
  '#rivalManageMask',
  '#mypageModal',
  '#skillSyncMask',
  '#rateCompareMask',
  '#siteDialogMask',
  '#adminModal',
  '#adminSongFormMask',
  '#adminPasswordMask'
];

function isOverlayVisible(element) {
  if (!element) return false;
  const style = getComputedStyle(element);
  return style.display !== 'none' &&
         style.visibility !== 'hidden' &&
         style.opacity !== '0';
}

function hasVisibleGlobalOverlay() {
  return GLOBAL_SCROLL_LOCK_OVERLAYS.some(selector =>
    isOverlayVisible(document.querySelector(selector))
  );
}

function lockMainPageScroll() {
  // スコア登録モーダルは既存のiOS Safari専用ロック処理を使用する。
  if (document.body.classList.contains('score-modal-open')) return;
  if (globalModalScrollLocked) return;

  globalModalScrollY = window.scrollY || window.pageYOffset || 0;
  globalModalScrollLocked = true;

  document.body.classList.add('global-modal-scroll-lock');
  document.body.style.position = 'fixed';
  document.body.style.top = `-${globalModalScrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
}

function unlockMainPageScroll() {
  if (!globalModalScrollLocked) return;

  globalModalScrollLocked = false;
  document.body.classList.remove('global-modal-scroll-lock');

  // スコア登録モーダルが開いている場合は、そちらの固定を壊さない。
  if (document.body.classList.contains('score-modal-open')) return;

  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';

  window.scrollTo({ top: globalModalScrollY, left: 0, behavior: 'auto' });
}

function syncGlobalModalScrollLock() {
  if (hasVisibleGlobalOverlay()) {
    lockMainPageScroll();
  } else {
    unlockMainPageScroll();
  }
}


function syncAppStickyHeaderHeight() {
  const header = document.querySelector('.p-header');
  if (!header) return;
  const height = Math.ceil(header.getBoundingClientRect().height);
  document.documentElement.style.setProperty('--app-sticky-header-height', `${height}px`);
}

function scrollUserListPageToTop() {
  const sticky = document.querySelector('#viewUsers .user-list-sticky');
  const header = document.querySelector('.p-header');
  const firstRow = document.querySelector('#userList .user-list-row');
  if (!sticky || !header || !firstRow) return;

  const headerHeight = Math.ceil(header.getBoundingClientRect().height);
  const stickyHeight = Math.ceil(sticky.getBoundingClientRect().height);
  const stickyTopGap = 6;

  // 現在どこまでスクロールしていても、
  // 新しいページの1人目が「検索窓＋項目行」の直下に来るよう絶対位置で補正する。
  const desiredFirstRowTop = headerHeight + stickyTopGap + stickyHeight;
  const currentFirstRowTop = firstRow.getBoundingClientRect().top;
  const targetY = Math.max(
    0,
    window.scrollY + currentFirstRowTop - desiredFirstRowTop
  );

  window.scrollTo({ top: targetY, left: 0, behavior: 'auto' });

  // iPhone Safariでレイアウト確定が1フレーム遅れる場合の最終補正。
  requestAnimationFrame(() => {
    const correction = firstRow.getBoundingClientRect().top - desiredFirstRowTop;
    if (Math.abs(correction) > 1) {
      window.scrollTo({
        top: Math.max(0, window.scrollY + correction),
        left: 0,
        behavior: 'auto'
      });
    }
  });
}


const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));

function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }


function applyLightMode(enabled = null) {
  const isLight = enabled == null
    ? localStorage.getItem('gitadora_light_mode') === '1'
    : Boolean(enabled);

  document.body.classList.toggle('light-mode', isLight);
  return isLight;
}

async function getMyFeatureSettings() {
  const { data, error } = await supabase.rpc('get_my_feature_settings');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || {
    registration_public: false,
    x_public: false,
    x_id: null
  };
}

async function getUserPublicProfile(userId) {
  const { data, error } = await supabase.rpc('get_public_user_profile', {
    p_user_id: userId
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || {
    registration_public: false,
    x_public: false,
    x_id: null
  };
}

async function getPublicUserRegisteredScores(userId, instrument = activeInstrument, versionId = activeVersionId) {
  const { data, error } = await supabase.rpc('get_public_user_registered_scores', {
    p_user_id: userId,
    p_instrument: instrument,
    p_version_id: versionId
  });
  if (error) throw error;
  return data ?? [];
}

function normalizeXIdInput(value) {
  let text = String(value || '').trim();
  if (!text) return '';

  text = text.replace(/^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i, '');
  text = text.split(/[/?#]/)[0];
  text = text.replace(/^@+/, '').trim();

  if (!/^[A-Za-z0-9_]{1,15}$/.test(text)) {
    throw new Error('X IDは英数字と「_」のみ、15文字以内で入力してください。');
  }
  return text;
}

async function openFeatureSettings() {
  closeMenu();
  $('featureSettingsStatus').textContent = '';

  const lightInput = $('settingLightMode');
  lightInput.disabled = false;
  lightInput.checked = applyLightMode();

  const lightNote = $('settingLightModeNote');
  if (lightNote) {
    lightNote.textContent = '画面をライトテーマに切り替えます。';
  }

  try {
    const settings = await getMyFeatureSettings();
    $('settingRecordsPublic').checked = Boolean(settings.registration_public);
    $('settingXPublic').checked = Boolean(settings.x_public);
    $('featureSettingsMask').style.display = 'flex';
  } catch (e) {
    await showSiteDialog('機能設定の取得に失敗しました: ' + e.message, 'エラー');
  }
}

function closeFeatureSettings(returnToMenu = false) {
  $('featureSettingsMask').style.display = 'none';
  if (returnToMenu) openMenu();
}

async function saveFeatureSettings() {
  const button = $('btnSaveFeatureSettings');
  const original = button.textContent;
  try {
    button.disabled = true;
    button.textContent = '保存中';
    $('featureSettingsStatus').textContent = '';

    const light = $('settingLightMode').checked;
    localStorage.setItem('gitadora_light_mode', light ? '1' : '0');
    applyLightMode(light);

    const { error } = await supabase.rpc('set_my_feature_settings', {
      p_registration_public: $('settingRecordsPublic').checked,
      p_x_public: $('settingXPublic').checked
    });
    if (error) throw error;

    closeFeatureSettings();
    await showSiteDialog('機能設定を保存しました。', '保存完了');
  } catch (e) {
    $('featureSettingsStatus').textContent = '保存に失敗しました。';
    await showSiteDialog(e?.message || '機能設定の保存に失敗しました。', 'エラー');
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

async function saveMyXId() {
  const button = $('btnSaveXId');
  const original = button.textContent;

  try {
    const xId = normalizeXIdInput($('mypageXIdInput').value);
    button.disabled = true;
    button.textContent = '保存中';

    const { error } = await supabase.rpc('set_my_x_id', {
      p_x_id: xId || null
    });
    if (error) throw error;

    $('mypageXIdInput').value = xId;
    await showSiteDialog(
      xId ? 'X IDを保存しました。' : 'X IDを削除しました。',
      '保存完了'
    );
  } catch (e) {
    await showSiteDialog(e?.message || 'X IDの保存に失敗しました。', 'エラー');
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

async function showAuth(mode = 'login') {
  hide('introScreen');
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
  $('authRegisterNotice').classList.toggle('hidden', isLogin);

  // 認証画面を開くたびにTurnstileを1回だけ準備する。
  // prepareAuthCaptcha() 側が、既に描画済みなら reset を1回だけ実行する。
  // reset→prepare の二重resetはトークン競合の原因になるため行わない。
  try {
    await prepareAuthCaptcha();
  } catch (error) {
    console.error('Turnstile初期化エラー:', error);
  }
}

async function showApp(session) {
  hide('introScreen');
  hide('authScreen');
  show('appScreen');
  currentUserId = session?.user?.id || null;

  let username =
    session?.user?.user_metadata?.username ||
    session?.user?.email?.split('@')[0] || '';

  // ユーザー名変更後も常にprofiles側の最新値を表示
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
  await loadGameVersionOptions();
  await Promise.all([loadScores(), checkAdminAccess()]);
}


let siteDialogResolver = null;
let siteDialogConfirmMode = false;
let siteDialogPromptMode = false;

function showSiteDialog(message, title = 'お知らせ') {
  siteDialogConfirmMode = false;
  siteDialogPromptMode = false;
  $('siteDialogInput').classList.add('hidden');
  $('siteDialogInput').value = '';
  $('siteDialogTitle').textContent = title;
  $('siteDialogMessage').textContent = String(message || '');
  $('siteDialogOk').textContent = 'OK';
  $('siteDialogCancel').classList.add('hidden');
  $('siteDialogMask').style.display = 'flex';

  return new Promise(resolve => {
    siteDialogResolver = resolve;
  });
}

function showSiteConfirm(message, title = '確認', confirmText = '削除する') {
  siteDialogConfirmMode = true;
  siteDialogPromptMode = false;
  $('siteDialogInput').classList.add('hidden');
  $('siteDialogInput').value = '';
  $('siteDialogTitle').textContent = title;
  $('siteDialogMessage').textContent = String(message || '');
  $('siteDialogOk').textContent = confirmText;
  $('siteDialogCancel').classList.remove('hidden');
  $('siteDialogMask').style.display = 'flex';

  return new Promise(resolve => {
    siteDialogResolver = resolve;
  });
}

function showSitePrompt(message, title = '入力', confirmText = 'OK', placeholder = '') {
  siteDialogConfirmMode = true;
  siteDialogPromptMode = true;
  $('siteDialogTitle').textContent = title;
  $('siteDialogMessage').textContent = String(message || '');
  $('siteDialogInput').classList.remove('hidden');
  $('siteDialogInput').value = '';
  $('siteDialogInput').placeholder = placeholder;
  $('siteDialogOk').textContent = confirmText;
  $('siteDialogCancel').classList.remove('hidden');
  $('siteDialogMask').style.display = 'flex';

  setTimeout(() => $('siteDialogInput').focus(), 0);

  return new Promise(resolve => {
    siteDialogResolver = resolve;
  });
}

function closeSiteDialog(result = true) {
  const promptValue = siteDialogPromptMode ? $('siteDialogInput').value : result;
  $('siteDialogMask').style.display = 'none';
  $('siteDialogCancel').classList.add('hidden');
  $('siteDialogInput').classList.add('hidden');
  $('siteDialogInput').value = '';
  const resolve = siteDialogResolver;
  siteDialogResolver = null;
  const wasPrompt = siteDialogPromptMode;
  siteDialogConfirmMode = false;
  siteDialogPromptMode = false;
  if (resolve) resolve(wasPrompt ? (result ? promptValue : null) : result);
}


async function loadGameVersionOptions() {
  gameVersions = await getGameVersions();

  if (!gameVersions.length) {
    throw new Error('GITADORAバージョン情報がありません。');
  }

  const stored = gameVersions.find(v => v.id === activeVersionId);
  activeVersion = stored || gameVersions.find(v => v.is_current) || gameVersions[0];
  activeVersionId = activeVersion.id;
  localStorage.setItem('gitadora_version_id', activeVersionId);

  $('versionSelect').innerHTML = gameVersions
    .map(v => `<option value="${v.id}">${esc(v.name)}</option>`)
    .join('');
  $('versionSelect').value = activeVersionId;
}

async function switchGameVersion(versionId) {
  const next = gameVersions.find(v => v.id === versionId);
  if (!next || next.id === activeVersionId) return;

  activeVersion = next;
  activeVersionId = next.id;
  localStorage.setItem('gitadora_version_id', activeVersionId);

  selectedSong = null;
  editingScoreId = null;
  viewedUserScores = [];
  publicUsers = [];
  userListPage = 0;

  closeModal();
  closeRateComparison();
  closeUserDetail();

  await loadScores();
  if (activeTabName === 'USERS') await loadUsers({ resetPage: true });
  if (adminEnabled && adminTab === 'songs' && $('adminModal').style.display !== 'none') {
    adminSongPage = 0;
    await loadAdminSongs();
  }
}

function instrumentParts() { return partsForInstrument(activeInstrument); }
function isCurrentInstrumentPart(part) { return instrumentParts().includes(String(part || '')); }
function applyInstrumentUI() {
  document.querySelectorAll('[data-instrument]').forEach(b => b.classList.toggle('active', b.dataset.instrument === activeInstrument));
  $('partSelect').innerHTML = instrumentParts().map(p => `<option value="${p}">${p}</option>`).join('');
  if ($('instrumentLabel')) $('instrumentLabel').textContent = activeInstrument;

  document.body.classList.toggle('dm-mode', activeInstrument === 'DM');
  if (activeInstrument === 'DM' && $('formOption')) {
    $('formOption').value = 'NORMAL';
  }
}
async function switchInstrument(instrument) {
  if (!['GF','DM'].includes(instrument) || instrument === activeInstrument) return;
  activeInstrument = instrument;
  localStorage.setItem('gitadora_instrument', instrument);
  userListSort = { key: instrument === 'DM' ? 'dm' : 'gf', dir: 'desc' };
  userListPage = 0;
  selectedSong = null; editingScoreId = null; viewedUserScores = []; publicUsers = [];
  applyInstrumentUI();
  closeModal();
  render();
  if (activeTabName === 'USERS') await loadUsers({ resetPage: true });

  if (viewedUserId && $('userDetailPage').style.display !== 'none') {
    await openUserDetail(viewedUserId, viewedUserName);
  }
}

async function init() {
  captureSkillSyncHash();
  applyInstrumentUI();
  await initAuthCaptcha();
  const session = await getSession();
  if (session) {
    await showApp(session);
    await processPendingSkillSync();
  } else {
    hide('authScreen');
    hide('appScreen');
    show('introScreen');
  }

  supabase.auth.onAuthStateChange(async (event, session) => {
    // 初期表示は上の getSession() で処理済み。
    // TOKEN_REFRESHED / USER_UPDATED では画面全体を再読込しない。
    if (event === 'SIGNED_IN' && session) {
      await showApp(session);
      await processPendingSkillSync();
      return;
    }

    if (event === 'SIGNED_OUT' || !session) {
      adminEnabled = false;
      adminAccessChecked = false;
      document.body.classList.remove('light-mode');
      $('btnAdmin').classList.add('hidden');
      $('menuOfuseSupport')?.classList.add('hidden');
      closeAdmin();
      hide('authScreen');
      hide('appScreen');
      show('introScreen');
    }
  });
}


let myPageOpenedFromMenu = false;
function openMenu() { $('menuMask').style.display = 'flex'; }
function openRivalManage() {
  closeMenu();
  $('rivalManageMask').style.display = 'flex';
  loadFavorites().catch(console.error);
}
function closeRivalManage(returnToMenu = false) {
  $('rivalManageMask').style.display = 'none';
  if (returnToMenu) openMenu();
}

async function openFavoriteUserDetail(userId, username, instrument) {
  closeRivalManage();

  if (instrument !== activeInstrument) {
    await switchInstrument(instrument);
  }

  await openUserDetail(userId, username);
}

function closeMenu() { $('menuMask').style.display = 'none'; }

async function loadMyFeedbackHistory() {
  const target = $('feedbackHistory');
  if (!target) return;

  target.innerHTML = '<div class="feedback-history-empty">読み込み中...</div>';

  try {
    const { data, error } = await supabase.rpc('get_my_feedback_history');
    if (error) throw error;

    const rows = data ?? [];
    target.innerHTML = rows.map(item => {
      const categoryLabel = item.category === 'bug' ? '不具合' : '要望';
      const isDone = item.status === 'resolved';
      const reply = String(item.admin_reply || '').trim();

      return `
        <div class="feedback-history-card">
          <div class="feedback-history-top">
            <span class="feedback-category ${item.category === 'bug' ? 'bug' : 'request'}">${categoryLabel}</span>
            <span class="feedback-history-date">${new Date(item.created_at).toLocaleString('ja-JP')}</span>
          </div>
          <div class="feedback-history-message">${esc(item.message).replace(/\\n/g, '<br>')}</div>
          ${(item.device_name || item.browser_name) ? `
            <div class="feedback-history-env">
              <strong>ご利用環境</strong><br>
              機種名：${esc(item.device_name || '未入力')}<br>
              ブラウザ：${esc(item.browser_name || '未入力')}
            </div>
          ` : ''}
          ${reply ? `
            <div class="feedback-history-reply">
              <div class="feedback-history-reply-label">管理者からの返信</div>
              <div class="feedback-history-reply-message">${esc(reply).replace(/\\n/g, '<br>')}</div>
            </div>
          ` : ''}
          <div class="feedback-history-status">${reply ? '返信済み' : (isDone ? '対応済み' : '未対応')}</div>
        </div>`;
    }).join('') || '<div class="feedback-history-empty">送信履歴はありません</div>';
  } catch (e) {
    console.error('要望・不具合履歴取得エラー:', e);
    target.innerHTML = '<div class="feedback-history-empty">送信履歴の取得に失敗しました</div>';
  }
}

function openFeedback() {
  closeMenu();
  $('feedbackCategory').value = 'request';
  $('feedbackDevice').value = '';
  $('feedbackBrowser').value = '';
  $('feedbackMessage').value = '';
  $('feedbackStatus').textContent = '';
  $('feedbackMask').style.display = 'flex';
  loadMyFeedbackHistory();
}
function closeFeedback(returnToMenu = false) {
  $('feedbackMask').style.display = 'none';
  if (returnToMenu) openMenu();
}

async function submitFeedback() {
  const category = $('feedbackCategory').value;
  const deviceName = $('feedbackDevice').value.trim();
  const browserName = $('feedbackBrowser').value.trim();
  const message = $('feedbackMessage').value.trim();
  if (!message) {
    await showSiteDialog('内容を入力してください。', '入力エラー');
    return;
  }
  if (message.length > 2000) {
    await showSiteDialog('内容は2000文字以内で入力してください。', '入力エラー');
    return;
  }

  const button = $('btnSubmitFeedback');
  const original = button.textContent;
  try {
    button.disabled = true;
    button.textContent = '送信中';
    $('feedbackStatus').textContent = '';

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) throw new Error('ログイン情報を取得できません。');

    const { error } = await supabase
      .from('user_feedback')
      .insert({
        user_id: userData.user.id,
        category,
        message,
        device_name: deviceName || null,
        browser_name: browserName || null
      });

    if (error) throw error;

    $('feedbackDevice').value = '';
    $('feedbackBrowser').value = '';
    $('feedbackMessage').value = '';
    await loadMyFeedbackHistory();
    await showSiteDialog('送信しました。送信履歴に追加しました。', '送信完了');
  } catch (e) {
    console.error('要望・不具合報告送信エラー:', e);
    $('feedbackStatus').textContent = '送信に失敗しました。';
    await showSiteDialog(e?.message || '送信に失敗しました。', 'エラー');
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function openHowTo() { closeMenu(); $('howToMask').style.display = 'flex'; }
function closeHowTo(returnToMenu = false) { $('howToMask').style.display = 'none'; if (returnToMenu) openMenu(); }

function shareSkillImage() {
  const target = totals();
  const rowsHot = target.hotRows || [];
  const rowsOther = target.otherRows || [];

  // スマホで見やすいよう、HOT / OTHER を左右2カラムに戻す。
  // 背景はダークのまま維持。
  const W = 1400;
  const H = 2000;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');

  const totalPaint = (value, left, top, width, height) =>
    skillColorCanvasVerticalPaint(x, getSkillColorRowByTotalValue(value), left, top, width, height);
  const songPaint = (value, left, top, width, height) =>
    skillColorCanvasPaint(x, getSkillColorRowByTotalValue((Number(value) || 0) * 50), left, top, width, height);

  // 共有画像の外枠も画面上の登録曲一覧と同じスキルカラーを使う。
  // CanvasのstrokeStyleにはCanvasGradientを直接渡せるため、
  // RAINBOW等を代表色1色へ潰さず、そのままグラデーション枠として描画する。
  const songBorderPaint = (value, left, top, width, height) =>
    skillColorCanvasVerticalPaint(
      x,
      getSkillColorRowByTotalValue((Number(value) || 0) * 50),
      left,
      top,
      width,
      height
    );

  // background
  x.fillStyle = '#07101d';
  x.fillRect(0, 0, W, H);
  x.fillStyle = '#0f1a2d';
  x.fillRect(28, 28, W - 56, H - 56);

  // header: 以前のシンプルなレイアウトに戻す
  x.fillStyle = '#f8fafc';
  x.font = '900 42px sans-serif';
  const shareGameTitle = activeInstrument === 'GF'
    ? 'GITADORA GuitarFreaks Skill'
    : 'GITADORA DrumMania Skill';
  x.fillText(shareGameTitle, 54, 82);

  x.fillStyle = '#94a3b8';
  x.font = '700 24px sans-serif';
  x.fillText(activeVersion?.name || '', 54, 118);

  // ユーザー名 + TOTALスキルを横並び。
  // 旧ユーザー名(22px)と旧TOTAL(68px)の中間程度として42pxに統一。
  // 両方ともTOTALスキルカラーに準拠する。
  const shareUsername = String($('headerUsername')?.textContent || '').trim();
  const shareTotal = Number(target.total).toFixed(2);
  const shareLineY = 174;
  const shareFontSize = 42;
  const shareGap = 28;

  x.font = `900 ${shareFontSize}px sans-serif`;
  x.textAlign = 'left';
  x.textBaseline = 'alphabetic';

  let shareNameText = shareUsername || 'USER';
  const maxNameWidth = 700;
  while (x.measureText(shareNameText).width > maxNameWidth && shareNameText.length > 2) {
    shareNameText = shareNameText.slice(0, -1);
  }
  if (shareNameText !== (shareUsername || 'USER')) {
    shareNameText = shareNameText.slice(0, -1) + '…';
  }

  const nameWidth = x.measureText(shareNameText).width;
  const totalX = 54 + nameWidth + shareGap;
  const linePaintWidth = Math.min(W - 108, nameWidth + shareGap + x.measureText(shareTotal).width);

  x.fillStyle = totalPaint(target.total, 54, 132, linePaintWidth, 52);
  x.fillText(shareNameText, 54, shareLineY);
  x.fillText(shareTotal, totalX, shareLineY);

  x.fillStyle = '#94a3b8';
  x.font = '800 26px sans-serif';
  x.fillText(`HOT ${Number(target.hot).toFixed(2)}   OTHER ${Number(target.other).toFixed(2)}`,54,220);

  const gap = 24;
  const colW = (W - 108 - gap) / 2;
  const leftHot = 54;
  const leftOther = 54 + colW + gap;
  const tableTop = 256;

  const drawTable = (sectionTitle, rows, left, accent) => {
    const tableW = colW;
    const titleH = 40;
    const headerH = 48;
    const rowH = 58;
    const cols = [44, 326, 104, 106, 78]; // No / 譜面 / Skill / 達成率 / Lv
    const scale = tableW / cols.reduce((a,b)=>a+b,0);
    const widths = cols.map(v => v*scale);
    const pos=[left];
    widths.forEach(w=>pos.push(pos[pos.length-1]+w));

    x.fillStyle=accent;
    x.fillRect(left,tableTop,tableW,titleH);
    x.fillStyle='#0b1020';
    x.font='900 21px sans-serif';
    x.fillText(sectionTitle,left+10,tableTop+27);

    const headTop=tableTop+titleH;
    x.fillStyle='#111827'; x.fillRect(left,headTop,tableW,headerH);
    x.strokeStyle='#94a3b8'; x.lineWidth=1;

    const labels=['No.','譜面','SKILL','達成率','Lv'];
    labels.forEach((label,i)=>{
      x.strokeRect(pos[i],headTop,widths[i],headerH);
      x.fillStyle='#e5e7eb'; x.font='800 14px sans-serif'; x.textAlign='center'; x.textBaseline='middle';
      x.fillText(label,pos[i]+widths[i]/2,headTop+headerH/2);
    });

    rows.slice(0,25).forEach((r,i)=>{
      const y=headTop+headerH+i*rowH;
      x.fillStyle=i%2===0 ? '#111827' : '#0d1627';
      x.fillRect(left,y,tableW,rowH);

      // 各曲の外枠は、その曲のSKILLカラーに合わせる。
      // セル内部の縦線は控えめな共通色のままにして可読性を維持する。
      x.strokeStyle = songBorderPaint(r.skill, left, y, tableW, rowH);
      x.lineWidth = 2;
      x.strokeRect(left, y, tableW, rowH);
      x.strokeStyle = '#475569';
      x.lineWidth = 1;
      for(let c=1;c<widths.length;c++) {
        x.beginPath();
        x.moveTo(pos[c], y);
        x.lineTo(pos[c], y + rowH);
        x.stroke();
      }

      // No.
      x.fillStyle='#cbd5e1'; x.font='800 17px sans-serif';
      x.textAlign='center'; x.textBaseline='middle';
      x.fillText(String(i+1),pos[0]+widths[0]/2,y+rowH/2);

      // title + part
      x.textAlign='left';
      x.textBaseline='middle';
      x.fillStyle='#f8fafc'; x.font='800 16px sans-serif';
      let titleText=String(r.title||'');
      while(x.measureText(titleText).width > widths[1]-16 && titleText.length>4) titleText=titleText.slice(0,-1);
      if(titleText!==String(r.title||'')) titleText=titleText.slice(0,-1)+'…';
      // 曲名は上枠線とパート表示の間で上下余白が均等になる位置へ。
      x.fillText(titleText,pos[1]+8,y+19);
      x.textBaseline='alphabetic';
      x.fillStyle='#94a3b8'; x.font='700 11px sans-serif';
      // パートは従来より少し下へ。
      const partText = String(r.part || '');
      const partX = pos[1] + 8;
      const partY = y + 48;
      x.fillText(partText, partX, partY);

      // GFのオプションをパート右側に表示（正規は非表示）。
      // 画面上の [RAN] / [SRA] / [RAN+] / [SRA+] に相当する小型バッジ。
      const optionText = String(r.play_option || 'NORMAL').toUpperCase();
      if (!partText.endsWith('-D') && optionText !== 'NORMAL') {
        const optionStyles = {
          'RAN':  { text:'#86efac', border:'#15803d', bg:'rgba(20,83,45,.34)' },
          'SRA':  { text:'#fdba74', border:'#c2410c', bg:'rgba(124,45,18,.38)' },
          'RAN+': { text:'#4ade80', border:'#166534', bg:'rgba(20,83,45,.34)' },
          'SRA+': { text:'#fb923c', border:'#9a3412', bg:'rgba(124,45,18,.38)' }
        };
        const st = optionStyles[optionText] || { text:'#cbd5e1', border:'#475569', bg:'rgba(30,41,59,.5)' };

        x.font = '900 9px sans-serif';
        const optionW = Math.max(34, Math.ceil(x.measureText(optionText).width) + 12);
        const optionH = 15;
        const optionX = partX + x.measureText(partText).width + 8;
        const optionY = y + 36;

        // 曲名セル内に収まる場合だけ描画。
        if (optionX + optionW <= pos[2] - 5) {
          x.fillStyle = st.bg;
          x.beginPath();
          x.roundRect(optionX, optionY, optionW, optionH, 3);
          x.fill();
          x.strokeStyle = st.border;
          x.lineWidth = 1;
          x.stroke();

          x.fillStyle = st.text;
          x.textAlign = 'center';
          x.textBaseline = 'middle';
          x.fillText(optionText, optionX + optionW / 2, optionY + optionH / 2 + .5);
          x.textAlign = 'left';
          x.textBaseline = 'alphabetic';
        }
      }

      // SKILL:
      // 数字は白固定。左右の帯だけを、その曲のスキルカラーで表示する。
      const sv=Number(r.skill)||0;
      const skillCellX=pos[2];
      const skillCellW=widths[2];
      const barW=6;
      const barY=y+5;
      const barH=rowH-10;
      const songRow=getSkillColorRowByTotalValue(sv*50);

      x.fillStyle='#101827';
      x.fillRect(skillCellX+1,y+1,skillCellW-2,rowH-2);

      x.fillStyle=skillColorCanvasVerticalPaint(x,songRow,skillCellX,barY,barW,barH);
      x.fillRect(skillCellX+2,barY,barW,barH);

      x.fillStyle=skillColorCanvasVerticalPaint(x,songRow,skillCellX+skillCellW-barW-2,barY,barW,barH);
      x.fillRect(skillCellX+skillCellW-barW-2,barY,barW,barH);

      x.fillStyle='#ffffff';
      x.font='900 19px sans-serif';
      x.textAlign='center';
      x.textBaseline='middle';
      x.shadowColor='rgba(0,0,0,.9)';
      x.shadowBlur=2;
      x.fillText(sv.toFixed(2),skillCellX+skillCellW/2,y+rowH/2);
      x.shadowBlur=0;
      x.shadowColor='transparent';

      // achievement + badge
      x.fillStyle='#f8fafc'; x.font='900 15px sans-serif';
      x.fillText(`${Number(r.achievement_rate).toFixed(2)}%`,pos[3]+widths[3]/2,y+18);

      const badge = Number(r.achievement_rate)===100
        ? 'EXC'
        : (String(r.fc||'').toUpperCase()==='FC' ? 'FC' : '');
      if(badge){
        // 画面上のスキル対象 / 登録曲と同じFC・EXC配色。
        // 共有画像では少し小さめにする。
        const bw=40,bh=15,bx=pos[3]+(widths[3]-bw)/2,by=y+34;
        const bg=x.createLinearGradient(bx,by,bx,by+bh);
        if(badge==='EXC'){
          bg.addColorStop(0,'#fef08a');
          bg.addColorStop(1,'#f59e0b');
        }else{
          bg.addColorStop(0,'#ffffff');
          bg.addColorStop(.5,'#cbd5e1');
          bg.addColorStop(1,'#94a3b8');
        }
        x.fillStyle=bg;
        x.beginPath();
        x.roundRect(bx,by,bw,bh,3);
        x.fill();
        x.strokeStyle=badge==='EXC'?'#b45309':'#475569';
        x.lineWidth=1;
        x.stroke();
        x.fillStyle=badge==='EXC'?'#7f1d1d':'#1e3a8a';
        x.font='900 8px sans-serif';
        x.textAlign='center';
        x.textBaseline='middle';
        x.fillText(badge,pos[3]+widths[3]/2,by+bh/2+.5);
      }

      // level
      x.fillStyle='#e5e7eb'; x.font='800 17px sans-serif';
      x.fillText(Number(r.level).toFixed(2),pos[4]+widths[4]/2,y+rowH/2);
    });

    x.textAlign='left'; x.textBaseline='alphabetic';
  };

  drawTable('HOT TOP 25', rowsHot, leftHot, '#e94b88');
  drawTable('OTHER TOP 25', rowsOther, leftOther, '#83c63d');

  // footer
  x.fillStyle='#0b1424'; x.fillRect(54,H-62,W-108,30);
  x.fillStyle='#94a3b8'; x.font='700 14px sans-serif';
  x.fillText('GITADORA Skill Simulator',64,H-41);
  x.textAlign='right';
  x.fillText(new Date().toLocaleDateString('ja-JP'),W-64,H-41);
  x.textAlign='left';

  c.toBlob(async blob=>{
    if(!blob) return;
    const file=new File([blob],`GITADORA_${activeInstrument}_skill.png`,{type:'image/png'});
    const text=`GITADORA ${activeInstrument} SKILL ${Number(target.total).toFixed(2)}`;
    try{
      if(navigator.share && (!navigator.canShare || navigator.canShare({files:[file]}))){
        await navigator.share({files:[file],title:'GITADORA Skill Simulator',text});
      }else{
        const a=document.createElement('a');
        a.href=URL.createObjectURL(blob);
        a.download=file.name;
        a.click();
        setTimeout(()=>URL.revokeObjectURL(a.href),2000);
        await showSiteDialog('画像を保存しました。XやInstagramの投稿画面から画像を選択してください。','共有画像');
      }
    }catch(e){
      if(e?.name!=='AbortError') await showSiteDialog('共有に失敗しました: '+e.message,'エラー');
    }
  },'image/png');
}

async function loadScores() {
  try {
    scores = await getMyScores(activeVersionId);
    render();
  } catch (e) {
    console.error(e);
    await showSiteDialog('データ取得に失敗しました: ' + e.message, 'データ取得エラー');
  }
}


function getOwnSkillTargetRows() {
  const bestByTitle = new Map();

  for (const row of scores) {
    if (!isCurrentInstrumentPart(row.part)) continue;
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
  return getSkillColorRowByTotalValue(totalValue).rank;
}

function getSongSkillRank(skillValue) {
  // 曲別Skillは×50した値をTOTALスキル帯へ変換し、同じカラーテーブルを使う。
  return getSkillColorRowByTotalValue((Number(skillValue) || 0) * 50).rank;
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

function getFcBadgeMarkup(fc, achievementRate = null) {
  const rate = Number(achievementRate);
  const value = Number.isFinite(rate) && rate === 100
    ? 'EXC'
    : String(fc || '').toUpperCase();

  if (value !== 'FC' && value !== 'EXC') return '';
  const cls = value === 'EXC' ? 'exc' : 'fc';
  return `<span class="fc-unified-badge ${cls}">${value}</span>`;
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
  const fcBadge = getFcBadgeMarkup(record.fc, record.achievement_rate);
  const optionBadge = getOptionBadgeMarkup(record.play_option);
  const hotTag = getHotTagMarkup(record.is_hot);
  const pendingTag = record.pending_master ? '<span class="pending-badge">申請中</span>' : '';

  const songRank = getSongSkillRank(skill);
  const boxColor = `skill-box-${songRank}`;
  const rowColor = `skill-row-${songRank}`;

  const titleMarkup = `${pendingTag}${hotTag}<span class="dc-song-title">${esc(record.title)}</span>`;
  const partMarkup = `<span class="p-badge ${getPartColorClass(record.part)}">${esc(record.part)}</span>`;

  if (mode === 'SKILL') {
    return `
      <div class="sk-row dc-card dc-card-skill ${rowColor}"
        ${record.song_id ? `data-compare-song="${record.song_id}" data-compare-title="${esc(record.title)}" data-compare-part="${esc(record.part)}"` : ''}>
        <div class="dc-part">${partMarkup}</div>
        <div class="dc-title smart-song-title" data-full-title="${esc(record.title)}">${titleMarkup}</div>
        <div class="dc-skill dc-skill-span ${boxColor}">${formatSkill(skill)}</div>

        <div class="dc-fc">${fcBadge}</div>
        <div class="dc-lv">Lv <strong>${formatLevel(record.level)}</strong></div>
        <div class="dc-rate">達成率 <strong>${formatRate(record.achievement_rate)}%</strong></div>
        <div class="dc-option">${optionBadge}</div>
      </div>`;
  }

  if (mode === 'PUBLIC') {
    return `
      <div class="m-card dc-card dc-card-manage dc-card-public ${rowColor}"
        ${record.song_id ? `data-compare-song="${record.song_id}" data-compare-title="${esc(record.title)}" data-compare-part="${esc(record.part)}"` : ''}>
        <div class="dc-part">${partMarkup}</div>
        <div class="dc-title smart-song-title" data-full-title="${esc(record.title)}">${titleMarkup}</div>
        <div class="dc-skill ${boxColor}">${formatSkill(skill)}</div>

        <div class="dc-fc">${fcBadge}</div>
        <div class="dc-lv">Lv <strong>${formatLevel(record.level)}</strong></div>
        <div class="dc-rate">達成率 <strong>${formatRate(record.achievement_rate)}%</strong></div>
        <div class="dc-option">${optionBadge}</div>
      </div>`;
  }

  return `
    <div class="m-card dc-card dc-card-manage ${rowColor}"
      ${record.song_id ? `data-compare-song="${record.song_id}" data-compare-title="${esc(record.title)}" data-compare-part="${esc(record.part)}"` : ''}>
      <div class="dc-part">${partMarkup}</div>
      <div class="dc-title smart-song-title" data-full-title="${esc(record.title)}">${titleMarkup}</div>
      <div class="dc-skill ${boxColor}">${formatSkill(skill)}</div>

      <div class="dc-fc">${fcBadge}</div>
      <div class="dc-lv">Lv <strong>${formatLevel(record.level)}</strong></div>
      <div class="dc-rate">達成率 <strong>${formatRate(record.achievement_rate)}%</strong></div>
      <div class="dc-option">${optionBadge}</div>
      <div class="dc-edit"><button class="m-action-btn btn-e" data-edit="${record.score_id}">編集</button></div>
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
    .filter(r => isCurrentInstrumentPart(r.part))
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
  $('partSelect').innerHTML = instrumentParts().map(p => `<option value="${p}">${p}</option>`).join('');
  $('partSelect').value = score?.part || instrumentParts()[0];
  $('formLevel').value = score ? formatLevel(score.level) : '';
  $('formRate').value = score ? formatRate(score.achievement_rate) : '';
  $('formFc').value = score?.fc === 'FC' ? 'FC' : '';
  $('formOption').value = activeInstrument === 'DM'
    ? 'NORMAL'
    : (score?.play_option || 'NORMAL');
  $('formSkill').textContent = score ? formatSkill(score.skill) : '-';
  $('songSuggestions').innerHTML = '';
  $('btnSubmitForm').textContent = '保存する';
  $('editDeleteArea').classList.toggle('hidden', !score);
  hide('masterRequestArea');
  hide('levelCorrectionArea');
  hide('levelCorrectionForm');
  $('correctionLevel').value = '';
  if (selectedSong) show('levelCorrectionArea');

  // iOS Safariではモーダル内のinputにフォーカスすると、
  // 背景ページ側のスクロール位置まで動くことがある。
  // 開く前の位置を保存してbodyを固定し、背景を一切動かさない。
  scoreModalScrollY = window.scrollY || window.pageYOffset || 0;
  document.body.classList.add('score-modal-open');
  document.body.style.position = 'fixed';
  document.body.style.top = `-${scoreModalScrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';

  $('domModal').style.display = 'flex';

  if (!score) {
    requestAnimationFrame(() => $('formTitle').focus({ preventScroll: true }));
  }
}

function closeModal() {
  // iOS Safariではキーボードを閉じた直後にVisualViewportと
  // ページレイアウトの再計算がずれることがあるため、
  // blur → body固定解除 → 再描画 → scroll復元の順で処理する。
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }

  $('domModal').style.display = 'none';
  document.body.classList.remove('score-modal-open');

  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';

  const restoreY = scoreModalScrollY;

  editingScoreId = null;
  selectedSong = null;

  // 登録一覧を一度再描画して、Safariに残った不正なレイアウトキャッシュを破棄。
  render();

  const repairViewport = () => {
    // 一時的に再フローを強制
    document.documentElement.classList.add('ios-viewport-repair');
    void document.documentElement.offsetHeight;
    document.documentElement.classList.remove('ios-viewport-repair');

    window.scrollTo({ top: restoreY, left: 0, behavior: 'auto' });
  };

  repairViewport();
  requestAnimationFrame(() => {
    repairViewport();
    requestAnimationFrame(repairViewport);
  });

  // キーボードが完全に閉じた後にも最終補正
  setTimeout(repairViewport, 120);

  requestAnimationFrame(syncGlobalModalScrollLock);
}

let songSuggestRequestSeq = 0;
let songSuggestTimer = null;

async function suggestSongs() {
  const requestSeq = ++songSuggestRequestSeq;
  const title = $('formTitle').value.trim();
  const currentPart = $('partSelect').value;
  const versionId = activeVersionId;
  const instrument = activeInstrument;

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
    // 候補検索と完全一致確認を並列で実行して待ち時間を短縮する。
    const [rows, exactCurrentSong] = await Promise.all([
      searchSongTitles(title, instrument, versionId),
      currentPart
        ? getSongByTitleAndPart(title, currentPart, versionId)
        : Promise.resolve(null)
    ]);

    // 文字入力中に古い検索結果が後から返ってきても画面へ反映しない。
    // 例：「一網」検索の応答が「一網打尽」検索より後に返るケースを防止。
    if (
      requestSeq !== songSuggestRequestSeq ||
      $('formTitle').value.trim() !== title ||
      $('partSelect').value !== currentPart ||
      activeVersionId !== versionId ||
      activeInstrument !== instrument
    ) {
      return;
    }

    // 完全一致する曲名は候補の先頭へ。
    const sortedRows = [...(rows ?? [])].sort((a, b) => {
      const aExact = String(a.title || '') === title ? 1 : 0;
      const bExact = String(b.title || '') === title ? 1 : 0;
      return bExact - aExact;
    });

    const suggestionHtml = sortedRows.map(r => `
      <button class="suggestion"
        data-title="${esc(r.title)}"
        data-is-hot="${r.is_hot ? '1':'0'}">
        <span>${r.is_hot ? '[HOT] ' : ''}${esc(r.title)}</span>
      </button>`).join('');

    // 現在の「曲名 + Part」がマスターに完全一致している場合は
    // 新規登録依頼を絶対に表示しない。
    const requestHtml = exactCurrentSong ? '' : `
      <button class="suggestion request-suggestion"
        data-request-title="${esc(title)}">
        <span>＋「${esc(title)}」を曲マスターへ登録依頼</span>
      </button>`;

    $('songSuggestions').innerHTML = suggestionHtml + requestHtml;

    // 入力途中の完全一致では自動確定しない。
    // Flow → Flower のように続けて入力できる仕様を維持する。
    selectedSong = null;
    $('formLevel').value = '';
    $('formLevel').readOnly = true;
    hide('levelCorrectionArea');
    hide('levelCorrectionForm');
    hide('masterRequestArea');
    updateSkillPreview();
  } catch (e) {
    if (requestSeq === songSuggestRequestSeq) {
      console.error(e);
    }
  }
}

function scheduleSongSuggestions() {
  clearTimeout(songSuggestTimer);
  songSuggestTimer = setTimeout(() => {
    suggestSongs();
  }, 60);
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
    const song = await getSongByTitleAndPart(title, part, activeVersionId);
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
    selectedSong = await getSongByTitleAndPart(title, part, activeVersionId);
  }

  let songId = selectedSong?.id || null;
  let requestId = null;

  // マスター未登録なら、申請とスコア保存を同時に行う
  if (!songId) {
    const level = $('formLevel').value;
    if (!level) throw new Error('登録依頼する難易度を入力してください。');

    const numericLevel = Number(level);
    if (!Number.isFinite(numericLevel) || numericLevel <= 0 || numericLevel > 9.99) {
      throw new Error('難易度は0.01～9.99の範囲で入力してください。');
    }

    const request = await requestSongMaster({
      title,
      part,
      proposedLevel: level,
      versionId: activeVersionId
    });

    // 申請直前の再照合で既存マスターが見つかった場合は、
    // 新規申請を作らず既存song_idへ保存する。
    if (request?.existing_song_id) {
      songId = request.existing_song_id;
      selectedSong = {
        id: request.existing_song_id,
        title: request.title,
        part: request.part,
        level: request.level,
        is_hot: request.is_hot
      };
    } else {
      requestId = request.id;
    }
  }

  const numericRate = Number(rate);
  const autoFc = numericRate === 100 ? 'EXC' : $('formFc').value;
  const playOption = activeInstrument === 'DM' ? 'NORMAL' : $('formOption').value;

  await saveScore({
    scoreId: editingScoreId,
    songId,
    requestId,
    achievementRate: rate,
    fc: autoFc,
    playOption
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

let userListLoadSeq = 0;

async function loadUsers({ resetPage = false } = {}) {
  const requestSeq = ++userListLoadSeq;
  const keyword = $('userSearch')?.value || '';
  const instrument = activeInstrument;
  const versionId = activeVersionId;

  try {
    const rows = await listUserSummaries(keyword, instrument, versionId);

    // 古い再取得結果が後から返ってきても現在の表示を巻き戻さない。
    if (
      requestSeq !== userListLoadSeq ||
      instrument !== activeInstrument ||
      versionId !== activeVersionId ||
      keyword !== ($('userSearch')?.value || '')
    ) {
      return;
    }

    publicUsers = rows;

    // 検索・VERSION変更・楽器変更など、明示的な条件変更時だけ1ページ目へ。
    // focus/visibilitychange等の自動再取得では現在ページを維持する。
    if (resetPage) userListPage = 0;

    renderUsers();
  } catch (e) {
    if (requestSeq !== userListLoadSeq) return;
    $('userList').innerHTML = `<div class="empty-state">ユーザーリストの取得に失敗しました: ${esc(e.message)}</div>`;
  }
}

function buildUserListPager(totalPages) {
  if (totalPages <= 1) return '';

  const current = userListPage + 1;
  const nearby = [];

  // 現在ページ前後を直接選べるようにしつつ、
  // どのページへでも移動できるネイティブ選択欄を中央に置く。
  for (let p = Math.max(1, current - 2); p <= Math.min(totalPages, current + 2); p++) {
    nearby.push(
      `<button type="button"
        class="user-pager-page ${p === current ? 'active' : ''}"
        data-user-page-number="${p - 1}"
        ${p === current ? 'aria-current="page"' : ''}>${p}</button>`
    );
  }

  const pageOptions = Array.from({ length: totalPages }, (_, i) => {
    const page = i + 1;
    return `<option value="${i}" ${page === current ? 'selected' : ''}>${page} / ${totalPages}</option>`;
  }).join('');

  return `
    <button type="button" class="user-pager-arrow" data-user-page="prev"
      ${userListPage <= 0 ? 'disabled' : ''} aria-label="前のページ">◀</button>

    <div class="user-pager-nearby">${nearby.join('')}</div>

    <label class="user-pager-jump" aria-label="ページを選択">
      <select data-user-page-select>
        ${pageOptions}
      </select>
    </label>

    <button type="button" class="user-pager-arrow" data-user-page="next"
      ${userListPage + 1 >= totalPages ? 'disabled' : ''} aria-label="次のページ">▶</button>
  `;
}

function renderUsers() {
  const { key, dir } = userListSort;
  const sign = dir === 'asc' ? 1 : -1;

  document.querySelectorAll('[data-user-sort]').forEach(btn => {
    const active = btn.dataset.userSort === key;
    btn.classList.toggle('active', active);
    if (active) btn.dataset.sortDir = dir;
    else delete btn.dataset.sortDir;
  });

  const users = [...publicUsers].sort((a, b) => {
    const gfA = Number(a.gf_skill) || 0, gfB = Number(b.gf_skill) || 0;
    const dmA = Number(a.dm_skill) || 0, dmB = Number(b.dm_skill) || 0;
    const totalA = gfA + dmA, totalB = gfB + dmB;
    const nameA = String(a.username || ''), nameB = String(b.username || '');
    let result = 0;
    if (key === 'gf') result = gfA - gfB;
    else if (key === 'dm') result = dmA - dmB;
    else if (key === 'total') result = totalA - totalB;
    else if (key === 'name') return dir === 'asc'
      ? nameA.localeCompare(nameB, 'ja')
      : nameB.localeCompare(nameA, 'ja');

    return result * sign || nameA.localeCompare(nameB, 'ja');
  });

  const totalPages = Math.max(1, Math.ceil(users.length / USER_LIST_PAGE_SIZE));
  if (userListPage >= totalPages) userListPage = totalPages - 1;

  const pageStart = userListPage * USER_LIST_PAGE_SIZE;
  const pageUsers = users.slice(pageStart, pageStart + USER_LIST_PAGE_SIZE);

  $('userList').innerHTML = pageUsers.map(user => {
    const gf = Number(user.gf_skill) || 0;
    const dm = Number(user.dm_skill) || 0;
    const combined = gf + dm;
    const gfClass = `score-rank-${getTotalSkillRank(gf)}`;
    const dmClass = `score-rank-${getTotalSkillRank(dm)}`;
    // TOTALの色はGF/DMのうち高い方のスキルカラーを採用する。
    const totalClass = `score-rank-${getTotalSkillRank(Math.max(gf, dm))}`;
    const rivalLabel = `${activeInstrument}ライバル`;

    return `
      <div class="user-list-row" data-user-open="${user.user_id}" data-user-name="${esc(user.username)}">
        <div class="user-list-name">${esc(user.username)}${user.is_self ? '（自分）' : ''}</div>
        <div class="user-list-skill user-list-gf"><div class="user-list-skill-value ${gfClass}">${formatSkill(gf)}</div></div>
        <div class="user-list-skill user-list-dm"><div class="user-list-skill-value ${dmClass}">${formatSkill(dm)}</div></div>
        <div class="user-list-skill user-list-total"><span class="user-list-skill-value ${totalClass}">${formatSkill(combined)}</span></div>
        ${user.is_self
          ? '<div></div>'
          : `<button class="favorite-toggle ${user.is_favorite ? 'active' : ''}"
              data-favorite-user="${user.user_id}"
              data-favorite-instrument="${activeInstrument}"
              title="${rivalLabel}">${user.is_favorite ? '★' : '☆'}</button>`}
      </div>`;
  }).join('') || '<div class="empty-state">該当するユーザーがいません</div>';

  const pager = $('userListPager');
  if (pager) {
    if (!users.length || totalPages <= 1) {
      pager.innerHTML = users.length
        ? `<span class="user-list-page-summary">${users.length}件</span>`
        : '';
    } else {
      pager.innerHTML = `
        <div class="user-pager-main">${buildUserListPager(totalPages)}</div>
        <div class="user-list-page-summary">${users.length}件</div>
      `;
    }
  }
}

function renderViewedUserSkill() {
  const target = calcTargetTotals(viewedUserScores);

  $('userDetailHot').textContent = formatSkill(target.hot);
  $('userDetailOther').textContent = formatSkill(target.other);
  $('userDetailTotal').textContent = formatSkill(target.total);

  const rankClass = `score-rank-${getTotalSkillRank(target.total)}`;
  ['userDetailTotal', 'userDetailHot', 'userDetailOther'].forEach(id => {
    const el = $(id);
    el.className = `user-detail-skill-value ${rankClass}`;
  });

  $('userDetailSkill').innerHTML = `
    <div class="sk-section"><h2>HOT Top25</h2><div class="list-container">
      ${target.hotRows.map((r,i) => createCard(r,i+1,'SKILL')).join('') || '<div class="empty-state">記録がありません</div>'}
    </div></div>
    <div class="sk-section"><h2>OTHER Top25</h2><div class="list-container">
      ${target.otherRows.map((r,i) => createCard(r,i+1,'SKILL')).join('') || '<div class="empty-state">記録がありません</div>'}
    </div></div>`;
}

function setUserDetailTab(tab) {
  document.querySelectorAll('[data-user-detail-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.userDetailTab === tab);
  });

  $('userDetailSkill').classList.toggle('hidden', tab !== 'skill');
  $('userDetailRecords').classList.toggle('hidden', tab !== 'records');
}

async function loadViewedUserRegisteredScores() {
  if (!viewedUserId || !viewedUserProfile?.registration_public) return;

  $('userDetailRecords').innerHTML = '<div class="empty-state">読み込み中...</div>';

  try {
    viewedUserRegisteredScores = await getPublicUserRegisteredScores(
      viewedUserId,
      activeInstrument,
      activeVersionId
    );

    const data = [...viewedUserRegisteredScores]
      .sort((a,b) => Number(b.skill) - Number(a.skill));

    $('userDetailRecords').innerHTML = `
      <div class="sk-section">
        <h2>登録曲 ${data.length}件</h2>
        <div class="list-container">
          ${data.map((r,i) => createCard(r,i+1,'PUBLIC')).join('') || '<div class="empty-state">登録曲がありません</div>'}
        </div>
      </div>`;
  } catch (e) {
    $('userDetailRecords').innerHTML =
      `<div class="empty-state">登録曲の取得に失敗しました: ${esc(e.message)}</div>`;
  }
}

async function openUserDetail(userId, username) {
  viewedUserId = userId;
  viewedUserName = username;
  viewedUserProfile = null;
  viewedUserRegisteredScores = [];

  $('userDetailName').textContent = username;
  $('userDetailSkill').innerHTML = '<div class="empty-state">読み込み中...</div>';
  $('userDetailRecords').innerHTML = '';
  $('userDetailTabs').classList.add('hidden');
  $('userDetailXLink').classList.add('hidden');
  $('userDetailXLink').removeAttribute('href');
  setUserDetailTab('skill');
  $('userDetailPage').style.display = 'block';

  try {
    const [skillRows, profile] = await Promise.all([
      getUserSkillTargets(userId, activeInstrument, activeVersionId),
      getUserPublicProfile(userId)
    ]);

    viewedUserScores = skillRows;
    viewedUserProfile = profile;
    renderViewedUserSkill();

    $('userDetailTabs').classList.toggle(
      'hidden',
      !Boolean(profile?.registration_public)
    );

    const xId = String(profile?.x_id || '').trim();
    if (profile?.x_public && /^[A-Za-z0-9_]{1,15}$/.test(xId)) {
      const link = $('userDetailXLink');
      link.href = `https://x.com/${encodeURIComponent(xId)}`;
      link.title = `@${xId}`;
      link.classList.remove('hidden');
    }
  } catch (e) {
    $('userDetailSkill').innerHTML =
      `<div class="empty-state">取得に失敗しました: ${esc(e.message)}</div>`;
  }
}

function closeUserDetail() {
  $('userDetailPage').style.display = 'none';
  viewedUserScores = [];
  viewedUserRegisteredScores = [];
  viewedUserProfile = null;
  viewedUserId = null;
  viewedUserName = '';
  $('userDetailXLink').classList.add('hidden');
  $('userDetailTabs').classList.add('hidden');
  setUserDetailTab('skill');
}

async function toggleFavorite(userId, instrument = activeInstrument) {
  const user = publicUsers.find(u => u.user_id === userId);
  if (!user) return;

  const isRemoving = Boolean(user.is_favorite && instrument === activeInstrument);

  try {
    if (isRemoving) {
      await removeFavorite(userId, instrument);
    } else {
      // 11人目はDBへ登録処理を投げる前に止める。
      // getMyFavorites() を直接取得して判定することで、
      // 画面側のキャッシュ件数に依存しないようにする。
      const currentFavorites = await getMyFavorites(instrument);
      if ((currentFavorites ?? []).length >= 10) {
        await showSiteDialog('登録人数上限です。', 'ライバル登録');
        return;
      }

      const { error: addError } = await supabase.rpc('add_favorite_v2', {
        p_favorite_user_id: userId,
        p_instrument: instrument
      });
      if (addError) throw addError;
    }

    await Promise.all([loadUsers(), loadFavorites()]);
  } catch (e) {
    const message = String(e?.message || e);

    // 同時操作などで事前判定をすり抜けてDB側の10人制限に
    // 到達した場合も、同じ上限メッセージに統一する。
    if (
      /5件|5人|10件|10人|上限|limit|maximum|max favorites|too many|RIVAL_LIMIT_REACHED/i.test(message)
    ) {
      await showSiteDialog('登録人数上限です。', 'ライバル登録');
    } else {
      console.error('ライバル登録エラー:', e);
      await showSiteDialog(
        `ライバル登録の更新に失敗しました。\n${message}`,
        'エラー'
      );
    }
  }
}

async function loadFavorites() {
  try {
    const [gf, dm] = await Promise.all([
      getMyFavorites('GF'),
      getMyFavorites('DM')
    ]);

    const enrich = async (rows, instrument) => {
      return Promise.all((rows ?? []).map(async fav => {
        try {
          const targetRows = await getUserSkillTargets(
            fav.favorite_user_id,
            instrument,
            activeVersionId
          );
          const target = calcTargetTotals(targetRows);
          return { ...fav, total_skill: target.total };
        } catch (error) {
          console.warn(`${instrument}ライバルスキル取得失敗:`, fav.favorite_user_id, error);
          return { ...fav, total_skill: null };
        }
      }));
    };

    const [gfWithSkill, dmWithSkill] = await Promise.all([
      enrich(gf, 'GF'),
      enrich(dm, 'DM')
    ]);

    favoriteUsers = { GF: gfWithSkill, DM: dmWithSkill };
    renderFavorites();
  } catch (e) {
    $('favoriteUserListGF').innerHTML = `<div class="empty-state">GFライバルの取得に失敗しました</div>`;
    $('favoriteUserListDM').innerHTML = `<div class="empty-state">DMライバルの取得に失敗しました</div>`;
    console.error(e);
  }
}

function renderFavoriteList(instrument) {
  const rows = [...(favoriteUsers[instrument] || [])].sort((a, b) => {
    const skillA = Number(a.total_skill);
    const skillB = Number(b.total_skill);

    const validA = Number.isFinite(skillA);
    const validB = Number.isFinite(skillB);

    if (validA && validB && skillB !== skillA) return skillB - skillA;
    if (validA !== validB) return validA ? -1 : 1;

    return String(a.username || '').localeCompare(String(b.username || ''), 'ja');
  });

  const target = $(`favoriteUserList${instrument}`);

  target.innerHTML = rows.map(fav => {
    const total = Number(fav.total_skill);
    const hasSkill = Number.isFinite(total);
    const skillClass = hasSkill
      ? `score-rank-${getTotalSkillRank(total)}`
      : '';

    return `
      <div class="favorite-user-row" data-favorite-row="${fav.favorite_user_id}">
        <button type="button"
          class="favorite-user-open"
          data-favorite-open="${fav.favorite_user_id}"
          data-favorite-name="${esc(fav.username)}"
          data-favorite-view-instrument="${instrument}">
          <span class="name">${esc(fav.username)}</span>
          <span class="favorite-user-skill-label">${instrument} TOTAL</span>
          <span class="favorite-user-skill ${skillClass}">${hasSkill ? formatSkill(total) : '-'}</span>
          <span class="favorite-user-arrow">›</span>
        </button>
        <button type="button"
          class="remove"
          data-favorite-remove="${fav.favorite_user_id}"
          data-favorite-instrument="${instrument}">削除</button>
      </div>`;
  }).join('') || `<div class="section-note">${instrument}ライバルはまだ登録されていません。</div>`;
}

function renderFavorites() {
  renderFavoriteList('GF');
  renderFavoriteList('DM');
}

async function moveFavorite(userId, direction, instrument) {
  const rows = favoriteUsers[instrument] || [];
  const index = rows.findIndex(f => f.favorite_user_id === userId);
  if (index < 0) return;

  const next = index + direction;
  if (next < 0 || next >= rows.length) return;

  const ids = rows.map(f => f.favorite_user_id);
  [ids[index], ids[next]] = [ids[next], ids[index]];

  await reorderFavorites(ids, instrument);
  await loadFavorites();
}


function getOptionDisplayName(option) {
  switch (option) {
    case 'NORMAL': return '正規';
    case 'RAN': return 'RAN';
    case 'SRA': return 'SRA';
    case 'RAN+': return 'RAN+';
    case 'SRA+': return 'SRA+';
    default: return String(option || '');
  }
}

function formatOptionPercentage(value) {
  const num = Number(value) || 0;
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
}

async function openRateComparison(songId, title, part) {
  $('rateCompareTitle').textContent = `${title} / ${part}`;
  $('ratePersonalBest').classList.add('hidden');
  $('ratePersonalBest').innerHTML = '';
  $('rateOptionSummary').innerHTML = part.endsWith('-D')
    ? ''
    : '<div class="option-share-title">オプション利用割合を読み込み中...</div>';
  $('rateCompareColumns').classList.add('hidden');
  $('rateCompareBody').innerHTML = '<div class="empty-state">読み込み中...</div>';
  $('rateCompareMask').style.display = 'flex';

  try {
    // Rate比較は自分+自分が登録したライバルのみ。
    // オプション割合はライバル登録に関係なく全ユーザーを集計。
    const [rows, optionRows, personalBest] = await Promise.all([
      getSongRateComparison(songId),
      part.endsWith('-D') ? Promise.resolve([]) : getSongOptionDistribution(songId),
      getSongPersonalBestHistory(songId)
    ]);

    if (personalBest) {
      $('ratePersonalBest').classList.remove('hidden');
      $('ratePersonalBest').innerHTML = `
        <span class="rate-personal-best-label">自己ベスト</span>
        <strong class="rate-personal-best-value">${formatRate(personalBest.achievement_rate)}%</strong>
        <span class="rate-personal-best-version">（${esc(personalBest.version_name)}）</span>`;
    } else {
      $('ratePersonalBest').classList.add('hidden');
      $('ratePersonalBest').innerHTML = '';
    }

    const visibleOptions = part.endsWith('-D') ? [] : optionRows.filter(row => Number(row.percentage) > 0);

    $('rateOptionSummary').innerHTML = part.endsWith('-D')
      ? ''
      : (visibleOptions.length
          ? `
            <div class="option-share-title">全ユーザーのオプション利用割合</div>
            ${visibleOptions.map(row => `
              <div class="option-share-item">
                <span>${esc(getOptionDisplayName(row.play_option))}</span>
                <strong>${formatOptionPercentage(row.percentage)}%</strong>
              </div>`
            ).join('')}
          `
          : '');

    $('rateCompareColumns').classList.toggle('hidden', !rows.length);

    $('rateCompareBody').innerHTML = rows.length ? `
      ${rows.map((row, index) => {
        const compareSkillClass = `skill-box-${getSongSkillRank(Number(row.skill) || 0)}`;
        return `
          <div class="rate-row ${row.is_self ? 'self' : ''}">
            <div class="rate-user">
              <div class="rate-user-name">${esc(row.username)}${row.is_self ? '（自分）' : ''}</div>
              <div class="rate-badges">
                ${getFcBadgeMarkup(row.fc, row.achievement_rate)}
                ${getOptionBadgeMarkup(row.play_option)}
              </div>
            </div>
            <div class="rate-value">${formatRate(row.achievement_rate)}%</div>
            <div class="rate-skill ${compareSkillClass}">${formatSkill(row.skill)}</div>
          </div>`;
      }).join('')}
    ` : '<div class="empty-state">比較できる記録がありません</div>';
  } catch (e) {
    $('rateOptionSummary').innerHTML = '';
    $('rateCompareColumns').classList.add('hidden');
    $('rateCompareBody').innerHTML = `<div class="empty-state">比較データの取得に失敗しました: ${esc(e.message)}</div>`;
  }
}

function closeRateComparison() {
  $('rateCompareMask').style.display = 'none';
}

async function openMyPage(fromMenu = false) {
  myPageOpenedFromMenu = Boolean(fromMenu);
  const { data } = await supabase.auth.getUser();
  $('mypageUsernameInput').value = data.user?.user_metadata?.username || $('headerUsername').textContent || '';
  $('newPassword').value = '';
  $('mypageXIdInput').value = '';
  $('mypageModal').style.display = 'flex';

  try {
    const settings = await getMyFeatureSettings();
    $('mypageXIdInput').value = settings.x_id || '';
  } catch (e) {
    console.error('X ID取得失敗:', e);
  }
}

async function changeOwnUsername() {
  const username = $('mypageUsernameInput').value.trim();
  if (!username) throw new Error('ユーザー名を入力してください。');

  const data = await accountAdmin('rename_self', { username });
  $('mypageUsernameInput').value = data.username;
  $('headerUsername').textContent = data.username;
  $('authUsername').value = data.username;
  await showSiteDialog('ユーザー名を変更しました。\n次回から新しいユーザー名でログインしてください。', '変更完了');
}

function closeMyPage(returnToPrevious = false) {
  $('mypageModal').style.display = 'none';
  if (returnToPrevious && myPageOpenedFromMenu) openMenu();
  myPageOpenedFromMenu = false;
}

async function deleteOwnAccount() {
  const ok1 = await showSiteConfirm(
    'ユーザーを削除します。登録したスコアもすべて削除されます。よろしいですか？',
    'ユーザー削除',
    '次へ'
  );
  if (!ok1) return;

  const typed = await showSitePrompt(
    '確認のため「削除」と入力してください。',
    '最終確認',
    '削除する',
    '削除'
  );
  if (typed !== '削除') {
    if (typed !== null) await showSiteDialog('「削除」と入力してください。', '入力確認');
    return;
  }

  try {
    $('btnDeleteAccount').disabled = true;
    await accountAdmin('delete_self');
    try { await logout(); } catch (_) {}
    closeMyPage();
    scores = [];
    showAuth('login');
    await showSiteDialog('ユーザーを削除しました。', '削除完了');
  } catch (e) {
    await showSiteDialog('ユーザー削除に失敗しました: ' + e.message, 'エラー');
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

  adminAccessChecked = true;
  $('btnAdmin').classList.toggle('hidden', !adminEnabled);
  $('menuOfuseSupport')?.classList.toggle('hidden', !adminEnabled);

  primaryAdminEnabled = false;
  if (adminEnabled) {
    try {
      const { data, error } = await supabase.rpc('is_primary_admin');
      if (error) throw error;
      primaryAdminEnabled = data === true;
    } catch (e) {
      console.error('primary admin check failed:', e);
    }
  }
  $('adminBulkDeleteArea')?.classList.toggle('hidden', !primaryAdminEnabled);

  // 保存済みライトモード設定を全ユーザーに反映。
  applyLightMode();
}

async function adminBulkDeleteCurrentScores() {
  if (!adminEnabled || !primaryAdminEnabled) {
    await showSiteDialog('この機能はadmin専用です。', '権限エラー');
    return;
  }

  const instrumentLabel = activeInstrument === 'DM' ? 'DM' : 'GF';
  const versionLabel = activeVersion?.name || activeVersion?.code || '現在のVERSION';

  const ok = await showSiteConfirm(
    `${versionLabel} の ${instrumentLabel} 登録曲をすべて削除しますか？\nこの操作は元に戻せません。`,
    '登録曲の一括削除',
    '一括削除する'
  );
  if (!ok) return;

  const button = $('btnAdminBulkDeleteScores');
  const original = button?.textContent || '登録曲を一括削除';

  try {
    if (button) {
      button.disabled = true;
      button.textContent = '削除中...';
    }

    const { data, error } = await supabase.rpc('admin_bulk_delete_my_scores', {
      p_version_id: activeVersionId,
      p_instrument: activeInstrument
    });
    if (error) throw error;

    await loadScores();

    const deleted = Number(data) || 0;
    await showSiteDialog(
      `${instrumentLabel} の登録曲を ${deleted}件削除しました。`,
      '一括削除完了'
    );
  } catch (e) {
    await showSiteDialog(
      '一括削除に失敗しました: ' + (e?.message || e),
      'エラー'
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = original;
    }
  }
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
  else if (tab === 'users') await loadAdminUsers();
  else if (tab === 'feedback') await loadAdminFeedback();
}

async function loadAdminSongs() {
  $('adminBody').classList.add('admin-body-table');
  $('adminBody').innerHTML = '<div class="empty-state">読み込み中...</div>';

  try {
    const keyword = $('adminSongSearch').value;
    const result = await getAdminSongMasterPage(
      keyword,
      adminSongPage,
      ADMIN_SONG_PAGE_SIZE,
      activeVersionId
    );

    const rows = result.rows;
    const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

    // 検索結果が減って現在ページが範囲外になった場合は先頭へ戻す
    if (adminSongPage >= totalPages && adminSongPage > 0) {
      adminSongPage = 0;
      return loadAdminSongs();
    }

    $('adminBody').innerHTML = `
      <div class="admin-master-summary">
        <span>${result.total.toLocaleString('ja-JP')}曲</span>
        <span>${adminSongPage + 1} / ${totalPages}ページ</span>
      </div>
      <div class="master-sheet-wrap">
        <table class="master-sheet" id="adminMasterTable">
          <thead>
            <tr>
              <th class="master-hot-cell">HOT</th>
              <th class="master-title-cell">曲名</th>
              ${MASTER_PARTS.map(part => `<th class="master-level-cell">${part}</th>`).join('')}
              <th class="master-action-cell">操作</th>
            </tr>
          </thead>
          <tbody>
            ${adminNewSongRowVisible ? `
              <tr class="master-new-row" data-master-new-row>
                <td class="master-hot-cell">
                  <input type="checkbox" data-master-hot>
                </td>
                <td class="master-title-cell">
                  <input type="text" data-master-title value="" placeholder="曲名">
                </td>
                ${MASTER_PARTS.map(part => `
                  <td class="master-level-cell">
                    <input
                      type="text"
                      inputmode="decimal"
                      autocomplete="off"
                      data-master-level="${part}"
                      value=""
                      placeholder="-">
                  </td>`).join('')}
                <td class="master-action-cell">
                  <div class="master-row-actions">
                    <button class="master-row-save" data-admin-register-master-row>登録</button>
                    <button class="master-row-delete" data-admin-cancel-master-row>キャンセル</button>
                  </div>
                </td>
              </tr>` : ''}
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
                      type="text"
                      inputmode="decimal"
                      autocomplete="off"
                      data-master-level="${part}"
                      value="${row.levels?.[part] != null ? formatLevel(row.levels[part]) : ''}"
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
      </div>
      <div class="admin-master-pager">
        <button id="btnAdminMasterPrev" type="button" ${adminSongPage <= 0 ? 'disabled' : ''}>← 前へ</button>
        <span>${adminSongPage + 1} / ${totalPages}</span>
        <button id="btnAdminMasterNext" type="button" ${adminSongPage + 1 >= totalPages ? 'disabled' : ''}>次へ →</button>
      </div>`;

    if (!rows.length && !adminNewSongRowVisible) {
      $('adminBody').innerHTML = '<div class="empty-state">該当する曲がありません</div>';
      return;
    }

    $('btnAdminMasterPrev')?.addEventListener('click', async () => {
      if (adminSongPage <= 0) return;
      adminSongPage--;
      await loadAdminSongs();
    });

    $('btnAdminMasterNext')?.addEventListener('click', async () => {
      if (adminSongPage + 1 >= totalPages) return;
      adminSongPage++;
      await loadAdminSongs();
    });
  } catch (e) {
    $('adminBody').innerHTML = `<div class="empty-state">取得失敗: ${esc(e.message)}</div>`;
  }
}

async function loadAdminRequests() {
  $('adminBody').classList.remove('admin-body-table');
  $('adminBody').innerHTML = '<div class="empty-state">読み込み中...</div>';
  try {
    adminRequests = await getPendingSongRequests($('adminRequestSearch').value, activeVersionId);
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
          ${req.request_type === 'level_correction'
            ? `<div class="admin-card-title">${esc(req.title)}</div>`
            : `<div class="admin-request-title-wrap">
                <label for="requestTitle_${req.id}">承認する曲名（修正可）</label>
                <input id="requestTitle_${req.id}"
                  class="request-title-edit"
                  type="text"
                  autocomplete="off"
                  maxlength="255"
                  value="${esc(req.title)}">
               </div>`}
          <span class="pending-badge">${req.request_type === 'level_correction' ? '難易度修正' : '新規曲'}</span>
        </div>
        <div class="admin-card-meta">
          <span>${esc(req.part)}</span>
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
            type="text"
            inputmode="decimal"
            autocomplete="off"
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


async function loadAdminFeedback() {
  $('adminBody').classList.remove('admin-body-table');
  $('adminBody').innerHTML = '<div class="empty-state">読み込み中...</div>';

  try {
    const { data, error } = await supabase
      .from('user_feedback')
      .select('id,user_id,category,message,status,created_at,resolved_at,admin_reply,replied_at,device_name,browser_name')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw error;

    // 表示順:
    // 1. 未対応 最新 → 古い
    // 2. 対応済み 最新 → 古い
    adminFeedback = [...(data ?? [])].sort((a, b) => {
      const aDone = a.status === 'resolved' ? 1 : 0;
      const bDone = b.status === 'resolved' ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;

      const aTime = new Date(a.created_at || 0).getTime();
      const bTime = new Date(b.created_at || 0).getTime();
      return bTime - aTime;
    });

    const userIds = [...new Set(adminFeedback.map(row => row.user_id).filter(Boolean))];
    const usernameMap = new Map();

    if (userIds.length) {
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id,username')
        .in('id', userIds);

      if (profileError) throw profileError;
      (profiles ?? []).forEach(profile => usernameMap.set(profile.id, profile.username));
    }

    $('adminBody').innerHTML = adminFeedback.map(item => {
      const isDone = item.status === 'resolved';
      const categoryLabel = item.category === 'bug' ? '不具合' : '要望';
      return `
        <div class="admin-card feedback-admin-card ${isDone ? 'resolved' : ''}">
          <div class="admin-card-top">
            <div class="admin-card-title">
              <span class="feedback-category ${item.category === 'bug' ? 'bug' : 'request'}">${categoryLabel}</span>
              ${esc(usernameMap.get(item.user_id) || 'ユーザー')}
            </div>
            <div class="admin-actions">
              <button
                class="${isDone ? 'admin-reset' : 'admin-edit'}"
                data-admin-feedback-status="${item.id}"
                data-feedback-next-status="${isDone ? 'new' : 'resolved'}">
                ${isDone ? '未対応に戻す' : '対応済みにする'}
              </button>
              <button
                class="admin-delete"
                data-admin-feedback-delete="${item.id}">
                削除
              </button>
            </div>
          </div>
          <div class="feedback-admin-message">${esc(item.message).replace(/\\n/g, '<br>')}</div>
          ${(item.device_name || item.browser_name) ? `
            <div class="feedback-admin-env">
              <strong>ご利用環境</strong><br>
              機種名：${esc(item.device_name || '未入力')}<br>
              ブラウザ：${esc(item.browser_name || '未入力')}
            </div>
          ` : ''}

          ${item.admin_reply ? `
            <div class="feedback-admin-replied">
              <strong>返信済み</strong>
              ${esc(item.admin_reply).replace(/\\n/g, '<br>')}
              ${item.replied_at ? `<div class="admin-card-meta" style="margin-top:5px;">${new Date(item.replied_at).toLocaleString('ja-JP')}</div>` : ''}
            </div>
          ` : `
            <div class="feedback-admin-reply-box">
              <div class="feedback-admin-reply-label">ユーザーへ返信（1回のみ）</div>
              <textarea
                maxlength="2000"
                data-admin-feedback-reply-input="${item.id}"
                placeholder="返信内容を入力してください"></textarea>
              <div class="feedback-admin-reply-actions">
                <button data-admin-feedback-reply="${item.id}">返信する</button>
              </div>
            </div>
          `}

          <div class="admin-card-meta">
            <span>${new Date(item.created_at).toLocaleString('ja-JP')}</span>
            <span>${item.admin_reply ? '返信済み' : (isDone ? '対応済み' : '未対応')}</span>
          </div>
        </div>`;
    }).join('') || '<div class="empty-state">要望・不具合報告はありません</div>';
  } catch (e) {
    $('adminBody').innerHTML = `<div class="empty-state">取得失敗: ${esc(e.message)}</div>`;
  }
}

async function replyAdminFeedbackOnce(id, reply) {
  const cleanReply = String(reply || '').trim();
  if (!cleanReply) throw new Error('返信内容を入力してください。');
  if (cleanReply.length > 2000) throw new Error('返信内容は2000文字以内にしてください。');

  const { data, error } = await supabase
    .from('user_feedback')
    .update({
      admin_reply: cleanReply,
      replied_at: new Date().toISOString()
    })
    .eq('id', id)
    .is('admin_reply', null)
    .select('id');

  if (error) throw error;
  if (!data?.length) {
    throw new Error('この報告には既に返信済みです。追加返信はできません。');
  }

  await loadAdminFeedback();
}

async function updateAdminFeedbackStatus(id, status) {
  const payload = {
    status,
    resolved_at: status === 'resolved' ? new Date().toISOString() : null
  };

  const { error } = await supabase
    .from('user_feedback')
    .update(payload)
    .eq('id', id);

  if (error) throw error;
  await loadAdminFeedback();
}

async function deleteAdminFeedback(id) {
  const ok = await showSiteConfirm(
    'この要望・不具合報告を削除しますか？\n削除したデータは元に戻せません。',
    '削除確認'
  );
  if (!ok) return;

  const { error } = await supabase
    .from('user_feedback')
    .delete()
    .eq('id', id);

  if (error) throw error;
  await loadAdminFeedback();
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
    level: $('adminFormLevel').value,
    versionId: activeVersionId
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
  await showSiteDialog('パスワードを変更しました。', '変更完了');
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
        throw new Error('ユーザー名は1〜32文字で入力してください。日本語も使用できます。');
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
        'そのユーザー名は既に登録されています。',
        '新規登録できません'
      );
    } else if (lower.includes('captcha') || message.includes('セキュリティ確認')) {
      const authCode = e?.code ? `\nエラーコード: ${e.code}` : '';
      console.error('CAPTCHA認証エラー詳細:', {
        code: e?.code,
        message: e?.message,
        status: e?.status
      });
      await showSiteDialog(
        `セキュリティ確認に失敗しました。${authCode}\nCloudflareで成功表示でもこのエラーが続く場合は、Supabase側のCAPTCHA Secret Key設定を確認してください。`,
        'セキュリティ確認エラー'
      );
    } else {
      await showSiteDialog(
        mode === 'register'
          ? '新規登録に失敗しました。入力内容を確認して再度お試しください。'
          : 'ログインに失敗しました。ユーザー名またはパスワードを確認してください。',
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

$('authSwitch').addEventListener('click', () => { showAuth($('authSwitch').dataset.mode).catch(console.error); });

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
  const numericProposedLevel = Number(proposedLevel);
  if (!proposedLevel || !Number.isFinite(numericProposedLevel) || numericProposedLevel <= 0 || numericProposedLevel > 9.99) {
    await showSiteDialog('難易度は0.01～9.99の範囲で入力してください。', '入力エラー');
    return;
  }

  const original = button.textContent;
  try {
    button.disabled = true;
    button.textContent = '送信中';
    await requestSongLevelCorrection({
      songId: selectedSong.id,
      proposedLevel,
      versionId: activeVersionId
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
$('formTitle').addEventListener('input', scheduleSongSuggestions);

// IME変換確定時は待ち時間なしで最新候補を再取得する。
// iPhone/日本語入力で入力完了後に候補が追いつかないケースを減らす。
$('formTitle').addEventListener('compositionend', () => {
  clearTimeout(songSuggestTimer);
  suggestSongs();
});
$('partSelect').addEventListener('change', async () => {
  ++songSuggestRequestSeq;
  clearTimeout(songSuggestTimer);
  await refreshSelectedPart();
  if ($('formTitle').value.trim()) await suggestSongs();
});
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
    await showSiteDialog(
      e?.message || '保存に失敗しました。',
      '保存エラー'
    );
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
$('btnDeleteEditingScore').addEventListener('click', async () => {
  if (!editingScoreId) return;

  const ok = await showSiteConfirm(
    'この登録データを削除しますか？\nこの操作は元に戻せません。',
    '登録データの削除',
    '削除する'
  );
  if (!ok) return;

  const scoreId = editingScoreId;
  try {
    $('btnDeleteEditingScore').disabled = true;
    await deleteScore(scoreId);
    closeModal();
    await loadScores();
  } catch (e) {
    await showSiteDialog('削除に失敗しました: ' + e.message, 'エラー');
  } finally {
    $('btnDeleteEditingScore').disabled = false;
  }
});

$('btnCancelForm').addEventListener('click', closeModal);

$('btnCloseMypage').addEventListener('click', () => closeMyPage(true));

function renderSkillSyncBrowserGuide() {
  const guide = $('skillSyncBrowserGuide');
  if (!guide) return;

  guide.innerHTML =
    '1. 何でもいいので適当にブックマークを作ります。<br>' +
    '2. 「コードをコピー」を押し、1で作成したブックマークのURLの欄に貼り付けます。ブックマークの名前は分かりやすいように好きな文字でOKです👌';
}

function openSkillSyncDialog() {
  closeMenu();
  renderSkillSyncBrowserGuide();
  setSkillSyncStatus('待機中');
  $('skillSyncMask').style.display = 'flex';
  const dialog = document.querySelector('.skill-sync-dialog');
  if (dialog) dialog.scrollTop = 0;
}

function closeSkillSyncDialog(returnToMenu = false) {
  if (skillSyncInProgress) return;
  $('skillSyncMask').style.display = 'none';
  if (returnToMenu) openMenu();
}

$('btnCloseSkillSync').addEventListener('click', () => {
  closeSkillSyncDialog(true);
});

$('skillSyncMask').addEventListener('click', e => {
  if (e.target === $('skillSyncMask') && !skillSyncInProgress) {
    $('skillSyncMask').style.display = 'none';
  }
});

$('btnCopySkillSync').addEventListener('click', async () => {
  try {
    // Android Chromeでは <a>.href を通すと、コード中の ' が %27 に変換される場合がある。
    // ブックマークレットはURL正規化せず、生のJavaScript文字列をそのままコピーする。
    const bookmarklet = buildSkillSyncBookmarklet();

    await navigator.clipboard.writeText(bookmarklet);
    setSkillSyncStatus('同期用コードをコピーしました。ブックマークのURL欄へ貼り付けてください。', 'success');
  } catch (e) {
    setSkillSyncStatus('コードのコピーに失敗しました。ブラウザのクリップボード権限を確認してください。', 'error');
  }
});

$('btnOpenEamusement').addEventListener('click', () => {
  const popup = window.open(getEamusementSyncEntry(), '_blank');
  if (!popup) {
    setSkillSyncStatus('ポップアップがブロックされました。ブラウザのポップアップ許可を確認してください。', 'error');
    return;
  }
  setSkillSyncStatus('e-amusementを開きました。ログイン状態を確認後、コードを設定した同期用ブックマークを実行してください。', 'running');
});

window.addEventListener('message', async event => {
  if (event.origin !== EAMUSEMENT_ORIGIN) return;
  if (event.data?.type !== 'GITADORA_SKILL_SYNC') return;
  await importSkillSyncRecords(event.data);
});

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
        'そのユーザー名は既に登録されています。',
        'ユーザー名を変更できません'
      );
    } else {
      await showSiteDialog('ユーザー名の変更に失敗しました。', 'エラー');
      console.error('ユーザー名変更エラー:', e);
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
    await showSiteDialog(e?.message || 'ログアウトに失敗しました。', 'エラー');
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

$('btnMenuFeedback').addEventListener('click', openFeedback);
$('menuOfuseSupport')?.addEventListener('click', () => {
  closeMenu();
  $('supportMask').style.display = 'flex';
  requestAnimationFrame(syncGlobalModalScrollLock);
});
$('btnCloseSupport')?.addEventListener('click', () => {
  $('supportMask').style.display = 'none';
  openMenu();
  requestAnimationFrame(syncGlobalModalScrollLock);
});

$('btnCloseFeedback').addEventListener('click', () => closeFeedback(true));
$('feedbackMask').addEventListener('click', e => {
  if (e.target === $('feedbackMask')) closeFeedback();
});
$('btnSubmitFeedback').addEventListener('click', submitFeedback);

$('btnAdmin').addEventListener('click', openAdmin);
$('btnAdminBulkDeleteScores')?.addEventListener('click', adminBulkDeleteCurrentScores);
$('btnCloseAdmin').addEventListener('click', closeAdmin);

document.querySelectorAll('.admin-tab').forEach(btn => {
  btn.addEventListener('click', () => switchAdminTab(btn.dataset.adminTab));
});

let adminSongSearchTimer = null;
$('adminSongSearch').addEventListener('input', () => {
  clearTimeout(adminSongSearchTimer);
  adminSongPage = 0;
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

$('btnAdminAddSong').addEventListener('click', async () => {
  adminNewSongRowVisible = true;
  adminSongPage = 0;
  $('adminSongSearch').value = '';
  await loadAdminSongs();
  const titleInput = $('adminBody').querySelector('[data-master-new-row] [data-master-title]');
  titleInput?.focus();
});
$('btnAdminCancelSong').addEventListener('click', closeAdminSongForm);
$('btnAdminSaveSong').addEventListener('click', async () => {
  try {
    $('btnAdminSaveSong').disabled = true;
    await submitAdminSong();
  } catch (e) {
    await showSiteDialog('保存に失敗しました: ' + e.message, 'エラー');
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
    await showSiteDialog('変更に失敗しました: ' + e.message, 'エラー');
  } finally {
    $('btnAdminPasswordSave').disabled = false;
  }
});


let userSearchTimer = null;
$('userSearch').addEventListener('input', () => {
  clearTimeout(userSearchTimer);
  userSearchTimer = setTimeout(() => loadUsers({ resetPage: true }), 250);
});

document.querySelector('.user-list-header')?.addEventListener('click', e => {
  const button = e.target.closest('[data-user-sort]');
  if (!button) return;
  const key = button.dataset.userSort;
  if (userListSort.key === key) {
    userListSort.dir = userListSort.dir === 'desc' ? 'asc' : 'desc';
  } else {
    userListSort.key = key;
    userListSort.dir = key === 'name' ? 'asc' : 'desc';
  }
  userListPage = 0;
  renderUsers();
});
$('userListPager')?.addEventListener('click', e => {
  const numberButton = e.target.closest('[data-user-page-number]');
  const navButton = e.target.closest('[data-user-page]');

  if (numberButton && !numberButton.disabled) {
    const nextPage = Number(numberButton.dataset.userPageNumber);
    const totalPages = Math.max(1, Math.ceil(publicUsers.length / USER_LIST_PAGE_SIZE));
    if (!Number.isInteger(nextPage) || nextPage < 0 || nextPage >= totalPages) return;
    userListPage = nextPage;
  } else if (navButton && !navButton.disabled) {
    if (navButton.dataset.userPage === 'prev' && userListPage > 0) {
      userListPage--;
    } else if (navButton.dataset.userPage === 'next') {
      const totalPages = Math.max(1, Math.ceil(publicUsers.length / USER_LIST_PAGE_SIZE));
      if (userListPage + 1 >= totalPages) return;
      userListPage++;
    } else {
      return;
    }
  } else {
    return;
  }

  renderUsers();
  requestAnimationFrame(scrollUserListPageToTop);
});

$('userListPager')?.addEventListener('change', e => {
  const select = e.target.closest('[data-user-page-select]');
  if (!select) return;

  const nextPage = Number(select.value);
  const totalPages = Math.max(1, Math.ceil(publicUsers.length / USER_LIST_PAGE_SIZE));
  if (!Number.isInteger(nextPage) || nextPage < 0 || nextPage >= totalPages) return;

  userListPage = nextPage;
  renderUsers();
  requestAnimationFrame(scrollUserListPageToTop);
});

$('versionSelect').addEventListener('change', async e => { await switchGameVersion(e.target.value); });

$('btnCloseUserDetail').addEventListener('click', closeUserDetail);
$('userDetailTabs').addEventListener('click', async e => {
  const button = e.target.closest('[data-user-detail-tab]');
  if (!button) return;

  const tab = button.dataset.userDetailTab;
  setUserDetailTab(tab);

  if (tab === 'records' && !viewedUserRegisteredScores.length) {
    await loadViewedUserRegisteredScores();
  }
});

$('btnCloseRateCompare').addEventListener('click', closeRateComparison);
$('rateCompareMask').addEventListener('click', e => {
  if (e.target === $('rateCompareMask')) closeRateComparison();
});

document.addEventListener('click', async e => {
  const adminFeedbackReply = e.target.closest('[data-admin-feedback-reply]');
  if (adminFeedbackReply) {
    const id = adminFeedbackReply.dataset.adminFeedbackReply;
    const input = document.querySelector(`[data-admin-feedback-reply-input="${id}"]`);
    const reply = input?.value || '';

    try {
      if (!reply.trim()) {
        await showSiteDialog('返信内容を入力してください。', '入力エラー');
        return;
      }

      const ok = await showSiteConfirm(
        'この内容で返信しますか？\n返信は1回のみで、送信後の変更・追加返信はできません。',
        '返信確認',
        '返信する'
      );
      if (!ok) return;

      adminFeedbackReply.disabled = true;
      await replyAdminFeedbackOnce(id, reply);
      await showSiteDialog('返信しました。', '返信完了');
    } catch (error) {
      await showSiteDialog(error?.message || '返信に失敗しました。', 'エラー');
      if (adminFeedbackReply.isConnected) adminFeedbackReply.disabled = false;
    }
    return;
  }

  const adminFeedbackDelete = e.target.closest('[data-admin-feedback-delete]');
  if (adminFeedbackDelete) {
    try {
      adminFeedbackDelete.disabled = true;
      await deleteAdminFeedback(adminFeedbackDelete.dataset.adminFeedbackDelete);
    } catch (error) {
      await showSiteDialog(error?.message || '削除に失敗しました。', 'エラー');
    } finally {
      // キャンセル時は一覧を再描画しないため、押したボタンが残る。
      // その場合も必ず再度押せる状態へ戻す。
      if (adminFeedbackDelete.isConnected) {
        adminFeedbackDelete.disabled = false;
      }
    }
    return;
  }

  const adminFeedbackStatus = e.target.closest('[data-admin-feedback-status]');
  if (adminFeedbackStatus) {
    try {
      adminFeedbackStatus.disabled = true;
      await updateAdminFeedbackStatus(
        adminFeedbackStatus.dataset.adminFeedbackStatus,
        adminFeedbackStatus.dataset.feedbackNextStatus
      );
    } catch (error) {
      await showSiteDialog(error?.message || '更新に失敗しました。', 'エラー');
      adminFeedbackStatus.disabled = false;
    }
    return;
  }

  const suggestion = e.target.closest('.suggestion');
  const instrumentButton = e.target.closest('[data-instrument]');
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
  const favoriteOpen = e.target.closest('[data-favorite-open]');
  const favoriteRemove = e.target.closest('[data-favorite-remove]');
  const compareCard = e.target.closest('[data-compare-song]');
  const adminRegisterMasterRow = e.target.closest('[data-admin-register-master-row]');
  const adminCancelMasterRow = e.target.closest('[data-admin-cancel-master-row]');
  const adminSaveMasterRow = e.target.closest('[data-admin-save-master-row]');
  const adminDeleteMasterRow = e.target.closest('[data-admin-delete-master-row]');

  if (instrumentButton) { await switchInstrument(instrumentButton.dataset.instrument); return; }

  if (favoriteToggle) {
    e.preventDefault();
    e.stopPropagation();
    await toggleFavorite(favoriteToggle.dataset.favoriteUser, favoriteToggle.dataset.favoriteInstrument || activeInstrument);
    return;
  }

  if (userOpen && !favoriteToggle) {
    await openUserDetail(userOpen.dataset.userOpen, userOpen.dataset.userName);
    return;
  }
  if (favoriteOpen) {
    await openFavoriteUserDetail(
      favoriteOpen.dataset.favoriteOpen,
      favoriteOpen.dataset.favoriteName,
      favoriteOpen.dataset.favoriteViewInstrument || activeInstrument
    );
    return;
  }

  if (favoriteRemove) {
    await removeFavorite(
      favoriteRemove.dataset.favoriteRemove,
      favoriteRemove.dataset.favoriteInstrument || 'GF'
    );
    await Promise.all([loadFavorites(), loadUsers()]);
    return;
  }

  if (suggestion) {
    if (suggestion.dataset.requestTitle) {
      $('formTitle').value = suggestion.dataset.requestTitle;
      $('songSuggestions').innerHTML = '';
      await refreshSelectedPart();
    } else {
      await selectSongTitle(suggestion.dataset.title);
    }
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
    const ok = await showSiteConfirm(
      'この登録データを削除しますか？\nこの操作は元に戻せません。',
      '登録データの削除',
      '削除する'
    );
    if (!ok) return;

    try {
      await deleteScore(del.dataset.delete);
      await loadScores();
    } catch (e) {
      await showSiteDialog('削除に失敗しました: ' + e.message, 'エラー');
    }
  }

  if (adminRegisterMasterRow) {
    const tr = adminRegisterMasterRow.closest('tr[data-master-new-row]');
    if (!tr) return;

    const levels = {};
    MASTER_PARTS.forEach(part => {
      levels[part] = tr.querySelector(`[data-master-level="${part}"]`)?.value ?? '';
    });

    try {
      adminRegisterMasterRow.disabled = true;
      await saveMasterSongRow({
        originalTitle: '',
        title: tr.querySelector('[data-master-title]').value,
        isHot: tr.querySelector('[data-master-hot]').checked,
        levels
      });
      adminNewSongRowVisible = false;
      await loadAdminSongs();
      await showSiteDialog('新規曲を登録しました。', '登録完了');
    } catch (e) {
      await showSiteDialog('新規曲の登録に失敗しました: ' + e.message, 'エラー');
    } finally {
      if (adminRegisterMasterRow.isConnected) {
        adminRegisterMasterRow.disabled = false;
      }
    }
    return;
  }

  if (adminCancelMasterRow) {
    adminNewSongRowVisible = false;
    await loadAdminSongs();
    return;
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
      await showSiteDialog('曲マスター保存に失敗しました: ' + e.message, 'エラー');
    } finally {
      adminSaveMasterRow.disabled = false;
    }
  }

  if (adminDeleteMasterRow) {
    const tr = adminDeleteMasterRow.closest('tr[data-master-row]');
    if (!tr) return;
    const title = tr.dataset.originalTitle;
    if (!await showSiteConfirm(
      `「${title}」の全パートを曲マスターから削除しますか？\n登録済みユーザー記録も影響を受けるため注意してください。`,
      '曲マスター削除',
      '削除する'
    )) return;

    try {
      await deleteMasterSongTitle(title);
      await loadAdminSongs();
    } catch (e) {
      await showSiteDialog('曲マスター削除に失敗しました: ' + e.message, 'エラー');
    }
  }

  if (adminEditSong) {
    const song = adminSongs.find(s => s.id === adminEditSong.dataset.adminEditSong);
    if (song) openAdminSongForm(song);
  }

  if (adminDeleteSong) {
    const song = adminSongs.find(s => s.id === adminDeleteSong.dataset.adminDeleteSong);
    if (!song) return;
    if (!await showSiteConfirm(
      `「${song.title} / ${song.part}」を曲マスターから削除しますか？\nこの譜面を登録しているユーザーの記録も削除されます。`,
      '曲マスター削除',
      '削除する'
    )) return;
    try {
      await deleteMasterSong(song.id);
      await loadAdminSongs();
    } catch (e) {
      await showSiteDialog('削除に失敗しました: ' + e.message, 'エラー');
    }
  }

  if (adminApproveRequest) {
    try {
      const requestId = adminApproveRequest.dataset.adminApproveRequest;
      const req = adminRequests.find(r => r.id === requestId);
      const level = $(`requestLevel_${requestId}`).value;
      const title = req?.request_type === 'level_correction'
        ? req.title
        : ($(`requestTitle_${requestId}`)?.value || '').trim();

      const numericLevel = Number(level);
      if (!title) throw new Error('承認する曲名を入力してください。');
      if (!Number.isFinite(numericLevel) || numericLevel <= 0 || numericLevel > 9.99) {
        throw new Error('難易度は0.01～9.99の範囲で入力してください。');
      }

      const changed = Boolean(req && title !== req.title);
      const confirmText = changed
        ? `曲名を「${req.title}」から「${title}」へ修正して、OTHERとして承認しますか？`
        : 'この登録依頼をOTHERとして承認しますか？';
      if (!await showSiteConfirm(confirmText, '登録依頼の承認', '承認する')) return;

      if (req?.request_type === 'level_correction') {
        await approveSongRequest(requestId, level, false);
      } else {
        const { error } = await supabase.rpc('approve_song_request_with_title', {
          p_request_id: requestId,
          p_title: title,
          p_level: numericLevel,
          p_is_hot: false
        });
        if (error) throw error;
      }
      await loadAdminRequests();
    } catch (e) {
      await showSiteDialog('承認に失敗しました: ' + e.message, 'エラー');
    }
  }

  if (adminHotRequest) {
    try {
      const requestId = adminHotRequest.dataset.adminHotRequest;
      const req = adminRequests.find(r => r.id === requestId);
      const level = $(`requestLevel_${requestId}`).value;
      const title = req?.request_type === 'level_correction'
        ? req.title
        : ($(`requestTitle_${requestId}`)?.value || '').trim();

      const numericLevel = Number(level);
      if (!title) throw new Error('承認する曲名を入力してください。');
      if (!Number.isFinite(numericLevel) || numericLevel <= 0 || numericLevel > 9.99) {
        throw new Error('難易度は0.01～9.99の範囲で入力してください。');
      }

      const changed = Boolean(req && title !== req.title);
      const confirmText = changed
        ? `曲名を「${req.title}」から「${title}」へ修正して、HOT曲として承認しますか？`
        : 'この登録依頼をHOT曲として承認しますか？';
      if (!await showSiteConfirm(confirmText, 'HOT承認', '承認する')) return;

      if (req?.request_type === 'level_correction') {
        await approveSongRequest(requestId, level, true);
      } else {
        const { error } = await supabase.rpc('approve_song_request_with_title', {
          p_request_id: requestId,
          p_title: title,
          p_level: numericLevel,
          p_is_hot: true
        });
        if (error) throw error;
      }
      await loadAdminRequests();
    } catch (e) {
      await showSiteDialog('HOT承認に失敗しました: ' + e.message, 'エラー');
    }
  }

  if (adminRejectRequest) {
    if (!await showSiteConfirm('この登録依頼を却下しますか？', '登録依頼の却下', '却下する')) return;
    try {
      await rejectSongRequest(adminRejectRequest.dataset.adminRejectRequest);
      await loadAdminRequests();
    } catch (e) {
      await showSiteDialog('却下に失敗しました: ' + e.message, 'エラー');
    }
  }

  if (adminDeleteUser) {
    const user = adminUsers.find(u => u.id === adminDeleteUser.dataset.adminDeleteUser);
    if (!user) return;
    if (!await showSiteConfirm(
      `ユーザー「${user.username}」を削除しますか？\n登録スコアも削除され、元に戻せません。`,
      'ユーザー削除',
      '削除する'
    )) return;
    try {
      await accountAdmin('delete_user', { target_user_id: user.id });
      await loadAdminUsers();
    } catch (e) {
      await showSiteDialog('ユーザー削除に失敗しました: ' + e.message, 'エラー');
    }
  }

  if (adminResetUser) {
    openAdminPassword(adminResetUser.dataset.adminResetUser);
  }
});



$('btnIntroLogin').addEventListener('click', () => { showAuth('login').catch(console.error); });
$('btnIntroRegister').addEventListener('click', () => { showAuth('register').catch(console.error); });
$('btnMenu').addEventListener('click', openMenu);
$('btnCloseMenu').addEventListener('click', closeMenu);
$('menuMask').addEventListener('click', e => { if (e.target === $('menuMask')) closeMenu(); });
$('btnMenuMypage').addEventListener('click', async () => { closeMenu(); await openMyPage(true); });
$('btnMenuFeatureSettings').addEventListener('click', openFeatureSettings);
$('btnCloseFeatureSettings').addEventListener('click', () => closeFeatureSettings(true));
$('featureSettingsMask').addEventListener('click', e => {
  if (e.target === $('featureSettingsMask')) closeFeatureSettings();
});
$('btnSaveFeatureSettings').addEventListener('click', saveFeatureSettings);
$('settingLightMode').addEventListener('change', e => {
  applyLightMode(e.target.checked);
});
$('btnSaveXId').addEventListener('click', saveMyXId);

$('btnMenuSkillSync').addEventListener('click', openSkillSyncDialog);
$('btnMenuShareSkill').addEventListener('click', () => { closeMenu(); shareSkillImage(); });
$('btnMenuRivals').addEventListener('click', openRivalManage);
$('btnMenuHowTo').addEventListener('click', openHowTo);
$('btnCloseHowTo').addEventListener('click', () => closeHowTo(true));
$('howToMask').addEventListener('click', e => { if (e.target === $('howToMask')) closeHowTo(); });
$('btnCloseRivalManage').addEventListener('click', () => closeRivalManage(true));
$('rivalManageMask').addEventListener('click', e => { if (e.target === $('rivalManageMask')) closeRivalManage(); });

$('siteDialogOk').addEventListener('click', () => closeSiteDialog(true));
$('siteDialogInput').addEventListener('keydown', e => { if (e.key === 'Enter') closeSiteDialog(true); });
$('siteDialogCancel').addEventListener('click', () => closeSiteDialog(false));
$('siteDialogMask').addEventListener('click', e => {
  if (e.target === $('siteDialogMask')) closeSiteDialog(siteDialogConfirmMode ? false : true);
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

// モーダル表示中は背面のメイン画面をスクロールさせない。
// style/classの切替を監視するため、登録曲詳細・マイページ・エラー等にも共通適用。
const modalScrollObserver = new MutationObserver(() => {
  requestAnimationFrame(syncGlobalModalScrollLock);
});

GLOBAL_SCROLL_LOCK_OVERLAYS.forEach(selector => {
  const element = document.querySelector(selector);
  if (element) {
    modalScrollObserver.observe(element, {
      attributes: true,
      attributeFilter: ['style', 'class']
    });
  }
});
requestAnimationFrame(syncGlobalModalScrollLock);

// ヘッダーの実際の高さを使ってユーザーリスト固定位置を決める。
window.addEventListener('resize', syncAppStickyHeaderHeight);
window.addEventListener('orientationchange', () => setTimeout(syncAppStickyHeaderHeight, 80));

const appHeaderResizeObserver = typeof ResizeObserver !== 'undefined'
  ? new ResizeObserver(() => syncAppStickyHeaderHeight())
  : null;
const appStickyHeader = document.querySelector('.p-header');
if (appStickyHeader && appHeaderResizeObserver) {
  appHeaderResizeObserver.observe(appStickyHeader);
}
requestAnimationFrame(syncAppStickyHeaderHeight);

document.body.classList.remove('light-mode');

init().catch(err => {
  console.error(err);
  showSiteDialog('初期化に失敗しました: ' + err.message, '初期化エラー');
});
