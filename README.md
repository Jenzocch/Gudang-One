# Gudang One — 倉庫 / 生產 / QC 管理系統

Gudang One 是為四個倉庫（gudang）打造的一站式管理系統，涵蓋庫存（stok）、進貨（masuk）、領料（ambil）、出貨（pengiriman）、叫貨申請（permintaan）、生產（produksi）與品管（QC）：

| 倉庫 | 說明 |
|---|---|
| **DENIKIN** | 椰果（nata de coco）工廠：復水（rehidrasi）→ 生產切割 → 出貨 |
| **SJA** | 飲料原料工廠：珍珠、粉類、糖漿、果醬等 |
| **HARDWARE** | 五金 / 耗材倉 |
| **OLENTIA** | 一般倉庫 |

---

## 系統架構

```
瀏覽器（手機 / 電腦，支援 PWA 安裝）
   │
   ├── index.html ←—— 部署在 Vercel（純靜態；HTML+CSS+JS 全部內含在單一檔案）
   │
   └── Supabase（專案 ref: klswfuzuhlowzrbncreu）
         ├── PostgreSQL     —— 所有資料表（SQL 見 migrations/）
         ├── Edge Functions —— PIN 驗證、people 寫入、Telegram、外部系統串接（見下表）
         └── Storage        —— item-photos bucket（商品 / 單據照片）
```

- **前端**：單一 `index.html`，無 build step、無框架，push 即部署。
- **後端**：Supabase。機密（PIN、Telegram token、webhook secret）全部放在 Edge Function secrets，前端看不到。

## 登入方式

| 角色 | 登入 | 權限 |
|---|---|---|
| **Super Admin** | 6 位數 PIN（後端 `verify-admin` 驗證） | 最高權限：全部倉庫、員工與權限管理、出貨與分析 |
| **Admin Office** | 6 位數 PIN（同上，另一組） | 辦公室協助角色：設定員工權限、維護產品資料；預設看不到出貨 / 分析 |
| **員工（Staf）** | 選名字 + 4 位數 PIN（後端 `verify-staff` 驗證） | 依個人 / 各倉庫（per-gudang）權限：Ambil、Masuk、Produksi… |
| **訪客（Tamu）** | 公開臨時 PIN | 受限的基本功能 |

## Edge Functions（`supabase/functions/`）

| 函式 | 用途 |
|---|---|
| `verify-admin` | 驗證 Super Admin / Admin Office 的 6 位數 PIN（PIN 存在後端 secret，常數時間比對） |
| `verify-staff` | 驗證員工 4 位數 PIN，回傳員工資料（不含 pin），前端不再下載整張 people 表 |
| `manage-people` | people 表新增 / 修改 / 刪除的唯一入口（service_role + admin PIN 授權，防前端提權） |
| `notify-telegram` | Telegram 推播代理：Bot Token 留在後端，前端只送訊息文字 |
| `famms-request` | 接收 FAMMS 維修系統叫料的 webhook：驗共享密鑰 → 寫入 requests（出現在 Permintaan 分頁，標記 source=famms）→ 推 Telegram |
| `famms-request-status` | 叫料單狀態回寫給 FAMMS（線①的反向）：Gudang One 核准/駁回後 best-effort 通知 FAMMS |
| `qc-lookup` | FQMS 品管系統的批號查詢入口（唯讀）：查單一批號或某倉最近批次 |
| `qc-status` | FQMS 品管系統的 QC 狀態回寫：更新 `item_batches.qc_status`，Hold/Fail 推 Telegram 警告並寫 audit_log；若該批連過 FAMMS 叫料，一併回饋 qc_result 給 FAMMS |

## 資料夾結構

```
index.html          前端全部（manifest.json / sw.js / icon.svg 為 PWA 資源，須留在根目錄）
supabase/functions/ Edge Functions（見上表）
migrations/         資料庫 SQL 遷移檔；migrations/README.md 列出每個檔案的用途與執行狀態
docs/               系統文件（功能說明、安全稽核、後台設定教學…）
apps-script/        Google Apps Script 備份通道原始碼（見 apps-script/README.md）
*.csv               批量匯入商品的範本檔
```

## 外部整合

- **Telegram 通知**：低庫存、叫貨、QC 不合格等事件經 `notify-telegram` 推播到倉庫群組。
- **FAMMS 叫料串接**：FAMMS（設備維修系統）工單需要零件時，POST 到 `famms-request` 自動建立叫貨申請；Gudang One 核准/駁回後經 `famms-request-status` 回饋狀態給 FAMMS（串接細節見 `docs/PLAN_3SYSTEM_INTEGRATION.md`）。
- **FQMS 品管串接**：FQMS 經 `qc-lookup` 帶入批號、經 `qc-status` 回寫檢驗結果。
- **Google Sheet 備份（舊通道）**：admin 面板的「📊 Backup ke Google Sheet」按鈕仍在使用。Apps Script 原始碼在 `apps-script/`，實際執行在 Google 端（各倉庫的 webhook URL 寫在 `index.html` 的 `GS_WEBHOOKS`）。

## 部署

- **前端**：`git push` 後 Vercel 自動部署（純靜態，服務 `index.html` 與根目錄資源）。
- **Edge Function**：改了 `supabase/functions/<name>/index.ts` 後需手動部署：

  ```bash
  supabase functions deploy <name>
  ```

- **資料庫**：新的 migration 在 Supabase Dashboard → SQL Editor 貼上執行（各檔案狀態見 `migrations/README.md`）。

## 文件

詳細文件在 `docs/`：功能總覽（`FITUR_SISTEM_ID.md`）、使用手冊（`PANDUAN_SISTEM.md`）、安全稽核（`SECURITY_AUDIT.md`、`TELEGRAM_SECURITY.md`、`RLS_PLAN.md`）、後台設定（`SETUP_CHECKLIST.md`、`SETUP_ADMIN_OFFICE.md`）等。
