# You can only edit repo `.ts`/SQL — deployed Edge Functions, secrets, and RLS are the user's to apply.

Edge Functions and secrets (`OFFICE_PIN`, `ADMIN_PIN`) live on Supabase, not in
the repo. Editing `supabase/functions/*/index.ts` does nothing until the user
deploys; you cannot read or set a secret's value.

**Why it matters:** assuming a `.ts` edit is "live" leads to "I changed the
code but the site didn't change".

**How:**
- After changing a function, spell out the two steps for the user:
  `supabase secrets set NAME=...` and `supabase functions deploy <name>` (CLI
  must run from the repo root that *contains* `supabase/`, not from inside it),
  or Dashboard → Edge Functions → Secrets. Secrets take effect without a
  redeploy; code changes need a deploy.
- Ordering rule for security tightening: **ship the frontend change first, then
  revoke** anon rights / enable RLS. Reversing it breaks login/load for the
  still-direct frontend.
- Destructive actions (delete files, revoke RLS, purge) — first prove it's safe
  (grep for references; confirm the frontend only reads, never writes/deletes
  that resource), list it for the user, and mark migrations "run once in SQL
  Editor". Get confirmation before doing irreversible things.

Detail: `docs/SETUP_ADMIN_OFFICE.md`, `docs/HOW_CLAUDE_EDITS_CODE.md`, `docs/SECURITY_AUDIT.md`.
