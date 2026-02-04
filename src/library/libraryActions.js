import { openModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import {
    loadProfiles,
    upsertProfile,
    deleteProfile,
    getProfileById,
    searchProfiles,
    getRecentProfiles
} from '../profileStore.js';

function createEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
}

function formatRelativeTime(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
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
        btn.innerHTML = `
            <div class="library-list-title">${profile.name || 'Unnamed'}</div>
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

export function openProfileEditor() {
    const container = createEl('div', 'library-modal-content');
    container.innerHTML = `
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
                    <button class="btn btn-secondary" id="profile-delete" type="button">Delete</button>
                </div>
            </div>
            <div class="library-pane">
                <div class="library-section-title">Profiles</div>
                <div id="profile-list" class="library-list"></div>
            </div>
        </div>
    `;

    const listEl = container.querySelector('#profile-list');
    let selectedId = null;

    function fillForm(profile) {
        container.querySelector('#profile-name').value = profile?.name || '';
        container.querySelector('#profile-role').value = profile?.role || '';
        container.querySelector('#profile-team').value = profile?.team || '';
        container.querySelector('#profile-bio').value = profile?.bio || '';
        container.querySelector('#profile-tags').value = (profile?.tags || []).join(', ');
        container.querySelector('#profile-color').value = profile?.avatarColor || '#5b7cff';
    }

    function refreshList() {
        const profiles = loadProfiles();
        renderProfileList(listEl, profiles, (id) => {
            selectedId = id;
            fillForm(getProfileById(id));
            refreshList();
        }, selectedId);
    }

    container.querySelector('#profile-save').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const name = container.querySelector('#profile-name').value.trim();
        if (!name) {
            showToast('Name is required', 'error');
            return;
        }
        const profile = {
            id: selectedId || undefined,
            name,
            role: container.querySelector('#profile-role').value.trim(),
            team: container.querySelector('#profile-team').value.trim(),
            bio: container.querySelector('#profile-bio').value.trim(),
            tags: parseTags(container.querySelector('#profile-tags').value),
            avatarColor: container.querySelector('#profile-color').value
        };
        const saved = upsertProfile(profile);
        selectedId = saved.id;
        refreshList();
        showToast('Profile saved', 'success');
    });

    container.querySelector('#profile-new').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectedId = null;
        fillForm(null);
        refreshList();
    });

    container.querySelector('#profile-delete').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!selectedId) return;
        deleteProfile(selectedId);
        selectedId = null;
        fillForm(null);
        refreshList();
        showToast('Profile deleted', 'info');
    });

    refreshList();
    fillForm(null);
    openModal({ title: 'プロフィール登録・編集', contentEl: container });
}

export function openDirectorySearch() {
    const container = createEl('div', 'library-modal-content');
    container.innerHTML = `
        <div class="form-group">
            <label class="form-label">Search</label>
            <input type="text" class="form-input" id="directory-search" placeholder="name, team, tag..." />
        </div>
        <div class="library-list" id="directory-results"></div>
    `;

    const input = container.querySelector('#directory-search');
    const resultsEl = container.querySelector('#directory-results');

    function renderResults(list) {
        renderProfileList(resultsEl, list, (id) => {
            openProfileViewer(id);
        });
    }

    input.addEventListener('input', () => {
        renderResults(searchProfiles(input.value));
    });

    renderResults(loadProfiles());
    openModal({ title: '目録検索', contentEl: container });
}

export function openRecentUpdates() {
    const container = createEl('div', 'library-modal-content');
    const listEl = createEl('div', 'library-list');
    const list = getRecentProfiles(20);

    if (!list.length) {
        listEl.appendChild(createEl('div', 'library-empty', 'No recent updates'));
    } else {
        list.forEach(profile => {
            const btn = createEl('button', 'library-list-item');
            btn.type = 'button';
            btn.innerHTML = `
                <div class="library-list-title">${profile.name || 'Unnamed'}</div>
                <div class="library-list-meta">${formatRelativeTime(profile.updatedAt)} · ${profile.role || ''} ${profile.team || ''}</div>
            `;
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openProfileViewer(profile.id);
            });
            listEl.appendChild(btn);
        });
    }

    container.appendChild(listEl);
    openModal({ title: '最近の更新', contentEl: container });
}

export function openProfileViewer(profileId = null) {
    const container = createEl('div', 'library-modal-content');
    container.innerHTML = `
        <div class="library-grid">
            <div class="library-pane">
                <div class="library-section-title">Profiles</div>
                <div id="viewer-list" class="library-list"></div>
            </div>
            <div class="library-pane">
                <div id="viewer-detail" class="library-detail"></div>
            </div>
        </div>
    `;

    const listEl = container.querySelector('#viewer-list');
    const detailEl = container.querySelector('#viewer-detail');

    function renderDetail(profile) {
        if (!profile) {
            detailEl.innerHTML = '<div class="library-empty">Select a profile</div>';
            return;
        }
        detailEl.innerHTML = `
            <div class="library-detail-name">${profile.name || 'Unnamed'}</div>
            <div class="library-detail-meta">${profile.role || ''} ${profile.team || ''}</div>
            <div class="library-detail-bio">${profile.bio || ''}</div>
            <div class="library-detail-tags">${(profile.tags || []).map(t => `<span class="library-tag">${t}</span>`).join('')}</div>
            <div class="library-detail-updated">Updated: ${formatRelativeTime(profile.updatedAt)}</div>
        `;
    }

    const profiles = loadProfiles();
    let selectedId = profileId;

    function selectProfile(id) {
        selectedId = id;
        renderDetail(getProfileById(id));
        renderList();
    }

    function renderList() {
        renderProfileList(listEl, profiles, selectProfile, selectedId);
    }

    renderList();
    renderDetail(getProfileById(selectedId));
    openModal({ title: 'プロフィール閲覧', contentEl: container });
}
