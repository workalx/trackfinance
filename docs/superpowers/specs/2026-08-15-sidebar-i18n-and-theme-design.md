# Sidebar, i18n & Theme — Design

Sub-project 2 of 3 (login/sidebar/settings/responsive request). Builds on
sub-project 1 (Firebase auth + Firestore data foundation, already shipped).
Adds: a settings sidebar, full UA/EN/RU localization, a manually-switchable
light/dark theme (both synced per-account via Firestore), and explicit
"add store" buttons in two places.

Sub-project 3 (responsive polish across all screen sizes) builds on top of
this and is specced separately.

## Context

- Static, buildless PWA: `index.html` + `app.js` + `styles.css` + `sw.js`,
  no bundler. All data (entries, folders, stores, settings) already lives in
  Firestore under `users/{uid}`, gated behind mandatory Google sign-in
  (sub-project 1).
- `profileData` already has `language: 'uk'|'en'|'ru'` (default `'en'`) and
  `theme: 'light'|'dark'` (default `'light'`) fields in the Firestore schema
  — defined but unused until now. `saveProfileFields(fields)` already exists
  as the generic `updateDoc(doc(db,'users',uid), fields)` helper.
- Decisions from brainstorming:
  - Sidebar opens via a hamburger icon in the top-left of the header, slides
    in from the left.
  - "Керувати магазинами" moves from the main add-screen into the sidebar
    (removed from the add-screen entirely, not duplicated).
  - A new "Додати магазин" button, separate from the existing "+ свій"
    dropdown option, appears in two places: the manage-stores screen, and
    next to the store dropdown in the add-entry block on the main screen.
    Both reuse the existing `addStoreToFolder` flow (prompt for a name).
  - Only the three **fixed** folder names (Продукти / Обов'язкові платежі /
    Інше) are translated for display. Custom folders and all store names
    always render exactly as the user typed them, in every language — no
    translation, no data-model change, no migration.
  - Theme and language changes apply live (no page reload) and are visible
    only after any change echoes back is negligible.
  - User asked for a "smoother" visual style for both themes via the
    `ui-ux-pro-max` skill — see Theme Design below for the concrete result.

## i18n

### Approach

- New `translations` object literal in `app.js` (or a new `i18n.js` module —
  see File Structure) shaped `{ uk: {...}, en: {...}, ru: {...} }`. Every
  leaf value is a plain string; no nested interpolation needed anywhere in
  this app's copy (no "Hello {name}"-style strings exist).
- `t(key)` reads the current language from `profileData.language` (already
  synced from Firestore) and returns `translations[lang][key]`, falling back
  to `translations.en[key]` if the key is missing for that language (should
  never happen once all keys are filled in, but keeps a bad deploy from
  showing `undefined`).
- Static markup in `index.html` gets `data-i18n="key"` attributes on text
  content, and `data-i18n-placeholder="key"` on inputs that only have a
  placeholder. A new `applyTranslations()` function walks
  `document.querySelectorAll('[data-i18n]')` / `[data-i18n-placeholder]` and
  sets `textContent`/`placeholder` from `t(key)`.
- Dynamically-generated markup (template literals in `app.js` — entry rows,
  folder tabs, report cards, calendar, manage-stores rows, the store
  `<select>`'s blank/"+ свій" options) calls `t(key)` directly inline instead
  of using a hardcoded Ukrainian string literal.
- **Month names**: `MONTH_NAMES_UK` and `MONTH_NAMES_UK_GENITIVE` become
  `MONTH_NAMES[lang]` and `MONTH_NAMES_GENITIVE[lang]` — arrays of 12 per
  language, keyed the same way `t()` is.
- **Fixed folder display names**: a small `FIXED_FOLDER_LABELS` map,
  `{ 'Продукти': { uk: 'Продукти', en: 'Products', ru: 'Продукты' }, ... }`,
  keyed by the literal Ukrainian string already used as the stored
  `FIXED_FOLDERS` values and as `entry.folder`. A helper
  `folderLabel(folderName)` returns the translated label for the 3 fixed
  folders and the literal `folderName` unchanged for anything else (custom
  folders). Every place that currently renders a folder name as a UI label
  (folder tabs, report folder-total cards, report folder-breakdown headers,
  the period-report table's folder column, the manage-stores screen title)
  calls `folderLabel(...)` instead of rendering the raw string. Every place
  that uses a folder name as a **data key** (Firestore paths are by uid not
  folder, but `storesForFolder(folder)`, `computeFolderEntries(list, folder)`,
  `selectedFolder`, `entry.folder`) keeps using the raw untranslated string
  — the data model is unchanged.
- **Language switch triggers a live re-render**: `applyTranslations()` plus
  re-running `renderFolderTabs()`, `refreshAllStoreSelects()`, `render()`,
  and — if the reports screen is currently open — `renderReports()` (same
  visibility-guard pattern already used for Firestore snapshot callbacks).
  No page reload.

### Translation content

Every UI-facing string that isn't user data needs all three languages:
header title, login screen copy, sign-in/sign-out buttons, folder-tab "+"
prompt text, date field ("Сьогодні", full-date format words), add-row
labels/placeholders ("Магазин", "Сума", "0.00"), add/save button labels,
"Керувати магазинами" (now sidebar-only), list header + sort toggle,
empty-state message, manage-stores screen title/empty message, calendar
weekday abbreviations + month label + close button, report mode switch
labels (Місяць/Рік/Період), report nav, period picker labels, print button,
report grand-total label, "Немає даних", period-table column headers, the 3
fixed folder names (see above), and the new sidebar strings (see Sidebar
below). This is a large but mechanical content task — the plan enumerates
the exact key list so the implementer isn't guessing at coverage.

## Theme

### Approach

- A `data-theme="light"` / `data-theme="dark"` attribute on `<html>`,
  driven by `profileData.theme` (falls back to `'light'` per the Firestore
  default — **no `prefers-color-scheme` auto-detection anymore**: this
  replaces the current `@media (prefers-color-scheme: dark)` block, since
  the app now always has an explicit, account-synced theme value rather
  than an implicit system one).
- `styles.css`'s existing `@media (prefers-color-scheme: dark) { :root {...} }`
  block is replaced by `:root[data-theme="dark"] { ... }` with the same
  token set (refined values below).
- Switching in the sidebar calls `saveProfileFields({ theme: 'dark' })`
  (fire-and-forget, same pattern as every other profile write); the
  attribute itself is set immediately/optimistically on click (not waiting
  for the Firestore round-trip) for instant visual feedback, then
  reconciled by the next profile snapshot exactly like the other
  optimistic-update fixes from sub-project 1's final review.

### Theme design (via `ui-ux-pro-max`, revised per user feedback)

User asked explicitly for a softer, more pastel palette with a gradient
page background and "more interesting" text/block styling — a step beyond
the initial flat-color refinement. This revision keeps the same
architecture (CSS custom properties swapped via `:root[data-theme="dark"]`)
but replaces the token values and adds two new treatments: a fixed
gradient page background, and gradient-text on the app's key numbers.
Button/CTA accent values are kept close to their current saturation
deliberately — pastel is applied to backgrounds, borders, and secondary
surfaces, not to anything carrying white button text, so no WCAG contrast
regression versus the already-shipped buttons.

**Light** (`:root`):
```css
--bg: #f5f3ff;
--bg-gradient: linear-gradient(160deg, #f5f3ff 0%, #eef2ff 45%, #ecfeff 100%);
--surface: #ffffff;
--surface-tint: color-mix(in srgb, #ffffff 92%, #c4b5fd 8%);
--text: #1e1b4b;
--text-muted: #6b6b8a;
--accent: #6d5ef0;
--accent-2: #a78bfa;
--gradient-accent: linear-gradient(135deg, var(--accent), var(--accent-2));
--accent-pastel: #e0e7ff;
--danger: #f43f5e;
--border: #e5e0fa;
--radius-lg: 1.1rem;
--shadow-sm: 0 1px 2px rgba(76, 61, 158, 0.06);
--shadow-md: 0 4px 14px rgba(76, 61, 158, 0.10);
--shadow-lg: 0 16px 36px rgba(76, 61, 158, 0.16);
```

**Dark** (`:root[data-theme="dark"]`):
```css
--bg: #1a1730;
--bg-gradient: linear-gradient(160deg, #1e1b3a 0%, #171334 45%, #0f1729 100%);
--surface: #241f45;
--surface-tint: color-mix(in srgb, #241f45 88%, #818cf8 12%);
--text: #edebff;
--text-muted: #a9a6d6;
--accent: #8b7ef8;
--accent-2: #d9a8fb;
--gradient-accent: linear-gradient(135deg, var(--accent), var(--accent-2));
--accent-pastel: #332e63;
--danger: #fb7185;
--border: rgba(196, 181, 253, 0.14);
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.35);
--shadow-md: 0 4px 18px rgba(0, 0, 0, 0.45);
--shadow-lg: 0 18px 42px rgba(0, 0, 0, 0.55);
```

Both `--accent`/`--accent-2` were nudged only slightly off the current
brand blue/violet (not replaced) so `--gradient-accent` (used on
`#save-all-btn`, `#print-btn`, `#google-signin-btn`, `.selected` pills)
still carries white text at a verified ≥4.5:1 contrast ratio in both
themes — the pastel shift lives in `--border`, `--accent-pastel`, and the
new `--bg-gradient`/`--surface-tint`, which never sit under white text.

- **`--bg-gradient` replaces the flat `background: var(--bg)` on `body`.**
  This is the main visible change: the whole page sits on a soft
  multi-stop wash instead of a single flat color. `--bg` is kept as a
  fallback token (used where a flat color is still needed, e.g.
  `@media print`) and as the gradient's own base stop.
- **`--surface-tint`** is a new token for "interesting blocks": a barely-
  tinted variant of `--surface`, mixed 8-12% toward the accent, for
  elements that should read as *slightly* elevated/different from a plain
  white/dark card without a full gradient — e.g. `.folder-total-card`,
  `.manage-store-row`. `--surface` itself stays closer to neutral for
  elements with denser text (`.entry-row`, `.folder-report-card`'s
  breakdown lines) so body text contrast isn't affected.
- **Gradient text** on the app's headline numbers, via
  `background: var(--gradient-accent); background-clip: text; -webkit-background-clip: text; color: transparent;`
  applied to: `#monthly-total`, `.report-grand-total span`,
  `.folder-total-amount`, and the `<h1>` in `.login-card`. This is
  decorative only — it never touches body copy, labels, or anything that
  needs to stay screen-reader-plain-readable as color (the underlying text
  content is unchanged, `background-clip: text` doesn't affect the
  accessibility tree).
- Apply `--shadow-md` to `.folder-report-card`, `.folder-total-card`,
  `.entry-row`, `.manage-store-row`, `#login-screen .login-card` (replacing
  whatever shadow they have today, if any) for a consistent elevation
  scale instead of ad-hoc per-component values. Apply `--shadow-lg` to the
  sidebar panel and the calendar sheet (both overlay surfaces). Because the
  new shadow tokens are tinted with the accent hue (`rgba(76, 61, 158, ...)`
  in light, pure black in dark) instead of plain gray/black, cards read as
  "glowing" slightly rather than flatly dropping a gray shadow — reinforces
  the pastel/soft feel without needing per-component color choices.
- Bump `.folder-report-card`/`.folder-total-card`/`.entry-row`/
  `.manage-store-row`/`.login-card`'s `border-radius` to `var(--radius-lg)`
  (now `1.1rem`, up from the mix of `0.75rem`/`1rem` used today) for a
  softer, friendlier block shape consistent with the pastel treatment.
- **Smooth toggle transition**: add
  `transition: background-color 300ms ease, background-image 300ms ease, color 300ms ease, border-color 300ms ease, box-shadow 300ms ease;`
  to `body`, `.entry-row`, `.folder-report-card`, `.folder-total-card`,
  `.manage-store-row`, `#login-screen`, `.login-card`, `#sidebar` — the set
  of elements whose background/text/border actually differ between themes
  (`background-image` is included so `--bg-gradient` itself crossfades,
  not just solid-color tokens). Guard inside the existing
  `@media (prefers-reduced-motion: no-preference)` block already used for
  the entrance/press animations, so users who've asked for reduced motion
  get an instant switch instead.
- Existing dark-mode press/entrance animations and the `.link-btn`,
  `#print-btn`, etc. structural styling are untouched — only token values,
  the gradient background, the gradient-text treatment, and the trigger
  mechanism change.

## Sidebar

### Structure

- New `<aside id="sidebar" hidden>` in `index.html`, sibling to
  `#login-screen`/`main`, containing (in order): a close button, "Мова"
  section with 3 buttons (uk/en/ru, `.selected` class on the active one —
  same visual pattern as `.report-mode-btn`), "Тема" section with 2 buttons
  (light/dark, same pattern), a divider, "Керувати магазинами" button.
- New `<div id="sidebar-backdrop" hidden>` behind it — click-outside-to-close,
  same open/close animation pattern already used for
  `#calendar-backdrop`/`#calendar-sheet` (`hidden` toggle + `requestAnimationFrame`
  class toggle + `transform: translateX(...)` transition, translate instead
  of the calendar's translateY since this slides from the left edge, not up
  from the bottom).
- New hamburger `<button id="sidebar-open-btn">` added to `.app-header`,
  before the `<h1>` (header becomes: hamburger, title, sign-out — currently
  just title + sign-out).
- Opening/closing wires through the same `openX()`/`closeX()` naming
  convention already used for the calendar (`openSidebar()`/`closeSidebar()`).
- Selecting a language or theme button updates the `.selected` class
  immediately (optimistic, mirrors the theme attribute's optimistic update)
  and calls `saveProfileFields({ language: 'ru' })` /
  `saveProfileFields({ theme: 'dark' })` — it does **not** close the sidebar
  (a user may want to try both themes back-to-back); "Керувати магазинами"
  click closes the sidebar and opens the manage-stores screen, reusing the
  existing `openManageStores()`.

### Removed from the main add-screen

- The `<button id="manage-stores-btn">` link currently under the add-rows
  section is deleted from `index.html`; its click listener in `app.js`
  moves to the new sidebar button. No functional change to
  `openManageStores()`/`closeManageStores()` themselves.

## Add-store buttons

- **Manage-stores screen**: a new button above or below the store list
  (`#manage-stores-list`), e.g. `+ Додати магазин` /
  translated per `t()`. Click → same `prompt()`-based flow already used by
  the store dropdown's "+ свій" option (name prompt → trim → validate
  non-empty → `addStoreToFolder(selectedFolder, name)` → the existing
  optimistic-update fix from sub-project 1 already makes this reflect
  immediately in `renderManageStores()`).
- **Add-entry block**: a new small button next to each row's store
  `<select class="row-store">` (inside `createRow()`'s template). Click →
  identical flow, `addStoreToFolder(selectedFolder, name)`, then set that
  row's select to the new value (mirrors the existing "+ свій" handler's
  tail: `refreshAllStoreSelects(); e.target... .value = trimmed;`, adapted
  since the trigger is now a sibling button, not the select's own `change`
  event — the button needs to target its own row's `.row-store`, e.g. via
  `closest('.add-row').querySelector('.row-store')`).
- The existing "+ свій" option inside the dropdown is **kept as-is**
  (per the brainstorming decision) — this is an additional, more discoverable
  entry point to the same flow, not a replacement.

## File structure

- `app.js` grows with: `t()`, `applyTranslations()`, `folderLabel()`,
  sidebar open/close + wiring, the two new add-store button handlers. Given
  the size of the translation dictionary (60+ keys × 3 languages), it lives
  in a **new `i18n.js`** file (plain `const translations = {...}; export
  { translations }` style if `app.js` stays a module — it already is, from
  sub-project 1), imported by `app.js`, rather than inline — keeps `app.js`'s
  existing responsibilities (auth, data, rendering) from being buried under
  a wall of translation strings. `MONTH_NAMES`/`MONTH_NAMES_GENITIVE`/
  `FIXED_FOLDER_LABELS` live in `i18n.js` alongside `translations` since
  they're the same kind of content.
- `index.html` gains the sidebar markup, hamburger button, `data-i18n`
  attributes throughout, and loses the `manage-stores-btn` link.
- `styles.css` gains sidebar/backdrop styles, the dark-mode selector
  swap, shadow tokens, and the theme-transition rule; loses the
  `@media (prefers-color-scheme: dark)` block.
- `sw.js` gains `i18n.js` to its precache `ASSETS` list; cache version and
  `app.js`/`styles.css` query strings bump per the existing repo convention.

## Testing

No automated test suite exists in this project (consistent with
sub-project 1). Manual verification through the connected Chrome extension
on the live GitHub Pages URL, signed in:
- Hamburger opens the sidebar; backdrop click and close button both close it.
- Switching language updates every visible string immediately (header,
  buttons, folder tab labels for the 3 fixed folders, month name, reports
  screen) without a reload; a custom folder/store name is unaffected by the
  switch. Reloading the page keeps the chosen language (Firestore-synced).
- Switching theme updates colors immediately with a smooth transition (not
  a snap), respects `prefers-reduced-motion`, and persists across reload.
- "Керувати магазинами" is gone from the add-screen and present in the
  sidebar; clicking it opens the manage-stores screen.
- The manage-stores screen's new "Додати магазин" button and the add-entry
  block's new button both add a store that shows up immediately (same
  optimistic-update guarantee proven in sub-project 1's final review fix).
