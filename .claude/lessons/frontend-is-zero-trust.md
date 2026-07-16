# The frontend is not a trust boundary: anon key = public write, so escape everything and keep secrets server-side.

The Supabase anon key ships in the browser and most tables have no RLS, so any
`sb.from().insert/update/delete` path is effectively public-writable, and
`IS_ADMIN`/`IS_SUPER` are UI gates only (anyone can set them in console).

**Why it matters:** treat every field that can be written via the anon key as
untrusted input, and never rely on a front-end flag for real protection.

**How:**
- `esc()` every user-controllable value before it enters `innerHTML` (names,
  lot_no, expiry, notes, tags…). Put URLs through `safeUrl()` (http/https
  whitelist, blocks `javascript:`/`data:`) and add `rel="noopener noreferrer"`.
  This is the default when writing render code, not an afterthought.
- `esc()` is NOT enough inside `onclick="fn('...')"` JS string literals — it
  doesn't escape single quotes, so a name containing `'` breaks out of the
  string. Use `jsq()` there (escapes backslash, then `'`, THEN esc() — that
  order matters because the browser HTML-decodes the attribute before
  JS-parsing it). Added for `prCardHTML`'s `showImg()` after Katalog Supplier
  made `product_refs` (anon-writable) feed an onclick.
- Real secrets (PINs, Telegram token) and sensitive writes live in Edge
  Functions (service_role, constant-time `safeEqual` for PINs, allow-listed
  columns). The backend enforces rules the UI only suggests — e.g.
  `manage-people` forces `is_admin=false` for Office and 403s privilege
  escalation. Don't rotate the anon key to "fix" this; close RLS instead.

Detail: `docs/SECURITY_AUDIT.md`, `supabase/functions/{verify-admin,manage-people}/index.ts`.
