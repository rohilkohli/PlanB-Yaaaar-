import { CITIES } from '../data/placesData';
import type { CityData, Coordinates } from '../types/itinerary';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Nearest curated city within `maxKm` of a coordinate. */
export function nearestCity(c: Coordinates, maxKm: number): CityData | null {
  let best: CityData | null = null;
  let bd = Infinity;
  for (const city of CITIES) {
    const d = Math.hypot((city.coords.lat - c.lat) * 111, (city.coords.lng - c.lng) * 111 * Math.cos((c.lat * Math.PI) / 180));
    if (d < bd) { bd = d; best = city; }
  }
  return best && bd <= maxKm ? best : null;
}

/** Match free text ("Jaipur, India", "goa", "panjim") to a curated city. */
export function matchCity(text: string): CityData | undefined {
  const q = norm(text);
  if (q.length < 2) return undefined;
  const first = norm(text.split(',')[0]);
  return (
    CITIES.find(c => c.id === q || norm(c.name) === first) ||
    CITIES.find(c => norm(c.name).startsWith(first) && first.length >= 3) ||
    CITIES.find(c => q.includes(c.id) || (first.length >= 4 && norm(c.name).includes(first)))
  );
}
