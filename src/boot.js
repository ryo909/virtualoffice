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
        showError('アプリケーションの起動に失敗しました');
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
            throw err;
        }
    });

    // Check for saved password
    const savedPw = getSavedPassword();
    if (savedPw) {
        setSavedPasswordValue(savedPw);
    }

    // Hide loading, show password modal
    hideLoading();
    showPasswordModal();
}

async function proceedAfterLogin(config, session) {
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
}

function showNameplateFlow() {
    initNameplateModal(async (displayName) => {
        try {
            await saveNameplate(displayName);
            hideNameplateModal();
            await finishBoot();
        } catch (err) {
            throw err;
        }
    });

    showNameplateModal();
}

async function finishBoot() {
    showLoading('接続中...');

    // Start presence
    await startPresence();

    // Hide loading, show main UI
    hideLoading();
    showMainUI();

    console.log('Virtual Office - Ready!');
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
    const loading = document.getElementById('loading-screen');
    if (loading) {
        loading.innerHTML = `
      <div style="text-align: center; color: var(--color-danger);">
        <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
        <div>${message}</div>
        <button onclick="location.reload()" class="btn btn-primary" style="margin-top: 16px;">再読み込み</button>
      </div>
    `;
    }
}

// Start boot on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}
