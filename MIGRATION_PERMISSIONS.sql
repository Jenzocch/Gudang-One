-- ============================================================
-- 每人可獨立設定的 Ambil(領料) / Masuk(進貨) 權限
--   super admin 在 App 的員工列表用 📤 / 📥 按鈕切換。
--
-- ⚠️ 一定要在 gudang 專案執行（網址含 klswfuzuhlowzrbncreu）。
--
-- 部署順序：
--   1) 先跑這段 SQL
--   2) supabase functions deploy manage-people   （白名單加了新欄位）
--   3) 前端合併上線
-- ============================================================

-- 1) 加欄位（預設沿用舊行為：人人可 Ambil；Masuk 只有 admin）
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS can_ambil boolean DEFAULT true;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS can_masuk boolean DEFAULT false;

UPDATE public.people SET can_ambil = true  WHERE can_ambil IS NULL;
UPDATE public.people SET can_masuk = true  WHERE can_masuk IS NULL AND is_admin = true;
UPDATE public.people SET can_masuk = false WHERE can_masuk IS NULL;

-- 2) 之前做過欄位級鎖定(只 GRANT 特定欄位可讀)，新欄位要補上讀取權限，
--    否則前端 select 會 permission denied
GRANT SELECT (can_ambil, can_masuk) ON public.people TO anon, authenticated;

-- ── 驗證 ──
--   select name, is_admin, can_ambil, can_masuk from public.people;
--   （admin 應為 can_masuk=true，其他人 false；can_ambil 全部 true）
