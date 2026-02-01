// minimap.js - Minimap rendering adapter

import { renderMinimap as renderMinimapImpl } from '../world/mapRenderer.js';

export function renderMinimap(minimapCanvas, playerPos, otherPlayers = []) {
    if (!minimapCanvas) return;
    return renderMinimapImpl(minimapCanvas, playerPos, otherPlayers);
}

export function initMinimap() {
    return null;
}
