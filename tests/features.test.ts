import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handle } from '../server/handlers';
import { resetMemoryLimits } from '../server/ratelimit';
import { resetBudget } from '../server/budget';
import { resetStore, putDoc, getDoc, listDue } from '../server/store';
import { buildView } from '../server/share';
import { cronToken, dispatchDue, planReminders, setPushSender, validSub, zonedEpoch } from '../server/push';
import { fetchLegs } from '../server/routes';
import { retimePlan } from '../src/core/retime';
import { generatePlan } from '../src/core/planner';
import { buildCalibration, sunsetFor } from '../src/core/calibration';
import { CITIES, PLACES_DATABASE } from '../src/data/placesData';
const DEFAULT_PREFS: TravelerPreferences = { mobility: 'stairs_okay', maxStrideMinutes: 25, dietary: [], units: 'km', afterDarkMode: 'well_lit' };
import type { ApiRequest } from '../server/http';
import type { TravelerPreferences } from '../src/types/itinerary';

const req = (method: string, path: string, body?: unknown, q = '', ip = '9.9.9.9', headers?: Record<string, string>): ApiRequest =>
  ({ method, path, query: new URLSearchParams(q), body, ip, headers });
const city = CITIES.find(c => c.id === 'jaipur')!;
function makePlan() {
  const cal = buildCalibration({ cityId: 'jaipur', startTime: '09:30', endTime: '19:30', energy: 'balanced', budget: '₹₹', afterDark: 'well_lit', social: 'ambient', coords: city.coords } as any, city, '2026-11-13');
  const venues = PLACES_DATABASE.filter(v => v.cityId === 'jaipur');
  return generatePlan(cal, DEFAULT_PREFS, { city, candidates: venues, sunsetMinutes: sunsetFor(city, '2026-11-13'), now: { minutes: 9 * 60, date: '2026-11-13' } });
}

const saved = { ...process.env };
beforeEach(() => { resetMemoryLimits(); resetBudget(); resetStore(); delete process.env.GOOGLE_PLACES_API_KEY; delete process.env.K_SERVICE; delete process.env.GOOGLE_CLOUD_PROJECT; });
afterEach(() => { process.env = { ...saved }; setPushSender(null); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('document store', () => {
  it('round-trips, expires, and lists what is due', async () => {
    await putDoc('t', 'a', { n: 1 }, 60, 1000);
    await putDoc('t', 'b', { n: 2 }, 60, 5000);
    expect(await getDoc('t', 'a')).toEqual({ n: 1 });
    expect((await listDue('t', 2000)).map(d => d.id)).toEqual(['a']);
    await putDoc('t', 'gone', { n: 3 }, -1);
    expect(await getDoc('t', 'gone')).toBeNull();
  });
});

describe('share view is rebuilt from whitelisted fields only', () => {
  const evil = { city: { id: 'x', name: '<script>alert(1)</script>Paris' }, calibration: { date: '2026-11-13', timezone: 'Asia/Kolkata' },
    blocks: [
      { blockId: 'b1', startMinutes: 600, endMinutes: 660, status: 'completed', venue: { placeId: 'pl_jaipur_hawa_mahal', name: 'FAKE NAME', category: 'dining' } },
      { blockId: 'b2', startMinutes: 700, endMinutes: 760, status: 'upcoming', venue: { placeId: 'ChIJabcdefghijk123', name: 'Google Venue Name', address: '1 Main St', rating: 4.9 } },
      { blockId: 'b3', startMinutes: 800, endMinutes: 860, status: 'hacked', venue: { placeId: '../../etc/passwd' } }
    ] };
  it('uses catalogue names for curated venues, place ids only for Google venues, and strips markup', () => {
    const v = buildView('share', evil);
    expect(v.blocks[0].name).toBe(PLACES_DATABASE.find(p => p.placeId === 'pl_jaipur_hawa_mahal')!.name);
    expect(v.blocks[1]).toMatchObject({ source: 'google', placeId: 'ChIJabcdefghijk123' });
    expect(v.blocks[1].name).toBeUndefined();
    expect(JSON.stringify(v)).not.toMatch(/Google Venue Name|1 Main St|FAKE NAME|<script>/);
    expect(v.blocks[2].status).toBe('upcoming');
    expect(v.blocks[2].placeId).toBeUndefined();
  });
  it('only keeps notes for recaps and clips them', () => {
    expect(buildView('share', evil, { b1: 'hello' }).blocks[0].note).toBeUndefined();
    expect(buildView('recap', evil, { b1: 'x'.repeat(999) }).blocks[0].note!.length).toBe(240);
  });
});

describe('share API', () => {
  it('creates a link, requires the write key for updates, shows live data to viewers and can be stopped', async () => {
    const plan = makePlan();
    const c = await handle(req('POST', '/api/share', { plan }));
    expect(c.status).toBe(200);
    const { token, writeKey } = c.body as any;
    expect(token.length).toBeGreaterThanOrEqual(20);

    const bad = await handle(req('POST', '/api/share/location', { token, writeKey: 'nope', lat: 26.9, lng: 75.8 }));
    expect(bad.status).toBe(403);
    const ok = await handle(req('POST', '/api/share/location', { token, writeKey, lat: 26.92388, lng: 75.82661, acc: 12 }));
    expect(ok.status).toBe(200);
    expect((await handle(req('POST', '/api/share/location', { token, writeKey, lat: 999, lng: 0 }))).status).toBe(400);
    await handle(req('POST', '/api/share/status', { token, writeKey, status: 'safe' }));

    const v = await handle(req('GET', '/api/share/view', undefined, `t=${token}`, '5.5.5.5'));
    const body = v.body as any;
    expect(body.location).toMatchObject({ lat: 26.92388, lng: 75.82661 });
    expect(body.checkin.status).toBe('safe');
    expect(JSON.stringify(body)).not.toContain(writeKey);
    expect(JSON.stringify(body)).not.toContain('writeHash');
    expect(v.headers?.['X-Robots-Tag']).toBe('noindex');

    expect((await handle(req('POST', '/api/share/stop', { token, writeKey: 'wrong' }))).status).toBe(403);
    expect((await handle(req('POST', '/api/share/stop', { token, writeKey }))).status).toBe(200);
    expect((await handle(req('GET', '/api/share/view', undefined, `t=${token}`, '5.5.5.5'))).status).toBe(404);
  });
  it('throttles rapid location updates and limits link creation per visitor', async () => {
    const plan = makePlan();
    const { token, writeKey } = (await handle(req('POST', '/api/share', { plan }))).body as any;
    await handle(req('POST', '/api/share/location', { token, writeKey, lat: 26.9, lng: 75.8 }));
    const second = await handle(req('POST', '/api/share/location', { token, writeKey, lat: 27.0, lng: 75.9 }));
    expect((second.body as any).throttled).toBe(true);
    let last = 200;
    for (let i = 0; i < 9; i++) last = (await handle(req('POST', '/api/share', { plan }, '', '7.7.7.7'))).status;
    expect(last).toBe(429);
  });
  it('rejects an empty plan', async () => {
    expect((await handle(req('POST', '/api/share', { plan: { blocks: [] } }))).status).toBe(400);
  });
  it('recaps carry notes and have their own view', async () => {
    const plan = makePlan();
    const id = plan.blocks[0].blockId;
    const { token } = (await handle(req('POST', '/api/recap', { plan, notes: { [id]: 'Best chai ever' } }))).body as any;
    const v = (await handle(req('GET', '/api/recap/view', undefined, `t=${token}`))).body as any;
    expect(v.view.blocks[0].note).toBe('Best chai ever');
    expect(v.view.kind).toBe('recap');
  });
});

describe('push reminders', () => {
  const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } };
  it('only accepts real browser push endpoints (no SSRF)', () => {
    expect(validSub(sub)).toBe(true);
    expect(validSub({ ...sub, endpoint: 'https://169.254.169.254/latest' })).toBe(false);
    expect(validSub({ ...sub, endpoint: 'http://fcm.googleapis.com/x' })).toBe(false);
    expect(validSub({ ...sub, endpoint: 'https://fcm.googleapis.com.evil.com/x' })).toBe(false);
  });
  it('converts local plan times to the right instant for IST', () => {
    expect(new Date(zonedEpoch('2026-11-13', 10 * 60, 'Asia/Kolkata')).toISOString()).toBe('2026-11-13T04:30:00.000Z');
  });
  it('schedules at most two reminders from the plan and never leaks Google names', () => {
    const plan = makePlan();
    const now = zonedEpoch('2026-11-13', 8 * 60, 'Asia/Kolkata');
    const r = planReminders(plan, sub, now);
    expect(r.length).toBe(2);
    expect(r.map(x => x.doc.kind).sort()).toEqual(['checkin', 'next']);
    const g = { ...plan, blocks: plan.blocks.map(b => ({ ...b, venue: { ...b.venue, placeId: 'ChIJgoogleplace123', name: 'Secret Google Name' } })) };
    expect(JSON.stringify(planReminders(g, sub, now))).not.toContain('Secret Google Name');
  });
  it('subscribe → dispatch sends due reminders once, and the cron endpoint needs its token', async () => {
    process.env.VAPID_PUBLIC_KEY = 'pub'; process.env.VAPID_PRIVATE_KEY = 'priv';
    const sent: string[] = [];
    setPushSender(async (_s, payload) => { sent.push(payload); });
    const plan = makePlan();
    // freeze "now" before the first stop so the next-stop reminder is in the future
    vi.useFakeTimers({ now: zonedEpoch('2026-11-13', 8 * 60, 'Asia/Kolkata') });
    const r = await handle(req('POST', '/api/push/subscribe', { subscription: sub, plan }));
    const sched = (r.body as any).scheduled as Array<{ kind: string; at: string }>;
    expect(sched.length).toBe(2);
    vi.setSystemTime(Date.parse(sched.find(x => x.kind === 'next')!.at) + 30_000);
    expect((await dispatchDue(Date.now())).sent).toBe(1);
    expect((await dispatchDue(Date.now())).sent).toBe(0); // already delivered: never twice
    vi.setSystemTime(Date.parse(sched.find(x => x.kind === 'checkin')!.at) + 30_000);
    expect((await dispatchDue(Date.now())).sent).toBe(1);
    expect(sent.length).toBe(2);
    vi.useRealTimers();
    expect(JSON.parse(sent[0]).url).toMatch(/^\//);
    expect((await handle(req('POST', '/api/push/dispatch'))).status).toBe(403);
    expect((await handle(req('POST', '/api/push/dispatch', undefined, '', '1.1.1.1', { 'x-cron-token': cronToken() as string }))).status).toBe(200);
  });
  it('is unavailable (and hidden in /api/config) without VAPID keys', async () => {
    delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
    expect(((await handle(req('GET', '/api/config'))).body as any).vapidPublicKey).toBeNull();
    expect((await handle(req('POST', '/api/push/subscribe', { subscription: sub, plan: makePlan() }))).status).toBe(503);
  });
});

describe('real travel times', () => {
  it('retimePlan pushes a later stop when the real leg is longer, keeps order, and drops what no longer fits', () => {
    const plan = makePlan();
    const legs = plan.blocks.map((_, i) => (i === 0 ? null : { minutes: 90, km: 12, mode: 'cab' as const }));
    const r = retimePlan(plan, legs, sunsetFor(city, '2026-11-13'));
    expect(r.moved + r.dropped).toBeGreaterThan(0);
    const names = r.plan.blocks.map(b => b.venue.placeId);
    expect(names).toEqual(plan.blocks.map(b => b.venue.placeId).filter(id => names.includes(id)));
    for (let i = 1; i < r.plan.blocks.length; i++) expect(r.plan.blocks[i].startMinutes).toBeGreaterThanOrEqual(r.plan.blocks[i - 1].endMinutes);
    expect(r.plan.blocks.map(b => b.sequence)).toEqual(r.plan.blocks.map((_, i) => i + 1));
  });
  it('does not move anything when real legs are shorter, but labels them with the real time', () => {
    const plan = makePlan();
    const r = retimePlan(plan, plan.blocks.map((_, i) => (i === 0 ? null : { minutes: 3, km: 0.2, mode: 'walk' as const })));
    expect(r.moved).toBe(0);
    expect(r.plan.blocks[1].transitFromPrev).toBe('3 min walk · 0.2 km');
    expect(r.plan.blocks.map(b => b.startMinutes)).toEqual(plan.blocks.map(b => b.startMinutes));
  });
  it('fetchLegs calls the Routes API per leg and falls back to nulls on failure or without a key', async () => {
    const pts = PLACES_DATABASE.filter(v => v.cityId === 'jaipur').slice(0, 3).map(v => v.coords);
    expect((await fetchLegs(pts, 25)).every(l => l === null)).toBe(true); // no key
    process.env.GOOGLE_PLACES_API_KEY = 'k';
    const calls: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: any) => { calls.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ routes: [{ duration: '600s', distanceMeters: 800 }] }) } as any; }));
    const legs = await fetchLegs(pts, 25);
    expect(calls.length).toBe(2);
    expect(legs[0]).toBeNull();
    expect(legs[1]?.minutes).toBeGreaterThanOrEqual(10);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom'); }));
    resetBudget();
    expect((await fetchLegs(pts, 25)).every(l => l === null)).toBe(true);
  });
});

/* ------------------------------------------------------------------ flags, voice, trip memory, ride links */
import { blockFlags } from '../src/core/flags';
import { parseVoiceIntent } from '../src/core/voiceIntent';
import { headingToMessage, rideBackUrl } from '../src/core/transport';
import { tripStore } from '../src/services/trip';
import { t as tr, setLang } from '../src/i18n';

describe('stop flags are factual logistics, never safety claims', () => {
  const SAFETY = /\b(well[- ]?lit|safe|safety|secure|security|risk[- ]free|no danger|guaranteed)\b/i;
  it('flags a venue that closes soon after the visit and a stop that ends after sunset', () => {
    const plan = makePlan();
    const b = { ...plan.blocks[0], status: 'upcoming' as const, startMinutes: 17 * 60, endMinutes: 18 * 60 + 30, venue: { ...plan.blocks[0].venue, periods: undefined, opensAt: '09:00', closesAt: '19:00' } };
    const flags = blockFlags({ blocks: [b], localSunsetTime: '5:45 PM' }, b);
    expect(flags.map(f => f.id)).toEqual(['closes_soon', 'ends_after_sunset', 'ride_back']);
  });
  it('says nothing for finished stops or an early afternoon stop with long opening hours', () => {
    const plan = makePlan();
    const early = { ...plan.blocks[0], status: 'upcoming' as const, startMinutes: 11 * 60, endMinutes: 12 * 60, venue: { ...plan.blocks[0].venue, periods: undefined, opensAt: '08:00', closesAt: '22:00' } };
    expect(blockFlags({ blocks: [early, plan.blocks[1]], localSunsetTime: '6:10 PM' }, early)).toEqual([]);
    expect(blockFlags({ blocks: [early], localSunsetTime: '6:10 PM' }, { ...early, status: 'completed' })).toEqual([]);
  });
  it('no flag label, in any language, claims or implies safety', () => {
    for (const lang of ['en', 'hi'] as const) {
      setLang(lang);
      for (const k of ['flag.closesSoon', 'flag.afterSunset', 'flag.rideBack']) expect(tr(k)).not.toMatch(SAFETY);
    }
    setLang('en');
  });
});

describe('voice intent', () => {
  it('maps what people actually say to the adapt chips', () => {
    expect(parseVoiceIntent("it's raining and my battery is low").scenarios.sort()).toEqual(['low_battery', 'weather_turned']);
    expect(parseVoiceIntent('I am hungry and running late').scenarios.sort()).toEqual(['hungry_now', 'running_late']);
    expect(parseVoiceIntent('something quieter please').socialShift).toBe('quieter');
    expect(parseVoiceIntent('somewhere livelier with music').socialShift).toBe('livelier');
  });
  it('understands Hindi and Hinglish', () => {
    expect(parseVoiceIntent('बारिश हो रही है').scenarios).toContain('weather_turned');
    expect(parseVoiceIntent('bahut thak gaya hu, bhook lagi hai').scenarios.sort()).toEqual(['hungry_now', 'low_battery']);
  });
  it('selects nothing for unrelated speech, never keeps more than 140 characters, and never throws on odd input', () => {
    expect(parseVoiceIntent('what time is it').scenarios).toEqual([]);
    expect(parseVoiceIntent('x'.repeat(500)).note.length).toBe(140);
    expect(parseVoiceIntent('').scenarios).toEqual([]);
  });
});

describe('ride links', () => {
  it('builds the ride-back link to where the day started and a plain heading-to message', () => {
    const u = new URL(rideBackUrl({ lat: 26.9, lng: 75.8 }));
    expect(u.hostname).toBe('m.uber.com');
    expect(u.searchParams.get('dropoff[latitude]')).toBe('26.9');
    expect(u.searchParams.get('pickup')).toBe('my_location');
    expect(headingToMessage('Hawa Mahal', '10:30 AM', 'https://maps/x')).toBe('Heading to Hawa Mahal (arriving around 10:30 AM). Map: https://maps/x — sent from PlanB');
  });
});

describe('multi-day memory', () => {
  const store: Record<string, string> = {};
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } });
  });
  it('remembers visited and skipped stops per city and leaves them out of the next day, server-side too', async () => {
    const plan = makePlan();
    plan.blocks[0].status = 'completed'; plan.blocks[1].status = 'skipped';
    tripStore.record(plan);
    const ex = tripStore.excludeFor({ cityId: 'jaipur' });
    expect(ex).toEqual(expect.arrayContaining([plan.blocks[0].venue.placeId, plan.blocks[1].venue.placeId]));
    expect(tripStore.excludeFor({ cityId: 'udaipur' })).toEqual([]);
    expect(tripStore.excludeFor({ query: 'jaipur old city' })).toEqual(expect.arrayContaining(ex));
    expect(tripStore.preview(plan)).toEqual({ day: 2, skipping: 2 });

    const body = { calibration: { cityId: 'jaipur', startTime: '09:30', endTime: '19:30', energy: 'balanced', budget: '₹₹', afterDark: 'well_lit', social: 'ambient', date: '2026-11-14' }, now: { minutes: 540, date: '2026-11-14' }, excludeIds: ex };
    const r = await handle(req('POST', '/api/plan/generate', body));
    const ids = (r.body as any).plan.blocks.map((b: any) => b.venue.placeId);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    for (const id of ex) expect(ids).not.toContain(id);
  });
  it('falls back to repeats rather than returning a thin day when everything was already seen', async () => {
    const all = PLACES_DATABASE.filter(v => v.cityId === 'jaipur').map(v => v.placeId);
    const body = { calibration: { cityId: 'jaipur', startTime: '09:30', endTime: '19:30', energy: 'balanced', budget: '₹₹', afterDark: 'well_lit', social: 'ambient', date: '2026-11-14' }, now: { minutes: 540, date: '2026-11-14' }, excludeIds: all.slice(0, 150) };
    const r = await handle(req('POST', '/api/plan/generate', body));
    expect((r.body as any).plan.blocks.length).toBeGreaterThanOrEqual(3);
  });
  it('can be cleared', () => {
    const plan = makePlan(); plan.blocks[0].status = 'completed';
    tripStore.record(plan); tripStore.clear();
    expect(tripStore.excludeFor({ cityId: 'jaipur' })).toEqual([]);
  });
});

/* ------------------------------------------------------------------ theme + map tiles */
import { DARK_MAP_STYLE, mapStylesFor } from '../src/services/mapStyle';

describe('theme service', () => {
  const store: Record<string, string> = {};
  const attrs: Record<string, string> = {};
  let systemDark = false;
  const metas = [{ dataset: {} as Record<string, string>, media: '(prefers-color-scheme: light)', content: '', getAttribute(n: string) { return n === 'media' ? this.media : null; }, setAttribute(n: string, v: string) { if (n === 'media') this.media = v; } },
                 { dataset: {} as Record<string, string>, media: '(prefers-color-scheme: dark)', content: '', getAttribute(n: string) { return n === 'media' ? this.media : null; }, setAttribute(n: string, v: string) { if (n === 'media') this.media = v; } }];
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    for (const k of Object.keys(attrs)) delete attrs[k];
    systemDark = false;
    vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } });
    vi.stubGlobal('document', { documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; }, removeAttribute: (k: string) => { delete attrs[k]; }, getAttribute: (k: string) => attrs[k] ?? null }, querySelectorAll: () => metas });
    vi.stubGlobal('window', { matchMedia: () => ({ get matches() { return systemDark; }, addEventListener() {}, removeEventListener() {} }), dispatchEvent: () => true, addEventListener() {}, removeEventListener() {} });
  });
  it('follows the phone by default and lets the traveler override it', async () => {
    const th = await import('../src/services/theme');
    expect(th.getThemeChoice()).toBe('system');
    expect(th.resolvedTheme()).toBe('light');
    systemDark = true;
    expect(th.resolvedTheme()).toBe('dark');
    th.setThemeChoice('light');
    expect(attrs['data-theme']).toBe('light');
    expect(th.resolvedTheme()).toBe('light'); // override beats a dark phone
    th.setThemeChoice('dark');
    expect(store['planb_theme']).toBe('dark');
    th.setThemeChoice('system');
    expect(attrs['data-theme']).toBeUndefined();
    expect(store['planb_theme']).toBeUndefined();
  });
  it('only the chosen browser-bar colour applies when overriding, and both again for System', async () => {
    const th = await import('../src/services/theme');
    th.setThemeChoice('dark');
    expect(metas.map(m => m.media)).toEqual(['not all', 'all']);
    th.setThemeChoice('light');
    expect(metas.map(m => m.media)).toEqual(['all', 'not all']);
    th.setThemeChoice('system');
    expect(metas.map(m => m.media)).toEqual(['(prefers-color-scheme: light)', '(prefers-color-scheme: dark)']);
  });
  it('ignores junk in storage', async () => {
    store['planb_theme'] = 'purple';
    expect((await import('../src/services/theme')).getThemeChoice()).toBe('system');
  });
});

describe('map tiles follow the theme', () => {
  it('uses Google defaults in light and a complete night style in dark', () => {
    expect(mapStylesFor('light')).toEqual([]);
    const dark = mapStylesFor('dark');
    expect(dark).toBe(DARK_MAP_STYLE);
    const feats = new Set(dark.map(s => s.featureType));
    for (const f of ['road', 'road.highway', 'water', 'poi.park', 'transit']) expect(feats.has(f)).toBe(true);
    expect(dark.every(s => Array.isArray(s.stylers))).toBe(true);
  });
});
