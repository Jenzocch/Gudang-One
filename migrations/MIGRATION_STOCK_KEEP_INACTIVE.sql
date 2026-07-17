-- 保留「停產(is_active=false)但庫存≠0」的產品於 DIN/SJA 庫存視圖，並回傳 is_active 供前端標註。
--
-- 背景：兩個 stock summary 視圖原本以 WHERE p.is_active 過濾，導致停產品連同尚未出清的餘貨
-- 一起從 Stok 頁與出貨下拉消失，餘貨被困住、無法出清。而「停用(🔴 nonaktif)」的設計定位本就是
-- 「已被生產/出貨引用、無法刪除的產品的停產軟刪除」，停產時仍有餘貨是正常且被鼓勵的路徑。
-- 改為：is_active 為真，或 淨庫存≠0，都保留在視圖中；前端據 is_active 標註「nonaktif」。
--
-- 用 DROP + CREATE（而非 CREATE OR REPLACE）：因為要在既有欄位「之後」新增 is_active 欄，
-- 而 CREATE OR REPLACE VIEW 不允許改變既有欄位的名稱/型別/順序，只能在尾端加欄——這裡正是
-- 把 is_active 加在尾端，但為求乾淨與可讀，直接重建。這兩個是唯讀彙總視圖，無其他物件依賴。
--
-- ⚠️ 在 Supabase Dashboard → SQL Editor 執行一次。前端已相容：未套用前行為與現況相同
--    (停產品不顯示、無 is_active 欄)，套用後餘貨列與 nonaktif 標註才會出現。

DROP VIEW IF EXISTS din_stock_summary;
CREATE VIEW din_stock_summary AS
SELECT
  p.code AS product_code,
  p.customer_name,
  p.customer_code,
  p.item_name,
  COALESCE(pr.produced_kg, 0)  AS total_produced_kg,
  COALESCE(pr.produced_bags, 0) AS total_produced_bags,
  COALESCE(dl.delivered_kg, 0) AS total_delivered_kg,
  COALESCE(dl.delivered_bags, 0) AS total_delivered_bags,
  COALESCE(pr.produced_kg, 0) - COALESCE(dl.delivered_kg, 0) AS stock_kg,
  COALESCE(pr.produced_bags, 0) - COALESCE(dl.delivered_bags, 0) AS stock_bags,
  p.is_active
FROM din_products p
LEFT JOIN (
  SELECT product_code, SUM(total_kg) AS produced_kg, SUM(bags) AS produced_bags
  FROM din_production GROUP BY product_code
) pr ON pr.product_code = p.code
LEFT JOIN (
  SELECT product_code, SUM(kg) AS delivered_kg, SUM(bags) AS delivered_bags
  FROM din_delivery GROUP BY product_code
) dl ON dl.product_code = p.code
WHERE p.is_active
   OR COALESCE(pr.produced_kg, 0)  - COALESCE(dl.delivered_kg, 0)   <> 0
   OR COALESCE(pr.produced_bags, 0) - COALESCE(dl.delivered_bags, 0) <> 0;

DROP VIEW IF EXISTS sja_stock_summary;
CREATE VIEW sja_stock_summary AS
SELECT
  p.code AS product_code,
  p.product_name,
  p.unit,
  p.category,
  COALESCE(pr.q, 0) AS total_produced_qty,
  COALESCE(dl.q, 0) AS total_delivered_qty,
  COALESCE(pr.q, 0) - COALESCE(dl.q, 0) AS stock_qty,
  p.is_active
FROM sja_products p
LEFT JOIN (SELECT product_code, SUM(qty) AS q FROM sja_production GROUP BY 1) pr ON pr.product_code = p.code
LEFT JOIN (SELECT product_code, SUM(qty) AS q FROM sja_delivery   GROUP BY 1) dl ON dl.product_code = p.code
WHERE (p.is_active AND (pr.q IS NOT NULL OR dl.q IS NOT NULL))
   OR (COALESCE(pr.q, 0) - COALESCE(dl.q, 0)) <> 0;
