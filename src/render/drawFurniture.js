// drawFurniture.js - Detailed furniture rendering (desks, meeting tables)

// Chair colors (Google-inspired, muted)
const CHAIR_COLORS = ['#5a9bd4', '#6ab077', '#e6a644', '#d46a6a'];

// Desk colors
const DESK = {
    top: '#c9a86c',
    topDark: '#b89858',
    shadow: 'rgba(0,0,0,0.18)'
};

// Monitor
const MONITOR = {
    frame: '#2d3436',
    screen: '#74b9ff',
    screenDark: '#0984e3',
    stand: '#636e72'
};

/**
 * Draw a detailed desk with monitor, chair, and accessories
 */
export function drawDeskDetailed(ctx, x, y, deskIndex, isOccupied = false) {
    // Desk dimensions
    const deskW = 64;
    const deskH = 32;
    const deskX = x - deskW / 2;
    const deskY = y - deskH / 2 - 8; // Offset up

    ctx.save();

    // === Shadow (short, sharp) ===
    ctx.fillStyle = DESK.shadow;
    roundRect(ctx, deskX + 3, deskY + deskH - 2, deskW, 6, 2);
    ctx.fill();

    // === Desk Top ===
    // Main surface
    ctx.fillStyle = DESK.top;
    roundRect(ctx, deskX, deskY, deskW, deskH, 4);
    ctx.fill();

    // Outline
    ctx.strokeStyle = DESK.topDark;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Wood grain (subtle lines)
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    for (let i = 8; i < deskW; i += 12) {
        ctx.beginPath();
        ctx.moveTo(deskX + i, deskY + 2);
        ctx.lineTo(deskX + i, deskY + deskH - 2);
        ctx.stroke();
    }

    // === Monitor ===
    const monW = 24;
    const monH = 16;
    const monX = x - monW / 2;
    const monY = deskY + 4;

    // Monitor frame
    ctx.fillStyle = MONITOR.frame;
    roundRect(ctx, monX, monY, monW, monH, 2);
    ctx.fill();

    // Screen
    const screenGrad = ctx.createLinearGradient(monX, monY, monX, monY + monH);
    screenGrad.addColorStop(0, isOccupied ? MONITOR.screen : '#555');
    screenGrad.addColorStop(1, isOccupied ? MONITOR.screenDark : '#444');
    ctx.fillStyle = screenGrad;
    ctx.fillRect(monX + 2, monY + 2, monW - 4, monH - 5);

    // Screen reflection
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(monX + 3, monY + 3, monW - 8, 3);

    // Monitor stand
    ctx.fillStyle = MONITOR.stand;
    ctx.fillRect(x - 3, monY + monH, 6, 3);
    ctx.fillRect(x - 5, monY + monH + 2, 10, 2);

    // === Keyboard ===
    ctx.fillStyle = '#555';
    roundRect(ctx, x - 12, deskY + deskH - 10, 24, 6, 1);
    ctx.fill();

    // Keyboard keys (tiny dots)
    ctx.fillStyle = '#777';
    for (let i = 0; i < 5; i++) {
        ctx.fillRect(x - 10 + i * 5, deskY + deskH - 9, 3, 4);
    }

    // === Mug (random side) ===
    const mugSide = (deskIndex % 2 === 0) ? -1 : 1;
    const mugX = x + mugSide * 22;
    const mugY = deskY + 8;

    ctx.fillStyle = ['#d4a574', '#74a4d4', '#74d4a4'][deskIndex % 3];
    ctx.beginPath();
    ctx.arc(mugX, mugY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // === Tiny Plant (low probability) ===
    if (deskIndex % 5 === 0) {
        const plantX = x - mugSide * 20;
        const plantY = deskY + 6;

        // Pot
        ctx.fillStyle = '#b87333';
        ctx.fillRect(plantX - 3, plantY, 6, 5);

        // Leaves
        ctx.fillStyle = '#48bb78';
        ctx.beginPath();
        ctx.arc(plantX, plantY - 2, 4, 0, Math.PI * 2);
        ctx.fill();
    }

    // === Chair ===
    const chairY = y + deskH / 2 + 12;
    const chairColor = CHAIR_COLORS[deskIndex % CHAIR_COLORS.length];

    // Chair shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(x, chairY + 8, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Chair seat
    ctx.fillStyle = chairColor;
    roundRect(ctx, x - 10, chairY, 20, 12, 4);
    ctx.fill();

    // Chair back
    ctx.fillStyle = chairColor;
    roundRect(ctx, x - 8, chairY - 6, 16, 8, 3);
    ctx.fill();

    // Chair outline
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    roundRect(ctx, x - 10, chairY, 20, 12, 4);
    ctx.stroke();

    ctx.restore();
}

/**
 * Draw meeting table with chairs
 */
export function drawMeetingTableDetailed(ctx, bounds, chairCount = 6, hasWhiteboard = true) {
    const { x, y, w, h } = bounds;

    // Table dimensions
    const tableW = Math.min(w * 0.55, 180);
    const tableH = Math.min(h * 0.35, 80);
    const tableX = x + (w - tableW) / 2;
    const tableY = y + (h - tableH) / 2;

    ctx.save();

    // === Table Shadow ===
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    roundRect(ctx, tableX + 4, tableY + tableH - 2, tableW, 8, 4);
    ctx.fill();

    // === Table Surface ===
    ctx.fillStyle = '#c9a86c';
    roundRect(ctx, tableX, tableY, tableW, tableH, 8);
    ctx.fill();

    // Table outline
    ctx.strokeStyle = '#b89858';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Wood grain
    ctx.strokeStyle = 'rgba(0,0,0,0.05)';
    for (let i = 16; i < tableW; i += 20) {
        ctx.beginPath();
        ctx.moveTo(tableX + i, tableY + 4);
        ctx.lineTo(tableX + i, tableY + tableH - 4);
        ctx.stroke();
    }

    // === Chairs around table ===
    const topChairs = Math.ceil(chairCount / 2);
    const bottomChairs = Math.floor(chairCount / 2);

    // Top row
    for (let i = 0; i < topChairs; i++) {
        const cx = tableX + (i + 1) * tableW / (topChairs + 1);
        const cy = tableY - 14;
        drawChair(ctx, cx, cy, CHAIR_COLORS[i % CHAIR_COLORS.length], 'down');
    }

    // Bottom row
    for (let i = 0; i < bottomChairs; i++) {
        const cx = tableX + (i + 1) * tableW / (bottomChairs + 1);
        const cy = tableY + tableH + 14;
        drawChair(ctx, cx, cy, CHAIR_COLORS[(i + topChairs) % CHAIR_COLORS.length], 'up');
    }

    // === Whiteboard (if room has one) ===
    if (hasWhiteboard) {
        const wbW = 60;
        const wbH = 36;
        const wbX = x + w - wbW - 20;
        const wbY = y + 20;

        // Board frame
        ctx.fillStyle = '#e0e0e0';
        roundRect(ctx, wbX, wbY, wbW, wbH, 3);
        ctx.fill();

        // Board surface
        ctx.fillStyle = '#f8f8f8';
        ctx.fillRect(wbX + 3, wbY + 3, wbW - 6, wbH - 6);

        // Some "writing" (colored lines)
        ctx.strokeStyle = '#4285f4';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(wbX + 8, wbY + 10);
        ctx.lineTo(wbX + 40, wbY + 10);
        ctx.stroke();

        ctx.strokeStyle = '#ea4335';
        ctx.beginPath();
        ctx.moveTo(wbX + 8, wbY + 18);
        ctx.lineTo(wbX + 35, wbY + 18);
        ctx.stroke();

        ctx.strokeStyle = '#34a853';
        ctx.beginPath();
        ctx.moveTo(wbX + 8, wbY + 26);
        ctx.lineTo(wbX + 30, wbY + 26);
        ctx.stroke();
    }

    ctx.restore();
}

/**
 * Draw common table (simpler than meeting)
 */
export function drawCommonTable(ctx, bounds) {
    const { x, y, w, h } = bounds;

    const tableW = Math.min(w * 0.6, 160);
    const tableH = Math.min(h * 0.4, 70);
    const tableX = x + (w - tableW) / 2;
    const tableY = y + (h - tableH) / 2;

    ctx.save();

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    roundRect(ctx, tableX + 3, tableY + tableH - 2, tableW, 6, 6);
    ctx.fill();

    // Table (warm wood)
    ctx.fillStyle = '#d4a86c';
    roundRect(ctx, tableX, tableY, tableW, tableH, 10);
    ctx.fill();

    ctx.strokeStyle = '#c49858';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Chairs (4 corners)
    const chairPositions = [
        { x: tableX - 12, y: tableY + tableH / 2, dir: 'right' },
        { x: tableX + tableW + 12, y: tableY + tableH / 2, dir: 'left' },
        { x: tableX + tableW / 3, y: tableY - 12, dir: 'down' },
        { x: tableX + tableW * 2 / 3, y: tableY + tableH + 12, dir: 'up' }
    ];

    chairPositions.forEach((pos, i) => {
        drawChair(ctx, pos.x, pos.y, CHAIR_COLORS[i], pos.dir);
    });

    ctx.restore();
}

/**
 * Draw a single chair
 */
function drawChair(ctx, x, y, color, facing = 'down') {
    ctx.save();

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.ellipse(x, y + 6, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Seat
    ctx.fillStyle = color;
    roundRect(ctx, x - 8, y - 4, 16, 10, 3);
    ctx.fill();

    // Back (position based on facing)
    let backX = x - 6;
    let backY = y - 8;
    let backW = 12;
    let backH = 6;

    if (facing === 'up') {
        backY = y + 4;
    } else if (facing === 'left') {
        backX = x + 4;
        backW = 6;
        backH = 10;
        backY = y - 4;
    } else if (facing === 'right') {
        backX = x - 10;
        backW = 6;
        backH = 10;
        backY = y - 4;
    }

    ctx.fillStyle = color;
    roundRect(ctx, backX, backY, backW, backH, 2);
    ctx.fill();

    // Outline
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

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
