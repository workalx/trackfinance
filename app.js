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
