// contentLoader.js - Load gallery and news data with localStorage override

const GALLERY_OVERRIDE_KEY = 'virtualoffice_gallery_override';
const NEWS_OVERRIDE_KEY = 'virtualoffice_news_override';

let galleryData = null;
let newsData = null;

/**
 * Load gallery data (fetch + localStorage override)
 */
export async function loadGallery() {
    // Check localStorage override first
    const override = localStorage.getItem(GALLERY_OVERRIDE_KEY);
    if (override) {
        try {
            const parsed = JSON.parse(override);
            galleryData = parsed;
            console.log('[ContentLoader] Loaded gallery from localStorage override');
            return galleryData;
        } catch (e) {
            console.warn('[ContentLoader] Invalid gallery override, using default');
        }
    }

    // Fetch default
    try {
        const response = await fetch('./data/gallery.json');
        galleryData = await response.json();
        console.log('[ContentLoader] Loaded gallery from file:', galleryData.items.length, 'items');
        return galleryData;
    } catch (e) {
        console.error('[ContentLoader] Failed to load gallery:', e);
        galleryData = { version: 1, items: [] };
        return galleryData;
    }
}

/**
 * Load news data (fetch + localStorage override)
 */
export async function loadNews() {
    // Check localStorage override first
    const override = localStorage.getItem(NEWS_OVERRIDE_KEY);
    if (override) {
        try {
            const parsed = JSON.parse(override);
            newsData = parsed;
            console.log('[ContentLoader] Loaded news from localStorage override');
            return newsData;
        } catch (e) {
            console.warn('[ContentLoader] Invalid news override, using default');
        }
    }

    // Fetch default
    try {
        const response = await fetch('./data/news.json');
        newsData = await response.json();
        console.log('[ContentLoader] Loaded news from file:', newsData.items.length, 'items');
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
 * Save gallery override to localStorage
 */
export function saveGalleryOverride(data) {
    localStorage.setItem(GALLERY_OVERRIDE_KEY, JSON.stringify(data));
    galleryData = data;
    console.log('[ContentLoader] Saved gallery override:', data.items.length, 'items');
}

/**
 * Save news override to localStorage
 */
export function saveNewsOverride(data) {
    localStorage.setItem(NEWS_OVERRIDE_KEY, JSON.stringify(data));
    newsData = data;
    console.log('[ContentLoader] Saved news override:', data.items.length, 'items');
}

/**
 * Clear overrides (revert to default)
 */
export function clearOverrides() {
    localStorage.removeItem(GALLERY_OVERRIDE_KEY);
    localStorage.removeItem(NEWS_OVERRIDE_KEY);
    galleryData = null;
    newsData = null;
    console.log('[ContentLoader] Cleared overrides');
}

/**
 * Check if overrides exist
 */
export function hasOverrides() {
    return !!(localStorage.getItem(GALLERY_OVERRIDE_KEY) || localStorage.getItem(NEWS_OVERRIDE_KEY));
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

/**
 * Import data from JSON string
 */
export function importData(jsonString) {
    try {
        const data = JSON.parse(jsonString);
        if (data.gallery && data.gallery.items) {
            saveGalleryOverride(data.gallery);
        }
        if (data.news && data.news.items) {
            saveNewsOverride(data.news);
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}
