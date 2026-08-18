import { supabase } from './supabase.js';

const USERNAME_DOMAIN = 'users.gd-pocket-board.local';

export function normalizeUsername(username) {
  return String(username ?? '').normalize('NFKC').trim();
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
  const clean = normalizeUsername(username).toLowerCase();
  const bytes = new TextEncoder().encode(clean);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `u_${hex}@${USERNAME_DOMAIN}`;
}

export async function register(username, password) {
  const clean = normalizeUsername(username);
  if (!validateUsername(clean)) {
    throw new Error('アカウント名は1〜32文字で入力してください。日本語も使用できます。');
  }

  const email = await hashedUsernameToEmail(clean);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username: clean } }
  });

  if (error) throw error;
  return data;
}

export async function login(username, password) {
  const clean = normalizeUsername(username);
  if (!validateUsername(clean)) {
    throw new Error('アカウント名を入力してください。');
  }

  // v13以降のアカウント
  const hashedEmail = await hashedUsernameToEmail(clean);
  let result = await supabase.auth.signInWithPassword({
    email: hashedEmail,
    password
  });

  if (!result.error) return result.data;

  // v9以前に作った半角英数字ユーザーとの互換性
  if (/^[A-Za-z0-9_]{3,32}$/.test(clean)) {
    const legacyEmail = legacyUsernameToEmail(clean);
    result = await supabase.auth.signInWithPassword({
      email: legacyEmail,
      password
    });
    if (!result.error) return result.data;
  }

  throw result.error;
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
