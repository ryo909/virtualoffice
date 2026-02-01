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
    const url = String(path);
    bootLog(`fetch: ${url}`);
    const res = await fetch(url, { cache: 'no-store' });
    bootLog(`status: ${url} -> ${res.status}`);

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Fetch failed ${res.status} for ${url}\n${text.slice(0, 200)}`);
    }

    // Check content type roughly
    const ct = res.headers.get('content-type') || '';

    // Read text first to ensure we can log it on error
    const text = await res.text().catch(() => '');

    try {
        return JSON.parse(text);
    } catch (e) {
        throw new Error(`JSON parse failed for ${url}: ${e.message}\nbody(head): ${text.slice(0, 200)}`);
    }
}

/**
 * Load all map data and merge into single world model
 */
export async function loadMaps() {
    bootLog('loadMaps: start');

    try {
        const mapRequests = [
            { key: 'core', url: new URL('../../data/maps/map_core.json', import.meta.url).href },
            { key: 'desks', url: new URL('../../data/maps/map_desks.json', import.meta.url).href },
            { key: 'expansion', url: new URL('../../data/maps/map_expansion.json', import.meta.url).href },
            { key: 'spots', url: new URL('../../data/spots.json', import.meta.url).href }
        ];

        const settled = await Promise.allSettled(
            mapRequests.map((req) => fetchJson(req.url))
        );

        const failures = [];
        const values = {};
        settled.forEach((result, index) => {
            const req = mapRequests[index];
            if (result.status === 'fulfilled') {
                values[req.key] = result.value;
            } else {
                failures.push({ ...req, error: result.reason });
            }
        });

        if (failures.length) {
            failures.forEach((f) => {
                console.error('[loadMaps] File load failed', f.key, f.url, f.error);
                bootLog(`loadMaps: FAILED file -> ${f.key}: ${f.url}`);
            });

            const summary = failures
                .map((f) => `${f.key}: ${f.url}`)
                .join('\n');
            const errorMessage = `Map data load failed (${failures.length}):\n${summary}`;

            throw new Error(errorMessage);
        }

        const core = values.core;
        const desksData = values.desks;
        const expansion = values.expansion;
        const spotsData = values.spots;

        bootLog('loadMaps: json loaded');

        const zones = [...(core.zones || []), ...(expansion.zones || [])];
        const walkableBase = core.walkable || [];
        const walkableFromZones = extractWalkableFromZones(zones);
        const walkableFinal = [...walkableBase, ...walkableFromZones];
        const obstaclesFinal = [
            ...(core.obstacles || []),
            ...(expansion.obstacles || [])
        ];

        // Build world model
        worldModel = {
            meta: core.meta,
            size: core.meta.size,
            spawnPoints: core.spawnPoints,
            walkableBase,
            walkableFromZones,
            walkableFinal,
            walkable: walkableFinal,
            obstaclesFinal,
            obstacles: obstaclesFinal,
            zones,
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

        bootLog(`walkableBase: ${walkableBase.length}`);
        bootLog(`walkableFromZones: ${walkableFromZones.length}`);
        bootLog(`walkableFinal: ${walkableFinal.length}`);
        bootLog(`obstaclesFinal: ${obstaclesFinal.length}`);
        bootLog('loadMaps: worldModel ready');
        return worldModel;
    } catch (err) {
        bootLog(`loadMaps: FAILED -> ${err.message}`);
        console.error('[loadMaps] FAILED', err);
        throw err;
    }
}

function extractWalkableFromZones(zones = []) {
    const walkables = [];
    zones.forEach(zone => {
        const bounds = zone?.bounds;
        if (!bounds) return;

        const isExplicitWalkable = zone.walkable === true;
        const type = String(zone.type || zone.kind || '').toLowerCase();
        const id = String(zone.id || '').toLowerCase();

        let isWalkable = false;
        if (isExplicitWalkable) {
            isWalkable = true;
        } else if (type === 'floor') {
            isWalkable = true;
        } else if (id.includes('floor') || id.includes('room') || id.includes('desk')) {
            isWalkable = true;
            console.warn('[loadMaps] walkableFromZones fallback by id match', zone.id);
        }

        if (isWalkable) {
            walkables.push({
                x: bounds.x,
                y: bounds.y,
                w: bounds.w,
                h: bounds.h,
                tag: zone.id || 'zone'
            });
        }
    });

    return walkables;
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
