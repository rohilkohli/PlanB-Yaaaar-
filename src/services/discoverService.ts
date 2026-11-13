import type { Coordinates } from '../types/itinerary';

export type DiscoverCategory = 'best' | 'cafes' | 'hostels' | 'agencies' | 'food';

export interface DiscoverPlace {
  id: string; name: string; address: string; coords: Coordinates; rating: number; reviewCount: number; priceLevel?: string;
  category: DiscoverCategory; openNow?: boolean; mapsUrl: string; distanceKm: number; score: number; source: 'google_places' | 'curated';
}
export interface PlaceDetails {
  id: string; name: string; address: string; rating: number; reviewCount: number; phone?: string; website?: string; mapsUrl?: string;
  hours: string[]; openNow?: boolean; reviews: Array<{ rating: number; when: string; text: string; author: string }>;
}
export interface WeatherNow { rainSoon: boolean; probability: number; tempC?: number; summary?: string; available: boolean }

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return null;
    return (await res.json()) as T;
  } catch { return null; }
}

export const fetchDiscover = (c: Coordinates, category: DiscoverCategory) =>
  getJson<{ places: DiscoverPlace[]; source: 'google_places' | 'curated'; note?: string }>(`/api/places/discover?lat=${c.lat.toFixed(4)}&lng=${c.lng.toFixed(4)}&category=${category}`);

export const fetchDetails = (id: string) => getJson<{ details: PlaceDetails | null }>(`/api/places/details?id=${encodeURIComponent(id)}`);

export const fetchWeatherNow = (c: Coordinates) => getJson<WeatherNow>(`/api/weather?lat=${c.lat.toFixed(2)}&lng=${c.lng.toFixed(2)}`);
