import { playBgm, stopBgm, setVolume } from '../audio/bgmManager.js';

let bgmModalOverlay = null;
let bgmModal = null;
let isVisible = false;

const STORAGE_SELECTED = 'bgm:garden:selected';

export function initBgmModal() {
    if (bgmModalOverlay) return;

    bgmModalOverlay = document.createElement('div');
    bgmModalOverlay.id = 'bgm-modal-overlay';
    bgmModalOverlay.className = 'spot-modal-overlay';
    document.getElementById('app').appendChild(bgmModalOverlay);

    bgmModal = document.createElement('div');
    bgmModal.className = 'spot-modal';
    bgmModal.id = 'modal-bgm';
    bgmModal.innerHTML = `
        <div class="modal-header">
            <h2 class="modal-title" id="bgm-modal-title">Garden BGM</h2>
            <button type="button" class="modal-close-btn" id="bgm-modal-close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6 6 18M6 6l12 12" />
                </svg>
            </button>
        </div>
        <div class="modal-body" id="bgm-modal-body"></div>
    `;
    bgmModalOverlay.appendChild(bgmModal);

    document.getElementById('bgm-modal-close').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideBgmModal();
    });

    bgmModalOverlay.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.target === bgmModalOverlay) {
            hideBgmModal();
        }
    });

    bgmModal.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isVisible) {
            hideBgmModal();
        }
    });
}

export function showBgmModal({ tracks = [], selectedId = null, title = 'Garden BGM' } = {}) {
    if (!bgmModal) return;

    const titleEl = document.getElementById('bgm-modal-title');
    if (titleEl) titleEl.textContent = title;

    const body = document.getElementById('bgm-modal-body');
    const selected = selectedId || localStorage.getItem(STORAGE_SELECTED) || 'none';

    const trackButtons = tracks.map(track => {
        const active = track.id === selected ? 'data-active="true"' : '';
        return `
            <button type="button" class="spot-link-item" data-track-id="${track.id}" ${active}>
                <div class="spot-link-header">
                    <span class="spot-link-label">${track.title || track.label || track.id}</span>
                    ${track.id === selected ? '<span class="spot-playing">Playing</span>' : ''}
                </div>
            </button>
        `;
    }).join('');

    body.innerHTML = `
        <div class="spot-links-list bgm-track-list">
            ${trackButtons || '<div class="spot-link-item">No tracks</div>'}
        </div>
        <div class="spot-links-list" style="margin-top: 12px; gap: 12px;">
            <div class="spot-link-item" style="align-items: center;">
                <label style="flex: 1;">Volume</label>
                <input id="bgm-volume" type="range" min="0" max="1" step="0.01" value="${getCurrentVolume()}" />
            </div>
            <button type="button" class="spot-link-item" id="bgm-stop-btn">Stop</button>
        </div>
    `;

    body.querySelectorAll('[data-track-id]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const trackId = btn.getAttribute('data-track-id');
            const track = tracks.find(t => t.id === trackId);
            if (!track) return;
            playBgm(track.src || track.url);
            localStorage.setItem(STORAGE_SELECTED, track.id);
            showBgmModal({ tracks, selectedId: track.id });
        });
    });

    const stopBtn = document.getElementById('bgm-stop-btn');
    if (stopBtn) {
        stopBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            stopBgm();
            localStorage.setItem(STORAGE_SELECTED, 'none');
            showBgmModal({ tracks, selectedId: 'none' });
        });
    }

    const volumeInput = document.getElementById('bgm-volume');
    if (volumeInput) {
        volumeInput.addEventListener('input', (e) => {
            setVolume(e.target.value);
        });
    }

    showModal();
}

export function hideBgmModal() {
    if (!bgmModalOverlay) return;
    bgmModalOverlay.classList.remove('visible');
    isVisible = false;
}

function showModal() {
    bgmModalOverlay.classList.add('visible');
    isVisible = true;
}

function getCurrentVolume() {
    const saved = Number(localStorage.getItem('bgm:volume'));
    return Number.isFinite(saved) ? Math.max(0, Math.min(1, saved)) : 0.25;
}
