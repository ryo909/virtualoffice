import { DialogueSystem } from './voicechat/js/dialogue.js';
import {
    loadUnread,
    saveUnread,
    migrateIfNeeded,
    loadUiState,
    saveUiState
} from './companion.store.js';
import './companion.ui.css';

const CHAT_LS_KEY = 'companion:chatlog:v1';
const MAX_CHAT_LOG = 200;
const RECENT_BOT_REPLIES_KEY = 'companion:recentBotReplies:v1';
const RECENT_BOT_REPLIES_LIMIT = 10;
const MIN_CONTEXT_TURNS = 6;
const GREETED_FLAG_KEY = 'companionHasGreeted';
const INITIAL_GREETING = 'やあ。来てくれたんだね';
const DEFAULT_MASCOT_URL = new URL('mascot.png', document.baseURI).toString();
console.log('[MASCOT_DEFAULT]', DEFAULT_MASCOT_URL);
const MIN_TYPING_MS = 600;
const IDLE_MS = 90_000;
const IDLE_CHECK_MS = 10_000;
const PROACTIVE_PROB = 0.25;
const PROACTIVE_COOLDOWN_MS = 240_000;
const PROACTIVE_AFTER_SEND_GRACE_MS = 30_000;
const REACTION_MS = 1800;
const REACTION_MAP = {
    reply: ['😊', 'うん', 'なるほど', '！'],
    proactive: ['👋', 'ふむ…', 'どう？', '！'],
    typing: ['…', '🤔', '考え中']
};
const DEDUP_CATEGORY_LINES = {
    thanks: [
        'どういたしまして。いつでも呼んでね。',
        'うれしい。こちらこそありがとう。',
        'その一言、すごく励みになるよ。'
    ],
    morning: [
        'おはよう。今日はどこから始めようか？',
        'おはよう。軽く一歩目を決めていこう。',
        '朝のスタート、いい感じだね。'
    ],
    tired: [
        '無理しすぎないで。少しだけ深呼吸しよう。',
        '疲れが出てるね。短い休憩をはさもう。',
        'しんどいときは、まず一口水を飲もう。'
    ],
    default: [
        'うん、聞いてるよ。続けて。',
        'なるほど。次の一手を一緒に考えよう。',
        'いい視点だね。もう少し詳しく教えて。',
        '了解。必要なら要点だけ短くまとめるよ。'
    ]
};
const DEDUP_FALLBACK_ACKS = ['うん、わかるよ。', 'なるほど。', 'いいね。', 'たしかに。'];
const DEDUP_PUNCT_REGEX = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~、。！？「」『』（）［］【】・…〜～]/g;
const DEFAULT_SETTINGS = {
    characterName: 'もちまる',
    mascotDataUrl: '',
    bubbleX: 0,
    bubbleY: 0,
    bubbleScale: 1.0,
    ttsEnabled: false,
    ttsVoice: 'default',
    ttsRate: 1.0,
    ttsPitch: 1.0
};
const LS_KEY = 'companion:settings:v1';
let waitingForVoices = false;
let dialogue = null;
let typingCount = 0;
let lastUserActivityAt = Date.now();
let lastUserSendAt = 0;
let lastProactiveAt = 0;
let proactiveTimer = null;
let reactionText = '';
let reactionUntil = 0;
let reactionTimer = null;

function setTyping(on) {
    typingCount = Math.max(0, typingCount + (on ? 1 : -1));
}

function isTyping() {
    return typingCount > 0;
}

function updateFabReaction() {
    const bubble = document.querySelector('#companion-fab-bubble');
    if (!bubble) return;

    if (!reactionText) {
        bubble.classList.remove('show');
        bubble.textContent = '';
        return;
    }

    bubble.textContent = reactionText;
    bubble.classList.add('show');
}

function pickReaction(kind) {
    const key = typeof kind === 'string' ? kind : '';
    const candidates = REACTION_MAP[key];
    if (Array.isArray(candidates) && candidates.length > 0) {
        return candidates[Math.floor(Math.random() * candidates.length)];
    }
    const direct = String(kind || '').trim();
    return direct ? direct.slice(0, 16) : '';
}

function showReaction(kind, ms = REACTION_MS) {
    reactionText = pickReaction(kind);
    reactionUntil = Date.now() + ms;
    updateFabReaction();

    if (reactionTimer) clearTimeout(reactionTimer);
    reactionTimer = window.setTimeout(() => {
        if (Date.now() >= reactionUntil) {
            reactionText = '';
            updateFabReaction();
        }
    }, ms + 50);
}

function getVoiceList() {
    if (typeof window === 'undefined') return [];
    const list = window.speechSynthesis?.getVoices?.() || [];
    // nameが空の環境もあるのでフィルタは弱め
    return list;
}

function ensureVoicesReady(cb) {
    if (typeof window === 'undefined') return cb?.([]);
    if (!window.speechSynthesis) return cb?.([]);

    const voices = getVoiceList();
    if (voices.length) return cb?.(voices);

    let done = false;
    const finish = () => {
        if (done) return;
        done = true;
        window.speechSynthesis.removeEventListener('voiceschanged', handler);
        cb?.(getVoiceList());
    };
    const handler = () => {
        finish();
    };
    // voicesが遅延で入るブラウザ対策
    window.speechSynthesis.addEventListener('voiceschanged', handler);
    // 念のためタイムアウトでも回収
    window.setTimeout(finish, 500);
}

function speakText(text, settings) {
    if (typeof window === 'undefined' || typeof window.SpeechSynthesisUtterance === 'undefined' || !window.speechSynthesis) {
        console.warn('[TTS] speechSynthesis not supported');
        return;
    }
    if (!settings?.ttsEnabled) {
        console.log('[TTS] disabled', text);
        return;
    }

    const clean = String(text || '').trim();
    if (!clean) return;

    const u = new window.SpeechSynthesisUtterance(clean);
    u.rate = Number(settings.ttsRate ?? 1);
    u.pitch = Number(settings.ttsPitch ?? 1);

    const voices = getVoiceList();
    // 選択：できれば name一致、なければ default
    if (settings.ttsVoice && settings.ttsVoice !== 'default') {
        const v = voices.find((voice) => voice.name === settings.ttsVoice);
        if (v) u.voice = v;
    }

    try {
        // 連打対策：必ずキャンセルしてから再生
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
    } catch {
        // non-fatal
    }
}

function getDialogue() {
    if (!dialogue) dialogue = new DialogueSystem();
    return dialogue;
}

function normalizeChatLog(log) {
    if (!Array.isArray(log)) return [];
    return log
        .filter((item) => item && typeof item === 'object')
        .map((item) => {
            const role = item.role === 'user' ? 'user' : 'assistant';
            const text = typeof item.text === 'string' ? item.text.trim() : '';
            const proactive = Boolean(item?.meta?.proactive);
            return {
                role,
                text,
                ts: Number(item.ts) || Date.now(),
                meta: proactive ? { proactive: true } : undefined
            };
        })
        .filter((item) => item.text.length > 0)
        .slice(-MAX_CHAT_LOG);
}

function normalizeRecentBotReplies(list) {
    if (!Array.isArray(list)) return [];
    return list
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
        .slice(-RECENT_BOT_REPLIES_LIMIT);
}

function loadRecentBotReplies() {
    try {
        const raw = localStorage.getItem(RECENT_BOT_REPLIES_KEY);
        if (!raw) return [];
        return normalizeRecentBotReplies(JSON.parse(raw));
    } catch {
        return [];
    }
}

function saveRecentBotReplies(list) {
    const normalized = normalizeRecentBotReplies(list);
    try {
        localStorage.setItem(RECENT_BOT_REPLIES_KEY, JSON.stringify(normalized));
    } catch {
        // non-fatal
    }
    return normalized;
}

function recentBotRepliesFromMessages(messages) {
    return normalizeChatLog(messages)
        .filter((item) => item.role === 'assistant')
        .map((item) => item.text)
        .slice(-RECENT_BOT_REPLIES_LIMIT);
}

function rememberBotReply(text) {
    const clean = typeof text === 'string' ? text.trim() : '';
    if (!clean) return;
    state.recentBotReplies = saveRecentBotReplies([...(state.recentBotReplies || []), clean]);
}

function stripEmoji(text) {
    const input = String(text ?? '');
    try {
        const emojiPattern = new RegExp('[\\p{Extended_Pictographic}\\p{Emoji_Presentation}]', 'gu');
        return input.replace(emojiPattern, '').replace(/\uFE0F/g, '');
    } catch {
        return input.replace(/[\u2600-\u27BF]|[\uD83C-\uDBFF][\uDC00-\uDFFF]/g, '').replace(/\uFE0F/g, '');
    }
}

function normalizeForDedup(text) {
    return stripEmoji(text)
        .replace(DEDUP_PUNCT_REGEX, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function isDuplicateReply(candidate, recentReplies) {
    const before = typeof candidate === 'string' ? candidate.trim() : '';
    if (!before) return false;
    const normalizedBefore = normalizeForDedup(before);
    const list = normalizeRecentBotReplies(recentReplies);
    return list.some((item) => {
        const existing = item.trim();
        if (!existing) return false;
        if (existing === before) return true;
        const normalizedExisting = normalizeForDedup(existing);
        return Boolean(normalizedBefore && normalizedExisting && normalizedExisting === normalizedBefore);
    });
}

function rotateFromRandomIndex(list) {
    if (!Array.isArray(list) || list.length === 0) return [];
    const start = Math.floor(Math.random() * list.length);
    return list.map((_, index) => list[(start + index) % list.length]);
}

function classifyReplyCategory(inputText) {
    const input = String(inputText || '').trim();
    const lower = input.toLowerCase();
    if (lower.includes('ありがとう')) return 'thanks';
    if (lower.includes('おは')) return 'morning';
    if (lower.includes('疲') || lower.includes('つかれ') || lower.includes('しんど')) return 'tired';
    return 'default';
}

function extractKeyword(text) {
    const source = String(text || '').trim();
    if (!source) return '';

    const pick = (value) => String(value || '')
        .replace(/^[\s"'`「」『』（）［］【】、。！？,.!?]+/g, '')
        .replace(/[\s"'`「」『』（）［］【】、。！？,.!?]+$/g, '')
        .trim()
        .slice(0, 20);

    const nonHiragana = source.match(/[^\u3040-\u309F\s]{2,}/u);
    if (nonHiragana?.[0]) {
        const keyword = pick(nonHiragana[0]);
        if (keyword) return keyword;
    }

    const generic = source.match(/[^\s]{1,}/u);
    if (generic?.[0]) {
        const keyword = pick(generic[0]);
        if (keyword) return keyword;
    }

    return pick(source.replace(/\s+/g, ''));
}

function addKeywordReference(replyText, keyword) {
    const base = String(replyText || '').trim();
    const key = String(keyword || '').trim();
    if (!key) return base;
    if (base.includes(key)) return base;
    if (!base) return `${key}について、もう少し聞かせて。`;
    const stripped = base.replace(/[。.!?！？\s]+$/g, '');
    return `${stripped}。${key}についてはどう感じてる？`;
}

function pickAlternativeReply(category, keyword, recentReplies) {
    const lines = DEDUP_CATEGORY_LINES[category] || DEDUP_CATEGORY_LINES.default;
    for (const line of rotateFromRandomIndex(lines)) {
        const candidate = addKeywordReference(line, keyword);
        if (!isDuplicateReply(candidate, recentReplies)) return candidate;
    }
    return '';
}

function buildFallbackReply(keyword, recentReplies) {
    const key = String(keyword || '').trim();
    const questions = key
        ? [`${key}でいま一番気になるのはどこ？`, `${key}の続きを少し聞かせて。`]
        : ['今いちばん気になることは何？', 'もう少し詳しく教えて。'];

    for (const ack of rotateFromRandomIndex(DEDUP_FALLBACK_ACKS)) {
        for (const q of rotateFromRandomIndex(questions)) {
            const candidate = `${ack}${q}`;
            if (!isDuplicateReply(candidate, recentReplies)) return candidate;
        }
    }

    return `${DEDUP_FALLBACK_ACKS[0]}${questions[0]}`;
}

function dedupeReply(replyText, { inputText = '', keyword = '', recentReplies = [] } = {}) {
    const before = String(replyText || '').trim();
    if (!before || !isDuplicateReply(before, recentReplies)) {
        return { hit: false, text: before };
    }

    const category = classifyReplyCategory(inputText);
    const alternative = pickAlternativeReply(category, keyword, recentReplies);
    const after = alternative || buildFallbackReply(keyword, recentReplies);
    return { hit: true, before, after, text: after };
}

function loadChatLog() {
    try {
        const raw = localStorage.getItem(CHAT_LS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return normalizeChatLog(parsed);
    } catch {
        return [];
    }
}

function saveChatLog(log) {
    const normalized = normalizeChatLog(log);
    try {
        localStorage.setItem(CHAT_LS_KEY, JSON.stringify(normalized));
    } catch {
        // non-fatal
    }
    return normalized;
}

const state = {
    open: false,
    activeTab: 'chat',
    unread: loadUnread(),
    messages: loadChatLog(),
    recentBotReplies: loadRecentBotReplies(),
    settings: loadSettings()
};

const refs = {
    dotHost: null,
    panelHost: null,
    dotButton: null,
    dotImage: null,
    headImage: null,
    title: null,
    close: null,
    tabChat: null,
    tabSettings: null,
    panelChat: null,
    panelSettings: null,
    settingsRoot: null,
    mascotPreview: null,
    unreadBadge: null,
    menuBadge: null,
    log: null,
    typing: null,
    typingDebug: null,
    form: null,
    input: null,
    send: null
};

let mounted = false;
let classObserver = null;
let bindAIMenuTimerA = null;
let bindAIMenuTimerB = null;
let menuObserver = null;
let cleanupFns = [];

function toFiniteNumber(value, fallback, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    if (Number.isFinite(min) && n < min) return min;
    if (Number.isFinite(max) && n > max) return max;
    return n;
}

function normalizeSettings(input) {
    const safe = (input && typeof input === 'object') ? input : {};
    const rawCharacterName = typeof safe.characterName === 'string'
        ? safe.characterName
        : typeof safe.displayName === 'string'
            ? safe.displayName
            : DEFAULT_SETTINGS.characterName;

    const rawVoice = typeof safe.ttsVoice === 'string' && safe.ttsVoice
        ? safe.ttsVoice
        : typeof safe.ttsVoiceURI === 'string' && safe.ttsVoiceURI
            ? safe.ttsVoiceURI
            : DEFAULT_SETTINGS.ttsVoice;

    return {
        characterName: rawCharacterName.trim() ? rawCharacterName.trim().slice(0, 30) : DEFAULT_SETTINGS.characterName,
        mascotDataUrl: typeof safe.mascotDataUrl === 'string' ? safe.mascotDataUrl : DEFAULT_SETTINGS.mascotDataUrl,
        bubbleX: toFiniteNumber(safe.bubbleX, DEFAULT_SETTINGS.bubbleX, -9999, 9999),
        bubbleY: toFiniteNumber(safe.bubbleY, DEFAULT_SETTINGS.bubbleY, -9999, 9999),
        bubbleScale: toFiniteNumber(safe.bubbleScale, DEFAULT_SETTINGS.bubbleScale, 0.5, 2.0),
        ttsEnabled: Boolean(safe.ttsEnabled),
        ttsVoice: rawVoice,
        ttsRate: toFiniteNumber(safe.ttsRate, DEFAULT_SETTINGS.ttsRate, 0.5, 2.0),
        ttsPitch: toFiniteNumber(safe.ttsPitch, DEFAULT_SETTINGS.ttsPitch, 0, 2.0)
    };
}

function loadSettings() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return { ...DEFAULT_SETTINGS };
        return normalizeSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

function saveSettings(nextSettings) {
    const normalized = normalizeSettings(nextSettings);
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(normalized));
    } catch {
        // non-fatal
    }
    return normalized;
}

function resetSettings() {
    try {
        localStorage.removeItem(LS_KEY);
    } catch {
        // non-fatal
    }
    return { ...DEFAULT_SETTINGS };
}

function resolveMascotSrc(settings) {
    const v = settings?.mascotDataUrl || '';
    const url = (typeof v === 'string' && v.startsWith('data:image/')) ? v : DEFAULT_MASCOT_URL;
    const from = url === DEFAULT_MASCOT_URL ? 'default' : 'localStorage';
    console.log('[MASCOT]', { from, url });
    return url;
}

function attachImgFallback(img) {
    if (!img || img.dataset.fallbackBound === '1') return;
    img.dataset.fallbackBound = '1';
    img.addEventListener('error', () => {
        if (img.dataset.mascotFallbackApplied === '1') return;
        img.dataset.mascotFallbackApplied = '1';
        img.src = DEFAULT_MASCOT_URL;
    });
}

function getCharacterName() {
    const name = typeof state.settings.characterName === 'string' ? state.settings.characterName.trim() : '';
    return name || 'もちまる';
}

function getCharacterImage() {
    return resolveMascotSrc(state.settings);
}

function normalizeMessages(messages) {
    return normalizeChatLog(messages);
}

function registerCleanup(fn) {
    cleanupFns.push(fn);
}

function on(target, eventName, handler, options) {
    if (!target?.addEventListener) return;
    target.addEventListener(eventName, handler, options);
    registerCleanup(() => target.removeEventListener(eventName, handler, options));
}

function ensureRoot() {
    let root = document.getElementById('companion-root');
    if (!root) {
        root = document.createElement('div');
        root.id = 'companion-root';
        document.body.appendChild(root);
    }
    return root;
}

function applyRootStyles(root, open) {
    root.style.position = 'fixed';
    root.style.right = '16px';
    root.style.bottom = '16px';
    root.style.zIndex = '2147483647';
    root.style.width = '420px';
    root.style.maxWidth = 'calc(100vw - 32px)';
    root.style.height = '640px';
    root.style.maxHeight = 'calc(100vh - 32px)';
    root.style.pointerEvents = 'auto';
    root.style.display = open ? 'block' : 'none';
}

function formatFloat(value, digits = 2) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    return n.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function toVoiceOptionLabel(voice) {
    const name = typeof voice?.name === 'string' ? voice.name.trim() : '';
    const lang = typeof voice?.lang === 'string' ? voice.lang.trim() : '';
    const isDefault = Boolean(voice?.default);
    const voiceName = name || '(no-name)';
    const suffix = lang ? ` (${lang})` : '';
    return `${voiceName}${suffix}${isDefault ? ' [default]' : ''}`;
}

function populateVoiceSelect(root, selectedVoice = 'default') {
    if (!root) return;
    const inputTtsVoice = root.querySelector('#setting-tts-voice');
    if (!inputTtsVoice) return;

    const voices = getVoiceList();
    const options = [];
    const seen = new Set();
    options.push({ value: 'default', label: 'default' });

    for (const voice of voices) {
        const value = typeof voice?.name === 'string' ? voice.name : '';
        if (seen.has(value)) continue;
        seen.add(value);
        options.push({ value, label: toVoiceOptionLabel(voice) });
    }

    inputTtsVoice.innerHTML = '';
    for (const optionData of options) {
        const option = document.createElement('option');
        option.value = optionData.value;
        option.textContent = optionData.label;
        inputTtsVoice.appendChild(option);
    }

    const normalizedSelected = typeof selectedVoice === 'string' && selectedVoice ? selectedVoice : 'default';
    inputTtsVoice.value = options.some((option) => option.value === normalizedSelected) ? normalizedSelected : 'default';
}

function refreshVoiceSelect(root, selectedVoice) {
    populateVoiceSelect(root, selectedVoice);

    if (getVoiceList().length || waitingForVoices) return;
    waitingForVoices = true;
    ensureVoicesReady(() => {
        waitingForVoices = false;
        const liveRoot = document.getElementById('companion-root');
        if (!liveRoot) return;
        const current = collectSettingsFromForm(liveRoot).ttsVoice || 'default';
        populateVoiceSelect(liveRoot, current);
    });
}

function syncSettingsForm(root) {
    if (!root) return;

    const s = normalizeSettings(state.settings);
    const inputCharacterName = root.querySelector('#setting-character-name');
    const inputBubbleX = root.querySelector('#setting-bubble-x');
    const inputBubbleY = root.querySelector('#setting-bubble-y');
    const inputBubbleScale = root.querySelector('#setting-bubble-scale');
    const valueBubbleScale = root.querySelector('#setting-bubble-scale-value');
    const inputTtsEnabled = root.querySelector('#setting-tts-enabled');
    const inputTtsVoice = root.querySelector('#setting-tts-voice');
    const inputTtsRate = root.querySelector('#setting-tts-rate');
    const valueTtsRate = root.querySelector('#setting-tts-rate-value');
    const inputTtsPitch = root.querySelector('#setting-tts-pitch');
    const valueTtsPitch = root.querySelector('#setting-tts-pitch-value');
    const mascotPreview = root.querySelector('#mascot-preview');

    if (inputCharacterName) inputCharacterName.value = s.characterName;
    if (inputBubbleX) inputBubbleX.value = String(s.bubbleX);
    if (inputBubbleY) inputBubbleY.value = String(s.bubbleY);
    if (inputBubbleScale) inputBubbleScale.value = String(s.bubbleScale);
    if (valueBubbleScale) valueBubbleScale.textContent = formatFloat(s.bubbleScale, 2);
    if (inputTtsEnabled) inputTtsEnabled.checked = Boolean(s.ttsEnabled);
    if (inputTtsVoice) refreshVoiceSelect(root, s.ttsVoice || 'default');
    if (inputTtsRate) inputTtsRate.value = String(s.ttsRate);
    if (valueTtsRate) valueTtsRate.textContent = formatFloat(s.ttsRate, 2);
    if (inputTtsPitch) inputTtsPitch.value = String(s.ttsPitch);
    if (valueTtsPitch) valueTtsPitch.textContent = formatFloat(s.ttsPitch, 2);
    if (mascotPreview) {
        attachImgFallback(mascotPreview);
        mascotPreview.src = resolveMascotSrc(loadSettings());
    }
}

function collectSettingsFromForm(root) {
    if (!root) return { ...state.settings };
    return normalizeSettings({
        ...state.settings,
        characterName: root.querySelector('#setting-character-name')?.value ?? state.settings.characterName,
        bubbleX: root.querySelector('#setting-bubble-x')?.value ?? state.settings.bubbleX,
        bubbleY: root.querySelector('#setting-bubble-y')?.value ?? state.settings.bubbleY,
        bubbleScale: root.querySelector('#setting-bubble-scale')?.value ?? state.settings.bubbleScale,
        ttsEnabled: Boolean(root.querySelector('#setting-tts-enabled')?.checked),
        ttsVoice: root.querySelector('#setting-tts-voice')?.value ?? state.settings.ttsVoice,
        ttsRate: root.querySelector('#setting-tts-rate')?.value ?? state.settings.ttsRate,
        ttsPitch: root.querySelector('#setting-tts-pitch')?.value ?? state.settings.ttsPitch
    });
}

function applyAndPersistSettings(nextSettings, { rerender = false } = {}) {
    state.settings = saveSettings(nextSettings);
    syncIdentityUI();

    if (rerender) {
        renderRoot(isPanelOpen());
        return;
    }

    const root = document.getElementById('companion-root');
    syncSettingsForm(root);
}

function persistSettingsFromForm() {
    const root = document.getElementById('companion-root');
    if (!root) return;
    applyAndPersistSettings(collectSettingsFromForm(root));
}

function renderRoot(open) {
    const root = ensureRoot();
    state.settings = loadSettings();
    applyRootStyles(root, open);

    if (!root.dataset.ready) {
        root.dataset.ready = '1';
        root.innerHTML = `
            <div id="companion-shell" style="
                width:100%; height:100%;
                background:#fff;
                border:1px solid rgba(0,0,0,.15);
                border-radius:12px;
                box-shadow:0 10px 30px rgba(0,0,0,.15);
                overflow:hidden;
                position:relative;
                display:flex;
                flex-direction:column;
            ">
                <div style="
                    height:44px; display:flex; align-items:center; justify-content:space-between;
                    padding:0 10px; border-bottom:1px solid rgba(0,0,0,.08);
                    background:rgba(0,0,0,.03);
                    font-size:14px;
                ">
                    <div>AI Companion</div>
                    <button id="companion-root-close" style="
                        width:32px;height:32px;border-radius:8px;border:1px solid rgba(0,0,0,.15);
                        background:#fff;cursor:pointer;
                    ">×</button>
                </div>
                <div id="companion-tabs" style="
                    display:flex;
                    border-bottom:1px solid rgba(0,0,0,.08);
                    background:#f8fafc;
                ">
                    <button id="tab-chat" type="button" style="
                        flex:1;
                        height:36px;
                        border:0;
                        border-right:1px solid rgba(0,0,0,.08);
                        background:#fff;
                        font-size:12px;
                        font-weight:700;
                        letter-spacing:.08em;
                        cursor:pointer;
                    ">CHAT</button>
                    <button id="tab-settings" type="button" style="
                        flex:1;
                        height:36px;
                        border:0;
                        background:transparent;
                        font-size:12px;
                        font-weight:700;
                        letter-spacing:.08em;
                        cursor:pointer;
                    ">SETTINGS</button>
                </div>
                <div style="flex:1;min-height:0;overflow:hidden;">
                    <div id="panel-chat" style="height:100%;padding:12px;overflow:hidden;position:relative;">
                        <div id="chat-wrap" style="display:flex;flex-direction:column;height:100%;min-height:0;gap:10px;">
                            <div id="chat-log" class="companion-log" style="flex:1;min-height:0;border:1px solid rgba(15,23,42,.1);border-radius:10px;overflow:auto;padding:10px;background:#fff;"></div>
                            <div id="chat-typing" style="
                                display:${isTyping() ? 'block' : 'none'};
                                margin:6px 10px;
                                padding:6px 10px;
                                border-radius:10px;
                                background:rgba(0,0,0,.06);
                                font-size:13px;
                                opacity:.85;
                            ">入力中…</div>
                            <div id="chat-compose" style="display:flex;gap:8px;">
                                <input id="chat-input" type="text" placeholder="メッセージ…" class="companion-input" style="flex:1;min-width:0;border:1px solid rgba(15,23,42,.16);border-radius:8px;padding:8px 10px;font-size:13px;" />
                                <button id="chat-send" type="button" class="companion-send" style="border:0;border-radius:8px;background:#0ea5e9;color:#fff;font-weight:700;padding:0 12px;">送信</button>
                            </div>
                            <div id="chat-typing-debug" style="font-size:12px;opacity:.5;margin:4px 10px;">
                                typingCount: ${typingCount}
                            </div>
                        </div>
                    </div>
                    <div id="panel-settings" style="display:none;height:100%;padding:12px;overflow:auto;">
                        <div style="display:grid;gap:10px;">
                            <div style="display:grid;gap:6px;">
                                <div style="font-size:12px;">キャラ画像</div>
                                <div style="width:104px;height:104px;border-radius:12px;overflow:hidden;border:1px solid rgba(15,23,42,.14);background:#f8fafc;">
                                    <img id="mascot-preview" alt="キャラ画像プレビュー" style="width:100%;height:100%;object-fit:cover;" />
                                </div>
                                <input id="mascot-file" type="file" accept="image/*" />
                                <button id="btn-mascot-reset" type="button">画像リセット</button>
                            </div>
                            <label style="display:grid;gap:4px;">
                                <span style="font-size:12px;">キャラ名</span>
                                <input id="setting-character-name" type="text" maxlength="30" />
                            </label>
                            <label style="display:grid;gap:4px;">
                                <span style="font-size:12px;">吹き出し位置 X</span>
                                <input id="setting-bubble-x" type="number" step="1" />
                            </label>
                            <label style="display:grid;gap:4px;">
                                <span style="font-size:12px;">吹き出し位置 Y</span>
                                <input id="setting-bubble-y" type="number" step="1" />
                            </label>
                            <label style="display:grid;gap:4px;">
                                <span style="font-size:12px;">scale <span id="setting-bubble-scale-value">1</span></span>
                                <input id="setting-bubble-scale" type="range" min="0.5" max="2.0" step="0.01" />
                            </label>
                            <label style="display:flex;align-items:center;gap:8px;">
                                <input id="setting-tts-enabled" type="checkbox" />
                                <span style="font-size:12px;">TTS ON/OFF</span>
                            </label>
                            <label style="display:grid;gap:4px;">
                                <span style="font-size:12px;">voice</span>
                                <select id="setting-tts-voice">
                                    <option value="default">default</option>
                                </select>
                            </label>
                            <label style="display:grid;gap:4px;">
                                <span style="font-size:12px;">rate <span id="setting-tts-rate-value">1</span></span>
                                <input id="setting-tts-rate" type="range" min="0.5" max="2.0" step="0.01" />
                            </label>
                            <label style="display:grid;gap:4px;">
                                <span style="font-size:12px;">pitch <span id="setting-tts-pitch-value">1</span></span>
                                <input id="setting-tts-pitch" type="range" min="0" max="2.0" step="0.01" />
                            </label>
                            <div style="display:flex;gap:8px;">
                                <button id="setting-tts-test" type="button">テスト読み上げ</button>
                                <button id="btn-proactive-now" type="button">今すぐ話しかける</button>
                                <button id="setting-reset" type="button">リセット</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    refs.close = root.querySelector('#companion-root-close');
    refs.tabChat = root.querySelector('#tab-chat');
    refs.tabSettings = root.querySelector('#tab-settings');
    refs.panelChat = root.querySelector('#panel-chat');
    refs.panelSettings = root.querySelector('#panel-settings');
    refs.settingsRoot = root.querySelector('#panel-settings');
    refs.mascotPreview = root.querySelector('#mascot-preview');
    attachImgFallback(refs.mascotPreview);
    refs.log = root.querySelector('#chat-log');
    refs.typing = root.querySelector('#chat-typing');
    refs.typingDebug = root.querySelector('#chat-typing-debug');
    refs.form = root.querySelector('#chat-compose');
    refs.input = root.querySelector('#chat-input');
    refs.send = root.querySelector('#chat-send');
    syncSettingsForm(root);
    renderHistory();
    setActiveTab(state.activeTab, { persist: false });
    syncIdentityUI();
    requestAnimationFrame(() => {
        const el = document.getElementById('chat-log');
        if (el) el.scrollTop = el.scrollHeight;
    });
    updateFabSafeOffset();
    requestAnimationFrame(updateFabSafeOffset);
}

function updateFabSafeOffset() {
    const fallbackOffset = 420;
    const rootStyle = document.documentElement?.style;
    if (!rootStyle) return;

    if (!isOpen()) {
        rootStyle.setProperty('--companion-panel-safe-offset', `${fallbackOffset}px`);
        return;
    }

    const panel = document.getElementById('companion-root');
    if (!panel) return;

    const rect = panel.getBoundingClientRect();
    const panelHeight = Math.max(0, rect.height);
    const nextOffset = panelHeight > 0
        ? Math.ceil(panelHeight + 12)
        : fallbackOffset;
    rootStyle.setProperty('--companion-panel-safe-offset', `${nextOffset}px`);
}

function setOpenAttribute(open) {
    if (open) {
        document.body.setAttribute('data-companion-open', '1');
        document.documentElement.setAttribute('data-companion-open', '1');
        return;
    }
    document.body.removeAttribute('data-companion-open');
    document.documentElement.removeAttribute('data-companion-open');
}

function isOpen() {
    return document.body.getAttribute('data-companion-open') === '1';
}

function isInsideCompanion(target) {
    const root = document.getElementById('companion-root');
    return Boolean(root && target instanceof Node && root.contains(target));
}

function isToggleSource(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest(
        '[data-action="toggle-companion"], #companion-fab, .companion-fab, [data-companion-toggle]'
    ));
}

function installOutsideCloseGuard() {
    if (window.__companionOutsideGuardInstalled) return;
    window.__companionOutsideGuardInstalled = true;

    document.addEventListener('pointerdown', (e) => {
        if (!isOpen()) return;

        const target = e.target;
        if (isInsideCompanion(target)) return;
        if (isToggleSource(target)) return;

        console.log('[Companion] outside close fired', e.target);
        window.Companion?.close?.();
    }, { capture: true });
}

function installCompanionDisplayGuard() {
    if (window.__companionDisplayGuardInstalled) return;
    window.__companionDisplayGuardInstalled = true;

    const obs = new MutationObserver(() => {
        const open = document.body.getAttribute('data-companion-open') === '1';
        if (!open) return;
        const root = document.getElementById('companion-root');
        if (!root) return;
        if (root.style.display === 'none') {
            root.style.display = 'block';
        }
    });

    obs.observe(document.body, { subtree: true, attributes: true });
}

function debugPanelState() {
    const root = document.getElementById('companion-root');
    if (!root) {
        console.warn('[Companion] root not found');
        return;
    }
    const style = window.getComputedStyle(root);
    console.log('[Companion] open=', isOpen(), {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        zIndex: style.zIndex,
        position: style.position,
        rect: root.getBoundingClientRect(),
        bodyOverflow: window.getComputedStyle(document.body).overflow,
        htmlOverflow: window.getComputedStyle(document.documentElement).overflow
    });
}

function bindAIMenu() {
    const menuEl =
        document.querySelector('[data-action="toggle-companion"]') ||
        Array.from(document.querySelectorAll('a,button,div,li')).find((node) => (node.textContent || '').trim() === 'AI');
    if (!menuEl) return;
    if (menuEl.dataset.boundCompanion === '1') return;
    menuEl.dataset.boundCompanion = '1';
    menuEl.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.Companion?.toggle?.();
    });
}

function watchAIMenu() {
    if (menuObserver) {
        menuObserver.disconnect();
    }
    menuObserver = new MutationObserver(() => {
        bindAIMenu();
    });
    menuObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
    registerCleanup(() => {
        menuObserver?.disconnect();
        menuObserver = null;
    });
}

function ensureHosts() {
    refs.dotHost = document.getElementById('companion-dot');
    if (!refs.dotHost) {
        refs.dotHost = document.createElement('div');
        refs.dotHost.id = 'companion-dot';
    }
    ensureRoot();

    if (refs.dotHost.parentElement !== document.body) {
        document.body.appendChild(refs.dotHost);
    }

    refs.panelHost = null;
    setOpenAttribute(false);
    renderRoot(false);
}

function renderShell() {
    const characterName = getCharacterName();
    const characterImage = getCharacterImage();

    refs.dotHost.innerHTML = `
        <button type="button" id="companion-fab" class="companion-dot-button companion-fab" data-companion-toggle="1" aria-label="AIを開く">
            <div id="companion-fab-bubble" class="companion-fab-bubble"></div>
            <img src="${characterImage}" alt="${characterName}" loading="lazy" data-role="dot-image" />
            <span class="companion-dot-fallback" aria-hidden="true">🍡</span>
            <span class="companion-dot-badge" aria-live="polite">0</span>
        </button>
    `;

    refs.dotButton = refs.dotHost.querySelector('.companion-dot-button');
    refs.unreadBadge = refs.dotHost.querySelector('.companion-dot-badge');
    refs.menuBadge = document.getElementById('companion-menu-badge');
    refs.dotImage = refs.dotHost.querySelector('[data-role="dot-image"]');
    refs.headImage = null;
    refs.title = null;
    refs.close = null;
    refs.tabChat = null;
    refs.tabSettings = null;
    refs.panelChat = null;
    refs.panelSettings = null;
    refs.settingsRoot = null;
    refs.mascotPreview = null;
    refs.log = null;
    refs.typing = null;
    refs.typingDebug = null;
    refs.form = null;
    refs.input = null;
    refs.send = null;
    console.log('[companion] dot mounted');

    refs.dotHost.querySelectorAll('img').forEach((img) => attachImgFallback(img));

    syncIdentityUI();
    updateFabReaction();
    renderRoot(isOpen());
}

function renderHistory() {
    if (!refs.log) return;

    refs.log.innerHTML = '';
    for (const msg of state.messages) {
        refs.log.appendChild(createMessageElement(msg));
    }
    syncTypingUI();
    syncChatComposerState();
    refs.log.scrollTop = refs.log.scrollHeight;
}

function createMessageElement(message) {
    const role = message?.role === 'user' ? 'user' : 'assistant';
    const text = typeof message?.text === 'string' ? message.text : '';
    const isProactive = Boolean(message?.meta?.proactive && role === 'assistant');
    const el = document.createElement('div');
    const isUser = role === 'user';
    el.className = `companion-msg ${isUser ? 'user' : 'ai'}`;
    el.style.maxWidth = '90%';
    el.style.marginBottom = '8px';
    el.style.padding = '8px 10px';
    el.style.borderRadius = '10px';
    el.style.fontSize = '13px';
    el.style.lineHeight = '1.45';
    el.style.whiteSpace = 'pre-wrap';
    el.style.wordBreak = 'break-word';
    el.style.marginLeft = isUser ? 'auto' : '0';
    el.style.marginRight = isUser ? '0' : 'auto';
    el.style.background = isUser ? '#0ea5e9' : '#f1f5f9';
    el.style.color = isUser ? '#fff' : '#0f172a';
    el.textContent = text;

    if (isProactive) {
        const badge = document.createElement('span');
        badge.textContent = '（話しかけ）';
        badge.style.marginLeft = '6px';
        badge.style.fontSize = '11px';
        badge.style.opacity = '0.7';
        el.appendChild(badge);
    }
    return el;
}

function syncTypingUI() {
    if (refs.typing) {
        refs.typing.style.display = isTyping() ? 'block' : 'none';
    }
    if (refs.typingDebug) {
        refs.typingDebug.textContent = `typingCount: ${typingCount}`;
    }
}

function syncChatComposerState() {
    if (refs.send) {
        refs.send.disabled = isTyping();
    }
}

function applyBubbleTransform() {
    const x = Number(state.settings.bubbleX) || 0;
    const y = Number(state.settings.bubbleY) || 0;
    const scale = Number(state.settings.bubbleScale) || 1;
    const transform = `translate(${x}px, ${y}px) scale(${scale})`;

    const fabBubble = document.querySelector('#companion-fab-bubble');
    if (fabBubble) {
        fabBubble.style.transform = transform;
        fabBubble.style.transformOrigin = 'bottom right';
    }
}

function syncIdentityUI() {
    const name = getCharacterName();
    const image = getCharacterImage();

    if (refs.title) refs.title.textContent = name;

    if (refs.dotImage) {
        refs.dotImage.src = image;
        refs.dotImage.alt = name;
    }

    if (refs.headImage) {
        refs.headImage.src = image;
        refs.headImage.alt = name;
    }
    if (refs.mascotPreview) {
        attachImgFallback(refs.mascotPreview);
        refs.mascotPreview.src = resolveMascotSrc(loadSettings());
    }
    applyBubbleTransform();
}

function setActiveTab(nextTab, { persist = true } = {}) {
    state.activeTab = nextTab === 'settings' ? 'settings' : 'chat';
    const root = document.getElementById('companion-root');
    if (root) {
        root.dataset.tab = state.activeTab;
    }

    const isChat = state.activeTab === 'chat';
    refs.tabChat?.classList.toggle('is-active', isChat);
    refs.tabSettings?.classList.toggle('is-active', !isChat);

    refs.tabChat?.setAttribute('aria-selected', String(isChat));
    refs.tabSettings?.setAttribute('aria-selected', String(!isChat));
    refs.tabChat?.setAttribute('aria-controls', 'panel-chat');
    refs.tabSettings?.setAttribute('aria-controls', 'panel-settings');

    if (refs.tabChat) refs.tabChat.style.background = isChat ? '#fff' : 'transparent';
    if (refs.tabSettings) refs.tabSettings.style.background = isChat ? 'transparent' : '#fff';
    if (refs.panelChat) refs.panelChat.style.display = isChat ? 'block' : 'none';
    if (refs.panelSettings) refs.panelSettings.style.display = isChat ? 'none' : 'block';

    if (isChat && isPanelOpen()) {
        refs.input?.focus();
        if (refs.log) refs.log.scrollTop = refs.log.scrollHeight;
    }

    if (persist) {
        saveUiState({ isOpen: isPanelOpen(), activeTab: state.activeTab });
    }
}

function syncPanelVisibilityFromAttribute({ persist = true } = {}) {
    const nextOpen = isOpen();

    refs.dotHost?.classList.remove('is-hidden');
    renderRoot(nextOpen);
    state.open = nextOpen;
    updateDotPosition();
    updateFabSafeOffset();

    if (nextOpen) {
        if (refs.log) refs.log.scrollTop = refs.log.scrollHeight;
        if (state.activeTab === 'chat') refs.input?.focus();
    }

    if (persist) {
        saveUiState({ isOpen: nextOpen, activeTab: state.activeTab });
    }
}

function openPanel() {
    console.log('[companion] open');
    markActivity();
    setOpenAttribute(true);
    renderRoot(true);
    requestAnimationFrame(() => renderRoot(true));
    setTimeout(() => renderRoot(true), 0);
    setTimeout(() => renderRoot(true), 50);
    state.unread = 0;
    saveUnread(state.unread);
    syncUnreadUI();
    syncPanelVisibilityFromAttribute();
    updateFabSafeOffset();
    requestAnimationFrame(updateFabSafeOffset);
    debugPanelState();
}

function closePanel() {
    console.log('[companion] close');
    markActivity();
    setOpenAttribute(false);
    renderRoot(false);
    syncPanelVisibilityFromAttribute();
    updateFabSafeOffset();
}

function isPanelOpen() {
    return isOpen();
}

function togglePanel() {
    console.log('[Companion] toggle click', { open: window.Companion?.isOpen?.() });
    markActivity();
    if (isPanelOpen()) {
        closePanel();
        return;
    }
    openPanel();
}

function syncUnreadUI() {
    const hasUnread = state.unread > 0;
    refs.dotHost?.classList.toggle('has-unread', hasUnread);

    if (refs.unreadBadge) {
        refs.unreadBadge.textContent = String(Math.min(state.unread, 99));
    }

    if (!refs.menuBadge || !document.body.contains(refs.menuBadge)) {
        refs.menuBadge = document.getElementById('companion-menu-badge');
    }

    if (refs.menuBadge) {
        refs.menuBadge.textContent = String(Math.min(state.unread, 99));
        refs.menuBadge.classList.toggle('visible', hasUnread);
    }

    window.dispatchEvent(new CustomEvent('companion:unread', {
        detail: { count: state.unread }
    }));
}

function updateDotPosition() {
    const shouldLeft = false;
    refs.dotHost?.classList.toggle('is-left', shouldLeft);
}

function markActivity() {
    lastUserActivityAt = Date.now();
}

function installActivityListeners() {
    if (typeof window === 'undefined' || window.__companionActivityInstalled) return;
    window.__companionActivityInstalled = true;

    document.addEventListener('pointerdown', () => {
        markActivity();
    }, { passive: true, capture: true });
    document.addEventListener('touchstart', () => {
        markActivity();
    }, { passive: true, capture: true });
    document.addEventListener('keydown', () => {
        markActivity();
    }, { capture: true });
}

function getLastUserText() {
    const log = loadChatLog();
    for (let i = log.length - 1; i >= 0; i--) {
        if (log[i].role === 'user' && log[i].text) return String(log[i].text);
    }
    return '';
}

function pickProactiveLine() {
    const t = getLastUserText();
    if (/疲れ|しんど|だる|眠|つら/.test(t)) {
        return 'ちょっと休憩しよ？ 深呼吸だけでも。';
    }
    if (/勉強|作業|仕事|締切|タスク/.test(t)) {
        return '作業、続ける？ それとも5分だけ区切る？';
    }
    if (/暇|ひま/.test(t)) {
        return 'ひま同盟じゃん。何して遊ぶ？';
    }

    const lines = [
        'ひま〜？',
        '今どんな気分？',
        '水分とった？',
        'さっきの続き、話す？',
        'ちょっとだけ雑談する？'
    ];
    return lines[Math.floor(Math.random() * lines.length)];
}

function maybeProactiveSpeak(force = false) {
    const now = Date.now();

    if (!force) {
        if (!window.Companion?.isOpen?.()) return;
        if (isTyping()) return;
        if (now - lastUserActivityAt < IDLE_MS) return;
        if (now - lastProactiveAt < PROACTIVE_COOLDOWN_MS) return;
        if (now - lastUserSendAt < PROACTIVE_AFTER_SEND_GRACE_MS) return;
        if (Math.random() > PROACTIVE_PROB) return;
    }

    const s = loadSettings();
    const keyword = extractKeyword(getLastUserText());
    const rawLine = addKeywordReference(pickProactiveLine(), keyword);
    const proactiveDedup = dedupeReply(rawLine, {
        inputText: getLastUserText(),
        keyword,
        recentReplies: state.recentBotReplies
    });
    if (proactiveDedup.hit) {
        console.log('[DEDUP]', { hit: true, before: proactiveDedup.before, after: proactiveDedup.after });
    }
    const line = proactiveDedup.text || rawLine;
    const log = loadChatLog();
    log.push({ role: 'assistant', text: line, ts: now, meta: { proactive: true } });
    state.messages = saveChatLog(log);
    rememberBotReply(line);
    lastProactiveAt = now;
    showReaction('proactive');

    if (s.ttsEnabled) speakText(line, s);
}

function startProactiveLoop() {
    if (proactiveTimer) return;
    proactiveTimer = window.setInterval(() => {
        maybeProactiveSpeak();
    }, IDLE_CHECK_MS);
}

function watchBodyClass() {
    if (classObserver) {
        classObserver.disconnect();
    }

    classObserver = new MutationObserver(() => {
        syncPanelVisibilityFromAttribute();
    });

    classObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['data-companion-open']
    });

    registerCleanup(() => {
        classObserver?.disconnect();
        classObserver = null;
    });
}

function textFromDialogueResult(result) {
    if (!result) return '';
    if (typeof result === 'string') return result;
    if (typeof result?.text === 'string') return result.text;
    if (typeof result?.reply === 'string') return result.reply;
    if (typeof result?.message === 'string') return result.message;
    if (typeof result?.body === 'string') return result.body;
    return '';
}

function minDelay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function logTypingDisplay(tag) {
    const typingEl = document.querySelector('#chat-typing');
    if (!typingEl || typeof window === 'undefined') return;
    const display = window.getComputedStyle(typingEl).display;
    console.log(`[COMPANION] ${tag}`, { typingCount, display });
}

async function sendChat(text) {
    const clean = typeof text === 'string' ? text.trim() : '';
    if (!clean) return false;

    markActivity();
    const log = loadChatLog();
    log.push({ role: 'user', text: clean, ts: Date.now() });
    state.messages = saveChatLog(log);
    const contextMessages = log.slice(-Math.max(MIN_CONTEXT_TURNS, 6));
    const keyword = extractKeyword(clean);
    console.log('[CTX]', { keyword });
    lastUserSendAt = Date.now();

    setTyping(true);
    renderRoot(true);
    showReaction('typing', 1200);
    logTypingDisplay('typing-on');

    let safeReply = 'ごめん、今ちょっとだけ詰まった。もう一回送ってみて。';
    try {
        const replyPromise = Promise.resolve().then(() => {
            const ds = getDialogue();
            if (ds.respond) return ds.respond(clean, {
                character: getCharacterName(),
                messages: [...contextMessages],
                contextKeyword: keyword
            });
            if (ds.handle) return ds.handle(clean);
            if (ds.next) return ds.next(clean);
            return '…';
        }).catch((err) => {
            console.error('[COMPANION] send failed', err);
            return '';
        });
        const [result] = await Promise.all([replyPromise, minDelay(MIN_TYPING_MS)]);
        const reply = textFromDialogueResult(result).trim();
        safeReply = addKeywordReference(reply || safeReply, keyword);
        const dedup = dedupeReply(safeReply, {
            inputText: clean,
            keyword,
            recentReplies: state.recentBotReplies
        });
        safeReply = dedup.text || safeReply;
        if (dedup.hit) {
            console.log('[DEDUP]', { hit: true, before: dedup.before, after: dedup.after });
        }

        const log2 = loadChatLog();
        log2.push({ role: 'assistant', text: safeReply, ts: Date.now() });
        state.messages = saveChatLog(log2);
        rememberBotReply(safeReply);
        showReaction('reply');

        const s = loadSettings();
        if (s.ttsEnabled) speakText(safeReply, s);
    } finally {
        setTyping(false);
        renderRoot(true);
        logTypingDisplay('typing-off');
    }
    return true;
}

async function sendChatFromInput() {
    const text = refs.input?.value || '';
    if (!String(text).trim()) return;
    refs.input.value = '';
    await sendChat(text);
    if (isPanelOpen() && state.activeTab === 'chat') {
        refs.input?.focus();
    }
}

function bindEvents() {
    const root = document.getElementById('companion-root');

    on(refs.dotButton, 'click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (window.Companion?.toggle) {
            window.Companion.toggle();
            return;
        }
        togglePanel();
    });

    on(refs.tabChat, 'click', () => {
        setActiveTab('chat');
    });

    on(refs.tabSettings, 'click', () => {
        setActiveTab('settings');
    });

    on(refs.close, 'click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (window.Companion?.close) {
            window.Companion.close();
            return;
        }
        closePanel();
    });

    on(refs.settingsRoot, 'input', () => {
        persistSettingsFromForm();
    });

    on(refs.settingsRoot, 'change', () => {
        persistSettingsFromForm();
    });

    on(root, 'change', (event) => {
        const t = event.target;
        if (!(t instanceof HTMLInputElement)) return;
        if (t.id !== 'mascot-file') return;

        const file = t.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            window.alert('画像ファイルを選んでください');
            t.value = '';
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            window.alert('2MB以下にしてください');
            t.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const s = loadSettings();
            s.mascotDataUrl = String(reader.result || '');
            saveSettings(s);
            renderRoot(true);
            t.value = '';
        };
        reader.readAsDataURL(file);
    });

    on(root, 'click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const btn = target.closest('button');
        if (!btn) return;
        if (btn.id === 'btn-mascot-reset') {
            const s = loadSettings();
            s.mascotDataUrl = '';
            saveSettings(s);
            renderRoot(true);
            return;
        }
        if (btn.id === 'chat-send') {
            sendChatFromInput();
            return;
        }
        if (btn.id === 'btn-proactive-now') {
            maybeProactiveSpeak(true);
        }
    });

    on(typeof window !== 'undefined' ? window.speechSynthesis : null, 'voiceschanged', () => {
        const root = document.getElementById('companion-root');
        if (!root) return;
        const s = collectSettingsFromForm(root);
        populateVoiceSelect(root, s.ttsVoice || 'default');
    });

    on(document.getElementById('setting-tts-test'), 'click', () => {
        const s = loadSettings();
        if (!s.ttsEnabled) {
            window.alert('TTSがOFFです');
            return;
        }
        const msg = `テストです。こんにちは、${s.characterName}です。`;
        speakText(msg, s);
    });

    on(document.getElementById('setting-reset'), 'click', () => {
        const ok = window.confirm('設定をリセットしますか？');
        if (!ok) return;
        resetSettings();
        state.settings = loadSettings();
        syncIdentityUI();
        renderRoot(isPanelOpen());
    });

    on(root, 'keydown', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.id !== 'chat-input') return;
        markActivity();
        if (event.key !== 'Enter') return;
        event.preventDefault();
        sendChatFromInput();
    });

    on(root, 'input', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.id !== 'chat-input') return;
        markActivity();
    });

    on(document, 'keydown', (event) => {
        if (event.key === 'Escape' && isPanelOpen()) {
            if (window.Companion?.close) {
                window.Companion.close();
                return;
            }
            closePanel();
        }
    });

    on(window, 'keydown', (event) => {
        if (!event.ctrlKey || !event.shiftKey) return;
        if (String(event.key || '').toLowerCase() !== 'k') return;
        event.preventDefault();
        if (window.Companion?.isOpen?.()) {
            window.Companion?.close?.();
            return;
        }
        if (window.Companion?.open) {
            window.Companion.open();
            return;
        }
        openPanel();
    });

    on(window, 'resize', () => {
        updateFabSafeOffset();
    });

}

function clearRuntime() {
    if (bindAIMenuTimerA) {
        clearTimeout(bindAIMenuTimerA);
        bindAIMenuTimerA = null;
    }

    if (bindAIMenuTimerB) {
        clearTimeout(bindAIMenuTimerB);
        bindAIMenuTimerB = null;
    }

    if (proactiveTimer) {
        clearInterval(proactiveTimer);
        proactiveTimer = null;
    }
    if (reactionTimer) {
        clearTimeout(reactionTimer);
        reactionTimer = null;
    }
    reactionText = '';
    reactionUntil = 0;

    for (const fn of cleanupFns.splice(0, cleanupFns.length)) {
        try {
            fn();
        } catch {
            // no-op
        }
    }

    if (classObserver) {
        classObserver.disconnect();
        classObserver = null;
    }

    dialogue = null;
    typingCount = 0;
    setOpenAttribute(false);
}

function maybeBootstrapRootDebugView() {
    if (typeof window === 'undefined') return;
    const autoOpen = new URLSearchParams(window.location.search).get('companion_root_debug') === '1';
    if (!autoOpen) return;
    setOpenAttribute(true);
    renderRoot(true);
}

maybeBootstrapRootDebugView();

export function mountCompanion() {
    if (mounted || window.__COMPANION_DISABLED__) return;

    try {
        console.log('[companion] init');
        migrateIfNeeded();

        state.messages = normalizeMessages(loadChatLog());
        state.unread = loadUnread();
        state.settings = loadSettings();
        state.recentBotReplies = normalizeRecentBotReplies(loadRecentBotReplies());

        let greetFired = false;
        try {
            if (localStorage.getItem(GREETED_FLAG_KEY) !== '1') {
                greetFired = true;
                const log = loadChatLog();
                log.push({ role: 'assistant', text: INITIAL_GREETING, ts: Date.now() });
                state.messages = saveChatLog(log);
                localStorage.setItem(GREETED_FLAG_KEY, '1');
                rememberBotReply(INITIAL_GREETING);
            }
        } catch {
            // non-fatal
        }
        console.log('[GREET]', { fired: greetFired });

        if (!state.recentBotReplies.length) {
            state.recentBotReplies = saveRecentBotReplies(recentBotRepliesFromMessages(state.messages));
        }

        const ui = loadUiState();
        state.open = false;
        state.activeTab = ui.activeTab === 'settings' ? 'settings' : 'chat';

        ensureHosts();
        renderShell();
        renderHistory();
        installActivityListeners();
        startProactiveLoop();
        markActivity();
        bindEvents();
        bindAIMenu();
        bindAIMenuTimerA = window.setTimeout(bindAIMenu, 500);
        bindAIMenuTimerB = window.setTimeout(bindAIMenu, 1500);
        syncUnreadUI();
        updateDotPosition();
        watchBodyClass();
        watchAIMenu();
        setActiveTab(state.activeTab, { persist: false });
        setOpenAttribute(false);
        syncPanelVisibilityFromAttribute({ persist: false });

        window.Companion = {
            open: openPanel,
            close: closePanel,
            toggle: togglePanel,
            isOpen: isPanelOpen,
            getSettings: () => loadSettings(),
            setSettings: (patch) => {
                const next = normalizeSettings({ ...loadSettings(), ...(patch || {}) });
                applyAndPersistSettings(next, { rerender: true });
            },
            destroy: unmountCompanion
        };
        installOutsideCloseGuard();
        installCompanionDisplayGuard();

        mounted = true;
    } catch (err) {
        console.error('[COMPANION] mount failed (non-fatal)', err);
        window.__COMPANION_DISABLED__ = true;
        unmountCompanion();
    }
}

export function unmountCompanion() {
    clearRuntime();

    state.open = false;

    refs.dotHost?.remove();
    document.querySelectorAll('#companion-panel').forEach((panel) => panel.remove());
    document.querySelectorAll('[data-companion-panel]').forEach((panel) => {
        if (panel.id !== 'companion-panel') {
            panel.remove();
        }
    });
    document.getElementById('companion-root')?.remove();
    refs.dotHost = null;
    refs.panelHost = null;
    refs.dotButton = null;
    refs.dotImage = null;
    refs.headImage = null;
    refs.title = null;
    refs.close = null;
    refs.tabChat = null;
    refs.tabSettings = null;
    refs.panelChat = null;
    refs.panelSettings = null;
    refs.settingsRoot = null;
    refs.mascotPreview = null;
    refs.unreadBadge = null;
    refs.menuBadge = null;
    refs.log = null;
    refs.form = null;
    refs.input = null;
    refs.send = null;

    mounted = false;

    if (window.Companion) {
        delete window.Companion;
    }
}
