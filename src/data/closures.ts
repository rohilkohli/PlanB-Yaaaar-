/**
 * Closed-day rules. Google's regular hours ignore one-off closures and festivals, so PlanB keeps this list.
 * IMPORTANT: every entry must be checked against the venue's current official notice before launch
 * (see docs/LEGAL-REVIEW.md item 6 and docs/CLOSURES.md). Only the national fixed-date holidays below are
 * included by default; add venue-specific weekly closures only once verified.
 */

export interface ClosureRule {
  /** ISO dates (YYYY-MM-DD) on which the venue or area is closed. */
  dates?: string[];
  /** Weekly closures: 0 = Sunday … 6 = Saturday. */
  weekdays?: number[];
  source: string;
}

/** Fixed-date national holidays (India). Venue closures on these days are common; the app warns rather than hides. */
export const NATIONAL_HOLIDAYS_2026 = ['2026-01-26', '2026-08-15', '2026-10-02'];

/** Venue-specific rules, keyed by venue placeId. Empty until each entry is verified. */
export const VENUE_CLOSURES: Record<string, ClosureRule> = {};

/** Date-based warning shown on a plan day (not a hard exclusion). */
export function holidayOn(dateISO: string): string | null {
  return NATIONAL_HOLIDAYS_2026.includes(dateISO) ? 'National holiday — some venues may be closed or busy.' : null;
}

/** True when the venue has a verified closure on this date or weekday. */
export function isClosedOn(placeId: string, dateISO: string): boolean {
  const rule = VENUE_CLOSURES[placeId];
  if (!rule) return false;
  if (rule.dates?.includes(dateISO)) return true;
  if (rule.weekdays?.length) {
    const wd = new Date(`${dateISO}T12:00:00Z`).getUTCDay();
    if (rule.weekdays.includes(wd)) return true;
  }
  return false;
}
