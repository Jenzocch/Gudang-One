-- ============================================================
-- SJA 生產/出貨系統 — 照實際產品目錄與客戶清單建置
--
-- 記錄重點：生產數量（產品 + 數量），批號欄位保留選填
-- 庫存 = 生產總量 − 出貨總量（按產品自動計算）
-- 客戶：可新增/編輯/刪除
--
-- ⚠️ 在 gudang 專案執行（網址含 klswfuzuhlowzrbncreu）
-- ⚠️ 會重建 SJA 的表（此時尚無正式資料，可安全執行）
-- ============================================================

DROP VIEW  IF EXISTS sja_monthly_report;
DROP VIEW  IF EXISTS sja_stock_summary;
DROP TABLE IF EXISTS sja_delivery;
DROP TABLE IF EXISTS sja_production;
DROP TABLE IF EXISTS sja_customers;
DROP TABLE IF EXISTS sja_products;

-- ──────────────────────────────────────────────────────────
-- 1) 產品主檔（283 項，來自實際目錄）
-- ──────────────────────────────────────────────────────────
CREATE TABLE sja_products (
  code TEXT PRIMARY KEY,
  product_name TEXT NOT NULL,
  unit TEXT DEFAULT 'KG',             -- KG / Jrg / Btl / Jar / Pouch / Bag / Pcs
  category TEXT,                      -- P1系列 / Syrup 5L / ...
  pcs_per_ctn INT,                    -- 一箱件數（QTY PCS/CTN）
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- ──────────────────────────────────────────────────────────
-- 2) 客戶主檔（可在系統裡新增/編輯/刪除）
-- ──────────────────────────────────────────────────────────
CREATE TABLE sja_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- ──────────────────────────────────────────────────────────
-- 3) 生產記錄（重點：產品 + 數量）
-- ──────────────────────────────────────────────────────────
CREATE TABLE sja_production (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  product_code TEXT NOT NULL REFERENCES sja_products(code),
  qty NUMERIC NOT NULL DEFAULT 0,     -- 數量（單位看產品：KG/Jrg/Btl/...）
  batch_lot_no TEXT,                  -- 批號（選填，你們自己編）
  staff TEXT,
  note TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_sja_production_date    ON sja_production(date);
CREATE INDEX idx_sja_production_product ON sja_production(product_code);
CREATE INDEX idx_sja_production_batch   ON sja_production(batch_lot_no);

-- ──────────────────────────────────────────────────────────
-- 4) 出貨記錄（綁客戶）
-- ──────────────────────────────────────────────────────────
CREATE TABLE sja_delivery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  customer_code TEXT,
  customer_name TEXT,
  product_code TEXT NOT NULL REFERENCES sja_products(code),
  qty NUMERIC NOT NULL DEFAULT 0,
  batch_lot_no TEXT,
  driver TEXT,
  vehicle_no TEXT,
  note TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_sja_delivery_date     ON sja_delivery(date);
CREATE INDEX idx_sja_delivery_product  ON sja_delivery(product_code);
CREATE INDEX idx_sja_delivery_customer ON sja_delivery(customer_code);

-- ──────────────────────────────────────────────────────────
-- 5) 庫存 View（按產品；只列有異動的產品）
-- ──────────────────────────────────────────────────────────
CREATE VIEW sja_stock_summary AS
SELECT
  p.code AS product_code,
  p.product_name,
  p.unit,
  p.category,
  COALESCE(pr.q, 0) AS total_produced_qty,
  COALESCE(dl.q, 0) AS total_delivered_qty,
  COALESCE(pr.q, 0) - COALESCE(dl.q, 0) AS stock_qty
FROM sja_products p
LEFT JOIN (SELECT product_code, SUM(qty) AS q FROM sja_production GROUP BY 1) pr ON pr.product_code = p.code
LEFT JOIN (SELECT product_code, SUM(qty) AS q FROM sja_delivery   GROUP BY 1) dl ON dl.product_code = p.code
WHERE p.is_active AND (pr.q IS NOT NULL OR dl.q IS NOT NULL);

-- ──────────────────────────────────────────────────────────
-- 6) 月報 View（每月 × 每產品：生產量/出貨量）
-- ──────────────────────────────────────────────────────────
CREATE VIEW sja_monthly_report AS
SELECT bulan, product_code,
  SUM(produced)  AS produced_qty,
  SUM(delivered) AS delivered_qty
FROM (
  SELECT to_char(date,'YYYY-MM') AS bulan, product_code, qty AS produced, 0 AS delivered FROM sja_production
  UNION ALL
  SELECT to_char(date,'YYYY-MM'), product_code, 0, qty FROM sja_delivery
) t
GROUP BY bulan, product_code
ORDER BY bulan DESC, product_code;

-- ──────────────────────────────────────────────────────────
-- 7) 權限
-- ──────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sja_products   TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sja_customers  TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sja_production TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sja_delivery   TO anon, authenticated;
GRANT SELECT ON public.sja_stock_summary  TO anon, authenticated;
GRANT SELECT ON public.sja_monthly_report TO anon, authenticated;

-- ──────────────────────────────────────────────────────────
-- 8) 種子：客戶（20 筆）
-- ──────────────────────────────────────────────────────────
INSERT INTO sja_customers (code, name) VALUES
('NN','NN'),
('Mega','Mega'),
('Inotek','Inotek'),
('CV Pilari(GJ)','CV Pilari(GJ)'),
('CV YPKP(Jempol)','CV YPKP(Jempol)'),
('UD Pilari','UD Pilari'),
('Flazen','Flazen'),
('CMJ','CMJ'),
('Maria','Maria'),
('Maria(GJ)','Maria(GJ)'),
('DP','DP'),
('DP(Jempol)','DP(Jempol)'),
('DP(SM)','DP(SM)'),
('Jogja Supply(Jempol)','Jogja Supply(Jempol)'),
('Jogja Supply(SM)','Jogja Supply(SM)'),
('Pagoda','Pagoda'),
('Bogor','Bogor'),
('Kopi Sehati','Kopi Sehati'),
('Teh Kotjok','Teh Kotjok'),
('Bill','Bill')
ON CONFLICT (code) DO NOTHING;

-- ──────────────────────────────────────────────────────────
-- 9) 種子：產品目錄
-- ──────────────────────────────────────────────────────────
INSERT INTO sja_products (code, product_name, unit, category) VALUES
-- P1系列
('p1','P1-Original','KG','P1系列'),
('bsp1','P1-Brown Sugar','KG','P1系列'),
('wp1','P1-Putih','KG','P1系列'),
('gp1','P1-Golden P1','KG','P1系列'),
('rp1','P1-Merah','KG','P1系列'),
('wlyp1','P1-Lychee (Putih)','KG','P1系列'),
('ghop1','P1-Honey (Golden)','KG','P1系列'),
('rstp1','P1-Strawberry (Merah)','KG','P1系列'),
('mp1','Mini P1-Original','KG','P1系列'),
('mp1bs','Mini P1-Brown Sugar P1','KG','P1系列'),
('mp1w','Mini P1-Putih','KG','P1系列'),
('mp1g','Mini P1-Golden P1','KG','P1系列'),
('mp1r','Mini P1-Merah','KG','P1系列'),
('mp1wly','Mini P1-Lychee (Putih)','KG','P1系列'),
('mp1gho','Mini P1-Honey (Golden)','KG','P1系列'),
('mp1rst','Mini P1-Strawberry (Merah)','KG','P1系列'),
('hqp1','P1-HQ','KG','P1系列'),
('p1mta','P1-Original (Mutiara)','KG','P1系列'),
('bsp1mta','P1-Brown Sugar (Mutiara)','KG','P1系列'),
('p2','P2-Original','KG','P1系列'),
('hqp2','P2-HQ','KG','P1系列'),
-- Syrup 5L
('jga5','Syrup 5L-Apple','Jrg','Syrup 5L'),
('jbb5','Syrup 5L-Blueberry','Jrg','Syrup 5L'),
('jbs5','Syrup 5L-Brown Sugar','Jrg','Syrup 5L'),
('jbg5','Syrup 5L-Bubble Gum','Jrg','Syrup 5L'),
('jca5','Syrup 5L-Caramel','Jrg','Syrup 5L'),
('jdu5','Syrup 5L-Durian','Jrg','Syrup 5L'),
('jgr5','Syrup 5L-Grape','Jrg','Syrup 5L'),
('jhz5','Syrup 5L-Hazelnut','Jrg','Syrup 5L'),
('jho5','Syrup 5L-Honey','Jrg','Syrup 5L'),
('jkw5','Syrup 5L-Kiwi','Jrg','Syrup 5L'),
('jlm5','Syrup 5L-Lemon','Jrg','Syrup 5L'),
('jly5','Syrup 5L-Lychee','Jrg','Syrup 5L'),
('jmg5','Syrup 5L-Mango','Jrg','Syrup 5L'),
('jml5','Syrup 5L-Melon','Jrg','Syrup 5L'),
('jor5','Syrup 5L-Orange','Jrg','Syrup 5L'),
('jpf5','Syrup 5L-Passion Fruit','Jrg','Syrup 5L'),
('jpp5','Syrup 5L-Peppermint','Jrg','Syrup 5L'),
('jpa5','Syrup 5L-Pineapple','Jrg','Syrup 5L'),
('jss5','Syrup 5L-Sirsak','Jrg','Syrup 5L'),
('jst5','Syrup 5L-Strawberry','Jrg','Syrup 5L'),
('jvn5','Syrup 5L-Vanilla','Jrg','Syrup 5L'),
('jwm5','Syrup 5L-Wintermelon','Jrg','Syrup 5L'),
('jbsk5','Syrup 5L-Brown Sugar (Kental)','Jrg','Syrup 5L'),
('jbgp5','Syrup 5L-Bubble Gum (Pink)','Jrg','Syrup 5L'),
('jaren5','Syrup 5L-Gula Aren','Jrg','Syrup 5L'),
('jly+5','Syrup 5L-Lychee+','Jrg','Syrup 5L'),
('jpf+5','Syrup 5L-Passion Fruit+','Jrg','Syrup 5L'),
('jkw+5','Syrup 5L-Kiwi+','Jrg','Syrup 5L'),
-- Syrup 2L
('jga2','Syrup 2L-Apple','Jrg','Syrup 2L'),
('jbb2','Syrup 2L-Blueberry','Jrg','Syrup 2L'),
('jbs2','Syrup 2L-Brown Sugar','Jrg','Syrup 2L'),
('jbg2','Syrup 2L-Bubble Gum','Jrg','Syrup 2L'),
('jca2','Syrup 2L-Caramel','Jrg','Syrup 2L'),
('jdu2','Syrup 2L-Durian','Jrg','Syrup 2L'),
('jgr2','Syrup 2L-Grape','Jrg','Syrup 2L'),
('jhz2','Syrup 2L-Hazelnut','Jrg','Syrup 2L'),
('jho2','Syrup 2L-Honey','Jrg','Syrup 2L'),
('jkw2','Syrup 2L-Kiwi','Jrg','Syrup 2L'),
('jlm2','Syrup 2L-Lemon','Jrg','Syrup 2L'),
('jly2','Syrup 2L-Lychee','Jrg','Syrup 2L'),
('jmg2','Syrup 2L-Mango','Jrg','Syrup 2L'),
('jml2','Syrup 2L-Melon','Jrg','Syrup 2L'),
('jor2','Syrup 2L-Orange','Jrg','Syrup 2L'),
('jpf2','Syrup 2L-Passion Fruit','Jrg','Syrup 2L'),
('jpp2','Syrup 2L-Peppermint','Jrg','Syrup 2L'),
('jpa2','Syrup 2L-Pineapple','Jrg','Syrup 2L'),
('jss2','Syrup 2L-Sirsak','Jrg','Syrup 2L'),
('jst2','Syrup 2L-Strawberry','Jrg','Syrup 2L'),
('jvn2','Syrup 2L-Vanilla','Jrg','Syrup 2L'),
('jwm2','Syrup 2L-Wintermelon','Jrg','Syrup 2L'),
('jbsk2','Syrup 2L-Brown Sugar (Kental)','Jrg','Syrup 2L'),
('jbgp2','Syrup 2L-Bubble Gum (Pink)','Jrg','Syrup 2L'),
('jaren2','Syrup 2L-Gula Aren','Jrg','Syrup 2L'),
('jta2','Syrup 2L-Taro','Jrg','Syrup 2L'),
('jly+2','Syrup 2L-Lychee+','Jrg','Syrup 2L'),
('jpf+2','Syrup 2L-Passion Fruit+','Jrg','Syrup 2L'),
('jkw+2','Syrup 2L-Kiwi+','Jrg','Syrup 2L'),
-- Syrup 750ml
('jga1','Syrup 750ml-Apple','Btl','Syrup 750ml'),
('jbb1','Syrup 750ml-Blueberry','Btl','Syrup 750ml'),
('jbs1','Syrup 750ml-Brown Sugar','Btl','Syrup 750ml'),
('jbg1','Syrup 750ml-Bubble Gum','Btl','Syrup 750ml'),
('jca1','Syrup 750ml-Caramel','Btl','Syrup 750ml'),
('jdu1','Syrup 750ml-Durian','Btl','Syrup 750ml'),
('jgr1','Syrup 750ml-Grape','Btl','Syrup 750ml'),
('jhz1','Syrup 750ml-Hazelnut','Btl','Syrup 750ml'),
('jho1','Syrup 750ml-Honey','Btl','Syrup 750ml'),
('jkw1','Syrup 750ml-Kiwi','Btl','Syrup 750ml'),
('jlm1','Syrup 750ml-Lemon','Btl','Syrup 750ml'),
('jly1','Syrup 750ml-Lychee','Btl','Syrup 750ml'),
('jmg1','Syrup 750ml-Mango','Btl','Syrup 750ml'),
('jml1','Syrup 750ml-Melon','Btl','Syrup 750ml'),
('jor1','Syrup 750ml-Orange','Btl','Syrup 750ml'),
('jpf1','Syrup 750ml-Passion Fruit','Btl','Syrup 750ml'),
('jpp1','Syrup 750ml-Peppermint','Btl','Syrup 750ml'),
('jpa1','Syrup 750ml-Pineapple','Btl','Syrup 750ml'),
('jss1','Syrup 750ml-Sirsak','Btl','Syrup 750ml'),
('jst1','Syrup 750ml-Strawberry','Btl','Syrup 750ml'),
('jvn1','Syrup 750ml-Vanilla','Btl','Syrup 750ml'),
('jwm1','Syrup 750ml-Wintermelon','Btl','Syrup 750ml'),
('jbgp1','Syrup 750ml-Bubble Gum (Pink)','Btl','Syrup 750ml'),
('jly+1','Syrup 750ml-Lychee+','Btl','Syrup 750ml'),
('jpf+1','Syrup 750ml-Passion Fruit+','Btl','Syrup 750ml'),
('jkw+1','Syrup 750ml-Kiwi+','Btl','Syrup 750ml'),
-- Jam
('jamst1.2','Jam 1.2KG-Strawberry','Jar','Jam'),
('jampf1.2','Jam 1.2KG-Passionfruit','Jar','Jam'),
('jamkw1.2','Jam 1.2KG-Kiwi','Jar','Jam'),
('jammg1.2','Jam 1.2KG-Mango','Jar','Jam'),
('jamor1.2','Jam 1.2KG-Orange','Jar','Jam'),
-- Nata Jar
('nor3','Nata 3.3KG/Jar-Original','Jar','Nata Jar'),
('nly3','Nata 3.3KG/Jar-Lychee','Jar','Nata Jar'),
('nap3','Nata 3.3KG/Jar-Apple','Jar','Nata Jar'),
('nst3','Nata 3.3KG/Jar-Strawberry','Jar','Nata Jar'),
('ngr3','Nata 3.3KG/Jar-Grape','Jar','Nata Jar'),
('npa3','Nata 3.3KG/Jar-Pinapple','Jar','Nata Jar'),
('nmg3','Nata 3.3KG/Jar-Mango','Jar','Nata Jar'),
-- Nata Pouch
('nor1','Nata 1KG/Pouch-Original','Pouch','Nata Pouch'),
('nly1','Nata 1KG/Pouch-Lychee','Pouch','Nata Pouch'),
('nap1','Nata 1KG/Pouch-Apple','Pouch','Nata Pouch'),
('nst1','Nata 1KG/Pouch-Strawberry','Pouch','Nata Pouch'),
('ngr1','Nata 1KG/Pouch-Grape','Pouch','Nata Pouch'),
('npa1','Nata 1KG/Pouch-Pinapple','Pouch','Nata Pouch'),
('nmg1','Nata 1KG/Pouch-Mango','Pouch','Nata Pouch'),
('nccity1','Nata 1KG/Bag-Cooler City','Bag','Nata Pouch'),
-- Jelly
('qqrb3','Jelly 3.3KG/Jar-Rainbow','Jar','Jelly'),
('qqcf3','Jelly 3.3KG/Jar-Coffee','Jar','Jelly'),
('qqbs3','Jelly 3.3KG/Jar-Brown Sugar','Jar','Jelly'),
('qqmtch3','Jelly 3.3KG/Jar-Matcha','Jar','Jelly'),
('qqlm3','Jelly 3.3KG/Jar-Lemon','Jar','Jelly'),
('qqmg3','Jelly 3.3KG/Jar-Mango','Jar','Jelly'),
('qqcf2','Jelly 2KG/Jar-Coffee','Jar','Jelly'),
('qqrb1','Jelly 1.2KG/Jar-Rainbow','Jar','Jelly'),
('qqcf1','Jelly 1.2KG/Jar-Coffee','Jar','Jelly'),
('qqbs1','Jelly 1.2KG/Jar-Brown Sugar','Jar','Jelly'),
('qqmtch1','Jelly 1.2KG/Jar-Matcha','Jar','Jelly'),
('qqlm1','Jelly 1.2KG/Jar-Lemon','Jar','Jelly'),
('qqmg1','Jelly 1.2KG/Jar-Mango','Jar','Jelly'),
-- Pudding
('put1','Pudding-Taro (5X)','KG','Pudding'),
('pue1','Pudding-Egg (5X)','KG','Pudding'),
('puc1','Pudding-Chocolate (5X)','KG','Pudding'),
('pus1','Pudding-Strawberry (5X)','KG','Pudding'),
('puk1','Pudding-Coffee (5X)','KG','Pudding'),
('pum1','Pudding-Mango (5X)','KG','Pudding'),
('pugrt1','Pudding-Green Tea (5X)','KG','Pudding'),
('pumt1','Pudding-Matcha (5X)','KG','Pudding'),
('pugj05','Pudding-Grass Jelly PDR (40X)','KG','Pudding'),
('pugj1','Pudding-Grass Jelly PDR (10X)','KG','Pudding'),
-- PDR粉 PREM (1KG)
('pap1','PDR 1KG-Apple (PREM)','KG','PDR粉 PREM'),
('pav1','PDR 1KG-Avocado (PREM)','KG','PDR粉 PREM'),
('pbg1','PDR 1KG-Bubble Gum (PREM)','KG','PDR粉 PREM'),
('pbb1','PDR 1KG-Blueberry (PREM)','KG','PDR粉 PREM'),
('pdu1','PDR 1KG-Durian (PREM)','KG','PDR粉 PREM'),
('pgr1','PDR 1KG-Grape (PREM)','KG','PDR粉 PREM'),
('pkw1','PDR 1KG-Kiwi (PREM)','KG','PDR粉 PREM'),
('ply1','PDR 1KG-Lychee (PREM)','KG','PDR粉 PREM'),
('pmg1','PDR 1KG-Mango (PREM)','KG','PDR粉 PREM'),
('pml1','PDR 1KG-Melon (PREM)','KG','PDR粉 PREM'),
('pst1','PDR 1KG-Strawberry (PREM)','KG','PDR粉 PREM'),
('pvn1','PDR 1KG-Vanilla (PREM)','KG','PDR粉 PREM'),
('ppp1','PDR 1KG-Peppermint (PREM)','KG','PDR粉 PREM'),
('pta1','PDR 1KG-Taro (PREM)','KG','PDR粉 PREM'),
('pcfcp1','Coffee PDR 1KG-Cappucino (PREM)','KG','PDR粉 PREM'),
('pcfmo1','Coffee PDR 1KG-Mochacino (PREM)','KG','PDR粉 PREM'),
('pcfvn1','Coffee PDR 1KG-Vanilla Latte (PREM)','KG','PDR粉 PREM'),
('pcfca1','Coffee PDR 1KG-Caramel (PREM)','KG','PDR粉 PREM'),
('pckck1','Coklat PDR 1KG-Chocolate (PREM)','KG','PDR粉 PREM'),
('pckbf1','Coklat PDR 1KG-Blackforest (PREM)','KG','PDR粉 PREM'),
('pckoe1','Coklat PDR 1KG-Oreo (PREM)','KG','PDR粉 PREM'),
('pckry1','Coklat PDR 1KG-Royal (PREM)','KG','PDR粉 PREM'),
('pckvn1','Coklat PDR 1KG-Vanilla (PREM)','KG','PDR粉 PREM'),
('pckcaml1','Coklat PDR 1KG-Caramel (PREM)','KG','PDR粉 PREM'),
('pckvv1','Coklat PDR 1KG-Red Velvet (PREM)','KG','PDR粉 PREM'),
('ptjg1','Tea PDR 1KG-Jasmine (PREM)','KG','PDR粉 PREM'),
('ptgt1','Tea PDR 1KG-Green Tea Latte (PREM)','KG','PDR粉 PREM'),
('ptmc1','Tea PDR 1KG-Matcha (PREM)','KG','PDR粉 PREM'),
('ptmt1','Tea PDR 1KG-Milk Tea (PREM)','KG','PDR粉 PREM'),
('pttt1','Tea PDR 1KG-Thai Tea (PREM)','KG','PDR粉 PREM'),
('pttt1+','Tea PDR 1KG-Thai Tea + (PREM)','KG','PDR粉 PREM'),
-- PDR粉 PREM (500gx2)
('pap05','PDR 500gx2-Apple (PREM)','KG','PDR粉 PREM'),
('pav05','PDR 500gx2-Avocado (PREM)','KG','PDR粉 PREM'),
('pbg05','PDR 500gx2-Bubble Gum (PREM)','KG','PDR粉 PREM'),
('pbb05','PDR 500gx2-Blueberry (PREM)','KG','PDR粉 PREM'),
('pdu05','PDR 500gx2-Durian (PREM)','KG','PDR粉 PREM'),
('pgr05','PDR 500gx2-Grape (PREM)','KG','PDR粉 PREM'),
('pkw05','PDR 500gx2-Kiwi (PREM)','KG','PDR粉 PREM'),
('ply05','PDR 500gx2-Lychee (PREM)','KG','PDR粉 PREM'),
('pmg05','PDR 500gx2-Mango (PREM)','KG','PDR粉 PREM'),
('pml05','PDR 500gx2-Melon (PREM)','KG','PDR粉 PREM'),
('pst05','PDR 500gx2-Strawberry (PREM)','KG','PDR粉 PREM'),
('pvn05','PDR 500gx2-Vanilla (PREM)','KG','PDR粉 PREM'),
('ppp05','PDR 500gx2-Peppermint (PREM)','KG','PDR粉 PREM'),
('pta05','PDR 500gx2-Taro (PREM)','KG','PDR粉 PREM'),
('pcocp05','Coffee PDR 500gx2-Cappucino (PREM)','KG','PDR粉 PREM'),
('pcomo05','Coffee PDR 500gx2-Mochacino (PREM)','KG','PDR粉 PREM'),
('pcovn05','Coffee PDR 500gx2-Vanilla Latte (PREM)','KG','PDR粉 PREM'),
('pcoca05','Coffee PDR 500gx2-Caramel (PREM)','KG','PDR粉 PREM'),
('pckck05','Coklat PDR 500gx2-Chocolate (PREM)','KG','PDR粉 PREM'),
('pckbf05','Coklat PDR 500gx2-Blackforest (PREM)','KG','PDR粉 PREM'),
('pckoe05','Coklat PDR 500gx2-Oreo (PREM)','KG','PDR粉 PREM'),
('pckry05','Coklat PDR 500gx2-Royal (PREM)','KG','PDR粉 PREM'),
('pckvn05','Coklat PDR 500gx2-Vanilla (PREM)','KG','PDR粉 PREM'),
('pckcaml05','Coklat PDR 500gx2-Caramel (PREM)','KG','PDR粉 PREM'),
('pckvv05','Coklat PDR 500gx2-Red Velvet (PREM)','KG','PDR粉 PREM'),
('ptjg05','Tea PDR 500gx2-Jasmine (PREM)','KG','PDR粉 PREM'),
('ptgt05','Tea PDR 500gx2-Green Tea Latte (PREM)','KG','PDR粉 PREM'),
('ptmc05','Tea PDR 500gx2-Matcha (PREM)','KG','PDR粉 PREM'),
('ptmt05','Tea PDR 500gx2-Milk Tea (PREM)','KG','PDR粉 PREM'),
('pttt05','Tea PDR 500gx2-Thai Tea (PREM)','KG','PDR粉 PREM'),
('pttt05+','Tea PDR 500gx2-Thai Tea + (PREM)','KG','PDR粉 PREM'),
('aicepav','PDR-Avocado (AICE)','KG','PDR粉 PREM'),
-- PDR粉 Mix (1KG)
('mxpap1','PDR-Apple (Mix)','KG','PDR粉 Mix'),
('mxpav1','PDR-Avocado (Mix)','KG','PDR粉 Mix'),
('mxpbg1','PDR-Bubble Gum (Mix)','KG','PDR粉 Mix'),
('mxpbb1','PDR-Blueberry (Mix)','KG','PDR粉 Mix'),
('mxpdu1','PDR-Durian (Mix)','KG','PDR粉 Mix'),
('mxpgr1','PDR-Grape (Mix)','KG','PDR粉 Mix'),
('mxpkw1','PDR-Kiwi (Mix)','KG','PDR粉 Mix'),
('mxply1','PDR-Lychee (Mix)','KG','PDR粉 Mix'),
('mxpmg1','PDR-Mango (Mix)','KG','PDR粉 Mix'),
('mxpml1','PDR-Melon (Mix)','KG','PDR粉 Mix'),
('mxpst1','PDR-Strawberry (Mix)','KG','PDR粉 Mix'),
('mxpvn1','PDR-Vanilla (Mix)','KG','PDR粉 Mix'),
('mxppp1','PDR-Peppermint (Mix)','KG','PDR粉 Mix'),
('mxpta1','PDR-Taro (Mix)','KG','PDR粉 Mix'),
('mxpcfcp1','Coffee PDR 1KG-Cappucino (Mix)','KG','PDR粉 Mix'),
('mxpcfmo1','Coffee PDR 1KG-Mochacino (Mix)','KG','PDR粉 Mix'),
('mxpcfvn1','Coffee PDR 1KG-Vanilla Latte (Mix)','KG','PDR粉 Mix'),
('mxpcfca1','Coffee PDR 1KG-Caramel (Mix)','KG','PDR粉 Mix'),
('mxpckck1','Coklat PDR 1KG-Chocolate (Mix)','KG','PDR粉 Mix'),
('mxpckbf1','Coklat PDR 1KG-Blackforest (Mix)','KG','PDR粉 Mix'),
('mxpckoe1','Coklat PDR 1KG-Oreo (Mix)','KG','PDR粉 Mix'),
('mxpckry1','Coklat PDR 1KG-Royal (Mix)','KG','PDR粉 Mix'),
('mxpckvn1','Coklat PDR 1KG-Vanilla (Mix)','KG','PDR粉 Mix'),
('mxpckcaml1','Coklat PDR 1KG-Caramel (Mix)','KG','PDR粉 Mix'),
('mxpckvv1','Coklat PDR 1KG-Red Velvet (Mix)','KG','PDR粉 Mix'),
('mxptjg1','Tea PDR 1KG-Jasmine (Mix)','KG','PDR粉 Mix'),
('mxptgt1','Tea PDR 1KG-Green Tea Latte (Mix)','KG','PDR粉 Mix'),
('mxptmc1','Tea PDR 1KG-Matcha (Mix)','KG','PDR粉 Mix'),
('mxptmt1','Tea PDR 1KG-Milk Tea (Mix)','KG','PDR粉 Mix'),
('mxpttt1','Tea PDR 1KG-Thai Tea (Mix)','KG','PDR粉 Mix'),
-- PDR粉 Mix (500gx2)
('mxpap05','PDR 500gx2-Apple (Mix)','KG','PDR粉 Mix'),
('mxpav05','PDR 500gx2-Avocado (Mix)','KG','PDR粉 Mix'),
('mxpbg05','PDR 500gx2-Bubble Gum (Mix)','KG','PDR粉 Mix'),
('mxpbb05','PDR 500gx2-Blueberry (Mix)','KG','PDR粉 Mix'),
('mxpdu05','PDR 500gx2-Durian (Mix)','KG','PDR粉 Mix'),
('mxpgr05','PDR 500gx2-Grape (Mix)','KG','PDR粉 Mix'),
('mxpkw05','PDR 500gx2-Kiwi (Mix)','KG','PDR粉 Mix'),
('mxply05','PDR 500gx2-Lychee (Mix)','KG','PDR粉 Mix'),
('mxpmg05','PDR 500gx2-Mango (Mix)','KG','PDR粉 Mix'),
('mxpml05','PDR 500gx2-Melon (Mix)','KG','PDR粉 Mix'),
('mxpst05','PDR 500gx2-Strawberry (Mix)','KG','PDR粉 Mix'),
('mxpvn05','PDR 500gx2-Vanilla (Mix)','KG','PDR粉 Mix'),
('mxppp05','PDR 500gx2-Peppermint (Mix)','KG','PDR粉 Mix'),
('mxpta05','PDR 500gx2-Taro (Mix)','KG','PDR粉 Mix'),
('mxpcfcp05','Coffee PDR 500gx2-Cappucino (Mix)','KG','PDR粉 Mix'),
('mxpcfmo05','Coffee PDR 500gx2-Mochacino (Mix)','KG','PDR粉 Mix'),
('mxpcfvn05','Coffee PDR 500gx2-Vanilla Latte (Mix)','KG','PDR粉 Mix'),
('mxpcfca05','Coffee PDR 500gx2-Caramel (Mix)','KG','PDR粉 Mix'),
('mxpckck05','Coklat PDR 500gx2-Chocolate (Mix)','KG','PDR粉 Mix'),
('mxpckbf05','Coklat PDR 500gx2-Blackforest (Mix)','KG','PDR粉 Mix'),
('mxpckoe05','Coklat PDR 500gx2-Oreo (Mix)','KG','PDR粉 Mix'),
('mxpckry05','Coklat PDR 500gx2-Royal (Mix)','KG','PDR粉 Mix'),
('mxpckvn05','Coklat PDR 500gx2-Vanilla (Mix)','KG','PDR粉 Mix'),
('mxpckcaml05','Coklat PDR 500gx2-Caramel (Mix)','KG','PDR粉 Mix'),
('mxpckvv05','Coklat PDR 500gx2-Red Velvet (Mix)','KG','PDR粉 Mix'),
('mxptjg05','Tea PDR 500gx2-Jasmine (Mix)','KG','PDR粉 Mix'),
('mxptgt05','Tea PDR 500gx2-Green Tea Latte (Mix)','KG','PDR粉 Mix'),
('mxptmc05','Tea PDR 500gx2-Matcha (Mix)','KG','PDR粉 Mix'),
('mxptmt05','Tea PDR 500gx2-Milk Tea (Mix)','KG','PDR粉 Mix'),
('mxpttt05','Tea PDR 500gx2-Thai Tea (Mix)','KG','PDR粉 Mix'),
-- Popping Boba
('poply3.2','Popping Boba 3.2KG-Lychee','Jar','Popping Boba'),
('popmg3.2','Popping Boba 3.2KG-Mango','Jar','Popping Boba'),
('popst3.2','Popping Boba 3.2KG-Strawberry','Jar','Popping Boba'),
('popyg3.2','Popping Boba 3.2KG-Yogurt','Jar','Popping Boba'),
('poply1','Popping Boba 1KG-Lychee','Jar','Popping Boba'),
('popmg1','Popping Boba 1KG-Mango','Jar','Popping Boba'),
('popst1','Popping Boba 1KG-Strawberry','Jar','Popping Boba'),
('popyg1','Popping Boba 1KG-Yogurt','Jar','Popping Boba'),
-- 包材
('alumbag1k','Alumunium Bag 1KG','Pcs','包材'),
('alumbag05k','Alumunium Bag 0.5KG','Pcs','包材'),
('vbag1','Vacuum Bag','Pcs','包材'),
('jrg2','Jerigen 2L','Pcs','包材'),
('fee-kirim','Ongkos Kirim','-','包材')
ON CONFLICT (code) DO NOTHING;

-- ──────────────────────────────────────────────────────────
-- 10) 一箱件數（QTY PCS/CTN，來自實際目錄最後一欄）
-- ──────────────────────────────────────────────────────────
UPDATE sja_products SET pcs_per_ctn=12 WHERE category='P1系列';
UPDATE sja_products SET pcs_per_ctn=4  WHERE category='Syrup 5L';
UPDATE sja_products SET pcs_per_ctn=6  WHERE category='Syrup 2L';
UPDATE sja_products SET pcs_per_ctn=12 WHERE category='Syrup 750ml';
UPDATE sja_products SET pcs_per_ctn=12 WHERE category='Jam';
UPDATE sja_products SET pcs_per_ctn=6  WHERE category='Nata Jar';
UPDATE sja_products SET pcs_per_ctn=15 WHERE category='Nata Pouch';
UPDATE sja_products SET pcs_per_ctn=6  WHERE category='Jelly' AND product_name LIKE 'Jelly 3.3%';
UPDATE sja_products SET pcs_per_ctn=12 WHERE category='Jelly' AND product_name LIKE 'Jelly 1.2%';
UPDATE sja_products SET pcs_per_ctn=10 WHERE category='Pudding';
UPDATE sja_products SET pcs_per_ctn=20 WHERE code='pugj05';
UPDATE sja_products SET pcs_per_ctn=10 WHERE category='PDR粉 PREM';
UPDATE sja_products SET pcs_per_ctn=20 WHERE category='PDR粉 PREM' AND product_name LIKE '%500gx2%';
UPDATE sja_products SET pcs_per_ctn=10 WHERE category='PDR粉 Mix' AND product_name NOT LIKE '%500gx2%';
UPDATE sja_products SET pcs_per_ctn=4  WHERE category='Popping Boba' AND product_name LIKE '%3.2KG%';
UPDATE sja_products SET pcs_per_ctn=12 WHERE category='Popping Boba' AND product_name LIKE '%1KG%';
-- （qqcf2、PDR粉 Mix 500gx2、包材 沒提供箱數 → 留空）

-- ── 驗證 ──
-- SELECT category, COUNT(*) FROM sja_products GROUP BY category ORDER BY category;
-- SELECT * FROM sja_customers ORDER BY name;
-- SELECT * FROM sja_stock_summary;
