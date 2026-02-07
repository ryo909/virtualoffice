// menubar.js - Top menu bar handling

let currentDrawer = 'none';
let onDrawerChange = null;
let chatUnreadCount = 0;

export function initMenubar(callback) {
    onDrawerChange = callback;

    const navBtns = document.querySelectorAll('#menubar .nav-btn[data-drawer]');
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const drawer = btn.dataset.drawer;
            toggleDrawer(drawer);
        });
    });
}

export function toggleDrawer(drawer) {
    if (currentDrawer === drawer) {
        closeDrawer();
    } else {
        openDrawer(drawer);
    }
}

export function openDrawer(drawer) {
    currentDrawer = drawer;
    updateNavButtons();

    if (onDrawerChange) {
        onDrawerChange(drawer);
    }
}

export function closeDrawer() {
    currentDrawer = 'none';
    updateNavButtons();

    if (onDrawerChange) {
        onDrawerChange('none');
    }
}

function updateNavButtons() {
    const navBtns = document.querySelectorAll('#menubar .nav-btn[data-drawer]');
    navBtns.forEach(btn => {
        const isActive = btn.dataset.drawer === currentDrawer;
        btn.classList.toggle('active', isActive);
    });
}

export function updateDisplayName(name) {
    const el = document.getElementById('my-display-name');
    if (el) el.textContent = name;
}

export function updateStatus(status) {
    const dot = document.getElementById('my-status-dot');
    if (dot) {
        dot.className = 'status-dot';
        if (status !== 'online') {
            dot.classList.add(status);
        }
    }
}

export function getCurrentDrawer() {
    return currentDrawer;
}

export function setChatUnreadBadge({ hasUnread = false, count = 0 } = {}) {
    const dot = document.getElementById('chat-unread-dot');
    const safeCount = Math.max(0, Number(count) || 0);
    chatUnreadCount = safeCount;

    if (dot) {
        dot.classList.toggle('visible', !!hasUnread || safeCount > 0);
    }
}

export function getChatUnreadCount() {
    return chatUnreadCount;
}
