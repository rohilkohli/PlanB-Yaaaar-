/**
 * Re-time a finished plan with real travel times (from the Routes API) instead of straight-line estimates.
 * The ORDER of stops is never changed. A stop moves later only when the real leg is longer than planned; it is dropped
 * only if the new time would break an opening-hours, day-window or after-dark rule. Pure and deterministic.
 */
import type { DayPlan, PlanBlock } from '../types/itinerary';
import { isOpenForBlock } from './hours';
import { MIN_BUFFER } from './planner';
import { minutesToTimeString, timeStringToMinutes } from './time';

export interface Leg { minutes: number; km: number; mode: 'walk' | 'cab' }

const label = (l: Leg) => `${l.minutes} min ${l.mode === 'walk' ? 'walk' : 'by auto or taxi'} · ${l.km < 10 ? l.km.toFixed(1) : Math.round(l.km)} km`;

/** `legs[i]` is the leg INTO blocks[i] (null/undefined = unknown, keep the estimate). */
export function retimePlan(plan: DayPlan, legs: Array<Leg | null | undefined>, sunsetMinutes?: number): { plan: DayPlan; moved: number; dropped: number } {
  const windowEnd = timeStringToMinutes(plan.calibration.endTime);
  const beforeDark = plan.calibration.afterDark === 'before_dark' && sunsetMinutes !== undefined;
  const out: PlanBlock[] = [];
  let moved = 0, dropped = 0;
  let cursor = 0;
  plan.blocks.forEach((b, i) => {
    const frozen = b.status === 'completed' || b.status === 'skipped';
    const leg = legs[i];
    const prevFrozen = i > 0 && (plan.blocks[i - 1].status === 'completed' || plan.blocks[i - 1].status === 'skipped');
    // After a finished stop the traveler may be somewhere else entirely, so that first leg is left to the planner's estimate.
    if (frozen || !leg || prevFrozen || (i === 0 && b.transitFromPrev === 'Starting point')) {
      out.push(b); cursor = b.endMinutes + Math.max(MIN_BUFFER, b.bufferMinutesAfter); return;
    }
    const earliest = cursor + leg.minutes;
    let nb: PlanBlock = { ...b, transitFromPrev: label(leg) };
    if (earliest > b.startMinutes) {
      const dur = b.endMinutes - b.startMinutes;
      const start = earliest, end = start + dur;
      const fits = end <= windowEnd && isOpenForBlock(b.venue, start, end) && !(beforeDark && end > (sunsetMinutes as number) - 30);
      if (!fits) { dropped++; return; }
      nb = { ...nb, startMinutes: start, endMinutes: end, timeLabel: `${minutesToTimeString(start)} – ${minutesToTimeString(end)}` };
      moved++;
    }
    out.push(nb); cursor = nb.endMinutes + Math.max(MIN_BUFFER, nb.bufferMinutesAfter);
  });
  return { plan: { ...plan, blocks: out.map((b, i) => ({ ...b, sequence: i + 1 })) }, moved, dropped };
}
