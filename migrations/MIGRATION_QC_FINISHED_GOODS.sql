-- 成品批次 QC 狀態（FQMS 線②延伸到成品出貨）
--
-- 原料批（item_batches）早有 qc_status/qc_date；這裡把同一套欄位加到
-- 「生產批次」＝成品批（din_production / sja_production），讓 FQMS 成品檢驗
-- 可以：qc-lookup 帶入成品批 → 判定 → qc-status 回寫 → 出貨畫面顯示/攔截。
--
-- 欄位語意：
--   qc_status        NULL＝未檢驗（出貨畫面顯示 🟡 未檢驗）；Pending/Pass/Hold/Fail
--   qc_date          FQMS 判定日（WIB）
--   qc_inspection_no FQMS 檢驗單號（出貨畫面 Hold 時顯示，供追查）
--   qc_judged_by     判定人
--   qc_note          判定備註（如「2 項不合格」）
--
-- 在 Supabase Dashboard → SQL Editor 執行一次。IF NOT EXISTS 寫法，可安全重複執行。
-- 搭配部署：supabase functions deploy qc-lookup qc-status（兩支都要重新部署）。

ALTER TABLE public.din_production ADD COLUMN IF NOT EXISTS qc_status text;
ALTER TABLE public.din_production ADD COLUMN IF NOT EXISTS qc_date date;
ALTER TABLE public.din_production ADD COLUMN IF NOT EXISTS qc_inspection_no text;
ALTER TABLE public.din_production ADD COLUMN IF NOT EXISTS qc_judged_by text;
ALTER TABLE public.din_production ADD COLUMN IF NOT EXISTS qc_note text;

ALTER TABLE public.sja_production ADD COLUMN IF NOT EXISTS qc_status text;
ALTER TABLE public.sja_production ADD COLUMN IF NOT EXISTS qc_date date;
ALTER TABLE public.sja_production ADD COLUMN IF NOT EXISTS qc_inspection_no text;
ALTER TABLE public.sja_production ADD COLUMN IF NOT EXISTS qc_judged_by text;
ALTER TABLE public.sja_production ADD COLUMN IF NOT EXISTS qc_note text;
