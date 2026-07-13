# The whole app is one vanilla-ES5 `index.html` — match that style, don't modernize.

No framework, no build step, no modules. State is a pile of top-level globals
(`IS_ADMIN`, `CART`, `CURRENT_WAREHOUSE`, `DATA`, `IDX`…); rendering is
`renderXxx()` functions that build HTML strings into `innerHTML`. Code is
`var` + `function(){}`.

**Why it matters:** introducing `let/const`/arrow-heavy code, JSX, extra files,
or tooling breaks consistency and the zero-config deploy (Vercel serves the
static file). New code should read like the code already there.

**How:** find with Grep → Read the exact lines → Edit top-to-bottom → one
commit. For lookups use the prebuilt `IDX` maps (`buildIndexes()` →
`itemById()` O(1)) instead of scanning `DATA.items`; rebuild `IDX` after any
data change.
