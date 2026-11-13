import { localNow, timeStringToMinutes } from './time';

/** QA hook: set localStorage `planb_test_clock` = "HH:MM" to pin the destination-local time (used by E2E). */
export function testClockMinutes(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem('planb_test_clock');
    return v && /^\d{1,2}:\d{2}$/.test(v) ? timeStringToMinutes(v) : null;
  } catch { return null; }
}

export function nowIn(timeZone: string): { minutes: number; date: string } {
  const base = localNow(timeZone);
  const t = testClockMinutes();
  return t === null ? base : { date: base.date, minutes: t };
}

/** Body field for API calls; the server only honours it when ALLOW_TEST_CLOCK=1. */
export function clockOverride(timeZone: string): { now?: { minutes: number; date: string } } {
  return testClockMinutes() === null ? {} : { now: nowIn(timeZone) };
}
