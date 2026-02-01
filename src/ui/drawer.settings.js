// drawer.settings.js - Settings drawer

import { setThemeId } from '../utils/storage.js';

let onNameChange = null;
let onStatusChange = null;
let onLogout = null;
let onClearPassword = null;

export function initSettingsDrawer({ nameChangeCallback, statusChangeCallback, logoutCallback, clearPasswordCallback }) {
    onNameChange = nameChangeCallback;
    onStatusChange = statusChangeCallback;
    onLogout = logoutCallback;
    onClearPassword = clearPasswordCallback;

    // Theme options
    const themeOptions = document.querySelectorAll('#theme-options .theme-option');
    themeOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            const themeId = opt.dataset.theme;
            applyTheme(themeId);

            // Update active state
            themeOptions.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
        });
    });

    // Status options
    const statusOptions = document.querySelectorAll('[data-status]');
    statusOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            const status = opt.dataset.status;

            // Update active state
            statusOptions.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');

            if (onStatusChange) {
                onStatusChange(status);
            }
        });
    });

    // Name save button
    const saveNameBtn = document.getElementById('settings-name-save');
    const nameInput = document.getElementById('settings-name');

    if (saveNameBtn && nameInput) {
        saveNameBtn.addEventListener('click', () => {
            const name = nameInput.value.trim();
            if (name && onNameChange) {
                onNameChange(name);
            }
        });
    }

    // Logout button
    const logoutBtn = document.getElementById('settings-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (onLogout) onLogout();
        });
    }

    // Clear password button
    const clearPwBtn = document.getElementById('settings-clear-pw');
    if (clearPwBtn) {
        clearPwBtn.addEventListener('click', () => {
            if (onClearPassword) onClearPassword();
        });
    }
}

export function applyTheme(themeId) {
    document.body.setAttribute('data-theme', themeId);
    setThemeId(themeId);
}

export function setDisplayNameInput(name) {
    const input = document.getElementById('settings-name');
    if (input) {
        input.value = name;
    }
}

export function setActiveStatus(status) {
    const options = document.querySelectorAll('[data-status]');
    options.forEach(opt => {
        opt.classList.toggle('active', opt.dataset.status === status);
    });
}

export function setActiveTheme(themeId) {
    const options = document.querySelectorAll('#theme-options .theme-option');
    options.forEach(opt => {
        opt.classList.toggle('active', opt.dataset.theme === themeId);
    });
}
