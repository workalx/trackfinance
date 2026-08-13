# Custom Calendar Date Picker & Day-Grouped Blocks — Design Spec

Date: 2026-08-12

Builds on the base app and the reports-dashboard increment (already merged
to `main`). This spec replaces the Add screen's plain day-number input with
a custom calendar date picker, and restructures both the add flow and the
saved-entries display around a "one day = one block" model.

## Purpose

The user wants to log expenses for any day in the recent past (not just
"today's day number in the current month"), pick that day from a proper
calendar instead of typing a number, and see saved expenses displayed with
their full date (day/month/year) grouped by day.

## Scope

In scope:
- A custom-built (no external library) calendar date picker, opened by
  tapping a date field on the Add screen.
- Calendar allows selecting any day from **20 months ago through today**
  (inclusive). Future dates (after today) are not selectable. This
  supersedes the earlier "current month only" restriction from the base
  spec.
- The Add screen's add flow becomes: pick **one date** (the block), then
  add **one or more store+amount rows** under it (no per-row date
  anymore), then "Зберегти все" saves all rows for that single date.
- The Add screen's saved-entries list shows **all entries regardless of
  month** (not just the current month), grouped into per-day blocks: each
  block has a date header ("5 серпня 2026") and the store/amount lines for
  that day beneath it.
- A sort toggle button on the Add screen's list: default sorts blocks by
  date (newest first); toggling switches to sorting by the order entries
  were added (most recently added block first).
- Visual styling of the calendar and the updated Add screen via the
  `ui-ux-pro-max` skill for a polished, native-app-like feel.
- Fix: `editEntry`'s day-range validation currently checks against the
  *current* month's day count; it must check against the entry's *own*
  month/year instead, since entries can now belong to any of the last 20
  months.

Out of scope:
- Changing the Reports screen's behavior — it already aggregates by
  arbitrary month/year and needs no changes.
- Letting `editEntry` change an entry's month/year (it still only edits
  day/store/amount via the existing prompt-based flow; the day bound just
  needs to use the correct month).
- Any backend, sync, or data migration — the entry shape
  (`{id, day, month, year, store, amount}`) is unchanged, so existing
  localStorage data keeps working as-is.

## Data model

No changes to the stored entry shape. The "block" is a derived grouping —
entries sharing the same `(day, month, year)` are grouped together at
render time on the Add screen, the same way Reports already groups by
`(month, year)`.

## Calendar component

A small, self-contained modal:
- Opened by tapping the date field/button at the top of the Add screen.
- Header: `‹ [Month] [Year] ›`. Forward arrow disabled when the visible
  month is the current month (can't go further into the future). Back
  arrow disabled once the visible month reaches 20 months before the
  current month.
- Day grid: 7 columns (Monday–Sunday, matching Ukrainian convention),
  auto-computed for however many days the visible month actually has
  (28–31) and correctly offset so the 1st lands on its real weekday.
  Days after today (when viewing the current month) are rendered
  disabled/unselectable, not hidden — so the grid shape stays consistent.
- Tapping a valid day selects it, closes the calendar, and updates the
  date field's label (e.g. "5 серпня 2026").
- A backdrop tap or a close control dismisses the calendar without
  changing the current selection.
- No native `<input type="date">` — this is a fully custom-built,
  app-styled component per the request, designed with the `ui-ux-pro-max`
  skill.

## Add screen flow

1. Date field at the top, defaulting to **today** the first time the
   screen loads (or after a successful save). Tapping it opens the
   calendar described above.
2. Below it: one or more rows, each with a store `<select>` (same fixed 4
   + custom stores + "+ свій" pattern as before) and an amount input, plus
   a per-row remove ("×") button (minimum one row always present) — same
   mechanics as the existing multi-row form, just without the day field.
3. "Зберегти все" validates every present row against the same rule as
   before (empty rows are skipped; partially-filled rows block save and
   are highlighted) — the only change is that day/month/year now come
   from the single selected date, applied to every valid row in the
   batch, instead of being read per-row and always defaulting to "now".
4. On success: every valid row becomes a new entry using the selected
   date; the row list resets to one blank row; the date field resets to
   today; the day-grouped entries list re-renders.

## Add screen entries list (day-grouped blocks)

- Source: **all** entries in `entries`, not filtered by month.
- Grouped by `(day, month, year)` into blocks. Each block renders:
  - A header showing the full date, e.g. "5 серпня 2026" (genitive month
    form for correct Ukrainian grammar, via a new genitive month-name
    table alongside the existing nominative one used elsewhere).
  - The store/amount lines for that day, each with its own edit/delete
    controls (same `editEntry`/`deleteEntry` as before, unchanged
    behavior beyond the month-bound fix).
- Sorting: a toggle button switches between two modes:
  - **За датою** (default): blocks ordered by date, newest first.
  - **За порядком додавання**: blocks ordered by when their most
    recently-added entry was pushed into the `entries` array (i.e., the
    block containing the most recently added entry appears first) — this
    needs no new stored field since the existing array's push order
    already encodes insertion order.
- The existing "Всього за [Місяць]" current-month total at the top of the
  Add screen stays as-is (it's a quick glance at the current month, not
  related to this list's grouping/sorting).
- Empty state (no entries at all yet) still shows the existing message.

## Error handling / edge cases

- Calendar: if `entries` already has data further than 20 months back
  (shouldn't normally happen since this is the only entry point, but
  defensive nonetheless), the calendar simply won't be able to navigate
  there — this only affects picking *new* dates, not displaying existing
  ones (the day-grouped list has no such limit).
- Save-all with zero rows valid: button stays disabled, same as before.
- `editEntry`: the day prompt's upper bound now comes from
  `daysInMonth(entry.month, entry.year)` instead of the current month —
  editing a July entry validates against July's day count even if it's
  September when the edit happens.

## Testing plan

Manual, in a mobile-width browser view:
- Open the calendar, confirm today's date is pre-selected/highlighted,
  future days in the current month are disabled, and the grid re-renders
  correctly when paging back through months with different day counts
  (28/29/30/31), including a leap-February.
- Page back 20 months and confirm the back arrow disables; confirm the
  forward arrow disables on the current month.
- Pick a past date, add 2 store/amount rows, save, confirm a new block
  appears in the list with that date as its header and both lines inside.
- Add another expense for today; confirm it forms a separate block from
  the past-date one, and appears above/below it correctly under both sort
  modes.
- Toggle the sort button and confirm block order changes as described
  above (by date vs. by add order).
- Edit a past-month entry's day to a value valid for *that* entry's month
  but invalid for the current month (or vice versa); confirm validation
  uses the entry's own month.
- Confirm the Reports screen and the current-month total are unaffected.
