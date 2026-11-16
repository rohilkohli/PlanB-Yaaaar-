/**
 * Offline plan-quality eval: every curated city × traveler profile × time window, scored against hard rules
 * and soft quality thresholds. Free, deterministic, run in CI:  npm run eval
 */
import { CITIES, PLACES_DATABASE } from '../src/data/placesData';
import { buildCalibration, sunsetFor } from '../src/core/calibration';
import { generatePlan, type PlanContext } from '../src/core/planner';
import type { CalibrationData, TravelerPreferences } from '../src/types/itinerary';
import { scorePlan, summarise, type PlanScore } from './metrics';

const DATE = '2026-11-13';
const PROFILES: Array<{ name: string; calib: Partial<CalibrationData>; prefs: Partial<TravelerPreferences> }> = [
  { name: 'relaxed-solitude-daylight', calib: { energy: 'gentle', social: 'solitude', afterDark: 'before_dark', budget: '₹' }, prefs: { dietary: ['vegetarian'], maxStrideMinutes: 15 } },
  { name: 'balanced-default', calib: { energy: 'balanced', social: 'ambient', afterDark: 'well_lit', budget: '₹₹' }, prefs: {} },
  { name: 'active-social-late', calib: { energy: 'active', social: 'social', afterDark: 'anywhere', budget: '₹₹₹' }, prefs: {} },
  { name: 'step-free-transit', calib: { energy: 'balanced', social: 'ambient', afterDark: 'well_lit', budget: '₹₹' }, prefs: { mobility: 'step_free', dietary: ['alcohol_free'] } }
];
const WINDOWS = [
  { name: 'full-day', start: '09:30', end: '19:30', full: true },
  { name: 'afternoon', start: '13:00', end: '19:30', full: false },
  { name: 'late-evening', start: '18:30', end: '22:00', full: false }
];

export function runOffline() {
  const scores: PlanScore[] = []; const failures: string[] = []; const soft: string[] = [];
  for (const city of CITIES) for (const p of PROFILES) for (const w of WINDOWS) {
    const base = buildCalibration({ startTime: w.start, endTime: w.end }, city, DATE);
    const calib = { ...base, ...p.calib } as CalibrationData;
    const prefs: TravelerPreferences = { mobility: 'stairs_okay', maxStrideMinutes: 25, dietary: [], units: 'km', afterDarkMode: calib.afterDark, ...p.prefs };
    const ctx: PlanContext = { city, candidates: PLACES_DATABASE.filter(v => v.cityId === city.id), sunsetMinutes: sunsetFor(city, DATE) };
    const plan = generatePlan(calib, prefs, ctx);
    const startMin = parseInt(w.start) * 60 + parseInt(w.start.slice(3));
    const endMin = parseInt(w.end) * 60 + parseInt(w.end.slice(3));
    const usableMin = Math.min(endMin, calib.afterDark === 'before_dark' ? ctx.sunsetMinutes - 30 : 1e9) - startMin;
    const s = scorePlan(plan, ctx.sunsetMinutes, { startMin, usableMin });
    scores.push(s);
    s.hard.forEach(h => failures.push(`${city.id}/${p.name}/${w.name}: ${h}`));
    if (s.consecutiveFood > 0) soft.push(`${city.id}/${p.name}/${w.name}: ${plan.blocks.map(b => `${b.venue.category}:${b.venue.name.slice(0, 18)}`).join(' → ')}`);
  }
  return { scores, failures, soft, summary: summarise(scores) };
}

const THRESHOLDS = { hardViolations: 0, consecutiveFoodRate: 0.03, anchorRate: 0.9, avgDiversity: 0.75 };

if (process.argv[1]?.endsWith('offline.ts')) {
  const { failures, soft, summary } = runOffline();
  console.log('Offline plan-quality eval', summary);
  const bad: string[] = [];
  if (summary.hardViolations > THRESHOLDS.hardViolations) bad.push(`hard violations ${summary.hardViolations} > ${THRESHOLDS.hardViolations}`);
  if (summary.consecutiveFoodRate > THRESHOLDS.consecutiveFoodRate) bad.push(`consecutive-food rate ${(summary.consecutiveFoodRate * 100).toFixed(1)}% > ${THRESHOLDS.consecutiveFoodRate * 100}%`);
  if (summary.anchorRate < THRESHOLDS.anchorRate) bad.push(`anchor-attraction rate ${(summary.anchorRate * 100).toFixed(1)}% < ${THRESHOLDS.anchorRate * 100}%`);
  if (summary.avgDiversity < THRESHOLDS.avgDiversity) bad.push(`category diversity ${summary.avgDiversity.toFixed(2)} < ${THRESHOLDS.avgDiversity}`);
  failures.slice(0, 25).forEach(f => console.log('  ✗', f));
  soft.slice(0, 10).forEach(f => console.log('  ~ consecutive food:', f));
  if (bad.length) { console.error('\nFAILED:\n - ' + bad.join('\n - ')); process.exit(1); }
  console.log('PASSED all thresholds');
}
