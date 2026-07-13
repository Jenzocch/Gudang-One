# Supabase writes return `{error}` instead of throwing — check `.error` on every one.

`await sb.from(...).insert/update/delete()` resolves to `{data, error}`; a
failed write does **not** reject and does **not** throw. If you don't inspect
`.error`, a failed write reads as success and data silently diverges.

**Why it matters:** this caused real "saved but actually failed" bugs
(stocktake, tx edit/delete, PO approval).

**How:** after each write, `if(r.error) throw r.error;`. For batch writes,
check each row in the loop and report partial success ("N saved / M failed").
For fire-and-forget, inspect `r.error` inside `.then()` before toasting
success.
