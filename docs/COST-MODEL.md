# Cost model (Google Maps Platform list prices, first volume tier, retrieved 16 Nov 2026)

| SKU | Free per month | Price per 1,000 |
|---|---|---|
| Nearby Search Enterprise (we request rating + opening hours) | 1,000 | $35.00 |
| Place Details Pro (name, address) | 5,000 | $17.00 |
| Place Details Photos | 1,000 | $7.00 |
| Autocomplete requests | 10,000 | $2.83 |
| Maps JavaScript: Dynamic Maps | 10,000 | $7.00 |
| Weather | 10,000 | $0.15 |

Your actual rates depend on tier and any negotiated discount; check your billing report.

## Per action (what PlanB sends)
- Build a day, adapt, or swap: 3 Nearby Search requests ≈ **$0.105** (6 in sparse areas ≈ $0.21).
- Open a saved plan online (re-fetch names): 1 Place Details per stop ≈ $0.017 × 4 ≈ **$0.07**.
- Photo shown: ≈ $0.007–0.014 each. "Up next" loads automatically; other cards load on tap.
- Explorer map: 1 map load ≈ $0.007; each category tap = 1 Nearby Search ≈ $0.035.

**Typical session** (build + 2 changes + 1 reopen + 1 photo): ≈ **$0.40 (about ₹33–35)**. The free monthly allowances cover roughly
the first 300 plans. Caching would cut this, but Google's policy forbids it by default (see GOOGLE-COMPLIANCE.md).

## Guard rails in place
- App-level cap: `PLACES_DAILY_REQUEST_CAP` per instance (default 700 requests/day).
- Google quota overrides: Nearby Search 1,500/day, Place Details 500/day, Autocomplete 1,000/day, Maps JS loads 2,000/day.
- Budget alert ₹500/month (alerts only; it does not stop spending).
- Per-IP daily limits: 10 plans, 25 adapts, 60 swaps (shared through Firestore).

If real usage grows, raise caps deliberately and price the product (PRD: $9–15 "Trip Pass") against ≈ $0.40/session.
