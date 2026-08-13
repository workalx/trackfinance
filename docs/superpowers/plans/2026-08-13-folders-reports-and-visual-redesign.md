# Folders, Period Reports, Print, and Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add folder-based expense categorization (3 fixed + custom folders, each with its own stores and history), extend Reports with Year/Period modes and per-folder breakdowns matching the user's prototype sketch, replace JPG export with browser print, and restyle the whole app with a dark/matte-gradient visual pass.

**Architecture:** Same plain HTML/CSS/JS, no framework, no build step. `folder` becomes a field on every entry; all existing per-month/day logic gets a `folder` filter layered on top of it. The calendar component (Task 1 of the prior plan) is reused unchanged for the new Період date-range pickers.

**Spec:** `docs/superpowers/specs/2026-08-13-folders-reports-and-visual-redesign-design.md`

## Global Constraints

- 3 fixed folders: `Продукти`, `Обов'язкові платежі`, `Інше` — plus user-added custom folders — from spec.
- Each folder has its own store list; Продукти starts with Walmart/Dollarama/Freshco/Costco, others start empty — from spec.
- Entries missing a `folder` field (pre-existing data) default to `"Інше"` on load — from spec.
- Store deletion only removes it from future selection; existing entries keep their recorded store name — from spec.
- Folders cannot be deleted in this scope — from spec.
- "Друкувати" (`window.print()`) replaces "Скачати .jpg" — the JPG export code is deleted, not kept — from spec.
- Visual redesign: dark-first, matte (desaturated) two-stop gradients for primary actions only, glass-like cards, 150-300ms ease-out transitions, `prefers-reduced-motion` respected — from spec.
- Every content-file change bumps the versioned asset query (`?v=N` in `index.html`) and the service worker's `CACHE_NAME`/`ASSETS` list together, per the established convention from the previous cache-busting fix.

---

## File Structure

- `index.html` — rewritten: folder tab row + manage-stores screen markup added to Add screen; Reports screen restructured for Місяць/Рік/Період modes and folder-card layout; JPG button replaced with a print button.
- `styles.css` — rewritten: new gradient/radius tokens, folder tab styles, manage-stores screen styles, folder-card/breakdown styles, period-table styles, `@media print` block, entrance/press animations.
- `app.js` — modified extensively: folder state (`loadCustomFolders`/`saveCustomFolders`, `loadStoresByFolder`/`saveStoresByFolder`), `loadEntries()` migration default, folder-tab rendering/switching, manage-stores screen logic, Reports rewritten for 3 modes with folder breakdowns, `exportReportAsJpg`/`setupJpgExport` deleted and replaced with `setupPrint`.

---

### Task 1: Folder data model, folder tabs, and per-folder Add screen

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `app.js`

**Interfaces:**
- Consumes: existing `makeId`, `todayDate`, `daysInMonth`, `formatAmount`, `escapeHtml`, `formatFullDateUk`, calendar functions (`openCalendar`/`closeCalendar`/`renderCalendarGrid`/`setupCalendar`), `createRow`/`rowState`/`updateSaveAllButtonState`/`setupAddForm`, `render`/`groupEntriesByDay`, `setupSortToggle`.
- Produces (used by Task 2 and later): `FIXED_FOLDERS` constant, `let selectedFolder`, `loadCustomFolders()`/`saveCustomFolders(list)`, `loadStoresByFolder()`/`saveStoresByFolder(map)`, `storesForFolder(folder)` (returns fixed + custom stores for that folder), `switchFolder(name)`, `setupFolderTabs()`.

- [ ] **Step 1: Add folder tabs and restructure the Add screen in `index.html`**

Replace the `#add-screen` section (everything from `<section id="add-screen">` through its closing `</section>`, i.e. lines 18-39 in the current file) with:

```html
    <section id="add-screen">
      <div id="folder-tabs" class="folder-tabs"></div>

      <p class="monthly-total-label">Всього за <span id="month-name"></span>: <span id="monthly-total">$0.00</span></p>

      <button type="button" id="date-field-btn" class="date-field">
        <span id="date-field-label">Сьогодні</span>
        <span class="date-field-chevron" aria-hidden="true">▾</span>
      </button>

      <div id="add-rows"></div>

      <div class="add-actions">
        <button type="button" id="add-row-btn">+ Додати рядок</button>
        <button type="button" id="save-all-btn" disabled>Зберегти все</button>
      </div>

      <button type="button" id="manage-stores-btn" class="link-btn">Керувати магазинами</button>

      <div class="list-header">
        <h2>Мої витрати</h2>
        <button type="button" id="sort-toggle-btn">За датою</button>
      </div>
      <section id="entries-list" aria-live="polite"></section>
      <p id="empty-state" hidden>Поки немає витрат.</p>
    </section>
```

- [ ] **Step 2: Add folder tab styles to `styles.css`**

Append:

```css
.folder-tabs {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  padding-bottom: 0.25rem;
  margin-bottom: 1rem;
}

.folder-tab {
  flex: 0 0 auto;
  padding: 0.55rem 1rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-muted);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.folder-tab.selected {
  background: var(--gradient-accent);
  color: #fff;
  border-color: transparent;
}

.folder-tab.add-folder {
  border-style: dashed;
}

.link-btn {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  color: var(--accent);
  font-size: 0.9rem;
  padding: 0.5rem 0;
  margin-bottom: 0.5rem;
  cursor: pointer;
}
```

(`var(--gradient-accent)` is defined in Task 5; until then it falls back to the browser default for an unknown custom property, which is harmless — `background` simply has no effect and the element keeps its `background: var(--surface)` from `.folder-tab`, so this is safe to leave forward-referenced.)

- [ ] **Step 3: Add folder state and tab rendering to `app.js`**

Replace the `CUSTOM_STORES_KEY` line and the `loadCustomStores`/`saveCustomStores` functions:

```js
const CUSTOM_STORES_KEY = 'expenseTracker.customStores';
```

```js
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
```

with:

```js
const CUSTOM_FOLDERS_KEY = 'expenseTracker.customFolders';
const STORES_BY_FOLDER_KEY = 'expenseTracker.storesByFolder';
const FIXED_FOLDERS = ['Продукти', "Обов'язкові платежі", 'Інше'];

function loadCustomFolders() {
  try {
    const raw = localStorage.getItem(CUSTOM_FOLDERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomFolders(list) {
  try {
    localStorage.setItem(CUSTOM_FOLDERS_KEY, JSON.stringify(list));
  } catch {
    // localStorage unavailable - continue without persistence
  }
}

function allFolders() {
  return [...FIXED_FOLDERS, ...loadCustomFolders()];
}

function loadStoresByFolder() {
  try {
    const raw = localStorage.getItem(STORES_BY_FOLDER_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStoresByFolder(map) {
  try {
    localStorage.setItem(STORES_BY_FOLDER_KEY, JSON.stringify(map));
  } catch {
    // localStorage unavailable - continue without persistence
  }
}

function storesForFolder(folder) {
  const map = loadStoresByFolder();
  const custom = map[folder] || [];
  const defaults = folder === 'Продукти' ? ['Walmart', 'Dollarama', 'Freshco', 'Costco'] : [];
  return [...defaults.filter((d) => !(map[folder + ':removed'] || []).includes(d)), ...custom];
}

function removeStoreFromFolder(folder, store) {
  const map = loadStoresByFolder();
  if (map[folder]) {
    map[folder] = map[folder].filter((s) => s !== store);
  }
  const defaults = folder === 'Продукти' ? ['Walmart', 'Dollarama', 'Freshco', 'Costco'] : [];
  if (defaults.includes(store)) {
    const removedKey = folder + ':removed';
    map[removedKey] = [...new Set([...(map[removedKey] || []), store])];
  }
  saveStoresByFolder(map);
}

function addStoreToFolder(folder, store) {
  const map = loadStoresByFolder();
  map[folder] = map[folder] || [];
  if (!map[folder].includes(store)) {
    map[folder].push(store);
  }
  saveStoresByFolder(map);
}
```

Note: `loadCustomStores`/`saveCustomStores` are removed entirely — every remaining caller is updated in later steps of this task and Task 2. `storesForFolder` folds in a "removed defaults" list per folder (keyed as `"<folder>:removed"` inside the same stored map) so a fixed default store, once deleted via Manage Stores (Task 2), stays gone across reloads without needing a second localStorage key.

- [ ] **Step 4: Update `loadEntries()` to default missing `folder` to `"Інше"`**

Find:

```js
function loadEntries() {
  try {
    const raw = localStorage.getItem(ENTRIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
```

Replace with:

```js
function loadEntries() {
  try {
    const raw = localStorage.getItem(ENTRIES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return parsed.map((e) => ({ folder: 'Інше', ...e }));
  } catch {
    return [];
  }
}
```

- [ ] **Step 5: Add `selectedFolder` state and folder tab rendering/switching**

Add near the top-level state (right after `const entries = loadEntries();`):

```js
let selectedFolder = allFolders()[0];
```

Append folder tab logic (place it near `populateStoreOptions`/`refreshAllStoreSelects`, since it's closely related):

```js
function renderFolderTabs() {
  const container = document.getElementById('folder-tabs');
  container.innerHTML = '';

  allFolders().forEach((name) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'folder-tab' + (name === selectedFolder ? ' selected' : '');
    btn.textContent = name;
    btn.addEventListener('click', () => switchFolder(name));
    container.appendChild(btn);
  });

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'folder-tab add-folder';
  addBtn.textContent = '+';
  addBtn.addEventListener('click', () => {
    const name = prompt('Назва папки:');
    const trimmed = (name || '').trim();
    if (!trimmed || allFolders().includes(trimmed)) return;
    const custom = loadCustomFolders();
    custom.push(trimmed);
    saveCustomFolders(custom);
    switchFolder(trimmed);
  });
  container.appendChild(addBtn);
}

function switchFolder(name) {
  selectedFolder = name;
  renderFolderTabs();
  refreshAllStoreSelects();
  render();
}

function setupFolderTabs() {
  renderFolderTabs();
}
```

- [ ] **Step 6: Scope `populateStoreOptions`, `refreshAllStoreSelects`, and the custom-store prompt to `selectedFolder`**

Find:

```js
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
```

Replace with:

```js
function populateStoreOptions(selectEl) {
  const previousValue = selectEl.value;
  selectEl.innerHTML = '';

  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = 'Магазин';
  selectEl.appendChild(blank);

  storesForFolder(selectedFolder).forEach((name) => {
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
```

Find, inside `createRow`'s store-select change handler:

```js
    const customStores = loadCustomStores();
    if (!customStores.includes(trimmed)) {
      customStores.push(trimmed);
      saveCustomStores(customStores);
    }
    refreshAllStoreSelects();
```

Replace with:

```js
    addStoreToFolder(selectedFolder, trimmed);
    refreshAllStoreSelects();
```

Delete the now-unused `FIXED_STORES` constant declaration (`const FIXED_STORES = ['Walmart', 'Dollarama', 'Freshco', 'Costco'];`) — `storesForFolder` inlines the Продукти defaults instead.

- [ ] **Step 7: Scope `render()`, `save-all-btn` handler, and `editEntry`'s custom-store save to the selected folder**

Find, in `render()`:

```js
function render() {
  const { month, year } = getCurrentMonthYear();
  document.getElementById('month-name').textContent = MONTH_NAMES_UK[month - 1];

  const monthEntries = entries.filter((e) => e.month === month && e.year === year);
  const total = monthEntries.reduce((sum, e) => sum + e.amount, 0);
  document.getElementById('monthly-total').textContent = formatAmount(total);

  const blocks = groupEntriesByDay(entries);
```

Replace with:

```js
function render() {
  const { month, year } = getCurrentMonthYear();
  document.getElementById('month-name').textContent = MONTH_NAMES_UK[month - 1];

  const folderEntries = entries.filter((e) => e.folder === selectedFolder);

  const monthEntries = folderEntries.filter((e) => e.month === month && e.year === year);
  const total = monthEntries.reduce((sum, e) => sum + e.amount, 0);
  document.getElementById('monthly-total').textContent = formatAmount(total);

  const blocks = groupEntriesByDay(folderEntries);
```

(The rest of `render()`'s body is unchanged — `groupEntriesByDay`, sorting, and DOM building already operate on whatever list they're given, now `folderEntries` instead of the global `entries`.)

Find, in `setupAddForm`'s save-all click handler:

```js
    states.filter((s) => s.valid).forEach((s) => {
      entries.push({ id: makeId(), day: selectedDate.day, month: selectedDate.month, year: selectedDate.year, store: s.store, amount: s.amount });
    });
```

Replace with:

```js
    states.filter((s) => s.valid).forEach((s) => {
      entries.push({ id: makeId(), day: selectedDate.day, month: selectedDate.month, year: selectedDate.year, store: s.store, amount: s.amount, folder: selectedFolder });
    });
```

Find, in `editEntry`:

```js
  if (!['Walmart', 'Dollarama', 'Freshco', 'Costco'].includes(entry.store)) {
    const customStores = loadCustomStores();
    if (!customStores.includes(entry.store)) {
      customStores.push(entry.store);
      saveCustomStores(customStores);
      refreshAllStoreSelects();
    }
  }
```

Replace with:

```js
  if (!storesForFolder(entry.folder).includes(entry.store)) {
    addStoreToFolder(entry.folder, entry.store);
    refreshAllStoreSelects();
  }
```

- [ ] **Step 8: Wire `setupFolderTabs()` into `DOMContentLoaded`, before `setupAddForm`**

Find:

```js
document.addEventListener('DOMContentLoaded', () => {
  runSetup('setupTabs', setupTabs);
  runSetup('setupCalendar', setupCalendar);
  runSetup('setupAddForm', setupAddForm);
```

Replace with:

```js
document.addEventListener('DOMContentLoaded', () => {
  runSetup('setupTabs', setupTabs);
  runSetup('setupCalendar', setupCalendar);
  runSetup('setupFolderTabs', setupFolderTabs);
  runSetup('setupAddForm', setupAddForm);
```

- [ ] **Step 9: Manual check**

Bump `index.html`'s `?v=` for `styles.css`/`app.js` and `sw.js`'s `CACHE_NAME`/`ASSETS` (see Global Constraints), serve the app, unregister any old service worker/clear caches in DevTools, and load fresh.
- Confirm 3 folder tabs (Продукти selected by default) + "+" render above the date field.
- Confirm Продукти's store dropdown has Walmart/Dollarama/Freshco/Costco; switch to Обов'язкові платежі, confirm its dropdown is empty except "+ свій".
- Add an expense in Продукти, switch to Інше, confirm Продукти's entry does NOT show in Інше's list, and the "Всього за [Місяць]" total only reflects the current folder.
- Tap "+", add a custom folder "Подарунки", confirm it appears as a new tab and can be selected/used to add an entry.
- Add a custom store to Обов'язкові платежі via "+ свій", confirm it does not appear in Продукти's dropdown.

- [ ] **Step 10: Commit**

```bash
git add index.html styles.css app.js sw.js
git commit -m "feat: add folder tabs with per-folder stores and entry scoping"
```

---

### Task 2: Manage stores screen

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `app.js`

**Interfaces:**
- Consumes: `storesForFolder`, `removeStoreFromFolder`, `selectedFolder`, `refreshAllStoreSelects` from Task 1.
- Produces: `openManageStores()`, `closeManageStores()`, `setupManageStores()` — self-contained, nothing later depends on these by name.

- [ ] **Step 1: Add the manage-stores screen markup to `index.html`**

Add this new `<section>` right after the `#add-screen` section's closing `</section>` (before the `#calendar-backdrop` div):

```html
    <section id="manage-stores-screen" hidden>
      <div class="screen-header">
        <button type="button" id="manage-stores-back" aria-label="Назад">‹</button>
        <h2 id="manage-stores-title">Магазини</h2>
      </div>
      <div id="manage-stores-list"></div>
      <p id="manage-stores-empty" hidden>Немає магазинів у цій папці.</p>
    </section>
```

- [ ] **Step 2: Add manage-stores styles to `styles.css`**

Append:

```css
.screen-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.screen-header button {
  min-width: 2.75rem;
  min-height: 2.75rem;
  border-radius: 0.6rem;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 1.3rem;
  cursor: pointer;
}

.screen-header h2 { margin: 0; font-size: 1.1rem; }

.manage-store-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 0.75rem);
  margin-bottom: 0.6rem;
}

.manage-store-row button {
  min-width: 2.75rem;
  min-height: 2.75rem;
  border-radius: 0.6rem;
  border: 1px solid var(--danger);
  background: var(--bg);
  color: var(--danger);
  font-size: 1rem;
  cursor: pointer;
}
```

- [ ] **Step 3: Add manage-stores logic to `app.js`**

Append (near `setupFolderTabs`, since they're related):

```js
function renderManageStores() {
  document.getElementById('manage-stores-title').textContent = `Магазини — ${selectedFolder}`;
  const list = document.getElementById('manage-stores-list');
  const empty = document.getElementById('manage-stores-empty');
  list.innerHTML = '';

  const stores = storesForFolder(selectedFolder);
  if (stores.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  stores.forEach((name) => {
    const row = document.createElement('div');
    row.className = 'manage-store-row';
    row.innerHTML = `
      <span>${escapeHtml(name)}</span>
      <button type="button" aria-label="Видалити магазин">🗑</button>
    `;
    row.querySelector('button').addEventListener('click', () => {
      removeStoreFromFolder(selectedFolder, name);
      renderManageStores();
      refreshAllStoreSelects();
    });
    list.appendChild(row);
  });
}

function openManageStores() {
  document.getElementById('add-screen').hidden = true;
  document.getElementById('manage-stores-screen').hidden = false;
  renderManageStores();
}

function closeManageStores() {
  document.getElementById('manage-stores-screen').hidden = true;
  document.getElementById('add-screen').hidden = false;
}

function setupManageStores() {
  document.getElementById('manage-stores-btn').addEventListener('click', openManageStores);
  document.getElementById('manage-stores-back').addEventListener('click', closeManageStores);
}
```

- [ ] **Step 4: Wire `setupManageStores()` into `DOMContentLoaded`**

```js
  runSetup('setupManageStores', setupManageStores);
```
(add alongside the other `runSetup(...)` calls, any position after `setupFolderTabs`).

- [ ] **Step 5: Manual check**

Reload. Add 2 custom stores to Обов'язкові платежі. Tap "Керувати магазинами", confirm both appear with delete buttons and the screen title reads "Магазини — Обов'язкові платежі". Delete one, confirm it disappears from the list and (after tapping back) from the Add screen's store dropdown, while an already-saved entry using that store name (add one first, then delete the store) still shows correctly in the entries list. Delete a Продукти fixed store (e.g. Costco), confirm it's gone from Продукти's dropdown after reload too (persisted).

- [ ] **Step 6: Commit**

```bash
git add index.html styles.css app.js
git commit -m "feat: add manage-stores screen with per-folder delete"
```

---

### Task 3: Reports — Місяць/Рік modes with folder-card breakdown

**Files:**
- Modify: `index.html`
- Modify: `app.js`

**Interfaces:**
- Consumes: `entries`, `allFolders`, `formatAmount`, `escapeHtml`, `MONTH_NAMES_UK`, `getCurrentMonthYear`, existing `computeBreakdown`/`hasEntriesBefore`.
- Produces (used by Task 4): `reportMode` variable (`'month' | 'year' | 'period'`), `renderReports()` rewritten to dispatch by mode, `computeFolderEntries(list, folder)`, `renderMonthOrYearReport()` — Task 4 adds the `period` branch alongside this.

- [ ] **Step 1: Replace the `#reports-screen` markup in `index.html`**

Find the `#reports-screen` section (currently the `report-nav`/`report-total`/`report-block`s/`download-jpg-btn`/entries-list block) and replace its entire contents with:

```html
    <section id="reports-screen" hidden>
      <div class="report-mode-switch">
        <button type="button" class="report-mode-btn selected" data-mode="month">Місяць</button>
        <button type="button" class="report-mode-btn" data-mode="year">Рік</button>
        <button type="button" class="report-mode-btn" data-mode="period">Період</button>
      </div>

      <div id="report-nav" class="report-nav">
        <button type="button" id="report-prev" aria-label="Попередній період">‹</button>
        <span id="report-period-label"></span>
        <button type="button" id="report-next" aria-label="Наступний період">›</button>
      </div>

      <div id="report-period-pickers" class="report-period-pickers" hidden>
        <button type="button" id="period-from-btn" class="date-field"></button>
        <button type="button" id="period-to-btn" class="date-field"></button>
      </div>

      <button type="button" id="print-btn">Друкувати</button>

      <div id="report-content"></div>
    </section>
```

- [ ] **Step 2: Rewrite Reports logic in `app.js`**

Delete `reportCursor`, `computeMonthEntries`, `renderReports`, `stepReportMonth`, `setupReports`, `exportReportAsJpg`, and `setupJpgExport` in full (everything from `let reportCursor = getCurrentMonthYear();` through the end of `setupJpgExport`'s closing `}`).

Replace with:

```js
let reportMode = 'month';
let reportCursor = getCurrentMonthYear();
let reportYearCursor = getCurrentMonthYear().year;

function computeFolderEntries(list, folder) {
  return list.filter((e) => e.folder === folder);
}

function computePeriodEntries(month, year) {
  return entries.filter((e) => e.month === month && e.year === year);
}

function computeYearEntries(year) {
  return entries.filter((e) => e.year === year);
}

function renderFolderBreakdownBlock(container, folderList, listForTotals) {
  allFolders().forEach((folder) => {
    const folderEntries = computeFolderEntries(listForTotals, folder);
    const folderTotal = folderEntries.reduce((sum, e) => sum + e.amount, 0);

    const card = document.createElement('div');
    card.className = 'folder-report-card';
    card.innerHTML = `
      <div class="folder-report-header">
        <span>${escapeHtml(folder)}</span>
        <span>${formatAmount(folderTotal)}</span>
      </div>
      <div class="folder-report-breakdown"></div>
    `;

    const breakdown = computeBreakdown(folderEntries);
    const breakdownEl = card.querySelector('.folder-report-breakdown');
    breakdownEl.innerHTML = breakdown.length === 0
      ? '<p class="report-line">Немає даних</p>'
      : breakdown.map((b) => `<div class="report-line"><span>${escapeHtml(b.store)}</span><span>${formatAmount(b.amount)}</span></div>`).join('');

    container.appendChild(card);
  });
}

function renderMonthOrYearReport() {
  const list = reportMode === 'month'
    ? computePeriodEntries(reportCursor.month, reportCursor.year)
    : computeYearEntries(reportYearCursor);

  document.getElementById('report-period-label').textContent = reportMode === 'month'
    ? `${MONTH_NAMES_UK[reportCursor.month - 1]} ${reportCursor.year}`
    : String(reportYearCursor);

  const { month: curMonth, year: curYear } = getCurrentMonthYear();
  if (reportMode === 'month') {
    document.getElementById('report-next').disabled = reportCursor.month === curMonth && reportCursor.year === curYear;
    document.getElementById('report-prev').disabled = !hasEntriesBefore(reportCursor.month, reportCursor.year);
  } else {
    document.getElementById('report-next').disabled = reportYearCursor >= curYear;
    document.getElementById('report-prev').disabled = !entries.some((e) => e.year < reportYearCursor);
  }

  const total = list.reduce((sum, e) => sum + e.amount, 0);
  const content = document.getElementById('report-content');
  content.innerHTML = `<p class="report-grand-total">Всього: <span>${formatAmount(total)}</span></p>`;

  renderFolderBreakdownBlock(content, allFolders(), list);
}

function stepReportPeriod(delta) {
  if (reportMode === 'month') {
    let { month, year } = reportCursor;
    month += delta;
    if (month < 1) { month = 12; year -= 1; }
    if (month > 12) { month = 1; year += 1; }
    reportCursor = { month, year };
  } else if (reportMode === 'year') {
    reportYearCursor += delta;
  }
  renderReports();
}

function renderReports() {
  const nav = document.getElementById('report-nav');
  const pickers = document.getElementById('report-period-pickers');
  nav.hidden = reportMode === 'period';
  pickers.hidden = reportMode !== 'period';

  if (reportMode === 'period') {
    renderPeriodReport();
  } else {
    renderMonthOrYearReport();
  }
}

function setupReports() {
  document.getElementById('report-prev').addEventListener('click', () => stepReportPeriod(-1));
  document.getElementById('report-next').addEventListener('click', () => stepReportPeriod(1));

  document.querySelectorAll('.report-mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      reportMode = btn.dataset.mode;
      document.querySelectorAll('.report-mode-btn').forEach((b) => b.classList.toggle('selected', b === btn));
      renderReports();
    });
  });

  document.getElementById('tab-reports').addEventListener('click', () => {
    reportCursor = getCurrentMonthYear();
    reportYearCursor = getCurrentMonthYear().year;
    renderReports();
  });
}
```

(`renderPeriodReport` is defined in Task 4 — until Task 4 lands, switching to "Період" mode will throw a `ReferenceError`, caught harmlessly by `runSetup`'s pattern only if it were inside a setup call; since it's a click handler, not a setup call, that specific error would surface in the console if a user clicked "Період" between Task 3 and Task 4 — acceptable mid-plan, since both tasks land in the same session before any real usage.)

- [ ] **Step 3: Add report layout CSS**

Append to `styles.css`:

```css
.report-mode-switch {
  display: flex;
  gap: 0.4rem;
  margin-bottom: 1rem;
}

.report-mode-btn {
  flex: 1;
  min-height: 2.75rem;
  border-radius: 0.6rem;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-muted);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.report-mode-btn.selected {
  background: var(--gradient-accent);
  color: #fff;
  border-color: transparent;
}

.report-grand-total {
  font-size: 1.3rem;
  font-weight: 700;
  margin: 0 0 1.25rem;
}
.report-grand-total span { color: var(--accent); }

.folder-report-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 0.75rem);
  padding: 1rem;
  margin-bottom: 1rem;
}

.folder-report-header {
  display: flex;
  justify-content: space-between;
  font-weight: 700;
  font-size: 1.05rem;
  margin-bottom: 0.5rem;
}

.report-period-pickers {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.report-period-pickers .date-field { margin-bottom: 0; }
```

- [ ] **Step 4: Manual check**

(Full check happens after Task 4 restores `renderPeriodReport`; for now just verify Місяць/Рік.) Reload, seed entries across 2 folders and 2 months via console. Go to Звіти (defaults to Місяць), confirm grand total + one card per folder each with its own breakdown, matching the prototype layout. Switch to Рік, confirm it aggregates the whole year correctly and nav steps by year. Switch back to Місяць, confirm state is preserved correctly.

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css app.js
git commit -m "feat: rebuild Reports with Month/Year modes and per-folder breakdown cards"
```

---

### Task 4: Reports — Період mode and print (replacing JPG)

**Files:**
- Modify: `app.js`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `reportMode`, `renderReports`, calendar functions (`todayDate`, `daysInMonth`, `addMonths`, `formatFullDateUk`, `MONTHS_BACK_LIMIT`) from Task 1/3, `openCalendar`-style bottom-sheet markup (reused via a second, generic invocation described below).
- Produces: `renderPeriodReport()` (referenced by Task 3's `renderReports`), `setupPrint()`.

- [ ] **Step 1: Add period date-range state and rendering to `app.js`**

The existing calendar (`#calendar-backdrop`) is a single shared instance. Reuse it for the two Період date fields by tracking *which* field is currently being edited when the calendar opens. Modify `openCalendar` to accept an optional target:

Find:

```js
function openCalendar() {
  calCursor = { month: selectedDate.month, year: selectedDate.year };
  renderCalendarGrid();
  const backdrop = document.getElementById('calendar-backdrop');
  backdrop.hidden = false;
  requestAnimationFrame(() => backdrop.classList.add('open'));
}
```

Replace with:

```js
let calendarTarget = 'add'; // 'add' | 'period-from' | 'period-to'

function openCalendar(target) {
  calendarTarget = target || 'add';
  const base = calendarTarget === 'period-from' ? periodFrom
    : calendarTarget === 'period-to' ? periodTo
    : selectedDate;
  calCursor = { month: base.month, year: base.year };
  renderCalendarGrid();
  const backdrop = document.getElementById('calendar-backdrop');
  backdrop.hidden = false;
  requestAnimationFrame(() => backdrop.classList.add('open'));
}
```

Find, inside `renderCalendarGrid`'s day-button click handler:

```js
    btn.addEventListener('click', () => {
      selectedDate = { day, month: calCursor.month, year: calCursor.year };
      updateDateFieldLabel();
      closeCalendar();
    });
```

Replace with:

```js
    btn.addEventListener('click', () => {
      const picked = { day, month: calCursor.month, year: calCursor.year };
      if (calendarTarget === 'period-from') {
        periodFrom = picked;
        updatePeriodFieldLabels();
        renderReports();
      } else if (calendarTarget === 'period-to') {
        periodTo = picked;
        updatePeriodFieldLabels();
        renderReports();
      } else {
        selectedDate = picked;
        updateDateFieldLabel();
      }
      closeCalendar();
    });
```

Also update the two spots that compare `selectedDate` for the "selected" highlight and future-day disabling inside `renderCalendarGrid`, since the highlighted date must match whichever field is being edited:

Find:

```js
    if (calCursor.year === selectedDate.year && calCursor.month === selectedDate.month && day === selectedDate.day) {
      btn.classList.add('selected');
    }
```

Replace with:

```js
    const highlightDate = calendarTarget === 'period-from' ? periodFrom
      : calendarTarget === 'period-to' ? periodTo
      : selectedDate;
    if (calCursor.year === highlightDate.year && calCursor.month === highlightDate.month && day === highlightDate.day) {
      btn.classList.add('selected');
    }
```

Find the existing `date-field-btn` click wiring in `setupCalendar`:

```js
function setupCalendar() {
  document.getElementById('date-field-btn').addEventListener('click', openCalendar);
```

Replace with:

```js
function setupCalendar() {
  document.getElementById('date-field-btn').addEventListener('click', () => openCalendar('add'));
```

- [ ] **Step 2: Add period state, field labels, and the report table**

Append near the other Reports functions in `app.js`:

```js
function defaultPeriodFrom() {
  const t = todayDate();
  const back = addMonths(t.month, t.year, -1);
  return { day: 1, month: back.month, year: back.year };
}

let periodFrom = defaultPeriodFrom();
let periodTo = todayDate();

function updatePeriodFieldLabels() {
  document.getElementById('period-from-btn').textContent = formatFullDateUk(periodFrom.day, periodFrom.month, periodFrom.year);
  document.getElementById('period-to-btn').textContent = formatFullDateUk(periodTo.day, periodTo.month, periodTo.year);
}

function dateValue(d) {
  return d.year * 10000 + d.month * 100 + d.day;
}

function renderPeriodReport() {
  updatePeriodFieldLabels();

  if (dateValue(periodFrom) > dateValue(periodTo)) {
    periodTo = periodFrom;
    updatePeriodFieldLabels();
  }

  const from = dateValue(periodFrom);
  const to = dateValue(periodTo);
  const matches = entries
    .filter((e) => { const v = dateValue(e); return v >= from && v <= to; })
    .sort((a, b) => dateValue(b) - dateValue(a));

  const content = document.getElementById('report-content');
  const total = matches.reduce((sum, e) => sum + e.amount, 0);

  if (matches.length === 0) {
    content.innerHTML = `<p class="report-grand-total">Всього: <span>${formatAmount(total)}</span></p><p class="report-line">Немає витрат за цей період.</p>`;
    return;
  }

  const rows = matches.map((e) => `
    <div class="period-row">
      <span>${e.day} ${MONTH_NAMES_UK[e.month - 1]} ${e.year}</span>
      <span>${escapeHtml(e.folder)}</span>
      <span>${escapeHtml(e.store)}</span>
      <span>${formatAmount(e.amount)}</span>
    </div>
  `).join('');

  content.innerHTML = `
    <p class="report-grand-total">Всього: <span>${formatAmount(total)}</span></p>
    <div class="period-table">
      <div class="period-row period-header">
        <span>Дата</span><span>Папка</span><span>Магазин</span><span>Сума</span>
      </div>
      ${rows}
    </div>
  `;
}
```

- [ ] **Step 3: Wire the period date-field buttons and print button**

Add to `setupReports`:

```js
  document.getElementById('period-from-btn').addEventListener('click', () => openCalendar('period-from'));
  document.getElementById('period-to-btn').addEventListener('click', () => openCalendar('period-to'));
```

Append a new setup function for print:

```js
function setupPrint() {
  document.getElementById('print-btn').addEventListener('click', () => window.print());
}
```

Wire it into `DOMContentLoaded`:

```js
  runSetup('setupPrint', setupPrint);
```

- [ ] **Step 4: Add period-table and print CSS**

Append to `styles.css`:

```css
.period-table { margin-top: 0.5rem; }

.period-row {
  display: grid;
  grid-template-columns: 1.3fr 1fr 1fr 0.8fr;
  gap: 0.5rem;
  padding: 0.6rem 0;
  border-bottom: 1px solid var(--border);
  font-size: 0.85rem;
}

.period-header {
  font-weight: 700;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
}

#print-btn {
  width: 100%;
  min-height: 3rem;
  font-size: 1rem;
  font-weight: 700;
  color: #fff;
  background: var(--gradient-accent);
  border: none;
  border-radius: var(--radius-lg, 0.75rem);
  cursor: pointer;
  margin-bottom: 1.25rem;
}

@media print {
  .tab-bar, #add-screen, #manage-stores-screen, #calendar-backdrop,
  .report-mode-switch, #report-nav, #report-period-pickers, #print-btn,
  .app-header {
    display: none !important;
  }
  body { background: #ffffff; color: #0f172a; padding-bottom: 0; }
  #reports-screen, #report-content { display: block !important; }
  .folder-report-card, .period-row { break-inside: avoid; }
}
```

- [ ] **Step 5: Manual check**

Reload with bumped cache version. Seed entries spanning 2 months across 2 folders. Go to Звіти → Період, confirm both date fields default to a sensible recent range, opening either triggers the shared calendar and picking a date updates just that field. Pick a "from" date after the current "to" date, confirm "to" snaps to match (per the clamp logic). Confirm the table lists matching entries with correct Дата/Папка/Магазин/Сума columns, sorted newest first, and the grand total matches a manual sum. Click "Друкувати" in all 3 modes, open the browser's print preview (do not actually print), confirm only the report content shows, on a white background, with tab bar/buttons/nav hidden.

- [ ] **Step 6: Commit**

```bash
git add app.js styles.css
git commit -m "feat: add Period report mode and replace JPG export with print"
```

---

### Task 5: Visual redesign — gradient tokens, glass cards, animations

**Files:**
- Modify: `styles.css`

**Interfaces:**
- Consumes: nothing new — this task only adds/adjusts CSS custom properties and rules; no HTML or JS changes.
- Produces: `--accent-2`, `--gradient-accent`, `--radius-lg` tokens consumed by earlier tasks' forward references (Task 1/3/4 already reference `var(--gradient-accent)` and `var(--radius-lg, ...)` with fallbacks).

- [ ] **Step 1: Add new tokens to `:root` and the dark-mode media block**

Find:

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
```

Replace with:

```css
:root {
  --bg: #f8fafc;
  --surface: #ffffff;
  --text: #0f172a;
  --text-muted: #64748b;
  --accent: #2563eb;
  --accent-2: #7c3aed;
  --gradient-accent: linear-gradient(135deg, var(--accent), var(--accent-2));
  --danger: #dc2626;
  --border: #e2e8f0;
  --radius-lg: 1rem;
  color-scheme: light dark;
}
```

Find:

```css
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
```

Replace with:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f172a;
    --surface: #1e293b;
    --text: #f1f5f9;
    --text-muted: #94a3b8;
    --accent: #60a5fa;
    --accent-2: #a78bfa;
    --danger: #f87171;
    --border: #334155;
  }
}
```

(Muted/desaturated blue→violet pairing, matte per the "no vivid rainbow" decision — `--gradient-accent` recomputes automatically since it references the two tokens.)

- [ ] **Step 2: Apply `--radius-lg` consistently and add glass/gradient card treatment**

Find each of these existing rules and change their `border-radius` to `var(--radius-lg)`: `.entry-row`, `.day-block` (add one if missing — currently it only has `margin-bottom`), `.report-block`, `.calendar-sheet` (keep its top-only radius, just swap the value: `border-radius: var(--radius-lg) var(--radius-lg) 0 0;`).

Append a subtle gradient wash + hairline border treatment for the main card surfaces:

```css
.entry-row, .folder-report-card, .manage-store-row {
  background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 96%, var(--accent) 4%), var(--surface));
  border-color: var(--border);
}
```

- [ ] **Step 3: Add entrance and press-feedback animation**

Append:

```css
@media (prefers-reduced-motion: no-preference) {
  .day-block, .folder-report-card, .period-row, .manage-store-row {
    animation: fade-up 220ms ease-out both;
  }

  #add-btn:active, #save-all-btn:active, #print-btn:active,
  .folder-tab:active, .chip:active, .cal-day:active, button:active {
    transform: scale(0.97);
  }

  button, .folder-tab, .cal-day, .tab-btn, .report-mode-btn {
    transition: transform 150ms ease-out, background-color 200ms ease-out, color 200ms ease-out;
  }
}

@keyframes fade-up {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 4: Manual check**

Reload with bumped cache version (this task changes `styles.css` only — bump its `?v=` and the SW `ASSETS`/`CACHE_NAME` accordingly). Confirm: folder tabs, report mode buttons, and Зберегти все/Друкувати show the blue→violet gradient when active/primary; cards have a barely-visible gradient wash and consistent rounded corners; day-blocks/folder-cards/period-rows fade+slide in on render; buttons show a slight press-scale on `:active`. Toggle OS "reduce motion" (or emulate via DevTools rendering tab) and confirm animations disable while functionality stays intact. Verify both light and dark system theme still meet reasonable contrast (no illegible text).

- [ ] **Step 5: Commit**

```bash
git add styles.css
git commit -m "style: add matte gradient accents, glass cards, and entrance/press animations"
```

---

### Task 6: Full manual regression pass and local server update

**Files:** none (verification only)

- [ ] **Step 1: Fresh-state walkthrough**

Clear localStorage and service worker caches, hard-reload. Confirm 3 default folder tabs, empty state, Reports Місяць mode showing $0.00 grand total and 3 empty folder cards.

- [ ] **Step 2: Full folder lifecycle**

Add entries to all 3 fixed folders + 1 new custom folder, across at least 2 different months. Confirm each folder's Add-screen list/total is correctly scoped. Add and then delete a custom store in one folder via Manage Stores; confirm an entry using that store still displays correctly, but the store no longer appears in the picker.

- [ ] **Step 3: Reports — all 3 modes**

Місяць: confirm grand total = sum of all folder totals = sum of all entries in that month. Рік: same check at year granularity. Період: pick a range spanning multiple months/folders, confirm the table and total match a manual calculation, confirm folder column is correct per row.

- [ ] **Step 4: Print**

Open print preview from each Reports mode; confirm clean light-background output with no navigation chrome.

- [ ] **Step 5: Pre-existing-data migration**

In DevTools, manually seed one entry object without a `folder` key directly into `localStorage` (bypassing the app), reload, and confirm it renders correctly filed under "Інше" with no console errors.

- [ ] **Step 6: Visual pass**

Click through every screen (Add for each folder, Manage Stores, Calendar, all 3 Report modes) at a 390px mobile viewport; confirm no layout breakage, animations play once and don't loop, and gradient buttons remain readable (sufficient contrast) against their text.

- [ ] **Step 7: Restart the local server for review**

Confirm (or restart) the local no-cache HTTP server, verify it responds, and report the URL for the user to check in their browser — matching the standing instruction to update localhost after implementation.

- [ ] **Step 8: Commit (only if fixes were needed)**

```bash
git add <fixed files>
git commit -m "fix: <describe the regression fixed during manual QA pass>"
```
