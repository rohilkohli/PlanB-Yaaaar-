/**
 * Client side of "Share my day" and the day recap.
 * The trusted contact and notes live only on this device. Location is sent only while a share is ON and PlanB is
 * open (a web app cannot track in the background), at most every 20 s, and the server keeps only the latest point.
 */
import type { DayPlan } from '../types/itinerary';

const K = { share: 'planb_share', contact: 'planb_contact', notes: 'planb_notes', recap: 'planb_recap', checkin: 'planb_checkin' };

function read<T>(key: string): T | null { try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : null; } catch { return null; } }
function write(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode: state just won't persist */ } }
function del(key: string) { try { localStorage.removeItem(key); } catch { /* ignore */ } }

export interface ShareState { token: string; writeKey: string; planId: string; startedAt: number }
export interface Contact { name: string; phone: string }

export const shareStore = {
  get(): ShareState | null { const s = read<ShareState>(K.share); return s && Date.now() - s.startedAt < 18 * 3600_000 ? s : null; },
  set: (s: ShareState) => write(K.share, s),
  clear: () => del(K.share)
};
export const contactStore = {
  get: () => read<Contact>(K.contact),
  set: (c: Contact) => write(K.contact, { name: c.name.trim().slice(0, 40), phone: c.phone.replace(/[^\d+]/g, '').slice(0, 16) }),
  clear: () => del(K.contact)
};
export const notesStore = {
  all: () => read<Record<string, string>>(K.notes) ?? {},
  set(blockId: string, text: string) { const n = notesStore.all(); if (text.trim()) n[blockId] = text.slice(0, 240); else delete n[blockId]; write(K.notes, n); }
};
export const recapStore = {
  get: () => read<ShareState>(K.recap),
  set: (s: ShareState) => write(K.recap, s),
  clear: () => del(K.recap)
};
/** Remember the traveler already answered today's check-in, so the prompt does not nag. */
export const checkinStore = {
  done: (planId: string) => read<string>(K.checkin) === planId,
  mark: (planId: string) => write(K.checkin, planId)
};

export const shareLink = (token: string) => `${location.origin}/s/${token}`;
export const recapLink = (token: string) => `${location.origin}/r/${token}`;
export const whatsappLink = (text: string, phone?: string) => `https://wa.me/${(phone ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;

async function post(path: string, body: unknown): Promise<any> {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.message || 'Something went wrong. Please try again.'), { status: r.status });
  return j;
}

export async function startShare(plan: DayPlan): Promise<ShareState> {
  const j = await post('/api/share', { plan });
  const s: ShareState = { token: j.token, writeKey: j.writeKey, planId: plan.planId, startedAt: Date.now() };
  shareStore.set(s);
  liveLocation.sync();
  return s;
}

export async function endShare(): Promise<void> {
  const s = shareStore.get();
  liveLocation.stop();
  shareStore.clear();
  if (s) await post('/api/share/stop', { token: s.token, writeKey: s.writeKey }).catch(() => undefined);
}

export async function sendStatus(status: 'safe' | 'help', plan?: DayPlan): Promise<boolean> {
  const s = shareStore.get();
  if (plan) checkinStore.mark(plan.planId);
  if (!s) return false;
  try { await post('/api/share/status', { token: s.token, writeKey: s.writeKey, status }); return true; } catch { return false; }
}

export async function syncBlockStatus(blockId: string, blockStatus: string): Promise<void> {
  const s = shareStore.get();
  if (!s) return;
  await post('/api/share/status', { token: s.token, writeKey: s.writeKey, blockId, blockStatus }).catch(() => undefined);
}

export async function shareRecap(plan: DayPlan): Promise<ShareState> {
  const prev = recapStore.get();
  if (prev) await post('/api/recap/stop', { token: prev.token, writeKey: prev.writeKey }).catch(() => undefined);
  const j = await post('/api/recap', { plan, notes: notesStore.all() });
  const s: ShareState = { token: j.token, writeKey: j.writeKey, planId: plan.planId, startedAt: Date.now() };
  recapStore.set(s);
  return s;
}
export async function deleteRecap(): Promise<void> {
  const s = recapStore.get(); recapStore.clear();
  if (s) await post('/api/recap/stop', { token: s.token, writeKey: s.writeKey }).catch(() => undefined);
}

/** Sends the latest GPS point while a share is active. One watcher for the whole app; throttled. */
class LiveLocation {
  private watch: number | null = null;
  private last = 0;
  sync() {
    const s = shareStore.get();
    if (!s) { this.stop(); return; }
    if (this.watch !== null || !('geolocation' in navigator)) return;
    this.watch = navigator.geolocation.watchPosition(pos => {
      const cur = shareStore.get();
      if (!cur || Date.now() - this.last < 20_000) return;
      this.last = Date.now();
      post('/api/share/location', { token: cur.token, writeKey: cur.writeKey, lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy })
        .catch((e: { status?: number }) => { if (e?.status === 404) { shareStore.clear(); this.stop(); } });
    }, () => undefined, { enableHighAccuracy: false, maximumAge: 15_000, timeout: 20_000 });
  }
  stop() { if (this.watch !== null) navigator.geolocation.clearWatch(this.watch); this.watch = null; }
}
export const liveLocation = new LiveLocation();

export function clearShareData() { shareStore.clear(); contactStore.clear(); recapStore.clear(); del(K.notes); del(K.checkin); liveLocation.stop(); }
