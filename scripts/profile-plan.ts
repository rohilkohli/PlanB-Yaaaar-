/** Per-stage latency of plan generation against the real APIs. Keys come from the environment; nothing is printed except timings.
 *  GOOGLE_PLACES_API_KEY=… GEMINI_API_KEY=… npx tsx scripts/profile-plan.ts */
import { generate } from '../server/pipeline';

const CITIES = ['jaipur', 'udaipur', 'varanasi', 'bengaluru'];
const rows: Array<Record<string, number>> = [];
for (const city of CITIES) {
  for (let i = 0; i < 2; i++) {
    const r = await generate({ calibration: { cityId: city, dayOffset: 1, startTime: '09:30', endTime: '19:30', energy: 'balanced', budget: '₹₹', afterDark: 'well_lit', social: 'ambient' }, guardrails: {} });
    const s = r.meta.stages!;
    rows.push({ total: r.meta.latencyMs, ...s });
    console.log(`${city.padEnd(10)} total ${String(r.meta.latencyMs).padStart(5)} ms | resolve ${String(s.resolve).padStart(4)} | places ${String(s.candidates).padStart(4)} | llm+plan ${String(s.llm).padStart(4)} | routes ${String(s.routes).padStart(4)} | ${r.meta.source} ${r.meta.llm ? 'AI' : 'no-AI'} ${r.plan.blocks.length} stops`);
  }
}
const med = (k: string) => rows.map(r => r[k]).sort((a, b) => a - b)[Math.floor(rows.length / 2)];
console.log(`median: total ${med('total')} | resolve ${med('resolve')} | places ${med('candidates')} | llm ${med('llm')} | routes ${med('routes')}`);
