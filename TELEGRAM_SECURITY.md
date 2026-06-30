# Telegram 通知安全化（token 移到後端）

## 為什麼

舊版把 `TG_TOKEN` 明文寫在 `index.html`，任何人 F12 看原始碼就能拿到，
可冒充 bot 發訊息。已改成：**token 只存在 Supabase Edge Function 的 secret，
前端完全不持有 token**。

## 部署步驟（一次性）

### 1. 撤銷舊 token、產生新 token
- Telegram 找 **@BotFather** → `/revoke` → 選你的 bot → 取得**新 token**
- 舊 token 立即失效，外洩那個就廢了

### 2. 設定 Supabase secrets
在專案目錄執行（需先 `supabase login` 並 `supabase link`）：

```bash
supabase secrets set TELEGRAM_BOT_TOKEN="貼上新的token"
supabase secrets set TELEGRAM_CHAT_IDS="5003966994,6860586246,8388678925,5097723576"
```

> CHAT_IDS 是原本前端 TG_IDS 那 4 個，用逗號分隔。要增減收訊人改這裡即可。

### 3. 部署 Edge Function

```bash
supabase functions deploy notify-telegram
```

### 4. 完成
前端 `sendTelegram()` 已改成呼叫 `notify-telegram`，部署後低庫存通知照常運作，
但 token 不再出現在任何前端代碼。

## 測試

在瀏覽器 Console：

```js
sb.functions.invoke('notify-telegram', { body: { msg: '✅ 測試訊息' } })
  .then(console.log);
```

收到訊息 = 成功。若回 `TELEGRAM_BOT_TOKEN belum di-set` → secret 沒設好。

## 注意

- 若設好新 token 後，每天 8:21 那種定時通知**還在用舊 token**（會失敗/或仍送出），
  代表另有一個 Google Apps Script 觸發器持有舊 token。撤銷舊 token 後它會失效，
  屆時去 Apps Script 的 Triggers 找出來關掉即可。
