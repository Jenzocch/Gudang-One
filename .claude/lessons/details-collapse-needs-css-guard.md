# Any author `display` rule on a `<details>` child kills native collapse — always add an explicit guard, and print needs a matching-specificity re-open.

Found in `panduan-lengkap.html`: giving list children `display:flex` for layout
silently broke `<details>` collapse — closed cards still showed their content.
Author-origin CSS beats the UA stylesheet's "hide when closed" behavior
regardless of selector specificity, so ANY `display` on a non-summary child
(flex, grid, even block) re-shows it while closed.

**Why it matters:** the manuals (`panduan.html`, `panduan-lengkap.html`) are
built entirely on `<details>` accordions; a layout tweak anywhere inside them
can quietly break collapse with no error, and it only shows up visually.

**How:**
- Every `<details>`-based page carries the guard:
  `details:not([open])>*:not(summary){display:none!important}`
- `@media print` must force content open with a rule of **matching or higher
  specificity** (`details:not([open])>*:not(summary){display:block!important}`)
  — a lower-specificity `display:revert` loses the cascade tie to the guard and
  prints blank cards. Use `block`, not `revert`, so intentional flex layouts
  aren't also reverted.
- Testing caveat: the sandbox's headless Chromium does NOT demonstrate native
  `<details>` collapse even with zero CSS (verified with a bare repro), so
  "still visible when closed" in Playwright here is NOT proof of an app bug.
  Verify collapse logic by code review + the guard rule, not by this browser.
