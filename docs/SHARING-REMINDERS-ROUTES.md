# Safety sharing, reminders, real travel times, recaps

## Architecture
- `server/store.ts`: small TTL document store (Firestore REST, in-memory fallback). Collections `shares`, `recaps`, `reminders`; each doc has `expireAt` (Firestore TTL deletes it) and optional `dueAt`.
- `server/share.ts`: live share + recap. 128-bit link token; separate write key (stored hashed). Views are rebuilt from whitelisted fields; Google venues stored as place IDs only and named live by the viewer.
- `server/push.ts`: Web Push (VAPID). Max two reminders per plan, text built server-side. Endpoints restricted to browser push services (no SSRF). Cloud Scheduler job `planb-push-dispatch` calls `/api/push/dispatch` every minute with an HMAC token derived from `PLAN_SIGNING_KEY`.
- `server/routes.ts` + `src/core/retime.ts`: after planning, real WALK/DRIVE times from the Google Routes API replace straight-line estimates. Stop order never changes; a stop moves later only if the real leg is longer, and is dropped only if hours / day window / after-dark rules would break. Falls back silently to estimates (no key, budget cap, API error).

## Limits that are by design
- Location is sent only while a share is ON **and PlanB is open** (a web app cannot track in the background). The viewer page says when the last update was and warns when it is stale.
- A silent phone cannot alert a contact by itself. This is not an emergency service; the UI says so and offers 112.
- iPhone receives push only after "Add to Home Screen" (the card explains this); iOS has no background sync.

## Cost
Routes: about 2-3 Essentials requests per plan or adapt (draws from the same `PLACES_DAILY_REQUEST_CAP`). Cloud Scheduler: one job (free tier is 3). Firestore: tiny.

## Setup (done for planb-solo-90824)
`scripts/setup-reminders.sh` is idempotent: enables APIs, creates the `vapid-private-key` secret + access, TTL policies, scheduler job. The VAPID public key is the `VAPID_PUBLIC_KEY` env var in `deploy.yml`. The server API key must allow `routes.googleapis.com`.

## Privacy
Disclosed in the Privacy page ("Safety sharing, recaps and reminders"). Reset & delete in Preferences ends the live share, deletes the recap link and unsubscribes reminders.
