// Supabase Edge Function: qc-status
// FQMS（品管系統）→ Gudang One 的 QC 狀態回寫入口。
// QC 判定後回寫 item_batches.qc_status（Pending/Pass/Hold/Fail）：
// 前端批次徽章立即變色；Hold/Fail 推 Telegram 警告倉庫「不得領用」；寫 audit_log 留痕。
//
// 部署：
//   supabase secrets set QC_WEBHOOK_SECRET="一段長隨機字串"   （與 qc-lookup 共用同一把）
//   supabase functions deploy qc-status
//
// 呼叫（FQMS 的 Next.js 伺服器端）：
//   POST /functions/v1/qc-status
//   headers: { "x-qc-secret": <QC_WEBHOOK_SECRET>, "Content-Type": "application/json" }
//   body: { batch_id? , lot_no?+warehouse?, qc_status, inspection_no, judged_by, note? }
//   選填 batch_type: "finished" ＝回寫成品批（din_production/sja_production 的
//   qc_status/qc_date/qc_inspection_no/qc_judged_by/qc_note）；不帶或 "item" 或
//   其他值＝維持原料批（item_batches），完全向下相容。冪等：重複收到相同狀態視為成功。

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-qc-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const WAREHOUSES = ["DENIKIN", "SJA", "HARDWARE", "OLENTIA"];
const QC_STATUSES = ["Pending", "Pass", "Hold", "Fail"];

// 成品批：生產批次表對應（qc-lookup 的 ref_type 也用同一組名字）
const FINISHED_TABLES: { table: string; warehouse: string; lotCols: string[]; prodJoin: string }[] = [
  { table: "din_production", warehouse: "DENIKIN", lotCols: ["lot_no", "batch_no"], prodJoin: "din_products(name)" },
  { table: "sja_production", warehouse: "SJA", lotCols: ["batch_lot_no"], prodJoin: "sja_products(name)" },
];

function str(v: unknown, max: number): string {
  return (v == null ? "" : String(v)).slice(0, max).trim();
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
    const batchId = str(body.batch_id, 60);
    const lotNo = str(body.lot_no, 60);
    const warehouse = str(body.warehouse, 20).toUpperCase();
    const qcStatus = str(body.qc_status, 10);
    const inspectionNo = str(body.inspection_no, 40);
    const judgedBy = str(body.judged_by, 80) || "FQMS";
    const note = str(body.note, 300);

    if (!QC_STATUSES.includes(qcStatus)) {
      return json({ ok: false, error: "qc_status harus salah satu: " + QC_STATUSES.join("/") }, 400);
    }
    if (!inspectionNo) return json({ ok: false, error: "inspection_no wajib" }, 400);
    if (!batchId && !lotNo) return json({ ok: false, error: "butuh batch_id atau lot_no" }, 400);

    const admin = createClient(url, serviceKey);

    // batch_type 白名單：只認 "finished"；其他值（含缺省、"item"、怪值）一律走原料批，不 500
    const batchType = str(body.batch_type, 20).toLowerCase() === "finished" ? "finished" : "item";
    if (batchType === "finished") {
      return await handleFinished(admin, { batchId, lotNo, warehouse, qcStatus, inspectionNo, judgedBy, note });
    }

    const SELECT = "id, lot_no, qc_status, warehouse_id, items(name)";

    // 找批次：優先 batch_id，否則 lot_no（+warehouse 縮小範圍）
    let q = admin.from("item_batches").select(SELECT);
    if (batchId) q = q.eq("id", batchId);
    else {
      q = q.eq("lot_no", lotNo);
      if (WAREHOUSES.includes(warehouse)) q = q.eq("warehouse_id", warehouse);
    }
    const found = await q.order("received_date", { ascending: false }).limit(2);
    if (found.error) return json({ ok: false, error: found.error.message }, 500);
    if (!found.data || !found.data.length) return json({ ok: false, error: "batch tidak ditemukan" }, 404);
    if (!batchId && found.data.length > 1) {
      return json({ ok: false, error: "lot_no ambigu (ada di lebih dari satu gudang) — sertakan warehouse atau batch_id" }, 400);
    }

    const b = found.data[0] as Record<string, unknown>;
    const prevStatus = String(b.qc_status ?? "Pending");
    const itemName = ((b.items ?? null) as { name?: string } | null)?.name ?? "?";
    const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10); // WIB (UTC+7)

    const upd = await admin
      .from("item_batches")
      .update({ qc_status: qcStatus, qc_date: today })
      .eq("id", b.id as string);
    if (upd.error) return json({ ok: false, error: upd.error.message }, 500);

    // 稽核留痕（best-effort：audit_log 表尚未建立時不擋回寫）
    try {
      await admin.from("audit_log").insert({
        actor: "FQMS: " + judgedBy,
        action: "qc_status",
        table_name: "item_batches",
        row_id: String(b.id),
        summary: `${inspectionNo}: ${b.lot_no || "?"} (${itemName}) ${prevStatus} → ${qcStatus}${note ? " — " + note : ""}`,
        snapshot: { before: prevStatus, after: qcStatus, inspection_no: inspectionNo, note },
      });
    } catch (_e) { /* audit 失敗不擋回寫 */ }

    // Hold/Fail → Telegram 警告倉庫（best-effort）
    if (qcStatus === "Hold" || qcStatus === "Fail") {
      try {
        const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
        const chatIdsRaw = Deno.env.get("TELEGRAM_CHAT_IDS") || "";
        if (token && chatIdsRaw) {
          const icon = qcStatus === "Hold" ? "⏸" : "✗";
          const msg =
            `${icon} <b>QC ${qcStatus.toUpperCase()}</b> — jangan dipakai!\n` +
            `📦 Batch ${escHtml(String(b.lot_no || "?"))} (${escHtml(itemName)}) · Gudang ${escHtml(String(b.warehouse_id || "?"))}\n` +
            `📋 ${escHtml(inspectionNo)} · 👤 ${escHtml(judgedBy)}` +
            (note ? `\n📝 ${escHtml(note)}` : "");
          await Promise.allSettled(
            chatIdsRaw.split(",").map((s) => s.trim()).filter(Boolean).map((cid) =>
              fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: cid, text: msg.slice(0, 4096), parse_mode: "HTML" }),
              })
            ),
          );
        }
      } catch (_e) { /* 通知失敗不擋回寫 */ }
    }

    return json({ ok: true, batch_id: b.id, lot_no: b.lot_no, qc_status: qcStatus });
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message || e) }, 500);
  }
});

// ── 成品批回寫：din_production / sja_production ──
async function handleFinished(
  admin: ReturnType<typeof createClient>,
  p: { batchId: string; lotNo: string; warehouse: string; qcStatus: string; inspectionNo: string; judgedBy: string; note: string },
): Promise<Response> {
  // 找生產批次：batch_id 優先（兩張表都試，UUID 不會撞）；否則 lot_no（+warehouse 縮小範圍）
  type Hit = { row: Record<string, unknown>; table: string; warehouse: string };
  const hits: Hit[] = [];
  for (const cfg of FINISHED_TABLES) {
    if (p.warehouse && WAREHOUSES.includes(p.warehouse) && cfg.warehouse !== p.warehouse) continue;
    const SELECT = "id, " + cfg.lotCols.join(", ") + ", product_code, qc_status, " + cfg.prodJoin;
    if (p.batchId) {
      const { data, error } = await admin.from(cfg.table).select(SELECT).eq("id", p.batchId).limit(1);
      if (error) {
        // UUID 形式不合法時 postgres 會報錯 — 當「這張表沒有」處理，繼續試下一張
        continue;
      }
      (data || []).forEach((r) => hits.push({ row: r as Record<string, unknown>, table: cfg.table, warehouse: cfg.warehouse }));
    } else {
      for (const col of cfg.lotCols) {
        const { data, error } = await admin.from(cfg.table).select(SELECT).eq(col, p.lotNo).limit(2);
        if (error) return json({ ok: false, error: error.message }, 500);
        (data || []).forEach((r) => {
          if (!hits.some((h) => String(h.row.id) === String((r as Record<string, unknown>).id))) {
            hits.push({ row: r as Record<string, unknown>, table: cfg.table, warehouse: cfg.warehouse });
          }
        });
      }
    }
  }
  if (!hits.length) return json({ ok: false, error: "batch produksi tidak ditemukan" }, 404);
  if (!p.batchId && hits.length > 1) {
    return json({ ok: false, error: "lot_no ambigu — sertakan warehouse atau batch_id" }, 400);
  }

  const hit = hits[0];
  const b = hit.row;
  const prevStatus = String(b.qc_status ?? "Pending");
  const prodName = ((b.din_products ?? b.sja_products ?? null) as { name?: string } | null)?.name ??
    String(b.product_code ?? "?");
  const lotDisplay = String(b.lot_no ?? b.batch_no ?? b.batch_lot_no ?? "?");
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10); // WIB (UTC+7)

  // 冪等：同狀態重送照樣 update（結果相同）並回成功 —— FQMS 逾時重試不會收到錯誤
  const upd = await admin
    .from(hit.table)
    .update({
      qc_status: p.qcStatus,
      qc_date: today,
      qc_inspection_no: p.inspectionNo,
      qc_judged_by: p.judgedBy,
      qc_note: p.note || null,
    })
    .eq("id", b.id as string);
  if (upd.error) return json({ ok: false, error: upd.error.message }, 500);

  // 稽核留痕（best-effort）
  try {
    await admin.from("audit_log").insert({
      actor: "FQMS: " + p.judgedBy,
      action: "qc_status",
      table_name: hit.table,
      row_id: String(b.id),
      summary: `${p.inspectionNo}: ${lotDisplay} (${prodName}) ${prevStatus} → ${p.qcStatus}${p.note ? " — " + p.note : ""}`,
      snapshot: { before: prevStatus, after: p.qcStatus, inspection_no: p.inspectionNo, note: p.note },
    });
  } catch (_e) { /* audit 失敗不擋回寫 */ }

  // Hold/Fail → Telegram 警告出貨端（best-effort）
  if (p.qcStatus === "Hold" || p.qcStatus === "Fail") {
    try {
      const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
      const chatIdsRaw = Deno.env.get("TELEGRAM_CHAT_IDS") || "";
      if (token && chatIdsRaw) {
        const icon = p.qcStatus === "Hold" ? "⏸" : "✗";
        const msg =
          `${icon} <b>QC ${p.qcStatus.toUpperCase()} — PRODUK JADI</b>, jangan dikirim!\n` +
          `📦 Batch ${escHtml(lotDisplay)} (${escHtml(prodName)}) · Gudang ${escHtml(hit.warehouse)}\n` +
          `📋 ${escHtml(p.inspectionNo)} · 👤 ${escHtml(p.judgedBy)}` +
          (p.note ? `\n📝 ${escHtml(p.note)}` : "");
        await Promise.allSettled(
          chatIdsRaw.split(",").map((s) => s.trim()).filter(Boolean).map((cid) =>
            fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: cid, text: msg.slice(0, 4096), parse_mode: "HTML" }),
            })
          ),
        );
      }
    } catch (_e) { /* 通知失敗不擋回寫 */ }
  }

  return json({ ok: true, batch_id: b.id, lot_no: lotDisplay, qc_status: p.qcStatus, ref_type: hit.table });
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
