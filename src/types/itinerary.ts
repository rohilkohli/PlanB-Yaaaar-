/**
 * Driftless Core Data Models & TypeScript Types
 * Grounded in PRD Section 22 (Data Model) & Section 17
 */

export type EnergyLevel = 'gentle' | 'balanced' | 'active';
export type BudgetTier = '$' | '$$' | '$$$' | '₹' | '₹₹' | '₹₹₹';
export type AfterDarkComfort = 'before_dark' | 'well_lit' | 'anywhere';
export type SocialAppetite = 'solitude' | 'ambient' | 'social';
export type BlockStatus = 'upcoming' | 'in_progress' | 'completed' | 'skipped';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface CityData {
  id: string;
  name: string;
  country: string;
  tagline: string;
  coords: Coordinates;
  timezone: string;
  defaultSunset: string;
  weatherVibe: string;
  heroImage: string;
}

export interface TravelerPreferences {
  mobility: 'stairs_okay' | 'avoid_hills' | 'transit_first';
  maxStrideMinutes: 15 | 25 | 40;
  dietary: string[];
  units: 'km' | 'mi';
  afterDarkMode: AfterDarkComfort;
}

export interface CalibrationData {
  cityId: string;
  cityName: string;
  country: string;
  anchorCoords: Coordinates;
  date: string;
  startTime: string;
  endTime: string;
  energy: EnergyLevel;
  budget: BudgetTier;
  afterDark: AfterDarkComfort;
  social: SocialAppetite;
  sunsetTime: string;
}

export interface VerifiedVenue {
  placeId: string;
  cityId: string;
  name: string;
  category: 'viewpoint' | 'dining' | 'cafe' | 'culture' | 'walk' | 'bakery' | 'market';
  subCategory: string;
  neighborhood: string;
  address: string;
  coords: Coordinates;
  timeSlot: 'morning' | 'lunch' | 'afternoon' | 'evening';
  suggestedDuration: number; // in minutes
  bufferAfter: number; // in minutes
  priceLevel: BudgetTier;
  rating: number;
  reviewsCount: number;
  openHoursToday: string;
  opensAt: string;
  closesAt: string;
  isIndoor: boolean;
  hasPlugs: boolean;
  noiseLevel: string;
  whyItFits: string;
  soloPerk: string;
  transitFromPrev: string;
  imageUrl: string;
  mapsUrl: string;
  appleMapsUrl: string;
}

export interface PlanBlock {
  blockId: string;
  sequence: number;
  timeLabel: string;
  startMinutes: number;
  endMinutes: number;
  status: BlockStatus;
  venue: VerifiedVenue;
  bufferMinutesAfter: number;
  transitFromPrev: string;
  whyItFits: string;
  soloTip: string;
  isIndoor: boolean;
  isAdapted?: boolean;
  adaptationReason?: string;
}

export interface DayPlan {
  planId: string;
  city: CityData;
  calibration: CalibrationData;
  guardrails: TravelerPreferences;
  localSunsetTime: string;
  blocks: PlanBlock[];
  previousSnapshot: DayPlan | null;
  createdAt: string;
  adaptedAt?: string;
  activeScenarios?: string[];
  optionalNote?: string;
}

export interface UndoState {
  active: boolean;
  message: string;
  expiresAt: number | null;
}

