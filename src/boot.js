// boot.js - Application boot sequence

import { loadConfig, initSupabase, getSession, signIn, getConfig } from './services/supabaseClient.js';
import { initPasswordModal, showPasswordModal, hidePasswordModal, setSavedPasswordValue } from './ui/modal.password.js';
import { initNameplateModal, showNameplateModal, hideNameplateModal } from './ui/modal.nameplate.js';
import { getSavedPassword, setSavedPassword } from './utils/storage.js';
import { initApp, setupNameplate, saveNameplate, startPresence } from './main.js';

async function boot() {
    console.log('Virtual Office - Booting...');

    try {
        // Step 1: Load config
        console.log('Loading config...');
        const config = await loadConfig();

        // Step 2: Initialize Supabase
        console.log('Initializing Supabase...');
        await initSupabase();

        // Step 3: Check session
        console.log('Checking session...');
        const session = await getSession();

        if (session) {
            // Already logged in
            console.log('Session found, proceeding...');
            await proceedAfterLogin(config, session);
        } else {
            // Need to login
            console.log('No session, showing login...');
            showLoginFlow(config);
        }
    } catch (err) {
        console.error('Boot failed:', err);
        showError(`起動エラー:\n${err.message || err}`);
    }
}

function showLoginFlow(config) {
    // Initialize password modal
    initPasswordModal(async (password, saveToDevice) => {
        try {
            const { session } = await signIn(password);

            if (saveToDevice) {
                setSavedPassword(password);
            }

            hidePasswordModal();
            await proceedAfterLogin(config, session);
        } catch (err) {
            console.error('Login flow failed:', err);
            showError(`ログイン後の処理に失敗しました:\n${err.message || err}`);
        }
    });

    // Check for saved password
    const savedPw = getSavedPassword();
    if (savedPw) {
        if (!config) {
            // Should not happen, but safe check
            showError('Config not loaded');
            return;
        }

        // Auto-login attempt
        // We need to trigger the modal logic or duplicate it.
        // For simplicity, let's just populate the modal and strict flow.
        setSavedPasswordValue(savedPw);
    }

    // Hide loading, show password modal
    hideLoading();
    showPasswordModal();
}

async function proceedAfterLogin(config, session) {
    try {
        showLoading('マップを読み込み中...');

        // Initialize the app
        await initApp(config, session);

        // Check/setup nameplate
        showLoading('名札を確認中...');
        const hasNameplate = await setupNameplate();

        if (!hasNameplate) {
            // Need to set nameplate
            hideLoading();
            showNameplateFlow();
        } else {
            // Ready to start
            await finishBoot();
        }
    } catch (err) {
        console.error('Proceed failed:', err);
        showError(`初期化エラー:\n${err.message || err}`);
    }
}

function showNameplateFlow() {
    initNameplateModal(async (displayName) => {
        try {
            await saveNameplate(displayName);
            hideNameplateModal();
            await finishBoot();
        } catch (err) {
            console.error('Nameplate flow failed:', err);
            showError(`名札設定エラー:\n${err.message || err}`);
        }
    });

    showNameplateModal();
}

async function finishBoot() {
    showLoading('接続中...');

    try {
        // Start presence
        await startPresence();

        // Hide loading, show main UI
        hideLoading();
        showMainUI();

        console.log('Virtual Office - Ready!');
    } catch (err) {
        console.error('Finish boot failed:', err);
        showError(`接続エラー:\n${err.message || err}`);
    }
}

function showLoading(text = 'Loading...') {
    const loading = document.getElementById('loading-screen');
    const loadingText = loading?.querySelector('.loading-text');

    if (loading) loading.classList.remove('hidden');
    if (loadingText) loadingText.textContent = text;
}

function hideLoading() {
    const loading = document.getElementById('loading-screen');
    if (loading) loading.classList.add('hidden');
}

function showMainUI() {
    document.getElementById('menubar')?.classList.remove('hidden');
    document.getElementById('main')?.classList.remove('hidden');
}

function showError(message) {
    hideLoading();

    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);color:#fff;z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,sans-serif;white-space:pre-wrap;';

    const box = document.createElement('div');
    box.style.cssText = 'max-width:720px;background:rgba(20,20,20,0.95);border:1px solid rgba(255,255,255,0.2);border-radius:12px;padding:20px;box-shadow:0 0 20px rgba(0,0,0,0.5);';

    // HTML Escape
    const safeMessage = String(message).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    box.innerHTML = `
        <div style="font-size:20px;font-weight:700;margin-bottom:12px;color:#ff5555;">Load Error</div>
        <div style="font-size:14px;line-height:1.6;margin-bottom:16px;color:#e2e8f0;background:#1e293b;padding:12px;border-radius:6px;overflow-x:auto;">${safeMessage}</div>
        <div style="font-size:12px;opacity:0.7;">Open DevTools Console details. <a href="javascript:location.reload()" style="color:#60a5fa;margin-left:8px;">Reload</a></div>
    `;
    div.appendChild(box);
    document.body.appendChild(div);
}

// Start boot on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}
