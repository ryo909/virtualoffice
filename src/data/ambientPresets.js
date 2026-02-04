export const AMBIENT_PRESETS = {
    sakura: {
        id: 'sakura',
        label: '桜',
        types: [
            { kind: 'petal', count: 85, speed: 12, size: [2, 6], alpha: [0.18, 0.55], drift: [-6, 4], flutter: 1.0 }
        ]
    },
    firefly: {
        id: 'firefly',
        label: '蛍',
        types: [
            { kind: 'firefly', count: 55, speed: 9, size: [1, 3], alpha: [0.16, 0.55], blink: 1.2 }
        ]
    },
    momiji: {
        id: 'momiji',
        label: '紅葉',
        types: [
            { kind: 'leaf', count: 65, speed: 12, size: [3, 8], alpha: [0.18, 0.55], drift: [-10, 6], flutter: 0.9 }
        ]
    },
    snow: {
        id: 'snow',
        label: '雪',
        types: [
            { kind: 'snow', count: 110, speed: 10, size: [1, 4], alpha: [0.12, 0.4], drift: [-2, 12], flutter: 0.2 }
        ]
    }
};

export const DEFAULT_AMBIENT_PRESET_ID = 'firefly';
