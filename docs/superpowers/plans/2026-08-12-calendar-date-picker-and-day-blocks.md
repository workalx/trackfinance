# Calendar Date Picker & Day-Grouped Blocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-row day-number input with a single custom calendar date picker per add-session (today back to 20 months, no future dates), and regroup the Add screen's saved-entries list by day (each day = one block showing day/month/year, with a sort toggle between date order and add order).

**Architecture:** Same plain HTML/CSS/JS, no framework, no build step, no external calendar library — a hand-built bottom-sheet modal driven by vanilla JS date math (`Date` object), styled with the app's existing CSS custom-property theme tokens.

**Tech Stack:** HTML5, CSS3 (transform/opacity transitions per ui-ux-pro-max animation guidance: 150–300ms, ease-out entering, respects `prefers-reduced-motion`), vanilla JS.

**Spec:** `docs/superpowers/specs/2026-08-12-calendar-date-picker-and-day-blocks-design.md`

## Global Constraints

- Calendar selects dates from **20 months before the current month through today, inclusive** — no future dates — from spec.
- One selected date applies to the whole add batch; rows only carry store+amount — from spec.
- Saved-entries list on the Add screen shows **all entries** (not just current month), grouped into per-day blocks, sorted newest-date-first by default with a toggle to add-order — from spec.
- `editEntry`'s day bound must validate against the entry's own month/year, not the current month — from spec.
- No external UI libraries; calendar is hand-built — from spec and project-wide constraint.
- Existing entry shape (`{id, day, month, year, store, amount}`) and localStorage keys are unchanged.
- Ukrainian UI copy; use genitive month-name forms ("12 серпня 2026") for full-date display per the spec.
- Touch targets ≥44px, transitions 150–300ms using `transform`/`opacity` only, respect `prefers-reduced-motion` — per ui-ux-pro-max guidance gathered for this plan.

---

## File Structure

- `index.html` — modified: adds a date-field button + calendar modal markup to `#add-screen`; removes the day input from row markup (handled in `app.js`, template lives there); adds a list header with a sort-toggle button above `#entries-list`; updates the empty-state copy.
- `styles.css` — modified: adds `.date-field`, calendar backdrop/sheet/grid styles, `.day-block`/`.day-block-header` styles, `.list-header`/`#sort-toggle-btn` styles; removes the now-unused `.row-day`-specific 4-column grid width in favor of a 2-column (store+amount) row grid.
- `app.js` — modified: replaces day-per-row logic with a single `selectedDate` + calendar component; rewrites `render()` to group by day with sort toggle; fixes `editEntry`'s day bound; adds `MONTH_NAMES_UK_GENITIVE`.

---

### Task 1: Calendar component and Add-screen date field

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `app.js:105-241` (the `FIXED_STORES`/`STORE_OPTION_SENTINEL` block through the end of `setupAddForm`)

**Interfaces:**
- Consumes: `loadCustomStores`, `saveCustomStores`, `daysInMonth`, `makeId`, `saveEntries`, `entries`, `render()` (still the old current-month version until Task 2 — calling it is safe, it just won't reflect the new grouping yet).
- Produces (used by Task 2): a module-scope `selectedDate` variable (`{day, month, year}`), and `formatFullDateUk(day, month, year)` — a helper Task 2's block headers reuse for consistent "12 серпня 2026" formatting.

- [ ] **Step 1: Add the date field and calendar modal markup to `index.html`**

Replace:

```html
      <p class="monthly-total-label">Всього за <span id="month-name"></span>: <span id="monthly-total">$0.00</span></p>

      <div id="add-rows"></div>

      <div class="add-actions">
        <button type="button" id="add-row-btn">+ Додати рядок</button>
        <button type="button" id="save-all-btn" disabled>Зберегти все</button>
      </div>

      <section id="entries-list" aria-live="polite"></section>
      <p id="empty-state" hidden>Поки немає витрат у цьому місяці.</p>
    </section>
```

with:

```html
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

      <div class="list-header">
        <h2>Мої витрати</h2>
        <button type="button" id="sort-toggle-btn">За датою</button>
      </div>
      <section id="entries-list" aria-live="polite"></section>
      <p id="empty-state" hidden>Поки немає витрат.</p>
    </section>

    <div id="calendar-backdrop" class="calendar-backdrop" hidden>
      <div id="calendar-sheet" class="calendar-sheet" role="dialog" aria-modal="true" aria-label="Оберіть дату">
        <div class="calendar-handle"></div>
        <div class="calendar-header">
          <button type="button" id="cal-prev" aria-label="Попередній місяць">‹</button>
          <span id="cal-month-label"></span>
          <button type="button" id="cal-next" aria-label="Наступний місяць">›</button>
        </div>
        <div class="calendar-weekdays">
          <span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span>Нд</span>
        </div>
        <div id="cal-grid" class="calendar-grid"></div>
        <button type="button" id="cal-close" class="calendar-close">Закрити</button>
      </div>
    </div>
```

- [ ] **Step 2: Add calendar and layout styles to `styles.css`**

Change the row grid from 4 columns to 3 (store, amount, remove — day column removed):

Replace:

```css
.add-row {
  display: grid;
  grid-template-columns: 3.4rem 1fr 4.6rem 2.4rem;
  gap: 0.4rem;
  align-items: center;
  margin-bottom: 0.5rem;
}
```

with:

```css
.add-row {
  display: grid;
  grid-template-columns: 1fr 4.6rem 2.4rem;
  gap: 0.4rem;
  align-items: center;
  margin-bottom: 0.5rem;
}
```

Then append these new rules to the end of `styles.css`:

```css
/* Date field */
.date-field {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 3rem;
  padding: 0.5rem 0.9rem;
  margin-bottom: 0.75rem;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--surface);
  color: var(--text);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
}

.date-field-chevron { color: var(--text-muted); }

/* List header + sort toggle */
.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 1.25rem 0 0.75rem;
}

.list-header h2 { font-size: 1rem; margin: 0; }

#sort-toggle-btn {
  min-height: 2.5rem;
  padding: 0.4rem 0.8rem;
  border-radius: 0.6rem;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-muted);
  font-size: 0.85rem;
  cursor: pointer;
}

/* Day-grouped blocks */
.day-block { margin-bottom: 1.25rem; }

.day-block-header {
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
}

/* Calendar bottom sheet */
.calendar-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 1000;
  opacity: 0;
  transition: opacity 200ms ease-out;
}

.calendar-backdrop.open { opacity: 1; }

.calendar-sheet {
  width: 100%;
  max-width: 480px;
  background: var(--surface);
  border-radius: 1.25rem 1.25rem 0 0;
  padding: 0.75rem 1rem calc(1.25rem + env(safe-area-inset-bottom, 0px));
  transform: translateY(100%);
  transition: transform 250ms ease-out;
}

.calendar-backdrop.open .calendar-sheet { transform: translateY(0); }

@media (prefers-reduced-motion: reduce) {
  .calendar-backdrop, .calendar-sheet { transition: none; }
}

.calendar-handle {
  width: 2.5rem;
  height: 0.25rem;
  border-radius: 999px;
  background: var(--border);
  margin: 0 auto 0.75rem;
}

.calendar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

#cal-month-label { font-weight: 700; font-size: 1.05rem; text-transform: capitalize; }

.calendar-header button {
  min-width: 2.75rem;
  min-height: 2.75rem;
  border-radius: 0.6rem;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  font-size: 1.3rem;
  cursor: pointer;
}

.calendar-header button:disabled { opacity: 0.35; cursor: not-allowed; }

.calendar-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  color: var(--text-muted);
  font-size: 0.8rem;
  margin-bottom: 0.4rem;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.25rem;
  margin-bottom: 0.75rem;
}

.cal-day {
  aspect-ratio: 1;
  min-height: 2.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text);
  font-size: 0.95rem;
  cursor: pointer;
}

.cal-day:disabled { color: var(--text-muted); opacity: 0.35; cursor: not-allowed; }
.cal-day.today { border: 1.5px solid var(--accent); }
.cal-day.selected { background: var(--accent); color: #fff; font-weight: 700; }
.cal-day.blank { visibility: hidden; cursor: default; }

.calendar-close {
  width: 100%;
  min-height: 2.75rem;
  border-radius: 0.75rem;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  font-size: 0.95rem;
  cursor: pointer;
}
```

- [ ] **Step 3: Replace the day-per-row logic in `app.js` with the calendar + date field**

Find and delete the block from `const FIXED_STORES = ...` through the end of `setupAddForm` (currently lines 105–241) and replace it with:

```js
const FIXED_STORES = ['Walmart', 'Dollarama', 'Freshco', 'Costco'];
const STORE_OPTION_SENTINEL = '__add_custom__';
const MONTHS_BACK_LIMIT = 20;

const MONTH_NAMES_UK_GENITIVE = ['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня'];

function formatFullDateUk(day, month, year) {
  return `${day} ${MONTH_NAMES_UK_GENITIVE[month - 1]} ${year}`;
}

function todayDate() {
  const now = new Date();
  return { day: now.getDate(), month: now.getMonth() + 1, year: now.getFullYear() };
}

function addMonths(month, year, delta) {
  const d = new Date(year, month - 1 + delta, 1);
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

function isSameMonth(a, b) {
  return a.month === b.month && a.year === b.year;
}

let selectedDate = todayDate();
let calCursor = { month: selectedDate.month, year: selectedDate.year };

function updateDateFieldLabel() {
  const today = todayDate();
  const label = document.getElementById('date-field-label');
  if (selectedDate.day === today.day && selectedDate.month === today.month && selectedDate.year === today.year) {
    label.textContent = `Сьогодні, ${formatFullDateUk(selectedDate.day, selectedDate.month, selectedDate.year)}`;
  } else {
    label.textContent = formatFullDateUk(selectedDate.day, selectedDate.month, selectedDate.year);
  }
}

function renderCalendarGrid() {
  const today = todayDate();
  document.getElementById('cal-month-label').textContent = `${MONTH_NAMES_UK[calCursor.month - 1]} ${calCursor.year}`;

  const earliest = addMonths(today.month, today.year, -MONTHS_BACK_LIMIT);
  document.getElementById('cal-prev').disabled = isSameMonth(calCursor, earliest);
  document.getElementById('cal-next').disabled = isSameMonth(calCursor, today);

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  const firstOfMonth = new Date(calCursor.year, calCursor.month - 1, 1);
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7; // Monday-first offset
  for (let i = 0; i < leadingBlanks; i++) {
    const blank = document.createElement('span');
    blank.className = 'cal-day blank';
    grid.appendChild(blank);
  }

  const totalDays = daysInMonth(calCursor.month, calCursor.year);
  for (let day = 1; day <= totalDays; day++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cal-day';
    btn.textContent = String(day);

    const isFuture = calCursor.year === today.year && calCursor.month === today.month && day > today.day;
    if (isFuture) btn.disabled = true;

    if (calCursor.year === today.year && calCursor.month === today.month && day === today.day) {
      btn.classList.add('today');
    }
    if (calCursor.year === selectedDate.year && calCursor.month === selectedDate.month && day === selectedDate.day) {
      btn.classList.add('selected');
    }

    btn.addEventListener('click', () => {
      selectedDate = { day, month: calCursor.month, year: calCursor.year };
      updateDateFieldLabel();
      closeCalendar();
    });

    grid.appendChild(btn);
  }
}

function openCalendar() {
  calCursor = { month: selectedDate.month, year: selectedDate.year };
  renderCalendarGrid();
  const backdrop = document.getElementById('calendar-backdrop');
  backdrop.hidden = false;
  requestAnimationFrame(() => backdrop.classList.add('open'));
}

function closeCalendar() {
  const backdrop = document.getElementById('calendar-backdrop');
  backdrop.classList.remove('open');
  setTimeout(() => { backdrop.hidden = true; }, 220);
}

function setupCalendar() {
  document.getElementById('date-field-btn').addEventListener('click', openCalendar);
  document.getElementById('calendar-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'calendar-backdrop') closeCalendar();
  });
  document.getElementById('cal-close').addEventListener('click', closeCalendar);
  document.getElementById('cal-prev').addEventListener('click', () => {
    calCursor = addMonths(calCursor.month, calCursor.year, -1);
    renderCalendarGrid();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    calCursor = addMonths(calCursor.month, calCursor.year, 1);
    renderCalendarGrid();
  });
}

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
    <select class="row-store" aria-label="Магазин"></select>
    <input type="number" class="row-amount" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" aria-label="Сума">
    <button type="button" class="row-remove" aria-label="Видалити рядок">×</button>
  `;

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

  row.querySelector('.row-amount').addEventListener('input', updateSaveAllButtonState);

  row.querySelector('.row-remove').addEventListener('click', () => {
    if (document.querySelectorAll('.add-row').length <= 1) return;
    row.remove();
    updateSaveAllButtonState();
  });

  return row;
}

function rowState(row) {
  const store = row.querySelector('.row-store').value;
  const amountRaw = row.querySelector('.row-amount').value;
  const empty = !store && !amountRaw;

  const amount = Number(amountRaw);
  const valid = !!store && store !== STORE_OPTION_SENTINEL && !!amountRaw && amount > 0;

  return { empty, valid, store, amount };
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
  updateDateFieldLabel();

  document.getElementById('add-row-btn').addEventListener('click', () => {
    rowsContainer.appendChild(createRow());
    updateSaveAllButtonState();
  });

  document.getElementById('save-all-btn').addEventListener('click', () => {
    const rows = [...document.querySelectorAll('.add-row')];
    const states = rows.map(rowState);
    if (states.some((s) => !s.empty && !s.valid) || !states.some((s) => s.valid)) return;

    states.filter((s) => s.valid).forEach((s) => {
      entries.push({ id: makeId(), day: selectedDate.day, month: selectedDate.month, year: selectedDate.year, store: s.store, amount: s.amount });
    });
    saveEntries(entries);

    rowsContainer.innerHTML = '';
    rowsContainer.appendChild(createRow());
    updateSaveAllButtonState();
    selectedDate = todayDate();
    updateDateFieldLabel();
    render();
  });
}
```

- [ ] **Step 4: Wire `setupCalendar()` into `DOMContentLoaded`**

Find:

```js
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupAddForm();
  setupReports();
  setupJpgExport();
  render();
});
```

Replace with:

```js
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupCalendar();
  setupAddForm();
  setupReports();
  setupJpgExport();
  render();
});
```

- [ ] **Step 5: Manual check**

Serve the app (`python -m http.server 8080` from the project root, since a service worker is involved — remember to unregister any previously-cached service worker and clear caches in DevTools/console before testing, or the browser will keep serving the pre-change files) and open at a 390px-wide viewport.
- Confirm the date field shows "Сьогодні, [today's date]" and tapping it slides up the calendar sheet from the bottom with a smooth animation.
- Confirm today's day is outlined, the forward arrow is disabled (can't go to next month), and paging back works up through 20 months, after which the back arrow disables.
- Tap a past day: confirm the sheet closes, the date field label updates to that date (no "Сьогодні" prefix), and future days in the current month are visually disabled and unclickable.
- Confirm each add row now shows only a store dropdown and amount field (no day input), and "Зберегти все" behaves as before (partial-row blocking, custom-store "+ свій", multi-row add).
- Check DevTools console for errors.

- [ ] **Step 6: Commit**

```bash
git add index.html styles.css app.js
git commit -m "feat: replace per-row day input with a custom calendar date picker"
```

---

### Task 2: Day-grouped entries list, sort toggle, and editEntry fix

**Files:**
- Modify: `app.js` (replace `render()`; replace two lines inside `editEntry`)

**Interfaces:**
- Consumes: `entries`, `formatFullDateUk` (Task 1), `formatAmount`, `escapeHtml`, `getCurrentMonthYear`, `MONTH_NAMES_UK`, DOM ids `#entries-list`, `#empty-state`, `#sort-toggle-btn`, `#month-name`, `#monthly-total` from Task 1's markup.
- Produces: nothing consumed by later tasks (Reports/JPG export already use their own independent `computeMonthEntries`/`computeBreakdown`/etc. and are untouched).

- [ ] **Step 1: Replace `render()` in `app.js`**

Find:

```js
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
```

Replace with:

```js
let listSortMode = 'date';

function groupEntriesByDay(list) {
  const map = new Map();
  list.forEach((entry, idx) => {
    const key = `${entry.year}-${entry.month}-${entry.day}`;
    if (!map.has(key)) {
      map.set(key, { day: entry.day, month: entry.month, year: entry.year, entries: [], maxIndex: idx });
    }
    const block = map.get(key);
    block.entries.push(entry);
    block.maxIndex = Math.max(block.maxIndex, idx);
  });
  return [...map.values()];
}

function render() {
  const { month, year } = getCurrentMonthYear();
  document.getElementById('month-name').textContent = MONTH_NAMES_UK[month - 1];

  const monthEntries = entries.filter((e) => e.month === month && e.year === year);
  const total = monthEntries.reduce((sum, e) => sum + e.amount, 0);
  document.getElementById('monthly-total').textContent = formatAmount(total);

  const blocks = groupEntriesByDay(entries);
  blocks.sort((a, b) => {
    if (listSortMode === 'order') return b.maxIndex - a.maxIndex;
    if (a.year !== b.year) return b.year - a.year;
    if (a.month !== b.month) return b.month - a.month;
    return b.day - a.day;
  });

  const list = document.getElementById('entries-list');
  const emptyState = document.getElementById('empty-state');
  list.innerHTML = '';

  if (blocks.length === 0) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  blocks.forEach((block) => {
    const blockEl = document.createElement('div');
    blockEl.className = 'day-block';

    const header = document.createElement('div');
    header.className = 'day-block-header';
    header.textContent = formatFullDateUk(block.day, block.month, block.year);
    blockEl.appendChild(header);

    block.entries
      .slice()
      .sort((a, b) => entries.indexOf(b) - entries.indexOf(a))
      .forEach((entry) => {
        const row = document.createElement('div');
        row.className = 'entry-row';
        row.dataset.id = entry.id;
        row.innerHTML = `
          <div class="entry-main">
            <span class="entry-store">${escapeHtml(entry.store)}</span>
          </div>
          <span class="entry-amount">${formatAmount(entry.amount)}</span>
          <div class="entry-actions">
            <button type="button" class="edit-btn" aria-label="Редагувати">✎</button>
            <button type="button" class="delete-btn" aria-label="Видалити">🗑</button>
          </div>
        `;
        blockEl.appendChild(row);
      });

    list.appendChild(blockEl);
  });
}

function setupSortToggle() {
  document.getElementById('sort-toggle-btn').addEventListener('click', () => {
    listSortMode = listSortMode === 'date' ? 'order' : 'date';
    document.getElementById('sort-toggle-btn').textContent = listSortMode === 'date' ? 'За датою' : 'За порядком додавання';
    render();
  });
}
```

- [ ] **Step 2: Wire `setupSortToggle()` into `DOMContentLoaded`**

```js
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupCalendar();
  setupAddForm();
  setupSortToggle();
  setupReports();
  setupJpgExport();
  render();
});
```

- [ ] **Step 3: Fix `editEntry`'s day bound**

Find, inside `editEntry`:

```js
  const { month, year } = getCurrentMonthYear();
  const maxDay = daysInMonth(month, year);
```

Replace with:

```js
  const maxDay = daysInMonth(entry.month, entry.year);
```

- [ ] **Step 4: Manual check**

Reload the app. In DevTools console, seed entries across two different days/months and confirm:

```js
entries.push({ id: makeId(), day: 5, month: 6, year: 2026, store: 'Walmart', amount: 20 });
entries.push({ id: makeId(), day: 5, month: 6, year: 2026, store: 'Costco', amount: 80 });
entries.push({ id: makeId(), day: 10, month: 8, year: 2026, store: 'Freshco', amount: 15 });
saveEntries(entries);
render();
```

Confirm two blocks render: "10 серпня 2026" (Freshco $15) above "5 червня 2026" (Walmart $20, Costco $80) — newest date first. Click the sort toggle, confirm it now reads "За порядком додавання" and the block order flips to match insertion order (June block — pushed first — now above the August one, since "most recently added entry's block first" means the block whose last-pushed entry has the higher index comes first; verify against the actual `entries` array order). Edit the June Walmart entry's day to `31` (invalid for June) and confirm it's rejected; edit it to a valid June day and confirm it succeeds. Clear localStorage afterward.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat: group saved entries by day with a date/add-order sort toggle"
```

---

### Task 3: Full manual regression pass and local review

**Files:** none (verification only)

- [ ] **Step 1: Fresh-state walkthrough**

Clear `localStorage` and any stale service worker cache (unregister + `caches.keys()`/delete via DevTools console, as this project's service worker aggressively cache-firsts — see the note in Task 1 Step 5), reload at 390px width. Confirm the date field shows today, one empty row, empty entries-list message, and the Reports tab is unaffected (still shows the current month with $0.00).

- [ ] **Step 2: Calendar bounds and leap-year rendering**

Open the calendar, page back through several months including February of a leap year if the current date range covers one, and confirm the grid always shows the correct number of days with no misaligned weekday columns. Page back exactly 20 months and confirm the back arrow disables there; confirm the forward arrow is disabled on the current month.

- [ ] **Step 3: End-to-end add flow with a past date**

Pick a date from 2 months ago, add 2 store/amount rows, save. Confirm a new block appears at the correct sorted position with the right date header and both lines. Confirm the date field reset to "Сьогодні" afterward.

- [ ] **Step 4: Multiple blocks and sort toggle**

Add an expense for today as well. Confirm it forms its own block. Toggle the sort button and confirm the block ordering changes between date-order and add-order as described in Task 2.

- [ ] **Step 5: Edit/delete still work within blocks**

Edit an entry inside a block (amount and/or day, staying within its own month's bounds) and confirm the block regroups/updates correctly if the day changed. Delete an entry and confirm the block updates (or disappears if it was the only entry that day).

- [ ] **Step 6: Reports and JPG export unaffected**

Switch to "Звіти", confirm month totals/breakdown/avg/max still compute correctly against the same underlying `entries`, and that "Скачати .jpg" still produces a valid image.

- [ ] **Step 7: Start the local server for the user to review**

Run `python -m http.server 8080` from the project root (if not already running) and report the LAN URL so the user can open it on their phone to review the calendar and day-grouped list in person, per their request.

- [ ] **Step 8: Commit (only if fixes were needed)**

```bash
git add <fixed files>
git commit -m "fix: <describe the regression fixed during manual QA pass>"
```
