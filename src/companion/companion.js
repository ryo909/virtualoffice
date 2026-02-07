import { generateUuid } from '../utils/ids.js';
import { getReply } from './voicechat/entry.js';
import {
    loadHistory,
    saveHistory,
    loadUnread,
    saveUnread,
    loadSettings,
    saveSettings,
    resetSettings,
    migrateIfNeeded,
    loadUiState,
    saveUiState
} from './companion.store.js';
import { renderSettingsUI } from './companion.settings.ui.js';

const MAX_HISTORY = 120;
const MINI_BUBBLE_MS = 1000;
const MIN_TYPING_DELAY = 600;
const MAX_TYPING_DELAY = 1200;

const state = {
    open: false,
    activeTab: 'chat',
    unread: loadUnread(),
    messages: loadHistory(MAX_HISTORY),
    settings: loadSettings()
};

const refs = {
    dotHost: null,
    panelHost: null,
    dotButton: null,
    dotCallout: null,
    dotMini: null,
    dotImage: null,
    headImage: null,
    title: null,
    close: null,
    tabChat: null,
    tabSettings: null,
    panelChat: null,
    panelSettings: null,
    settingsRoot: null,
    unreadBadge: null,
    menuBadge: null,
    log: null,
    form: null,
    input: null,
    send: null
};

let mounted = false;
let rootEl = null;
let classObserver = null;
let miniBubbleTimer = null;
let delayedOpenTimer = null;
let cleanupFns = [];
let settingsView = null;

function getBaseUrl() {
    const envBase = import.meta.env?.BASE_URL;
    if (typeof envBase === 'string' && envBase.length > 0) {
        return envBase.replace(/\/?$/, '/');
    }

    if (typeof window !== 'undefined') {
        const path = window.location.pathname || '/';
        const segments = path.split('/').filter(Boolean);
        if (segments.length > 0) {
            return `/${segments[0]}/`;
        }
    }

    return '/';
}

function getMascotSrc() {
    return `${getBaseUrl()}src/companion/assets/mascot.png`;
}

function getCharacterName() {
    const name = typeof state.settings.displayName === 'string' ? state.settings.displayName.trim() : '';
    return name || 'もちまる';
}

function getCharacterImage() {
    return state.settings.avatarImage || getMascotSrc();
}

function normalizeMessages(messages) {
    if (!Array.isArray(messages)) return [];
    return messages
        .filter((item) => item && typeof item === 'object')
        .map((item) => ({
            id: String(item.id || generateUuid()),
            role: item.role === 'user' ? 'user' : 'ai',
            text: typeof item.text === 'string' ? item.text : '',
            ts: Number(item.ts) || Date.now()
        }))
        .filter((item) => item.text.trim().length > 0)
        .slice(-MAX_HISTORY);
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
    rootEl = document.getElementById('companion-root');
    if (!rootEl) {
        rootEl = document.createElement('div');
        rootEl.id = 'companion-root';
        document.body.appendChild(rootEl);
    }
    return rootEl;
}

function ensureHosts() {
    const root = ensureRoot();

    refs.dotHost = document.getElementById('companion-dot');
    if (!refs.dotHost) {
        refs.dotHost = document.createElement('div');
        refs.dotHost.id = 'companion-dot';
    }

    refs.panelHost = document.getElementById('companion-panel');
    if (!refs.panelHost) {
        refs.panelHost = document.createElement('div');
        refs.panelHost.id = 'companion-panel';
    }

    if (refs.dotHost.parentElement !== root) {
        root.appendChild(refs.dotHost);
    }

    if (refs.panelHost.parentElement !== root) {
        root.appendChild(refs.panelHost);
    }
}

function renderShell() {
    const characterName = getCharacterName();
    const characterImage = getCharacterImage();

    refs.dotHost.innerHTML = `
        <button type="button" class="companion-dot-button" aria-label="AIを開く">
            <img src="${characterImage}" alt="${characterName}" loading="lazy" data-role="dot-image" />
            <span class="companion-dot-fallback" aria-hidden="true">🍡</span>
        </button>
        <span class="companion-dot-callout" data-role="dot-callout">ひま？</span>
        <span class="companion-dot-badge" aria-live="polite">0</span>
        <span class="companion-dot-mini" data-role="dot-mini">なに〜？</span>
    `;

    refs.panelHost.innerHTML = `
        <section class="vc companion-shell" aria-label="相棒チャット">
            <div class="companion-head">
                <div class="companion-head-main">
                    <img class="companion-head-avatar" src="${characterImage}" alt="${characterName}" loading="lazy" data-role="head-image" />
                    <div>
                        <div class="companion-head-title" data-role="head-title">${characterName}</div>
                        <div class="companion-head-sub">AI相棒</div>
                    </div>
                </div>
                <button type="button" class="companion-close" aria-label="閉じる">×</button>
            </div>

            <div class="companion-tabs" role="tablist">
                <button type="button" class="companion-tab is-active" data-tab="chat" role="tab" aria-selected="true">CHAT</button>
                <button type="button" class="companion-tab" data-tab="settings" role="tab" aria-selected="false">SETTINGS</button>
            </div>

            <div class="companion-tab-panel" data-panel="chat">
                <div class="companion-log" role="log" aria-live="polite"></div>
                <form class="companion-form">
                    <input class="companion-input" type="text" maxlength="300" placeholder="話しかける..." />
                    <button class="companion-send" type="submit">送信</button>
                </form>
            </div>

            <div class="companion-tab-panel is-hidden" data-panel="settings">
                <div class="companion-settings-root" data-role="settings-root"></div>
            </div>
        </section>
    `;

    refs.dotButton = refs.dotHost.querySelector('.companion-dot-button');
    refs.dotCallout = refs.dotHost.querySelector('[data-role="dot-callout"]');
    refs.dotMini = refs.dotHost.querySelector('[data-role="dot-mini"]');
    refs.unreadBadge = refs.dotHost.querySelector('.companion-dot-badge');
    refs.menuBadge = document.getElementById('companion-menu-badge');
    refs.dotImage = refs.dotHost.querySelector('[data-role="dot-image"]');

    refs.headImage = refs.panelHost.querySelector('[data-role="head-image"]');
    refs.title = refs.panelHost.querySelector('[data-role="head-title"]');
    refs.close = refs.panelHost.querySelector('.companion-close');

    refs.tabChat = refs.panelHost.querySelector('[data-tab="chat"]');
    refs.tabSettings = refs.panelHost.querySelector('[data-tab="settings"]');
    refs.panelChat = refs.panelHost.querySelector('[data-panel="chat"]');
    refs.panelSettings = refs.panelHost.querySelector('[data-panel="settings"]');
    refs.settingsRoot = refs.panelHost.querySelector('[data-role="settings-root"]');

    refs.log = refs.panelHost.querySelector('.companion-log');
    refs.form = refs.panelHost.querySelector('.companion-form');
    refs.input = refs.panelHost.querySelector('.companion-input');
    refs.send = refs.panelHost.querySelector('.companion-send');

    refs.dotHost.querySelectorAll('img').forEach((img) => {
        on(img, 'error', () => {
            const fallback = refs.dotHost?.querySelector('.companion-dot-fallback');
            if (fallback) fallback.style.display = 'inline-block';
            img.style.display = 'none';
        }, { once: true });
    });

    syncIdentityUI();
    mountSettingsTab();
}

function mountSettingsTab() {
    if (!refs.settingsRoot) return;

    settingsView?.destroy?.();
    settingsView = renderSettingsUI(
        refs.settingsRoot,
        state.settings,
        (nextSettings) => {
            state.settings = saveSettings(nextSettings);
            syncIdentityUI();
            applyBubbleTransform();
            settingsView?.update?.(state.settings, getLatestAiText());
        },
        () => {
            state.settings = resetSettings();
            syncIdentityUI();
            applyBubbleTransform();
            return state.settings;
        }
    );

    settingsView?.update?.(state.settings, getLatestAiText());
}

function renderHistory() {
    if (!refs.log) return;

    refs.log.innerHTML = '';
    for (const msg of state.messages) {
        refs.log.appendChild(createMessageElement(msg.role, msg.text));
    }
    refs.log.scrollTop = refs.log.scrollHeight;
}

function createMessageElement(role, text) {
    const el = document.createElement('div');
    el.className = `companion-msg ${role === 'user' ? 'user' : 'ai'}`;
    el.textContent = text;
    return el;
}

function createTypingElement() {
    const el = document.createElement('div');
    el.className = 'companion-msg typing';
    el.innerHTML = 'タイプ中<span class="companion-typing-dots"><span>.</span><span>.</span><span>.</span></span>';
    return el;
}

function appendMessage(role, text, { persist = true } = {}) {
    const clean = typeof text === 'string' ? text.trim() : '';
    if (!clean) return;

    const msg = {
        id: generateUuid(),
        role: role === 'user' ? 'user' : 'ai',
        text: clean,
        ts: Date.now()
    };

    state.messages.push(msg);
    if (state.messages.length > MAX_HISTORY) {
        state.messages.splice(0, state.messages.length - MAX_HISTORY);
    }

    if (persist) {
        saveHistory(state.messages, MAX_HISTORY);
    }

    if (refs.log) {
        refs.log.appendChild(createMessageElement(msg.role, msg.text));
        refs.log.scrollTop = refs.log.scrollHeight;
    }

    settingsView?.update?.(state.settings, getLatestAiText());
}

function appendSystem(text) {
    appendMessage('ai', text);
}

function getLatestAiText() {
    for (let i = state.messages.length - 1; i >= 0; i -= 1) {
        const item = state.messages[i];
        if (item?.role === 'ai' && item?.text) {
            return item.text;
        }
    }
    return 'ひま？';
}

function applyBubbleTransform() {
    const x = Number(state.settings.bubbleX) || 0;
    const y = Number(state.settings.bubbleY) || 0;
    const scale = Number(state.settings.bubbleScale) || 1;
    const transform = `translate(${x}px, ${y}px) scale(${scale})`;

    if (refs.dotCallout) refs.dotCallout.style.transform = transform;
    if (refs.dotMini) refs.dotMini.style.transform = transform;
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

    applyBubbleTransform();
}

function showMiniBubble() {
    if (!refs.dotMini) return;

    refs.dotMini.classList.add('visible');

    if (miniBubbleTimer) {
        clearTimeout(miniBubbleTimer);
    }

    miniBubbleTimer = window.setTimeout(() => {
        refs.dotMini?.classList.remove('visible');
    }, MINI_BUBBLE_MS);
}

function setActiveTab(nextTab, { persist = true } = {}) {
    state.activeTab = nextTab === 'settings' ? 'settings' : 'chat';

    const isChat = state.activeTab === 'chat';
    refs.tabChat?.classList.toggle('is-active', isChat);
    refs.tabSettings?.classList.toggle('is-active', !isChat);

    refs.tabChat?.setAttribute('aria-selected', String(isChat));
    refs.tabSettings?.setAttribute('aria-selected', String(!isChat));

    refs.panelChat?.classList.toggle('is-hidden', !isChat);
    refs.panelSettings?.classList.toggle('is-hidden', isChat);

    if (isChat && state.open) {
        refs.input?.focus();
        if (refs.log) refs.log.scrollTop = refs.log.scrollHeight;
    }

    if (persist) {
        saveUiState({ isOpen: state.open, activeTab: state.activeTab });
    }
}

function setPanelOpen(open, { persist = true } = {}) {
    state.open = Boolean(open);

    refs.panelHost?.classList.toggle('is-hidden', !state.open);
    refs.panelHost?.classList.toggle('is-closed', !state.open);

    if (refs.panelHost) {
        refs.panelHost.setAttribute('aria-hidden', String(!state.open));
        refs.panelHost.style.pointerEvents = state.open ? 'auto' : 'none';
    }

    document.body.classList.toggle('chat-open', state.open);

    if (state.open) {
        refs.dotMini?.classList.remove('visible');
        if (refs.log) refs.log.scrollTop = refs.log.scrollHeight;
        if (state.activeTab === 'chat') refs.input?.focus();
    }

    if (persist) {
        saveUiState({ isOpen: state.open, activeTab: state.activeTab });
    }
}

function openPanel() {
    setPanelOpen(true);
    state.unread = 0;
    saveUnread(state.unread);
    syncUnreadUI();
}

function closePanel() {
    setPanelOpen(false);
}

function isPanelOpen() {
    return state.open;
}

function syncUnreadUI() {
    const hasUnread = state.unread > 0;
    refs.dotHost?.classList.toggle('has-unread', hasUnread);

    if (refs.unreadBadge) {
        refs.unreadBadge.textContent = String(Math.min(state.unread, 99));
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
    const shouldLeft = document.body.classList.contains('chat-open');
    refs.dotHost?.classList.toggle('is-left', shouldLeft);
}

function watchBodyClass() {
    if (classObserver) {
        classObserver.disconnect();
    }

    classObserver = new MutationObserver(() => {
        updateDotPosition();
    });

    classObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['class']
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

function randomTypingDelay() {
    return Math.floor(Math.random() * (MAX_TYPING_DELAY - MIN_TYPING_DELAY + 1)) + MIN_TYPING_DELAY;
}

function resolveVoiceByURI(voiceURI) {
    if (!voiceURI || typeof window === 'undefined' || !window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!Array.isArray(voices)) return null;
    return voices.find((voice) => voice.voiceURI === voiceURI) || null;
}

function speakReplyIfEnabled(text) {
    if (!state.settings.ttsEnabled) return;

    if (typeof window === 'undefined' || typeof window.SpeechSynthesisUtterance === 'undefined' || !window.speechSynthesis) {
        return;
    }

    const clean = String(text || '').trim();
    if (!clean) return;

    try {
        window.speechSynthesis.cancel();
        const utterance = new window.SpeechSynthesisUtterance(clean);
        utterance.rate = Number(state.settings.ttsRate) || 1;
        utterance.pitch = Number(state.settings.ttsPitch) || 1;

        const selectedVoice = resolveVoiceByURI(state.settings.ttsVoiceURI);
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }

        window.speechSynthesis.speak(utterance);
    } catch {
        // non-fatal
    }
}

async function handleUserMessage(text) {
    appendMessage('user', text);

    const typingEl = state.open && refs.log ? createTypingElement() : null;
    if (typingEl && refs.log) {
        refs.log.appendChild(typingEl);
        refs.log.scrollTop = refs.log.scrollHeight;
    }

    await wait(randomTypingDelay());

    let finalReply = '';
    try {
        const result = await Promise.resolve(getReply(text, {
            character: getCharacterName(),
            messages: [...state.messages]
        }));
        finalReply = textFromDialogueResult(result).trim() || 'うん、聞いてるよ。続けて。';
    } catch (err) {
        console.error('[COMPANION] send failed', err);
        finalReply = 'ごめん、今ちょっとだけ詰まった。もう一回送ってみて。';
    }

    if (typingEl?.isConnected) {
        typingEl.remove();
    }

    if (finalReply) {
        appendMessage('ai', finalReply);
        speakReplyIfEnabled(finalReply);
    } else {
        appendSystem('ごめん、今ちょっとだけ詰まった。もう一回送ってみて。');
    }

    if (!state.open) {
        state.unread += 1;
        saveUnread(state.unread);
        syncUnreadUI();
    }
}

function wait(ms) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });
}

function bindEvents() {
    on(refs.dotButton, 'click', () => {
        showMiniBubble();

        if (delayedOpenTimer) {
            clearTimeout(delayedOpenTimer);
        }

        delayedOpenTimer = window.setTimeout(() => {
            openPanel();
        }, MINI_BUBBLE_MS);
    });

    on(refs.close, 'click', () => {
        closePanel();
    });

    on(refs.tabChat, 'click', () => {
        setActiveTab('chat');
    });

    on(refs.tabSettings, 'click', () => {
        setActiveTab('settings');
    });

    on(refs.form, 'submit', (event) => {
        event.preventDefault();
        const text = refs.input?.value?.trim() || '';
        if (!text) return;

        refs.input.value = '';
        if (refs.send) refs.send.disabled = true;

        void handleUserMessage(text).finally(() => {
            if (refs.send) refs.send.disabled = false;
            if (state.open && state.activeTab === 'chat') {
                refs.input?.focus();
            }
        });
    });

    on(document, 'keydown', (event) => {
        if (event.key === 'Escape' && state.open) {
            closePanel();
        }
    });

    on(document.getElementById('companion-menu-btn'), 'click', () => {
        openPanel();
    });
}

function clearRuntime() {
    if (miniBubbleTimer) {
        clearTimeout(miniBubbleTimer);
        miniBubbleTimer = null;
    }

    if (delayedOpenTimer) {
        clearTimeout(delayedOpenTimer);
        delayedOpenTimer = null;
    }

    settingsView?.destroy?.();
    settingsView = null;

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

    document.body.classList.remove('chat-open');
}

export function mountCompanion() {
    if (mounted || window.__COMPANION_DISABLED__) return;

    try {
        migrateIfNeeded();

        state.messages = normalizeMessages(loadHistory(MAX_HISTORY));
        state.unread = loadUnread();
        state.settings = loadSettings();

        const ui = loadUiState();
        state.open = Boolean(ui.isOpen);
        state.activeTab = ui.activeTab === 'settings' ? 'settings' : 'chat';

        ensureHosts();
        renderShell();
        renderHistory();
        bindEvents();
        syncUnreadUI();
        updateDotPosition();
        watchBodyClass();
        setActiveTab(state.activeTab, { persist: false });
        setPanelOpen(state.open, { persist: false });

        window.Companion = {
            open: openPanel,
            close: closePanel,
            isOpen: isPanelOpen,
            destroy: unmountCompanion
        };

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

    const root = rootEl || document.getElementById('companion-root');
    if (root) {
        root.remove();
    }

    rootEl = null;
    refs.dotHost = null;
    refs.panelHost = null;
    refs.dotButton = null;
    refs.dotCallout = null;
    refs.dotMini = null;
    refs.dotImage = null;
    refs.headImage = null;
    refs.title = null;
    refs.close = null;
    refs.tabChat = null;
    refs.tabSettings = null;
    refs.panelChat = null;
    refs.panelSettings = null;
    refs.settingsRoot = null;
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
