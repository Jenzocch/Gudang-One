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
| `MIGRATION_AUDIT_LOG.sql` | audit_log 刪改留痕表（只給 INSERT/SELECT，稽核不可竄改） | ✅ 已執行（正式庫） |
| `MIGRATION_FAMMS_LINK.sql` | requests 表加 `source`/`famms_request_id`，供線③（叫料狀態回寫 FAMMS）追蹤來源 | ✅ 已執行（正式庫） |
| `MIGRATION_STORAGE_LOCKDOWN.sql` | 撤掉 Storage `item-photos` bucket 的 anon DELETE/UPDATE 政策（原本任何人都能刪改別人上傳的商品照片） | ✅ 已執行（正式庫） |
| `MIGRATION_PRODUCT_REFS.sql` | 新增 `product_refs` 表——供應商/產品知識庫（不綁倉庫、不算庫存），供「🗂️ Katalog Supplier」分頁關鍵字搜尋用 | ✅ 已執行（正式庫） |
| `MIGRATION_STOCK_KEEP_INACTIVE.sql` | 重建 `din_stock_summary`/`sja_stock_summary` 視圖：保留「停產(is_active=false)但庫存≠0」的產品並回傳 `is_active`，讓停產餘貨仍可見、可出清（不再隱形） | 🆕 2026-07 新增 — 需在 Supabase SQL Editor 執行一次（前端已相容，未套用前行為同現況） |
| `MIGRATION_SUPPLIER_WHATSAPP.sql` | `items`/`product_refs` 各加 `supplier_whatsapp` 欄位，供應商連結旁多存一組 WhatsApp 號碼 | 🆕 2026-07 新增 — 需在 Supabase SQL Editor 執行一次（未套用前該欄位存不進去，前端會靜默失敗） |
| `MIGRATION_ITEMS_REMARK.sql` | items 補建 `remark`（備註）欄位——品項表單「📝 Catatan」和低庫存「🔕 不要提醒」都早就假設這欄存在，但從沒建過，一直被 `sbInsertSafe`/`sbUpdateSafe` 靜默丟棄 | 🆕 2026-07 新增 — **急件，需在 Supabase SQL Editor 立刻執行一次**，且須排在 `MIGRATION_SEED_DIN_MATERIALS.sql` 之前（否則 seed 會報 `column "remark" does not exist`） |
| `MIGRATION_SEED_DIN_MATERIALS.sql` | 一次性資料建檔：DENIKIN 倉包裝材料 12 項＋食品原料 9 項（含分類標籤），初始庫存 0、最低警戒線 10，待現場實際收貨/盤點填入真實數量 | ✅ 已合併（PR #31），需在 Supabase SQL Editor 執行一次（純資料 seed，可安全重複執行），**須排在 `MIGRATION_ITEMS_REMARK.sql` 之後** |
| `MIGRATION_PCS_PER_CTN.sql` | items 加 `pcs_per_ctn` 欄位（1 箱＝幾 pcs），讓 Masuk / Opname 表單可填「箱數」自動算出總 pcs，跟 SJA 生產模組既有機制相同、套用到一般庫存品項；順便補 DIN 的 `ctn-din5`/`BAG5` 兩項箱裝比例值 | 🆕 2026-07 新增 — 需在 Supabase SQL Editor 執行一次，**須排在 `MIGRATION_SEED_DIN_MATERIALS.sql` 之後**（未套用前該欄位存不進去，前端會靜默失敗） |
| `MIGRATION_QC_FINISHED_GOODS.sql` | `din_production`/`sja_production` 加成品批 QC 欄位（qc_status/qc_date/qc_inspection_no/qc_judged_by/qc_note），FQMS 成品檢驗回寫＋出貨畫面 Hold 攔截用 | 🆕 2026-07 新增 — 需在 Supabase SQL Editor 執行一次，並重新部署 `qc-lookup`/`qc-status` 兩支 Edge Function（`supabase functions deploy qc-lookup qc-status`）。前端已降級相容，未跑 migration 前 FIFO/出貨照常運作（全部視為未檢驗） |
