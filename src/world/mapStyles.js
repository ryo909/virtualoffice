// mapStyles.js - Visual style definitions for map rendering

// Floor materials with patterns
export const floorStyles = {
    global: {
        baseColor: '#f5f0e8',
        noiseAlpha: 0.03,
        gradientTop: '#faf7f2',
        gradientBottom: '#ebe5d9'
    },

    tile: {
        baseColor: '#e8e4dc',
        tileSize: 32,
        groutColor: '#d4cfc5',
        groutWidth: 1
    },

    carpet: {
        baseColor: '#c5d4e8',
        patternColor: '#b8c9de',
        patternType: 'weave'
    },

    lounge_rug: {
        baseColor: '#dfe8d4',
        accentColors: ['#e8dfc4', '#d4e0c8'],
        borderColor: '#c8d4b8',
        borderWidth: 8
    },

    wood: {
        baseColor: '#d4c4a8',
        grainColor: '#c8b898',
        grainSpacing: 12
    }
};

// Zone style mappings
export const zoneFloorMap = {
    'area:lobby': 'tile',
    'area:meeting': 'tile',
    'area:desks': 'carpet',
    'area:expansion_left': 'lounge_rug',
    'area:expansion_right': 'lounge_rug'
};

// Colors palette (Google-inspired, muted)
export const colors = {
    // Primary accents
    blue: '#4285f4',
    green: '#34a853',
    yellow: '#fbbc04',
    red: '#ea4335',

    // Chair colors (softer versions)
    chairBlue: '#6aa8f7',
    chairGreen: '#5cb877',
    chairYellow: '#fdd663',
    chairRed: '#f07368',

    // Desktop/furniture
    deskWood: '#c9a86c',
    deskWoodDark: '#a8885a',
    monitor: '#2d3748',
    monitorScreen: '#63b3ed',

    // Walls and borders
    wallDark: '#8b9dc3',
    wallLight: '#bfc9dd',
    wallShadow: 'rgba(0,0,0,0.12)',

    // Plants
    plantDark: '#2d7a4f',
    plantLight: '#48bb78',
    pot: '#b87333',

    // Sign/labels
    signBg: 'rgba(255,255,255,0.92)',
    signBorder: '#d1d5db',
    signText: '#374151',
    signShadow: 'rgba(0,0,0,0.08)'
};

// Shadow settings
export const shadows = {
    zone: {
        blur: 12,
        offset: 4,
        color: 'rgba(0,0,0,0.1)'
    },
    furniture: {
        blur: 6,
        offset: 2,
        color: 'rgba(0,0,0,0.15)'
    },
    avatar: {
        blur: 4,
        offset: 1,
        color: 'rgba(0,0,0,0.2)'
    }
};

// Border settings
export const borders = {
    zone: {
        width: 6,
        radius: 12,
        outerColor: '#9ca3af',
        innerColor: '#e5e7eb'
    },
    room: {
        width: 4,
        radius: 8,
        outerColor: '#a1a1aa',
        innerColor: '#f4f4f5'
    }
};

// Furniture dimensions
export const furniture = {
    desk: {
        width: 70,
        height: 36,
        cornerRadius: 4
    },
    chair: {
        radius: 10,
        offset: 22
    },
    monitor: {
        width: 28,
        height: 20,
        screenPadding: 3
    },
    meetingTable: {
        cornerRadius: 8
    },
    plant: {
        potWidth: 16,
        potHeight: 14,
        leafRadius: 12
    }
};

// Decor items positions relative to zones
export const decorPlacements = {
    'area:lobby': [
        { type: 'plant', x: 0.05, y: 0.1 },
        { type: 'plant', x: 0.95, y: 0.1 },
        { type: 'plant', x: 0.05, y: 0.9 },
        { type: 'shelf', x: 0.5, y: 0.05 }
    ],
    'area:meeting': [
        { type: 'plant', x: 0.02, y: 0.1 },
        { type: 'plant', x: 0.98, y: 0.1 },
        { type: 'whiteboard', x: 0.5, y: 0.03 }
    ],
    'area:desks': [
        { type: 'plant', x: 0.02, y: 0.02 },
        { type: 'plant', x: 0.98, y: 0.02 },
        { type: 'plant', x: 0.02, y: 0.98 },
        { type: 'plant', x: 0.98, y: 0.98 }
    ],
    'area:expansion_left': [
        { type: 'rug', x: 0.5, y: 0.5, w: 0.6, h: 0.4 },
        { type: 'plant', x: 0.1, y: 0.1 },
        { type: 'shelf', x: 0.9, y: 0.1 }
    ],
    'area:expansion_right': [
        { type: 'rug', x: 0.5, y: 0.5, w: 0.7, h: 0.5 },
        { type: 'plant', x: 0.1, y: 0.1 },
        { type: 'plant', x: 0.9, y: 0.9 },
        { type: 'sofa', x: 0.2, y: 0.3 }
    ]
};
