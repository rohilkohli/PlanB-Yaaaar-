/**
 * Orchestration for /api/plan/generate | adapt | swap.
 * Stage 1: candidate retrieval (Places API, or curated catalogue)
 * Stage 2: LLM sequencing + rationale (optional)  →  validator  →  deterministic scheduler
 * Any failure at stage 2 falls back to the deterministic planner (PRD §21).
 */
import { CITIES, PLACES_DATABASE } from '../src/data/placesData';
import { matchCity, nearestCity } from '../src/core/cities';
import { buildCalibration, sunsetFor, type CalibrationInput } from '../src/core/calibration';
import {
  adaptPlan, addBonusStop, generatePlan, planWindow, rankPool, swapAlternatives,
  targetBlockCount, type PlanContext
} from '../src/core/planner';
import { addDays, localNow, timeStringToMinutes } from '../src/core/time';
import { cached, reserveCalls } from './budget';
import { truncateCoords } from '../src/core/geo';
import type { CityData, Coordinates, DayPlan, TravelerPreferences, VerifiedVenue } from '../src/types/itinerary';
import { env } from './env';
import { sequenceWithLlm } from './llm';
import { adHocCity, approxTimezone, fetchCandidates, geocode, reverseGeocode } from './places';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export interface PlanMeta {
  usedFallback: boolean;
  fallbackReason?: string;
  llm: boolean;
  source: 'google_places' | 'curated';
  latencyMs: number;
}

const BUDGET_TOTAL_MS = () => env().llmTimeoutMs;

const DEFAULT_PREFS: TravelerPreferences = { mobility: 'stairs_okay', maxStrideMinutes: 25, dietary: [], units: 'km', afterDarkMode: 'well_lit' };

export function sanitizePrefs(p: Partial<TravelerPreferences> | undefined): TravelerPreferences {
  const mob = ['stairs_okay', 'avoid_hills', 'transit_first', 'step_free'];
  const units = p?.units === 'mi' ? 'mi' : 'km';
  return {
    mobility: (mob.includes(p?.mobility as string) ? p!.mobility : 'stairs_okay') as TravelerPreferences['mobility'],
    maxStrideMinutes: ([15, 25, 40] as const).includes(p?.maxStrideMinutes as 15) ? (p!.maxStrideMinutes as 15 | 25 | 40) : 25,
    dietary: Array.isArray(p?.dietary) ? p!.dietary.filter(x => typeof x === 'string').slice(0, 10).map(x => x.slice(0, 40)) : [],
    units,
    afterDarkMode: (['before_dark', 'well_lit', 'anywhere'].includes(p?.afterDarkMode as string) ? p!.afterDarkMode : 'well_lit') as TravelerPreferences['afterDarkMode']
  };
}

const ENUMS = {
  energy: ['gentle', 'balanced', 'active'],
  budget: ['$', '$$', '$$$', '₹', '₹₹', '₹₹₹'],
  afterDark: ['before_dark', 'well_lit', 'anywhere'],
  social: ['solitude', 'ambient', 'social']
} as const;

export function sanitizeCalibration(c: any): CalibrationInput {
  if (!c || typeof c !== 'object') throw new ApiError(400, 'bad_request', 'Missing calibration.');
  const pick = <T extends readonly string[]>(v: unknown, list: T): T[number] | undefined => (list as readonly string[]).includes(v as string) ? (v as T[number]) : undefined;
  const time = (v: unknown) => (typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v) ? v : undefined);
  const coords = c.coords && Number.isFinite(c.coords.lat) && Number.isFinite(c.coords.lng) && Math.abs(c.coords.lat) <= 90 && Math.abs(c.coords.lng) <= 180
    ? { lat: Number(c.coords.lat), lng: Number(c.coords.lng) } : undefined;
  return {
    cityId: typeof c.cityId === 'string' ? c.cityId.slice(0, 40) : undefined,
    query: typeof c.query === 'string' ? c.query.trim().slice(0, 80) : undefined,
    coords,
    dayOffset: c.dayOffset === 1 ? 1 : 0,
    date: typeof c.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.date) ? c.date : undefined,
    startTime: time(c.startTime),
    endTime: time(c.endTime),
    energy: pick(c.energy, ENUMS.energy),
    budget: pick(c.budget, ENUMS.budget),
    afterDark: pick(c.afterDark, ENUMS.afterDark),
    social: pick(c.social, ENUMS.social),
    locationLabel: typeof c.locationLabel === 'string' ? c.locationLabel.slice(0, 80) : undefined
  };
}

export async function resolveLocation(input: CalibrationInput): Promise<{ city: CityData; anchor: Coordinates | undefined; label: string }> {
  // 1. curated city by id or name
  const byId = input.cityId ? matchCity(input.cityId) : undefined;
  const byName = input.query ? matchCity(input.query) : undefined;
  const curated = byId ?? byName;
  if (curated && !input.coords) return { city: curated, anchor: undefined, label: input.locationLabel || curated.name };

  // 2. GPS coordinates: reverse-geocode with Places key, else nearest curated city
  if (input.coords) {
    const near = nearestCity(input.coords, 40);
    if (env().placesKey) {
      try {
        const r = await reverseGeocode(input.coords);
        if (r) {
          const city = near ?? adHocCity(r);
          return { city: near ? { ...near, timezone: near.timezone } : city, anchor: input.coords, label: r.name };
        }
      } catch { /* fall through */ }
    }
    if (near) return { city: near, anchor: input.coords, label: near.name };
    throw new ApiError(422, 'outside_coverage', 'Location access worked, but we don’t cover this area yet. Type a city to start.');
  }

  // 3. free text → geocode
  if (input.query && env().placesKey) {
    try {
      const r = await geocode(input.query);
      if (r) {
        const near = nearestCity(r.coords, 25);
        return { city: near ?? adHocCity(r), anchor: near ? undefined : r.coords, label: r.name };
      }
    } catch { /* fall through */ }
  }
  throw new ApiError(422, 'unknown_city', 'We don’t cover that place yet. Try one of the suggested cities.');
}

function curatedFor(cityId: string): VerifiedVenue[] {
  return PLACES_DATABASE.filter(v => v.cityId === cityId);
}

async function getCandidates(city: CityData, center: Coordinates, dateISO: string, deadlineMs: number): Promise<{ venues: VerifiedVenue[]; source: 'google_places' | 'curated' }> {
  const curated = curatedFor(city.id);
  if (env().placesKey) {
    try {
      const key = `cand:${city.id}:${center.lat.toFixed(2)},${center.lng.toFixed(2)}:${dateISO}`;
      const live = await cached(key, async () => {
        if (!reserveCalls(6)) throw new Error('daily_cap');
        return fetchCandidates({ center, cityId: city.id, dateISO, currency: city.country === 'India' ? '₹' : '$', timeoutMs: Math.max(1200, deadlineMs) });
      });
      if (live.length >= 3) return { venues: live, source: 'google_places' };
    } catch (e) {
      logEvent('places_error', { reason: (e as Error).message });
    }
  }
  if (curated.length) return { venues: curated, source: 'curated' };
  throw new ApiError(422, 'no_candidates', 'We couldn’t find open venues nearby right now. Try again or pick another city.');
}

function clock(city: CityData, override?: { minutes: number; date: string }): { minutes: number; date: string } {
  if (override && env().allowTestClock) return override;
  return localNow(city.timezone);
}

export function sanitizeClock(v: any): { minutes: number; date: string } | undefined {
  if (v && Number.isFinite(v.minutes) && typeof v.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.date)) return { minutes: Math.max(0, Math.min(1439, Math.round(v.minutes))), date: v.date };
  return undefined;
}

/* ------------------------------------------------------------------ generate */

export async function generate(body: any): Promise<{ plan: DayPlan; meta: PlanMeta }> {
  const started = Date.now();
  const input = sanitizeCalibration(body?.calibration);
  if (!input.query && !input.cityId && !input.coords) throw new ApiError(400, 'empty_city', 'Enter a city or neighborhood to build your day.');
  const prefs = sanitizePrefs(body?.guardrails);
  const { city, anchor, label } = await resolveLocation(input);
  const now = clock(city, sanitizeClock(body?.now));
  const today = input.date || addDays(now.date, input.dayOffset === 1 ? 1 : 0);
  const calibration = buildCalibration({ ...input, coords: anchor, locationLabel: label }, city, today);
  calibration.afterDark = input.afterDark ?? prefs.afterDarkMode;
  const sunsetMinutes = sunsetFor(city, today);

  const { venues, source } = await getCandidates(city, calibration.anchorCoords, today, 2500);
  const ctx: PlanContext = { city, candidates: venues, sunsetMinutes, now };

  // Late start → compact 1–2 block option (PRD FR-001): handled by planWindow/targetBlockCount.
  const win = planWindow(calibration, sunsetMinutes, now);
  const wanted = targetBlockCount(win.length, calibration.energy, win.start);

  let hints; let usedFallback = true; let reason: string | undefined; let llm = false;
  if (wanted > 0) {
    const pool = rankPool(calibration, prefs, ctx, 20);
    const remainingBudget = BUDGET_TOTAL_MS() - (Date.now() - started);
    const out = await sequenceWithLlm({
      cityName: city.name, calibration, guardrails: prefs, pool, blocksWanted: wanted,
      windowStart: win.start, windowEnd: win.end, sunsetMinutes
    }, remainingBudget);
    if (out.ok) { hints = out.result.hints; usedFallback = false; llm = true; }
    else reason = out.reason;
  } else { reason = 'no_window'; }

  const plan = generatePlan(calibration, prefs, ctx, hints);
  plan.usedFallback = usedFallback;
  return { plan, meta: { usedFallback, fallbackReason: reason, llm, source, latencyMs: Date.now() - started } };
}

/* ------------------------------------------------------------------ adapt */

const cleanText = (v: unknown, max = 80) => String(v ?? '').replace(/[\u0000-\u001f<>{}`]/g, ' ').trim().slice(0, max);
const num2 = (v: unknown, lo: number, hi: number, d: number) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);

/** The server never trusts the plan the browser sends back: re-derive identity/enums/numbers, clamp text. */
function sanitizePlan(p: any): DayPlan {
  if (!p || typeof p !== 'object' || !Array.isArray(p.blocks) || !p.calibration || !p.city) throw new ApiError(400, 'bad_plan', 'Missing plan.');
  if (p.blocks.length > 8 || p.blocks.some((b: any) => !b?.venue?.placeId || !b?.blockId)) throw new ApiError(400, 'bad_plan', 'Malformed plan.');
  const known = typeof p.city.id === 'string' ? CITIES.find(c => c.id === p.city.id) : undefined;
  const city: CityData = known ?? {
    id: cleanText(p.city.id, 40) || 'geo', name: cleanText(p.city.name), country: cleanText(p.city.country, 40), tagline: '',
    coords: { lat: num2(p.city.coords?.lat, -90, 90, 0), lng: num2(p.city.coords?.lng, -180, 180, 0) },
    timezone: typeof p.city.timezone === 'string' && /^[A-Za-z_]+(\/[A-Za-z_+\-0-9]+)*$/.test(p.city.timezone) ? p.city.timezone : 'UTC',
    defaultSunset: '18:00', weatherVibe: '', heroImage: ''
  };
  const c = sanitizeCalibration(p.calibration);
  const calibration = {
    ...p.calibration,
    cityId: city.id, cityName: city.name, country: city.country,
    energy: c.energy ?? 'balanced', budget: c.budget ?? '₹₹', afterDark: c.afterDark ?? 'well_lit', social: c.social ?? 'ambient',
    date: c.date ?? new Date().toISOString().slice(0, 10), startTime: c.startTime ?? '09:30', endTime: c.endTime ?? '19:30',
    anchorCoords: { lat: num2(p.calibration.anchorCoords?.lat, -90, 90, city.coords.lat), lng: num2(p.calibration.anchorCoords?.lng, -180, 180, city.coords.lng) }
  };
  const blocks = p.blocks.map((b: any) => ({
    ...b,
    startMinutes: num2(b.startMinutes, 0, 2880, 0), endMinutes: num2(b.endMinutes, 0, 2880, 0),
    bufferMinutesAfter: num2(b.bufferMinutesAfter, 0, 120, 20),
    venue: { ...b.venue, name: cleanText(b.venue.name, 120), coords: { lat: num2(b.venue.coords?.lat, -90, 90, city.coords.lat), lng: num2(b.venue.coords?.lng, -180, 180, city.coords.lng) } }
  }));
  return { ...p, city, calibration, guardrails: sanitizePrefs(p.guardrails), blocks } as DayPlan;
}

const SCENARIOS = ['weather_turned', 'low_battery', 'running_late', 'hungry_now', 'shift_social', 'early_night'];

export async function adapt(body: any): Promise<{ plan: DayPlan; meta: PlanMeta }> {
  const started = Date.now();
  const plan = sanitizePlan(body?.plan);
  const scenarios: string[] = Array.isArray(body?.scenarios) ? body.scenarios.filter((s: unknown) => typeof s === 'string' && SCENARIOS.includes(s)) : [];
  const note = typeof body?.note === 'string' ? body.note.slice(0, 140) : '';
  if (!scenarios.length && !note.trim() && !body?.bonus) throw new ApiError(400, 'no_change', 'Pick what changed.');
  const city = plan.city;
  const now = clock(city, sanitizeClock(body?.now));
  const sunsetMinutes = sunsetFor(city, plan.calibration.date);
  const cc = body?.currentCoords;
  const currentCoords = cc && Number.isFinite(cc.lat) && Number.isFinite(cc.lng) ? { lat: Number(cc.lat), lng: Number(cc.lng) } : undefined;
  const center = currentCoords ?? plan.blocks.filter(b => b.status === 'completed').slice(-1)[0]?.venue.coords ?? plan.calibration.anchorCoords;
  const excludeIds: string[] = Array.isArray(body?.excludeIds) ? body.excludeIds.filter((x: unknown) => typeof x === 'string').slice(0, 100) : [];

  const { venues, source } = await getCandidates(city, center, plan.calibration.date, 2500);
  const ctx: PlanContext = { city, candidates: venues, sunsetMinutes, now, excludeIds };

  if (body?.bonus) {
    const out = addBonusStop(plan, ctx);
    out.usedFallback = true;
    return { plan: out, meta: { usedFallback: true, fallbackReason: 'bonus', llm: false, source, latencyMs: Date.now() - started } };
  }

  // Ask the LLM to re-sequence the remaining blocks, then let the deterministic adapter validate/schedule.
  const remaining = plan.blocks.filter(b => b.status !== 'completed' && b.status !== 'skipped').length;
  let hints; let usedFallback = true; let reason: string | undefined; let llm = false;
  if (remaining > 0 && !scenarios.includes('early_night')) {
    const done = plan.blocks.filter(b => b.status === 'completed');
    const pool = rankPool(plan.calibration, plan.guardrails, { ...ctx, excludeIds: [...excludeIds, ...done.map(b => b.venue.placeId)] }, 20);
    const out = await sequenceWithLlm({
      cityName: city.name, calibration: plan.calibration, guardrails: plan.guardrails, pool, blocksWanted: remaining,
      windowStart: Math.max(now.minutes, timeStringToMinutes(plan.calibration.startTime)),
      windowEnd: timeStringToMinutes(plan.calibration.endTime), sunsetMinutes,
      scenarios, note, alreadyDone: done.map(b => cleanText(venues.find(v => v.placeId === b.venue.placeId)?.name ?? b.venue.name, 60))
    }, BUDGET_TOTAL_MS() - (Date.now() - started));
    if (out.ok) { hints = out.result.hints; usedFallback = false; llm = true; } else reason = out.reason;
  } else reason = 'deterministic_scenario';

  const social = body?.socialShift === 'livelier' ? 'livelier' : 'quieter';
  const out = adaptPlan(plan, { scenarios, note, currentCoords, socialShift: social, hints }, ctx);
  out.usedFallback = usedFallback;
  return { plan: out, meta: { usedFallback, fallbackReason: reason, llm, source, latencyMs: Date.now() - started } };
}

/* ------------------------------------------------------------------ swap */

export async function swap(body: any): Promise<{ alternatives: VerifiedVenue[]; noNearbyBackup: boolean; source: string; latencyMs: number }> {
  const started = Date.now();
  const plan = sanitizePlan(body?.plan);
  const blockId = typeof body?.blockId === 'string' ? body.blockId : '';
  const block = plan.blocks.find(b => b.blockId === blockId);
  if (!block) throw new ApiError(400, 'bad_block', 'Unknown block.');
  const reason = ['vibe', 'distance', 'closed', 'food'].includes(body?.reason) ? body.reason : 'vibe';
  const excludeIds: string[] = Array.isArray(body?.excludeIds) ? body.excludeIds.filter((x: unknown) => typeof x === 'string').slice(0, 100) : [];
  if (reason === 'closed') excludeIds.push(block.venue.placeId);
  const city = plan.city;
  const now = clock(city, sanitizeClock(body?.now));
  const { venues, source } = await getCandidates(city, block.venue.coords, plan.calibration.date, 2500);
  const r = swapAlternatives(plan, blockId, reason, { city, candidates: venues, sunsetMinutes: sunsetFor(city, plan.calibration.date), now, excludeIds });
  return { ...r, source, latencyMs: Date.now() - started };
}

/* ------------------------------------------------------------------ logging */

/** Structured log line. Coordinates are coarsened to city level (PRD §25). */
export function logEvent(name: string, props: Record<string, unknown> = {}) {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v && typeof v === 'object' && 'lat' in (v as object) && 'lng' in (v as object)) safe[k] = truncateCoords(v as Coordinates);
    else safe[k] = v;
  }
  if (process.env.NODE_ENV !== 'test') console.log(JSON.stringify({ t: new Date().toISOString(), event: name, ...safe }));
}

export { approxTimezone, DEFAULT_PREFS };
