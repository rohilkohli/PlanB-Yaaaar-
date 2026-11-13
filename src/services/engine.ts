/**
 * PlanB Pacing & Adaptation Engine (Production TypeScript)
 * India-Centric Solo Travel Pacing
 */

import { PLACES_DATABASE, CITIES } from '../data/placesData';
import { 
  DayPlan, 
  PlanBlock, 
  CalibrationData, 
  TravelerPreferences, 
  VerifiedVenue, 
  CityData 
} from '../types/itinerary';
import { calculateCitySunset, timeStringToMinutes, minutesToTimeString } from './sunset';

export class DriftlessEngine {
  private excludedPlaceIds: Set<string> = new Set();

  getCity(cityId: string = "jaipur"): CityData {
    return CITIES.find(c => c.id.toLowerCase() === cityId.toLowerCase()) || CITIES[0];
  }

  getCandidates(cityId: string, criteria: {
    isIndoorOnly?: boolean;
    requiresPlugs?: boolean;
    excludeIds?: string[];
  } = {}): VerifiedVenue[] {
    const { isIndoorOnly, requiresPlugs, excludeIds = [] } = criteria;
    const allExcluded = new Set([...this.excludedPlaceIds, ...excludeIds]);

    return PLACES_DATABASE.filter(p => {
      if (p.cityId.toLowerCase() !== cityId.toLowerCase()) return false;
      if (allExcluded.has(p.placeId)) return false;
      if (isIndoorOnly && !p.isIndoor) return false;
      if (requiresPlugs && !p.hasPlugs) return false;
      return true;
    });
  }

  generateDayPlan(calibration: Partial<CalibrationData>, guardrails: Partial<TravelerPreferences> = {}): DayPlan {
    const cityId = calibration.cityId || "jaipur";
    const city = this.getCity(cityId);
    const sunsetStr = calculateCitySunset(cityId);
    const sunsetMinutes = timeStringToMinutes(sunsetStr);

    const startMinutes = timeStringToMinutes(calibration.startTime || "09:30");
    const afterDark = calibration.afterDark || guardrails.afterDarkMode || "well_lit";

    const candidates = this.getCandidates(cityId);

    // Filter by appropriate slots: morning, lunch, afternoon, evening
    const morningCandidates = candidates.filter(p => p.timeSlot === "morning" || p.category === "viewpoint" || p.category === "walk");
    const lunchCandidates = candidates.filter(p => p.timeSlot === "lunch" || p.category === "dining" || p.category === "market");
    const afternoonCandidates = candidates.filter(p => p.timeSlot === "afternoon" || p.category === "culture" || p.category === "cafe");
    const eveningCandidates = candidates.filter(p => p.timeSlot === "evening" || p.category === "viewpoint" || p.category === "dining");

    const stop1 = morningCandidates[0] || candidates[0];
    const usedIds = new Set<string>([stop1.placeId]);

    const stop2 = lunchCandidates.find(p => !usedIds.has(p.placeId)) || candidates.find(p => !usedIds.has(p.placeId))!;
    if (stop2) usedIds.add(stop2.placeId);

    const stop3 = afternoonCandidates.find(p => !usedIds.has(p.placeId)) || candidates.find(p => !usedIds.has(p.placeId))!;
    if (stop3) usedIds.add(stop3.placeId);

    const stop4 = eveningCandidates.find(p => !usedIds.has(p.placeId)) || candidates.find(p => !usedIds.has(p.placeId))!;
    if (stop4) usedIds.add(stop4.placeId);

    const selectedVenues = [stop1, stop2, stop3, stop4].filter(Boolean);

    let currentCursor = startMinutes;
    const blocks: PlanBlock[] = [];

    selectedVenues.forEach((venue, index) => {
      const blockId = `blk_${Date.now()}_${index + 1}`;
      const duration = venue.suggestedDuration || 60;
      const buffer = venue.bufferAfter || 20;

      const blockStart = currentCursor;
      let blockEnd = blockStart + duration;

      // PRD US-006 & Section 18: For before_dark, final block must conclude >= 30m before local sunset
      if (index === selectedVenues.length - 1 && afterDark === "before_dark") {
        const strictCutoff = sunsetMinutes - 30;
        if (blockEnd > strictCutoff) {
          blockEnd = strictCutoff;
        }
      }

      const timeLabel = `${minutesToTimeString(blockStart)} – ${minutesToTimeString(blockEnd)}`;

      const transitFromPrev = index === 0
        ? "Starting point"
        : `${Math.round(buffer * 0.6)} min walk (${buffer}m buffer)`;

      blocks.push({
        blockId,
        sequence: index + 1,
        timeLabel,
        startMinutes: blockStart,
        endMinutes: blockEnd,
        status: index === 0 ? "in_progress" : "upcoming",
        venue,
        bufferMinutesAfter: buffer,
        transitFromPrev,
        whyItFits: venue.whyItFits,
        soloTip: venue.soloPerk,
        isIndoor: venue.isIndoor,
        isAdapted: false
      });

      currentCursor = blockEnd + buffer;
    });

    const fullCalibration: CalibrationData = {
      cityId,
      cityName: city.name,
      country: city.country,
      anchorCoords: city.coords,
      date: calibration.date || new Date().toISOString().split('T')[0],
      startTime: calibration.startTime || "09:30",
      endTime: calibration.endTime || "19:30",
      energy: calibration.energy || "balanced",
      budget: calibration.budget || "$$",
      afterDark,
      social: calibration.social || "ambient",
      sunsetTime: sunsetStr
    };

    const fullGuardrails: TravelerPreferences = {
      mobility: guardrails.mobility || "stairs_okay",
      maxStrideMinutes: guardrails.maxStrideMinutes || 25,
      dietary: guardrails.dietary || ["counter_preferred", "no_reservations"],
      units: guardrails.units || "km",
      afterDarkMode: afterDark
    };

    return {
      planId: `plan_${Date.now()}`,
      city,
      calibration: fullCalibration,
      guardrails: fullGuardrails,
      localSunsetTime: sunsetStr,
      blocks,
      previousSnapshot: null,
      createdAt: new Date().toISOString()
    };
  }

  adaptDayPlan(currentPlan: DayPlan, selectedScenarios: string[] = [], optionalNote: string = ""): DayPlan {
    if (!currentPlan || !currentPlan.blocks) return currentPlan;

    // Snapshot current plan for 1-tap Undo
    const previousSnapshot: DayPlan = JSON.parse(JSON.stringify({
      planId: currentPlan.planId,
      city: currentPlan.city,
      calibration: currentPlan.calibration,
      guardrails: currentPlan.guardrails,
      localSunsetTime: currentPlan.localSunsetTime,
      blocks: currentPlan.blocks,
      createdAt: currentPlan.createdAt
    }));

    const cityId = currentPlan.calibration.cityId;
    const sunsetMinutes = timeStringToMinutes(currentPlan.localSunsetTime);

    const isWeatherTurned = selectedScenarios.includes("weather_turned");
    const isLowBattery = selectedScenarios.includes("low_battery");
    const isRunningLate = selectedScenarios.includes("running_late");
    const isHungryNow = selectedScenarios.includes("hungry_now");
    const isEarlyNight = selectedScenarios.includes("early_night");

    const usedPlaceIds = new Set<string>(
      currentPlan.blocks.filter(b => b.status === "completed").map(b => b.venue.placeId)
    );

    const candidates = this.getCandidates(cityId, {
      isIndoorOnly: isWeatherTurned,
      requiresPlugs: isLowBattery,
      excludeIds: Array.from(usedPlaceIds)
    });

    const updatedBlocks = currentPlan.blocks.map((block, index) => {
      // RULE 1: Completed blocks are FROZEN and 100% preserved
      if (block.status === "completed") {
        return { ...block };
      }

      // Early evening / Call it an early night scenario:
      // Replace final stop with low-effort comforting takeaway along route back
      if (isEarlyNight && (index === currentPlan.blocks.length - 1 || index >= 2)) {
        const takeoutSpot = PLACES_DATABASE.find(p => p.cityId === cityId && (p.subCategory.includes("Takeout") || p.subCategory.includes("Takeaway"))) || block.venue;
        return {
          ...block,
          timeLabel: `${minutesToTimeString(sunsetMinutes - 45)} – ${minutesToTimeString(sunsetMinutes)}`,
          status: "upcoming" as const,
          venue: takeoutSpot,
          transitFromPrev: "10 min walk towards lodging",
          whyItFits: "Great takeout spot to pick up an easy dinner for the room.",
          soloTip: "Quick counter pickup with no table wait.",
          isIndoor: true,
          isAdapted: true,
          adaptationReason: "Evening takeout"
        };
      }

      // Weather turned: prioritize indoor venue
      if (isWeatherTurned && !block.isIndoor) {
        const indoorAlt = candidates.find(p => p.isIndoor && !usedPlaceIds.has(p.placeId) && p.category !== "viewpoint");
        if (indoorAlt) {
          usedPlaceIds.add(indoorAlt.placeId);
          return {
            ...block,
            venue: indoorAlt,
            isIndoor: true,
            isAdapted: true,
            adaptationReason: "Indoor stop",
            whyItFits: `${indoorAlt.name} offers dry indoor seating and a comfortable atmosphere.`,
            soloTip: indoorAlt.soloPerk
          };
        }
      }

      // Low battery: prioritize venues with plugs/Wi-Fi
      if (isLowBattery && !block.venue.hasPlugs) {
        const plugAlt = candidates.find(p => p.hasPlugs && !usedPlaceIds.has(p.placeId));
        if (plugAlt) {
          usedPlaceIds.add(plugAlt.placeId);
          return {
            ...block,
            venue: plugAlt,
            isIndoor: true,
            isAdapted: true,
            adaptationReason: "Outlets available",
            whyItFits: `${plugAlt.name} has power outlets and comfortable seating.`,
            soloTip: plugAlt.soloPerk
          };
        }
      }

      // Hungry now: insert/advance food counter
      if (isHungryNow && block.venue.category !== "dining" && block.venue.category !== "market") {
        const foodAlt = candidates.find(p => (p.category === "dining" || p.category === "market") && !usedPlaceIds.has(p.placeId));
        if (foodAlt) {
          usedPlaceIds.add(foodAlt.placeId);
          return {
            ...block,
            venue: foodAlt,
            isIndoor: foodAlt.isIndoor,
            isAdapted: true,
            adaptationReason: "Food stop",
            whyItFits: `${foodAlt.name} has counter service with no reservation required.`,
            soloTip: foodAlt.soloPerk
          };
        }
      }

      // Running late: shift pacing forward
      if (isRunningLate) {
        const shiftedStart = block.startMinutes + 35;
        const shiftedEnd = block.endMinutes + 35;
        return {
          ...block,
          startMinutes: shiftedStart,
          endMinutes: shiftedEnd,
          timeLabel: `${minutesToTimeString(shiftedStart)} – ${minutesToTimeString(shiftedEnd)}`,
          isAdapted: true,
          adaptationReason: "Time adjusted"
        };
      }

      return { ...block, isAdapted: false };
    });

    return {
      ...currentPlan,
      blocks: updatedBlocks,
      previousSnapshot,
      adaptedAt: new Date().toISOString(),
      activeScenarios: selectedScenarios,
      optionalNote
    };
  }

  getSwapAlternatives(currentPlan: DayPlan, blockId: string, swapReason: string = ""): VerifiedVenue[] {
    const block = currentPlan.blocks.find(b => b.blockId === blockId);
    if (!block) return [];

    const cityId = currentPlan.calibration.cityId;
    const currentVenueId = block.venue.placeId;

    // PRD FR-005: "It's closed" reason logs venue closure flag and excludes Place ID from session
    if (swapReason === "closed" || swapReason.includes("closed")) {
      this.excludedPlaceIds.add(currentVenueId);
    }

    const usedIds = new Set<string>(currentPlan.blocks.map(b => b.venue.placeId));
    usedIds.add(currentVenueId);

    const alternatives = PLACES_DATABASE.filter(p => {
      if (p.cityId.toLowerCase() !== cityId.toLowerCase()) return false;
      if (usedIds.has(p.placeId)) return false;
      if (this.excludedPlaceIds.has(p.placeId)) return false;
      if (swapReason === "food" && p.category !== "dining" && p.category !== "cafe" && p.category !== "market") return false;
      return true;
    });

    return alternatives.slice(0, 2);
  }

  applyBlockSwap(currentPlan: DayPlan, blockId: string, newVenue: VerifiedVenue): DayPlan {
    const previousSnapshot: DayPlan = JSON.parse(JSON.stringify({
      planId: currentPlan.planId,
      city: currentPlan.city,
      calibration: currentPlan.calibration,
      guardrails: currentPlan.guardrails,
      localSunsetTime: currentPlan.localSunsetTime,
      blocks: currentPlan.blocks,
      createdAt: currentPlan.createdAt
    }));

    const updatedBlocks = currentPlan.blocks.map(block => {
      if (block.blockId !== blockId) return block;
      return {
        ...block,
        venue: newVenue,
        isIndoor: newVenue.isIndoor,
        whyItFits: newVenue.whyItFits,
        soloTip: newVenue.soloPerk,
        isAdapted: true,
        adaptationReason: "Swapped stop"
      };
    });

    return {
      ...currentPlan,
      blocks: updatedBlocks,
      previousSnapshot
    };
  }

  undoMutation(currentPlan: DayPlan): DayPlan {
    if (!currentPlan || !currentPlan.previousSnapshot) return currentPlan;
    const restored: DayPlan = JSON.parse(JSON.stringify(currentPlan.previousSnapshot));
    restored.previousSnapshot = null;
    return restored;
  }
}

export const driftlessEngine = new DriftlessEngine();

