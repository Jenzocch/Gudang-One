# Item master is shared across warehouses; stock is per-warehouse — so every action picks a warehouse first.

Data model: `items` is one shared master (name/photo/unit) across all
warehouses; `item_variants` + `item_batches` hold independent stock per
warehouse. The model is already correct — fix flows, not schema, to guide
users onto it.

**Why it matters:** in the "Semua Gudang" (all-warehouses) view the same item
shows one card per warehouse; without a warehouse marker they look like
duplicates and users act on the wrong one or create dupes.

**How:**
- Every stock action is warehouse-first: if no warehouse is active, ask which
  one before proceeding (Tambah Barang, Cek Stok both do this and store the
  target, e.g. `STK_WH`/`ADD_WH`) — no global warehouse switch, no reload.
- In all-warehouse views, tag each card with a colored warehouse badge, and
  filter batch-derived data (lot counts, near-expiry) by the card's own
  variant warehouse, not `CURRENT_WAREHOUSE` (which is empty there).
- Duplicate-name checks must query the global `items` master, not just the
  loaded warehouse, or a same-named item in another warehouse silently creates
  a second master row.

Evidence: commits `61307de`, `bac51b5`, `69b5410`, `b4b5f20`.
