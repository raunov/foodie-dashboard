# Project Brief — Foodie Dashboard (Bill Tracker Dashboard)

Last updated: 2025-09-03

## Purpose
A personal dashboard to track and visualize restaurant spending and experiences. The app aggregates dining activities from Airtable, computes insights/achievements, and displays interactive maps and charts for exploration.

## Primary Users
- Single owner/user (password-protected): views insights, maps, and lists of restaurant activities.
- No multi-user accounts or roles in scope.

## Core Requirements and Goals
- Authentication
  - Password-based login sets an httpOnly cookie (`site_auth`) to gate serverless API endpoints.
  - Logout clears the cookie.
- Data integration
  - Fetch activities from Airtable “Tegevused” table.
  - Enrich activities with linked “Restoran” details via batched lookups.
- Dashboard (Index)
  - Show key stats (total spent, average bill, count).
  - Show insights (seasonality, weekend effect, top city/countries, etc.).
  - Render interactive Mapbox map with color-coded markers by spend.
  - Display top achievements and link to full achievements page.
- Restaurants page
  - Search, sort, paginate activity list.
  - Map view; clicking list focuses the map marker.
- Spending page
  - Visualize insights and achievements (Chart.js for charts).
- Styling & UX
  - Tailwind CSS-based theme compiled to `public/style.css`.
  - Loader overlay for async fetches; responsive layout.

## Out of Scope (Non-Goals)
- User registration or account management beyond single password.
- Complex backend databases beyond Airtable proxying.
- Real-time collaboration.
- Native mobile apps.

## Data Sources & Model (Airtable)
- Tables
  - Tegevused (activities, main source)
  - Restoran (linked from Tegevused via `Toidud`)
- Important fields observed
  - Nimetus (name/title)
  - Linn (city), Riik (country)
  - Kokku (total/amount)
  - Kuupäev (date)
  - Toidud (linked record ids) → enriched server-side to `ToidudDetails`
  - coordinates or lat_exif/lon_exif as fallback
  - Attachments (photos)
  - Spend Type (Local/Travel)
  - Kuu (YY-MM derived month)
  - Pere (array of participants)
  - created_exif (timestamp for time-of-day analysis)

## Pages & Features
- public/index.html (+ index-page.js)
  - Loads Mapbox token then Airtable data.
  - Uses calculators for insights; renders map and achievements.
- public/restaurants.html (+ restaurants-page.js)
  - Fetch token + data; search/sort/paginate; map focus by item.
- public/spending.html (+ spending-page.js)
  - Chart-driven insights and achievements (Chart.js).
- public/login.html
  - Posts password to `/api/login`, redirects on success.

## API (Serverless Functions)
- /api/login
  - POST { password } → sets `site_auth` cookie if matches `SITE_PASSWORD`.
- /api/logout
  - POST → clears `site_auth` cookie.
- /api/utils/auth.js
  - `isAuthenticated(req)`: validates `site_auth` cookie.
- /api/mapbox
  - Returns `{ token: MAPBOX_PUBLIC_TOKEN }` if authenticated.
- /api/airtable
  - Auth required; fetches Tegevused records from Airtable (via view), extracts linked Restoran ids, batch fetches Restoran, returns combined records with `ToidudDetails`.

## Security & Privacy
- httpOnly cookie for auth.
- `secure` cookie attribute enabled when `NODE_ENV !== 'development'`.
- All serverless endpoints require auth (via `isAuthenticated`) except login/logout.
- Do not leak API keys/tokens to client; only return Mapbox public token.

## Technology Stack
- Frontend: HTML + Tailwind CSS (compiled), vanilla JS modules, Mapbox GL JS, Chart.js.
- Backend: Vercel-style Node.js serverless functions (CommonJS).
- Build: Tailwind via PostCSS (autoprefixer).
- Dependencies (package.json)
  - runtime: node-fetch@^2, cookie@^0.6
  - dev: tailwindcss, postcss, autoprefixer

## Build & Deployment
- Build CSS: `npm run build` (tailwindcss -i ./src/input.css -o ./public/style.css)
- Environment (expected)
  - SITE_PASSWORD
  - MAPBOX_PUBLIC_TOKEN
  - AIRTABLE_API_KEY
  - AIRTABLE_BASE_ID
  - (Optional/Intended) AIRTABLE_RESTAURANT_VIEW_ID (currently not used in code)
- Hosting target: serverless (e.g., Vercel) with `api/` endpoints and static `public/` assets.

## Success Metrics
- Auth-only access enforced for all data-dependent endpoints.
- Fast dashboard load with visible loader until data is ready.
- Accurate insights and marker rendering.
- Stable Airtable proxy with error handling and caching.

## Risks & Constraints
- Airtable API rate limits and pagination handling.
- View IDs and schema changes in Airtable.
- Inconsistent Mapbox GL versions across pages may cause UI/behavior differences.
- Environment variables must be properly configured in hosting platform.

## Known Gaps / Follow-ups (high-level)
- Standardize Mapbox GL version across all pages.
- Parameterize and consistently use the Airtable View ID (code currently hardcodes a view and also checks an env var that isn’t used).
- Confirm `public/spending-page.js` covers all planned insights; extend calculators/tests as needed.
- Add basic smoke tests for API endpoints and parsers.
- Document .env-example comprehensively (ensure it includes all required variables).

## Glossary
- Activity: A dining bill/record from Tegevused.
- ToidudDetails: Server-enriched Restoran data merged into activity response.
- Achievements: Computed milestones like First Bite, Globe Taster, etc.
