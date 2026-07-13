# After a mutation, refresh only the table that changed — don't re-run the full `loadAll()`.

`loadAll()` fires ~6 queries (items+images+people+batches+categories+config)
and re-renders; running it after every edit causes visible lag. Use the
layered refreshers — `refreshInventory()` (item_variants+batches only),
`refreshRequests()`, `refreshPeople()` — picked by which table the action
actually touched. Keep `loadAll()` only for genuinely cross-table ops (switch
warehouse, approve-buy which touches 3 tables, bulk purge, first load, retry).

**Two traps to avoid:**
- A `refreshXxx()` must wrap everything in try/catch and fall back to
  `loadAll()` on any error, and **never throw to its caller**. If it throws,
  the caller's catch will misreport an already-successful DB write as "Gagal",
  and the user retries → duplicate insert. Its job is "update the screen best
  effort", not "report whether the action succeeded".
- Extract shared data-shaping (`flattenItems()`, `syncMyPerms()`) so `loadAll`
  and the partial refreshers can't drift (one path forgetting a field).

Evidence: commits `f304d70`, `f2c6713`; `index.html` `refreshPeople`/`refreshInventory`.
