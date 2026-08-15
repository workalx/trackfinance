# Firebase Auth & Data Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `localStorage` with Firebase (Auth + Firestore) so the app requires Google sign-in, stays signed in on the device, and syncs entries/folders/stores/settings across every device the user signs into.

**Architecture:** Firebase modular SDK loaded via CDN ES modules (no bundler — `index.html`'s `app.js` script tag becomes `type="module"`). `firebase-config.js` initializes the Firebase app and exports `auth`/`db`. `app.js` gates all UI behind `onAuthStateChanged`, and replaces every `localStorage` read/write with Firestore `onSnapshot` subscriptions + `addDoc`/`updateDoc`/`deleteDoc`/`setDoc` calls, keeping the existing `render()`/`renderReports()`/`renderFolderTabs()` functions as the reactive re-render layer.

**Tech Stack:** Vanilla JS (ES modules), Firebase JS SDK 10.14.1 (Auth + Firestore) via `https://www.gstatic.com/firebasejs/10.14.1/...` CDN, GitHub Pages hosting, no build step, no test runner (manual browser verification, consistent with the rest of this codebase).

**Spec:** `docs/superpowers/specs/2026-08-14-firebase-auth-and-data-foundation-design.md`

## Global Constraints

- Firebase SDK version pinned to `10.14.1` everywhere it's imported.
- Firestore document paths corrected from the spec: the user's profile fields
  (`customFolders`, `storesByFolder`, `removedDefaultStores`, `language`,
  `theme`) live directly **on** the `users/{uid}` document itself — not on a
  separate `users/{uid}/profile` document (that path in the spec has an odd
  number of segments, which Firestore resolves to a *collection*, not a
  document, so it can't hold fields directly). Entries remain a subcollection
  at `users/{uid}/entries/{entryId}`.
- Login is mandatory: no app UI is reachable while signed out.
- No migration of existing `localStorage` test data — every account starts
  empty.
- Default profile for a brand-new user: `customFolders: []`,
  `storesByFolder: {}`, `removedDefaultStores: {}`, `language: 'en'`,
  `theme: 'light'`.
- Deployed to `https://workalx.github.io/trackfinance/` (repo
  `workalx/trackfinance`, branch `main`, GitHub Pages from root). Every task
  is verified on this live URL via the connected Chrome extension after
  pushing — Firebase Auth's authorized domain is `workalx.github.io`, so this
  is the reliable place to test sign-in.
- Bump `styles.css`/`app.js` version query strings and the `sw.js`
  `CACHE_NAME` together whenever either file changes, per the existing
  pattern in this repo — otherwise the service worker serves stale files.

---

## Task 1: Firebase setup + mandatory login gate

**Files:**
- Create: `firebase-config.js`
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `app.js`
- Modify: `sw.js`

**Interfaces:**
- Produces: `firebase-config.js` exports `auth` (Firebase `Auth` instance) and
  `db` (Firestore instance), consumed by `app.js` and by Tasks 2–3.
- Produces: `app.js` module-level `let currentUser = null;`, and empty hook
  functions `startDataSubscriptions()` / `stopDataSubscriptions()` that Tasks
  2 and 3 will fill in — Task 1 defines them as empty functions because the
  login gate must call them, but they have nothing to do until entries/profile
  subscriptions exist.

- [ ] **Step 1: Create `firebase-config.js`**

```js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyDp8sqMaW7NwpMvIdEs1YcImIpBt6bRmmg",
  authDomain: "trackfinance-505602.firebaseapp.com",
  projectId: "trackfinance-505602",
  storageBucket: "trackfinance-505602.firebasestorage.app",
  messagingSenderId: "35800296881",
  appId: "1:35800296881:web:bb6ee73629c86458e1a190",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
```

- [ ] **Step 2: Add the login screen and header sign-out button to `index.html`**

Add this as the very first child of `<body>`, before `<header class="app-header">`:

```html
  <section id="login-screen">
    <div class="login-card">
      <h1>TrackFinance</h1>
      <p>Увійдіть, щоб побачити свої витрати.</p>
      <button type="button" id="google-signin-btn">Увійти через Google</button>
      <p id="login-error" class="login-error" hidden></p>
    </div>
  </section>
```

Change the existing header (currently `<header class="app-header">`) to:

```html
  <header class="app-header" id="app-header">
    <h1>Мої витрати</h1>
    <button type="button" id="sign-out-btn" class="link-btn" hidden>Вийти</button>
  </header>
```

Bump the stylesheet version and switch the app script to a module, with a
version bump:

```html
  <link rel="stylesheet" href="styles.css?v=9">
```

```html
  <script type="module" src="app.js?v=6"></script>
```

- [ ] **Step 3: Add login screen and header styles to `styles.css`**

Append at the end of the file:

```css
/* Login gate */
#login-screen {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: var(--bg);
  z-index: 2000;
}

#login-screen[hidden] { display: none; }

.login-card {
  width: 100%;
  max-width: 360px;
  text-align: center;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 1rem);
  padding: 2rem 1.5rem;
}

.login-card h1 { margin: 0 0 0.5rem; font-size: 1.5rem; }
.login-card p { color: var(--text-muted); margin: 0 0 1.5rem; }

#google-signin-btn {
  width: 100%;
  min-height: 3rem;
  font-size: 1rem;
  font-weight: 700;
  color: #fff;
  background: var(--gradient-accent);
  border: none;
  border-radius: var(--radius-lg, 0.75rem);
  cursor: pointer;
}

.login-error {
  color: var(--danger);
  font-size: 0.85rem;
  margin: 1rem 0 0;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

#app-header[hidden], main[hidden], .tab-bar[hidden] { display: none; }
```

- [ ] **Step 4: Add the auth gate to `app.js`**

At the very top of `app.js`, add the imports (above the existing
`FIXED_FOLDERS` line):

```js
import { auth } from './firebase-config.js';
import {
  onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

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
  // Filled in by Task 2 (entries) and Task 3 (profile/folders/stores).
}

function stopDataSubscriptions() {
  // Filled in by Task 2 (entries) and Task 3 (profile/folders/stores).
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
```

In the `DOMContentLoaded` handler at the bottom of `app.js`, add
`setupAuth` as the first setup call and remove the unconditional `render()`
call (rendering now happens once data subscriptions deliver a snapshot, added
in Tasks 2–3):

```js
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
```

- [ ] **Step 5: Bump the service worker cache**

In `sw.js`, bump `CACHE_NAME` and update the asset list to match the new
version strings and the new file:

```js
const CACHE_NAME = 'expense-tracker-v13';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=9',
  './app.js?v=6',
  './firebase-config.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];
```

- [ ] **Step 6: Commit**

```bash
git add firebase-config.js index.html styles.css app.js sw.js
git commit -m "feat: add Firebase setup and mandatory Google login gate"
```

- [ ] **Step 7: Push and verify on the live site**

```bash
git push
```

Wait for GitHub Pages to rebuild (poll `https://workalx.github.io/trackfinance/`
until it 200s and serves the new `index.html`), then use the connected Chrome
extension to check, on `https://workalx.github.io/trackfinance/`:
- Loading the page signed-out shows only the login card — header, main
  content, and tab bar are not present in the rendered page.
- Clicking "Увійти через Google" opens the Google account picker (already
  logged into Chrome — this is an account choice, not a password entry) and,
  after picking an account, the login card disappears and the header/tab bar
  appear (content will be empty/default until Tasks 2–3 land — that's
  expected at this point).
- Reloading the page does **not** show the login card again — the session
  persists.
- Clicking "Вийти" in the header returns to the login card.

---

## Task 2: Firestore-backed entries

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `db` from `firebase-config.js`; `currentUser` from Task 1;
  `startDataSubscriptions()` / `stopDataSubscriptions()` from Task 1.
- Produces: module-level `let entries = [];` kept in sync with
  `users/{uid}/entries`, consumed unchanged by the existing
  `render()`, `renderReports()`, `computeBreakdown()`, etc.

- [ ] **Step 1: Remove localStorage entries code and add the Firestore import**

Delete these lines near the top of `app.js`:

```js
const ENTRIES_KEY = 'expenseTracker.entries';
```

and the `loadEntries` / `saveEntries` function bodies, and the module-level
`const entries = loadEntries();`.

Add to the Firebase imports block (alongside the Task 1 auth imports):

```js
import { db } from './firebase-config.js';
import {
  collection, doc, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
```

Replace the removed `const entries = loadEntries();` with:

```js
let entries = [];
let entriesUnsub = null;
```

- [ ] **Step 2: Fill in the entries half of `startDataSubscriptions`/`stopDataSubscriptions`**

```js
function startDataSubscriptions() {
  const entriesQuery = query(collection(db, 'users', currentUser.uid, 'entries'), orderBy('createdAt'));
  entriesUnsub = onSnapshot(entriesQuery, (snapshot) => {
    entries = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
    if (!document.getElementById('reports-screen').hidden) renderReports();
  });
}

function stopDataSubscriptions() {
  if (entriesUnsub) { entriesUnsub(); entriesUnsub = null; }
  entries = [];
}
```

(Task 3 appends the profile subscription into these same two functions —
don't remove what Task 2 adds here.)

- [ ] **Step 3: Write entries to Firestore instead of the local array**

In the `save-all-btn` click handler inside `setupAddForm`, replace:

```js
    states.filter((s) => s.valid).forEach((s) => {
      entries.push({ id: makeId(), day: selectedDate.day, month: selectedDate.month, year: selectedDate.year, store: s.store, amount: s.amount, folder: selectedFolder });
    });
    saveEntries(entries);

    rowsContainer.innerHTML = '';
    rowsContainer.appendChild(createRow());
    updateSaveAllButtonState();
    selectedDate = todayDate();
    updateDateFieldLabel();
    render();
  });
```

with:

```js
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
```

Replace `deleteEntry`:

```js
function deleteEntry(id) {
  deleteDoc(doc(db, 'users', currentUser.uid, 'entries', id)).catch((err) => console.error('[entries] delete failed:', err));
}
```

Replace the end of `editEntry` (from `entry.day = newDay;` through the
closing `render();` and brace) with:

```js
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

Delete the now-unused `makeId()` function (its only caller was the entries
push above).

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: back entries with Firestore instead of localStorage"
```

- [ ] **Step 5: Push and verify on the live site**

```bash
git push
```

After the Pages rebuild, on `https://workalx.github.io/trackfinance/`,
signed in:
- Add an entry (store + amount) → it appears in "Мої витрати" immediately.
- Open the Firebase Console → Firestore Database → confirm a new document
  exists under `users/<your uid>/entries` with the right fields.
- Edit the entry (pencil icon) → change amount → Firestore document updates,
  UI reflects it.
- Delete the entry (trash icon) → Firestore document is gone, UI updates.
- Reload the page → the remaining entries are still there (loaded from
  Firestore, not localStorage).

---

## Task 3: Firestore-backed profile (folders & stores)

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `db`, `currentUser`, `startDataSubscriptions()` /
  `stopDataSubscriptions()` (Tasks 1–2), `renderFolderTabs()`,
  `refreshAllStoreSelects()`, `render()` (all pre-existing).
- Produces: module-level `let profileData = {...}` kept in sync with the
  `users/{uid}` document, consumed by `allFolders()`, `storesForFolder()`.

- [ ] **Step 1: Remove localStorage folder/store code, add profile state**

Delete these lines/functions near the top of `app.js`:

```js
const CUSTOM_FOLDERS_KEY = 'expenseTracker.customFolders';
const STORES_BY_FOLDER_KEY = 'expenseTracker.storesByFolder';
```

and the bodies of `loadCustomFolders`, `saveCustomFolders`,
`loadStoresByFolder`, `saveStoresByFolder`.

Add, near `FIXED_FOLDERS`:

```js
const FIXED_FOLDERS = ['Продукти', "Обов'язкові платежі", 'Інше'];
const DEFAULT_STORES_BY_FOLDER = { 'Продукти': ['Walmart', 'Dollarama', 'Freshco', 'Costco'] };

let profileData = { customFolders: [], storesByFolder: {}, removedDefaultStores: {}, language: 'en', theme: 'light' };
let profileUnsub = null;
```

Replace the module-level `let selectedFolder = allFolders()[0];` with:

```js
let selectedFolder = FIXED_FOLDERS[0];
```

(`allFolders()` isn't safe to call yet at module-init time since profile data
hasn't loaded from Firestore — `FIXED_FOLDERS[0]` is always a valid default.)

Add `setDoc` to the Firestore import introduced in Task 2:

```js
import {
  collection, doc, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
```

- [ ] **Step 2: Rewrite `allFolders`, `storesForFolder`, `removeStoreFromFolder`, `addStoreToFolder`**

```js
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
  saveProfileFields(updates);
}

function addStoreToFolder(folder, store) {
  const storesByFolder = { ...profileData.storesByFolder };
  storesByFolder[folder] = storesByFolder[folder] ? [...storesByFolder[folder]] : [];
  if (!storesByFolder[folder].includes(store)) {
    storesByFolder[folder].push(store);
  }
  saveProfileFields({ storesByFolder });
}
```

- [ ] **Step 3: Wire the "add folder" button to Firestore**

In `renderFolderTabs()`, replace the `addBtn` click handler:

```js
  addBtn.addEventListener('click', () => {
    const name = prompt('Назва папки:');
    const trimmed = (name || '').trim();
    if (!trimmed || allFolders().includes(trimmed)) return;
    const custom = loadCustomFolders();
    custom.push(trimmed);
    saveCustomFolders(custom);
    switchFolder(trimmed);
  });
```

with:

```js
  addBtn.addEventListener('click', () => {
    const name = prompt('Назва папки:');
    const trimmed = (name || '').trim();
    if (!trimmed || allFolders().includes(trimmed)) return;
    saveProfileFields({ customFolders: [...profileData.customFolders, trimmed] });
    switchFolder(trimmed);
  });
```

- [ ] **Step 4: Add the profile subscription**

Append the profile subscription into the functions Task 2 started (don't
remove the entries half already there):

```js
function startDataSubscriptions() {
  const entriesQuery = query(collection(db, 'users', currentUser.uid, 'entries'), orderBy('createdAt'));
  entriesUnsub = onSnapshot(entriesQuery, (snapshot) => {
    entries = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
    if (!document.getElementById('reports-screen').hidden) renderReports();
  });

  const profileRef = doc(db, 'users', currentUser.uid);
  profileUnsub = onSnapshot(profileRef, (snap) => {
    if (!snap.exists()) {
      setDoc(profileRef, {
        customFolders: [], storesByFolder: {}, removedDefaultStores: {},
        language: 'en', theme: 'light',
      }).catch((err) => console.error('[profile] init failed:', err));
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
  });
}

function stopDataSubscriptions() {
  if (entriesUnsub) { entriesUnsub(); entriesUnsub = null; }
  if (profileUnsub) { profileUnsub(); profileUnsub = null; }
  entries = [];
  profileData = { customFolders: [], storesByFolder: {}, removedDefaultStores: {}, language: 'en', theme: 'light' };
  selectedFolder = FIXED_FOLDERS[0];
}
```

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat: back folders and stores with Firestore instead of localStorage"
```

- [ ] **Step 6: Push and verify on the live site**

```bash
git push
```

After the Pages rebuild, on `https://workalx.github.io/trackfinance/`,
signed in:
- Freshly signed-in account shows exactly the 3 fixed folder tabs
  (Продукти / Обов'язкові платежі / Інше), nothing extra.
- Add a custom folder via the "+" tab → new tab appears, selecting it works.
- In the add-entry store dropdown, pick "+ свій" → add a custom store name →
  it appears in the dropdown and is selected.
- Open "Керувати магазинами" → delete a store (including one of the built-in
  Продукти defaults, e.g. Costco) → it disappears from the list and from the
  add-entry dropdown.
- Reload the page → the custom folder, custom store, and the deleted default
  store all remain exactly as left (Costco stays gone, custom entries stay).
- In Firebase Console → Firestore, confirm the `users/<uid>` document has
  `customFolders`, `storesByFolder`, `removedDefaultStores` matching what you
  just did.

---

## Task 4: Security rules + full end-to-end verification

**Files:**
- Create: `firestore.rules`

**Interfaces:**
- None — this task deploys server-side rules and does a full walkthrough;
  no application code changes.

- [ ] **Step 1: Create `firestore.rules` in the repo (version-controlled reference)**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;

      match /{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
    }
  }
}
```

This covers both the `users/{uid}` document itself (profile fields) and
everything nested under it (the `entries` subcollection), scoped to the
signed-in owner only.

- [ ] **Step 2: Publish the rules in Firebase Console (manual step)**

In the Firebase Console for the `trackfinance-505602` project: **Build →
Firestore Database → Rules** tab → replace the default rules with the exact
contents of `firestore.rules` above → **Publish**.

- [ ] **Step 3: Commit the rules file**

```bash
git add firestore.rules
git commit -m "docs: add Firestore security rules (uid-scoped read/write)"
git push
```

- [ ] **Step 4: Full end-to-end walkthrough on the live site**

Using the connected Chrome extension on `https://workalx.github.io/trackfinance/`,
sign out first (if signed in) and confirm each item from the spec's Testing
section in order:
1. Signed-out load shows only the login screen — no header, no tab bar, no
   entry list reachable via DOM inspection.
2. Sign in with Google (account picker on already-authenticated Chrome) →
   app appears.
3. Add / edit / delete an entry — each change is visible in Firebase Console
   under `users/<uid>/entries` within a couple seconds.
4. Reload the page → still signed in, no login prompt.
5. Add a custom folder and a custom store → both persist across reload and
   are visible under `users/<uid>` in Firebase Console.
6. Sign out via the header button → back to the login screen; sign back in
   with the same account → all data from steps 3–5 is still there.

- [ ] **Step 5: Confirm no regressions in Reports**

Switch to the "Звіти" tab in Month, Year, and Period modes — the
grand-total block, per-folder totals row, and per-folder breakdown row (from
the earlier reports redesign) still render correctly using the Firestore-backed
`entries` array, since `renderReports()`/`renderFolderBreakdownBlock()` were
not modified by this plan — they still just read the module-level `entries`
array and `allFolders()`, which now happen to be Firestore-backed instead of
localStorage-backed.
