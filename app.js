import { auth } from './firebase-config.js';
import {
  onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { db } from './firebase-config.js';
import {
  collection, doc, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

let currentUser = null;

function showLoginScreen() {
  document.getElementById('login-screen').hidden = false;
  document.getElementById('app-header').hidden = true;
  document.querySelector('main').hidden = true;
  document.querySelector('.tab-bar').hidden = true;
  document.getElementById('sign-out-btn').hidden = true;
}

function showApp() {
  document.getElementById('login-screen').hidden = true;
  document.getElementById('app-header').hidden = false;
  document.querySelector('main').hidden = false;
  document.querySelector('.tab-bar').hidden = false;
  document.getElementById('sign-out-btn').hidden = false;
}

function startDataSubscriptions() {
  const entriesQuery = query(collection(db, 'users', currentUser.uid, 'entries'), orderBy('createdAt'));
  entriesUnsub = onSnapshot(entriesQuery, (snapshot) => {
    entries = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
    if (!document.getElementById('reports-screen').hidden) renderReports();
  }, (err) => console.error('[entries] subscription failed:', err));

  const profileRef = doc(db, 'users', currentUser.uid);
  profileUnsub = onSnapshot(profileRef, (snap) => {
    if (!snap.exists()) {
      setDoc(profileRef, {
        customFolders: [], storesByFolder: {}, removedDefaultStores: {},
        language: 'en', theme: 'light',
      }, { merge: true }).catch((err) => console.error('[profile] init failed:', err));
      return;
    }
    const data = snap.data();
    profileData = {
      customFolders: data.customFolders || [],
      storesByFolder: data.storesByFolder || {},
      removedDefaultStores: data.removedDefaultStores || {},
      language: data.language || 'en',
      theme: data.theme || 'light',
    };
    if (!allFolders().includes(selectedFolder)) selectedFolder = FIXED_FOLDERS[0];
    renderFolderTabs();
    refreshAllStoreSelects();
    render();
    if (!document.getElementById('manage-stores-screen').hidden) renderManageStores();
  }, (err) => console.error('[profile] subscription failed:', err));
}

function stopDataSubscriptions() {
  if (entriesUnsub) { entriesUnsub(); entriesUnsub = null; }
  if (profileUnsub) { profileUnsub(); profileUnsub = null; }
  entries = [];
  profileData = { customFolders: [], storesByFolder: {}, removedDefaultStores: {}, language: 'en', theme: 'light' };
  selectedFolder = FIXED_FOLDERS[0];
  render();
  renderFolderTabs();
  refreshAllStoreSelects();
  if (!document.getElementById('manage-stores-screen').hidden) closeManageStores();
  if (!document.getElementById('reports-screen').hidden) switchTab('add');
}

function setupAuth() {
  document.getElementById('google-signin-btn').addEventListener('click', () => {
    const errorEl = document.getElementById('login-error');
    errorEl.hidden = true;
    signInWithPopup(auth, new GoogleAuthProvider()).catch((err) => {
      console.error('[auth] sign-in failed:', err);
      errorEl.textContent = 'Не вдалося увійти. Спробуйте ще раз.';
      errorEl.hidden = false;
    });
  });

  document.getElementById('sign-out-btn').addEventListener('click', () => {
    signOut(auth).catch((err) => console.error('[auth] sign-out failed:', err));
  });

  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user) {
      showApp();
      startDataSubscriptions();
    } else {
      stopDataSubscriptions();
      showLoginScreen();
    }
  });
}

const CUSTOM_STORES_KEY = 'expenseTracker.customStores';

const FIXED_FOLDERS = ['Продукти', "Обов'язкові платежі", 'Інше'];
const DEFAULT_STORES_BY_FOLDER = { 'Продукти': ['Walmart', 'Dollarama', 'Freshco', 'Costco'] };

let profileData = { customFolders: [], storesByFolder: {}, removedDefaultStores: {}, language: 'en', theme: 'light' };
let profileUnsub = null;

function allFolders() {
  return [...FIXED_FOLDERS, ...profileData.customFolders];
}

function storesForFolder(folder) {
  const custom = profileData.storesByFolder[folder] || [];
  const defaults = DEFAULT_STORES_BY_FOLDER[folder] || [];
  const removed = profileData.removedDefaultStores[folder] || [];
  return [...defaults.filter((d) => !removed.includes(d)), ...custom];
}

function saveProfileFields(fields) {
  updateDoc(doc(db, 'users', currentUser.uid), fields).catch((err) => console.error('[profile] update failed:', err));
}

function removeStoreFromFolder(folder, store) {
  const storesByFolder = { ...profileData.storesByFolder };
  if (storesByFolder[folder]) {
    storesByFolder[folder] = storesByFolder[folder].filter((s) => s !== store);
  }
  const updates = { storesByFolder };
  const defaults = DEFAULT_STORES_BY_FOLDER[folder] || [];
  if (defaults.includes(store)) {
    const removedDefaultStores = { ...profileData.removedDefaultStores };
    removedDefaultStores[folder] = [...new Set([...(removedDefaultStores[folder] || []), store])];
    updates.removedDefaultStores = removedDefaultStores;
  }
  profileData = { ...profileData, ...updates };
  saveProfileFields(updates);
}

function addStoreToFolder(folder, store) {
  const storesByFolder = { ...profileData.storesByFolder };
  storesByFolder[folder] = storesByFolder[folder] ? [...storesByFolder[folder]] : [];
  if (!storesByFolder[folder].includes(store)) {
    storesByFolder[folder].push(store);
  }
  profileData = { ...profileData, storesByFolder };
  saveProfileFields({ storesByFolder });
}

function getCurrentMonthYear() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

let entries = [];
let entriesUnsub = null;
let selectedFolder = FIXED_FOLDERS[0];

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

  const folderEntries = entries.filter((e) => e.folder === selectedFolder);

  const monthEntries = folderEntries.filter((e) => e.month === month && e.year === year);
  const total = monthEntries.reduce((sum, e) => sum + e.amount, 0);
  document.getElementById('monthly-total').textContent = formatAmount(total);

  const blocks = groupEntriesByDay(folderEntries);
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
    const highlightDate = calendarTarget === 'period-from' ? periodFrom
      : calendarTarget === 'period-to' ? periodTo
      : selectedDate;
    if (calCursor.year === highlightDate.year && calCursor.month === highlightDate.month && day === highlightDate.day) {
      btn.classList.add('selected');
    }

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

    grid.appendChild(btn);
  }
}

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

function closeCalendar() {
  const backdrop = document.getElementById('calendar-backdrop');
  backdrop.classList.remove('open');
  setTimeout(() => { backdrop.hidden = true; }, 220);
}

function setupCalendar() {
  document.getElementById('date-field-btn').addEventListener('click', () => openCalendar('add'));
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

function refreshAllStoreSelects() {
  document.querySelectorAll('.row-store').forEach(populateStoreOptions);
}

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
    const customFolders = [...profileData.customFolders, trimmed];
    profileData = { ...profileData, customFolders };
    saveProfileFields({ customFolders });
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
    addStoreToFolder(selectedFolder, trimmed);
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
      addDoc(collection(db, 'users', currentUser.uid, 'entries'), {
        day: selectedDate.day, month: selectedDate.month, year: selectedDate.year,
        store: s.store, amount: s.amount, folder: selectedFolder,
        createdAt: serverTimestamp(),
      }).catch((err) => console.error('[entries] add failed:', err));
    });

    rowsContainer.innerHTML = '';
    rowsContainer.appendChild(createRow());
    updateSaveAllButtonState();
    selectedDate = todayDate();
    updateDateFieldLabel();
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
  deleteDoc(doc(db, 'users', currentUser.uid, 'entries', id)).catch((err) => console.error('[entries] delete failed:', err));
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

  const updatedStore = newStore.trim();
  if (!storesForFolder(entry.folder).includes(updatedStore)) {
    addStoreToFolder(entry.folder, updatedStore);
    refreshAllStoreSelects();
  }

  updateDoc(doc(db, 'users', currentUser.uid, 'entries', id), {
    day: newDay, store: updatedStore, amount: newAmount,
  }).catch((err) => console.error('[entries] update failed:', err));
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

function computeBreakdown(monthEntries) {
  const totals = new Map();
  monthEntries.forEach((e) => {
    totals.set(e.store, (totals.get(e.store) || 0) + e.amount);
  });
  return [...totals.entries()]
    .map(([store, amount]) => ({ store, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function hasEntriesBefore(month, year) {
  return entries.some((e) => e.year < year || (e.year === year && e.month < month));
}

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

function renderFolderBreakdownBlock(container, listForTotals) {
  const folders = allFolders();

  const totalsRow = document.createElement('div');
  totalsRow.className = 'folder-totals-row';
  totalsRow.style.gridTemplateColumns = `repeat(${folders.length}, 1fr)`;

  const breakdownsRow = document.createElement('div');
  breakdownsRow.className = 'folder-breakdowns-row';
  breakdownsRow.style.gridTemplateColumns = `repeat(${folders.length}, 1fr)`;

  folders.forEach((folder) => {
    const folderEntries = computeFolderEntries(listForTotals, folder);
    const folderTotal = folderEntries.reduce((sum, e) => sum + e.amount, 0);

    const totalCard = document.createElement('div');
    totalCard.className = 'folder-total-card';
    totalCard.innerHTML = `
      <span class="folder-total-name">${escapeHtml(folder)}</span>
      <span class="folder-total-amount">${formatAmount(folderTotal)}</span>
    `;
    totalsRow.appendChild(totalCard);

    const breakdown = computeBreakdown(folderEntries);
    const card = document.createElement('div');
    card.className = 'folder-report-card';
    card.innerHTML = `
      <div class="folder-report-header">${escapeHtml(folder)}</div>
      <div class="folder-report-breakdown">${
        breakdown.length === 0
          ? '<p class="report-line">Немає даних</p>'
          : breakdown.map((b) => `<div class="report-line"><span>${escapeHtml(b.store)}</span><span>${formatAmount(b.amount)}</span></div>`).join('')
      }</div>
    `;
    breakdownsRow.appendChild(card);
  });

  container.appendChild(totalsRow);
  container.appendChild(breakdownsRow);
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

  renderFolderBreakdownBlock(content, list);
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

  document.getElementById('period-from-btn').addEventListener('click', () => openCalendar('period-from'));
  document.getElementById('period-to-btn').addEventListener('click', () => openCalendar('period-to'));

  document.getElementById('tab-reports').addEventListener('click', () => {
    reportCursor = getCurrentMonthYear();
    reportYearCursor = getCurrentMonthYear().year;
    renderReports();
  });
}

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

function setupPrint() {
  document.getElementById('print-btn').addEventListener('click', () => window.print());
}

function runSetup(name, fn) {
  try {
    fn();
  } catch (err) {
    console.error(`[setup] ${name} failed, continuing with the rest of the app:`, err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  runSetup('setupAuth', setupAuth);
  runSetup('setupTabs', setupTabs);
  runSetup('setupCalendar', setupCalendar);
  runSetup('setupFolderTabs', setupFolderTabs);
  runSetup('setupManageStores', setupManageStores);
  runSetup('setupAddForm', setupAddForm);
  runSetup('setupSortToggle', setupSortToggle);
  runSetup('setupReports', setupReports);
  runSetup('setupPrint', setupPrint);
});
