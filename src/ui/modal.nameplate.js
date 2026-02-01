// modal.nameplate.js - Nameplate input modal

import { validateDisplayName } from '../utils/validate.js';

let onSubmit = null;

export function initNameplateModal(submitCallback) {
    onSubmit = submitCallback;

    const submitBtn = document.getElementById('nameplate-submit');
    const input = document.getElementById('nameplate-input');

    submitBtn.addEventListener('click', handleSubmit);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSubmit();
    });
}

async function handleSubmit() {
    const input = document.getElementById('nameplate-input');
    const errorEl = document.getElementById('nameplate-error');
    const submitBtn = document.getElementById('nameplate-submit');

    // Clear previous error
    errorEl.classList.add('hidden');
    errorEl.textContent = '';

    // Validate
    const validation = validateDisplayName(input.value);
    if (!validation.valid) {
        errorEl.textContent = validation.error;
        errorEl.classList.remove('hidden');
        return;
    }

    // Disable button during submit
    submitBtn.disabled = true;
    submitBtn.textContent = '保存中...';

    try {
        if (onSubmit) {
            await onSubmit(validation.value);
        }
    } catch (err) {
        let message = '保存できませんでした';
        if (err.message && err.message.includes('duplicate')) {
            message = 'この名前は既に使われています';
        }

        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '保存';
    }
}

export function showNameplateModal(existingName = '') {
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById('modal-nameplate');
    const passwordModal = document.getElementById('modal-password');
    const callModal = document.getElementById('modal-incoming-call');

    // Hide other modals
    passwordModal?.classList.add('hidden');
    callModal?.classList.add('hidden');

    // Show nameplate modal
    modal.classList.remove('hidden');
    overlay.classList.add('visible');

    // Set existing name if any
    const input = document.getElementById('nameplate-input');
    if (input && existingName) {
        input.value = existingName;
    }

    // Focus input
    input?.focus();
}

export function hideNameplateModal() {
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById('modal-nameplate');

    modal.classList.add('hidden');
    overlay.classList.remove('visible');
}

export function showNameplateError(message) {
    const errorEl = document.getElementById('nameplate-error');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    }
}
