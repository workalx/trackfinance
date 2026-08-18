# TrackFinance

A personal expense tracker PWA — add spending by folder and store, review it as monthly/yearly/period reports, and print it. Signs in with Google, syncs across every device via Firestore, and supports Ukrainian, English, and Russian with a manual light/dark theme.

**Live app:** https://workalx.github.io/trackfinance/

## Features

- **Google sign-in, synced everywhere** — mandatory sign-in, session persists on the device, all data (expenses, folders, stores, settings) syncs across devices through Firestore
- **Folders & stores** — three built-in folders (Products, Mandatory payments, Other) plus custom folders; add stores from the entry form, the manage-stores screen, or an explicit "Add store" button
- **Reports** — Month / Year / custom Period views, per-folder totals, per-store breakdown, and a print-friendly layout
- **Settings sidebar** — switch language (Українська / English / Русский) and theme (light / dark) instantly, no reload; both sync to your account
- **PWA** — installable, works offline for previously loaded data via a service worker and Firestore's local cache

## Tech stack

Vanilla JavaScript (ES modules), no build step or framework. Firebase Authentication + Firestore for auth and data. Hosted on GitHub Pages.

## Author

Built by [Alex](https://github.com/alexITworks-as).
