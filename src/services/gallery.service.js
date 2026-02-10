// gallery.service.js - Gallery data service with Supabase priority and JSON fallback

import { getSupabase } from './supabaseClient.js';
import { fetchGalleryJson } from './staticJson.js';

/**
 * @typedef {Object} GalleryItem
 * @property {string} id
 * @property {string} title
 * @property {string} url
 * @property {string} description
 * @property {string[]} tags
 * @property {number} order
 * @property {boolean} is_active
 */

/**
 * Map Supabase row to UI format
 */
function mapToUi(rows) {
    return rows.map(row => ({
        id: row.id,
        title: row.title,
        url: row.url,
        description: row.description || '',
        tags: row.tags || [],
        order: row.order ?? 0,
        is_active: row.is_active !== false
    }));
}

/**
 * Map JSON items to UI format
 */
function mapJsonToUi(json) {
    return (json.items || []).map((item, index) => ({
        id: item.id,
        title: item.title,
        url: item.url,
        description: item.desc || '',
        tags: item.tags || [],
        order: index,
        is_active: true
    }));
}

/**
 * Get gallery items from Supabase (priority) or JSON fallback
 * @returns {Promise<{source: string, items: GalleryItem[]}>}
 */
export async function getGalleryItems() {
    const supabase = getSupabase();

    // Always try Supabase first
    if (supabase) {
        try {
            const { data, error } = await supabase
                .from('gallery_items')
                .select('id, title, url, description, tags, "order", is_active, created_at')
                .eq('is_active', true)
                .order('order', { ascending: true })
                .limit(200);

            console.log('[GALLERY] supabase', { ok: !error, count: data?.length ?? 0, error: error?.message || null });

            if (!error && data && data.length > 0) {
                return { source: 'db', items: mapToUi(data) };
            }

            // Continue to fallback if empty or error
        } catch (e) {
            console.log('[GALLERY] supabase exception', e?.message || e);
        }
    } else {
        console.log('[GALLERY] supabase client not available');
    }

    // Fallback to JSON
    try {
        const json = await fetchGalleryJson();
        console.log('[GALLERY] fallback json', { count: json.items?.length ?? 0 });
        return { source: 'json', items: mapJsonToUi(json) };
    } catch (e) {
        console.error('[GALLERY] json fallback failed', e?.message || e);
        return { source: 'empty', items: [] };
    }
}

/**
 * Get all gallery items for admin (includes inactive)
 * @returns {Promise<GalleryItem[]>}
 */
export async function getGalleryItemsForAdmin() {
    const supabase = getSupabase();
    if (!supabase) {
        console.warn('[GalleryService] Supabase not available for admin');
        return [];
    }

    const { data, error } = await supabase
        .from('gallery_items')
        .select('id, title, url, description, tags, "order", is_active')
        .order('order', { ascending: true });

    if (error) {
        console.error('[GalleryService] Admin fetch error:', error.message);
        throw error;
    }

    return mapToUi(data || []);
}

/**
 * Create a new gallery item
 * @param {Object} item
 * @returns {Promise<GalleryItem>}
 */
export async function createGalleryItem(item) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase not available');

    // Get max order for new item
    const { data: maxData } = await supabase
        .from('gallery_items')
        .select('order')
        .order('order', { ascending: false })
        .limit(1);

    const maxOrder = maxData?.[0]?.order ?? -1;

    const { data, error } = await supabase
        .from('gallery_items')
        .insert({
            title: item.title,
            url: item.url,
            description: item.description || '',
            tags: item.tags || [],
            order: item.order ?? (maxOrder + 1),
            is_active: item.is_active ?? true
        })
        .select()
        .single();

    if (error) {
        console.error('[GalleryService] Create error:', error.message);
        throw error;
    }

    console.log('[GalleryService] Created:', data.id);
    return data;
}

/**
 * Update a gallery item
 * @param {string} id
 * @param {Object} updates
 * @returns {Promise<GalleryItem>}
 */
export async function updateGalleryItem(id, updates) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase not available');

    const updateData = {};
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.url !== undefined) updateData.url = updates.url;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.tags !== undefined) updateData.tags = updates.tags;
    if (updates.order !== undefined) updateData.order = updates.order;
    if (updates.is_active !== undefined) updateData.is_active = updates.is_active;

    const { data, error } = await supabase
        .from('gallery_items')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('[GalleryService] Update error:', error.message);
        throw error;
    }

    console.log('[GalleryService] Updated:', id);
    return data;
}

/**
 * Delete a gallery item
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteGalleryItem(id) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase not available');

    const { error } = await supabase
        .from('gallery_items')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('[GalleryService] Delete error:', error.message);
        throw error;
    }

    console.log('[GalleryService] Deleted:', id);
}

/**
 * Swap order between two gallery items
 * @param {string} id1
 * @param {string} id2
 * @returns {Promise<void>}
 */
export async function swapGalleryOrder(id1, id2) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase not available');

    // Get current orders
    const { data: items, error: fetchError } = await supabase
        .from('gallery_items')
        .select('id, "order"')
        .in('id', [id1, id2]);

    if (fetchError) throw fetchError;
    if (!items || items.length !== 2) throw new Error('Items not found');

    const item1 = items.find(i => i.id === id1);
    const item2 = items.find(i => i.id === id2);

    // Swap orders
    const { error: updateError } = await supabase
        .from('gallery_items')
        .upsert([
            { id: id1, order: item2.order },
            { id: id2, order: item1.order }
        ]);

    if (updateError) {
        console.error('[GalleryService] Swap error:', updateError.message);
        throw updateError;
    }

    console.log('[GalleryService] Swapped order:', id1, '<->', id2);
}
