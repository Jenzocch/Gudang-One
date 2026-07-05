-- ============================================================
-- 商品規格欄位（包裝規格：每包幾公斤、每箱幾件…）
-- 在 Supabase SQL Editor 執行，可重複執行
-- ============================================================
ALTER TABLE items ADD COLUMN IF NOT EXISTS spec TEXT;
COMMENT ON COLUMN items.spec IS '包裝規格，例如 1 sak = 50 kg / 1 box = 100 pcs';
