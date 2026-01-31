// spotLogic.js - Spot interaction logic

import { getSpots, getDesks, getSpotById, getDeskById } from './mapLoader.js';

const SPOT_ENTER_DISTANCE = 30;
const DESK_SIT_DISTANCE = 40;

/**
 * Check which spot the player is inside
 * @param {number} x 
 * @param {number} y 
 * @returns {object|null}
 */
export function getSpotAt(x, y) {
    const spots = getSpots();

    for (const spot of spots) {
        const b = spot.bounds;
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
            return spot;
        }
    }

    return null;
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
        const dx = x - desk.standPoint.x;
        const dy = y - desk.standPoint.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < closestDist) {
            closest = desk;
            closestDist = dist;
        }
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
        const dx = x - desk.pos.x;
        const dy = y - desk.pos.y;
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
