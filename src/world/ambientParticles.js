import { AMBIENT_PRESETS, DEFAULT_AMBIENT_PRESET_ID } from '../data/ambientPresets.js';

let getAreaId = null;
let getZoom = null;
let getCanvasSize = null;
let currentPresetId = DEFAULT_AMBIENT_PRESET_ID;
let particles = [];
let disabled = false;

function rand(min, max) {
    return min + Math.random() * (max - min);
}

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

function getPreset(id) {
    return AMBIENT_PRESETS[id] || AMBIENT_PRESETS[DEFAULT_AMBIENT_PRESET_ID];
}

function buildParticles() {
    const preset = getPreset(currentPresetId);
    const size = getCanvasSize ? getCanvasSize() : { w: 0, h: 0 };
    const width = size.w || 1;
    const height = size.h || 1;
    const next = [];

    preset.types.forEach(type => {
        const count = Math.max(0, type.count || 0);
        for (let i = 0; i < count; i += 1) {
            const hue = rand(15, 50);
            const sat = rand(55, 75);
            const light = rand(48, 62);
            next.push({
                kind: type.kind,
                x: Math.random() * width,
                y: Math.random() * height,
                size: rand(type.size?.[0] ?? 2, type.size?.[1] ?? 4),
                alphaBase: rand(type.alpha?.[0] ?? 0.2, type.alpha?.[1] ?? 0.5),
                speed: type.speed ?? 10,
                drift: type.drift || [-4, 4],
                flutter: type.flutter ?? 0,
                blink: type.blink ?? 0,
                phase: Math.random() * Math.PI * 2,
                wiggle: rand(0.6, 1.4),
                rot: rand(-Math.PI, Math.PI),
                rotSpeed: rand(-0.8, 0.8),
                color: { h: hue, s: sat, l: light }
            });
        }
    });

    particles = next;
}

export function initAmbientParticles(config = {}) {
    getAreaId = config.getAreaId || (() => 'area:core');
    getZoom = config.getZoom || (() => 1);
    getCanvasSize = config.getCanvasSize || (() => ({ w: 0, h: 0 }));
}

export function setAmbientPreset(presetId) {
    if (!presetId) return;
    currentPresetId = presetId;
    buildParticles();
}

export function getAmbientPreset() {
    return currentPresetId;
}

export function updateAmbientParticles(dtMs = 16) {
    if (disabled) return;
    if (getAreaId && getAreaId() !== 'area:garden') return;

    try {
        if (!particles.length) buildParticles();
        const size = getCanvasSize ? getCanvasSize() : { w: 0, h: 0 };
        const width = size.w || 1;
        const height = size.h || 1;
        const dt = dtMs / 1000;

        particles.forEach(p => {
            const driftX = rand(p.drift?.[0] ?? -2, p.drift?.[1] ?? 2);
            const fall = (p.speed || 10) * dt;
            p.phase += dt * (p.flutter ? (1 + p.flutter) : 0.5);
            p.x += driftX * dt * 6 + Math.sin(p.phase) * p.flutter * 0.6;
            p.y += fall + Math.cos(p.phase) * p.flutter * 0.4;
            p.rot += (p.rotSpeed || 0) * dt;

            if (p.x < -20) p.x = width + 20;
            if (p.x > width + 20) p.x = -20;
            if (p.y > height + 20) p.y = -20;
            if (p.y < -20) p.y = height + 20;
        });
    } catch (err) {
        disabled = true;
        console.warn('[Ambient] update failed, disabling particles', err);
    }
}

export function renderAmbientParticles(ctx) {
    if (disabled) return;
    if (getAreaId && getAreaId() !== 'area:garden') return;
    if (!ctx) return;

    try {
        const zoom = getZoom ? getZoom() : 1;
        const sizeScale = clamp(1 / (zoom || 1), 0.7, 1.4);

        ctx.save();
        particles.forEach(p => {
            const alphaPulse = p.blink ? (0.2 + 0.8 * Math.sin(p.phase * 2) * 0.5 + 0.5) : 1;
            const alpha = clamp(p.alphaBase * alphaPulse, 0.05, 0.9);
            const size = p.size * sizeScale;
            const outlineAlpha = Math.min(0.25, alpha * 0.6);

            switch (p.kind) {
                case 'petal': {
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.rot + Math.sin(p.phase) * 0.6);
                    ctx.fillStyle = `rgba(255, 192, 203, ${alpha})`;
                    ctx.strokeStyle = `rgba(255, 255, 255, ${outlineAlpha})`;
                    ctx.beginPath();
                    ctx.ellipse(0, 0, size * 0.6, size, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    ctx.restore();
                    break;
                }
                case 'leaf': {
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.rot + Math.cos(p.phase) * 0.8);
                    ctx.fillStyle = `hsla(${p.color?.h ?? 25}, ${p.color?.s ?? 65}%, ${p.color?.l ?? 55}%, ${alpha})`;
                    ctx.strokeStyle = `rgba(0, 0, 0, ${outlineAlpha})`;
                    ctx.beginPath();
                    for (let i = 0; i < 10; i += 1) {
                        const angle = (Math.PI * 2 * i) / 10;
                        const radius = (i % 2 === 0) ? size : size * 0.55;
                        const px = Math.cos(angle) * radius;
                        const py = Math.sin(angle) * radius;
                        if (i === 0) ctx.moveTo(px, py);
                        else ctx.lineTo(px, py);
                    }
                    ctx.closePath();
                    ctx.fill();
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    ctx.restore();
                    break;
                }
                case 'firefly': {
                    ctx.fillStyle = `rgba(190, 255, 140, ${alpha})`;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, size * 0.8, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = `rgba(190, 255, 140, ${alpha * 0.25})`;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, size * 2.2, 0, Math.PI * 2);
                    ctx.fill();
                    break;
                }
                case 'snow':
                default: {
                    ctx.save();
                    ctx.shadowColor = 'rgba(255, 255, 255, 0.35)';
                    ctx.shadowBlur = 3;
                    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, size * 0.7, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                    break;
                }
            }
        });
        ctx.restore();
    } catch (err) {
        disabled = true;
        console.warn('[Ambient] render failed, disabling particles', err);
    }
}
