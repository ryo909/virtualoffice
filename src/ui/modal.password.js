// modal.password.js - Password input modal

import { validatePassword } from '../utils/validate.js';

let onSubmit = null;

export function initPasswordModal(submitCallback) {
    onSubmit = submitCallback;

    const submitBtn = document.getElementById('password-submit');
    const input = document.getElementById('password-input');

    submitBtn.addEventListener('click', handleSubmit);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSubmit();
    });
}

async function handleSubmit() {
    const input = document.getElementById('password-input');
    const saveCheckbox = document.getElementById('password-save');
    const errorEl = document.getElementById('password-error');
    const submitBtn = document.getElementById('password-submit');

    // Clear previous error
    errorEl.classList.add('hidden');
    errorEl.textContent = '';

    // Validate
    const validation = validatePassword(input.value);
    if (!validation.valid) {
        errorEl.textContent = validation.error;
        errorEl.classList.remove('hidden');
        return;
    }

    // Disable button during submit
    submitBtn.disabled = true;
    submitBtn.textContent = 'ログイン中...';

    try {
        if (onSubmit) {
            await onSubmit(validation.value, saveCheckbox.checked);
        }
    } catch (err) {
        // Show error
        let message = 'ログインできませんでした';
        if (err.message && err.message.includes('Invalid login')) {
            message = 'パスワードが違います';
        } else if (err.message && err.message.includes('network')) {
            message = '通信に失敗しました';
        }

        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'ログイン';
    }
}

export function showPasswordModal() {
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById('modal-password');
    const nameplateModal = document.getElementById('modal-nameplate');
    const callModal = document.getElementById('modal-incoming-call');

    // Hide other modals
    nameplateModal?.classList.add('hidden');
    callModal?.classList.add('hidden');

    // Show password modal
    modal.classList.remove('hidden');
    overlay.classList.add('visible');

    // Focus input
    document.getElementById('password-input')?.focus();
}

export function hidePasswordModal() {
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById('modal-password');

    modal.classList.add('hidden');
    overlay.classList.remove('visible');
}

export function setSavedPasswordValue(pw) {
    const input = document.getElementById('password-input');
    const checkbox = document.getElementById('password-save');

    if (input && pw) {
        input.value = pw;
    }
    if (checkbox && pw) {
        checkbox.checked = true;
    }
}
