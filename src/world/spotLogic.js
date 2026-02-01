// spotLogic.js - Spot interaction logic

import { getSpots, getDesks, getSpotById, getDeskById } from './mapLoader.js';

const SPOT_ENTER_DISTANCE = 30;
const DESK_SIT_DISTANCE = 40;

/**
 * Check which spot the player is inside
 * Supports both bounds-based (x,y,w,h) and radius-based (x,y,r) spots
 * @param {number} x 
 * @param {number} y 
 * @returns {object|null}
 */
/**
 * Get all spots at position, sorted by priority desc
 * @param {number} x
 * @param {number} y
 * @returns {Array<object>}
 */
export function getSortedSpotsAt(x, y) {
    const spots = getSpots();
    const hits = [];

    for (const spot of spots) {
        // Check radius-based spot (action spots)
        if (spot.x !== undefined && spot.y !== undefined && spot.r !== undefined) {
            const dx = x - spot.x;
            const dy = y - spot.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= spot.r) {
                hits.push(spot);
            }
        }
        // Check bounds-based spot (zoom rooms, admin)
        else if (spot.bounds) {
            const b = spot.bounds;
            if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
                hits.push(spot);
            }
        }
    }

    // Sort by priority (default 0)
    return hits.sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

/**
 * Check which spot the player is inside (returns highest priority)
 * Supports both bounds-based (x,y,w,h) and radius-based (x,y,r) spots
 * @param {number} x 
 * @param {number} y 
 * @returns {object|null}
 */
export function getSpotAt(x, y) {
    const hits = getSortedSpotsAt(x, y);
    return hits.length > 0 ? hits[0] : null;
}

/**
 * Check which desk is near the player (for sitting)
 * @param {number} x 
 * @param {number} y 
 * @returns {object|null}
 */
export function getNearbyDesk(x, y) {
    const desks = getDesks();
    let closest = null;
    let closestDist = DESK_SIT_DISTANCE;

    for (const desk of desks) {
        const anchor = desk.standPointAbs || desk.standPoint || desk.posAbs || desk.pos;
        if (!desk.standPointAbs) {
            console.warn('[desk] missing standPointAbs', desk.id);
        }
        if (!anchor) continue;
        const dx = x - anchor.x;
        const dy = y - anchor.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < closestDist) {
            closest = desk;
            closestDist = dist;
        }
    }

    if (closest) {
        const anchor = closest.standPoint || closest.pos;
        console.log('[desk] nearest', closest.id, Math.round(closestDist), x, y, anchor?.x, anchor?.y);
    }
    return closest;
}

/**
 * Get clickable element at position
 * @param {number} x 
 * @param {number} y 
 * @returns {{kind: 'spot'|'desk'|null, data: object|null}}
 */
export function getClickableAt(x, y) {
    // Check spots first
    const spot = getSpotAt(x, y);
    if (spot) {
        return { kind: 'spot', data: spot };
    }

    // Check desks
    const desks = getDesks();
    for (const desk of desks) {
        const collider = desk.boundsAbs || desk.colliderAbs;
        if (collider) {
            if (x >= collider.x && x <= collider.x + collider.w && y >= collider.y && y <= collider.y + collider.h) {
                return { kind: 'desk', data: desk };
            }
            continue;
        }
        const center = desk.posAbs || desk.pos;
        if (!center) continue;
        const dx = x - center.x;
        const dy = y - center.y;
        const size = 60;

        if (Math.abs(dx) < size / 2 && Math.abs(dy) < size / 2) {
            return { kind: 'desk', data: desk };
        }
    }

    return { kind: null, data: null };
}

/**
 * Get room chat channel for current location
 * @param {string|null} insideSpotId 
 * @param {string|null} seatedDeskId 
 * @param {string} areaId 
 * @returns {string}
 */
export function getRoomChatChannel(insideSpotId, seatedDeskId, areaId) {
    // Priority: spot > desk > area
    if (insideSpotId && insideSpotId.startsWith('zoom:')) {
        return `chat:room:${insideSpotId}`;
    }

    if (seatedDeskId) {
        return `chat:desk:${seatedDeskId}`;
    }

    return `chat:room:${areaId}`;
}

/**
 * Get location label for display
 * @param {string|null} insideSpotId 
 * @param {string|null} seatedDeskId 
 * @param {string} areaId 
 * @returns {string}
 */
export function getLocationLabel(insideSpotId, seatedDeskId, areaId) {
    if (insideSpotId) {
        const spot = getSpotById(insideSpotId);
        return spot ? spot.label : insideSpotId;
    }

    if (seatedDeskId) {
        return `Desk ${seatedDeskId.replace('desk:', '')}`;
    }

    return areaId.replace('area:', '');
}
