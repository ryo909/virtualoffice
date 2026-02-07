// modal.admin.js - Admin login and panel modals

import { checkAdminSession, loginAdmin, logoutAdmin } from '../admin/adminAuth.js';
import {
    getGallery, getNews,
    saveGalleryOverride, saveNewsOverride,
    exportData, importData, clearOverrides
} from '../data/contentLoader.js';
import { adminPurgeDmBefore, adminPurgeDmAll } from '../services/dmMessages.js';
import {
    adminDeleteGlobalMessage,
    adminPurgeGlobalAll,
    adminPurgeGlobalBefore,
    fetchGlobalMessagesForAdmin
} from '../services/globalMessages.js';

let adminOverlay = null;
let isVisible = false;
let currentTab = 'gallery';
let onDebugHudToggle = null;
let getDebugHudEnabled = null;

const DEBUG_HUD_STORAGE_KEY = 'vo:debugHudEnabled';

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
                <input type="password" id="admin-password" placeholder="パスワード" maxlength="10">
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
    document.getElementById('admin-login-btn').addEventListener('click', handleLogin);
    document.getElementById('admin-cancel-btn').addEventListener('click', hideAdminModal);
    document.getElementById('admin-logout-btn').addEventListener('click', handleLogout);
    document.getElementById('admin-save-btn').addEventListener('click', handleSave);
    document.getElementById('admin-close-btn').addEventListener('click', hideAdminModal);
    document.getElementById('admin-debug-hud-toggle')?.addEventListener('change', handleDebugHudToggleChange);

    // Password enter key
    document.getElementById('admin-password').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleLogin();
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
export function showAdminModal() {
    if (!adminOverlay) return;

    // Check if already logged in
    if (checkAdminSession()) {
        document.getElementById('admin-login-view').style.display = 'none';
        document.getElementById('admin-panel-view').style.display = 'block';
        syncDebugHudToggleUI();
        renderTabContent();
    } else {
        document.getElementById('admin-login-view').style.display = 'block';
        document.getElementById('admin-panel-view').style.display = 'none';
        document.getElementById('admin-password').value = '';
        document.getElementById('admin-login-error').textContent = '';
        applyDebugHud(false);
    }

    adminOverlay.classList.add('visible');
    isVisible = true;

    // Focus password input
    setTimeout(() => {
        document.getElementById('admin-password')?.focus();
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

function handleLogin() {
    const password = document.getElementById('admin-password').value;
    const result = loginAdmin(password);

    if (result.success) {
        document.getElementById('admin-login-view').style.display = 'none';
        document.getElementById('admin-panel-view').style.display = 'block';
        syncDebugHudToggleUI();
        renderTabContent();
    } else {
        document.getElementById('admin-login-error').textContent = result.error;
    }
}

function handleLogout() {
    logoutAdmin();
    persistDebugHudEnabled(false);
    applyDebugHud(false);
    hideAdminModal();
}

function handleSave() {
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
        if (saveBtn) saveBtn.style.display = '';
    } else if (currentTab === 'news') {
        renderNewsEditor(container);
        if (saveBtn) saveBtn.style.display = '';
    } else if (currentTab === 'export') {
        renderExportPanel(container);
        if (saveBtn) saveBtn.style.display = 'none';
    } else if (currentTab === 'dm') {
        renderDmMaintenancePanel(container);
        if (saveBtn) saveBtn.style.display = 'none';
    } else if (currentTab === 'global') {
        renderGlobalMaintenancePanel(container);
        if (saveBtn) saveBtn.style.display = 'none';
    }
}

function handleDebugHudToggleChange() {
    const checkbox = document.getElementById('admin-debug-hud-toggle');
    if (!checkbox) return;

    if (!checkAdminSession()) {
        checkbox.checked = false;
        persistDebugHudEnabled(false);
        applyDebugHud(false);
        return;
    }

    const enabled = checkbox.checked === true;
    persistDebugHudEnabled(enabled);
    applyDebugHud(enabled);
}

function syncDebugHudToggleUI() {
    const checkbox = document.getElementById('admin-debug-hud-toggle');
    if (!checkbox) return;

    const admin = checkAdminSession();
    const enabled = admin && (getDebugHudEnabled?.() ?? loadDebugHudEnabled());
    checkbox.checked = enabled;
    checkbox.disabled = !admin;
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
    const safeEnabled = enabled === true && checkAdminSession();
    onDebugHudToggle?.(safeEnabled);
}

// ========== Gallery Editor ==========
function renderGalleryEditor(container) {
    const gallery = getGallery();
    const items = gallery?.items || [];

    container.innerHTML = `
        <div class="admin-editor">
            <div class="admin-list" id="gallery-list">
                ${items.map((item, i) => `
                    <div class="admin-item" data-index="${i}">
                        <div class="item-header">
                            <span class="item-title">${item.title || '(無題)'}</span>
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
            <button id="gallery-add-btn" class="admin-btn">+ アイテム追加</button>
        </div>
    `;

    // Event handlers
    container.querySelectorAll('.item-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const item = e.target.closest('.admin-item');
            const index = parseInt(item.dataset.index);
            handleGalleryAction(e.target.dataset.action, index);
        });
    });

    document.getElementById('gallery-add-btn').addEventListener('click', () => {
        showGalleryItemEditor(-1);
    });
}

function handleGalleryAction(action, index) {
    const gallery = getGallery();
    const items = [...gallery.items];

    if (action === 'up' && index > 0) {
        [items[index], items[index - 1]] = [items[index - 1], items[index]];
        saveGalleryOverride({ ...gallery, items });
        renderTabContent();
    } else if (action === 'down' && index < items.length - 1) {
        [items[index], items[index + 1]] = [items[index + 1], items[index]];
        saveGalleryOverride({ ...gallery, items });
        renderTabContent();
    } else if (action === 'delete') {
        if (confirm('このアイテムを削除しますか？')) {
            items.splice(index, 1);
            saveGalleryOverride({ ...gallery, items });
            renderTabContent();
        }
    } else if (action === 'edit') {
        showGalleryItemEditor(index);
    }
}

function showGalleryItemEditor(index) {
    const gallery = getGallery();
    const item = index >= 0 ? gallery.items[index] : { id: `tool-${Date.now()}`, title: '', url: '', desc: '', tags: [] };

    const container = document.getElementById('admin-tab-content');
    container.innerHTML = `
        <div class="admin-form">
            <h3>${index >= 0 ? 'アイテム編集' : '新規アイテム'}</h3>
            <label>タイトル</label>
            <input type="text" id="gallery-edit-title" value="${item.title || ''}">
            <label>URL</label>
            <input type="url" id="gallery-edit-url" value="${item.url || ''}">
            <label>説明</label>
            <input type="text" id="gallery-edit-desc" value="${item.desc || ''}">
            <label>タグ (カンマ区切り)</label>
            <input type="text" id="gallery-edit-tags" value="${(item.tags || []).join(', ')}">
            <div class="admin-buttons">
                <button id="gallery-edit-save" class="admin-btn primary">保存</button>
                <button id="gallery-edit-cancel" class="admin-btn">キャンセル</button>
            </div>
        </div>
    `;

    document.getElementById('gallery-edit-save').addEventListener('click', () => {
        const newItem = {
            id: item.id,
            title: document.getElementById('gallery-edit-title').value,
            url: document.getElementById('gallery-edit-url').value,
            desc: document.getElementById('gallery-edit-desc').value,
            tags: document.getElementById('gallery-edit-tags').value.split(',').map(t => t.trim()).filter(Boolean)
        };

        const items = [...gallery.items];
        if (index >= 0) {
            items[index] = newItem;
        } else {
            items.push(newItem);
        }
        saveGalleryOverride({ ...gallery, items });
        renderTabContent();
    });

    document.getElementById('gallery-edit-cancel').addEventListener('click', renderTabContent);
}

function saveGalleryFromUI() {
    // Already saving on each action, just show confirmation
    alert('ギャラリーを保存しました');
}

// ========== News Editor ==========
function renderNewsEditor(container) {
    const news = getNews();
    const items = news?.items || [];

    container.innerHTML = `
        <div class="admin-editor">
            <div class="admin-list" id="news-list">
                ${items.map((item, i) => `
                    <div class="admin-item" data-index="${i}">
                        <div class="item-header">
                            <span class="item-title">${item.title || '(無題)'}</span>
                            <span class="item-date">${item.date || ''}</span>
                            <div class="item-actions">
                                <button class="item-btn" data-action="up" ${i === 0 ? 'disabled' : ''}>↑</button>
                                <button class="item-btn" data-action="down" ${i === items.length - 1 ? 'disabled' : ''}>↓</button>
                                <button class="item-btn" data-action="edit">✏️</button>
                                <button class="item-btn danger" data-action="delete">🗑️</button>
                            </div>
                        </div>
                        <div class="item-meta">${(item.body || '').substring(0, 50)}...</div>
                    </div>
                `).join('')}
            </div>
            <button id="news-add-btn" class="admin-btn">+ ニュース追加</button>
        </div>
    `;

    container.querySelectorAll('.item-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const item = e.target.closest('.admin-item');
            const index = parseInt(item.dataset.index);
            handleNewsAction(e.target.dataset.action, index);
        });
    });

    document.getElementById('news-add-btn').addEventListener('click', () => {
        showNewsItemEditor(-1);
    });
}

function handleNewsAction(action, index) {
    const news = getNews();
    const items = [...news.items];

    if (action === 'up' && index > 0) {
        [items[index], items[index - 1]] = [items[index - 1], items[index]];
        saveNewsOverride({ ...news, items });
        renderTabContent();
    } else if (action === 'down' && index < items.length - 1) {
        [items[index], items[index + 1]] = [items[index + 1], items[index]];
        saveNewsOverride({ ...news, items });
        renderTabContent();
    } else if (action === 'delete') {
        if (confirm('このニュースを削除しますか？')) {
            items.splice(index, 1);
            saveNewsOverride({ ...news, items });
            renderTabContent();
        }
    } else if (action === 'edit') {
        showNewsItemEditor(index);
    }
}

function showNewsItemEditor(index) {
    const news = getNews();
    const item = index >= 0 ? news.items[index] : {
        id: `news-${Date.now()}`,
        title: '',
        body: '',
        date: new Date().toISOString().split('T')[0]
    };

    const container = document.getElementById('admin-tab-content');
    container.innerHTML = `
        <div class="admin-form">
            <h3>${index >= 0 ? 'ニュース編集' : '新規ニュース'}</h3>
            <label>タイトル</label>
            <input type="text" id="news-edit-title" value="${item.title || ''}">
            <label>日付</label>
            <input type="date" id="news-edit-date" value="${item.date || ''}">
            <label>本文</label>
            <textarea id="news-edit-body" rows="5">${item.body || ''}</textarea>
            <div class="admin-buttons">
                <button id="news-edit-save" class="admin-btn primary">保存</button>
                <button id="news-edit-cancel" class="admin-btn">キャンセル</button>
            </div>
        </div>
    `;

    document.getElementById('news-edit-save').addEventListener('click', () => {
        const newItem = {
            id: item.id,
            title: document.getElementById('news-edit-title').value,
            date: document.getElementById('news-edit-date').value,
            body: document.getElementById('news-edit-body').value
        };

        const items = [...news.items];
        if (index >= 0) {
            items[index] = newItem;
        } else {
            items.push(newItem);
        }
        saveNewsOverride({ ...news, items });
        renderTabContent();
    });

    document.getElementById('news-edit-cancel').addEventListener('click', renderTabContent);
}

function saveNewsFromUI() {
    alert('お知らせを保存しました');
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

    document.getElementById('import-btn').addEventListener('click', () => {
        const text = document.getElementById('import-text').value;
        const result = importData(text);
        const status = document.getElementById('import-status');
        if (result.success) {
            status.textContent = '✅ インポート成功';
            status.className = 'admin-status success';
        } else {
            status.textContent = `❌ エラー: ${result.error}`;
            status.className = 'admin-status error';
        }
    });

    document.getElementById('clear-overrides-btn').addEventListener('click', () => {
        if (confirm('localStorageのオーバーライドをすべてリセットしますか？\nデフォルトのJSONに戻ります。')) {
            clearOverrides();
            alert('リセットしました。ページをリロードしてください。');
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
