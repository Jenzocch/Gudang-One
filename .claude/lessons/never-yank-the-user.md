# Never yank the user away: preserve scroll/tab/DOM across every reload and edit.

The overriding UX rule for this app (warehouse staff mid-task) is that the
screen must not jump or reset. Techniques already in place — reuse them, don't
regress them:

- `renderAll()` builds the tab skeleton once; if `#mc` already has `.sec`
  children it only toggles `active` and re-renders the current tab — it does
  **not** wipe `#mc.innerHTML` (that used to cause add/edit jumping).
- `TAB_DATA` + `invalidateTabs([...])`: a mutation only marks the tabs whose
  data actually changed as dirty; unrelated tabs stay rendered so switching to
  them is instant. `goTab` re-renders only when `!RENDERED_TABS[id]`.
- `snapshotView()`/`restoreView()` before/after any in-place re-render to keep
  `.content` scrollTop and search-input values.
- Deleting a row removes just that row's DOM. Switching warehouse filters the
  already-loaded all-warehouse data locally and stays on the same tab
  (`ADMIN_SUBTAB` remembers the sub-tab); it does not force-jump or reload.

Also keep it jank-free: chunk large list renders, debounce type-triggered
queries, and run post-refresh side effects (e.g. `checkLowStock`) once via
`setTimeout`. Before any full-page-repaint action, guard unsaved cart/stocktake.

Evidence: commits `c72c68d`, `f304d70`, `070e71f`, `b4b5f20`.
