// staticJson.js - Centralized JSON fetching for public data files

import { getBaseUrl } from './baseUrl.js';

/**
 * Fetch news.json from public/data/
 * @returns {Promise<{version: number, items: Array<{id: string, title: string, body: string, date: string}>}>}
 */
export async function fetchNewsJson() {
    const url = `${getBaseUrl()}data/news.json`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch news.json: ${response.status}`);
    }
    return response.json();
}

/**
 * Fetch gallery.json from public/data/
 * @returns {Promise<{version: number, items: Array<{id: string, title: string, url: string, desc: string, tags: string[]}>}>}
 */
export async function fetchGalleryJson() {
    const url = `${getBaseUrl()}data/gallery.json`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch gallery.json: ${response.status}`);
    }
    return response.json();
}
