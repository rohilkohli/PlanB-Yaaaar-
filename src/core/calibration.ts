import type { CalibrationData, CityData } from '../types/itinerary';
import { sunsetLocalMinutes } from './sunset';
import { minutesToTimeString } from './time';

export interface CalibrationInput {
  cityId?: string;
  /** Free text city / neighbourhood typed by the traveler. */
  query?: string;
  coords?: { lat: number; lng: number };
  date?: string;
  startTime?: string;
  endTime?: string;
  energy?: CalibrationData['energy'];
  budget?: CalibrationData['budget'];
  afterDark?: CalibrationData['afterDark'];
  social?: CalibrationData['social'];
  locationLabel?: string;
}

export function sunsetFor(city: Pick<CityData, 'coords' | 'timezone'>, dateISO: string): number {
  return sunsetLocalMinutes(city.coords.lat, city.coords.lng, dateISO, city.timezone);
}

export function buildCalibration(input: CalibrationInput, city: CityData, todayISO: string): CalibrationData {
  const date = input.date || todayISO;
  const sunset = sunsetFor(city, date);
  return {
    cityId: city.id,
    cityName: city.name,
    country: city.country,
    anchorCoords: input.coords ?? city.coords,
    date,
    startTime: input.startTime || '09:30',
    endTime: input.endTime || '19:30',
    energy: input.energy || 'balanced',
    budget: input.budget || '$$',
    afterDark: input.afterDark || 'well_lit',
    social: input.social || 'ambient',
    sunsetTime: minutesToTimeString(sunset),
    locationLabel: input.locationLabel || city.name,
    timezone: city.timezone
  };
}
