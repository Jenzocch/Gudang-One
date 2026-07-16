# Amber/orange chrome is a severity signal — never use it decoratively; stick to the design tokens for neutral UI.

Two audit rounds (2026-07) found the same drift repeatedly: neutral UI dressed
in warning colors — the admin item search box (`#FFFBEB` bg + thick `#D97706`
border), the "⭐ Sering" favorites strip, the optional Shopee paste-hint boxes,
a settings toggle card. Staff learn to read amber as "something needs
attention"; decorating conveniences with it erodes that signal (and it just
looks wrong next to the token-consistent rest of the app).

**Why it matters:** the app's real warnings (low stock 🟠, expiry, "Teks tidak
terbaca" parse-failure feedback, untagged-items nudge) depend on amber meaning
*attention needed*. Severity colors are vocabulary, not palette.

**How:**
- Neutral containers: `var(--light)` / `var(--border)` / `var(--border-input)`.
  Brand accent / selected state: `var(--p)` filled (like `.catg-chip.act`).
  Success `var(--ok)`, caution `var(--warn)`-family, danger `var(--danger)` —
  only when the message genuinely carries that severity.
- Selected-vs-unselected toggles: explicit background/border swap, never
  `opacity:.5` (reads as disabled, not unselected).
- Page-identity banners: rounded + `box-shadow:var(--sh-sm)` card style (see
  Admin panel banner, QC header), not flat left-border strips.
- When adding any new inline-styled box, check whether an existing token/class
  already expresses it; drift starts as one "temporary" hex.
