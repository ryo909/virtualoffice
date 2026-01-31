// mapRenderer.js - Canvas rendering for the map

import { getWorldModel, getDesks, getSpots } from './mapLoader.js';
import { AVATAR_RADIUS } from './collision.js';

let canvas = null;
let ctx = null;
let container = null;
let camera = { x: 0, y: 0, zoom: 1 };
let canvasSize = { w: 0, h: 0 };
let resizeObserver = null;

// Lerp factor for camera smoothing
const CAMERA_LERP = 0.12;

/**
 * Helper: wait for next animation frame
 */
function raf() {
    return new Promise(r => requestAnimationFrame(r));
}

/**
 * Initialize renderer
 */
export async function initRenderer(canvasElement) {
    canvas = canvasElement;
    ctx = canvas.getContext('2d');
    container = document.getElementById('canvas-container');

    // Initial resize (twice for layout settle)
    resizeCanvasToContainer();
    await raf();
    resizeCanvasToContainer();

    // Window resize handler
    window.addEventListener('resize', resizeCanvasToContainer);

    // ResizeObserver for container (handles DevTools, drawer, etc.)
    resizeObserver = new ResizeObserver(() => {
        resizeCanvasToContainer();
    });
    resizeObserver.observe(container);

    return { canvas, ctx };
}

/**
 * Resize canvas to fit container with DPR support
 */
function resizeCanvasToContainer() {
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);

    // Guard against 0 dimensions
    if (w <= 0 || h <= 0) return;

    const dpr = window.devicePixelRatio || 1;

    // Set canvas internal size (for sharp rendering)
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);

    // Set canvas CSS size
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    // Scale context for DPR
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Store CSS pixel size for calculations
    canvasSize = { w, h };
}

/**
 * Update camera to follow target (FPS-independent)
 */
export function updateCamera(targetX, targetY, deltaMs = 16.67) {
    const world = getWorldModel();
    if (!world) return;

    // Target camera position (centered on player)
    const targetCamX = targetX - canvasSize.w / 2;
    const targetCamY = targetY - canvasSize.h / 2;

    // Clamp to map bounds
    const maxX = Math.max(0, world.size.w - canvasSize.w);
    const maxY = Math.max(0, world.size.h - canvasSize.h);

    const clampedX = Math.max(0, Math.min(targetCamX, maxX));
    const clampedY = Math.max(0, Math.min(targetCamY, maxY));

    // FPS-independent smooth camera movement
    const alpha = 1 - Math.pow(1 - CAMERA_LERP, deltaMs / 16.67);
    camera.x += (clampedX - camera.x) * alpha;
    camera.y += (clampedY - camera.y) * alpha;
}

/**
 * Convert screen coords to world coords
 */
export function screenToWorld(screenX, screenY) {
    return {
        x: screenX + camera.x,
        y: screenY + camera.y
    };
}

/**
 * Convert world coords to screen coords
 */
export function worldToScreen(worldX, worldY) {
    return {
        x: worldX - camera.x,
        y: worldY - camera.y
    };
}

/**
 * Get CSS variable value
 */
function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Render the entire map
 */
export function render(playerPos, playerFacing, otherPlayers = [], me = {}, clickMarker = null) {
    if (!ctx) return;

    const world = getWorldModel();
    if (!world) return;

    // Clear canvas
    ctx.fillStyle = getCssVar('--color-mapFloor') || '#f1f5f9';
    ctx.fillRect(0, 0, canvasSize.w, canvasSize.h);

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // Draw zones
    drawZones(world.zones);

    // Draw rooms (expansion)
    drawRooms(world.rooms);

    // Draw obstacles/walls
    drawObstacles(world.obstacles);

    // Draw spots (zoom rooms)
    drawSpots();

    // Draw desks
    drawDesks();

    // Draw decor labels
    drawDecor(world.decor);

    // Draw click marker (destination)
    if (clickMarker) {
        drawClickMarker(clickMarker.x, clickMarker.y);
    }

    // Draw other players
    otherPlayers.forEach(player => {
        drawAvatar(player.pos.x, player.pos.y, player.displayName, player.status, player.avatarColor, false);
    });

    // Draw player
    drawAvatar(playerPos.x, playerPos.y, me.displayName || 'You', me.status || 'online', me.avatarColor, true);

    ctx.restore();
}

/**
 * Draw click marker at destination
 */
function drawClickMarker(x, y) {
    const markerColor = getCssVar('--color-primary') || '#3b82f6';

    // Outer ring
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.strokeStyle = markerColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inner dot
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = markerColor;
    ctx.fill();
}

function drawZones(zones) {
    const zoneFill = getCssVar('--color-mapZone') || 'rgba(59, 130, 246, 0.1)';
    const zoneBorder = getCssVar('--color-mapZoneBorder') || 'rgba(59, 130, 246, 0.3)';

    zones.forEach(zone => {
        const b = zone.bounds;

        ctx.fillStyle = zoneFill;
        ctx.fillRect(b.x, b.y, b.w, b.h);

        ctx.strokeStyle = zoneBorder;
        ctx.lineWidth = 2;
        ctx.strokeRect(b.x, b.y, b.w, b.h);
    });
}

function drawRooms(rooms) {
    const fill = 'rgba(148, 163, 184, 0.1)';
    const border = 'rgba(148, 163, 184, 0.3)';

    rooms.forEach(room => {
        const b = room.bounds;

        ctx.fillStyle = fill;
        ctx.fillRect(b.x, b.y, b.w, b.h);

        ctx.strokeStyle = border;
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.setLineDash([]);

        // Room label
        ctx.fillStyle = getCssVar('--color-textMuted') || '#94a3b8';
        ctx.font = '12px Inter, sans-serif';
        ctx.fillText(room.label, b.x + 10, b.y + 20);
    });
}

function drawObstacles(obstacles) {
    const wallColor = getCssVar('--color-mapWall') || '#64748b';

    obstacles.forEach(obs => {
        ctx.fillStyle = wallColor;
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
    });
}

function drawSpots() {
    const spots = getSpots();
    const spotColor = getCssVar('--color-mapSpot') || '#10b981';

    spots.forEach(spot => {
        const b = spot.bounds;

        // Draw spot area
        ctx.fillStyle = spotColor + '20';
        ctx.fillRect(b.x, b.y, b.w, b.h);

        ctx.strokeStyle = spotColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(b.x, b.y, b.w, b.h);

        // Draw label
        ctx.fillStyle = spotColor;
        ctx.font = 'bold 14px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(spot.label, b.x + b.w / 2, b.y + b.h / 2);
        ctx.textAlign = 'left';

        // Draw icon based on kind
        if (spot.kind === 'zoom_room' || spot.kind === 'zoom_table') {
            ctx.font = '20px sans-serif';
            ctx.fillText('📹', b.x + b.w / 2 - 10, b.y + 30);
        }
    });
}

function drawDesks() {
    const desks = getDesks();
    const deskColor = getCssVar('--color-mapDesk') || '#fbbf24';

    desks.forEach(desk => {
        const x = desk.pos.x;
        const y = desk.pos.y;
        const size = 60;

        // Draw desk
        ctx.fillStyle = deskColor;
        ctx.fillRect(x - size / 2, y - size / 2, size, size * 0.6);

        // Draw desk border
        ctx.strokeStyle = deskColor.replace(')', ', 0.8)').replace('rgb', 'rgba');
        ctx.lineWidth = 2;
        ctx.strokeRect(x - size / 2, y - size / 2, size, size * 0.6);

        // Draw desk ID
        ctx.fillStyle = getCssVar('--color-textMuted') || '#94a3b8';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(desk.id.replace('desk:', ''), x, y + size / 2 + 12);
        ctx.textAlign = 'left';
    });
}

function drawDecor(decor) {
    decor.forEach(item => {
        if (item.type === 'label') {
            if (item.style === 'h1') {
                ctx.fillStyle = getCssVar('--color-text') || '#1e293b';
                ctx.font = 'bold 24px Inter, sans-serif';
            } else {
                ctx.fillStyle = getCssVar('--color-textSecondary') || '#475569';
                ctx.font = '18px Inter, sans-serif';
            }
            ctx.fillText(item.text, item.x, item.y);
        }
    });
}

function drawAvatar(x, y, name, status, color, isPlayer) {
    const avatarColor = color || getCssVar('--color-avatarDefault') || '#3b82f6';
    const radius = AVATAR_RADIUS;

    // Draw shadow
    ctx.beginPath();
    ctx.ellipse(x, y + radius, radius * 0.8, radius * 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fill();

    // Draw avatar circle
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = avatarColor;
    ctx.fill();

    // Draw border for player
    if (isPlayer) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.stroke();
    }

    // Draw status indicator
    const statusColors = {
        online: '#10b981',
        away: '#f59e0b',
        focus: '#ef4444'
    };

    ctx.beginPath();
    ctx.arc(x + radius * 0.7, y + radius * 0.7, 5, 0, Math.PI * 2);
    ctx.fillStyle = statusColors[status] || statusColors.online;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw name tag
    ctx.fillStyle = getCssVar('--color-bg') || '#f8fafc';
    ctx.font = '12px Inter, sans-serif';
    const textWidth = ctx.measureText(name).width;
    const tagX = x - textWidth / 2 - 6;
    const tagY = y - radius - 20;

    // Name tag background
    ctx.beginPath();
    ctx.roundRect(tagX, tagY, textWidth + 12, 18, 4);
    ctx.fill();
    ctx.strokeStyle = getCssVar('--color-border') || '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Name text
    ctx.fillStyle = getCssVar('--color-text') || '#1e293b';
    ctx.textAlign = 'center';
    ctx.fillText(name, x, tagY + 13);
    ctx.textAlign = 'left';
}

/**
 * Render minimap
 */
export function renderMinimap(minimapCanvas, playerPos, otherPlayers = []) {
    const minimapCtx = minimapCanvas.getContext('2d');
    const world = getWorldModel();
    if (!world || !minimapCtx) return;

    const scale = minimapCanvas.width / world.size.w;

    // Clear
    minimapCtx.fillStyle = getCssVar('--color-bgSecondary') || '#e2e8f0';
    minimapCtx.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);

    // Draw zones
    world.zones.forEach(zone => {
        const b = zone.bounds;
        minimapCtx.fillStyle = getCssVar('--color-mapZone') || 'rgba(59, 130, 246, 0.2)';
        minimapCtx.fillRect(b.x * scale, b.y * scale, b.w * scale, b.h * scale);
    });

    // Draw obstacles
    minimapCtx.fillStyle = getCssVar('--color-mapWall') || '#64748b';
    world.obstacles.forEach(obs => {
        minimapCtx.fillRect(obs.x * scale, obs.y * scale, obs.w * scale, obs.h * scale);
    });

    // Draw other players
    otherPlayers.forEach(p => {
        minimapCtx.beginPath();
        minimapCtx.arc(p.pos.x * scale, p.pos.y * scale, 3, 0, Math.PI * 2);
        minimapCtx.fillStyle = p.avatarColor || '#60a5fa';
        minimapCtx.fill();
    });

    // Draw player
    minimapCtx.beginPath();
    minimapCtx.arc(playerPos.x * scale, playerPos.y * scale, 4, 0, Math.PI * 2);
    minimapCtx.fillStyle = '#3b82f6';
    minimapCtx.fill();
    minimapCtx.strokeStyle = '#fff';
    minimapCtx.lineWidth = 1;
    minimapCtx.stroke();

    // Draw viewport rectangle
    minimapCtx.strokeStyle = getCssVar('--color-primary') || '#3b82f6';
    minimapCtx.lineWidth = 1;
    minimapCtx.strokeRect(
        camera.x * scale,
        camera.y * scale,
        canvasSize.w * scale,
        canvasSize.h * scale
    );
}

export function getCamera() {
    return { ...camera };
}

export function getCanvasSize() {
    return { ...canvasSize };
}
