# Closures and holidays — how to maintain

- `src/data/closures.ts` holds two things:
  1. `NATIONAL_HOLIDAYS_2026` — dates that show a "national holiday, some venues may be closed" note on the plan.
  2. `VENUE_CLOSURES` — venue-specific closed dates or weekdays. A venue listed here is **excluded** from plans on those days.
- Only add an entry after checking the venue's own official notice. Put the source link in `source`.
- Dates for festivals change every year (lunar calendars). Update the list each January and check state holiday notices.
