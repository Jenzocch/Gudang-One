# 三系統串接計劃書 — Gudang One × FAMMS × FQMS
**版本:** 1.0
**日期:** 2026-07-07
**原則:** 資料連動即可、不共庫、不同步、系統不變重
**給誰看:** 接手 FQMS 開發的 AI（照第五章動工）＋ Gudang One session（照第四章動工）

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

# 三、串接總圖（五條線，每條 = 一支小函式）

```
        ①叫料（✅已上線）
FAMMS ──────────────────────→ Gudang One
  ↑  ↑                        ↑      │
  │  │①'狀態回寫（本次新增）    │      │
  │  └────────────────────────┘      │
  │ ③品質異常開工單             │      │
  │  （Phase 2 預留）           │②a 批號查詢（本計劃）
  ↓                            │      ↓
FQMS ──────────────────────────┘   ②b QC狀態回寫（本計劃）
  │        FQMS ↔ Gudang One          │
  │                                   │
  │④查 machine-status（唯讀，本次新增） │
  └──────────────→ FAMMS              │
                                (②b 觸發①'的 qc_result 回饋，見下)
```

| 線 | 方向 | 用途 | 狀態 |
|---|---|---|---|
| ① | FAMMS → Gudang One | 叫料推送 | ✅ 已上線 |
| ①' | Gudang One → FAMMS | 叫料單狀態回寫 + qc_result 回饋（①的反向） | 🆕 Gudang One 端已寫好（`famms-request-status` + `qc-status` 擴充），待部署；FAMMS 端接收點待建 |
| ②a | FQMS → Gudang One | 批號查詢 | 本計劃（見第四章） |
| ②b | FQMS → Gudang One | QC 狀態回寫 | 本計劃（見第四章） |
| ③ | FQMS → FAMMS | 品質異常開工單 | Phase 2 預留 |
| ④ | FQMS → FAMMS | 查 machine-status（唯讀，只看機器能不能跑） | 🆕 設計已定案（見第七章），待 FQMS/FAMMS 兩端實作 |

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

# 六、線①' 與線④：新增的兩條回饋線（2026-07-08 定案）

> 訪談定案：叫料狀態回饋是 Gudang One ↔ FAMMS 的事，**FQMS 不需要涉入**（多數 FAMMS
> 叫料是 HARDWARE 備品，本來就不在 FQMS 的食品品管範圍內）。machine-status 查詢是
> FQMS 主動要的資訊，用在 IPQC 開單前置確認。兩條線互不相干，分開設計。

## 6.1 線①'：Gudang One → FAMMS 叫料單狀態 / qc_result 回饋（線①的反向）

**現況缺口**：Gudang One 的 `requests`（Permintaan）表只有 `status`，核准時只是
加庫存 + 記一筆 `transactions`，**沒有連到 `item_batches`**（QC 狀態掛在這張表）。
所以「qc_result 回饋」只有在管理員刻意把某筆申請連到一個有 QC 狀態的批次時才有
資料可回饋 —— 多數叫料（備品）連不上，這是預期情況，不是漏做。

**Gudang One 端已完成（本次新增，尚未部署）：**

```
migrations/MIGRATION_FAMMS_CALLBACK.sql
  requests 表新增：
    source            'staff' | 'famms'（famms-request 建立時標記）
    source_ref        JSONB {work_order, machine_id, machine_name, requester}
    linked_batch_id   UUID → item_batches.id（選填，管理員手動連結才有值）

supabase/functions/_shared/famms-notify.ts
  共用的 notifyFamms(payload)：POST 到 FAMMS_CALLBACK_URL，
  header x-gudang-secret；FAMMS_CALLBACK_URL/SECRET 沒設就靜默跳過（不是錯誤）。

supabase/functions/famms-request-status/  🆕
  Gudang One 前端核准/駁回一筆 requests 後 best-effort 呼叫一次
  （sb.functions.invoke('famms-request-status',{body:{request_id}})）。
  函式自己查 source='famms' 才轉發，不是就靜默結束——前端不用也不能自己判斷。
  轉發內容：{ event:'request_status', request_id, work_order, machine_id, status }

supabase/functions/qc-status/  （擴充）
  更新 item_batches.qc_status 後，順便查有沒有 requests.linked_batch_id
  指到這批貨且 source='famms'，有的話一併回饋：
  { event:'qc_result', request_id, work_order, machine_id, batch_lot_no, qc_status, inspection_no }

index.html
  updReq() / confirmApproveReqBuy() 成功後各加一行 best-effort 呼叫
  famms-request-status（不擋主流程，失敗吞掉）。
```

**FAMMS 端待建（不在本次範圍，開 FAMMS session 時照這個合約做）：**

```
POST {FAMMS 自訂路徑，例如 /api/gudang-callback}
headers: { "x-gudang-secret": <FAMMS_CALLBACK_SECRET>, "Content-Type": "application/json" }
body 兩種 event：
  { "event": "request_status", "request_id": 123, "work_order": "INC-2026-0042",
    "machine_id": "M-01", "status": "approved" }
  { "event": "qc_result", "request_id": 123, "work_order": "INC-2026-0042",
    "machine_id": "M-01", "batch_lot_no": "RM-260708-01", "qc_status": "Hold",
    "inspection_no": "QC-20260708-001" }
```

**部署（Gudang One 端）：**
```
supabase secrets set FAMMS_CALLBACK_URL="https://<famms-domain>/api/gudang-callback"
supabase secrets set FAMMS_CALLBACK_SECRET="<與 FAMMS 端共享的密鑰>"
supabase functions deploy famms-request-status
supabase functions deploy qc-status   # 重新部署擴充後的版本
```
FAMMS 端密鑰/URL 沒設定前，這兩條回饋線是純粹的靜默 no-op —— Gudang One 和
FAMMS 各自的既有功能完全不受影響（符合「壞了不互拖」鐵律）。

## 6.2 線④：FQMS → FAMMS 查 machine-status（唯讀）

**用途（訪談定案）**：IPQC（製程檢驗）開單前置確認 —— 機台如果正在故障/維修中，
這次抽樣檢驗沒有意義，檢驗員開單前應該先看到警示。

**這條線與 Gudang One 無關**，是 FQMS ↔ FAMMS 直接對話，不經過 Gudang One。
Gudang One 這個 repo 不需要改動。

**FAMMS 端待建：**
```
GET {FAMMS 自訂路徑，例如 /api/machine-status?machine_code=M-01}
headers: { "x-fqms-secret": <共享密鑰> }
回應: { "ok": true, "machine_code": "M-01", "status": "running" | "down" | "maintenance",
        "updated_at": "2026-07-08T09:00:00Z" }
```

**FQMS 端待建（下個 FQMS session 做）：**
- `/api/famms/machine-status` proxy route（伺服器端夾密鑰，模式比照 §五 `/api/gudang/lookup`）
- IPQC 開單畫面：開單前呼叫此 route；`status !== 'running'` 時顯示警示但**不阻斷**
  （查不到/逾時一律降級成允許繼續，比照 §5.3 掛鉤①「查不到就靜默降級」的原則）

# 七、部署順序（使用者操作，跟 famms-request 流程一模一樣）

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

# 八、線③ FQMS → FAMMS（Phase 2，本階段不做）

品質異常源自設備（封口不良→封口機）時，NCR 一鍵開 FAMMS 工單。前置已埋好：FQMS 的 NCR 記 machine_code（5.5 節）、FAMMS 已有 incident 建立 API。等 FQMS Phase 1 驗收過後再做，一個 webhook 的事。

# 九、三系統日常運轉走一遍（驗證使用邏輯）

1. **原料到貨**：倉庫在 Gudang One 收料建批（qc_status=Pending⏳）→ QC 手機開 FQMS IQC、「從倉庫帶入」選批 → 檢驗 → 不合格 → FQMS 自動開 NCR、Gudang 該批變 Hold⏸、倉庫 Telegram 收到「不得領用」→ **不會誤發不合格原料**
2. **生產出貨**：Gudang One 現有流程完全不變；成品 FQC 在 FQMS 做，批號用共同規則對照
3. **機台故障**：FAMMS 開工單 → 缺零件 →「向倉庫叫料」→ Gudang Permintaan + Telegram（✅ 已上線）→ Gudang 核准/駁回後回饋狀態給 FAMMS（線①'，🆕 本次新增）
4. **設備性品質問題**：QC 在 NCR 記機台碼 →（Phase 2）一鍵開 FAMMS 工單 → 修好 → 複驗 → 解除 Hold
5. **IPQC 前置確認**：QC 開製程檢驗單前，FQMS 先查該產線機台是否運轉中（線④，🆕 本次新增）→ 機台故障中就提醒檢驗員，但不阻斷（可能就是要驗故障排除後的第一批）

每一步裡，每個系統只做自己的事，交接處只傳一個編號＋一個狀態。**這就是「無縫但不重」**。
