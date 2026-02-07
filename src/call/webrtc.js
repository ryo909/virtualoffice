// webrtc.js - WebRTC connection management

import { getConfig } from '../services/supabaseClient.js';

let peerConnection = null;
let localStream = null;
let remoteStream = null;

let onIceCandidate = null;
let onTrack = null;
let onConnectionStateChange = null;

export function initWebRTC(callbacks) {
    onIceCandidate = callbacks?.onIceCandidate || null;
    onTrack = callbacks?.onTrack || null;
    onConnectionStateChange = callbacks?.onConnectionStateChange || null;
}

export async function createPeerConnection() {
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
                    console.warn('[webrtc] onIceCandidate callback failed', err);
                });
            }
        } catch (err) {
            console.warn('[webrtc] onicecandidate handler failed', err);
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

export async function getUserMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false // Audio only for MVP
        });

        return localStream;
    } catch (err) {
        console.error('Failed to get user media:', err);
        throw err;
    }
}

export async function addLocalStream() {
    if (!peerConnection || !localStream) return;

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });
}

export async function createOffer() {
    if (!peerConnection) return null;

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    return offer;
}

export async function createAnswer() {
    if (!peerConnection) return null;

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    return answer;
}

export async function setRemoteDescription(description) {
    if (!peerConnection) return;

    await peerConnection.setRemoteDescription(new RTCSessionDescription(description));
}

export async function addIceCandidate(payload) {
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
        console.warn('[webrtc] addIceCandidate failed', err, candidateInit);
    }
}

export function closePeerConnection() {
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

export function getPeerConnection() {
    return peerConnection;
}

export function getLocalStream() {
    return localStream;
}

export function getRemoteStream() {
    return remoteStream;
}
