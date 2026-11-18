/**
 * Practical, factual notes shown on a stop. Deliberately about logistics (hours, daylight, getting back), never about
 * safety: PlanB cannot know whether a place is safe, so no label may claim or imply it (see docs/SAFETY.md).
 */
import type { DayPlan, PlanBlock } from '../types/itinerary';
import { minutesToTimeString, timeStringToMinutes } from './time';
import { openWindow } from './hours';

export type FlagId = 'closes_soon' | 'ends_after_sunset' | 'ride_back';
export interface BlockFlag { id: FlagId; /** i18n key; `{time}` is replaced by `time` */ key: string; time?: string }

/** The venue's closing time on the window that contains this visit (handles lunch/dinner gaps). */
function closeAfter(block: PlanBlock): number | null {
  const v = block.venue;
  const win = v.periods?.length
    ? v.periods.map(([open, close]) => ({ open, close })).find(w => block.startMinutes >= w.open && block.startMinutes < w.close)
    : (v.closesAt ? openWindow(v) : null);
  return win ? win.close : null;
}

export function blockFlags(plan: Pick<DayPlan, 'blocks' | 'localSunsetTime'>, block: PlanBlock): BlockFlag[] {
  const flags: BlockFlag[] = [];
  if (block.status === 'completed' || block.status === 'skipped') return flags;

  const close = closeAfter(block);
  if (close !== null && close >= block.endMinutes && close - block.endMinutes <= 60) {
    flags.push({ id: 'closes_soon', key: 'flag.closesSoon', time: minutesToTimeString(close % 1440) });
  }

  const sunset = plan.localSunsetTime ? timeStringToMinutes(plan.localSunsetTime) : null;
  if (sunset !== null && block.endMinutes > sunset) {
    flags.push({ id: 'ends_after_sunset', key: 'flag.afterSunset', time: minutesToTimeString(sunset) });
  }

  const live = plan.blocks.filter(b => b.status !== 'completed' && b.status !== 'skipped');
  const last = live[live.length - 1];
  if (last && last.blockId === block.blockId && sunset !== null && block.endMinutes > sunset - 30) {
    flags.push({ id: 'ride_back', key: 'flag.rideBack' });
  }
  return flags;
}
