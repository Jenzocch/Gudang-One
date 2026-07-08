# 三系統串接計劃書 — Gudang One × FAMMS × FQMS
**版本:** 2.0
**日期:** 2026-07-08（v2 補：完整四線拓撲＋現況盤點）
**原則:** 資料連動即可、不共庫、不同步、系統不變重
**給誰看:** 接手 FQMS 開發的 AI（照第五章動工）＋ Gudang One session（照第四章動工）＋ FAMMS setup session（照 §0.3 收尾）

---

# 〇、v2 現況盤點 ★先讀這段

四條線的完整拓撲（使用者 2026-07-08 定案）：

```
FAMMS ──① 叫料推送──────→ Gudang One ←──② QC狀態回寫── FQMS
  ↑                          │
  └──③ 叫料單狀態/qc_result 回寫┘
FQMS ──④ 查 machine-status（唯讀，只看機器能不能跑）──→ FAMMS
```

## 0.1 四線現況（重要：多數已建好，只是散在不同分支）

| 線 | 方向與目的 | 接收端程式碼 | 密鑰（header/env） | 狀態 |
|---|---|---|---|---|
| **①** 叫料推送 | FAMMS→Gudang，缺料開單 | Gudang `famms-request` | `x-famms-secret` / `FAMMS_WEBHOOK_SECRET`⇄`GUDANG_WEBHOOK_SECRET` | ✅ **main + 已部署 + 已通** |
| **②** QC狀態回寫 | FQMS→Gudang，批次變 Hold/Pass | Gudang `qc-lookup`+`qc-status` | `x-qc-secret` / `QC_WEBHOOK_SECRET`⇄`GUDANG_QC_SECRET` | Gudang✅main+部署；FQMS端待做 |
| **③** 叫料單/qc_result 回寫 | Gudang→FAMMS，回報到貨與QC結果 | FAMMS `POST /api/external/parts-requests` | `Bearer` / `GUDANG_SYNC_SECRET` | ⚠️ **接收端已建，在 FAMMS PR#5 未合併分支**；Gudang觸發端未建 |
| **④** machine-status | FQMS→FAMMS，查機器能不能跑 | FAMMS `GET /api/external/machine-status` | `Bearer` / `QC_API_SECRET` | ⚠️ **接收端已建，在 FAMMS PR#5 未合併分支**；FQMS呼叫端未建 |

**關鍵事實**：③④ 的 FAMMS 接收端**早就寫好了**，是 `claude/famms-setup-oyy62h`（PR #5）這個 session 做的，跟本計劃書設計幾乎一致。它們現在卡在那個**尚未合併進 main 的大分支**上。

## 0.2 ③④ 接收端的實際契約（給 FQMS / Gudang 觸發端對接用）

**④ machine-status（FQMS 呼叫）**
```
GET /api/external/machine-status?factory_code=DIN&machine_code=HMG-001
headers: { Authorization: "Bearer <QC_API_SECRET>" }
回應: { machine_code, machine_name, factory_code, status,
        maintenance_ok, pm_overdue_count, last_pm_completed_at,
        health_score, open_incident_count }
錯誤: 401 密鑰 / 400 缺參數 / 404 找不到廠或機台
```

**③ parts-requests 寫回（Gudang 觸發端呼叫）**
```
POST /api/external/parts-requests
headers: { Authorization: "Bearer <GUDANG_SYNC_SECRET>" }
body: { request_id,                      ← FAMMS 端 parts_requests 那筆的 id（非 Gudang 的）
        status?: 'ordered'|'received'|'rejected',
        qc_result?: 'passed'|'failed'|null,
        external_ref? }                  ← 存 Gudang 自己的 request id
回應: { ok:true, request:{...} }  錯誤: 401 / 400 / 404
```

## 0.3 唯一的真正待辦：PR #5 收斂（歸 FAMMS setup session）

③④ 要真正生效，`claude/famms-setup-oyy62h`（PR #5）必須合併進 main。但那個分支同時帶著 `parts_requests` 表 ＋ **手動輸入面板**（`/api/parts-requests`），這面板跟已在 main 的 `GudangRequest`（線①送出）**功能重疊**，就是先前造成 401／schema 混亂的根源。

**收斂原則（建議給 FAMMS setup session）：**
1. **送出路徑以 main 的 `GudangRequest` 為準** — 它真的會送到 Gudang。刪掉重複的手動輸入面板 `PartsRequestPanel` 與 `POST /api/parts-requests`。
2. **保留 `parts_requests` 表當「本地追蹤記錄」** — 但改由 `GudangRequest` 送出成功後寫入一筆（存 Gudang 回傳的 `request_id`＋incident_id＋摘要＋status），不是手動建。
3. **保留 `external/parts-requests` 寫回接收端**（線③）與 `external/machine-status`（線④）。
4. 其餘 PR#5 好料（月報、SLA cron、知識庫、PM checklist）照常合併。

## 0.4 Gudang 端剩餘工作（線③ 觸發端，歸 Gudang session）

線③ 要閉合，Gudang 這邊要在「FAMMS 來的叫料單狀態變動時」回呼 FAMMS：
1. `famms-request` 寫 `requests` 時多存兩欄：`source='famms'`、`external_ref`=FAMMS parts_requests 的 id（需 FAMMS 送叫料時把它的 id 一起帶過來 → 線①payload 加一欄 `famms_request_id`）。
2. index.html 的 `updReq`／`approveReqBuy` 狀態變動時，若 `source='famms'` → 呼叫新的 Gudang Edge Function（伺服器端持 `GUDANG_SYNC_SECRET`）→ POST FAMMS `external/parts-requests`。
3. qc_result：FQMS 呼 `qc-status` 讓批次變 Pass/Fail 時，若該批綁著 FAMMS 叫料單，一併回呼 FAMMS 帶 `qc_result`。
> 這段會動到 index.html 大檔＋新增一個 migration（requests 加兩欄）＋新 Edge Function，屬 P2，等 PR#5 收斂後再做。

## 0.5 四把密鑰總表（別搞混）

| 通道 | 方向 | header | Gudang 端 secret | 對方端 secret |
|---|---|---|---|---|
| ① 叫料 | FAMMS→Gudang | `x-famms-secret` | `FAMMS_WEBHOOK_SECRET` | FAMMS `GUDANG_WEBHOOK_SECRET` |
| ② QC | FQMS→Gudang | `x-qc-secret` | `QC_WEBHOOK_SECRET` | FQMS `GUDANG_QC_SECRET` |
| ③ 寫回 | Gudang→FAMMS | `Bearer` | （Gudang 觸發端持）FAMMS的 | FAMMS `GUDANG_SYNC_SECRET` |
| ④ 機況 | FQMS→FAMMS | `Bearer` | — | FAMMS `QC_API_SECRET`（FQMS 也持同串） |

---

# 一、三系統定位（一句話分工，永不越界）

| 系統 | 管什麼 | 不管什麼 | 技術 |
|---|---|---|---|
| **Gudang One** | 物料的「數量與位置」：庫存、批次、進出、生產、出貨、叫料單 | 品質判定邏輯、設備 | 單檔 index.html + Supabase A |
| **FAMMS** | 機台的「健康」：故障工單、保養排程、知識庫 | 庫存數量、品質 | Next.js + Supabase B |
| **FQMS** | 物料/產品的「品質判定」：檢驗、規格、NCR、批次 Hold | 庫存數量、領發料、設備維修 | Next.js + Supabase C（建置中） |

三個系統 = 三個獨立 Supabase 專案、三套帳號。**永遠不共用資料庫**，只互傳「事件」和「查詢」。

# 二、共同語言（串接的最小公約數）

跨系統只靠四種「人看得懂的編號」對話，任何一筆跨系統資料都帶著它們：

| 編號 | 例子 | 誰發的 | 誰引用 |
|---|---|---|---|
| **批號 lot_no** | `NC-260707-A1` | Gudang One 收料/生產時建 | FQMS 檢驗單掛它做追溯 |
| **工單號** | `INC-2026-0042` | FAMMS | Gudang 叫料單的備註裡 |
| **檢驗單號** | `QC-20260707-001` | FQMS | Gudang 批次 QC 狀態變更的稽核記錄裡 |
| **廠區/倉庫碼** | `DIN→DENIKIN / SJA→SJA / OLT→OLENTIA` | 固定對照表 | 三邊都用 |

> 這個設計的保險：就算所有 webhook 都掛了，拿編號人工對照三邊資料，追溯照樣成立。

# 三、串接總圖（三條線，每條 = 一支小函式）

```
        ①叫料（✅已上線）
FAMMS ──────────────────────→ Gudang One
  │                            ↑      │
  │ ③品質異常開工單             │      │
  │  （Phase 2 預留）           │②a 批號查詢（本計劃）
  ↓                            │      ↓
FQMS ──────────────────────────┘   ②b QC狀態回寫（本計劃）
        FQMS ↔ Gudang One
```

**設計鐵律（保持輕量的關鍵）：**
1. 每條線 = 一個 HTTP webhook：共享密鑰（`x-*-secret` header、常數時間比較）＋ 欄位白名單＋長度上限 — 與已上線的 famms-request 完全同一模式
2. 壞了不互拖：任何一邊掛掉，另外兩邊照常運作；通知一律 best-effort
3. 拔掉任何一條線，三個系統各自仍是完整產品
4. 不做訊息佇列、不做即時同步、不做共用登入 — 出現這些字眼就是超做了

# 四、線②：FQMS ↔ Gudang One（本計劃的實作重點）

## 業務邏輯（為什麼要這兩條）

- **②a 批號查詢**：QC 檢驗員開進料檢驗（IQC）時，原料批已經在 Gudang One 建檔了。與其手抄批號（會抄錯），不如按一顆「從倉庫帶入」直接選批 — 供應商、到貨日、數量全部自動帶入。
- **②b QC 狀態回寫**：QC 判定不合格後，最大的風險是**倉庫不知道，照發料**。Gudang One 的 `item_batches` 表**已有** `qc_status` 欄位（Pending⏳/Pass✓/Hold⏸/Fail✗）且 UI 已有現成徽章 — 回寫這個欄位，倉庫畫面立刻變色，零前端改動。

## ②a `qc-lookup` — Gudang One 端新 Edge Function（唯讀）

```
POST https://klswfuzuhlowzrbncreu.supabase.co/functions/v1/qc-lookup
headers: { "x-qc-secret": <QC_WEBHOOK_SECRET>, "Content-Type": "application/json" }

請求 body（兩種用法）:
  { "lot_no": "RM-260705-01" }                       ← 精確查一筆
  { "warehouse": "DENIKIN", "days": 14 }             ← 最近N天批次清單（給下拉選）

回應:
  { "ok": true, "batches": [{
      "id": "...",              ← gudang 的 batch id（回寫時要用，FQMS 存進 source_ref）
      "lot_no": "RM-260705-01",
      "item_name": "Tapioca Starch",
      "unit": "kg",
      "supplier_name": "PT XYZ",
      "po_no": "PO-123",
      "production_date": "2026-07-01",
      "expiry_date": "2027-07-01",
      "qty_initial": 500, "qty_remaining": 380,
      "qc_status": "Pending",
      "warehouse_id": "DENIKIN",
      "received_date": "2026-07-05"
  }]}

錯誤: 401 密鑰錯 / 400 參數錯 / 404 lot_no 查無
實作: service_role 查 item_batches join items（唯讀，不寫任何東西）
```

## ②b `qc-status` — Gudang One 端新 Edge Function（回寫）

```
POST https://klswfuzuhlowzrbncreu.supabase.co/functions/v1/qc-status
headers: { "x-qc-secret": <QC_WEBHOOK_SECRET>, "Content-Type": "application/json" }

請求 body:
  {
    "batch_id": "<qc-lookup 回的 id>",      ← 優先用 id；沒有時用 lot_no+warehouse
    "qc_status": "Hold",                    ← 只允許 Pass / Hold / Fail / Pending
    "inspection_no": "QC-20260707-001",     ← FQMS 檢驗單號（追溯用，必填）
    "judged_by": "Budi (QC Supervisor)",
    "note": "pH 5.1 超標，NCR-20260707-01"   ← 選填
  }

動作:
  1. 更新 item_batches.qc_status + qc_date
  2. 寫 audit_log（actor='FQMS:'+judged_by, action='qc_status',
     summary=inspection_no+' → '+qc_status）— 誰改的、依據哪張檢驗單，全留痕
  3. qc_status 為 Hold/Fail 時 → Telegram 通知倉庫群
     「⏸ Batch RM-260705-01 (Tapioca Starch) di-HOLD oleh QC — jangan dipakai! QC-20260707-001」
  4. 回 { "ok": true }

錯誤: 401 / 400（不合法狀態值）/ 404（批次不存在）
```

## FQMS 端整合點（3 個，詳見第五章）
1. env 兩個變數（只在伺服器端）
2. 一個 proxy API route
3. 檢驗流程兩個掛鉤（開單帶入、判定回寫）

# 五、給 FQMS 接手 AI 的實作指示

> 你的主線任務（檢驗執行流程）不變，照 HANDOFF 文件做。以下是做到對應畫面時**順手掛上**的串接點，總量約 1 個 API route + 2 個掛鉤，半天內完成。

## 5.1 環境變數（Vercel，只在伺服器端用）
```
GUDANG_QC_URL=https://klswfuzuhlowzrbncreu.supabase.co/functions/v1
GUDANG_QC_SECRET=<使用者會給你，與 Gudang 端 QC_WEBHOOK_SECRET 同一串>
```
**密鑰絕不進瀏覽器** — 全部經過你的 server route 轉發。

## 5.2 建 `/api/gudang/lookup`（proxy route）
- 模式照抄概念：登入檢查（getCurrentUser）→ 伺服器端 fetch `${GUDANG_QC_URL}/qc-lookup`（帶 `x-qc-secret`）→ 原樣回傳白名單欄位
- FQMS 是獨立系統，**不要 import FAMMS 的程式碼**，自己寫一份（很短）

## 5.3 掛鉤①：IQC 開單畫面「從倉庫帶入」
- 你做 `/inspect` Step 2（選產品+批號）時，進料檢驗（stage=incoming）的批號欄位旁加一顆按鈕「📦 Ambil dari Gudang」
- 點了 → 呼叫 `/api/gudang/lookup`（warehouse 依廠區、days=14）→ 彈出批次清單（顯示 lot_no + 品名 + 供應商 + 到貨日）→ 選一筆
- 選定後：建 FQMS `batches` 一筆（`batch_type='incoming_lot'`, `batch_no`=lot_no, `supplier` 帶入），並把 `{gudang_batch_id, lot_no, warehouse}` 存進該表可用的 JSONB 欄位（schema 的 `source_ref` 插座正是為此準備的；若 batches 表沒有就存 `parent_batch_ids` 旁新加欄位，看 schema.sql 現況決定，不要改核心結構）
- 查不到/網路失敗 → 靜默降級成手動輸入批號，**不阻斷檢驗流程**

## 5.4 掛鉤②：判定結果回寫
在這兩個時機，若該批的 source_ref 有 `gudang_batch_id`，伺服器端 POST `${GUDANG_QC_URL}/qc-status`：

| FQMS 事件 | 送出的 qc_status |
|---|---|
| 檢驗單 approved 且 overall_result=pass | `Pass` |
| 檢驗單有 fail 項（自動開 NCR 時） | `Hold` |
| NCR 處置定案 = reject / return_to_supplier | `Fail` |
| 複驗（re_inspection）合格、解除 Hold | `Pass` |

- 回寫失敗：toast 警告「Gudang 未同步，請稍後重試」＋ 在該檢驗單上顯示可重按的「重新同步」鈕。**回寫失敗不影響 QC 單本身的狀態**。

## 5.5 預留（記欄位，不實作）
- NCR 表單加選填欄位 `machine_code`（文字即可）— 品質問題疑似設備造成時記機台碼。Phase 2 會用它一鍵開 FAMMS 工單（線③），現在只收資料。

## 5.6 明確不做
- ❌ 不查/不改 Gudang 庫存數量（qty 系列欄位只讀顯示）
- ❌ 不做領料單串接、不建 Gudang 的任何資料（除了 qc_status）
- ❌ 不共用帳號；FQMS 使用者與 Gudang 使用者無關
- ❌ 不做輪詢同步（只有動作觸發時才打 API）

# 六、部署順序（使用者操作，跟 famms-request 流程一模一樣）

1. **Gudang 端**（Gudang One session 會把兩個函式寫好放在 `supabase/functions/qc-lookup/` 和 `supabase/functions/qc-status/`）：
   ```
   產生密鑰（64字元）→
   supabase secrets set QC_WEBHOOK_SECRET="<密鑰>"
   supabase functions deploy qc-lookup
   supabase functions deploy qc-status
   ```
2. **FQMS 端**：Vercel 設 `GUDANG_QC_URL` + `GUDANG_QC_SECRET`（同一串）→ redeploy
3. **測試清單**：
   - [ ] Gudang One 建一筆測試批（lot_no 隨意，qc_status=Pending）
   - [ ] FQMS IQC 開單 →「從倉庫帶入」看得到該批
   - [ ] 填一筆不合格 → 送出 → Gudang One 批次畫面該批變 ⏸ Hold（黃色）
   - [ ] Telegram 群收到 HOLD 警告
   - [ ] 主管處置後複驗合格 → 批次回 ✓ Pass（綠色）

# 七、線③ FQMS → FAMMS（Phase 2，本階段不做）

品質異常源自設備（封口不良→封口機）時，NCR 一鍵開 FAMMS 工單。前置已埋好：FQMS 的 NCR 記 machine_code（5.5 節）、FAMMS 已有 incident 建立 API。等 FQMS Phase 1 驗收過後再做，一個 webhook 的事。

# 八、三系統日常運轉走一遍（驗證使用邏輯）

1. **原料到貨**：倉庫在 Gudang One 收料建批（qc_status=Pending⏳）→ QC 手機開 FQMS IQC、「從倉庫帶入」選批 → 檢驗 → 不合格 → FQMS 自動開 NCR、Gudang 該批變 Hold⏸、倉庫 Telegram 收到「不得領用」→ **不會誤發不合格原料**
2. **生產出貨**：Gudang One 現有流程完全不變；成品 FQC 在 FQMS 做，批號用共同規則對照
3. **機台故障**：FAMMS 開工單 → 缺零件 →「向倉庫叫料」→ Gudang Permintaan + Telegram（✅ 已上線）
4. **設備性品質問題**：QC 在 NCR 記機台碼 →（Phase 2）一鍵開 FAMMS 工單 → 修好 → 複驗 → 解除 Hold

每一步裡，每個系統只做自己的事，交接處只傳一個編號＋一個狀態。**這就是「無縫但不重」**。
