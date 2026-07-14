# A migration file existing in `migrations/` ≠ it having been run on the live Supabase project — check `migrations/README.md`'s status column before shipping code that depends on it.

`migrations/` is 20+ raw `.sql` files meant to be pasted into the Supabase
Dashboard → SQL Editor by hand — there's no migration runner, so `git push`
never applies them. `migrations/README.md` tracks per-file status (✅ 已執行
vs 🆕 需在 Supabase SQL Editor 執行一次). That table is the source of truth for
"is this actually live," not the presence of the `.sql` file in the repo.

**Why it matters:** code that queries a column/table/policy a new migration
adds will break in production (or silently misbehave, e.g. an RLS policy
that isn't actually locked down yet) if that migration hasn't been run on the
real project (ref `klswfuzuhlowzrbncreu`) yet — "the file is in the repo" and
"the database has it" are two different facts.

**How:** when a commit adds a new `migrations/MIGRATION_*.sql`, add its row to
the `migrations/README.md` table with status 🆕 in the same commit (don't
leave it untracked — `MIGRATION_STORAGE_LOCKDOWN.sql` was missing from the
table). Before merging code that assumes a new migration is applied, either
confirm it's actually been run (ask the user, or query the schema), or make
the new-column/table read independent — wrapped so its failure doesn't take
down an unrelated core query.
