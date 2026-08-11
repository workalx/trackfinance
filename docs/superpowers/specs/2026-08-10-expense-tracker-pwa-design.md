# Expense Tracker PWA — Design Spec

Date: 2026-08-10

## Purpose

A personal expense-tracking app for quick, one-handed entry while shopping.
The user wants to log, on the spot, which day of the current month they
spent money, at which store, and how much — then see a running total for
the month. It must install on a Samsung Android phone as a standalone app
(not just a bookmark).

## Scope (MVP / trial browser version)

In scope:
- Single-screen expense log with 3 fields: day, store, amount
- Monthly running total
- Edit and delete existing entries
- Fixed store list (Walmart, Dollarama, Freshco, Costco) + user-added custom stores
- Local persistence (localStorage), fully offline
- Installable as a PWA (manifest + service worker) so it behaves like a native app icon on Samsung/Chrome
- Auto light/dark theme (follows system)
- UI in Ukrainian; store names in English

Out of scope (explicitly deferred, not needed for this trial):
- Backend, accounts, cross-device sync
- Entering expenses for past/other months
- Categories beyond "store", notes/receipts, currency selection (fixed to CAD)
- Charts/analytics beyond the single monthly total
- Data export/import

## Architecture

Plain HTML/CSS/JS, no build step, no framework and no backend:

- `index.html` — single page: header (app name + monthly total), add-entry form, entries list
- `styles.css` — layout, light/dark theme via `prefers-color-scheme`
- `app.js` — state management (array of entries), render, event handlers, localStorage persistence
- `manifest.json` — PWA manifest (name, icons, standalone display, theme colors)
- `sw.js` — service worker: caches the app shell so it opens instantly and works offline after first load
- `icons/` — app icons for the home-screen install prompt

This is intentionally a single small app — no component framework needed for
3 fields and a list.

## Data model

Stored in `localStorage` under one key, as a JSON array:

```json
[
  { "id": "uuid", "day": 14, "month": 8, "year": 2026, "store": "Walmart", "amount": 23.45 }
]
```

- `month`/`year` are captured automatically from the device clock at entry time (per the "only current month" decision) and are not user-editable.
- `store` is either one of the 4 fixed names or a custom string the user added. Custom stores the user adds are remembered in a separate `customStores` localStorage list so they reappear as chips next time.
- `amount` is a positive number, CAD.

## UI / interaction flow

1. **Header**: app name + "Всього за [Місяць]: $X.XX" — recomputed live from all entries matching the current month/year.
2. **Add form**:
   - Day: number input/stepper restricted to 1–31 (and not beyond today's date, to avoid illogical future entries — clamped to valid days for the current month)
   - Store: chip/button group — Walmart, Dollarama, Freshco, Costco, plus a "+" chip that prompts for a custom store name (added to the chip row for reuse)
   - Amount: numeric input with `$` prefix, 2 decimals
   - "Додати" button, disabled until day + store + amount (>0) are all filled
3. **Entries list**: newest-first, one row per entry showing day, store, amount, with edit (pencil) and delete (trash) icons/buttons. Edit re-opens the row inline with the same 3 fields pre-filled. Delete asks for a lightweight confirm (tap again / small inline confirm) to avoid accidental data loss.
4. All changes persist to localStorage immediately and re-render the total.

## Error handling / edge cases

- Empty state: friendly message when there are no entries yet this month.
- Invalid day (e.g., 31 in a 30-day month) is prevented by clamping the input's max based on the current month/year.
- Amount must be a positive number; non-numeric or zero/negative input is rejected client-side with inline feedback.
- localStorage unavailable (rare, e.g. private mode edge cases) — app still functions for the session, entries just won't persist across reloads; no crash.
- New month rollover: total automatically recalculates to 0 once the device date crosses into a new month, since totals are computed live from entries filtered by current month/year rather than stored separately.

## Visual design

Delegated to the `ui-ux-pro-max` skill for concrete styling (palette, spacing,
component treatment) within these constraints: minimalist, mobile-first,
large touch targets (one-handed use in-store), automatic light/dark theme
via `prefers-color-scheme`.

## Testing plan

Manual verification in a mobile-width browser view (this is a trial/browser
version, no automated test framework needed for an MVP this size):
- Add an entry for each of the 4 fixed stores + one custom store; confirm it appears in the list and the total updates
- Edit an entry's day/store/amount; confirm the list and total update correctly
- Delete an entry; confirm it's removed and the total updates
- Reload the page; confirm entries persist (localStorage)
- Resize to a phone viewport; confirm layout and touch targets work
- Verify manifest/service worker register without console errors, and the browser offers "Install app" / "Add to Home Screen"
