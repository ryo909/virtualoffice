// news.service.js - News data service with Supabase priority and JSON fallback

import { getSupabase } from './supabaseClient.js';
import { fetchNewsJson } from './staticJson.js';

/**
 * @typedef {Object} NewsItem
 * @property {string} id
 * @property {string} title
 * @property {string} body
 * @property {string} status - 'draft' | 'published'
 * @property {boolean} pinned
 * @property {Date} published_at
 */

/**
 * Map Supabase row to UI format
 */
function mapToUi(rows) {
    return rows.map(row => ({
        id: row.id,
        title: row.title,
        body: row.body,
        status: row.status || 'published',
        pinned: row.pinned || false,
        published_at: new Date(row.published_at || row.created_at)
    }));
}

/**
 * Map JSON items to UI format
 */
function mapJsonToUi(json) {
    return (json.items || []).map(item => ({
        id: item.id,
        title: item.title,
        body: item.body,
        status: 'published',
        pinned: false,
        published_at: new Date(item.date)
    }));
}

/**
 * Get news items from Supabase (priority) or JSON fallback
 * @returns {Promise<{source: string, items: NewsItem[]}>}
 */
export async function getNewsItems() {
    const supabase = getSupabase();

    // Always try Supabase first
    if (supabase) {
        try {
            const { data, error } = await supabase
                .from('news_posts')
                .select('id, title, body, status, pinned, published_at, created_at')
                .eq('status', 'published')
                .order('pinned', { ascending: false })
                .order('published_at', { ascending: false })
                .limit(50);

            console.log('[NEWS] supabase', { ok: !error, count: data?.length ?? 0, error: error?.message || null });

            if (!error && data && data.length > 0) {
                return { source: 'db', items: mapToUi(data) };
            }

            // Continue to fallback if empty or error
        } catch (e) {
            console.log('[NEWS] supabase exception', e?.message || e);
        }
    } else {
        console.log('[NEWS] supabase client not available');
    }

    // Fallback to JSON
    try {
        const json = await fetchNewsJson();
        console.log('[NEWS] fallback json', { count: json.items?.length ?? 0 });
        return { source: 'json', items: mapJsonToUi(json) };
    } catch (e) {
        console.error('[NEWS] json fallback failed', e?.message || e);
        return { source: 'empty', items: [] };
    }
}

/**
 * Get all news items for admin (includes drafts)
 * @returns {Promise<NewsItem[]>}
 */
export async function getNewsItemsForAdmin() {
    const supabase = getSupabase();
    if (!supabase) {
        console.warn('[NewsService] Supabase not available for admin');
        return [];
    }

    const { data, error } = await supabase
        .from('news_posts')
        .select('id, title, body, status, pinned, published_at')
        .order('pinned', { ascending: false })
        .order('published_at', { ascending: false });

    if (error) {
        console.error('[NewsService] Admin fetch error:', error.message);
        throw error;
    }

    return mapToUi(data || []);
}

/**
 * Create a new news item
 * @param {Object} item
 * @returns {Promise<NewsItem>}
 */
export async function createNewsItem(item) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase not available');

    const { data, error } = await supabase
        .from('news_posts')
        .insert({
            title: item.title,
            body: item.body,
            status: item.status || 'draft',
            pinned: item.pinned || false,
            published_at: item.published_at || new Date().toISOString()
        })
        .select()
        .single();

    if (error) {
        console.error('[NewsService] Create error:', error.message);
        throw error;
    }

    console.log('[NewsService] Created:', data.id);
    return { ...data, published_at: new Date(data.published_at) };
}

/**
 * Update a news item
 * @param {string} id
 * @param {Object} updates
 * @returns {Promise<NewsItem>}
 */
export async function updateNewsItem(id, updates) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase not available');

    const { data, error } = await supabase
        .from('news_posts')
        .update({
            title: updates.title,
            body: updates.body,
            status: updates.status,
            pinned: updates.pinned,
            published_at: updates.published_at
        })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('[NewsService] Update error:', error.message);
        throw error;
    }

    console.log('[NewsService] Updated:', id);
    return { ...data, published_at: new Date(data.published_at) };
}

/**
 * Delete a news item
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteNewsItem(id) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase not available');

    const { error } = await supabase
        .from('news_posts')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('[NewsService] Delete error:', error.message);
        throw error;
    }

    console.log('[NewsService] Deleted:', id);
}
