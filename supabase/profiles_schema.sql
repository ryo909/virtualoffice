-- =====================================================
-- 図書室プロフィール Supabase スキーマ
-- profiles / profile_notes / profile_revisions
-- =====================================================

-- ========== PROFILES テーブル ==========
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    handle TEXT UNIQUE,  -- 任意識別子（NULL可）
    display_name TEXT NOT NULL,
    role TEXT,
    team TEXT,
    bio TEXT,
    tags JSONB DEFAULT '[]'::jsonb,
    avatar_color TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    updated_by UUID,  -- auth.uid()（共通アカウントでは参考程度）
    updated_by_label TEXT  -- editorLabel（必須：誰が編集したか）
);

-- ========== PROFILE_NOTES テーブル（他者メモ：追記型）==========
CREATE TABLE IF NOT EXISTS profile_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    kind TEXT DEFAULT 'note',  -- note/kudos/info/skill など
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    author_id UUID,  -- auth.uid()
    author_label TEXT  -- editorLabel
);

-- ========== PROFILE_REVISIONS テーブル（編集履歴）==========
CREATE TABLE IF NOT EXISTS profile_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    editor_id UUID,  -- auth.uid()
    editor_label TEXT,  -- editorLabel（revert時は "(revert)" 付与）
    snapshot JSONB NOT NULL  -- profiles行の丸ごとスナップショット
);

-- ========== INDEXES ==========
CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON profiles(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_notes_profile_id ON profile_notes(profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_notes_created_at ON profile_notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_revisions_profile_id ON profile_revisions(profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_revisions_created_at ON profile_revisions(created_at DESC);

-- ========== updated_at 自動更新トリガー ==========
CREATE OR REPLACE FUNCTION update_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON profiles;
CREATE TRIGGER trigger_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_profiles_updated_at();

-- ========== RLS（Row Level Security）==========
-- 共通アカウント運用なので、authenticated なら全操作許可

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_revisions ENABLE ROW LEVEL SECURITY;

-- profiles ポリシー
DROP POLICY IF EXISTS "profiles_select_authenticated" ON profiles;
CREATE POLICY "profiles_select_authenticated" ON profiles
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_insert_authenticated" ON profiles;
CREATE POLICY "profiles_insert_authenticated" ON profiles
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "profiles_update_authenticated" ON profiles;
CREATE POLICY "profiles_update_authenticated" ON profiles
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "profiles_delete_authenticated" ON profiles;
CREATE POLICY "profiles_delete_authenticated" ON profiles
    FOR DELETE TO authenticated USING (true);

-- profile_notes ポリシー
DROP POLICY IF EXISTS "profile_notes_select_authenticated" ON profile_notes;
CREATE POLICY "profile_notes_select_authenticated" ON profile_notes
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profile_notes_insert_authenticated" ON profile_notes;
CREATE POLICY "profile_notes_insert_authenticated" ON profile_notes
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "profile_notes_update_authenticated" ON profile_notes;
CREATE POLICY "profile_notes_update_authenticated" ON profile_notes
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "profile_notes_delete_authenticated" ON profile_notes;
CREATE POLICY "profile_notes_delete_authenticated" ON profile_notes
    FOR DELETE TO authenticated USING (true);

-- profile_revisions ポリシー
DROP POLICY IF EXISTS "profile_revisions_select_authenticated" ON profile_revisions;
CREATE POLICY "profile_revisions_select_authenticated" ON profile_revisions
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profile_revisions_insert_authenticated" ON profile_revisions;
CREATE POLICY "profile_revisions_insert_authenticated" ON profile_revisions
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "profile_revisions_update_authenticated" ON profile_revisions;
CREATE POLICY "profile_revisions_update_authenticated" ON profile_revisions
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "profile_revisions_delete_authenticated" ON profile_revisions;
CREATE POLICY "profile_revisions_delete_authenticated" ON profile_revisions
    FOR DELETE TO authenticated USING (true);

-- =====================================================
-- 使用方法：
-- 1. Supabase Dashboard → SQL Editor
-- 2. このファイルの内容を全て貼り付け
-- 3. Run をクリック
-- =====================================================
