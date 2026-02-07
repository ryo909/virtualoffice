-- =====================================================
-- Global chat 永続化テーブル + 管理者削除RPC
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ========== 管理者補助テーブル ==========
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

-- ========== ヘルパー ==========
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

-- ========== Global chat テーブル ==========
CREATE TABLE IF NOT EXISTS global_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    room_id TEXT NOT NULL DEFAULT 'room:default',
    sender_actor_id TEXT NOT NULL,
    sender_display_name TEXT NOT NULL,
    message TEXT NOT NULL CHECK (char_length(trim(message)) > 0 AND char_length(message) <= 500),
    client_msg_id TEXT,
    deleted BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_global_messages_room_created
    ON global_messages(room_id, created_at);
CREATE INDEX IF NOT EXISTS idx_global_messages_created_desc
    ON global_messages(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_global_messages_sender_client_msg
    ON global_messages(sender_actor_id, client_msg_id)
    WHERE client_msg_id IS NOT NULL;

ALTER TABLE global_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "global_messages_select" ON global_messages;
CREATE POLICY "global_messages_select" ON global_messages
    FOR SELECT TO authenticated
    USING (
        deleted = false
        AND auth.role() = 'authenticated'
    );

DROP POLICY IF EXISTS "global_messages_insert" ON global_messages;
CREATE POLICY "global_messages_insert" ON global_messages
    FOR INSERT TO authenticated
    WITH CHECK (
        (
            app_current_actor_id() IS NOT NULL
            AND sender_actor_id = app_current_actor_id()
        )
        OR
        (
            app_current_actor_id() IS NULL
            AND auth.role() = 'authenticated'
        )
    );

DROP POLICY IF EXISTS "global_messages_delete_admin" ON global_messages;
CREATE POLICY "global_messages_delete_admin" ON global_messages
    FOR DELETE TO authenticated
    USING (app_is_admin());

DROP POLICY IF EXISTS "global_messages_update_admin" ON global_messages;
CREATE POLICY "global_messages_update_admin" ON global_messages
    FOR UPDATE TO authenticated
    USING (app_is_admin())
    WITH CHECK (app_is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON global_messages TO authenticated;

-- ========== 管理者RPC ==========
CREATE OR REPLACE FUNCTION admin_delete_global_message(p_id UUID)
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

    WITH deleted_rows AS (
        DELETE FROM global_messages
        WHERE id = p_id
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_deleted FROM deleted_rows;

    RETURN COALESCE(v_deleted, 0);
END;
$$;

CREATE OR REPLACE FUNCTION admin_purge_global_before(
    p_days INTEGER DEFAULT 30,
    p_room_id TEXT DEFAULT NULL
)
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

    WITH deleted_rows AS (
        DELETE FROM global_messages
        WHERE created_at < now() - make_interval(days => v_days)
          AND (p_room_id IS NULL OR room_id = p_room_id)
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_deleted FROM deleted_rows;

    RETURN COALESCE(v_deleted, 0);
END;
$$;

CREATE OR REPLACE FUNCTION admin_purge_global_all(p_room_id TEXT DEFAULT NULL)
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

    WITH deleted_rows AS (
        DELETE FROM global_messages
        WHERE p_room_id IS NULL OR room_id = p_room_id
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_deleted FROM deleted_rows;

    RETURN COALESCE(v_deleted, 0);
END;
$$;

REVOKE ALL ON FUNCTION admin_delete_global_message(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_purge_global_before(INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_purge_global_all(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_delete_global_message(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_purge_global_before(INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_purge_global_all(TEXT) TO authenticated;

-- Realtime INSERT/UPDATE/DELETE受信を使う場合
-- ALTER PUBLICATION supabase_realtime ADD TABLE global_messages;

-- =====================================================
-- 適用メモ:
-- 1) SQL Editorでこのファイルを実行
-- 2) 必要なら app_admin_users に管理者の auth.uid() を追加
-- =====================================================
