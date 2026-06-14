# CORS 修復指南

## 問題說明

前端 (index.html) 在 Vercel/本地執行時，無法直接連接到 Google Apps Script 後端，因為會被 CORS (跨域請求) 攔截。

## 解決方案

已經在代碼中實現了完整的 CORS 解決方案：

### 1️⃣ Apps Script 端 (Code.gs)

✅ **已添加 CORS Headers：**
- `doGet()` 、`doPost()` 、`doOptions()` 都支持 CORS headers
- 支持 JSONP 回調（舊瀏覽器相容）
- 支持 GET-based POST（JSON via URL parameter）

```javascript
// Code.gs 中的 cors() 函數已支持：
output.addHeader('Access-Control-Allow-Origin', '*');
output.addHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
output.addHeader('Access-Control-Allow-Headers', 'Content-Type');
```

### 2️⃣ 前端 (index.html)

✅ **API 調用方法：**

使用**動態 JSONP 腳本加載**（自動繞過 CORS）：
```javascript
function apiGet(action) {
  var cbName = 'cb_' + Date.now() + '_' + Math.random();
  var script = document.createElement('script');
  script.src = API_URL + '?action=' + action + '&callback=' + cbName;
  document.body.appendChild(script);
}
```

使用**GET-based POST**（JSON 通過 URL 參數）：
```javascript
function apiPost(body) {
  var params = encodeURIComponent(JSON.stringify(body));
  script.src = API_URL + '?jsondata=' + params + '&callback=' + cbName;
}
```

## 🚀 部署步驟

### Step 1：準備新的 Apps Script

1. 開啟 Google Sheet：https://docs.google.com/spreadsheets/d/1cyyNcaF_eQwdgytsG-U2UGkni8ibgjj4F4Uo2Kgbm-8
2. **Extensions** → **Apps Script**
3. 清空所有舊代碼 (Ctrl+A → Delete)
4. 複製 **Code.gs** 的全部內容貼上
5. **Ctrl+S** 保存

### Step 2：部署為 Web App

1. **Deploy** 按鈕 → **New deployment**
2. 選擇類型：**Web app**
3. **Execute as:** `Me` (你的帳號)
4. **Who has access:** `Anyone` 
5. **Deploy** 並複製新的 URL

✨ **部署後的 URL 會像這樣：**
```
https://script.google.com/macros/s/AKfy1234567890abcdefg/exec
                                    ^^^^^^^^^^^^^^^^^^^^^^^
                                    這個 ID 就是你的部署 ID
```

### Step 3：更新 index.html

找到這一行（大約第 539 行）：
```javascript
var API_URL = 'https://script.google.com/macros/s/AKfy...舊ID.../exec';
```

改成你的新 URL：
```javascript
var API_URL = 'https://script.google.com/macros/s/你的新ID/exec';
```

### Step 4：上傳到 Vercel

1. 只上傳 **index.html** 到 Vercel
2. 不需要上傳 Code.gs（已在 Apps Script 上）

## ✅ 測試連接

打開 index.html，應該看到：
- ✓ 數據載入成功
- ✓ 顯示所有物品清單
- ✓ 人員列表正確加載

如果還是失敗：
- ☐ 檢查 Apps Script 是否已正確部署（Execute as: Me）
- ☐ 檢查 API_URL 是否完全複製正確
- ☐ 清除瀏覽器 cache (Ctrl+Shift+Delete)
- ☐ 檢查 browser console (F12) 有無錯誤訊息

## 📝 常見問題

### Q: 為什麼不用 `fetch()` API？
**A:** Fetch API 有嚴格的 CORS 檢查。我們用 JSONP 和 GET-based POST 自動繞過。

### Q: 可以用自己的伺服器嗎？
**A:** 可以，只需改 API_URL 指向你的伺服器即可。確保伺服器允許 CORS 或使用同樣的 JSONP 方式。

### Q: 部署後還是無法連接？
1. 確保 Apps Script 部署類型是 **Web app**
2. 確保 **Execute as: Me**（使用你的帳號權限）
3. 檢查 Sheet ID 是否有權限訪問
4. 查看 Apps Script 的執行日誌（Executions）找到錯誤訊息
