// storage.js - localStorage utilities

import { generateSessionId } from './ids.js';

const KEYS = {
  SESSION_ID: 'office.session_id',
  SHARED_PASSWORD: 'office.shared_password',
  DISPLAY_NAME: 'office.display_name',
  THEME_ID: 'office.theme_id',
  TIME_MODE: 'vo:timeMode'
};

const SESS_RE = /^sess_[0-9a-fA-F-]{10,}$/;

function normalizeSessionId(sessionId) {
  if (typeof sessionId === 'string' && SESS_RE.test(sessionId)) return sessionId;
  return generateSessionId();
}

export function getSessionId() {
  const raw = localStorage.getItem(KEYS.SESSION_ID);
  return ensureSessFormat(raw);
}

export function setSessionId(id) {
  localStorage.setItem(KEYS.SESSION_ID, normalizeSessionId(id));
}

export function ensureSessFormat(sessionId) {
  const sid = normalizeSessionId(sessionId);
  if (sid !== sessionId) {
    setSessionId(sid);
  }
  return sid;
}

export function getSavedPassword() {
  return localStorage.getItem(KEYS.SHARED_PASSWORD);
}

export function setSavedPassword(pw) {
  localStorage.setItem(KEYS.SHARED_PASSWORD, pw);
}

export function clearSavedPassword() {
  localStorage.removeItem(KEYS.SHARED_PASSWORD);
}

export function getDisplayName() {
  return localStorage.getItem(KEYS.DISPLAY_NAME);
}

export function setDisplayName(name) {
  localStorage.setItem(KEYS.DISPLAY_NAME, name);
}

export function getThemeId() {
  return localStorage.getItem(KEYS.THEME_ID);
}

export function setThemeId(id) {
  localStorage.setItem(KEYS.THEME_ID, id);
}

export function getTimeMode() {
  const id = localStorage.getItem(KEYS.TIME_MODE);
  if (id === 'day' || id === 'dusk' || id === 'night') return id;
  return 'day';
}

export function setTimeMode(id) {
  if (id !== 'day' && id !== 'dusk' && id !== 'night') return;
  localStorage.setItem(KEYS.TIME_MODE, id);
}

export function clearAll() {
  Object.values(KEYS).forEach(key => localStorage.removeItem(key));
}
