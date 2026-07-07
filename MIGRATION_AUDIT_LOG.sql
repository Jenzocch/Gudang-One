-- ============================================================
-- 刪改留痕 audit_log：誰在何時刪了什麼（含被刪那筆的完整快照）
-- 重點：只給 INSERT + SELECT 權限，「不給 UPDATE/DELETE」
--       → 就算拿到 anon key 也改不了、刪不了記錄（稽核不可竄改）
-- 執行：Supabase SQL Editor 貼上執行一次（可重複）
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  at TIMESTAMP DEFAULT now(),
  actor TEXT,               -- 操作者（登入者姓名 / Super Admin / Admin Office）
  action TEXT NOT NULL,     -- 'delete' | 'purge' | ...
  table_name TEXT NOT NULL, -- 被動到的表
  row_id TEXT,              -- 被刪那筆的 id
  summary TEXT,             -- 人可讀摘要（日期＋產品代碼等）
  snapshot JSONB            -- 被刪那筆的完整內容快照
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at DESC);

GRANT SELECT, INSERT ON audit_log TO anon, authenticated;
REVOKE UPDATE, DELETE ON audit_log FROM anon, authenticated;

-- 驗證：
-- SELECT at, actor, action, table_name, summary FROM audit_log ORDER BY at DESC LIMIT 20;
