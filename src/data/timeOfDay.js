export const TIME_OF_DAY_PRESETS = [
    { id: 'day', label: 'Day', overlay: 'rgba(0,0,0,0)' },
    { id: 'dusk', label: 'Dusk', overlay: 'rgba(255,140,80,0.10)' },
    { id: 'night', label: 'Night', overlay: 'rgba(60,80,140,0.18)' }
];

const ORDER = ['day', 'dusk', 'night'];

export function nextTimeOfDay(curId) {
    const currentIndex = ORDER.indexOf(curId);
    if (currentIndex < 0) return ORDER[0];
    return ORDER[(currentIndex + 1) % ORDER.length];
}

export function getTimePreset(id) {
    return TIME_OF_DAY_PRESETS.find(p => p.id === id) || TIME_OF_DAY_PRESETS[0];
}
