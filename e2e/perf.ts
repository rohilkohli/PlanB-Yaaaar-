/** Mobile-load measurement against the production bundle: slow-4G network, 4x CPU slowdown. `npx tsx e2e/perf.ts` */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const t0 = Date.now();
const srv = spawn('node', ['dist-server/index.mjs'], { env: { ...process.env, PORT: '4166', NODE_ENV: 'production', GOOGLE_PLACES_API_KEY: '', GEMINI_API_KEY: '' }, stdio: 'ignore' });
let up = 0;
for (let i = 0; i < 100; i++) { try { if ((await fetch('http://localhost:4166/api/health')).ok) { up = Date.now() - t0; break; } } catch { /* retry */ } await new Promise(r => setTimeout(r, 25)); }
console.log(`server cold start (process spawn → first healthy response): ${up} ms`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const results: Array<{ fcp: number; lcp: number; load: number }> = [];
for (let run = 0; run < 3; run++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => {
    (window as any).__lcp = 0;
    new PerformanceObserver(l => { for (const e of l.getEntries()) (window as any).__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
  const start = Date.now();
  await page.goto('http://localhost:4166/', { waitUntil: 'load' });
  await page.getByRole('heading', { name: 'Where are you heading?' }).waitFor();
  const load = Date.now() - start;
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => ({ fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0, lcp: (window as any).__lcp as number }));
  results.push({ fcp: Math.round(m.fcp), lcp: Math.round(m.lcp), load });
  await ctx.close();
}
console.log('cold loads on slow 4G / 4x CPU (3 runs):', JSON.stringify(results));
const med = (k: 'fcp' | 'lcp' | 'load') => results.map(r => r[k]).sort((a, b) => a - b)[1];
console.log(`median FCP ${med('fcp')} ms · LCP ${med('lcp')} ms · app interactive ${med('load')} ms (PRD target: FCP < 1,200 ms on 4G)`);
await browser.close(); srv.kill();
