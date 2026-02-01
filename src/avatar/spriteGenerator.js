// spriteGenerator.js - Procedural 16x16 pixel avatar generation

import { generatePalette } from './palette.js';

// Sprite cache
const spriteCache = new Map();

// Direction mappings (8 directions)
const DIRECTIONS = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'];

// Mirror mappings (W/NW/SW mirror from E/NE/SE)
const MIRROR_MAP = {
    'W': 'E',
    'NW': 'NE',
    'SW': 'SE'
};

/**
 * Get direction from dx, dy
 */
export function getDirectionFromDelta(dx, dy) {
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return null;

    const angle = Math.atan2(dy, dx) * 180 / Math.PI;

    // Convert angle to 8 directions
    // E=0, SE=45, S=90, SW=135, W=180, NW=-135, N=-90, NE=-45
    if (angle >= -22.5 && angle < 22.5) return 'E';
    if (angle >= 22.5 && angle < 67.5) return 'SE';
    if (angle >= 67.5 && angle < 112.5) return 'S';
    if (angle >= 112.5 && angle < 157.5) return 'SW';
    if (angle >= 157.5 || angle < -157.5) return 'W';
    if (angle >= -157.5 && angle < -112.5) return 'NW';
    if (angle >= -112.5 && angle < -67.5) return 'N';
    if (angle >= -67.5 && angle < -22.5) return 'NE';

    return 'S';
}

/**
 * Get sprite frame for an entity
 */
export function getSpriteFrame(identifier, direction, frame, isMoving) {
    const actualDir = direction || 'S';
    const actualFrame = isMoving ? (frame % 3) : 1; // idle = frame 1

    const cacheKey = `${identifier}:${actualDir}:${actualFrame}`;

    if (spriteCache.has(cacheKey)) {
        return spriteCache.get(cacheKey);
    }

    // Check if we need to mirror
    const mirrorSource = MIRROR_MAP[actualDir];

    let canvas;
    if (mirrorSource) {
        // Generate source direction then mirror
        const sourceCanvas = generateSpriteFrame(identifier, mirrorSource, actualFrame);
        canvas = mirrorCanvas(sourceCanvas);
    } else {
        canvas = generateSpriteFrame(identifier, actualDir, actualFrame);
    }

    spriteCache.set(cacheKey, canvas);
    return canvas;
}

/**
 * Generate a single sprite frame (16x16)
 */
function generateSpriteFrame(identifier, direction, frame) {
    const size = 16;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.imageSmoothingEnabled = false;

    const palette = generatePalette(identifier);

    // Draw layers
    drawShadow(ctx, size);
    drawBody(ctx, direction, frame, palette, size);
    drawHead(ctx, direction, palette, size);

    if (palette.accessory !== 'none') {
        drawAccessory(ctx, direction, palette.accessory, size);
    }

    // Apply outline post-process
    applyOutline(ctx, palette.outline, size);

    return canvas;
}

/**
 * Draw shadow (ellipse at feet)
 */
function drawShadow(ctx, size) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(size / 2, size - 2, 4, 2, 0, 0, Math.PI * 2);
    ctx.fill();
}

/**
 * Draw body (torso + arms + legs)
 */
function drawBody(ctx, direction, frame, palette, size) {
    const centerX = size / 2;

    // Leg positions based on frame
    const legOffset = frame === 0 ? -1 : (frame === 2 ? 1 : 0);

    // Draw legs
    ctx.fillStyle = palette.pants;

    // Left leg
    ctx.fillRect(centerX - 3, size - 6, 2, 4);
    // Right leg
    ctx.fillRect(centerX + 1, size - 6, 2, 4);

    // Walk animation - shift legs
    if (frame !== 1) {
        ctx.fillStyle = palette.pantsDark;
        if (frame === 0) {
            ctx.fillRect(centerX - 3, size - 5, 2, 3);
        } else {
            ctx.fillRect(centerX + 1, size - 5, 2, 3);
        }
    }

    // Shoes
    ctx.fillStyle = palette.shoes;
    ctx.fillRect(centerX - 3, size - 3, 2, 2);
    ctx.fillRect(centerX + 1, size - 3, 2, 2);

    // Torso
    ctx.fillStyle = palette.shirt;
    ctx.fillRect(centerX - 3, size - 10, 6, 5);

    // Shirt shading
    ctx.fillStyle = palette.shirtDark;
    ctx.fillRect(centerX + 2, size - 10, 1, 4);

    // Arms
    const armSwing = frame === 0 ? 1 : (frame === 2 ? -1 : 0);

    ctx.fillStyle = palette.shirt;
    // Left arm
    ctx.fillRect(centerX - 4, size - 9 + armSwing, 1, 3);
    // Right arm  
    ctx.fillRect(centerX + 3, size - 9 - armSwing, 1, 3);

    // Hands
    ctx.fillStyle = palette.skin;
    ctx.fillRect(centerX - 4, size - 7 + armSwing, 1, 1);
    ctx.fillRect(centerX + 3, size - 7 - armSwing, 1, 1);
}

/**
 * Draw head
 */
function drawHead(ctx, direction, palette, size) {
    const centerX = size / 2;
    const headY = 3;

    // Head base (skin)
    ctx.fillStyle = palette.skin;
    ctx.fillRect(centerX - 3, headY, 6, 5);
    ctx.fillRect(centerX - 2, headY - 1, 4, 1); // top curve
    ctx.fillRect(centerX - 2, headY + 5, 4, 1); // chin

    // Hair
    ctx.fillStyle = palette.hair;

    // Top hair
    ctx.fillRect(centerX - 3, headY - 1, 6, 2);
    ctx.fillRect(centerX - 2, headY - 2, 4, 1);

    // Side hair based on direction
    if (direction === 'S' || direction === 'SE' || direction === 'SW') {
        ctx.fillRect(centerX - 3, headY, 1, 2);
        ctx.fillRect(centerX + 2, headY, 1, 2);
    } else if (direction === 'E') {
        ctx.fillRect(centerX - 3, headY, 1, 3);
    } else if (direction === 'N' || direction === 'NE' || direction === 'NW') {
        ctx.fillRect(centerX - 3, headY, 6, 3);
    }

    // Hair shadow
    ctx.fillStyle = palette.hairDark;
    ctx.fillRect(centerX - 1, headY + 1, 2, 1);

    // Face details (only for front-facing)
    if (direction === 'S' || direction === 'SE' || direction === 'SW') {
        // Eyes
        ctx.fillStyle = '#2d2d2d';
        ctx.fillRect(centerX - 2, headY + 2, 1, 1);
        ctx.fillRect(centerX + 1, headY + 2, 1, 1);

        // Eye whites (optional for detail)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(centerX - 2, headY + 2, 1, 1);
        ctx.fillRect(centerX + 1, headY + 2, 1, 1);
        ctx.fillStyle = '#2d2d2d';
        ctx.fillRect(centerX - 2, headY + 2, 1, 1);
        ctx.fillRect(centerX + 1, headY + 2, 1, 1);
    } else if (direction === 'E' || direction === 'NE') {
        // Side view - one eye
        ctx.fillStyle = '#2d2d2d';
        ctx.fillRect(centerX + 1, headY + 2, 1, 1);
    }
}

/**
 * Draw accessory
 */
function drawAccessory(ctx, direction, accessory, size) {
    const centerX = size / 2;

    if (accessory === 'glasses') {
        if (direction === 'S' || direction === 'SE' || direction === 'SW') {
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(centerX - 3, 5, 6, 1);
            ctx.fillRect(centerX - 3, 5, 2, 2);
            ctx.fillRect(centerX + 1, 5, 2, 2);
        }
    } else if (accessory === 'headphones') {
        ctx.fillStyle = '#2d2d2d';
        ctx.fillRect(centerX - 4, 2, 1, 4);
        ctx.fillRect(centerX + 3, 2, 1, 4);
        ctx.fillRect(centerX - 3, 1, 6, 1);
    }
}

/**
 * Apply outline to non-transparent pixels
 */
function applyOutline(ctx, outlineColor, size) {
    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    const outline = [];

    // Find outline pixels
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            const alpha = data[i + 3];

            if (alpha > 0) {
                // Check 4 neighbors for transparency
                const neighbors = [
                    [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]
                ];

                for (const [nx, ny] of neighbors) {
                    if (nx < 0 || nx >= size || ny < 0 || ny >= size) {
                        outline.push([nx, ny]);
                    } else {
                        const ni = (ny * size + nx) * 4;
                        if (data[ni + 3] === 0) {
                            outline.push([nx, ny]);
                        }
                    }
                }
            }
        }
    }

    // Draw outline pixels
    ctx.fillStyle = outlineColor;
    outline.forEach(([x, y]) => {
        if (x >= 0 && x < size && y >= 0 && y < size) {
            ctx.fillRect(x, y, 1, 1);
        }
    });
}

/**
 * Mirror a canvas horizontally
 */
function mirrorCanvas(source) {
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d');

    ctx.imageSmoothingEnabled = false;
    ctx.translate(source.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(source, 0, 0);

    return canvas;
}

/**
 * Clear sprite cache (for memory management)
 */
export function clearSpriteCache() {
    spriteCache.clear();
}
