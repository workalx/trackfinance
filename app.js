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

const entries = loadEntries();

const MONTH_NAMES_UK = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];

function formatAmount(n) {
  return `$${n.toFixed(2)}`;
}

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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function daysInMonth(month, year) {
  return new Date(year, month, 0).getDate();
}

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

  const maxDay = daysInMonth(entry.month, entry.year);

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
      refreshAllStoreSelects();
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

function runSetup(name, fn) {
  try {
    fn();
  } catch (err) {
    console.error(`[setup] ${name} failed, continuing with the rest of the app:`, err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  runSetup('setupTabs', setupTabs);
  runSetup('setupCalendar', setupCalendar);
  runSetup('setupAddForm', setupAddForm);
  runSetup('setupSortToggle', setupSortToggle);
  runSetup('setupReports', setupReports);
  runSetup('setupJpgExport', setupJpgExport);
  runSetup('render', render);
});
