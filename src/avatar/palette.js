// palette.js - Avatar color palette generation from seed

// Color palettes
const SKIN_TONES = ['#fcd5c5', '#f5c4a8', '#e8b090', '#d49a78', '#c48860'];
const HAIR_COLORS = ['#2d1b0e', '#4a3020', '#8b4513', '#d4a86c', '#1a1a1a', '#6b4423'];
const SHIRT_COLORS = ['#5a9bd4', '#6ab077', '#e6a644', '#d46a6a', '#7c7c7c', '#9b59b6'];
const PANTS_COLORS = ['#34495e', '#2c3e50', '#5d6d7e'];
const SHOE_COLORS = ['#2c2c2c', '#4a3020'];

// Accessories (rare)
const ACCESSORIES = ['none', 'none', 'none', 'none', 'glasses', 'headphones'];

/**
 * Simple hash function for seed
 */
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

/**
 * Seeded random number generator
 */
function seededRandom(seed) {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

/**
 * Generate palette from identifier
 */
export function generatePalette(identifier) {
    const seed = hashString(identifier || 'default');

    const skinIndex = Math.floor(seededRandom(seed) * SKIN_TONES.length);
    const hairIndex = Math.floor(seededRandom(seed + 1) * HAIR_COLORS.length);
    const shirtIndex = Math.floor(seededRandom(seed + 2) * SHIRT_COLORS.length);
    const pantsIndex = Math.floor(seededRandom(seed + 3) * PANTS_COLORS.length);
    const shoeIndex = Math.floor(seededRandom(seed + 4) * SHOE_COLORS.length);
    const accessoryIndex = Math.floor(seededRandom(seed + 5) * ACCESSORIES.length);

    return {
        skin: SKIN_TONES[skinIndex],
        skinDark: darkenColor(SKIN_TONES[skinIndex], 20),
        hair: HAIR_COLORS[hairIndex],
        hairDark: darkenColor(HAIR_COLORS[hairIndex], 30),
        shirt: SHIRT_COLORS[shirtIndex],
        shirtDark: darkenColor(SHIRT_COLORS[shirtIndex], 25),
        pants: PANTS_COLORS[pantsIndex],
        pantsDark: darkenColor(PANTS_COLORS[pantsIndex], 20),
        shoes: SHOE_COLORS[shoeIndex],
        accessory: ACCESSORIES[accessoryIndex],
        outline: '#3d3d3d'
    };
}

/**
 * Darken a hex color
 */
function darkenColor(hex, amount) {
    const num = parseInt(hex.slice(1), 16);
    const r = Math.max(0, (num >> 16) - amount);
    const g = Math.max(0, ((num >> 8) & 0x00FF) - amount);
    const b = Math.max(0, (num & 0x0000FF) - amount);
    return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
}
