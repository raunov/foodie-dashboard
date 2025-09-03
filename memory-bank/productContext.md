# Product Context — Foodie Dashboard

Last updated: 2025-09-03

## Why This Project Exists
Tracking dining spend, experiences, and discoveries typically lives across receipts, photos, and memory. This product creates a single, delightful view over restaurant activity: costs, places, trends, and achievements — all powered from a simple Airtable base plus lightweight serverless endpoints.

## Problems It Solves
- Fragmented data: bills in Airtable, photos/locations in EXIF, and maps in a separate tool.
- No quick insights: hard to understand seasonality, weekend effect, travel vs local patterns.
- No context while browsing: list views lack geographic/spend cues and are not exploratory.
- Manual aggregation: linking “activity” to “restaurant” details is tedious.

## How It Should Work (User Journey)
1. Login
   - User opens /login.html, enters a single password (SITE_PASSWORD).
   - On success, a secure, httpOnly cookie (`site_auth`) is set; user is redirected to the dashboard.
2. Dashboard (index.html)
   - Loader displays while fetching Mapbox token and Airtable-backed activity data via serverless endpoints.
   - The page shows: stats (total, average, count), insights (seasonality, weekend effect, top city/countries), an interactive map with spend-coded markers, and unlocked achievements.
3. Restaurants (restaurants.html)
   - Paginated, searchable, sortable list of activities/visits.
   - Map synchronized with list; selecting an item focuses/pops marker on map.
4. Spending (spending.html)
   - Visual insights via charts (Chart.js) and a full achievements grid.
5. Logout
   - Clears the cookie, returning the user to the login flow.

## User Experience Goals
- Fast perceived performance
  - Show loader immediately; async fetch in background; smooth transitions.
- Clear information hierarchy
  - KPIs at top, insights next, map and lists with progressive detail.
- Intuitive exploration
  - Search, sort, paginate; map focus on list interaction; clear visual coding for spend tiers (€/€€/€€€).
- Consistency and accessibility
  - Consistent styling and iconography; keyboard and screen-reader friendly structure where possible.
- Safety and privacy by default
  - Data endpoints require auth; private tokens never exposed to client (except public Mapbox token).

## Personas and Needs
- Owner/Single user
  - Wants effortless overview (totals, averages, trends).
  - Wants exploration (where did I eat, how much, when).
  - Wants fun motivation (achievements, badges).

## Constraints That Inform UX
- Airtable schema evolution
  - Fields like `Kuu`, `Spend Type`, `coordinates`, `Toidud` must be robustly handled; UI tolerates missing data.
- Serverless latency
  - Use loaders; consider caching headers and batch requests (already in use for linked record fetch).
- Mobile and desktop
  - Tailwind responsive classes; layouts adapt to smaller screens without losing context.

## Success Criteria (Product)
- The dashboard conveys a clear picture of recent and lifetime activity at-a-glance.
- Restaurants list and map enable quick filtering and discovery.
- Insights feel meaningful and match expectations (e.g., weekend effect reflects real behavior).
- Login reliably gates all data calls.

## Future Enhancements (Ideation)
- Filters by time range, spend range, city/country.
- Compare trips (local vs travel) and per-trip summaries.
- Export views or share selected insights (still private-first).
- Additional achievements (e.g., cuisine diversity, budget streaks, photo coverage milestones).
