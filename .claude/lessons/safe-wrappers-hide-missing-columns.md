# `sbInsertSafe`/`sbUpdateSafe` auto-drop unknown columns and retry — so a column that was never created fails *silently forever*; raw SQL is what finally exposes it.

**Symptom:** the item form's "📝 Catatan" (remark) field and the `#noalert`
low-stock mute appeared to save fine for months, but nothing ever persisted.
No error, no toast — the UI read the value back from its own form state.

**Root cause:** `items.remark` was never created by any migration. The
safe-wrapper helpers exist to survive schema drift: on a "column does not
exist" error they delete that key from the row and retry (up to 8 times).
That rescue is right for the *other* columns in the row, but it means a
permanently missing column is stripped on every single write with zero
signal. The bug only surfaced when a hand-written seed SQL
(`MIGRATION_SEED_DIN_MATERIALS.sql`) referenced `remark` directly — raw SQL
has no such fallback and failed loudly with `column "remark" does not exist`.

**Fix:** `MIGRATION_ITEMS_REMARK.sql` (`ADD COLUMN IF NOT EXISTS remark text`).

**How to avoid:**
- When frontend code reads/writes a DB column, confirm a migration created
  it — grep `migrations/` for the column name; don't assume the table has it
  because the code compiles and saves "work".
- Treat the safe-wrappers as a *deploy-window* bridge (new code live before
  the user runs the migration), not a licence to reference columns that no
  migration defines.
- A seed/backfill written in raw SQL doubles as a free schema check — if it
  errors on a column the app "uses", the app was silently dropping it.
