# 設定 Admin Office（第二組管理員）

系統現在有兩種管理員，各用一組獨立 PIN：

| 角色 | PIN 來源 | 權限 |
|------|---------|------|
| **Super Admin** | `ADMIN_PIN`（已設定） | 全部：管人員、設 admin、看所有倉庫、出貨、分析 |
| **Admin Office** | `OFFICE_PIN`（要新設） | 設「一般員工」權限＋填產品資料；看不到出貨/分析；不能把人設成 admin |

## 啟用步驟（Supabase）

1. **設定 Office PIN**（換成你要的 6 位數，跟 Super 的不一樣）：
   ```
   supabase secrets set OFFICE_PIN="640728"
   ```
   （或到 Supabase → Edge Functions → Secrets 手動加一個 `OFFICE_PIN`）

2. **重新部署兩個函式**（已更新支援雙 PIN）：
   ```
   supabase functions deploy verify-admin
   supabase functions deploy manage-people
   ```

3. 完成。登入畫面中間會有「🏢 Admin Office」鈕，用 `OFFICE_PIN` 登入。

## 後端安全（已強制，不靠前端）

- `verify-admin`：分辨 super/office 兩組 PIN，回傳角色
- `manage-people`：office 的 PIN 授權時，**強制** `is_admin=false`（insert）、**拒絕**任何改 `is_admin` 的請求（update）——就算有人繞過前端，office 也無法把人提權成 admin

## 之後想調整

- 不想要 office 了：把 `OFFICE_PIN` secret 刪掉即可，登入鈕還在但無效
- 換 office PIN：重設 `OFFICE_PIN` secret（不用改程式）
