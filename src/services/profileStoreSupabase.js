// profileStoreSupabase.js - Supabase版プロフィールストア
// localStorage版 (profileStore.js) を置き換える

import { getSupabase } from './supabaseClient.js';

/**
 * 全プロフィール一覧を取得（updated_at降順）
 * @returns {Promise<Array>}
 */
export async function listProfiles() {
    const supabase = getSupabase();
    if (!supabase) {
        console.error('[ProfileStore] Supabase not initialized');
        return [];
    }

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('updated_at', { ascending: false });

    if (error) {
        console.error('[ProfileStore] listProfiles error:', error);
        throw error;
    }

    return data || [];
}

/**
 * 単一プロフィールを取得
 * @param {string} id 
 * @returns {Promise<object|null>}
 */
export async function getProfileById(id) {
    if (!id) return null;

    const supabase = getSupabase();
    if (!supabase) return null;

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .maybeSingle();

    if (error) {
        console.error('[ProfileStore] getProfileById error:', error);
        throw error;
    }

    return data;
}

/**
 * プロフィールを作成または更新
 * UPDATEの場合、先に現行データをrevisionsに保存
 * @param {object} draft - プロフィールデータ
 * @param {string} editorLabel - 編集者の表示名
 * @returns {Promise<object>} 保存されたプロフィール
 */
export async function upsertProfile(draft, editorLabel) {
    const supabase = getSupabase();
    if (!supabase) {
        throw new Error('Supabase not initialized');
    }

    // auth.uid() を取得
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id || null;

    // 既存プロフィールがあるかチェック（UPDATE時は履歴保存）
    if (draft.id) {
        const existing = await getProfileById(draft.id);
        if (existing) {
            // 現行データをrevisionsに保存
            const { error: revError } = await supabase
                .from('profile_revisions')
                .insert({
                    profile_id: existing.id,
                    editor_id: userId,
                    editor_label: editorLabel,
                    snapshot: existing
                });

            if (revError) {
                console.error('[ProfileStore] revision save error:', revError);
                // 履歴保存失敗でも更新は続行
            }
        }
    }

    // プロフィールを upsert
    const profileData = {
        display_name: draft.display_name || draft.name || 'Unnamed',
        role: draft.role || null,
        team: draft.team || null,
        bio: draft.bio || null,
        tags: draft.tags || [],
        avatar_color: draft.avatar_color || draft.avatarColor || null,
        updated_by: userId,
        updated_by_label: editorLabel
    };

    // handle があれば含める
    if (draft.handle) {
        profileData.handle = draft.handle;
    }

    let result;
    if (draft.id) {
        // UPDATE
        const { data, error } = await supabase
            .from('profiles')
            .update(profileData)
            .eq('id', draft.id)
            .select()
            .single();

        if (error) {
            console.error('[ProfileStore] update error:', error);
            throw error;
        }
        result = data;
    } else {
        // INSERT
        const { data, error } = await supabase
            .from('profiles')
            .insert(profileData)
            .select()
            .single();

        if (error) {
            console.error('[ProfileStore] insert error:', error);
            throw error;
        }
        result = data;
    }

    return result;
}

/**
 * プロフィールを削除
 * @param {string} id 
 * @returns {Promise<void>}
 */
export async function deleteProfile(id) {
    if (!id) return;

    const supabase = getSupabase();
    if (!supabase) {
        throw new Error('Supabase not initialized');
    }

    const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('[ProfileStore] delete error:', error);
        throw error;
    }
}

/**
 * プロフィール検索（フロントエンド部分一致）
 * @param {string} queryText 
 * @returns {Promise<Array>}
 */
export async function searchProfiles(queryText) {
    const all = await listProfiles();
    const q = String(queryText || '').trim().toLowerCase();
    if (!q) return all;

    return all.filter(p => {
        const hay = [
            p.display_name,
            p.role,
            p.team,
            p.bio,
            ...(Array.isArray(p.tags) ? p.tags : [])
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
        return hay.includes(q);
    });
}

/**
 * 最近更新されたプロフィールを取得
 * @param {number} limit 
 * @returns {Promise<Array>}
 */
export async function getRecentProfiles(limit = 20) {
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('[ProfileStore] getRecentProfiles error:', error);
        throw error;
    }

    return data || [];
}

// ========== NOTES ==========

/**
 * プロフィールのメモ一覧を取得
 * @param {string} profileId 
 * @returns {Promise<Array>}
 */
export async function listNotes(profileId) {
    if (!profileId) return [];

    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
        .from('profile_notes')
        .select('*')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[ProfileStore] listNotes error:', error);
        throw error;
    }

    return data || [];
}

/**
 * メモを追加
 * @param {string} profileId 
 * @param {{kind?: string, content: string}} noteData 
 * @param {string} editorLabel 
 * @returns {Promise<object>}
 */
export async function addNote(profileId, noteData, editorLabel) {
    if (!profileId || !noteData?.content) {
        throw new Error('profileId and content are required');
    }

    const supabase = getSupabase();
    if (!supabase) {
        throw new Error('Supabase not initialized');
    }

    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
        .from('profile_notes')
        .insert({
            profile_id: profileId,
            kind: noteData.kind || 'note',
            content: noteData.content,
            author_id: user?.id || null,
            author_label: editorLabel
        })
        .select()
        .single();

    if (error) {
        console.error('[ProfileStore] addNote error:', error);
        throw error;
    }

    return data;
}

// ========== REVISIONS ==========

/**
 * 編集履歴一覧を取得
 * @param {string} profileId 
 * @param {number} limit 
 * @returns {Promise<Array>}
 */
export async function listRevisions(profileId, limit = 20) {
    if (!profileId) return [];

    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
        .from('profile_revisions')
        .select('*')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('[ProfileStore] listRevisions error:', error);
        throw error;
    }

    return data || [];
}

/**
 * 指定したrevisionに巻き戻す
 * @param {string} profileId 
 * @param {string} revisionId 
 * @param {string} editorLabel 
 * @returns {Promise<object>}
 */
export async function revertToRevision(profileId, revisionId, editorLabel) {
    const supabase = getSupabase();
    if (!supabase) {
        throw new Error('Supabase not initialized');
    }

    // 1. revisionを取得
    const { data: revision, error: revError } = await supabase
        .from('profile_revisions')
        .select('*')
        .eq('id', revisionId)
        .single();

    if (revError || !revision) {
        throw new Error('Revision not found');
    }

    // 2. 現行データをrevisionsに保存（revert操作も履歴に残す）
    const current = await getProfileById(profileId);
    if (current) {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase
            .from('profile_revisions')
            .insert({
                profile_id: profileId,
                editor_id: user?.id || null,
                editor_label: `${editorLabel} (revert)`,
                snapshot: current
            });
    }

    // 3. snapshotからプロフィールを復元
    const snapshot = revision.snapshot;
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
        .from('profiles')
        .update({
            display_name: snapshot.display_name,
            role: snapshot.role,
            team: snapshot.team,
            bio: snapshot.bio,
            tags: snapshot.tags,
            avatar_color: snapshot.avatar_color,
            updated_by: user?.id || null,
            updated_by_label: `${editorLabel} (revert)`
        })
        .eq('id', profileId)
        .select()
        .single();

    if (error) {
        console.error('[ProfileStore] revert error:', error);
        throw error;
    }

    return data;
}

// ========== ERROR HELPER ==========

/**
 * エラーメッセージをユーザーフレンドリーに変換
 * @param {Error} error 
 * @returns {string}
 */
export function formatError(error) {
    if (!error) return '不明なエラー';

    const msg = error.message || String(error);

    if (msg.includes('JWT') || msg.includes('token') || msg.includes('auth')) {
        return 'ログインが切れている可能性があります。再ログインしてください。';
    }
    if (msg.includes('network') || msg.includes('fetch')) {
        return 'ネットワークエラーが発生しました。接続を確認してください。';
    }
    if (msg.includes('duplicate') || msg.includes('unique')) {
        return 'すでに同じデータが存在します。';
    }

    return `エラー: ${msg}`;
}
