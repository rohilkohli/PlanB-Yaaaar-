# Legal review checklist (before public launch)

The privacy policy, terms and data-sources pages (`src/pages/LegalPages.tsx`) were written from what the app actually does,
but they are **plain-language drafts, not legal advice**. Have a lawyer review them, in particular:

1. **Indian law** — Digital Personal Data Protection Act 2023 (notice, consent, grievance officer, retention, children <18),
   IT Act intermediary rules, consumer-protection rules. Add a named grievance/contact officer and a real contact email
   (the pages currently point to GitHub issues).
2. **Governing law / jurisdiction / liability limits** in the Terms (deliberately omitted until a lawyer decides).
3. **Google Maps Platform terms** — see `docs/GOOGLE-COMPLIANCE.md` (policy read and implemented 16 Nov 2026: no caching/storing of
   Places content, attribution, Terms/Privacy incorporation). Open question for counsel: using Places data as AI model input.
4. **Third-party notices** — Open-Meteo (CC BY 4.0 attribution is included), Unsplash (hotlinked photos), Google Fonts.
5. **AI disclosure** — if AI sequencing is enabled, the privacy page says what is sent to the model provider; keep it accurate.
6. **Safety wording** — "well-lit" is a heuristic (popularity of the area), not safety data; keep the disclaimers or remove the claim.

7. **DPDP Act / Rules 2025** — notified 13 Nov 2025; main duties apply about 18 months later (~May 2027). Needs a standalone notice with the
   data collected, purposes and fiduciary contact, plus breach and children's-data processes. The privacy page now lists purposes; set a real
   contact with `CONTACT_EMAIL`.
