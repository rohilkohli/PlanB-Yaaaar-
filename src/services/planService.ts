/**
 * Client-side plan orchestration: server first (grounded Places + LLM), then deterministic local mode
 * ("Built in fast local mode") if the API is unreachable, slow, rate-limited or errors (PRD §21).
 */
import { PLACES_DATABASE, CITIES } from '../data/placesData';
import { buildCalibration, sunsetFor, type CalibrationInput } from '../core/calibration';
import { matchCity, nearestCity } from '../core/cities';
import {
  adaptPlan, addBonusStop, generatePlan, swapAlternatives, type PlanContext
} from '../core/planner';
import { clockOverride, nowIn } from '../core/clock';
import { addDays } from '../core/time';
import type { CityData, Coordinates, DayPlan, TravelerPreferences, VerifiedVenue } from '../types/itinerary';
import { storage } from './storage';

export interface PlanMeta { usedFallback: boolean; fallbackReason?: string; llm: boolean; source: 'google_places' | 'curated'; latencyMs: number; notice?: string }

export class PlanError extends Error {
  constructor(public code: string, message: string, public status = 0) { super(message); }
}

async function post<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (e) {
    throw new PlanError((e as Error).name === 'TimeoutError' ? 'timeout' : 'network', 'Network unavailable');
  }
  const ct = res.headers.get('content-type') || '';
  if (!res.ok || !ct.includes('json')) {
    let j: { error?: string; message?: string } = {};
    try { j = await res.json(); } catch { /* ignore */ }
    throw new PlanError(j.error || `http_${res.status}`, j.message || 'Request failed', res.status);
  }
  return res.json() as Promise<T>;
}

/** Errors where the user did something we can explain; everything else falls back to local mode. */
const USER_ERRORS = new Set(['empty_city', 'unknown_city', 'outside_coverage', 'no_candidates', 'no_change']);

/* ------------------------------------------------------------------ local engine */

function localCity(input: CalibrationInput): { city: CityData; anchor?: Coordinates; label?: string } {
  if (input.cityId) { const c = matchCity(input.cityId); if (c && !input.coords) return { city: c }; }
  if (input.coords) {
    const near = nearestCity(input.coords, 40);
    if (near) return { city: near, anchor: input.coords, label: near.name };
    throw new PlanError('outside_coverage', 'Location access worked, but we don’t cover this area yet. Type a city to start.');
  }
  const m = input.query ? matchCity(input.query) : undefined;
  if (m) return { city: m };
  throw new PlanError('unknown_city', 'We don’t cover that place yet. Try one of the suggested cities.');
}

function localContext(city: CityData, dateISO: string, extra: Partial<PlanContext> = {}): PlanContext {
  return {
    city,
    candidates: PLACES_DATABASE.filter(v => v.cityId === city.id),
    sunsetMinutes: sunsetFor(city, dateISO),
    now: nowIn(city.timezone),
    excludeIds: storage.getClosedIds(),
    ...extra
  };
}

export function generateLocal(input: CalibrationInput, prefs: TravelerPreferences): DayPlan {
  const { city, anchor, label } = localCity(input);
  const now = nowIn(city.timezone);
  const date = input.date || addDays(now.date, input.dayOffset === 1 ? 1 : 0);
  const calib = buildCalibration({ ...input, coords: anchor, locationLabel: label }, city, date);
  calib.afterDark = input.afterDark ?? prefs.afterDarkMode;
  const plan = generatePlan(calib, prefs, localContext(city, date));
  plan.usedFallback = true;
  return plan;
}

/* ------------------------------------------------------------------ public API */

export async function buildPlan(input: CalibrationInput, prefs: TravelerPreferences): Promise<{ plan: DayPlan; meta: PlanMeta }> {
  if (!input.query?.trim() && !input.cityId && !input.coords) throw new PlanError('empty_city', 'Enter a city or neighborhood to build your day.');
  const started = Date.now();
  if (!storage.isOffline()) {
    try {
      return await post('/api/plan/generate', { calibration: input, guardrails: prefs, ...clockOverride(input.cityId ? (CITIES.find(c => c.id === input.cityId)?.timezone ?? 'Asia/Kolkata') : 'Asia/Kolkata') }, 8000);
    } catch (e) {
      if (e instanceof PlanError && USER_ERRORS.has(e.code)) {
        // The server may not know a city the offline catalogue does (e.g. API keys not set) — try local before failing.
        try { const plan = generateLocal(input, prefs); return { plan, meta: { usedFallback: true, fallbackReason: e.code, llm: false, source: 'curated', latencyMs: Date.now() - started } }; }
        catch { throw e; }
      }
      const notice = e instanceof PlanError && e.status === 429 ? 'Live plan limit reached for today.' : undefined;
      const plan = generateLocal(input, prefs);
      return { plan, meta: { usedFallback: true, fallbackReason: (e as PlanError).code, llm: false, source: 'curated', latencyMs: Date.now() - started, notice } };
    }
  }
  const plan = generateLocal(input, prefs);
  return { plan, meta: { usedFallback: true, fallbackReason: 'offline', llm: false, source: 'curated', latencyMs: Date.now() - started } };
}

export interface AdaptRequest { scenarios: string[]; note: string; socialShift?: 'quieter' | 'livelier'; currentCoords?: Coordinates; bonus?: boolean }

export async function adaptRemote(plan: DayPlan, req: AdaptRequest): Promise<{ plan: DayPlan; meta: PlanMeta }> {
  if (storage.isOffline()) throw new PlanError('offline', 'You’re offline — reconnect to recalculate new stops. Your current plan is saved below.');
  const started = Date.now();
  try {
    return await post('/api/plan/adapt', { plan, ...req, excludeIds: storage.getClosedIds(), ...clockOverride(plan.city.timezone) }, 8000);
  } catch (e) {
    if (e instanceof PlanError && USER_ERRORS.has(e.code)) throw e;
    const city = plan.city;
    const ctx = localContext(city, plan.calibration.date);
    const out = req.bonus
      ? addBonusStop(plan, ctx)
      : adaptPlan(plan, { scenarios: req.scenarios, note: req.note, socialShift: req.socialShift, currentCoords: req.currentCoords }, ctx);
    out.usedFallback = true;
    return { plan: out, meta: { usedFallback: true, fallbackReason: (e as PlanError).code, llm: false, source: 'curated', latencyMs: Date.now() - started } };
  }
}

export async function swapRemote(plan: DayPlan, blockId: string, reason: string): Promise<{ alternatives: VerifiedVenue[]; noNearbyBackup: boolean }> {
  if (storage.isOffline()) throw new PlanError('offline', 'You’re offline — reconnect to swap this stop. Your current plan is saved below.');
  if (reason === 'closed') {
    const b = plan.blocks.find(x => x.blockId === blockId);
    if (b) storage.addClosedId(b.venue.placeId);
  }
  try {
    return await post('/api/plan/swap', { plan, blockId, reason, excludeIds: storage.getClosedIds(), ...clockOverride(plan.city.timezone) }, 6000);
  } catch (e) {
    if (e instanceof PlanError && USER_ERRORS.has(e.code)) throw e;
    return swapAlternatives(plan, blockId, reason, localContext(plan.city, plan.calibration.date));
  }
}

export async function fetchSuggestions(q: string): Promise<Array<{ text: string; cityId?: string }>> {
  const local = CITIES.filter(c => c.name.toLowerCase().includes(q.toLowerCase())).map(c => ({ text: `${c.name}, ${c.country}`, cityId: c.id }));
  if (storage.isOffline() || q.trim().length < 2) return local;
  try {
    const res = await fetch(`/api/places/autocomplete?q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return local;
    const j = (await res.json()) as { suggestions: Array<{ text: string; cityId?: string }> };
    return j.suggestions.length ? j.suggestions : local;
  } catch { return local; }
}

export async function fetchRainHint(c: Coordinates): Promise<boolean> {
  if (storage.isOffline()) return false;
  try {
    const res = await fetch(`/api/weather?lat=${c.lat.toFixed(2)}&lng=${c.lng.toFixed(2)}`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return false;
    return !!((await res.json()) as { rainSoon?: boolean }).rainSoon;
  } catch { return false; }
}

export { CITIES };
