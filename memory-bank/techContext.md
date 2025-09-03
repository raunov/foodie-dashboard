# Tech Context — Foodie Dashboard

Last updated: 2025-09-03

## Technologies
- Frontend
  - HTML + Tailwind CSS (compiled to public/style.css)
  - Vanilla ES Modules (public/*.js)
  - Mapbox GL JS (map rendering)
  - Chart.js (spending charts)
- Backend
  - Node.js serverless functions (CommonJS) under /api (Vercel-style handlers)
  - node-fetch@2 (Airtable HTTP calls)
  - cookie (parse/serialize auth cookie)

## Project Structure
- public/
  - index.html, restaurants.html, spending.html, login.html
  - index-page.js, restaurants-page.js, spending-page.js
  - utils/calculators.js
  - style.css (built artifact)
- api/
  - airtable.js, mapbox.js, login.js, logout.js
  - utils/auth.js
- src/
  - input.css (Tailwind source)
- memory-bank/
  - projectbrief.md, productContext.md, systemPatterns.md, techContext.md, activeContext.md, progress.md
- tailwind.config.js, postcss.config.js, package.json, .env-example

## Dependencies
- Runtime
  - node-fetch ^2.7.0
  - cookie ^0.6.0
- Dev
  - tailwindcss ^3.3.2
  - postcss ^8.4.24
  - autoprefixer ^10.4.14

## Build & Commands
- Build CSS
  - npm run build
  - Compiles src/input.css → public/style.css via Tailwind/PostCSS pipeline
- Local preview
  - Static files can be served by any static server (or Vercel dev). No dedicated dev server included.

## Environment Variables
- Required
  - SITE_PASSWORD: plain text password for login gate
  - MAPBOX_PUBLIC_TOKEN: Mapbox public token for client maps (served via /api/mapbox)
  - AIRTABLE_API_KEY: Airtable API key for server-side proxy
  - AIRTABLE_BASE_ID: Airtable base id
- Optional / Intended
  - AIRTABLE_RESTAURANT_VIEW_ID: intended view id for Tegevused fetch (code currently hardcodes a view id)
- .env-example currently includes:
  - AIRTABLE_API_KEY, AIRTABLE_BASE_ID, MAPBOX_PUBLIC_TOKEN
  - Missing SITE_PASSWORD (should be added)

## Hosting & Deployment
- Target: Serverless platform (e.g., Vercel)
  - /api/* functions deployed as serverless endpoints
  - public/* served as static assets
- Caching
  - /api/airtable sets: Cache-Control: s-maxage=60, stale-while-revalidate=300

## Coding Conventions
- Frontend JS: ES modules, cautious DOM querying, early returns for page guards
- API: CommonJS (module.exports = handler)
- Error Handling
  - Client: redirect to /login.html on 401s from protected endpoints
  - Server: console.error on Airtable errors with pass-through status text

## Data Shapes (Key Fields)
- Tegevused record fields
  - Nimetus (string), Linn (string), Riik (string), Kokku (number), Kuupäev (date)
  - Toidud (linked record ids), coordinates (string "lat,lon") or lat_exif/lon_exif
  - Spend Type ("Local"|"Travel"), Kuu ("YY-MM"), Pere (array), created_exif (datetime), Attachments (array)
- Enrichment
  - ToidudDetails: array of Restoran records injected server-side

## Known Technical Considerations
- Mapbox GL JS versions differ across pages (2.15.0 vs 2.9.1) — standardize to one
- Hardcoded Airtable view id in api/airtable.js — adopt env-driven view (AIRTABLE_RESTAURANT_VIEW_ID)
- Ensure .env-example lists SITE_PASSWORD for easier setup
- Secure cookies are set when NODE_ENV !== 'development'

## Setup Checklist
1. Copy .env-example to platform env variables (or .env for local), add:
   - SITE_PASSWORD=your_password_here
2. npm install
3. npm run build
4. Deploy to serverless host; verify /api/login and /api/mapbox work with auth cookie
