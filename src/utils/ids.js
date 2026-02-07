// ids.js - ID generation utilities

function randomHexBlock() {
    return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
}

function generateUuidLike() {
    const c = globalThis?.crypto;

    if (c && typeof c.randomUUID === 'function') {
        try {
            return c.randomUUID();
        } catch {
            // Continue to fallback.
        }
    }

    if (c && typeof c.getRandomValues === 'function') {
        const bytes = new Uint8Array(16);
        c.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const h = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
        return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    }

    return `${randomHexBlock()}-${randomHexBlock().slice(0, 4)}-${randomHexBlock().slice(0, 4)}-${randomHexBlock().slice(0, 4)}-${randomHexBlock()}${randomHexBlock()}`;
}

export function generateSessionId() {
    return `sess_${generateUuidLike()}`;
}

export function generateUuid() {
    return generateUuidLike();
}

export function generateCallId() {
    return `call_${generateUuidLike()}`;
}

export function generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Normalize DM channel ID by sorting actor IDs
export function normalizeDmChannel(actorA, actorB) {
    const sorted = [actorA, actorB].sort();
    return `chat:dm:${sorted[0]}:${sorted[1]}`;
}
