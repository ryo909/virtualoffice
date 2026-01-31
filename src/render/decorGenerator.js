// decorGenerator.js - Auto-generate decor placements for zones

// Decor templates by zone type
const ZONE_DECOR_TEMPLATES = {
    'area:lobby': {
        corners: ['plant_big', 'plant_big'],
        walls: ['poster_board', 'bookshelf'],
        entrance: ['signboard:Lobby'],
        optional: ['water_server']
    },
    'area:meeting': {
        corners: ['plant_big', 'plant_big'],
        walls: ['whiteboard'],
        top: ['window_strip'],
        optional: ['poster_board']
    },
    'area:desks': {
        corners: ['plant_small', 'plant_small', 'plant_small', 'plant_small'],
        walls: ['divider', 'divider'],
        optional: ['water_server', 'plant_small']
    },
    'area:expansion_left': {
        center: ['rug:large'],
        furniture: ['sofa', 'small_table'],
        plants: ['plant_small', 'plant_small', 'plant_big'],
        optional: ['bookshelf']
    },
    'area:expansion_right': {
        center: ['rug:large'],
        furniture: ['sofa', 'ottoman'],
        plants: ['plant_small', 'plant_small', 'plant_big'],
        optional: ['poster_board']
    }
};

/**
 * Generate decor placements for a zone
 */
export function generateDecorForZone(zone) {
    const template = ZONE_DECOR_TEMPLATES[zone.id];
    if (!template) return [];

    const b = zone.bounds;
    const decorItems = [];
    const margin = 24;

    // Corner positions
    const corners = [
        { x: b.x + margin, y: b.y + margin },           // top-left
        { x: b.x + b.w - margin, y: b.y + margin },     // top-right
        { x: b.x + margin, y: b.y + b.h - margin },     // bottom-left
        { x: b.x + b.w - margin, y: b.y + b.h - margin } // bottom-right
    ];

    // Place corner items
    if (template.corners) {
        template.corners.forEach((item, i) => {
            if (i < corners.length) {
                decorItems.push({
                    type: item,
                    x: corners[i].x,
                    y: corners[i].y
                });
            }
        });
    }

    // Wall items (placed along walls)
    if (template.walls) {
        const wallPositions = [
            { x: b.x + b.w * 0.3, y: b.y + margin + 10 },   // top wall
            { x: b.x + b.w * 0.7, y: b.y + margin + 10 },   // top wall right
            { x: b.x + margin + 10, y: b.y + b.h * 0.5 },   // left wall
            { x: b.x + b.w - margin - 10, y: b.y + b.h * 0.5 } // right wall
        ];

        template.walls.forEach((item, i) => {
            if (i < wallPositions.length) {
                decorItems.push({
                    type: item,
                    x: wallPositions[i].x,
                    y: wallPositions[i].y
                });
            }
        });
    }

    // Entrance signboard
    if (template.entrance) {
        decorItems.push({
            type: template.entrance[0],
            x: b.x + b.w / 2,
            y: b.y + b.h - margin - 5
        });
    }

    // Center items (rugs, etc)
    if (template.center) {
        template.center.forEach(item => {
            decorItems.push({
                type: item,
                x: b.x + b.w / 2,
                y: b.y + b.h / 2,
                w: b.w * 0.5,
                h: b.h * 0.4
            });
        });
    }

    // Furniture items
    if (template.furniture) {
        const furniturePositions = [
            { x: b.x + b.w * 0.25, y: b.y + b.h * 0.4 },
            { x: b.x + b.w * 0.75, y: b.y + b.h * 0.6 },
            { x: b.x + b.w * 0.5, y: b.y + b.h * 0.7 }
        ];

        template.furniture.forEach((item, i) => {
            if (i < furniturePositions.length) {
                decorItems.push({
                    type: item,
                    x: furniturePositions[i].x,
                    y: furniturePositions[i].y
                });
            }
        });
    }

    // Scattered plants
    if (template.plants) {
        const plantPositions = [
            { x: b.x + b.w * 0.15, y: b.y + b.h * 0.3 },
            { x: b.x + b.w * 0.85, y: b.y + b.h * 0.7 },
            { x: b.x + b.w * 0.5, y: b.y + b.h * 0.2 }
        ];

        template.plants.forEach((item, i) => {
            if (i < plantPositions.length) {
                decorItems.push({
                    type: item,
                    x: plantPositions[i].x,
                    y: plantPositions[i].y
                });
            }
        });
    }

    // Optional items (random subset)
    if (template.optional) {
        const optionalPositions = [
            { x: b.x + b.w * 0.2, y: b.y + b.h * 0.5 },
            { x: b.x + b.w * 0.8, y: b.y + b.h * 0.3 }
        ];

        template.optional.forEach((item, i) => {
            // 60% chance to place optional items
            if (Math.random() > 0.4 && i < optionalPositions.length) {
                decorItems.push({
                    type: item,
                    x: optionalPositions[i].x,
                    y: optionalPositions[i].y
                });
            }
        });
    }

    // Top items (window strips)
    if (template.top) {
        template.top.forEach(item => {
            decorItems.push({
                type: item,
                x: b.x + b.w / 2,
                y: b.y + 8,
                w: b.w * 0.6
            });
        });
    }

    return decorItems;
}

/**
 * Generate all decor for all zones
 */
export function generateAllDecor(zones) {
    const allDecor = [];

    zones.forEach(zone => {
        const decorItems = generateDecorForZone(zone);
        decorItems.forEach(item => {
            item.zoneId = zone.id;
        });
        allDecor.push(...decorItems);
    });

    return allDecor;
}
