import { supabase } from './supabase.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js?v=17_0';

const USERNAME_DOMAIN = 'users.gd-pocket-board.local';


async function authRequest(path, body) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      payload?.msg ||
      payload?.message ||
      payload?.error_description ||
      payload?.error ||
      `Authentication failed (${response.status})`
    );
    error.code = payload?.code || payload?.error_code || '';
    error.status = response.status;
    throw error;
  }

  return payload;
}

function captchaSecurity(captchaToken) {
  const token = String(captchaToken || '').trim();
  if (!token) {
    const error = new Error('セキュリティ確認トークンを取得できませんでした。');
    error.code = 'captcha_token_missing';
    throw error;
  }
  return { captcha_token: token };
}

async function persistAuthSession(payload) {
  const accessToken = payload?.access_token;
  const refreshToken = payload?.refresh_token;
  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    });
    if (error) throw error;
    return data;
  }
  return {
    user: payload?.user || null,
    session: null
  };
}

export function normalizeUsername(username) {
  return String(username ?? '').trim();
}

export function validateUsername(username) {
  const clean = normalizeUsername(username);
  const length = Array.from(clean).length;
  if (length < 1 || length > 32) return false;
  if (/[\u0000-\u001F\u007F]/.test(clean)) return false;
  return true;
}

function legacyUsernameToEmail(username) {
  const clean = normalizeUsername(username).toLowerCase();
  return `${clean}@${USERNAME_DOMAIN}`;
}

async function hashedUsernameToEmail(username) {
  const clean = normalizeUsername(username);
  const bytes = new TextEncoder().encode(clean);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `u_${hex}@${USERNAME_DOMAIN}`;
}

export async function register(username, password, captchaToken) {
  const clean = normalizeUsername(username);
  if (!validateUsername(clean)) {
    throw new Error('ユーザー名は1〜32文字で入力してください。日本語も使用できます。');
  }

  const email = await hashedUsernameToEmail(clean);
  const payload = await authRequest('signup', {
    email,
    password,
    data: { username: clean },
    gotrue_meta_security: captchaSecurity(captchaToken)
  });

  return await persistAuthSession(payload);
}

export async function login(username, password, getCaptchaToken, resetCaptcha) {
  const clean = normalizeUsername(username);
  if (!validateUsername(clean)) {
    throw new Error('アカウント名を入力してください。');
  }

  const isCaptchaError = error => {
    const text = `${error?.message || ''} ${error?.code || ''}`.toLowerCase();
    return text.includes('captcha');
  };

  const signIn = async email => {
    const captchaToken = await getCaptchaToken();

    try {
      const payload = await authRequest('token?grant_type=password', {
        email,
        password,
        gotrue_meta_security: captchaSecurity(captchaToken)
      });
      const data = await persistAuthSession(payload);
      return { data, error: null };
    } catch (error) {
      if (resetCaptcha) await resetCaptcha();
      return { data: null, error };
    }
  };

  // v15.3以降: 大文字小文字を区別したアカウント
  const hashedEmail = await hashedUsernameToEmail(clean);
  let result = await signIn(hashedEmail);
  if (!result.error) return result.data;
  if (isCaptchaError(result.error)) throw result.error;

  const firstError = result.error;

  // v13〜v15.2で作成した「大文字小文字を区別しないhash」アカウントとの互換性
  const oldCaseInsensitive = normalizeUsername(clean).toLowerCase();
  const bytes = new TextEncoder().encode(oldCaseInsensitive);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  const oldHashedEmail = `u_${hex}@${USERNAME_DOMAIN}`;

  if (oldHashedEmail !== hashedEmail) {
    result = await signIn(oldHashedEmail);
    if (!result.error) return result.data;
    if (isCaptchaError(result.error)) throw result.error;
  }

  // v9以前に作った半角英数字ユーザーとの互換性
  if (/^[A-Za-z0-9_]{3,32}$/.test(clean)) {
    const legacyEmail = legacyUsernameToEmail(clean);
    result = await signIn(legacyEmail);
    if (!result.error) return result.data;
    if (isCaptchaError(result.error)) throw result.error;
  }

  throw firstError;
}

export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function changePassword(password) {
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  return data;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}
