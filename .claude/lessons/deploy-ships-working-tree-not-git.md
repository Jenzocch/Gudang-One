# `supabase functions deploy` ships whatever is in the local working tree — a "Deployed ✓" after a *failed* `git pull` silently ships the old version.

**Symptom (real incident, 2026-07-21):** user ran `git pull origin main`
(it **aborted** — "local changes would be overwritten … Aborting"), then
`supabase functions deploy qc-lookup qc-status`. Deploy reported success —
but it had uploaded the months-old local files, overwriting the new version
that had just been deployed via the Dashboard minutes earlier.

**Root cause:** deploy tools read files off disk; they know nothing about
git state. "Deployed successfully" means "uploaded what was in the folder",
not "uploaded what's on main". A stale checkout plus leftover uncommitted
edits (an old Codex session's residue) meant the folder was two states
behind what everyone believed was shipping.

**Fix that worked:** `git stash push -m backup` → `git pull origin main`
(must actually say `Fast-forward`/`Updating …` with **no** "Aborting") →
deploy again.

**How to avoid:**
- Deploy instructions given to the user must be a *sequence with a
  checkpoint*: pull first, **confirm the pull succeeded** (updated-files
  list, no Aborting), only then deploy. Spell out what failure output looks
  like — users pattern-match "command printed stuff" as success.
- After a deploy that matters, verify content, not status: open the
  function's Code tab in the Dashboard and look for a marker only the new
  version has (e.g. a distinctive comment line).
- Same family as `verify-merge-actually-landed.md`: success messages report
  that *an* artifact shipped, never that it was the artifact you meant.
