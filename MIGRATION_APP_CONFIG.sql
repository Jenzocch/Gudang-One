-- ============================================================
-- app_config：全站設定表（key-value）
-- 目前用途：office_view_delivery = super 是否臨時開放 Admin Office 看出貨數據
--
-- 讀取開放給所有人（anon）；寫入只走 Edge Function manage-people（super PIN 授權），
-- 所以這裡不 GRANT INSERT/UPDATE 給 anon，避免任何人竄改設定。
-- ============================================================

CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP DEFAULT now()
);
GRANT SELECT ON app_config TO anon, authenticated;

-- 預設值：關（office 看不到出貨）
INSERT INTO app_config (key, value) VALUES ('office_view_delivery', '0')
ON CONFLICT (key) DO NOTHING;
