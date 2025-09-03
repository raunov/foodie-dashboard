# Active Context — Foodie Dashboard

Last updated: 2025-09-03

## Current Focus
- Establish a persistent Memory Bank to survive session resets and guide ongoing work.
- Baseline the current system architecture, tech, and product intent from existing code.
- Identify immediate hardening tasks (envs, consistency, small DX fixes).

## Recent Changes
- Created Memory Bank core documents:
  - projectbrief.md (scope, goals, users, success metrics)
  - productContext.md (why, UX, journeys, success criteria)
  - systemPatterns.md (architecture, data flow, auth, map, UI patterns)
  - techContext.md (stack, deps, envs, structure, setup)
- Reviewed key code paths:
  - Auth cookie flow (login/logout + isAuthenticated)
  - Airtable proxy enrichment (Tegevused + batched Restoran fetch)
  - Frontend dashboards (index, restaurants, spending) and calculators
- Identified and documented inconsistencies and gaps (see below).

## Next Steps (Prioritized)
1. Configuration hygiene
   - Add SITE_PASSWORD to .env-example (include placeholder)
   - Make AIRTABLE_RESTAURANT_VIEW_ID actually used in api/airtable.js (replace hardcoded view)
2. Consistency & UX
   - Standardize Mapbox GL JS version across pages (prefer v2.15.0)
   - Unify loader behavior (opacity/visibility vs display)
3. Robustness
   - Defensive parsing for coordinates and date fields (already partially handled)
   - Improve error messaging in UI on API failures (currently console-only in places)
4. Docs & DevX
   - Expand .env-example with all required vars
   - Add minimal smoke tests for /api endpoints (manual checklist or automated later)

## Active Decisions & Preferences
- Single-user password gate via httpOnly cookie; keep serverless endpoints private-by-default.
- Public Mapbox token only exposed via serverless function after auth check.
- Keep frontend vanilla JS modules + Tailwind for now (no framework overhead).
- Keep serverless CommonJS for compatibility with hosting provider defaults.

## Important Patterns (Reminders)
- Frontend data shape: insights expect records as [{ fields: ... }]
- Spend buckets → marker colors: green (≤35), yellow (≤75), red (>75)
- City/country and month-derived aggregations depend on fields: Linn, Riik, Kuu
- Family metrics use Pere array length for per-person math
- SWR-like cache headers on /api/airtable (60s / 300s)

## Learnings & Notes
- restaurants-page.js processes ToidudDetails (first linked Restoran) — ensure API always includes it when present.
- spending-page.js is implemented and wired to calculators + Chart.js (not just a placeholder).
- View ID is currently hardcoded in api/airtable.js while env var name implies configurability — fix to reduce brittleness.

## Open Questions (Track)
- Should we add a time range filter UI (global) to all pages?
- Do we need separate travel/local color encodings on the map or keep by spend tiers?
- Any need to support multiple Airtable views/bases (future)?
