import type { VerifiedVenue } from '../types/itinerary';

/** Google Maps public directions URL with transit mode — works without an API key. */
export function transitUrl(v: Pick<VerifiedVenue, 'coords' | 'placeId'>): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${v.coords.lat},${v.coords.lng}&destination_place_id=${encodeURIComponent(v.placeId)}&travelmode=transit`;
}

/** Uber universal link: pickup = current location, drop-off = this venue. */
export function uberUrl(v: Pick<VerifiedVenue, 'coords' | 'name'>): string {
  const p = new URLSearchParams({
    action: 'setPickup',
    pickup: 'my_location',
    'dropoff[latitude]': String(v.coords.lat),
    'dropoff[longitude]': String(v.coords.lng),
    'dropoff[nickname]': v.name
  });
  return `https://m.uber.com/ul/?${p.toString()}`;
}
