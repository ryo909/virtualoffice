// drawer.search.js - Search drawer

import { getPeople } from './drawer.people.js';

let onWarp = null;
let searchResults = [];

export function initSearchDrawer({ warpCallback }) {
    onWarp = warpCallback;

    const input = document.getElementById('search-input');
    if (input) {
        input.addEventListener('input', (e) => {
            search(e.target.value);
        });
    }
}

function search(query) {
    const q = query.toLowerCase().trim();
    const people = getPeople();

    if (q.length === 0) {
        searchResults = Array.from(people.values());
    } else {
        searchResults = Array.from(people.values()).filter(p =>
            p.displayName.toLowerCase().includes(q)
        );
    }

    renderResults();
}

function renderResults() {
    const container = document.getElementById('search-results');
    if (!container) return;

    if (searchResults.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--color-textMuted);">No results found</div>';
        return;
    }

    container.innerHTML = searchResults.map(p => `
    <div class="person-item" data-actor-id="${p.actorId}">
      <div class="person-avatar" style="background-color: ${p.avatarColor || 'var(--color-avatarDefault)'}">
        ${getInitials(p.displayName)}
        <div class="person-status ${p.status}"></div>
      </div>
      <div class="person-info">
        <div class="person-name">${escapeHtml(p.displayName)}</div>
        <div class="person-location">${escapeHtml(p.location)}</div>
      </div>
      <button class="btn btn-secondary" data-action="warp">Warp near</button>
    </div>
  `).join('');

    // Attach event listeners
    container.querySelectorAll('[data-action="warp"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const item = btn.closest('.person-item');
            const actorId = item.dataset.actorId;
            const person = getPeople().get(actorId);

            if (person && onWarp) {
                onWarp(person);
            }
        });
    });
}

function getInitials(name) {
    if (!name) return '?';
    return name.slice(0, 2).toUpperCase();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function refreshSearch() {
    const input = document.getElementById('search-input');
    if (input) {
        search(input.value);
    }
}
