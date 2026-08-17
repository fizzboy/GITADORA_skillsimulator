
import { supabase } from './supabase.js';

const USERNAME_DOMAIN = 'users.gd-pocket-board.local';

export function usernameToEmail(username) {
  const clean = username.trim().toLowerCase();
  return `${clean}@${USERNAME_DOMAIN}`;
}

export function validateUsername(username) {
  return /^[a-zA-Z0-9_]{3,32}$/.test(username);
}

export function generateInitialPassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, v => chars[v % chars.length]).join('');
}

export async function register(username, password) {
  if (!validateUsername(username)) {
    throw new Error('登録名は半角英数字と _ を使用して3〜32文字で入力してください。');
  }
  const email = usernameToEmail(username);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } }
  });
  if (error) throw error;
  return data;
}

export async function login(username, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password
  });
  if (error) throw error;
  return data;
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
