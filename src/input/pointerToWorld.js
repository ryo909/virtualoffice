// pointerToWorld.js - Coordinate transformation utility

/**
 * Convert pointer event to world coordinates
 * Properly handles CSS→canvas pixel scaling and camera transformation
 * 
 * @param {PointerEvent|MouseEvent} e - The pointer/mouse event
 * @param {HTMLCanvasElement} canvas - The canvas element
 * @param {{x: number, y: number, zoom: number}} camera - Camera state
 * @returns {{x: number, y: number, px: number, py: number}}
 */
export function pointerToWorld(e, canvas, camera) {
    const rect = canvas.getBoundingClientRect();

    // CSS表示サイズ → canvas内部ピクセルに補正
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    // CSS pixel position relative to canvas
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;

    // Internal canvas pixel position
    const px = cssX * scaleX;
    const py = cssY * scaleY;

    // Canvas center in internal pixels
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // カメラ中心方式（canvas中心がcamera座標）
    // Note: We need to account for DPR in the zoom calculation
    // Since render uses ctx.setTransform(dpr, ...) the effective zoom includes DPR
    const dpr = window.devicePixelRatio || 1;
    const effectiveZoom = camera.zoom * dpr;

    const worldX = (px - centerX) / effectiveZoom + camera.x;
    const worldY = (py - centerY) / effectiveZoom + camera.y;

    return { x: worldX, y: worldY, px, py };
}

/**
 * Simplified version that works with CSS pixels directly
 * Use this when canvasSize is stored in CSS pixels (current implementation)
 * 
 * @param {number} screenX - CSS pixel X relative to canvas
 * @param {number} screenY - CSS pixel Y relative to canvas
 * @param {{w: number, h: number}} canvasSize - Canvas size in CSS pixels
 * @param {{x: number, y: number, zoom: number}} camera - Camera state
 * @returns {{x: number, y: number}}
 */
export function screenToWorldFixed(screenX, screenY, canvasSize, camera) {
    // Screen center in CSS pixels
    const cx = canvasSize.w / 2;
    const cy = canvasSize.h / 2;

    // Convert screen offset from center to world offset
    const wx = (screenX - cx) / camera.zoom + camera.x;
    const wy = (screenY - cy) / camera.zoom + camera.y;

    return { x: wx, y: wy };
}
