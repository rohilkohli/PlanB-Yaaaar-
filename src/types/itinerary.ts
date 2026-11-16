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

export type DataSource = 'google_places' | 'curated';

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
  mobility: 'stairs_okay' | 'avoid_hills' | 'transit_first' | 'step_free';
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
  /** Free-text location the traveler typed / GPS-resolved neighbourhood label. */
  locationLabel?: string;
  /** IANA timezone of the destination. */
  timezone?: string;
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
  /** Where the venue facts came from. Curated entries are NOT Google-verified. */
  source?: DataSource;
  /** ISO timestamp of the last upstream fetch (PRD §27: 24h refresh on raw Places metadata). */
  verifiedAt?: string;
  /** non_veg | alcohol | steep | steps */
  tags?: string[];
  /** Exact open periods today as [openMin, closeMin] pairs (live Places data; handles lunch/dinner gaps). */
  periods?: Array<[number, number]>;
  /** Raw Google place types (live data only) — used for filtering and audit. */
  googleTypes?: string[];
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
  /** One-line rationale tied to the traveler's dials + hours, e.g. "Quiet setting · Open until 6:00 PM". */
  fitLine?: string;
  /** Minutes the traveler waits for the venue to open (included in time label). */
  isBonus?: boolean;
}

export interface AdaptationSummary {
  scenarios: string[];
  changedBlockIds: string[];
  keptBlockIds: string[];
  removedNames: string[];
  at: string;
  message: string;
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
  lastAdaptation?: AdaptationSummary;
  /** True when produced by the deterministic planner (LLM skipped/failed or kill-switch on). */
  usedFallback?: boolean;
  dataSource?: DataSource;
  /** All blocks done: offer one optional bonus stop or tomorrow's setup. */
  allDone?: boolean;
  /** Server signature over the plan's identity, venues and times (see server/sign.ts). */
  signature?: string;
  /** Too late for a daylight-safe plan today; offer tomorrow's setup. */
  needsTomorrow?: boolean;
}

export interface UndoState {
  active: boolean;
  message: string;
  expiresAt: number | null;
}

