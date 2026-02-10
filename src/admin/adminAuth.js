// adminAuth.js - Admin authentication with Supabase Auth

import { getSupabase, initSupabase } from '../services/supabaseClient.js';

async function ensureSupabaseClient() {
    try {
        await initSupabase();
    } catch (err) {
        console.warn('[AdminAuth] initSupabase failed:', err?.message || err);
    }
    return getSupabase();
}

/**
 * Check if current user is a Supabase admin (in app_admin_users table)
 * @returns {Promise<boolean>}
 */
export async function isSupabaseAdmin() {
    const supabase = await ensureSupabaseClient();
    if (!supabase) return false;

    try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) return false;

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
        console.warn('[AdminAuth] Supabase admin check error:', err?.message || err);
        return false;
    }
}

/**
 * Check if admin session is valid
 * @returns {Promise<boolean>}
 */
export async function checkAdminSession() {
    const supabase = await ensureSupabaseClient();
    if (!supabase) return false;

    try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
            console.warn('[AdminAuth] getSession failed:', error.message);
            return false;
        }
        return Boolean(data?.session);
    } catch (err) {
        console.warn('[AdminAuth] session check error:', err?.message || err);
        return false;
    }
}

/**
 * Attempt admin login with Supabase Auth
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function loginAdmin(email, password) {
    const supabase = await ensureSupabaseClient();
    if (!supabase) {
        return { success: false, error: 'Supabase client unavailable' };
    }

    const safeEmail = String(email ?? '').trim();
    const safePassword = String(password ?? '');
    if (!safeEmail || !safePassword) {
        return { success: false, error: 'メールアドレスとパスワードを入力してください' };
    }

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: safeEmail,
            password: safePassword
        });
        if (error) {
            return { success: false, error: error.message || 'ログインに失敗しました' };
        }

        if (!data?.session) {
            return { success: false, error: 'ログインに失敗しました: セッションを取得できませんでした' };
        }

        const admin = await isSupabaseAdmin();
        if (!admin) {
            await supabase.auth.signOut();
            return { success: false, error: '管理者権限がありません' };
        }

        return { success: true };
    } catch (err) {
        return { success: false, error: err?.message || 'ログインに失敗しました' };
    }
}

/**
 * Logout admin
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function logoutAdmin() {
    const supabase = await ensureSupabaseClient();
    if (!supabase) {
        return { success: false, error: 'Supabase client unavailable' };
    }

    try {
        const { error } = await supabase.auth.signOut();
        if (error) {
            return { success: false, error: error.message || 'ログアウトに失敗しました' };
        }
        return { success: true };
    } catch (err) {
        return { success: false, error: err?.message || 'ログアウトに失敗しました' };
    }
}

/**
 * Get session info
 * @returns {Promise<{loggedInAt: Date|null, expiresAt: Date|null, remainingMs: number}|null>}
 */
export async function getSessionInfo() {
    const supabase = await ensureSupabaseClient();
    if (!supabase) return null;

    try {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data?.session) return null;
        const loggedInAt = data.session.created_at ? new Date(data.session.created_at) : null;
        const expiresAt = data.session.expires_at ? new Date(data.session.expires_at * 1000) : null;
        const remainingMs = expiresAt ? Math.max(0, expiresAt.getTime() - Date.now()) : 0;
        return { loggedInAt, expiresAt, remainingMs };
    } catch {
        return null;
    }
}
