/** Opening-hours verification (PRD §16, §21: venue must be open for the whole block). */
import type { VerifiedVenue } from '../types/itinerary';
import { timeStringToMinutes } from './time';

/** Margin so we never route someone to a venue about to close (PRD §21: "closes within 45m of arrival"). */
export const CLOSING_MARGIN_MIN = 45;

export interface OpenWindow { open: number; close: number }

/** Normalise a venue's opening window for today. close may exceed 1440 for after-midnight. */
export function openWindow(v: Pick<VerifiedVenue, 'opensAt' | 'closesAt'>): OpenWindow {
  const open = timeStringToMinutes(v.opensAt || '00:00');
  let close = timeStringToMinutes(v.closesAt || '23:59');
  if (close <= open) close += 1440;
  return { open, close };
}

/**
 * True if the venue is open at arrival, stays open through the entire stay,
 * and does not close within CLOSING_MARGIN_MIN of arrival.
 */
export function isOpenForBlock(
  v: Pick<VerifiedVenue, 'opensAt' | 'closesAt' | 'periods'>,
  startMin: number,
  endMin: number
): boolean {
  const margin = CLOSING_MARGIN_MIN;
  const windows = v.periods?.length ? v.periods.map(([open, close]) => ({ open, close })) : [openWindow(v)];
  return windows.some(w => startMin >= w.open && endMin <= w.close && w.close - startMin >= margin);
}

export function openUntilLabel(v: Pick<VerifiedVenue, 'closesAt'>): string {
  const mins = timeStringToMinutes(v.closesAt || '23:59');
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}
