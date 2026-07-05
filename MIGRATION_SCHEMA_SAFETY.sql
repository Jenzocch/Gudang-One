-- ============================================================
-- Schema 補強（audit 發現的缺口）— 可重複執行
-- 1) item_batches 補 unit_price / supplier（入庫表單有填但 repo 無 migration）
-- 2) transaction_edits 表（交易修改紀錄，程式有寫入但無建表 SQL）
-- ============================================================

ALTER TABLE item_batches ADD COLUMN IF NOT EXISTS unit_price NUMERIC;
ALTER TABLE item_batches ADD COLUMN IF NOT EXISTS supplier TEXT;

CREATE TABLE IF NOT EXISTS transaction_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id BIGINT,
  edited_by TEXT,
  old_values JSONB,
  new_values JSONB,
  edited_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now()
);
GRANT SELECT, INSERT ON public.transaction_edits TO anon, authenticated;
