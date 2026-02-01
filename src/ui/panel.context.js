// panel.context.js - Context panel for spot/user actions

import { getSpotById, getDeskById } from '../world/mapLoader.js';
import { getRoomSettings } from '../services/db.js';

let roomSettings = new Map();
let onOpenZoom = null;
let onOpenRoomChat = null;
let onSit = null;
let onStand = null;
let onPoke = null;
let onDm = null;
let onCall = null;
let onDeskCallJoin = null;
let onDeskCallMute = null;
let onDeskCallHangup = null;

export function initContextPanel(callbacks) {
    onOpenZoom = callbacks.openZoom;
    onOpenRoomChat = callbacks.openRoomChat;
    onSit = callbacks.sit;
    onStand = callbacks.stand;
    onPoke = callbacks.poke;
    onDm = callbacks.dm;
    onCall = callbacks.call;
    onDeskCallJoin = callbacks.deskCallJoin;
    onDeskCallMute = callbacks.deskCallMute;
    onDeskCallHangup = callbacks.deskCallHangup;
}

export async function loadRoomSettings() {
    roomSettings = await getRoomSettings();
}

export function showContextPanel(selection, meta = {}) {
    const panel = document.getElementById('context-panel');
    const title = document.getElementById('context-title');
    const actions = document.getElementById('context-actions');

    if (!panel || !selection) {
        hideContextPanel();
        return;
    }

    const { kind, data } = selection;

    if (kind === 'spot') {
        showSpotPanel(data, title, actions);
    } else if (kind === 'desk') {
        showDeskPanel(data, title, actions, meta);
    } else if (kind === 'user') {
        showUserPanel(data, title, actions);
    } else {
        hideContextPanel();
        return;
    }

    panel.classList.add('visible');
}

function showSpotPanel(spot, title, actions) {
    title.textContent = spot.label;

    let html = '';

    // Open Zoom button
    if (spot.ui?.showOpenZoom) {
        const settings = roomSettings.get(spot.roomKey);
        const hasUrl = settings?.zoomUrl;

        html += `
      <button class="btn btn-primary" id="ctx-open-zoom" ${!hasUrl ? 'disabled' : ''}>
        ${hasUrl ? '📹 Open Zoom' : 'Zoom URL未設定'}
      </button>
    `;
    }

    // Room chat button
    if (spot.ui?.showRoomChat) {
        html += `<button class="btn btn-secondary" id="ctx-room-chat">💬 Room Chat</button>`;
    }

    actions.innerHTML = html;

    // Attach event listeners
    const zoomBtn = document.getElementById('ctx-open-zoom');
    if (zoomBtn && !zoomBtn.disabled) {
        zoomBtn.addEventListener('click', () => {
            const settings = roomSettings.get(spot.roomKey);
            if (settings?.zoomUrl && onOpenZoom) {
                onOpenZoom(settings.zoomUrl);
            }
        });
    }

    const chatBtn = document.getElementById('ctx-room-chat');
    if (chatBtn && onOpenRoomChat) {
        chatBtn.addEventListener('click', () => onOpenRoomChat(spot.id));
    }
}

function showDeskPanel(desk, title, actions, meta = {}) {
    const seated = meta.seated === true;
    const occupant = meta.occupant || null;
    const callState = meta.callState || {};
    const forced = meta.forced === true;
    const callStatus = callState.status || 'idle';
    const inCall = callStatus === 'in_call' || callStatus === 'connecting';

    title.textContent = `Desk ${desk.id.replace('desk:', '')}`;

    let html = '';

    if (seated) {
        // Currently seated
        html += `<div class="context-status">🪑 Seated${forced ? ' (forced)' : ''}</div>`;
        html += `<div class="context-status">📞 Call: ${callStatus}</div>`;
        if (!inCall) {
            html += `<button class="btn btn-primary" id="ctx-join-call">📞 通話に参加</button>`;
        } else {
            html += `<button class="btn btn-secondary" id="ctx-mute-call">${callState.muted ? '🔈 Unmute' : '🔇 Mute'}</button>`;
            html += `<button class="btn btn-secondary" id="ctx-hangup-call">⏹ Hang up</button>`;
        }
        html += `<button class="btn btn-secondary" id="ctx-stand">🚶 Stand</button>`;
    } else if (occupant) {
        // Someone else is sitting here
        html += `
      <button class="btn btn-secondary" id="ctx-dm">💬 DM</button>
      <button class="btn btn-secondary" id="ctx-poke">👆 Poke</button>
      <button class="btn btn-primary" id="ctx-call">📞 Call</button>
    `;
    } else {
        // Empty desk
        html += `<button class="btn btn-primary" id="ctx-sit">🪑 Sit</button>`;
    }

    actions.innerHTML = html;

    // Attach event listeners
    document.getElementById('ctx-sit')?.addEventListener('click', () => onSit?.(desk));
    document.getElementById('ctx-stand')?.addEventListener('click', () => onStand?.());
    document.getElementById('ctx-dm')?.addEventListener('click', () => onDm?.(occupant));
    document.getElementById('ctx-poke')?.addEventListener('click', () => onPoke?.(occupant));
    document.getElementById('ctx-call')?.addEventListener('click', () => onCall?.(occupant));
    document.getElementById('ctx-join-call')?.addEventListener('click', () => onDeskCallJoin?.(desk));
    document.getElementById('ctx-mute-call')?.addEventListener('click', () => onDeskCallMute?.());
    document.getElementById('ctx-hangup-call')?.addEventListener('click', () => onDeskCallHangup?.());
}

function showUserPanel(user, title, actions) {
    title.textContent = user.displayName;

    actions.innerHTML = `
    <button class="btn btn-secondary" id="ctx-dm">💬 DM</button>
    <button class="btn btn-secondary" id="ctx-poke">👆 Poke</button>
    <button class="btn btn-primary" id="ctx-warp">📍 Warp near</button>
  `;

    document.getElementById('ctx-dm')?.addEventListener('click', () => onDm?.(user));
    document.getElementById('ctx-poke')?.addEventListener('click', () => onPoke?.(user));
    document.getElementById('ctx-warp')?.addEventListener('click', () => {
        // Warp is handled via people drawer callback
    });
}

export function hideContextPanel() {
    const panel = document.getElementById('context-panel');
    if (panel) {
        panel.classList.remove('visible');
    }
}

export function updateDeskPanel(desk, seated, occupant, callState, forced = false) {
    const title = document.getElementById('context-title');
    const actions = document.getElementById('context-actions');

    if (title && actions) {
        showDeskPanel(desk, title, actions, { seated, occupant, callState, forced });
    }
}
