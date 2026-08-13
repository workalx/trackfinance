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

function daysInMonth(month, year) {
  return new Date(year, month, 0).getDate();
}

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

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupAddForm();
  setupReports();
  render();
});
