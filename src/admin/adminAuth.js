// adminAuth.js - Admin authentication with password and session management

import { getSupabase } from '../services/supabaseClient.js';

const ADMIN_PASSWORD = '8713';
const ADMIN_SESSION_KEY = 'virtualoffice_admin_session';
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

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
            console.warn('[AdminAuth] Supabase admin check failed:', error.message);
            return false;
        }

        return !!data;
    } catch (err) {
        console.warn('[AdminAuth] Supabase admin check error:', err.message);
        return false;
    }
}

/**
 * Check if admin session is valid
 */
export function checkAdminSession() {
    const session = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!session) return false;

    try {
        const parsed = JSON.parse(session);
        if (parsed.expiresAt && Date.now() < parsed.expiresAt) {
            return true;
        }
        // Session expired
        localStorage.removeItem(ADMIN_SESSION_KEY);
        return false;
    } catch (e) {
        localStorage.removeItem(ADMIN_SESSION_KEY);
        return false;
    }
}

/**
 * Attempt admin login with password
 * @param {string} password
 * @returns {{success: boolean, error?: string}}
 */
export function loginAdmin(password) {
    if (password !== ADMIN_PASSWORD) {
        return { success: false, error: 'パスワードが違います' };
    }

    const session = {
        loggedInAt: Date.now(),
        expiresAt: Date.now() + SESSION_DURATION_MS
    };
    localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
    console.log('[AdminAuth] Logged in, expires:', new Date(session.expiresAt));
    return { success: true };
}

/**
 * Logout admin
 */
export function logoutAdmin() {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    console.log('[AdminAuth] Logged out');
}

/**
 * Get session info
 */
export function getSessionInfo() {
    if (!checkAdminSession()) return null;

    const session = JSON.parse(localStorage.getItem(ADMIN_SESSION_KEY));
    return {
        loggedInAt: new Date(session.loggedInAt),
        expiresAt: new Date(session.expiresAt),
        remainingMs: session.expiresAt - Date.now()
    };
}
