// time.js - Time utilities

export function formatTime(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

export function now() {
    return Date.now();
}

export function elapsed(startTime) {
    return Date.now() - startTime;
}
