// drawer.chat.js - Chat drawer

import { formatTime } from '../utils/time.js';
import { validateChatMessage } from '../utils/validate.js';
import { initGlobalChatRealtime } from '../chatRealtime.js';

let messages = [];
let currentTab = 'all';
let chatSession = null;
let getMyNameCb = null;
let listEl = null;
let inputEl = null;
let sendBtn = null;
let isOpen = false;

export function initChatDrawer({ getMyName }) {
    getMyNameCb = getMyName;

    // Tab switching (Allのみ有効)
    const tabs = document.querySelectorAll('.chat-tab');
    tabs.forEach(tab => {
        if (tab.dataset.chatTab !== 'all') {
            tab.disabled = true;
            tab.classList.add('disabled');
            tab.setAttribute('aria-disabled', 'true');
            tab.title = 'Coming soon';
        }
        tab.addEventListener('click', () => {
            if (tab.dataset.chatTab !== 'all') return;
            switchTab('all');
        });
    });

    listEl = document.getElementById('chat-messages');
    inputEl = document.getElementById('chat-input');
    sendBtn = document.getElementById('chat-send');

    sendBtn?.addEventListener('click', () => sendMessage());
    inputEl?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}

export function setChatDrawerOpen(open) {
    isOpen = open;

    if (open) {
        ensureChatSession();
        renderMessages();
        return;
    }

    if (chatSession) {
        chatSession.destroy();
        chatSession = null;
    }
}

function ensureChatSession() {
    if (chatSession) return;

    chatSession = initGlobalChatRealtime({
        getMyName: () => (getMyNameCb?.() || 'anonymous'),
        onMessage: appendMessage
    });
}

function switchTab(tab) {
    currentTab = tab;

    // Update tab buttons
    document.querySelectorAll('.chat-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.chatTab === tab);
    });

    renderMessages();
}

function sendMessage() {
    if (!chatSession) {
        ensureChatSession();
    }

    const validation = validateChatMessage(inputEl?.value);
    if (!validation.valid) return;

    chatSession?.send?.(validation.value);
    if (inputEl) inputEl.value = '';
}

function appendMessage(msg) {
    messages.push(msg);
    if (messages.length > 100) {
        messages = messages.slice(-100);
    }

    if (!isOpen || !listEl) return;
    listEl.appendChild(createMessageElement(msg));
    listEl.scrollTop = listEl.scrollHeight;
}

function renderMessages() {
    if (!listEl) return;

    listEl.innerHTML = '';
    messages.forEach(msg => {
        listEl.appendChild(createMessageElement(msg));
    });
    listEl.scrollTop = listEl.scrollHeight;
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

function getInitials(name) {
    if (!name) return '?';
    return name.slice(0, 2).toUpperCase();
}
