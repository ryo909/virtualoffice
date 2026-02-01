// webrtc.js - WebRTC connection management

import { getConfig } from '../services/supabaseClient.js';

let peerConnection = null;
let localStream = null;
let remoteStream = null;

let onIceCandidate = null;
let onTrack = null;
let onConnectionStateChange = null;

export function initWebRTC(callbacks) {
    onIceCandidate = callbacks.onIceCandidate;
    onTrack = callbacks.onTrack;
    onConnectionStateChange = callbacks.onConnectionStateChange;
}

export async function createPeerConnection() {
    const config = getConfig();
    const iceServers = config?.webrtc?.iceServers || [
        { urls: ['stun:stun.cloudflare.com:3478'] }
    ];

    peerConnection = new RTCPeerConnection({ iceServers });

    peerConnection.onicecandidate = (event) => {
        if (event.candidate && onIceCandidate) {
            onIceCandidate(event.candidate);
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

export async function addIceCandidate(candidate) {
    if (!peerConnection) return;

    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
        console.error('Failed to add ICE candidate:', err);
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
