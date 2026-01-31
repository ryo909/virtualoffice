// toast.js - Toast notifications

const TOAST_DURATION = 4000;

export function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';

    const icons = {
        info: '💬',
        success: '✅',
        warning: '⚠️',
        error: '❌',
        poke: '👆'
    };

    toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
    <button class="toast-close">×</button>
  `;

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => removeToast(toast));

    container.appendChild(toast);

    // Auto remove
    setTimeout(() => removeToast(toast), TOAST_DURATION);
}

function removeToast(toast) {
    if (!toast.parentElement) return;

    toast.classList.add('leaving');
    setTimeout(() => {
        if (toast.parentElement) {
            toast.parentElement.removeChild(toast);
        }
    }, 300);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function showPokeToast(fromName) {
    showToast(`${fromName} が肩ポンしました`, 'poke');
}
