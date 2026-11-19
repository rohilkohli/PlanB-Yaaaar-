# Performance

Measured with `npx tsx e2e/perf.ts` against the production bundle: 390x844 phone, slow 4G (1.6 Mbps, 150 ms RTT), 4x CPU slowdown, cold cache, median of 3.

| | Before | After |
|---|---|---|
| First contentful paint | 2,432 ms | 932 ms |
| Largest contentful paint | 3,080 ms | 1,104 ms |
| App interactive | 2,688 ms | 1,092 ms |
| Server cold start | 103 ms | ~100 ms |

PRD target: FCP under 1,200 ms on 4G.

What changed: brotli/gzip for text assets (main JS 316 KB to 85 KB, pre-compressed at startup and cached in memory), the font is self-hosted
(no render-blocking request to Google Fonts), and the map, explore, adapt, swap and settings screens load on demand.

Not measured: real devices and the live Cloud Run URL. Check Lighthouse on a phone before treating these as final.

Deferred on purpose: React 19, Vite 8, Tailwind 4, TypeScript 7, vite-plugin-pwa 2 and vitest 5 are major upgrades with their own risk; patch updates are applied.

## Plan generation (server, real APIs, median of 8 runs over 4 cities)
| Stage | Before | After |
|---|---|---|
| Places candidates | ~260 ms | ~90 ms (warm) |
| AI sequencing + scheduling | ~2,020 ms | ~1,580 ms |
| Real travel times (Routes) | ~100 ms | ~95 ms |
| **Total** | **2,436 ms** | **1,765 ms** |

Live eval (14 cases): 0 hard violations, AI used on 100%, p50 1.5 s, p95 1.9 s. The AI step is ~85% of the time and its cost is output length, so it now writes one short sentence per stop (22 words max) and solo tips come from venue data. `scripts/profile-plan.ts` reproduces these numbers; each plan also logs `resolve_ms / candidates_ms / llm_ms / routes_ms`.

## UI upgrades (ui-ux-pro-max review)
- **Theme switch** (Preferences → Appearance): System (default, follows the phone) / Light / Dark. Each colour is defined once as `light-dark(light, dark)` in `globals.css`; the active side comes from `color-scheme`, set by the phone or by `data-theme` on `<html>` (`src/services/theme.ts`; `public/theme-init.js` applies a saved choice before first paint so it never flashes). Roles flip via tokens (`surface`, `edge`, `canvas`, `obsidian`, `olive-slate`, `spruce`); fixed fills (`ink`, `danger`, `spruce-solid`) keep their own text colours. CI runs the full end-to-end suite and every axe contrast audit in BOTH themes, plus a test that forces the opposite theme on each phone setting.
- **Map tiles follow the theme** (`src/services/mapStyle.ts`): a night style in PlanB's olive-black is applied at creation and re-applied live when the theme changes (tested with a stubbed Google Maps; real tiles must be checked on a phone).
- Minimum text size is 12 px and rem-based (it scales with the user's font-size setting); tap targets are 44 px (the "Get there" chips and "Show photo" were smaller).
- The install and reminders card is compact and dismissible so the day stays first on screen.
- The map title and controls sit on their own surfaces so they stay legible over any tiles.
