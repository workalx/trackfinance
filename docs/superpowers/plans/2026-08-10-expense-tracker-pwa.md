# Expense Tracker PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first, installable PWA for logging daily expenses (day/store/amount) with a live monthly total, edit/delete, and offline localStorage persistence.

**Architecture:** Plain HTML/CSS/JS, no framework, no build step, no backend. `app.js` owns state (an array of entries in `localStorage`) and renders the DOM directly. A `manifest.json` + `sw.js` make it installable on Android/Chrome (Samsung target device).

**Tech Stack:** HTML5, CSS3 (`prefers-color-scheme` for theming), vanilla JS (ES modules not needed — single script), Web App Manifest, Service Worker (Cache API).

## Global Constraints

- UI copy in Ukrainian; store names in English (Walmart, Dollarama, Freshco, Costco) — from spec.
- Currency is CAD, formatted as `$X.XX` — from spec.
- Entries can only be added for the **current** month/year; day is the only date input — from spec.
- Data persists only in `localStorage`, no backend/sync — from spec.
- Mobile-first layout, large touch targets (one-handed, in-store use) — from spec.
- Auto light/dark theme via `prefers-color-scheme`, no manual toggle — from spec.
- No build tooling: every file must run by opening `index.html` directly or via a static file server, no bundler/npm required.

There is no automated test framework in this project (static HTML/CSS/JS, no backend). "Tests" in this plan are manual verification steps performed in a browser at mobile viewport width, per the spec's Testing Plan section. Each task ends with a concrete manual check instead of a unit test run.

---

## File Structure

- `index.html` — page shell: header (title + monthly total), add-entry form, entries list container. Loads `styles.css`, `app.js`, registers `sw.js`, links `manifest.json`.
- `styles.css` — layout, typography, light/dark theme custom properties, touch-target sizing.
- `app.js` — single script: state (load/save `localStorage`), render functions, event handlers for add/edit/delete, monthly total calculation.
- `manifest.json` — PWA manifest (name, icons, `display: standalone`, theme colors).
- `sw.js` — service worker: caches the app shell (`index.html`, `styles.css`, `app.js`, icons) for offline load.
- `icons/icon-192.png`, `icons/icon-512.png` — app icons for install/home-screen.

---

### Task 1: Page shell, base styles, and theming

**Files:**
- Create: `index.html`
- Create: `styles.css`

**Interfaces:**
- Produces: DOM structure with fixed IDs that Task 2+ will hook into:
  - `#monthly-total` (span, shows the total)
  - `#entry-form` (form element)
  - `#day-input` (number input)
  - `#store-chips` (container for store chip buttons)
  - `#custom-store-btn` (the "+" chip)
  - `#amount-input` (number input)
  - `#add-btn` (submit button)
  - `#entries-list` (container for rendered entry rows)
  - `#empty-state` (element shown when there are no entries)

- [ ] **Step 1: Write `index.html`**

```html
<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Мої витрати</title>
  <link rel="manifest" href="manifest.json">
  <meta name="theme-color" content="#0f172a">
  <link rel="apple-touch-icon" href="icons/icon-192.png">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header class="app-header">
    <h1>Мої витрати</h1>
    <p class="monthly-total-label">Всього за <span id="month-name"></span>: <span id="monthly-total">$0.00</span></p>
  </header>

  <main>
    <form id="entry-form" novalidate>
      <div class="field">
        <label for="day-input">День</label>
        <input type="number" id="day-input" min="1" max="31" inputmode="numeric" required>
      </div>

      <div class="field">
        <label id="store-label">Магазин</label>
        <div id="store-chips" role="group" aria-labelledby="store-label">
          <button type="button" class="chip" data-store="Walmart">Walmart</button>
          <button type="button" class="chip" data-store="Dollarama">Dollarama</button>
          <button type="button" class="chip" data-store="Freshco">Freshco</button>
          <button type="button" class="chip" data-store="Costco">Costco</button>
          <button type="button" class="chip chip-add" id="custom-store-btn">+ Додати</button>
        </div>
      </div>

      <div class="field">
        <label for="amount-input">Сума ($)</label>
        <input type="number" id="amount-input" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" required>
      </div>

      <button type="submit" id="add-btn" disabled>Додати</button>
    </form>

    <section id="entries-list" aria-live="polite"></section>
    <p id="empty-state" hidden>Поки немає витрат у цьому місяці.</p>
  </main>

  <script src="app.js"></script>
  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
    }
  </script>
</body>
</html>
```

- [ ] **Step 2: Write `styles.css`**

```css
:root {
  --bg: #f8fafc;
  --surface: #ffffff;
  --text: #0f172a;
  --text-muted: #64748b;
  --accent: #2563eb;
  --danger: #dc2626;
  --border: #e2e8f0;
  color-scheme: light dark;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f172a;
    --surface: #1e293b;
    --text: #f1f5f9;
    --text-muted: #94a3b8;
    --accent: #60a5fa;
    --danger: #f87171;
    --border: #334155;
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  padding-bottom: 2rem;
}

.app-header {
  padding: 1.25rem 1rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.app-header h1 { margin: 0 0 0.25rem; font-size: 1.25rem; }
.monthly-total-label { margin: 0; color: var(--text-muted); font-size: 1rem; }
#monthly-total { color: var(--accent); font-weight: 700; font-size: 1.1rem; }

main { max-width: 480px; margin: 0 auto; padding: 1rem; }

.field { margin-bottom: 1rem; }
.field label { display: block; margin-bottom: 0.4rem; font-weight: 600; }

input[type="number"] {
  width: 100%;
  min-height: 3rem;
  font-size: 1.1rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--surface);
  color: var(--text);
}

#store-chips { display: flex; flex-wrap: wrap; gap: 0.5rem; }

.chip {
  min-height: 3rem;
  padding: 0.5rem 1rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 1rem;
  cursor: pointer;
}

.chip.selected { background: var(--accent); color: #fff; border-color: var(--accent); }
.chip-add { border-style: dashed; }

#add-btn {
  width: 100%;
  min-height: 3.25rem;
  font-size: 1.1rem;
  font-weight: 700;
  color: #fff;
  background: var(--accent);
  border: none;
  border-radius: 0.75rem;
  cursor: pointer;
}

#add-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.entry-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  margin-bottom: 0.6rem;
}

.entry-main { display: flex; flex-direction: column; }
.entry-store { font-weight: 600; }
.entry-day { color: var(--text-muted); font-size: 0.9rem; }
.entry-amount { font-weight: 700; font-size: 1.05rem; }

.entry-actions { display: flex; gap: 0.4rem; }

.entry-actions button {
  min-width: 2.75rem;
  min-height: 2.75rem;
  border-radius: 0.6rem;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  font-size: 1rem;
  cursor: pointer;
}

.entry-actions .delete-btn { color: var(--danger); border-color: var(--danger); }

#empty-state { color: var(--text-muted); text-align: center; margin-top: 2rem; }
```

- [ ] **Step 3: Manual check**

Open `index.html` directly in a Chrome desktop window, then resize/use device toolbar to a phone width (e.g. 390px). Confirm: header shows "Всього за ... : $0.00", form renders with 4 store chips + "+ Додати", amount field, and a disabled "Додати" button. No console errors.

- [ ] **Step 4: Commit**

```bash
git add index.html styles.css
git commit -m "feat: add page shell and mobile-first styling with light/dark theming"
```

---

### Task 2: State module — load/save entries and custom stores in localStorage

**Files:**
- Create: `app.js` (state section only; rendering/handlers added in later tasks)

**Interfaces:**
- Consumes: nothing (first JS logic)
- Produces (used by Tasks 3–5):
  - `loadEntries(): Array<{id: string, day: number, month: number, year: number, store: string, amount: number}>`
  - `saveEntries(entries: Array): void`
  - `loadCustomStores(): string[]`
  - `saveCustomStores(stores: string[]): void`
  - `makeId(): string`
  - `getCurrentMonthYear(): {month: number, year: number}` (1-indexed month)

- [ ] **Step 1: Write the state functions at the top of `app.js`**

```js
const ENTRIES_KEY = 'expenseTracker.entries';
const CUSTOM_STORES_KEY = 'expenseTracker.customStores';

function loadEntries() {
  try {
    const raw = localStorage.getItem(ENTRIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveEntries(entries) {
  try {
    localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
  } catch {
    // localStorage unavailable (e.g. private mode) - continue without persistence
  }
}

function loadCustomStores() {
  try {
    const raw = localStorage.getItem(CUSTOM_STORES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomStores(stores) {
  try {
    localStorage.setItem(CUSTOM_STORES_KEY, JSON.stringify(stores));
  } catch {
    // localStorage unavailable - continue without persistence
  }
}

function makeId() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function getCurrentMonthYear() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}
```

- [ ] **Step 2: Manual check**

Open `index.html`, open DevTools console, and run:
```js
saveEntries([{ id: '1', day: 5, month: 8, year: 2026, store: 'Walmart', amount: 12.5 }]);
loadEntries();
```
Expected: returns the array with the one entry. Then run `localStorage.clear()` to reset for later tasks.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: add localStorage-backed state functions for entries and custom stores"
```

---

### Task 3: Add-entry form — store chip selection, custom store, validation, submit

**Files:**
- Modify: `app.js` (append below Task 2's state section)
- Modify: `index.html` (only if a bug is found in Task 1 markup — none expected)

**Interfaces:**
- Consumes: `loadEntries`, `saveEntries`, `loadCustomStores`, `saveCustomStores`, `makeId`, `getCurrentMonthYear` from Task 2
- Produces (used by Task 4/5): a live `entries` array variable in module scope, plus a `render()` function later tasks can call after mutating `entries`. This task provides a **stub** `render()` that Task 4 will replace — defined here as `function render() {}` so the form wiring has something to call without erroring.

- [ ] **Step 1: Append form logic to `app.js`**

```js
const entries = loadEntries();
let selectedStore = null;

function render() {
  // Implemented in Task 4 (rendering entries list + monthly total).
}

function daysInMonth(month, year) {
  return new Date(year, month, 0).getDate();
}

function renderStoreChips() {
  const container = document.getElementById('store-chips');
  const customStores = loadCustomStores();
  customStores.forEach((name) => {
    if (container.querySelector(`[data-store="${CSS.escape(name)}"]`)) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.dataset.store = name;
    btn.textContent = name;
    container.insertBefore(btn, document.getElementById('custom-store-btn'));
  });
}

function selectStore(store) {
  selectedStore = store;
  document.querySelectorAll('#store-chips .chip[data-store]').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.store === store);
  });
  updateAddButtonState();
}

function updateAddButtonState() {
  const day = document.getElementById('day-input').value;
  const amount = document.getElementById('amount-input').value;
  const valid = day && Number(day) >= 1 && selectedStore && amount && Number(amount) > 0;
  document.getElementById('add-btn').disabled = !valid;
}

function setupForm() {
  const { month, year } = getCurrentMonthYear();
  const dayInput = document.getElementById('day-input');
  dayInput.max = String(daysInMonth(month, year));

  renderStoreChips();

  document.getElementById('store-chips').addEventListener('click', (e) => {
    const btn = e.target.closest('.chip[data-store]');
    if (!btn) return;
    selectStore(btn.dataset.store);
  });

  document.getElementById('custom-store-btn').addEventListener('click', () => {
    const name = prompt('Назва магазину:');
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    const customStores = loadCustomStores();
    if (!customStores.includes(trimmed)) {
      customStores.push(trimmed);
      saveCustomStores(customStores);
      renderStoreChips();
    }
    selectStore(trimmed);
  });

  dayInput.addEventListener('input', updateAddButtonState);
  document.getElementById('amount-input').addEventListener('input', updateAddButtonState);

  document.getElementById('entry-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const { month, year } = getCurrentMonthYear();
    const day = Number(dayInput.value);
    const amount = Number(document.getElementById('amount-input').value);
    if (!day || day < 1 || day > daysInMonth(month, year) || !selectedStore || !amount || amount <= 0) return;

    entries.push({ id: makeId(), day, month, year, store: selectedStore, amount });
    saveEntries(entries);

    e.target.reset();
    selectedStore = null;
    document.querySelectorAll('#store-chips .chip.selected').forEach((btn) => btn.classList.remove('selected'));
    updateAddButtonState();
    render();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupForm();
  render();
});
```

- [ ] **Step 2: Manual check**

Reload `index.html` at phone width. Confirm: selecting a store chip highlights it; typing day=5, amount=12.50, and selecting Walmart enables "Додати"; clicking "+ Додати" prompts for a name, and after entering one (e.g. "Metro") it appears as a new chip and gets selected. Submit the form — confirm no console errors, and in DevTools run `loadEntries()` to see the new entry saved. Try day `99` — confirm it's clamped/rejected by the `max` attribute and the submit handler's guard.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: wire up add-entry form with store chips, custom stores, and validation"
```

---

### Task 4: Render entries list and monthly total

**Files:**
- Modify: `app.js` (replace the stub `render()` from Task 3)

**Interfaces:**
- Consumes: `entries` array, `getCurrentMonthYear()`, DOM ids `#entries-list`, `#empty-state`, `#monthly-total`, `#month-name` from Task 1/2
- Produces (used by Task 5): entry rows rendered with `data-id` attributes and `.edit-btn` / `.delete-btn` buttons inside `.entry-actions`, which Task 5 attaches click handlers to via event delegation on `#entries-list`.

- [ ] **Step 1: Replace the stub `render()` with the real implementation**

```js
const MONTH_NAMES_UK = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];

function formatAmount(n) {
  return `$${n.toFixed(2)}`;
}

function render() {
  const { month, year } = getCurrentMonthYear();
  document.getElementById('month-name').textContent = MONTH_NAMES_UK[month - 1];

  const monthEntries = entries
    .filter((e) => e.month === month && e.year === year)
    .sort((a, b) => b.day - a.day);

  const total = monthEntries.reduce((sum, e) => sum + e.amount, 0);
  document.getElementById('monthly-total').textContent = formatAmount(total);

  const list = document.getElementById('entries-list');
  const emptyState = document.getElementById('empty-state');
  list.innerHTML = '';

  if (monthEntries.length === 0) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  monthEntries.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'entry-row';
    row.dataset.id = entry.id;
    row.innerHTML = `
      <div class="entry-main">
        <span class="entry-store">${escapeHtml(entry.store)}</span>
        <span class="entry-day">${entry.day} ${MONTH_NAMES_UK[entry.month - 1]}</span>
      </div>
      <span class="entry-amount">${formatAmount(entry.amount)}</span>
      <div class="entry-actions">
        <button type="button" class="edit-btn" aria-label="Редагувати">✎</button>
        <button type="button" class="delete-btn" aria-label="Видалити">🗑</button>
      </div>
    `;
    list.appendChild(row);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
```

- [ ] **Step 2: Manual check**

Reload the page. Add two entries (different stores/amounts). Confirm both appear newest-day-first, each showing store name, day + month name, and formatted amount, and the header total equals their sum. Confirm the empty-state message is hidden once entries exist. Clear `localStorage` and reload — confirm the empty-state message reappears and total shows `$0.00`.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: render entries list and live monthly total"
```

---

### Task 5: Edit and delete entries

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `entries`, `render()`, `saveEntries()`, row markup with `data-id`/`.edit-btn`/`.delete-btn` from Task 4
- Produces: nothing further consumed by later tasks (final app logic)

- [ ] **Step 1: Add delegated click handling for edit/delete, appended to `app.js`**

```js
function deleteEntry(id) {
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return;
  entries.splice(idx, 1);
  saveEntries(entries);
  render();
}

function editEntry(id) {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;

  const { month, year } = getCurrentMonthYear();
  const maxDay = daysInMonth(month, year);

  const newDayRaw = prompt(`День (1-${maxDay}):`, String(entry.day));
  if (newDayRaw === null) return;
  const newDay = Number(newDayRaw);
  if (!newDay || newDay < 1 || newDay > maxDay) {
    alert('Некоректний день.');
    return;
  }

  const newStore = prompt('Магазин:', entry.store);
  if (newStore === null) return;
  if (!newStore.trim()) {
    alert('Назва магазину не може бути порожньою.');
    return;
  }

  const newAmountRaw = prompt('Сума ($):', String(entry.amount));
  if (newAmountRaw === null) return;
  const newAmount = Number(newAmountRaw);
  if (!newAmount || newAmount <= 0) {
    alert('Некоректна сума.');
    return;
  }

  entry.day = newDay;
  entry.store = newStore.trim();
  entry.amount = newAmount;

  if (!['Walmart', 'Dollarama', 'Freshco', 'Costco'].includes(entry.store)) {
    const customStores = loadCustomStores();
    if (!customStores.includes(entry.store)) {
      customStores.push(entry.store);
      saveCustomStores(customStores);
      renderStoreChips();
    }
  }

  saveEntries(entries);
  render();
}

document.getElementById('entries-list').addEventListener('click', (e) => {
  const row = e.target.closest('.entry-row');
  if (!row) return;
  const id = row.dataset.id;

  if (e.target.closest('.delete-btn')) {
    if (confirm('Видалити цей запис?')) deleteEntry(id);
  } else if (e.target.closest('.edit-btn')) {
    editEntry(id);
  }
});
```

- [ ] **Step 2: Manual check**

Add an entry, click ✎, change the amount, confirm the list and total update. Click 🗑, confirm the browser confirm dialog appears, accept it, and confirm the row disappears and the total drops accordingly. Reload the page and confirm the edit/delete persisted (localStorage).

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: add edit and delete for expense entries"
```

---

### Task 6: PWA installability — manifest, service worker, icons

**Files:**
- Create: `manifest.json`
- Create: `sw.js`
- Create: `icons/icon-192.png`
- Create: `icons/icon-512.png`

**Interfaces:**
- Consumes: nothing from prior tasks (manifest/SW are static/independent)
- Produces: nothing consumed by other tasks — this is the final integration piece for "install on Samsung phone".

- [ ] **Step 1: Write `manifest.json`**

```json
{
  "name": "Мої витрати",
  "short_name": "Витрати",
  "description": "Швидкий облік щоденних витрат по магазинах",
  "start_url": "./index.html",
  "scope": "./",
  "display": "standalone",
  "background_color": "#f8fafc",
  "theme_color": "#0f172a",
  "orientation": "portrait",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 2: Generate the two icon PNGs**

Use a small Node/Python script (whichever is available) to produce two solid-background PNGs with a "$" glyph, since no external asset source is available. Example using Python + Pillow (`pip install pillow` if missing):

```python
from PIL import Image, ImageDraw, ImageFont

for size in (192, 512):
    img = Image.new('RGB', (size, size), '#2563eb')
    draw = ImageDraw.Draw(img)
    text = '$'
    font = ImageFont.truetype('arial.ttf', int(size * 0.55))
    bbox = draw.textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((size - w) / 2 - bbox[0], (size - h) / 2 - bbox[1]), text, fill='white', font=font)
    img.save(f'icons/icon-{size}.png')
```

Run it from the project root after `mkdir icons` (create the directory first). If Pillow/`arial.ttf` isn't available, use any available system font path, or fall back to a plain solid-color square (`ImageDraw` call omitted) — the icon only needs to be a valid PNG of the correct size for install to work.

- [ ] **Step 3: Write `sw.js`**

```js
const CACHE_NAME = 'expense-tracker-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
```

- [ ] **Step 4: Manual check**

Serve the folder over HTTP (service workers require `http(s)://`, not `file://`) — e.g. `npx serve .` or `python -m http.server 8080` from the project root. Open the served URL in Chrome, open DevTools → Application → Manifest, confirm it loads with no errors and both icons resolve. Check Application → Service Workers, confirm `sw.js` is registered/activated. In Chrome's mobile device toolbar or on an actual Samsung phone visiting the same LAN URL, confirm the "Install app" / "Add to Home Screen" option appears, and that after install the app opens without browser chrome (standalone window).

- [ ] **Step 5: Commit**

```bash
git add manifest.json sw.js icons/icon-192.png icons/icon-512.png
git commit -m "feat: add PWA manifest, service worker, and icons for installability"
```

---

### Task 7: Full manual regression pass

**Files:** none (verification only, following the spec's Testing Plan section)

- [ ] **Step 1: Fresh-state walkthrough**

Clear `localStorage` (DevTools → Application → Local Storage → clear), reload at a 390px-wide viewport, and confirm the empty state shows "Поки немає витрат у цьому місяці." and total is `$0.00`.

- [ ] **Step 2: Add one entry per store**

Add an entry for Walmart, Dollarama, Freshco, Costco, and one custom store (e.g. "Metro"). Confirm all 5 appear in the list, newest-day-first, and the header total equals the sum of all 5 amounts.

- [ ] **Step 3: Edit and delete**

Edit one entry's amount and confirm the total updates by the correct delta. Delete one entry and confirm it's removed and the total drops by its amount.

- [ ] **Step 4: Persistence across reload**

Reload the page (not clearing storage) and confirm all remaining entries and the total are unchanged.

- [ ] **Step 5: Invalid input handling**

Try entering day `0`, a day beyond the current month's max, and amount `0` or a negative number — confirm the "Додати" button stays disabled or the submit is rejected in each case, with no entry added and no console error.

- [ ] **Step 6: Install flow**

Repeat the Task 6 Step 4 install check end-to-end on an actual Samsung device if available: open the served URL in Chrome, install to home screen, launch from the home screen icon, confirm it opens standalone and offline (toggle airplane mode after first load, reopen the app, confirm the shell still loads).

- [ ] **Step 7: Commit (only if fixes were needed)**

If any check above required a fix, stage the specific fixed files and commit:

```bash
git add <fixed files>
git commit -m "fix: <describe the regression fixed during manual QA pass>"
```
