// modal.spot.js - Spot action modals (Gallery links, Bulletin)

let spotModalOverlay = null;
let spotModal = null;
let isVisible = false;

/**
 * Initialize spot modal (call once on app start)
 */
export function initSpotModal() {
    // Create dedicated overlay for spot modal (to avoid conflicts with other modals)
    spotModalOverlay = document.createElement('div');
    spotModalOverlay.id = 'spot-modal-overlay';
    spotModalOverlay.className = 'spot-modal-overlay';
    document.getElementById('app').appendChild(spotModalOverlay);

    // Create spot modal element
    spotModal = document.createElement('div');
    spotModal.className = 'spot-modal';
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
    spotModalOverlay.appendChild(spotModal);

    // Close button handler
    document.getElementById('spot-modal-close').addEventListener('click', (e) => {
        e.stopPropagation();
        hideSpotModal();
    });

    // Close on overlay click (not modal itself)
    spotModalOverlay.addEventListener('click', (e) => {
        if (e.target === spotModalOverlay) {
            hideSpotModal();
        }
    });

    // Prevent modal clicks from propagating
    spotModal.addEventListener('click', (e) => {
        e.stopPropagation();
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
/**
 * Show the Tool Links modal
 * @param {string} title 
 * @param {Array<{label: string, url: string, desc?: string, tags?: string[]}>} links 
 */
export function showToolLinksModal(title, links) {
    if (!spotModal) return;

    document.getElementById('spot-modal-title').textContent = title;

    const body = document.getElementById('spot-modal-body');
    body.innerHTML = `
        <div class="spot-links-list">
            ${links.map(link => `
                <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="spot-link-item">
                    <div class="spot-link-header">
                        <span class="spot-link-label">${link.label}</span>
                        <svg class="spot-link-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                    </div>
                    ${link.desc ? `<div class="spot-link-desc">${link.desc}</div>` : ''}
                    ${link.tags && link.tags.length > 0 ? `
                        <div class="spot-link-tags">
                            ${link.tags.map(tag => `<span class="spot-tag">${tag}</span>`).join('')}
                        </div>
                    ` : ''}
                </a>
            `).join('')}
        </div>
    `;

    showModal();
}

/**
 * Show the Bulletin modal
 * @param {string} title 
 * @param {Array<{id: string, title: string, body: string, date: string}>} items
 */
export function showBulletinModal(title, items = []) {
    if (!spotModal) return;

    document.getElementById('spot-modal-title').textContent = title;

    const body = document.getElementById('spot-modal-body');

    if (!items || items.length === 0) {
        body.innerHTML = `
            <div class="bulletin-content">
                <div class="bulletin-placeholder">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.4;">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <path d="M3 9h18" />
                        <path d="M9 21V9" />
                    </svg>
                    <p>お知らせ・更新情報はここに表示されます</p>
                    <span class="bulletin-hint">（現在記事はありません）</span>
                </div>
            </div>
        `;
    } else {
        // Sort by date desc
        const sorted = [...items].sort((a, b) => new Date(b.date) - new Date(a.date));

        body.innerHTML = `
            <div class="bulletin-list">
                ${sorted.map(item => `
                    <div class="bulletin-item" onclick="this.classList.toggle('expanded')">
                        <div class="bulletin-header">
                            <span class="bulletin-title">${item.title}</span>
                            <span class="bulletin-date">${item.date}</span>
                        </div>
                        <div class="bulletin-body">${item.body.replace(/\n/g, '<br>')}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    showModal();
}

/**
 * Show the modal (internal)
 */
function showModal() {
    spotModalOverlay.classList.add('visible');
    isVisible = true;
}

/**
 * Hide the spot modal
 */
export function hideSpotModal() {
    if (!spotModalOverlay) return;

    spotModalOverlay.classList.remove('visible');
    isVisible = false;
}

/**
 * Check if spot modal is currently visible
 */
export function isSpotModalVisible() {
    return isVisible;
}
