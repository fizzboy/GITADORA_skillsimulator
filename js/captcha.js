import { TURNSTILE_SITE_KEY } from './config.js';

let widgetId = null;
let currentToken = '';
let tokenWaiters = [];

function resolveWaiters(token) {
  const waiters = tokenWaiters;
  tokenWaiters = [];
  waiters.forEach(({ resolve, timer }) => {
    clearTimeout(timer);
    resolve(token);
  });
}

function rejectWaiters(error) {
  const waiters = tokenWaiters;
  tokenWaiters = [];
  waiters.forEach(({ reject, timer }) => {
    clearTimeout(timer);
    reject(error);
  });
}

async function waitForTurnstileApi() {
  for (let i = 0; i < 100; i++) {
    if (window.turnstile) return window.turnstile;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('セキュリティ認証の読み込みに失敗しました。ページを再読み込みしてください。');
}

export async function initCaptcha() {
  const container = document.getElementById('turnstileContainer');
  if (!container || widgetId !== null) return;

  const turnstile = await waitForTurnstileApi();
  widgetId = turnstile.render(container, {
    sitekey: TURNSTILE_SITE_KEY,
    theme: 'dark',
    size: 'flexible',
    callback(token) {
      currentToken = token;
      resolveWaiters(token);
    },
    'expired-callback'() {
      currentToken = '';
    },
    'error-callback'() {
      currentToken = '';
      rejectWaiters(new Error('セキュリティ認証に失敗しました。もう一度お試しください。'));
    }
  });
}

export async function getCaptchaToken({ fresh = false } = {}) {
  await initCaptcha();
  const turnstile = await waitForTurnstileApi();

  if (fresh && widgetId !== null) {
    currentToken = '';
    turnstile.reset(widgetId);
  }

  if (currentToken) return currentToken;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      tokenWaiters = tokenWaiters.filter(w => w.timer !== timer);
      reject(new Error('セキュリティ認証が完了していません。認証後にもう一度お試しください。'));
    }, 30000);
    tokenWaiters.push({ resolve, reject, timer });
  });
}

export async function resetCaptcha() {
  currentToken = '';
  if (widgetId === null) return;
  const turnstile = await waitForTurnstileApi();
  turnstile.reset(widgetId);
}
