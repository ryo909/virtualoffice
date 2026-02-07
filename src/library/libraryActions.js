// libraryActions.js - 図書室スポットアクション（Supabase版）
import { openModal, closeModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import {
    listProfiles,
    getProfileById,
    upsertProfile,
    deleteProfile,
    searchProfiles,
    getRecentProfiles,
    listNotes,
    addNote,
    listRevisions,
    revertToRevision,
    formatError
} from '../services/profileStoreSupabase.js';
import { promptEditorLabelIfNeeded, getEditorLabel } from '../utils/editorLabel.js';

function createEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
}

function formatRelativeTime(ts) {
    if (!ts) return '';
    const date = ts instanceof Date ? ts : new Date(ts);
    const diff = Date.now() - date.getTime();
    const mins = Math.round(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return `${days}d ago`;
}

function parseTags(input) {
    if (!input) return [];
    return input
        .split(',')
        .map(t => t.trim())
        .filter(Boolean)
        .slice(0, 5);
}

function showError(container, error) {
    const existing = container.querySelector('.library-error');
    if (existing) existing.remove();

    const errorEl = createEl('div', 'library-error', formatError(error));
    container.insertBefore(errorEl, container.firstChild);
}

function showLoading(container, show = true) {
    const existing = container.querySelector('.library-loading');
    if (existing) existing.remove();

    if (show) {
        const loadingEl = createEl('div', 'library-loading', 'Loading...');
        container.appendChild(loadingEl);
    }
}

function renderProfileList(container, profiles, onSelect, selectedId = null) {
    container.innerHTML = '';
    if (!profiles.length) {
        container.appendChild(createEl('div', 'library-empty', 'No profiles'));
        return;
    }
    profiles.forEach(profile => {
        const btn = createEl('button', 'library-list-item');
        btn.type = 'button';
        btn.dataset.profileId = profile.id;
        const name = profile.display_name || profile.name || 'Unnamed';
        btn.innerHTML = `
            <div class="library-list-title">${name}</div>
            <div class="library-list-meta">${profile.role || ''} ${profile.team || ''}</div>
        `;
        if (profile.id === selectedId) btn.classList.add('active');
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            onSelect(profile.id);
        });
        container.appendChild(btn);
    });
}

// ========== 司書カウンター（プロフィール登録・編集）==========
export async function openProfileEditor() {
    const container = createEl('div', 'library-modal-content');
    container.innerHTML = `
        <div id="profile-editor-error"></div>
        <div class="library-grid">
            <div class="library-pane">
                <div class="form-group">
                    <label class="form-label">Name *</label>
                    <input type="text" class="form-input" id="profile-name" />
                </div>
                <div class="form-group">
                    <label class="form-label">Role</label>
                    <input type="text" class="form-input" id="profile-role" />
                </div>
                <div class="form-group">
                    <label class="form-label">Team</label>
                    <input type="text" class="form-input" id="profile-team" />
                </div>
                <div class="form-group">
                    <label class="form-label">Bio</label>
                    <textarea class="form-input" id="profile-bio" rows="3"></textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">Tags (comma)</label>
                    <input type="text" class="form-input" id="profile-tags" />
                </div>
                <div class="form-group">
                    <label class="form-label">Avatar Color</label>
                    <input type="color" id="profile-color" value="#5b7cff" />
                </div>
                <div class="library-actions">
                    <button class="btn btn-primary" id="profile-save" type="button">Save</button>
                    <button class="btn btn-secondary" id="profile-new" type="button">New</button>
                    <button class="btn btn-secondary" id="profile-history" type="button">History</button>
                    <button class="btn btn-secondary" id="profile-delete" type="button">Delete</button>
                </div>
                <div id="profile-editor-info"></div>
            </div>
            <div class="library-pane">
                <div class="library-section-title">Profiles</div>
                <div id="profile-list" class="library-list"></div>
            </div>
        </div>
        <div id="profile-revisions-panel" style="display:none;">
            <div class="library-section-title" style="margin-top:16px;">編集履歴</div>
            <div id="profile-revisions-list" class="library-revisions-list"></div>
        </div>
    `;

    const listEl = container.querySelector('#profile-list');
    const errorContainer = container.querySelector('#profile-editor-error');
    const infoEl = container.querySelector('#profile-editor-info');
    const revisionsPanel = container.querySelector('#profile-revisions-panel');
    const revisionsList = container.querySelector('#profile-revisions-list');
    let selectedId = null;
    let isLoading = false;

    function fillForm(profile) {
        container.querySelector('#profile-name').value = profile?.display_name || profile?.name || '';
        container.querySelector('#profile-role').value = profile?.role || '';
        container.querySelector('#profile-team').value = profile?.team || '';
        container.querySelector('#profile-bio').value = profile?.bio || '';
        container.querySelector('#profile-tags').value = (profile?.tags || []).join(', ');
        container.querySelector('#profile-color').value = profile?.avatar_color || profile?.avatarColor || '#5b7cff';

        // 最終編集者情報
        if (profile?.updated_by_label) {
            infoEl.innerHTML = `
                <div class="library-editor-info">
                    最終編集: <span class="library-editor-label">${profile.updated_by_label}</span>
                    · ${formatRelativeTime(profile.updated_at)}
                </div>
            `;
        } else {
            infoEl.innerHTML = '';
        }
    }

    async function refreshList() {
        if (isLoading) return;
        isLoading = true;
        showLoading(listEl, true);

        try {
            const profiles = await listProfiles();
            showLoading(listEl, false);
            renderProfileList(listEl, profiles, async (id) => {
                selectedId = id;
                const profile = await getProfileById(id);
                fillForm(profile);
                refreshList();
                revisionsPanel.style.display = 'none';
            }, selectedId);
        } catch (err) {
            showLoading(listEl, false);
            showError(errorContainer, err);
        } finally {
            isLoading = false;
        }
    }

    async function showRevisions() {
        if (!selectedId) {
            showToast('Select a profile first', 'info');
            return;
        }

        try {
            const revisions = await listRevisions(selectedId);
            revisionsPanel.style.display = 'block';
            revisionsList.innerHTML = '';

            if (!revisions.length) {
                revisionsList.appendChild(createEl('div', 'library-empty', 'No revision history'));
                return;
            }

            revisions.forEach(rev => {
                const item = createEl('div', 'library-revision-item');
                item.innerHTML = `
                    <div class="library-revision-info">
                        <div class="library-revision-editor">${rev.editor_label || 'Unknown'}</div>
                        <div class="library-revision-date">${formatRelativeTime(rev.created_at)}</div>
                    </div>
                    <button type="button" class="library-revert-btn">この版に戻す</button>
                `;

                item.querySelector('.library-revert-btn').addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    await handleRevert(rev.id);
                });

                revisionsList.appendChild(item);
            });
        } catch (err) {
            showError(errorContainer, err);
        }
    }

    async function handleRevert(revisionId) {
        const editorLabel = await promptEditorLabelIfNeeded();
        if (!editorLabel) {
            showToast('表示名が必要です', 'error');
            return;
        }

        try {
            await revertToRevision(selectedId, revisionId, editorLabel);
            showToast('Reverted successfully', 'success');
            const profile = await getProfileById(selectedId);
            fillForm(profile);
            await showRevisions();
        } catch (err) {
            showError(errorContainer, err);
        }
    }

    container.querySelector('#profile-save').addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const name = container.querySelector('#profile-name').value.trim();
        if (!name) {
            showToast('Name is required', 'error');
            return;
        }

        const editorLabel = await promptEditorLabelIfNeeded();
        if (!editorLabel) {
            showToast('表示名が必要です', 'error');
            return;
        }

        const profile = {
            id: selectedId || undefined,
            display_name: name,
            role: container.querySelector('#profile-role').value.trim(),
            team: container.querySelector('#profile-team').value.trim(),
            bio: container.querySelector('#profile-bio').value.trim(),
            tags: parseTags(container.querySelector('#profile-tags').value),
            avatar_color: container.querySelector('#profile-color').value
        };

        try {
            const saved = await upsertProfile(profile, editorLabel);
            selectedId = saved.id;
            fillForm(saved);
            await refreshList();
            showToast('Profile saved', 'success');
            revisionsPanel.style.display = 'none';
        } catch (err) {
            showError(errorContainer, err);
        }
    });

    container.querySelector('#profile-new').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectedId = null;
        fillForm(null);
        refreshList();
        revisionsPanel.style.display = 'none';
    });

    container.querySelector('#profile-history').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showRevisions();
    });

    container.querySelector('#profile-delete').addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!selectedId) return;

        if (!confirm('本当に削除しますか？')) return;

        try {
            await deleteProfile(selectedId);
            selectedId = null;
            fillForm(null);
            await refreshList();
            showToast('Profile deleted', 'info');
            revisionsPanel.style.display = 'none';
        } catch (err) {
            showError(errorContainer, err);
        }
    });

    await refreshList();
    fillForm(null);
    openModal({ title: 'プロフィール登録・編集', contentEl: container });
}

// ========== 目録検索端末（人を探す）==========
export async function openDirectorySearch() {
    const container = createEl('div', 'library-modal-content');
    container.innerHTML = `
        <div id="directory-error"></div>
        <div class="form-group">
            <label class="form-label">Search</label>
            <input type="text" class="form-input" id="directory-search" placeholder="name, team, tag..." />
        </div>
        <div class="library-list" id="directory-results"></div>
    `;

    const input = container.querySelector('#directory-search');
    const resultsEl = container.querySelector('#directory-results');
    const errorContainer = container.querySelector('#directory-error');

    async function renderResults(queryText) {
        showLoading(resultsEl, true);
        try {
            const list = await searchProfiles(queryText);
            showLoading(resultsEl, false);
            renderProfileList(resultsEl, list, (id) => {
                openProfileViewer(id);
            });
        } catch (err) {
            showLoading(resultsEl, false);
            showError(errorContainer, err);
        }
    }

    let debounce = null;
    input.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
            renderResults(input.value);
        }, 300);
    });

    await renderResults('');
    openModal({ title: '目録検索', contentEl: container });
}

// ========== 本棚（最近追加/更新）==========
export async function openRecentUpdates() {
    const container = createEl('div', 'library-modal-content');
    const errorContainer = createEl('div');
    container.appendChild(errorContainer);

    const listEl = createEl('div', 'library-list');
    container.appendChild(listEl);

    showLoading(listEl, true);

    try {
        const list = await getRecentProfiles(20);
        showLoading(listEl, false);

        if (!list.length) {
            listEl.appendChild(createEl('div', 'library-empty', 'No recent updates'));
        } else {
            list.forEach(profile => {
                const btn = createEl('button', 'library-list-item');
                btn.type = 'button';
                const name = profile.display_name || profile.name || 'Unnamed';
                btn.innerHTML = `
                    <div class="library-list-title">${name}</div>
                    <div class="library-list-meta">${formatRelativeTime(profile.updated_at)} · ${profile.role || ''} ${profile.team || ''}</div>
                `;
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openProfileViewer(profile.id);
                });
                listEl.appendChild(btn);
            });
        }
    } catch (err) {
        showLoading(listEl, false);
        showError(errorContainer, err);
    }

    openModal({ title: '最近の更新', contentEl: container });
}

// ========== 円卓（プロフィール閲覧UI）==========
export async function openProfileViewer(profileId = null) {
    const container = createEl('div', 'library-modal-content');
    container.innerHTML = `
        <div id="viewer-error"></div>
        <div class="library-grid">
            <div class="library-pane">
                <div class="library-section-title">Profiles</div>
                <div id="viewer-list" class="library-list"></div>
            </div>
            <div class="library-pane">
                <div id="viewer-detail" class="library-detail"></div>
                <div id="viewer-notes" class="library-notes-section" style="display:none;">
                    <div class="library-notes-title">みんなのメモ</div>
                    <div id="notes-list" class="library-notes-list"></div>
                    <div class="library-note-form">
                        <div class="library-note-form-row">
                            <select id="note-kind" class="form-input">
                                <option value="note">メモ</option>
                                <option value="kudos">Kudos</option>
                                <option value="info">Info</option>
                                <option value="skill">Skill</option>
                            </select>
                            <button type="button" class="btn btn-primary" id="note-submit">投稿</button>
                        </div>
                        <textarea id="note-content" class="form-input" placeholder="気づきやメモを残す..."></textarea>
                    </div>
                </div>
            </div>
        </div>
    `;

    const listEl = container.querySelector('#viewer-list');
    const detailEl = container.querySelector('#viewer-detail');
    const notesSection = container.querySelector('#viewer-notes');
    const notesList = container.querySelector('#notes-list');
    const errorContainer = container.querySelector('#viewer-error');

    let selectedId = profileId;
    let profiles = [];

    async function renderDetail(profile) {
        if (!profile) {
            detailEl.innerHTML = '<div class="library-empty">Select a profile</div>';
            notesSection.style.display = 'none';
            return;
        }

        const name = profile.display_name || profile.name || 'Unnamed';
        detailEl.innerHTML = `
            <div class="library-detail-name">${name}</div>
            <div class="library-detail-meta">${profile.role || ''} ${profile.team || ''}</div>
            <div class="library-detail-bio">${profile.bio || ''}</div>
            <div class="library-detail-tags">${(profile.tags || []).map(t => `<span class="library-tag">${t}</span>`).join('')}</div>
            ${profile.updated_by_label ? `
                <div class="library-editor-info">
                    最終編集: <span class="library-editor-label">${profile.updated_by_label}</span>
                    · ${formatRelativeTime(profile.updated_at)}
                </div>
            ` : `<div class="library-detail-updated">Updated: ${formatRelativeTime(profile.updated_at)}</div>`}
        `;

        // メモセクション表示
        notesSection.style.display = 'block';
        await renderNotes(profile.id);
    }

    async function renderNotes(profileId) {
        notesList.innerHTML = '';
        try {
            const notes = await listNotes(profileId);
            if (!notes.length) {
                notesList.appendChild(createEl('div', 'library-empty', 'まだメモがありません'));
            } else {
                notes.forEach(note => {
                    const item = createEl('div', 'library-note-item');
                    item.innerHTML = `
                        <div class="library-note-header">
                            <span class="library-note-kind ${note.kind}">${note.kind}</span>
                            <span class="library-note-author">${note.author_label || 'Unknown'} · ${formatRelativeTime(note.created_at)}</span>
                        </div>
                        <div class="library-note-content">${note.content}</div>
                    `;
                    notesList.appendChild(item);
                });
            }
        } catch (err) {
            showError(errorContainer, err);
        }
    }

    async function selectProfile(id) {
        selectedId = id;
        const profile = await getProfileById(id);
        await renderDetail(profile);
        renderList();
    }

    function renderList() {
        renderProfileList(listEl, profiles, selectProfile, selectedId);
    }

    // メモ投稿
    container.querySelector('#note-submit').addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!selectedId) {
            showToast('Select a profile first', 'info');
            return;
        }

        const content = container.querySelector('#note-content').value.trim();
        if (!content) {
            showToast('メモ内容を入力してください', 'error');
            return;
        }

        const editorLabel = await promptEditorLabelIfNeeded();
        if (!editorLabel) {
            showToast('表示名が必要です', 'error');
            return;
        }

        const kind = container.querySelector('#note-kind').value;

        try {
            await addNote(selectedId, { kind, content }, editorLabel);
            container.querySelector('#note-content').value = '';
            await renderNotes(selectedId);
            showToast('メモを投稿しました', 'success');
        } catch (err) {
            showError(errorContainer, err);
        }
    });

    // 初期読み込み
    showLoading(listEl, true);
    try {
        profiles = await listProfiles();
        showLoading(listEl, false);
        renderList();
        if (selectedId) {
            const profile = await getProfileById(selectedId);
            await renderDetail(profile);
        } else {
            await renderDetail(null);
        }
    } catch (err) {
        showLoading(listEl, false);
        showError(errorContainer, err);
    }

    openModal({ title: 'プロフィール閲覧', contentEl: container });
}
