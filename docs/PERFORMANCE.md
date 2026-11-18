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
