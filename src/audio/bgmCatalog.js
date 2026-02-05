import { GARDEN_BGM_TRACKS, resolveBgmUrl, DEFAULT_GARDEN_BGM_ID } from '../data/gardenBgmTracks.js';

export const GARDEN_BGM = GARDEN_BGM_TRACKS.map((track) => ({
    id: track.id,
    label: track.title,
    url: resolveBgmUrl(track.file)
}));

export { DEFAULT_GARDEN_BGM_ID };
