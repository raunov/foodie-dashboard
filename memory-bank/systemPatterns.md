# System Patterns — Foodie Dashboard

Last updated: 2025-09-03

## Architecture Overview
- Static frontend (public/) + serverless backend (api/).
- Frontend: HTML + Tailwind CSS + vanilla JS modules (type="module").
- Backend: Node.js serverless handlers (CommonJS) deployed in /api.
- Authentication via httpOnly cookie checked server-side for protected endpoints.

## Authentication Pattern
- Login (POST /api/login):
  - Compares submitted password with env SITE_PASSWORD.
  - Sets cookie `site_auth=true` with flags (httpOnly, sameSite=strict, secure when not development, path=/, maxAge 30d).
- Logout (POST /api/logout):
  - Clears cookie by setting empty value and past expiry.
- Gatekeeping:
  - api/utils/auth.js exposes isAuthenticated(req) parsing cookies.
  - /api/mapbox and /api/airtable return 401 unless authenticated.
- Client behavior:
  - On 401 from protected endpoints, pages redirect to /login.html.

## Data Flow Pattern
- Token-first fetch:
  - Frontend fetches /api/mapbox (ensures auth). If 401 → redirect.
- Airtable proxy fetch:
  - Frontend fetches /api/airtable for activities dataset.
  - Returns combined Tegevused + linked Restoran details as ToidudDetails.
- Caching:
  - /api/airtable sets Cache-Control: s-maxage=60, stale-while-revalidate=300.

## Airtable Proxy Pattern (api/airtable.js)
1. Pagination loop over Tegevused (via view id viw3CX2MnNWumhk7p).
2. Extract all linked Restoran record IDs from fields.Toidud.
3. Batch fetch Restoran by 100 id chunks using filterByFormula OR(RECORD_ID()='id',...).
4. Index Restoran by id and augment each Tegevus record with fields.ToidudDetails = [linked Restoran records].
5. Return { records: combined }.

Notes:
- Environment variables referenced: AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_RESTAURANT_VIEW_ID (not used by code currently).
- Table names: TEGEVUSED_TABLE_NAME='Tegevused', RESTORAN_TABLE_NAME='Restoran'.

## Frontend Page Patterns
- Lifecycle:
  - DOMContentLoaded -> guard by presence of page-specific DOM (index checks #foodie-map).
  - Show loader immediately, hide when both token and data are processed.
- Error handling:
  - Check response.status; redirect to login on 401.
  - Log non-OK statuses and exceptions to console.
- Insights & Achievements:
  - calculators.js functions expect array of { fields } records.
  - Index page adapts labels and values (e.g., weekend text) after calculations.

## Map Patterns (Mapbox GL JS)
- Version usage:
  - index.html: v2.15.0
  - restaurants.html: v2.9.1
  - Risk: inconsistent behavior/appearance; should standardize.
- Coordinates:
  - Records may supply fields.coordinates string "lat,lon" or fallback to lat_exif/lon_exif.
  - Parsing pattern: const [lat, lng] = str.split(',').map(Number); use setLngLat([lng, lat]).
- Marker styling by spend:
  - € (<=35): green (#10b981)
  - €€ (<=75): yellow (#f59e0b)
  - €€€ (>75): red (#ef4444)
- Index page:
  - Fullscreen toggle moves map container into body and back, then map.resize().
- Restaurants page:
  - Global markers map keyed by activity id.
  - fitBounds over all valid coordinates; focusMapOnActivity uses flyTo + togglePopup.

## UI/UX Patterns
- Tailwind classes with CSS variables (var(--primary-color), etc.) for theme.
- Material Symbols Outlined icons; Inter and Poppins fonts.
- Responsive layouts; side navigation on md+.
- Loader
  - Index uses opacity/visibility transitions.
  - Restaurants uses display toggling; could be unified.

## Module/Format Patterns
- Frontend JS uses ES modules.
- API uses CommonJS (module.exports).
- No TypeScript; minimal bundling (direct module files in public/).

## Critical Paths
- Auth flow: login sets cookie → protected endpoints allow Mapbox token + Airtable → UI renders.
- Data enrichment: ToidudDetails must be present for certain UI fields on restaurants page.
- Calculations: Many insights depend on presence/format of fields (Kuu, Spend Type, created_exif).

## Observed Inconsistencies / Gaps
- Mapbox GL versions differ (2.15.0 vs 2.9.1).
- AIRTABLE_RESTAURANT_VIEW_ID env var checked but not used (hardcoded view id in code).
- spending-page.js exists but content not reviewed/documented yet (ensure alignment with calculators and Chart.js).
- Loader behavior not standardized between pages.

## Performance Considerations
- Batching Restoran requests to limit filterByFormula query size (100 ids per request).
- Server-side SWR caching window for Airtable (60s/300s).
- Map marker creation per item (acceptable dataset size assumed).

## Security Considerations
- httpOnly auth cookie prevents client-side JS access.
- secure flag enabled outside development.
- Publicly expose only Mapbox public token.
- Ensure no Airtable keys return to client.

## Component Relationships
- public/index-page.js → calculators.js; map on #foodie-map; achievements grid; insights KPIs.
- public/restaurants-page.js → list rendering + map; relies on ToidudDetails from API.
- public/spending-page.js → intended Chart.js views using calculators.js (TBD).
- api/airtable.js → Airtable REST API, composes response for frontend.
- api/mapbox.js → returns token from env after auth.
- api/login.js/logout.js → manage cookie; utils/auth.js shared.
