// Supabase Edge Function: qc-lookup
// FQMS（品管系統）→ Gudang One 的批號查詢入口（唯讀）。
// QC 開進料檢驗單時「從倉庫帶入」：查單一批號，或列出某倉最近 N 天的批次。
//
// 部署：
//   supabase secrets set QC_WEBHOOK_SECRET="一段長隨機字串"   （與 FQMS 端共享）
//   supabase functions deploy qc-lookup
//
// 呼叫（FQMS 的 Next.js 伺服器端）：
//   POST /functions/v1/qc-lookup
//   headers: { "x-qc-secret": <QC_WEBHOOK_SECRET>, "Content-Type": "application/json" }
//   body: { lot_no } 或 { warehouse, days? }
//   選填 batch_type: "finished" ＝改查成品批（din_production/sja_production，
//   回應每筆多 ref_type 欄位）；不帶或其他值＝維持原料批（item_batches），完全向下相容。

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-qc-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 常數時間比較，避免時序側漏（與 famms-request 相同做法）
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const WAREHOUSES = ["DENIKIN", "SJA", "HARDWARE", "OLENTIA"];

// 成品批：倉庫 → 生產批次表的對應（有生產模組的倉才有成品批）
const FINISHED_TABLES: Record<string, { table: string; refType: string }> = {
  DENIKIN: { table: "din_production", refType: "din_production" },
  SJA: { table: "sja_production", refType: "sja_production" },
};

// 成品批回應欄位白名單：形狀對齊原料批，另加 ref_type
// din_production: lot_no/batch_no + bags/total_kg；sja_production: batch_lot_no + qty
function pickFinished(r: Record<string, unknown>, refType: string, warehouse: string) {
  const prod = (r.din_products ?? r.sja_products ?? null) as
    | { name?: string; unit?: string }
    | null;
  const isDin = refType === "din_production";
  const lot = isDin
    ? String(r.lot_no ?? r.batch_no ?? "")
    : String(r.batch_lot_no ?? "");
  const qty = isDin
    ? Number(r.bags ?? 0) || Number(r.total_kg ?? 0)
    : Number(r.qty ?? 0);
  return {
    id: r.id,
    lot_no: lot,
    item_name: prod?.name ?? String(r.product_code ?? ""),
    unit: isDin ? "bags" : (prod?.unit ?? ""),
    supplier_name: "",
    po_no: "",
    production_date: r.date ?? null,
    expiry_date: null,
    qty_initial: qty,
    qty_remaining: qty, // 生產批不追蹤剩餘量，回報產量供 FQMS 顯示
    qc_status: r.qc_status ?? "Pending",
    warehouse_id: warehouse,
    received_date: r.date ?? null,
    ref_type: refType,
  };
}

// 成品批查詢：lot 模式（單一批號，可跨兩廠找）或清單模式（某倉近 N 天）
async function lookupFinished(
  admin: ReturnType<typeof createClient>,
  lotNo: string,
  warehouse: string,
  days: number,
) {
  const targets = warehouse
    ? (FINISHED_TABLES[warehouse] ? [warehouse] : [])
    : Object.keys(FINISHED_TABLES);
  const out: unknown[] = [];
  for (const wh of targets) {
    const cfg = FINISHED_TABLES[wh];
    const isDin = cfg.refType === "din_production";
    const SELECT = isDin
      ? "id, lot_no, batch_no, date, product_code, bags, total_kg, qc_status, din_products(name)"
      : "id, batch_lot_no, date, product_code, qty, qc_status, sja_products(name, unit)";
    if (lotNo && isDin) {
      // DIN 的批號可能記在 lot_no 或 batch_no：跑兩次 .eq() 再依 id 去重。
      // 不用 .or() 內插使用者輸入 —— 批號裡的逗號/括號會改變 PostgREST 過濾式結構。
      const seen = new Set<string>();
      for (const col of ["lot_no", "batch_no"]) {
        const { data, error } = await admin.from(cfg.table).select(SELECT)
          .eq(col, lotNo).order("date", { ascending: false }).limit(50);
        if (error) return { error: error.message };
        (data || []).forEach((r) => {
          const row = r as Record<string, unknown>;
          const id = String(row.id);
          if (seen.has(id)) return;
          seen.add(id);
          out.push(pickFinished(row, cfg.refType, wh));
        });
      }
      continue;
    }
    let q = admin.from(cfg.table).select(SELECT);
    if (lotNo) {
      q = q.eq("batch_lot_no", lotNo);
    } else {
      const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
      q = q.gte("date", cutoff);
    }
    const { data, error } = await q.order("date", { ascending: false }).limit(50);
    if (error) return { error: error.message };
    (data || []).forEach((r) => out.push(pickFinished(r as Record<string, unknown>, cfg.refType, wh)));
  }
  // 兩廠合併時重新按日期新→舊，維持最多 50 筆
  out.sort((a, b) =>
    String((b as { production_date?: unknown }).production_date ?? "").localeCompare(
      String((a as { production_date?: unknown }).production_date ?? ""),
    )
  );
  return { batches: out.slice(0, 50) };
}

// 回應欄位白名單：FQMS 只拿得到這些
function pick(b: Record<string, unknown>) {
  const item = (b.items ?? null) as
    | { name?: string; unit?: string; supplier_name?: string }
    | null;
  return {
    id: b.id,
    lot_no: b.lot_no ?? "",
    item_name: item?.name ?? "",
    unit: item?.unit ?? "",
    supplier_name: item?.supplier_name ?? "",
    po_no: b.po_no ?? "",
    production_date: b.production_date ?? null,
    expiry_date: b.expiry_date ?? null,
    qty_initial: b.qty_initial ?? 0,
    qty_remaining: b.qty_remaining ?? 0,
    qc_status: b.qc_status ?? "Pending",
    warehouse_id: b.warehouse_id ?? "",
    received_date: b.received_date ?? null,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const secret = Deno.env.get("QC_WEBHOOK_SECRET");
    if (!url || !serviceKey) return json({ ok: false, error: "server not configured" }, 500);
    if (!secret) return json({ ok: false, error: "QC_WEBHOOK_SECRET belum di-set" }, 500);

    const given = (req.headers.get("x-qc-secret") || "").trim();
    if (!given || !safeEqual(given, secret)) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const lotNo = (body.lot_no == null ? "" : String(body.lot_no)).slice(0, 60).trim();
    const warehouse = (body.warehouse == null ? "" : String(body.warehouse)).slice(0, 20).trim().toUpperCase();
    // batch_type 白名單：只認 "finished"；其他值（含缺省、怪值）一律走原料批，不 500
    const batchType = String(body.batch_type ?? "").trim().toLowerCase() === "finished" ? "finished" : "item";

    const admin = createClient(url, serviceKey);

    if (batchType === "finished") {
      if (!lotNo && !FINISHED_TABLES[warehouse]) {
        // 清單模式必須指定有生產模組的倉；其他倉沒有成品批 → 回空清單（FQMS 當「查無」）
        if (WAREHOUSES.includes(warehouse)) return json({ ok: true, batches: [] });
        return json({ ok: false, error: "warehouse harus DENIKIN atau SJA untuk batch_type=finished" }, 400);
      }
      let days = Number(body.days) || 14;
      days = Math.max(1, Math.min(90, Math.floor(days)));
      const r = await lookupFinished(admin, lotNo, warehouse, days);
      if ("error" in r) return json({ ok: false, error: r.error }, 500);
      if (lotNo && !r.batches.length) return json({ ok: false, error: "lot_no tidak ditemukan" }, 404);
      return json({ ok: true, batches: r.batches });
    }
    const SELECT = "id, lot_no, po_no, production_date, expiry_date, qty_initial, qty_remaining, qc_status, warehouse_id, received_date, items(name, unit, supplier_name)";

    if (lotNo) {
      // 精確查一筆（可選加 warehouse 過濾）
      let q = admin.from("item_batches").select(SELECT).eq("lot_no", lotNo);
      if (warehouse && WAREHOUSES.includes(warehouse)) q = q.eq("warehouse_id", warehouse);
      const { data, error } = await q.order("received_date", { ascending: false }).limit(5);
      if (error) return json({ ok: false, error: error.message }, 500);
      if (!data || !data.length) return json({ ok: false, error: "lot_no tidak ditemukan" }, 404);
      return json({ ok: true, batches: data.map(pick) });
    }

    // 清單模式：某倉最近 N 天（1~90，預設 14）
    if (!WAREHOUSES.includes(warehouse)) {
      return json({ ok: false, error: "warehouse harus salah satu: " + WAREHOUSES.join("/") }, 400);
    }
    let days = Number(body.days) || 14;
    days = Math.max(1, Math.min(90, Math.floor(days)));
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    const { data, error } = await admin
      .from("item_batches")
      .select(SELECT)
      .eq("warehouse_id", warehouse)
      .gte("received_date", cutoff)
      .order("received_date", { ascending: false })
      .limit(100);
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, batches: (data || []).map(pick) });
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message || e) }, 500);
  }
});

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
