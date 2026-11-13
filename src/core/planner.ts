/**
 * PlanB deterministic planner — pure functions, shared by the server (as the
 * grounded fallback and as the validating scheduler behind the LLM) and the
 * client (fast local mode). No I/O, no globals.
 *
 * Guarantees (PRD §16/§18/§21):
 *  - 3–4 blocks for a 6h+ window; 1–2 for short/late windows
 *  - every block is open for its full duration (+45m closing margin)
 *  - `before_dark`: last block ends >= 30 min before sunset
 *  - buffers >= 15 min between blocks
 *  - completed blocks are never mutated by adaptation
 */
import type {
  AdaptationSummary, BudgetTier, CalibrationData, CityData, Coordinates, DayPlan,
  PlanBlock, TravelerPreferences, VerifiedVenue
} from '../types/itinerary';
import { haversineKm, walkMinutes } from './geo';
import { isOpenForBlock, openUntilLabel, openWindow } from './hours';
import { minutesToTimeString, timeStringToMinutes } from './time';

export const MIN_BUFFER = 15;
export const SUNSET_MARGIN = 30;

export const priceRank = (t: BudgetTier | string): number =>
  t === '$' || t === '₹' ? 1 : t === '$$' || t === '₹₹' ? 2 : 3;

export type NoiseClass = 'quiet' | 'ambient' | 'lively';
export function noiseClass(v: Pick<VerifiedVenue, 'noiseLevel'>): NoiseClass {
  const n = (v.noiseLevel || '').toLowerCase();
  if (/(quiet|hush|tranquil|peaceful|serene|calm|gentle|soft|birdsong|scholarly)/.test(n)) return 'quiet';
  if (/(lively|bustle|busy|crowd|chatter|buzz|brisk|bazaar)/.test(n)) return 'lively';
  return 'ambient';
}

export const isFood = (v: Pick<VerifiedVenue, 'category'>) =>
  v.category === 'dining' || v.category === 'market' || v.category === 'bakery' || v.category === 'cafe';

export interface PlanContext {
  city: CityData;
  candidates: VerifiedVenue[];
  excludeIds?: Iterable<string>;
  sunsetMinutes: number;
  /** Local "now" (minutes since midnight + ISO date) if the plan is for today. */
  now?: { minutes: number; date: string };
}

export interface LlmHint {
  placeId: string;
  whyItFits?: string;
  soloTip?: string;
}

/* ------------------------------------------------------------------ guardrails */

export function passesGuardrails(v: VerifiedVenue, g: Partial<TravelerPreferences>): boolean {
  const tags = v.tags ?? [];
  const diet = g.dietary ?? [];
  if (diet.includes('vegetarian') && tags.includes('non_veg')) return false;
  if (diet.includes('alcohol_free') && tags.includes('alcohol')) return false;
  if (g.mobility === 'avoid_hills' && tags.includes('steep')) return false;
  if (g.mobility === 'step_free' && (tags.includes('steep') || tags.includes('steps'))) return false;
  return true;
}

/* ------------------------------------------------------------------ scoring */

type SlotName = 'morning' | 'lunch' | 'afternoon' | 'evening';
export function slotFor(mid: number): SlotName {
  if (mid < 11 * 60 + 30) return 'morning';
  if (mid < 14 * 60 + 30) return 'lunch';
  if (mid < 17 * 60) return 'afternoon';
  return 'evening';
}

const SLOT_CATS: Record<SlotName, string[]> = {
  morning: ['walk', 'viewpoint', 'culture', 'cafe', 'bakery'],
  lunch: ['dining', 'market', 'cafe', 'bakery'],
  afternoon: ['culture', 'cafe', 'walk', 'market'],
  evening: ['viewpoint', 'market', 'dining', 'walk']
};

export interface ScoreOpts {
  slot: SlotName;
  calib: Pick<CalibrationData, 'energy' | 'budget' | 'afterDark' | 'social'>;
  from: Coordinates;
  indoorOnly?: boolean;
  preferPlugs?: boolean;
  wantFood?: boolean;
  socialOverride?: 'quieter' | 'livelier';
  noteWords?: string[];
  preferIds?: Set<string>;
  maxWalk: number;
}

export function scoreVenue(v: VerifiedVenue, o: ScoreOpts): number {
  let s = 0;
  const catIdx = SLOT_CATS[o.slot].indexOf(v.category);
  s += catIdx >= 0 ? 6 - catIdx : 0;
  if (v.timeSlot === o.slot) s += 3;
  s += (v.rating - 4) * 2;

  const budget = priceRank(o.calib.budget);
  const price = priceRank(v.priceLevel);
  if (price > budget) s -= 4 * (price - budget);
  else if (price === budget) s += 0.5;

  const noise = noiseClass(v);
  const social = o.socialOverride === 'quieter' ? 'solitude' : o.socialOverride === 'livelier' ? 'social' : o.calib.social;
  if (social === 'solitude') s += noise === 'quiet' ? 3 : noise === 'lively' ? -3 : 0;
  if (social === 'social') s += noise === 'lively' ? 3 : noise === 'quiet' ? -2 : 1;
  if (social === 'ambient') s += noise === 'ambient' ? 1.5 : 0;

  if (o.calib.energy === 'gentle') {
    if (v.isIndoor) s += 1.5;
    if (v.category === 'walk') s -= 1.5;
  }
  if (o.calib.energy === 'active' && (v.category === 'walk' || v.category === 'viewpoint')) s += 2;

  // Well-lit evening: favour busy, popular corridors as a proxy for foot traffic.
  if (o.calib.afterDark === 'well_lit' && o.slot === 'evening') {
    if (v.reviewsCount >= 5000 || noise === 'lively' || v.category === 'market') s += 2;
    if (!v.isIndoor && v.reviewsCount < 1000) s -= 1;
  }

  if (o.indoorOnly && !v.isIndoor) s -= 100;
  if (o.preferPlugs && v.hasPlugs) s += 4;
  if (o.wantFood) s += isFood(v) ? 6 : -4;
  if (o.preferIds?.has(v.placeId)) s += 2;

  if (o.noteWords?.length) {
    const hay = `${v.name} ${v.category} ${v.subCategory}`.toLowerCase();
    if (o.noteWords.some(w => hay.includes(w))) s += 4;
  }

  // Shorter legs are always kinder.
  const wm = walkMinutes(o.from, v.coords);
  s -= wm / 12;
  if (wm > o.maxWalk) s -= 1.5;
  return s;
}

/** Keywords from the optional adapt note, used only for gentle ranking (never sent as an instruction). */
export function noteKeywords(note: string): string[] {
  const stop = new Set(['the', 'and', 'for', 'some', 'want', 'need', 'something', 'with', 'a', 'to', 'i', 'my', 'me', 'of']);
  return note.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !stop.has(w)).slice(0, 6);
}

/* ------------------------------------------------------------------ helpers */

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
let blockCounter = 0;
const newBlockId = () => `blk_${Date.now().toString(36)}_${(blockCounter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function snapshotOf(plan: DayPlan): DayPlan {
  const s = clone({ ...plan, previousSnapshot: null });
  return s as DayPlan;
}

function strideCap(g: Partial<TravelerPreferences>, energy: string): number {
  const base = g.maxStrideMinutes ?? 25;
  if (g.mobility === 'transit_first') return Math.min(base, 12);
  return energy === 'gentle' ? Math.min(base, 20) : base;
}

function dwellFor(v: VerifiedVenue, energy: string): number {
  const f = energy === 'gentle' ? 1.1 : energy === 'active' ? 0.95 : 1;
  return Math.max(25, Math.round((v.suggestedDuration || 60) * f / 5) * 5);
}

/** Cap prose to two sentences (PRD §16: <=2-sentence rationale). */
export function twoSentences(text: string): string {
  const parts = (text || '').match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [text];
  return parts.slice(0, 2).join('').trim();
}

const BANNED = /\b(must[- ]see|hurry|don'?t miss|last chance|limited time|now or never|unmissable|run)\b/i;
export const toneSafe = (t: string) => !BANNED.test(t);

function fitLine(v: VerifiedVenue, calib: Pick<CalibrationData, 'social' | 'energy' | 'afterDark'>, slot: SlotName): string {
  const bits: string[] = [];
  const noise = noiseClass(v);
  if (calib.social === 'solitude' && noise === 'quiet') bits.push('Quiet setting');
  else if (calib.social === 'social' && noise === 'lively') bits.push('Lively crowd');
  else if (calib.energy === 'gentle' && v.isIndoor) bits.push('Easy, indoors');
  else if (calib.energy === 'active' && (v.category === 'walk' || v.category === 'viewpoint')) bits.push('Room to stretch your legs');
  else if (calib.afterDark === 'well_lit' && slot === 'evening') bits.push('Busy, well-lit area');
  else bits.push(v.isIndoor ? 'Indoors' : 'Outdoors');
  const w = openWindow(v);
  const allDay = w.open === 0 && w.close >= 1439;
  bits.push(allDay ? 'Open all day' : `Open until ${openUntilLabel(v)}`);
  const src = v.source === 'google_places' ? 'Verified via Google Places' : 'Curated listing · check Maps for today’s hours';
  bits.push(src);
  return bits.join(' · ');
}

interface Placement { start: number; end: number; transit: number; wait: number }

/** Try to place a venue after `cursor` (end of previous block + buffer). */
function place(
  v: VerifiedVenue, cursor: number, prev: Coordinates | null, windowEnd: number,
  energy: string, cap: number
): Placement | null {
  const walk = prev ? walkMinutes(prev, v.coords) : 0;
  const transit = prev ? (walk > cap ? Math.max(8, Math.round(walk / 3)) : walk) : 0;
  let start = cursor + transit;
  const w = openWindow(v);
  let wait = 0;
  if (start < w.open) {
    wait = w.open - start;
    if (wait > 45) return null;
    start = w.open;
  }
  const end = start + dwellFor(v, energy);
  if (end > windowEnd) return null;
  if (!isOpenForBlock(v, start, end)) return null;
  return { start, end, transit, wait };
}

function transitLabel(pl: Placement, walk: number, cap: number, first: boolean): string {
  if (first) return 'Starting point';
  if (walk > cap) return `${pl.transit} min by auto or taxi`;
  return `${pl.transit} min walk`;
}

function makeBlock(
  seq: number, v: VerifiedVenue, pl: Placement, prev: Coordinates | null, cap: number,
  calib: Pick<CalibrationData, 'social' | 'energy' | 'afterDark'>, hint?: LlmHint, extra: Partial<PlanBlock> = {}
): PlanBlock {
  const walk = prev ? walkMinutes(prev, v.coords) : 0;
  const slot = slotFor((pl.start + pl.end) / 2);
  const why = hint?.whyItFits && toneSafe(hint.whyItFits) ? twoSentences(hint.whyItFits) : twoSentences(v.whyItFits);
  const tip = hint?.soloTip && toneSafe(hint.soloTip) ? twoSentences(hint.soloTip) : twoSentences(v.soloPerk);
  return {
    blockId: newBlockId(),
    sequence: seq,
    timeLabel: `${minutesToTimeString(pl.start)} – ${minutesToTimeString(pl.end)}`,
    startMinutes: pl.start,
    endMinutes: pl.end,
    status: 'upcoming',
    venue: v,
    bufferMinutesAfter: Math.max(MIN_BUFFER, v.bufferAfter || 20),
    transitFromPrev: transitLabel(pl, walk, cap, !prev),
    whyItFits: why,
    soloTip: tip,
    isIndoor: v.isIndoor,
    isAdapted: false,
    fitLine: fitLine(v, calib, slot),
    ...extra
  };
}

/* ------------------------------------------------------------------ window + target */

export function planWindow(
  calib: Pick<CalibrationData, 'startTime' | 'endTime' | 'afterDark' | 'date'>,
  sunsetMinutes: number,
  now?: { minutes: number; date: string }
) {
  let start = timeStringToMinutes(calib.startTime || '09:30');
  let end = timeStringToMinutes(calib.endTime || '19:30');
  if (end <= start) end = start + 8 * 60;
  if (now && now.date === calib.date && now.minutes + 10 > start) {
    start = Math.ceil((now.minutes + 10) / 5) * 5;
  }
  if (calib.afterDark === 'before_dark') end = Math.min(end, sunsetMinutes - SUNSET_MARGIN);
  return { start, end, length: end - start };
}

export function targetBlockCount(length: number, energy: string, startMin = 0): number {
  if (length < 45) return 0;
  // Late-night start → compact 1–2 block evening option (PRD FR-001).
  if (startMin >= 17 * 60 + 30) return length < 120 ? 1 : 2;
  if (length < 120) return 1;
  if (length < 210) return 2;
  const max = energy === 'gentle' ? 3 : energy === 'active' ? 4 : length >= 360 ? 4 : 3;
  return Math.max(3, Math.min(max, Math.floor(length / 100)));
}

/* ------------------------------------------------------------------ candidate pool for LLM */

/** Rank/trim the candidate pool (PRD §18: cap context at 20 candidates). */
export function rankPool(
  calib: CalibrationData, g: Partial<TravelerPreferences>, ctx: PlanContext, limit = 20
): VerifiedVenue[] {
  const excl = new Set(ctx.excludeIds ?? []);
  const win = planWindow(calib, ctx.sunsetMinutes, ctx.now);
  const anchor = calib.anchorCoords;
  const cap = strideCap(g, calib.energy);
  const eligible = ctx.candidates.filter(v => {
    if (excl.has(v.placeId) || !passesGuardrails(v, g)) return false;
    const w = openWindow(v);
    return w.close > win.start + 30 && w.open < win.end - 30;
  });
  const scored = eligible.map(v => {
    let best = -Infinity;
    for (const slot of ['morning', 'lunch', 'afternoon', 'evening'] as SlotName[]) {
      best = Math.max(best, scoreVenue(v, { slot, calib, from: anchor, maxWalk: cap }));
    }
    return { v, s: best };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map(x => x.v);
}

/* ------------------------------------------------------------------ generate */

export function generatePlan(
  calibration: CalibrationData,
  guardrails: TravelerPreferences,
  ctx: PlanContext,
  hints: LlmHint[] = []
): DayPlan {
  const excl = new Set(ctx.excludeIds ?? []);
  const win = planWindow(calibration, ctx.sunsetMinutes, ctx.now);
  const target = targetBlockCount(win.length, calibration.energy, win.start);
  const cap = strideCap(guardrails, calibration.energy);
  const pool = ctx.candidates.filter(v => !excl.has(v.placeId) && passesGuardrails(v, guardrails));
  const byId = new Map(pool.map(v => [v.placeId, v]));
  const used = new Set<string>();

  const blocks: PlanBlock[] = [];
  let cursor = win.start;
  let prev: Coordinates | null = null;

  for (let i = 0; i < target; i++) {
    let chosen: { v: VerifiedVenue; pl: Placement; hint?: LlmHint } | null = null;

    const hint = hints[i];
    const hv = hint && byId.get(hint.placeId);
    if (hv && !used.has(hv.placeId)) {
      const pl = place(hv, cursor, prev, win.end, calibration.energy, cap);
      if (pl) chosen = { v: hv, pl, hint };
    }

    if (!chosen) {
      let best = -Infinity;
      for (const v of pool) {
        if (used.has(v.placeId)) continue;
        const pl = place(v, cursor, prev, win.end, calibration.energy, cap);
        if (!pl) continue;
        const slot = slotFor((pl.start + pl.end) / 2);
        let sc = scoreVenue(v, { slot, calib: calibration, from: prev ?? calibration.anchorCoords, maxWalk: cap });
        sc -= pl.wait / 30;
        // Avoid two food stops back-to-back and repeating a category.
        const last = blocks[blocks.length - 1];
        if (last && last.venue.category === v.category) sc -= 2.5;
        if (last && isFood(last.venue) && isFood(v) && v.category !== 'cafe') sc -= 3;
        if (sc > best) { best = sc; chosen = { v, pl }; }
      }
    }
    if (!chosen) break;

    used.add(chosen.v.placeId);
    blocks.push(makeBlock(blocks.length + 1, chosen.v, chosen.pl, prev, cap, calibration, chosen.hint));
    prev = chosen.v.coords;
    cursor = chosen.pl.end + Math.max(MIN_BUFFER, chosen.v.bufferAfter || 20);
  }

  if (blocks.length) blocks[0].status = 'in_progress';

  return {
    planId: `plan_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    city: ctx.city,
    calibration,
    guardrails,
    localSunsetTime: minutesToTimeString(ctx.sunsetMinutes),
    blocks,
    previousSnapshot: null,
    createdAt: new Date().toISOString(),
    dataSource: pool.some(v => v.source === 'google_places') ? 'google_places' : 'curated',
    needsTomorrow: win.length < 45 && calibration.afterDark === 'before_dark'
  };
}

/* ------------------------------------------------------------------ adapt */

export interface AdaptOptions {
  scenarios: string[];
  note?: string;
  currentCoords?: Coordinates;
  socialShift?: 'quieter' | 'livelier';
  /** Validated LLM suggestions, by block index (only a ranking nudge + copy; never bypasses hours/guardrails). */
  hints?: LlmHint[];
}

export function adaptPlan(plan: DayPlan, opts: AdaptOptions, ctx: PlanContext): DayPlan {
  const snapshot = snapshotOf(plan);
  const sc = new Set(opts.scenarios);
  const calib = plan.calibration;
  const g = plan.guardrails;
  const frozen = plan.blocks.filter(b => b.status === 'completed' || b.status === 'skipped');
  const remaining = plan.blocks.filter(b => b.status !== 'completed' && b.status !== 'skipped');
  const excl = new Set<string>([...(ctx.excludeIds ?? []), ...frozen.map(b => b.venue.placeId)]);
  const cap = sc.has('low_battery') ? Math.min(strideCap(g, calib.energy), 12) : strideCap(g, calib.energy);

  // Where the traveler is now: GPS if offered, else last finished stop, else the anchor.
  const lastFrozen = frozen[frozen.length - 1];
  const from: Coordinates = opts.currentCoords ?? lastFrozen?.venue.coords ?? calib.anchorCoords;

  // Earliest time the new plan can start (never in the past, never before frozen blocks end).
  const nowMin = ctx.now && ctx.now.date === calib.date ? ctx.now.minutes : null;
  let cursor = Math.max(
    lastFrozen ? lastFrozen.endMinutes + Math.max(MIN_BUFFER, lastFrozen.bufferMinutesAfter) : 0,
    nowMin !== null ? Math.ceil(nowMin / 5) * 5 : 0,
    remaining[0]?.startMinutes ?? 0
  );
  if (nowMin !== null && !lastFrozen) cursor = Math.max(cursor, Math.ceil(nowMin / 5) * 5);
  if (sc.has('running_late')) cursor += 30;

  let windowEnd = timeStringToMinutes(calib.endTime || '19:30');
  if (calib.afterDark === 'before_dark') windowEnd = Math.min(windowEnd, ctx.sunsetMinutes - SUNSET_MARGIN);
  if (windowEnd <= cursor) windowEnd = Math.max(windowEnd, cursor + 60);

  const pool = ctx.candidates.filter(v => !excl.has(v.placeId) && passesGuardrails(v, g));
  const preferIds = new Set(remaining.map(b => b.venue.placeId));
  const noteWords = opts.note ? noteKeywords(opts.note) : [];

  let targetCount = remaining.length;
  let oneOff: 'early_night' | null = null;
  if (sc.has('early_night')) { targetCount = 1; oneOff = 'early_night'; windowEnd = Math.min(windowEnd, Math.max(cursor + 75, windowEnd)); }

  const newBlocks: PlanBlock[] = [];
  let prev: Coordinates = from;
  let first = true;

  for (let i = 0; i < targetCount; i++) {
    let best: { v: VerifiedVenue; pl: Placement } | null = null;
    let bestScore = -Infinity;
    for (const v of pool) {
      if (newBlocks.some(b => b.venue.placeId === v.placeId)) continue;
      if (sc.has('weather_turned') && !v.isIndoor) continue;
      if (oneOff === 'early_night') {
        const quick = /takeaway|takeout|counter/i.test(`${v.subCategory} ${v.name}`) || ((v.suggestedDuration || 60) <= 45 && isFood(v));
        if (!quick) continue;
      }
      const pl = place(v, cursor, prev, windowEnd, calib.energy, cap);
      if (!pl) continue;
      if (oneOff === 'early_night') pl.end = Math.min(pl.end, pl.start + 40);
      const slot = slotFor((pl.start + pl.end) / 2);
      let s = scoreVenue(v, {
        slot, calib, from: prev, maxWalk: cap,
        indoorOnly: sc.has('weather_turned'),
        preferPlugs: sc.has('low_battery'),
        wantFood: (sc.has('hungry_now') && i === 0) || oneOff === 'early_night',
        socialOverride: sc.has('shift_social') ? opts.socialShift ?? 'quieter' : undefined,
        noteWords, preferIds
      });
      s -= pl.wait / 30;
      if (opts.hints?.[i]?.placeId === v.placeId) s += 8;
      const last = newBlocks[newBlocks.length - 1] ?? lastFrozen;
      if (last && last.venue.category === v.category) s -= 2.5;
      if (s > bestScore) { bestScore = s; best = { v, pl }; }
    }
    if (!best) break;
    const reason = adaptationLabel(best.v, remaining[i], sc);
    const hintHere = opts.hints?.[i]?.placeId === best.v.placeId ? opts.hints[i] : undefined;
    const blk = makeBlock(frozen.length + newBlocks.length + 1, best.v, best.pl, first ? from : prev, cap, calib, hintHere, {
      isAdapted: false
    });
    if (first) blk.transitFromPrev = lastFrozen || opts.currentCoords ? blk.transitFromPrev.replace('Starting point', 'From where you are') : blk.transitFromPrev;
    if (oneOff === 'early_night') {
      blk.whyItFits = 'A quick pick-up on the way back — resting early is a good plan.';
      blk.soloTip = twoSentences(best.v.soloPerk);
      blk.isIndoor = true;
    }
    (blk as PlanBlock & { _reason?: string })._reason = reason;
    newBlocks.push(blk);
    prev = best.v.coords;
    cursor = best.pl.end + Math.max(MIN_BUFFER, best.v.bufferAfter || 20);
    first = false;
  }

  // Diff against previous remaining blocks.
  const changed: string[] = [];
  const kept: string[] = frozen.map(b => b.blockId);
  newBlocks.forEach((nb, i) => {
    const old = remaining[i];
    const same = old && old.venue.placeId === nb.venue.placeId && old.startMinutes === nb.startMinutes;
    if (same) {
      nb.blockId = old.blockId;
      kept.push(nb.blockId);
    } else {
      nb.isAdapted = true;
      nb.adaptationReason = (nb as PlanBlock & { _reason?: string })._reason || 'Updated for you';
      changed.push(nb.blockId);
    }
    delete (nb as PlanBlock & { _reason?: string })._reason;
  });
  const removedNames = remaining
    .filter(ob => !newBlocks.some(nb => nb.venue.placeId === ob.venue.placeId))
    .map(ob => ob.venue.name);

  const merged = [...frozen, ...newBlocks].map((b, i) => ({ ...b, sequence: i + 1 }));
  const nextIdx = merged.findIndex(b => b.status !== 'completed' && b.status !== 'skipped');
  merged.forEach((b, i) => { if (b.status === 'in_progress' && i !== nextIdx) b.status = 'upcoming'; });
  if (nextIdx >= 0) merged[nextIdx].status = 'in_progress';

  const summary: AdaptationSummary = {
    scenarios: opts.scenarios,
    changedBlockIds: changed,
    keptBlockIds: kept,
    removedNames,
    at: new Date().toISOString(),
    message: adaptMessage(changed.length, frozen.length, sc, newBlocks.length)
  };

  return {
    ...plan,
    blocks: merged,
    previousSnapshot: snapshot,
    adaptedAt: summary.at,
    activeScenarios: opts.scenarios,
    optionalNote: opts.note,
    lastAdaptation: summary,
    allDone: remaining.length === 0
  };
}

function adaptationLabel(v: VerifiedVenue, old: PlanBlock | undefined, sc: Set<string>): string {
  if (sc.has('early_night')) return 'Easy evening pick-up';
  if (sc.has('weather_turned') && v.isIndoor && !(old?.isIndoor)) return 'Indoors';
  if (sc.has('low_battery') && v.hasPlugs) return 'Power outlets';
  if (sc.has('hungry_now') && isFood(v)) return 'Food stop';
  if (sc.has('shift_social')) return 'Social shift';
  if (sc.has('running_late')) return 'Re-timed';
  return 'Updated for you';
}

function adaptMessage(changed: number, frozen: number, sc: Set<string>, total: number): string {
  if (sc.has('early_night')) return total ? 'Wrapped up early with one easy pick-up.' : 'Nothing more planned — enjoy the rest.';
  const keep = frozen ? ` ${frozen} finished stop${frozen > 1 ? 's' : ''} kept as is.` : '';
  if (!changed) return `Your remaining stops already fit.${keep}`;
  return `${changed} stop${changed > 1 ? 's' : ''} updated.${keep}`;
}

/* ------------------------------------------------------------------ bonus stop */

export function addBonusStop(plan: DayPlan, ctx: PlanContext): DayPlan {
  const calib = plan.calibration;
  const used = new Set(plan.blocks.map(b => b.venue.placeId));
  const last = plan.blocks[plan.blocks.length - 1];
  const cursor = Math.max(last ? last.endMinutes + MIN_BUFFER : 0, ctx.now?.minutes ?? 0);
  let windowEnd = timeStringToMinutes(calib.endTime || '19:30') + 60;
  if (calib.afterDark === 'before_dark') windowEnd = Math.min(windowEnd, ctx.sunsetMinutes - SUNSET_MARGIN);
  const cap = strideCap(plan.guardrails, calib.energy);
  let best: { v: VerifiedVenue; pl: Placement } | null = null;
  let bs = -Infinity;
  for (const v of ctx.candidates) {
    if (used.has(v.placeId) || !passesGuardrails(v, plan.guardrails)) continue;
    if ([...(ctx.excludeIds ?? [])].includes(v.placeId)) continue;
    const pl = place(v, cursor, last?.venue.coords ?? calib.anchorCoords, windowEnd, calib.energy, cap);
    if (!pl) continue;
    const s = scoreVenue(v, { slot: slotFor((pl.start + pl.end) / 2), calib, from: last?.venue.coords ?? calib.anchorCoords, maxWalk: cap });
    if (s > bs) { bs = s; best = { v, pl }; }
  }
  if (!best) return { ...plan, allDone: true };
  const blk = makeBlock(plan.blocks.length + 1, best.v, best.pl, last?.venue.coords ?? null, cap, calib, undefined, {
    isBonus: true, isAdapted: true, adaptationReason: 'Optional bonus'
  });
  return {
    ...plan,
    blocks: [...plan.blocks, blk],
    previousSnapshot: snapshotOf(plan),
    allDone: false,
    lastAdaptation: {
      scenarios: ['bonus'], changedBlockIds: [blk.blockId], keptBlockIds: plan.blocks.map(b => b.blockId),
      removedNames: [], at: new Date().toISOString(), message: 'One optional bonus stop added.'
    }
  };
}

/* ------------------------------------------------------------------ swap */

export interface SwapResult {
  alternatives: VerifiedVenue[];
  noNearbyBackup: boolean;
}

export function swapAlternatives(
  plan: DayPlan, blockId: string, reason: string, ctx: PlanContext
): SwapResult {
  const block = plan.blocks.find(b => b.blockId === blockId);
  if (!block) return { alternatives: [], noNearbyBackup: true };
  const idx = plan.blocks.indexOf(block);
  const prevBlock = plan.blocks[idx - 1];
  const from = block.venue.coords;
  const used = new Set(plan.blocks.map(b => b.venue.placeId));
  const excl = new Set(ctx.excludeIds ?? []);
  excl.add(block.venue.placeId);
  const calib = plan.calibration;
  const g = plan.guardrails;
  const cap = strideCap(g, calib.energy);
  const slot = slotFor((block.startMinutes + block.endMinutes) / 2);

  const eligible = ctx.candidates.filter(v => {
    if (used.has(v.placeId) || excl.has(v.placeId) || !passesGuardrails(v, g)) return false;
    if (reason === 'food' && !isFood(v)) return false;
    return isOpenForBlock(v, block.startMinutes, Math.max(block.endMinutes, block.startMinutes + Math.min(dwellFor(v, calib.energy), 90)));
  });

  const rank = (radiusMin: number) => eligible
    .map(v => {
      const wm = walkMinutes(reason === 'distance' && prevBlock ? prevBlock.venue.coords : from, v.coords);
      let s = scoreVenue(v, { slot, calib, from, maxWalk: cap, wantFood: reason === 'food' });
      if (reason === 'vibe' && v.category === block.venue.category) s -= 3;
      if (reason === 'distance') s -= wm / 4;
      return { v, s, wm };
    })
    .filter(x => x.wm <= radiusMin)
    .sort((a, b) => b.s - a.s);

  const nearLimit = reason === 'closed' ? 5 : Math.min(15, cap);
  let ranked = rank(nearLimit);
  let noNearby = false;
  if (ranked.length < 2) {
    noNearby = true;
    ranked = rank(Math.max(cap, 60));
  }

  // Two distinct sub-categories, both different from the rejected block (PRD FR-005).
  const picks: VerifiedVenue[] = [];
  for (const x of ranked) {
    if (x.v.subCategory === block.venue.subCategory) continue;
    if (picks.some(p => p.subCategory === x.v.subCategory)) continue;
    picks.push(x.v);
    if (picks.length === 2) break;
  }
  for (const x of ranked) {
    if (picks.length === 2) break;
    if (!picks.includes(x.v)) picks.push(x.v);
  }
  return { alternatives: picks, noNearbyBackup: noNearby && picks.length < 2 };
}

export function applyBlockSwap(plan: DayPlan, blockId: string, venue: VerifiedVenue): DayPlan {
  const snapshot = snapshotOf(plan);
  const cap = strideCap(plan.guardrails, plan.calibration.energy);
  const blocks = plan.blocks.map((b, i) => {
    if (b.blockId !== blockId) return b;
    const prev = plan.blocks[i - 1];
    const walk = prev ? walkMinutes(prev.venue.coords, venue.coords) : 0;
    const end = Math.min(b.endMinutes, b.startMinutes + dwellFor(venue, plan.calibration.energy));
    const nb: PlanBlock = {
      ...b,
      venue,
      endMinutes: Math.max(end, b.startMinutes + 25),
      timeLabel: `${minutesToTimeString(b.startMinutes)} – ${minutesToTimeString(Math.max(end, b.startMinutes + 25))}`,
      isIndoor: venue.isIndoor,
      whyItFits: twoSentences(venue.whyItFits),
      soloTip: twoSentences(venue.soloPerk),
      fitLine: fitLine(venue, plan.calibration, slotFor((b.startMinutes + b.endMinutes) / 2)),
      isAdapted: true,
      adaptationReason: 'Swapped stop',
      transitFromPrev: prev ? (walk > cap ? `${Math.max(8, Math.round(walk / 3))} min by auto or taxi` : `${walk} min walk`) : b.transitFromPrev,
      bufferMinutesAfter: Math.max(MIN_BUFFER, venue.bufferAfter || 20)
    };
    return nb;
  });
  return {
    ...plan,
    blocks,
    previousSnapshot: snapshot,
    lastAdaptation: {
      scenarios: ['swap'], changedBlockIds: [blockId],
      keptBlockIds: plan.blocks.filter(b => b.blockId !== blockId).map(b => b.blockId),
      removedNames: [], at: new Date().toISOString(), message: `Swapped to ${venue.name}.`
    }
  };
}

export function undoMutation(plan: DayPlan): DayPlan {
  if (!plan.previousSnapshot) return plan;
  const restored = clone(plan.previousSnapshot) as DayPlan;
  restored.previousSnapshot = null;
  return restored;
}

export { haversineKm };
