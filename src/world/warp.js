// warp.js - Warp/teleport functionality

import { teleportTo, getCurrentPos } from './movement.js';
import { canMoveTo, constrainPosition } from './collision.js';

const WARP_OFFSET = 50; // Distance from target

/**
 * Warp near a target position
 * @param {number} targetX 
 * @param {number} targetY 
 * @returns {{success: boolean, pos: {x, y}}}
 */
export function warpNear(targetX, targetY) {
    // Try positions around the target
    const offsets = [
        { x: WARP_OFFSET, y: 0 },
        { x: -WARP_OFFSET, y: 0 },
        { x: 0, y: WARP_OFFSET },
        { x: 0, y: -WARP_OFFSET },
        { x: WARP_OFFSET, y: WARP_OFFSET },
        { x: -WARP_OFFSET, y: WARP_OFFSET },
        { x: WARP_OFFSET, y: -WARP_OFFSET },
        { x: -WARP_OFFSET, y: -WARP_OFFSET },
    ];

    for (const offset of offsets) {
        const x = targetX + offset.x;
        const y = targetY + offset.y;

        if (canMoveTo(x, y)) {
            teleportTo(x, y);
            return { success: true, pos: { x, y } };
        }
    }

    // Try constrained position as fallback
    const constrained = constrainPosition(targetX, targetY);
    if (canMoveTo(constrained.x, constrained.y)) {
        teleportTo(constrained.x, constrained.y);
        return { success: true, pos: constrained };
    }

    return { success: false, pos: getCurrentPos() };
}

/**
 * Warp near a user
 * @param {{x: number, y: number}} userPos 
 * @returns {{success: boolean, pos: {x, y}}}
 */
export function warpNearUser(userPos) {
    return warpNear(userPos.x, userPos.y);
}
