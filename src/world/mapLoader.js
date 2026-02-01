// mapLoader.js - Load and merge map data

import { getConfig } from '../services/supabaseClient.js';
import { furniture } from './mapStyles.js';

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

        const zones = [
            ...(core.zones || []),
            ...(desksData.zones || []),
            ...(expansion.zones || [])
        ];
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
        const deskColliders = buildDeskColliders(desksData.desks || []);

        // Build world model
        worldModel = {
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
        bootLog(`walkableInflated: ${walkableInflated.length}`);
        bootLog(`obstaclesFinal: ${obstaclesFinal.length}`);
        bootLog(`zones: ${zones.length}`);
        bootLog(`walkable count: ${walkableFinal.length}`);
        bootLog(`obstacles count: ${obstaclesFinal.length}`);
        bootLog(`worldObstacles count: ${worldObstacles.length}`);
        bootLog(`deskColliders count: ${deskColliders.length}`);
        bootLog(`zones count: ${zones.length}`);
        bootLog(`walkableFromZones count: ${walkableFromZones.length}`);
        bootLog(`desks count: ${worldModel.desks.length}`);
        bootLog(`obstacles merged: ${worldModel.obstacles.length}`);
        bootLog(`walkable merged: ${walkableFinal.length}`);
        bootLog(`zones merged: ${zones.length}`);
        bootLog(`desks=${worldModel.desks.length} obstacles=${worldModel.obstacles.length} walkable=${walkableFinal.length} zones=${zones.length}`);
        console.log('[DEBUG] desk0', worldModel.desks?.[0]);
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

function getDeskColliderConfig() {
    const cfg = getConfig();
    const collision = cfg?.collision || {};
    return {
        deskWidthRatio: Number.isFinite(collision.deskWidthRatio) ? collision.deskWidthRatio : 0.6,
        deskHeightRatio: Number.isFinite(collision.deskHeightRatio) ? collision.deskHeightRatio : 0.45,
        deskYOffsetRatio: Number.isFinite(collision.deskYOffsetRatio) ? collision.deskYOffsetRatio : 0.18
    };
}

function buildDeskColliders(desks = []) {
    const { deskWidthRatio, deskHeightRatio, deskYOffsetRatio } = getDeskColliderConfig();
    const deskW = furniture.desk.width;
    const deskH = furniture.desk.height;
    const colliderW = Math.max(1, deskW * deskWidthRatio);
    const colliderH = Math.max(1, deskH * deskHeightRatio);
    const yOffset = deskH * deskYOffsetRatio;

    return desks.map(desk => {
        const baseX = desk.pos.x - deskW / 2;
        const baseY = desk.pos.y - deskH / 2;
        const x = baseX + (deskW - colliderW) / 2;
        const y = baseY + yOffset;
        const width = colliderW;
        const height = colliderH;
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
