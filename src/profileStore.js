export const STORAGE_KEY = 'vo.profiles.v1';

export function loadProfiles() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        console.warn('[ProfileStore] load failed', err);
        return [];
    }
}

export function saveProfiles(list) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list || []));
    } catch (err) {
        console.warn('[ProfileStore] save failed', err);
    }
}

export function upsertProfile(profile) {
    const now = Date.now();
    const list = loadProfiles();
    const next = { ...profile };
    if (!next.id) {
        next.id = `p_${Math.random().toString(36).slice(2, 10)}`;
        next.createdAt = now;
    }
    next.updatedAt = now;

    const idx = list.findIndex(p => p.id === next.id);
    if (idx >= 0) list[idx] = { ...list[idx], ...next };
    else list.push(next);

    saveProfiles(list);
    return next;
}

export function deleteProfile(id) {
    const list = loadProfiles().filter(p => p.id !== id);
    saveProfiles(list);
    return list;
}

export function getProfileById(id) {
    if (!id) return null;
    return loadProfiles().find(p => p.id === id) || null;
}

export function searchProfiles(queryText) {
    const q = String(queryText || '').trim().toLowerCase();
    if (!q) return loadProfiles();
    return loadProfiles().filter(p => {
        const hay = [p.name, p.role, p.team, p.bio, ...(p.tags || [])]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
        return hay.includes(q);
    });
}

export function getRecentProfiles(limit = 20) {
    return loadProfiles()
        .slice()
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .slice(0, limit);
}
