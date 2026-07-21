# Every new `items` column must be added to BOTH flatten whitelists — `flattenItems()` *and* the inline flatten inside `preloadAllWarehouses()` — or it reaches the DB but never the UI.

**Symptom:** a new `items` column saves correctly and shows in the current
warehouse, but is mysteriously blank after switching warehouses (or in any
feature reading the preload cache, e.g. the home global stock search).

**Root cause:** the raw `item_variants.select('*, items(*)')` join is
flattened into `DATA.items` through an explicit field whitelist, and that
whitelist exists in **two places**: `flattenItems()` (live load) and a
duplicated inline flatten inside `preloadAllWarehouses()` (localStorage
cache for warehouse switching). A column added to only one site works in
some views and silently vanishes in others — worse than failing everywhere,
because it looks done.

**It bit twice in one session:** `supplier_whatsapp`, then `pcs_per_ctn` —
each time the column existed in the DB and saved fine, but one render path
showed nothing.

**How to avoid:** when adding any `items`/`item_variants` field, grep for an
existing flattened field (e.g. `supplier_whatsapp:`) — every hit is a
whitelist that needs the new field too. Longer-term fix if this bites a
third time: extract one shared flatten function and call it from both sites
(see `single-source-of-truth.md`).
