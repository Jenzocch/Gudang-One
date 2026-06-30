// Supabase Edge Function: notify-telegram
// 把 Telegram Bot Token 留在後端 secret，前端只送訊息文字，永遠看不到 token。
//
// 部署前先設定 secret（在專案目錄執行一次）：
//   supabase secrets set TELEGRAM_BOT_TOKEN="你的新token"
//   supabase secrets set TELEGRAM_CHAT_IDS="5003966994,6860586246,8388678925,5097723576"
// 部署：
//   supabase functions deploy notify-telegram

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const chatIdsRaw = Deno.env.get("TELEGRAM_CHAT_IDS") || "";
    if (!token) {
      return json({ ok: false, error: "TELEGRAM_BOT_TOKEN belum di-set" }, 500);
    }
    const chatIds = chatIdsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!chatIds.length) {
      return json({ ok: false, error: "TELEGRAM_CHAT_IDS belum di-set" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const msg = (body && body.msg ? String(body.msg) : "").trim();
    if (!msg) return json({ ok: false, error: "msg kosong" }, 400);
    // 防濫用：限制訊息長度（Telegram 上限 4096）
    const text = msg.slice(0, 4096);
    const parseMode = body && body.parse_mode ? String(body.parse_mode) : "HTML";

    const results = await Promise.allSettled(
      chatIds.map((cid) =>
        fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: cid, text, parse_mode: parseMode }),
        }),
      ),
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    return json({ ok: true, sent, total: chatIds.length });
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
