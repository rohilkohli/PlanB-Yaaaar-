import { describe, it, expect } from 'vitest';
import { CITIES, PLACES_DATABASE } from '../src/data/placesData';
import { sunsetLocalMinutes } from '../src/core/sunset';
import { isOpenForBlock } from '../src/core/hours';
import { buildCalibration, sunsetFor } from '../src/core/calibration';
import {
  adaptPlan, addBonusStop, applyBlockSwap, generatePlan, swapAlternatives, undoMutation, type PlanContext
} from '../src/core/planner';
import { openWindow } from '../src/core/hours';
import { timeStringToMinutes } from '../src/core/time';
import type { CalibrationData, CityData, DayPlan, TravelerPreferences } from '../src/types/itinerary';

const DATE = '2026-11-13';
const PREFS: TravelerPreferences = { mobility: 'stairs_okay', maxStrideMinutes: 25, dietary: [], units: 'km', afterDarkMode: 'well_lit' };

function setup(cityId = 'jaipur', over: Partial<CalibrationData> = {}, prefs: Partial<TravelerPreferences> = {}) {
  const city = CITIES.find(c => c.id === cityId) as CityData;
  const calib = { ...buildCalibration({ startTime: '09:30', endTime: '19:30', energy: 'balanced', budget: '₹₹₹', afterDark: 'well_lit', social: 'ambient' }, city, DATE), ...over };
  const ctx: PlanContext = { city, candidates: PLACES_DATABASE.filter(v => v.cityId === cityId), sunsetMinutes: sunsetFor(city, DATE) };
  const guard = { ...PREFS, ...prefs };
  return { city, calib, ctx, guard, plan: generatePlan(calib, guard, ctx) };
}

describe('sunset math across timezones (PRD §33)', () => {
  const near = (actual: number, h: number, m: number) => expect(Math.abs(actual - (h * 60 + m))).toBeLessThanOrEqual(7);
  it('Jaipur, Asia/Kolkata, 13 Nov', () => near(sunsetLocalMinutes(26.9124, 75.7873, DATE, 'Asia/Kolkata'), 17, 33));
  it('London, BST summer solstice', () => near(sunsetLocalMinutes(51.5, -0.12, '2026-06-21', 'Europe/London'), 21, 21));
  it('New York, EDT summer solstice', () => near(sunsetLocalMinutes(40.71, -74.0, '2026-06-21', 'America/New_York'), 20, 31));
  it('Sydney, AEDT summer solstice', () => near(sunsetLocalMinutes(-33.87, 151.21, '2026-12-21', 'Australia/Sydney'), 20, 5));
  it('polar night falls back instead of NaN', () => expect(Number.isFinite(sunsetLocalMinutes(78.2, 15.6, '2026-12-21', 'Arctic/Longyearbyen'))).toBe(true));
});

describe('opening hours verification', () => {
  const v = { opensAt: '09:00', closesAt: '17:00' };
  it('requires open for the whole block', () => {
    expect(isOpenForBlock(v, 600, 660)).toBe(true);
    expect(isOpenForBlock(v, 990, 1050)).toBe(false);
  });
  it('rejects venues closing within 45 min of arrival', () => expect(isOpenForBlock(v, 1000, 1010)).toBe(false));
  it('honours lunch/dinner gaps from live periods', () => {
    const live = { opensAt: '12:00', closesAt: '23:00', periods: [[720, 900], [1140, 1380]] as Array<[number, number]> };
    expect(isOpenForBlock(live, 780, 840)).toBe(true);
    expect(isOpenForBlock(live, 930, 990)).toBe(false);
  });
});

describe('catalogue integrity', () => {
  it('every city has enough venues for a full day and a swap', () => {
    for (const c of CITIES) expect(PLACES_DATABASE.filter(v => v.cityId === c.id).length, c.id).toBeGreaterThanOrEqual(7);
  });
  it('place ids are unique and curated', () => {
    const ids = PLACES_DATABASE.map(v => v.placeId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(PLACES_DATABASE.every(v => v.source === 'curated')).toBe(true);
  });
});

describe('generatePlan (F-02, US-004, US-006)', () => {
  it.each(CITIES.map(c => c.id))('%s: 3–4 paced blocks, open for each full block, buffers >= 15', id => {
    const { plan } = setup(id);
    expect(plan.blocks.length).toBeGreaterThanOrEqual(3);
    expect(plan.blocks.length).toBeLessThanOrEqual(4);
    plan.blocks.forEach((b, i) => {
      expect(b.endMinutes).toBeGreaterThan(b.startMinutes);
      expect(isOpenForBlock(b.venue, b.startMinutes, b.endMinutes), `${b.venue.name} ${b.timeLabel}`).toBe(true);
      expect(b.bufferMinutesAfter).toBeGreaterThanOrEqual(15);
      expect(b.whyItFits.split(/[.!?]\s/).length).toBeLessThanOrEqual(2);
      if (i > 0) expect(b.startMinutes).toBeGreaterThanOrEqual(plan.blocks[i - 1].endMinutes + 15);
    });
    expect(new Set(plan.blocks.map(b => b.venue.placeId)).size).toBe(plan.blocks.length);
  });

  it('before_dark: final block ends >= 30 min before local sunset', () => {
    for (const c of CITIES) {
      const { plan, ctx } = setup(c.id, { afterDark: 'before_dark' });
      for (const b of plan.blocks) expect(b.endMinutes, c.id).toBeLessThanOrEqual(ctx.sunsetMinutes - 30);
    }
  });

  it('late start produces a compact plan, never a negative-length block', () => {
    const { plan } = setup('jaipur', { startTime: '18:00', endTime: '22:00', afterDark: 'anywhere' });
    expect(plan.blocks.length).toBeLessThanOrEqual(2);
    plan.blocks.forEach(b => expect(b.endMinutes).toBeGreaterThan(b.startMinutes));
  });

  it('before_dark with no daylight left offers tomorrow instead of an unsafe plan', () => {
    const { plan } = setup('jaipur', { startTime: '17:00', endTime: '21:00', afterDark: 'before_dark' });
    expect(plan.blocks).toHaveLength(0);
    expect(plan.needsTomorrow).toBe(true);
  });

  it('applies dietary and mobility guardrails', () => {
    const veg = setup('lisbon', {}, { dietary: ['vegetarian', 'alcohol_free'], mobility: 'step_free' });
    veg.plan.blocks.forEach(b => {
      expect(b.venue.tags ?? []).not.toContain('non_veg');
      expect(b.venue.tags ?? []).not.toContain('alcohol');
      expect(b.venue.tags ?? []).not.toContain('steep');
    });
  });

  it('LLM hints are honoured only when they pass hours + guardrails', () => {
    const { calib, ctx, guard } = setup('jaipur');
    const night = ctx.candidates.find(v => v.placeId === 'pl_vns_ganga_aarti') ?? ctx.candidates[0];
    const p = generatePlan(calib, guard, ctx, [{ placeId: ctx.candidates[2].placeId, whyItFits: 'You could start here. It is calm.' }, { placeId: 'not_in_pool' }, { placeId: night.placeId }]);
    expect(p.blocks.every(b => ctx.candidates.some(v => v.placeId === b.venue.placeId))).toBe(true);
  });
});

describe('adaptPlan (F-03, US-008)', () => {
  const doneFirst = (p: DayPlan): DayPlan => ({ ...p, blocks: p.blocks.map((b, i) => (i === 0 ? { ...b, status: 'completed' as const } : b)) });

  it('freezes completed blocks and regenerates the rest from now (>= 14:00)', () => {
    const { plan, ctx } = setup('jaipur');
    const base = doneFirst(plan);
    const out = adaptPlan(base, { scenarios: ['weather_turned', 'low_battery'] }, { ...ctx, now: { minutes: 14 * 60, date: DATE } });
    expect(out.blocks[0]).toEqual(base.blocks[0]);
    out.blocks.slice(1).forEach(b => {
      expect(b.startMinutes).toBeGreaterThanOrEqual(14 * 60);
      expect(b.venue.isIndoor).toBe(true);
      expect(isOpenForBlock(b.venue, b.startMinutes, b.endMinutes)).toBe(true);
    });
    expect(out.blocks.slice(1).some(b => b.isAdapted)).toBe(true);
    expect(out.lastAdaptation?.keptBlockIds).toContain(base.blocks[0].blockId);
  });

  it('never re-picks an already completed venue', () => {
    const { plan, ctx } = setup('goa');
    const out = adaptPlan(doneFirst(plan), { scenarios: ['hungry_now'] }, { ...ctx, now: { minutes: 12 * 60, date: DATE } });
    const ids = out.blocks.map(b => b.venue.placeId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('hungry_now puts food next', () => {
    const { plan, ctx } = setup('jaipur');
    const out = adaptPlan(doneFirst(plan), { scenarios: ['hungry_now'] }, { ...ctx, now: { minutes: 11 * 60 + 30, date: DATE } });
    expect(['dining', 'market', 'cafe', 'bakery']).toContain(out.blocks[1].venue.category);
  });

  it('early_night swaps the evening for one easy pick-up', () => {
    const { plan, ctx } = setup('jaipur');
    const out = adaptPlan(doneFirst(plan), { scenarios: ['early_night'] }, { ...ctx, now: { minutes: 17 * 60, date: DATE } });
    expect(out.blocks.length).toBeLessThanOrEqual(2);
    expect(out.lastAdaptation?.message).toMatch(/early|Nothing more/i);
  });

  it('running_late shifts times forward and never starts in the past', () => {
    const { plan, ctx } = setup('jaipur');
    const out = adaptPlan(plan, { scenarios: ['running_late'] }, { ...ctx, now: { minutes: 13 * 60, date: DATE } });
    out.blocks.forEach(b => expect(b.startMinutes).toBeGreaterThanOrEqual(13 * 60));
  });

  it('snapshots for 1-tap undo and restores exactly', () => {
    const { plan, ctx } = setup('jaipur');
    const out = adaptPlan(plan, { scenarios: ['weather_turned'] }, { ...ctx, now: { minutes: 14 * 60, date: DATE } });
    expect(out.previousSnapshot).not.toBeNull();
    const restored = undoMutation(out);
    expect(restored.blocks).toEqual(plan.blocks);
    expect(restored.previousSnapshot).toBeNull();
  });

  it('all done → bonus stop is optional and flagged', () => {
    const { plan, ctx } = setup('jaipur');
    const allDone: DayPlan = { ...plan, blocks: plan.blocks.map(b => ({ ...b, status: 'completed' as const })) };
    const bonus = addBonusStop(allDone, { ...ctx, now: { minutes: 15 * 60, date: DATE } });
    expect(bonus.blocks.length).toBe(allDone.blocks.length + 1);
    expect(bonus.blocks[bonus.blocks.length - 1].isBonus).toBe(true);
  });
});

describe('swap (F-04, US-009)', () => {
  it('returns 2 distinct verified alternatives, different from the rejected block', () => {
    for (const c of CITIES) {
      const { plan, ctx } = setup(c.id);
      const target = plan.blocks[1];
      const { alternatives } = swapAlternatives(plan, target.blockId, 'vibe', ctx);
      expect(alternatives.length, c.id).toBe(2);
      expect(alternatives[0].subCategory).not.toBe(alternatives[1].subCategory);
      alternatives.forEach(a => {
        expect(a.placeId).not.toBe(target.venue.placeId);
        expect(plan.blocks.some(b => b.venue.placeId === a.placeId)).toBe(false);
        expect(isOpenForBlock(a, target.startMinutes, target.endMinutes)).toBe(true);
      });
    }
  });

  it('"closed" excludes the venue from later results (session flag)', () => {
    const { plan, ctx } = setup('jaipur');
    const target = plan.blocks[1];
    const out = swapAlternatives(plan, target.blockId, 'closed', { ...ctx, excludeIds: [target.venue.placeId] });
    expect(out.alternatives.map(a => a.placeId)).not.toContain(target.venue.placeId);
  });

  it('applyBlockSwap changes only the target block and supports undo', () => {
    const { plan, ctx } = setup('jaipur');
    const target = plan.blocks[1];
    const alt = swapAlternatives(plan, target.blockId, 'vibe', ctx).alternatives[0];
    const swapped = applyBlockSwap(plan, target.blockId, alt);
    swapped.blocks.forEach((b, i) => { if (i !== 1) expect(b).toEqual(plan.blocks[i]); });
    expect(swapped.blocks[1].venue.placeId).toBe(alt.placeId);
    expect(undoMutation(swapped).blocks).toEqual(plan.blocks);
  });
});

describe('time helpers', () => {
  it('parses 12h and 24h strings', () => {
    expect(timeStringToMinutes('5:48 PM')).toBe(17 * 60 + 48);
    expect(timeStringToMinutes('12:05 AM')).toBe(5);
    expect(timeStringToMinutes('17:48')).toBe(17 * 60 + 48);
  });
  it('overnight closing is normalised', () => expect(openWindow({ opensAt: '10:00', closesAt: '00:00' }).close).toBe(1440));
});

import { isClosedOn, holidayOn, VENUE_CLOSURES } from '../src/data/closures';
import { transitUrl, uberUrl } from '../src/core/transport';
import { signPlan, verifyPlan } from '../server/sign';
describe('closures, holidays and transport links', () => {
  it('flags national holidays as a note, not a hard exclusion', () => {
    expect(holidayOn('2026-08-15')).toMatch(/holiday/);
    expect(holidayOn('2026-11-13')).toBeNull();
  });
  it('excludes a venue with a verified weekly closure on that weekday', () => {
    VENUE_CLOSURES['pl_test_closed_monday'] = { weekdays: [1], source: 'test' };
    expect(isClosedOn('pl_test_closed_monday', '2026-11-16')).toBe(true); // a Monday
    expect(isClosedOn('pl_test_closed_monday', '2026-11-17')).toBe(false);
    delete VENUE_CLOSURES['pl_test_closed_monday'];
  });
  it('closed venues never appear in a generated plan on that day', () => {
    const city = CITIES.find(c => c.id === 'jaipur') as CityData;
    const venues = PLACES_DATABASE.filter(v => v.cityId === 'jaipur');
    const target = venues[0];
    VENUE_CLOSURES[target.placeId] = { dates: ['2026-11-13'], source: 'test' };
    const calib = { ...buildCalibration({ startTime: '09:30', endTime: '19:30' }, city, DATE), energy: 'balanced' as const, social: 'ambient' as const, afterDark: 'well_lit' as const, budget: '₹₹' as const };
    const p = generatePlan(calib, { mobility: 'stairs_okay', maxStrideMinutes: 25, dietary: [], units: 'km', afterDarkMode: 'well_lit' }, { city, candidates: venues, sunsetMinutes: sunsetFor(city, DATE) });
    expect(p.blocks.some(b => b.venue.placeId === target.placeId)).toBe(false);
    delete VENUE_CLOSURES[target.placeId];
  });
  it('builds Google Maps transit and Uber links for a venue', () => {
    const v = PLACES_DATABASE[0];
    expect(transitUrl(v)).toContain('travelmode=transit');
    expect(transitUrl(v)).toContain(`${v.coords.lat},${v.coords.lng}`);
    expect(uberUrl(v)).toContain('dropoff%5Bnickname%5D=');
  });
});
describe('plan signatures', () => {
  it('verifies an untouched plan and rejects a tampered venue or time', () => {
    const city = CITIES.find(c => c.id === 'jaipur') as CityData;
    const calib = buildCalibration({ startTime: '09:30', endTime: '19:30' }, city, DATE);
    const p: any = generatePlan(calib, { mobility: 'stairs_okay', maxStrideMinutes: 25, dietary: [], units: 'km', afterDarkMode: 'well_lit' }, { city, candidates: PLACES_DATABASE.filter(v => v.cityId === 'jaipur'), sunsetMinutes: sunsetFor(city, DATE) });
    p.signature = signPlan(p);
    expect(verifyPlan(JSON.parse(JSON.stringify(p)))).toBe(true);
    const venueSwap = JSON.parse(JSON.stringify(p)); venueSwap.blocks[0].venue.placeId = 'pl_injected';
    expect(verifyPlan(venueSwap)).toBe(false);
    const timeEdit = JSON.parse(JSON.stringify(p)); timeEdit.blocks[1].startMinutes -= 60;
    expect(verifyPlan(timeEdit)).toBe(false);
    const noSig = JSON.parse(JSON.stringify(p)); delete noSig.signature;
    expect(verifyPlan(noSig)).toBe(false);
  });
});
