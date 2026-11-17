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
