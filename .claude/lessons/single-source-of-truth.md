# Derive from one source instead of hardcoding a second copy that goes stale.

Recurring win: anything derivable from one place should not be hand-typed a
second time, or the copies drift and one keeps a stale value.

**Examples that bit us / paid off:**
- Header logo badge reads `<img src="icon.svg">`, not a typed "G1" string, so
  swapping `icon.svg` updates everywhere (favicon, apple-touch-icon, badge) at
  once. The typed "G1" had gone stale.
- Login phone dropdown and tablet grid both render from the same
  `DATA.people`.
- Marketplace URLs live in one `MARKETPLACES` array — changing a platform's URL
  format is a one-line edit.
- Shared `flattenItems()`/`syncMyPerms()` so full and partial refresh can't
  diverge.
- Price visibility goes through one `canSeePrice()` gate everywhere, not a
  per-call-site copy of the condition.

Evidence: commits `52d6c31`, `2ea5d00`, `97b5e88`, `ca6ec0c`, `f304d70`.
