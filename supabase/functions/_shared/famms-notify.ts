// 共用：Gudang One → FAMMS 的回呼通知（best-effort，失敗不擋呼叫端的主流程）。
// 用在 famms-request-status（叫料狀態回寫）與 qc-status（qc_result 回饋）兩個函式。
//
// 環境變數（兩個都要設，缺一個就整條線靜默跳過 —— 沒設定不算錯誤，
// 對應規劃書「壞了不互拖」原則，FAMMS 端還沒接好時 Gudang One 照常運作）：
//   FAMMS_CALLBACK_URL     FAMMS 端接收端點（例如 https://famms.example.com/api/gudang-callback）
//   FAMMS_CALLBACK_SECRET  與 FAMMS 端共用的密鑰（header: x-gudang-secret）
export async function notifyFamms(payload: Record<string, unknown>): Promise<void> {
  try {
    const url = Deno.env.get("FAMMS_CALLBACK_URL");
    const secret = Deno.env.get("FAMMS_CALLBACK_SECRET");
    if (!url || !secret) return; // 尚未設定 → 靜默跳過

    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-gudang-secret": secret },
      body: JSON.stringify(payload),
    });
  } catch (_e) {
    // best-effort：FAMMS 收不到不影響 Gudang One 自己的流程
  }
}
