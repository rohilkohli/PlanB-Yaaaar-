# Driftless — Architecture & Synthesis Plan (Phase 1)

**Product:** Driftless — Adaptive Solo Travel Day Companion  
**Stack:** React + Vite + TypeScript + Tailwind CSS (Mobile-First PWA)  
**Author:** Principal Full-Stack Engineer & Product Architect  
**Date:** November 2026  

---

## 1. PRD-to-Design Reconciliation Matrix

Mapping every PRD MVP feature (`F-01` to `F-09`), User Story (`US-001` to `US-012`), and screen from the exported Stitch design folders:
* **Stitch Project 1 (`stitch_driftless_solo_travel_companion`):** Layout structure, bottom-sheets, editorial pacing, guardrails, and user flow ergonomics.
* **Stitch Project 2 (`stitch_driftless_solo_travel_app`):** "Vibrant Kinetic Travel" design tokens, kinetic radar transitions, high-contrast outdoor UI, and interactive pill controls.

| PRD Req / Story | Requirement Name | Stitch Source Screens | Status & Missing Elements in Static Exports |
| :--- | :--- | :--- | :--- |
| **F-01 / US-001** | **60-Second Daily Calibration** | `daily_calibration`, `daily_calibration_chartreuse_palette`, `driftless_quick_day_intake_single_screen` | **Matched.** Missing: Live GPS permission-denied fallback banner, real-time wandering hours calculation, and instant 1-tap "Preview sample day in Lisbon" demo trigger. |
| **F-02 / US-004, US-005** | **Grounded Paced Day Generator** | `active_day_canvas`, `driftless_planned_day_itinerary_whole_day_plan` | **Matched.** Missing: Multi-stage skeleton loader/radar transition (`driftless_generating_day_plan_transition`), verified opening hours tag validation, and explicit "Solo Seating Field Note" styling. |
| **F-03 / US-008** | **1-Tap "Day Shifted" Recalibration** | `adapt_my_day_sheet_1`, `adapt_my_day_sheet_2` | **Matched.** Missing: Explicit freezing of `completed` morning blocks (visual "Locked in log" banner), dynamic update counter on CTA button, and state snapshot saving for Undo. |
| **F-04 / US-009, US-010** | **Single-Block Swap + 1-Tap Undo** | `single_block_swap_sheet_1`, `single_block_swap_sheet_2` | **Matched.** Missing: Permanent exclusion of Place ID when "It's closed" is selected, 30-second persistent Undo banner/toast with countdown progress, and single-tap rollback. |
| **F-05 / US-006** | **After-Dark & Sunset Guardrails** | `traveler_guardrails_preferences`, `traveler_guardrails_chartreuse_palette`, `onboarding_comfort_safety_baseline` | **Matched.** Missing: Mathematical enforcement that for `before_dark`, the final block ends >=30 minutes before local sunset. |
| **F-06 / US-007** | **Google / Apple Maps Deep-Links** | `active_day_canvas` ("Open in Maps" button) | **Matched.** Missing: Dynamic query URL generation with fallbacks for Apple Maps on iOS and Google Maps universal URLs with coordinates. |
| **F-07 / US-011** | **Offline Pocket Cache (PWA)** | *Missing from static Stitch exports* | **Critical Gap.** Static Stitch exports did not include the offline state banner ("Offline mode — your plan and addresses are saved. Reconnect to adapt"), Service Worker registration, or local IndexedDB cache. |
| **F-08 / US-005** | **Solo-Fit Rationales & Closed Flag** | `active_day_canvas` ("Solo Seating Field Note"), `single_block_swap_sheet_1` | **Matched.** Needs explicit two-sentence cap for street glanceability. |
| **F-09** | **Live Weather & Vibe Auto-Detection** | `daily_calibration` ("Warm coastal breeze") | **Matched.** Will auto-populate weather vibe per city with auto-indoor fallback if rain is flagged. |
| **US-003, US-012** | **Persistent Guardrails & 1-Tap Data Reset** | `traveler_guardrails_preferences` | **Matched.** Missing: 14-day auto-purge countdown and complete local data reset with confirmation. |

---

## 2. Unified Design System: "Vibrant Kinetic Travel"

We merge the structural clarity of Stitch Project 1 with the high-energy, outdoor-readable **"Vibrant Kinetic Travel"** design system from Stitch Project 2:

### Color Palette & Tokens
* **Canvas Grounds:** `#F8FBF1` (Gentle lime-cast off-white, eliminates glare in harsh midday sunlight). Secondary canvas: `#F4F7ED`.
* **Elevated Surfaces (Cards & Modules):** Pure `#FFFFFF` with a crisp `1px solid #E2E8D5` border, soft pebble radii (`24px–28px`), and diffused ambient shadow (`0 4px 16px -2px rgba(17, 24, 39, 0.05)`).
* **Recessed Containers & Badges:** `#F2F5EB` and `#EAEEDC`.
* **Primary Brand Accent:** **Electric Lime Chartreuse (`#B8EE30`)**
  * Used for: Primary CTAs, active segmented tabs, live state indicators, and hero highlights.
  * Typography on Chartreuse: Deep Obsidian Charcoal (`#191D17`) font-bold.
  * Visual treatment: Flat, zero drop shadows to maintain razor-sharp graphic precision.
* **Tertiary / Live Signal Accent:** **Rose Coral (`#F43F5E`)**
  * Used for: Pulsing live status dots, sunset warning accents, and map pins.
* **Spruce Green Accent (`#4C6700` / `#436746`):**
  * Used for: Verified open hours badges and checkmarks.
* **Typography:**
  * **Headlines:** `Plus Jakarta Sans` (`700` and `800` weight) with tight tracking (`-0.02em` to `-0.03em`) for punchy, editorial presence.
  * **Body & Field Notes:** `Plus Jakarta Sans` (`400` / `500` weight) for maximum outdoor legibility.
  * **Pills & Micro-data:** `Plus Jakarta Sans` (`600` / `700` weight) with slight positive tracking (`0.02em`).

### Viewport & Physical Ergonomics
* **Primary Mobile Shell:** `390px × 844px` (iPhone 14/15/16 baseline) responsive fluid grid scaling down to `360px` and up to `430px`.
* **Desktop Presentation:** Centered app shell (`max-w-[440px]`), clean neutral backdrop, full mobile emulation feel.
* **Thumb Zone Architecture:**
  * Persistent bottom navigation dock (`64px` height, floating `16px` above safe area).
  * Persistent `"Day Shifted / Adapt"` capsule button immediately reachable by either thumb without regripping.
  * Strict `>= 44×44px` minimum touch target on all interactive controls with `>= 8px` spacing.
  * WCAG 2.1 AA sunlight contrast ratio (>= 4.5:1 on badges, >= 7:1 on body text).

---

## 3. Intelligent Product & Engineering Additions

To make Driftless feel genuinely intelligent, street-ready, and resilient on real mobile networks, we build in 5 core enhancements:

1. **Smart Time-of-Day Calibration Defaults:**
   * If user opens the app between 06:00 and 11:30 AM, default time window auto-sets to `Morning -> Sunset` with 4 full blocks.
   * If opened between 12:00 and 15:30 PM, auto-adapts starting slot to `Afternoon -> Evening` (compact 2-3 blocks) with lunch already pre-marked.
   * If opened after 17:00 PM, switches to `Evening & After-Dark Wind-Down` mode.

2. **Mathematical Sunset Curfew Engine (`home_before_dark`):**
   * Built-in solar calculation per city coordinates and date.
   * When `before_dark` comfort is chosen, the engine strictly forces Block 4 to conclude `>= 30 minutes` before local sunset, adjusting dwell times or buffers automatically.

3. **Instant Client-Side Snapshot Stack for 1-Tap Undo:**
   * Before any mutation (`Adapt Day` or `Swap Block`), a full immutable snapshot of the current itinerary is pushed to `previous_snapshot`.
   * A 30-second persistent toast appears at the top: *"Day adapted · [Undo change]"*.
   * Tapping Undo immediately restores the prior state with zero network latency.

4. **Zero-Config Resilience with Multi-City Grounded Dataset:**
   * Includes deep, verified, high-resolution datasets for **Lisbon**, **Tokyo**, **Kyoto**, and **Paris** (matching the photographic assets from Stitch).
   * Operates completely out-of-the-box with zero required API keys, while architected to seamlessly query Google Places API + Structured LLM when `.env` keys are configured.

5. **Local-First PWA Offline Pocket Cache:**
   * Active plans, preferences, and venue directions are stored in `localStorage` + IndexedDB (`idb-keyval`).
   * When the device enters Airplane Mode or loses connection, the app displays a calm pocket cache badge and continues rendering all addresses, hours, and notes without breaking.

---

## 4. Technical Architecture & File Layout

We will build this using **Vite + React 18 + TypeScript + Tailwind CSS** as it matches the Stitch exported codebase, provides sub-second HMR, and compiles to an ultra-fast, zero-overhead static PWA bundle that works seamlessly offline.

```
d:/Build With AI/
├── index.html                    # PWA Shell, viewport-fit, typography & icons
├── manifest.webmanifest          # PWA App Manifest (standalone, theme colors)
├── package.json                  # Dependencies & scripts
├── tsconfig.json                 # Strict TypeScript configuration
├── vite.config.ts                # Vite PWA & proxy configuration
├── tailwind.config.js            # Unified Vibrant Kinetic Travel tokens
├── postcss.config.js
├── src/
│   ├── main.tsx                  # React entry point
│   ├── App.tsx                   # Main SPA state machine & view router
│   ├── types/
│   │   └── itinerary.ts          # Strictly typed Calibration, PlanBlock, Venue schemas
│   ├── data/
│   │   └── placesData.ts         # Pre-grounded Lisbon, Tokyo, Kyoto, Paris venues
│   ├── services/
│   │   ├── engine.ts             # Pacing, buffer calculation, daylight & adaptation logic
│   │   ├── storage.ts            # Local-first persistence, 14-day auto-purge & Undo stack
│   │   └── sunset.ts             # Solar boundary math across timezones
│   ├── components/
│   │   ├── NavigationDock.tsx    # Floating bottom dock
│   │   ├── CalibrationView.tsx   # 60s Daily calibration with 4 visual dials
│   │   ├── GeneratingTransition.tsx # Kinetic radar waypoint animation & % counter
│   │   ├── ActiveCanvasView.tsx  # Core 3-4 block timeline with buffers & solo notes
│   │   ├── AdaptBottomSheet.tsx  # 6 scenario chips with frozen morning stops
│   │   ├── SwapBottomSheet.tsx   # 2 verified alternatives + closure exclusion
│   │   ├── GuardrailsModal.tsx   # Mobility, dietary, after-dark envelope & clear data
│   │   ├── UndoToast.tsx         # 30-second rollback toast
│   │   ├── OfflineBadge.tsx      # Real-time network & Airplane mode indicator
│   │   └── ExploreView.tsx       # Curated multi-city routes
│   └── styles/
│       └── globals.css           # Custom scrollbars, animations, safe area padding
├── tests/
│   └── engine.test.ts            # Automated QA tests for pacing, adaptation & undo
└── PLAN.md                       # This architectural plan
```

---

## 5. Verification Checklist (Phase 3)
* [ ] TypeScript compilation passes with zero errors (`tsc --noEmit`).
* [ ] Automated tests verify: 60s calibration schema, 3–4 block timeline pacing, sunset cutoff math, state-preserving adaptation (freezing completed stops), single-block swap, and 1-tap Undo.
* [ ] Responsive viewport testing on `375px` (iPhone SE), `390px` (iPhone 14/15/16), and desktop centered shell.
* [ ] Touch targets >= 44×44px, outdoor high-contrast sunlight readability.
* [ ] Offline simulation test (Airplane mode).

