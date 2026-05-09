# OpenSpec Implementation Log

## Goal
Build and maintain a local GPU price tracker (Express + SQLite) with:
- automated scraping from PChome search API,
- client-side charting, filtering and aggregation, and
- deterministic seed data for testing.

## Current Status (2026-05-09)
- Backend: `server.js` implements Express endpoints and a PChome search-based scraper.
- Database: `data/prices.sqlite` with `prices(id, date, name, price)` persisted via `sqlite3`.
- Frontend: static UI in `public/` with `app.js`, `index.html`, and canvas chart rendering.
- Seed tooling: `scripts/update-prices.js` to replace/seed realistic sample rows for 2026-05-06..2026-05-08.

## Features Implemented
- API endpoints:
   - `GET /api/prices` — supports range and simple search filters.
   - `POST /api/prices` — insert a price row.
   - `DELETE /api/prices/:id` — remove a row.
   - `POST /api/scrape` — server-side scraper using PChome `ecshweb` search API; accepts tokenized queries.
- Scraper behavior:
   - Uses `ecshweb.pchome.com.tw/search/v3.3/all/results?q=` to fetch JSON product lists.
   - Pages results and filters products by tokenized keywords (server-side `parseFilterTokens`).
   - Skips scraped items whose names exceed 100 characters (not inserted).
   - Inserts today's price rows while avoiding exact-duplicate entries.
   - Uses stricter GPU model matching (RTX/RX patterns) to avoid unrelated items.
- Frontend controls:
   - Manual scrape input (`search-input`) with model suggestion list; only accepts known GPU model tokens.
   - Chart controls: `range-start`, `range-end`, `chart-filter`, and `chart-agg` (min/avg/max).
   - Table filter: `table-filter` for client-side row filtering.
   - Table pagination: 10 rows per page with prev/next and page jump controls.
   - Chart rendering uses a fixed canvas height to avoid resizing during re-render.

## Data Model
Table: `prices`
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `date` TEXT NOT NULL (YYYY-MM-DD)
- `name` TEXT NOT NULL
- `price` REAL NOT NULL

## Seed & Maintenance
- `scripts/update-prices.js` — helper to delete and insert realistic sample rows for testing (2026-05-06..2026-05-08 for RTX 5070/5080/5090).
- Run `node scripts/update-prices.js` after restarting the server to refresh seed data.

## Running locally (notes)
1. Ensure Node 18+ (global `fetch` available) or polyfill otherwise.
2. Install deps: `npm install`.
3. Start server: `npm start` (restart after server.js edits).
4. Seed sample rows: `node scripts/update-prices.js`.

## Known Issues / Next Steps
- Frontend `chart-filter` needs tokenized matching (split on whitespace/comma) so inputs like `5070 5080 5090` match any token — planned change in `public/app.js`.
- Ensure server is restarted after edits to `server.js` so `/api/scrape` uses the latest scraper logic.
- Add more robust logging for scraper failures and rate-limit handling.

## Quick Test Data (examples)
- 2026-05-06 | RTX 5070 Sample A | 25990
- 2026-05-07 | RTX 5080 Sample B | 37990
- 2026-05-08 | RTX 5090 Sample C | 49990

## Contacts
- Repo root: see `server.js`, `public/app.js`, `scripts/update-prices.js` for implementation details.

---
_Spec last updated: 2026-05-09_
