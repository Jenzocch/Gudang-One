# Use local time for user-facing dates — `toISOString()` is UTC and shifts the day in Indonesia (UTC+7).

Indonesia is UTC+7, so taking a date via `toISOString()` gives the wrong
day/month before 07:00 local. Any user-facing date boundary (today's date,
"before this date" filters, expiry comparisons) must be computed in local time.

**How:** build dates manually like `today()` does —
`d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())` — not from the
UTC ISO string.

Evidence: `index.html` `today()` and its comment.

**Same gotcha, query side:** a bare `<input type="date">` value like
`"2026-07-01"` sent straight into `.lt('created_at', cutoff)` against a
`timestamptz` column gets cast by Postgres as UTC midnight — 7 hours earlier
than WIB midnight — so rows from 00:00–06:59 WIB on the cutoff day get
wrongly included as "before cutoff". Fix: append `T00:00:00+07:00` before
comparing against `timestamptz` columns; leave plain `date`-typed columns
(no time component) as the bare string. See `arcCutoffFor()` in `index.html`.
