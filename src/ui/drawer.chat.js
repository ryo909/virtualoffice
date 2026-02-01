// drawer.chat.js - Chat drawer

import { formatTime } from '../utils/time.js';
import { validateChatMessage } from '../utils/validate.js';

let messages = {
    all: [],
    room: [],
    dm: []
};
let currentTab = 'all';
let onSendMessage = null;

export function initChatDrawer(sendCallback) {
    onSendMessage = sendCallback;

    // Tab switching
    const tabs = document.querySelectorAll('.chat-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            switchTab(tab.dataset.chatTab);
        });
    });

    // Send button
    const sendBtn = document.getElementById('chat-send');
    const input = document.getElementById('chat-input');

    sendBtn.addEventListener('click', () => sendMessage());
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
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
    const input = document.getElementById('chat-input');
    const validation = validateChatMessage(input.value);

    if (!validation.valid) return;

    if (onSendMessage) {
        onSendMessage(currentTab, validation.value);
    }

    input.value = '';
}

export function addMessage(channel, { from, text, timestamp, fromMe = false }) {
    const msg = { from, text, timestamp, fromMe };

    if (channel === 'all') {
        messages.all.push(msg);
    } else if (channel === 'room') {
        messages.room.push(msg);
    } else if (channel === 'dm') {
        messages.dm.push(msg);
    }

    // Keep max 100 messages per channel
    ['all', 'room', 'dm'].forEach(ch => {
        if (messages[ch].length > 100) {
            messages[ch] = messages[ch].slice(-100);
        }
    });

    if (channel === currentTab) {
        renderMessages();
    }
}

function renderMessages() {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const msgs = messages[currentTab] || [];

    container.innerHTML = msgs.map(msg => `
    <div class="chat-message ${msg.fromMe ? 'from-me' : ''}">
      <div class="chat-avatar">${getInitials(msg.from)}</div>
      <div class="chat-body">
        <span class="chat-name">${escapeHtml(msg.from)}</span>
        <span class="chat-time">${formatTime(msg.timestamp)}</span>
        <div class="chat-text">${escapeHtml(msg.text)}</div>
      </div>
    </div>
  `).join('');

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
}

function getInitials(name) {
    if (!name) return '?';
    return name.slice(0, 2).toUpperCase();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function clearMessages() {
    messages = { all: [], room: [], dm: [] };
    renderMessages();
}

export function getCurrentTab() {
    return currentTab;
}

export function setCurrentTab(tab) {
    switchTab(tab);
}
