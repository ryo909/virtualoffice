// drawZonesBuilding.js - Render zones as buildings with walls, floors, shadows

import { getPattern, zonePatterns } from './patterns.js';

// Building style constants
const WALL_THICKNESS = 14;
const OUTER_RADIUS = 20;
const INNER_RADIUS = 14;
const SHADOW_SIZE = 6;
const ENTRANCE_WIDTH = 60;

// Wall colors
const WALL_COLORS = {
    outer: '#8b9cb8',
    inner: '#a8b8cc',
    highlight: 'rgba(255,255,255,0.25)',
    shadow: 'rgba(0,0,0,0.12)'
};

// Window strip colors
const WINDOW_COLORS = {
    frame: '#6b7c98',
    glass: '#b8d4e8',
    divider: '#5a6b88'
};

/**
 * Draw a zone as a building with walls, floor, shadows
 */
export function drawZoneBuilding(ctx, zone, hasMeetingRoom = false) {
    const b = zone.bounds;

    ctx.save();

    // === 1. Outer Shadow ===
    ctx.shadowColor = 'rgba(0,0,0,0.15)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 4;

    // === 2. Outer Wall ===
    ctx.fillStyle = WALL_COLORS.outer;
    roundRect(ctx, b.x, b.y, b.w, b.h, OUTER_RADIUS);
    ctx.fill();

    ctx.shadowColor = 'transparent';

    // === 3. Inner Floor ===
    const innerX = b.x + WALL_THICKNESS;
    const innerY = b.y + WALL_THICKNESS;
    const innerW = b.w - WALL_THICKNESS * 2;
    const innerH = b.h - WALL_THICKNESS * 2;

    // Get pattern for this zone
    const patternType = zonePatterns[zone.id] || 'tile_beige';
    const pattern = getPattern(ctx, patternType);

    ctx.fillStyle = pattern || '#f0ebe0';
    roundRect(ctx, innerX, innerY, innerW, innerH, INNER_RADIUS);
    ctx.fill();

    // === 4. Inner Shadow (top and left edge) ===
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, innerX, innerY, innerW, innerH, INNER_RADIUS);
    ctx.clip();

    // Top shadow
    const topShadowGrad = ctx.createLinearGradient(innerX, innerY, innerX, innerY + SHADOW_SIZE);
    topShadowGrad.addColorStop(0, 'rgba(0,0,0,0.08)');
    topShadowGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = topShadowGrad;
    ctx.fillRect(innerX, innerY, innerW, SHADOW_SIZE);

    // Left shadow
    const leftShadowGrad = ctx.createLinearGradient(innerX, innerY, innerX + SHADOW_SIZE, innerY);
    leftShadowGrad.addColorStop(0, 'rgba(0,0,0,0.05)');
    leftShadowGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = leftShadowGrad;
    ctx.fillRect(innerX, innerY, SHADOW_SIZE, innerH);

    ctx.restore();

    // === 5. Inner Highlight (bottom and right edge) ===
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, innerX, innerY, innerW, innerH, INNER_RADIUS);
    ctx.clip();

    // Bottom highlight
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(innerX, innerY + innerH - 4, innerW, 4);

    // Right highlight
    ctx.fillRect(innerX + innerW - 3, innerY, 3, innerH);

    ctx.restore();

    // === 6. Entrance (visual only, bottom center) ===
    const entranceX = b.x + (b.w - ENTRANCE_WIDTH) / 2;
    const entranceY = b.y + b.h - WALL_THICKNESS;

    // Entrance opening (lighter area on wall)
    ctx.fillStyle = WALL_COLORS.inner;
    ctx.fillRect(entranceX, entranceY, ENTRANCE_WIDTH, WALL_THICKNESS);

    // Entrance floor connection
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(entranceX + 4, entranceY + 2, ENTRANCE_WIDTH - 8, WALL_THICKNESS - 4);

    // === 7. Window Strip (for meeting rooms) ===
    if (hasMeetingRoom) {
        drawWindowStrip(ctx, b.x + WALL_THICKNESS + 20, b.y + 4, innerW - 40, 10);
    }

    ctx.restore();
}

/**
 * Draw window strip (glass panels on wall)
 */
function drawWindowStrip(ctx, x, y, width, height) {
    const panelCount = 3;
    const panelWidth = (width - (panelCount + 1) * 4) / panelCount;

    // Frame background
    ctx.fillStyle = WINDOW_COLORS.frame;
    ctx.fillRect(x, y, width, height);

    // Glass panels
    for (let i = 0; i < panelCount; i++) {
        const px = x + 4 + i * (panelWidth + 4);

        // Glass
        ctx.fillStyle = WINDOW_COLORS.glass;
        ctx.fillRect(px, y + 2, panelWidth, height - 4);

        // Reflection highlight
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(px + 2, y + 3, panelWidth / 3, height - 6);
    }
}

/**
 * Draw wall outer border with highlight
 */
export function drawWallBorder(ctx, zone) {
    const b = zone.bounds;

    // Outer stroke
    ctx.strokeStyle = WALL_COLORS.inner;
    ctx.lineWidth = 2;
    ctx.beginPath();
    roundRect(ctx, b.x + 1, b.y + 1, b.w - 2, b.h - 2, OUTER_RADIUS - 1);
    ctx.stroke();
}

/**
 * Draw expansion room (dashed border, coming soon feel)
 */
export function drawExpansionRoom(ctx, room) {
    const b = room.bounds;

    ctx.save();

    // Soft fill
    ctx.fillStyle = 'rgba(248, 250, 252, 0.5)';
    roundRect(ctx, b.x, b.y, b.w, b.h, 12);
    ctx.fill();

    // Dashed border
    ctx.strokeStyle = '#c0c8d0';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
}

// Helper: rounded rectangle path
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}
