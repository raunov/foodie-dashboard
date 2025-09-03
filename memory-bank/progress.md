# Progress — Foodie Dashboard

Last updated: 2025-09-03

## Current Status
- Memory Bank established with core documents:
  - projectbrief.md, productContext.md, systemPatterns.md, techContext.md, activeContext.md, progress.md
- Frontend pages and core logic present and reviewed:
  - index.html (+ index-page.js), restaurants.html (+ restaurants-page.js), spending.html (+ spending-page.js), login.html
  - calculators.js provides insights and achievement logic
- Backend serverless endpoints operational by design:
  - /api/login, /api/logout, /api/mapbox, /api/airtable (+ utils/auth.js)

## What Works
- Auth flow
  - Password login sets secure httpOnly cookie; protected endpoints require auth and redirect to /login.html on 401.
  - Logout clears cookie.
- Airtable proxy
  - Paginates Tegevused via view, collects linked Restoran IDs, batches fetches by 100 using filterByFormula, augments records with ToidudDetails, returns combined dataset.
  - Basic SWR caching headers (s-maxage=60, stale-while-revalidate=300).
- Dashboard (index)
  - Loads Mapbox token then Airtable data.
  - Computes stats, insights, achievements using calculators.js.
  - Renders Mapbox markers color-coded by spend.
- Restaurants
  - Search, sort, paginate activity list.
  - Map with markers; clicking list focuses map and popup.
- Spending
  - Chart-based insights (Chart.js) and full achievements grid.

## Known Issues
- Inconsistent Mapbox GL versions across pages (2.15.0 on index, 2.9.1 on restaurants).
- Hardcoded Airtable view id in api/airtable.js; env var AIRTABLE_RESTAURANT_VIEW_ID exists but is not used.
- .env-example missing SITE_PASSWORD placeholder (required by /api/login).
- Loader behavior differs between pages (opacity/visibility vs display toggling).

## Pending Work (Next Steps)
1. Config hygiene
   - Add SITE_PASSWORD to .env-example.
   - Update api/airtable.js to use AIRTABLE_RESTAURANT_VIEW_ID (fallback to default/hardcoded only if missing).
2. Consistency
   - Standardize Mapbox GL JS version across all pages (recommend v2.15.0).
   - Unify loader UX pattern used by pages.
3. Robustness & DX
   - Improve client-side error messaging when API calls fail (beyond console.error).
   - Document environment variable setup comprehensively.
   - Consider minimal smoke tests for /api endpoints and calculators (manual or basic automated).

## Decisions (Recent)
- Maintain single-user, cookie-gated model for simplicity and privacy.
- Keep vanilla JS modules + Tailwind; no framework migration planned.
- Serverless functions remain CommonJS for platform compatibility.

## Notes & Constraints
- Airtable rate limits and schema changes are primary external risks.
- Many calculators depend on fields: Kuu, Spend Type, Linn/Riik, created_exif, coordinates.
- Spend-to-color mapping used consistently across map markers.
