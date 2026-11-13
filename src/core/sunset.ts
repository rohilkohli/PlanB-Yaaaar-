/**
 * Sunset calculation using the NOAA solar-position approximation
 * (accurate to ~1–2 minutes at latitudes below 65°).
 * PRD US-006 / §33: sunset boundary math must hold across timezones.
 */
import { tzOffsetMinutes } from './time';

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Returns sunset as UTC minutes-from-midnight of `dateISO` (may be <0 or >1440), or null in polar day/night. */
export function sunsetUtcMinutes(lat: number, lng: number, dateISO: string): number | null {
  const [y, m, d] = dateISO.split('-').map(Number);
  const dayOfYear = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (12 - 12) / 24);
  const eqTime =
    229.18 *
    (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const decl =
    0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const zenith = rad(90.833);
  const cosHa = Math.cos(zenith) / (Math.cos(rad(lat)) * Math.cos(decl)) - Math.tan(rad(lat)) * Math.tan(decl);
  if (cosHa > 1 || cosHa < -1) return null;
  const ha = deg(Math.acos(cosHa)); // sunset hour angle (positive)
  return 720 - 4 * (lng - ha) - eqTime;
}

/** Local sunset as minutes since local midnight for a date in a timezone. */
export function sunsetLocalMinutes(lat: number, lng: number, dateISO: string, timeZone: string): number {
  const utc = sunsetUtcMinutes(lat, lng, dateISO);
  if (utc === null) return 18 * 60; // polar fallback
  const noonUtc = new Date(`${dateISO}T12:00:00Z`);
  const offset = tzOffsetMinutes(timeZone, noonUtc);
  return Math.round(((utc + offset) % 1440 + 1440) % 1440);
}
