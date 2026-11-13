import type { Coordinates } from '../types/itinerary';

const R = 6371;
export function haversineKm(a: Coordinates, b: Coordinates): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Walking minutes at ~4.5 km/h with a 1.25 street-detour factor. */
export function walkMinutes(a: Coordinates, b: Coordinates): number {
  return Math.max(2, Math.round(((haversineKm(a, b) * 1.25) / 4.5) * 60));
}

/** Coarsen coordinates to ~city level (0.1°) for logs (PRD §25). */
export function truncateCoords(c: Coordinates): Coordinates {
  return { lat: Math.round(c.lat * 10) / 10, lng: Math.round(c.lng * 10) / 10 };
}
