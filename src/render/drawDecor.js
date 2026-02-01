// drawDecor.js - Draw decorative items (plants, shelves, rugs, etc.)

/**
 * Draw all decor items
 */
export function drawDecorItems(ctx, decorItems) {
    decorItems.forEach(item => {
        const type = item.type.split(':')[0];
        const label = item.type.split(':')[1];

        switch (type) {
            case 'plant_small':
                drawPlantSmall(ctx, item.x, item.y);
                break;
            case 'plant_big':
                drawPlantBig(ctx, item.x, item.y);
                break;
            case 'bookshelf':
                drawBookshelf(ctx, item.x, item.y);
                break;
            case 'poster_board':
                drawPosterBoard(ctx, item.x, item.y);
                break;
            case 'whiteboard':
                drawWhiteboard(ctx, item.x, item.y);
                break;
            case 'water_server':
                drawWaterServer(ctx, item.x, item.y);
                break;
            case 'divider':
                drawDivider(ctx, item.x, item.y);
                break;
            case 'sofa':
                drawSofa(ctx, item.x, item.y);
                break;
            case 'ottoman':
                drawOttoman(ctx, item.x, item.y);
                break;
            case 'small_table':
                drawSmallTable(ctx, item.x, item.y);
                break;
            case 'rug':
                drawLargeRug(ctx, item.x, item.y, item.w || 120, item.h || 80);
                break;
            case 'signboard':
                drawSignboard(ctx, item.x, item.y, label || 'Area');
                break;
            case 'window_strip':
                drawWindowStrip(ctx, item.x, item.y, item.w || 100);
                break;
        }
    });
}

// ========== Plant Drawings ==========

function drawPlantSmall(ctx, x, y) {
    ctx.save();

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath();
    ctx.ellipse(x, y + 10, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pot
    ctx.fillStyle = '#b87333';
    ctx.beginPath();
    ctx.moveTo(x - 6, y + 10);
    ctx.lineTo(x - 5, y);
    ctx.lineTo(x + 5, y);
    ctx.lineTo(x + 6, y + 10);
    ctx.closePath();
    ctx.fill();

    // Pot rim
    ctx.fillStyle = '#a86323';
    ctx.fillRect(x - 7, y - 2, 14, 3);

    // Leaves (cluster of circles)
    ctx.fillStyle = '#48bb78';
    ctx.beginPath();
    ctx.arc(x, y - 8, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#38a169';
    ctx.beginPath();
    ctx.arc(x - 4, y - 5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 4, y - 6, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function drawPlantBig(ctx, x, y) {
    ctx.save();

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.ellipse(x, y + 16, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pot
    ctx.fillStyle = '#c9855a';
    ctx.beginPath();
    ctx.moveTo(x - 10, y + 16);
    ctx.lineTo(x - 8, y);
    ctx.lineTo(x + 8, y);
    ctx.lineTo(x + 10, y + 16);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#b8754a';
    ctx.fillRect(x - 11, y - 3, 22, 4);

    // Trunk
    ctx.fillStyle = '#8b6914';
    ctx.fillRect(x - 2, y - 20, 4, 20);

    // Foliage (larger circles)
    ctx.fillStyle = '#48bb78';
    ctx.beginPath();
    ctx.arc(x, y - 30, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#38a169';
    ctx.beginPath();
    ctx.arc(x - 8, y - 24, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 8, y - 26, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#2f855a';
    ctx.beginPath();
    ctx.arc(x, y - 38, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

// ========== Furniture Drawings ==========

function drawBookshelf(ctx, x, y) {
    ctx.save();

    const w = 50;
    const h = 40;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(x - w / 2 + 3, y + h / 2 - 2, w, 4);

    // Shelf frame
    ctx.fillStyle = '#a8885a';
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 3);
    ctx.fill();

    // Shelves
    ctx.fillStyle = '#c9a86c';
    ctx.fillRect(x - w / 2 + 3, y - h / 2 + 3, w - 6, h / 3 - 2);
    ctx.fillRect(x - w / 2 + 3, y - h / 2 + h / 3 + 2, w - 6, h / 3 - 2);
    ctx.fillRect(x - w / 2 + 3, y + h / 6 + 2, w - 6, h / 3 - 4);

    // Books (colored rectangles)
    const bookColors = ['#4285f4', '#ea4335', '#34a853', '#fbbc04', '#9ca3af'];
    let bx = x - w / 2 + 5;

    for (let row = 0; row < 2; row++) {
        const by = y - h / 2 + 4 + row * (h / 3 + 1);
        bx = x - w / 2 + 5;

        for (let i = 0; i < 5; i++) {
            const bw = 5 + Math.random() * 3;
            const bh = h / 3 - 8;
            ctx.fillStyle = bookColors[i % bookColors.length];
            ctx.fillRect(bx, by, bw, bh);
            bx += bw + 1;
        }
    }

    ctx.restore();
}

function drawPosterBoard(ctx, x, y) {
    ctx.save();

    const w = 40;
    const h = 30;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(x - w / 2 + 2, y - h / 2 + 2, w, h);

    // Cork board
    ctx.fillStyle = '#d4a86c';
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 2);
    ctx.fill();

    // Frame
    ctx.strokeStyle = '#8b6914';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Papers/notes
    const noteColors = ['#fef3c7', '#dbeafe', '#dcfce7', '#fce7f3'];
    const notePositions = [
        { x: -12, y: -8, r: -5 },
        { x: 5, y: -6, r: 3 },
        { x: -8, y: 5, r: -2 },
        { x: 8, y: 4, r: 8 }
    ];

    notePositions.forEach((pos, i) => {
        ctx.save();
        ctx.translate(x + pos.x, y + pos.y);
        ctx.rotate(pos.r * Math.PI / 180);
        ctx.fillStyle = noteColors[i];
        ctx.fillRect(-6, -5, 12, 10);
        ctx.restore();
    });

    ctx.restore();
}

function drawWhiteboard(ctx, x, y) {
    ctx.save();

    const w = 60;
    const h = 40;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(x - w / 2 + 2, y - h / 2 + 2, w, h);

    // Frame
    ctx.fillStyle = '#9ca3af';
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 3);
    ctx.fill();

    // White surface
    ctx.fillStyle = '#f9fafb';
    ctx.fillRect(x - w / 2 + 4, y - h / 2 + 4, w - 8, h - 8);

    // Some content lines
    ctx.strokeStyle = '#4285f4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + 10, y - 8);
    ctx.lineTo(x + w / 2 - 20, y - 8);
    ctx.stroke();

    ctx.strokeStyle = '#ea4335';
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + 10, y);
    ctx.lineTo(x + w / 2 - 25, y);
    ctx.stroke();

    ctx.strokeStyle = '#34a853';
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + 10, y + 8);
    ctx.lineTo(x + w / 2 - 30, y + 8);
    ctx.stroke();

    ctx.restore();
}

function drawWaterServer(ctx, x, y) {
    ctx.save();

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath();
    ctx.ellipse(x, y + 18, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Base
    ctx.fillStyle = '#e5e7eb';
    roundRect(ctx, x - 10, y, 20, 18, 3);
    ctx.fill();

    // Water bottle
    ctx.fillStyle = '#93c5fd';
    ctx.beginPath();
    ctx.ellipse(x, y - 10, 8, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bottle neck
    ctx.fillStyle = '#60a5fa';
    ctx.fillRect(x - 4, y - 22, 8, 6);

    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(x - 2, y - 18, 3, 16);

    ctx.restore();
}

function drawDivider(ctx, x, y) {
    ctx.save();

    const w = 4;
    const h = 50;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(x - w / 2 + 2, y - h / 2 + 2, w, h);

    // Panel
    ctx.fillStyle = '#d1d5db';
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 1);
    ctx.fill();

    // Accent line
    ctx.fillStyle = '#9ca3af';
    ctx.fillRect(x - 0.5, y - h / 2 + 4, 1, h - 8);

    ctx.restore();
}

function drawSofa(ctx, x, y) {
    ctx.save();

    const w = 60;
    const h = 30;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.ellipse(x, y + h / 2 + 4, w / 2 - 4, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Base
    ctx.fillStyle = '#6b7280';
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 6);
    ctx.fill();

    // Cushions
    ctx.fillStyle = '#9ca3af';
    roundRect(ctx, x - w / 2 + 4, y - h / 2 + 4, w / 2 - 6, h - 10, 4);
    ctx.fill();
    roundRect(ctx, x + 2, y - h / 2 + 4, w / 2 - 6, h - 10, 4);
    ctx.fill();

    // Armrests
    ctx.fillStyle = '#6b7280';
    roundRect(ctx, x - w / 2, y - h / 2 + 2, 6, h - 4, 3);
    ctx.fill();
    roundRect(ctx, x + w / 2 - 6, y - h / 2 + 2, 6, h - 4, 3);
    ctx.fill();

    // Pillows
    ctx.fillStyle = '#fcd34d';
    ctx.beginPath();
    ctx.arc(x - 15, y - 2, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#60a5fa';
    ctx.beginPath();
    ctx.arc(x + 15, y - 2, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function drawOttoman(ctx, x, y) {
    ctx.save();

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath();
    ctx.ellipse(x, y + 10, 14, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = '#9ca3af';
    roundRect(ctx, x - 14, y - 6, 28, 16, 6);
    ctx.fill();

    // Top cushion
    ctx.fillStyle = '#b4bcc8';
    roundRect(ctx, x - 12, y - 8, 24, 10, 4);
    ctx.fill();

    ctx.restore();
}

function drawSmallTable(ctx, x, y) {
    ctx.save();

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath();
    ctx.ellipse(x, y + 8, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Table top
    ctx.fillStyle = '#d4a86c';
    ctx.beginPath();
    ctx.ellipse(x, y - 4, 18, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#c49858';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Items on table
    ctx.fillStyle = '#f9fafb';
    ctx.beginPath();
    ctx.arc(x - 4, y - 6, 4, 0, Math.PI * 2);
    ctx.fill(); // Cup

    ctx.fillStyle = '#48bb78';
    ctx.beginPath();
    ctx.arc(x + 6, y - 4, 3, 0, Math.PI * 2);
    ctx.fill(); // Small plant

    ctx.restore();
}

function drawLargeRug(ctx, x, y, w, h) {
    ctx.save();

    // Shadow (subtle)
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    roundRect(ctx, x - w / 2 + 3, y - h / 2 + 3, w, h, 8);
    ctx.fill();

    // Main rug
    ctx.fillStyle = '#e8e4dc';
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 8);
    ctx.fill();

    // Border
    ctx.strokeStyle = '#d4cfc5';
    ctx.lineWidth = 6;
    roundRect(ctx, x - w / 2 + 12, y - h / 2 + 12, w - 24, h - 24, 4);
    ctx.stroke();

    // Inner pattern (subtle)
    ctx.strokeStyle = '#dcd8d0';
    ctx.lineWidth = 2;
    roundRect(ctx, x - w / 2 + 24, y - h / 2 + 24, w - 48, h - 48, 2);
    ctx.stroke();

    ctx.restore();
}

function drawSignboard(ctx, x, y, label) {
    ctx.save();

    ctx.font = '500 12px Inter, system-ui, sans-serif';
    const metrics = ctx.measureText(label);
    const padding = 12;
    const w = metrics.width + padding * 2;
    const h = 22;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    roundRect(ctx, x - w / 2 + 2, y - h / 2 + 2, w, h, 4);
    ctx.fill();

    // Background
    ctx.fillStyle = '#f8fafc';
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 4);
    ctx.fill();

    // Border
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Mounting dots
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(x - w / 2 + 5, y, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + w / 2 - 5, y, 2, 0, Math.PI * 2);
    ctx.fill();

    // Text
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y);

    ctx.restore();
}

function drawWindowStrip(ctx, x, y, width) {
    ctx.save();

    const h = 12;
    const panelCount = Math.floor(width / 40);
    const panelW = (width - (panelCount + 1) * 4) / panelCount;

    // Frame
    ctx.fillStyle = '#6b7c98';
    ctx.fillRect(x - width / 2, y, width, h);

    // Glass panels
    for (let i = 0; i < panelCount; i++) {
        const px = x - width / 2 + 4 + i * (panelW + 4);

        // Glass
        ctx.fillStyle = '#b8d4e8';
        ctx.fillRect(px, y + 2, panelW, h - 4);

        // Reflection
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(px + 2, y + 3, panelW / 3, h - 6);
    }

    ctx.restore();
}

// Helper
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
