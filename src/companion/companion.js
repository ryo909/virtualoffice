import { generateUuid } from '../utils/ids.js';
import { getReply, ttsApi } from './voicechat/entry.js';

const HISTORY_KEY = 'companion:history:v1';
const UNREAD_KEY = 'companion:unread:v1';
const MAX_HISTORY = 120;
const DEFAULT_CHARACTER = 'まるもち';
const MINI_BUBBLE_MS = 1000;
const MIN_TYPING_DELAY = 600;
const MAX_TYPING_DELAY = 1200;

const state = {
    open: false,
    unread: loadUnread(),
    messages: loadHistory(),
    characterName: DEFAULT_CHARACTER
};

const refs = {
    dotHost: null,
    panelHost: null,
    dotButton: null,
    miniBubble: null,
    unreadBadge: null,
    menuBadge: null,
    log: null,
    form: null,
    input: null,
    send: null,
    close: null
};

let mounted = false;
let rootEl = null;
let classObserver = null;
let miniBubbleTimer = null;
let delayedOpenTimer = null;
let cleanupFns = [];

function loadHistory() {
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((item) => ({
                id: String(item?.id || generateUuid()),
                role: item?.role === 'user' ? 'user' : 'ai',
                text: typeof item?.text === 'string' ? item.text : '',
                ts: Number(item?.ts) || Date.now()
            }))
            .filter((item) => item.text.trim().length > 0)
            .slice(-MAX_HISTORY);
    } catch (err) {
        console.warn('[companion] failed to load history', err);
        return [];
    }
}

function persistHistory() {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(state.messages.slice(-MAX_HISTORY)));
    } catch (err) {
        console.warn('[companion] failed to persist history', err);
    }
}

function loadUnread() {
    try {
        const raw = localStorage.getItem(UNREAD_KEY);
        const value = Number(raw);
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    } catch {
        return 0;
    }
}

function persistUnread() {
    try {
        localStorage.setItem(UNREAD_KEY, String(state.unread));
    } catch {
        // no-op
    }
}

function getMascotSrc() {
    const base = (import.meta.env?.BASE_URL || '/').replace(/\/?$/, '/');
    return `${base}src/companion/assets/mascot.png`;
}

function registerCleanup(fn) {
    cleanupFns.push(fn);
}

function on(target, eventName, handler, options) {
    if (!target) return;
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

    refs.panelHost.classList.add('is-hidden');

    if (refs.dotHost.parentElement !== root) {
        root.appendChild(refs.dotHost);
    }
    if (refs.panelHost.parentElement !== root) {
        root.appendChild(refs.panelHost);
    }
}

function renderShell() {
    const mascot = getMascotSrc();

    refs.dotHost.innerHTML = `
        <button type="button" class="companion-dot-button" aria-label="AIを開く">
            <img src="${mascot}" alt="${state.characterName}" loading="lazy" />
            <span class="companion-dot-fallback" aria-hidden="true">🍡</span>
        </button>
        <span class="companion-dot-callout">ひま？</span>
        <span class="companion-dot-badge" aria-live="polite">0</span>
        <span class="companion-dot-mini">なに〜？</span>
    `;

    refs.panelHost.innerHTML = `
        <section aria-label="相棒チャット">
            <div class="companion-head">
                <div class="companion-head-main">
                    <img class="companion-head-avatar" src="${mascot}" alt="${state.characterName}" loading="lazy" />
                    <div>
                        <div class="companion-head-title">${state.characterName}</div>
                        <div class="companion-head-sub">AI相棒</div>
                    </div>
                </div>
                <button type="button" class="companion-close" aria-label="閉じる">×</button>
            </div>
            <div class="companion-log" role="log" aria-live="polite"></div>
            <form class="companion-form">
                <input class="companion-input" type="text" maxlength="300" placeholder="話しかける..." />
                <button class="companion-send" type="submit">送信</button>
            </form>
        </section>
    `;

    refs.dotButton = refs.dotHost.querySelector('.companion-dot-button');
    refs.miniBubble = refs.dotHost.querySelector('.companion-dot-mini');
    refs.unreadBadge = refs.dotHost.querySelector('.companion-dot-badge');
    refs.menuBadge = document.getElementById('companion-menu-badge');

    refs.log = refs.panelHost.querySelector('.companion-log');
    refs.form = refs.panelHost.querySelector('.companion-form');
    refs.input = refs.panelHost.querySelector('.companion-input');
    refs.send = refs.panelHost.querySelector('.companion-send');
    refs.close = refs.panelHost.querySelector('.companion-close');

    refs.dotHost.querySelectorAll('img').forEach((img) => {
        on(img, 'error', () => {
            const fallback = img.parentElement?.querySelector('.companion-dot-fallback');
            if (fallback) fallback.style.display = 'inline-block';
            img.style.display = 'none';
        }, { once: true });
    });
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
        persistHistory();
    }

    if (refs.log) {
        refs.log.appendChild(createMessageElement(msg.role, msg.text));
        refs.log.scrollTop = refs.log.scrollHeight;
    }
}

function appendSystem(text) {
    appendMessage('ai', text);
}

function showMiniBubble() {
    if (!refs.miniBubble) return;
    refs.miniBubble.classList.add('visible');

    if (miniBubbleTimer) {
        clearTimeout(miniBubbleTimer);
    }

    miniBubbleTimer = window.setTimeout(() => {
        refs.miniBubble?.classList.remove('visible');
    }, MINI_BUBBLE_MS);
}

function openPanel() {
    if (state.open) return;
    state.open = true;
    refs.panelHost?.classList.remove('is-hidden');
    state.unread = 0;
    persistUnread();
    syncUnreadUI();
    refs.input?.focus();
    if (refs.log) refs.log.scrollTop = refs.log.scrollHeight;
}

function closePanel() {
    if (!state.open) return;
    state.open = false;
    refs.panelHost?.classList.add('is-hidden');
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

function generateFallbackReply(text) {
    const normalized = text.trim().toLowerCase();
    if (!normalized) return 'どうしたの？';

    if (normalized.includes('ありがとう')) {
        return 'どういたしまして。いつでも呼んでね。';
    }

    if (normalized.includes('おは')) {
        return 'おはよう。今日は何から進める？';
    }

    if (normalized.includes('疲') || normalized.includes('つかれ')) {
        return '少し深呼吸しよっか。短い休憩でも回復するよ。';
    }

    const replies = [
        'いいね、その続きを聞かせて。',
        '了解。次の一手を一緒に整理しよう。',
        'メモしておく？必要なら要点を短くまとめるよ。',
        'うん、今の話は大事だね。'
    ];

    return replies[Math.floor(Math.random() * replies.length)];
}

function randomTypingDelay() {
    return Math.floor(Math.random() * (MAX_TYPING_DELAY - MIN_TYPING_DELAY + 1)) + MIN_TYPING_DELAY;
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
            character: state.characterName,
            messages: [...state.messages]
        }));
        finalReply = textFromDialogueResult(result).trim() || generateFallbackReply(text);

        try {
            if (ttsApi && typeof ttsApi.speak === 'function') {
                ttsApi.speak(finalReply);
            }
        } catch (ttsErr) {
            console.warn('[COMPANION] tts failed (non-fatal)', ttsErr);
        }
    } catch (err) {
        console.error('[COMPANION] send failed', err);
        finalReply = 'ごめん、今ちょっとだけ詰まった。もう一回送ってみて。';
    }

    if (typingEl?.isConnected) {
        typingEl.remove();
    }

    if (finalReply) {
        appendMessage('ai', finalReply);
    } else {
        appendSystem('ごめん、今ちょっとだけ詰まった。もう一回送ってみて。');
    }

    if (!state.open) {
        state.unread += 1;
        persistUnread();
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

    on(refs.form, 'submit', (event) => {
        event.preventDefault();
        const text = refs.input?.value?.trim() || '';
        if (!text) return;

        refs.input.value = '';
        if (refs.send) refs.send.disabled = true;

        void handleUserMessage(text).finally(() => {
            if (refs.send) refs.send.disabled = false;
            if (state.open) {
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
}

export function mountCompanion() {
    if (mounted || window.__COMPANION_DISABLED__) return;

    try {
        ensureHosts();
        renderShell();
        renderHistory();
        bindEvents();
        syncUnreadUI();
        updateDotPosition();
        watchBodyClass();

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
    refs.miniBubble = null;
    refs.unreadBadge = null;
    refs.menuBadge = null;
    refs.log = null;
    refs.form = null;
    refs.input = null;
    refs.send = null;
    refs.close = null;

    mounted = false;

    if (window.Companion) {
        delete window.Companion;
    }
}
