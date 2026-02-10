// seedFromJson.js - One-time seed from JSON to Supabase for admins

import { getSupabase } from './supabaseClient.js';
import { fetchNewsJson, fetchGalleryJson } from './staticJson.js';

const SEED_DONE_KEY = 'seed:v1:done';

/**
 * Check if current user is a Supabase admin (in app_admin_users table)
 * @returns {Promise<boolean>}
 */
export async function isSupabaseAdmin() {
    const supabase = getSupabase();
    if (!supabase) return false;

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return false;

        const { data, error } = await supabase
            .from('app_admin_users')
            .select('user_id')
            .eq('user_id', user.id)
            .maybeSingle();

        if (error) {
            console.warn('[Seed] Admin check failed:', error.message);
            return false;
        }

        return !!data;
    } catch (err) {
        console.warn('[Seed] Admin check error:', err.message);
        return false;
    }
}

/**
 * Check if seed is needed and run if so
 * Conditions:
 * 1. User logged in
 * 2. User is admin
 * 3. localStorage seed flag not set
 * 4. DB is empty (both tables have 0 rows)
 * @returns {Promise<{seeded: boolean, reason: string}>}
 */
export async function seedIfNeeded() {
    console.log('[SEED] Checking conditions...');

    // Check localStorage flag
    if (localStorage.getItem(SEED_DONE_KEY)) {
        console.log('[SEED] skip (already seeded via localStorage)');
        return { seeded: false, reason: 'already_seeded' };
    }

    const supabase = getSupabase();
    if (!supabase) {
        console.log('[SEED] skip (Supabase not available)');
        return { seeded: false, reason: 'no_supabase' };
    }

    // Check user logged in
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        console.log('[SEED] skip (not logged in)');
        return { seeded: false, reason: 'not_logged_in' };
    }

    // Check admin
    const isAdmin = await isSupabaseAdmin();
    if (!isAdmin) {
        console.log('[SEED] skip (not admin)');
        return { seeded: false, reason: 'not_admin' };
    }

    // Check if DB is empty
    const { count: newsCount } = await supabase
        .from('news_posts')
        .select('*', { count: 'exact', head: true });

    const { count: galleryCount } = await supabase
        .from('gallery_items')
        .select('*', { count: 'exact', head: true });

    if ((newsCount || 0) > 0 || (galleryCount || 0) > 0) {
        console.log('[SEED] skip (DB not empty, news:', newsCount, 'gallery:', galleryCount, ')');
        localStorage.setItem(SEED_DONE_KEY, '1');
        return { seeded: false, reason: 'db_not_empty' };
    }

    // Run seed
    console.log('[SEED] start');

    try {
        await seedGallery(supabase);
        await seedNews(supabase);

        localStorage.setItem(SEED_DONE_KEY, '1');
        console.log('[SEED] done');
        return { seeded: true, reason: 'success' };
    } catch (err) {
        console.error('[SEED] failed:', err.message);
        return { seeded: false, reason: 'error: ' + err.message };
    }
}

/**
 * Seed gallery items from JSON
 * @param {Object} supabase
 */
async function seedGallery(supabase) {
    const json = await fetchGalleryJson();
    const items = json.items || [];

    if (items.length === 0) {
        console.log('[SEED] No gallery items in JSON');
        return;
    }

    // Check existing URLs
    const urls = items.map(i => i.url);
    const { data: existing } = await supabase
        .from('gallery_items')
        .select('url')
        .in('url', urls);

    const existingUrls = new Set((existing || []).map(e => e.url));

    const toInsert = items
        .filter(item => !existingUrls.has(item.url))
        .map((item, index) => ({
            title: item.title,
            url: item.url,
            description: item.desc || '',
            tags: item.tags || [],
            order: index,
            is_active: true
        }));

    if (toInsert.length === 0) {
        console.log('[SEED] All gallery items already exist');
        return;
    }

    const { error } = await supabase
        .from('gallery_items')
        .insert(toInsert);

    if (error) {
        throw new Error('Gallery insert failed: ' + error.message);
    }

    console.log('[SEED] Inserted', toInsert.length, 'gallery items');
}

/**
 * Seed news items from JSON
 * @param {Object} supabase
 */
async function seedNews(supabase) {
    const json = await fetchNewsJson();
    const items = json.items || [];

    if (items.length === 0) {
        console.log('[SEED] No news items in JSON');
        return;
    }

    // Check existing by title + date
    const { data: existing } = await supabase
        .from('news_posts')
        .select('title, published_at');

    const existingSet = new Set(
        (existing || []).map(e => `${e.title}|${e.published_at}`)
    );

    const toInsert = items
        .filter(item => {
            const key = `${item.title}|${item.date}`;
            return !existingSet.has(key);
        })
        .map(item => ({
            title: item.title,
            body: item.body,
            status: 'published',
            pinned: false,
            published_at: item.date
        }));

    if (toInsert.length === 0) {
        console.log('[SEED] All news items already exist');
        return;
    }

    const { error } = await supabase
        .from('news_posts')
        .insert(toInsert);

    if (error) {
        throw new Error('News insert failed: ' + error.message);
    }

    console.log('[SEED] Inserted', toInsert.length, 'news items');
}
