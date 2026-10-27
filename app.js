import { auth } from './firebase-config.js';
import {
  onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider, reauthenticateWithPopup, deleteUser,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { db } from './firebase-config.js';
import {
  collection, doc, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc, serverTimestamp, writeBatch, getDocs,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { translations, MONTH_NAMES, MONTH_NAMES_GENITIVE, FIXED_FOLDER_LABELS } from './i18n.js';
import { playLandingMotion, refreshLandingMotion, stopLandingMotion, isLandingMotionRunning } from './landing-motion.js';
import { openDialog, setSuggestions, setupDialog } from './dialog.js';

let currentUser = null;

function showLoginScreen() {
  showLanding();
  document.getElementById('app-header').hidden = true;
  document.querySelector('main').hidden = true;
  document.querySelector('.tab-bar').hidden = true;
  document.getElementById('sign-out-btn').hidden = true;
}

function showApp() {
  hideLanding();
  document.getElementById('app-header').hidden = false;
  document.querySelector('main').hidden = false;
  document.querySelector('.tab-bar').hidden = false;
  document.getElementById('sign-out-btn').hidden = false;
}

function startDataSubscriptions() {
  const entriesQuery = query(collection(db, 'users', currentUser.uid, 'entries'), orderBy('createdAt'));
  entriesUnsub = onSnapshot(entriesQuery, (snapshot) => {
    entries = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    entriesLoaded = true;
    render();
    renderSettingsFolders();
    addDueRecurringPayments();
    if (!document.getElementById('reports-screen').hidden) renderReports();
  }, (err) => console.error('[entries] subscription failed:', err));

  const profileRef = doc(db, 'users', currentUser.uid);
  profileUnsub = onSnapshot(profileRef, (snap) => {
    if (!snap.exists()) {
      setDoc(profileRef, {
        customFolders: [], storesByFolder: {}, removedDefaultStores: {},
        language: 'en', theme: 'light', onboardingDone: false,
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
      style: STYLES.includes(data.style) ? data.style : 'classic',
      photo: typeof data.photo === 'string' ? data.photo : '',
      currency: CURRENCIES.includes(data.currency) ? data.currency : DEFAULT_CURRENCY,
      recurring: Array.isArray(data.recurring) ? data.recurring : [],
      budgets: data.budgets && typeof data.budgets === 'object' ? data.budgets : {},
      onboardingDone: data.onboardingDone,
    };
    profileLoaded = true;
    if (!allFolders().includes(selectedFolder)) selectedFolder = FIXED_FOLDERS[0];
    applyTranslations();
    applyTheme();
    renderAccount();
    refreshCurrencyPrefixes();
    renderSettingsFolders();
    renderSettingsRecurring();
    renderFolderTabs();
    refreshAllStoreSelects();
    render();
    addDueRecurringPayments();
    if (!document.getElementById('manage-stores-screen').hidden) renderManageStores();
    if (!document.getElementById('reports-screen').hidden) renderReports();
    // Only profiles created after onboarding shipped carry `false`; older accounts skip the tour.
    if (data.onboardingDone === false) startOnboarding();
  }, (err) => console.error('[profile] subscription failed:', err));
}

function stopDataSubscriptions() {
  if (entriesUnsub) { entriesUnsub(); entriesUnsub = null; }
  if (profileUnsub) { profileUnsub(); profileUnsub = null; }
  finishOnboarding();
  entries = [];
  entriesLoaded = false;
  profileLoaded = false;
  profileData = { customFolders: [], storesByFolder: {}, removedDefaultStores: {}, language: visitorLanguage(), theme: 'light', style: 'classic' };
  selectedFolder = FIXED_FOLDERS[0];
  applyTranslations();
  applyTheme();
  render();
  renderFolderTabs();
  refreshAllStoreSelects();
  if (!document.getElementById('manage-stores-screen').hidden) closeManageStores();
  if (!document.getElementById('reports-screen').hidden) switchTab('add');
}

// Who is signed in, shown in the sidebar above the sign-out button.
// The photo is the one uploaded here, else the Google account's, else the name's first letter.
function renderAccount() {
  const block = document.getElementById('sidebar-account');
  block.hidden = !currentUser;
  if (!currentUser) return;
  const name = currentUser.displayName || currentUser.email || '';
  document.getElementById('account-name').textContent = name;
  document.getElementById('account-email').textContent = currentUser.displayName ? (currentUser.email || '') : '';
  document.getElementById('account-initial').textContent = name.trim().charAt(0).toUpperCase();

  const photoSrc = profileData.photo || currentUser.photoURL || '';
  const photo = document.getElementById('account-photo');
  if (photoSrc && photo.getAttribute('src') !== photoSrc) photo.src = photoSrc;
  photo.hidden = !photoSrc;
  document.getElementById('account-initial').hidden = Boolean(photoSrc);

  const change = document.getElementById('account-photo-change');
  change.dataset.i18n = photoSrc ? 'accountPhotoChange' : 'accountPhotoAdd';
  change.textContent = t(change.dataset.i18n);
  document.getElementById('account-photo-remove').hidden = !profileData.photo;
}

// Uploaded photos are cropped to a square and shrunk, so they fit in the profile document (Firestore caps it at 1 MB).
const PHOTO_SIZE = 256;
const PHOTO_MAX_CHARS = 200000;

async function photoToDataUrl(file) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_SIZE;
  canvas.height = PHOTO_SIZE;
  canvas.getContext('2d').drawImage(
    bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE,
  );
  bitmap.close();
  let url = canvas.toDataURL('image/jpeg', 0.85);
  if (url.length > PHOTO_MAX_CHARS) url = canvas.toDataURL('image/jpeg', 0.6);
  return url;
}

function setPhoto(photo) {
  profileData = { ...profileData, photo };
  renderAccount();
  saveProfileFields({ photo: photo || null });
}

function openPhotoDialog() {
  if (!currentUser) return;
  document.getElementById('account-photo-error').hidden = true;
  document.getElementById('photo-dialog').hidden = false;
  document.getElementById('photo-dialog-pick').focus();
}

function closePhotoDialog() {
  document.getElementById('photo-dialog').hidden = true;
  document.getElementById('photo-drop').classList.remove('dragging');
}

async function usePhotoFile(file) {
  const dialog = document.querySelector('.photo-dialog');
  const errorEl = document.getElementById('account-photo-error');
  const pickBtn = document.getElementById('photo-dialog-pick');
  errorEl.hidden = true;
  dialog.classList.add('busy');
  pickBtn.disabled = true;
  try {
    if (!file || !file.type.startsWith('image/')) throw new Error(`not an image: ${file && file.type}`);
    setPhoto(await photoToDataUrl(file));
    closePhotoDialog();
  } catch (err) {
    console.error('[account] photo failed:', err);
    errorEl.textContent = t('accountPhotoError');
    errorEl.hidden = false;
  } finally {
    dialog.classList.remove('busy');
    pickBtn.disabled = false;
  }
}

function setupAccountPhoto() {
  const input = document.getElementById('account-photo-input');
  const backdrop = document.getElementById('photo-dialog');
  const drop = document.getElementById('photo-drop');

  // A Google photo that fails to load (offline, blocked) falls back to the initial.
  document.getElementById('account-photo').addEventListener('error', (e) => {
    e.target.hidden = true;
    document.getElementById('account-initial').hidden = false;
  });

  document.getElementById('account-avatar-btn').addEventListener('click', openPhotoDialog);
  document.getElementById('account-photo-change').addEventListener('click', openPhotoDialog);
  document.getElementById('photo-dialog-close').addEventListener('click', closePhotoDialog);
  document.getElementById('photo-dialog-pick').addEventListener('click', () => input.click());
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closePhotoDialog(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !backdrop.hidden) closePhotoDialog(); });

  input.addEventListener('change', () => {
    const file = input.files[0];
    input.value = '';
    if (file) usePhotoFile(file);
  });

  // Drag and drop. Anywhere in the dialog swallows the drop, so a near miss never opens the image in the tab.
  let dragDepth = 0;
  drop.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth += 1; drop.classList.add('dragging'); });
  drop.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) drop.classList.remove('dragging'); });
  backdrop.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = drop.contains(e.target) ? 'copy' : 'none'; });
  backdrop.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    drop.classList.remove('dragging');
    if (drop.contains(e.target)) usePhotoFile(e.dataTransfer.files[0]);
  });

  document.getElementById('account-photo-remove').addEventListener('click', () => setPhoto(''));
}

function signInWithGoogle() {
  const errorEl = document.getElementById('login-error');
  errorEl.hidden = true;
  signInWithPopup(auth, new GoogleAuthProvider()).catch((err) => {
    console.error('[auth] sign-in failed:', err);
    errorEl.textContent = t('signInError');
    errorEl.hidden = false;
  });
}

// Signed-in users press "Start" on the home page: take them straight to adding expenses.
function startFromLanding() {
  hideLanding();
  switchTab('add');
}

function setupAuth() {
  document.querySelectorAll('.landing-cta').forEach((btn) => {
    btn.addEventListener('click', () => (currentUser ? startFromLanding() : signInWithGoogle()));
  });

  document.getElementById('sign-out-btn').addEventListener('click', () => {
    signOut(auth).catch((err) => console.error('[auth] sign-out failed:', err));
  });

  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    renderAccount();
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
  document.title = t('appTitle');
  updateDateFieldLabel();
  updateSidebarSelection();
  renderSettingsFolders();
  renderSettingsRecurring();
  refreshCurrencyPrefixes();
  renderLandingDemo();
  // The privacy and terms pages open in the interface language
  document.querySelectorAll('a[href^="privacy.html"], a[href^="terms.html"]').forEach((a) => {
    a.href = `${a.getAttribute('href').split('?')[0]}?lang=${lang}`;
  });
}

// Visual styles defined in themes.css; each works with both the light and the dark theme.
const STYLES = ['classic', 'bank', 'minimal', 'ledger', 'graphite', 'nordic', 'sunny'];

function applyTheme() {
  document.documentElement.dataset.theme = profileData.theme || 'light';
  document.documentElement.dataset.style = profileData.style || 'classic';
  updateSidebarSelection();
  refreshLandingMotion();
}

// Signed-out visitors have no profile yet: use the language they picked on the home page, else the browser's.
const VISITOR_LANG_KEY = 'trackfinance.visitorLanguage';

function visitorLanguage() {
  try {
    const saved = localStorage.getItem(VISITOR_LANG_KEY);
    if (translations[saved]) return saved;
  } catch (err) { /* storage blocked: fall back to the browser language */ }
  const browserLang = (navigator.language || '').slice(0, 2).toLowerCase();
  return translations[browserLang] ? browserLang : 'en';
}

function showLanding() {
  const landing = document.getElementById('landing-screen');
  const alreadyShown = !landing.hidden && isLandingMotionRunning();
  landing.hidden = false;
  updateLandingMode();
  // The page is open from the first paint; the auth check that follows must not restart its intro.
  if (alreadyShown) return;
  landing.scrollTop = 0;
  playLandingMotion({ formatAmount });
}

function hideLanding() {
  stopLandingMotion();
  document.getElementById('landing-screen').hidden = true;
}

// Signed-in users reach the home page from the sidebar, so its buttons lead back into the app.
function updateLandingMode() {
  const signedIn = Boolean(currentUser);
  document.getElementById('landing-screen').classList.toggle('signed-in', signedIn);
  document.querySelectorAll('.landing-cta').forEach((btn) => {
    const label = btn.querySelector('.landing-cta-label');
    const signInKey = btn.classList.contains('landing-nav-cta') ? 'landingNavSignIn' : 'signInButton';
    label.dataset.i18n = signedIn ? 'landingStart' : signInKey;
    label.textContent = t(label.dataset.i18n);
  });
}

// Sample receipt in the hero, dated this month so it never looks stale.
function renderLandingDemo() {
  const today = todayDate();
  document.getElementById('landing-demo-folder').textContent = folderLabel(FIXED_FOLDERS[0]);
  document.getElementById('landing-demo-month').textContent = MONTH_NAMES[profileData.language || 'en'][today.month - 1];
  const blocks = [{ day: today.day, rows: [['Costco', 86.4], ['Walmart', 23.15]] }];
  if (today.day > 2) blocks.push({ day: today.day - 2, rows: [['Freshco', 41.8]] });
  document.getElementById('landing-demo-list').innerHTML = blocks.map((block) => {
    const total = block.rows.reduce((sum, [, amount]) => sum + amount, 0);
    const rows = block.rows.map(([store, amount]) => `
      <div class="entry-row">
        <div class="entry-main"><span class="entry-store">${store}</span></div>
        <span class="entry-amount">${formatAmount(amount)}</span>
      </div>`).join('');
    return `
      <div class="day-block">
        <div class="day-block-header">
          <span>${escapeHtml(formatFullDate(block.day, today.month, today.year))}</span>
          <span class="day-block-total">${formatAmount(total)}</span>
        </div>${rows}
      </div>`;
  }).join('');

  // Folder shares for the reports tile; they add up to the receipt's monthly total.
  const shares = [[FIXED_FOLDERS[0], 744.8], [FIXED_FOLDERS[1], 398.2], [FIXED_FOLDERS[2], 141.6]];
  const grandTotal = shares.reduce((sum, [, amount]) => sum + amount, 0);
  document.getElementById('landing-demo-report').innerHTML = `
    <div class="bento-report-head"><span>${escapeHtml(MONTH_NAMES[profileData.language || 'en'][today.month - 1])} ${today.year}</span>${formatAmount(grandTotal)}</div>
    ${shares.map(([folder, amount]) => `
      <div class="bento-bar-row">
        <div class="bento-bar-label"><span>${escapeHtml(folderLabel(folder))}</span><span>${formatAmount(amount)}</span></div>
        <div class="bento-bar"><span style="width: ${Math.round((amount / grandTotal) * 100)}%"></span></div>
      </div>`).join('')}`;

  const folderChips = FIXED_FOLDERS.map((folder, i) => `<span class="bento-chip folder${i === 0 ? ' selected' : ''}">${escapeHtml(folderLabel(folder))}</span>`);
  const storeChips = ['Costco', 'Walmart', 'Freshco', 'Dollarama'].map((store) => `<span class="bento-chip">${store}</span>`);
  document.getElementById('landing-demo-chips').innerHTML = [
    ...folderChips,
    `<span class="bento-chip add">+ ${escapeHtml(t('addFolderChip'))}</span>`,
    ...storeChips,
  ].join('');

  document.getElementById('landing-demo-total').textContent = formatAmount(grandTotal);
  document.getElementById('landing-demo-total').dataset.value = String(grandTotal);
  document.getElementById('landing-ghost-total').textContent = formatAmount(grandTotal);

  // Till tapes: purchases on one band, what the app does on the other. Each set is doubled so the loop is seamless.
  const purchases = [['Costco', 86.4], ['Walmart', 23.15], ['Freshco', 41.8], ['Dollarama', 12.5], ['Costco', 154.3], ['Walmart', 9.99]]
    .map(([store, amount]) => `<span class="tape-item">${store} <strong>${formatAmount(amount)}</strong></span>`).join('');
  const abilities = ['landingFeatureReportsTitle', 'landingFeatureFoldersTitle', 'landingFactSync', 'landingFactOffline', 'landingFactFree']
    .map((key) => `<span class="tape-item">${escapeHtml(t(key))}</span>`).join('');
  document.getElementById('landing-tape-a').innerHTML = purchases + purchases;
  document.getElementById('landing-tape-b').innerHTML = abilities + abilities;
  refreshLandingMotion();
}

let profileData = { customFolders: [], storesByFolder: {}, removedDefaultStores: {}, language: visitorLanguage(), theme: 'light', style: 'classic' };
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
  if (!currentUser) return;
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

// Amounts are stored as plain numbers; the currency only changes how they are shown.
const CURRENCIES = ['UAH', 'USD', 'EUR', 'PLN', 'GBP', 'CAD'];
const DEFAULT_CURRENCY = 'USD';
const NUMBER_LOCALES = { uk: 'uk-UA', en: 'en-US', ru: 'ru-RU' };
const amountFormatters = new Map();

function amountFormatter(currency = profileData.currency || DEFAULT_CURRENCY) {
  const locale = NUMBER_LOCALES[profileData.language] || 'en-US';
  const key = `${locale}|${currency}`;
  if (!amountFormatters.has(key)) {
    amountFormatters.set(key, new Intl.NumberFormat(locale, {
      style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2, maximumFractionDigits: 2,
    }));
  }
  return amountFormatters.get(key);
}

function formatAmount(n) {
  return amountFormatter().format(n);
}

function currencySymbol(currency) {
  const part = amountFormatter(currency).formatToParts(0).find((p) => p.type === 'currency');
  return part ? part.value : currency;
}

// Amount typed by the user: accepts "12.5", "12,50" and spaces as thousands separators.
function parseAmount(raw) {
  const value = Number(String(raw).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : NaN;
}

function refreshCurrencyPrefixes() {
  const symbol = currencySymbol();
  document.querySelectorAll('.amount-prefix').forEach((el) => { el.textContent = symbol; });
}

function setCurrency(currency) {
  profileData = { ...profileData, currency };
  saveProfileFields({ currency });
  refreshCurrencyPrefixes();
  updateSidebarSelection();
  render();
  renderSettingsRecurring();
  renderSettingsBudgets();
  renderLandingDemo();
  if (!document.getElementById('reports-screen').hidden) renderReports();
}

const ICON_EDIT = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
const ICON_REPEAT = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_DELETE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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
  document.getElementById('month-name').textContent = MONTH_NAMES[profileData.language || 'en'][month - 1];
  document.getElementById('summary-folder').textContent = folderLabel(selectedFolder);

  const folderEntries = entries.filter((e) => e.folder === selectedFolder);

  const monthEntries = folderEntries.filter((e) => e.month === month && e.year === year);
  const total = monthEntries.reduce((sum, e) => sum + e.amount, 0);
  document.getElementById('monthly-total').textContent = formatAmount(total);
  const limit = folderBudget(selectedFolder);
  const meter = document.getElementById('budget-meter');
  meter.hidden = !limit;
  meter.innerHTML = limit ? budgetMeterHtml(total, limit) : '';

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
    const dayTotal = block.entries.reduce((sum, e) => sum + e.amount, 0);
    header.innerHTML = `
      <span>${escapeHtml(formatFullDate(block.day, block.month, block.year))}</span>
      <span class="day-block-total">${formatAmount(dayTotal)}</span>
    `;
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
            ${entry.recurringId ? `<span class="entry-recurring" title="${escapeHtml(t('recurringBadge'))}" aria-label="${escapeHtml(t('recurringBadge'))}">${ICON_REPEAT}</span>` : ''}
            <span class="entry-store">${escapeHtml(entry.store)}</span>
          </div>
          <span class="entry-amount">${formatAmount(entry.amount)}</span>
          <div class="entry-actions">
            <button type="button" class="edit-btn" aria-label="${escapeHtml(t('editAria'))}" title="${escapeHtml(t('editAria'))}">${ICON_EDIT}</button>
            <button type="button" class="delete-btn" aria-label="${escapeHtml(t('deleteAria'))}" title="${escapeHtml(t('deleteAria'))}">${ICON_DELETE}</button>
          </div>
          ${entry.note ? `<p class="entry-note">${escapeHtml(entry.note)}</p>` : ''}
        `;
        blockEl.appendChild(row);
      });

    list.appendChild(blockEl);
  });
}

function setupSortToggle() {
  document.getElementById('sort-toggle-btn').addEventListener('click', () => {
    listSortMode = listSortMode === 'date' ? 'order' : 'date';
    const btn = document.getElementById('sort-toggle-btn');
    btn.dataset.i18n = listSortMode === 'date' ? 'sortByDate' : 'sortByOrder';
    btn.textContent = t(btn.dataset.i18n);
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

function formatFullDate(day, month, year) {
  const lang = profileData.language || 'en';
  return `${day} ${MONTH_NAMES_GENITIVE[lang][month - 1]} ${year}`;
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
    label.textContent = `${t('todayPrefix')}, ${formatFullDate(selectedDate.day, selectedDate.month, selectedDate.year)}`;
  } else {
    label.textContent = formatFullDate(selectedDate.day, selectedDate.month, selectedDate.year);
  }
}

function renderCalendarGrid() {
  const today = todayDate();
  document.getElementById('cal-month-label').textContent = `${MONTH_NAMES[profileData.language || 'en'][calCursor.month - 1]} ${calCursor.year}`;

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

  if ([...selectEl.options].some((o) => o.value === previousValue)) {
    selectEl.value = previousValue;
  }
}

function refreshAllStoreSelects() {
  document.querySelectorAll('.row-store').forEach(populateStoreOptions);
}

// Fills in "{name}"-style placeholders in a translated string.
function tf(key, vars) {
  return t(key).replace(/\{(\w+)\}/g, (_, name) => (name in vars ? vars[name] : `{${name}}`));
}

// One-field dialog for a name; resolves with the trimmed name, or null when cancelled.
async function askName({ title, label, value = '', placeholder, confirmLabel, validate }) {
  const result = await openDialog({
    title,
    fields: [{ name: 'name', label, value, placeholder, maxlength: 40 }],
    confirmLabel: confirmLabel || t('dialogSave'),
    cancelLabel: t('dialogCancel'),
    validate: ({ name }) => {
      const trimmed = name.trim();
      if (!trimmed) return t('dialogNameRequired');
      return validate ? validate(trimmed) : '';
    },
  });
  return result ? result.name.trim() : null;
}

async function askConfirm({ title, message, confirmLabel, danger = false }) {
  const result = await openDialog({ title, message, confirmLabel, cancelLabel: t('dialogCancel'), danger });
  return Boolean(result);
}

const sameName = (a, b) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

// A name clashes with a folder by its stored name or by its translated label.
function folderNameTaken(name, except) {
  return allFolders().some((f) => f !== except && (sameName(f, name) || sameName(folderLabel(f), name)));
}

async function promptNewStore(folder) {
  return askName({
    title: t('addStoreTitle'),
    label: t('storeNameLabel'),
    placeholder: t('storeNamePlaceholder'),
    confirmLabel: t('dialogAdd'),
    validate: (name) => (storesForFolder(folder).some((st) => sameName(st, name)) ? t('storeExists') : ''),
  });
}

async function createFolder() {
  const name = await askName({
    title: t('addFolderTitle'),
    label: t('folderNameLabel'),
    placeholder: t('folderNamePlaceholder'),
    confirmLabel: t('dialogAdd'),
    validate: (value) => (folderNameTaken(value) ? t('folderExists') : ''),
  });
  if (!name) return null;
  const customFolders = [...profileData.customFolders, name];
  profileData = { ...profileData, customFolders };
  saveProfileFields({ customFolders });
  renderSettingsFolders();
  return name;
}

function renderFolderTabs() {
  const container = document.getElementById('folder-tabs');
  container.innerHTML = '';

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
  addBtn.textContent = `+ ${t('addFolderChip')}`;
  addBtn.addEventListener('click', async () => {
    const name = await createFolder();
    if (name) switchFolder(name);
  });
  container.appendChild(addBtn);
}

// Settings: the standard folders, then the user's own with rename and delete.
function renderSettingsFolders() {
  renderSettingsBudgets();
  const list = document.getElementById('settings-folders-list');
  if (!list) return;
  list.innerHTML = '';
  allFolders().forEach((folder) => {
    const custom = !FIXED_FOLDERS.includes(folder);
    const count = entries.filter((e) => e.folder === folder).length;
    const row = document.createElement('div');
    row.className = 'settings-folder-row';
    row.innerHTML = `
      <div class="settings-folder-text">
        <span class="settings-folder-name">${escapeHtml(folderLabel(folder))}</span>
        <span class="settings-folder-meta">${escapeHtml(tf('folderEntriesCount', { count }))}</span>
      </div>
      ${custom ? `
        <button type="button" class="icon-btn" data-folder-action="rename" aria-label="${escapeHtml(t('renameAria'))}" title="${escapeHtml(t('renameAria'))}">${ICON_EDIT}</button>
        <button type="button" class="icon-btn" data-folder-action="delete" aria-label="${escapeHtml(t('deleteFolderAria'))}" title="${escapeHtml(t('deleteFolderAria'))}">${ICON_DELETE}</button>`
        : `<span class="settings-folder-badge">${escapeHtml(t('folderStandardBadge'))}</span>`}
    `;
    row.querySelectorAll('[data-folder-action]').forEach((btn) => {
      btn.addEventListener('click', () => (btn.dataset.folderAction === 'rename' ? renameFolder(folder) : deleteFolder(folder)));
    });
    list.appendChild(row);
  });
}

// Changes the folder of many entries at once; Firestore takes at most 500 writes per batch.
async function moveEntriesToFolder(fromFolder, toFolder) {
  const ids = entries.filter((e) => e.folder === fromFolder).map((e) => e.id);
  for (let i = 0; i < ids.length; i += 450) {
    const batch = writeBatch(db);
    ids.slice(i, i + 450).forEach((id) => batch.update(doc(db, 'users', currentUser.uid, 'entries', id), { folder: toFolder }));
    await batch.commit();
  }
}

// Moves a folder's own stores to its new name, or drops them when toFolder is null.
function rekeyFolderSettings(fromFolder, toFolder) {
  const storesByFolder = { ...profileData.storesByFolder };
  const removedDefaultStores = { ...profileData.removedDefaultStores };
  const budgets = { ...(profileData.budgets || {}) };
  [storesByFolder, removedDefaultStores, budgets].forEach((map) => {
    if (toFolder && map[fromFolder] !== undefined) map[toFolder] = map[fromFolder];
    delete map[fromFolder];
  });
  return { storesByFolder, removedDefaultStores, budgets };
}

async function renameFolder(folder) {
  const name = await askName({
    title: t('renameFolderTitle'),
    label: t('folderNameLabel'),
    value: folder,
    validate: (value) => (folderNameTaken(value, folder) ? t('folderExists') : ''),
  });
  if (!name || name === folder) return;
  const updates = {
    customFolders: profileData.customFolders.map((f) => (f === folder ? name : f)),
    recurring: (profileData.recurring || []).map((r) => (r.folder === folder ? { ...r, folder: name } : r)),
    ...rekeyFolderSettings(folder, name),
  };
  profileData = { ...profileData, ...updates };
  if (selectedFolder === folder) selectedFolder = name;
  saveProfileFields(updates);
  renderFolderTabs();
  renderSettingsFolders();
  renderSettingsRecurring();
  moveEntriesToFolder(folder, name).catch((err) => console.error('[folders] rename failed:', err));
}

// Deleting a folder keeps its expenses: they move to the last standard folder ("Other").
async function deleteFolder(folder) {
  const count = entries.filter((e) => e.folder === folder).length;
  const target = FIXED_FOLDERS[FIXED_FOLDERS.length - 1];
  const ok = await askConfirm({
    title: tf('deleteFolderTitle', { name: folderLabel(folder) }),
    message: count ? tf('deleteFolderMoveMessage', { count, target: folderLabel(target) }) : t('deleteFolderEmptyMessage'),
    confirmLabel: t('deleteButton'),
    danger: true,
  });
  if (!ok) return;
  const updates = {
    customFolders: profileData.customFolders.filter((f) => f !== folder),
    recurring: (profileData.recurring || []).map((r) => (r.folder === folder ? { ...r, folder: target } : r)),
    ...rekeyFolderSettings(folder, null),
  };
  profileData = { ...profileData, ...updates };
  if (selectedFolder === folder) selectedFolder = FIXED_FOLDERS[0];
  saveProfileFields(updates);
  renderFolderTabs();
  refreshAllStoreSelects();
  render();
  renderSettingsFolders();
  renderSettingsRecurring();
  moveEntriesToFolder(folder, target).catch((err) => console.error('[folders] delete failed:', err));
}

// Recurring payments live in the profile as
//   { id, store, amount, folder, day, note, startYM: 'YYYY-MM', lastCreated: 'YYYY-MM' | null }.
// Each month's expense gets a fixed id (rec_<id>_<YYYY-MM>), so two devices adding it at once write the same entry,
// and lastCreated moves forward, so an expense the user deleted is not added again.
let entriesLoaded = false;
let profileLoaded = false;
const RECURRING_BACKFILL_MONTHS = 24;

const ymKey = (year, month) => `${year}-${pad2(month)}`;

function parseYM(key) {
  const [year, month] = key.split('-').map(Number);
  return { year, month };
}

function nextMonth({ year, month }) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

function addDueRecurringPayments() {
  if (!currentUser || !entriesLoaded || !profileLoaded) return;
  const list = profileData.recurring || [];
  if (!list.length) return;
  const today = todayDate();
  const fallbackFolder = FIXED_FOLDERS[FIXED_FOLDERS.length - 1];
  let changed = false;

  const updated = list.map((item) => {
    let cursor = item.lastCreated ? nextMonth(parseYM(item.lastCreated)) : parseYM(item.startYM);
    let lastCreated = item.lastCreated;
    for (let i = 0; i < RECURRING_BACKFILL_MONTHS; i += 1) {
      const isPast = cursor.year < today.year || (cursor.year === today.year && cursor.month < today.month);
      const isThisMonth = cursor.year === today.year && cursor.month === today.month;
      if (!isPast && !isThisMonth) break;
      const day = Math.min(item.day, daysInMonth(cursor.month, cursor.year));
      if (isThisMonth && day > today.day) break;

      const key = ymKey(cursor.year, cursor.month);
      const id = `rec_${item.id}_${key}`;
      if (!entries.some((e) => e.id === id)) {
        setDoc(doc(db, 'users', currentUser.uid, 'entries', id), {
          day, month: cursor.month, year: cursor.year,
          store: item.store, amount: item.amount,
          folder: allFolders().includes(item.folder) ? item.folder : fallbackFolder,
          ...(item.note ? { note: item.note } : {}),
          recurringId: item.id,
          createdAt: serverTimestamp(),
        }).catch((err) => console.error('[recurring] add failed:', err));
      }
      lastCreated = key;
      cursor = nextMonth(cursor);
    }
    if (lastCreated === item.lastCreated) return item;
    changed = true;
    return { ...item, lastCreated };
  });

  if (!changed) return;
  profileData = { ...profileData, recurring: updated };
  saveProfileFields({ recurring: updated });
}

function recurringFields(item) {
  const folder = item ? item.folder : FIXED_FOLDERS[1];
  return [
    { name: 'store', label: t('recurringNameLabel'), value: item ? item.store : '', placeholder: t('recurringNamePlaceholder'), suggestions: storesForFolder(folder), maxlength: 40 },
    { name: 'amount', label: t('periodColAmount'), value: item ? item.amount.toFixed(2) : '', inputmode: 'decimal', prefix: currencySymbol(), placeholder: '0.00' },
    { name: 'folder', label: t('entryFolderLabel'), type: 'select', value: folder, options: allFolders().map((f) => ({ value: f, label: folderLabel(f) })) },
    { name: 'day', label: t('recurringDayLabel'), type: 'number', value: item ? String(item.day) : String(todayDate().day), inputmode: 'numeric', min: 1, max: 31 },
    { name: 'note', label: t('entryNoteLabel'), value: item ? item.note || '' : '', placeholder: t('notePlaceholder'), maxlength: 200 },
  ];
}

function validateRecurring(values) {
  if (!values.store.trim()) return t('dialogNameRequired');
  if (!(parseAmount(values.amount) > 0)) return t('entryAmountInvalid');
  const day = Number(values.day);
  if (!Number.isInteger(day) || day < 1 || day > 31) return t('recurringDayInvalid');
  return '';
}

async function editRecurring(item) {
  const result = await openDialog({
    title: t(item ? 'recurringEditTitle' : 'recurringAddTitle'),
    message: item ? t('recurringEditNote') : '',
    fields: recurringFields(item),
    confirmLabel: t(item ? 'dialogSave' : 'dialogAdd'),
    cancelLabel: t('dialogCancel'),
    onChange: (name, values, controls) => {
      if (name === 'folder') setSuggestions(controls.store, storesForFolder(values.folder));
    },
    validate: validateRecurring,
  });
  if (!result) return;

  const fields = {
    store: result.store.trim(),
    amount: parseAmount(result.amount),
    folder: allFolders().includes(result.folder) ? result.folder : FIXED_FOLDERS[1],
    day: Number(result.day),
    note: result.note.trim(),
  };
  const today = todayDate();
  const list = profileData.recurring || [];
  const recurring = item
    ? list.map((r) => (r.id === item.id ? { ...r, ...fields } : r))
    : [...list, { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ...fields, startYM: ymKey(today.year, today.month), lastCreated: null }];
  if (!storesForFolder(fields.folder).includes(fields.store)) addStoreToFolder(fields.folder, fields.store);
  profileData = { ...profileData, recurring };
  saveProfileFields({ recurring });
  renderSettingsRecurring();
  addDueRecurringPayments();
}

async function deleteRecurring(item) {
  const ok = await askConfirm({
    title: tf('recurringDeleteTitle', { name: item.store }),
    message: t('recurringDeleteMessage'),
    confirmLabel: t('deleteButton'),
    danger: true,
  });
  if (!ok) return;
  const recurring = (profileData.recurring || []).filter((r) => r.id !== item.id);
  profileData = { ...profileData, recurring };
  saveProfileFields({ recurring });
  renderSettingsRecurring();
}

function renderSettingsRecurring() {
  const list = document.getElementById('settings-recurring-list');
  if (!list) return;
  const items = [...(profileData.recurring || [])].sort((a, b) => a.day - b.day);
  document.getElementById('settings-recurring-empty').hidden = items.length > 0;
  list.hidden = items.length === 0;
  list.innerHTML = '';
  items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'settings-folder-row';
    row.innerHTML = `
      <span class="settings-recurring-icon" aria-hidden="true">${ICON_REPEAT}</span>
      <div class="settings-folder-text">
        <span class="settings-folder-name">${escapeHtml(item.store)}</span>
        <span class="settings-folder-meta">${escapeHtml(tf('recurringMeta', { amount: formatAmount(item.amount), day: item.day, folder: folderLabel(item.folder) }))}</span>
      </div>
      <button type="button" class="icon-btn" data-recurring-action="edit" aria-label="${escapeHtml(t('editAria'))}" title="${escapeHtml(t('editAria'))}">${ICON_EDIT}</button>
      <button type="button" class="icon-btn" data-recurring-action="delete" aria-label="${escapeHtml(t('deleteAria'))}" title="${escapeHtml(t('deleteAria'))}">${ICON_DELETE}</button>
    `;
    row.querySelector('[data-recurring-action="edit"]').addEventListener('click', () => editRecurring(item));
    row.querySelector('[data-recurring-action="delete"]').addEventListener('click', () => deleteRecurring(item));
    list.appendChild(row);
  });
}

// Monthly spending limits per folder: { [folder]: amount }. No entry means no limit.
function folderBudget(folder) {
  const value = (profileData.budgets || {})[folder];
  return value > 0 ? value : 0;
}

const BUDGET_WARN_SHARE = 0.8;
const ICON_WARN = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 4l9 16H3z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M12 10v4M12 17.2v.3" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
const ICON_OVER = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M12 7.5v5.5M12 16.2v.3" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';

function budgetStatus(spent, limit) {
  if (spent > limit) return 'over';
  if (spent >= limit * BUDGET_WARN_SHARE) return 'warn';
  return 'ok';
}

// A meter against the limit; the state is spelled out in words and an icon, never by colour alone.
function budgetMeterHtml(spent, limit) {
  const status = budgetStatus(spent, limit);
  const pct = Math.round((spent / limit) * 100);
  const vars = { spent: formatAmount(spent), limit: formatAmount(limit), left: formatAmount(Math.max(0, limit - spent)), over: formatAmount(spent - limit), pct };
  const text = { ok: tf('budgetLeft', vars), warn: tf('budgetWarn', vars), over: tf('budgetOver', vars) }[status];
  const icon = { ok: '', warn: ICON_WARN, over: ICON_OVER }[status];
  return `
    <div class="budget-meter budget-${status}">
      <div class="budget-meter-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(pct, 100)}" aria-label="${escapeHtml(t('budgetAria'))}">
        <span class="budget-meter-fill" style="width: ${Math.min(pct, 100)}%"></span>
      </div>
      <p class="budget-meter-text">${icon}<span>${escapeHtml(text)}</span></p>
    </div>`;
}

let toastTimer = 0;

function showToast(text, tone = 'info', action = null) {
  const toast = document.getElementById('toast');
  toast.className = `toast toast-${tone}`;
  toast.innerHTML = `${tone === 'over' ? ICON_OVER : tone === 'warn' ? ICON_WARN : ''}<span>${escapeHtml(text)}</span>`;
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      toast.hidden = true;
      action.onClick();
    });
    toast.appendChild(btn);
  }
  toast.hidden = false;
  clearTimeout(toastTimer);
  // Leave longer to reach an action than to read a notice
  toastTimer = setTimeout(() => { toast.hidden = true; }, action ? 7000 : 5000);
}

function notifyBudgetCrossing(folder, date, added) {
  const limit = folderBudget(folder);
  if (!limit || !added) return;
  const before = entries
    .filter((e) => e.folder === folder && e.month === date.month && e.year === date.year)
    .reduce((sum, e) => sum + e.amount, 0);
  const after = before + added;
  const vars = { folder: folderLabel(folder), over: formatAmount(after - limit), left: formatAmount(Math.max(0, limit - after)) };
  if (before <= limit && after > limit) showToast(tf('budgetToastOver', vars), 'over');
  else if (before < limit * BUDGET_WARN_SHARE && after >= limit * BUDGET_WARN_SHARE) showToast(tf('budgetToastWarn', vars), 'warn');
}

function renderSettingsBudgets() {
  const list = document.getElementById('settings-budgets-list');
  if (!list) return;
  list.innerHTML = '';
  allFolders().forEach((folder) => {
    const limit = folderBudget(folder);
    const row = document.createElement('div');
    row.className = 'settings-folder-row';
    row.innerHTML = `
      <span class="share-swatch" style="background: ${folderColor(folder)}" aria-hidden="true"></span>
      <div class="settings-folder-text">
        <span class="settings-folder-name">${escapeHtml(folderLabel(folder))}</span>
        <span class="settings-folder-meta">${escapeHtml(limit ? tf('budgetPerMonth', { limit: formatAmount(limit) }) : t('budgetNoLimit'))}</span>
      </div>
      <button type="button" class="icon-btn" aria-label="${escapeHtml(t('budgetEditAria'))}" title="${escapeHtml(t('budgetEditAria'))}">${ICON_EDIT}</button>
    `;
    row.querySelector('button').addEventListener('click', () => editBudget(folder));
    list.appendChild(row);
  });
}

async function editBudget(folder) {
  const limit = folderBudget(folder);
  const result = await openDialog({
    title: tf('budgetDialogTitle', { folder: folderLabel(folder) }),
    message: t('budgetDialogHint'),
    fields: [{ name: 'amount', label: t('budgetLimitLabel'), value: limit ? limit.toFixed(2) : '', inputmode: 'decimal', prefix: currencySymbol(), placeholder: t('budgetNoLimit') }],
    confirmLabel: t('dialogSave'),
    cancelLabel: t('dialogCancel'),
    validate: ({ amount }) => (!amount.trim() || parseAmount(amount) > 0 ? '' : t('entryAmountInvalid')),
  });
  if (!result) return;
  const budgets = { ...(profileData.budgets || {}) };
  if (result.amount.trim()) budgets[folder] = parseAmount(result.amount);
  else delete budgets[folder];
  profileData = { ...profileData, budgets };
  saveProfileFields({ budgets });
  renderSettingsBudgets();
  render();
  if (!document.getElementById('reports-screen').hidden) renderReports();
}

// Charts. A folder keeps its colour everywhere (chart, legend, budget list), set by its place in the folder list;
// past eight folders the rest share a neutral grey.
const SERIES_COUNT = 8;

function folderColor(folder) {
  const i = allFolders().indexOf(folder);
  return i >= 0 && i < SERIES_COUNT ? `var(--series-${i + 1})` : 'var(--series-other)';
}

function sumBy(list, keyFn) {
  const totals = new Map();
  list.forEach((e) => totals.set(keyFn(e), (totals.get(keyFn(e)) || 0) + e.amount));
  return totals;
}

// Part to whole: one stacked bar of folder shares, with a legend that names every amount.
function shareChartHtml(list) {
  const totals = sumBy(list, (e) => e.folder);
  const grand = [...totals.values()].reduce((a, b) => a + b, 0);
  if (!grand) return '';
  const parts = allFolders()
    .map((folder) => ({ folder, amount: totals.get(folder) || 0 }))
    .filter((part) => part.amount > 0);
  const pct = (amount) => Math.round((amount / grand) * 100);
  const label = (part) => `${folderLabel(part.folder)}: ${formatAmount(part.amount)} (${pct(part.amount)}%)`;
  return `
    <section class="report-chart">
      <h3 class="report-chart-title">${escapeHtml(t('chartShareTitle'))}</h3>
      <div class="share-bar" role="img" aria-label="${escapeHtml(parts.map(label).join('; '))}">
        ${parts.map((part) => `<span data-tip="${escapeHtml(label(part))}" style="flex-grow: ${part.amount}; background: ${folderColor(part.folder)}"></span>`).join('')}
      </div>
      <ul class="share-legend">
        ${parts.map((part) => `
          <li>
            <span class="share-swatch" style="background: ${folderColor(part.folder)}" aria-hidden="true"></span>
            <span class="share-legend-name">${escapeHtml(folderLabel(part.folder))}</span>
            <span class="share-legend-value">${formatAmount(part.amount)}, ${pct(part.amount)}%</span>
          </li>`).join('')}
      </ul>
    </section>`;
}

// Change over time: spending per day of the month, or per month of the year, in one accent colour.
function trendChartHtml(list, mode, period) {
  const lang = profileData.language || 'en';
  const buckets = mode === 'month'
    ? Array.from({ length: daysInMonth(period.month, period.year) }, (_, i) => i + 1)
    : Array.from({ length: 12 }, (_, i) => i + 1);
  const totals = sumBy(list, (e) => (mode === 'month' ? e.day : e.month));
  const values = buckets.map((b) => totals.get(b) || 0);
  const max = Math.max(...values);
  if (!max) return '';

  const name = (b) => (mode === 'month'
    ? formatFullDate(b, period.month, period.year)
    : `${MONTH_NAMES[lang][b - 1]} ${period.year}`);
  const tick = (b) => {
    if (mode === 'year') return MONTH_NAMES[lang][b - 1].slice(0, 3);
    const last = buckets.length;
    return b === 1 || (b % 5 === 0 && last - b >= 3) || b === last ? String(b) : '';
  };
  const peak = buckets[values.indexOf(max)];
  return `
    <section class="report-chart">
      <h3 class="report-chart-title">${escapeHtml(t(mode === 'month' ? 'chartDaysTitle' : 'chartMonthsTitle'))}</h3>
      <p class="trend-max">${escapeHtml(tf('chartPeak', { label: name(peak), amount: formatAmount(max) }))}</p>
      <div class="trend-plot" role="img" aria-label="${escapeHtml(tf('chartPeak', { label: name(peak), amount: formatAmount(max) }))}">
        ${buckets.map((b, i) => `<div class="trend-col"${values[i] ? ` data-tip="${escapeHtml(`${name(b)}: ${formatAmount(values[i])}`)}"` : ''}><span class="trend-bar" style="height: ${(values[i] / max) * 100}%"></span></div>`).join('')}
      </div>
      <div class="trend-axis" aria-hidden="true">${buckets.map((b) => `<span>${tick(b)}</span>`).join('')}</div>
    </section>`;
}

const ICON_UP = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_DOWN = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// "+12% vs previous month"; nothing when there is no previous spending to compare with.
function deltaHtml(current, previous, mode) {
  if (!(previous > 0)) return '';
  const pct = Math.round(((current - previous) / previous) * 100);
  const value = `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)}%`;
  return `<small class="report-delta" title="${escapeHtml(tf('reportDeltaPrevious', { amount: formatAmount(previous) }))}">${pct >= 0 ? ICON_UP : ICON_DOWN}${escapeHtml(tf(mode === 'month' ? 'reportDeltaMonth' : 'reportDeltaYear', { value }))}</small>`;
}

function grandTotalHtml(total, delta = '') {
  return `<div class="report-grand-total"><span class="report-total-label">${escapeHtml(t('reportTotalLabel'))}</span><div class="report-total-side"><span class="gradient-text">${formatAmount(total)}</span>${delta}</div></div>`;
}

// ---------- My data: everything the user owns, as one file, or gone for good
function exportAllData() {
  if (!currentUser) return;
  const stamp = (value) => (value && typeof value.toDate === 'function' ? value.toDate().toISOString() : value ?? null);
  const data = {
    app: 'TrackFinance',
    exportedAt: new Date().toISOString(),
    account: { name: currentUser.displayName || '', email: currentUser.email || '' },
    profile: profileData,
    entries: entries.map((e) => ({ ...e, createdAt: stamp(e.createdAt) })),
  };
  const today = todayDate();
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `trackfinance-data-${today.year}-${pad2(today.month)}-${pad2(today.day)}.json`);
}

async function deleteAccount() {
  if (!currentUser) return;
  const word = t('deleteAccountWord');
  const confirmed = await openDialog({
    title: t('deleteAccountTitle'),
    message: t('deleteAccountMessage'),
    fields: [{ name: 'confirm', label: tf('deleteAccountTypeLabel', { word }), placeholder: word }],
    confirmLabel: t('deleteAccountConfirm'),
    cancelLabel: t('dialogCancel'),
    danger: true,
    validate: ({ confirm }) => (confirm.trim().toLocaleUpperCase() === word ? '' : tf('deleteAccountTypeError', { word })),
  });
  if (!confirmed) return;

  const user = currentUser;
  try {
    // Google asks to confirm first, so a stale sign-in can't stop the account deletion after the data is already gone.
    await reauthenticateWithPopup(user, new GoogleAuthProvider());
  } catch (err) {
    console.error('[account] re-auth failed:', err);
    showToast(t(/popup-closed|cancelled-popup/.test(err.code || '') ? 'deleteAccountCancelled' : 'deleteAccountFailed'), 'warn');
    return;
  }

  showToast(t('deleteAccountWorking'));
  // Stop listening first, so nothing (recurring payments included) writes again while the data is removed.
  if (entriesUnsub) { entriesUnsub(); entriesUnsub = null; }
  if (profileUnsub) { profileUnsub(); profileUnsub = null; }
  try {
    const snapshot = await getDocs(collection(db, 'users', user.uid, 'entries'));
    for (let i = 0; i < snapshot.docs.length; i += 450) {
      const batch = writeBatch(db);
      snapshot.docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    await deleteDoc(doc(db, 'users', user.uid));
    await deleteUser(user);
    showToast(t('deleteAccountDone'));
  } catch (err) {
    console.error('[account] delete failed:', err);
    showToast(t('deleteAccountFailed'), 'over');
    if (auth.currentUser) startDataSubscriptions();
  }
}

// ---------- Install as an app (PWA)
let installPromptEvent = null;

const isStandaloneApp = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isAppleMobile = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function renderInstallCard() {
  const btn = document.getElementById('settings-install-btn');
  const note = document.getElementById('settings-install-note');
  if (!btn) return;
  let key = 'installUnavailable';
  if (isStandaloneApp()) key = 'installAlready';
  else if (installPromptEvent) key = 'installHint';
  else if (isAppleMobile()) key = 'installIosSteps';
  btn.hidden = !installPromptEvent || isStandaloneApp();
  note.dataset.i18n = key;
  note.textContent = t(key);
}

async function installApp() {
  if (!installPromptEvent) return;
  const promptEvent = installPromptEvent;
  installPromptEvent = null;
  promptEvent.prompt();
  await promptEvent.userChoice.catch(() => null);
  renderInstallCard();
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPromptEvent = e;
  renderInstallCard();
});

window.addEventListener('appinstalled', () => {
  installPromptEvent = null;
  renderInstallCard();
  showToast(t('installDone'));
});

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
      <button type="button" aria-label="${escapeHtml(t('deleteStoreAria'))}" title="${escapeHtml(t('deleteStoreAria'))}">${ICON_DELETE}</button>
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
  document.getElementById('manage-stores-back').addEventListener('click', closeManageStores);
  document.getElementById('manage-stores-add-btn').addEventListener('click', async () => {
    const trimmed = await promptNewStore(selectedFolder);
    if (!trimmed) return;
    addStoreToFolder(selectedFolder, trimmed);
    renderManageStores();
    refreshAllStoreSelects();
  });
}

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
  document.querySelectorAll('.sidebar-option-btn[data-lang], .landing-lang-btn').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.lang === (profileData.language || 'en'));
  });
  document.querySelectorAll('.sidebar-option-btn[data-theme-choice]').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.themeChoice === (profileData.theme || 'light'));
  });
  document.querySelectorAll('[data-currency-choice]').forEach((btn) => {
    const selected = btn.dataset.currencyChoice === (profileData.currency || DEFAULT_CURRENCY);
    btn.classList.toggle('selected', selected);
    btn.setAttribute('aria-pressed', String(selected));
  });
  document.querySelectorAll('.style-card[data-style-choice]').forEach((btn) => {
    const selected = btn.dataset.styleChoice === (profileData.style || 'classic');
    btn.classList.toggle('selected', selected);
    btn.setAttribute('aria-pressed', String(selected));
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
    btn.addEventListener('click', () => setLanguage(btn.dataset.lang));
  });

  document.querySelectorAll('.landing-lang-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      setLanguage(btn.dataset.lang);
      if (currentUser) return;
      try { localStorage.setItem(VISITOR_LANG_KEY, btn.dataset.lang); } catch (err) { /* storage blocked: choice lasts for this visit */ }
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

  document.querySelectorAll('.style-card[data-style-choice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const style = btn.dataset.styleChoice;
      profileData = { ...profileData, style };
      applyTheme();
      saveProfileFields({ style });
    });
  });

  document.getElementById('settings-manage-stores-btn').addEventListener('click', () => {
    switchTab('add');
    openManageStores();
  });

  document.getElementById('settings-tour-btn').addEventListener('click', startOnboarding);

  document.querySelectorAll('[data-currency-choice]').forEach((btn) => {
    btn.addEventListener('click', () => setCurrency(btn.dataset.currencyChoice));
  });

  document.getElementById('settings-add-folder').addEventListener('click', createFolder);
  document.getElementById('settings-export-all').addEventListener('click', exportAllData);
  document.getElementById('settings-delete-account').addEventListener('click', deleteAccount);
  document.getElementById('settings-install-btn').addEventListener('click', installApp);
  document.getElementById('settings-add-recurring').addEventListener('click', () => editRecurring(null));
}

function setLanguage(lang) {
  profileData = { ...profileData, language: lang };
  applyTranslations();
  renderFolderTabs();
  refreshAllStoreSelects();
  render();
  if (!document.getElementById('reports-screen').hidden) renderReports();
  updateSidebarSelection();
  saveProfileFields({ language: lang });
}

// Onboarding: an English language picker, then a spotlight tour over the add screen.
const TOUR_STEPS = [
  { targets: ['#folder-tabs'], key: 'tourFolders' },
  { targets: ['.month-summary'], key: 'tourTotal' },
  { targets: ['#date-field-btn'], key: 'tourDate' },
  { targets: ['#add-rows .add-row'], key: 'tourRow' },
  { targets: ['.add-actions'], key: 'tourSave' },
  { targets: ['.list-header'], key: 'tourList' },
  { targets: ['#tab-reports'], key: 'tourReports' },
  { targets: ['#tab-settings'], key: 'tourMenu' },
  { targets: [], key: 'tourFinish' },
];
const TOUR_GAP = 12;
const TOUR_PAD = 6;

let onboardingActive = false;

function tourTarget(step) {
  return step.targets
    .map((selector) => document.querySelector(selector))
    .find((el) => el && el.getClientRects().length > 0) || null;
}
let tourIndex = 0;

function startOnboarding() {
  if (onboardingActive) return;
  onboardingActive = true;
  switchTab('add');
  document.getElementById('onboarding-lang').hidden = false;
  document.querySelector('.onboarding-lang-btn').focus();
}

function startTour() {
  document.getElementById('onboarding-lang').hidden = true;
  document.getElementById('tour').hidden = false;
  tourIndex = 0;
  showTourStep();
}

function finishOnboarding() {
  document.getElementById('onboarding-lang').hidden = true;
  document.getElementById('tour').hidden = true;
  if (!onboardingActive) return;
  onboardingActive = false;
  if (currentUser && profileData.onboardingDone !== true) {
    profileData = { ...profileData, onboardingDone: true };
    saveProfileFields({ onboardingDone: true });
  }
}

function showTourStep() {
  const step = TOUR_STEPS[tourIndex];
  const isLast = tourIndex === TOUR_STEPS.length - 1;
  document.getElementById('tour-progress').textContent = t('tourProgress')
    .replace('{n}', tourIndex + 1).replace('{total}', TOUR_STEPS.length);
  document.getElementById('tour-title').textContent = t(`${step.key}Title`);
  document.getElementById('tour-text').textContent = t(`${step.key}Text`);
  document.getElementById('tour-skip').textContent = t('tourSkip');
  document.getElementById('tour-skip').hidden = isLast;
  document.getElementById('tour-back').textContent = t('tourBack');
  document.getElementById('tour-back').hidden = tourIndex === 0;
  document.getElementById('tour-next').textContent = isLast ? t('tourDone') : t('tourNext');

  const target = tourTarget(step);
  if (target) target.scrollIntoView({ block: 'center' });
  positionTour();
  document.getElementById('tour-next').focus();
}

function positionTour() {
  if (document.getElementById('tour').hidden) return;
  const step = TOUR_STEPS[tourIndex];
  const spotlight = document.getElementById('tour-spotlight');
  const tooltip = document.getElementById('tour-tooltip');
  const target = tourTarget(step);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tipW = tooltip.offsetWidth;
  const tipH = tooltip.offsetHeight;

  if (!target) {
    spotlight.classList.add('no-target');
    spotlight.removeAttribute('style');
    tooltip.style.left = `${(vw - tipW) / 2}px`;
    tooltip.style.top = `${(vh - tipH) / 2}px`;
    return;
  }

  const rect = target.getBoundingClientRect();
  spotlight.classList.remove('no-target');
  spotlight.style.top = `${rect.top - TOUR_PAD}px`;
  spotlight.style.left = `${rect.left - TOUR_PAD}px`;
  spotlight.style.width = `${rect.width + TOUR_PAD * 2}px`;
  spotlight.style.height = `${rect.height + TOUR_PAD * 2}px`;

  const centered = rect.left + rect.width / 2 - tipW / 2;
  const below = rect.bottom + TOUR_PAD + TOUR_GAP;
  const above = rect.top - TOUR_PAD - TOUR_GAP - tipH;
  const beside = rect.right + TOUR_PAD + TOUR_GAP;
  let left = Math.min(Math.max(16, centered), vw - tipW - 16);
  let top;
  if (below + tipH <= vh - 16) top = below;
  else if (above >= 16) top = above;
  else if (beside + tipW <= vw - 16) {
    left = beside;
    top = Math.min(Math.max(16, rect.top), vh - tipH - 16);
  } else top = vh - tipH - 16;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function setupOnboarding() {
  document.querySelectorAll('.onboarding-lang-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      setLanguage(btn.dataset.lang);
      startTour();
    });
  });

  document.getElementById('tour-next').addEventListener('click', () => {
    if (tourIndex === TOUR_STEPS.length - 1) { finishOnboarding(); return; }
    tourIndex += 1;
    showTourStep();
  });
  document.getElementById('tour-back').addEventListener('click', () => {
    if (tourIndex === 0) return;
    tourIndex -= 1;
    showTourStep();
  });
  document.getElementById('tour-skip').addEventListener('click', finishOnboarding);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('tour').hidden) finishOnboarding();
  });
  window.addEventListener('resize', positionTour);
  window.addEventListener('scroll', positionTour, { passive: true });
}

function createRow() {
  const row = document.createElement('div');
  row.className = 'add-row';
  row.innerHTML = `
    <select class="row-store" aria-label="${escapeHtml(t('storeSelectBlank'))}"></select>
    <button type="button" class="row-add-store" aria-label="${escapeHtml(t('addStoreButtonLabel'))}" title="${escapeHtml(t('addStoreButtonLabel'))}">+</button>
    <label class="amount-field">
      <span class="amount-prefix" aria-hidden="true">${escapeHtml(currencySymbol())}</span>
      <input type="number" class="row-amount" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" aria-label="${escapeHtml(t('amountAria'))}">
    </label>
    <button type="button" class="row-remove" aria-label="${escapeHtml(t('rowRemoveAria'))}" title="${escapeHtml(t('rowRemoveAria'))}">×</button>
    <button type="button" class="row-note-toggle">${escapeHtml(t('noteAddButton'))}</button>
    <input type="text" class="row-note" maxlength="200" placeholder="${escapeHtml(t('notePlaceholder'))}" aria-label="${escapeHtml(t('entryNoteLabel'))}" hidden>
  `;

  populateStoreOptions(row.querySelector('.row-store'));

  row.querySelector('.row-add-store').addEventListener('click', async () => {
    const trimmed = await promptNewStore(selectedFolder);
    if (!trimmed) return;
    addStoreToFolder(selectedFolder, trimmed);
    refreshAllStoreSelects();
    row.querySelector('.row-store').value = trimmed;
    updateSaveAllButtonState();
  });

  row.querySelector('.row-store').addEventListener('change', async (e) => {
    if (e.target.value !== STORE_OPTION_SENTINEL) {
      updateSaveAllButtonState();
      return;
    }
    const trimmed = await promptNewStore(selectedFolder);
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

  // The note stays tucked away until asked for, so a plain expense is still one line.
  row.querySelector('.row-note-toggle').addEventListener('click', (e) => {
    e.currentTarget.hidden = true;
    const note = row.querySelector('.row-note');
    note.hidden = false;
    note.focus();
  });

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

  const note = row.querySelector('.row-note').value.trim();
  return { empty, valid, store, amount, note };
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
    notifyBudgetCrossing(selectedFolder, selectedDate, states.filter((s) => s.valid).reduce((sum, s) => sum + s.amount, 0));

    states.filter((s) => s.valid).forEach((s) => {
      addDoc(collection(db, 'users', currentUser.uid, 'entries'), {
        day: selectedDate.day, month: selectedDate.month, year: selectedDate.year,
        store: s.store, amount: s.amount, folder: selectedFolder,
        ...(s.note ? { note: s.note } : {}),
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

const TAB_TITLES = { add: 'appTitle', reports: 'tabReports', settings: 'sidebarTitle' };

function switchTab(tabName) {
  document.getElementById('manage-stores-screen').hidden = true;
  Object.keys(TAB_TITLES).forEach((name) => {
    document.getElementById(`${name}-screen`).hidden = name !== tabName;
    document.getElementById(`tab-${name}`).classList.toggle('selected', name === tabName);
  });
  const title = document.getElementById('page-title');
  title.dataset.i18n = TAB_TITLES[tabName];
  title.textContent = t(title.dataset.i18n);
}

function setupTabs() {
  document.getElementById('tab-home').addEventListener('click', showLanding);
  document.getElementById('tab-add').addEventListener('click', () => switchTab('add'));
  document.getElementById('tab-reports').addEventListener('click', () => switchTab('reports'));
  document.getElementById('tab-settings').addEventListener('click', () => switchTab('settings'));
}

function deleteEntry(id) {
  deleteDoc(doc(db, 'users', currentUser.uid, 'entries', id)).catch((err) => console.error('[entries] delete failed:', err));
}

// Puts a just-deleted expense back under its old id, with its original creation time.
function restoreEntry(entry) {
  if (!currentUser) return;
  const { id, ...data } = entry;
  // An expense deleted right after saving may not have its server timestamp yet
  if (!data.createdAt) data.createdAt = serverTimestamp();
  setDoc(doc(db, 'users', currentUser.uid, 'entries', id), data).catch((err) => console.error('[entries] restore failed:', err));
}

const pad2 = (n) => String(n).padStart(2, '0');

// Edit every field of an entry in one form: date, folder, store and amount.
async function editEntry(id) {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;

  const result = await openDialog({
    title: t('editEntryTitle'),
    fields: [
      { name: 'date', label: t('dateLabel'), type: 'date', value: `${entry.year}-${pad2(entry.month)}-${pad2(entry.day)}` },
      { name: 'folder', label: t('entryFolderLabel'), type: 'select', value: entry.folder, options: allFolders().map((f) => ({ value: f, label: folderLabel(f) })) },
      { name: 'store', label: t('periodColStore'), value: entry.store, suggestions: storesForFolder(entry.folder), maxlength: 40 },
      { name: 'amount', label: t('periodColAmount'), value: entry.amount.toFixed(2), inputmode: 'decimal', prefix: currencySymbol() },
      { name: 'note', label: t('entryNoteLabel'), value: entry.note || '', placeholder: t('notePlaceholder'), maxlength: 200 },
    ],
    confirmLabel: t('dialogSave'),
    cancelLabel: t('dialogCancel'),
    onChange: (name, values, controls) => {
      if (name === 'folder') setSuggestions(controls.store, storesForFolder(values.folder));
    },
    validate: (values) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date)) return t('entryDateInvalid');
      if (!values.store.trim()) return t('editStoreEmptyError');
      if (!(parseAmount(values.amount) > 0)) return t('entryAmountInvalid');
      return '';
    },
  });
  if (!result) return;

  const [year, month, day] = result.date.split('-').map(Number);
  const store = result.store.trim();
  const folder = allFolders().includes(result.folder) ? result.folder : entry.folder;
  if (!storesForFolder(folder).includes(store)) {
    addStoreToFolder(folder, store);
    refreshAllStoreSelects();
  }

  updateDoc(doc(db, 'users', currentUser.uid, 'entries', id), {
    day, month, year, store, folder, amount: parseAmount(result.amount), note: result.note.trim(),
  }).catch((err) => console.error('[entries] update failed:', err));
}

document.getElementById('entries-list').addEventListener('click', (e) => {
  const row = e.target.closest('.entry-row');
  if (!row) return;
  const id = row.dataset.id;

  if (e.target.closest('.delete-btn')) {
    const entry = entries.find((en) => en.id === id);
    if (!entry) return;
    deleteEntry(id);
    showToast(t('entryDeleted'), 'info', { label: t('undo'), onClick: () => restoreEntry(entry) });
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

function renderFolderBreakdownBlock(container, listForTotals, showBudgets = false) {
  const grandTotal = listForTotals.reduce((sum, e) => sum + e.amount, 0);
  const cards = document.createElement('div');
  cards.className = 'folder-cards';

  allFolders().forEach((folder) => {
    const folderEntries = computeFolderEntries(listForTotals, folder);
    const folderTotal = folderEntries.reduce((sum, e) => sum + e.amount, 0);
    const share = grandTotal > 0 ? Math.round((folderTotal / grandTotal) * 100) : 0;
    const breakdown = computeBreakdown(folderEntries);

    // A table so the folder name and total repeat on every printed page the list continues onto.
    const card = document.createElement('div');
    card.className = 'folder-report-card';
    card.innerHTML = `
      <table class="folder-report-table">
        <thead>
          <tr>
            <th class="folder-report-name"><span class="share-swatch" style="background: ${folderColor(folder)}" aria-hidden="true"></span>${escapeHtml(folderLabel(folder))}</th>
            <th class="folder-report-total">${formatAmount(folderTotal)}</th>
          </tr>
        </thead>
        <tbody>
          <tr class="folder-share-row">
            <td colspan="2">
              <div class="folder-share">
                <div class="folder-share-bar"><span style="width: ${share}%"></span></div>
                <span>${share}%</span>
              </div>
            </td>
          </tr>
          ${showBudgets && folderBudget(folder) ? `<tr class="folder-budget-row"><td colspan="2">${budgetMeterHtml(folderTotal, folderBudget(folder))}</td></tr>` : ''}
          ${
            breakdown.length === 0
              ? `<tr class="report-line muted"><td colspan="2">${escapeHtml(t('reportNoData'))}</td></tr>`
              : breakdown.map((b) => `<tr class="report-line"><td>${escapeHtml(b.store)}</td><td>${formatAmount(b.amount)}</td></tr>`).join('')
          }
        </tbody>
      </table>
    `;
    cards.appendChild(card);
  });

  container.appendChild(cards);
}

function renderMonthOrYearReport() {
  const list = reportMode === 'month'
    ? computePeriodEntries(reportCursor.month, reportCursor.year)
    : computeYearEntries(reportYearCursor);

  document.getElementById('report-period-label').textContent = reportMode === 'month'
    ? `${MONTH_NAMES[profileData.language || 'en'][reportCursor.month - 1]} ${reportCursor.year}`
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
  const prevMonth = addMonths(reportCursor.month, reportCursor.year, -1);
  const previousList = reportMode === 'month'
    ? computePeriodEntries(prevMonth.month, prevMonth.year)
    : computeYearEntries(reportYearCursor - 1);
  const previous = previousList.reduce((sum, e) => sum + e.amount, 0);
  const period = reportMode === 'month' ? reportCursor : { year: reportYearCursor };

  const content = document.getElementById('report-content');
  content.innerHTML = grandTotalHtml(total, deltaHtml(total, previous, reportMode))
    + shareChartHtml(list)
    + trendChartHtml(list, reportMode, period);

  renderFolderBreakdownBlock(content, list, reportMode === 'month');
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
  document.getElementById('report-filters').hidden = reportMode !== 'period';

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
  document.getElementById('period-from-btn').textContent = formatFullDate(periodFrom.day, periodFrom.month, periodFrom.year);
  document.getElementById('period-to-btn').textContent = formatFullDate(periodTo.day, periodTo.month, periodTo.year);
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

  renderFilterFolderOptions();
  const matches = periodMatches().sort((a, b) => dateValue(b) - dateValue(a));
  const filtering = filtersActive();
  document.getElementById('filter-reset').hidden = !filtering;

  const content = document.getElementById('report-content');
  const total = matches.reduce((sum, e) => sum + e.amount, 0);

  if (matches.length === 0) {
    content.innerHTML = `${grandTotalHtml(total)}<p class="report-empty">${escapeHtml(t(filtering ? 'reportNoMatches' : 'reportNoDataPeriod'))}</p>`;
    return;
  }

  const lang = profileData.language || 'en';
  const rows = matches.map((e) => `
    <tr>
      <td>${e.day} ${MONTH_NAMES[lang][e.month - 1]} ${e.year}</td>
      <td>${escapeHtml(folderLabel(e.folder))}</td>
      <td>${escapeHtml(e.store)}${e.note ? `<span class="period-note">${escapeHtml(e.note)}</span>` : ''}</td>
      <td>${formatAmount(e.amount)}</td>
    </tr>
  `).join('');

  // A real <thead> is repeated by the browser on every printed page of a long table.
  content.innerHTML = `
    ${grandTotalHtml(total)}
    <p class="report-count">${escapeHtml(tf('reportFound', { count: matches.length }))}</p>
    ${shareChartHtml(matches)}
    <table class="period-table">
      <thead>
        <tr>
          <th>${escapeHtml(t('periodColDate'))}</th><th>${escapeHtml(t('periodColFolder'))}</th><th>${escapeHtml(t('periodColStore'))}</th><th>${escapeHtml(t('periodColAmount'))}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function setupPrint() {
  document.getElementById('print-btn').addEventListener('click', () => window.print());
  setupExport();
}

// ---------- Search and filters (Period view)
const reportFilters = { query: '', folder: '', min: '', max: '' };

function filtersActive() {
  return Boolean(reportFilters.query.trim() || reportFilters.folder || reportFilters.min.trim() || reportFilters.max.trim());
}

function entryMatchesFilters(e) {
  const query = reportFilters.query.trim().toLocaleLowerCase();
  if (query && !`${e.store} ${e.note || ''}`.toLocaleLowerCase().includes(query)) return false;
  if (reportFilters.folder && e.folder !== reportFilters.folder) return false;
  const min = parseAmount(reportFilters.min);
  const max = parseAmount(reportFilters.max);
  if (reportFilters.min.trim() && Number.isFinite(min) && e.amount < min) return false;
  if (reportFilters.max.trim() && Number.isFinite(max) && e.amount > max) return false;
  return true;
}

function periodMatches() {
  const from = dateValue(periodFrom);
  const to = dateValue(periodTo);
  return entries.filter((e) => { const v = dateValue(e); return v >= from && v <= to && entryMatchesFilters(e); });
}

function renderFilterFolderOptions() {
  const select = document.getElementById('filter-folder');
  const current = reportFilters.folder;
  select.innerHTML = [`<option value="">${escapeHtml(t('filterAllFolders'))}</option>`]
    .concat(allFolders().map((f) => `<option value="${escapeHtml(f)}">${escapeHtml(folderLabel(f))}</option>`))
    .join('');
  select.value = allFolders().includes(current) ? current : '';
  if (select.value !== current) reportFilters.folder = select.value;
}

// The whole history: from the earliest entry up to today.
function setPeriodAllTime() {
  const earliest = entries.reduce((min, e) => (min && dateValue(min) <= dateValue(e) ? min : e), null);
  periodFrom = earliest ? { day: earliest.day, month: earliest.month, year: earliest.year } : todayDate();
  periodTo = todayDate();
}

function setReportMode(mode) {
  reportMode = mode;
  document.querySelectorAll('.report-mode-btn').forEach((b) => b.classList.toggle('selected', b.dataset.mode === mode));
}

function setupFilters() {
  const bind = (id, key) => document.getElementById(id).addEventListener('input', (e) => {
    reportFilters[key] = e.target.value;
    renderReports();
  });
  bind('filter-query', 'query');
  bind('filter-min', 'min');
  bind('filter-max', 'max');
  document.getElementById('filter-folder').addEventListener('change', (e) => {
    reportFilters.folder = e.target.value;
    renderReports();
  });
  document.getElementById('filter-reset').addEventListener('click', () => {
    Object.assign(reportFilters, { query: '', folder: '', min: '', max: '' });
    ['filter-query', 'filter-min', 'filter-max'].forEach((id) => { document.getElementById(id).value = ''; });
    renderReports();
  });
  document.getElementById('period-all-btn').addEventListener('click', () => {
    setPeriodAllTime();
    renderReports();
  });
  // From the expense list: open the search over the whole history
  document.getElementById('list-search-btn').addEventListener('click', () => {
    switchTab('reports');
    setReportMode('period');
    setPeriodAllTime();
    renderReports();
    document.getElementById('filter-query').focus();
  });
}

// ---------- Export: what the report shows right now, as Excel, CSV or PDF
const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
let xlsxLoading = null;

function reportEntriesForExport() {
  let list;
  if (reportMode === 'month') list = computePeriodEntries(reportCursor.month, reportCursor.year);
  else if (reportMode === 'year') list = computeYearEntries(reportYearCursor);
  else list = periodMatches();
  return [...list].sort((a, b) => dateValue(a) - dateValue(b) || a.store.localeCompare(b.store));
}

function exportFileStem() {
  if (reportMode === 'month') return `trackfinance-${ymKey(reportCursor.year, reportCursor.month)}`;
  if (reportMode === 'year') return `trackfinance-${reportYearCursor}`;
  const iso = (d) => `${d.year}-${pad2(d.month)}-${pad2(d.day)}`;
  return `trackfinance-${iso(periodFrom)}_${iso(periodTo)}`;
}

function exportHeaders() {
  return [t('periodColDate'), t('periodColFolder'), t('periodColStore'), t('periodColAmount'), t('exportColCurrency'), t('entryNoteLabel'), t('recurringBadge')];
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(tf('exportDone', { name }));
}

// CSV the way the user's spreadsheet expects it: Ukrainian and Russian Excel read ";" with decimal commas.
function buildCsv(list) {
  const comma = profileData.language === 'en';
  const sep = comma ? ',' : ';';
  const cell = (v) => {
    const text = String(v ?? '');
    return text.includes(sep) || /["\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const amount = (n) => (comma ? n.toFixed(2) : n.toFixed(2).replace('.', ','));
  const currency = profileData.currency || DEFAULT_CURRENCY;
  const lines = [exportHeaders()].concat(list.map((e) => [
    `${e.year}-${pad2(e.month)}-${pad2(e.day)}`, folderLabel(e.folder), e.store, amount(e.amount), currency, e.note || '', e.recurringId ? t('exportYes') : '',
  ]));
  return `\ufeff${lines.map((row) => row.map(cell).join(sep)).join('\r\n')}\r\n`;
}

function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!xlsxLoading) {
    xlsxLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = XLSX_URL;
      script.onload = () => resolve(window.XLSX);
      script.onerror = () => { xlsxLoading = null; reject(new Error('xlsx failed to load')); };
      document.head.appendChild(script);
    });
  }
  return xlsxLoading;
}

// Excel's day number for a calendar date, computed in UTC so the browser's time zone can't shift the day.
function excelDateSerial(e) {
  return (Date.UTC(e.year, e.month - 1, e.day) - Date.UTC(1899, 11, 30)) / 86400000;
}

// A real workbook: dates as dates, amounts as numbers, and a total row at the bottom.
async function exportXlsx(list) {
  const XLSX = await loadXlsx();
  const currency = profileData.currency || DEFAULT_CURRENCY;
  // "/" is Excel's date separator placeholder: Ukrainian and Russian Excel show it as "."
  const dateFormat = profileData.language === 'en' ? 'yyyy-mm-dd' : 'dd/mm/yyyy';
  const rows = [exportHeaders()].concat(list.map((e) => [
    excelDateSerial(e), folderLabel(e.folder), e.store, e.amount, currency, e.note || '', e.recurringId ? t('exportYes') : '',
  ]));
  const total = list.reduce((sum, e) => sum + e.amount, 0);
  rows.push([], ['', '', t('reportTotalLabel'), total, currency]);
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  for (let r = 1; r <= list.length; r += 1) {
    const dateCell = sheet[XLSX.utils.encode_cell({ r, c: 0 })];
    if (dateCell) dateCell.z = dateFormat;
    const amountCell = sheet[XLSX.utils.encode_cell({ r, c: 3 })];
    if (amountCell) amountCell.z = '#,##0.00';
  }
  const totalCell = sheet[XLSX.utils.encode_cell({ r: list.length + 2, c: 3 })];
  if (totalCell) totalCell.z = '#,##0.00';
  sheet['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 24 }, { wch: 12 }, { wch: 9 }, { wch: 32 }, { wch: 18 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, t('tabReports').slice(0, 31));
  const data = XLSX.write(book, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${exportFileStem()}.xlsx`);
}

async function runExport(kind) {
  if (kind === 'pdf') {
    showToast(t('exportPdfHint'));
    setTimeout(() => window.print(), 400);
    return;
  }
  const list = reportEntriesForExport();
  if (!list.length) {
    showToast(t('exportEmpty'), 'warn');
    return;
  }
  if (kind === 'csv') {
    downloadBlob(new Blob([buildCsv(list)], { type: 'text/csv;charset=utf-8' }), `${exportFileStem()}.csv`);
    return;
  }
  try {
    await exportXlsx(list);
  } catch (err) {
    console.error('[export] xlsx failed:', err);
    showToast(t('exportFailed'), 'over');
  }
}

function setupExport() {
  const btn = document.getElementById('export-btn');
  const menu = document.getElementById('export-menu');
  const setOpen = (open) => {
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) menu.querySelector('button').focus();
  };
  btn.addEventListener('click', () => setOpen(menu.hidden));
  menu.querySelectorAll('[data-export]').forEach((item) => {
    item.addEventListener('click', () => {
      setOpen(false);
      runExport(item.dataset.export);
    });
  });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !e.target.closest('.export-wrap')) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) { setOpen(false); btn.focus(); }
  });
}

function runSetup(name, fn) {
  try {
    fn();
  } catch (err) {
    console.error(`[setup] ${name} failed, continuing with the rest of the app:`, err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  runSetup('applyTranslations', applyTranslations);
  runSetup('applyTheme', applyTheme);
  runSetup('showLanding', showLanding);
  runSetup('setupAuth', setupAuth);
  runSetup('setupTabs', setupTabs);
  runSetup('setupCalendar', setupCalendar);
  runSetup('setupFolderTabs', setupFolderTabs);
  runSetup('setupManageStores', setupManageStores);
  runSetup('setupDialog', setupDialog);
  runSetup('setupSidebar', setupSidebar);
  runSetup('setupAccountPhoto', setupAccountPhoto);
  runSetup('setupOnboarding', setupOnboarding);
  runSetup('setupAddForm', setupAddForm);
  runSetup('setupSortToggle', setupSortToggle);
  runSetup('setupReports', setupReports);
  runSetup('setupPrint', setupPrint);
  runSetup('setupFilters', setupFilters);
  runSetup('renderInstallCard', renderInstallCard);
});
