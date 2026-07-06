-- ============================================================
-- QC / HACCP 系統（食品）— 彈性版
-- 特色：
--   1. 檢查項目「全部後台可編輯」→ qc_templates + qc_template_items
--   2. 每筆檢驗有「備註欄」(note) 供日後查閱
--   3. CCP（關鍵控制點）可標記 + 臨界值 + 矯正措施 → HACCP 監控記錄
--   4. 原料(raw，掛 item_batches) 與 成品(product，掛 din/sja_production) 共用
--
-- 注意：本階段沿用專案現有權限模式（GRANT 給 anon/authenticated，尚未上 RLS，
--       與 din_/sja_ 各表一致）。RLS 之後再統一處理。
--
-- 執行：在 Supabase SQL Editor 貼上執行一次（可重複執行，IF NOT EXISTS）
-- ============================================================

-- ── 1) 檢查清單範本（每個「產品類型/情境」一份，可停用）──
CREATE TABLE IF NOT EXISTS qc_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'product',   -- 'raw'（原料進料）/ 'product'（成品）
  name TEXT NOT NULL,                       -- 例如 "Nata 成品檢驗"、"原料進料檢驗"
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qc_templates_wh ON qc_templates(warehouse_id);

-- ── 2) 範本裡的每個檢查項（後台可新增/編輯/刪除）──
CREATE TABLE IF NOT EXISTS qc_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES qc_templates(id) ON DELETE CASCADE,
  label TEXT NOT NULL,                      -- 例如 "pH 值"、"無異物"、"到貨溫度"
  input_type TEXT NOT NULL DEFAULT 'bool',  -- 'bool'|'number'|'text'|'date'|'select'
  options JSONB,                            -- input_type='select' 時的選項 ["A","B"]
  unit TEXT,                                -- number 時的單位，例如 "°C"、"kg"
  is_ccp BOOLEAN DEFAULT false,             -- 是否為 HACCP 關鍵控制點(CCP)
  critical_limit TEXT,                      -- CCP 臨界限值，例如 "≤ 4°C"、"pH 3.5-4.2"
  required BOOLEAN DEFAULT false,
  order_index INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qc_tpl_items_tpl ON qc_template_items(template_id);

-- ── 3) 一筆實際檢驗記錄（原料批 或 生產批）──
CREATE TABLE IF NOT EXISTS qc_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id TEXT NOT NULL,
  scope TEXT NOT NULL,                       -- 'raw' | 'product'
  ref_type TEXT NOT NULL,                    -- 'item_batch'|'din_production'|'sja_production'
  ref_id TEXT NOT NULL,                      -- 對應批次/生產記錄 id（存 text 相容 uuid/text）
  ref_label TEXT,                            -- 顯示用（批號/品名快照）
  template_id UUID REFERENCES qc_templates(id),
  inspector_name TEXT,
  checked_at TIMESTAMP DEFAULT now(),
  result TEXT NOT NULL DEFAULT 'pending',    -- 'pass'|'fail'|'conditional'|'rework'|'pending'
  ccp_fail BOOLEAN DEFAULT false,            -- 是否有任何 CCP 未通過（放行閘門用）
  data JSONB,                                -- 各檢查項填答：[{label,input_type,value,pass,is_ccp,critical_limit}]
  corrective_action TEXT,                    -- CCP 超標時的矯正措施（HACCP 要求）
  note TEXT,                                 -- 備註欄（日後查閱）
  photo_url TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qc_checks_wh    ON qc_checks(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_qc_checks_ref   ON qc_checks(ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_qc_checks_res   ON qc_checks(result);

-- ── 權限（沿用現有模式，尚未上 RLS）──
GRANT SELECT ON qc_templates       TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON qc_templates       TO anon, authenticated;
GRANT SELECT ON qc_template_items  TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON qc_template_items  TO anon, authenticated;
GRANT SELECT ON qc_checks          TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON qc_checks          TO anon, authenticated;

-- ── 選用：預設範本種子（DIN Nata 成品 + 通用原料）。可依需要在後台再改 ──
-- 只有在還沒有任何範本時才插入，避免重複
DO $$
DECLARE tpl UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM qc_templates WHERE warehouse_id='DENIKIN' AND scope='product') THEN
    INSERT INTO qc_templates(warehouse_id,scope,name,description)
      VALUES('DENIKIN','product','Nata 成品檢驗','DIN 椰果成品出貨前品管') RETURNING id INTO tpl;
    INSERT INTO qc_template_items(template_id,label,input_type,unit,is_ccp,critical_limit,required,order_index) VALUES
      (tpl,'pH 值','number',NULL,true,'pH 3.5 - 4.2',true,1),
      (tpl,'規格尺寸符合','bool',NULL,false,NULL,true,2),
      (tpl,'淨重','number','kg',false,NULL,false,3),
      (tpl,'封口/包裝完整','bool',NULL,false,NULL,true,4),
      (tpl,'無異物（金屬/雜質）','bool',NULL,true,'零檢出',true,5),
      (tpl,'感官（色/味/質地）','bool',NULL,false,NULL,true,6);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM qc_templates WHERE warehouse_id='DENIKIN' AND scope='raw') THEN
    INSERT INTO qc_templates(warehouse_id,scope,name,description)
      VALUES('DENIKIN','raw','原料進料檢驗','收貨時 IQC') RETURNING id INTO tpl;
    INSERT INTO qc_template_items(template_id,label,input_type,unit,is_ccp,critical_limit,required,order_index) VALUES
      (tpl,'外觀/色澤正常','bool',NULL,false,NULL,true,1),
      (tpl,'包裝完整無破損','bool',NULL,false,NULL,true,2),
      (tpl,'無異物/無蟲害','bool',NULL,true,'零檢出',true,3),
      (tpl,'到貨溫度（冷藏/冷凍）','number','°C',true,'冷藏 ≤ 4°C / 冷凍 ≤ -18°C',false,4),
      (tpl,'COA/檢驗報告已收','bool',NULL,false,NULL,false,5);
  END IF;
END $$;

-- 驗證：
-- SELECT * FROM qc_templates;
-- SELECT * FROM qc_template_items ORDER BY template_id, order_index;
-- SELECT * FROM qc_checks ORDER BY checked_at DESC;
