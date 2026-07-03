-- ============================================================
-- 權限改為「按倉庫」各自設定
--   people.perms (jsonb)：{"SJA":{"ambil":true,"masuk":false},"DENIKIN":{"ambil":false}}
--   某倉庫沒設定時 → 退回全域 can_ambil/can_masuk → 再退回舊預設
--   （人人可 Ambil、admin 才可 Masuk），所以既有行為完全不變。
--
-- ⚠️ 一定要在 gudang 專案執行（網址含 klswfuzuhlowzrbncreu）。
--
-- 部署順序：
--   1) 先跑這段 SQL
--   2) 重新部署 manage-people（白名單加了 perms 欄位）
--   3) 前端合併上線
-- ============================================================

-- 1) 加欄位（預設空物件 = 全部沿用舊行為）
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS perms jsonb DEFAULT '{}'::jsonb;

-- 2) 之前做過欄位級鎖定(只 GRANT 特定欄位可讀)，新欄位要補上讀取權限，
--    否則前端 select 會 permission denied
GRANT SELECT (perms) ON public.people TO anon, authenticated;

-- ── 驗證 ──
SELECT name, is_admin, can_ambil, can_masuk, perms FROM public.people ORDER BY name;
-- （perms 應該全部是 {}，之後在 App 員工列表按倉庫開關就會寫進來）
