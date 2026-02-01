// collision.js - Collision detection

import { getWorldModel } from './mapLoader.js';
import { getConfig } from '../services/supabaseClient.js';

const AVATAR_RADIUS = 14;

// ========== Walkable Margin Setting ==========
// Use 0 for walkable margin - obstacles handle collision instead
const WALKABLE_MARGIN = 0;

/**
 * Check if a point is within walkable area and not colliding with obstacles
 * @param {number} x 
 * @param {number} y 
 * @returns {boolean}
 */
export function canMoveTo(x, y) {
    const world = getWorldModel();
    if (!world) return false;
    if (!isInWorldBounds(world, x, y)) return false;

    const walkables = getWalkables(world);
    if (!walkables || walkables.length === 0) return false;

    // Check if inside walkable area (margin = 0 for wider walkable)
    let inWalkable = false;
    for (const area of walkables) {
        if (isPointInRectRaw(x, y, area, WALKABLE_MARGIN)) {
            inWalkable = true;
            break;
        }
    }

    if (!inWalkable) return false;

    // Check collision with obstacles (still use AVATAR_RADIUS for obstacle collision)
    if (!isObstaclesDisabled()) {
        const obstacles = getObstacles(world);
        for (const obs of obstacles) {
            if (circleRectCollision(x, y, AVATAR_RADIUS, obs)) {
                return false;
            }
        }
    }

    return true;
}

/**
 * Debug version of canMoveTo - returns reason for failure
 * @param {number} x 
 * @param {number} y 
 * @returns {{ok: boolean, reason?: string, obstacle?: object}}
 */
export function canMoveToDebug(x, y) {
    const world = getWorldModel();
    if (!world) return { ok: false, reason: 'no_world' };
    if (!isInWorldBounds(world, x, y)) {
        return { ok: false, reason: 'out_of_world' };
    }

    let inWalkable = false;
    let nearestWalkable = null;
    let nearestDist = Infinity;

    const walkables = getWalkables(world);
    if (!walkables || walkables.length === 0) {
        return { ok: false, reason: 'no_walkable' };
    }

    for (const area of walkables) {
        if (isPointInRectRaw(x, y, area, WALKABLE_MARGIN)) {
            inWalkable = true;
            break;
        }
        // Track nearest walkable for debug info
        const cx = Math.max(area.x, Math.min(x, area.x + area.w));
        const cy = Math.max(area.y, Math.min(y, area.y + area.h));
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (dist < nearestDist) {
            nearestDist = dist;
            nearestWalkable = area.tag || 'unnamed';
        }
    }

    if (!inWalkable) {
        return {
            ok: false,
            reason: 'not_in_walkable_final',
            nearestArea: nearestWalkable,
            distance: Math.round(nearestDist)
        };
    }

    if (!isObstaclesDisabled()) {
        const obstacles = getObstacles(world);
        for (const obs of obstacles) {
            if (circleRectCollision(x, y, AVATAR_RADIUS, obs)) {
                return { ok: false, reason: 'hit_obstacle', obstacle: obs.tag || obs };
            }
        }
    }

    return { ok: true, reason: 'ok' };
}

export function isPointInRect(point, rect, margin = 0) {
    if (!rect) return false;
    return point.x >= rect.x + margin &&
        point.x <= rect.x + rect.w - margin &&
        point.y >= rect.y + margin &&
        point.y <= rect.y + rect.h - margin;
}

export function isPointInAnyRect(point, rects, margin = 0) {
    if (!rects || rects.length === 0) return { hit: false, count: 0 };
    let count = 0;
    for (const rect of rects) {
        if (isPointInRect(point, rect, margin)) count += 1;
    }
    return { hit: count > 0, count };
}

export function snapPointToWalkable(point) {
    return constrainPosition(point.x, point.y);
}

/**
 * Check if point is inside rect with margin
 */
function isPointInRectRaw(px, py, rect, margin = 0) {
    return px >= rect.x + margin &&
        px <= rect.x + rect.w - margin &&
        py >= rect.y + margin &&
        py <= rect.y + rect.h - margin;
}

/**
 * Circle-rectangle collision
 */
function circleRectCollision(cx, cy, r, rect) {
    const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
    const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));

    const dx = cx - closestX;
    const dy = cy - closestY;

    return (dx * dx + dy * dy) < (r * r);
}

/**
 * Get constrained position (find nearest walkable point)
 * Searches all walkable areas and returns the closest valid point
 * Uses WALKABLE_MARGIN = 0 for wider coverage
 */
export function constrainPosition(x, y) {
    const world = getWorldModel();
    if (!world) return { x, y };
    if (!isInWorldBounds(world, x, y)) return { x, y };

    const margin = WALKABLE_MARGIN; // Use 0 instead of AVATAR_RADIUS
    let best = null;
    let bestDist = Infinity;

    const walkables = getWalkables(world);
    if (!walkables || walkables.length === 0) return { x, y };

    for (const area of walkables) {
        // Calculate the nearest point on this walkable rect
        const innerX1 = area.x + margin;
        const innerY1 = area.y + margin;
        const innerX2 = area.x + area.w - margin;
        const innerY2 = area.y + area.h - margin;

        // Skip if area is too small
        if (innerX2 <= innerX1 || innerY2 <= innerY1) continue;

        // Clamp to inner bounds
        const cx = Math.max(innerX1, Math.min(x, innerX2));
        const cy = Math.max(innerY1, Math.min(y, innerY2));

        // Calculate distance from original point
        const dx = x - cx;
        const dy = y - cy;
        const dist = dx * dx + dy * dy;

        if (dist < bestDist) {
            bestDist = dist;
            best = { x: cx, y: cy };
        }
    }

    if (best && !canMoveTo(best.x, best.y)) {
        const STEP = 8;
        const MAX_R = 120;
        let found = null;
        let bestD = Infinity;

        for (let r = STEP; r <= MAX_R; r += STEP) {
            for (let a = 0; a < 360; a += 20) {
                const rad = (a * Math.PI) / 180;
                const nx = best.x + Math.cos(rad) * r;
                const ny = best.y + Math.sin(rad) * r;
                if (canMoveTo(nx, ny)) {
                    const d = (nx - x) ** 2 + (ny - y) ** 2;
                    if (d < bestD) {
                        bestD = d;
                        found = { x: nx, y: ny };
                    }
                }
            }
            if (found) break;
        }

        if (found) return found;
    }

    return best || { x, y };
}

/**
 * Pathfinding with neighbor search
 * Returns { x, y, reason } where reason explains what happened
 */
export function findPath(fromX, fromY, toX, toY) {
    const runSearch = () => {
        // Direct path - if target is walkable, go there
        if (canMoveTo(toX, toY)) {
            return { x: toX, y: toY, reason: 'direct', pathLen: Math.hypot(toX - fromX, toY - fromY) };
        }

        // Snap to nearest walkable point if possible
        const snap = constrainPosition(toX, toY);
        if (canMoveTo(snap.x, snap.y)) {
            return { x: snap.x, y: snap.y, reason: 'snap', pathLen: Math.hypot(snap.x - fromX, snap.y - fromY) };
        }

        // Nearby search fallback, but bias toward the line from current->target (reduces sideways "slip")
        const radii = [24, 48, 72, 96, 120];
        let best = null;
        let bestScore = Infinity;

        function distToSegment(px, py, ax, ay, bx, by) {
            const abx = bx - ax;
            const aby = by - ay;
            const apx = px - ax;
            const apy = py - ay;
            const abLen2 = abx * abx + aby * aby;
            if (abLen2 === 0) return Math.hypot(px - ax, py - ay);
            let t = (apx * abx + apy * aby) / abLen2;
            t = Math.max(0, Math.min(1, t));
            const cx = ax + abx * t;
            const cy = ay + aby * t;
            return Math.hypot(px - cx, py - cy);
        }

        for (const r of radii) {
            for (let a = 0; a < 360; a += 20) {
                const rad = (a * Math.PI) / 180;
                const nx = toX + Math.cos(rad) * r;
                const ny = toY + Math.sin(rad) * r;
                if (!canMoveTo(nx, ny)) continue;

                const dClick = Math.hypot(nx - toX, ny - toY);
                const dLine = distToSegment(nx, ny, fromX, fromY, toX, toY);
                const score = dClick * 1.0 + dLine * 1.5;

                if (score < bestScore) {
                    bestScore = score;
                    best = { x: nx, y: ny, r };
                }
            }
        }

        if (best) {
            return { x: best.x, y: best.y, reason: `nearby:${best.r}`, pathLen: Math.hypot(best.x - fromX, best.y - fromY) };
        }

        // Wider neighbor search from click point
        const STEP = 16;
        const MAX_R = 320;

        for (let r = STEP; r <= MAX_R; r += STEP) {
            for (let a = 0; a < 360; a += 30) {
                const rad = (a * Math.PI) / 180;
                const x = toX + Math.cos(rad) * r;
                const y = toY + Math.sin(rad) * r;
                if (canMoveTo(x, y)) {
                    return { x, y, reason: `search:${r}`, pathLen: Math.hypot(x - fromX, y - fromY) };
                }
            }
        }

        // Last resort - stay at current position
        return { x: fromX, y: fromY, reason: 'stuck', pathLen: 0 };
    };

    let result = runSearch();
    if (result.reason !== 'stuck') return result;

    const bridgeAdded = tryAddBridge(fromX, fromY, toX, toY);
    if (bridgeAdded) {
        result = runSearch();
        if (result.reason !== 'stuck') {
            return { ...result, reason: `bridge:${result.reason}` };
        }
    }

    return result;
}

/**
 * Get zone for a position
 * Supports interactBounds for tighter interaction areas
 */
export function getZoneAt(x, y) {
    const world = getWorldModel();
    if (!world) return null;

    for (const zone of world.zones) {
        const bounds = zone.interactBounds || zone.bounds;
        if (isPointInRectRaw(x, y, bounds, 0)) {
            return zone;
        }
    }

    return null;
}

export { AVATAR_RADIUS };

let warnedWalkableFallback = false;

function getWalkables(world) {
    const walkables = world.walkableInflated || world.walkableFinal || world.walkable || [];
    if (walkables.length > 0) return walkables;

    if (world.zones && world.zones.length > 0) {
        if (!warnedWalkableFallback) {
            console.warn('[collision] walkableFinal empty; falling back to zones');
            warnedWalkableFallback = true;
        }
        return world.zones.map(zone => zone.bounds).filter(Boolean);
    }

    if (!warnedWalkableFallback) {
        console.warn('[collision] no walkable data available');
        warnedWalkableFallback = true;
    }
    return [];
}

function tryAddBridge(fromX, fromY, toX, toY) {
    const world = getWorldModel();
    if (!world) return false;
    if (world._bridgeRects && world._bridgeRects.length >= 12) return false;

    const startP = constrainPosition(fromX, fromY);
    const goalP = constrainPosition(toX, toY);

    if (!Number.isFinite(startP.x) || !Number.isFinite(startP.y)) return false;
    if (!Number.isFinite(goalP.x) || !Number.isFinite(goalP.y)) return false;
    if (!canMoveTo(startP.x, startP.y)) return false;
    if (!canMoveTo(goalP.x, goalP.y)) return false;

    const dist = Math.hypot(goalP.x - startP.x, goalP.y - startP.y);
    if (dist < 8) return false;

    const bridge = buildBridgeRect(startP, goalP, 24);
    if (!bridge) return false;

    if (!world.walkableInflated) world.walkableInflated = [];
    world.walkableInflated.push(bridge);
    if (!world._bridgeRects) world._bridgeRects = [];
    world._bridgeRects.push(bridge);

    console.warn('[collision] bridge added', {
        start: { x: Math.round(startP.x), y: Math.round(startP.y) },
        goal: { x: Math.round(goalP.x), y: Math.round(goalP.y) },
        bridge
    });

    return true;
}

function buildBridgeRect(a, b, width) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;

    if (Math.abs(dx) >= Math.abs(dy)) {
        const x = Math.min(a.x, b.x);
        const w = Math.abs(dx);
        const y = (a.y + b.y) / 2 - width / 2;
        return { x, y, w, h: width, tag: 'bridge:horizontal' };
    }

    const y = Math.min(a.y, b.y);
    const h = Math.abs(dy);
    const x = (a.x + b.x) / 2 - width / 2;
    return { x, y, w: width, h, tag: 'bridge:vertical' };
}

export function getNearestWalkableDistance(x, y) {
    const world = getWorldModel();
    if (!world) return Infinity;
    const walkables = getWalkables(world);
    if (!walkables || walkables.length === 0) return Infinity;

    let nearest = Infinity;
    walkables.forEach(area => {
        const cx = Math.max(area.x, Math.min(x, area.x + area.w));
        const cy = Math.max(area.y, Math.min(y, area.y + area.h));
        const dist = Math.hypot(x - cx, y - cy);
        if (dist < nearest) nearest = dist;
    });
    return nearest;
}

function getObstacles(world) {
    return world.obstaclesFinal || world.obstacles || [];
}

function isObstaclesDisabled() {
    const cfg = getConfig();
    return cfg?.debug?.disableObstacles === true;
}

function isInWorldBounds(world, x, y) {
    const size = world?.meta?.size || world?.size;
    if (!size) return true;
    return x >= 0 && y >= 0 && x <= size.w && y <= size.h;
}
