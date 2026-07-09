// Supabase Edge Function: qc-production-summary
// FQMS（品管系統）→ Gudang One 的「當日產量彙總」唯讀查詢入口。
// FQMS /admin/reports 每日報表用：把 QC 資料（檢驗/NCR/CCP/任務）跟這裡的
// 實際產量（din_production/din_rehidrasi）併在同一份報表顯示，取代「工人手寫
// →打進Excel→再彙整成LPH/LPE」那條會把同一筆數字碰三次的路徑。
//
// 刻意做成單純唯讀彙總、不落地任何資料、不建快取表——FQMS 那邊每次開報表現查現顯示，
// 兩邊系統都不需要為了這個功能多揹一份同步狀態。
//
// 部署：
//   supabase secrets set QC_WEBHOOK_SECRET="一段長隨機字串"   （與 qc-lookup/qc-status 共用同一把）
//   supabase functions deploy qc-production-summary
//
// 呼叫（FQMS 的 Next.js 伺服器端，src/lib/gudang.ts 的 callGudang()）：
//   POST /functions/v1/qc-production-summary
//   headers: { "x-qc-secret": <QC_WEBHOOK_SECRET>, "Content-Type": "application/json" }
//   body: { date: "YYYY-MM-DD" }

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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
    const date = (body.date == null ? "" : String(body.date)).trim();
    if (!DATE_RE.test(date)) {
      return json({ ok: false, error: "date harus format YYYY-MM-DD" }, 400);
    }

    const admin = createClient(url, serviceKey);

    // 三張表都只聚合當天（date 欄本身就是 DATE，不需要時區轉換），
    // 各自失敗不互相拖累——任一張表查詢出錯只讓該區塊回 null，其餘照常回傳。
    const [productionRes, rehidrasiRes, deliveryRes] = await Promise.allSettled([
      admin.from("din_production").select("total_kg, bags, batch_no").eq("date", date),
      admin.from("din_rehidrasi").select("rehidrasi_kg, jadi_basah_kg").eq("date", date),
      admin.from("din_delivery").select("kg, bags").eq("date", date),
    ]);

    const production =
      productionRes.status === "fulfilled" && !productionRes.value.error
        ? summarizeProduction(productionRes.value.data ?? [])
        : null;
    const rehidrasi =
      rehidrasiRes.status === "fulfilled" && !rehidrasiRes.value.error
        ? summarizeRehidrasi(rehidrasiRes.value.data ?? [])
        : null;
    const delivery =
      deliveryRes.status === "fulfilled" && !deliveryRes.value.error
        ? summarizeDelivery(deliveryRes.value.data ?? [])
        : null;

    return json({ ok: true, date, production, rehidrasi, delivery });
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message || e) }, 500);
  }
});

function summarizeProduction(rows: { total_kg: number | null; bags: number | null; batch_no: string | null }[]) {
  const totalKg = rows.reduce((sum, r) => sum + (r.total_kg ?? 0), 0);
  const totalBags = rows.reduce((sum, r) => sum + (r.bags ?? 0), 0);
  const batchCount = new Set(rows.map((r) => r.batch_no).filter(Boolean)).size;
  return { total_kg: round1(totalKg), total_bags: totalBags, batch_count: batchCount };
}

function summarizeRehidrasi(rows: { rehidrasi_kg: number | null; jadi_basah_kg: number | null }[]) {
  const rehidrasiKg = rows.reduce((sum, r) => sum + (r.rehidrasi_kg ?? 0), 0);
  const basahKg = rows.reduce((sum, r) => sum + (r.jadi_basah_kg ?? 0), 0);
  const hasilPct = rehidrasiKg > 0 ? round1((basahKg / rehidrasiKg) * 100) : null;
  return { rehidrasi_kg: round1(rehidrasiKg), jadi_basah_kg: round1(basahKg), hasil_pct: hasilPct };
}

function summarizeDelivery(rows: { kg: number | null; bags: number | null }[]) {
  const totalKg = rows.reduce((sum, r) => sum + (r.kg ?? 0), 0);
  const totalBags = rows.reduce((sum, r) => sum + (r.bags ?? 0), 0);
  return { total_kg: round1(totalKg), total_bags: totalBags };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
