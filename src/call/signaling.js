// signaling.js - WebRTC signaling via Supabase Realtime

import { sendEventTo } from '../services/realtime.js';
import { generateCallId } from '../utils/ids.js';
import {
    requestCall,
    receiveIncomingCall,
    acceptCall,
    callConnected,
    endCall,
    getCallState
} from './callStateMachine.js';
import {
    createPeerConnection,
    getUserMedia,
    addLocalStream,
    createOffer,
    createAnswer,
    setRemoteDescription,
    addIceCandidate,
    closePeerConnection,
    getPeerConnection
} from './webrtc.js';

let myActorId = null;
const DROP_LOG_INTERVAL_MS = 3000;
const CALL_NO_ANSWER_TIMEOUT_MS = 20000;
const droppedLogAt = new Map();
const callSession = {
    callId: null,
    deskId: null,
    role: null,
    peerActorId: null,
    status: 'idle',
    pendingOffer: null,
    pendingCandidates: [],
    timers: {
        noAnswerTimeout: null
    }
};

function warnDropped(key, message, detail) {
    const now = Date.now();
    const last = droppedLogAt.get(key) || 0;
    if (now - last < DROP_LOG_INTERVAL_MS) return;
    droppedLogAt.set(key, now);
    console.warn(message, detail);
}

function parseJsonObject(text) {
    if (typeof text !== 'string') return null;
    try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

function asObject(value) {
    if (!value) return null;
    if (typeof value === 'string') return parseJsonObject(value);
    if (typeof value !== 'object') return null;
    return value;
}

function collectObjects(raw, out, seen, depth = 0) {
    if (depth > 2) return;
    const obj = asObject(raw);
    if (!obj) return;
    if (seen.has(obj)) return;
    seen.add(obj);
    out.push(obj);
    collectObjects(obj.payload, out, seen, depth + 1);
    collectObjects(obj.data, out, seen, depth + 1);
    collectObjects(obj.new, out, seen, depth + 1);
    collectObjects(obj.message, out, seen, depth + 1);
}

function normalizeCallEvent(evt) {
    if (!evt) return null;
    const objects = [];
    collectObjects(evt, objects, new Set());

    let fallback = null;
    for (const obj of objects) {
        const type = typeof obj.type === 'string' ? obj.type : '';
        if (type.startsWith('call_')) return obj;
        if (!fallback && (type || obj.callId || obj.offer || obj.answer || obj.candidate)) {
            fallback = obj;
        }
    }
    return fallback;
}

function clearCallTimers() {
    if (callSession.timers.noAnswerTimeout) {
        clearTimeout(callSession.timers.noAnswerTimeout);
        callSession.timers.noAnswerTimeout = null;
    }
}

function setCallSession(patch = {}) {
    Object.assign(callSession, patch);
}

function ensureSessionIdleOrReset(reason) {
    const state = getCallState();
    if (callSession.status === 'idle' && state.state === 'idle') return;
    resetCallSession(reason);
}

async function flushPendingCandidates() {
    const pc = getPeerConnection();
    if (!pc?.remoteDescription) return;
    if (callSession.pendingCandidates.length === 0) return;

    const queue = [...callSession.pendingCandidates];
    callSession.pendingCandidates = [];
    for (const candidate of queue) {
        try {
            await addIceCandidate({ candidate });
        } catch (err) {
            console.warn('[call] failed to flush ICE candidate', err, candidate);
        }
    }
}

function startNoAnswerTimeout() {
    clearCallTimers();
    callSession.timers.noAnswerTimeout = setTimeout(() => {
        if (callSession.status === 'idle') return;
        const callId = callSession.callId;
        const peerActorId = callSession.peerActorId;
        console.log('[call] hangup', { callId, reason: 'no_answer_timeout' });
        if (callId && peerActorId) {
            sendEventTo(peerActorId, {
                type: 'call_hangup',
                payload: {
                    callId,
                    from: myActorId,
                    to: peerActorId,
                    deskId: null,
                    fromActorId: myActorId,
                    toActorId: peerActorId,
                    reason: 'no_answer_timeout',
                    data: { reason: 'no_answer_timeout' }
                }
            }).catch((err) => {
                console.warn('[call] failed to send timeout hangup', err);
            });
        }
        resetCallSession('no_answer_timeout');
    }, CALL_NO_ANSWER_TIMEOUT_MS);
}

function resetCallSession(reason) {
    console.warn('[call] reset', reason);

    clearCallTimers();
    callSession.pendingCandidates = [];
    callSession.pendingOffer = null;

    const pc = getPeerConnection();
    if (pc) {
        try {
            pc.onicecandidate = null;
            pc.ontrack = null;
            pc.onconnectionstatechange = null;
        } catch (err) {
            console.warn('[call] reset handler cleanup failed', err);
        }
    }

    try {
        closePeerConnection();
    } catch (err) {
        console.warn('[call] reset closePeerConnection failed', err);
    }

    setCallSession({
        callId: null,
        deskId: null,
        role: null,
        peerActorId: null,
        status: 'idle',
        pendingOffer: null,
        pendingCandidates: []
    });

    if (getCallState().state !== 'idle') {
        endCall();
    }
}

export function initSignaling({ actorId }) {
    myActorId = actorId;
}

/**
 * Initiate a call to a peer
 */
export async function startCall(peerActorId) {
    if (!peerActorId) return false;

    if (callSession.status !== 'idle' || getCallState().state !== 'idle') {
        resetCallSession('start_call_while_busy');
    }

    const callId = generateCallId();
    if (!requestCall(peerActorId, callId)) {
        resetCallSession('start_call_request_failed');
        return false;
    }

    setCallSession({
        callId,
        deskId: null,
        role: 'caller',
        peerActorId,
        status: 'calling',
        pendingOffer: null,
        pendingCandidates: []
    });
    startNoAnswerTimeout();
    console.log('[call] start', { callId, deskId: null, to: peerActorId });

    try {
        await createPeerConnection();
        await getUserMedia();
        await addLocalStream();

        const offer = await createOffer();

        // Send call request
        await sendEventTo(peerActorId, {
            type: 'call_request',
            payload: {
                callId,
                from: myActorId,
                to: peerActorId,
                deskId: null,
                fromActorId: myActorId,
                toActorId: peerActorId,
                data: { offer },
                offer
            }
        });

        return true;
    } catch (err) {
        console.error('[call] start failed', err);
        resetCallSession('start_call_failed');
        return false;
    }
}

/**
 * Handle incoming call request
 */
export function handleCallRequest(payload) {
    const callId = typeof payload?.callId === 'string' ? payload.callId : null;
    const fromActorId = payload?.from || payload?.fromActorId || null;
    const offer = payload?.data?.offer || payload?.offer || null;
    if (!callId || !fromActorId || !offer) {
        warnDropped('call_request_invalid', '[call] dropped event (missing callId/type)', payload);
        return false;
    }

    if (callSession.callId === callId && callSession.status === 'ringing') {
        return true;
    }

    if (callSession.status !== 'idle' || getCallState().state !== 'idle') {
        const pc = getPeerConnection();
        const hasLiveCall = !!pc && pc.connectionState !== 'closed';
        if (hasLiveCall) {
            sendEventTo(fromActorId, {
                type: 'call_busy',
                payload: {
                    callId,
                    from: myActorId,
                    to: fromActorId,
                    deskId: null,
                    fromActorId: myActorId,
                    toActorId: fromActorId,
                    data: { reason: 'busy' },
                    reason: 'busy'
                }
            }).catch((err) => {
                console.warn('[call] failed to send busy signal', err);
            });
            return false;
        }
        ensureSessionIdleOrReset('incoming_offer_when_busy');
    }

    if (!receiveIncomingCall(fromActorId, callId)) {
        sendEventTo(fromActorId, {
            type: 'call_busy',
            payload: {
                callId,
                from: myActorId,
                to: fromActorId,
                deskId: null,
                fromActorId: myActorId,
                toActorId: fromActorId,
                data: { reason: 'busy' },
                reason: 'busy'
            }
        }).catch((err) => {
            console.warn('[call] failed to send busy signal', err);
        });
        return false;
    }
    setCallSession({
        callId,
        deskId: null,
        role: 'callee',
        peerActorId: fromActorId,
        status: 'ringing',
        pendingOffer: offer,
        pendingCandidates: []
    });
    console.log('[call] incoming', { callId, deskId: null, from: fromActorId });

    return true;
}

/**
 * Accept incoming call
 */
export async function acceptIncomingCall() {
    const state = getCallState();
    const offer = callSession.pendingOffer;
    const callId = callSession.callId || state.callId;
    const peerActorId = callSession.peerActorId || state.peerActorId;

    if (!offer || !callId || !peerActorId || state.state !== 'incoming') {
        resetCallSession('accept_invalid_state');
        return false;
    }
    if (!acceptCall()) {
        resetCallSession('accept_state_transition_failed');
        return false;
    }

    setCallSession({ status: 'connecting' });
    console.log('[call] accept', { callId });

    try {
        await createPeerConnection();
        await getUserMedia();
        await addLocalStream();

        await setRemoteDescription(offer);
        await flushPendingCandidates();
        const answer = await createAnswer();

        await sendEventTo(peerActorId, {
            type: 'call_answer',
            payload: {
                callId,
                from: myActorId,
                to: peerActorId,
                deskId: null,
                fromActorId: myActorId,
                toActorId: peerActorId,
                data: { answer },
                answer
            }
        });

        console.log('[call] send_answer', { callId });
        callConnected();
        clearCallTimers();
        setCallSession({ status: 'connected', pendingOffer: null });

        return true;
    } catch (err) {
        console.error('[call] accept failed', err);
        resetCallSession('accept_failed');
        return false;
    }
}

/**
 * Handle call answer
 */
export async function handleCallAnswer(msg) {
    const callId = typeof msg?.callId === 'string' ? msg.callId : null;
    const answer = msg?.data?.answer || msg?.answer || null;
    if (!callId || !answer) {
        warnDropped('call_answer_invalid', '[call] dropped event (missing callId/type)', msg);
        return false;
    }

    const state = getCallState();
    if (state.callId && state.callId !== callId) {
        return false;
    }
    if (callSession.callId && callSession.callId !== callId) {
        return false;
    }

    console.log('[call] recv_answer', { callId });

    try {
        const pc = getPeerConnection();
        if (!pc) {
            resetCallSession('answer_without_peer_connection');
            return false;
        }
        await setRemoteDescription(answer);
        await flushPendingCandidates();
        callConnected();
        clearCallTimers();
        setCallSession({ status: 'connected', pendingOffer: null });
        return true;
    } catch (err) {
        console.error('[call] failed to handle answer', err);
        resetCallSession('handle_answer_failed');
        return false;
    }
}

/**
 * Handle ICE candidate
 */
export async function handleIceCandidate(msg) {
    const callId = typeof msg?.callId === 'string' ? msg.callId : null;
    const candidate = msg?.data?.candidate || msg?.candidate || null;
    if (!callId || !candidate) {
        warnDropped('call_ice_invalid', '[call] dropped event (missing callId/type)', msg);
        return false;
    }

    const state = getCallState();
    if (state?.callId && state.callId !== callId) return false;
    if (callSession.callId && callSession.callId !== callId) return false;

    const pc = getPeerConnection();
    if (!pc || !pc.remoteDescription) {
        callSession.pendingCandidates.push(candidate);
        return true;
    }

    try {
        await addIceCandidate({ candidate });
        return true;
    } catch (err) {
        console.warn('[signaling] handleIceCandidate failed', err, candidate);
        return false;
    }
}

/**
 * Hang up call
 */
export async function hangUp(reason = 'hangup') {
    const state = getCallState();
    const peerActorId = callSession.peerActorId || state.peerActorId;
    const callId = callSession.callId || state.callId;

    console.log('[call] hangup', { callId, reason });

    if (peerActorId && callId) {
        await sendEventTo(peerActorId, {
            type: 'call_hangup',
            payload: {
                callId,
                from: myActorId,
                to: peerActorId,
                deskId: null,
                fromActorId: myActorId,
                toActorId: peerActorId,
                reason,
                data: { reason }
            }
        }).catch((err) => {
            console.warn('[call] failed to send hangup', err);
        });
    }

    resetCallSession(reason);
    return true;
}

/**
 * Handle hangup from peer
 */
export function handleHangup(msg) {
    const callId = typeof msg?.callId === 'string' ? msg.callId : null;
    if (!callId) {
        warnDropped('call_hangup_invalid', '[call] dropped event (missing callId/type)', msg);
        return false;
    }
    if (callSession.callId && callSession.callId !== callId) return false;

    const reason = msg?.reason || msg?.data?.reason || 'remote_hangup';
    console.log('[call] hangup', { callId, reason });
    resetCallSession(reason);
    return true;
}

function handleCallBusy(msg) {
    const callId = typeof msg?.callId === 'string' ? msg.callId : null;
    if (!callId) {
        warnDropped('call_busy_invalid', '[call] dropped event (missing callId/type)', msg);
        return false;
    }
    if (callSession.callId && callSession.callId !== callId) return false;

    resetCallSession('busy');
    return true;
}

export function handlePeerConnectionStateChange(connectionState) {
    if (!connectionState) return;
    if (connectionState === 'connected') {
        clearCallTimers();
        if (callSession.status !== 'connected') {
            setCallSession({ status: 'connected' });
            callConnected();
        }
        return;
    }
    if (connectionState === 'failed' || connectionState === 'disconnected' || connectionState === 'closed') {
        resetCallSession(`connection_${connectionState}`);
    }
}

/**
 * Handle call event from realtime
 */
export function handleCallEvent(evt) {
    try {
        const msg = normalizeCallEvent(evt);
        if (!msg) {
            warnDropped('invalid_msg', '[call] dropped event (invalid msg)', evt);
            return false;
        }

        const type = typeof msg.type === 'string' ? msg.type : null;
        const callId = typeof msg.callId === 'string' ? msg.callId : null;
        if (!type || !callId) {
            warnDropped('missing_type_or_callid', '[call] dropped event (missing callId/type)', msg);
            return false;
        }

        switch (type) {
            case 'call_request': {
                return handleCallRequest(msg);
            }
            case 'call_answer':
                return handleCallAnswer(msg).catch((err) => {
                    console.warn('[signaling] handleCallAnswer failed', err);
                    return false;
                });
            case 'call_ice_candidate':
                return handleIceCandidate(msg).catch((err) => {
                    console.warn('[signaling] handleIceCandidate failed', err);
                    return false;
                });
            case 'call_hangup':
                return handleHangup(msg);
            case 'call_busy':
                return handleCallBusy(msg);
            default:
                console.warn('[call] unknown event type', type, msg);
                return false;
        }
    } catch (err) {
        console.error('[call] handleCallEvent failed', err, evt);
        return false;
    }
}
