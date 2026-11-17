# Tolimoto Log

Vehicle maintenance and fuel log. Installable web app (PWA), iPhone first. Version 0.4.0: local-first, with optional Google sign-in, sync to a Google Sheet and receipts on Google Drive.

## Run

    npm install
    npm run dev        # development server
    npm test           # calculation tests (schedule, fuel consumption, totals)
    npm run build      # type check + production build into dist/

`dist/` is a static site: upload it to any HTTPS host (Cloudflare Pages, GitHub Pages, Netlify).
The build uses relative paths, so it also works from a sub-folder.

## Structure

- `src/store.ts` — data model and storage (one document in IndexedDB, localStorage as fallback)
- `src/calc.ts` — odometer, schedule status, fuel consumption, totals
- `src/i18n.ts` — all texts (Russian, English) and schedule presets
- `src/Forms.tsx` — forms: vehicle, fill-up, service work, expense, schedule item, settings
- `src/Screens.tsx` — Garage, Log, Schedule, Stats
- `src/exportImport.ts` — CSV archive, JSON backup, JSON import
- `.github/workflows/deploy.yml` — every push to `main` runs the tests, builds and publishes to GitHub Pages

## Google (optional)

Set the OAuth client ID in `src/config.ts` (or `VITE_GOOGLE_CLIENT_ID` at build time). Without it the Google
section is hidden. Scope: `drive.file` — the app sees only the files it creates: a `Tolimoto Log` folder,
a `Receipts` folder inside it and a `Tolimoto Log` spreadsheet with the tabs Garage, Service log, Fuel,
Schedule and Other expenses. Sync is a three-way merge against the state after the last sync (`src/sync.ts`).

`e2e/` runs the whole Google flow against an in-memory imitation of the Google endpoints
(Playwright for Python; build with `VITE_GOOGLE_CLIENT_ID=test` and serve on port 4174 first).

## Not in this version

CSV import,
import straight from the "Таблица ТО" sheet layout, desktop table view.
