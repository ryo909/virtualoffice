let audio = null;
let unlocked = false;
let pendingTrack = null;
let currentAreaId = 'area:core';

const STORAGE_VOLUME = 'bgm:volume';
const GARDEN_AREA_ID = 'area:garden';

const state = {
    playingId: null,
    playingTitle: null,
    isPlaying: false
};

function clampVolume(value) {
    return Math.max(0, Math.min(1, Number(value)));
}

function resolveTrackUrl(track) {
    if (!track) return '';
    if (track.src) return String(track.src);
    if (track.url) return String(track.url);
    if (!track.file) return '';
    const base = String(import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
    const path = String(track.file).replace(/^\/+/, '');
    return `${base}/${path}`.replace(/^\/\//, '/');
}

export function initBgmManager() {
    if (audio) return audio;

    audio = new Audio();
    audio.loop = true;
    audio.preload = 'auto';

    const saved = Number(localStorage.getItem(STORAGE_VOLUME));
    audio.volume = Number.isFinite(saved) ? clampVolume(saved) : 0.25;
    return audio;
}

export function setAreaId(areaId) {
    currentAreaId = areaId || 'area:core';
    if (currentAreaId !== GARDEN_AREA_ID) {
        stop();
    }
}

export function unlockAudio() {
    if (unlocked) return;
    unlocked = true;

    if (pendingTrack) {
        const track = pendingTrack;
        pendingTrack = null;
        void playTrack(track);
    }
}

export async function playTrack(track, { areaId } = {}) {
    if (!track?.file) return false;
    if (!audio) initBgmManager();

    const targetArea = areaId || currentAreaId;
    if (targetArea !== GARDEN_AREA_ID) {
        stop();
        return false;
    }
    currentAreaId = targetArea;

    if (!unlocked) {
        pendingTrack = track;
        return false;
    }

    const nextUrl = resolveTrackUrl(track);
    if (!nextUrl) return false;

    try {
        audio.pause();
        audio.src = nextUrl;
        audio.load();
        audio.currentTime = 0;
        await audio.play();
        state.playingId = track.id || null;
        state.playingTitle = track.title || null;
        state.isPlaying = true;
        pendingTrack = null;
        return true;
    } catch (err) {
        state.isPlaying = false;
        console.warn('[BGM] play failed', err);
        return false;
    }
}

export function stop() {
    state.playingId = null;
    state.playingTitle = null;
    state.isPlaying = false;
    pendingTrack = null;
    if (!audio) return;
    try {
        audio.pause();
        audio.currentTime = 0;
        audio.src = '';
    } catch (err) {
        console.warn('[BGM] stop failed', err);
    }
}

export function setVolume(v) {
    if (!audio) initBgmManager();
    const volume = clampVolume(v);
    audio.volume = volume;
    localStorage.setItem(STORAGE_VOLUME, String(volume));
}

export function getState() {
    return {
        playingId: state.playingId,
        playingTitle: state.playingTitle,
        isPlaying: state.isPlaying,
        volume: audio ? audio.volume : null
    };
}

// Backward compatibility exports
export const initBgm = initBgmManager;
export const playBgm = (url) => {
    if (!url) return Promise.resolve(false);
    return playTrack({ id: 'legacy', title: 'BGM', file: url, src: url }, { areaId: currentAreaId });
};
export const stopBgm = stop;
