# Gudang One — notes for AI collaborators

Warehouse inventory system for non-technical Indonesian warehouse staff.
Single-file frontend (`index.html`, ~6.5k lines, vanilla ES5) + Supabase
(anon key in the browser, Edge Functions, migrations). Language: Indonesian.

## Read the lessons before working

`.claude/lessons/` holds one durable lesson per file (corrections and
confirmed approaches, with why they matter). **Read them before making
changes** — they encode gotchas that aren't obvious from any single commit
(silent write failures, zero-trust frontend, don't-yank-the-user, etc.).

When you learn something worth keeping, add/update a lesson there: one lesson
per file, a one-line summary on the top line, no duplicating what the repo or
these notes already record. Delete a note if it turns out wrong.

Detailed background lives in `docs/` (SECURITY_AUDIT, SETUP_ADMIN_OFFICE,
HOW_CLAUDE_EDITS_CODE).
