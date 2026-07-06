-- ============================================================
-- 生產產品自由排序：加 sort_order 欄位（DIN + SJA）
-- App 的 Produk 分頁用 ▲▼ 調整順序，下拉選單也依此排序
-- 執行：Supabase SQL Editor 貼上執行一次（可重複）
-- ============================================================
ALTER TABLE din_products ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;
ALTER TABLE sja_products ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;

-- 回填初始順序：每個群組（DIN=客戶 / SJA=分類）內依現有 code / 名稱編號
WITH r AS (
  SELECT code, row_number() OVER (PARTITION BY customer_name ORDER BY code) rn FROM din_products
)
UPDATE din_products p SET sort_order = r.rn FROM r WHERE p.code = r.code AND (p.sort_order IS NULL OR p.sort_order = 0);

WITH r AS (
  SELECT code, row_number() OVER (PARTITION BY category ORDER BY product_name) rn FROM sja_products
)
UPDATE sja_products p SET sort_order = r.rn FROM r WHERE p.code = r.code AND (p.sort_order IS NULL OR p.sort_order = 0);

-- 驗證：
-- SELECT customer_name, code, sort_order FROM din_products ORDER BY customer_name, sort_order;
-- SELECT category, code, sort_order FROM sja_products ORDER BY category, sort_order;
