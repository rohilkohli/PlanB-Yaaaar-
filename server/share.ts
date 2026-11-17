/**
 * "Share my day" (live, safety) and "Share recap" (after the day).
 *
 * Privacy and policy by construction:
 *  - A link is an unguessable 128-bit token. The sharer also holds a separate write key (stored only as a hash), so
 *    nobody who merely has the link can post locations or stop the share.
 *  - Nothing from the client is stored verbatim. The view is rebuilt from whitelisted, length-capped fields. Curated
 *    venue names come from OUR catalogue by id; Google venues are stored as place ids only and named live by the viewer
 *    (Google Places content is never persisted, see docs/GOOGLE-COMPLIANCE.md).
 *  - Live shares expire on their own (18 h) and can be stopped at any time, which deletes the data immediately.
 *    Location is kept only as the latest point; there is no history.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PLACES_DATABASE, CITIES } from '../src/data/placesData';
import { deleteDoc, getDoc, putDoc } from './store';
import { ApiError } from './pipeline';

export type ShareKind = 'share' | 'recap';
const COLL = { share: 'shares', recap: 'recaps' } as const;
const TTL = { share: 18 * 3600, recap: 30 * 24 * 3600 } as const;

export interface ViewBlock {
  id: string; start: number; end: number; status: string; category: string;
  source: 'curated' | 'google'; name?: string; placeId?: string; note?: string;
}
export interface SharedView { v: 1; kind: ShareKind; city: string; date: string; tz: string; createdAt: string; blocks: ViewBlock[] }
interface Record_ {
  writeHash: string; view: SharedView;
  location: { lat: number; lng: number; acc: number | null; at: number } | null;
  checkin: { status: 'safe' | 'help'; at: number } | null;
}

const CURATED = new Map(PLACES_DATABASE.map(v => [v.placeId, v]));
const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');
const num = (v: unknown, lo: number, hi: number, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const CATS = new Set(['viewpoint', 'dining', 'cafe', 'culture', 'walk', 'bakery', 'market']);
const STATUSES = new Set(['upcoming', 'in_progress', 'completed', 'skipped']);

/** Rebuild a view from an untrusted plan. `notes` (recap only) are the traveler's own words, plain text, capped. */
export function buildView(kind: ShareKind, plan: any, notes: Record<string, unknown> = {}): SharedView {
  const blocks: ViewBlock[] = (Array.isArray(plan?.blocks) ? plan.blocks : []).slice(0, 8).map((b: any, i: number): ViewBlock => {
    const placeId = clip(b?.venue?.placeId, 120);
    const curated = CURATED.get(placeId);
    const google = !curated && /^[A-Za-z0-9_-]{10,120}$/.test(placeId);
    const category = curated?.category ?? (CATS.has(b?.venue?.category) ? b.venue.category : 'walk');
    return {
      id: clip(b?.blockId, 40) || `b${i}`, start: num(b?.startMinutes, 0, 2879), end: num(b?.endMinutes, 0, 2879),
      status: STATUSES.has(b?.status) ? b.status : 'upcoming', category,
      source: curated ? 'curated' : 'google',
      ...(curated ? { name: curated.name } : google ? { placeId } : { name: 'Stop' }),
      ...(kind === 'recap' && notes[clip(b?.blockId, 40)] ? { note: clip(notes[clip(b?.blockId, 40)], 240) } : {})
    };
  });
  if (!blocks.length) throw new ApiError(400, 'bad_plan', 'There is nothing to share yet.');
  const known = CITIES.find(c => c.id === plan?.city?.id);
  return {
    v: 1, kind, city: known?.name ?? (clip(plan?.city?.name, 60) || 'Your trip'),
    date: /^\d{4}-\d{2}-\d{2}$/.test(plan?.calibration?.date ?? '') ? plan.calibration.date : new Date().toISOString().slice(0, 10),
    tz: clip(plan?.calibration?.timezone ?? plan?.city?.timezone, 40) || 'Asia/Kolkata', createdAt: new Date().toISOString(), blocks
  };
}

export async function createShare(kind: ShareKind, plan: any, notes?: Record<string, unknown>) {
  const view = buildView(kind, plan, notes);
  const token = randomBytes(16).toString('base64url');
  const writeKey = randomBytes(24).toString('base64url');
  const rec: Record_ = { writeHash: sha(writeKey), view, location: null, checkin: null };
  if (!(await putDoc(COLL[kind], token, rec, TTL[kind]))) throw new ApiError(503, 'store_unavailable', 'Sharing is temporarily unavailable. Please try again.');
  return { token, writeKey, expiresInSec: TTL[kind] };
}

async function authed(kind: ShareKind, token: unknown, writeKey: unknown): Promise<Record_> {
  const t = clip(token, 40);
  const rec = t ? await getDoc<Record_>(COLL[kind], t) : null;
  if (!rec) throw new ApiError(404, 'not_found', 'This link is no longer active.');
  const a = Buffer.from(sha(String(writeKey ?? '')));
  const b = Buffer.from(rec.writeHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ApiError(403, 'forbidden', 'Not allowed.');
  return rec;
}

const ttlLeft = (kind: ShareKind, rec: Record_) => Math.max(60, TTL[kind] - Math.floor((Date.now() - Date.parse(rec.view.createdAt)) / 1000));

export async function postLocation(body: any) {
  const rec = await authed('share', body?.token, body?.writeKey);
  const lat = body?.lat, lng = body?.lng;
  if (typeof lat !== 'number' || typeof lng !== 'number' || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new ApiError(400, 'bad_location', 'Invalid location.');
  if (rec.location && Date.now() - rec.location.at < 8000) return { ok: true, throttled: true };
  rec.location = { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5, acc: typeof body?.acc === 'number' ? Math.round(body.acc) : null, at: Date.now() };
  await putDoc(COLL.share, clip(body.token, 40), rec, ttlLeft('share', rec));
  return { ok: true };
}

export async function postStatus(body: any) {
  const rec = await authed('share', body?.token, body?.writeKey);
  if (body?.status === 'safe' || body?.status === 'help') rec.checkin = { status: body.status, at: Date.now() };
  if (typeof body?.blockId === 'string' && STATUSES.has(body?.blockStatus)) {
    const b = rec.view.blocks.find(x => x.id === clip(body.blockId, 40)); if (b) b.status = body.blockStatus;
  }
  await putDoc(COLL.share, clip(body.token, 40), rec, ttlLeft('share', rec));
  return { ok: true };
}

export async function stopShare(kind: ShareKind, body: any) {
  await authed(kind, body?.token, body?.writeKey);
  await deleteDoc(COLL[kind], clip(body.token, 40));
  return { ok: true };
}

/** What a viewer sees: no write key, no hashes. */
export async function readShare(kind: ShareKind, token: string) {
  const rec = await getDoc<Record_>(COLL[kind], clip(token, 40));
  if (!rec) throw new ApiError(404, 'not_found', kind === 'share' ? 'This share has ended or the link is not valid.' : 'This recap is no longer available.');
  return { view: rec.view, location: rec.location, checkin: rec.checkin, serverNow: Date.now() };
}
