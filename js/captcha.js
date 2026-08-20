import { TURNSTILE_SITE_KEY } from './config.js';

let widgetId = null;
let captchaToken = '';
let renderPromise = null;
let tokenWaiters = [];

const $ = id => document.getElementById(id);

function setStatus(message = '', isError = false) {
  const el = $('authCaptchaStatus');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('error', Boolean(isError));
}

function resolveWaiters(token) {
  const waiters = tokenWaiters.splice(0);
  waiters.forEach(({ resolve }) => resolve(token));
}

function rejectWaiters(error) {
  const waiters = tokenWaiters.splice(0);
  waiters.forEach(({ reject }) => reject(error));
}

async function waitForTurnstile(timeoutMs = 15000) {
  const started = Date.now();
  while (!window.turnstile) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('セキュリティ確認の読み込みに失敗しました。ページを再読み込みしてください。');
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

export async function initAuthCaptcha() {
  if (widgetId !== null) return widgetId;
  if (renderPromise) return renderPromise;

  renderPromise = (async () => {
    await waitForTurnstile();
    const container = $('authTurnstile');
    if (!container) throw new Error('セキュリティ確認欄を初期化できません。');

    widgetId = window.turnstile.render(container, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: 'dark',
      size: window.innerWidth < 360 ? 'compact' : 'flexible',
      appearance: 'always',
      retry: 'auto',
      callback(token) {
        captchaToken = token || '';
        setStatus('');
        if (captchaToken) resolveWaiters(captchaToken);
      },
      'expired-callback'() {
        captchaToken = '';
        setStatus('セキュリティ確認の有効期限が切れました。再確認しています。');
      },
      'timeout-callback'() {
        captchaToken = '';
        setStatus('セキュリティ確認がタイムアウトしました。再確認してください。', true);
      },
      'error-callback'(code) {
        captchaToken = '';
        const error = new Error(`セキュリティ確認に失敗しました。(${code})`);
        setStatus('セキュリティ確認に失敗しました。ページを再読み込みするか、しばらくして再度お試しください。', true);
        rejectWaiters(error);
        return true;
      }
    });

    return widgetId;
  })();

  try {
    return await renderPromise;
  } finally {
    renderPromise = null;
  }
}

export async function prepareAuthCaptcha() {
  const alreadyRendered = widgetId !== null;
  await initAuthCaptcha();

  // 初回描画時はrender自身がチャレンジを開始する。
  // 2回目以降だけ1回resetし、前回の使用済みtokenを必ず破棄する。
  if (alreadyRendered) {
    captchaToken = '';
    setStatus('');
    if (widgetId !== null && window.turnstile) {
      window.turnstile.reset(widgetId);
    }
  }
}

export async function resetAuthCaptcha() {
  captchaToken = '';
  setStatus('');
  await initAuthCaptcha();
  if (widgetId !== null && window.turnstile) {
    window.turnstile.reset(widgetId);
  }
}

export async function getAuthCaptchaToken(timeoutMs = 30000) {
  await initAuthCaptcha();
  if (captchaToken) return captchaToken;

  setStatus('セキュリティ確認中...');

  return new Promise((resolve, reject) => {
    const waiter = { resolve, reject };
    tokenWaiters.push(waiter);

    const timer = setTimeout(() => {
      const index = tokenWaiters.indexOf(waiter);
      if (index >= 0) tokenWaiters.splice(index, 1);
      reject(new Error('セキュリティ確認が完了していません。確認後、もう一度お試しください。'));
    }, timeoutMs);

    waiter.resolve = token => {
      clearTimeout(timer);
      resolve(token);
    };
    waiter.reject = error => {
      clearTimeout(timer);
      reject(error);
    };
  });
}
