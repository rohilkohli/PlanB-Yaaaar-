# PlanB — adaptive solo-travel day companion (India)

Mobile-first PWA that builds a paced 3–4 stop day, then reshapes the rest of it in one tap when the day shifts.
Built from `Driftless — PRD v1.0` (renamed PlanB, India-centric).

```bash
npm install
npm run dev          # app + /api on http://localhost:3000 (zero-config works with no keys)
npm test             # unit/integration tests
npm run eval         # offline plan-quality eval (96 cases, gated thresholds)
npm run eval:live    # same against real Google Places (spends quota; run manually)
npm run ci           # typecheck + tests + eval + build (what GitHub CI runs)
npm run test:e2e     # builds, serves, drives 390×844 Chromium end-to-end + axe a11y audits
npm run build && npm start   # production server (serves dist/ + /api)
```

## Architecture

| Layer | What | Where |
|---|---|---|
| Planner (pure, shared) | pacing, hours check, sunset cutoff, guardrails, adapt/swap/undo/bonus | `src/core/` |
| API (serverless-style) | `/api/plan/{generate,adapt,swap}`, `/api/places/{autocomplete,discover,details}`, `/api/weather`, `/api/events`, `/api/health` | `server/`, `api/` (Vercel wrappers) |
| Grounding | Places API (New) with field masks → candidates; **LLM may only pick `place_id`s from the pool**; validator rejects anything else; deterministic scheduler enforces hours/sunset | `server/places.ts`, `llm.ts`, `validate.ts` |
| Fallbacks | LLM timeout (5.5 s) / error / invalid output → deterministic planner ("Built in fast local mode"); API unreachable → on-device planner | `server/pipeline.ts`, `src/services/planService.ts` |
| Client | React + Vite + Tailwind, History-API routes, Workbox PWA, IndexedDB (+ localStorage), 14-day purge | `src/` |

Routes: `/` · `/today` · `/today#adapt` · `/today#swap-[blockId]` · `/preferences` · `/map` · `/explore`.

## Configuration (all server-side; nothing is `VITE_`-prefixed, no keys reach the bundle)

See `.env.example`. With no keys the app runs on the curated catalogue + deterministic planner.

| Var | Purpose |
|---|---|
| `GOOGLE_PLACES_API_KEY` | Places (New), Geocoding, Time Zone, Weather |
| `GEMINI_API_KEY`, `LLM_MODEL` (`gemini-3.8-flash`) | structured-output sequencing + rationale |
| `USE_DETERMINISTIC_PLANNER=true` | kill-switch (PRD §35) |
| `RATE_LIMIT_GENERATE_PER_DAY` / `_ADAPT_` | per-IP/day, default 10 / 25 → HTTP 429 + `Retry-After` |
| `UPSTASH_REDIS_REST_URL/TOKEN` | shared rate-limit store (else in-memory) |

Google Cloud setup: `gcloud auth login && ./scripts/setup-gcp.sh [project-id] [billing-account-id]`.

## Data honesty
Curated catalogue entries (`source: 'curated'`) are hand-written approximations, labelled "Curated listing — check Maps"; only
Places-sourced venues say "Verified via Google Places". Live venue hours are used per-period (lunch/dinner gaps respected).

## Not built / deliberate
Multi-day trips, accounts, exports, in-app turn-by-turn (PRD non-goals). Magic-link sync (F-10, v1.1). The map screen is a stylised
schematic (pins projected from real coordinates), not tiles — add the Maps JavaScript API later if wanted.

## Quality, CI/CD and operations

- **Plan-quality eval** (`eval/`): every curated city × 4 traveler profiles × 3 time windows. Hard rules (open for the full block,
  sunset cut-off, guardrails, buffers, block counts, no excluded venue types) must have **0** violations; soft thresholds gate
  back-to-back food stops, headline-sight coverage and category variety. The live eval found casinos, a railway station, a cinema and
  hotels in real Places results — now excluded by Google place type (`server/places.ts`).
  It measures *internal consistency*, not real-world closures; that needs a field walk or a second data source.
- **CI** (`.github/workflows/ci.yml`): typecheck, tests, eval, build, Chromium E2E + axe audits on every PR and push to `main`.
- **CD** (`.github/workflows/deploy.yml`): on push to `main` by `rohilkohli` after CI passes → Cloud Run, smoke test, automatic rollback.
  Keyless via Workload Identity Federation — **one-time setup required:** review and run `scripts/setup-github-deploy.sh`.
- **Monitoring** (Google Cloud project `planb-solo-90824`): uptime check on `/api/health`; alert policies for 5xx errors, LLM-stage failures,
  Places failures/daily cap, p95 generation latency > 6 s; log-based metrics `planb_*`; analytics + plan events exported to BigQuery
  dataset `planb_analytics`. Budget alert ₹500/month; Places daily quotas capped in Google Cloud.
- **Legal**: `/privacy`, `/terms`, `/data-sources` (drafts — see `docs/LEGAL-REVIEW.md`).
