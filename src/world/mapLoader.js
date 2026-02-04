// mapLoader.js - Load and merge map data

import { furniture } from './mapStyles.js';

let worldModelsByArea = new Map();
let activeAreaId = 'area:core';

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
export async function loadMaps(areaKey = 'core') {
    bootLog(`loadMaps: start (${areaKey})`);

    try {
        const mapRequests = [
            { key: 'core', url: new URL('../../data/maps/map_core.json', import.meta.url).href },
            { key: 'desks', url: new URL('../../data/maps/map_desks.json', import.meta.url).href },
            { key: 'expansion', url: new URL('../../data/maps/map_expansion.json', import.meta.url).href },
            { key: 'garden', url: new URL('../../data/maps/map_garden.json', import.meta.url).href },
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
        const garden = values.garden;
        const spotsData = values.spots;

        bootLog('loadMaps: json loaded');

        worldModelsByArea = new Map();

        const zones = [
            ...(core.zones || []),
            ...(desksData.zones || []),
            ...(expansion.zones || [])
        ];
        const floorRect = getAssignedDesksFloorRect(desksData);
        const normalizedDesks = normalizeDesks(desksData.desks || [], core.meta?.size, floorRect);
        const walkableBase = [
            ...(core.walkable || []),
            ...(desksData.walkable || []),
            ...(expansion.walkable || [])
        ];
        const walkableFromZones = extractWalkableFromZones(zones);
        const walkableFinal = [...walkableBase, ...walkableFromZones];
        const walkableInflated = mergeWalkables(
            inflateWalkables(walkableFinal, 4, core.meta?.size),
            4
        );
        const obstaclesFinal = [
            ...(core.obstacles || []),
            ...(desksData.obstacles || []),
            ...(expansion.obstacles || [])
        ];
        const worldObstacles = obstaclesFinal
            .filter(obs => !isDeskObstacle(obs))
            .map(obs => ({ ...obs, source: 'world' }));
        const deskColliders = buildDeskColliders(normalizedDesks);

        // Build office world model
        const officeWorld = {
            meta: core.meta,
            size: core.meta.size,
            spawnPoints: core.spawnPoints,
            walkableBase,
            walkableFromZones,
            walkableFinal,
            walkableInflated,
            walkable: walkableFinal,
            worldObstacles,
            deskColliders,
            obstaclesFinal: [...worldObstacles, ...deskColliders],
            obstacles: [...worldObstacles, ...deskColliders],
            zones,
            decor: [...(core.decor || []), ...(expansion.decor || [])],
            desks: normalizedDesks,
            deskRules: desksData.deskRules || {},
            rooms: expansion.rooms || [],
            spots: (spotsData && spotsData.spots) ? spotsData.spots.filter(spot => (spot?.areaId || 'area:core') === 'area:core') : []
        };

        // Create lookup maps
        officeWorld.deskById = new Map();
        officeWorld.desks.forEach(desk => {
            officeWorld.deskById.set(desk.id, desk);
        });

        officeWorld.spotById = new Map();
        officeWorld.spots.forEach(spot => {
            officeWorld.spotById.set(spot.id, spot);
        });

        officeWorld.zoneById = new Map();
        officeWorld.zones.forEach(zone => {
            officeWorld.zoneById.set(zone.id, zone);
        });

        worldModelsByArea.set('area:core', officeWorld);

        const gardenWorld = buildWorldFromSingleMap(garden);
        worldModelsByArea.set('area:garden', gardenWorld);

        activeAreaId = (areaKey === 'garden') ? 'area:garden' : 'area:core';

        bootLog(`walkableBase: ${walkableBase.length}`);
        bootLog(`walkableFromZones: ${walkableFromZones.length}`);
        bootLog(`walkableFinal: ${walkableFinal.length}`);
        bootLog(`walkableInflated: ${walkableInflated.length}`);
        bootLog(`obstaclesFinal: ${obstaclesFinal.length}`);
        bootLog(`zones: ${zones.length}`);
        bootLog(`walkable count: ${walkableFinal.length}`);
        bootLog(`obstacles count: ${obstaclesFinal.length}`);
        bootLog(`worldObstacles count: ${worldObstacles.length}`);
        bootLog(`deskColliders count: ${deskColliders.length}`);
        bootLog(`zones count: ${zones.length}`);
        bootLog(`walkableFromZones count: ${walkableFromZones.length}`);
        bootLog(`desks count: ${officeWorld.desks.length}`);
        bootLog(`obstacles merged: ${officeWorld.obstacles.length}`);
        bootLog(`walkable merged: ${walkableFinal.length}`);
        bootLog(`zones merged: ${zones.length}`);
        bootLog(`desks=${officeWorld.desks.length} obstacles=${officeWorld.obstacles.length} walkable=${walkableFinal.length} zones=${zones.length}`);
        console.log('[DEBUG] desk0', officeWorld.desks?.[0]);
        bootLog('loadMaps: officeWorld ready');
        bootLog('loadMaps: gardenWorld ready');

        return getWorldModel();
    } catch (err) {
        bootLog(`loadMaps: FAILED -> ${err.message}`);
        console.error('[loadMaps] FAILED', err);
        throw err;
    }
}

function buildWorldFromSingleMap(single, spotsData) {
    const meta = single.meta || { size: single.size };
    const size = meta?.size || single.size;

    const zones = single.zones || [];
    const walkableBase = single.walkable || single.walkableBase || [];
    const walkableFromZones = extractWalkableFromZones(zones);
    const walkableFinal = [...walkableBase, ...walkableFromZones];
    const walkableInflated = mergeWalkables(
        inflateWalkables(walkableFinal, 4, size),
        4
    );

    const normalizedDesks = normalizeDesks(single.desks || [], size, null);

    const obstaclesFinal = single.obstacles || [];
    const worldObstacles = obstaclesFinal
        .filter(obs => !isDeskObstacle(obs))
        .map(obs => ({ ...obs, source: 'world' }));

    const deskColliders = buildDeskColliders(normalizedDesks);

    const world = {
        meta,
        size,
        spawnPoints: single.spawnPoints || { lobby: { x: 260, y: 260 } },
        walkableBase,
        walkableFromZones,
        walkableFinal,
        walkableInflated,
        walkable: walkableFinal,
        worldObstacles,
        deskColliders,
        obstaclesFinal: [...worldObstacles, ...deskColliders],
        obstacles: [...worldObstacles, ...deskColliders],
        zones,
        decor: single.decor || [],
        desks: normalizedDesks,
        deskRules: single.deskRules || {},
        rooms: single.rooms || [],
        spots: (single.spots && Array.isArray(single.spots)) ? single.spots : ((spotsData && spotsData.spots) ? spotsData.spots : [])
    };

    world.deskById = new Map();
    world.desks.forEach(d => world.deskById.set(d.id, d));

    world.spotById = new Map();
    world.spots.forEach(s => world.spotById.set(s.id, s));

    world.zoneById = new Map();
    world.zones.forEach(z => world.zoneById.set(z.id, z));

    return world;
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

function inflateWalkables(rects = [], pad = 0, size = null) {
    if (!pad) return rects.slice();
    const maxW = size?.w ?? Infinity;
    const maxH = size?.h ?? Infinity;
    return rects.map(rect => {
        const x = rect.x - pad;
        const y = rect.y - pad;
        const w = rect.w + pad * 2;
        const h = rect.h + pad * 2;
        const clampedX = Math.max(0, x);
        const clampedY = Math.max(0, y);
        const clampedW = Math.min(maxW, x + w) - clampedX;
        const clampedH = Math.min(maxH, y + h) - clampedY;
        return {
            ...rect,
            x: clampedX,
            y: clampedY,
            w: Math.max(0, clampedW),
            h: Math.max(0, clampedH)
        };
    }).filter(rect => rect.w > 0 && rect.h > 0);
}

function mergeWalkables(rects = [], gap = 0) {
    const remaining = rects.slice();
    const merged = [];

    while (remaining.length > 0) {
        let current = remaining.pop();
        let changed = true;

        while (changed) {
            changed = false;
            for (let i = remaining.length - 1; i >= 0; i--) {
                const other = remaining[i];
                if (rectsOverlapOrClose(current, other, gap)) {
                    current = unionRects(current, other);
                    remaining.splice(i, 1);
                    changed = true;
                }
            }
        }

        merged.push(current);
    }

    return merged;
}

function rectsOverlapOrClose(a, b, gap) {
    return !(
        a.x > b.x + b.w + gap ||
        a.x + a.w + gap < b.x ||
        a.y > b.y + b.h + gap ||
        a.y + a.h + gap < b.y
    );
}

function unionRects(a, b) {
    const x1 = Math.min(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x + a.w, b.x + b.w);
    const y2 = Math.max(a.y + a.h, b.y + b.h);
    return {
        x: x1,
        y: y1,
        w: x2 - x1,
        h: y2 - y1,
        tag: a.tag || b.tag
    };
}

function isDeskObstacle(obs) {
    const tag = String(obs?.tag || '');
    return tag.toLowerCase().includes('desk');
}

function buildDeskColliders(desks = []) {
    return desks.map(desk => {
        const base = getDeskBaseRect(desk);
        const x = base.x + (base.w / 2) - 18;
        const y = base.y + 8;
        const width = 36;
        const height = 16;
        return {
            x,
            y,
            w: width,
            h: height,
            tag: `desk:${desk.id}`,
            id: desk.id,
            kind: 'desk',
            source: 'desk'
        };
    });
}

function getDeskBaseRect(desk) {
    if (desk.boundsAbs) {
        return { x: desk.boundsAbs.x, y: desk.boundsAbs.y, w: desk.boundsAbs.w, h: desk.boundsAbs.h };
    }
    if (desk.posAbs) {
        const w = furniture.desk.width;
        const h = furniture.desk.height;
        return {
            x: desk.posAbs.x - w / 2,
            y: desk.posAbs.y - h / 2,
            w,
            h
        };
    }
    if (desk.standPointAbs) {
        const w = 120;
        const h = 90;
        return {
            x: desk.standPointAbs.x - w / 2,
            y: desk.standPointAbs.y + 8,
            w,
            h
        };
    }
    return { x: 0, y: 0, w: 120, h: 90 };
}

function normalizeDesks(desks = [], size, floorRect) {
    const W = size?.w || size?.width || 0;
    const H = size?.h || size?.height || 0;
    const TILE = size?.tileSize || 16;
    let maxX = 0;
    let maxY = 0;
    let minX = Infinity;
    let minY = Infinity;

    desks.forEach(desk => {
        const points = [desk.pos, desk.standPoint].filter(Boolean);
        points.forEach(p => {
            if (Number.isFinite(p.x)) {
                maxX = Math.max(maxX, p.x);
                minX = Math.min(minX, p.x);
            }
            if (Number.isFinite(p.y)) {
                maxY = Math.max(maxY, p.y);
                minY = Math.min(minY, p.y);
            }
        });
    });

    const bboxW = isFinite(minX) ? (maxX - minX) : 0;
    const bboxH = isFinite(minY) ? (maxY - minY) : 0;
    const bboxLooksInWorld = W && H && maxX <= W && maxY <= H;

    let scale = 1;
    if (W && H && maxX <= W / 4 && maxY <= H / 4) {
        scale = TILE;
    }

    const shouldMapToFloor = !bboxLooksInWorld && floorRect && bboxW > 0 && bboxH > 0;

    return desks.map(desk => {
        const next = { ...desk };

        const posRaw = desk.pos ? { x: desk.pos.x * scale, y: desk.pos.y * scale } : null;
        const standRaw = desk.standPoint ? { x: desk.standPoint.x * scale, y: desk.standPoint.y * scale } : null;

        let posAbs = posRaw;
        let standAbs = standRaw;

        if (shouldMapToFloor && posRaw) {
            const nx = (posRaw.x - minX) / (bboxW || 1);
            const ny = (posRaw.y - minY) / (bboxH || 1);
            posAbs = {
                x: floorRect.x + nx * floorRect.w,
                y: floorRect.y + ny * floorRect.h
            };
        }

        if (shouldMapToFloor && standRaw) {
            const nx = (standRaw.x - minX) / (bboxW || 1);
            const ny = (standRaw.y - minY) / (bboxH || 1);
            standAbs = {
                x: floorRect.x + nx * floorRect.w,
                y: floorRect.y + ny * floorRect.h
            };
        }

        if (standAbs && posAbs && Math.abs(standAbs.x - posAbs.x) <= 60 && Math.abs(standAbs.y - posAbs.y) <= 60) {
            standAbs = { x: posAbs.x + (standRaw?.x || 0), y: posAbs.y + (standRaw?.y || 0) };
        }

        next.posRaw = posRaw;
        next.standPointRaw = standRaw;
        next.posAbs = posAbs;
        next.standPointAbs = standAbs;
        next.pos = posAbs;
        next.standPoint = standAbs;
        next.__debug = {
            posAbs,
            standAbs,
            floorRect
        };

        if (W && H) {
            const pts = [next.posAbs, next.standPointAbs].filter(Boolean);
            pts.forEach(p => {
                if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) {
                    console.warn('[desk] out of bounds', desk.id, p.x, p.y, W, H, desk);
                }
            });
        }
        return next;
    });
}

function getAssignedDesksFloorRect(desksData) {
    const walkable = desksData?.walkable || [];
    const fromWalkable = walkable.find(r => r.tag === 'assigned_desks_floor');
    if (fromWalkable) return { x: fromWalkable.x, y: fromWalkable.y, w: fromWalkable.w, h: fromWalkable.h };

    const zones = desksData?.zones || [];
    const zone = zones.find(z => z.id === 'zone:desks');
    if (zone?.bounds) return { x: zone.bounds.x, y: zone.bounds.y, w: zone.bounds.w, h: zone.bounds.h };

    return null;
}

export function getWorldModel(areaId = null) {
    const key = areaId || activeAreaId;
    if (worldModelsByArea?.has(key)) return worldModelsByArea.get(key);
    return null;
}

export function getSpawnPoint(name = 'lobby', areaId = null) {
    const w = getWorldModel(areaId);
    if (!w) return { x: 260, y: 260 };
    return w.spawnPoints?.[name] || w.spawnPoints?.lobby || { x: 260, y: 260 };
}

export function getDesks(areaId = null) {
    return getWorldModel(areaId)?.desks || [];
}

export function getDeskById(id, areaId = null) {
    return getWorldModel(areaId)?.deskById?.get(id) || null;
}

export function getSpots(areaId = null) {
    return getWorldModel(areaId)?.spots || [];
}

export function getSpotById(id, areaId = null) {
    return getWorldModel(areaId)?.spotById?.get(id) || null;
}

export function getZones(areaId = null) {
    return getWorldModel(areaId)?.zones || [];
}

export function setActiveArea(areaId) {
    if (worldModelsByArea?.has(areaId)) {
        activeAreaId = areaId;
        bootLog(`setActiveArea: ${areaId}`);
    } else {
        console.warn('[mapLoader] setActiveArea failed (unknown areaId):', areaId);
        bootLog(`setActiveArea: FAILED unknown ${areaId}`);
    }
}

export function getActiveArea() {
    return activeAreaId;
}
