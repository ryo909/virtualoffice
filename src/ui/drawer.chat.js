// drawer.chat.js - Chat drawer

import { formatTime } from '../utils/time.js';
import { validateChatMessage } from '../utils/validate.js';
import { generateUuid } from '../utils/ids.js';
import {
    createDmThreadKey,
    fetchDmMessagesByThread,
    fetchDmThreadSummariesForActor,
    insertDmMessage,
    subscribeDmThread,
    subscribeDmInbox
} from '../services/dmMessages.js';
import {
    DEFAULT_GLOBAL_ROOM_ID,
    fetchGlobalMessages,
    sendGlobalMessage,
    subscribeGlobalMessages
} from '../services/globalMessages.js';
import { setChatUnreadBadge } from './menubar.js';
import { showToast } from './toast.js';

const DM_LAST_READ_KEY = 'vo:lastReadDmTsByThread';
const LEGACY_DM_LAST_READ_KEY = 'vo.dm.lastReadAt.v1';
const GLOBAL_LAST_READ_KEY = 'vo:lastReadGlobalTs';
const GLOBAL_ROOM_ID = DEFAULT_GLOBAL_ROOM_ID;

let allMessages = [];
let allMessageIds = new Set();
let globalUnreadCount = 0;
let dmMessagesByThread = new Map();
let dmMessageIdsByThread = new Map();
let dmUnreadByThread = new Map();
let dmThreadSummaries = [];
let lastReadAtByThread = loadLastReadDmTsByThread();
let lastReadGlobalTs = loadLastReadGlobalTs();

let currentTab = 'all';
let currentDmPeer = null;
let currentDmThreadKey = null;

let stopGlobalSubscription = null;
let stopDmThreadSubscription = null;
let stopDmInboxSubscription = null;

let getMyNameCb = null;
let getMyActorIdCb = null;
let getPersonNameCb = null;
let getPeopleCb = null;

let listEl = null;
let inputEl = null;
let sendBtn = null;
let isOpen = false;

export function initChatDrawer({ getMyName, getMyActorId, getPersonName, getPeople }) {
    getMyNameCb = getMyName;
    getMyActorIdCb = getMyActorId;
    getPersonNameCb = getPersonName;
    getPeopleCb = getPeople;

    const tabs = document.querySelectorAll('.chat-tab');
    tabs.forEach(tab => {
        if (tab.dataset.chatTab === 'room') {
            tab.disabled = true;
            tab.classList.add('disabled');
            tab.setAttribute('aria-disabled', 'true');
            tab.title = '準備中';
        }
        tab.addEventListener('click', () => {
            if (tab.disabled) return;
            switchTab(tab.dataset.chatTab || 'all');
        });
    });

    listEl = document.getElementById('chat-messages');
    inputEl = document.getElementById('chat-input');
    sendBtn = document.getElementById('chat-send');

    sendBtn?.addEventListener('click', () => {
        void sendMessage();
    });
    inputEl?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void sendMessage();
        }
    });

    startDmInboxSubscription();
    void ensureGlobalMessagesReady();
    void loadDmThreadSummaries();

    refreshDmTabLabel();
    refreshUnreadIndicators();
    updateInputState();
}

export function setChatDrawerOpen(open) {
    isOpen = open;

    if (open) {
        if (currentTab === 'all') {
            void ensureGlobalMessagesReady();
        }
        if (currentTab === 'dm') {
            void ensureCurrentDmLoaded();
        }
        renderMessages();
        return;
    }

    stopCurrentDmSubscription();
}

export function openDmThread(person) {
    if (!person?.actorId) return;

    const myActorId = getMyActorId();
    if (!myActorId) {
        showToast('DMの初期化に失敗しました', 'error');
        return;
    }

    currentDmPeer = {
        actorId: person.actorId,
        displayName: person.displayName || resolvePersonName(person.actorId)
    };
    currentDmThreadKey = createDmThreadKey(myActorId, person.actorId);

    switchTab('dm');
    void ensureCurrentDmLoaded();
}

function switchTab(tab) {
    currentTab = tab;

    document.querySelectorAll('.chat-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.chatTab === tab);
    });

    updateInputState();

    if (tab === 'dm') {
        void loadDmThreadSummaries();
        void ensureCurrentDmLoaded();
    } else if (tab === 'all') {
        void ensureGlobalMessagesReady();
    } else {
        stopCurrentDmSubscription();
    }

    renderMessages();
}

async function ensureCurrentDmLoaded() {
    if (!currentDmThreadKey) {
        stopCurrentDmSubscription();
        await loadDmThreadSummaries();
        renderMessages();
        return;
    }

    await loadDmThread(currentDmThreadKey);
    subscribeCurrentDmThread(currentDmThreadKey);

    markThreadAsRead(currentDmThreadKey);
    clearUnread(currentDmThreadKey);

    if (currentTab === 'dm') {
        renderMessages();
    }
}

async function sendMessage() {
    const validation = validateChatMessage(inputEl?.value);
    if (!validation.valid) return;

    if (currentTab === 'dm') {
        await sendDmMessage(validation.value);
    } else {
        const senderActorId = getMyActorId();
        if (!senderActorId) {
            showToast('チャット送信の初期化に失敗しました', 'error');
            return;
        }

        try {
            const saved = await sendGlobalMessage({
                roomId: GLOBAL_ROOM_ID,
                message: validation.value,
                senderActorId,
                senderDisplayName: getMyNameCb?.() || '不明',
                clientMsgId: generateUuid()
            });
            appendGlobalRow(saved);
        } catch (err) {
            console.error('[chat] 全体チャット送信失敗', err);
            showToast('全体チャット送信に失敗しました', 'error');
        }
    }

    if (inputEl) inputEl.value = '';
}

async function sendDmMessage(text) {
    const senderId = getMyActorId();
    const recipientId = currentDmPeer?.actorId;
    const threadKey = currentDmThreadKey;

    if (!senderId || !recipientId || !threadKey) {
        showToast('DMの送信先が未選択です', 'error');
        return;
    }

    try {
        const saved = await insertDmMessage({
            threadKey,
            senderId,
            recipientId,
            body: text
        });
        appendDmRow(saved);
    } catch (err) {
        console.error('[chat] DM送信失敗', err);
        showToast('DM送信に失敗しました', 'error');
    }
}

async function ensureGlobalMessagesReady() {
    await loadGlobalMessages();
    subscribeGlobalStream();

    if (isOpen && currentTab === 'all') {
        markGlobalAsRead();
        renderMessages();
    }
}

async function loadGlobalMessages() {
    try {
        const rows = await fetchGlobalMessages({ roomId: GLOBAL_ROOM_ID, limit: 200 });
        const messages = rows.map(toGlobalMessage).filter(msg => !!msg);
        allMessages = messages;
        allMessageIds = new Set(messages.map(msg => String(msg.id)));
        recalcGlobalUnread();
        refreshUnreadIndicators();
    } catch (err) {
        console.error('[chat] 全体チャット履歴取得失敗', err);
        showToast('全体チャット履歴の取得に失敗しました', 'error');
    }
}

function subscribeGlobalStream() {
    if (stopGlobalSubscription) return;

    stopGlobalSubscription = subscribeGlobalMessages({
        roomId: GLOBAL_ROOM_ID,
        onInsert: (row) => {
            if (!row) return;
            appendGlobalRow(row);
        },
        onDeleteOrUpdate: (row, oldRow) => {
            if (row?.deleted) {
                removeGlobalMessageById(row.id);
                return;
            }
            if (!row && oldRow?.id) {
                removeGlobalMessageById(oldRow.id);
                return;
            }
            if (row && oldRow?.id && String(row.id) === String(oldRow.id)) {
                removeGlobalMessageById(row.id);
                appendGlobalRow(row);
            }
        },
        onError: (err) => {
            console.warn('[chat] global realtime error', err);
        }
    });
}

function appendGlobalRow(row) {
    const msg = toGlobalMessage(row);
    if (!msg) return;

    const messageId = String(msg.id);
    if (allMessageIds.has(messageId)) return;

    allMessageIds.add(messageId);
    allMessages.push(msg);

    if (allMessages.length > 300) {
        const overflow = allMessages.length - 300;
        const removed = allMessages.splice(0, overflow);
        removed.forEach(item => allMessageIds.delete(String(item.id)));
    }

    if (isOpen && currentTab === 'all') {
        markGlobalAsRead();
        if (listEl) {
            listEl.appendChild(createMessageElement(msg));
            listEl.scrollTop = listEl.scrollHeight;
        }
        return;
    }

    const mine = msg.senderActorId && msg.senderActorId === getMyActorId();
    if (!mine && normalizeTsValue(msg.ts) > lastReadGlobalTs) {
        globalUnreadCount += 1;
        refreshUnreadIndicators();
    }
}

function removeGlobalMessageById(messageId) {
    if (!messageId) return;

    const key = String(messageId);
    if (!allMessageIds.has(key)) return;

    allMessageIds.delete(key);
    allMessages = allMessages.filter(msg => String(msg.id) !== key);

    recalcGlobalUnread();
    refreshUnreadIndicators();

    if (isOpen && currentTab === 'all') {
        renderMessages();
    }
}

function markGlobalAsRead() {
    const latestGlobalTs = allMessages.reduce((max, msg) => Math.max(max, normalizeTsValue(msg.ts)), 0);
    lastReadGlobalTs = Math.max(lastReadGlobalTs, latestGlobalTs);
    persistLastReadGlobalTs(lastReadGlobalTs);
    globalUnreadCount = 0;
    refreshUnreadIndicators();
}

function recalcGlobalUnread() {
    const myActorId = getMyActorId();
    globalUnreadCount = allMessages.reduce((sum, msg) => {
        if (!msg) return sum;
        if (myActorId && msg.senderActorId === myActorId) return sum;
        return normalizeTsValue(msg.ts) > lastReadGlobalTs ? sum + 1 : sum;
    }, 0);
}

async function loadDmThread(threadKey) {
    try {
        const rows = await fetchDmMessagesByThread(threadKey, 200);
        const messages = rows.map(toDmMessage).filter(msg => !!msg);

        dmMessagesByThread.set(threadKey, messages);
        dmMessageIdsByThread.set(threadKey, new Set(messages.map(msg => String(msg.id))));
    } catch (err) {
        console.error('[chat] DM履歴取得失敗', err, threadKey);
        showToast('DM履歴の取得に失敗しました', 'error');
    }
}

async function loadDmThreadSummaries() {
    const actorId = getMyActorId();
    if (!actorId) {
        dmThreadSummaries = [];
        dmUnreadByThread = new Map();
        refreshDmTabLabel();
        refreshUnreadIndicators();
        return;
    }

    try {
        const rows = await fetchDmThreadSummariesForActor(actorId, 300);
        const summaryByThread = new Map();
        const nextUnread = new Map();

        for (const row of rows) {
            const threadKey = row?.thread_key;
            if (!threadKey) continue;

            const senderId = row?.sender_id || null;
            const recipientId = row?.recipient_id || null;
            const peerActorId = senderId === actorId ? recipientId : senderId;
            if (!peerActorId) continue;

            if (!summaryByThread.has(threadKey)) {
                summaryByThread.set(threadKey, {
                    threadKey,
                    peerActorId,
                    peerName: resolvePersonName(peerActorId),
                    lastMessage: row?.body || '',
                    ts: row?.created_at || Date.now()
                });
            }

            const lastReadTs = Number(lastReadAtByThread[threadKey] || 0);
            const rowTs = normalizeTsValue(row?.created_at);
            if (senderId !== actorId && rowTs > lastReadTs) {
                nextUnread.set(threadKey, (nextUnread.get(threadKey) || 0) + 1);
            }
        }

        dmThreadSummaries = Array.from(summaryByThread.values());
        dmUnreadByThread = nextUnread;
        refreshDmTabLabel();
        refreshUnreadIndicators();
    } catch (err) {
        console.warn('[chat] DMスレッド一覧取得失敗', err);
    }
}

function startDmInboxSubscription() {
    if (stopDmInboxSubscription) return;

    const actorId = getMyActorId();
    if (!actorId) return;

    stopDmInboxSubscription = subscribeDmInbox({
        actorId,
        onInsert: (row) => {
            if (!row) return;
            appendDmRow(row);
        },
        onError: (err) => {
            console.warn('[chat] DM inbox realtime error', err);
        }
    });
}

function subscribeCurrentDmThread(threadKey) {
    stopCurrentDmSubscription();

    stopDmThreadSubscription = subscribeDmThread({
        threadKey,
        onInsert: (row) => {
            if (!row) return;
            appendDmRow(row);
        },
        onError: (err) => {
            console.warn('[chat] DM realtime error', err);
        }
    });
}

function stopCurrentDmSubscription() {
    if (!stopDmThreadSubscription) return;
    const stop = stopDmThreadSubscription;
    stopDmThreadSubscription = null;

    Promise.resolve(stop()).catch((err) => {
        console.warn('[chat] DM subscription cleanup failed', err);
    });
}

function appendDmRow(row) {
    const msg = toDmMessage(row);
    if (!msg) return;

    const threadKey = msg.threadKey;
    if (!threadKey) return;

    const idSet = dmMessageIdsByThread.get(threadKey) || new Set();
    const messageId = String(msg.id);
    if (idSet.has(messageId)) return;

    const list = dmMessagesByThread.get(threadKey) || [];
    list.push(msg);
    dmMessagesByThread.set(threadKey, list);

    idSet.add(messageId);
    dmMessageIdsByThread.set(threadKey, idSet);

    upsertThreadSummary(msg);

    const myActorId = getMyActorId();
    if (!isViewingThread(threadKey) && msg.senderId !== myActorId) {
        dmUnreadByThread.set(threadKey, (dmUnreadByThread.get(threadKey) || 0) + 1);
    }

    if (isViewingThread(threadKey)) {
        markThreadAsRead(threadKey, normalizeTsValue(msg.ts));
        clearUnread(threadKey);
    }

    refreshDmTabLabel();
    refreshUnreadIndicators();

    if (!isOpen || currentTab !== 'dm' || currentDmThreadKey !== threadKey || !listEl) return;

    listEl.appendChild(createMessageElement(msg));
    listEl.scrollTop = listEl.scrollHeight;
}

function renderMessages() {
    if (!listEl) return;

    listEl.innerHTML = '';

    if (currentTab === 'dm') {
        renderDmMessages();
        return;
    }

    if (allMessages.length === 0) {
        listEl.appendChild(createInfoElement('全体チャットはまだありません。最初のメッセージを送信してください。'));
    } else {
        allMessages.forEach(msg => {
            listEl.appendChild(createMessageElement(msg));
        });
    }

    listEl.scrollTop = listEl.scrollHeight;
}

function renderDmMessages() {
    if (!listEl) return;

    if (!currentDmThreadKey || !currentDmPeer?.actorId) {
        listEl.appendChild(createSectionTitle('最近のDM'));
        if (dmThreadSummaries.length === 0) {
            listEl.appendChild(createInfoElement('まだDM履歴がありません。'));
        } else {
            dmThreadSummaries.forEach(summary => {
                listEl.appendChild(createThreadElement(summary));
            });
        }

        listEl.appendChild(createSectionTitle('相手を選択（オンライン）'));
        const selectablePeople = getSelectableDmPeople();
        if (selectablePeople.length === 0) {
            listEl.appendChild(createInfoElement('オンラインの相手がいません。'));
        } else {
            selectablePeople.forEach(person => {
                listEl.appendChild(createDmPeerElement(person));
            });
        }
        return;
    }

    const threadMessages = dmMessagesByThread.get(currentDmThreadKey) || [];
    if (threadMessages.length === 0) {
        listEl.appendChild(createInfoElement(`${currentDmPeer.displayName || '相手'} とのメッセージはまだありません。`));
        return;
    }

    threadMessages.forEach(msg => {
        listEl.appendChild(createMessageElement(msg));
    });
    listEl.scrollTop = listEl.scrollHeight;
}

function createInfoElement(text) {
    const item = document.createElement('div');
    item.className = 'chat-empty';
    item.textContent = text;
    return item;
}

function createSectionTitle(text) {
    const el = document.createElement('div');
    el.className = 'chat-section-title';
    el.textContent = text;
    return el;
}

function createThreadElement(summary) {
    const btn = document.createElement('button');
    btn.className = 'chat-thread-item';
    btn.type = 'button';

    const unread = dmUnreadByThread.get(summary.threadKey) || 0;
    const preview = (summary.lastMessage || '').slice(0, 40);
    btn.innerHTML = `
        <div class="chat-thread-header">
            <strong>${escapeHtml(summary.peerName || '不明')}</strong>
            <span class="chat-time">${formatTime(summary.ts)}</span>
        </div>
        <div class="chat-thread-preview">${escapeHtml(preview || 'メッセージなし')}</div>
        ${unread > 0 ? `<div class="chat-thread-unread">未読 ${unread}</div>` : ''}
    `;

    btn.addEventListener('click', () => {
        openDmThread({
            actorId: summary.peerActorId,
            displayName: summary.peerName
        });
    });

    return btn;
}

function createDmPeerElement(peer) {
    const btn = document.createElement('button');
    btn.className = 'chat-thread-item';
    btn.type = 'button';

    const statusLabel = peer.status === 'online'
        ? 'オンライン'
        : (peer.status === 'away' ? '離席' : (peer.status === 'focus' ? '集中' : ''));
    const preview = peer.hasHistory ? '履歴あり' : '新規DMを開始';

    btn.innerHTML = `
        <div class="chat-thread-header">
            <strong>${escapeHtml(peer.displayName || '不明')}</strong>
            <span class="chat-time">${escapeHtml(statusLabel)}</span>
        </div>
        <div class="chat-thread-preview">${escapeHtml(preview)}</div>
    `;

    btn.addEventListener('click', () => {
        openDmThread({
            actorId: peer.actorId,
            displayName: peer.displayName
        });
    });

    return btn;
}

function createMessageElement(msg) {
    const item = document.createElement('div');
    item.className = 'chat-message';

    const avatar = document.createElement('div');
    avatar.className = 'chat-avatar';
    avatar.textContent = getInitials(msg.name);

    const body = document.createElement('div');
    body.className = 'chat-body';

    const nameEl = document.createElement('span');
    nameEl.className = 'chat-name';
    nameEl.textContent = msg.name;

    const timeEl = document.createElement('span');
    timeEl.className = 'chat-time';
    timeEl.textContent = formatTime(msg.ts);

    const textEl = document.createElement('div');
    textEl.className = 'chat-text';
    textEl.textContent = msg.text;

    body.appendChild(nameEl);
    body.appendChild(timeEl);
    body.appendChild(textEl);

    item.appendChild(avatar);
    item.appendChild(body);

    return item;
}

function toGlobalMessage(row) {
    if (!row || typeof row !== 'object') return null;

    const text = row.message || row.text || '';
    if (!text) return null;

    return {
        id: row.id || row.message_id || generateUuid(),
        senderActorId: row.sender_actor_id || row.senderActorId || null,
        name: row.sender_display_name || row.name || '不明',
        text,
        ts: row.created_at || row.ts || Date.now()
    };
}

function toDmMessage(row) {
    if (!row || typeof row !== 'object') return null;

    const threadKey = row.thread_key || row.threadKey || null;
    const senderId = row.sender_id || row.senderId || null;
    const recipientId = row.recipient_id || row.recipientId || null;
    const text = row.body || row.text || '';

    if (!threadKey || !senderId || !recipientId || !text) return null;

    return {
        id: row.id || row.message_id || generateUuid(),
        threadKey,
        senderId,
        recipientId,
        name: resolvePersonName(senderId),
        text,
        ts: row.created_at || row.ts || Date.now()
    };
}

function upsertThreadSummary(msg) {
    const myActorId = getMyActorId();
    const peerActorId = msg.senderId === myActorId ? msg.recipientId : msg.senderId;
    if (!peerActorId) return;

    const next = {
        threadKey: msg.threadKey,
        peerActorId,
        peerName: resolvePersonName(peerActorId),
        lastMessage: msg.text || '',
        ts: msg.ts || Date.now()
    };

    const remain = dmThreadSummaries.filter(item => item.threadKey !== msg.threadKey);
    dmThreadSummaries = [next, ...remain];
}

function resolvePersonName(actorId) {
    if (!actorId) return '不明';
    return getPersonNameCb?.(actorId) || actorId.slice(0, 6);
}

function getSelectableDmPeople() {
    const myActorId = getMyActorId();
    const map = new Map();
    const peopleMap = getPeopleCb?.();

    if (peopleMap && peopleMap instanceof Map) {
        for (const person of peopleMap.values()) {
            if (!person?.actorId || person.actorId === myActorId) continue;
            map.set(person.actorId, {
                actorId: person.actorId,
                displayName: person.displayName || resolvePersonName(person.actorId),
                status: person.status || 'online',
                hasHistory: dmThreadSummaries.some(s => s.peerActorId === person.actorId)
            });
        }
    }

    for (const summary of dmThreadSummaries) {
        if (!summary?.peerActorId || summary.peerActorId === myActorId) continue;
        if (map.has(summary.peerActorId)) {
            const existing = map.get(summary.peerActorId);
            existing.hasHistory = true;
            continue;
        }
        map.set(summary.peerActorId, {
            actorId: summary.peerActorId,
            displayName: summary.peerName || resolvePersonName(summary.peerActorId),
            status: 'offline',
            hasHistory: true
        });
    }

    return Array.from(map.values()).sort(compareDmPeer);
}

function compareDmPeer(a, b) {
    const rank = (status) => {
        if (status === 'online') return 0;
        if (status === 'focus') return 1;
        if (status === 'away') return 2;
        return 3;
    };

    const byStatus = rank(a.status) - rank(b.status);
    if (byStatus !== 0) return byStatus;

    return String(a.displayName || '').localeCompare(String(b.displayName || ''), 'ja');
}

function refreshUnreadIndicators() {
    const dmUnreadTotal = Array.from(dmUnreadByThread.values()).reduce((sum, n) => sum + (Number(n) || 0), 0);
    const total = globalUnreadCount + dmUnreadTotal;

    setChatUnreadBadge({
        hasUnread: total > 0,
        count: total
    });
}

function refreshDmTabLabel() {
    const tab = document.querySelector('.chat-tab[data-chat-tab="dm"]');
    if (!tab) return;

    const totalUnread = Array.from(dmUnreadByThread.values()).reduce((sum, n) => sum + (Number(n) || 0), 0);
    tab.textContent = totalUnread > 0 ? `DM (${totalUnread})` : 'DM';
}

function clearUnread(threadKey) {
    if (!threadKey) return;
    dmUnreadByThread.delete(threadKey);
    refreshDmTabLabel();
    refreshUnreadIndicators();
}

function markThreadAsRead(threadKey, explicitTs = null) {
    if (!threadKey) return;

    let latestTs = Number(explicitTs) || 0;
    if (!latestTs) {
        const list = dmMessagesByThread.get(threadKey) || [];
        latestTs = list.reduce((max, msg) => Math.max(max, normalizeTsValue(msg.ts)), 0);
    }
    if (!latestTs) {
        latestTs = Date.now();
    }

    lastReadAtByThread[threadKey] = latestTs;
    persistLastReadDmTsByThread(lastReadAtByThread);
}

function updateInputState() {
    if (!inputEl || !sendBtn) return;

    if (currentTab === 'dm') {
        if (!currentDmPeer?.actorId) {
            inputEl.placeholder = 'DM相手を選択してください';
            inputEl.disabled = true;
            sendBtn.disabled = true;
        } else {
            inputEl.placeholder = `${currentDmPeer.displayName || '相手'} にメッセージを入力...`;
            inputEl.disabled = false;
            sendBtn.disabled = false;
        }
        sendBtn.textContent = '送信';
        return;
    }

    inputEl.placeholder = 'メッセージを入力...';
    inputEl.disabled = false;
    sendBtn.disabled = false;
    sendBtn.textContent = '送信';
}

function getMyActorId() {
    return getMyActorIdCb?.() || null;
}

function isViewingThread(threadKey) {
    return isOpen && currentTab === 'dm' && currentDmThreadKey === threadKey;
}

function getInitials(name) {
    if (!name) return '?';
    return name.slice(0, 2).toUpperCase();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
}

function normalizeTsValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
    const d = new Date(value || 0);
    const t = d.getTime();
    return Number.isFinite(t) ? t : 0;
}

function loadLastReadGlobalTs() {
    try {
        const raw = localStorage.getItem(GLOBAL_LAST_READ_KEY);
        const ts = Number(raw || 0);
        return Number.isFinite(ts) ? ts : 0;
    } catch {
        return 0;
    }
}

function persistLastReadGlobalTs(ts) {
    try {
        localStorage.setItem(GLOBAL_LAST_READ_KEY, String(Number(ts) || 0));
    } catch (err) {
        console.warn('[chat] failed to persist global lastRead', err);
    }
}

function loadLastReadDmTsByThread() {
    const candidates = [DM_LAST_READ_KEY, LEGACY_DM_LAST_READ_KEY];

    for (const key of candidates) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') continue;
            return parsed;
        } catch {
            // noop
        }
    }

    return {};
}

function persistLastReadDmTsByThread(value) {
    try {
        localStorage.setItem(DM_LAST_READ_KEY, JSON.stringify(value || {}));
    } catch (err) {
        console.warn('[chat] failed to persist DM lastRead', err);
    }
}
