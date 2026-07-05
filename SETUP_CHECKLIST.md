# Gudang One — Supabase 待執行清單

> 前端都已上線。以下是需要你在 Supabase 後台做的動作，才能讓新功能完整生效。
> 所有 SQL 都用 `IF NOT EXISTS` 寫法，**可以安全重複執行**——不確定跑過沒就再跑一次，不會壞。

---

## A. SQL（Supabase → 左側 SQL Editor → New query → 貼上 → Run）

依序執行這四個檔案的內容（在專案裡打開檔案複製全部）：

| 順序 | 檔案 | 用途 | 不跑會怎樣 |
|---|---|---|---|
| 1 | `MIGRATION_SJA_CLEAN.sql` | 建 SJA 283 個產品＋20 客戶＋生產/出貨表 | SJA 模組整個不能用 |
| 2 | `MIGRATION_ADD_SPEC.sql` | 商品加「規格」欄位 | 商品規格填了存不進去 |
| 3 | `MIGRATION_SCHEMA_SAFETY.sql` | 批次補單價/供應商欄＋交易修改紀錄表 | 入庫的單價/供應商存不進、修改軌跡不留存 |
| 4 | `MIGRATION_APP_CONFIG.sql` | Admin Office 臨時開放開關的設定表 | Super 的「開放 Office 看出貨」開關會報錯 |

執行成功會顯示 `Success. No rows returned`。

---

## B. Edge Functions（Admin Office 三層權限用）

### B-1. 設定兩組 PIN（secret）

Super Admin 和 Admin Office 各一組 6 位數 PIN。用 Supabase CLI：

```bash
supabase secrets set ADMIN_PIN="你的SuperPIN6碼"     # 若之前設過可跳過
supabase secrets set OFFICE_PIN="給Office的6碼"       # 新增這組
```

> 沒有 CLI 的話：Supabase Dashboard → Edge Functions → Manage secrets → 新增 `OFFICE_PIN`。
> 兩組 PIN 要不一樣。知道 `ADMIN_PIN` = Super Admin；知道 `OFFICE_PIN` = Admin Office。

### B-2. 重新部署兩個函式（程式已更新，含雙 PIN + Office 防提權）

```bash
supabase functions deploy verify-admin
supabase functions deploy manage-people
```

> 沒 CLI：Dashboard → Edge Functions → 各自 → 把 `supabase/functions/verify-admin/index.ts`、
> `supabase/functions/manage-people/index.ts` 的內容貼上覆蓋 → Deploy。

---

## 做完後驗證

1. **SJA**：登入 → 進 SJA 倉庫 → 產品/庫存/生產/出貨都有資料 ✅
2. **Super Admin**：登入畫面最下方紅色「🔐 Super Admin」→ 輸你的 Super PIN → 看得到全部 ✅
3. **Admin Office**：登入畫面中間「🏢 Admin Office」→ 輸 Office PIN → 能設員工權限、填產品，但**看不到出貨/分析** ✅
4. **臨時開放**：Super 進「Kelola Orang」頂部有「🚚 Admin Office lihat pengiriman」ON/OFF 開關 ✅

---

## 早期 migration（如果系統已在用，這些應該早跑過了，列此備查）

`MIGRATION_TABLES` `PRESERVE_DATA` `PROTECT_PIN` `PERMISSIONS` `PERMS_PER_GUDANG`
`LOCK_PEOPLE_WRITE` `CATEGORIES` `migration_is_admin` `STORAGE_BUCKET` `DIN_PRODUCTION`

> `MIGRATION_PRODUCTION_SYSTEM.sql` 是舊的未使用檔案（有型別錯誤，前端沒用到），**不要執行**。
