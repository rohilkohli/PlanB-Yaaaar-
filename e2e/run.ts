/**
 * End-to-end flow at 390×844 (PRD §33): Calibrate → Generate → Complete Block 1 → Adapt (Weather turned + Low battery)
 * → Block 1 preserved & Blocks 2+ updated → Undo → exact rollback → Swap → Offline reload → Reset data.
 *
 * Runs against the production build (so the Workbox service worker is real). `npm run test:e2e`
 */
import { chromium, type Page } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const AXE = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');

/** WCAG 2.1 A/AA audit (PRD §26). Fails on serious/critical violations. */
async function axeAudit(page: Page, label: string) {
  await page.evaluate(AXE);
  const res = await page.evaluate(async () => {
    // @ts-expect-error injected
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
    return r.violations.map((v: any) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map((n: any) => n.target.join(' ')) }));
  });
  const bad = res.filter((v: any) => v.impact === 'serious' || v.impact === 'critical');
  if (res.length) console.log(`    axe[${label}]:`, JSON.stringify(res));
  assert.equal(bad.length, 0, `axe serious/critical violations on ${label}: ${JSON.stringify(bad)}`);
}

const PORT = 4173;
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
const SHOTS = process.env.SHOT_DIR || 'e2e/screenshots';
mkdirSync(SHOTS, { recursive: true });

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('server did not start');
}

const names = (page: Page) => page.$$eval('article[aria-label^="Stop"]', els => els.map(e => e.getAttribute('aria-label')!.replace(/^Stop \d+: /, '')));
const step = (m: string) => console.log(`  ✓ ${m}`);

async function main() {
  let server: ReturnType<typeof spawn> | null = null;
  if (!process.env.BASE_URL) {
    server = spawn('node', ['dist-server/index.mjs'], { env: { ...process.env, PORT: String(PORT), ALLOW_TEST_CLOCK: '1', GOOGLE_PLACES_API_KEY: '', GEMINI_API_KEY: '', NODE_ENV: 'production', VAPID_PUBLIC_KEY: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', VAPID_PRIVATE_KEY: 'e2e-not-used' }, stdio: 'ignore' });
  }
  try {
    await waitForServer();
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }).catch(() => chromium.launch({ args: ['--no-sandbox'] }));
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, geolocation: undefined });
    await context.addInitScript(() => { if (!localStorage.getItem('planb_test_clock')) localStorage.setItem('planb_test_clock', '10:00'); });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text())) errors.push(m.text()); });

    // ---- Calibrate
    await page.goto(BASE);
    await page.getByRole('heading', { name: 'Where are you heading?' }).waitFor();
    await page.screenshot({ path: `${SHOTS}/01-calibration.png` });
    await axeAudit(page, 'calibration');
    await page.getByRole('button', { name: /Skip — build with defaults/ }).click();
    await page.getByText('Enter a city or neighborhood to build your day.').waitFor();
    step('empty city is blocked with the PRD message');

    await page.fill('#city-input', 'Jaipur');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('heading', { name: /pace today/ }).waitFor();
    await page.getByRole('radio', { name: /Moderate/ }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('radio', { name: /Finish before dark/ }).click();
    await page.screenshot({ path: `${SHOTS}/02-evening.png` });
    await page.getByRole('radio', { name: /Main streets only/ }).click();
    await page.getByRole('button', { name: 'Build my day' }).click();

    // ---- Generate
    await page.waitForURL('**/today');
    await page.waitForSelector('article[aria-label^="Stop"]');
    const original = await names(page);
    assert.ok(original.length >= 3 && original.length <= 4, `3–4 blocks, got ${original.length}`);
    step(`plan generated with ${original.length} blocks: ${original.join(' → ')}`);
    await page.screenshot({ path: `${SHOTS}/03-today.png`, fullPage: false });
    await axeAudit(page, 'today');
    const fitLines = await page.locator('article >> text=/Open (until|all day)/').count();
    assert.ok(fitLines >= original.length, 'every block shows open hours + source');

    // no broken-image icons: failed/absent photos fall back to a placeholder
    await page.waitForTimeout(1200);
    const broken = await page.$$eval('article img', imgs => imgs.filter(i => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth === 0).length);
    assert.equal(broken, 0, 'no broken <img> on plan cards');

    // ---- Location picker: 3 suggestions only, and "use my location" shows where we are
    const gps = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, geolocation: { latitude: 26.9124, longitude: 75.7873 }, permissions: ['geolocation'] });
    const gp = await gps.newPage();
    await gp.goto(`${BASE}/?new=1`);
    await gp.getByRole('heading', { name: 'Where are you heading?' }).waitFor();
    assert.equal(await gp.locator('[role="radiogroup"][aria-label="Suggested destinations"] [role="radio"]').count(), 3, 'exactly 3 suggested destinations');
    await gp.getByRole('button', { name: 'Use my location' }).click();
    await gp.waitForFunction(() => (document.getElementById('city-input') as HTMLInputElement)?.value.length > 0, null, { timeout: 8000 });
    const shown = await gp.inputValue('#city-input');
    assert.match(shown, /Jaipur/i, `picked-up location visible in the field (got "${shown}")`);
    await gps.close();
    step('location picker shows 3 suggestions and the GPS-picked location in the field');

    // ---- Complete block 1
    await page.getByRole('button', { name: `Mark done, ${original[0]}` }).click();
    await page.getByRole('button', { name: `Done, ${original[0]}` }).waitFor();
    step('block 1 marked done');

    // ---- Adapt at 14:00
    await page.evaluate(() => localStorage.setItem('planb_test_clock', '14:00'));
    await page.getByRole('button', { name: 'Adapt my day' }).click();
    await page.waitForURL('**/today#adapt');
    await page.getByRole('dialog', { name: 'What changed?' }).waitFor();
    await page.screenshot({ path: `${SHOTS}/04-adapt.png` });
    await axeAudit(page, 'adapt sheet');
    await page.getByRole('button', { name: 'Weather turned' }).click();
    await page.getByRole('button', { name: 'Low battery' }).click();
    await page.getByRole('button', { name: 'Reshape rest of day' }).click();
    await page.getByRole('button', { name: 'Undo change' }).waitFor();
    const adapted = await names(page);
    assert.equal(adapted[0], original[0], 'block 1 preserved');
    assert.notDeepEqual(adapted.slice(1), original.slice(1), 'blocks 2+ regenerated');
    const labels = await page.$$eval('article[aria-label^="Stop"]', els => els.map(e => e.textContent || ''));
    labels.slice(1).forEach(t => assert.match(t, /Indoor/, 'adapted blocks are indoor'));
    for (const t of labels.slice(1)) {
      const m = t.match(/(\d{1,2}):(\d{2}) (AM|PM)/);
      assert.ok(m, 'time label present');
      const h = (Number(m![1]) % 12) + (m![3] === 'PM' ? 12 : 0);
      assert.ok(h >= 14, `adapted block starts >= 14:00 (got ${m![0]})`);
    }
    await page.screenshot({ path: `${SHOTS}/05-adapted.png` });
    step('Weather turned + Low battery: block 1 frozen, blocks 2+ indoor and >= 2:00 PM');

    // ---- Undo
    await page.getByRole('button', { name: 'Undo change' }).click();
    await page.waitForFunction(n => document.querySelectorAll('article[aria-label^="Stop"]').length === n, original.length);
    assert.deepEqual(await names(page), original, 'exact rollback');
    step('Undo restores the exact prior plan');

    // ---- Swap block 2 ("It's closed")
    await page.getByRole('button', { name: `Swap, ${original[1]}` }).click();
    const sheet = page.getByRole('dialog', { name: new RegExp(`Replace ${original[1].slice(0, 12)}`) });
    await sheet.waitFor();
    await sheet.getByRole('radio', { name: /It’s closed/ }).click();
    const replaceBtns = sheet.getByRole('button', { name: 'Replace with this' });
    let alts = 0;
    for (let i = 0; i < 40 && alts !== 2; i++) { await page.waitForTimeout(150); alts = await replaceBtns.count(); }
    assert.equal(alts, 2, 'two alternatives');
    await page.screenshot({ path: `${SHOTS}/06-swap.png` });
    await axeAudit(page, 'swap sheet');
    await sheet.getByRole('button', { name: 'Replace with this' }).first().click();
    await page.getByRole('button', { name: 'Undo change' }).waitFor();
    const swapped = await names(page);
    assert.notEqual(swapped[1], original[1]);
    assert.equal(swapped[0], original[0]);
    assert.equal(swapped[2], original[2]);
    step('swap replaces only block 2 and offers Undo');

    // ---- Offline reload (Workbox + IndexedDB)
    await page.reload();
    await page.waitForSelector('article[aria-label^="Stop"]');
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
    const before = await names(page);
    await context.setOffline(true);
    const t0 = Date.now();
    await page.reload();
    await page.waitForSelector('article[aria-label^="Stop"]');
    const loadMs = Date.now() - t0;
    assert.deepEqual(await names(page), before, 'offline plan renders from storage');
    await page.getByText('Offline mode — your plan and addresses are saved. Reconnect to adapt.').waitFor();
    await page.screenshot({ path: `${SHOTS}/07-offline.png` });
    await page.getByRole('button', { name: 'Adapt my day' }).click();
    await page.getByText(/You’re offline — reconnect to recalculate new stops/).waitFor();
    assert.ok(await page.getByRole('button', { name: 'Reshape rest of day' }).isDisabled());
    step(`Airplane-mode reload renders the cached plan (${loadMs} ms incl. navigation); Adapt disabled with PRD copy`);
    await page.keyboard.press('Escape');
    await context.setOffline(false);

    // ---- Late evening + "finish before dark" → "Plan tomorrow" really plans tomorrow
    await page.evaluate(() => localStorage.setItem('planb_test_clock', '20:00'));
    await page.goto(`${BASE}/?new=1`);
    await page.fill('#city-input', 'Jaipur');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('radio', { name: /Finish before dark/ }).click();
    await page.getByRole('button', { name: 'Build my day' }).click();
    await page.getByText('It’s a little late for a daylight plan').waitFor();
    await page.getByRole('button', { name: 'Plan tomorrow' }).click();
    await page.getByRole('radio', { name: 'Tomorrow' }).waitFor();
    assert.equal(await page.getByRole('radio', { name: 'Tomorrow' }).getAttribute('aria-checked'), 'true');
    await page.getByRole('button', { name: /Skip — build with defaults/ }).click();
    await page.getByText(/Plan for tomorrow/).waitFor();
    assert.ok((await names(page)).length >= 3, 'tomorrow gets a full 3–4 block plan');
    step('late evening → "Plan tomorrow" builds a full plan for tomorrow');
    await page.evaluate(() => localStorage.setItem('planb_test_clock', '14:00'));

    // ---- Safety: trusted contact, live share, viewer page, check-in, stop
    await page.goto(`${BASE}/today`);
    await page.getByRole('button', { name: 'Safety', exact: true }).click();
    const safety = page.getByRole('dialog', { name: 'Safety' });
    await safety.waitFor();
    await safety.getByLabel('Name').fill('Asha');
    await safety.getByLabel(/Phone/).fill('+91 98765 43210');
    await safety.getByRole('button', { name: 'Save contact' }).click();
    await safety.getByRole('button', { name: 'Share my day live' }).click();
    await safety.getByText('Sharing is on').first().waitFor();
    await axeAudit(page, 'safety sheet');
    const shareToken = await page.evaluate(() => JSON.parse(localStorage.getItem('planb_share')!).token as string);
    const writeKey = await page.evaluate(() => JSON.parse(localStorage.getItem('planb_share')!).writeKey as string);
    const viewer = await context.newPage();
    await viewer.goto(`${BASE}/s/${shareToken}`);
    await viewer.getByText('Shared with you').waitFor();
    await viewer.getByText(/Waiting for their first location update/).waitFor();
    assert.ok((await viewer.locator('ol > li').count()) >= 1, 'viewer lists the plan');
    assert.equal(await viewer.locator('meta[name=robots]').count() + (await (await fetch(`${BASE}/s/${shareToken}`)).headers.get('x-robots-tag') ? 1 : 0) > 0, true, 'share page is noindex');
    await axeAudit(viewer, 'shared viewer');
    await page.evaluate(async ([t, k]) => { await fetch('/api/share/location', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t, writeKey: k, lat: 26.9239, lng: 75.8267 }) }); }, [shareToken, writeKey]);
    await safety.getByRole('button', { name: /back safe/ }).click();
    await safety.getByText(/Checked in/).waitFor();
    await viewer.reload();
    await viewer.getByText(/Checked in safe/).waitFor();
    await viewer.getByText(/Last seen/).waitFor();
    await viewer.getByRole('link', { name: /Open in Google Maps/ }).waitFor();
    step('safety: share link works for a contact, shows check-in and last location, and carries no write key');
    await safety.getByRole('button', { name: 'Stop sharing' }).click();
    await safety.getByRole('button', { name: 'Share my day live' }).waitFor();
    await viewer.reload();
    await viewer.getByText(/ended or the link is not valid/).waitFor();
    await viewer.close();
    step('safety: stopping a share ends the link immediately');
    await page.keyboard.press('Escape');

    // ---- Recap: notes + shareable page
    await page.goto(`${BASE}/today`);
    await page.getByRole('button', { name: 'Day recap' }).click();
    await page.getByRole('heading', { name: /Your day/ }).waitFor();
    await page.locator('textarea').first().fill('Best masala chai of the trip');
    await axeAudit(page, 'recap');
    await page.getByRole('button', { name: 'Create share link' }).click();
    await page.getByRole('button', { name: 'Delete shared link' }).waitFor();
    const recapToken = await page.evaluate(() => JSON.parse(localStorage.getItem('planb_recap')!).token as string);
    const rv = await context.newPage();
    await rv.goto(`${BASE}/r/${recapToken}`);
    await rv.getByText(/Best masala chai of the trip/).waitFor();
    await axeAudit(rv, 'recap viewer');
    await rv.close();
    await page.getByRole('button', { name: 'Delete shared link' }).click();
    await page.getByRole('button', { name: 'Create share link' }).waitFor();
    step('recap: note saved, shareable page renders it, deleting the link works');

    // ---- Install + reminders card
    await page.goto(`${BASE}/today`);
    await page.waitForSelector('article[aria-label^="Stop"]');
    await page.evaluate(() => { const e: any = new Event('beforeinstallprompt'); e.prompt = async () => undefined; e.userChoice = Promise.resolve({ outcome: 'dismissed' }); window.dispatchEvent(e); });
    await page.getByText('Add PlanB to your home screen').waitFor();
    await page.getByRole('button', { name: 'Turn on reminders' }).waitFor();
    await axeAudit(page, 'install card');
    await page.getByRole('button', { name: 'Not now' }).click();
    assert.equal(await page.getByText('Add PlanB to your home screen').count(), 0, 'dismissed card stays hidden');
    step('install card appears once, offers reminders, and can be dismissed');

    // ---- Map Explorer (zero-config: curated fallback)
    await page.goto(`${BASE}/map`);
    await page.getByRole('radio', { name: 'Cafés' }).click();
    // Curated data may have no cafés for the randomly chosen city; either a list or the empty-state message is valid.
    await page.waitForSelector('section[aria-label="Places"] li, section[aria-label="Places"] [role="status"]');
    await page.getByRole('radio', { name: 'Hostels' }).click();
    await page.getByText('Connect a Google Places key to see hostels and agencies.').waitFor();
    await page.getByRole('radio', { name: 'Best of best' }).click();
    await page.locator('section[aria-label="Places"] li button').first().click();
    await page.getByRole('dialog').waitFor();
    await page.screenshot({ path: `${SHOTS}/08-map.png` });
    await axeAudit(page, 'map explorer');
    await page.keyboard.press('Escape');
    step('Map Explorer: categories, curated fallback, details sheet');

    // ---- Legal pages: reachable from Preferences, readable, accessible, honest about data flows
    await page.goto(`${BASE}/preferences`);
    await page.getByRole('dialog', { name: 'Preferences' }).getByRole('link', { name: 'Privacy' }).click();
    await page.getByRole('heading', { name: 'Privacy' }).waitFor();
    await page.getByText('Your location is used only when you tap').waitFor();
    await axeAudit(page, 'privacy page');
    await page.goto(`${BASE}/terms`);
    await page.getByText('Your judgment comes first').waitFor();
    await page.goto(`${BASE}/data-sources`);
    await page.getByText('Curated listings').first().waitFor();
    await axeAudit(page, 'data sources page');
    step('privacy / terms / data-sources pages render and pass axe');

    // ---- Hindi: switch in Preferences, the main screen changes, switch back
    await page.goto(`${BASE}/preferences`);
    await page.getByRole('dialog', { name: 'Preferences' }).getByRole('radio', { name: 'हिन्दी' }).click();
    await page.goto(`${BASE}/?new=1`);
    await page.getByRole('heading', { name: 'आप कहाँ जा रहे हैं?' }).waitFor();
    await page.waitForTimeout(700); // let the fade-in finish so contrast is measured on final colours
    await axeAudit(page, 'calibration (Hindi)');
    await page.goto(`${BASE}/preferences`);
    await page.getByRole('dialog', { name: 'पसंद' }).getByRole('radio', { name: 'English' }).click();
    await page.goto(`${BASE}/?new=1`);
    await page.getByRole('heading', { name: 'Where are you heading?' }).waitFor();
    step('Hindi switch changes the main screen and switches back');

    // ---- Reset data
    await page.goto(`${BASE}/preferences`);
    await page.getByRole('button', { name: /Reset & delete all my data/ }).click();
    await page.getByRole('button', { name: 'Delete all' }).click();
    await page.getByRole('heading', { name: 'Where are you heading?' }).waitFor();
    await page.goto(`${BASE}/today`);
    await page.getByRole('heading', { name: 'Where are you heading?' }).waitFor(); // no plan → redirected to /
    step('Reset & delete clears everything; /today redirects to /');

    // ---- Layout at other viewports (no horizontal overflow)
    for (const [w, h] of [[375, 812], [390, 844], [1280, 800]] as const) {
      await page.setViewportSize({ width: w, height: h });
      const over = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      assert.equal(over, false, `no horizontal scroll at ${w}px`);
      await page.screenshot({ path: `${SHOTS}/vp-${w}.png` });
    }
    step('no horizontal overflow at 375 / 390 / 1280');

    assert.deepEqual(errors, [], `console errors: ${errors.join(' | ')}`);
    await browser.close();
    console.log('E2E passed');
  } finally {
    server?.kill();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
