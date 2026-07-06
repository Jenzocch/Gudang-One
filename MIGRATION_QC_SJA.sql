-- ============================================================
-- SJA QC 範本（食品）— 依產品型態分類，最適用
-- SJA 產品：珍珠/P1、粉類(PDR)、糖漿(Syrup)、果醬/果凍、布丁、Popping Boba、包材
-- 設計：2 個成品範本（液體類 / 固體粉類）+ 1 個原料範本
--       檢驗員在 QC → Periksa 表單的下拉選單挑對應範本
-- 前置：先跑過 MIGRATION_QC_SYSTEM.sql（建表）
-- 執行：Supabase SQL Editor 貼上執行一次（可重複，IF NOT EXISTS 保護）
-- ============================================================

DO $$
DECLARE tpl UUID;
BEGIN
  -- ── 成品 A：液體/糖漿類（Syrup 2L/5L/750ml、果醬）──
  IF NOT EXISTS (SELECT 1 FROM qc_templates WHERE warehouse_id='SJA' AND name='SJA 成品-液體/糖漿類') THEN
    INSERT INTO qc_templates(warehouse_id,scope,name,description)
      VALUES('SJA','product','SJA 成品-液體/糖漿類','糖漿、果醬等液體成品') RETURNING id INTO tpl;
    INSERT INTO qc_template_items(template_id,label,input_type,unit,is_ccp,critical_limit,required,order_index) VALUES
      (tpl,'Brix 糖度','number','°Bx',true,'≥ 60 °Bx',true,1),
      (tpl,'pH 值','number',NULL,true,'≤ 4.2',true,2),
      (tpl,'顏色/外觀正常','bool',NULL,false,NULL,true,3),
      (tpl,'容量/淨重達標','number',NULL,false,NULL,false,4),
      (tpl,'密封/封口完整','bool',NULL,false,NULL,true,5),
      (tpl,'無異物（金屬/雜質）','bool',NULL,true,'零檢出',true,6),
      (tpl,'標籤（效期/批號）正確','bool',NULL,false,NULL,true,7),
      (tpl,'感官（味道）','bool',NULL,false,NULL,true,8);
  END IF;

  -- ── 成品 B：固體/粉類（P1珍珠、PDR粉、布丁、果凍、Nata、Popping Boba）──
  IF NOT EXISTS (SELECT 1 FROM qc_templates WHERE warehouse_id='SJA' AND name='SJA 成品-固體/粉類') THEN
    INSERT INTO qc_templates(warehouse_id,scope,name,description)
      VALUES('SJA','product','SJA 成品-固體/粉類','珍珠、粉類、果凍、布丁、Boba 等固體成品') RETURNING id INTO tpl;
    INSERT INTO qc_template_items(template_id,label,input_type,unit,is_ccp,critical_limit,required,order_index) VALUES
      (tpl,'外觀/色澤正常','bool',NULL,false,NULL,true,1),
      (tpl,'淨重達標','number','kg',false,NULL,false,2),
      (tpl,'乾燥/無結塊（粉類）','bool',NULL,false,NULL,false,3),
      (tpl,'無異物（金屬/雜質）','bool',NULL,true,'零檢出',true,4),
      (tpl,'密封/包裝完整','bool',NULL,false,NULL,true,5),
      (tpl,'標籤（效期/批號）正確','bool',NULL,false,NULL,true,6),
      (tpl,'感官（口感/味道）','bool',NULL,false,NULL,true,7);
  END IF;

  -- ── 原料進料檢驗（糖、粉料、香料、包材）──
  IF NOT EXISTS (SELECT 1 FROM qc_templates WHERE warehouse_id='SJA' AND scope='raw') THEN
    INSERT INTO qc_templates(warehouse_id,scope,name,description)
      VALUES('SJA','raw','SJA 原料進料檢驗','收貨時 IQC') RETURNING id INTO tpl;
    INSERT INTO qc_template_items(template_id,label,input_type,unit,is_ccp,critical_limit,required,order_index) VALUES
      (tpl,'外觀/色澤正常','bool',NULL,false,NULL,true,1),
      (tpl,'包裝完整無破損','bool',NULL,false,NULL,true,2),
      (tpl,'無異物/無蟲害','bool',NULL,true,'零檢出',true,3),
      (tpl,'有效期限足夠','bool',NULL,false,NULL,true,4),
      (tpl,'COA/檢驗報告已收','bool',NULL,false,NULL,false,5),
      (tpl,'供應商/品項正確','bool',NULL,false,NULL,false,6);
  END IF;
END $$;

-- 驗證：
-- SELECT name, scope FROM qc_templates WHERE warehouse_id='SJA';
-- SELECT t.name, i.label, i.is_ccp FROM qc_template_items i JOIN qc_templates t ON t.id=i.template_id WHERE t.warehouse_id='SJA' ORDER BY t.name, i.order_index;
