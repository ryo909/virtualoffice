// drawer.settings.js - Settings drawer

import { setThemeId } from '../utils/storage.js';
import {
    getSelectedMicId, setSelectedMicId,
    getSelectedSpeakerId, setSelectedSpeakerId,
    unlockAndEnumerateDevices, isSpeakerSelectionSupported
} from '../services/audioDevices.js';

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

    // Audio device handling
    initAudioSettings();
}

async function initAudioSettings() {
    const micSelect = document.getElementById('audio-mic');
    const speakerSelect = document.getElementById('audio-speaker');
    const speakerHint = document.getElementById('audio-speaker-hint');
    const refreshBtn = document.getElementById('audio-refresh');

    if (!micSelect || !speakerSelect) return;

    // Check speaker support
    const speakerSupported = isSpeakerSelectionSupported();
    if (!speakerSupported) {
        speakerSelect.disabled = true;
        if (speakerHint) {
            speakerHint.textContent = 'スピーカー切替は未対応です（Chrome推奨）';
        }
    }

    // Mic selection change
    micSelect.addEventListener('change', () => {
        const deviceId = micSelect.value;
        setSelectedMicId(deviceId || null);
        console.log('[Audio] Mic selected:', deviceId || 'default');
    });

    // Speaker selection change
    speakerSelect.addEventListener('change', () => {
        const deviceId = speakerSelect.value;
        setSelectedSpeakerId(deviceId || null);
        console.log('[Audio] Speaker selected:', deviceId || 'default');
    });

    // Refresh button
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            populateAudioDevices();
        });
    }

    // Initial population (delayed to let drawer open first)
    setTimeout(() => {
        populateAudioDevices();
    }, 100);
}

async function populateAudioDevices() {
    const micSelect = document.getElementById('audio-mic');
    const speakerSelect = document.getElementById('audio-speaker');

    if (!micSelect || !speakerSelect) return;

    try {
        const { inputs, outputs } = await unlockAndEnumerateDevices();
        const savedMicId = getSelectedMicId();
        const savedSpeakerId = getSelectedSpeakerId();

        // Populate mic options
        micSelect.innerHTML = '<option value="">-- デフォルト --</option>';
        inputs.forEach((device, i) => {
            const label = device.label || `マイク ${i + 1}`;
            const opt = document.createElement('option');
            opt.value = device.deviceId;
            opt.textContent = label;
            opt.selected = device.deviceId === savedMicId;
            micSelect.appendChild(opt);
        });

        // Populate speaker options
        speakerSelect.innerHTML = '<option value="">-- デフォルト --</option>';
        outputs.forEach((device, i) => {
            const label = device.label || `スピーカー ${i + 1}`;
            const opt = document.createElement('option');
            opt.value = device.deviceId;
            opt.textContent = label;
            opt.selected = device.deviceId === savedSpeakerId;
            speakerSelect.appendChild(opt);
        });

        console.log('[Audio] Devices populated:', inputs.length, 'inputs,', outputs.length, 'outputs');
    } catch (err) {
        console.error('[Audio] Failed to enumerate devices:', err);
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
