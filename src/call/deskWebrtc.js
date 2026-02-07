// deskWebrtc.js - WebRTC connection management for desk calls (separate from direct calls)

import { getConfig } from '../services/supabaseClient.js';
import { getSelectedMicId } from '../services/audioDevices.js';

let peerConnection = null;
let localStream = null;
let remoteStream = null;

let onIceCandidate = null;
let onTrack = null;
let onConnectionStateChange = null;

export function initDeskWebRTC(callbacks) {
    onIceCandidate = callbacks?.onIceCandidate || null;
    onTrack = callbacks?.onTrack || null;
    onConnectionStateChange = callbacks?.onConnectionStateChange || null;
}

export async function createDeskPeerConnection() {
    const config = getConfig();
    const iceServers = config?.webrtc?.iceServers || [
        { urls: ['stun:stun.cloudflare.com:3478'] }
    ];

    peerConnection = new RTCPeerConnection({ iceServers });

    peerConnection.onicecandidate = (event) => {
        try {
            const candidate = event?.candidate;
            if (!candidate) return;
            console.log('[ICE] local candidate', candidate);
            const result = onIceCandidate?.({ candidate });
            if (result && typeof result.catch === 'function') {
                result.catch((err) => {
                    console.warn('[deskWebrtc] onIceCandidate callback failed', err);
                });
            }
        } catch (err) {
            console.warn('[deskWebrtc] onicecandidate handler failed', err);
        }
    };

    peerConnection.ontrack = (event) => {
        remoteStream = event.streams[0];
        if (onTrack) {
            onTrack(remoteStream);
        }
    };

    peerConnection.onconnectionstatechange = () => {
        if (onConnectionStateChange) {
            onConnectionStateChange(peerConnection.connectionState);
        }
    };

    return peerConnection;
}

export async function getDeskUserMedia() {
    const micId = getSelectedMicId();

    // Build audio constraint with selected device if available
    const audioConstraint = micId
        ? { deviceId: { exact: micId } }
        : true;

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: audioConstraint,
            video: false
        });
        console.log('[deskWebrtc] getUserMedia success, mic:', micId || 'default');
    } catch (err) {
        // Fallback to default mic if specific device fails
        console.warn('[deskWebrtc] getUserMedia with deviceId failed, fallback to default', err);
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false
        });
    }

    return localStream;
}

export async function addDeskLocalStream() {
    if (!peerConnection || !localStream) return;
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });
}

export async function createDeskOffer() {
    if (!peerConnection) return null;
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    return offer;
}

export async function createDeskAnswer() {
    if (!peerConnection) return null;
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    return answer;
}

export async function setDeskRemoteDescription(description) {
    if (!peerConnection) return;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(description));
}

export async function addDeskIceCandidate(payload) {
    if (!peerConnection) return;
    const candidate = payload?.candidate;
    if (!candidate) return;

    console.log('[ICE] remote candidate received', candidate);

    const candidateInit = typeof candidate === 'string'
        ? { candidate }
        : candidate;

    try {
        const iceCandidate = candidate instanceof RTCIceCandidate
            ? candidate
            : new RTCIceCandidate(candidateInit);
        await peerConnection.addIceCandidate(iceCandidate);
    } catch (err) {
        console.warn('[deskWebrtc] addIceCandidate failed', err, candidateInit);
    }
}

export function closeDeskPeerConnection() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    remoteStream = null;
}

export function getDeskLocalStream() {
    return localStream;
}

export function getDeskRemoteStream() {
    return remoteStream;
}
