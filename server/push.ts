/**
 * Web Push reminders. At most TWO notifications per plan: "next stop starts soon" and an end-of-day check-in
 * (research: about two notifications is the retention sweet spot; more feels like spam).
 *
 * Security: the server never sends arbitrary client text. Titles/bodies are built here from the plan's own times, and a
 * venue is named only when it is in OUR curated catalogue (Google Places names are not stored, see docs/GOOGLE-COMPLIANCE.md).
 * Subscription endpoints are restricted to the browsers' push services, so a caller cannot make the server fetch arbitrary URLs (SSRF).
 * Delivery is driven by Cloud Scheduler calling /api/push/dispatch with a secret token every minute.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import * as webpushNs from 'web-push';
import { PLACES_DATABASE } from '../src/data/placesData';
import { deleteDoc, listDue, putDoc } from './store';
import { ApiError } from './pipeline';

// web-push is CommonJS: under native ESM its API sits on `default`, under bundlers on the namespace itself.
const webpush: typeof import('web-push') = (webpushNs as any).default ?? webpushNs;
const COLL = 'reminders';
const CURATED = new Map(PLACES_DATABASE.map(v => [v.placeId, v.name]));
const PUSH_HOSTS = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.apple\.com$/];

export interface Sub { endpoint: string; keys: { p256dh: string; auth: string } }
interface Reminder { sub: Sub; kind: 'next' | 'checkin'; title: string; body: string; url: string }
export type PushSender = (sub: Sub, payload: string) => Promise<void>;

export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY || null;
export const pushEnabled = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

let sender: PushSender | null = null;
export function setPushSender(s: PushSender | null) { sender = s; }
const defaultSender: PushSender = async (sub, payload) => {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://planb-tyo54jjhza-el.a.run.app', process.env.VAPID_PUBLIC_KEY as string, process.env.VAPID_PRIVATE_KEY as string);
  await webpush.sendNotification(sub, payload, { TTL: 3600, urgency: 'normal' });
};

export function cronToken(): string | null {
  const k = process.env.PLAN_SIGNING_KEY || (process.env.NODE_ENV === 'production' ? '' : 'planb-dev-only-signing-key');
  return k ? createHmac('sha256', k).update('push-cron').digest('base64url') : null;
}
export function cronAuthorized(header: unknown): boolean {
  const want = cronToken();
  if (!want || typeof header !== 'string') return false;
  const a = Buffer.from(header), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function validSub(s: any): s is Sub {
  if (typeof s?.endpoint !== 'string' || s.endpoint.length > 600) return false;
  let u: URL; try { u = new URL(s.endpoint); } catch { return false; }
  if (u.protocol !== 'https:' || !PUSH_HOSTS.some(r => r.test(u.hostname))) return false;
  const ok = (v: unknown, max: number) => typeof v === 'string' && /^[A-Za-z0-9_-]+=*$/.test(v) && v.length >= 8 && v.length <= max;
  return ok(s?.keys?.p256dh, 130) && ok(s?.keys?.auth, 40);
}

/** Epoch ms of `minutes` after local midnight on `dateISO` in `tz` (handles any UTC offset, including +05:30). */
export function zonedEpoch(dateISO: string, minutes: number, tz: string): number {
  const [y, m, d] = dateISO.split('-').map(Number);
  const naive = Date.UTC(y, m - 1, d, 0, minutes);
  let offset = 0;
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
    for (let i = 0; i < 2; i++) {
      const p = Object.fromEntries(fmt.formatToParts(new Date(naive - offset)).map(x => [x.type, Number(x.value)]));
      offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - (naive - offset);
    }
  } catch { offset = 330 * 60_000; }
  return naive - offset;
}

const hhmm = (m: number) => { const h = Math.floor(m / 60) % 24, mm = m % 60; return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const subId = (endpoint: string) => createHash('sha256').update(endpoint).digest('hex').slice(0, 32);

export function planReminders(plan: any, sub: Sub, now = Date.now()): Array<{ doc: Reminder; dueAt: number }> {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(plan?.calibration?.date ?? '') ? plan.calibration.date : null;
  const tz = String(plan?.calibration?.timezone ?? plan?.city?.timezone ?? 'Asia/Kolkata').slice(0, 40);
  const blocks: any[] = (Array.isArray(plan?.blocks) ? plan.blocks : []).slice(0, 8);
  if (!date || !blocks.length) return [];
  const out: Array<{ doc: Reminder; dueAt: number }> = [];
  const next = blocks.find(b => b?.status === 'upcoming' && Number.isFinite(b?.startMinutes) && zonedEpoch(date, b.startMinutes - 20, tz) > now + 60_000);
  if (next) {
    const name = CURATED.get(String(next?.venue?.placeId ?? ''));
    out.push({ dueAt: zonedEpoch(date, next.startMinutes - 20, tz), doc: { sub, kind: 'next', url: '/today',
      title: 'Next stop in 20 minutes', body: name ? `${name} · ${hhmm(next.startMinutes)}` : `Your next stop starts at ${hhmm(next.startMinutes)}. Time to head over?` } });
  }
  const last = blocks[blocks.length - 1];
  if (Number.isFinite(last?.endMinutes)) {
    const due = zonedEpoch(date, last.endMinutes + 15, tz);
    if (due > now + 60_000) out.push({ dueAt: due, doc: { sub, kind: 'checkin', url: '/today#checkin', title: 'How was your day?', body: 'Tap to check in and let your contact know you are back safe.' } });
  }
  return out;
}

export async function subscribe(body: any) {
  if (!pushEnabled()) throw new ApiError(503, 'push_unavailable', 'Reminders are not available right now.');
  if (!validSub(body?.subscription)) throw new ApiError(400, 'bad_subscription', 'This browser’s notification setup is not supported.');
  const sub = body.subscription as Sub;
  const id = subId(sub.endpoint);
  await Promise.all([deleteDoc(COLL, `${id}-next`), deleteDoc(COLL, `${id}-checkin`)]); // re-subscribing replaces the schedule
  const rems = planReminders(body?.plan, sub);
  for (const r of rems) await putDoc(COLL, `${id}-${r.doc.kind}`, r.doc, Math.ceil((r.dueAt - Date.now()) / 1000) + 2 * 3600, r.dueAt);
  return { ok: true, scheduled: rems.map(r => ({ kind: r.doc.kind, at: new Date(r.dueAt).toISOString() })) };
}

export async function unsubscribe(body: any) {
  const ep = body?.endpoint;
  if (typeof ep !== 'string' || ep.length > 600) throw new ApiError(400, 'bad_subscription', 'Invalid request.');
  const id = subId(ep);
  await Promise.all([deleteDoc(COLL, `${id}-next`), deleteDoc(COLL, `${id}-checkin`)]);
  return { ok: true };
}

/** Called every minute by Cloud Scheduler. Sends what is due, deletes it, and drops dead subscriptions. */
export async function dispatchDue(now = Date.now()) {
  const due = await listDue<Reminder>(COLL, now, 200);
  let sent = 0, dropped = 0;
  for (const d of due) {
    if (now - d.dueAt > 90 * 60_000) { await deleteDoc(COLL, d.id); dropped++; continue; } // far too late to be useful
    try {
      await (sender ?? defaultSender)(d.data.sub, JSON.stringify({ title: d.data.title, body: d.data.body, url: d.data.url, tag: d.data.kind }));
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) { await Promise.all([deleteDoc(COLL, `${subId(d.data.sub.endpoint)}-next`), deleteDoc(COLL, `${subId(d.data.sub.endpoint)}-checkin`)]); dropped++; }
    }
    await deleteDoc(COLL, d.id);
  }
  return { due: due.length, sent, dropped };
}
