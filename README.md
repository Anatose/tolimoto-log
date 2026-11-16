# Tolimoto Log

Vehicle maintenance and fuel log. Installable web app (PWA), iPhone first. Version 0.1.0: local mode only.

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

## Not in this version

Google sign-in and two-way sync with Google Sheets, receipt photos on Drive, CSV import,
import straight from the "Таблица ТО" sheet layout, desktop table view.
