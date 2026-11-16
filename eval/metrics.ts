/** Plan-quality scoring shared by the offline (CI) and live evals. */
import { isOpenForBlock } from '../src/core/hours';
import { haversineKm, walkMinutes } from '../src/core/geo';
import { isFood, passesGuardrails } from '../src/core/planner';
import type { DayPlan } from '../src/types/itinerary';

export interface PlanScore {
  /** Hard rules: any violation is a bug. */
  hard: string[];
  /** Soft quality signals. */
  consecutiveFood: number;
  diversity: number; // distinct categories / blocks
  anchorPresent: boolean | null; // null when not applicable (short windows)
  walkKm: number;
  maxLegMin: number;
  blocks: number;
}

import { EXCLUDED_TYPES as BAD_TYPES } from '../server/places';

export interface WindowInfo { startMin: number; usableMin: number }

/** An "anchor" is a headline sight: culture/viewpoint, well rated (and, for live data, widely reviewed). */
const isAnchor = (v: DayPlan['blocks'][number]['venue'], minReviews: number) =>
  (v.category === 'culture' || v.category === 'viewpoint') && v.rating >= 4.4 && v.reviewsCount >= minReviews;

export function scorePlan(plan: DayPlan, sunsetMinutes: number, win: WindowInfo, anchorMinReviews = 0): PlanScore {
  const fullDay = win.usableMin >= 6 * 60 && win.startMin < 17 * 60 + 30;
  const hard: string[] = [];
  const b = plan.blocks;
  const seen = new Set<string>();
  b.forEach((blk, i) => {
    if (!isOpenForBlock(blk.venue, blk.startMinutes, blk.endMinutes)) hard.push(`closed:${blk.venue.name}@${blk.timeLabel}`);
    if (blk.endMinutes <= blk.startMinutes) hard.push(`non-positive-duration:${blk.venue.name}`);
    if (seen.has(blk.venue.placeId)) hard.push(`duplicate:${blk.venue.name}`);
    seen.add(blk.venue.placeId);
    if (!passesGuardrails(blk.venue, plan.guardrails)) hard.push(`guardrail:${blk.venue.name}`);
    const badType = (blk.venue.googleTypes ?? []).find(t => BAD_TYPES.has(t));
    if (badType) hard.push(`bad-venue-type(${badType}):${blk.venue.name}`);
    if (i > 0 && blk.startMinutes < b[i - 1].endMinutes + 15) hard.push(`buffer<15:${blk.venue.name}`);
    if (blk.bufferMinutesAfter < 15) hard.push(`buffer-field<15:${blk.venue.name}`);
    if (plan.calibration.afterDark === 'before_dark' && blk.endMinutes > sunsetMinutes - 30) hard.push(`after-sunset-cutoff:${blk.venue.name}`);
  });
  // PRD §16: a 6h+ window yields 3–4 blocks; late-night starts are compact (1–2). Anything else: 0–4.
  if (fullDay && (b.length < 3 || b.length > 4)) hard.push(`block-count:${b.length}`);
  if (win.startMin >= 17 * 60 + 30 && b.length > 2) hard.push(`late-start-block-count:${b.length}`);
  if (b.length > 4) hard.push(`block-count:${b.length}`);

  let consecutiveFood = 0;
  for (let i = 1; i < b.length; i++) if (isFood(b[i].venue) && isFood(b[i - 1].venue)) consecutiveFood++;
  const cats = new Set(b.map(x => x.venue.category));
  let walk = 0; let maxLeg = 0;
  b.forEach((blk, i) => {
    if (i === 0) return;
    walk += haversineKm(b[i - 1].venue.coords, blk.venue.coords) * 1.25;
    const w = walkMinutes(b[i - 1].venue.coords, blk.venue.coords);
    // Past the walking cap the planner switches to an auto/taxi leg (~3x faster) — measure the real transit time.
    maxLeg = Math.max(maxLeg, w > (plan.guardrails.maxStrideMinutes ?? 25) ? Math.max(8, Math.round(w / 3)) : w);
  });
  const anchorPresent = fullDay ? b.some(x => isAnchor(x.venue, anchorMinReviews)) : null;
  return { hard, consecutiveFood, diversity: b.length ? cats.size / b.length : 0, anchorPresent, walkKm: Math.round(walk * 10) / 10, maxLegMin: maxLeg, blocks: b.length };
}

export interface Summary { n: number; hardViolations: number; hardCases: number; consecutiveFoodRate: number; anchorRate: number; avgDiversity: number; avgWalkKm: number; p95LegMin: number }

export function summarise(scores: PlanScore[]): Summary {
  const n = scores.length || 1;
  const full = scores.filter(s => s.anchorPresent !== null);
  const legs = scores.map(s => s.maxLegMin).sort((a, b) => a - b);
  return {
    n: scores.length,
    hardViolations: scores.reduce((a, s) => a + s.hard.length, 0),
    hardCases: scores.filter(s => s.hard.length).length,
    consecutiveFoodRate: scores.filter(s => s.consecutiveFood > 0).length / n,
    anchorRate: full.length ? full.filter(s => s.anchorPresent).length / full.length : 1,
    avgDiversity: scores.reduce((a, s) => a + s.diversity, 0) / n,
    avgWalkKm: scores.reduce((a, s) => a + s.walkKm, 0) / n,
    p95LegMin: legs[Math.min(legs.length - 1, Math.floor(legs.length * 0.95))] ?? 0
  };
}
