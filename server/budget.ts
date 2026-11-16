/**
 * Cost guards for paid Google calls, independent of any per-visitor limit:
 *  - a global daily request cap (per instance) that flips the app to the curated/deterministic path
 *  - a short-lived result cache + in-flight de-duplication so one area is not re-fetched on every tap
 * Caching of Places content is OFF by default (Google Places policy: "You must not pre-fetch, cache, or store Places API
 * content beyond the allowed exceptions"). PLACES_CACHE_TTL_SEC>0 re-enables it at your own legal risk.
 */
const num = (v: string | undefined, d: number) => (Number.isFinite(Number(v)) && v !== undefined && v !== '' ? Number(v) : d);

let day = '';
let used = 0;

export function placesDailyCap(): number { return num(process.env.PLACES_DAILY_REQUEST_CAP, 1500); }

/** Reserve `n` paid requests. Returns false (and reserves nothing) once the daily cap is reached. */
export function reserveCalls(n: number): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; used = 0; }
  if (used + n > placesDailyCap()) return false;
  used += n;
  return true;
}
export function callsUsedToday(): number { return used; }
export function resetBudget() { day = ''; used = 0; cache.clear(); inflight.clear(); }

const cache = new Map<string, { at: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  // Google's Places policy forbids caching Places content (place IDs and short-lived coordinates excepted),
  // so the default is OFF. Only set PLACES_CACHE_TTL_SEC after counsel confirms an exception applies.
  const ttl = num(process.env.PLACES_CACHE_TTL_SEC, 0) * 1000;
  if (ttl <= 0) return fn();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value as T;
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = fn().then(v => {
    cache.set(key, { at: Date.now(), value: v });
    if (cache.size > 200) cache.delete(cache.keys().next().value as string);
    return v;
  }).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
