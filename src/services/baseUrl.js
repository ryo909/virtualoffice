// baseUrl.js - Centralized BASE_URL utility for Vite

/**
 * Get the normalized base URL from Vite config
 * Always returns a trailing slash
 * @returns {string}
 */
export function getBaseUrl() {
    const base = typeof import.meta.env?.BASE_URL === 'string'
        ? import.meta.env.BASE_URL
        : '/';
    return base.replace(/\/?$/, '/');
}
