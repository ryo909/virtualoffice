-- =====================================================
-- DM 永続化テーブル + 管理者削除RPC
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ========== DM テーブル ==========
CREATE TABLE IF NOT EXISTS dm_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_key TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    recipient_id TEXT NOT NULL,
    body TEXT NOT NULL CHECK (char_length(trim(body)) > 0 AND char_length(body) <= 500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dm_messages_thread_created
    ON dm_messages(thread_key, created_at);
CREATE INDEX IF NOT EXISTS idx_dm_messages_created_at
    ON dm_messages(created_at DESC);

-- ========== ヘルパー ==========
CREATE OR REPLACE FUNCTION app_dm_thread_key(a TEXT, b TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE WHEN a <= b THEN a || ':' || b ELSE b || ':' || a END;
$$;

-- Supabase(PostgREST) の request header から actor_id を取得
-- 期待ヘッダ: x-actor-id
CREATE OR REPLACE FUNCTION app_current_actor_id()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    headers_json JSONB;
    actor_id TEXT;
BEGIN
    headers_json := NULLIF(current_setting('request.headers', true), '')::jsonb;
    actor_id := NULLIF(trim(COALESCE(headers_json ->> 'x-actor-id', '')), '');
    RETURN actor_id;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

-- ========== RLS ==========
ALTER TABLE dm_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dm_messages_select" ON dm_messages;
CREATE POLICY "dm_messages_select" ON dm_messages
    FOR SELECT TO authenticated
    USING (
        (
            app_current_actor_id() IS NOT NULL
            AND (sender_id = app_current_actor_id() OR recipient_id = app_current_actor_id())
        )
        OR
        (
            -- fallback: 既存の共通アカウント運用を壊さないため
            app_current_actor_id() IS NULL
            AND auth.role() = 'authenticated'
        )
    );

DROP POLICY IF EXISTS "dm_messages_insert" ON dm_messages;
CREATE POLICY "dm_messages_insert" ON dm_messages
    FOR INSERT TO authenticated
    WITH CHECK (
        thread_key = app_dm_thread_key(sender_id, recipient_id)
        AND (
            (app_current_actor_id() IS NOT NULL AND sender_id = app_current_actor_id())
            OR
            (app_current_actor_id() IS NULL AND auth.role() = 'authenticated')
        )
    );

GRANT SELECT, INSERT ON dm_messages TO authenticated;

-- ========== 管理者判定（DB側） ==========
CREATE TABLE IF NOT EXISTS app_admin_users (
    user_id UUID PRIMARY KEY,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE app_admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_admin_users_read_self" ON app_admin_users;
CREATE POLICY "app_admin_users_read_self" ON app_admin_users
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION app_is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    claim_is_admin BOOLEAN;
BEGIN
    claim_is_admin := COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false);
    IF claim_is_admin THEN
        RETURN true;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM app_admin_users a
        WHERE a.user_id = auth.uid()
    );
END;
$$;

-- ========== 管理者RPC ==========
CREATE OR REPLACE FUNCTION admin_purge_dm_before(p_days INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_days INTEGER;
    v_deleted INTEGER;
BEGIN
    IF NOT app_is_admin() THEN
        RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
    END IF;

    v_days := GREATEST(1, COALESCE(p_days, 30));

    WITH deleted AS (
        DELETE FROM dm_messages
        WHERE created_at < now() - make_interval(days => v_days)
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_deleted FROM deleted;

    RETURN COALESCE(v_deleted, 0);
END;
$$;

CREATE OR REPLACE FUNCTION admin_purge_dm_all()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    IF NOT app_is_admin() THEN
        RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
    END IF;

    WITH deleted AS (
        DELETE FROM dm_messages
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_deleted FROM deleted;

    RETURN COALESCE(v_deleted, 0);
END;
$$;

REVOKE ALL ON FUNCTION admin_purge_dm_before(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_purge_dm_all() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_purge_dm_before(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_purge_dm_all() TO authenticated;

-- Realtime INSERT受信を使う場合
-- ALTER PUBLICATION supabase_realtime ADD TABLE dm_messages;

-- =====================================================
-- 適用メモ:
-- 1) SQL Editorでこのファイルを実行
-- 2) 必要なら app_admin_users に管理者の auth.uid() を追加
-- =====================================================
