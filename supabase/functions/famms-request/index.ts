// Supabase Edge Function: famms-request
// FAMMS（設備維修系統）→ Gudang One 的叫料入口。
// FAMMS 工單需要零件/物料時 POST 到這裡：驗共享密鑰 → 寫一筆 requests
// （status=pending，出現在 Permintaan 分頁）→ 順手推 Telegram 通知倉庫。
//
// 部署：
//   supabase secrets set FAMMS_WEBHOOK_SECRET="一段長隨機字串"   （與 FAMMS 端共享）
//   supabase functions deploy famms-request
//
// 呼叫（FAMMS 的 Next.js 伺服器端）：
//   POST /functions/v1/famms-request
//   headers: { "x-famms-secret": <FAMMS_WEBHOOK_SECRET>, "Content-Type": "application/json" }
//   body: { machine_id, machine_name?, work_order, items:[{part_no?,name,qty,unit?}],
//           urgency?, requester, warehouse, note? }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-famms-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 常數時間比較，避免時序側漏（與 manage-people 相同做法）
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const WAREHOUSES = ["DENIKIN", "SJA", "HARDWARE", "OLENTIA"];
const URGENCY_LABEL: Record<string, string> = {
  low: "🟢 Tidak mendesak",
  normal: "🟡 Normal",
  urgent: "🔴 URGENT — mesin berhenti",
};

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
    const secret = Deno.env.get("FAMMS_WEBHOOK_SECRET");
    if (!url || !serviceKey) return json({ ok: false, error: "server not configured" }, 500);
    if (!secret) return json({ ok: false, error: "FAMMS_WEBHOOK_SECRET belum di-set" }, 500);

    const given = (req.headers.get("x-famms-secret") || "").trim();
    if (!given || !safeEqual(given, secret)) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const machineId = str(body.machine_id, 60);
    const machineName = str(body.machine_name, 120);
    const workOrder = str(body.work_order, 60);
    const requester = str(body.requester, 80);
    const warehouse = str(body.warehouse, 20).toUpperCase();
    const urgency = ["low", "normal", "urgent"].includes(body.urgency) ? body.urgency : "normal";
    const note = str(body.note, 500);
    const items = Array.isArray(body.items) ? body.items.slice(0, 20) : [];

    if (!machineId) return json({ ok: false, error: "machine_id wajib" }, 400);
    if (!workOrder) return json({ ok: false, error: "work_order wajib" }, 400);
    if (!requester) return json({ ok: false, error: "requester wajib" }, 400);
    if (!WAREHOUSES.includes(warehouse)) {
      return json({ ok: false, error: "warehouse harus salah satu: " + WAREHOUSES.join("/") }, 400);
    }
    if (!items.length) return json({ ok: false, error: "items kosong" }, 400);

    // 品項轉成 Permintaan 的自由文字格式（requests.items_requested 是 text）
    const itemLines = items.map((it: Record<string, unknown>) => {
      const name = str(it?.name, 120);
      const partNo = str(it?.part_no, 60);
      const qty = Number(it?.qty) || 0;
      const unit = str(it?.unit, 20) || "pcs";
      if (!name || qty <= 0) return null;
      return `• ${name}${partNo ? ` [${partNo}]` : ""} × ${qty} ${unit}`;
    }).filter(Boolean) as string[];
    if (!itemLines.length) return json({ ok: false, error: "items tidak valid (butuh name + qty>0)" }, 400);

    const noteParts = [
      `🔧 Dari FAMMS — WO ${workOrder}`,
      `🏭 Mesin: ${machineId}${machineName ? ` (${machineName})` : ""}`,
      URGENCY_LABEL[urgency],
    ];
    if (note) noteParts.push(`📝 ${note}`);

    const admin = createClient(url, serviceKey);
    const ins = await admin.from("requests").insert({
      person_name: requester,
      items_requested: itemLines.join("\n"),
      note: noteParts.join("\n"),
      status: "pending",
      warehouse_id: warehouse,
      // source/source_ref：讓 famms-request-status / qc-status 知道這筆申請該不該回饋給 FAMMS
      source: "famms",
      source_ref: { work_order: workOrder, machine_id: machineId, machine_name: machineName, requester },
    }).select("id").single();
    if (ins.error) return json({ ok: false, error: ins.error.message }, 500);

    // Telegram 通知（best-effort：失敗不影響叫料本身）
    try {
      const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
      const chatIdsRaw = Deno.env.get("TELEGRAM_CHAT_IDS") || "";
      if (token && chatIdsRaw) {
        const msg =
          `🔧 <b>Permintaan spare part dari FAMMS</b>${urgency === "urgent" ? " 🔴 URGENT" : ""}\n` +
          `🏭 ${escHtml(machineId)}${machineName ? ` (${escHtml(machineName)})` : ""} · WO ${escHtml(workOrder)}\n` +
          itemLines.map(escHtml).join("\n") + "\n" +
          `👤 ${escHtml(requester)} → Gudang ${escHtml(warehouse)}` +
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
    } catch (_e) { /* 通知失敗不擋叫料 */ }

    return json({ ok: true, request_id: ins.data.id });
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
