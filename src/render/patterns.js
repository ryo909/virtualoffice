// patterns.js - Floor pattern generators for pixel-style map

/**
 * Generate tile pattern (for Lobby, Meeting)
 */
export function createTilePattern(ctx, size = 32, baseColor = '#e8e4dc', groutColor = '#d8d4cc') {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const c = canvas.getContext('2d');

    // Base tile
    c.fillStyle = baseColor;
    c.fillRect(0, 0, size, size);

    // Grout lines (subtle)
    c.strokeStyle = groutColor;
    c.lineWidth = 1;

    // Vertical grout
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(0, size);
    c.stroke();

    // Horizontal grout
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(size, 0);
    c.stroke();

    // Subtle variation in tile
    c.fillStyle = 'rgba(0,0,0,0.02)';
    c.fillRect(2, 2, size / 2 - 2, size / 2 - 2);
    c.fillRect(size / 2 + 1, size / 2 + 1, size / 2 - 2, size / 2 - 2);

    return ctx.createPattern(canvas, 'repeat');
}

/**
 * Generate carpet pattern (for Desks area)
 */
export function createCarpetPattern(ctx, size = 8, baseColor = '#b8c8d8', weaveColor = '#a8b8c8') {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const c = canvas.getContext('2d');

    // Base
    c.fillStyle = baseColor;
    c.fillRect(0, 0, size, size);

    // Weave pattern (diagonal lines)
    c.strokeStyle = weaveColor;
    c.lineWidth = 1;

    // Diagonal weave
    c.beginPath();
    c.moveTo(0, size);
    c.lineTo(size, 0);
    c.stroke();

    c.beginPath();
    c.moveTo(size / 2, size);
    c.lineTo(size, size / 2);
    c.stroke();

    c.beginPath();
    c.moveTo(0, size / 2);
    c.lineTo(size / 2, 0);
    c.stroke();

    return ctx.createPattern(canvas, 'repeat');
}

/**
 * Generate rug pattern (for Lounge, Quiet)
 */
export function createRugPattern(ctx, size = 16, baseColor = '#d4e0c8', borderColor = '#c4d4b8') {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const c = canvas.getContext('2d');

    // Base
    c.fillStyle = baseColor;
    c.fillRect(0, 0, size, size);

    // Subtle texture dots
    c.fillStyle = borderColor;
    c.fillRect(0, 0, 2, 2);
    c.fillRect(size / 2, size / 2, 2, 2);

    // Slight color variation
    c.fillStyle = 'rgba(255,255,255,0.05)';
    c.fillRect(2, 2, size / 2 - 2, size / 2 - 2);

    return ctx.createPattern(canvas, 'repeat');
}

/**
 * Generate stone walkway pattern
 */
export function createWalkwayPattern(ctx, size = 24, baseColor = '#d0ccc4', lineColor = '#c0bbb0') {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const c = canvas.getContext('2d');

    // Base stone
    c.fillStyle = baseColor;
    c.fillRect(0, 0, size, size);

    // Stone edges
    c.strokeStyle = lineColor;
    c.lineWidth = 1;
    c.strokeRect(0.5, 0.5, size - 1, size - 1);

    // Inner highlight
    c.fillStyle = 'rgba(255,255,255,0.08)';
    c.fillRect(1, 1, size - 4, 2);

    return ctx.createPattern(canvas, 'repeat');
}

/**
 * Generate grass/plant border pattern
 */
export function createGrassBorderPattern(ctx, size = 16, baseColor = '#a8c090', darkColor = '#90a878') {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const c = canvas.getContext('2d');

    // Base grass
    c.fillStyle = baseColor;
    c.fillRect(0, 0, size, size);

    // Grass blades (simple vertical lines)
    c.strokeStyle = darkColor;
    c.lineWidth = 1;

    for (let i = 0; i < 3; i++) {
        const x = 2 + i * 5 + (i % 2) * 2;
        const h = 4 + (i % 2) * 2;
        c.beginPath();
        c.moveTo(x, size);
        c.lineTo(x, size - h);
        c.stroke();
    }

    return ctx.createPattern(canvas, 'repeat');
}

// Pattern registry
const patternCache = new Map();

export function getPattern(ctx, type) {
    const key = type;
    if (patternCache.has(key)) {
        return patternCache.get(key);
    }

    let pattern;
    switch (type) {
        case 'tile_beige':
            pattern = createTilePattern(ctx, 32, '#e8e4dc', '#dcd8d0');
            break;
        case 'tile_light':
            pattern = createTilePattern(ctx, 32, '#f0ece4', '#e4e0d8');
            break;
        case 'carpet_blue':
            pattern = createCarpetPattern(ctx, 8, '#c5d4e8', '#b5c4d8');
            break;
        case 'carpet_gray':
            pattern = createCarpetPattern(ctx, 8, '#d8d8d8', '#c8c8c8');
            break;
        case 'rug_green':
            pattern = createRugPattern(ctx, 16, '#d4e0c8', '#c4d4b8');
            break;
        case 'rug_warm':
            pattern = createRugPattern(ctx, 16, '#e8dcc8', '#dcd0bc');
            break;
        case 'walkway':
            pattern = createWalkwayPattern(ctx, 24, '#d8d4cc', '#ccc8c0');
            break;
        case 'grass':
            pattern = createGrassBorderPattern(ctx, 16, '#a8c090', '#90a878');
            break;
        default:
            pattern = createTilePattern(ctx, 32, '#e8e4dc', '#dcd8d0');
    }

    patternCache.set(key, pattern);
    return pattern;
}

// Zone to pattern mapping
export const zonePatterns = {
    'area:lobby': 'tile_beige',
    'area:meeting': 'tile_light',
    'area:desks': 'carpet_blue',
    'area:expansion_left': 'rug_green',
    'area:expansion_right': 'rug_warm'
};
