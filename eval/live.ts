/**
 * Live eval: the real /api/plan/generate pipeline (Google Places + LLM when ANTHROPIC_API_KEY is set) over every curated
 * city × profile. Spends Places quota (≈3 requests per city, cached) — run manually:  npm run eval:live
 *
 * Measures internal consistency (hours used = hours checked), latency, fallback reasons and soft quality.
 * It CANNOT measure real-world closed-venue rate: that needs ground truth (field walk or a second data source).
 */
import { generate } from '../server/pipeline';
import { CITIES } from '../src/data/placesData';
import { sunsetFor } from '../src/core/calibration';
import { scorePlan, summarise, type PlanScore } from './metrics';
import { timeStringToMinutes } from '../src/core/time';

try { process.loadEnvFile('.env'); } catch { /* env may already be set */ }
process.env.ALLOW_TEST_CLOCK = '1';
process.env.NODE_ENV = 'test';

const PROFILES = [
  { name: 'balanced', cal: { energy: 'balanced', social: 'ambient', afterDark: 'well_lit', budget: '₹₹' }, g: {} },
  { name: 'relaxed-veg-daylight', cal: { energy: 'gentle', social: 'solitude', afterDark: 'before_dark', budget: '₹' }, g: { dietary: ['vegetarian'], maxStrideMinutes: 15 } }
];

const rows: Array<{ city: string; profile: string; ms: number; source: string; llm: boolean; reason?: string; score: PlanScore; stops: string }> = [];
for (const city of CITIES.filter(c => c.country === 'India')) for (const p of PROFILES) {
  const t0 = Date.now();
  try {
    const { plan, meta } = await generate({
      calibration: { cityId: city.id, startTime: '09:30', endTime: '19:30', date: '2026-11-17', ...p.cal },
      guardrails: p.g, now: { minutes: 9 * 60, date: '2026-11-16' }
    });
    const startMin = timeStringToMinutes('09:30');
    const sunset = sunsetFor(city, '2026-11-17');
    const usable = Math.min(timeStringToMinutes('19:30'), p.cal.afterDark === 'before_dark' ? sunset - 30 : 1e9) - startMin;
    rows.push({ city: city.id, profile: p.name, ms: Date.now() - t0, source: meta.source, llm: meta.llm, reason: meta.fallbackReason, score: scorePlan(plan, sunset, { startMin, usableMin: usable }, 1000), stops: plan.blocks.map(b => b.venue.name.slice(0, 26)).join(' → ') });
  } catch (e) { console.error(`${city.id}/${p.name}: ${(e as Error).message}`); }
}

console.table(rows.map(r => ({ city: r.city, profile: r.profile, ms: r.ms, src: r.source, llm: r.llm, why: r.reason ?? '', blocks: r.score.blocks, hard: r.score.hard.length, foodFood: r.score.consecutiveFood, anchor: r.score.anchorPresent, legMax: r.score.maxLegMin })));
rows.forEach(r => console.log(`${r.city}/${r.profile}: ${r.stops}`));
const lat = rows.map(r => r.ms).sort((a, b) => a - b);
const sum = summarise(rows.map(r => r.score));
console.log('\nsummary', { ...sum, p50ms: lat[Math.floor(lat.length * 0.5)], p95ms: lat[Math.min(lat.length - 1, Math.floor(lat.length * 0.95))], liveSourceRate: rows.filter(r => r.source === 'google_places').length / rows.length, llmRate: rows.filter(r => r.llm).length / rows.length });
rows.flatMap(r => r.score.hard.map(h => `${r.city}/${r.profile}: ${h}`)).forEach(h => console.log('  ✗', h));
process.exit(rows.some(r => r.score.hard.length) ? 1 : 0);
