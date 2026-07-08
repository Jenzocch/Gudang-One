// Supabase Edge Function: famms-request-status
// Gudang One → FAMMS 的叫料單狀態回寫（線①的反向，本函式是「線①-反向」的入口）。
//
// 前端在核准/駁回一筆 requests 之後，best-effort 呼叫這支函式一次；函式自己
// 用 service_role 檢查這筆申請是不是 FAMMS 叫的（source='famms'），是才轉發，
// 不是就靜默結束 —— 前端不用自己判斷 source，也不能假冒別筆申請通知 FAMMS。
//
// 部署：
//   supabase secrets set FAMMS_CALLBACK_URL="https://<famms-domain>/api/gudang-callback"
//   supabase secrets set FAMMS_CALLBACK_SECRET="一段長隨機字串"   （與 FAMMS 端共享）
//   supabase functions deploy famms-request-status
//
// 呼叫（Gudang One 前端，核准/駁回 requests 之後 best-effort 呼叫一次）：
//   sb.functions.invoke('famms-request-status', { body: { request_id } })

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { notifyFamms } from "../_shared/famms-notify.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ ok: false, error: "server not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const requestId = body?.request_id;
    if (requestId == null) return json({ ok: false, error: "request_id wajib" }, 400);

    const admin = createClient(url, serviceKey);
    const found = await admin
      .from("requests")
      .select("id, status, source, source_ref")
      .eq("id", requestId)
      .single();

    if (found.error || !found.data) return json({ ok: false, error: "request tidak ditemukan" }, 404);

    const row = found.data as {
      id: number;
      status: string;
      source: string;
      source_ref: Record<string, unknown> | null;
    };

    // 不是 FAMMS 叫的 → 沒有對象可回饋，靜默結束（不是錯誤）
    if (row.source !== "famms") return json({ ok: true, forwarded: false });

    const ref = row.source_ref ?? {};
    await notifyFamms({
      event: "request_status",
      request_id: row.id,
      work_order: ref.work_order ?? null,
      machine_id: ref.machine_id ?? null,
      status: row.status,
    });

    return json({ ok: true, forwarded: true });
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
