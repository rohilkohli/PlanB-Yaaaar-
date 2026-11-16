# Safety stance

PlanB is a planning aid. It does **not** rate or guarantee safety.
- Daylight: "Finish before dark" ends the last stop at least 30 minutes before calculated sunset (NOAA method, a few minutes of error).
- "Main streets" is a popularity preference. It is not a safety measure and the app never calls an area safe or well-lit; AI text
  containing such claims is filtered out (`SAFETY_CLAIM` in `src/core/planner.ts`).
- Emergency number (India: 112) is one tap away in Preferences.
- Terms tell users their own judgment always comes first.

Not built, and needs a product decision plus real data sources: area safety scores, live incident data, trip sharing with a contact,
check-in reminders, women-specific safety features.
