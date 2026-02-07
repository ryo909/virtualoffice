// drawer.people.js - People list drawer

let people = new Map();
let onWarp = null;
let onPoke = null;
let onDm = null;

export function initPeopleDrawer({ warpCallback, pokeCallback, dmCallback }) {
  onWarp = warpCallback;
  onPoke = pokeCallback;
  onDm = dmCallback;
}

export function updatePeople(presenceState) {
  people = new Map();

  Object.entries(presenceState).forEach(([key, presences]) => {
    if (presences && presences.length > 0) {
      const p = presences[0];
      const displayName = p.displayName || p.claimedByDisplayName || '不明';
      people.set(p.actorId, {
        actorId: p.actorId,
        displayName,
        status: p.status || 'online',
        callStatus: p.callStatus || 'idle',
        pos: p.pos || { x: 0, y: 0 },
        avatarColor: p.avatarColor || null,
        location: p.location || '',
        seatedDeskId: p.seatedDeskId || null,
        seatLockedDeskId: p.seatLockedDeskId || null,
        areaId: p.areaId || null,
        claimedByActorId: p.claimedByActorId || p.actorId || null,
        claimedByDisplayName: p.claimedByDisplayName || displayName
      });
    }
  });

  renderPeople();
}

function renderPeople() {
  const container = document.getElementById('people-list');
  if (!container) return;

  const sorted = Array.from(people.values()).sort((a, b) => {
    // Online first, then by name
    if (a.status === 'online' && b.status !== 'online') return -1;
    if (a.status !== 'online' && b.status === 'online') return 1;
    return a.displayName.localeCompare(b.displayName);
  });

  container.innerHTML = sorted.map(p => {
    const locationText = p.seatLockedDeskId
      ? `🪑🔒 デスク ${p.seatLockedDeskId.replace('desk:', '')}`
      : p.seatedDeskId
      ? `🪑 確保中 ${p.seatedDeskId.replace('desk:', '')}`
      : (p.location || '');
    const callStatusLabel = (
      p.callStatus === 'in_call' ? '📞 通話中' :
      p.callStatus === 'calling' ? '📞 発信中' :
      p.callStatus === 'ringing' ? '📞 着信中' :
      ''
    );
    return `
    <div class="person-item" data-actor-id="${p.actorId}">
      <div class="person-avatar" style="background-color: ${p.avatarColor || 'var(--color-avatarDefault)'}">
        ${getInitials(p.displayName)}
        <div class="person-status ${p.status}"></div>
      </div>
      <div class="person-info">
        <div class="person-name-row">
          <div class="person-name">${escapeHtml(p.displayName)}</div>
          ${callStatusLabel ? `<div class="person-call-badge">${escapeHtml(callStatusLabel)}</div>` : ''}
        </div>
        <div class="person-location">${escapeHtml(locationText)}</div>
      </div>
      <div class="person-actions">
        <button class="person-action-btn" data-action="warp" title="近くにワープ">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 12h18M12 3v18"/>
          </svg>
        </button>
        <button class="person-action-btn" data-action="poke" title="つつく">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 12c2.5 0 4.5-2 4.5-4.5S14.5 3 12 3 7.5 5 7.5 7.5 9.5 12 12 12zm0 2c-4 0-8 2-8 6v2h16v-2c0-4-4-6-8-6z"/>
          </svg>
        </button>
        <button class="person-action-btn" data-action="dm" title="ダイレクトメッセージ">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
      </div>
    </div>
  `;
  }).join('');

  // Attach event listeners
  container.querySelectorAll('.person-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = btn.closest('.person-item');
      const actorId = item.dataset.actorId;
      const action = btn.dataset.action;
      const person = people.get(actorId);

      if (!person) return;

      if (action === 'warp' && onWarp) {
        onWarp(person);
      } else if (action === 'poke' && onPoke) {
        onPoke(person);
      } else if (action === 'dm' && onDm) {
        onDm(person);
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

export function getPeople() {
  return people;
}

export function getPersonByActorId(actorId) {
  return people.get(actorId);
}
