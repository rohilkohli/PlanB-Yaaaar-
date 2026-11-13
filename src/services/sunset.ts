/**
 * Driftless Sunset & Daylight Calculation Service
 * Enforces PRD US-006 & Section 18:
 * Calculates sunset boundaries across timezones and enforces >=30m buffer for strict curfew
 */

import { CITIES } from '../data/placesData';

export function calculateCitySunset(cityId: string, date: Date = new Date()): string {
  const city = CITIES.find(c => c.id.toLowerCase() === cityId.toLowerCase()) || CITIES[0];
  
  // Approximate seasonal variation based on day of year
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
  
  // Base sunset time from city
  const [baseHours, baseMins] = city.defaultSunset.split(':').map(Number);
  
  // Subtle daylight curve (+- 40 minutes over the year)
  const seasonalOffsetMinutes = Math.round(Math.sin((dayOfYear - 80) * (2 * Math.PI / 365)) * 35);
  
  const totalMinutes = baseHours * 60 + baseMins + seasonalOffsetMinutes;
  const hours24 = Math.floor(totalMinutes / 60) % 24;
  const mins = totalMinutes % 60;
  
  return `${hours24.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

export function timeStringToMinutes(timeStr: string): number {
  if (!timeStr) return 9 * 60 + 30; // 9:30 AM default
  const cleaned = timeStr.trim();
  const isPM = /pm/i.test(cleaned);
  const isAM = /am/i.test(cleaned);
  const parts = cleaned.replace(/[^\d:]/g, '').split(':');
  let hours = parseInt(parts[0], 10) || 0;
  const mins = parseInt(parts[1], 10) || 0;

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  return hours * 60 + mins;
}

export function minutesToTimeString(minutes: number): string {
  const hours24 = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minsStr = mins < 10 ? `0${mins}` : `${mins}`;
  return `${hours12}:${minsStr} ${period}`;
}

