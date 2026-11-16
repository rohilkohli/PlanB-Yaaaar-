# Google Maps Platform compliance

Source: Google's "Policies and attributions for Places API" page (read 16 Nov 2026) and the Maps Platform pricing page.
This is a working summary, **not legal advice** — Google itself says to consult counsel.

## Rules that apply (quoted from Google)
- "You must not pre-fetch, cache, or store Places API content beyond the allowed exceptions, although the `place_id` is exempt."
- Latitude/longitude may be cached temporarily "for up to 30 consecutive calendar days".
- Applications "must provide publicly accessible Terms of Use and a Privacy Policy that incorporate Google's Terms of Service and
  Privacy Policy".
- "Places API results displayed on a map must be shown on a Google Map" with proper attribution.
- Display attributions for place details, photos and reviews, "including author information and links where available".
- Attribution is the Google Maps logo, or the text "Google Maps" where space is limited. The text must not be localized
  (e.g. into Hindi) and browsers must be prevented from translating it.

## What PlanB does about each
| Rule | Implementation |
|---|---|
| No caching/storing | Server cache is **off** by default (`PLACES_CACHE_TTL_SEC=0`). Saved plans keep only place ID, coordinates and PlanB's own schedule; name, address, rating and hours are removed before saving (`src/services/storage.ts`) and re-fetched online (`/api/places/summary`). Photos are sent `no-store`. Switch `PLACES_OFFLINE_STORAGE=allow` exists only for use after counsel approves. |
| Terms/Privacy incorporate Google's | `/terms` and `/privacy` link Google's Maps Platform Terms and Privacy Policy. |
| Must be on a Google Map | The drawn fallback map is never used for Google data; the list is shown instead. |
| Attributions | Photo cards show "Google Maps · <photographer>" (linked); reviews show the author (linked) and "Google Maps". |
| Don't localize "Google Maps" | Wrapped in `translate="no"` / `notranslate`. |

## Consequence you should know
Plans built from live Google data **cannot be fully read offline**: names and addresses need a connection. The stop times, order and
directions links by coordinates still work. Curated (hand-written) venues remain fully offline. If this is unacceptable, get a custom
licence from Google or ask counsel whether an exception applies.

## Still open (needs counsel / Google)
- Sending Places data (venue names, hours, ratings) to an AI model (Gemini) as part of planning — check Google's Service Specific Terms
  for restrictions on using Maps content with generative AI.
- Weather API has field-specific caching rules; PlanB does not cache weather by default (`WEATHER_CACHE_SEC`).
- Whether the Maps JavaScript map and the server-side Places calls together meet the "Google logo" display requirements in your layouts.
