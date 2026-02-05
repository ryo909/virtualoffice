// storage.js - localStorage utilities

const KEYS = {
  SESSION_ID: 'office.session_id',
  SHARED_PASSWORD: 'office.shared_password',
  DISPLAY_NAME: 'office.display_name',
  THEME_ID: 'office.theme_id',
  TIME_MODE: 'vo:timeMode'
};

export function getSessionId() {
  return localStorage.getItem(KEYS.SESSION_ID);
}

export function setSessionId(id) {
  localStorage.setItem(KEYS.SESSION_ID, id);
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
