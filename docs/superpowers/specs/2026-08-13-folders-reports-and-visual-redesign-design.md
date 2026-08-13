# Folders, Period Reports, Print, and Visual Redesign — Design Spec

Date: 2026-08-13

Builds on the current app (calendar date picker, day-grouped blocks, JPG
export — all merged to `main`). Source requirements: `some.txt` on the
user's Desktop, plus a hand-drawn prototype image
(`5183713677746572539_121.jpg`) showing the desired Reports layout.

## Purpose

The user wants to separate expenses into three budget categories
("folders"): Продукти (groceries), Обов'язкові платежі (mandatory
payments), Інше (other). Each folder tracks its own stores/payees and
history. Reports need to show totals both per-folder and combined, for
a month, a year, or an arbitrary date range, with a way to print the
report. The whole app should also get a visual refresh: dark, matte
gradient accents, subtle animation — more polished than the current
plain flat styling.

## Scope

In scope:
- **Folders**: 3 fixed folders (Продукти, Обов'язкові платежі, Інше)
  plus user-created custom folders, selected via tabs at the top of the
  Add screen. Every expense entry belongs to exactly one folder.
- **Per-folder store lists**: Продукти starts pre-populated with
  Walmart/Dollarama/Freshco/Costco; Обов'язкові платежі, Інше, and any
  custom folder start empty. Stores are added the same "+ свій" way as
  today, but saved under that folder only.
- **Manage stores screen**: reachable from the Add screen for the
  current folder, listing that folder's stores with a delete button
  next to each. Deleting removes the store from future selection only
  — existing entries that already used that store name are untouched
  (they keep displaying with that store name; it's just data, not a
  live reference).
- **Reports redesign**: a Місяць/Рік toggle plus ‹ period › navigation
  (both modes existed before per-month only; now also per-year), and a
  third mode, Період, with two date pickers (from/to, reusing the same
  calendar component) and a flat table of matching entries across all
  folders (date, folder, store, amount).
- For Місяць/Рік modes: overall total across all folders at the top,
  then one card per folder showing that folder's total, each followed
  by that folder's store breakdown — matching the prototype image's
  layout (grand total → 3 folder-total cards → per-folder store lists).
- **Print**: a "Друкувати" button replaces the existing "Скачати .jpg"
  button, calling `window.print()` with a print stylesheet that shows
  only the report content (hides tab bars, nav chrome, buttons).
- **Visual redesign**: dark-first theme with matte (desaturated, not
  glossy) gradient accents on cards/buttons/headers, glass-like card
  surfaces, subtle entrance and press-feedback animations
  (150-300ms, ease-out, respecting `prefers-reduced-motion`). Applied
  consistently across every screen (Add, folder tabs, calendar,
  manage-stores, Reports) — a full visual pass, not just the new parts.

Out of scope:
- Removing or renaming the base "store" concept — the field stays
  labeled "Магазин" in every folder, even where the prototype shows
  non-store items like "Gas"/"Home" (Обов'язкові платежі); no
  per-folder field relabeling.
- Any backend, accounts, or sync — still 100% localStorage.
- Editing which folder an existing entry belongs to (edit still only
  touches day/store/amount, consistent with the current `editEntry`).
- The canvas-based JPG export code is deleted, not kept alongside
  print (per explicit decision: print replaces JPG, doesn't add to it).

## Data model

Entry shape gains one field:

```json
{ "id": "...", "day": 12, "month": 8, "year": 2026, "store": "Walmart", "amount": 42.5, "folder": "Продукти" }
```

`folder` is a string: one of the 3 fixed names or a user-created custom
folder name. Existing entries in localStorage predate this field —
`loadEntries()` must default any entry missing `folder` to `"Інше"` on
load, so old data doesn't disappear or crash rendering.

New localStorage keys:
- `expenseTracker.customFolders` — JSON array of user-added folder
  names (the 3 fixed ones are never stored, only additions).
- `expenseTracker.storesByFolder` — JSON object mapping folder name →
  array of custom store names for that folder (replaces the old flat
  `expenseTracker.customStores` key). Продукти's 4 fixed stores stay
  hardcoded, same pattern as today, just scoped per folder for any
  *additional* stores.

## Add screen (per folder)

- Folder tab row at the very top of the Add screen: one tab per fixed
  folder + custom folders, in creation order, plus a trailing "+" tab.
  Tapping "+" prompts for a name (same `prompt()` pattern as custom
  stores) and appends a new tab, auto-selected.
- Everything below the tab row is scoped to the selected folder: the
  "Всього за [Місяць]" quick total, the date field + calendar, the
  add-rows (store dropdown + amount, unchanged mechanics), and the
  day-grouped entries list with its sort toggle — all filtered to
  `entries.filter(e => e.folder === selectedFolder)`.
- A "Керувати магазинами" link/button near the store dropdown opens the
  manage-stores screen for the currently selected folder.
- Switching folder tabs does not reset the selected date in the
  calendar (small UX nicety — the user might be logging several
  folders' worth of expenses for the same day in one sitting).

## Manage stores screen

- Opened from the Add screen; shows a back control to return.
- Title includes the folder name ("Магазини — Продукти").
- One row per store (fixed + custom) in that folder: name + a delete
  button. Fixed stores (Walmart etc. for Продукти) CAN be deleted too —
  the fixed list is just the starting default, not a protected set;
  deleting one removes it from that folder's picker going forward.
- No add control here (adding stays via "+ свій" during row entry, to
  avoid duplicating that flow) — this screen is delete-only, per the
  approved design.
- Empty state ("Немає магазинів у цій папці") if a folder's list is
  fully emptied out.

## Reports screen

- Top-level mode switch: **Місяць | Рік | Період** (3-way toggle).
- **Місяць mode** (existing behavior, extended): ‹ month year › nav,
  bounded to current month forward / earliest data backward, as today.
- **Рік mode**: ‹ year › nav (no month component), same forward/backward
  bounding logic applied at the year granularity.
- Both Місяць and Рік render the same layout: overall total (sum across
  all folders for that period) at the top, then a card per folder
  showing that folder's period total, and beneath each folder card its
  store breakdown for that period (store name + subtotal, sorted
  descending) — this is the structure from the prototype image.
- **Період mode**: two date fields (from/to), each opening the existing
  calendar component (bounded the same way — no future dates; from ≤
  to, enforced by clamping/disabling invalid combinations). Below them,
  a flat table of every entry whose date falls in the closed range
  `[from, to]`, across all folders, columns: Дата, Папка, Магазин,
  Сума — sorted newest first.
- "Друкувати" button, always visible regardless of mode, prints
  whatever is currently rendered on the Reports screen.

## Print

- `window.print()` triggered by the "Друкувати" button.
- A `@media print` stylesheet block hides `.tab-bar`, the Add screen
  entirely (report printing only makes sense from the Reports screen,
  but the rule is scoped defensively in case print is somehow
  triggered while Add is visible), and all buttons/controls within the
  Reports screen except leaves the data (totals, folder cards,
  breakdowns, table) visible with light-mode-forced colors (print
  media should never render as literal black-background dark mode —
  force white background / dark text via the print block regardless of
  the user's live theme).

## Visual redesign

- Keep the existing CSS custom-property token system
  (`--bg`, `--surface`, `--text`, `--text-muted`, `--accent`,
  `--danger`, `--border`) as the foundation — add new tokens rather
  than replacing the mechanism: `--accent-2` (a second hue for
  gradients), `--gradient-accent` (a matte two-stop gradient built from
  `--accent`/`--accent-2`, e.g. `linear-gradient(135deg, var(--accent), var(--accent-2))`
  at reduced saturation — no vivid rainbow/aurora gradients per the
  user's "matte" call), and `--radius-lg` (16px, replacing the current
  mix of ad-hoc radii on cards for consistency).
- Cards (day-blocks, folder-total cards, report blocks) get: `--radius-lg`
  corners, a hairline border (`rgba(255,255,255,0.08)`-equivalent using
  the existing `--border` token), and a subtle top-edge gradient sheen
  or soft background gradient wash (matte, low-opacity) rather than a
  flat single color.
- Primary action buttons (Зберегти все, Друкувати, folder-total card
  headers) use `--gradient-accent` as their background.
  Secondary/neutral buttons stay flat `--surface`.
  Destructive actions stay `--danger`, unchanged.
  This distinction is deliberate: gradient = primary action, solid = everything else — so gradients emphasize instead of decorating everything equally.
- Motion: card/list entrance fades+slight-translate-up (150-250ms,
  ease-out) when a screen/tab first renders its content; press feedback
  (scale 0.97) on buttons and store chips using `transform`/`opacity`
  only (per the animation guidance already applied to the calendar
  sheet); everything wrapped so `prefers-reduced-motion: reduce`
  disables the transitions, matching the existing calendar sheet's
  pattern.
- This restyle touches every screen for visual consistency but changes
  no interaction logic outside what's already specified above.

## Error handling / edge cases

- Deleting the last remaining store in a folder: allowed: leaves the
  folder's row select with only the blank/"+ свій" options, exactly
  like today's "no stores yet" case in a freshly-added custom folder.
- Deleting a folder is **not** supported in this scope (only stores are
  deletable) — folders, once created, stay in the tab list forever
  (matches "+" for adding but nothing in the spec or prototype calls
  for folder deletion; avoids the harder question of what happens to
  that folder's existing entries).
- Період mode with `from > to`: the "to" calendar simply can't be
  moved earlier than the selected "from" date (and vice versa) — same
  clamping approach as the existing calendar's forward/backward limits,
  applied dynamically against the other field's current value.
- Період mode with zero matching entries: show the existing pattern's
  empty-state message inline in place of the table.
- Old localStorage entries without a `folder` field default to "Інше"
  (see Data model) so upgrading never loses or corrupts history.
- Print with zero content on screen (e.g. Період with no results):
  print still works, produces a page with just the empty-state text —
  no special-casing needed since it prints whatever's rendered.

## Testing plan

Manual, mobile-width browser view, extending prior testing patterns:
- Add an expense to each of the 3 fixed folders plus one custom folder;
  confirm each folder's Add-screen list only shows its own entries and
  totals only sum its own entries.
- Add a custom store to Обов'язкові платежі, confirm it does NOT appear
  in Продукти's store list and vice versa.
- Open "Керувати магазинами" for Продукти, delete Costco, confirm it's
  gone from the row dropdown but an existing Costco entry (added
  before deletion) still displays correctly everywhere.
- Reports: seed entries across all 3 folders for one month, switch to
  Rік mode, confirm the same layout aggregates correctly at year
  granularity; switch to Період, pick a range spanning 2 months,
  confirm the flat table matches expected entries with correct folder
  column.
- Click Друкувати in each Reports mode, confirm the browser print
  preview shows a clean light-background page with just the report
  content (use the browser's print-preview, not an actual printed
  page).
- Confirm an entry saved by the previous (pre-folders) version of the
  app — i.e., one missing the `folder` key — still renders, filed under
  "Інше".
- Visual: confirm gradient accents render correctly in both light and
  dark system theme, animations respect `prefers-reduced-motion`, and
  no interaction (clicking, adding, deleting) regressed from the
  restyle.
