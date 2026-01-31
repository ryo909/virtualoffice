// mapLoader.js - Load and merge map data

let worldModel = null;

/**
 * Load all map data and merge into single world model
 */
export async function loadMaps() {
    const [coreRes, desksRes, expansionRes, spotsRes] = await Promise.all([
        fetch('./data/maps/map_core.json'),
        fetch('./data/maps/map_desks.json'),
        fetch('./data/maps/map_expansion.json'),
        fetch('./data/spots.json')
    ]);

    const core = await coreRes.json();
    const desksData = await desksRes.json();
    const expansion = await expansionRes.json();
    const spotsData = await spotsRes.json();

    // Build world model
    worldModel = {
        meta: core.meta,
        size: core.meta.size,
        spawnPoints: core.spawnPoints,
        walkable: core.walkable || [],
        obstacles: core.obstacles || [],
        zones: core.zones || [],
        decor: [...(core.decor || []), ...(expansion.decor || [])],
        desks: desksData.desks || [],
        deskRules: desksData.deskRules || {},
        rooms: expansion.rooms || [],
        spots: spotsData.spots || []
    };

    // Create lookup maps for quick access
    worldModel.deskById = new Map();
    worldModel.desks.forEach(desk => {
        worldModel.deskById.set(desk.id, desk);
    });

    worldModel.spotById = new Map();
    worldModel.spots.forEach(spot => {
        worldModel.spotById.set(spot.id, spot);
    });

    worldModel.zoneById = new Map();
    worldModel.zones.forEach(zone => {
        worldModel.zoneById.set(zone.id, zone);
    });

    return worldModel;
}

export function getWorldModel() {
    return worldModel;
}

export function getSpawnPoint(name = 'lobby') {
    if (!worldModel) return { x: 260, y: 260 };
    return worldModel.spawnPoints[name] || worldModel.spawnPoints.lobby || { x: 260, y: 260 };
}

export function getDesks() {
    return worldModel?.desks || [];
}

export function getDeskById(id) {
    return worldModel?.deskById.get(id) || null;
}

export function getSpots() {
    return worldModel?.spots || [];
}

export function getSpotById(id) {
    return worldModel?.spotById.get(id) || null;
}

export function getZones() {
    return worldModel?.zones || [];
}
