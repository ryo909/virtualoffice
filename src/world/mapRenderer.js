// mapRenderer.js - Canvas rendering for the map (Pixel Illustration Style)

import { getWorldModel, getDesks, getSpots } from './mapLoader.js';
import { getConfig } from '../services/supabaseClient.js';
import { AVATAR_RADIUS } from './collision.js';

// New render modules
import { getPattern, zonePatterns } from '../render/patterns.js';
import { drawZoneBuilding, drawExpansionRoom } from '../render/drawZonesBuilding.js';
import { drawDeskDetailed, drawMeetingTableDetailed, drawCommonTable } from '../render/drawFurniture.js';
import { generateAllDecor } from '../render/decorGenerator.js';
import { drawDecorItems } from '../render/drawDecor.js';
import { renderPixelAvatar, renderNameTag, updateAnimation, getAnimationState } from '../avatar/pixelSpriteRenderer.js';

let canvas = null;
let ctx = null;
let container = null;
let camera = { x: 0, y: 0, zoom: 1 };
let canvasSize = { w: 0, h: 0 };
let resizeObserver = null;

// Background image
let backgroundImage = null;
let backgroundLoaded = false;

// Zoom limits
const MIN_ZOOM = 0.65;
const MAX_ZOOM = 1.6;

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

    // Load background image
    await loadMapBackground();

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
 * Load the background map image
 */
async function loadMapBackground() {
    return new Promise((resolve) => {
        backgroundImage = new Image();
        backgroundImage.onload = () => {
            backgroundLoaded = true;
            console.log('[MapRenderer] Background image loaded:', backgroundImage.width, 'x', backgroundImage.height);
            resolve();
        };
        backgroundImage.onerror = (err) => {
            console.warn('[MapRenderer] Failed to load background image, using fallback:', err);
            backgroundLoaded = false;
            resolve();
        };
        backgroundImage.src = './assets/maps/map.png';
    });
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

    // Viewport size in world coordinates (affected by zoom)
    const viewW = canvasSize.w / camera.zoom;
    const viewH = canvasSize.h / camera.zoom;

    // Target camera position (camera.x/y = world center)
    const targetCamX = targetX;
    const targetCamY = targetY;

    // Clamp camera center so we don't show outside map
    const minX = viewW / 2;
    const maxX = world.size.w - viewW / 2;
    const minY = viewH / 2;
    const maxY = world.size.h - viewH / 2;

    const clampedX = Math.max(minX, Math.min(targetCamX, maxX));
    const clampedY = Math.max(minY, Math.min(targetCamY, maxY));

    // FPS-independent smooth camera movement
    const alpha = 1 - Math.pow(1 - CAMERA_LERP, deltaMs / 16.67);
    camera.x += (clampedX - camera.x) * alpha;
    camera.y += (clampedY - camera.y) * alpha;

    // Also clamp final position
    clampCameraToMap();
}

/**
 * Clamp camera to map bounds (accounting for zoom)
 */
function clampCameraToMap() {
    const world = getWorldModel();
    if (!world) return;

    const viewW = canvasSize.w / camera.zoom;
    const viewH = canvasSize.h / camera.zoom;

    const minX = viewW / 2;
    const maxX = Math.max(minX, world.size.w - viewW / 2);
    const minY = viewH / 2;
    const maxY = Math.max(minY, world.size.h - viewH / 2);

    camera.x = Math.max(minX, Math.min(camera.x, maxX));
    camera.y = Math.max(minY, Math.min(camera.y, maxY));
}

/**
 * Apply zoom with cursor as pivot point
 */
export function applyZoom(delta, mouseScreenX, mouseScreenY) {
    // Get world position under cursor before zoom
    const beforeWorld = screenToWorld(mouseScreenX, mouseScreenY);

    // Calculate new zoom (exponential for smooth feel)
    const zoomSpeed = 0.0015;
    const factor = Math.exp(-delta * zoomSpeed);
    const newZoom = Math.max(MIN_ZOOM, Math.min(camera.zoom * factor, MAX_ZOOM));

    // Skip if change is negligible
    if (Math.abs(newZoom - camera.zoom) < 0.0001) return;

    camera.zoom = newZoom;

    // Get world position under cursor after zoom
    const afterWorld = screenToWorld(mouseScreenX, mouseScreenY);

    // Adjust camera so cursor still points to same world position
    camera.x += (beforeWorld.x - afterWorld.x);
    camera.y += (beforeWorld.y - afterWorld.y);

    // Clamp to map
    clampCameraToMap();
}

/**
 * Convert screen coords to world coords (zoom-aware)
 * 
 * This function handles the transformation:
 * 1. CSS pixel position (relative to canvas)
 * 2. → Normalized position (0-1)
 * 3. → World position (via camera center formula)
 * 
 * @param {number} screenX - X position in CSS pixels relative to canvas left
 * @param {number} screenY - Y position in CSS pixels relative to canvas top
 * @returns {{x: number, y: number}} World coordinates
 */
export function screenToWorld(screenX, screenY) {
    // canvasSize is stored in CSS pixels (not internal resolution)
    // This matches how we receive input coordinates

    // Step 1: Normalize to 0-1 range
    const sx = screenX / canvasSize.w;
    const sy = screenY / canvasSize.h;

    // Step 2: Convert to canvas internal coordinates (CSS pixels space)
    const cx = sx * canvasSize.w;  // This equals screenX, but explicit for clarity
    const cy = sy * canvasSize.h;  // This equals screenY, but explicit for clarity

    // Step 3: Screen center in CSS pixels
    const centerX = canvasSize.w / 2;
    const centerY = canvasSize.h / 2;

    // Step 4: Camera center formula
    // The camera.x/y represents the world position at screen center
    // Offset from center, divided by zoom, plus camera position
    const worldX = (cx - centerX) / camera.zoom + camera.x;
    const worldY = (cy - centerY) / camera.zoom + camera.y;

    return { x: worldX, y: worldY };
}

/**
 * Convert world coords to screen coords (zoom-aware)
 */
export function worldToScreen(worldX, worldY) {
    const cx = canvasSize.w / 2;
    const cy = canvasSize.h / 2;

    const sx = (worldX - camera.x) * camera.zoom + cx;
    const sy = (worldY - camera.y) * camera.zoom + cy;

    return { x: sx, y: sy };
}

/**
 * Get CSS variable value
 */
function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Render the entire map with pixel illustration style
 */
export function render(playerPos, playerFacing, otherPlayers = [], me = {}, clickMarker = null, clickMarkerTime = 0, deltaMs = 16) {
    if (!ctx) return;

    const world = getWorldModel();
    if (!world) return;

    // === Layer 0: Clear canvas ===
    ctx.fillStyle = '#2a2520';
    ctx.fillRect(0, 0, canvasSize.w, canvasSize.h);

    ctx.save();

    // Apply zoom and camera transform
    const cx = canvasSize.w / 2;
    const cy = canvasSize.h / 2;
    ctx.translate(cx, cy);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // === Layer 1: Background Image ===
    if (backgroundLoaded && backgroundImage) {
        // Draw background at world origin (0,0), sized to the world
        ctx.drawImage(backgroundImage, 0, 0, world.size.w, world.size.h);
    } else {
        // Fallback: solid color
        ctx.fillStyle = '#e8e4dc';
        ctx.fillRect(0, 0, world.size.w, world.size.h);
    }

    // === Layer 2: Action Spots visualization (optional, for debugging) ===
    // drawActionSpots();
    if (showDebugSpots) {
        drawDebugSpots();
    }

    // === Layer 3: Click marker ===
    if (clickMarker) {
        drawClickMarkerPixel(clickMarker.x, clickMarker.y, clickMarkerTime);
    }

    // === Layer 4: Other players (pixel avatars) ===
    otherPlayers.forEach(player => {
        const state = getAnimationState(player.actorId || player.displayName);
        renderPixelAvatar(ctx, player.pos.x, player.pos.y, player.displayName, state, camera.zoom, false);
        renderNameTag(ctx, player.pos.x, player.pos.y, player.displayName, player.status, camera.zoom);
    });

    // === Layer 5: Current player (pixel avatar) ===
    const playerState = getAnimationState(me.actorId || 'me');
    renderPixelAvatar(ctx, playerPos.x, playerPos.y, me.displayName || 'You', playerState, camera.zoom, true);
    renderNameTag(ctx, playerPos.x, playerPos.y, me.displayName || 'You', me.status || 'online', camera.zoom);

    // === Debug collision overlays ===
    if (window.DEBUG_COLLISION) {
        drawCollisionDebug(world, playerPos);
    }

    ctx.restore();
}

/**
 * Draw action spots for debugging (optional)
 */
function drawActionSpots() {
    const spots = getSpots();
    spots.forEach(spot => {
        if (spot.x !== undefined && spot.y !== undefined && spot.r !== undefined) {
            // Circle-based spot
            ctx.beginPath();
            ctx.arc(spot.x, spot.y, spot.r, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    });
}

function drawCollisionDebug(world, playerPos) {
    const walkableBase = world.walkableBase || [];
    const walkableFromZones = world.walkableFromZones || [];
    const walkableFinal = world.walkableInflated || world.walkableFinal || world.walkable || [];
    const worldObstacles = world.worldObstacles || world.obstaclesFinal || world.obstacles || [];
    const deskColliders = world.deskColliders || [];
    const zones = world.zones || [];
    const spots = getSpots() || [];
    const desks = world.desks || [];
    const floorRect = world.desks?.[0]?.__debug?.floorRect;
    const moveDebug = window.__moveDebug;
    const walkDebug = window.__walkDebug;
    const debugCfg = getConfig()?.debug || {};
    const showWorldObstacles = debugCfg.drawWorldObstacles !== false;
    const showDeskColliders = debugCfg.drawDeskColliders !== false;

    ctx.save();

    // Walkable base (green fill)
    ctx.fillStyle = 'rgba(34, 197, 94, 0.18)';
    walkableBase.forEach(area => {
        ctx.fillRect(area.x, area.y, area.w, area.h);
    });

    // Walkable from zones (blue fill)
    ctx.fillStyle = 'rgba(59, 130, 246, 0.18)';
    walkableFromZones.forEach(area => {
        ctx.fillRect(area.x, area.y, area.w, area.h);
    });

    // Walkable final (green fill)
    ctx.fillStyle = 'rgba(34, 197, 94, 0.14)';
    walkableFinal.forEach(area => {
        ctx.fillRect(area.x, area.y, area.w, area.h);
    });

    // Walkable final (green outline)
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.85)';
    ctx.lineWidth = 1.5;
    walkableFinal.forEach(area => {
        ctx.strokeRect(area.x, area.y, area.w, area.h);
    });

    if (showWorldObstacles) {
        // World obstacles (orange)
        ctx.strokeStyle = 'rgba(251, 146, 60, 0.9)';
        ctx.lineWidth = 2;
        worldObstacles.forEach(obs => {
            ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
        });
    }

    if (showDeskColliders) {
        // Desk colliders (red, semi-transparent)
        ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
        ctx.lineWidth = 1.5;
        deskColliders.forEach(desk => {
            ctx.fillRect(desk.x, desk.y, desk.w, desk.h);
            ctx.strokeRect(desk.x, desk.y, desk.w, desk.h);
        });
    }

    if (showDeskColliders) {
        desks.forEach(desk => {
            const pos = desk.posAbs || desk.pos;
            const stand = desk.standPointAbs || desk.standPoint;
            const bounds = desk.boundsAbs || desk.bounds;

            if (bounds) {
                ctx.strokeStyle = 'rgba(250, 204, 21, 0.9)';
                ctx.lineWidth = 1;
                ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
            }

            if (pos) {
                ctx.fillStyle = 'rgba(34, 197, 94, 0.95)';
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
                ctx.fill();
            }

            if (stand) {
                ctx.fillStyle = 'rgba(59, 130, 246, 0.95)';
                ctx.beginPath();
                ctx.arc(stand.x, stand.y, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        });
    }

    if (showDeskColliders && floorRect) {
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(floorRect.x, floorRect.y, floorRect.w, floorRect.h);
    }

    // Zones (blue outline + label)
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
    ctx.lineWidth = 1;
    ctx.font = '12px sans-serif';
    ctx.fillStyle = 'rgba(59, 130, 246, 0.9)';
    zones.forEach(zone => {
        const b = zone.bounds;
        if (!b) return;
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        if (zone.id) {
            ctx.fillText(zone.id, b.x + 4, b.y + 12);
        }
    });

    if (walkDebug?.click) {
        // Click point (yellow)
        ctx.fillStyle = 'rgba(234, 179, 8, 0.9)';
        ctx.beginPath();
        ctx.arc(walkDebug.click.x, walkDebug.click.y, 4, 0, Math.PI * 2);
        ctx.fill();
    }

    if (walkDebug?.snapped) {
        // Line from player to snapped point
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(playerPos.x, playerPos.y);
        ctx.lineTo(walkDebug.snapped.x, walkDebug.snapped.y);
        ctx.stroke();

        // Snapped point (cyan)
        ctx.fillStyle = 'rgba(34, 211, 238, 0.9)';
        ctx.beginPath();
        ctx.arc(walkDebug.snapped.x, walkDebug.snapped.y, 4, 0, Math.PI * 2);
        ctx.fill();
    }

    if (moveDebug?.click && moveDebug?.goal && moveDebug?.start) {
        // Line from start to goal
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(moveDebug.start.x, moveDebug.start.y);
        ctx.lineTo(moveDebug.goal.x, moveDebug.goal.y);
        ctx.stroke();

        // Click point (red)
        ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
        ctx.beginPath();
        ctx.arc(moveDebug.click.x, moveDebug.click.y, 4, 0, Math.PI * 2);
        ctx.fill();

        // Goal point (green)
        ctx.fillStyle = 'rgba(16, 185, 129, 0.9)';
        ctx.beginPath();
        ctx.arc(moveDebug.goal.x, moveDebug.goal.y, 4, 0, Math.PI * 2);
        ctx.fill();
    }

    // Spots (blue)
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.85)';
    ctx.lineWidth = 2;
    spots.forEach(spot => {
        if (spot.bounds) {
            ctx.strokeRect(spot.bounds.x, spot.bounds.y, spot.bounds.w, spot.bounds.h);
        } else if (spot.x !== undefined && spot.y !== undefined && spot.r !== undefined) {
            ctx.beginPath();
            ctx.arc(spot.x, spot.y, spot.r, 0, Math.PI * 2);
            ctx.stroke();
        }
    });

    // Avatar radius (white)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(playerPos.x, playerPos.y, AVATAR_RADIUS, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
}

/**
 * Draw obstacles with pixel style
 */
function drawObstaclesPixel(obstacles) {
    if (!obstacles) return;

    obstacles.forEach(obs => {
        ctx.save();

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        roundRect(ctx, obs.x + 2, obs.y + 2, obs.w, obs.h, 4);
        ctx.fill();

        // Main wall with gradient
        const grad = ctx.createLinearGradient(obs.x, obs.y, obs.x, obs.y + obs.h);
        grad.addColorStop(0, '#9ca3af');
        grad.addColorStop(1, '#6b7280');
        ctx.fillStyle = grad;

        roundRect(ctx, obs.x, obs.y, obs.w, obs.h, 4);
        ctx.fill();

        // Highlight on top
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(obs.x + 2, obs.y + 1, obs.w - 4, 2);

        ctx.restore();
    });
}

/**
 * Draw spots with meeting furniture
 */
function drawSpotsPixel() {
    const spots = getSpots();

    spots.forEach(spot => {
        const b = spot.bounds;

        ctx.save();

        // Soft highlight
        ctx.fillStyle = 'rgba(16, 185, 129, 0.06)';
        roundRect(ctx, b.x, b.y, b.w, b.h, 8);
        ctx.fill();

        // Border
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.25)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw furniture based on type
        if (spot.kind === 'zoom_room') {
            drawMeetingTableDetailed(ctx, b, 6, true);
        } else if (spot.kind === 'zoom_table') {
            drawCommonTable(ctx, b);
        }

        // Video icon (small)
        drawVideoIcon(ctx, b.x + b.w - 24, b.y + 12);

        ctx.restore();
    });
}

/**
 * Draw small video icon
 */
function drawVideoIcon(ctx, x, y) {
    ctx.save();

    ctx.fillStyle = '#10b981';
    roundRect(ctx, x, y, 16, 12, 2);
    ctx.fill();

    // Camera lens
    ctx.fillStyle = '#f0fdf4';
    ctx.beginPath();
    ctx.moveTo(x + 12, y + 3);
    ctx.lineTo(x + 16, y + 1);
    ctx.lineTo(x + 16, y + 11);
    ctx.lineTo(x + 12, y + 9);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}

/**
 * Draw desks with detailed furniture
 */
function drawDesksPixel() {
    const desks = getDesks();

    desks.forEach((desk, i) => {
        const isOccupied = desk.assignedTo != null;
        drawDeskDetailed(ctx, desk.pos.x, desk.pos.y, i, isOccupied);
    });
}

/**
 * Draw click marker with pixel style
 */
function drawClickMarkerPixel(x, y, startTime) {
    const age = Date.now() - startTime;
    const progress = Math.min(age / 500, 1);
    const alpha = 1 - progress * 0.6;
    const scale = 1 + progress * 0.4;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;

    // Outer ring
    ctx.strokeStyle = '#4285f4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.stroke();

    // Inner glow
    ctx.fillStyle = 'rgba(66, 133, 244, 0.25)';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();

    // Center dot
    ctx.fillStyle = '#4285f4';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

/**
 * Draw rooms with styled borders
 */
function drawRoomsStyled(rooms) {
    rooms.forEach(room => {
        const b = room.bounds;

        ctx.save();

        // Shadow
        ctx.shadowColor = 'rgba(0,0,0,0.08)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 2;

        // Fill
        ctx.fillStyle = 'rgba(248, 250, 252, 0.6)';
        roundRect(ctx, b.x, b.y, b.w, b.h, 8);
        ctx.fill();

        ctx.shadowColor = 'transparent';

        // Border
        ctx.strokeStyle = '#d1d5db';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label
        Art.drawZoneLabel(ctx, room.label, b.x + b.w / 2, b.y + 20);

        ctx.restore();
    });
}

/**
 * Draw obstacles with improved style
 */
function drawObstaclesStyled(obstacles) {
    obstacles.forEach(obs => {
        ctx.save();

        // Shadow
        ctx.shadowColor = 'rgba(0,0,0,0.15)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;

        // Main wall
        const grad = ctx.createLinearGradient(obs.x, obs.y, obs.x, obs.y + obs.h);
        grad.addColorStop(0, '#9ca3af');
        grad.addColorStop(1, '#6b7280');
        ctx.fillStyle = grad;

        roundRect(ctx, obs.x, obs.y, obs.w, obs.h, 4);
        ctx.fill();

        ctx.restore();
    });
}

/**
 * Draw decor items based on zone
 */
function drawZoneDecor(zones) {
    zones.forEach(zone => {
        const placements = decorPlacements[zone.id];
        if (!placements) return;

        const b = zone.bounds;

        placements.forEach((item, i) => {
            const x = b.x + b.w * item.x;
            const y = b.y + b.h * item.y;

            switch (item.type) {
                case 'plant':
                    Art.drawPlant(ctx, x, y, 0.8);
                    break;
                case 'shelf':
                    Art.drawShelf(ctx, x, y);
                    break;
                case 'rug':
                    Art.drawRug(ctx, x, y, b.w * item.w, b.h * item.h, i);
                    break;
            }
        });
    });
}

/**
 * Draw spots with meeting table style
 */
function drawSpotsStyled() {
    const spots = getSpots();

    spots.forEach(spot => {
        const b = spot.bounds;

        ctx.save();

        // Soft fill
        ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
        roundRect(ctx, b.x, b.y, b.w, b.h, 8);
        ctx.fill();

        // Border
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw meeting table if zoom room
        if (spot.kind === 'zoom_room' || spot.kind === 'zoom_table') {
            Art.drawMeetingTable(ctx, b, spot.kind === 'zoom_room' ? 6 : 4);
        }

        // Label
        Art.drawZoneLabel(ctx, spot.label, b.x + b.w / 2, b.y + 16);

        ctx.restore();
    });
}

/**
 * Draw desks with furniture style
 */
function drawDesksStyled() {
    const desks = getDesks();

    desks.forEach((desk, i) => {
        Art.drawDesk(ctx, desk, i);
    });
}

/**
 * Draw avatar with improved style
 */
function drawAvatarStyled(x, y, name, status, avatarColor, isCurrentPlayer) {
    const radius = AVATAR_RADIUS;

    ctx.save();

    // Shadow
    ctx.shadowColor = shadows.avatar.color;
    ctx.shadowBlur = shadows.avatar.blur;
    ctx.shadowOffsetY = shadows.avatar.offset + 2;

    // Body
    const color = avatarColor || (isCurrentPlayer ? colors.blue : colors.green);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = 'transparent';

    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.arc(x - 3, y - 3, radius * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Border for current player
    if (isCurrentPlayer) {
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, radius + 1, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Status indicator
    const statusColors = {
        online: '#22c55e',
        away: '#f59e0b',
        busy: '#ef4444',
        offline: '#9ca3af'
    };
    ctx.fillStyle = statusColors[status] || statusColors.online;
    ctx.beginPath();
    ctx.arc(x + radius - 2, y + radius - 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Name tag
    ctx.font = '500 11px Inter, system-ui, sans-serif';
    const metrics = ctx.measureText(name);
    const tagWidth = metrics.width + 10;
    const tagHeight = 16;
    const tagX = x - tagWidth / 2;
    const tagY = y - radius - tagHeight - 4;

    // Tag background
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    roundRect(ctx, tagX, tagY, tagWidth, tagHeight, 4);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Name text
    ctx.fillStyle = '#374151';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, x, tagY + tagHeight / 2);

    ctx.restore();
}

// Helper: rounded rectangle
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

// Debug control
let showDebugSpots = false;

export function setShowDebugSpots(enabled) {
    showDebugSpots = enabled;
}

/**
 * Draw debug spots with IDs and bounds
 */
function drawDebugSpots() {
    const spots = getSpots();
    ctx.save();
    ctx.lineWidth = 2;
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    spots.forEach(spot => {
        ctx.beginPath();
        let labelX, labelY;

        // Color coding
        if (spot.id === 'spot:admin') {
            ctx.strokeStyle = '#ff00ff'; // Magenta
            ctx.fillStyle = 'rgba(255, 0, 255, 0.2)';
        } else if (spot.id.includes('meeting')) {
            ctx.strokeStyle = '#ffa500'; // Orange
            ctx.fillStyle = 'rgba(255, 165, 0, 0.2)';
        } else {
            ctx.strokeStyle = '#00ffff'; // Cyan
            ctx.fillStyle = 'rgba(0, 255, 255, 0.2)';
        }

        // Draw shape
        if (spot.bounds) {
            ctx.rect(spot.bounds.x, spot.bounds.y, spot.bounds.w, spot.bounds.h);
            labelX = spot.bounds.x;
            labelY = spot.bounds.y;
        } else if (spot.r) {
            ctx.arc(spot.x, spot.y, spot.r, 0, Math.PI * 2);
            labelX = spot.x - spot.r;
            labelY = spot.y - spot.r;
        }

        ctx.fill();
        ctx.stroke();

        // Draw Label Background
        const labelText = `${spot.id} (P:${spot.priority || 0})`;
        const metrics = ctx.measureText(labelText);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(labelX, labelY - 14, metrics.width + 4, 14);

        // Draw Label Text
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.strokeText(labelText, labelX + 2, labelY - 12);
        ctx.fillText(labelText, labelX + 2, labelY - 12);
    });
    ctx.restore();
}
