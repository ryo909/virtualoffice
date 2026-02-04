let overlay = null;
let modal = null;
let titleEl = null;
let bodyEl = null;
let isVisible = false;

export function initModal() {
    if (overlay) return;

    overlay = document.createElement('div');
    overlay.id = 'library-modal-overlay';
    overlay.className = 'spot-modal-overlay';
    document.getElementById('app').appendChild(overlay);

    modal = document.createElement('div');
    modal.id = 'library-modal';
    modal.className = 'spot-modal';
    modal.innerHTML = `
        <div class="modal-header">
            <h2 class="modal-title" id="library-modal-title"></h2>
            <button type="button" class="modal-close-btn" id="library-modal-close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6 6 18M6 6l12 12" />
                </svg>
            </button>
        </div>
        <div class="modal-body" id="library-modal-body"></div>
    `;
    overlay.appendChild(modal);

    document.getElementById('library-modal-close').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
    });

    overlay.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.target === overlay) {
            closeModal();
        }
    });

    modal.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isVisible) {
            closeModal();
        }
    });

    titleEl = document.getElementById('library-modal-title');
    bodyEl = document.getElementById('library-modal-body');
}

export function openModal({ title, contentEl }) {
    if (!overlay) initModal();
    if (titleEl) titleEl.textContent = title || '';
    if (bodyEl) {
        bodyEl.innerHTML = '';
        if (contentEl) bodyEl.appendChild(contentEl);
    }
    overlay.classList.add('visible');
    isVisible = true;
}

export function closeModal() {
    if (!overlay) return;
    overlay.classList.remove('visible');
    isVisible = false;
    if (bodyEl) bodyEl.innerHTML = '';
}

export function isModalVisible() {
    return isVisible;
}
