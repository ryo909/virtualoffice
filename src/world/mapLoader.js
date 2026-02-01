// mapLoader.js - Load and merge map data

let worldModel = null;

// Helper for boot logging
function bootLog(msg) {
    console.log('[BOOT]', msg);
    const el = document.getElementById('bootLog');
    if (el) el.textContent += `${msg}\n`;
}

/**
 * Fetch JSON with strict checks and logging
 */
async function fetchJson(path) {
    bootLog(`fetch: ${path}`);
    const res = await fetch(path, { cache: 'no-store' });
    bootLog(`status: ${path} -> ${res.status}`);

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Fetch failed ${res.status} for ${path}\n${text.slice(0, 200)}`);
    }

    // Check content type roughly
    const ct = res.headers.get('content-type') || '';

    // Read text first to ensure we can log it on error
    const text = await res.text().catch(() => '');

    try {
        return JSON.parse(text);
    } catch (e) {
        throw new Error(`JSON parse failed for ${path}: ${e.message}\nbody(head): ${text.slice(0, 200)}`);
    }
}

/**
 * Load all map data and merge into single world model
 */
export async function loadMaps() {
    bootLog('loadMaps: start');

    try {
        const [core, desksData, expansion, spotsData] = await Promise.all([
            fetchJson('./data/maps/map_core.json'),
            fetchJson('./data/maps/map_desks.json'),
            fetchJson('./data/maps/map_expansion.json'),
            fetchJson('./data/spots.json')
        ]);

        bootLog('loadMaps: json loaded');

        // Build world model
        worldModel = {
            meta: core.meta,
            size: core.meta.size,
            spawnPoints: core.spawnPoints,
            walkable: core.walkable || [],
            obstacles: core.obstacles || [],
            zones: core.zones || [],
            decor: [...(core.decor || []), ...(expansion.decor || [])],
            desks: desksData.desks || [],
            deskRules: desksData.deskRules || {},
            rooms: expansion.rooms || [],
            spots: (spotsData && spotsData.spots) ? spotsData.spots : []
        };

        // Create lookup maps
        worldModel.deskById = new Map();
        worldModel.desks.forEach(desk => {
            worldModel.deskById.set(desk.id, desk);
        });

        worldModel.spotById = new Map();
        worldModel.spots.forEach(spot => {
            worldModel.spotById.set(spot.id, spot);
        });

        worldModel.zoneById = new Map();
        worldModel.zones.forEach(zone => {
            worldModel.zoneById.set(zone.id, zone);
        });

        bootLog('loadMaps: worldModel ready');
        return worldModel;
    } catch (err) {
        bootLog(`loadMaps: FAILED -> ${err.message}`);
        console.error('[loadMaps] FAILED', err);
        throw err;
    }
}

export function getWorldModel() {
    return worldModel;
}

export function getSpawnPoint(name = 'lobby') {
    if (!worldModel) return { x: 260, y: 260 };
    return worldModel.spawnPoints[name] || worldModel.spawnPoints.lobby || { x: 260, y: 260 };
}

export function getDesks() {
    return worldModel?.desks || [];
}

export function getDeskById(id) {
    return worldModel?.deskById.get(id) || null;
}

export function getSpots() {
    return worldModel?.spots || [];
}

export function getSpotById(id) {
    return worldModel?.spotById.get(id) || null;
}

export function getZones() {
    return worldModel?.zones || [];
}
