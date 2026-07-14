# Don't touch the same branch with both local git and GitHub API/MCP tools in one session — pick one per branch, or re-fetch between them.

This session has both local `git`/Bash and GitHub MCP tools
(`mcp__github__create_or_update_file`, `push_files`, etc.) that can write
directly to a remote branch. If content is pushed via the API path while the
local clone hasn't fetched it, the local branch is now behind — the next
plain `git push` gets rejected (non-fast-forward / "fetch first"), and if you
don't notice, a local commit made "on top of" the stale HEAD can silently
drop the API-made commit on the next force-leaning operation.

**Why it matters:** all code edits in this repo happen through local
Read/Edit/Bash+git (per `docs/HOW_CLAUDE_EDITS_CODE.md`); GitHub MCP tools
here are for read/PR-metadata operations (list/create/review PRs, check CI),
not for editing `index.html` or migrations. Keep it that way — one write path
per branch avoids the divergence class of bug entirely.

**How:** if a GitHub API tool ever does need to write to a branch this
session is also developing on locally, run `git fetch origin <branch> && git
rebase origin/<branch>` (or `git pull`) before the next local commit/push.
