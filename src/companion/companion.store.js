const HISTORY_KEY = 'companion:history:v1';
const UNREAD_KEY = 'companion:unread:v1';
const SETTINGS_KEY = 'companion:settings:v1';
const UI_KEY = 'companion:ui:v1';
const MIGRATED_FLAG_KEY = 'companion:settings:migrated:v1';

// localStorage key extraction note:
// grep -RIn "localStorage" src/companion/voicechat/js/app.js src/companion/voicechat/js/*.js
// -> no matches in copied voicechat assets (app.js / dialogue.js / tts.js)

const LEGACY_SETTING_KEYS = [
    'companion:settings',
    'companion.settings.v1',
    'voicechat:settings:v1'
];

const DEFAULT_SETTINGS = {
    displayName: 'もちまる',
    avatarImage: null,
    bubbleX: 0,
    bubbleY: 0,
    bubbleScale: 1.0,
    ttsEnabled: false,
    ttsVoiceURI: '',
    ttsRate: 1.0,
    ttsPitch: 1.0
};

const DEFAULT_UI = {
    isOpen: false,
    activeTab: 'chat'
};

function safeParseJson(raw, fallback) {
    try {
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
}

function safeGetItem(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function safeSetItem(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch {
        // non-fatal
    }
}

function toFiniteNumber(value, fallback, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    if (Number.isFinite(min) && n < min) return min;
    if (Number.isFinite(max) && n > max) return max;
    return n;
}

function normalizeSettings(input) {
    const safe = (input && typeof input === 'object') ? input : {};

    // Backward compatibility for previous field names.
    const displayName = typeof safe.displayName === 'string'
        ? safe.displayName
        : typeof safe.characterName === 'string'
            ? safe.characterName
            : DEFAULT_SETTINGS.displayName;

    const avatarImage = typeof safe.avatarImage === 'string'
        ? safe.avatarImage
        : typeof safe.characterImageDataUrl === 'string'
            ? safe.characterImageDataUrl
            : null;

    const ttsVoiceURI = typeof safe.ttsVoiceURI === 'string'
        ? safe.ttsVoiceURI
        : typeof safe.ttsVoiceUri === 'string'
            ? safe.ttsVoiceUri
            : '';

    return {
        displayName: displayName.trim() ? displayName.trim().slice(0, 30) : DEFAULT_SETTINGS.displayName,
        avatarImage: avatarImage && avatarImage.trim() ? avatarImage : null,
        bubbleX: toFiniteNumber(safe.bubbleX, DEFAULT_SETTINGS.bubbleX, -160, 160),
        bubbleY: toFiniteNumber(safe.bubbleY, DEFAULT_SETTINGS.bubbleY, -160, 160),
        bubbleScale: toFiniteNumber(safe.bubbleScale, DEFAULT_SETTINGS.bubbleScale, 0.6, 1.6),
        ttsEnabled: Boolean(safe.ttsEnabled),
        ttsVoiceURI,
        ttsRate: toFiniteNumber(safe.ttsRate, DEFAULT_SETTINGS.ttsRate, 0.6, 1.6),
        ttsPitch: toFiniteNumber(safe.ttsPitch, DEFAULT_SETTINGS.ttsPitch, 0.6, 1.6)
    };
}

function normalizeUi(input) {
    const safe = (input && typeof input === 'object') ? input : {};
    return {
        isOpen: Boolean(safe.isOpen),
        activeTab: safe.activeTab === 'settings' ? 'settings' : 'chat'
    };
}

export function loadHistory(maxHistory = 120) {
    const raw = safeGetItem(HISTORY_KEY);
    if (!raw) return [];

    const parsed = safeParseJson(raw, []);
    if (!Array.isArray(parsed)) return [];

    return parsed
        .filter((item) => item && typeof item === 'object')
        .map((item) => ({
            id: String(item.id || ''),
            role: item.role === 'user' ? 'user' : 'ai',
            text: typeof item.text === 'string' ? item.text : '',
            ts: Number(item.ts) || Date.now()
        }))
        .filter((item) => item.text.trim().length > 0)
        .slice(-maxHistory);
}

export function saveHistory(messages, maxHistory = 120) {
    const list = Array.isArray(messages) ? messages.slice(-maxHistory) : [];
    safeSetItem(HISTORY_KEY, JSON.stringify(list));
}

export function loadUnread() {
    const value = Number(safeGetItem(UNREAD_KEY));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function saveUnread(unread) {
    const value = Number.isFinite(Number(unread)) ? Math.max(0, Math.floor(Number(unread))) : 0;
    safeSetItem(UNREAD_KEY, String(value));
}

export function loadSettings() {
    const raw = safeGetItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return normalizeSettings(safeParseJson(raw, DEFAULT_SETTINGS));
}

export function saveSettings(next) {
    const normalized = normalizeSettings(next);
    safeSetItem(SETTINGS_KEY, JSON.stringify(normalized));
    return normalized;
}

export function resetSettings() {
    const defaults = { ...DEFAULT_SETTINGS };
    safeSetItem(SETTINGS_KEY, JSON.stringify(defaults));
    return defaults;
}

export function loadUiState() {
    const raw = safeGetItem(UI_KEY);
    if (!raw) return { ...DEFAULT_UI };
    return normalizeUi(safeParseJson(raw, DEFAULT_UI));
}

export function saveUiState(next) {
    const normalized = normalizeUi(next);
    safeSetItem(UI_KEY, JSON.stringify(normalized));
    return normalized;
}

export function migrateIfNeeded() {
    if (safeGetItem(MIGRATED_FLAG_KEY) === '1') return;

    if (safeGetItem(SETTINGS_KEY)) {
        safeSetItem(MIGRATED_FLAG_KEY, '1');
        return;
    }

    for (const key of LEGACY_SETTING_KEYS) {
        const raw = safeGetItem(key);
        if (!raw) continue;

        const migrated = normalizeSettings(safeParseJson(raw, null));
        safeSetItem(SETTINGS_KEY, JSON.stringify(migrated));
        break;
    }

    safeSetItem(MIGRATED_FLAG_KEY, '1');
}

export function getDefaultSettings() {
    return { ...DEFAULT_SETTINGS };
}

export function getDefaultUiState() {
    return { ...DEFAULT_UI };
}
