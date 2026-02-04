const gardenTracks = [];
let gardenTitle = 'Garden BGM';

export function setGardenTracks(next = []) {
    gardenTracks.length = 0;
    if (Array.isArray(next)) {
        gardenTracks.push(...next);
    }
}

export function getGardenTracks() {
    return gardenTracks;
}

export function setGardenTitle(next) {
    if (typeof next === 'string' && next.trim().length) {
        gardenTitle = next.trim();
    }
}

export function getGardenTitle() {
    return gardenTitle;
}
