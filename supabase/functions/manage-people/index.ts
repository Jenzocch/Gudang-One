// Supabase Edge Function: manage-people
// people 表的「寫入 / 更新 / 刪除」全部改走這裡，用 service_role 執行。
// 呼叫前必須通過 admin PIN 驗證（與 verify-admin 相同的 ADMIN_PIN secret）。
//
// 搭配 MIGRATION_LOCK_PEOPLE_WRITE.sql：對 anon/authenticated 撤掉 people 的
// INSERT/UPDATE/DELETE 權限後，前端就無法再直接寫 people（例如把自己設成 is_admin），
// 只有握有 6 位數 admin PIN 的人（後端驗證）才能經由本函數變更員工資料。
//
// 部署（SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ADMIN_PIN 由平台注入 / 你設定）：
//   supabase secrets set ADMIN_PIN="你的6位數PIN"   （若尚未設過）
//   supabase functions deploy manage-people

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 常數時間比較，避免時序側漏
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// 只允許這些欄位被寫入，避免本函數變成任意寫入的破口
const ALLOWED = ["name", "pin", "is_admin", "can_view_pricing", "warehouses", "can_ambil", "can_masuk"];
function pick(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ALLOWED) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const adminPin = Deno.env.get("ADMIN_PIN");
    if (!url || !serviceKey) {
      return json({ ok: false, error: "server not configured" }, 500);
    }
    if (!adminPin) return json({ ok: false, error: "ADMIN_PIN belum di-set" }, 500);

    const body = await req.json().catch(() => ({}));
    const pin = (body && body.admin_pin ? String(body.admin_pin) : "").trim();
    const action = body && body.action;

    // 授權閘門：PIN 錯 → 回 200 但 ok:false + unauthorized，讓前端清掉記憶中的 PIN
    if (!pin || !safeEqual(pin, adminPin)) {
      return json({ ok: false, error: "unauthorized" });
    }

    const admin = createClient(url, serviceKey);

    if (action === "insert") {
      const row = pick((body && body.row) || {});
      if (!row.name || String(row.name).trim() === "") {
        return json({ ok: false, error: "name kosong" }, 400);
      }
      const { data, error } = await admin
        .from("people")
        .insert(row)
        .select("id,name,is_admin,warehouses,can_view_pricing");
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, person: data && data[0] });
    }

    if (action === "update") {
      const id = body && body.id;
      if (id === undefined || id === null || id === "") {
        return json({ ok: false, error: "id kosong" }, 400);
      }
      const patch = pick((body && body.patch) || {});
      if (Object.keys(patch).length === 0) {
        return json({ ok: false, error: "tidak ada perubahan" }, 400);
      }
      const { error } = await admin.from("people").update(patch).eq("id", id);
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "delete") {
      const id = body && body.id;
      if (id === undefined || id === null || id === "") {
        return json({ ok: false, error: "id kosong" }, 400);
      }
      const { error } = await admin.from("people").delete().eq("id", id);
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ ok: false, error: "action tidak dikenal" }, 400);
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
