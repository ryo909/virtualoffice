// debugHud.js - Debug overlay for development

let hudElement = null;
let state = {
    pos: { x: 0, y: 0 },
    target: null,
    camera: { x: 0, y: 0 },
    dt: 0,
    lastTickMoveAt: 0,
    lastRenderAt: 0,
    lastClickWorld: null,
    isMoving: false
};

export function initDebugHud() {
    hudElement = document.createElement('div');
    hudElement.id = 'debug-hud';
    hudElement.style.cssText = `
    position: fixed;
    top: 60px;
    left: 10px;
    background: rgba(0, 0, 0, 0.8);
    color: #0f0;
    font-family: monospace;
    font-size: 11px;
    padding: 8px 12px;
    border-radius: 6px;
    z-index: 9999;
    pointer-events: none;
    line-height: 1.6;
    white-space: pre;
  `;
    document.body.appendChild(hudElement);
}

export function updateDebugHud(newState) {
    Object.assign(state, newState);

    if (!hudElement) return;

    const lines = [
        `pos: (${state.pos.x.toFixed(1)}, ${state.pos.y.toFixed(1)})`,
        `target: ${state.target ? `(${state.target.x.toFixed(1)}, ${state.target.y.toFixed(1)})` : 'null'}`,
        `camera: (${state.camera.x.toFixed(1)}, ${state.camera.y.toFixed(1)})`,
        `dt: ${state.dt.toFixed(1)}ms`,
        `isMoving: ${state.isMoving}`,
        `lastTick: ${(Date.now() - state.lastTickMoveAt)}ms ago`,
        `lastRender: ${(Date.now() - state.lastRenderAt)}ms ago`,
        state.lastClickWorld ? `lastClick: (${state.lastClickWorld.x.toFixed(1)}, ${state.lastClickWorld.y.toFixed(1)})` : 'lastClick: null'
    ];

    hudElement.textContent = lines.join('\n');
}

export function hideDebugHud() {
    if (hudElement) {
        hudElement.remove();
        hudElement = null;
    }
}
