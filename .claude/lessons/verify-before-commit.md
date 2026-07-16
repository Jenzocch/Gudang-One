# Verify every change before committing: node --check the script, then Playwright render+assert.

Because `index.html` is one ~400KB file with high regression risk, don't trust
the eye:

- Syntax: extract the main `<script>` block and run `node --check` before
  every commit.
- Behavior/UI: render the actual page with Playwright (Chromium at
  `/opt/pw-browsers/chromium-1194/…`, install `playwright` into the scratchpad
  once) and assert the specific things you changed — element presence,
  permission hiding, URL encoding, touch-target height, warehouse filtering —
  plus a screenshot to catch pure-visual bugs (stale badge text, wrong size).
  Seed `DATA`/globals directly in `page.evaluate` to avoid needing live
  Supabase. Put the pass count in the commit ("Verified with Playwright 7/7").
- Clean up scratchpad test files after; don't commit them.

Also: Read the exact lines before Edit (unique `old_string`); don't re-Read to
"confirm" after — Edit errors if it failed. Write commit messages that state
the root cause and why, not just what changed.

Delegated work is no exception: when a subagent implements a batch and reports
"verified ✓", the lead still reads the full diff line-by-line against the spec
and re-runs node --check + at least one independent Playwright assertion on the
riskiest change before committing. A subagent's green self-report has been
wrong in test methodology (e.g. asserting against its own stubbed modal instead
of the real one) even when the production change was fine — independent
verification catches both directions.
