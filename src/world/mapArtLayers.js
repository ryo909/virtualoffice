// mapArtLayers.js - Layered rendering for office-style map

import { colors, shadows, borders, furniture, floorStyles, zoneFloorMap, decorPlacements } from './mapStyles.js';

/**
 * Draw global floor with subtle noise and gradient
 */
export function drawGlobalFloor(ctx, width, height) {
    const style = floorStyles.global;

    // Create gradient
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, style.gradientTop);
    grad.addColorStop(1, style.gradientBottom);

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Add subtle noise
    addNoise(ctx, 0, 0, width, height, style.noiseAlpha);
}

/**
 * Draw zone floor with appropriate material
 */
export function drawZoneFloor(ctx, zone, zoomLevel = 1) {
    const b = zone.bounds;
    const styleKey = zoneFloorMap[zone.id] || 'tile';
    const style = floorStyles[styleKey];

    ctx.save();

    // Clip to zone bounds with rounded corners
    const radius = borders.zone.radius;
    ctx.beginPath();
    roundRect(ctx, b.x + 4, b.y + 4, b.w - 8, b.h - 8, radius);
    ctx.clip();

    if (styleKey === 'tile') {
        drawTileFloor(ctx, b, style);
    } else if (styleKey === 'carpet') {
        drawCarpetFloor(ctx, b, style);
    } else if (styleKey === 'lounge_rug') {
        drawLoungeFloor(ctx, b, style);
    } else {
        ctx.fillStyle = style.baseColor;
        ctx.fillRect(b.x, b.y, b.w, b.h);
    }

    ctx.restore();
}

function drawTileFloor(ctx, bounds, style) {
    const { x, y, w, h } = bounds;
    const tileSize = style.tileSize;

    // Fill base
    ctx.fillStyle = style.baseColor;
    ctx.fillRect(x, y, w, h);

    // Draw grout lines
    ctx.strokeStyle = style.groutColor;
    ctx.lineWidth = style.groutWidth;

    for (let tx = x; tx < x + w; tx += tileSize) {
        ctx.beginPath();
        ctx.moveTo(tx, y);
        ctx.lineTo(tx, y + h);
        ctx.stroke();
    }

    for (let ty = y; ty < y + h; ty += tileSize) {
        ctx.beginPath();
        ctx.moveTo(x, ty);
        ctx.lineTo(x + w, ty);
        ctx.stroke();
    }
}

function drawCarpetFloor(ctx, bounds, style) {
    const { x, y, w, h } = bounds;

    // Fill base color
    ctx.fillStyle = style.baseColor;
    ctx.fillRect(x, y, w, h);

    // Add subtle weave pattern
    ctx.strokeStyle = style.patternColor;
    ctx.lineWidth = 0.5;

    const spacing = 8;
    for (let i = 0; i < Math.max(w, h) * 2; i += spacing) {
        ctx.beginPath();
        ctx.moveTo(x + i, y);
        ctx.lineTo(x, y + i);
        ctx.stroke();
    }
}

function drawLoungeFloor(ctx, bounds, style) {
    const { x, y, w, h } = bounds;

    // Soft gradient fill
    const grad = ctx.createRadialGradient(
        x + w / 2, y + h / 2, 0,
        x + w / 2, y + h / 2, Math.max(w, h) / 2
    );
    grad.addColorStop(0, style.accentColors[0]);
    grad.addColorStop(1, style.baseColor);

    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
}

/**
 * Draw zone walls/borders with depth and shadow
 */
export function drawZoneBorder(ctx, zone) {
    const b = zone.bounds;
    const { width, radius, outerColor, innerColor } = borders.zone;
    const shadow = shadows.zone;

    ctx.save();

    // Outer shadow
    ctx.shadowColor = shadow.color;
    ctx.shadowBlur = shadow.blur;
    ctx.shadowOffsetX = shadow.offset;
    ctx.shadowOffsetY = shadow.offset;

    // Outer border
    ctx.strokeStyle = outerColor;
    ctx.lineWidth = width;
    ctx.beginPath();
    roundRect(ctx, b.x + width / 2, b.y + width / 2, b.w - width, b.h - width, radius);
    ctx.stroke();

    ctx.shadowColor = 'transparent';

    // Inner highlight
    ctx.strokeStyle = innerColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    roundRect(ctx, b.x + width + 1, b.y + width + 1, b.w - width * 2 - 2, b.h - width * 2 - 2, radius - 2);
    ctx.stroke();

    ctx.restore();
}

/**
 * Draw a desk with monitor and chair (replaces yellow rectangle)
 */
export function drawDesk(ctx, desk, chairColorIndex = 0) {
    const { x, y } = desk.pos;
    const f = furniture.desk;
    const chairColors = [colors.chairBlue, colors.chairGreen, colors.chairYellow, colors.chairRed];
    const chairColor = chairColors[chairColorIndex % chairColors.length];

    const deskX = x - f.width / 2;
    const deskY = y - f.height / 2;

    ctx.save();

    // Desk shadow
    ctx.shadowColor = shadows.furniture.color;
    ctx.shadowBlur = shadows.furniture.blur;
    ctx.shadowOffsetX = shadows.furniture.offset;
    ctx.shadowOffsetY = shadows.furniture.offset;

    // Desk surface (wood)
    ctx.fillStyle = colors.deskWood;
    ctx.beginPath();
    roundRect(ctx, deskX, deskY, f.width, f.height, f.cornerRadius);
    ctx.fill();

    ctx.shadowColor = 'transparent';

    // Wood grain effect
    ctx.strokeStyle = colors.deskWoodDark;
    ctx.lineWidth = 0.5;
    for (let i = 0; i < f.width; i += 12) {
        ctx.beginPath();
        ctx.moveTo(deskX + i, deskY);
        ctx.lineTo(deskX + i, deskY + f.height);
        ctx.stroke();
    }

    // Monitor
    const monX = x - furniture.monitor.width / 2;
    const monY = deskY + 4;

    ctx.fillStyle = colors.monitor;
    ctx.beginPath();
    roundRect(ctx, monX, monY, furniture.monitor.width, furniture.monitor.height, 2);
    ctx.fill();

    // Monitor screen
    ctx.fillStyle = colors.monitorScreen;
    ctx.fillRect(
        monX + furniture.monitor.screenPadding,
        monY + furniture.monitor.screenPadding,
        furniture.monitor.width - furniture.monitor.screenPadding * 2,
        furniture.monitor.height - furniture.monitor.screenPadding * 2 - 2
    );

    // Monitor stand
    ctx.fillStyle = colors.monitor;
    ctx.fillRect(x - 3, monY + furniture.monitor.height, 6, 4);

    // Chair
    const chairY = y + f.height / 2 + furniture.chair.offset;

    ctx.shadowColor = shadows.furniture.color;
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 2;

    ctx.fillStyle = chairColor;
    ctx.beginPath();
    ctx.arc(x, chairY, furniture.chair.radius, 0, Math.PI * 2);
    ctx.fill();

    // Chair back
    ctx.fillStyle = chairColor;
    ctx.beginPath();
    ctx.arc(x, chairY + 4, furniture.chair.radius - 2, Math.PI * 0.8, Math.PI * 0.2, true);
    ctx.fill();

    ctx.restore();
}

/**
 * Draw meeting room table with chairs
 */
export function drawMeetingTable(ctx, bounds, chairCount = 6) {
    const { x, y, w, h } = bounds;
    const tableW = Math.min(w * 0.6, 200);
    const tableH = Math.min(h * 0.4, 100);
    const tableX = x + (w - tableW) / 2;
    const tableY = y + (h - tableH) / 2;

    ctx.save();

    // Table shadow
    ctx.shadowColor = shadows.furniture.color;
    ctx.shadowBlur = shadows.furniture.blur;
    ctx.shadowOffsetY = shadows.furniture.offset;

    // Table surface
    ctx.fillStyle = colors.deskWood;
    ctx.beginPath();
    roundRect(ctx, tableX, tableY, tableW, tableH, furniture.meetingTable.cornerRadius);
    ctx.fill();

    ctx.shadowColor = 'transparent';

    // Chairs around table
    const chairColors = [colors.chairBlue, colors.chairGreen, colors.chairYellow];
    const chairRadius = 8;
    const chairOffset = 16;

    // Top row
    const topChairs = Math.floor(chairCount / 2);
    for (let i = 0; i < topChairs; i++) {
        const cx = tableX + (i + 1) * tableW / (topChairs + 1);
        ctx.fillStyle = chairColors[i % chairColors.length];
        ctx.beginPath();
        ctx.arc(cx, tableY - chairOffset, chairRadius, 0, Math.PI * 2);
        ctx.fill();
    }

    // Bottom row
    const bottomChairs = chairCount - topChairs;
    for (let i = 0; i < bottomChairs; i++) {
        const cx = tableX + (i + 1) * tableW / (bottomChairs + 1);
        ctx.fillStyle = chairColors[(i + topChairs) % chairColors.length];
        ctx.beginPath();
        ctx.arc(cx, tableY + tableH + chairOffset, chairRadius, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

/**
 * Draw a potted plant
 */
export function drawPlant(ctx, x, y, scale = 1) {
    const p = furniture.plant;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    // Pot shadow
    ctx.shadowColor = shadows.furniture.color;
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;

    // Pot
    ctx.fillStyle = colors.pot;
    ctx.beginPath();
    ctx.moveTo(-p.potWidth / 2, 0);
    ctx.lineTo(-p.potWidth / 2 + 3, -p.potHeight);
    ctx.lineTo(p.potWidth / 2 - 3, -p.potHeight);
    ctx.lineTo(p.potWidth / 2, 0);
    ctx.closePath();
    ctx.fill();

    ctx.shadowColor = 'transparent';

    // Leaves (multiple circles)
    ctx.fillStyle = colors.plantLight;
    ctx.beginPath();
    ctx.arc(0, -p.potHeight - p.leafRadius, p.leafRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = colors.plantDark;
    ctx.beginPath();
    ctx.arc(-6, -p.potHeight - p.leafRadius + 4, p.leafRadius * 0.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(6, -p.potHeight - p.leafRadius + 2, p.leafRadius * 0.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

/**
 * Draw a rug/carpet area
 */
export function drawRug(ctx, x, y, w, h, colorIndex = 0) {
    const rugColors = [
        { base: '#e8e4dc', accent: '#d4cfc5' },
        { base: '#d4e0c8', accent: '#c0d4b0' },
        { base: '#dfe8f0', accent: '#c8d8e8' }
    ];
    const color = rugColors[colorIndex % rugColors.length];

    ctx.save();

    ctx.shadowColor = 'rgba(0,0,0,0.08)';
    ctx.shadowBlur = 8;

    // Rug base
    ctx.fillStyle = color.base;
    ctx.beginPath();
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 8);
    ctx.fill();

    // Border
    ctx.strokeStyle = color.accent;
    ctx.lineWidth = 6;
    ctx.beginPath();
    roundRect(ctx, x - w / 2 + 10, y - h / 2 + 10, w - 20, h - 20, 4);
    ctx.stroke();

    ctx.restore();
}

/**
 * Draw a zone label as a sign board
 */
export function drawZoneLabel(ctx, text, x, y) {
    ctx.save();

    ctx.font = '500 13px Inter, system-ui, sans-serif';
    const metrics = ctx.measureText(text);
    const padding = 10;
    const width = metrics.width + padding * 2;
    const height = 24;

    const labelX = x - width / 2;
    const labelY = y - height / 2;

    // Shadow
    ctx.shadowColor = colors.signShadow;
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;

    // Background
    ctx.fillStyle = colors.signBg;
    ctx.beginPath();
    roundRect(ctx, labelX, labelY, width, height, 6);
    ctx.fill();

    ctx.shadowColor = 'transparent';

    // Border
    ctx.strokeStyle = colors.signBorder;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Text
    ctx.fillStyle = colors.signText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);

    ctx.restore();
}

/**
 * Draw click marker with nice animation feel
 */
export function drawClickMarker(ctx, x, y, age = 0) {
    const progress = Math.min(age / 500, 1);
    const alpha = 1 - progress * 0.7;
    const scale = 1 + progress * 0.5;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;

    // Outer ring
    ctx.strokeStyle = '#4285f4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.stroke();

    // Inner glow
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 10);
    grad.addColorStop(0, 'rgba(66, 133, 244, 0.3)');
    grad.addColorStop(1, 'rgba(66, 133, 244, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();

    // Center dot
    ctx.fillStyle = '#4285f4';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

/**
 * Draw shelf/bookcase
 */
export function drawShelf(ctx, x, y, width = 60, height = 24) {
    ctx.save();

    ctx.shadowColor = shadows.furniture.color;
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;

    // Shelf frame
    ctx.fillStyle = colors.deskWoodDark;
    ctx.fillRect(x - width / 2, y - height / 2, width, height);

    ctx.shadowColor = 'transparent';

    // Books (colored rectangles)
    const bookColors = [colors.blue, colors.green, colors.red, colors.yellow, '#9ca3af'];
    const bookWidth = 6;
    let bx = x - width / 2 + 4;

    for (let i = 0; i < 6 && bx < x + width / 2 - 8; i++) {
        const bw = bookWidth + Math.random() * 4;
        ctx.fillStyle = bookColors[i % bookColors.length];
        ctx.fillRect(bx, y - height / 2 + 3, bw, height - 6);
        bx += bw + 2;
    }

    ctx.restore();
}

// Helper: add noise to area
function addNoise(ctx, x, y, w, h, alpha) {
    const imageData = ctx.getImageData(x, y, w, h);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 30;
        data[i] = Math.max(0, Math.min(255, data[i] + noise));
        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
    }

    ctx.putImageData(imageData, x, y);
}

// Helper: draw rounded rectangle
function roundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}
