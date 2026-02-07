// deskCall.js - Desk call state machine (1:1, audio-only)

import {
    initDeskWebRTC,
    createDeskPeerConnection,
    getDeskUserMedia,
    addDeskLocalStream,
    createDeskOffer,
    createDeskAnswer,
    setDeskRemoteDescription,
    addDeskIceCandidate,
    closeDeskPeerConnection,
    getDeskLocalStream
} from './deskWebrtc.js';
import {
    joinDeskCallChannel,
    sendDeskCallEvent,
    leaveDeskCallChannel
} from '../realtime/deskCallRealtime.js';
import { getSelectedSpeakerId, isSpeakerSelectionSupported } from '../services/audioDevices.js';

let mySessionId = null;
let myJoinAt = null;
let onStateChange = null;

const state = {
    deskId: null,
    status: 'idle',
    muted: false,
    peerSessionId: null,
    error: null,
    participants: []
};

const remoteAudio = new Audio();
remoteAudio.autoplay = true;

function setState(patch) {
    const prev = { ...state };
    Object.assign(state, patch);
    onStateChange?.(state, prev);
}

/**
 * Apply selected speaker to remote audio element
 */
async function applySelectedSpeaker() {
    if (!isSpeakerSelectionSupported()) return;

    const speakerId = getSelectedSpeakerId();
    if (!speakerId) return;

    try {
        await remoteAudio.setSinkId(speakerId);
        console.log('[deskCall] Speaker applied:', speakerId);
    } catch (err) {
        console.warn('[deskCall] Failed to set speaker:', err);
    }
}

export function initDeskCall({ sessionId, onStateChange: onChange }) {
    mySessionId = sessionId;
    onStateChange = onChange;

    initDeskWebRTC({
        onIceCandidate: (payload) => {
            const candidate = payload?.candidate;
            if (!candidate) return;
            if (!state.peerSessionId) return;

            sendDeskCallEvent({
                type: 'call_ice',
                fromSessionId: mySessionId,
                toSessionId: state.peerSessionId,
                candidate,
                ts: Date.now()
            }).catch((err) => {
                console.warn('[deskCall] failed to send ICE candidate', err);
            });
        },
        onTrack: (stream) => {
            remoteAudio.srcObject = stream;
            remoteAudio.play().catch(() => { });
            applySelectedSpeaker(); // Apply speaker selection
        },
        onConnectionStateChange: (connectionState) => {
            if (connectionState === 'connected') {
                setState({ status: 'in_call' });
            }
            if (connectionState === 'failed' || connectionState === 'disconnected') {
                setState({ status: 'ended' });
            }
        }
    });
}

export function getDeskCallState() {
    return { ...state };
}

export async function joinDeskCall(deskId, opts = {}) {
    if (!mySessionId) return false;

    if (state.deskId && state.deskId !== deskId) {
        await leaveDeskCall();
    }

    setState({ deskId, status: 'ready', error: null, participants: [] });

    const join = await joinDeskCallChannel({
        deskId,
        sessionId: mySessionId,
        displayName: opts.displayName || null,
        onEvent: handleEvent,
        onPresenceSync: handlePresence
    });

    myJoinAt = join.joinAt;
    return true;
}

export async function leaveDeskCall() {
    await hangupDeskCall();
    await leaveDeskCallChannel();
    setState({ deskId: null, status: 'idle', peerSessionId: null, muted: false, error: null });
}

export async function hangupDeskCall() {
    if (state.peerSessionId) {
        sendDeskCallEvent({
            type: 'call_hangup',
            fromSessionId: mySessionId,
            toSessionId: state.peerSessionId,
            ts: Date.now()
        });
    }
    closeDeskPeerConnection();
    setState({ status: 'ended', peerSessionId: null });
}

export function toggleDeskMute() {
    const stream = getDeskLocalStream();
    if (stream) {
        stream.getAudioTracks().forEach(track => {
            track.enabled = !track.enabled;
        });
    }
    setState({ muted: !state.muted });
}

function computeParticipants(presenceState) {
    const participants = [];
    Object.entries(presenceState || {}).forEach(([key, presences]) => {
        if (!presences || presences.length === 0) return;
        const p = presences[0];
        if (!p?.sessionId) return;
        participants.push({
            sessionId: p.sessionId,
            displayName: p.displayName || null,
            joinedAt: p.joinedAt || 0
        });
    });
    participants.sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
    return participants;
}

async function handlePresence(presenceState) {
    // Always update participants list
    const participants = computeParticipants(presenceState);
    setState({ participants });

    if (!presenceState || state.status !== 'ready') return;

    const others = [];
    Object.entries(presenceState).forEach(([key, presences]) => {
        if (!presences || presences.length === 0) return;
        const p = presences[0];
        if (p.sessionId && p.sessionId !== mySessionId) {
            others.push(p);
        }
    });

    if (others.length === 0) return;
    if (state.peerSessionId) return;

    const other = others.sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0))[0];
    if (!other?.sessionId) return;

    if (myJoinAt && other.joinedAt && myJoinAt > other.joinedAt) {
        await startOffer(other.sessionId);
    }
}

async function startOffer(peerSessionId) {
    if (state.status !== 'ready') return;
    setState({ status: 'connecting', peerSessionId });

    try {
        await createDeskPeerConnection();
        await getDeskUserMedia();
        await addDeskLocalStream();
        const offer = await createDeskOffer();

        await sendDeskCallEvent({
            type: 'call_offer',
            fromSessionId: mySessionId,
            toSessionId: peerSessionId,
            sdp: offer,
            ts: Date.now()
        });
    } catch (err) {
        console.error('[DeskCall] offer failed', err);
        setState({ status: 'error', error: err.message || 'offer_failed' });
        closeDeskPeerConnection();
    }
}

async function handleOffer(payload) {
    if (!payload?.sdp) return;
    if (state.status !== 'ready' && state.status !== 'idle') return;
    if (payload.toSessionId && payload.toSessionId !== mySessionId) return;

    setState({ status: 'connecting', peerSessionId: payload.fromSessionId });

    try {
        await createDeskPeerConnection();
        await getDeskUserMedia();
        await addDeskLocalStream();
        await setDeskRemoteDescription(payload.sdp);
        const answer = await createDeskAnswer();

        await sendDeskCallEvent({
            type: 'call_answer',
            fromSessionId: mySessionId,
            toSessionId: payload.fromSessionId,
            sdp: answer,
            ts: Date.now()
        });

        setState({ status: 'in_call' });
    } catch (err) {
        console.error('[DeskCall] answer failed', err);
        setState({ status: 'error', error: err.message || 'answer_failed' });
        closeDeskPeerConnection();
    }
}

async function handleAnswer(payload) {
    if (state.status !== 'connecting') return;
    if (payload?.toSessionId && payload.toSessionId !== mySessionId) return;
    if (!payload?.sdp) return;

    try {
        await setDeskRemoteDescription(payload.sdp);
        setState({ status: 'in_call' });
    } catch (err) {
        console.error('[DeskCall] setRemote failed', err);
        setState({ status: 'error', error: err.message || 'remote_failed' });
    }
}

async function handleIce(payload) {
    if (payload?.toSessionId && payload.toSessionId !== mySessionId) return;
    const candidate = payload?.candidate;
    if (!candidate) return;

    try {
        await addDeskIceCandidate({ candidate });
    } catch (err) {
        console.warn('[deskCall] handleIce failed', err, candidate);
    }
}

function handleHangup(payload) {
    if (payload?.toSessionId && payload.toSessionId !== mySessionId) return;
    closeDeskPeerConnection();
    setState({ status: 'ended', peerSessionId: null });
}

function handleEvent(payload) {
    if (!payload?.type) return;
    if (payload.fromSessionId === mySessionId) return;

    switch (payload.type) {
        case 'call_offer':
            void handleOffer(payload).catch((err) => {
                console.warn('[deskCall] handleOffer failed', err);
            });
            break;
        case 'call_answer':
            void handleAnswer(payload).catch((err) => {
                console.warn('[deskCall] handleAnswer failed', err);
            });
            break;
        case 'call_ice':
            void handleIce(payload).catch((err) => {
                console.warn('[deskCall] handleIce failed', err);
            });
            break;
        case 'call_hangup':
            handleHangup(payload);
            break;
        default:
            break;
    }
}
