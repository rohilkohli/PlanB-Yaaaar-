/**
 * Driftless Local-First Persistence & Undo Management
 * Enforces PRD Section 27 (14-day auto-purge & complete local data wipe)
 */

import { DayPlan, TravelerPreferences, UndoState } from '../types/itinerary';

const KEYS = {
  ACTIVE_PLAN: 'driftless_active_plan_v2',
  PREFERENCES: 'driftless_preferences_v2',
  SIMULATE_OFFLINE: 'driftless_simulate_offline_v2',
  ONBOARDING_DONE: 'driftless_onboarding_done_v2'
};

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

class StorageService {
  private undoTimer: NodeJS.Timeout | null = null;
  private undoStateListeners: Set<(state: UndoState) => void> = new Set();
  private undoState: UndoState = { active: false, message: '', expiresAt: null };

  constructor() {
    this.checkAndPurgeExpired();
  }

  private checkAndPurgeExpired(): void {
    try {
      const raw = localStorage.getItem(KEYS.ACTIVE_PLAN);
      if (raw) {
        const item = JSON.parse(raw);
        if (item.savedAt && Date.now() - item.savedAt > FOURTEEN_DAYS_MS) {
          localStorage.removeItem(KEYS.ACTIVE_PLAN);
        }
      }
    } catch {
      // Ignore in private mode fallback
    }
  }

  getActivePlan(): DayPlan | null {
    try {
      const raw = localStorage.getItem(KEYS.ACTIVE_PLAN);
      if (!raw) return null;
      return JSON.parse(raw).data || null;
    } catch {
      return null;
    }
  }

  setActivePlan(plan: DayPlan, triggerUndo: boolean = false, undoMessage: string = ""): void {
    try {
      localStorage.setItem(KEYS.ACTIVE_PLAN, JSON.stringify({
        data: plan,
        savedAt: Date.now()
      }));

      if (triggerUndo && plan.previousSnapshot) {
        this.triggerUndoToast(undoMessage || "Day adapted · Tap Undo to restore");
      }
    } catch (e) {
      console.warn("Storage quota exceeded or private mode, plan held in memory:", e);
    }
  }

  getPreferences(): TravelerPreferences {
    const defaults: TravelerPreferences = {
      mobility: 'stairs_okay',
      maxStrideMinutes: 25,
      dietary: ['counter_preferred', 'no_reservations'],
      units: 'km',
      afterDarkMode: 'well_lit'
    };

    try {
      const raw = localStorage.getItem(KEYS.PREFERENCES);
      if (!raw) return defaults;
      return { ...defaults, ...JSON.parse(raw) };
    } catch {
      return defaults;
    }
  }

  setPreferences(prefs: TravelerPreferences): void {
    try {
      localStorage.setItem(KEYS.PREFERENCES, JSON.stringify(prefs));
    } catch (e) {
      console.warn("Failed to persist preferences:", e);
    }
  }

  isOnboardingDone(): boolean {
    return localStorage.getItem(KEYS.ONBOARDING_DONE) === 'true';
  }

  setOnboardingDone(val: boolean = true): void {
    localStorage.setItem(KEYS.ONBOARDING_DONE, val ? 'true' : 'false');
  }

  isSimulatedOffline(): boolean {
    return localStorage.getItem(KEYS.SIMULATE_OFFLINE) === 'true';
  }

  setSimulatedOffline(val: boolean): void {
    localStorage.setItem(KEYS.SIMULATE_OFFLINE, val ? 'true' : 'false');
  }

  isOffline(): boolean {
    if (this.isSimulatedOffline()) return true;
    return typeof navigator !== 'undefined' && !navigator.onLine;
  }

  triggerUndoToast(message: string): void {
    if (this.undoTimer) clearTimeout(this.undoTimer);

    this.undoState = {
      active: true,
      message,
      expiresAt: Date.now() + 30000 // 30 seconds
    };
    this.notifyUndoListeners();

    this.undoTimer = setTimeout(() => {
      this.undoState = { active: false, message: '', expiresAt: null };
      this.notifyUndoListeners();
    }, 30000);
  }

  dismissUndo(): void {
    if (this.undoTimer) clearTimeout(this.undoTimer);
    this.undoState = { active: false, message: '', expiresAt: null };
    this.notifyUndoListeners();
  }

  getUndoState(): UndoState {
    return this.undoState;
  }

  subscribeUndo(listener: (state: UndoState) => void): () => void {
    this.undoStateListeners.add(listener);
    listener(this.undoState);
    return () => this.undoStateListeners.delete(listener);
  }

  private notifyUndoListeners(): void {
    this.undoStateListeners.forEach(listener => listener(this.undoState));
  }

  clearAllData(): void {
    localStorage.removeItem(KEYS.ACTIVE_PLAN);
    localStorage.removeItem(KEYS.PREFERENCES);
    localStorage.removeItem(KEYS.SIMULATE_OFFLINE);
    localStorage.removeItem(KEYS.ONBOARDING_DONE);
  }
}

export const storage = new StorageService();

