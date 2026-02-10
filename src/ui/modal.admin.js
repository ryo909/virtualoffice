// modal.admin.js - Admin login and panel modals

import { checkAdminSession, loginAdmin, logoutAdmin } from '../admin/adminAuth.js';
import { exportData, loadGallery, loadNews } from '../data/contentLoader.js';
import { adminPurgeDmBefore, adminPurgeDmAll } from '../services/dmMessages.js';
import {
    adminDeleteGlobalMessage,
    adminPurgeGlobalAll,
    adminPurgeGlobalBefore,
    fetchGlobalMessagesForAdmin
} from '../services/globalMessages.js';
import {
    getGalleryAdmin,
    saveGalleryAdmin,
    getNewsAdmin,
    saveNewsAdmin,
    clearContentOverrides
} from '../services/contentRepo.js';

let adminOverlay = null;
let isVisible = false;
let currentTab = 'gallery';
let onDebugHudToggle = null;
let getDebugHudEnabled = null;
let isAdminAuthenticated = false;

// Local state for admin editing
let galleryItems = [];
let newsItems = [];

const DEBUG_HUD_STORAGE_KEY = 'vo:debugHudEnabled';
const ADMIN_SAVE_DEBUG_KEY = 'vo:adminSaveDebug';

function shouldLogAdminSave() {
    if (import.meta?.env?.DEV) return true;
    try {
        if (new URLSearchParams(window.location.search).get('debug') === '1') return true;
    } catch {
        // ignore
    }
    try {
        return localStorage.getItem(ADMIN_SAVE_DEBUG_KEY) === '1';
    } catch {
        return false;
    }
}

/**
 * Initialize admin modal
 */
export function initAdminModal(options = {}) {
    onDebugHudToggle = typeof options.onDebugHudToggle === 'function' ? options.onDebugHudToggle : null;
    getDebugHudEnabled = typeof options.getDebugHudEnabled === 'function' ? options.getDebugHudEnabled : null;

    adminOverlay = document.createElement('div');
    adminOverlay.id = 'admin-modal-overlay';
    adminOverlay.className = 'admin-modal-overlay';
    adminOverlay.innerHTML = `
        <div id="admin-modal" class="admin-modal">
            <div id="admin-login-view" class="admin-view">
                <h2>🔐 管理者ログイン</h2>
                <input type="email" id="admin-email" placeholder="メールアドレス" autocomplete="email">
                <input type="password" id="admin-password" placeholder="パスワード" autocomplete="current-password">
                <div id="admin-login-error" class="admin-error"></div>
                <div class="admin-buttons">
                    <button id="admin-login-btn" class="admin-btn primary">ログイン</button>
                    <button id="admin-cancel-btn" class="admin-btn">キャンセル</button>
                </div>
            </div>
            <div id="admin-panel-view" class="admin-view" style="display:none;">
                <div class="admin-header">
                    <h2>⚙️ 管理者パネル</h2>
                    <button id="admin-logout-btn" class="admin-btn small">ログアウト</button>
                </div>
                <div class="admin-tabs">
                    <button class="admin-tab active" data-tab="gallery">ギャラリー</button>
                    <button class="admin-tab" data-tab="news">お知らせ</button>
                    <button class="admin-tab" data-tab="export">エクスポート/インポート</button>
                    <button class="admin-tab" data-tab="dm">DM管理</button>
                    <button class="admin-tab" data-tab="global">全体チャット管理</button>
                </div>
                <div class="form-group" id="admin-debug-hud-wrap">
                    <label class="form-checkbox" for="admin-debug-hud-toggle">
                        <input type="checkbox" id="admin-debug-hud-toggle">
                        デバッグ表示を有効にする
                    </label>
                </div>
                <div id="admin-tab-content" class="admin-tab-content">
                    <!-- Content loaded dynamically -->
                </div>
                <div class="admin-footer">
                    <button id="admin-save-btn" class="admin-btn primary">💾 保存</button>
                    <button id="admin-close-btn" class="admin-btn">閉じる</button>
                </div>
            </div>
        </div>
    `;
    document.getElementById('app').appendChild(adminOverlay);

    // Event listeners
    document.getElementById('admin-login-btn').addEventListener('click', () => { void handleLogin(); });
    document.getElementById('admin-cancel-btn').addEventListener('click', hideAdminModal);
    document.getElementById('admin-logout-btn').addEventListener('click', () => { void handleLogout(); });
    document.getElementById('admin-save-btn').addEventListener('click', handleSave);
    document.getElementById('admin-close-btn').addEventListener('click', hideAdminModal);
    document.getElementById('admin-debug-hud-toggle')?.addEventListener('change', () => { void handleDebugHudToggleChange(); });

    // Enter key handling
    document.getElementById('admin-email').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            void handleLogin();
        }
    });
    document.getElementById('admin-password').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            void handleLogin();
        }
    });

    // Tab switching
    adminOverlay.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            currentTab = tab.dataset.tab;
            adminOverlay.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderTabContent();
        });
    });

    // Overlay click to close
    adminOverlay.addEventListener('click', (e) => {
        if (e.target === adminOverlay) hideAdminModal();
    });

    // ESC to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isVisible) hideAdminModal();
    });
}

/**
 * Show admin modal
 */
export async function showAdminModal() {
    if (!adminOverlay) return;

    // Check if already logged in
    isAdminAuthenticated = await checkAdminSession();
    if (isAdminAuthenticated) {
        document.getElementById('admin-login-view').style.display = 'none';
        document.getElementById('admin-panel-view').style.display = 'block';
        await syncDebugHudToggleUI();
        renderTabContent();
    } else {
        document.getElementById('admin-login-view').style.display = 'block';
        document.getElementById('admin-panel-view').style.display = 'none';
        document.getElementById('admin-email').value = '';
        document.getElementById('admin-password').value = '';
        document.getElementById('admin-login-error').textContent = '';
        applyDebugHud(false);
    }

    adminOverlay.classList.add('visible');
    isVisible = true;

    // Focus login input
    setTimeout(() => {
        (isAdminAuthenticated ? document.getElementById('admin-save-btn') : document.getElementById('admin-email'))?.focus();
    }, 100);
}

/**
 * Hide admin modal
 */
export function hideAdminModal() {
    if (!adminOverlay) return;
    adminOverlay.classList.remove('visible');
    isVisible = false;
}

async function handleLogin() {
    const email = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-password').value;
    const errorEl = document.getElementById('admin-login-error');
    if (errorEl) {
        errorEl.textContent = '';
    }
    const result = await loginAdmin(email, password);

    if (result.success) {
        isAdminAuthenticated = true;
        document.getElementById('admin-login-view').style.display = 'none';
        document.getElementById('admin-panel-view').style.display = 'block';
        await syncDebugHudToggleUI();
        renderTabContent();
    } else {
        isAdminAuthenticated = false;
        if (errorEl) {
            errorEl.textContent = result.error || 'ログインに失敗しました';
        }
    }
}

async function handleLogout() {
    const result = await logoutAdmin();
    if (!result.success) {
        console.warn('[Admin] logout failed:', result.error);
    }
    isAdminAuthenticated = false;
    persistDebugHudEnabled(false);
    applyDebugHud(false);
    hideAdminModal();
}

function handleSave() {
    if (!isAdminAuthenticated) {
        alert('先に管理者ログインしてください');
        return;
    }
    if (currentTab === 'gallery') {
        saveGalleryFromUI();
    } else if (currentTab === 'news') {
        saveNewsFromUI();
    }
}

function renderTabContent() {
    const container = document.getElementById('admin-tab-content');
    const saveBtn = document.getElementById('admin-save-btn');

    if (currentTab === 'gallery') {
        renderGalleryEditor(container);
        if (saveBtn) {
            saveBtn.style.display = '';
            saveBtn.disabled = isAdminAuthenticated !== true;
        }
    } else if (currentTab === 'news') {
        renderNewsEditor(container);
        if (saveBtn) {
            saveBtn.style.display = '';
            saveBtn.disabled = isAdminAuthenticated !== true;
        }
    } else if (currentTab === 'export') {
        renderExportPanel(container);
        if (saveBtn) {
            saveBtn.style.display = 'none';
            saveBtn.disabled = true;
        }
    } else if (currentTab === 'dm') {
        renderDmMaintenancePanel(container);
        if (saveBtn) {
            saveBtn.style.display = 'none';
            saveBtn.disabled = true;
        }
    } else if (currentTab === 'global') {
        renderGlobalMaintenancePanel(container);
        if (saveBtn) {
            saveBtn.style.display = 'none';
            saveBtn.disabled = true;
        }
    }
}

async function handleDebugHudToggleChange() {
    const checkbox = document.getElementById('admin-debug-hud-toggle');
    if (!checkbox) return;

    isAdminAuthenticated = await checkAdminSession();
    if (!isAdminAuthenticated) {
        checkbox.checked = false;
        persistDebugHudEnabled(false);
        applyDebugHud(false);
        return;
    }

    const enabled = checkbox.checked === true;
    persistDebugHudEnabled(enabled);
    applyDebugHud(enabled);
}

async function syncDebugHudToggleUI() {
    const checkbox = document.getElementById('admin-debug-hud-toggle');
    if (!checkbox) return;

    const admin = await checkAdminSession();
    isAdminAuthenticated = admin;
    const enabled = admin === true && (getDebugHudEnabled?.() ?? loadDebugHudEnabled());
    checkbox.checked = enabled;
    checkbox.disabled = admin !== true;
    applyDebugHud(enabled);
}

function loadDebugHudEnabled() {
    try {
        return localStorage.getItem(DEBUG_HUD_STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

function persistDebugHudEnabled(enabled) {
    try {
        localStorage.setItem(DEBUG_HUD_STORAGE_KEY, enabled ? '1' : '0');
    } catch (err) {
        console.warn('[admin] failed to persist debug hud preference', err);
    }
}

function applyDebugHud(enabled) {
    const safeEnabled = enabled === true && isAdminAuthenticated === true;
    onDebugHudToggle?.(safeEnabled);
}

// ========== Gallery Editor ==========
async function renderGalleryEditor(container) {
    container.innerHTML = '<div class="admin-editor"><div class="chat-empty">読み込み中...</div></div>';
    let loadError = '';

    try {
        const result = await getGalleryAdmin();
        if (result.ok !== true) {
            throw new Error(result.error || 'DBからギャラリーを取得できませんでした');
        }
        galleryItems = Array.isArray(result.items) ? result.items : [];
    } catch (err) {
        console.error('[Admin] Gallery load error:', err);
        galleryItems = [];
        loadError = err?.message || 'DBから取得できませんでした';
    }

    const items = galleryItems;

    container.innerHTML = `
        <div class="admin-editor">
            ${loadError ? `<div class="admin-status error">❌ ${escapeHtml(loadError)}</div>` : ''}
            <div class="admin-list" id="gallery-list">
                ${items.map((item, i) => `
                    <div class="admin-item" data-index="${i}" data-id="${item.id}">
                        <div class="item-header">
                            <span class="item-title">${escapeHtml(item.title || '(無題)')}</span>
                            ${item.is_active === false ? '<span class="item-badge">非表示</span>' : ''}
                            <div class="item-actions">
                                <button class="item-btn" data-action="up" ${i === 0 ? 'disabled' : ''}>↑</button>
                                <button class="item-btn" data-action="down" ${i === items.length - 1 ? 'disabled' : ''}>↓</button>
                                <button class="item-btn" data-action="edit">✏️</button>
                                <button class="item-btn danger" data-action="delete">🗑️</button>
                            </div>
                        </div>
                        <div class="item-meta">${item.url || ''}</div>
                    </div>
                `).join('')}
            </div>
            <div class="admin-buttons">
                <button id="gallery-add-btn" class="admin-btn">+ アイテム追加</button>
                <button id="gallery-save-btn" class="admin-btn primary">💾 保存</button>
            </div>
        </div>
    `;

    // Event handlers
    container.querySelectorAll('.item-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const itemEl = e.target.closest('.admin-item');
            const index = parseInt(itemEl.dataset.index);
            await handleGalleryAction(e.target.dataset.action, index);
        });
    });

    document.getElementById('gallery-add-btn')?.addEventListener('click', () => {
        showGalleryItemEditor(null);
    });

    document.getElementById('gallery-save-btn')?.addEventListener('click', async () => {
        await saveGalleryFromUI();
    });
}

async function handleGalleryAction(action, index) {
    if (action === 'up' && index > 0) {
        // Swap in local array
        [galleryItems[index], galleryItems[index - 1]] = [galleryItems[index - 1], galleryItems[index]];
        renderTabContent();
    } else if (action === 'down' && index < galleryItems.length - 1) {
        // Swap in local array
        [galleryItems[index], galleryItems[index + 1]] = [galleryItems[index + 1], galleryItems[index]];
        renderTabContent();
    } else if (action === 'delete') {
        if (confirm('このアイテムを非表示にしますか？')) {
            // Mark as inactive instead of removing
            galleryItems[index].is_active = false;
            renderTabContent();
        }
    } else if (action === 'edit') {
        showGalleryItemEditor(galleryItems[index], index);
    }
}

function showGalleryItemEditor(item, index) {
    const isNew = !item;
    const editItem = item || { id: crypto.randomUUID(), title: '', url: '', desc: '', tags: [], is_active: true };

    const container = document.getElementById('admin-tab-content');
    container.innerHTML = `
        <div class="admin-form">
            <h3>${isNew ? '新規アイテム' : 'アイテム編集'}</h3>
            <label>タイトル</label>
            <input type="text" id="gallery-edit-title" value="${escapeHtml(editItem.title || '')}">
            <label>URL</label>
            <input type="url" id="gallery-edit-url" value="${escapeHtml(editItem.url || '')}">
            <label>説明</label>
            <input type="text" id="gallery-edit-desc" value="${escapeHtml(editItem.desc || '')}">
            <label>タグ (カンマ区切り)</label>
            <input type="text" id="gallery-edit-tags" value="${(editItem.tags || []).join(', ')}">
            <div class="form-group">
                <label class="form-checkbox" for="gallery-edit-active">
                    <input type="checkbox" id="gallery-edit-active" ${editItem.is_active !== false ? 'checked' : ''}>
                    表示する
                </label>
            </div>
            <div class="admin-buttons">
                <button id="gallery-edit-save" class="admin-btn primary">適用</button>
                <button id="gallery-edit-cancel" class="admin-btn">キャンセル</button>
            </div>
        </div>
    `;

    document.getElementById('gallery-edit-save').addEventListener('click', () => {
        const data = {
            id: editItem.id,
            title: document.getElementById('gallery-edit-title').value,
            url: document.getElementById('gallery-edit-url').value,
            desc: document.getElementById('gallery-edit-desc').value,
            tags: document.getElementById('gallery-edit-tags').value.split(',').map(t => t.trim()).filter(Boolean),
            is_active: document.getElementById('gallery-edit-active').checked
        };

        if (isNew) {
            // Add to end of array
            galleryItems.push(data);
        } else {
            // Update existing item
            galleryItems[index] = data;
        }
        renderTabContent();
    });

    document.getElementById('gallery-edit-cancel').addEventListener('click', () => {
        renderTabContent();
    });
}

async function saveGalleryFromUI() {
    try {
        if (shouldLogAdminSave()) {
            console.log('[Admin] saving galleryItems', galleryItems);
        }
        const result = await saveGalleryAdmin(galleryItems);
        if (shouldLogAdminSave()) {
            console.log('[Admin] saveGalleryAdmin result', result);
        }
        if (result.ok) {
            await loadGallery();
            renderTabContent();
            alert('保存しました（DB反映確認OK）');
        } else {
            alert('保存に失敗しました: ' + (result.error || 'Unknown error'));
        }
    } catch (err) {
        console.error('[Admin] Gallery save failed:', err);
        alert('保存に失敗しました: ' + err.message);
    }
}

// ========== News Editor ==========
function compareNewsItems(a, b) {
    const pinnedA = a?.pinned === true ? 1 : 0;
    const pinnedB = b?.pinned === true ? 1 : 0;
    if (pinnedA !== pinnedB) return pinnedB - pinnedA;

    const orderA = Number.isFinite(Number(a?.order)) ? Number(a.order) : Number.MAX_SAFE_INTEGER;
    const orderB = Number.isFinite(Number(b?.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;

    const dateA = Date.parse(a?.published_at || a?.date || '');
    const dateB = Date.parse(b?.published_at || b?.date || '');
    if (Number.isFinite(dateA) && Number.isFinite(dateB) && dateA !== dateB) return dateB - dateA;
    if (Number.isFinite(dateA) && !Number.isFinite(dateB)) return -1;
    if (!Number.isFinite(dateA) && Number.isFinite(dateB)) return 1;
    return 0;
}

function sortNewsItemsInPlace() {
    newsItems.sort(compareNewsItems);
}

function normalizeNewsOrders() {
    newsItems.forEach((item, index) => {
        item.order = index;
    });
}

function nextNewsOrder() {
    if (!Array.isArray(newsItems) || newsItems.length === 0) return 0;
    return Math.max(...newsItems.map((item) => Number(item?.order) || 0)) + 1;
}

async function renderNewsEditor(container) {
    container.innerHTML = '<div class="admin-editor"><div class="chat-empty">読み込み中...</div></div>';
    let loadError = '';

    try {
        const result = await getNewsAdmin();
        if (result.ok !== true) {
            throw new Error(result.error || 'DBからニュースを取得できませんでした');
        }
        newsItems = Array.isArray(result.items) ? result.items : [];
        sortNewsItemsInPlace();
        normalizeNewsOrders();
    } catch (err) {
        console.error('[Admin] News load error:', err);
        newsItems = [];
        loadError = err?.message || 'DBから取得できませんでした';
    }

    const items = newsItems;

    container.innerHTML = `
        <div class="admin-editor">
            ${loadError ? `<div class="admin-status error">❌ ${escapeHtml(loadError)}</div>` : ''}
            <div class="admin-list" id="news-list">
                ${items.map((item, i) => `
                    <div class="admin-item" data-index="${i}" data-id="${item.id}">
                        <div class="item-header">
                            <span class="item-title">${escapeHtml(item.title || '(無題)')}</span>
                            ${item.pinned ? '<span class="item-badge">📌</span>' : ''}
                            ${item.status === 'draft' ? '<span class="item-badge">下書き</span>' : ''}
                            <span class="item-date">${item.date || ''}</span>
                            <span class="item-date">order: ${Number(item.order) || 0}</span>
                            <div class="item-actions">
                                <button class="item-btn" data-action="up" ${i === 0 ? 'disabled' : ''}>↑</button>
                                <button class="item-btn" data-action="down" ${i === items.length - 1 ? 'disabled' : ''}>↓</button>
                                <button class="item-btn" data-action="pin" title="ピン留め">${item.pinned ? '⭐' : '☆'}</button>
                                <button class="item-btn" data-action="edit">✏️</button>
                                <button class="item-btn danger" data-action="delete">🗑️</button>
                            </div>
                        </div>
                        <div class="item-meta">${escapeHtml((item.body || '').substring(0, 50))}...</div>
                    </div>
                `).join('')}
            </div>
            <div class="admin-buttons">
                <button id="news-add-btn" class="admin-btn">+ ニュース追加</button>
                <button id="news-save-btn" class="admin-btn primary">💾 保存</button>
            </div>
        </div>
    `;

    container.querySelectorAll('.item-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const itemEl = e.target.closest('.admin-item');
            const index = parseInt(itemEl.dataset.index, 10);
            handleNewsAction(e.target.dataset.action, index);
        });
    });

    document.getElementById('news-add-btn')?.addEventListener('click', () => {
        showNewsItemEditor(null);
    });

    document.getElementById('news-save-btn')?.addEventListener('click', async () => {
        await saveNewsFromUI();
    });
}

function formatDate(d) {
    if (!d) return '';
    if (typeof d === 'string') return d.split('T')[0];
    const date = d instanceof Date ? d : new Date(d);
    return date.toISOString().split('T')[0];
}

function handleNewsAction(action, index) {
    if (action === 'up' && index > 0) {
        [newsItems[index], newsItems[index - 1]] = [newsItems[index - 1], newsItems[index]];
        normalizeNewsOrders();
        renderTabContent();
    } else if (action === 'down' && index < newsItems.length - 1) {
        [newsItems[index], newsItems[index + 1]] = [newsItems[index + 1], newsItems[index]];
        normalizeNewsOrders();
        renderTabContent();
    } else if (action === 'pin') {
        // Toggle pinned in local array
        newsItems[index].pinned = !newsItems[index].pinned;
        sortNewsItemsInPlace();
        normalizeNewsOrders();
        renderTabContent();
    } else if (action === 'delete') {
        if (confirm('このニュースを削除しますか？')) {
            // Remove from array (will delete on save)
            newsItems.splice(index, 1);
            normalizeNewsOrders();
            renderTabContent();
        }
    } else if (action === 'edit') {
        showNewsItemEditor(newsItems[index], index);
    }
}

function showNewsItemEditor(item, index) {
    const isNew = !item;
    const editItem = item || {
        id: crypto.randomUUID(),
        title: '',
        body: '',
        date: new Date().toISOString().split('T')[0],
        status: 'draft',
        pinned: false,
        order: nextNewsOrder(),
        published_at: null
    };

    const container = document.getElementById('admin-tab-content');
    container.innerHTML = `
        <div class="admin-form">
            <h3>${isNew ? '新規ニュース' : 'ニュース編集'}</h3>
            <label>タイトル</label>
            <input type="text" id="news-edit-title" value="${escapeHtml(editItem.title || '')}">
            <label>日付</label>
            <input type="date" id="news-edit-date" value="${editItem.date || ''}">
            <label>本文</label>
            <textarea id="news-edit-body" rows="5">${escapeHtml(editItem.body || '')}</textarea>
            <div class="form-group">
                <label class="form-checkbox" for="news-edit-published">
                    <input type="checkbox" id="news-edit-published" ${editItem.status === 'published' ? 'checked' : ''}>
                    公開する
                </label>
            </div>
            <div class="form-group">
                <label class="form-checkbox" for="news-edit-pinned">
                    <input type="checkbox" id="news-edit-pinned" ${editItem.pinned ? 'checked' : ''}>
                    ピン留め
                </label>
            </div>
            <div class="admin-buttons">
                <button id="news-edit-save" class="admin-btn primary">適用</button>
                <button id="news-edit-cancel" class="admin-btn">キャンセル</button>
            </div>
        </div>
    `;

    document.getElementById('news-edit-save').addEventListener('click', () => {
        const data = {
            id: editItem.id,
            title: document.getElementById('news-edit-title').value,
            body: document.getElementById('news-edit-body').value,
            date: document.getElementById('news-edit-date').value || new Date().toISOString().split('T')[0],
            status: document.getElementById('news-edit-published').checked ? 'published' : 'draft',
            pinned: document.getElementById('news-edit-pinned').checked,
            order: Number.isFinite(Number(editItem.order)) ? Number(editItem.order) : nextNewsOrder(),
            published_at: editItem.published_at || null
        };

        if (data.status === 'published' && !data.published_at) {
            data.published_at = new Date().toISOString();
        }
        if (data.status !== 'published') {
            data.published_at = null;
        }

        if (isNew) {
            newsItems.push(data);
        } else {
            newsItems[index] = data;
        }
        sortNewsItemsInPlace();
        normalizeNewsOrders();
        renderTabContent();
    });

    document.getElementById('news-edit-cancel').addEventListener('click', () => {
        renderTabContent();
    });
}

async function saveNewsFromUI() {
    try {
        normalizeNewsOrders();
        if (shouldLogAdminSave()) {
            console.log('[Admin] saving newsItems', newsItems);
        }
        const result = await saveNewsAdmin(newsItems);
        if (shouldLogAdminSave()) {
            console.log('[Admin] saveNewsAdmin result', result);
        }
        if (result.ok) {
            await loadNews();
            renderTabContent();
            alert('保存しました（DB反映確認OK）');
        } else {
            alert('保存に失敗しました: ' + (result.error || 'Unknown error'));
        }
    } catch (err) {
        console.error('[Admin] News save failed:', err);
        alert('保存に失敗しました: ' + err.message);
    }
}

function normalizeGalleryImportItems(items) {
    if (!Array.isArray(items)) return [];
    return items.map((item, index) => ({
        id: item?.id || crypto.randomUUID(),
        title: item?.title || '',
        url: item?.url || '',
        desc: item?.desc || item?.description || '',
        tags: Array.isArray(item?.tags) ? item.tags : [],
        is_active: item?.is_active !== false,
        order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index
    }));
}

function normalizeNewsImportItems(items) {
    if (!Array.isArray(items)) return [];
    return items.map((item, index) => ({
        id: item?.id || crypto.randomUUID(),
        title: item?.title || '',
        body: item?.body || '',
        date: item?.date || new Date().toISOString().split('T')[0],
        status: item?.status === 'draft' ? 'draft' : 'published',
        pinned: item?.pinned === true,
        order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index
    }));
}

function parseImportItems(parsed) {
    const gallery = Array.isArray(parsed?.gallery?.items)
        ? parsed.gallery.items
        : (Array.isArray(parsed?.gallery) ? parsed.gallery : []);
    const news = Array.isArray(parsed?.news?.items)
        ? parsed.news.items
        : (Array.isArray(parsed?.news) ? parsed.news : []);
    return { gallery, news };
}

// ========== Export/Import ==========
function renderExportPanel(container) {
    const exportJson = exportData();

    container.innerHTML = `
        <div class="admin-export">
            <h3>📤 エクスポート</h3>
            <p>現在のギャラリー/お知らせデータをコピーまたはダウンロードできます</p>
            <textarea id="export-text" readonly rows="8">${exportJson}</textarea>
            <div class="admin-buttons">
                <button id="export-copy-btn" class="admin-btn">📋 コピー</button>
                <button id="export-download-btn" class="admin-btn">💾 ダウンロード</button>
            </div>
            
            <h3>📥 インポート</h3>
            <p>JSONを貼り付けてインポート</p>
            <textarea id="import-text" rows="5" placeholder='{"gallery": {...}, "news": {...}}'></textarea>
            <div id="import-status" class="admin-status"></div>
            <div class="admin-buttons">
                <button id="import-btn" class="admin-btn primary">インポート</button>
                <button id="clear-overrides-btn" class="admin-btn danger">🗑️ オーバーライドをリセット</button>
            </div>
        </div>
    `;

    document.getElementById('export-copy-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(exportJson);
        alert('クリップボードにコピーしました');
    });

    document.getElementById('export-download-btn').addEventListener('click', () => {
        const blob = new Blob([exportJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `virtualoffice-content-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });

    document.getElementById('import-btn').addEventListener('click', async () => {
        const text = document.getElementById('import-text').value;
        const status = document.getElementById('import-status');

        let parsed = null;
        try {
            parsed = JSON.parse(text);
        } catch (err) {
            status.textContent = `❌ エラー: JSON形式が不正です (${err?.message || 'parse error'})`;
            status.className = 'admin-status error';
            return;
        }

        const { gallery, news } = parseImportItems(parsed);
        if (gallery.length === 0 && news.length === 0) {
            status.textContent = '❌ エラー: gallery/news の items が見つかりません';
            status.className = 'admin-status error';
            return;
        }

        const galleryItemsToSave = normalizeGalleryImportItems(gallery);
        const newsItemsToSave = normalizeNewsImportItems(news);

        try {
            if (galleryItemsToSave.length > 0) {
                const result = await saveGalleryAdmin(galleryItemsToSave);
                if (!result.ok) throw new Error(`gallery保存失敗: ${result.error || 'unknown'}`);
            }
            if (newsItemsToSave.length > 0) {
                const result = await saveNewsAdmin(newsItemsToSave);
                if (!result.ok) throw new Error(`news保存失敗: ${result.error || 'unknown'}`);
            }

            await Promise.all([loadGallery(), loadNews()]);
            status.textContent = `✅ DBへ保存しました (gallery=${galleryItemsToSave.length}, news=${newsItemsToSave.length})`;
            status.className = 'admin-status success';
        } catch (err) {
            console.error('[Admin] import to DB failed', err);
            status.textContent = `❌ エラー: ${err?.message || '保存に失敗しました'}`;
            status.className = 'admin-status error';
        }
    });

    document.getElementById('clear-overrides-btn').addEventListener('click', () => {
        if (confirm('debug override のキーのみ削除します。DBデータは削除されません。実行しますか？')) {
            const result = clearContentOverrides();
            if (!result.ok) {
                alert(`リセットに失敗しました: ${result.error || 'unknown error'}`);
                return;
            }
            alert(`overrideキーを削除しました (${result.cleared}件)。DBデータは保持されています。`);
        }
    });
}

function renderDmMaintenancePanel(container) {
    container.innerHTML = `
        <div class="admin-export">
            <h3>🧹 DMデータ削除</h3>
            <p>無料枠節約のため、古いDMや全件DMを削除できます。</p>
            <div class="form-group">
                <label class="form-label" for="dm-purge-days">削除対象（日数より前）</label>
                <input type="number" id="dm-purge-days" class="form-input" min="1" step="1" value="30">
            </div>
            <div class="admin-buttons">
                <button id="dm-purge-before-btn" class="admin-btn">30日より前を削除</button>
                <button id="dm-purge-all-btn" class="admin-btn danger">🗑️ DMを全削除</button>
            </div>
            <div id="dm-purge-status" class="admin-status"></div>
        </div>
    `;

    const statusEl = document.getElementById('dm-purge-status');
    const daysInput = document.getElementById('dm-purge-days');
    const purgeBeforeBtn = document.getElementById('dm-purge-before-btn');
    const purgeAllBtn = document.getElementById('dm-purge-all-btn');

    function setStatus(text, ok) {
        if (!statusEl) return;
        statusEl.textContent = text;
        statusEl.className = ok ? 'admin-status success' : 'admin-status error';
    }

    function setBusy(busy) {
        if (purgeBeforeBtn) purgeBeforeBtn.disabled = busy;
        if (purgeAllBtn) purgeAllBtn.disabled = busy;
    }

    purgeBeforeBtn?.addEventListener('click', async () => {
        const days = Math.max(1, Number(daysInput?.value) || 30);
        if (!confirm(`${days}日より前のDMを削除します。よろしいですか？`)) return;

        setBusy(true);
        try {
            const deleted = await adminPurgeDmBefore(days);
            setStatus(`削除しました（削除件数: ${deleted}）`, true);
        } catch (err) {
            console.error('[admin] DM purge before failed', err);
            setStatus('削除に失敗しました', false);
        } finally {
            setBusy(false);
        }
    });

    purgeAllBtn?.addEventListener('click', async () => {
        if (!confirm('DMを全件削除します。元に戻せません。実行しますか？')) return;

        setBusy(true);
        try {
            const deleted = await adminPurgeDmAll();
            setStatus(`削除しました（削除件数: ${deleted}）`, true);
        } catch (err) {
            console.error('[admin] DM purge all failed', err);
            setStatus('削除に失敗しました', false);
        } finally {
            setBusy(false);
        }
    });
}

function renderGlobalMaintenancePanel(container) {
    container.innerHTML = `
        <div class="admin-export">
            <h3>🧹 全体チャット削除</h3>
            <p>全体チャット履歴を一覧確認し、1件削除または一括削除できます。</p>
            <div class="form-group">
                <label class="form-label" for="global-room-id">room_id（空欄で全ルーム）</label>
                <input type="text" id="global-room-id" class="form-input" value="room:default" placeholder="room:default">
            </div>
            <div class="form-group">
                <label class="form-label" for="global-purge-days">削除対象（日数より前）</label>
                <input type="number" id="global-purge-days" class="form-input" min="1" step="1" value="30">
            </div>
            <div class="admin-buttons">
                <button id="global-refresh-btn" class="admin-btn">一覧を更新</button>
                <button id="global-purge-before-btn" class="admin-btn">30日より前を削除</button>
                <button id="global-purge-all-btn" class="admin-btn danger">🗑️ 全体チャットを全削除</button>
            </div>
            <div id="global-purge-status" class="admin-status"></div>
            <div class="admin-list" id="global-message-list"></div>
        </div>
    `;

    const statusEl = document.getElementById('global-purge-status');
    const roomInput = document.getElementById('global-room-id');
    const daysInput = document.getElementById('global-purge-days');
    const listEl = document.getElementById('global-message-list');
    const refreshBtn = document.getElementById('global-refresh-btn');
    const purgeBeforeBtn = document.getElementById('global-purge-before-btn');
    const purgeAllBtn = document.getElementById('global-purge-all-btn');

    function roomIdValue() {
        const value = String(roomInput?.value || '').trim();
        return value || null;
    }

    function setStatus(text, ok) {
        if (!statusEl) return;
        statusEl.textContent = text;
        statusEl.className = ok ? 'admin-status success' : 'admin-status error';
    }

    function setBusy(busy) {
        if (refreshBtn) refreshBtn.disabled = busy;
        if (purgeBeforeBtn) purgeBeforeBtn.disabled = busy;
        if (purgeAllBtn) purgeAllBtn.disabled = busy;
        if (listEl) {
            listEl.querySelectorAll('button[data-action="delete"]').forEach(btn => {
                btn.disabled = busy;
            });
        }
    }

    async function reloadList() {
        if (!listEl) return;
        listEl.innerHTML = '<div class="chat-empty">読み込み中...</div>';

        try {
            const rows = await fetchGlobalMessagesForAdmin({ roomId: roomIdValue(), limit: 200 });
            if (!rows.length) {
                listEl.innerHTML = '<div class="chat-empty">対象メッセージはありません。</div>';
                return;
            }

            listEl.innerHTML = rows.map(row => {
                const msg = String(row?.message || '').slice(0, 120);
                const name = row?.sender_display_name || row?.sender_actor_id || '不明';
                return `
                    <div class="admin-item">
                        <div class="item-header">
                            <span class="item-title">${escapeHtml(name)}</span>
                            <span class="item-date">${escapeHtml(formatAdminDate(row?.created_at))}</span>
                            <div class="item-actions">
                                <button class="item-btn danger" data-action="delete" data-id="${escapeHtml(row?.id || '')}" title="削除">🗑️</button>
                            </div>
                        </div>
                        <div class="item-meta">${escapeHtml(msg || '(空メッセージ)')}</div>
                    </div>
                `;
            }).join('');
        } catch (err) {
            console.error('[admin] global list fetch failed', err);
            listEl.innerHTML = '<div class="chat-empty">一覧の取得に失敗しました。</div>';
        }
    }

    refreshBtn?.addEventListener('click', () => {
        void reloadList();
    });

    purgeBeforeBtn?.addEventListener('click', async () => {
        const days = Math.max(1, Number(daysInput?.value) || 30);
        if (!confirm(`${days}日より前の全体チャットを削除します。よろしいですか？`)) return;

        setBusy(true);
        try {
            const deleted = await adminPurgeGlobalBefore(days, roomIdValue());
            setStatus(`削除しました（削除件数: ${deleted}）`, true);
            await reloadList();
        } catch (err) {
            console.error('[admin] global purge before failed', err);
            setStatus('削除に失敗しました', false);
        } finally {
            setBusy(false);
        }
    });

    purgeAllBtn?.addEventListener('click', async () => {
        if (!confirm('全体チャットを全件削除します。元に戻せません。実行しますか？')) return;

        setBusy(true);
        try {
            const deleted = await adminPurgeGlobalAll(roomIdValue());
            setStatus(`削除しました（削除件数: ${deleted}）`, true);
            await reloadList();
        } catch (err) {
            console.error('[admin] global purge all failed', err);
            setStatus('削除に失敗しました', false);
        } finally {
            setBusy(false);
        }
    });

    listEl?.addEventListener('click', async (e) => {
        const btn = e.target.closest?.('button[data-action="delete"]');
        if (!btn) return;
        const id = btn.dataset.id;
        if (!id) return;
        if (!confirm('このメッセージを削除します。よろしいですか？')) return;

        setBusy(true);
        try {
            const deleted = await adminDeleteGlobalMessage(id);
            if (deleted > 0) {
                setStatus('削除しました（削除件数: 1）', true);
            } else {
                setStatus('対象メッセージが見つかりませんでした', false);
            }
            await reloadList();
        } catch (err) {
            console.error('[admin] global delete failed', err);
            setStatus('削除に失敗しました', false);
        } finally {
            setBusy(false);
        }
    });

    void reloadList();
}

function formatAdminDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('ja-JP', { hour12: false });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
}

export function isAdminModalVisible() {
    return isVisible;
}
