import { describe, it, expect, beforeEach } from 'vitest';
import { DriftlessEngine } from '../src/services/engine';
import { calculateCitySunset, timeStringToMinutes } from '../src/services/sunset';

describe('DriftlessEngine Core Engine Tests', () => {
  let engine: DriftlessEngine;

  beforeEach(() => {
    engine = new DriftlessEngine();
  });

  describe('F-02 & US-002: Day Plan Generation & Pacing', () => {
    it('generates a structured 3-4 block day plan with dwell times and transit buffers', () => {
      const plan = engine.generateDayPlan({
        cityId: 'lisbon',
        energy: 'balanced',
        budget: '$$',
        afterDark: 'well_lit',
        social: 'ambient',
        startTime: '09:30'
      });

      expect(plan).toBeDefined();
      expect(plan.blocks.length).toBeGreaterThanOrEqual(3);
      expect(plan.blocks.length).toBeLessThanOrEqual(4);
      expect(plan.city.id).toBe('lisbon');

      // Verify each block structure
      plan.blocks.forEach((block, index) => {
        expect(block.sequence).toBe(index + 1);
        expect(block.venue).toBeDefined();
        expect(block.venue.name).toBeTruthy();
        expect(block.whyItFits).toBeTruthy();
        expect(block.soloTip).toBeTruthy();
        expect(block.bufferMinutesAfter).toBeGreaterThanOrEqual(15);
        expect(block.endMinutes).toBeGreaterThan(block.startMinutes);
      });
    });

    it('enforces US-006 sunset curfew: final block concludes >= 30m before sunset when afterDark is before_dark', () => {
      const plan = engine.generateDayPlan(
        {
          cityId: 'lisbon',
          afterDark: 'before_dark',
          startTime: '10:00'
        },
        {
          afterDarkMode: 'before_dark'
        }
      );

      const sunsetStr = calculateCitySunset('lisbon');
      const sunsetMinutes = timeStringToMinutes(sunsetStr);
      const strictCurfew = sunsetMinutes - 30;

      const finalBlock = plan.blocks[plan.blocks.length - 1];
      expect(finalBlock.endMinutes).toBeLessThanOrEqual(strictCurfew);
    });
  });

  describe('F-04 & US-004: State-Preserving Adaptation', () => {
    it('FREEZES completed stops: completed blocks are never mutated or replaced during adaptation', () => {
      const initialPlan = engine.generateDayPlan({ cityId: 'lisbon' });
      
      // Simulate traveler marking Stop 1 completed
      initialPlan.blocks[0].status = 'completed';
      const stop1VenueId = initialPlan.blocks[0].venue.placeId;
      const stop1Name = initialPlan.blocks[0].venue.name;

      // Adapt the day with weather turned
      const adaptedPlan = engine.adaptDayPlan(initialPlan, ['weather_turned'], 'Sudden rain in Alfama');

      // Assert Stop 1 is exactly preserved
      expect(adaptedPlan.blocks[0].status).toBe('completed');
      expect(adaptedPlan.blocks[0].venue.placeId).toBe(stop1VenueId);
      expect(adaptedPlan.blocks[0].venue.name).toBe(stop1Name);
      expect(adaptedPlan.blocks[0].isAdapted).toBe(false);

      // Remaining stops should be adapted for rain (indoor)
      const remainingBlocks = adaptedPlan.blocks.slice(1);
      const adaptedOutdoorBlocks = remainingBlocks.filter(b => b.isAdapted && b.isIndoor);
      expect(adaptedOutdoorBlocks.length).toBeGreaterThan(0);
    });

    it('creates previousSnapshot so the traveler can Undo in one tap', () => {
      const initialPlan = engine.generateDayPlan({ cityId: 'lisbon' });
      const adaptedPlan = engine.adaptDayPlan(initialPlan, ['low_battery']);

      expect(adaptedPlan.previousSnapshot).toBeDefined();
      expect(adaptedPlan.previousSnapshot?.planId).toBe(initialPlan.planId);
      expect(adaptedPlan.previousSnapshot?.blocks.length).toBe(initialPlan.blocks.length);

      // Rollback
      const revertedPlan = engine.undoMutation(adaptedPlan);
      expect(revertedPlan.blocks).toEqual(initialPlan.blocks);
      expect(revertedPlan.previousSnapshot).toBeNull();
    });
  });

  describe('F-05 & US-005: Single-Block Swap & Closed-Venue Flagging', () => {
    it('returns 2 calibrated replacement alternatives within the same city corridor', () => {
      const plan = engine.generateDayPlan({ cityId: 'lisbon' });
      const targetBlock = plan.blocks[1];

      const alts = engine.getSwapAlternatives(plan, targetBlock.blockId, 'vibe');
      expect(alts.length).toBe(2);
      expect(alts[0].placeId).not.toBe(targetBlock.venue.placeId);
      expect(alts[1].placeId).not.toBe(targetBlock.venue.placeId);
    });

    it('excludes closed venues when reason is "closed"', () => {
      const plan = engine.generateDayPlan({ cityId: 'lisbon' });
      const targetBlock = plan.blocks[1];
      const closedVenueId = targetBlock.venue.placeId;

      // Flag as closed
      const alts = engine.getSwapAlternatives(plan, targetBlock.blockId, 'closed');
      expect(alts.every(a => a.placeId !== closedVenueId)).toBe(true);

      // Subsequent candidate queries must exclude the flagged venue
      const futureCandidates = engine.getCandidates('lisbon');
      expect(futureCandidates.some(c => c.placeId === closedVenueId)).toBe(false);
    });

    it('applies a swap to only the target block while preserving all other blocks', () => {
      const plan = engine.generateDayPlan({ cityId: 'lisbon' });
      const targetBlock = plan.blocks[1];
      const alts = engine.getSwapAlternatives(plan, targetBlock.blockId, 'vibe');
      const newVenue = alts[0];

      const swappedPlan = engine.applyBlockSwap(plan, targetBlock.blockId, newVenue);

      // Block 0 unchanged
      expect(swappedPlan.blocks[0].venue.placeId).toBe(plan.blocks[0].venue.placeId);
      // Block 1 replaced
      expect(swappedPlan.blocks[1].venue.placeId).toBe(newVenue.placeId);
      expect(swappedPlan.blocks[1].isAdapted).toBe(true);
      // Block 2 unchanged
      expect(swappedPlan.blocks[2].venue.placeId).toBe(plan.blocks[2].venue.placeId);

      // Undo swap restores original block 1
      const restored = engine.undoMutation(swappedPlan);
      expect(restored.blocks[1].venue.placeId).toBe(targetBlock.venue.placeId);
    });
  });

  describe('Solar Daylight Calculation & Sunset Service', () => {
    it('computes realistic local sunset for supported cities', () => {
      const lisbonSunset = calculateCitySunset('lisbon');
      const jaipurSunset = calculateCitySunset('jaipur');
      const goaSunset = calculateCitySunset('goa');

      expect(lisbonSunset).toMatch(/^\d{2}:\d{2}$/);
      expect(jaipurSunset).toMatch(/^\d{2}:\d{2}$/);
      expect(goaSunset).toMatch(/^\d{2}:\d{2}$/);

      const jaipurMins = timeStringToMinutes(jaipurSunset);
      expect(jaipurMins).toBeGreaterThan(16 * 60); // Sunset after 4 PM
      expect(jaipurMins).toBeLessThan(22 * 60);    // Sunset before 10 PM
    });
  });

  describe('India-Centric PlanB Itinerary Generation', () => {
    it('generates a verified Jaipur day plan with authentic venues and INR pricing', () => {
      const plan = engine.generateDayPlan({
        cityId: 'jaipur',
        energy: 'balanced',
        budget: '$$',
        startTime: '09:30'
      });

      expect(plan.city.name).toBe('Jaipur');
      expect(plan.city.country).toBe('India');
      expect(plan.blocks.length).toBeGreaterThanOrEqual(3);

      // Verify authentic venues
      const venues = plan.blocks.map(b => b.venue.name);
      expect(venues).toContain('Hawa Mahal & Wind View Terraces');
      expect(venues).toContain('Tapri Central');

      // Verify price level in INR tier
      expect(['₹', '₹₹', '₹₹₹', '$', '$$']).toContain(plan.blocks[0].venue.priceLevel);
    });

    it('defaults to Jaipur when no city is specified', () => {
      const plan = engine.generateDayPlan({});
      expect(plan.city.id).toBe('jaipur');
      expect(plan.city.name).toBe('Jaipur');
    });

    it('generates plans across Goa, Bengaluru, Varanasi, and Mumbai', () => {
      ['goa', 'bengaluru', 'varanasi', 'mumbai'].forEach(cityId => {
        const plan = engine.generateDayPlan({ cityId });
        expect(plan.city.country).toBe('India');
        expect(plan.blocks.length).toBeGreaterThanOrEqual(3);
        expect(plan.blocks[0].venue.cityId).toBe(cityId);
      });
    });
  });
});

