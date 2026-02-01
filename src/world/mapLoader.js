// mapLoader.js - Load and merge map data

let worldModel = null;

/**
 * Fetch JSON with strict checks (404/HTML/parse errors become readable errors)
 */
async function fetchJson(path) {
    const res = await fetch(path, { cache: 'no-store' });

    // HTTP error (404 etc.)
    if (!res.ok) {
        throw new Error(`Fetch failed: ${res.status} ${res.statusText} @ ${path}`);
    }

    // Parse error
    try {
        return await res.json();
    } catch (e) {
        // If server returned HTML, this often becomes "Unexpected token <"
        throw new Error(`JSON parse failed @ ${path}: ${e.message}`);
    }
}

/**
 * Load all map data and merge into single world model
 */
export async function loadMaps() {
    try {
        const [core, desksData, expansion, spotsData] = await Promise.all([
            fetchJson('./data/maps/map_core.json'),
            fetchJson('./data/maps/map_desks.json'),
            fetchJson('./data/maps/map_expansion.json'),
            fetchJson('./data/spots.json')
        ]);

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

        // Create lookup maps for quick access
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

        return worldModel;
    } catch (err) {
        console.error('[loadMaps] FAILED', err);
        // IMPORTANT: throw to let app show a fatal error instead of infinite loading
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
