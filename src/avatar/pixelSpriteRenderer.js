// pixelSpriteRenderer.js - Render pixel avatars with animation

import { getSpriteFrame, getDirectionFromDelta } from './spriteGenerator.js';

// Animation state per entity
const animationState = new Map();

// Animation settings
const WALK_FPS = 9;
const FRAME_DURATION = 1000 / WALK_FPS;

/**
 * Update animation state for an entity
 */
export function updateAnimation(entityId, isMoving, dx, dy, deltaMs) {
    let state = animationState.get(entityId);

    if (!state) {
        state = {
            direction: 'S',
            frame: 1,
            frameTimer: 0,
            isMoving: false
        };
        animationState.set(entityId, state);
    }

    // Update direction if moving
    if (isMoving && (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1)) {
        const newDir = getDirectionFromDelta(dx, dy);
        if (newDir) {
            state.direction = newDir;
        }
    }

    // Update animation frame
    state.isMoving = isMoving;

    if (isMoving) {
        state.frameTimer += deltaMs;
        if (state.frameTimer >= FRAME_DURATION) {
            state.frameTimer = 0;
            state.frame = (state.frame + 1) % 3;
        }
    } else {
        state.frame = 1; // idle frame
        state.frameTimer = 0;
    }

    return state;
}

/**
 * Get current animation state for entity
 */
export function getAnimationState(entityId) {
    return animationState.get(entityId) || {
        direction: 'S',
        frame: 1,
        isMoving: false
    };
}

/**
 * Render pixel avatar
 */
export function renderPixelAvatar(ctx, x, y, identifier, state, zoom = 1, isCurrentPlayer = false) {
    const spriteCanvas = getSpriteFrame(
        identifier,
        state.direction,
        state.frame,
        state.isMoving
    );

    if (!spriteCanvas) return;

    ctx.save();

    // Disable smoothing for crisp pixels
    ctx.imageSmoothingEnabled = false;

    // Calculate scale (keep pixel-perfect at various zoom levels)
    const baseScale = 2; // 16px -> 32px display
    const scale = Math.max(1, Math.round(baseScale * zoom)) / zoom;

    const drawSize = 16 * scale;
    const drawX = x - drawSize / 2;
    const drawY = y - drawSize + 4; // Offset up so feet are at y position

    // Highlight current player with subtle glow
    if (isCurrentPlayer) {
        ctx.shadowColor = 'rgba(66, 133, 244, 0.5)';
        ctx.shadowBlur = 4;
    }

    // Draw sprite
    ctx.drawImage(
        spriteCanvas,
        0, 0, 16, 16,
        drawX, drawY, drawSize, drawSize
    );

    ctx.restore();
}

/**
 * Render name tag above avatar
 */
export function renderNameTag(ctx, x, y, name, status, zoom = 1) {
    ctx.save();

    // Position above avatar
    const tagY = y - 36;

    ctx.font = '500 11px Inter, system-ui, sans-serif';
    const metrics = ctx.measureText(name);
    const tagWidth = metrics.width + 12;
    const tagHeight = 16;
    const tagX = x - tagWidth / 2;

    // Background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    roundRect(ctx, tagX, tagY, tagWidth, tagHeight, 4);
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Text
    ctx.fillStyle = '#374151';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, x, tagY + tagHeight / 2);

    // Status indicator
    const statusColors = {
        online: '#22c55e',
        away: '#f59e0b',
        busy: '#ef4444',
        offline: '#9ca3af'
    };

    ctx.fillStyle = statusColors[status] || statusColors.online;
    ctx.beginPath();
    ctx.arc(x + tagWidth / 2 - 4, tagY + tagHeight / 2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
}

// Helper
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/**
 * Clear animation state (for cleanup)
 */
export function clearAnimationState(entityId) {
    animationState.delete(entityId);
}
