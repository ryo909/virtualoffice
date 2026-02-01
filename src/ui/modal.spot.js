// modal.spot.js - Spot action modals (Gallery links, Bulletin)

let modalOverlay = null;
let spotModal = null;
let isVisible = false;

/**
 * Initialize spot modal (call once on app start)
 */
export function initSpotModal() {
    // Create modal container if not exists
    modalOverlay = document.getElementById('modal-overlay');

    // Create spot modal element
    spotModal = document.createElement('div');
    spotModal.className = 'modal hidden';
    spotModal.id = 'modal-spot';
    spotModal.innerHTML = `
        <div class="modal-header">
            <h2 class="modal-title" id="spot-modal-title">Spot</h2>
            <button class="modal-close-btn" id="spot-modal-close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6 6 18M6 6l12 12" />
                </svg>
            </button>
        </div>
        <div class="modal-body" id="spot-modal-body"></div>
    `;
    modalOverlay.appendChild(spotModal);

    // Close button handler
    document.getElementById('spot-modal-close').addEventListener('click', hideSpotModal);

    // Close on overlay click
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay && isVisible) {
            hideSpotModal();
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isVisible) {
            hideSpotModal();
        }
    });
}

/**
 * Show the Tool Links modal
 * @param {string} title 
 * @param {Array<{label: string, url: string}>} links 
 */
export function showToolLinksModal(title, links) {
    if (!spotModal) return;

    document.getElementById('spot-modal-title').textContent = title;

    const body = document.getElementById('spot-modal-body');
    body.innerHTML = `
        <div class="spot-links-list">
            ${links.map(link => `
                <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="spot-link-item">
                    <span class="spot-link-label">${link.label}</span>
                    <svg class="spot-link-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                </a>
            `).join('')}
        </div>
    `;

    showModal();
}

/**
 * Show the Bulletin modal
 * @param {string} title 
 */
export function showBulletinModal(title) {
    if (!spotModal) return;

    document.getElementById('spot-modal-title').textContent = title;

    const body = document.getElementById('spot-modal-body');
    body.innerHTML = `
        <div class="bulletin-content">
            <div class="bulletin-placeholder">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.4;">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M3 9h18" />
                    <path d="M9 21V9" />
                </svg>
                <p>お知らせ・更新情報はここに表示されます</p>
                <span class="bulletin-hint">（準備中）</span>
            </div>
        </div>
    `;

    showModal();
}

/**
 * Show the modal (internal)
 */
function showModal() {
    modalOverlay.classList.add('visible');
    spotModal.classList.remove('hidden');
    isVisible = true;
}

/**
 * Hide the spot modal
 */
export function hideSpotModal() {
    if (!spotModal) return;

    spotModal.classList.add('hidden');
    modalOverlay.classList.remove('visible');
    isVisible = false;
}

/**
 * Check if spot modal is currently visible
 */
export function isSpotModalVisible() {
    return isVisible;
}
