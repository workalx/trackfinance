# Firebase Auth & Data Foundation — Design

Sub-project 1 of 3 (login/sidebar/settings/responsive request). Establishes
mandatory Google sign-in with persistent device sessions, and migrates all
app data (entries, folders, stores, settings) from `localStorage` to
Firestore, scoped per Google account, syncing across devices.

Sub-project 2 (sidebar, language switcher, theme toggle, add-store buttons)
and sub-project 3 (responsive polish) build on top of this and are specced
separately.

## Context

- Static, buildless PWA: `index.html` + `app.js` + `styles.css`, no bundler.
- Currently all data lives in `localStorage` (`expenseTracker.entries`,
  `expenseTracker.customFolders`, `expenseTracker.storesByFolder`).
- Hosted at `https://workalx.github.io/trackfinance/` (GitHub Pages, repo
  `workalx/trackfinance`).
- Google Cloud project `trackfinance-505602` already has an OAuth
  consent screen and Web Client ID; Firebase project of the same name
  wraps that GCP project.
- User decisions from brainstorming:
  - Login is **mandatory** — app content is inaccessible until signed in.
  - Real Google Sign-In via Firebase Authentication.
  - All data (entries, folders, stores, settings) syncs across devices
    via Firestore, keyed by the signed-in Google account.
  - No migration of existing local test data — every account starts empty.

## Firebase config

```js
const firebaseConfig = {
  apiKey: "AIzaSyDp8sqMaW7NwpMvIdEs1YcImIpBt6bRmmg",
  authDomain: "trackfinance-505602.firebaseapp.com",
  projectId: "trackfinance-505602",
  storageBucket: "trackfinance-505602.firebasestorage.app",
  messagingSenderId: "35800296881",
  appId: "1:35800296881:web:bb6ee73629c86458e1a190",
};
```

Lives in a new `firebase-config.js`, committed as-is (not secret — Firestore
security rules are the actual access boundary).

## Architecture

- Firebase modular SDK loaded via CDN as native ES modules
  (`https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js`,
  `firebase-auth.js`, `firebase-firestore.js`), pinned to `10.14.1`.
  `index.html`'s script tag becomes `type="module"`.
- `firebase-config.js`: calls `initializeApp(firebaseConfig)`, exports
  `auth` (`getAuth(app)`) and `db` (`getFirestore(app)`).
- `app.js` becomes a module that imports `auth`/`db` and the specific
  Firebase functions it needs (`onAuthStateChanged`, `signInWithPopup`,
  `GoogleAuthProvider`, `signOut`, `collection`, `doc`, `onSnapshot`,
  `addDoc`, `updateDoc`, `deleteDoc`, `setDoc`, `getDoc`).

## Data model (Firestore)

```
users/{uid}/entries/{entryId}
  day: number, month: number, year: number
  folder: string, store: string, amount: number
  createdAt: serverTimestamp()          // new, for tie-break ordering

users/{uid}/profile   (single document)
  customFolders: string[]
  storesByFolder: { [folderName]: string[] }
  removedDefaultStores: { [folderName]: string[] }   // renamed from the
                                                       // old "folder:removed"
                                                       // string-key hack —
                                                       // cleaner as its own map
  language: 'uk' | 'en' | 'ru'          // default 'en', used by sub-project 2
  theme: 'light' | 'dark'               // default 'light', used by sub-project 2
```

`entryId` is Firestore's auto-generated document id, replacing the current
`makeId()` local id scheme. `removedDefaultStores` replaces the current
`map[folder + ':removed']` convention in `storesByFolder` — same purpose
(tracking which built-in default stores a user deleted), cleaner shape.

## Security rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

## Data flow

1. Page loads → `firebase-config.js` initializes the app → `app.js`
   subscribes to `onAuthStateChanged(auth, ...)`.
2. `user === null` → show `#login-screen` (full-screen, "Увійти через
   Google" button), hide `#add-screen` / `#reports-screen` / tab-bar /
   header.
3. `user` present → hide login screen, show app shell:
   - `getDoc(users/{uid}/profile)`; if it doesn't exist, `setDoc` with
     defaults (`customFolders: []`, `storesByFolder: {}`,
     `removedDefaultStores: {}`, `language: 'en'`, `theme: 'light'`).
   - Subscribe `onSnapshot(users/{uid}/entries)` → maintain the existing
     in-memory `entries` array (now sourced from snapshot docs, each
     tagged with its Firestore doc id) → call existing `render()`.
   - Subscribe `onSnapshot(users/{uid}/profile)` → maintain in-memory
     `customFolders` / `storesByFolder` / `removedDefaultStores` → call
     existing `renderFolderTabs()` etc.
4. Writes go straight to Firestore; the snapshot listener re-renders on
   confirmation (local or remote) — no manual in-memory array mutation
   after a write, Firestore is the single source of truth.
   - Add entry: `addDoc(collection(db,'users',uid,'entries'), {...})`
   - Edit entry: `updateDoc(doc(db,'users',uid,'entries',entryId), {...})`
   - Delete entry: `deleteDoc(doc(db,'users',uid,'entries',entryId))`
   - Add/remove custom folder or store: `updateDoc` (or `setDoc` with
     merge) on the `profile` doc.
5. Sign out: minimal temporary button in the app header (icon + click →
   `signOut(auth)`). Sub-project 2 relocates this into the sidebar.

## Error handling

- Sign-in popup blocked or dismissed: catch the rejected promise from
  `signInWithPopup`, show an inline error line on the login screen with
  a retry affordance.
- Offline writes: Firestore's built-in write queue and local cache handle
  this — `onSnapshot` reflects pending local writes immediately, syncs when
  back online. No custom retry/error logic needed for the common case. This
  requires persistence to be enabled (`initializeFirestore` with
  `persistentLocalCache()` in `firebase-config.js`), which also lets
  previously-loaded data survive a reload while offline instead of showing
  empty. Note the app's overall offline story is still incomplete: the
  Firebase SDK modules themselves are loaded fresh from the `gstatic.com`
  CDN on every page load and are not cached by the service worker, so the
  app cannot even boot without a network connection on first load in a
  session. Full offline support (vendoring the SDK, or adding service-worker
  runtime caching for the `gstatic.com` origin) is a known, explicitly
  out-of-scope gap.
- Unexpected Firestore errors (permission-denied, etc.): log to console;
  not expected in normal operation since rules are uid-scoped and the app
  never constructs paths outside `users/{uid}/...`.

## Removed / replaced

- `loadEntries`, `saveEntries`, `ENTRIES_KEY` → replaced by the entries
  subcollection + snapshot listener.
- `loadCustomFolders`, `saveCustomFolders`, `CUSTOM_FOLDERS_KEY` →
  replaced by `profile.customFolders`.
- `loadStoresByFolder`, `saveStoresByFolder`, `STORES_BY_FOLDER_KEY` →
  replaced by `profile.storesByFolder` / `profile.removedDefaultStores`.
- `makeId()` for entries → Firestore auto-id (may still be used elsewhere
  if any non-entry client-side ids remain; check at implementation time).

## Testing

- Manual verification through the connected Chrome extension on the live
  GitHub Pages URL:
  - Signed-out load shows the login screen, no app content reachable.
  - Clicking "Увійти через Google" (account picker on an already-authenticated
    Chrome — not a credential entry) signs in and reveals the app.
  - Adding/editing/deleting an entry updates Firestore (spot-checked in
    Firebase Console) and the UI.
  - Reload the page: session persists without re-prompting for login.
  - Adding a custom folder/store persists in `profile` and survives reload.
- No automated test suite exists in this project; this stays manual,
  consistent with prior sub-projects in this codebase.
