// ids.js - ID generation utilities

export function generateSessionId() {
    return `sess_${crypto.randomUUID()}`;
}

export function generateCallId() {
    return `call_${crypto.randomUUID()}`;
}

export function generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Normalize DM channel ID by sorting actor IDs
export function normalizeDmChannel(actorA, actorB) {
    const sorted = [actorA, actorB].sort();
    return `chat:dm:${sorted[0]}:${sorted[1]}`;
}
