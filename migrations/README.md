# migrations/ — 資料庫遷移檔

所有 SQL 都是在 Supabase Dashboard → SQL Editor 手動貼上執行（正式庫專案 ref: `klswfuzuhlowzrbncreu`）。
檔案多以 `IF NOT EXISTS` 寫法撰寫，可安全重複執行；各檔案的目前狀態如下表。

| 檔案 | 用途 | 狀態 |
|---|---|---|
| `MIGRATION_TABLES.sql` | 補建 transactions（交易紀錄）與 requests（叫貨申請）兩張表 | ✅ 已執行（正式庫） |
| `migration_is_admin.sql` | people 表加 `is_admin` 欄位（Admin Gudang 功能） | ✅ 已執行（正式庫） |
| `MIGRATION_PRESERVE_DATA.sql` | 保留現有資料，拆分為 items（共享資訊）＋ item_variants（各倉庫庫存）的共享庫存架構 | ✅ 已執行（正式庫） |
| `MIGRATION_SHARED_INVENTORY.md` | 上述共享庫存（多倉庫商品）架構變更的設計說明文件 | ✅ 已執行（正式庫） |
| `MIGRATION_PROTECT_PIN.sql` | 撤掉 anon 讀取 `people.pin`；PIN 驗證改走 verify-staff / verify-admin | ✅ 已執行（正式庫） |
| `MIGRATION_LOCK_PEOPLE_WRITE.sql` | 撤掉 anon 對 people 的寫入權，變更一律走 manage-people Edge Function | ✅ 已執行（正式庫） |
| `MIGRATION_PERMISSIONS.sql` | 每人可獨立設定的 Ambil（領料）/ Masuk（進貨）權限欄位 | ✅ 已執行（正式庫） |
| `MIGRATION_PERMS_PER_GUDANG.sql` | 權限改為「按倉庫」各自設定（`people.perms` jsonb） | ✅ 已執行（正式庫） |
| `MIGRATION_CATEGORIES.sql` | 商品分類改存資料庫（取代 localStorage），依倉庫分開 | ✅ 已執行（正式庫） |
| `MIGRATION_STORAGE_BUCKET.sql` | 建 Supabase Storage bucket `item-photos`（照片上傳） | ✅ 已執行（正式庫） |
| `MIGRATION_ADD_SPEC.sql` | items 加 `spec`（包裝規格）欄位 | ✅ 已執行（正式庫） |
| `MIGRATION_APP_CONFIG.sql` | app_config 全站設定表（如 Office 臨時看出貨的開關） | ✅ 已執行（正式庫） |
| `MIGRATION_SCHEMA_SAFETY.sql` | 補 item_batches 單價 / 供應商欄＋ transaction_edits 交易修改紀錄表 | ✅ 已執行（正式庫） |
| `MIGRATION_DIN_PRODUCTION.sql` | DENIKIN 椰果生產系統（復水 → 切割 → 出貨）全套資料表 | ✅ 已執行（正式庫） |
| `MIGRATION_SJA_CLEAN.sql` | 重建 SJA schema：283 個產品＋ 20 客戶＋生產 / 出貨表 | ✅ 已執行（正式庫） |
| `MIGRATION_PRODUCT_SORT.sql` | DIN / SJA 產品加 `sort_order` 自由排序欄位 | ✅ 已執行（正式庫） |
| `MIGRATION_QC_SYSTEM.sql` | QC / HACCP 系統資料表（可編輯範本、檢驗紀錄、CCP 監控） | ✅ 已執行（正式庫） |
| `MIGRATION_QC_SJA.sql` | SJA 的 QC 檢驗範本種子資料（前置：MIGRATION_QC_SYSTEM.sql） | ✅ 已執行（正式庫） |
| `MIGRATION_AUDIT_LOG.sql` | audit_log 刪改留痕表（只給 INSERT/SELECT，稽核不可竄改） | 🆕 2026-07 新增 — 需在 Supabase SQL Editor 執行一次（Arsip 稽核記錄功能依賴它） |
| `MIGRATION_FAMMS_CALLBACK.sql` | requests 表加 source/source_ref/linked_batch_id，供 Gudang One → FAMMS 叫料狀態/qc_result 回饋用 | 🆕 2026-07 新增 — 需執行；另需部署 `famms-request-status` + 重新部署 `qc-status`，並設定 `FAMMS_CALLBACK_URL`/`FAMMS_CALLBACK_SECRET`（見 `docs/PLAN_3SYSTEM_INTEGRATION.md` §6.1） |
