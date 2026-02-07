// movement.js - Avatar movement handling

import {
    canMoveTo,
    canMoveToDebug,
    constrainPosition,
    findPath,
    getZoneAt,
    getNearestWalkableDistance,
    isPointInAnyRect,
    isPointInRect,
    snapPointToWalkable,
    AVATAR_RADIUS
} from './collision.js';
import { getWorldModel } from './mapLoader.js';

const MOVE_SPEED = 160; // pixels per second
const DEBUG_COLLISION = false; // Set to true to bypass collision for testing

let targetPos = null;
let currentPos = { x: 260, y: 260 };
let facing = 'down';
let isMoving = false;
let movementLocked = false;
let onMoveCallback = null;
let lastLogTime = 0;
let lastMoveMeta = null;

// Debug: last path result for external access
export let lastPathResult = null;

/**
 * Initialize movement system
 */
export function initMovement(startPos, onMove) {
    currentPos = { ...startPos };
    targetPos = null;
    isMoving = false;
    movementLocked = false;
    onMoveCallback = onMove;
    console.log('[MOVE] initMovement', startPos);
}

/**
 * Set movement target (click destination)
 * Uses findPath for proper nearby search and reason tracking
 */
export function setMoveTarget(x, y) {
    if (movementLocked) {
        console.log('[MOVE] ignored setMoveTarget because movementLocked');
        stopMoving();
        return;
    }

    console.log('[MOVE] setMoveTarget called', { requested: { x: Math.round(x), y: Math.round(y) } });

    const world = getWorldModel();
    if (!world) {
        console.warn('[MOVE] No world model!');
        return;
    }

    const walkableRects = world.walkableInflated || world.walkableFinal || world.walkable || [];
    const deskColliders = world.deskColliders || [];
    const worldObstacles = world.worldObstacles || world.obstaclesFinal || world.obstacles || [];
    const obstacleRects = world.obstaclesFinal || world.obstacles || [];
    const clickPoint = { x, y };
    const walkableHit = isPointInAnyRect(clickPoint, walkableRects);
    const obstacleHit = isPointInAnyRect(clickPoint, obstacleRects);
    const snapped = snapPointToWalkable(clickPoint);
    const zoneAtClick = getZoneAt(x, y);

    const constrainedBecause = (() => {
        if (!walkableHit.hit) return 'not-walkable';
        if (obstacleHit.hit) return 'hit-obstacle';
        const snapDist = Math.hypot(snapped.x - x, snapped.y - y);
        if (snapDist > 0.5) return 'snap';
        return 'ok';
    })();

    console.log('[MOVE] click pre-findPath', {
        click: { x: Math.round(x), y: Math.round(y) },
        start: { x: Math.round(currentPos.x), y: Math.round(currentPos.y) }
    });
    console.log(
        `[WALKDBG] click=(${Math.round(x)},${Math.round(y)}) ` +
        `inWalkable=${walkableHit.hit} inObstacle=${obstacleHit.hit} ` +
        `zone=${zoneAtClick?.id || 'null'} constrainedBecause=${constrainedBecause} ` +
        `snapped=(${Math.round(snapped.x)},${Math.round(snapped.y)})`
    );
    if (obstacleHit.hit) {
        const deskHit = findHitRect(clickPoint, deskColliders);
        const worldHit = findHitRect(clickPoint, worldObstacles);
        if (deskHit) {
            console.log(`[WALKDBG] blockedBy=desk id=${deskHit}`);
        } else if (worldHit) {
            console.log(`[WALKDBG] blockedBy=world id=${worldHit}`);
        } else {
            console.log('[WALKDBG] blockedBy=unknown');
        }
    }

    const zoneAtCurrent = getZoneAt(currentPos.x, currentPos.y);
    const walkableDebug = canMoveToDebug(x, y);
    const nearestWalkableDist = getNearestWalkableDistance(x, y);

    if (!obstacleHit.hit && walkableDebug?.reason === 'hit_obstacle') {
        const tag = String(walkableDebug.obstacle || 'unknown');
        const kind = tag.toLowerCase().includes('desk') ? 'desk' : 'world';
        console.log(`[WALKDBG] blockedBy=${kind} id=${tag}`);
    }

    // Use findPath which includes nearby search and returns reason
    const pathResult = findPath(currentPos.x, currentPos.y, x, y);
    lastPathResult = pathResult;

    const startInWalkable = canMoveTo(currentPos.x, currentPos.y);
    const goalInWalkable = canMoveTo(pathResult.x, pathResult.y);
    const distStartGoal = Math.hypot(pathResult.x - currentPos.x, pathResult.y - currentPos.y);
    const distClick = Math.hypot(x - currentPos.x, y - currentPos.y);
    const goalSnapped = Math.round(pathResult.x) !== Math.round(x) || Math.round(pathResult.y) !== Math.round(y);
    const goalNearlyStart = distStartGoal < 3;

    const failReason = (() => {
        if (walkableDebug?.reason === 'out_of_world') return 'out-of-world';
        if (walkableDebug?.reason === 'not_in_walkable_final') return 'not-in-walkableFinal';
        if (walkableDebug?.reason === 'hit_obstacle') return 'hit-obstacle';
        if (pathResult.reason === 'stuck') return 'unreachable';
        if (goalNearlyStart && distClick > 12) return 'snapped-to-start';
        return 'ok';
    })();

    lastMoveMeta = {
        click: { x, y },
        goal: { x: pathResult.x, y: pathResult.y },
        start: { x: currentPos.x, y: currentPos.y },
        distStartGoal,
        distClick,
        goalSnapped,
        snappedToStart: goalNearlyStart,
        failReason
    };

    console.log('[MOVE] click/path debug', {
        click: { x: Math.round(x), y: Math.round(y) },
        goal: { x: Math.round(pathResult.x), y: Math.round(pathResult.y) },
        startInWalkableFinal: startInWalkable,
        goalInWalkableFinal: goalInWalkable,
        nearestWalkableDist: Math.round(nearestWalkableDist),
        pathLen: Math.round(pathResult.pathLen || 0),
        failReason,
        zoneAt: zoneAtClick?.id || null,
        currentZone: zoneAtCurrent?.id || null,
        snapped: goalSnapped,
        goalNearlyStart
    });

    window.__moveDebug = {
        click: { x, y },
        goal: { x: pathResult.x, y: pathResult.y },
        start: { x: currentPos.x, y: currentPos.y }
    };
    window.__walkDebug = {
        click: { x, y },
        snapped: { x: snapped.x, y: snapped.y }
    };

    // For debugging: skip collision check if DEBUG_COLLISION is true
    if (DEBUG_COLLISION) {
        targetPos = { x, y };
        isMoving = true;
        lastPathResult = { x, y, reason: 'debug_bypass' };
        console.log('[MOVE] target set (collision bypassed)', targetPos);
        return;
    }

    console.log('[MOVE] lastPathResult coords', {
        x: Math.round(pathResult.x),
        y: Math.round(pathResult.y),
        reason: pathResult.reason
    });

    console.log('[MOVE] findPath result', {
        requested: { x: Math.round(x), y: Math.round(y) },
        final: { x: Math.round(pathResult.x), y: Math.round(pathResult.y) },
        reason: pathResult.reason
    });

    if (goalNearlyStart && distClick > 12) {
        console.warn('[MOVE] snapped to start; treating as unreachable');
        return;
    }

    if (pathResult.reason !== 'stuck') {
        targetPos = { x: pathResult.x, y: pathResult.y };
        isMoving = true;
        console.log('[MOVE] target set', targetPos, 'reason:', pathResult.reason);
    } else {
        console.warn('[MOVE] findPath returned stuck for', { x, y });
    }
}

/**
 * Update movement (call every frame)
 * @param {number} deltaMs - Time since last update in ms
 * @returns {{pos: {x, y}, facing: string, moving: boolean}}
 */
export function updateMovement(deltaMs) {
    if (movementLocked) {
        stopMoving();
        return { pos: currentPos, facing, moving: false };
    }

    const now = Date.now();

    // Log every 500ms for debugging
    if (now - lastLogTime > 500) {
        console.log('[MOVE] tick', { pos: currentPos, target: targetPos, isMoving, deltaMs });
        lastLogTime = now;
    }

    if (!isMoving || !targetPos) {
        return { pos: currentPos, facing, moving: false };
    }

    const deltaSeconds = deltaMs / 1000;
    const moveDistance = MOVE_SPEED * deltaSeconds;

    const dx = targetPos.x - currentPos.x;
    const dy = targetPos.y - currentPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Arrived at destination (distance < 4px)
    if (distance <= 4) {
        const arrivedCheck = {
            distToGoal: Math.round(distance),
            goal: { x: Math.round(targetPos.x), y: Math.round(targetPos.y) },
            start: lastMoveMeta?.start
                ? { x: Math.round(lastMoveMeta.start.x), y: Math.round(lastMoveMeta.start.y) }
                : null,
            distStartGoal: lastMoveMeta ? Math.round(lastMoveMeta.distStartGoal) : null,
            distClick: lastMoveMeta ? Math.round(lastMoveMeta.distClick) : null,
            snappedToStart: lastMoveMeta?.snappedToStart || false
        };
        console.log('[MOVE] arrivedCheck', arrivedCheck);

        if (lastMoveMeta?.snappedToStart && lastMoveMeta?.distClick > 12) {
            targetPos = null;
            isMoving = false;
            console.warn('[MOVE] fail: unreachable (snapped to start)', arrivedCheck);
            if (onMoveCallback) {
                onMoveCallback(currentPos, facing, false);
            }
            return { pos: currentPos, facing, moving: false };
        }

        currentPos = { ...targetPos };
        targetPos = null;
        isMoving = false;
        lastMoveMeta = null;
        console.log('[MOVE] arrived', currentPos);

        if (onMoveCallback) {
            onMoveCallback(currentPos, facing, false);
        }

        return { pos: currentPos, facing, moving: false };
    }

    // Move towards target (sub-stepped to avoid skipping narrow walkables)
    const ratioRaw = moveDistance / distance;
    const ratio = Math.min(1, ratioRaw);

    const desiredX = currentPos.x + dx * ratio;
    const desiredY = currentPos.y + dy * ratio;

    // Update facing direction (based on intent)
    if (Math.abs(dx) > Math.abs(dy)) {
        facing = dx > 0 ? 'right' : 'left';
    } else {
        facing = dy > 0 ? 'down' : 'up';
    }

    if (DEBUG_COLLISION) {
        currentPos = { x: desiredX, y: desiredY };
    } else {
        const STEP = 4;
        const totalDx = desiredX - currentPos.x;
        const totalDy = desiredY - currentPos.y;
        const totalDist = Math.sqrt(totalDx * totalDx + totalDy * totalDy);

        const steps = Math.max(1, Math.ceil(totalDist / STEP));
        let nx = currentPos.x;
        let ny = currentPos.y;

        let advanced = false;
        let blocked = false;

        for (let i = 0; i < steps; i++) {
            const t = (i + 1) / steps;
            const tx = currentPos.x + totalDx * t;
            const ty = currentPos.y + totalDy * t;

            if (canMoveTo(tx, ty)) {
                nx = tx;
                ny = ty;
                advanced = true;
                continue;
            }

            const tryX = canMoveTo(tx, ny);
            const tryY = canMoveTo(nx, ty);

            if (tryX && !tryY) {
                nx = tx;
                advanced = true;
                continue;
            }
            if (!tryX && tryY) {
                ny = ty;
                advanced = true;
                continue;
            }
            if (tryX && tryY) {
                if (Math.abs(dx) >= Math.abs(dy)) {
                    nx = tx;
                } else {
                    ny = ty;
                }
                advanced = true;
                continue;
            }

            blocked = true;
            console.warn('[MOVE] blocked at', { tx, ty, step: i + 1, steps });
            try {
                const dbg = canMoveToDebug(tx, ty);
                console.warn('[MOVE] blocked reason', dbg);
            } catch (e) {}
            break;
        }

        currentPos = { x: nx, y: ny };

        if (blocked && !advanced) {
            targetPos = null;
            isMoving = false;
            lastMoveMeta = null;
        }
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
    lastMoveMeta = null;
}

/**
 * Safe wrapper for stopping movement (never throws)
 */
export function stopMoving() {
    try {
        stopMovement();
    } catch (err) {
        console.warn('[MOVE] stopMoving failed, forcing stop', err);
        targetPos = null;
        isMoving = false;
        lastMoveMeta = null;
    }
}

/**
 * Teleport to position
 */
export function teleportTo(x, y) {
    const constrained = constrainPosition(x, y);
    currentPos = constrained;
    targetPos = null;
    isMoving = false;
    lastMoveMeta = null;

    if (onMoveCallback) {
        onMoveCallback(currentPos, facing, false);
    }
}

export function setPosition(x, y) {
    try {
        const safeX = Number.isFinite(x) ? x : currentPos.x;
        const safeY = Number.isFinite(y) ? y : currentPos.y;
        teleportTo(safeX, safeY);
    } catch (err) {
        console.warn('[MOVE] setPosition failed, preserving current position', err);
        targetPos = null;
        isMoving = false;
        lastMoveMeta = null;
        if (onMoveCallback) {
            onMoveCallback(currentPos, facing, false);
        }
    }
}

/**
 * Handle keyboard movement
 */
export function handleKeyboardMove(keys, deltaMs) {
    if (movementLocked) {
        stopMoving();
        return { pos: currentPos, facing, moving: false };
    }

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

export function getTarget() {
    return targetPos ? { ...targetPos } : null;
}

export function setMovementLocked(locked) {
    movementLocked = !!locked;
    if (movementLocked) {
        stopMoving();
    }
}

export function isMovementLocked() {
    return movementLocked;
}

// Debug: Force move position directly
export function forceMove(dx, dy) {
    currentPos.x += dx;
    currentPos.y += dy;
    console.log('[MOVE] forceMove', currentPos);
    if (onMoveCallback) {
        onMoveCallback(currentPos, facing, false);
    }
}

function findHitRect(point, rects) {
    if (!rects || rects.length === 0) return null;
    for (const rect of rects) {
        if (isPointInRect(point, rect, 0)) {
            return rect.id || rect.tag || 'unknown';
        }
    }
    return null;
}
