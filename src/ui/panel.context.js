// panel.context.js - Context panel for spot/user actions

import { getSpotById, getDeskById } from '../world/mapLoader.js';
import { getRoomSettings } from '../services/db.js';

let roomSettings = new Map();
let onOpenZoom = null;
let onOpenRoomChat = null;
let onClaimDesk = null;
let onSeatDesk = null;
let onLeaveSeat = null;
let onUnclaimDesk = null;
let onPoke = null;
let onDm = null;
let onCall = null;
let onCallAccept = null;
let onCallReject = null;
let onCallCancel = null;
let onCallMute = null;
let onCallEnd = null;

export function initContextPanel(callbacks) {
    onOpenZoom = callbacks.openZoom;
    onOpenRoomChat = callbacks.openRoomChat;
    onClaimDesk = callbacks.claimDesk;
    onSeatDesk = callbacks.seatDesk;
    onLeaveSeat = callbacks.leaveSeat;
    onUnclaimDesk = callbacks.unclaimDesk;
    onPoke = callbacks.poke;
    onDm = callbacks.dm;
    onCall = callbacks.call;
    onCallAccept = callbacks.callAccept;
    onCallReject = callbacks.callReject;
    onCallCancel = callbacks.callCancel;
    onCallMute = callbacks.callMute;
    onCallEnd = callbacks.callEnd;
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
	        ${hasUrl ? '📹 Zoomを開く' : 'Zoom URL未設定'}
      </button>
    `;
    }

    // Room chat button
    if (spot.ui?.showRoomChat) {
        html += `<button class="btn btn-secondary" id="ctx-room-chat">💬 ルームチャット</button>`;
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
    const claimed = meta.claimed === true;
    const seatLocked = meta.seatLocked === true;
    const occupant = meta.occupant || null;
    const participantDisplayName = meta.callState?.peerDisplayName || null;
    const claimedByDisplayName = meta.claimedByDisplayName
        || occupant?.claimedByDisplayName
        || occupant?.displayName
        || participantDisplayName
        || null;
    const callState = meta.callState || {};
    const forced = meta.forced === true;
    const callStatus = callState.status || 'idle';
    const callPeerId = callState.peerActorId || null;
    const callPeerLabel = callState.peerDisplayName || (callPeerId ? callPeerId.slice(0, 6) : '');
    const callDurationSec = callState.startedAt ? Math.max(0, Math.floor((Date.now() - callState.startedAt) / 1000)) : 0;

    function labelStatus(s) {
        switch (s) {
            case 'idle': return '非通話';
            case 'calling': return '発信中…';
            case 'ringing': return '着信中';
            case 'in_call': return '通話中';
            default: return s || '不明';
        }
    }

    function formatDuration(totalSeconds) {
        const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
        const ss = String(totalSeconds % 60).padStart(2, '0');
        return `${mm}:${ss}`;
    }

    function buildCallButtons() {
        if (callStatus === 'calling') {
            return `<button class="btn btn-secondary" id="ctx-call-cancel">⏹ キャンセル</button>`;
        }
        if (callStatus === 'ringing') {
            return `
            <button class="btn btn-primary" id="ctx-call-accept">✅ 応答</button>
            <button class="btn btn-secondary" id="ctx-call-reject">❌ 拒否</button>
          `;
        }
        if (callStatus === 'in_call') {
            return `
            <button class="btn btn-secondary" id="ctx-call-mute">${callState.muted ? '🔈 ミュート解除' : '🔇 ミュート'}</button>
            <button class="btn btn-secondary" id="ctx-call-end">⏹ 通話終了</button>
          `;
        }
        if (occupant) {
            return `<button class="btn btn-primary" id="ctx-call">📞 発信</button>`;
        }
        return '';
    }

    function buildDeskButtons() {
        if (seatLocked) {
            return `<button class="btn btn-secondary" id="ctx-stand">🚶 立つ</button>`;
        }
        if (claimed) {
            return `
            <button class="btn btn-primary" id="ctx-seat">🪑 着席</button>
            <button class="btn btn-secondary" id="ctx-unclaim">↩ 確保解除</button>
          `;
        }
        return `<button class="btn btn-primary" id="ctx-claim">🪑 席を確保</button>`;
    }

    function deskStatusLabel() {
        if (seatLocked) return `🪑 着席中（移動固定）${forced ? '（強制）' : ''}`;
        if (claimed) return '🪑 席を確保中';
        return '🪑 未確保';
    }

    title.textContent = `デスク ${desk.id.replace('desk:', '')}`;

    let html = '';
    html += `<div class="context-status">${deskStatusLabel()}</div>`;
    if (claimed || seatLocked || occupant || claimedByDisplayName) {
        html += `<div class="context-status">👤 確保者: ${escapeHtml(claimedByDisplayName || '不明')}</div>`;
    }

    html += `<div class="context-status">📞 ${labelStatus(callStatus)}${callStatus === 'in_call' ? `（${formatDuration(callDurationSec)}）` : ''}${callPeerLabel ? ` / ${callPeerLabel}` : ''}</div>`;

    if (occupant) {
        html += `
        <button class="btn btn-secondary" id="ctx-dm">💬 DM</button>
        <button class="btn btn-secondary" id="ctx-poke">👆 つつく</button>
      `;
    }

    html += buildCallButtons();
    html += buildDeskButtons();

    actions.innerHTML = html;

    // Attach event listeners
    document.getElementById('ctx-claim')?.addEventListener('click', () => onClaimDesk?.(desk));
    document.getElementById('ctx-seat')?.addEventListener('click', () => onSeatDesk?.(desk));
    document.getElementById('ctx-stand')?.addEventListener('click', () => onLeaveSeat?.(desk));
    document.getElementById('ctx-unclaim')?.addEventListener('click', () => onUnclaimDesk?.(desk));
    document.getElementById('ctx-dm')?.addEventListener('click', () => onDm?.(occupant));
    document.getElementById('ctx-poke')?.addEventListener('click', () => onPoke?.(occupant));
    document.getElementById('ctx-call')?.addEventListener('click', () => onCall?.(occupant));
    document.getElementById('ctx-call-accept')?.addEventListener('click', () => onCallAccept?.());
    document.getElementById('ctx-call-reject')?.addEventListener('click', () => onCallReject?.());
    document.getElementById('ctx-call-cancel')?.addEventListener('click', () => onCallCancel?.());
    document.getElementById('ctx-call-mute')?.addEventListener('click', () => onCallMute?.());
    document.getElementById('ctx-call-end')?.addEventListener('click', () => onCallEnd?.());
}

function showUserPanel(user, title, actions) {
    title.textContent = user.displayName;

    actions.innerHTML = `
    <button class="btn btn-secondary" id="ctx-dm">💬 DM</button>
    <button class="btn btn-secondary" id="ctx-poke">👆 つつく</button>
    <button class="btn btn-primary" id="ctx-warp">📍 近くにワープ</button>
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

export function updateDeskPanel(desk, claimed, seatLocked, occupant, callState, forced = false, claimedByDisplayName = null) {
    const title = document.getElementById('context-title');
    const actions = document.getElementById('context-actions');

    if (title && actions) {
        showDeskPanel(desk, title, actions, { claimed, seatLocked, occupant, callState, forced, claimedByDisplayName });
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
}
