/**
 * Place discovery for the Map Explorer: "best of best", cafés, hostels, travel agencies, food — with ratings,
 * review counts and (on demand) review text. Google Places API (New), field-masked; curated fallback without a key.
 */
import { PLACES_DATABASE } from '../src/data/placesData';
import { haversineKm } from '../src/core/geo';
import type { Coordinates } from '../src/types/itinerary';
import { env } from './env';
import { cached, reserveCalls } from './budget';

export type DiscoverCategory = 'best' | 'cafes' | 'hostels' | 'agencies' | 'food';
export const DISCOVER_CATEGORIES: DiscoverCategory[] = ['best', 'cafes', 'hostels', 'agencies', 'food'];

export interface DiscoverPlace {
  id: string;
  name: string;
  address: string;
  coords: Coordinates;
  rating: number;
  reviewCount: number;
  priceLevel?: string;
  category: DiscoverCategory;
  openNow?: boolean;
  mapsUrl: string;
  distanceKm: number;
  score: number;
  source: 'google_places' | 'curated';
}

const TYPES: Record<DiscoverCategory, string[]> = {
  best: ['tourist_attraction', 'museum', 'historical_landmark', 'park'],
  cafes: ['cafe', 'coffee_shop'],
  hostels: ['hostel'],
  agencies: ['travel_agency'],
  food: ['restaurant']
};

const LIST_MASK = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.location', 'places.rating',
  'places.userRatingCount', 'places.priceLevel', 'places.currentOpeningHours.openNow'
].join(',');

const DETAIL_MASK = [
  'id', 'displayName', 'formattedAddress', 'rating', 'userRatingCount', 'nationalPhoneNumber', 'websiteUri', 'googleMapsUri',
  'regularOpeningHours.weekdayDescriptions', 'currentOpeningHours.openNow', 'reviews.rating', 'reviews.relativePublishTimeDescription',
  'reviews.text.text', 'reviews.authorAttribution.displayName'
].join(',');

/** "Best of best": rating weighted by how many people agree (log of review count). */
export const bestScore = (rating: number, count: number) => Math.round(rating * Math.log10(1 + count) * 100) / 100;

const PRICE: Record<string, string> = {
  PRICE_LEVEL_FREE: 'Free', PRICE_LEVEL_INEXPENSIVE: '₹', PRICE_LEVEL_MODERATE: '₹₹', PRICE_LEVEL_EXPENSIVE: '₹₹₹', PRICE_LEVEL_VERY_EXPENSIVE: '₹₹₹'
};

async function post(url: string, mask: string, body: unknown, timeoutMs: number) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': env().placesKey!, 'X-Goog-FieldMask': mask },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) throw new Error(`google_${res.status}`);
  return res.json() as Promise<any>;
}

export function normaliseDiscover(p: any, category: DiscoverCategory, center: Coordinates): DiscoverPlace | null {
  if (!p?.id || !p.displayName?.text || !p.location) return null;
  const coords = { lat: p.location.latitude, lng: p.location.longitude };
  const rating = Number(p.rating ?? 0);
  const reviewCount = Number(p.userRatingCount ?? 0);
  const q = encodeURIComponent(p.displayName.text);
  return {
    id: p.id,
    name: p.displayName.text,
    address: p.formattedAddress ?? '',
    coords,
    rating,
    reviewCount,
    priceLevel: PRICE[p.priceLevel as string],
    category,
    openNow: p.currentOpeningHours?.openNow,
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${q}&query_place_id=${encodeURIComponent(p.id)}`,
    distanceKm: Math.round(haversineKm(center, coords) * 10) / 10,
    score: bestScore(rating, reviewCount),
    source: 'google_places'
  };
}

function curatedFallback(category: DiscoverCategory, center: Coordinates, limit: number): DiscoverPlace[] {
  const cats: Record<DiscoverCategory, string[]> = {
    best: ['viewpoint', 'culture', 'walk'], cafes: ['cafe', 'bakery'], hostels: [], agencies: [], food: ['dining', 'market']
  };
  return PLACES_DATABASE
    .filter(v => cats[category].includes(v.category) && haversineKm(center, v.coords) < 60)
    .map(v => ({
      id: v.placeId, name: v.name, address: v.address, coords: v.coords, rating: v.rating, reviewCount: v.reviewsCount,
      priceLevel: v.priceLevel, category, mapsUrl: v.mapsUrl, distanceKm: Math.round(haversineKm(center, v.coords) * 10) / 10,
      score: bestScore(v.rating, v.reviewsCount), source: 'curated' as const
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function discover(opts: { center: Coordinates; category: DiscoverCategory; radiusM?: number; limit?: number }) {
  const limit = Math.min(opts.limit ?? 12, 20);
  if (!env().placesKey) {
    return { places: curatedFallback(opts.category, opts.center, limit), source: 'curated' as const, note: ['hostels', 'agencies'].includes(opts.category) ? 'Connect a Google Places key to see hostels and agencies.' : undefined };
  }
  try {
    const radius = Math.min(opts.radiusM ?? 5000, 20000);
    const j = await cached(`disc:${opts.category}:${opts.center.lat.toFixed(2)},${opts.center.lng.toFixed(2)}:${radius}`, async () => {
      if (!reserveCalls(1)) throw new Error('daily_cap');
      return post('https://places.googleapis.com/v1/places:searchNearby', LIST_MASK, {
        includedTypes: TYPES[opts.category],
        maxResultCount: 20,
        rankPreference: 'POPULARITY',
        locationRestriction: { circle: { center: { latitude: opts.center.lat, longitude: opts.center.lng }, radius } }
      }, 3500);
    });
    const places = ((j.places ?? []) as any[])
      .map(p => normaliseDiscover(p, opts.category, opts.center))
      .filter((p): p is DiscoverPlace => !!p && p.rating >= (opts.category === 'agencies' ? 3.5 : 4.0))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return { places, source: 'google_places' as const, note: places.length ? undefined : 'Nothing well-rated found nearby. Try a wider area.' };
  } catch {
    return { places: curatedFallback(opts.category, opts.center, limit), source: 'curated' as const, note: 'Live results are unavailable right now.' };
  }
}

export interface PlaceDetails {
  id: string; name: string; address: string; rating: number; reviewCount: number; phone?: string; website?: string; mapsUrl?: string;
  hours: string[]; openNow?: boolean; reviews: Array<{ rating: number; when: string; text: string; author: string }>;
}

export async function placeDetails(id: string): Promise<PlaceDetails | null> {
  if (!env().placesKey || !/^[A-Za-z0-9_-]{10,200}$/.test(id)) return null;
  const p: any = await cached(`det:${id}`, async () => {
    if (!reserveCalls(1)) throw new Error('daily_cap');
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
      headers: { 'X-Goog-Api-Key': env().placesKey!, 'X-Goog-FieldMask': DETAIL_MASK },
      signal: AbortSignal.timeout(3500)
    });
    if (!res.ok) throw new Error(`google_${res.status}`);
    return res.json();
  });
  return {
    id: p.id, name: p.displayName?.text ?? '', address: p.formattedAddress ?? '', rating: p.rating ?? 0, reviewCount: p.userRatingCount ?? 0,
    phone: p.nationalPhoneNumber, website: p.websiteUri, mapsUrl: p.googleMapsUri,
    hours: p.regularOpeningHours?.weekdayDescriptions ?? [], openNow: p.currentOpeningHours?.openNow,
    reviews: ((p.reviews ?? []) as any[]).slice(0, 4).map(r => ({
      rating: r.rating, when: r.relativePublishTimeDescription ?? '', text: String(r.text?.text ?? '').slice(0, 280), author: r.authorAttribution?.displayName ?? 'Traveler'
    }))
  };
}
