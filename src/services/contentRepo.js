// contentRepo.js - Unified content repository for gallery/news
// Viewer: DB first, JSON fallback, debug override(optional)
// Admin: DB only

import { getSupabase, initSupabase } from './supabaseClient.js';
import { fetchGalleryJson, fetchNewsJson } from './staticJson.js';

const GALLERY_OVERRIDE_KEY = 'virtualoffice_gallery_override';
const NEWS_OVERRIDE_KEY = 'virtualoffice_news_override';
const ADMIN_SESSION_KEY = 'virtualoffice_admin_session';

function isDebugOverrideEnabled() {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('debug') === '1';
}

function hasValidAdminSession() {
    if (typeof window === 'undefined') return false;
    try {
        const raw = localStorage.getItem(ADMIN_SESSION_KEY);
        if (!raw) return false;
        const session = JSON.parse(raw);
        return Boolean(session?.expiresAt && Date.now() < session.expiresAt);
    } catch {
        return false;
    }
}

function logContent(kind, { source, count, ok, error }) {
    const safeError = typeof error === 'string' && error.trim().length > 0 ? error.trim() : 'null';
    console.log(
        `[CONTENT][${kind}] source=${source} count=${Number(count) || 0} ok=${ok === true ? 'true' : 'false'} error=${safeError}`
    );
}

function parseJsonSafely(raw) {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function readOverrideObject(key) {
    if (!isDebugOverrideEnabled() || !hasValidAdminSession()) return null;

    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return parseJsonSafely(raw);
    } catch {
        return null;
    }
}

function toGalleryItems(input) {
    const source = Array.isArray(input?.items) ? input.items : (Array.isArray(input) ? input : []);
    return source
        .filter((item) => item && typeof item === 'object')
        .map((item, index) => ({
            id: item.id || `gallery-${index}`,
            title: String(item.title || ''),
            url: String(item.url || ''),
            desc: String(item.desc || item.description || ''),
            tags: Array.isArray(item.tags) ? item.tags : [],
            order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
            is_active: item.is_active !== false
        }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function toNewsItems(input) {
    const source = Array.isArray(input?.items) ? input.items : (Array.isArray(input) ? input : []);
    return source
        .filter((item) => item && typeof item === 'object')
        .map((item, index) => ({
            id: item.id || `news-${index}`,
            title: String(item.title || ''),
            body: String(item.body || ''),
            date: String(item.date || ''),
            status: item.status === 'draft' ? 'draft' : 'published',
            pinned: item.pinned === true
        }));
}

function galleryDbToUi(row, index = 0) {
    return {
        id: row.id,
        title: row.title || '',
        url: row.url || '',
        desc: row.description || '',
        tags: Array.isArray(row.tags) ? row.tags : [],
        order: Number.isFinite(Number(row.order)) ? Number(row.order) : index,
        is_active: row.is_active !== false
    };
}

function newsDbToUi(row, index = 0) {
    let date = '';
    const baseDate = row.published_at || row.created_at || null;
    if (baseDate) {
        try {
            date = new Date(baseDate).toISOString().split('T')[0];
        } catch {
            date = '';
        }
    }

    return {
        id: row.id,
        title: row.title || '',
        body: row.body || '',
        date,
        status: row.status || 'published',
        pinned: row.pinned === true,
        order: Number.isFinite(Number(row.order)) ? Number(row.order) : index,
        created_at: row.created_at || null,
        published_at: row.published_at || null
    };
}

function galleryUiToDb(item, index) {
    return {
        id: item.id || crypto.randomUUID(),
        title: item.title || '',
        url: item.url || '',
        description: item.desc || '',
        tags: Array.isArray(item.tags) ? item.tags : [],
        order: index,
        is_active: item.is_active !== false
    };
}

function newsUiToDb(item, index) {
    const normalizedStatus = item.status === 'draft' ? 'draft' : 'published';
    const normalizedOrder = Number.isFinite(Number(item.order)) ? Number(item.order) : index;
    let publishedAt = null;
    if (normalizedStatus === 'published') {
        if (item.date) {
            const parsed = new Date(item.date);
            publishedAt = Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
        } else if (item.published_at) {
            publishedAt = item.published_at;
        } else {
            publishedAt = new Date().toISOString();
        }
    }

    return {
        id: item.id || crypto.randomUUID(),
        title: item.title || '',
        body: item.body || '',
        status: normalizedStatus,
        pinned: item.pinned === true,
        order: normalizedOrder,
        published_at: publishedAt
    };
}

async function ensureSupabase() {
    try {
        await initSupabase();
    } catch {
        // no-op: caller checks client existence
    }
    return getSupabase();
}

async function verifyWrittenIds(supabase, table, ids) {
    const normalizedIds = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean))];
    if (normalizedIds.length === 0) {
        return { ok: true, found: 0, expected: 0 };
    }

    const { data, error } = await supabase
        .from(table)
        .select('id')
        .in('id', normalizedIds);

    if (error) {
        return {
            ok: false,
            error: `Write verification failed (${table}): ${error.message || 'failed to verify written ids'}. Check RLS/policies or auth.`
        };
    }

    const found = new Set((data || []).map((row) => row?.id).filter(Boolean)).size;
    if (found !== normalizedIds.length) {
        return {
            ok: false,
            error: `Write verification failed (${table}): expected ${normalizedIds.length} rows, found ${found}. Check RLS/policies or auth.`
        };
    }

    return { ok: true, found, expected: normalizedIds.length };
}

export function clearContentOverrides() {
    let cleared = 0;
    try {
        if (localStorage.getItem(GALLERY_OVERRIDE_KEY) !== null) {
            localStorage.removeItem(GALLERY_OVERRIDE_KEY);
            cleared += 1;
        }
        if (localStorage.getItem(NEWS_OVERRIDE_KEY) !== null) {
            localStorage.removeItem(NEWS_OVERRIDE_KEY);
            cleared += 1;
        }
    } catch (err) {
        return { ok: false, cleared, error: err?.message || 'failed to clear override keys' };
    }
    return { ok: true, cleared };
}

export async function getGallery() {
    let dbError = null;
    const supabase = await ensureSupabase();
    if (supabase) {
        const { data, error } = await supabase
            .from('gallery_items')
            .select('id, title, url, description, tags, "order", is_active')
            .eq('is_active', true)
            .order('order', { ascending: true })
            .limit(200);

        if (!error && Array.isArray(data) && data.length > 0) {
            const items = (data || []).map((row, index) => galleryDbToUi(row, index));
            logContent('GALLERY', { source: 'db', count: items.length, ok: true, error: null });
            return { source: 'db', ok: true, items };
        }
        dbError = error ? (error.message || 'db query failed') : 'db returned empty items';
    } else {
        dbError = 'supabase client unavailable';
    }

    try {
        const json = await fetchGalleryJson();
        const items = toGalleryItems(json);
        if (items.length > 0) {
            logContent('GALLERY', { source: 'json', count: items.length, ok: true, error: dbError });
            return { source: 'json', ok: true, items };
        }
        dbError = `${dbError || 'unknown'} | json returned empty items`;
    } catch (jsonErr) {
        const message = jsonErr?.message || 'json fallback failed';
        dbError = `${dbError || 'unknown'} | ${message}`;
    }

    const override = readOverrideObject(GALLERY_OVERRIDE_KEY);
    if (override) {
        const items = toGalleryItems(override);
        logContent('GALLERY', { source: 'override', count: items.length, ok: true, error: dbError });
        return { source: 'override', ok: true, items };
    }

    logContent('GALLERY', { source: 'json', count: 0, ok: false, error: dbError || 'all sources failed' });
    return { source: 'json', ok: false, error: dbError || 'all sources failed', items: [] };
}

export async function getGalleryAdmin() {
    const supabase = await ensureSupabase();
    if (!supabase) {
        const error = 'Supabase client unavailable';
        logContent('GALLERY', { source: 'db', count: 0, ok: false, error });
        return { source: 'db', ok: false, error, items: [] };
    }

    const { data, error } = await supabase
        .from('gallery_items')
        .select('id, title, url, description, tags, "order", is_active')
        .order('order', { ascending: true });

    if (error) {
        const message = error.message || 'failed to load gallery_items';
        logContent('GALLERY', { source: 'db', count: 0, ok: false, error: message });
        return { source: 'db', ok: false, error: message, items: [] };
    }

    const items = (data || []).map((row, index) => galleryDbToUi(row, index));
    logContent('GALLERY', { source: 'db', count: items.length, ok: true, error: null });
    return { source: 'db', ok: true, items };
}

export async function saveGalleryAdmin(items) {
    const supabase = await ensureSupabase();
    if (!supabase) {
        return { ok: false, error: 'Supabase client unavailable' };
    }

    const normalized = Array.isArray(items) ? items : [];
    const rows = normalized.map((item, index) => galleryUiToDb(item, index));
    const keepIds = new Set(rows.map((row) => row.id));

    if (rows.length > 0) {
        const { error: upsertError } = await supabase
            .from('gallery_items')
            .upsert(rows, { onConflict: 'id' });

        if (upsertError) {
            const message = upsertError.message || 'failed to upsert gallery items';
            return { ok: false, error: `${message}. Check RLS/policies or auth.` };
        }

        const verify = await verifyWrittenIds(supabase, 'gallery_items', rows.map((row) => row.id));
        if (!verify.ok) {
            return { ok: false, error: verify.error };
        }
    }

    const { data: existingRows, error: existingError } = await supabase
        .from('gallery_items')
        .select('id');

    if (existingError) {
        return { ok: false, error: existingError.message || 'failed to list gallery items for sync' };
    }

    const inactivateIds = (existingRows || [])
        .map((row) => row.id)
        .filter((id) => id && !keepIds.has(id));

    if (inactivateIds.length > 0) {
        const { error: inactivateError } = await supabase
            .from('gallery_items')
            .update({ is_active: false })
            .in('id', inactivateIds);
        if (inactivateError) {
            return { ok: false, error: inactivateError.message || 'failed to inactivate removed gallery items' };
        }
    }

    return { ok: true };
}

export async function deleteGalleryItem(id) {
    const supabase = await ensureSupabase();
    if (!supabase) {
        return { ok: false, error: 'Supabase client unavailable' };
    }
    if (!id) {
        return { ok: false, error: 'id is required' };
    }

    const { error } = await supabase
        .from('gallery_items')
        .update({ is_active: false })
        .eq('id', id);

    if (error) return { ok: false, error: error.message || 'failed to inactivate gallery item' };
    return { ok: true };
}

export async function getNews() {
    let dbError = null;
    const supabase = await ensureSupabase();
    if (supabase) {
        const { data, error } = await supabase
            .from('news_posts')
            .select('id, title, body, status, pinned, published_at, created_at, "order"')
            .eq('status', 'published')
            .order('pinned', { ascending: false })
            .order('order', { ascending: true })
            .order('published_at', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false })
            .limit(100);

        if (!error && Array.isArray(data) && data.length > 0) {
            const items = (data || []).map((row, index) => newsDbToUi(row, index));
            logContent('NEWS', { source: 'db', count: items.length, ok: true, error: null });
            return { source: 'db', ok: true, items };
        }
        dbError = error ? (error.message || 'db query failed') : 'db returned empty items';
    } else {
        dbError = 'supabase client unavailable';
    }

    try {
        const json = await fetchNewsJson();
        const items = toNewsItems(json);
        if (items.length > 0) {
            logContent('NEWS', { source: 'json', count: items.length, ok: true, error: dbError });
            return { source: 'json', ok: true, items };
        }
        dbError = `${dbError || 'unknown'} | json returned empty items`;
    } catch (jsonErr) {
        const message = jsonErr?.message || 'json fallback failed';
        dbError = `${dbError || 'unknown'} | ${message}`;
    }

    const override = readOverrideObject(NEWS_OVERRIDE_KEY);
    if (override) {
        const items = toNewsItems(override);
        logContent('NEWS', { source: 'override', count: items.length, ok: true, error: dbError });
        return { source: 'override', ok: true, items };
    }

    logContent('NEWS', { source: 'json', count: 0, ok: false, error: dbError || 'all sources failed' });
    return { source: 'json', ok: false, error: dbError || 'all sources failed', items: [] };
}

export async function getNewsAdmin() {
    const supabase = await ensureSupabase();
    if (!supabase) {
        const error = 'Supabase client unavailable';
        logContent('NEWS', { source: 'db', count: 0, ok: false, error });
        return { source: 'db', ok: false, error, items: [] };
    }

    const { data, error } = await supabase
        .from('news_posts')
        .select('id, title, body, status, pinned, published_at, created_at, "order"')
        .order('pinned', { ascending: false })
        .order('order', { ascending: true })
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

    if (error) {
        const message = error.message || 'failed to load news_posts';
        logContent('NEWS', { source: 'db', count: 0, ok: false, error: message });
        return { source: 'db', ok: false, error: message, items: [] };
    }

    const items = (data || []).map((row, index) => newsDbToUi(row, index));
    logContent('NEWS', { source: 'db', count: items.length, ok: true, error: null });
    return { source: 'db', ok: true, items };
}

export async function saveNewsAdmin(items) {
    const supabase = await ensureSupabase();
    if (!supabase) {
        return { ok: false, error: 'Supabase client unavailable' };
    }

    const normalized = Array.isArray(items) ? items : [];
    const rows = normalized.map((item, index) => newsUiToDb(item, index));
    const keepIds = new Set(rows.map((row) => row.id));

    if (rows.length > 0) {
        const { error: upsertError } = await supabase
            .from('news_posts')
            .upsert(rows, { onConflict: 'id' });

        if (upsertError) {
            const message = upsertError.message || 'failed to upsert news posts';
            return { ok: false, error: `${message}. Check RLS/policies or auth.` };
        }

        const verify = await verifyWrittenIds(supabase, 'news_posts', rows.map((row) => row.id));
        if (!verify.ok) {
            return { ok: false, error: verify.error };
        }
    }

    const { data: existingRows, error: existingError } = await supabase
        .from('news_posts')
        .select('id');

    if (existingError) {
        return { ok: false, error: existingError.message || 'failed to list news posts for sync' };
    }

    const deleteIds = (existingRows || [])
        .map((row) => row.id)
        .filter((id) => id && !keepIds.has(id));

    if (deleteIds.length > 0) {
        const { error: deleteError } = await supabase
            .from('news_posts')
            .delete()
            .in('id', deleteIds);
        if (deleteError) {
            return { ok: false, error: deleteError.message || 'failed to delete removed news posts' };
        }
    }

    return { ok: true };
}

export async function deleteNewsItem(id) {
    const supabase = await ensureSupabase();
    if (!supabase) {
        return { ok: false, error: 'Supabase client unavailable' };
    }
    if (!id) {
        return { ok: false, error: 'id is required' };
    }

    const { error } = await supabase
        .from('news_posts')
        .delete()
        .eq('id', id);

    if (error) return { ok: false, error: error.message || 'failed to delete news post' };
    return { ok: true };
}
