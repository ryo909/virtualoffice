// audioDevices.js - Audio device selection and persistence

const STORAGE_MIC = 'audio.selectedMicId';
const STORAGE_SPEAKER = 'audio.selectedSpeakerId';

/**
 * Get saved microphone device ID
 */
export function getSelectedMicId() {
    return localStorage.getItem(STORAGE_MIC) || null;
}

/**
 * Save selected microphone device ID
 */
export function setSelectedMicId(id) {
    if (id) {
        localStorage.setItem(STORAGE_MIC, id);
    } else {
        localStorage.removeItem(STORAGE_MIC);
    }
}

/**
 * Get saved speaker device ID
 */
export function getSelectedSpeakerId() {
    return localStorage.getItem(STORAGE_SPEAKER) || null;
}

/**
 * Save selected speaker device ID
 */
export function setSelectedSpeakerId(id) {
    if (id) {
        localStorage.setItem(STORAGE_SPEAKER, id);
    } else {
        localStorage.removeItem(STORAGE_SPEAKER);
    }
}

/**
 * Unlock audio permission and enumerate devices
 * This requests microphone permission first to get device labels
 */
export async function unlockAndEnumerateDevices() {
    // Try to unlock audio permission first (needed to get device labels)
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop()); // Release immediately
        console.log('[audioDevices] permission unlocked');
    } catch (e) {
        console.warn('[audioDevices] permission denied or error', e);
        // Continue anyway - we just won't get device labels
    }

    // Enumerate devices
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter(d => d.kind === 'audioinput');
    const outputs = devices.filter(d => d.kind === 'audiooutput');

    console.log('[audioDevices] inputs:', inputs.length, 'outputs:', outputs.length);

    return { inputs, outputs };
}

/**
 * Check if browser supports speaker output selection
 */
export function isSpeakerSelectionSupported() {
    // setSinkId is available on HTMLMediaElement in Chrome and Edge
    const testAudio = document.createElement('audio');
    return typeof testAudio.setSinkId === 'function';
}
