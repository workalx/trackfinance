# Expense Tracker — Reports Dashboard & Multi-Entry Design Spec

Date: 2026-08-10

Builds on `2026-08-10-expense-tracker-pwa-design.md` (the base single-screen
expense logger, already implemented on the `expense-tracker-pwa` branch).
This spec covers the requested additions: a row-based multi-entry add form,
a Reports tab with monthly history and breakdowns, and a JPG export of the
report for printing.

## Purpose

The user wants to log several purchases faster (one row per purchase,
several at once) and to review their spending — not just as a single
running total, but broken down by store, by day, and across past months —
then print a monthly report.

## Scope (this increment)

In scope:
- Two bottom tabs: **Додати** (Add) and **Звіти** (Reports)
- Add screen: entry fields laid out in one horizontal row (day, store
  dropdown, amount); a "+" button adds another blank row; a single
  "Зберегти все" button saves every filled row at once
- Store selection in the row becomes a `<select>` dropdown (fixed 4 stores
  + previously-added custom stores) with a "+ свій" option to add a new
  custom store inline
- Reports screen: month navigator (‹ Month Year ›) restricted to months
  that actually have entries plus the current month; forward arrow
  disabled beyond the current month
- Reports screen shows, for the selected month: total, breakdown by store
  (list: store name + amount, sorted by amount descending), average and
  maximum single-day spend, and the full entries list for that month
  (read-only — no add/edit/delete from Reports; editing stays on the Add
  screen's list, current month only, as before)
- "Скачати .jpg" button on the Reports screen: renders the visible report
  (month/year, total, store breakdown, avg/max, entries list) onto a
  `<canvas>` and downloads it as a `.jpg` file, sized for printing

Out of scope (unchanged from base spec, or newly excluded):
- Adding/editing/deleting entries for a month other than the current one
  (Reports is read-only for past months)
- Charts/graphs (breakdown is a plain sorted list, not a bar/pie chart)
- Any backend, accounts, or cross-device sync
- JPG export of the Add screen (only the Reports screen is exportable)

## Architecture

Still a single `index.html` / `styles.css` / `app.js`, no framework, no
build step, no external libraries (canvas-based JPG export instead of a
DOM-screenshot library, since none can be installed without a build step
or a CDN dependency that would break offline use).

New pieces:
- Two `<section>` containers in `index.html`: `#add-screen` and
  `#reports-screen`, toggled via a bottom tab bar (`#tab-add`,
  `#tab-reports`). Only one is visible at a time (`hidden` attribute).
- `app.js` gains: multi-row add-form state, a `renderReports()` function,
  a month-cursor (`{month, year}`, separate from "current month" used by
  the Add screen), and a canvas-drawing export function.

## Data model changes

No changes to the stored entry shape (`{id, day, month, year, store,
amount}`). Reports simply filters/aggregates the same `entries` array by
whatever `{month, year}` the report cursor is pointing at, instead of
always using the current month.

## Add screen — multi-row entry

- Starts with one row: day input, store `<select>`, amount input.
- "+" button appends another identical blank row below it.
- Each row can be removed individually (small "×" per row) if the user
  added one by mistake, except the last remaining row.
- "Зберегти все" validates each row independently (same rules as the base
  spec: day 1..daysInMonth, store non-empty, amount > 0). Rows that fail
  validation are highlighted and block the save (no partial save) — the
  user fixes them and retries, consistent with the base app's
  fail-closed validation.
- On success: every valid row becomes a new entry (current month/year,
  auto-filled as before), the form resets to a single blank row, and the
  Add screen's entries list (unchanged from the base spec — still shows
  current-month entries with edit/delete) re-renders.
- The store `<select>` lists the 4 fixed stores + any custom stores
  previously saved, plus a trailing "+ свій" option. Picking "+ свій"
  prompts for a name (same `prompt()` pattern as the base app) and adds
  it to the dropdown for this and future rows.

## Reports screen

- Header: `‹ [Month] [Year] ›`. Back arrow steps to the previous month
  that has at least one entry (or does nothing if there is none). Forward
  arrow steps forward but is disabled/no-ops once at the current month
  (can't navigate into the future).
- Body, computed from `entries` filtered to the cursor's month/year:
  - Total for the month
  - "По магазинах" list: each distinct store in that month with its
    subtotal, sorted highest-to-lowest
  - "Середня витрата за день" = total / number of distinct days with at
    least one entry that month
  - "Максимальна витрата за день" = the single day (within the month)
    whose entries sum to the highest amount, shown as "$X.XX (day D)"
  - Full entries list for that month (day, store, amount) — read-only,
    no edit/delete controls here
  - If the month has no entries (e.g. a future month that has never been
    visited, though navigation prevents reaching pure-empty months by
    construction): show the same empty-state message as the base app
- "Скачати .jpg" button, described below.

## JPG export

- Draws directly to an offscreen `<canvas>` (no DOM screenshot, no
  external library):
  - White background, dark text (fixed light-mode look — a printed
    report doesn't need to follow the phone's dark/light theme)
  - Title line: "Мої витрати — [Month] [Year]"
  - Total line
  - Store breakdown lines
  - Average/max lines
  - Entries list, one line per entry ("[day] [Month] — [store] — $X.XX")
  - Canvas height grows with the number of lines so nothing is clipped
- `canvas.toBlob('image/jpeg', 0.92)` → object URL → a temporary
  `<a download="vytraty-YYYY-MM.jpg">` click triggers the browser's save
  flow. No server round-trip.

## Error handling / edge cases

- Multi-row save: at least one row must be fully valid, or the button
  stays disabled (mirrors the base single-row rule, generalized to "all
  present rows must be valid, and there must be ≥1 row").
- Removing rows never leaves zero rows — the UI keeps at least one blank
  row present.
- Reports navigation: if `entries` is empty entirely (fresh install),
  Reports shows the current month's empty state and both arrows are
  disabled.
- JPG export with zero entries for the shown month still produces a valid
  image (title + "$0.00" + "немає витрат" line) rather than failing.

## Testing plan

Manual, in a mobile-width browser view, extending the base app's plan:
- Add screen: add 3 rows in one save (different days/stores/amounts),
  confirm all 3 appear in the current-month list and total
- Add screen: add a row, remove it via "×", confirm it's gone before
  saving and doesn't create an entry
- Add screen: leave one of several rows invalid, confirm "Зберегти все"
  is blocked and no rows are saved
- Store dropdown: pick "+ свій", add a custom store, confirm it appears
  in the dropdown for a second row in the same session
- Reports: seed entries across 2+ months (via direct state manipulation
  in dev tools, since the UI can't backdate), confirm ‹ › navigate
  correctly between months that have data and stop at the current month
- Reports: confirm store breakdown subtotals and avg/max day figures are
  arithmetically correct against manually computed expected values
- Reports: click "Скачати .jpg", confirm a file downloads and visually
  contains the expected month, total, breakdown, and entries
- Tab switching: confirm Add and Reports are mutually exclusive and state
  (entries) stays in sync between them after adding/editing/deleting
