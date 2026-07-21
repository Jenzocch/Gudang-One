# API-merging a PR right after a push can grab a stale head — verify with `git merge-base --is-ancestor <sha> origin/main` after every merge.

Twice in one session a GitHub merge landed something other than what was
intended, both discovered only by independent git verification:

1. **Stacked-PR race (PR #28→#29):** PR #28 was based on another PR's
   feature branch; the base PR merged into main first, so #28's "merge"
   folded its commits into an already-merged branch ref — nothing new
   reached main.
2. **Push-then-merge race (PR #36→#37):** a commit was pushed, the PR
   body updated, then `merge_pull_request` called — but GitHub merged
   the PR's *previous* head; the just-pushed commit silently stayed out
   of main even though the push had succeeded and the merge reported OK.

**Why it matters:** in both cases the merge API returned success and the
PR showed "Merged". Trusting that status meant believing a fix was live
when it wasn't. UI/API "merged" refers to *a* head, not necessarily the
head you just pushed.

**How:** after any merge (or when the user says "merged"), run
`git fetch origin main` then `git merge-base --is-ancestor <your-latest-sha>
origin/main` (exit 0 = really in main; also check the merge commit's
parents with `git cat-file -p <merge-sha>` if suspicious). If a commit was
left behind, the feature branch still has it — a fresh PR from the same
branch to main carries exactly the missing delta.
