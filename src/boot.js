// boot.js - Application boot sequence

import { loadConfig, initSupabase, getSession, signIn, getConfig } from './services/supabaseClient.js';
import { initPasswordModal, showPasswordModal, hidePasswordModal, setSavedPasswordValue } from './ui/modal.password.js';
import { initNameplateModal, showNameplateModal, hideNameplateModal } from './ui/modal.nameplate.js';
import { getSavedPassword, setSavedPassword } from './utils/storage.js';
import { unmountCompanion } from './companion/companion.js';
import { initApp, setupNameplate, saveNameplate, startPresence } from './main.js';

// Global Boot Looger & Error Handler
window.bootLog = function (msg) {
    console.log('[BOOT]', msg);
    const el = document.getElementById('bootLog');
    if (el) el.textContent += `${msg}\n`;
};

window.showFatal = function (msg) {
    console.error('[FATAL]', msg);
    try { unmountCompanion(); } catch { }
    const el = document.getElementById('fatalError');
    if (el) {
        el.style.display = 'block';
        el.textContent = `起動に失敗しました:\n${msg}\n\nDevTools Consoleも確認してください。`;
    } else {
        alert(msg);
    }

    // Hide spinner but keep screen for error message
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.classList.remove('hidden');
        const spinner = loadingScreen.querySelector('.loading-spinner');
        if (spinner) spinner.style.display = 'none';
        const text = loadingScreen.querySelector('.loading-text');
        if (text) text.style.display = 'none';
    }
};

function isCompanionIssue(value) {
    const text = String(value || '').toLowerCase();
    if (!text) return false;
    return text.includes('/companion/') ||
        text.includes('companion/voicechat') ||
        text.includes('dialogue.js') ||
        text.includes('tts.js');
}

window.addEventListener('error', (e) => {
    if (isCompanionIssue(e?.message) || isCompanionIssue(e?.filename)) {
        console.error('[BOOT] companion runtime error (non-fatal):', {
            message: e?.message,
            filename: e?.filename,
            lineno: e?.lineno,
            colno: e?.colno
        });
        return;
    }
    window.showFatal(`JS Error: ${e.message}\n${e.filename}:${e.lineno}:${e.colno}`);
});

window.addEventListener('unhandledrejection', (e) => {
    if (isCompanionIssue(e?.reason?.message) || isCompanionIssue(e?.reason)) {
        console.error('[BOOT] companion promise rejection (non-fatal):', e?.reason);
        return;
    }
    const reason = e.reason?.message || String(e.reason);
    window.showFatal(`Unhandled Promise Rejection: ${reason}`);
});

async function boot() {
    window.bootLog('Virtual Office - Booting...');

    try {
        // Step 1: Load config
        window.bootLog('Loading config...');
        const config = await loadConfig();

        // Step 2: Initialize Supabase
        window.bootLog('Initializing Supabase...');
        await initSupabase();

        // Step 3: Check session
        window.bootLog('Checking session...');
        const session = await getSession();

        if (session) {
            // Already logged in
            window.bootLog('Session found, proceeding...');
            await proceedAfterLogin(config, session);
        } else {
            // Need to login
            window.bootLog('No session, showing login...');
            showLoginFlow(config);
        }
    } catch (err) {
        console.error('Boot failed:', err);
        window.showFatal(`起動エラー:\n${err.message || err}`);
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
            window.showFatal('Config not loaded');
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
        window.bootLog('Login successful');
        showLoading('マップを読み込み中...');

        // Initialize the app
        window.bootLog('Initializing app logic...');
        await initApp(config, session);

        // Check/setup nameplate
        window.bootLog('Checking nameplate...');
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
        window.showFatal(`初期化エラー:\n${err.message || err}`);
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
            window.showFatal(`名札設定エラー:\n${err.message || err}`);
        }
    });

    showNameplateModal();
}

async function finishBoot() {
    showLoading('接続中...');

    try {
        // Start presence
        window.bootLog('Starting presence...');
        await startPresence();

        // Hide loading, show main UI
        hideLoading();
        showMainUI();

        window.bootLog('Virtual Office - Ready!');
        console.log('Virtual Office - Ready!');
    } catch (err) {
        console.error('Finish boot failed:', err);
        window.showFatal(`接続エラー:\n${err.message || err}`);
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

// Start boot on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}
