import type { VerifiedVenue } from '../types/itinerary';
import { openWindow } from '../core/hours';

/** Dietary / mobility tags for the original hand-written entries. */
const TAGS: Record<string, string[]> = {
  pl_jaipur_hawa_mahal: ['steps'],
  pl_jaipur_nahargarh_padao: ['steep', 'steps'],
  pl_jaipur_cafe_palladio: ['alcohol'],
  pl_vns_boat_drift: ['steps'],
  pl_vns_ganga_aarti: ['steps'],
  pl_lisbon_santa_luzia: ['steep'],
  pl_lisbon_senhora_monte: ['steep'],
  pl_lisbon_sal_grosso: ['non_veg', 'alcohol'],
  pl_lisbon_prado_mercearia: ['alcohol'],
  pl_lisbon_tascantiga: ['non_veg']
};

const fmt = (m: number) => {
  const h24 = Math.floor(m / 60) % 24;
  const p = h24 >= 12 ? 'PM' : 'AM';
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m % 60).padStart(2, '0')} ${p}`;
};

/** Normalise a catalogue venue: honest source label + generated hours string + tags. */
export function applyVenueMeta(v: VerifiedVenue): VerifiedVenue {
  const w = openWindow(v);
  const allDay = w.open === 0 && w.close >= 1439;
  return {
    ...v,
    source: 'curated',
    tags: [...new Set([...(v.tags ?? []), ...(TAGS[v.placeId] ?? [])])],
    openHoursToday: allDay ? 'Open all day' : `${fmt(w.open)} – ${fmt(w.close)}`
  };
}
