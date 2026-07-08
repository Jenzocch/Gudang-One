-- ============================================================
-- FAMMS 叫料回饋：追蹤申請來源 + 選填連結批次（供 QC 結果回饋用）
-- 對應 docs/PLAN_3SYSTEM_INTEGRATION.md 新增的兩條線：
--   Gudang One → FAMMS  叫料單狀態回寫（線①的反向）
--   Gudang One → FAMMS  qc_result 回饋（若該叫料的到貨批次後來被 FQMS 判定 Hold/Fail）
--
-- 設計:
--   source/source_ref 記「這筆 requests 是不是 FAMMS 叫的、原始工單資訊」，
--   famms-request Edge Function 建立申請時順手填。
--   linked_batch_id 是選填欄位——只有在管理員用「批次入庫」方式核准這筆
--   申請時才會設定；沒設定就代表這條線用不到 qc_result 回饋（多數叫料是
--   HARDWARE 備品，本來就不在 FQMS 的食品品管範圍內，這是預期情況）。
--
-- 執行：Supabase SQL Editor 貼上執行一次（可重複執行）。
-- ============================================================

ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'staff'
    CHECK (source IN ('staff','famms')),
  ADD COLUMN IF NOT EXISTS source_ref JSONB,          -- {work_order, machine_id, machine_name, requester}
  ADD COLUMN IF NOT EXISTS linked_batch_id UUID REFERENCES item_batches(id);

CREATE INDEX IF NOT EXISTS idx_requests_source        ON requests(source);
CREATE INDEX IF NOT EXISTS idx_requests_linked_batch  ON requests(linked_batch_id);

-- 驗證：
-- SELECT id, person_name, status, source, source_ref, linked_batch_id
--   FROM requests ORDER BY created_at DESC LIMIT 20;
