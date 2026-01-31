// signaling.js - WebRTC signaling via Supabase Realtime

import { sendEventTo } from '../services/realtime.js';
import { generateCallId } from '../utils/ids.js';
import {
    requestCall,
    receiveIncomingCall,
    callConnected,
    endCall,
    callError,
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
    closePeerConnection
} from './webrtc.js';

let myActorId = null;

export function initSignaling({ actorId }) {
    myActorId = actorId;
}

/**
 * Initiate a call to a peer
 */
export async function startCall(peerActorId) {
    const callId = generateCallId();

    if (!requestCall(peerActorId, callId)) {
        return false;
    }

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
                fromActorId: myActorId,
                offer
            }
        });

        return true;
    } catch (err) {
        console.error('Failed to start call:', err);
        callError(err.message);
        closePeerConnection();
        return false;
    }
}

/**
 * Handle incoming call request
 */
export function handleCallRequest({ callId, fromActorId, offer }) {
    if (!receiveIncomingCall(fromActorId, callId)) {
        // Send busy signal
        sendEventTo(fromActorId, {
            type: 'call_busy',
            payload: { callId }
        });
        return false;
    }

    // Store offer for later use when accepting
    window.__pendingOffer = offer;

    return true;
}

/**
 * Accept incoming call
 */
export async function acceptIncomingCall() {
    const state = getCallState();
    const offer = window.__pendingOffer;

    if (!offer || state.state !== 'incoming') {
        return false;
    }

    try {
        await createPeerConnection();
        await getUserMedia();
        await addLocalStream();

        await setRemoteDescription(offer);
        const answer = await createAnswer();

        // Send answer
        await sendEventTo(state.peerActorId, {
            type: 'call_answer',
            payload: {
                callId: state.callId,
                fromActorId: myActorId,
                answer
            }
        });

        callConnected();
        delete window.__pendingOffer;

        return true;
    } catch (err) {
        console.error('Failed to accept call:', err);
        callError(err.message);
        closePeerConnection();
        return false;
    }
}

/**
 * Handle call answer
 */
export async function handleCallAnswer({ callId, answer }) {
    const state = getCallState();

    if (state.state !== 'requesting' || state.callId !== callId) {
        return false;
    }

    try {
        await setRemoteDescription(answer);
        callConnected();
        return true;
    } catch (err) {
        console.error('Failed to handle call answer:', err);
        callError(err.message);
        return false;
    }
}

/**
 * Handle ICE candidate
 */
export async function handleIceCandidate({ candidate }) {
    await addIceCandidate(candidate);
}

/**
 * Hang up call
 */
export async function hangUp() {
    const state = getCallState();

    if (state.peerActorId) {
        await sendEventTo(state.peerActorId, {
            type: 'call_hangup',
            payload: {
                callId: state.callId,
                fromActorId: myActorId
            }
        });
    }

    closePeerConnection();
    endCall();
}

/**
 * Handle hangup from peer
 */
export function handleHangup() {
    closePeerConnection();
    endCall();
}

/**
 * Handle call event from realtime
 */
export function handleCallEvent(event) {
    const { type, payload } = event;

    switch (type) {
        case 'call_request':
            return handleCallRequest(payload);
        case 'call_answer':
            return handleCallAnswer(payload);
        case 'call_ice_candidate':
            return handleIceCandidate(payload);
        case 'call_hangup':
            return handleHangup();
        case 'call_busy':
            callError('User is busy');
            closePeerConnection();
            return true;
        default:
            return false;
    }
}
