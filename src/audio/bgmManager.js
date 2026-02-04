let audio = null;
let unlocked = false;
let currentUrl = null;
let pendingUrl = null;

const STORAGE_VOLUME = 'bgm:volume';

export function initBgm() {
    if (audio) return audio;

    audio = new Audio();
    audio.loop = true;
    audio.preload = 'none';

    const saved = Number(localStorage.getItem(STORAGE_VOLUME));
    const volume = Number.isFinite(saved) ? Math.max(0, Math.min(1, saved)) : 0.25;
    audio.volume = volume;

    return audio;
}

export function unlockAudio() {
    if (unlocked) return;
    unlocked = true;

    if (pendingUrl) {
        const url = pendingUrl;
        pendingUrl = null;
        void playBgm(url);
    }
}

export async function playBgm(url) {
    if (!audio) initBgm();
    if (!url) return;

    if (!unlocked) {
        pendingUrl = url;
        return;
    }

    if (currentUrl !== url) {
        currentUrl = url;
        audio.src = url;
    }

    try {
        await audio.play();
    } catch (err) {
        console.warn('[BGM] play failed (missing file or not allowed yet)', err);
    }
}

export function stopBgm() {
    if (!audio) return;
    try {
        audio.pause();
        audio.currentTime = 0;
    } catch (err) {
        console.warn('[BGM] stop failed', err);
    }
}

export function setVolume(v) {
    if (!audio) initBgm();
    const volume = Math.max(0, Math.min(1, Number(v)));
    audio.volume = volume;
    localStorage.setItem(STORAGE_VOLUME, String(volume));
}

export function getState() {
    return {
        unlocked,
        currentUrl,
        pendingUrl,
        volume: audio ? audio.volume : null
    };
}
