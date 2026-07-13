# Purchase prices are admin-only — gate every price display through `canSeePrice()`.

Buy/cost prices (hardware batch unit price, marketplace-compare baseline) are a
business secret and must be hidden from regular staff and requesters.

**How:** show price only when
`canSeePrice() = IS_SUPER || IS_ADMIN || (CURRENT_USER && CURRENT_USER.can_view_pricing)`.
Route all price rendering through this single helper, never a re-implemented
condition per site (they drift). The `💰` per-person flag (`can_view_pricing`)
is what grants a non-admin pricing access.

Evidence: commit `ca6ec0c` (introduced `canSeePrice`, both price sites use it).
