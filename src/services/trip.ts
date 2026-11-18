/**
 * Multi-day memory, kept only on this phone. When you build another day in the same city, stops you already visited
 * (and ones you skipped) are left out, so day 2 is not day 1 again. Expires after 10 days; cleared by "Reset & delete all my data".
 */
import type { CalibrationInput } from '../core/calibration';
import type { DayPlan } from '../types/itinerary';

const KEY = 'planb_trip';
const TTL_MS = 10 * 86400_000;

interface TripMem { cityId: string; cityName: string; visited: string[]; skipped: string[]; days: string[]; updatedAt: number }

function load(): Record<string, TripMem> {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, TripMem>;
    for (const k of Object.keys(all)) if (Date.now() - all[k].updatedAt > TTL_MS) delete all[k];
    return all;
  } catch { return {}; }
}
function save(all: Record<string, TripMem>) { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* private mode: no memory */ } }

const uniq = (a: string[]) => [...new Set(a)].slice(-150);

export const tripStore = {
  /** Remember what happened on this day's plan (called when the traveler starts another plan). */
  record(plan: DayPlan): void {
    const all = load();
    const cur = all[plan.city.id] ?? { cityId: plan.city.id, cityName: plan.city.name, visited: [], skipped: [], days: [], updatedAt: 0 };
    cur.visited = uniq([...cur.visited, ...plan.blocks.filter(b => b.status === 'completed').map(b => b.venue.placeId)]);
    cur.skipped = uniq([...cur.skipped, ...plan.blocks.filter(b => b.status === 'skipped').map(b => b.venue.placeId)]);
    cur.days = [...new Set([...cur.days, plan.calibration.date])].slice(-14);
    cur.updatedAt = Date.now();
    all[plan.city.id] = cur;
    save(all);
  },

  /** Places to leave out for a new plan, matched by city id or by the typed place name. */
  excludeFor(input: Pick<CalibrationInput, 'cityId' | 'query'>): string[] {
    const q = (input.query || '').toLowerCase();
    return Object.values(load())
      .filter(t => t.cityId === input.cityId || (q && q.includes(t.cityName.toLowerCase().split(' (')[0])))
      .flatMap(t => [...t.visited, ...t.skipped]);
  },

  /** What a new day in this city would skip, for the "Day N" note (counts the current plan too). */
  preview(plan: DayPlan): { day: number; skipping: number } {
    const mem = load()[plan.city.id];
    const visited = new Set([...(mem?.visited ?? []), ...(mem?.skipped ?? []), ...plan.blocks.filter(b => b.status === 'completed' || b.status === 'skipped').map(b => b.venue.placeId)]);
    const days = new Set([...(mem?.days ?? []), plan.calibration.date]);
    return { day: days.size + 1, skipping: visited.size };
  },

  clear(): void { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
};
