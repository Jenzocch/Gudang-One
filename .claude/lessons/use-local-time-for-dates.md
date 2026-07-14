# Use local time for user-facing dates — `toISOString()` is UTC and shifts the day in Indonesia (UTC+7).

Indonesia is UTC+7, so taking a date via `toISOString()` gives the wrong
day/month before 07:00 local. Any user-facing date boundary (today's date,
"before this date" filters, expiry comparisons) must be computed in local time.

**How:** build dates manually like `today()` does —
`d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')`
— not from the UTC ISO string.

Evidence: `index.html` `today()` and its comment.

**Same gotcha, query side — but the fix is NOT "append +07:00":** the ts:true
archive columns (`transactions`/`requests`/`item_batches`.`created_at`,
`qc_checks`.`checked_at`) are `TIMESTAMP` **without** time zone, storing UTC
wall-clock time written by `now()`. A bare `<input type="date">` value like
`"2026-07-01"` sent into `.lt('created_at', cutoff)` gets cast as UTC
midnight — 7 hours earlier than WIB midnight — so rows from 00:00–06:59 WIB
on the cutoff day get wrongly included as "before cutoff". Appending a literal
`+07:00` offset does **not** fix this: Postgres silently drops the offset when
casting a string to a zone-less `timestamp`, so `'2026-07-01T00:00:00+07:00'`
and `'2026-07-01T00:00:00'` land on the exact same row — the bug survives.
The real fix is to compute the WIB-midnight *instant* client-side and convert
it to its UTC wall-clock string with `toISOString()`
(`new Date(cutoff+'T00:00:00+07:00').toISOString()`), which matches how the
column's values were written. Leave plain `date`-typed columns (no time
component) as the bare string. See `arcCutoffFor()` in `index.html`.
