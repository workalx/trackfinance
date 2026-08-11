# Reports Dashboard & Multi-Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a two-tab layout (Додати / Звіти) to the existing expense tracker PWA: a row-based multi-entry add form (replacing the single chip-based form), and a Reports screen with monthly history, store breakdown, average/max daily spend, and a canvas-based JPG export for printing.

**Architecture:** Same plain HTML/CSS/JS, no framework, no build step, no external libraries. The existing `entries` array/localStorage model is unchanged — Reports and JPG export just read and aggregate it for an arbitrary `{month, year}` instead of always "now".

**Tech Stack:** HTML5, CSS3, vanilla JS, Canvas 2D API (JPG export), existing Web App Manifest / Service Worker (untouched).

## Global Constraints

- Adding/editing/deleting entries stays restricted to the current month — Reports is read-only for all months, past or present — from spec.
- No external libraries or CDN dependencies (canvas-drawn JPG, not a DOM-screenshot library) — from spec.
- UI copy in Ukrainian; store names in English — from base spec, unchanged.
- Currency CAD, formatted `$X.XX` via the existing `formatAmount()` — unchanged.
- Multi-row save validation rule (this plan's refinement of the spec's "no partial save"): a row that is **entirely empty** (no day, no store, no amount) is silently skipped, not saved and not an error. A row that is **partially filled** (some but not all three fields valid) is invalid and blocks "Зберегти все" for the whole batch, with that row visually highlighted. At least one fully-valid row must exist for the save button to be enabled.
- At least one row must always remain visible in the add form — the last remaining row's remove ("×") button is a no-op.
- Report month navigation never goes past the current month (no future months), and "previous" only steps to months that actually contain entries.

There is no automated test framework in this project. Each task ends with a manual verification step in a mobile-width browser view, per the spec's Testing Plan section.

---

## File Structure

- `index.html` — rewritten: adds a bottom tab bar (`#tab-add` / `#tab-reports`), wraps existing content in `#add-screen`, replaces the old single-row chip form with an empty `#add-rows` container populated by JS, adds `#reports-screen` (month nav, totals, breakdown, avg/max, JPG button, read-only entries list).
- `styles.css` — rewritten: drops the now-unused chip/single-row-form rules, adds tab bar, multi-row grid, and report screen styles.
- `app.js` — modified: removes `renderStoreChips`/`selectStore`/`updateAddButtonState`/the old single-row `setupForm` submit logic; adds multi-row add-form logic, tab switching, Reports rendering (with shared aggregation helpers reused by JPG export), and canvas-based JPG export. `loadEntries`/`saveEntries`/`loadCustomStores`/`saveCustomStores`/`makeId`/`getCurrentMonthYear`/`daysInMonth`/`formatAmount`/`escapeHtml`/`MONTH_NAMES_UK`/`render()`/`deleteEntry`/`editEntry`/the `#entries-list` delegated click handler are all unchanged and stay.

---

### Task 1: Tab bar, Reports screen skeleton, and multi-row add form

**Files:**
- Modify: `index.html` (full rewrite)
- Modify: `styles.css` (full rewrite)
- Modify: `app.js:106-180` (replace `renderStoreChips` through the end of `setupForm`)

**Interfaces:**
- Consumes from existing `app.js`: `loadCustomStores`, `saveCustomStores`, `getCurrentMonthYear`, `daysInMonth`, `makeId`, `saveEntries`, `entries`, `render()`.
- Produces (used by Task 2/3):
  - DOM ids: `#tab-add`, `#tab-reports`, `#add-screen`, `#reports-screen`, `#report-prev`, `#report-month-label`, `#report-next`, `#report-total`, `#report-breakdown`, `#report-avg`, `#report-max`, `#report-entries-list`, `#report-empty-state`, `#download-jpg-btn` (all present in markup now; wired up in Task 2/3).
  - JS: `STORE_OPTION_SENTINEL` constant, `populateStoreOptions(selectEl)` function, `switchTab(tabName)` function — Task 2 calls `switchTab('reports')` when rendering Reports for the first time.

- [ ] **Step 1: Replace `index.html`**

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
  </header>

  <main>
    <section id="add-screen">
      <p class="monthly-total-label">Всього за <span id="month-name"></span>: <span id="monthly-total">$0.00</span></p>

      <div id="add-rows"></div>

      <div class="add-actions">
        <button type="button" id="add-row-btn">+ Додати рядок</button>
        <button type="button" id="save-all-btn" disabled>Зберегти все</button>
      </div>

      <section id="entries-list" aria-live="polite"></section>
      <p id="empty-state" hidden>Поки немає витрат у цьому місяці.</p>
    </section>

    <section id="reports-screen" hidden>
      <div class="report-nav">
        <button type="button" id="report-prev" aria-label="Попередній місяць">‹</button>
        <span id="report-month-label"></span>
        <button type="button" id="report-next" aria-label="Наступний місяць">›</button>
      </div>

      <p class="report-total">Всього: <span id="report-total">$0.00</span></p>

      <div class="report-block">
        <h2>По магазинах</h2>
        <div id="report-breakdown"></div>
      </div>

      <div class="report-block">
        <p id="report-avg"></p>
        <p id="report-max"></p>
      </div>

      <button type="button" id="download-jpg-btn">Скачати .jpg</button>

      <div class="report-block">
        <h2>Записи</h2>
        <section id="report-entries-list"></section>
        <p id="report-empty-state" hidden>Немає витрат за цей місяць.</p>
      </div>
    </section>
  </main>

  <nav class="tab-bar">
    <button type="button" id="tab-add" class="tab-btn selected">Додати</button>
    <button type="button" id="tab-reports" class="tab-btn">Звіти</button>
  </nav>

  <script src="app.js"></script>
  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
    }
  </script>
</body>
</html>
```

- [ ] **Step 2: Replace `styles.css`**

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
  padding-bottom: 4.5rem;
}

.app-header {
  padding: 1.25rem 1rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.app-header h1 { margin: 0; font-size: 1.25rem; }

main { max-width: 480px; margin: 0 auto; padding: 1rem; }

.monthly-total-label, .report-total { margin: 0 0 1rem; color: var(--text-muted); font-size: 1rem; }
#monthly-total, #report-total { color: var(--accent); font-weight: 700; font-size: 1.1rem; }

/* Multi-row add form */
#add-rows { margin-bottom: 0.75rem; }

.add-row {
  display: grid;
  grid-template-columns: 3.4rem 1fr 4.6rem 2.4rem;
  gap: 0.4rem;
  align-items: center;
  margin-bottom: 0.5rem;
}

.add-row input, .add-row select {
  width: 100%;
  min-height: 2.75rem;
  font-size: 0.95rem;
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 0.6rem;
  background: var(--surface);
  color: var(--text);
}

.add-row.invalid input, .add-row.invalid select { border-color: var(--danger); }

.row-remove {
  min-height: 2.75rem;
  border-radius: 0.6rem;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--danger);
  font-size: 1.2rem;
  cursor: pointer;
}

.add-actions { display: flex; gap: 0.5rem; margin-bottom: 1rem; }

.add-actions button {
  flex: 1;
  min-height: 3rem;
  font-size: 1rem;
  font-weight: 700;
  border-radius: 0.75rem;
  cursor: pointer;
  border: none;
}

#add-row-btn { background: var(--surface); color: var(--text); border: 1px solid var(--border); }
#save-all-btn { background: var(--accent); color: #fff; }
#save-all-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Entries list (shared by Add screen and Reports screen) */
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

#empty-state, #report-empty-state { color: var(--text-muted); text-align: center; margin-top: 2rem; }

/* Reports screen */
.report-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

#report-month-label { font-weight: 700; font-size: 1.1rem; }

.report-nav button {
  min-width: 2.75rem;
  min-height: 2.75rem;
  border-radius: 0.6rem;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 1.3rem;
  cursor: pointer;
}

.report-nav button:disabled { opacity: 0.4; cursor: not-allowed; }

.report-block { margin-bottom: 1.25rem; }
.report-block h2 { font-size: 1rem; margin: 0 0 0.5rem; }

.report-line {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--border);
}

#download-jpg-btn {
  width: 100%;
  min-height: 3rem;
  font-size: 1rem;
  font-weight: 700;
  color: var(--accent);
  background: var(--surface);
  border: 1px solid var(--accent);
  border-radius: 0.75rem;
  cursor: pointer;
  margin-bottom: 1.25rem;
}

/* Tab bar */
.tab-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  border-top: 1px solid var(--border);
  background: var(--surface);
}

.tab-btn {
  flex: 1;
  padding: 0.9rem;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
}

.tab-btn.selected { color: var(--accent); }
```

- [ ] **Step 3: Replace `renderStoreChips` through the end of `setupForm` in `app.js`**

Find and delete this whole block (current lines 106–180, from `function renderStoreChips()` through the closing `}` of `setupForm`):

```js
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
```

Replace it with:

```js
const FIXED_STORES = ['Walmart', 'Dollarama', 'Freshco', 'Costco'];
const STORE_OPTION_SENTINEL = '__add_custom__';

function populateStoreOptions(selectEl) {
  const previousValue = selectEl.value;
  selectEl.innerHTML = '';

  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = 'Магазин';
  selectEl.appendChild(blank);

  [...FIXED_STORES, ...loadCustomStores()].forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    selectEl.appendChild(opt);
  });

  const addOpt = document.createElement('option');
  addOpt.value = STORE_OPTION_SENTINEL;
  addOpt.textContent = '+ свій';
  selectEl.appendChild(addOpt);

  if ([...selectEl.options].some((o) => o.value === previousValue)) {
    selectEl.value = previousValue;
  }
}

function refreshAllStoreSelects() {
  document.querySelectorAll('.row-store').forEach(populateStoreOptions);
}

function createRow() {
  const row = document.createElement('div');
  row.className = 'add-row';
  row.innerHTML = `
    <input type="number" class="row-day" min="1" inputmode="numeric" placeholder="День" aria-label="День">
    <select class="row-store" aria-label="Магазин"></select>
    <input type="number" class="row-amount" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" aria-label="Сума">
    <button type="button" class="row-remove" aria-label="Видалити рядок">×</button>
  `;

  const { month, year } = getCurrentMonthYear();
  row.querySelector('.row-day').max = String(daysInMonth(month, year));
  populateStoreOptions(row.querySelector('.row-store'));

  row.querySelector('.row-store').addEventListener('change', (e) => {
    if (e.target.value !== STORE_OPTION_SENTINEL) {
      updateSaveAllButtonState();
      return;
    }
    const name = prompt('Назва магазину:');
    const trimmed = (name || '').trim();
    if (!trimmed) {
      e.target.value = '';
      updateSaveAllButtonState();
      return;
    }
    const customStores = loadCustomStores();
    if (!customStores.includes(trimmed)) {
      customStores.push(trimmed);
      saveCustomStores(customStores);
    }
    refreshAllStoreSelects();
    e.target.value = trimmed;
    updateSaveAllButtonState();
  });

  row.querySelector('.row-day').addEventListener('input', updateSaveAllButtonState);
  row.querySelector('.row-amount').addEventListener('input', updateSaveAllButtonState);

  row.querySelector('.row-remove').addEventListener('click', () => {
    if (document.querySelectorAll('.add-row').length <= 1) return;
    row.remove();
    updateSaveAllButtonState();
  });

  return row;
}

function rowState(row) {
  const dayRaw = row.querySelector('.row-day').value;
  const store = row.querySelector('.row-store').value;
  const amountRaw = row.querySelector('.row-amount').value;
  const empty = !dayRaw && !store && !amountRaw;

  const { month, year } = getCurrentMonthYear();
  const day = Number(dayRaw);
  const amount = Number(amountRaw);
  const valid = !!dayRaw && day >= 1 && day <= daysInMonth(month, year) &&
    !!store && store !== STORE_OPTION_SENTINEL &&
    !!amountRaw && amount > 0;

  return { empty, valid, day, store, amount };
}

function updateSaveAllButtonState() {
  const rows = [...document.querySelectorAll('.add-row')];
  const states = rows.map(rowState);

  rows.forEach((row, i) => {
    row.classList.toggle('invalid', !states[i].empty && !states[i].valid);
  });

  const anyValid = states.some((s) => s.valid);
  const anyPartiallyInvalid = states.some((s) => !s.empty && !s.valid);
  document.getElementById('save-all-btn').disabled = !anyValid || anyPartiallyInvalid;
}

function setupAddForm() {
  const rowsContainer = document.getElementById('add-rows');
  rowsContainer.appendChild(createRow());
  updateSaveAllButtonState();

  document.getElementById('add-row-btn').addEventListener('click', () => {
    rowsContainer.appendChild(createRow());
    updateSaveAllButtonState();
  });

  document.getElementById('save-all-btn').addEventListener('click', () => {
    const rows = [...document.querySelectorAll('.add-row')];
    const states = rows.map(rowState);
    if (states.some((s) => !s.empty && !s.valid) || !states.some((s) => s.valid)) return;

    const { month, year } = getCurrentMonthYear();
    states.filter((s) => s.valid).forEach((s) => {
      entries.push({ id: makeId(), day: s.day, month, year, store: s.store, amount: s.amount });
    });
    saveEntries(entries);

    rowsContainer.innerHTML = '';
    rowsContainer.appendChild(createRow());
    updateSaveAllButtonState();
    render();
  });
}

function switchTab(tabName) {
  const isAdd = tabName === 'add';
  document.getElementById('add-screen').hidden = !isAdd;
  document.getElementById('reports-screen').hidden = isAdd;
  document.getElementById('tab-add').classList.toggle('selected', isAdd);
  document.getElementById('tab-reports').classList.toggle('selected', !isAdd);
}

function setupTabs() {
  document.getElementById('tab-add').addEventListener('click', () => switchTab('add'));
  document.getElementById('tab-reports').addEventListener('click', () => switchTab('reports'));
}
```

Also update `editEntry`'s custom-store branch (it currently calls `renderStoreChips()`, which no longer exists) — replace that one call:

```js
      renderStoreChips();
```

with:

```js
      refreshAllStoreSelects();
```

Finally, update the `DOMContentLoaded` listener at the bottom of `app.js`:

```js
document.addEventListener('DOMContentLoaded', () => {
  setupForm();
  render();
});
```

becomes:

```js
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupAddForm();
  render();
});
```

- [ ] **Step 4: Manual check**

Serve the app (`python -m http.server 8080` from the project root) and open it at a 390px-wide viewport.
- Confirm the bottom tab bar shows "Додати" (selected/blue) and "Звіти".
- Confirm one add row is visible (day input, store dropdown, amount input, × button) and the × is effectively a no-op when it's the only row (row stays).
- Click "+ Додати рядок" — confirm a second row appears, and now × removes it.
- Pick a store from the dropdown in a row, confirm "+ свій" prompts for a name and adds/selects a custom store, and that the new store now appears in a second row's dropdown too.
- Fill day/store/amount in one row, confirm "Зберегти все" becomes enabled; leave a second row half-filled, confirm the button disables again and the half-filled row gets a red border.
- Click "Звіти" tab — confirm the Add screen hides and the Reports screen (still static/unwired) shows instead, and clicking "Додати" again switches back.
- Check DevTools console for errors — none expected beyond the (still-unregistered until Task 1 uses the same manifest/sw.js from before) SW warnings, which are already known/expected.

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css app.js
git commit -m "feat: add tab bar, multi-row add form, and Reports screen skeleton"
```

---

### Task 2: Reports screen rendering (totals, breakdown, avg/max, month navigation)

**Files:**
- Modify: `app.js` (append new functions; no deletions)

**Interfaces:**
- Consumes: `entries`, `MONTH_NAMES_UK`, `formatAmount`, `getCurrentMonthYear`, `escapeHtml`, DOM ids from Task 1 (`#report-prev`, `#report-month-label`, `#report-next`, `#report-total`, `#report-breakdown`, `#report-avg`, `#report-max`, `#report-entries-list`, `#report-empty-state`), `switchTab` from Task 1.
- Produces (used by Task 3): a module-scope `reportCursor` variable (`{month, year}`), and `computeMonthEntries(month, year)`, `computeBreakdown(monthEntries)`, `computeDayStats(monthEntries)` — pure helper functions Task 3's JPG export reuses so the exported image matches what's on screen exactly.

- [ ] **Step 1: Append the Reports logic to `app.js`**

```js
let reportCursor = getCurrentMonthYear();

function computeMonthEntries(month, year) {
  return entries
    .filter((e) => e.month === month && e.year === year)
    .sort((a, b) => a.day - b.day);
}

function computeBreakdown(monthEntries) {
  const totals = new Map();
  monthEntries.forEach((e) => {
    totals.set(e.store, (totals.get(e.store) || 0) + e.amount);
  });
  return [...totals.entries()]
    .map(([store, amount]) => ({ store, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function computeDayStats(monthEntries) {
  if (monthEntries.length === 0) {
    return { avg: 0, maxDay: null, maxAmount: 0 };
  }
  const byDay = new Map();
  monthEntries.forEach((e) => {
    byDay.set(e.day, (byDay.get(e.day) || 0) + e.amount);
  });
  const total = [...byDay.values()].reduce((sum, v) => sum + v, 0);
  const avg = total / byDay.size;

  let maxDay = null;
  let maxAmount = -Infinity;
  byDay.forEach((amount, day) => {
    if (amount > maxAmount) {
      maxAmount = amount;
      maxDay = day;
    }
  });

  return { avg, maxDay, maxAmount };
}

function hasEntriesBefore(month, year) {
  return entries.some((e) => e.year < year || (e.year === year && e.month < month));
}

function renderReports() {
  const { month, year } = reportCursor;
  document.getElementById('report-month-label').textContent = `${MONTH_NAMES_UK[month - 1]} ${year}`;

  const { month: curMonth, year: curYear } = getCurrentMonthYear();
  const isCurrentMonth = month === curMonth && year === curYear;
  document.getElementById('report-next').disabled = isCurrentMonth;
  document.getElementById('report-prev').disabled = !hasEntriesBefore(month, year);

  const monthEntries = computeMonthEntries(month, year);
  const total = monthEntries.reduce((sum, e) => sum + e.amount, 0);
  document.getElementById('report-total').textContent = formatAmount(total);

  const breakdown = computeBreakdown(monthEntries);
  const breakdownEl = document.getElementById('report-breakdown');
  breakdownEl.innerHTML = breakdown.length === 0
    ? '<p class="report-line">Немає даних</p>'
    : breakdown.map((b) => `<div class="report-line"><span>${escapeHtml(b.store)}</span><span>${formatAmount(b.amount)}</span></div>`).join('');

  const { avg, maxDay, maxAmount } = computeDayStats(monthEntries);
  document.getElementById('report-avg').textContent = `Середня витрата за день: ${formatAmount(avg)}`;
  document.getElementById('report-max').textContent = maxDay
    ? `Максимальна витрата за день: ${formatAmount(maxAmount)} (${maxDay} ${MONTH_NAMES_UK[month - 1]})`
    : 'Максимальна витрата за день: -';

  const listEl = document.getElementById('report-entries-list');
  const emptyEl = document.getElementById('report-empty-state');
  listEl.innerHTML = '';
  if (monthEntries.length === 0) {
    emptyEl.hidden = false;
  } else {
    emptyEl.hidden = true;
    monthEntries.forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'entry-row';
      row.innerHTML = `
        <div class="entry-main">
          <span class="entry-store">${escapeHtml(entry.store)}</span>
          <span class="entry-day">${entry.day} ${MONTH_NAMES_UK[entry.month - 1]}</span>
        </div>
        <span class="entry-amount">${formatAmount(entry.amount)}</span>
      `;
      listEl.appendChild(row);
    });
  }
}

function stepReportMonth(delta) {
  let { month, year } = reportCursor;
  month += delta;
  if (month < 1) { month = 12; year -= 1; }
  if (month > 12) { month = 1; year += 1; }
  reportCursor = { month, year };
  renderReports();
}

function setupReports() {
  document.getElementById('report-prev').addEventListener('click', () => stepReportMonth(-1));
  document.getElementById('report-next').addEventListener('click', () => stepReportMonth(1));

  document.getElementById('tab-reports').addEventListener('click', () => {
    reportCursor = getCurrentMonthYear();
    renderReports();
  });
}
```

- [ ] **Step 2: Wire `setupReports()` into `DOMContentLoaded`**

```js
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupAddForm();
  setupReports();
  render();
});
```

- [ ] **Step 3: Manual check**

Reload the app. In DevTools console, seed entries across two months (the UI can't backdate, so this is direct state manipulation, matching the base spec's testing approach for month-crossing scenarios):

```js
entries.push({ id: makeId(), day: 5, month: 7, year: 2026, store: 'Walmart', amount: 20 });
entries.push({ id: makeId(), day: 12, month: 7, year: 2026, store: 'Costco', amount: 80 });
entries.push({ id: makeId(), day: 3, month: 8, year: 2026, store: 'Freshco', amount: 15 });
saveEntries(entries);
```

Click the "Звіти" tab. Confirm: current month (August) shows total $15, breakdown "Freshco: $15.00", avg/max both $15.00 on day 3. Click ‹ — confirm it navigates to July 2026, showing total $100, breakdown "Costco: $80.00" then "Walmart: $20.00" (sorted descending), avg = $50.00, max = $80.00 (day 12). Confirm › is disabled on the current month and re-enabled after stepping back to July. Confirm ‹ becomes disabled once there's no earlier month with data (June). Clear localStorage afterward.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: render monthly reports with store breakdown and day stats"
```

---

### Task 3: JPG export of the Reports screen

**Files:**
- Modify: `app.js` (append)

**Interfaces:**
- Consumes: `reportCursor`, `computeMonthEntries`, `computeBreakdown`, `computeDayStats`, `formatAmount`, `MONTH_NAMES_UK` from Task 2.
- Produces: nothing consumed by later tasks (final feature piece).

- [ ] **Step 1: Append the export function to `app.js`**

```js
function exportReportAsJpg() {
  const { month, year } = reportCursor;
  const monthEntries = computeMonthEntries(month, year);
  const breakdown = computeBreakdown(monthEntries);
  const total = monthEntries.reduce((sum, e) => sum + e.amount, 0);
  const { avg, maxDay, maxAmount } = computeDayStats(monthEntries);

  const width = 720;
  const padding = 28;
  const lineHeight = 30;
  const breakdownLines = Math.max(breakdown.length, 1);
  const entryLines = Math.max(monthEntries.length, 1);
  const totalLines = 2 /* title + spacing */ + 2 /* total + spacing */ + 1 /* breakdown header */ + breakdownLines + 1 /* spacing */ + 2 /* avg + max */ + 1 /* spacing */ + 1 /* entries header */ + entryLines;
  const height = padding * 2 + totalLines * lineHeight;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#0f172a';
  ctx.textBaseline = 'alphabetic';

  let y = padding + 22;
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.fillText(`Мої витрати — ${MONTH_NAMES_UK[month - 1]} ${year}`, padding, y);
  y += lineHeight * 2;

  ctx.font = '20px system-ui, sans-serif';
  ctx.fillText(`Всього: ${formatAmount(total)}`, padding, y);
  y += lineHeight * 2;

  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillText('По магазинах:', padding, y);
  y += lineHeight;
  ctx.font = '18px system-ui, sans-serif';
  if (breakdown.length === 0) {
    ctx.fillText('немає витрат', padding + 16, y);
    y += lineHeight;
  } else {
    breakdown.forEach((b) => {
      ctx.fillText(`${b.store}: ${formatAmount(b.amount)}`, padding + 16, y);
      y += lineHeight;
    });
  }
  y += lineHeight;

  ctx.font = '18px system-ui, sans-serif';
  ctx.fillText(`Середня витрата за день: ${formatAmount(avg)}`, padding, y);
  y += lineHeight;
  ctx.fillText(
    maxDay ? `Максимальна витрата за день: ${formatAmount(maxAmount)} (${maxDay} ${MONTH_NAMES_UK[month - 1]})` : 'Максимальна витрата за день: -',
    padding, y
  );
  y += lineHeight * 2;

  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillText('Записи:', padding, y);
  y += lineHeight;
  ctx.font = '18px system-ui, sans-serif';
  if (monthEntries.length === 0) {
    ctx.fillText('немає витрат', padding + 16, y);
  } else {
    monthEntries.forEach((e) => {
      ctx.fillText(`${e.day} ${MONTH_NAMES_UK[month - 1]} — ${e.store} — ${formatAmount(e.amount)}`, padding + 16, y);
      y += lineHeight;
    });
  }

  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vytraty-${year}-${String(month).padStart(2, '0')}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, 'image/jpeg', 0.92);
}

function setupJpgExport() {
  document.getElementById('download-jpg-btn').addEventListener('click', exportReportAsJpg);
}
```

- [ ] **Step 2: Wire `setupJpgExport()` into `DOMContentLoaded`**

```js
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupAddForm();
  setupReports();
  setupJpgExport();
  render();
});
```

- [ ] **Step 3: Manual check**

With the July/August seed data from Task 2 still present (or re-seed it), go to the "Звіти" tab, navigate to July 2026, click "Скачати .jpg". Confirm a file named `vytraty-2026-07.jpg` downloads. Open it and confirm it shows the title "Мої витрати — Липень 2026", "Всього: $100.00", the Costco/Walmart breakdown lines, avg/max lines, and both entries — with no text clipped off the bottom of the image. Also test with the current month when it has zero entries (clear localStorage, reload, go straight to Звіти, download) and confirm the image still renders cleanly with "$0.00" and "немає витрат" lines instead of erroring.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: add canvas-based JPG export for monthly reports"
```

---

### Task 4: Full manual regression pass

**Files:** none (verification only)

- [ ] **Step 1: Fresh-state walkthrough**

Clear `localStorage`, reload at 390px width. Confirm the Add screen shows one empty row, $0.00 total, empty state message, and the Reports tab shows the current month with $0.00 / no breakdown / no entries / both nav arrows appropriately disabled (there is nothing before or after the current month).

- [ ] **Step 2: Multi-row add**

Add 3 rows in one go (different days/stores, including one custom store) and click "Зберегти все". Confirm all 3 appear in the Add screen's current-month list, the total is correct, and the form resets to a single blank row.

- [ ] **Step 3: Row removal and partial-row blocking**

Add 2 rows, fully fill one and leave the other with only a day filled in. Confirm "Зберегти все" is disabled and the incomplete row is visually flagged. Remove the incomplete row via "×" and confirm the button re-enables and save succeeds with just the one entry.

- [ ] **Step 4: Existing edit/delete still work**

On the Add screen's list, edit an entry's amount and confirm the total updates; delete an entry and confirm it's removed and the total drops. (This exercises the unmodified `editEntry`/`deleteEntry` code from the base app to confirm Task 1's HTML/CSS changes didn't break it.)

- [ ] **Step 5: Reports across months**

Seed entries in at least 2 different months via dev tools (as in Task 2), confirm navigation, totals, breakdown, and avg/max are all correct, and that you cannot navigate past the current month.

- [ ] **Step 6: JPG export**

Download a report for a month with data and confirm the image is correct and unclipped, as in Task 3.

- [ ] **Step 7: Tab persistence and PWA sanity**

Switch between Додати/Звіти a few times, confirm no console errors accumulate. Confirm the app still installs (manifest/service worker still register — Task 1 didn't change `manifest.json`/`sw.js`, but `index.html`'s asset references did change indirectly through inclusion, so re-verify the SW's cached asset list in `sw.js` still matches: `index.html`, `styles.css`, `app.js`, `manifest.json`, `icons/icon-192.png`, `icons/icon-512.png` — no new files were added that need caching, so no `sw.js` change is expected, but confirm registration still succeeds with no 404s).

- [ ] **Step 8: Commit (only if fixes were needed)**

```bash
git add <fixed files>
git commit -m "fix: <describe the regression fixed during manual QA pass>"
```
