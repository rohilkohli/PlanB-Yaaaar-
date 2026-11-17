/**
 * Real travel times between consecutive stops via the Google Routes API (computeRoutes, Essentials tier:
 * WALK, or DRIVE without live traffic). One request per leg, typically 2-3 per plan. Failures and an exhausted budget
 * simply return null legs, and the plan keeps its straight-line estimates. Results are used once and never stored.
 */
import { env } from './env';
import { reserveCalls } from './budget';
import { haversineKm, walkMinutes } from '../src/core/geo';
import type { Coordinates } from '../src/types/itinerary';
import type { Leg } from '../src/core/retime';

const URL_ = 'https://routes.googleapis.com/directions/v2:computeRoutes';

async function oneLeg(key: string, a: Coordinates, b: Coordinates, mode: 'walk' | 'cab'): Promise<Leg | null> {
  try {
    const r = await fetch(URL_, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters' },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: a.lat, longitude: a.lng } } },
        destination: { location: { latLng: { latitude: b.lat, longitude: b.lng } } },
        travelMode: mode === 'walk' ? 'WALK' : 'DRIVE',
        ...(mode === 'cab' ? { routingPreference: 'TRAFFIC_UNAWARE' } : {})
      }),
      signal: AbortSignal.timeout(1800)
    });
    if (!r.ok) return null;
    const route = ((await r.json()) as { routes?: Array<{ duration?: string; distanceMeters?: number }> }).routes?.[0];
    const secs = Number(String(route?.duration ?? '').replace('s', ''));
    if (!Number.isFinite(secs) || secs <= 0 || !route?.distanceMeters) return null;
    // Auto-rickshaw / cab: add a small hail-and-wait allowance so the plan is not optimistic.
    const minutes = Math.max(2, Math.ceil(secs / 60)) + (mode === 'cab' ? 4 : 0);
    return { minutes, km: route.distanceMeters / 1000, mode };
  } catch { return null; }
}

/** `points[i]` is the stop i; returns legs INTO each stop (index 0 is always null). `strideCap` = the traveler's max walking minutes. */
export async function fetchLegs(points: Coordinates[], strideCap: number): Promise<Array<Leg | null>> {
  const key = env().placesKey;
  const legs: Array<Leg | null> = points.map(() => null);
  if (!key || points.length < 2) return legs;
  const need = points.length - 1;
  if (!reserveCalls(need)) return legs;
  await Promise.all(points.slice(1).map(async (p, i) => {
    const a = points[i];
    if (haversineKm(a, p) < 0.05) { legs[i + 1] = { minutes: 2, km: 0.05, mode: 'walk' }; return; }
    const mode = walkMinutes(a, p) > strideCap ? 'cab' : 'walk';
    legs[i + 1] = await oneLeg(key, a, p, mode);
  }));
  return legs;
}
