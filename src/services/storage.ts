/**
 * Local-first persistence (PRD FR-007, §27).
 *  - Active plan + preferences in IndexedDB (idb-keyval), mirrored to localStorage
 *  - 14-day auto-purge, 1-tap "delete all"
 *  - Private-browsing detection → keep in memory + offer copy-to-clipboard
 *  - 30-second Undo state
 *  - Closed-venue flags live in sessionStorage ("excludes Place ID from session")
 */
import { del, get, set } from 'idb-keyval';
import type { DayPlan, TravelerPreferences, UndoState, VerifiedVenue } from '../types/itinerary';

/**
 * Google's Places policy: Places content must not be stored beyond place IDs (and coordinates for up to 30 days).
 * Before a plan is saved, Google-sourced venues are reduced to id + coordinates + our own schedule; the name, address,
 * rating and hours are re-fetched when the plan is opened online. (Curated, hand-written venues are ours and stay.)
 */
export function redactVenue(v: VerifiedVenue): VerifiedVenue {
  if (v.source !== 'google_places') return v;
  return {
    ...v, name: '', address: '', neighborhood: '', subCategory: '', openHoursToday: '', opensAt: '00:00', closesAt: '23:59', periods: undefined,
    rating: 0, reviewsCount: 0, noiseLevel: '', imageUrl: '', priceLevel: '₹', googleTypes: undefined,
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${v.coords.lat},${v.coords.lng}&query_place_id=${encodeURIComponent(v.placeId)}`,
    appleMapsUrl: `https://maps.apple.com/?ll=${v.coords.lat},${v.coords.lng}`
  };
}

export function redactPlan(plan: DayPlan): DayPlan {
  const blocks = plan.blocks.map(b => (b.venue.source === 'google_places' ? { ...b, venue: redactVenue(b.venue), fitLine: '' } : b));
  return { ...plan, blocks, previousSnapshot: plan.previousSnapshot ? redactPlan(plan.previousSnapshot) : null };
}

const KEYS = {
  ACTIVE_PLAN: 'planb_active_plan_v3',
  PREFERENCES: 'planb_preferences_v3',
  SIMULATE_OFFLINE: 'planb_simulate_offline_v3',
  FIRST_PLAN: 'planb_first_plan_date_v3',
  LAST_PLAN: 'planb_last_plan_date_v3',
  CLOSED: 'planb_closed_ids_v3'
} as const;

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const UNDO_MS = 30_000;

const DEFAULT_PREFS: TravelerPreferences = {
  mobility: 'stairs_okay',
  maxStrideMinutes: 25,
  dietary: [],
  units: 'km',
  afterDarkMode: 'well_lit'
};

interface Saved<T> { data: T; savedAt: number }

function lsGet(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k: string, v: string): boolean { try { localStorage.setItem(k, v); return true; } catch { return false; } }
function lsDel(k: string) { try { localStorage.removeItem(k); } catch { /* ignore */ } }

class StorageService {
  private plan: DayPlan | null = null;
  private prefs: TravelerPreferences = { ...DEFAULT_PREFS };
  private ready = false;
  private blocked = false;
  private allowPlacesStorage = false;
  private undoTimer: ReturnType<typeof setTimeout> | null = null;
  private undoState: UndoState = { active: false, message: '', expiresAt: null };
  private listeners = new Set<(s: UndoState) => void>();

  /** Load persisted state. Must be awaited before first render. */
  async init(): Promise<void> {
    if (this.ready) return;
    let idbOk = true;
    let savedPlan: Saved<DayPlan> | undefined;
    try { savedPlan = await get<Saved<DayPlan>>(KEYS.ACTIVE_PLAN); } catch { idbOk = false; }
    if (!savedPlan) {
      const raw = lsGet(KEYS.ACTIVE_PLAN);
      if (raw) { try { savedPlan = JSON.parse(raw); } catch { /* ignore */ } }
    }
    // Storage is "blocked" when neither backend accepts writes (e.g. some private-browsing modes).
    const lsOk = lsSet('planb_probe', '1');
    lsDel('planb_probe');
    this.blocked = !idbOk && !lsOk;

    if (savedPlan?.data && savedPlan.savedAt && Date.now() - savedPlan.savedAt <= FOURTEEN_DAYS_MS) {
      this.plan = savedPlan.data;
    } else if (savedPlan) {
      await this.removePlan(); // 14-day purge
    }
    const rawPrefs = lsGet(KEYS.PREFERENCES);
    if (rawPrefs) { try { this.prefs = { ...DEFAULT_PREFS, ...JSON.parse(rawPrefs) }; } catch { /* ignore */ } }
    this.ready = true;
  }

  /* ---- plan */
  getActivePlan(): DayPlan | null { return this.plan; }

  async setActivePlan(plan: DayPlan, undoMessage?: string): Promise<void> {
    this.plan = plan;
    const payload: Saved<DayPlan> = { data: this.allowPlacesStorage ? plan : redactPlan(plan), savedAt: Date.now() };
    let ok = false;
    try { await set(KEYS.ACTIVE_PLAN, payload); ok = true; } catch { /* fall back below */ }
    if (lsSet(KEYS.ACTIVE_PLAN, JSON.stringify(payload))) ok = true;
    this.blocked = !ok;
    if (undoMessage && plan.previousSnapshot) this.triggerUndoToast(undoMessage);
  }

  private async removePlan() {
    this.plan = null;
    lsDel(KEYS.ACTIVE_PLAN);
    try { await del(KEYS.ACTIVE_PLAN); } catch { /* ignore */ }
  }

  isStorageBlocked(): boolean { return this.blocked; }
  /** Set from /api/config; stays false (strict) unless the operator enables PLACES_OFFLINE_STORAGE=allow. */
  setAllowPlacesStorage(v: boolean) { this.allowPlacesStorage = v; }

  /* ---- preferences */
  getPreferences(): TravelerPreferences { return this.prefs; }
  setPreferences(prefs: TravelerPreferences): void {
    this.prefs = prefs;
    lsSet(KEYS.PREFERENCES, JSON.stringify(prefs));
  }

  /* ---- offline simulation (QA aid, also useful on the preferences screen) */
  isSimulatedOffline(): boolean { return lsGet(KEYS.SIMULATE_OFFLINE) === 'true'; }
  setSimulatedOffline(v: boolean): void { lsSet(KEYS.SIMULATE_OFFLINE, v ? 'true' : 'false'); }
  isOffline(): boolean {
    return this.isSimulatedOffline() || (typeof navigator !== 'undefined' && navigator.onLine === false);
  }

  /* ---- closed-venue flags (session scope) */
  getClosedIds(): string[] {
    try { return JSON.parse(sessionStorage.getItem(KEYS.CLOSED) || '[]'); } catch { return []; }
  }
  addClosedId(id: string): void {
    try {
      const ids = new Set(this.getClosedIds()); ids.add(id);
      sessionStorage.setItem(KEYS.CLOSED, JSON.stringify([...ids]));
    } catch { /* ignore */ }
  }

  /* ---- retention metrics (days since first plan; never leaves the device except as a number) */
  recordPlanDate(dateISO: string): { firstPlanDate: string; returnedNextDay: boolean; daysSinceFirst: number } {
    const first = lsGet(KEYS.FIRST_PLAN) || dateISO;
    const last = lsGet(KEYS.LAST_PLAN);
    lsSet(KEYS.FIRST_PLAN, first);
    lsSet(KEYS.LAST_PLAN, dateISO);
    const day = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86400000);
    const returnedNextDay = !!last && day(dateISO) - day(last) === 1;
    return { firstPlanDate: first, returnedNextDay, daysSinceFirst: day(dateISO) - day(first) };
  }

  /* ---- undo */
  triggerUndoToast(message: string): void {
    if (this.undoTimer) clearTimeout(this.undoTimer);
    this.undoState = { active: true, message, expiresAt: Date.now() + UNDO_MS };
    this.notify();
    this.undoTimer = setTimeout(() => this.dismissUndo(), UNDO_MS);
  }
  dismissUndo(): void {
    if (this.undoTimer) clearTimeout(this.undoTimer);
    this.undoState = { active: false, message: '', expiresAt: null };
    this.notify();
  }
  getUndoState(): UndoState { return this.undoState; }
  subscribeUndo(fn: (s: UndoState) => void): () => void {
    this.listeners.add(fn);
    fn(this.undoState);
    return () => { this.listeners.delete(fn); };
  }
  private notify() { this.listeners.forEach(l => l(this.undoState)); }

  /* ---- delete everything */
  async clearAllData(): Promise<void> {
    await this.removePlan();
    Object.values(KEYS).forEach(lsDel);
    try { sessionStorage.removeItem(KEYS.CLOSED); } catch { /* ignore */ }
    this.prefs = { ...DEFAULT_PREFS };
    this.dismissUndo();
  }
}

export const storage = new StorageService();
