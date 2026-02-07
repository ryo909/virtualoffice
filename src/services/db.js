// db.js - Database operations

import { getSupabase } from './supabaseClient.js';
import { generateSessionId } from '../utils/ids.js';
import { setSessionId } from '../utils/storage.js';

const SESS_RE = /^sess_[0-9a-fA-F-]{10,}$/;

function ensureSessId(id) {
    const s = typeof id === 'string' ? id : '';
    if (SESS_RE.test(s)) return s;

    const sid = generateSessionId();
    try { setSessionId(sid); } catch { }
    console.warn('[DB] fallback session_id was not sess_. regenerated.', { old: id, new: sid });
    return sid;
}

function isMissingColumn(error, columnName) {
    const message = typeof error?.message === 'string' ? error.message : '';
    return message.includes(`'${columnName}'`) || message.includes(columnName);
}

/**
 * Get nameplate by display name
 * @param {string} displayName 
 * @returns {Promise<object|null>}
 */
export async function getNameplateByDisplayName(displayName) {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('nameplates')
        .select('*')
        .eq('display_name', displayName)
        .maybeSingle();

    if (error) {
        console.error('Error fetching nameplate:', error);
        return null;
    }

    return data;
}

/**
 * Check if display name exists for another session
 * @param {string} displayName 
 * @param {string} sessionId 
 * @returns {Promise<boolean>}
 */
export async function isDisplayNameTaken(displayName, sessionId) {
    sessionId = ensureSessId(sessionId);
    const supabase = getSupabase();

    let { data, error } = await supabase
        .from('nameplates')
        .select('user_id')
        .eq('display_name', displayName)
        .neq('user_id', sessionId)
        .maybeSingle();

    if (error && isMissingColumn(error, 'user_id')) {
        console.warn('[DB] nameplates.user_id missing, falling back to session_id for duplicate check.');
        sessionId = ensureSessId(sessionId);
        console.log('[DBG] nameplates fallback session_id =', sessionId);
        ({ data, error } = await supabase
            .from('nameplates')
            .select('session_id')
            .eq('display_name', displayName)
            .neq('session_id', sessionId)
            .maybeSingle());
    }

    if (error) {
        console.error('Error checking display name:', error);
        return false;
    }

    return data !== null;
}

/**
 * Upsert nameplate
 * @param {{sessionId: string, displayName: string, avatarKey?: string, avatarColor?: string}} params
 * @returns {Promise<object|null>}
 */
export async function upsertNameplate({ sessionId, displayName, avatarKey = null, avatarColor = null }) {
    sessionId = ensureSessId(sessionId);
    const supabase = getSupabase();
    let user_id = sessionId;
    let session_id = sessionId;

    let { data, error } = await supabase
        .from('nameplates')
        .upsert({
            user_id,
            display_name: displayName,
            avatar_key: avatarKey,
            avatar_color: avatarColor,
            updated_at: new Date().toISOString()
        }, {
            onConflict: 'user_id'
        })
        .select()
        .single();

    if (error && isMissingColumn(error, 'user_id')) {
        console.warn('[DB] nameplates.user_id missing, falling back to session_id for upsert.');
        session_id = ensureSessId(session_id);
        console.log('[DBG] nameplates fallback session_id =', session_id);
        ({ data, error } = await supabase
            .from('nameplates')
            .upsert({
                session_id,
                display_name: displayName,
                avatar_key: avatarKey,
                avatar_color: avatarColor,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'session_id'
            })
            .select()
            .single());
    }

    if (error) {
        console.error('[DB] Error upserting nameplate:', {
            message: error?.message,
            details: error?.details,
            hint: error?.hint,
            code: error?.code,
            raw: error
        });
        throw error;
    }

    return data;
}

/**
 * Get room settings (Zoom URLs)
 * @returns {Promise<Map<string, {zoomUrl: string, isEnabled: boolean}>>}
 */
export async function getRoomSettings() {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('room_settings')
        .select('*');

    const result = new Map();

    if (error) {
        console.error('Error fetching room settings:', error);
        return result;
    }

    if (data) {
        data.forEach(row => {
            result.set(row.room_key, {
                zoomUrl: row.zoom_url || null,
                isEnabled: row.is_enabled !== false
            });
        });
    }

    return result;
}

/**
 * Get nameplate by session ID
 * @param {string} sessionId 
 * @returns {Promise<object|null>}
 */
export async function getNameplateBySessionId(sessionId) {
    sessionId = ensureSessId(sessionId);
    const supabase = getSupabase();

    let { data, error } = await supabase
        .from('nameplates')
        .select('*')
        .eq('user_id', sessionId)
        .maybeSingle();

    if (error && isMissingColumn(error, 'user_id')) {
        console.warn('[DB] nameplates.user_id missing, falling back to session_id for lookup.');
        sessionId = ensureSessId(sessionId);
        console.log('[DBG] nameplates fallback session_id =', sessionId);
        ({ data, error } = await supabase
            .from('nameplates')
            .select('*')
            .eq('session_id', sessionId)
            .maybeSingle());
    }

    if (error) {
        console.error('Error fetching nameplate by session:', error);
        return null;
    }

    return data;
}
