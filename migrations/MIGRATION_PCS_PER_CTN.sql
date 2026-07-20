-- items 加 pcs_per_ctn（數字，1 箱=幾 pcs）：讓 Masuk / Opname 表單可以填「箱數」自動算出總 pcs，
-- 跟 SJA 生產模組既有的 sja_products.pcs_per_ctn 是同一種機制，這裡是套用到一般庫存品項。
-- 跟 items.spec（自由文字，例如「1 sak = 50 kg」）分開：spec 給人看，這欄給計算機算。
--
-- 在 Supabase Dashboard → SQL Editor 執行一次。IF NOT EXISTS 寫法，可安全重複執行。

ALTER TABLE public.items ADD COLUMN IF NOT EXISTS pcs_per_ctn numeric;

-- 補值：MIGRATION_SEED_DIN_MATERIALS.sql（PR #31）建檔時這個欄位還不存在，
-- 但來源資料裡 ctn-din5／BAG5 這兩項本來就有寫明箱裝比例，順便補進去。
UPDATE public.items SET pcs_per_ctn = 12   WHERE code = 'ctn-din5' AND pcs_per_ctn IS NULL;
UPDATE public.items SET pcs_per_ctn = 2000 WHERE code = 'BAG5'     AND pcs_per_ctn IS NULL;
