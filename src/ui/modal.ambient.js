import { AMBIENT_PRESETS } from '../data/ambientPresets.js';
import { setAmbientPreset, getAmbientPreset } from '../world/ambientParticles.js';
import { showToast } from './toast.js';

let ambientOverlay = null;
let ambientModal = null;
let isVisible = false;

const STORAGE_KEY = 'ambientPreset:garden';

export function initAmbientModal() {
    if (ambientOverlay) return;

    ambientOverlay = document.createElement('div');
    ambientOverlay.id = 'ambient-modal-overlay';
    ambientOverlay.className = 'spot-modal-overlay';
    document.getElementById('app').appendChild(ambientOverlay);

    ambientModal = document.createElement('div');
    ambientModal.className = 'spot-modal';
    ambientModal.id = 'modal-ambient';
    ambientModal.innerHTML = `
        <div class="modal-header">
            <h2 class="modal-title" id="ambient-modal-title">Ambient Particles</h2>
            <button type="button" class="modal-close-btn" id="ambient-modal-close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6 6 18M6 6l12 12" />
                </svg>
            </button>
        </div>
        <div class="modal-body" id="ambient-modal-body"></div>
    `;
    ambientOverlay.appendChild(ambientModal);

    document.getElementById('ambient-modal-close').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideAmbientModal();
    });

    ambientOverlay.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.target === ambientOverlay) {
            hideAmbientModal();
        }
    });

    ambientModal.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isVisible) {
            hideAmbientModal();
        }
    });
}

export function showAmbientModal() {
    if (!ambientModal) return;

    const current = getAmbientPreset() || localStorage.getItem(STORAGE_KEY) || 'firefly';
    const presets = Object.values(AMBIENT_PRESETS);

    const body = document.getElementById('ambient-modal-body');
    body.innerHTML = `
        <div class="spot-links-list ambient-list">
            ${presets.map(preset => {
                const active = preset.id === current ? 'data-active="true"' : '';
                return `
                    <button type="button" class="spot-link-item" data-ambient-id="${preset.id}" ${active}>
                        <div class="spot-link-header">
                            <span class="spot-link-label">${preset.label}</span>
                            ${preset.id === current ? '<span class="spot-playing">Selected</span>' : ''}
                        </div>
                    </button>
                `;
            }).join('')}
        </div>
    `;

    body.querySelectorAll('[data-ambient-id]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const presetId = btn.getAttribute('data-ambient-id');
            if (!presetId) return;
            try {
                setAmbientPreset(presetId);
                localStorage.setItem(STORAGE_KEY, presetId);
                showToast(`Ambient: ${AMBIENT_PRESETS[presetId]?.label || presetId}`, 'success');
                showAmbientModal();
            } catch (err) {
                console.warn('[Ambient] preset failed', err);
                showToast('Ambientの適用に失敗しました', 'error');
            }
        });
    });

    showModal();
}

export function hideAmbientModal() {
    if (!ambientOverlay) return;
    ambientOverlay.classList.remove('visible');
    isVisible = false;
}

function showModal() {
    ambientOverlay.classList.add('visible');
    isVisible = true;
}
