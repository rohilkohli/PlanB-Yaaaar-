/**
 * Google Places API (New) + Geocoding client (PRD §24). Server-side only, restricted field masks.
 * Places is the sole source of truth for venue existence, address and opening hours (PRD §18).
 */
import type { BudgetTier, CityData, Coordinates, VerifiedVenue } from '../src/types/itinerary';
import { env } from './env';

const FIELD_MASK = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.location',
  'places.regularOpeningHours', 'places.priceLevel', 'places.types', 'places.rating', 'places.userRatingCount'
].join(',');

/**
 * Types that make a bad stop in a solo traveler's day plan: transit hubs, lodging itself, gambling, nightlife,
 * cinemas, civic/medical/education buildings. Found by the live eval (casinos in Goa, a railway station in Varanasi,
 * a cinema in Jaipur, hotels as "dining").
 */
export const EXCLUDED_TYPES = new Set([
  'lodging', 'hotel', 'resort_hotel', 'motel', 'hostel', 'guest_house', 'casino', 'movie_theater', 'night_club', 'bar',
  'liquor_store', 'train_station', 'transit_station', 'subway_station', 'bus_station', 'bus_stop', 'airport', 'gas_station',
  'parking', 'hospital', 'doctor', 'school', 'university', 'government_office', 'local_government_office', 'courthouse',
  'police', 'embassy', 'bank', 'atm', 'car_dealer', 'car_repair', 'funeral_home', 'real_estate_agency', 'storage'
]);

/** Some stations are only typed as tourist attractions; catch the obvious ones by name (not termini that are heritage sights). */
export const TRANSIT_NAME = /\b(junction|railway|airport|bus\s?stand|bus\s?terminal|metro station)\b/i;

interface GPlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  regularOpeningHours?: { periods?: Array<{ open: { day: number; hour: number; minute?: number }; close?: { day: number; hour: number; minute?: number } }> };
  priceLevel?: string;
  types?: string[];
  rating?: number;
  userRatingCount?: number;
}

const GROUPS: Array<{ name: string; types: string[] }> = [
  { name: 'sights', types: ['tourist_attraction', 'museum', 'art_gallery', 'historical_landmark'] },
  { name: 'outdoors', types: ['park', 'garden'] },
  { name: 'food', types: ['restaurant', 'cafe', 'bakery'] }
];

async function gfetch(url: string, init: RequestInit, timeoutMs: number): Promise<any> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`google_${res.status}`);
  return res.json();
}

/* ---------------------------------------------------------------- normalise */

function categoryOf(types: string[]): VerifiedVenue['category'] {
  const t = new Set(types);
  if (t.has('cafe') || t.has('coffee_shop')) return 'cafe';
  if (t.has('bakery')) return 'bakery';
  if (t.has('restaurant') || t.has('meal_takeaway') || t.has('food')) return 'dining';
  if (t.has('park') || t.has('garden') || t.has('hiking_area')) return 'walk';
  if (t.has('museum') || t.has('art_gallery') || t.has('historical_landmark') || t.has('place_of_worship')) return 'culture';
  if (t.has('market') || t.has('shopping_mall')) return 'market';
  return 'viewpoint';
}

const DURATION: Record<VerifiedVenue['category'], number> = { culture: 75, walk: 60, viewpoint: 50, cafe: 45, dining: 60, bakery: 30, market: 50 };
const SLOT: Record<VerifiedVenue['category'], VerifiedVenue['timeSlot']> = { culture: 'afternoon', walk: 'morning', viewpoint: 'evening', cafe: 'morning', dining: 'lunch', bakery: 'morning', market: 'evening' };
const LABEL: Record<VerifiedVenue['category'], string> = { culture: 'museum or landmark', walk: 'green space', viewpoint: 'viewpoint', cafe: 'café', dining: 'restaurant', bakery: 'bakery', market: 'market' };
const SOLO: Record<VerifiedVenue['category'], string> = {
  culture: 'Easy to explore at your own pace.',
  walk: 'Plenty of room to wander without a plan.',
  viewpoint: 'A good place to simply sit and take it in.',
  cafe: 'A small table for one is easy to find here.',
  dining: 'Ask for a counter or small table if you’d like a quieter spot.',
  bakery: 'A quick, low-effort stop.',
  market: 'Browse at your pace; stick to the busier lanes.'
};

function tierOf(level: string | undefined, currency: '₹' | '$'): BudgetTier {
  const n = level === 'PRICE_LEVEL_EXPENSIVE' ? 3 : level === 'PRICE_LEVEL_VERY_EXPENSIVE' ? 3 : level === 'PRICE_LEVEL_MODERATE' ? 2 : 1;
  const c = currency;
  return (c.repeat(n)) as BudgetTier;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Periods (in minutes) that apply on `weekday` (0=Sunday), merged with overnight spill from the previous day. */
export function periodsForDay(p: GPlace, weekday: number): Array<[number, number]> | 'all_day' | null {
  const periods = p.regularOpeningHours?.periods;
  if (!periods?.length) return null;
  if (periods.length === 1 && periods[0].open.day === 0 && periods[0].open.hour === 0 && !periods[0].close) return 'all_day';
  const out: Array<[number, number]> = [];
  for (const per of periods) {
    if (!per.close) continue;
    const o = per.open.hour * 60 + (per.open.minute ?? 0);
    const c = per.close.hour * 60 + (per.close.minute ?? 0);
    if (per.open.day === weekday) out.push([o, per.close.day === weekday ? c : c + 1440]);
    else if (per.close.day === weekday && per.open.day === (weekday + 6) % 7) out.push([0, c]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

export function normalisePlace(p: GPlace, cityId: string, weekday: number, currency: '₹' | '$', fetchedAt: string): VerifiedVenue | null {
  if (!p.id || !p.displayName?.text || !p.location) return null;
  if ((p.types ?? []).some(t => EXCLUDED_TYPES.has(t)) || TRANSIT_NAME.test(p.displayName.text)) return null;
  const periods = periodsForDay(p, weekday);
  if (periods === null || (Array.isArray(periods) && periods.length === 0)) return null; // unknown/closed today → not verifiable
  const allDay = periods === 'all_day';
  const list: Array<[number, number]> = allDay ? [[0, 1439]] : periods;
  const first = list[0];
  const lastClose = list[list.length - 1][1];
  const cat = categoryOf(p.types ?? []);
  const name = p.displayName.text;
  const coords: Coordinates = { lat: p.location.latitude, lng: p.location.longitude };
  const q = encodeURIComponent(name);
  const fmt = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
  return {
    placeId: p.id,
    cityId,
    name,
    category: cat,
    subCategory: (p.types ?? []).find(t => !['point_of_interest', 'establishment', 'food'].includes(t))?.replace(/_/g, ' ') ?? cat,
    neighborhood: (p.formattedAddress ?? '').split(',').slice(-3, -2)[0]?.trim() || '',
    address: p.formattedAddress ?? '',
    coords,
    timeSlot: SLOT[cat],
    suggestedDuration: DURATION[cat],
    bufferAfter: 20,
    priceLevel: tierOf(p.priceLevel, currency),
    rating: p.rating ?? 4,
    reviewsCount: p.userRatingCount ?? 0,
    openHoursToday: allDay ? 'Open all day' : `${fmt(first[0])} – ${fmt(lastClose)}`,
    opensAt: fmt(first[0]),
    closesAt: fmt(lastClose),
    periods: allDay ? undefined : list,
    isIndoor: ['museum', 'art_gallery', 'cafe', 'restaurant', 'bakery'].some(t => (p.types ?? []).includes(t)),
    hasPlugs: cat === 'cafe',
    noiseLevel: cat === 'walk' ? 'Open air' : cat === 'culture' ? 'Quiet' : 'Ambient',
    whyItFits: `A well-rated ${LABEL[cat]} in ${(p.formattedAddress ?? '').split(',')[0] || 'the area'}, open for your whole visit.`,
    soloPerk: SOLO[cat],
    transitFromPrev: '',
    imageUrl: '',
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${q}&query_place_id=${encodeURIComponent(p.id)}`,
    appleMapsUrl: `https://maps.apple.com/?ll=${coords.lat},${coords.lng}&q=${q}`,
    source: 'google_places',
    verifiedAt: fetchedAt,
    googleTypes: p.types ?? [],
    tags: []
  };
}

/* ---------------------------------------------------------------- search */

export async function fetchCandidates(opts: {
  center: Coordinates; cityId: string; dateISO: string; currency: '₹' | '$'; timeoutMs?: number; radiusMeters?: number;
}): Promise<VerifiedVenue[]> {
  const key = env().placesKey;
  if (!key) return [];
  const weekday = new Date(`${opts.dateISO}T12:00:00Z`).getUTCDay();
  const fetchedAt = new Date().toISOString();
  const timeout = opts.timeoutMs ?? 3000;

  const run = async (radius: number) => {
    const settled = await Promise.allSettled(GROUPS.map(g =>
      gfetch('https://places.googleapis.com/v1/places:searchNearby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELD_MASK },
        body: JSON.stringify({
          includedTypes: g.types,
          maxResultCount: 20,
          rankPreference: 'POPULARITY',
          locationRestriction: { circle: { center: { latitude: opts.center.lat, longitude: opts.center.lng }, radius } }
        })
      }, timeout)
    ));
    const seen = new Set<string>();
    const out: VerifiedVenue[] = [];
    for (const r of settled) {
      if (r.status !== 'fulfilled') continue;
      for (const p of (r.value.places ?? []) as GPlace[]) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        if ((p.rating ?? 0) < 4.2 || (p.userRatingCount ?? 0) < 150) continue; // rating- and volume-vetted
        const v = normalisePlace(p, opts.cityId, weekday, opts.currency, fetchedAt);
        if (v) out.push(v);
      }
    }
    return { out, anyOk: settled.some(r => r.status === 'fulfilled') };
  };

  let { out, anyOk } = await run(opts.radiusMeters ?? 6000);
  if (anyOk && out.length < 15) {
    // Sparse area → expand radius to 10 km (PRD FR-003).
    ({ out } = await run(10000));
  }
  return out;
}

/* ---------------------------------------------------------------- geocoding */

export interface ResolvedPlace { name: string; country: string; coords: Coordinates; timezone: string }

export async function geocode(query: string, timeoutMs = 2500): Promise<ResolvedPlace | null> {
  const key = env().placesKey;
  if (!key) return null;
  const j = await gfetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${key}`, {}, timeoutMs);
  const r = j.results?.[0];
  if (!r) return null;
  const coords = { lat: r.geometry.location.lat, lng: r.geometry.location.lng };
  return { name: shortName(r), country: countryOf(r), coords, timezone: await timezoneFor(coords, key, timeoutMs) };
}

export async function reverseGeocode(c: Coordinates, timeoutMs = 2500): Promise<ResolvedPlace | null> {
  const key = env().placesKey;
  if (!key) return null;
  const j = await gfetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${c.lat},${c.lng}&result_type=locality|sublocality|neighborhood&key=${key}`, {}, timeoutMs);
  const r = j.results?.[0];
  if (!r) return null;
  return { name: shortName(r), country: countryOf(r), coords: c, timezone: await timezoneFor(c, key, timeoutMs) };
}

function shortName(r: any): string {
  const loc = r.address_components?.find((c: any) => c.types?.includes('locality'));
  const sub = r.address_components?.find((c: any) => c.types?.some((t: string) => t.startsWith('sublocality') || t === 'neighborhood'));
  return (sub && loc ? `${sub.long_name}, ${loc.long_name}` : loc?.long_name ?? r.formatted_address?.split(',')[0] ?? 'Your area');
}
function countryOf(r: any): string {
  return r.address_components?.find((c: any) => c.types?.includes('country'))?.long_name ?? '';
}

async function timezoneFor(c: Coordinates, key: string, timeoutMs: number): Promise<string> {
  try {
    const j = await gfetch(`https://maps.googleapis.com/maps/api/timezone/json?location=${c.lat},${c.lng}&timestamp=${Math.floor(Date.now() / 1000)}&key=${key}`, {}, timeoutMs);
    if (j.timeZoneId) return j.timeZoneId;
  } catch { /* fall through */ }
  return approxTimezone(c);
}

export function approxTimezone(c: Coordinates): string {
  if (c.lat > 6 && c.lat < 37 && c.lng > 68 && c.lng < 98) return 'Asia/Kolkata';
  const off = Math.round(c.lng / 15);
  return off === 0 ? 'UTC' : `Etc/GMT${off > 0 ? '-' : '+'}${Math.abs(off)}`;
}

export async function autocomplete(input: string, timeoutMs = 2000): Promise<Array<{ text: string }>> {
  const key = env().placesKey;
  if (!key) return [];
  const j = await gfetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'suggestions.placePrediction.text.text' },
    body: JSON.stringify({ input, includedPrimaryTypes: ['locality', 'sublocality', 'neighborhood'] })
  }, timeoutMs);
  return (j.suggestions ?? []).map((s: any) => ({ text: s.placePrediction?.text?.text })).filter((s: any) => s.text).slice(0, 5);
}

export function adHocCity(r: ResolvedPlace, id?: string): CityData {
  return {
    id: id ?? `geo_${r.coords.lat.toFixed(2)}_${r.coords.lng.toFixed(2)}`,
    name: r.name,
    country: r.country,
    tagline: '',
    coords: r.coords,
    timezone: r.timezone,
    defaultSunset: '18:00',
    weatherVibe: '',
    heroImage: ''
  };
}
