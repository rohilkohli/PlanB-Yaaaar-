/** Web Push reminders (max two per plan, built server-side). iPhone only supports push for an installed app. */
import type { DayPlan } from '../types/itinerary';
import { loadServerConfig } from './planService';

const ON = 'planb_push_on';
const DISMISS = 'planb_install_dismissed';

export type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as InstallEvent; listeners.forEach(l => l()); });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach(l => l()); });
}
export const onInstallChange = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const canPromptInstall = () => !!deferred;
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const c = await deferred.userChoice.catch(() => ({ outcome: 'dismissed' }));
  deferred = null; listeners.forEach(l => l());
  return c.outcome === 'accepted';
}

export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
/** iPhone/iPad can only receive push after "Add to Home Screen". */
export const pushNeedsInstall = () => isIos() && !isStandalone();

export const installDismissedRecently = () => { try { return Date.now() - Number(localStorage.getItem(DISMISS) || 0) < 7 * 86400_000; } catch { return false; } };
export const dismissInstall = () => { try { localStorage.setItem(DISMISS, String(Date.now())); } catch { /* ignore */ } };
export const remindersOn = () => { try { return localStorage.getItem(ON) === '1'; } catch { return false; } };
const setOn = (v: boolean) => { try { v ? localStorage.setItem(ON, '1') : localStorage.removeItem(ON); } catch { /* ignore */ } };

const b64ToBytes = (s: string) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};

export async function reminderKey(): Promise<string | null> { return (await loadServerConfig()).vapidPublicKey ?? null; }

async function register(): Promise<PushSubscription | null> {
  const key = await reminderKey();
  if (!key || !pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return (await reg.pushManager.getSubscription()) ?? reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
}

async function send(sub: PushSubscription, plan: DayPlan) {
  const r = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON(), plan }), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('subscribe_failed');
}

/** Asks permission (only from a tap), subscribes, and schedules reminders for this plan. */
export async function enableReminders(plan: DayPlan): Promise<'on' | 'denied' | 'unsupported'> {
  if (!pushSupported() || pushNeedsInstall() || !(await reminderKey())) return 'unsupported';
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';
  const sub = await register();
  if (!sub) return 'unsupported';
  await send(sub, plan);
  setOn(true);
  return 'on';
}

/** Keeps the two reminders in step with the plan after an adapt, swap or a finished stop. */
export async function syncReminders(plan: DayPlan): Promise<void> {
  if (!remindersOn() || !pushSupported() || Notification.permission !== 'granted') return;
  try { const sub = await register(); if (sub) await send(sub, plan); } catch { /* best effort */ }
}

export async function disableReminders(): Promise<void> {
  setOn(false);
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch('/api/push/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => undefined);
      await sub.unsubscribe();
    }
  } catch { /* ignore */ }
}
