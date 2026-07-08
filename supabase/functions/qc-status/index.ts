// Supabase Edge Function: qc-status
// FQMS（品管系統）→ Gudang One 的 QC 狀態回寫入口。
// QC 判定後回寫 item_batches.qc_status（Pending/Pass/Hold/Fail）：
// 前端批次徽章立即變色；Hold/Fail 推 Telegram 警告倉庫「不得領用」；寫 audit_log 留痕。
// 若該批貨連過某筆 FAMMS 叫料（requests.linked_batch_id），也 best-effort 把
// qc_result 回饋給 FAMMS（見 _shared/famms-notify.ts；多數叫料沒連批次，屬正常情況）。
//
// 部署：
//   supabase secrets set QC_WEBHOOK_SECRET="一段長隨機字串"   （與 qc-lookup 共用同一把）
//   supabase functions deploy qc-status
//
// 呼叫（FQMS 的 Next.js 伺服器端）：
//   POST /functions/v1/qc-status
//   headers: { "x-qc-secret": <QC_WEBHOOK_SECRET>, "Content-Type": "application/json" }
//   body: { batch_id? , lot_no?+warehouse?, qc_status, inspection_no, judged_by, note? }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { notifyFamms } from "../_shared/famms-notify.ts";

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

    // 若這批貨是某筆 FAMMS 叫料的到貨批次（requests.linked_batch_id 有連過）→
    // 把 QC 結果也回饋給 FAMMS（best-effort；多數叫料是備品，本來就沒連過批次，
    // 這裡查不到東西是正常情況，不是錯誤）
    try {
      const linked = await admin
        .from("requests")
        .select("id, source_ref")
        .eq("linked_batch_id", b.id)
        .eq("source", "famms");
      for (const r of linked.data ?? []) {
        const ref = (r.source_ref ?? {}) as Record<string, unknown>;
        await notifyFamms({
          event: "qc_result",
          request_id: r.id,
          work_order: ref.work_order ?? null,
          machine_id: ref.machine_id ?? null,
          batch_lot_no: b.lot_no,
          qc_status: qcStatus,
          inspection_no: inspectionNo,
        });
      }
    } catch (_e) { /* best-effort */ }

    return json({ ok: true, batch_id: b.id, lot_no: b.lot_no, qc_status: qcStatus });
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message || e) }, 500);
  }
});

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
