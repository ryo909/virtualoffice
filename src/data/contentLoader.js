// contentLoader.js - Load gallery and news data
// Delegates to contentRepo.js for unified data access

import { getGallery as getGalleryFromRepo, getNews as getNewsFromRepo } from '../services/contentRepo.js';

let galleryData = null;
let newsData = null;

/**
 * Load gallery data (from contentRepo)
 */
export async function loadGallery() {
    try {
        const result = await getGalleryFromRepo();
        galleryData = {
            version: 1,
            items: result.items
        };
        console.log('[ContentLoader] Gallery loaded:', { source: result.source, count: result.items.length });
        return galleryData;
    } catch (e) {
        console.error('[ContentLoader] Failed to load gallery:', e);
        galleryData = { version: 1, items: [] };
        return galleryData;
    }
}

/**
 * Load news data (from contentRepo)
 */
export async function loadNews() {
    try {
        const result = await getNewsFromRepo();
        newsData = {
            version: 1,
            items: result.items
        };
        console.log('[ContentLoader] News loaded:', { source: result.source, count: result.items.length });
        return newsData;
    } catch (e) {
        console.error('[ContentLoader] Failed to load news:', e);
        newsData = { version: 1, items: [] };
        return newsData;
    }
}

/**
 * Get current gallery data (must call loadGallery first)
 */
export function getGallery() {
    return galleryData;
}

/**
 * Get current news data (must call loadNews first)
 */
export function getNews() {
    return newsData;
}

/**
 * Export all data as JSON string
 */
export function exportData() {
    return JSON.stringify({
        gallery: galleryData,
        news: newsData,
        exportedAt: new Date().toISOString()
    }, null, 2);
}
