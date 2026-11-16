# Legal review checklist (before public launch)

The privacy policy, terms and data-sources pages (`src/pages/LegalPages.tsx`) were written from what the app actually does,
but they are **plain-language drafts, not legal advice**. Have a lawyer review them, in particular:

1. **Indian law** — Digital Personal Data Protection Act 2023 (notice, consent, grievance officer, retention, children <18),
   IT Act intermediary rules, consumer-protection rules. Add a named grievance/contact officer and a real contact email
   (the pages currently point to GitHub issues).
2. **Governing law / jurisdiction / liability limits** in the Terms (deliberately omitted until a lawyer decides).
3. **Google Maps Platform terms** — caching and storage limits for Places content (the app keeps venue name/address/coordinates/hours
   on-device for up to 14 days and caches results server-side for 10 minutes — `PLACES_CACHE_TTL_SEC`), required attribution/logo rules
   for Places data shown outside a Google map, and review-author attribution. Adjust retention or disable caching if required.
4. **Third-party notices** — Open-Meteo (CC BY 4.0 attribution is included), Unsplash (hotlinked photos), Google Fonts.
5. **AI disclosure** — if AI sequencing is enabled, the privacy page says what is sent to the model provider; keep it accurate.
6. **Safety wording** — "well-lit" is a heuristic (popularity of the area), not safety data; keep the disclaimers or remove the claim.
