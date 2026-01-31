// movement.js - Avatar movement handling

import { canMoveTo, constrainPosition, AVATAR_RADIUS } from './collision.js';
import { getWorldModel } from './mapLoader.js';

const MOVE_SPEED = 160; // pixels per second

let targetPos = null;
let currentPos = { x: 260, y: 260 };
let facing = 'down';
let isMoving = false;
let onMoveCallback = null;

/**
 * Initialize movement system
 */
export function initMovement(startPos, onMove) {
    currentPos = { ...startPos };
    targetPos = null;
    isMoving = false;
    onMoveCallback = onMove;
}

/**
 * Set movement target (click destination)
 */
export function setMoveTarget(x, y) {
    const world = getWorldModel();
    if (!world) return;

    // Constrain to walkable area
    const constrained = constrainPosition(x, y);

    if (canMoveTo(constrained.x, constrained.y)) {
        targetPos = constrained;
        isMoving = true;
    }
}

/**
 * Update movement (call every frame)
 * @param {number} deltaMs - Time since last update in ms
 * @returns {{pos: {x, y}, facing: string, moving: boolean}}
 */
export function updateMovement(deltaMs) {
    if (!isMoving || !targetPos) {
        return { pos: currentPos, facing, moving: false };
    }

    const deltaSeconds = deltaMs / 1000;
    const moveDistance = MOVE_SPEED * deltaSeconds;

    const dx = targetPos.x - currentPos.x;
    const dy = targetPos.y - currentPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance <= moveDistance) {
        // Arrived at destination
        currentPos = { ...targetPos };
        targetPos = null;
        isMoving = false;

        if (onMoveCallback) {
            onMoveCallback(currentPos, facing, false);
        }

        return { pos: currentPos, facing, moving: false };
    }

    // Move towards target
    const ratio = moveDistance / distance;
    const newX = currentPos.x + dx * ratio;
    const newY = currentPos.y + dy * ratio;

    // Update facing direction
    if (Math.abs(dx) > Math.abs(dy)) {
        facing = dx > 0 ? 'right' : 'left';
    } else {
        facing = dy > 0 ? 'down' : 'up';
    }

    // Check if new position is walkable
    if (canMoveTo(newX, newY)) {
        currentPos = { x: newX, y: newY };
    } else {
        // Stop if blocked
        targetPos = null;
        isMoving = false;
    }

    if (onMoveCallback) {
        onMoveCallback(currentPos, facing, isMoving);
    }

    return { pos: currentPos, facing, moving: isMoving };
}

/**
 * Stop movement
 */
export function stopMovement() {
    targetPos = null;
    isMoving = false;
}

/**
 * Teleport to position
 */
export function teleportTo(x, y) {
    const constrained = constrainPosition(x, y);
    currentPos = constrained;
    targetPos = null;
    isMoving = false;

    if (onMoveCallback) {
        onMoveCallback(currentPos, facing, false);
    }
}

/**
 * Handle keyboard movement
 */
export function handleKeyboardMove(keys, deltaMs) {
    const deltaSeconds = deltaMs / 1000;
    const moveDistance = MOVE_SPEED * deltaSeconds;

    let dx = 0;
    let dy = 0;

    if (keys.up || keys.w) dy -= 1;
    if (keys.down || keys.s) dy += 1;
    if (keys.left || keys.a) dx -= 1;
    if (keys.right || keys.d) dx += 1;

    if (dx === 0 && dy === 0) {
        return { pos: currentPos, facing, moving: false };
    }

    // Normalize diagonal movement
    const len = Math.sqrt(dx * dx + dy * dy);
    dx = (dx / len) * moveDistance;
    dy = (dy / len) * moveDistance;

    const newX = currentPos.x + dx;
    const newY = currentPos.y + dy;

    // Update facing
    if (Math.abs(dx) > Math.abs(dy)) {
        facing = dx > 0 ? 'right' : 'left';
    } else {
        facing = dy > 0 ? 'down' : 'up';
    }

    if (canMoveTo(newX, newY)) {
        currentPos = { x: newX, y: newY };
        targetPos = null; // Cancel click movement
        isMoving = true;
    }

    if (onMoveCallback) {
        onMoveCallback(currentPos, facing, true);
    }

    return { pos: currentPos, facing, moving: true };
}

export function getCurrentPos() {
    return { ...currentPos };
}

export function getFacing() {
    return facing;
}

export function getIsMoving() {
    return isMoving;
}
