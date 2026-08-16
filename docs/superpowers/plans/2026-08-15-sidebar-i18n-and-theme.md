# Sidebar, i18n & Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a settings sidebar (language + theme switchers, "Керувати магазинами"), full UA/EN/RU localization, a manually-switchable pastel-gradient light/dark theme, and explicit "add store" buttons in two places — all synced per-account via the existing Firestore `profileData`.

**Architecture:** A new `i18n.js` module holds the translation dictionary, per-language month names, and the fixed-folder display-name map. `app.js` gains `t()`/`applyTranslations()`/`folderLabel()` and calls them everywhere it currently renders hardcoded Ukrainian text. `styles.css` gets a full pastel-gradient token overhaul plus a new sidebar/backdrop component, driven by a `data-theme` attribute instead of `prefers-color-scheme`. The sidebar is a new `<aside>` following the exact open/close pattern already used by the calendar bottom-sheet, just sliding from the left instead of up from the bottom.

**Tech Stack:** Vanilla JS (ES modules), same Firebase/Firestore backend as sub-project 1 (no new Firebase surface — reuses `profileData`/`saveProfileFields`), no build step, no test runner (manual browser verification).

**Spec:** `docs/superpowers/specs/2026-08-15-sidebar-i18n-and-theme-design.md`

## Global Constraints

- Only the 3 fixed folder names are translated for display (`FIXED_FOLDER_LABELS`); custom folders and all store names always render exactly as typed, in every language — the underlying stored strings (`entry.folder`, `FIXED_FOLDERS` values, Firestore data) never change.
- Language and theme changes apply live (no page reload) and are synced to Firestore via the existing `saveProfileFields()` helper — same optimistic-update-then-reconcile pattern already used for folders/stores in sub-project 1.
- Default language is `'en'`, default theme is `'light'` — both already the Firestore defaults from sub-project 1; nothing here changes those defaults.
- Bump `styles.css`/`app.js` version query strings and the `sw.js` `CACHE_NAME` together whenever either file changes, per the existing repo convention — otherwise the service worker serves stale files. New files added to the precache `ASSETS` list don't need their own `?v=` query (matches the existing `firebase-config.js` precedent).
- No automated test suite exists in this project — verification is manual, through the connected Chrome extension on the live GitHub Pages URL (`https://workalx.github.io/trackfinance/`), signed in.
- The "+ свій" option inside the store `<select>` is kept exactly as-is — the new add-store buttons are additional entry points to the same flow, not replacements.

---

## Task 1: i18n infrastructure

**Files:**
- Create: `i18n.js`
- Modify: `app.js`
- Modify: `index.html`
- Modify: `sw.js`

**Interfaces:**
- Produces: `i18n.js` exports `translations` (`{uk,en,ru}` dictionaries),
  `MONTH_NAMES` / `MONTH_NAMES_GENITIVE` (`{uk,en,ru}` → 12-element arrays),
  `FIXED_FOLDER_LABELS` (keyed by the literal `FIXED_FOLDERS` strings).
- Produces: `app.js` functions `t(key)`, `applyTranslations()`,
  `folderLabel(folderName)` — consumed by Tasks 2-4 for every new string
  they introduce.
- Consumes: `profileData.language` (already exists, from sub-project 1).

- [ ] **Step 1: Create `i18n.js`**

```js
export const translations = {
  uk: {
    appTitle: 'Мої витрати',
    loginSubtitle: 'Увійдіть, щоб побачити свої витрати.',
    signInButton: 'Увійти через Google',
    signInError: 'Не вдалося увійти. Спробуйте ще раз.',
    signOutButton: 'Вийти',
    todayPrefix: 'Сьогодні',
    monthlyTotalPrefix: 'Всього за',
    storeSelectBlank: 'Магазин',
    storeSelectAddCustom: '+ свій',
    amountAria: 'Сума',
    addRowButton: '+ Додати рядок',
    saveAllButton: 'Зберегти все',
    manageStoresLink: 'Керувати магазинами',
    listHeaderTitle: 'Мої витрати',
    sortByDate: 'За датою',
    sortByOrder: 'За порядком додавання',
    emptyState: 'Поки немає витрат.',
    addFolderPrompt: 'Назва папки:',
    addStorePrompt: 'Назва магазину:',
    manageStoresTitlePrefix: 'Магазини',
    manageStoresEmpty: 'Немає магазинів у цій папці.',
    manageStoresBackAria: 'Назад',
    deleteStoreAria: 'Видалити магазин',
    addStoreButtonLabel: 'Додати магазин',
    calendarAriaLabel: 'Оберіть дату',
    calendarPrevMonthAria: 'Попередній місяць',
    calendarNextMonthAria: 'Наступний місяць',
    calendarClose: 'Закрити',
    weekdayMon: 'Пн', weekdayTue: 'Вт', weekdayWed: 'Ср', weekdayThu: 'Чт',
    weekdayFri: 'Пт', weekdaySat: 'Сб', weekdaySun: 'Нд',
    reportModeMonth: 'Місяць',
    reportModeYear: 'Рік',
    reportModePeriod: 'Період',
    reportPrevPeriodAria: 'Попередній період',
    reportNextPeriodAria: 'Наступний період',
    printButton: 'Друкувати',
    reportTotalLabel: 'Всього:',
    reportNoData: 'Немає даних',
    reportNoDataPeriod: 'Немає витрат за цей період.',
    periodColDate: 'Дата',
    periodColFolder: 'Папка',
    periodColStore: 'Магазин',
    periodColAmount: 'Сума',
    editDayPromptPrefix: 'День (1-',
    editDayInvalid: 'Некоректний день.',
    editStorePrompt: 'Магазин:',
    editStoreEmptyError: 'Назва магазину не може бути порожньою.',
    editAmountPrompt: 'Сума ($):',
    editAmountInvalid: 'Некоректна сума.',
    deleteConfirm: 'Видалити цей запис?',
    editAria: 'Редагувати',
    deleteAria: 'Видалити',
    rowRemoveAria: 'Видалити рядок',
    sidebarTitle: 'Налаштування',
    sidebarOpenAria: 'Відкрити меню',
    sidebarCloseAria: 'Закрити меню',
    sidebarLanguageLabel: 'Мова',
    sidebarThemeLabel: 'Тема',
    themeLight: 'Світла',
    themeDark: 'Темна',
  },
  en: {
    appTitle: 'My Expenses',
    loginSubtitle: 'Sign in to see your expenses.',
    signInButton: 'Sign in with Google',
    signInError: "Couldn't sign in. Please try again.",
    signOutButton: 'Sign out',
    todayPrefix: 'Today',
    monthlyTotalPrefix: 'Total for',
    storeSelectBlank: 'Store',
    storeSelectAddCustom: '+ custom',
    amountAria: 'Amount',
    addRowButton: '+ Add row',
    saveAllButton: 'Save all',
    manageStoresLink: 'Manage stores',
    listHeaderTitle: 'My expenses',
    sortByDate: 'By date',
    sortByOrder: 'By order added',
    emptyState: 'No expenses yet.',
    addFolderPrompt: 'Folder name:',
    addStorePrompt: 'Store name:',
    manageStoresTitlePrefix: 'Stores',
    manageStoresEmpty: 'No stores in this folder.',
    manageStoresBackAria: 'Back',
    deleteStoreAria: 'Delete store',
    addStoreButtonLabel: 'Add store',
    calendarAriaLabel: 'Choose a date',
    calendarPrevMonthAria: 'Previous month',
    calendarNextMonthAria: 'Next month',
    calendarClose: 'Close',
    weekdayMon: 'Mon', weekdayTue: 'Tue', weekdayWed: 'Wed', weekdayThu: 'Thu',
    weekdayFri: 'Fri', weekdaySat: 'Sat', weekdaySun: 'Sun',
    reportModeMonth: 'Month',
    reportModeYear: 'Year',
    reportModePeriod: 'Period',
    reportPrevPeriodAria: 'Previous period',
    reportNextPeriodAria: 'Next period',
    printButton: 'Print',
    reportTotalLabel: 'Total:',
    reportNoData: 'No data',
    reportNoDataPeriod: 'No expenses in this period.',
    periodColDate: 'Date',
    periodColFolder: 'Folder',
    periodColStore: 'Store',
    periodColAmount: 'Amount',
    editDayPromptPrefix: 'Day (1-',
    editDayInvalid: 'Invalid day.',
    editStorePrompt: 'Store:',
    editStoreEmptyError: 'Store name cannot be empty.',
    editAmountPrompt: 'Amount ($):',
    editAmountInvalid: 'Invalid amount.',
    deleteConfirm: 'Delete this entry?',
    editAria: 'Edit',
    deleteAria: 'Delete',
    rowRemoveAria: 'Remove row',
    sidebarTitle: 'Settings',
    sidebarOpenAria: 'Open menu',
    sidebarCloseAria: 'Close menu',
    sidebarLanguageLabel: 'Language',
    sidebarThemeLabel: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
  },
  ru: {
    appTitle: 'Мои расходы',
    loginSubtitle: 'Войдите, чтобы увидеть свои расходы.',
    signInButton: 'Войти через Google',
    signInError: 'Не удалось войти. Попробуйте еще раз.',
    signOutButton: 'Выйти',
    todayPrefix: 'Сегодня',
    monthlyTotalPrefix: 'Всего за',
    storeSelectBlank: 'Магазин',
    storeSelectAddCustom: '+ свой',
    amountAria: 'Сумма',
    addRowButton: '+ Добавить строку',
    saveAllButton: 'Сохранить всё',
    manageStoresLink: 'Управление магазинами',
    listHeaderTitle: 'Мои расходы',
    sortByDate: 'По дате',
    sortByOrder: 'По порядку добавления',
    emptyState: 'Пока нет расходов.',
    addFolderPrompt: 'Название папки:',
    addStorePrompt: 'Название магазина:',
    manageStoresTitlePrefix: 'Магазины',
    manageStoresEmpty: 'Нет магазинов в этой папке.',
    manageStoresBackAria: 'Назад',
    deleteStoreAria: 'Удалить магазин',
    addStoreButtonLabel: 'Добавить магазин',
    calendarAriaLabel: 'Выберите дату',
    calendarPrevMonthAria: 'Предыдущий месяц',
    calendarNextMonthAria: 'Следующий месяц',
    calendarClose: 'Закрыть',
    weekdayMon: 'Пн', weekdayTue: 'Вт', weekdayWed: 'Ср', weekdayThu: 'Чт',
    weekdayFri: 'Пт', weekdaySat: 'Сб', weekdaySun: 'Вс',
    reportModeMonth: 'Месяц',
    reportModeYear: 'Год',
    reportModePeriod: 'Период',
    reportPrevPeriodAria: 'Предыдущий период',
    reportNextPeriodAria: 'Следующий период',
    printButton: 'Печать',
    reportTotalLabel: 'Итого:',
    reportNoData: 'Нет данных',
    reportNoDataPeriod: 'Нет расходов за этот период.',
    periodColDate: 'Дата',
    periodColFolder: 'Папка',
    periodColStore: 'Магазин',
    periodColAmount: 'Сумма',
    editDayPromptPrefix: 'День (1-',
    editDayInvalid: 'Некорректный день.',
    editStorePrompt: 'Магазин:',
    editStoreEmptyError: 'Название магазина не может быть пустым.',
    editAmountPrompt: 'Сумма ($):',
    editAmountInvalid: 'Некорректная сумма.',
    deleteConfirm: 'Удалить эту запись?',
    editAria: 'Редактировать',
    deleteAria: 'Удалить',
    rowRemoveAria: 'Удалить строку',
    sidebarTitle: 'Настройки',
    sidebarOpenAria: 'Открыть меню',
    sidebarCloseAria: 'Закрыть меню',
    sidebarLanguageLabel: 'Язык',
    sidebarThemeLabel: 'Тема',
    themeLight: 'Светлая',
    themeDark: 'Тёмная',
  },
};

const MONTHS_UK = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
const MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

export const MONTH_NAMES = { uk: MONTHS_UK, en: MONTHS_EN, ru: MONTHS_RU };

const MONTHS_GEN_UK = ['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня'];
const MONTHS_GEN_RU = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

export const MONTH_NAMES_GENITIVE = { uk: MONTHS_GEN_UK, en: MONTHS_EN, ru: MONTHS_GEN_RU };

export const FIXED_FOLDER_LABELS = {
  'Продукти': { uk: 'Продукти', en: 'Products', ru: 'Продукты' },
  "Обов'язкові платежі": { uk: "Обов'язкові платежі", en: 'Mandatory payments', ru: 'Обязательные платежи' },
  'Інше': { uk: 'Інше', en: 'Other', ru: 'Другое' },
};
```

- [ ] **Step 2: Add `t()`, `applyTranslations()`, `folderLabel()` to `app.js`**

Add the import at the very top of `app.js`, alongside the existing Firebase imports:

```js
import { translations, MONTH_NAMES, MONTH_NAMES_GENITIVE, FIXED_FOLDER_LABELS } from './i18n.js';
```

Add these three functions (a good spot is right after the `FIXED_FOLDERS`/`DEFAULT_STORES_BY_FOLDER` declarations, since `folderLabel` depends on `FIXED_FOLDER_LABELS`):

```js
function t(key) {
  const lang = profileData.language || 'en';
  return (translations[lang] && translations[lang][key]) || translations.en[key] || key;
}

function folderLabel(folderName) {
  const lang = profileData.language || 'en';
  const entry = FIXED_FOLDER_LABELS[folderName];
  return entry ? (entry[lang] || entry.en) : folderName;
}

function applyTranslations() {
  const lang = profileData.language || 'en';
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
  });
}
```

- [ ] **Step 3: Replace `MONTH_NAMES_UK`/`MONTH_NAMES_UK_GENITIVE` and `formatFullDateUk` with language-aware versions**

Delete the lines:
```js
const MONTH_NAMES_UK = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
```
and
```js
const MONTH_NAMES_UK_GENITIVE = ['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня'];
```
(both are now provided by the `i18n.js` import as `MONTH_NAMES`/`MONTH_NAMES_GENITIVE`, keyed by language).

Replace the function:
```js
function formatFullDateUk(day, month, year) {
  return `${day} ${MONTH_NAMES_UK_GENITIVE[month - 1]} ${year}`;
}
```
with:
```js
function formatFullDate(day, month, year) {
  const lang = profileData.language || 'en';
  return `${day} ${MONTH_NAMES_GENITIVE[lang][month - 1]} ${year}`;
}
```

Every other reference to `formatFullDateUk` in the file (in `updateDateFieldLabel`, `renderCalendarGrid`'s highlight logic doesn't call it, `renderPeriodReport`'s row template doesn't call it either — check `updatePeriodFieldLabels`) becomes `formatFullDate`. Every reference to `MONTH_NAMES_UK[...]` becomes `MONTH_NAMES[profileData.language || 'en'][...]`. Concretely, these call sites change:

```js
// render():
document.getElementById('month-name').textContent = MONTH_NAMES[profileData.language || 'en'][month - 1];

// updateDateFieldLabel():
label.textContent = `${t('todayPrefix')}, ${formatFullDate(selectedDate.day, selectedDate.month, selectedDate.year)}`;
// (the else branch keeps using formatFullDate, just without the prefix — unchanged shape, renamed call)

// renderCalendarGrid():
document.getElementById('cal-month-label').textContent = `${MONTH_NAMES[profileData.language || 'en'][calCursor.month - 1]} ${calCursor.year}`;

// updatePeriodFieldLabels():
document.getElementById('period-from-btn').textContent = formatFullDate(periodFrom.day, periodFrom.month, periodFrom.year);
document.getElementById('period-to-btn').textContent = formatFullDate(periodTo.day, periodTo.month, periodTo.year);

// renderMonthOrYearReport():
document.getElementById('report-period-label').textContent = reportMode === 'month'
  ? `${MONTH_NAMES[profileData.language || 'en'][reportCursor.month - 1]} ${reportCursor.year}`
  : String(reportYearCursor);

// renderPeriodReport()'s row template:
<span>${e.day} ${MONTH_NAMES[profileData.language || 'en'][e.month - 1]} ${e.year}</span>
```

- [ ] **Step 4: Replace hardcoded strings in dynamically-generated markup**

`populateStoreOptions`:
```js
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = t('storeSelectBlank');
  selectEl.appendChild(blank);

  storesForFolder(selectedFolder).forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    selectEl.appendChild(opt);
  });

  const addOpt = document.createElement('option');
  addOpt.value = STORE_OPTION_SENTINEL;
  addOpt.textContent = t('storeSelectAddCustom');
  selectEl.appendChild(addOpt);
```

`renderFolderTabs` — the tab label and the add-folder prompt:
```js
  allFolders().forEach((name) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'folder-tab' + (name === selectedFolder ? ' selected' : '');
    btn.textContent = folderLabel(name);
    btn.addEventListener('click', () => switchFolder(name));
    container.appendChild(btn);
  });

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'folder-tab add-folder';
  addBtn.textContent = '+';
  addBtn.addEventListener('click', () => {
    const name = prompt(t('addFolderPrompt'));
    const trimmed = (name || '').trim();
    if (!trimmed || allFolders().includes(trimmed)) return;
    const customFolders = [...profileData.customFolders, trimmed];
    profileData = { ...profileData, customFolders };
    saveProfileFields({ customFolders });
    switchFolder(trimmed);
  });
  container.appendChild(addBtn);
```

`renderManageStores` — the title and delete-button aria-label:
```js
function renderManageStores() {
  document.getElementById('manage-stores-title').textContent = `${t('manageStoresTitlePrefix')} — ${folderLabel(selectedFolder)}`;
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
      <button type="button" aria-label="${escapeHtml(t('deleteStoreAria'))}">🗑</button>
    `;
    row.querySelector('button').addEventListener('click', () => {
      removeStoreFromFolder(selectedFolder, name);
      renderManageStores();
      refreshAllStoreSelects();
    });
    list.appendChild(row);
  });
}
```

`createRow` — the select/amount aria-labels, placeholder, remove-button aria-label, and the "+ свій" prompt flow:
```js
function createRow() {
  const row = document.createElement('div');
  row.className = 'add-row';
  row.innerHTML = `
    <select class="row-store" aria-label="${escapeHtml(t('storeSelectBlank'))}"></select>
    <input type="number" class="row-amount" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" aria-label="${escapeHtml(t('amountAria'))}">
    <button type="button" class="row-remove" aria-label="${escapeHtml(t('rowRemoveAria'))}">×</button>
  `;

  populateStoreOptions(row.querySelector('.row-store'));

  row.querySelector('.row-store').addEventListener('change', (e) => {
    if (e.target.value !== STORE_OPTION_SENTINEL) {
      updateSaveAllButtonState();
      return;
    }
    const name = prompt(t('addStorePrompt'));
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
```

`render()` — the entry-row template's edit/delete aria-labels:
```js
        row.innerHTML = `
          <div class="entry-main">
            <span class="entry-store">${escapeHtml(entry.store)}</span>
          </div>
          <span class="entry-amount">${formatAmount(entry.amount)}</span>
          <div class="entry-actions">
            <button type="button" class="edit-btn" aria-label="${escapeHtml(t('editAria'))}">✎</button>
            <button type="button" class="delete-btn" aria-label="${escapeHtml(t('deleteAria'))}">🗑</button>
          </div>
        `;
```

`setupSortToggle`:
```js
function setupSortToggle() {
  document.getElementById('sort-toggle-btn').addEventListener('click', () => {
    listSortMode = listSortMode === 'date' ? 'order' : 'date';
    document.getElementById('sort-toggle-btn').textContent = listSortMode === 'date' ? t('sortByDate') : t('sortByOrder');
    render();
  });
}
```

`editEntry` — every prompt/alert:
```js
function editEntry(id) {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;

  const maxDay = daysInMonth(entry.month, entry.year);

  const newDayRaw = prompt(`${t('editDayPromptPrefix')}${maxDay}):`, String(entry.day));
  if (newDayRaw === null) return;
  const newDay = Number(newDayRaw);
  if (!newDay || newDay < 1 || newDay > maxDay) {
    alert(t('editDayInvalid'));
    return;
  }

  const newStore = prompt(t('editStorePrompt'), entry.store);
  if (newStore === null) return;
  if (!newStore.trim()) {
    alert(t('editStoreEmptyError'));
    return;
  }

  const newAmountRaw = prompt(t('editAmountPrompt'), String(entry.amount));
  if (newAmountRaw === null) return;
  const newAmount = Number(newAmountRaw);
  if (!newAmount || newAmount <= 0) {
    alert(t('editAmountInvalid'));
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
```

The delete-confirm listener:
```js
document.getElementById('entries-list').addEventListener('click', (e) => {
  const row = e.target.closest('.entry-row');
  if (!row) return;
  const id = row.dataset.id;

  if (e.target.closest('.delete-btn')) {
    if (confirm(t('deleteConfirm'))) deleteEntry(id);
  } else if (e.target.closest('.edit-btn')) {
    editEntry(id);
  }
});
```

`renderFolderBreakdownBlock` — folder labels and "Немає даних":
```js
    const totalCard = document.createElement('div');
    totalCard.className = 'folder-total-card';
    totalCard.innerHTML = `
      <span class="folder-total-name">${escapeHtml(folderLabel(folder))}</span>
      <span class="folder-total-amount">${formatAmount(folderTotal)}</span>
    `;
    totalsRow.appendChild(totalCard);

    const breakdown = computeBreakdown(folderEntries);
    const card = document.createElement('div');
    card.className = 'folder-report-card';
    card.innerHTML = `
      <div class="folder-report-header">${escapeHtml(folderLabel(folder))}</div>
      <div class="folder-report-breakdown">${
        breakdown.length === 0
          ? `<p class="report-line">${escapeHtml(t('reportNoData'))}</p>`
          : breakdown.map((b) => `<div class="report-line"><span>${escapeHtml(b.store)}</span><span>${formatAmount(b.amount)}</span></div>`).join('')
      }</div>
    `;
```

`renderMonthOrYearReport` — the grand-total label:
```js
  const total = list.reduce((sum, e) => sum + e.amount, 0);
  const content = document.getElementById('report-content');
  content.innerHTML = `<p class="report-grand-total">${t('reportTotalLabel')} <span>${formatAmount(total)}</span></p>`;
```

`renderPeriodReport` — grand-total, empty message, table headers, and folder column:
```js
  const content = document.getElementById('report-content');
  const total = matches.reduce((sum, e) => sum + e.amount, 0);

  if (matches.length === 0) {
    content.innerHTML = `<p class="report-grand-total">${t('reportTotalLabel')} <span>${formatAmount(total)}</span></p><p class="report-line">${escapeHtml(t('reportNoDataPeriod'))}</p>`;
    return;
  }

  const lang = profileData.language || 'en';
  const rows = matches.map((e) => `
    <div class="period-row">
      <span>${e.day} ${MONTH_NAMES[lang][e.month - 1]} ${e.year}</span>
      <span>${escapeHtml(folderLabel(e.folder))}</span>
      <span>${escapeHtml(e.store)}</span>
      <span>${formatAmount(e.amount)}</span>
    </div>
  `).join('');

  content.innerHTML = `
    <p class="report-grand-total">${t('reportTotalLabel')} <span>${formatAmount(total)}</span></p>
    <div class="period-table">
      <div class="period-row period-header">
        <span>${escapeHtml(t('periodColDate'))}</span><span>${escapeHtml(t('periodColFolder'))}</span><span>${escapeHtml(t('periodColStore'))}</span><span>${escapeHtml(t('periodColAmount'))}</span>
      </div>
      ${rows}
    </div>
  `;
```

`setupAuth`'s sign-in error message:
```js
    signInWithPopup(auth, new GoogleAuthProvider()).catch((err) => {
      console.error('[auth] sign-in failed:', err);
      errorEl.textContent = t('signInError');
      errorEl.hidden = false;
    });
```

- [ ] **Step 5: Wire `data-i18n` attributes into `index.html` and call `applyTranslations()` on load**

Replace the `<title>` and the login/header/add-screen/manage-stores/calendar/reports static text with `data-i18n`-tagged versions. Full replacement content for the relevant regions:

```html
  <title>Мої витрати</title>
```
stays as-is (the `<title>` tag itself isn't part of the DOM `applyTranslations()` walks by default — add one extra line at the end of `applyTranslations()` in `app.js` instead: `document.title = t('appTitle');`).

```html
  <section id="login-screen">
    <div class="login-card">
      <h1>TrackFinance</h1>
      <p data-i18n="loginSubtitle">Увійдіть, щоб побачити свої витрати.</p>
      <button type="button" id="google-signin-btn" data-i18n="signInButton">Увійти через Google</button>
      <p id="login-error" class="login-error" hidden></p>
    </div>
  </section>

  <header class="app-header" id="app-header" hidden>
    <h1 data-i18n="appTitle">Мої витрати</h1>
    <button type="button" id="sign-out-btn" class="link-btn" hidden data-i18n="signOutButton">Вийти</button>
  </header>

  <main hidden>
    <section id="add-screen">
      <div id="folder-tabs" class="folder-tabs"></div>

      <p class="monthly-total-label"><span data-i18n="monthlyTotalPrefix">Всього за</span> <span id="month-name"></span>: <span id="monthly-total">$0.00</span></p>

      <button type="button" id="date-field-btn" class="date-field">
        <span id="date-field-label">Сьогодні</span>
        <span class="date-field-chevron" aria-hidden="true">▾</span>
      </button>

      <div id="add-rows"></div>

      <div class="add-actions">
        <button type="button" id="add-row-btn" data-i18n="addRowButton">+ Додати рядок</button>
        <button type="button" id="save-all-btn" disabled data-i18n="saveAllButton">Зберегти все</button>
      </div>

      <button type="button" id="manage-stores-btn" class="link-btn" data-i18n="manageStoresLink">Керувати магазинами</button>

      <div class="list-header">
        <h2 data-i18n="listHeaderTitle">Мої витрати</h2>
        <button type="button" id="sort-toggle-btn" data-i18n="sortByDate">За датою</button>
      </div>
      <section id="entries-list" aria-live="polite"></section>
      <p id="empty-state" hidden data-i18n="emptyState">Поки немає витрат.</p>
    </section>

    <section id="manage-stores-screen" hidden>
      <div class="screen-header">
        <button type="button" id="manage-stores-back" data-i18n-aria-label="manageStoresBackAria" aria-label="Назад">‹</button>
        <h2 id="manage-stores-title">Магазини</h2>
      </div>
      <div id="manage-stores-list"></div>
      <p id="manage-stores-empty" hidden data-i18n="manageStoresEmpty">Немає магазинів у цій папці.</p>
    </section>

    <div id="calendar-backdrop" class="calendar-backdrop" hidden>
      <div id="calendar-sheet" class="calendar-sheet" role="dialog" aria-modal="true" data-i18n-aria-label="calendarAriaLabel" aria-label="Оберіть дату">
        <div class="calendar-handle"></div>
        <div class="calendar-header">
          <button type="button" id="cal-prev" data-i18n-aria-label="calendarPrevMonthAria" aria-label="Попередній місяць">‹</button>
          <span id="cal-month-label"></span>
          <button type="button" id="cal-next" data-i18n-aria-label="calendarNextMonthAria" aria-label="Наступний місяць">›</button>
        </div>
        <div class="calendar-weekdays">
          <span data-i18n="weekdayMon">Пн</span><span data-i18n="weekdayTue">Вт</span><span data-i18n="weekdayWed">Ср</span><span data-i18n="weekdayThu">Чт</span><span data-i18n="weekdayFri">Пт</span><span data-i18n="weekdaySat">Сб</span><span data-i18n="weekdaySun">Нд</span>
        </div>
        <div id="cal-grid" class="calendar-grid"></div>
        <button type="button" id="cal-close" class="calendar-close" data-i18n="calendarClose">Закрити</button>
      </div>
    </div>

    <section id="reports-screen" hidden>
      <div class="report-mode-switch">
        <button type="button" class="report-mode-btn selected" data-mode="month" data-i18n="reportModeMonth">Місяць</button>
        <button type="button" class="report-mode-btn" data-mode="year" data-i18n="reportModeYear">Рік</button>
        <button type="button" class="report-mode-btn" data-mode="period" data-i18n="reportModePeriod">Період</button>
      </div>

      <div id="report-nav" class="report-nav">
        <button type="button" id="report-prev" data-i18n-aria-label="reportPrevPeriodAria" aria-label="Попередній період">‹</button>
        <span id="report-period-label"></span>
        <button type="button" id="report-next" data-i18n-aria-label="reportNextPeriodAria" aria-label="Наступний період">›</button>
      </div>

      <div id="report-period-pickers" class="report-period-pickers" hidden>
        <button type="button" id="period-from-btn" class="date-field"></button>
        <button type="button" id="period-to-btn" class="date-field"></button>
      </div>

      <button type="button" id="print-btn" data-i18n="printButton">Друкувати</button>

      <div id="report-content"></div>
    </section>
  </main>
```

Note: `#date-field-label`, `#manage-stores-title`, `#report-period-label`, and the period-picker buttons keep being set imperatively from `app.js` (via `updateDateFieldLabel`, `renderManageStores`, `renderMonthOrYearReport`, `updatePeriodFieldLabels`) — they're already covered by Step 3/4's changes to those functions, so they don't need `data-i18n` (a static attribute would be immediately overwritten anyway).

Bump the script tag version:
```html
  <script type="module" src="app.js?v=10"></script>
```

In `app.js`'s `DOMContentLoaded` handler, add `applyTranslations` as a setup step (early, so static text is correct before the user sees anything — since `profileData.language` already defaults to `'en'` synchronously at module load, this needs no auth/network round-trip to run correctly the first time):

```js
document.addEventListener('DOMContentLoaded', () => {
  runSetup('applyTranslations', applyTranslations);
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
```

Also call `applyTranslations()` from the profile `onSnapshot` handler inside `startDataSubscriptions()` (so a language change — once Task 3 adds the UI to trigger one — re-applies live), alongside the existing re-render calls:

```js
    if (!allFolders().includes(selectedFolder)) selectedFolder = FIXED_FOLDERS[0];
    applyTranslations();
    renderFolderTabs();
    refreshAllStoreSelects();
    render();
    if (!document.getElementById('manage-stores-screen').hidden) renderManageStores();
    if (!document.getElementById('reports-screen').hidden) renderReports();
```

(the `renderReports()` guard is new here too — add it now since it's the same visibility-guard pattern already used elsewhere and both language and, later, folder-driven reports content need it; harmless no-op today if the reports screen isn't open.)

- [ ] **Step 6: Bump the cache-busting version and add `i18n.js` to the precache list**

```js
const CACHE_NAME = 'expense-tracker-v17';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=9',
  './app.js?v=10',
  './firebase-config.js',
  './i18n.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];
```

- [ ] **Step 7: Commit**

```bash
git add i18n.js app.js index.html sw.js
git commit -m "feat: add i18n infrastructure and translate all UI strings"
```

- [ ] **Step 8: Push and verify on the live site**

```bash
git push
```

After the Pages rebuild, on `https://workalx.github.io/trackfinance/`, signed in: confirm every visible string (header, buttons, folder tab labels, empty state, calendar, reports screen in all 3 modes, print button) renders correctly in English (the default). Open the browser console and run `profileData.language = 'uk'; applyTranslations(); renderFolderTabs(); render();` — confirm the same strings switch to Ukrainian, including the 3 fixed folder tab labels, without a page reload. Repeat for `'ru'`. Reload the page — language reverts to whatever's actually stored in Firestore (still `'en'` at this point, since there's no UI yet to change it for real — that's Task 3). This is expected; the console-based check above is enough to prove the mechanism works end-to-end. Confirm no console errors.

---

## Task 2: Theme system

**Files:**
- Modify: `styles.css`
- Modify: `app.js`
- Modify: `index.html`
- Modify: `sw.js`

**Interfaces:**
- Consumes: `profileData.theme` (already exists, from sub-project 1).
- Produces: an `applyTheme()` function in `app.js`, called from the same
  places `applyTranslations()` is (Task 1's DOMContentLoaded setup and the
  profile snapshot handler) — Task 3 also calls it directly for the
  sidebar's optimistic theme-button click.

- [ ] **Step 1: Replace the color tokens in `styles.css`**

Replace the entire `:root { ... }` block and the `@media (prefers-color-scheme: dark) { :root { ... } }` block (lines 1-26) with:

```css
:root {
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
  color-scheme: light dark;
}

:root[data-theme="dark"] {
  --bg: #1a1730;
  --bg-gradient: linear-gradient(160deg, #1e1b3a 0%, #171334 45%, #0f1729 100%);
  --surface: #241f45;
  --surface-tint: color-mix(in srgb, #241f45 88%, #818cf8 12%);
  --text: #edebff;
  --text-muted: #a9a6d6;
  --accent: #8b7ef8;
  --accent-2: #d9a8fb;
  --accent-pastel: #332e63;
  --danger: #fb7185;
  --border: rgba(196, 181, 253, 0.14);
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.35);
  --shadow-md: 0 4px 18px rgba(0, 0, 0, 0.45);
  --shadow-lg: 0 18px 42px rgba(0, 0, 0, 0.55);
}
```

(Note `--gradient-accent` is defined once in `:root` using `var(--accent)`/`var(--accent-2)` — it does not need to be redeclared in the dark block, it already picks up the dark-theme accent values automatically through the CSS variable reference.)

- [ ] **Step 2: Apply the gradient background and gradient-text treatment**

Change the `body` rule:
```css
body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  background: var(--bg-gradient);
  color: var(--text);
  padding-bottom: 4.5rem;
}
```

Add a new rule (place it near `#monthly-total`'s existing rule):
```css
.gradient-text {
  background: var(--gradient-accent);
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
}
```

Apply the `gradient-text` class in the markup/templates that render these four elements — this is a small set of targeted changes:
- `index.html`: `<span id="monthly-total" class="gradient-text">$0.00</span>` and `<h1 class="gradient-text">TrackFinance</h1>` (inside `.login-card`).
- `app.js`, `renderMonthOrYearReport` and `renderPeriodReport`: change
  `<p class="report-grand-total">${t('reportTotalLabel')} <span>${formatAmount(total)}</span></p>`
  to
  `<p class="report-grand-total">${t('reportTotalLabel')} <span class="gradient-text">${formatAmount(total)}</span></p>`
  (both occurrences — `renderMonthOrYearReport` and both places inside `renderPeriodReport`, including the empty-state one).
- `app.js`, `renderFolderBreakdownBlock`: change
  `<span class="folder-total-amount">${formatAmount(folderTotal)}</span>`
  to
  `<span class="folder-total-amount gradient-text">${formatAmount(folderTotal)}</span>`.

Remove the now-redundant `#monthly-total, #report-total { color: var(--accent); ... }` and `.report-grand-total span { color: var(--accent); ... }` and `.folder-total-amount { ...; color: var(--accent); }` color declarations from their existing rules in `styles.css` (keep the other properties — `font-weight`, `font-size` — the `.gradient-text` class now owns the color).

- [ ] **Step 3: Elevation, radius, and border-color updates**

In the existing "Glass/gradient card treatment" rule, add the new shadow and radius:
```css
.entry-row, .folder-report-card, .folder-total-card, .manage-store-row {
  background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 96%, var(--accent) 4%), var(--surface));
  border-color: var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}
```

Add `box-shadow: var(--shadow-md);` and `border-radius: var(--radius-lg);` to `.login-card`'s existing rule. Add `box-shadow: var(--shadow-lg);` to `.calendar-sheet`'s existing rule (radius there is intentionally asymmetric — top corners only — leave as-is).

- [ ] **Step 4: Smooth theme-transition rule**

Inside the existing `@media (prefers-reduced-motion: no-preference) { ... }` block, add:
```css
  body, .entry-row, .folder-report-card, .folder-total-card, .manage-store-row,
  #login-screen, .login-card {
    transition: background-color 300ms ease, background-image 300ms ease, color 300ms ease, border-color 300ms ease, box-shadow 300ms ease;
  }
```

- [ ] **Step 5: Add `applyTheme()` to `app.js` and wire it into the same load/snapshot points as `applyTranslations()`**

```js
function applyTheme() {
  document.documentElement.dataset.theme = profileData.theme || 'light';
}
```

Add `runSetup('applyTheme', applyTheme);` to `DOMContentLoaded`, right next to `runSetup('applyTranslations', applyTranslations);`. Add `applyTheme();` to the profile `onSnapshot` handler, right next to the `applyTranslations();` call added in Task 1 Step 5.

- [ ] **Step 6: Bump the cache-busting version**

```js
const CACHE_NAME = 'expense-tracker-v18';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=10',
  './app.js?v=11',
  './firebase-config.js',
  './i18n.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];
```

Update `index.html`'s two tags to match: `<link rel="stylesheet" href="styles.css?v=10">` and `<script type="module" src="app.js?v=11"></script>`.

- [ ] **Step 7: Commit**

```bash
git add styles.css app.js index.html sw.js
git commit -m "feat: add pastel-gradient theme system with manual light/dark switch"
```

- [ ] **Step 8: Push and verify on the live site**

```bash
git push
```

After the Pages rebuild, on `https://workalx.github.io/trackfinance/`, signed in: confirm the page renders with the new gradient background and pastel borders/shadows by default (light — `profileData.theme` is `'light'` by default). Confirm `#monthly-total`, the login `<h1>`, report grand-totals, and folder-total amounts render with the gradient-text treatment (visibly a blue→violet gradient across the digits, not a flat color). In the console, run `profileData.theme = 'dark'; applyTheme();` — confirm the whole page smoothly transitions to the dark palette (not an instant snap) within ~300ms, backgrounds/borders/shadows all update, text stays readable. Run it back to `'light'` and confirm the reverse. Confirm no console errors. (Full UI toggle wiring is Task 3 — this step proves the mechanism.)

---

## Task 3: Sidebar

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `app.js`
- Modify: `sw.js`

**Interfaces:**
- Consumes: `t()`, `applyTranslations()`, `applyTheme()`, `saveProfileFields()`,
  `openManageStores()` (all pre-existing by this point).
- Produces: `openSidebar()`/`closeSidebar()`, consumed by nothing else in
  this plan (Task 4 doesn't touch the sidebar).

- [ ] **Step 1: Add the sidebar markup to `index.html`**

Add this as a new top-level element, immediately after the `</header>` closing tag and before `<main hidden>`:

```html
  <div id="sidebar-backdrop" hidden></div>
  <aside id="sidebar" hidden>
    <div class="sidebar-header">
      <h2 data-i18n="sidebarTitle">Налаштування</h2>
      <button type="button" id="sidebar-close-btn" data-i18n-aria-label="sidebarCloseAria" aria-label="Закрити меню">×</button>
    </div>

    <div class="sidebar-section">
      <p class="sidebar-section-label" data-i18n="sidebarLanguageLabel">Мова</p>
      <div class="sidebar-option-group">
        <button type="button" class="sidebar-option-btn" data-lang="uk">Українська</button>
        <button type="button" class="sidebar-option-btn" data-lang="en">English</button>
        <button type="button" class="sidebar-option-btn" data-lang="ru">Русский</button>
      </div>
    </div>

    <div class="sidebar-section">
      <p class="sidebar-section-label" data-i18n="sidebarThemeLabel">Тема</p>
      <div class="sidebar-option-group">
        <button type="button" class="sidebar-option-btn" data-theme-choice="light" data-i18n="themeLight">Світла</button>
        <button type="button" class="sidebar-option-btn" data-theme-choice="dark" data-i18n="themeDark">Темна</button>
      </div>
    </div>

    <hr class="sidebar-divider">

    <button type="button" id="sidebar-manage-stores-btn" class="link-btn" data-i18n="manageStoresLink">Керувати магазинами</button>
  </aside>
```

Note the language buttons (`Українська`/`English`/`Русский`) deliberately have **no** `data-i18n` attribute — per the spec, a language picker always shows each language's name in its own script, regardless of the currently active UI language.

Add the hamburger button to the header, before the `<h1>`:
```html
  <header class="app-header" id="app-header" hidden>
    <button type="button" id="sidebar-open-btn" data-i18n-aria-label="sidebarOpenAria" aria-label="Відкрити меню">☰</button>
    <h1 data-i18n="appTitle">Мої витрати</h1>
    <button type="button" id="sign-out-btn" class="link-btn" hidden data-i18n="signOutButton">Вийти</button>
  </header>
```

Remove the old manage-stores link from the add-screen entirely (it's now the `#sidebar-manage-stores-btn` above):
```html
      <button type="button" id="manage-stores-btn" class="link-btn" data-i18n="manageStoresLink">Керувати магазинами</button>
```
— delete this line from `#add-screen`.

Bump the script tag version: `<script type="module" src="app.js?v=12"></script>`. Bump the stylesheet version too since Step 2 below changes `styles.css`: `<link rel="stylesheet" href="styles.css?v=11">`.

- [ ] **Step 2: Add sidebar styles to `styles.css`**

```css
/* Sidebar */
#sidebar-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 1500;
  opacity: 0;
  transition: opacity 200ms ease-out;
}

#sidebar-backdrop[hidden] { display: none; }
#sidebar-backdrop.open { opacity: 1; }

#sidebar {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 85%;
  max-width: 320px;
  background: var(--surface);
  box-shadow: var(--shadow-lg);
  z-index: 1600;
  padding: 1.25rem 1.25rem calc(1.25rem + env(safe-area-inset-bottom, 0px));
  overflow-y: auto;
  transform: translateX(-100%);
  transition: transform 250ms ease-out;
}

#sidebar[hidden] { display: none; }
#sidebar.open { transform: translateX(0); }

@media (prefers-reduced-motion: reduce) {
  #sidebar-backdrop, #sidebar { transition: none; }
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.25rem;
}

.sidebar-header h2 { margin: 0; font-size: 1.1rem; }

#sidebar-close-btn {
  min-width: 2.5rem;
  min-height: 2.5rem;
  border-radius: 0.6rem;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  font-size: 1.3rem;
  cursor: pointer;
}

.sidebar-section { margin-bottom: 1.25rem; }

.sidebar-section-label {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
}

.sidebar-option-group {
  display: flex;
  gap: 0.5rem;
}

.sidebar-option-btn {
  flex: 1;
  min-height: 2.75rem;
  border-radius: 0.6rem;
  border: 1px solid var(--border);
  background: var(--surface-tint);
  color: var(--text-muted);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.sidebar-option-btn.selected {
  background: var(--gradient-accent);
  color: #fff;
  border-color: transparent;
}

.sidebar-divider {
  border: none;
  border-top: 1px solid var(--border);
  margin: 0 0 1.25rem;
}

#sidebar-open-btn {
  min-width: 2.5rem;
  min-height: 2.5rem;
  border-radius: 0.6rem;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 1.4rem;
  cursor: pointer;
}
```

Also add `#sidebar-open-btn` to the existing press/transition selector list inside `@media (prefers-reduced-motion: no-preference)`:
```css
  button, .folder-tab, .cal-day, .tab-btn, .report-mode-btn, .sidebar-option-btn {
    transition: transform 150ms ease-out, background-color 200ms ease-out, color 200ms ease-out;
  }
```
(this is the existing rule — just add `.sidebar-option-btn` to its selector list.)

- [ ] **Step 3: Wire open/close and the language/theme buttons in `app.js`**

Add a new `setupSidebar` function (place it near `setupManageStores`):

```js
function openSidebar() {
  document.getElementById('sidebar-backdrop').hidden = false;
  document.getElementById('sidebar').hidden = false;
  requestAnimationFrame(() => {
    document.getElementById('sidebar-backdrop').classList.add('open');
    document.getElementById('sidebar').classList.add('open');
  });
}

function closeSidebar() {
  document.getElementById('sidebar-backdrop').classList.remove('open');
  document.getElementById('sidebar').classList.remove('open');
  setTimeout(() => {
    document.getElementById('sidebar-backdrop').hidden = true;
    document.getElementById('sidebar').hidden = true;
  }, 250);
}

function updateSidebarSelection() {
  document.querySelectorAll('.sidebar-option-btn[data-lang]').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.lang === (profileData.language || 'en'));
  });
  document.querySelectorAll('.sidebar-option-btn[data-theme-choice]').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.themeChoice === (profileData.theme || 'light'));
  });
}

function setupSidebar() {
  document.getElementById('sidebar-open-btn').addEventListener('click', () => {
    updateSidebarSelection();
    openSidebar();
  });
  document.getElementById('sidebar-close-btn').addEventListener('click', closeSidebar);
  document.getElementById('sidebar-backdrop').addEventListener('click', closeSidebar);

  document.querySelectorAll('.sidebar-option-btn[data-lang]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const lang = btn.dataset.lang;
      profileData = { ...profileData, language: lang };
      applyTranslations();
      renderFolderTabs();
      refreshAllStoreSelects();
      render();
      if (!document.getElementById('reports-screen').hidden) renderReports();
      updateSidebarSelection();
      saveProfileFields({ language: lang });
    });
  });

  document.querySelectorAll('.sidebar-option-btn[data-theme-choice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.themeChoice;
      profileData = { ...profileData, theme };
      applyTheme();
      updateSidebarSelection();
      saveProfileFields({ theme });
    });
  });

  document.getElementById('sidebar-manage-stores-btn').addEventListener('click', () => {
    closeSidebar();
    openManageStores();
  });
}
```

Add `runSetup('setupSidebar', setupSidebar);` to the `DOMContentLoaded` handler (anywhere after `setupManageStores` is fine, order doesn't matter between these two).

Remove the old wiring for the deleted button from `setupManageStores`:
```js
function setupManageStores() {
  document.getElementById('manage-stores-back').addEventListener('click', closeManageStores);
}
```
(drop the `document.getElementById('manage-stores-btn').addEventListener('click', openManageStores);` line — that element no longer exists in `index.html`; the equivalent listener is now `#sidebar-manage-stores-btn`'s click handler inside `setupSidebar`, which calls `closeSidebar()` then `openManageStores()`.)

- [ ] **Step 4: Bump the cache-busting version**

```js
const CACHE_NAME = 'expense-tracker-v19';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=11',
  './app.js?v=12',
  './firebase-config.js',
  './i18n.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];
```

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css app.js sw.js
git commit -m "feat: add settings sidebar (language, theme, manage stores)"
```

- [ ] **Step 6: Push and verify on the live site**

```bash
git push
```

After the Pages rebuild, on `https://workalx.github.io/trackfinance/`, signed in:
- The hamburger icon appears at the top-left of the header; the old "Керувати магазинами" link is gone from the add-screen.
- Clicking it slides the sidebar in from the left with a backdrop; clicking the backdrop or the × closes it.
- The sidebar shows the current language/theme highlighted (`.selected`) correctly on open.
- Clicking a language button updates every visible string immediately (no reload) and the selection highlight moves; reload the page — the chosen language persists (confirms the real Firestore round-trip this time, not just the console-based check from Task 1).
- Clicking a theme button smoothly transitions the whole page and persists across reload.
- Clicking "Керувати магазинами" in the sidebar closes the sidebar and opens the manage-stores screen.

---

## Task 4: Add-store buttons

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `app.js`
- Modify: `sw.js`

**Interfaces:**
- Consumes: `t()`, `addStoreToFolder()`, `refreshAllStoreSelects()`,
  `renderManageStores()` (all pre-existing).

- [ ] **Step 1: Add the manage-stores screen's add-store button**

In `index.html`, inside `#manage-stores-screen`, add a button after `#manage-stores-list` (before the empty-state paragraph, so it's visible even when the list is empty — an empty folder is exactly when a user most wants to add a store):
```html
      <div id="manage-stores-list"></div>
      <button type="button" id="manage-stores-add-btn" class="link-btn" data-i18n="addStoreButtonLabel">Додати магазин</button>
      <p id="manage-stores-empty" hidden data-i18n="manageStoresEmpty">Немає магазинів у цій папці.</p>
```

In `app.js`, add the click handler inside `setupManageStores`:
```js
function setupManageStores() {
  document.getElementById('manage-stores-back').addEventListener('click', closeManageStores);
  document.getElementById('manage-stores-add-btn').addEventListener('click', () => {
    const name = prompt(t('addStorePrompt'));
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    addStoreToFolder(selectedFolder, trimmed);
    renderManageStores();
    refreshAllStoreSelects();
  });
}
```

- [ ] **Step 2: Add the add-entry row's add-store button**

In `app.js`'s `createRow()`, add a new button next to the store select in the template, and give the row a grid column for it:
```js
function createRow() {
  const row = document.createElement('div');
  row.className = 'add-row';
  row.innerHTML = `
    <select class="row-store" aria-label="${escapeHtml(t('storeSelectBlank'))}"></select>
    <button type="button" class="row-add-store" aria-label="${escapeHtml(t('addStoreButtonLabel'))}">+</button>
    <input type="number" class="row-amount" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" aria-label="${escapeHtml(t('amountAria'))}">
    <button type="button" class="row-remove" aria-label="${escapeHtml(t('rowRemoveAria'))}">×</button>
  `;

  populateStoreOptions(row.querySelector('.row-store'));

  row.querySelector('.row-add-store').addEventListener('click', () => {
    const name = prompt(t('addStorePrompt'));
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    addStoreToFolder(selectedFolder, trimmed);
    refreshAllStoreSelects();
    row.querySelector('.row-store').value = trimmed;
    updateSaveAllButtonState();
  });

  row.querySelector('.row-store').addEventListener('change', (e) => {
    if (e.target.value !== STORE_OPTION_SENTINEL) {
      updateSaveAllButtonState();
      return;
    }
    const name = prompt(t('addStorePrompt'));
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
```

In `styles.css`, update `.add-row`'s grid to fit the new button:
```css
.add-row {
  display: grid;
  grid-template-columns: 1fr 2.75rem 4.6rem 2.4rem;
  gap: 0.4rem;
  align-items: center;
  margin-bottom: 0.5rem;
}
```

Add a rule for the new button, matching `.row-remove`'s sizing but using the accent instead of danger color:
```css
.row-add-store {
  min-height: 2.75rem;
  border-radius: 0.6rem;
  border: 1px solid var(--border);
  background: var(--surface-tint);
  color: var(--accent);
  font-size: 1.2rem;
  cursor: pointer;
}
```

- [ ] **Step 3: Bump the cache-busting version**

```js
const CACHE_NAME = 'expense-tracker-v20';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=12',
  './app.js?v=13',
  './firebase-config.js',
  './i18n.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];
```

Update `index.html`'s two tags: `<link rel="stylesheet" href="styles.css?v=12">` and `<script type="module" src="app.js?v=13"></script>`.

- [ ] **Step 4: Commit**

```bash
git add index.html styles.css app.js sw.js
git commit -m "feat: add explicit add-store buttons to manage-stores and add-entry screens"
```

- [ ] **Step 5: Push and verify on the live site**

```bash
git push
```

After the Pages rebuild, on `https://workalx.github.io/trackfinance/`, signed in:
- On the manage-stores screen, the new "Додати магазин" button adds a store that appears in the list immediately (no navigating away and back needed).
- On the add-entry screen, the new "+" button next to a row's store dropdown adds a store and selects it in that row's dropdown immediately.
- The existing "+ свій" dropdown option still works exactly as before (unchanged, still present).
- Reload the page — newly added stores persist (real Firestore write, not just optimistic).
