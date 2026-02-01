// collision.js - Collision detection

import { getWorldModel } from './mapLoader.js';

const AVATAR_RADIUS = 14;

/**
 * Check if a point is within walkable area and not colliding with obstacles
 * @param {number} x 
 * @param {number} y 
 * @returns {boolean}
 */
export function canMoveTo(x, y) {
    const world = getWorldModel();
    if (!world) return false;

    // Check if inside walkable area
    let inWalkable = false;
    for (const area of world.walkable) {
        if (isPointInRect(x, y, area, AVATAR_RADIUS)) {
            inWalkable = true;
            break;
        }
    }

    if (!inWalkable) return false;

    // Check collision with obstacles
    for (const obs of world.obstacles) {
        if (circleRectCollision(x, y, AVATAR_RADIUS, obs)) {
            return false;
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

    let inWalkable = false;
    for (const area of world.walkable) {
        if (isPointInRect(x, y, area, AVATAR_RADIUS)) {
            inWalkable = true;
            break;
        }
    }

    if (!inWalkable) return { ok: false, reason: 'outside_walkable' };

    for (const obs of world.obstacles) {
        if (circleRectCollision(x, y, AVATAR_RADIUS, obs)) {
            return { ok: false, reason: 'hit_obstacle', obstacle: obs };
        }
    }

    return { ok: true };
}

/**
 * Check if point is inside rect with margin
 */
function isPointInRect(px, py, rect, margin = 0) {
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
 */
export function constrainPosition(x, y) {
    const world = getWorldModel();
    if (!world || world.walkable.length === 0) return { x, y };

    const margin = AVATAR_RADIUS;
    let best = null;
    let bestDist = Infinity;

    for (const area of world.walkable) {
        // Calculate the nearest point on this walkable rect (with margin)
        const innerX1 = area.x + margin;
        const innerY1 = area.y + margin;
        const innerX2 = area.x + area.w - margin;
        const innerY2 = area.y + area.h - margin;

        // Skip if area is too small to accommodate margin
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

    return best || { x, y };
}

/**
 * Pathfinding with neighbor search
 * Tries direct path first, then searches nearby valid points in circles
 */
export function findPath(fromX, fromY, toX, toY) {
    // Direct path - if target is walkable, go there
    if (canMoveTo(toX, toY)) {
        return { x: toX, y: toY };
    }

    // Try constrained position first
    const base = constrainPosition(toX, toY);
    if (canMoveTo(base.x, base.y)) {
        return base;
    }

    // Neighbor search - circular sampling to find valid point
    const STEP = 16;      // Search resolution
    const MAX_R = 320;    // Max search radius

    for (let r = STEP; r <= MAX_R; r += STEP) {
        for (let a = 0; a < 360; a += 30) {
            const rad = (a * Math.PI) / 180;
            const x = base.x + Math.cos(rad) * r;
            const y = base.y + Math.sin(rad) * r;
            if (canMoveTo(x, y)) {
                return { x, y };
            }
        }
    }

    // Last resort - stay at current position
    return { x: fromX, y: fromY };
}

/**
 * Get zone for a position
 */
export function getZoneAt(x, y) {
    const world = getWorldModel();
    if (!world) return null;

    for (const zone of world.zones) {
        if (isPointInRect(x, y, zone.bounds, 0)) {
            return zone;
        }
    }

    return null;
}

export { AVATAR_RADIUS };
