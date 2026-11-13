/**
 * Anonymous event tracking (PRD §28). No user/device IDs, no precise location.
 * Fire-and-forget; silently skipped offline. Events are whitelisted again server-side.
 */
export type EventName =
  | 'calibration_started' | 'plan_generated' | 'block_maps_clicked' | 'day_adapted'
  | 'block_swapped' | 'adaptation_undone' | 'venue_issue_flagged' | 'next_day_returned';

let calibrationStartedSent = false;

export function track(name: EventName, props: Record<string, string | number | boolean | string[]> = {}): void {
  if (typeof navigator === 'undefined' || navigator.onLine === false) return;
  if (name === 'calibration_started') {
    if (calibrationStartedSent) return;
    calibrationStartedSent = true;
  }
  try {
    const body = JSON.stringify({ name, props });
    if (navigator.sendBeacon && navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }))) return;
    void fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => undefined);
  } catch { /* analytics must never break the app */ }
}
