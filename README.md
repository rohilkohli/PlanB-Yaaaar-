# PlanB — Solo Travel India

> **"Rhythm over check-lists."**  
> An adaptive, context-aware daily companion Progressive Web App (PWA) built specifically for solo travelers exploring India.

---

## 🧭 Overview & Philosophy

Most travel apps overload solo wanderers with hyper-dense bucket lists, rigid hourly bookings, and tourist traps. **PlanB** takes the opposite approach:
- **Restraint:** A paced **3–4 block vertical timeline** calibrated for authentic dwell times, realistic transit corridors (auto-rickshaw, heritage pedestrian walks, metro), and natural decompression breathers.
- **Micro-context over ratings:** Solo dining counter seating tips, chai stall perches, quiet haveli courtyards, sunset bastions, and power outlet accessibility.
- **Instant mid-day adaptation:** When sudden rain hits, phone battery drops, or fatigue creeps in, tap **"Adjust Plan"** to recalibrate the remaining itinerary in seconds while **freezing completed morning stops intact**.
- **1-Tap Undo Safety Net:** Every schedule mutation creates an instantaneous immutable state snapshot. A persistent 30-second Undo toast lets you revert back anytime with zero anxiety.
- **Offline Ready:** Works reliably in airplane mode or spotty subway connections with zero external API key dependencies.

---

## 🇮🇳 Featured Destinations

PlanB comes pre-calibrated with verified venues, walking buffers, and local solo-traveler field notes for India's premier destinations:

- **Jaipur (Rajasthan)** — Pink City morning light at Hawa Mahal, kulhad chai at Tapri Central, 16th-century stone haveli textile crafts at Anokhi Museum, and sunset over the Aravalli hills from Nahargarh Fort bastions.
- **Goa (Panjim & Fontainhas)** — Cobblestone Latin Quarter walks, 1930s wood-fired poi and bebinca at Confeitaria 31 de Janeiro, Sunaparanta arts courtyard, and golden hour along the Miramar beach promenade.
- **Bengaluru (Karnataka)** — Cubbon Park bamboo canopy walk, legendary benne dose and tumbler filter coffee at Vidyarthi Bhavan, Blossom Book House on Church Street, and waterside strolls at Sankey Tank.
- **Varanasi (Uttar Pradesh)** — Dawn rowboat drift on the Ganges, thick claypot fruit lassis at Blue Lassi Shop, Bharat Kala Bhavan museum, and the evening Ganga Aarti at Dashashwamedh Ghat.
- **Mumbai (Maharashtra)** — Kala Ghoda heritage art walk, wood-fired bun maska and spiced chai at Yazdani Bakery, CSMVS palm gardens, and sunset along the Marine Drive Queen's Necklace promenade.
- **Udaipur & Kochi** — Lake Pichola ghats, heritage rooftop cafes, Chinese fishing nets, and colonial spice warehouse lanes.

---

## 🎨 Unified Design System: "Vibrant Kinetic Travel"

Synthesized from Google Stitch specifications:

| Token | Hex / Spec | Usage |
|---|---|---|
| **Canvas Base** | `#F8FBF1` / `#F4F7ED` | Outdoor glare-resistant off-white background |
| **Primary Accent** | `#B8EE30` (Electric Chartreuse) | High-energy kinetic calls to action, badges, and active tab states |
| **Contrast Text** | `#191D17` (Deep Obsidian) | High-contrast readable typography for bright sunlight |
| **Live Accent** | `#F43F5E` (Rose Coral) | Real-time indicators, pulse rings, and distance callouts |
| **Deep Forest** | `#4C6700` | Anchored subtitle typography and section headers |
| **Card Surface** | Frosted Glassmorphism | `backdrop-blur-xl`, `bg-white/75`, `border-white/80` |
| **Dock Elevation** | Responsive Scroll Dock | Shrinks smoothly from `h-16`/`scale-100` to `h-12`/`scale-90` |
| **Typography** | `Plus Jakarta Sans` | `700`/`800` tight tracking for headlines; `400`/`500`/`600` for body & tips |

---

## 🚀 Key Features

### 1. Minimalist 3-Step Intake (`CalibrationView`)
- **Step 1: Destination** — Pick your city with one tap or detect via GPS with automated permission-denied fallback.
- **Step 2: Pace** — Relaxed (short walks & cafes), Moderate (steady walking), or Active (viewpoints & longer trails).
- **Step 3: Evening Preference** — Home before sunset, main streets only, or late dining.

### 2. Active Canvas & Interactive Map (`ActiveCanvasView`)
- Master summary card showing total walking distance, pace, daylight span, and local sunset time.
- Segmented View Switcher: **Timeline View** vs **Map Overview**.
- **Interactive Vector Map**: Hand-crafted city vector topography with green park foliage, arterial avenues, river waterways, and dynamic waypoint beacons (`01`, `02`, `03`, `04`).
- **Up Next Priority**: Active upcoming stop highlighted with chartreuse flare and glow ring.
- **Solo Tip Drawer**: Tap the `(i)` icon on any card to reveal curated solo field notes.
- Quick navigation deep-links to Google Maps.

### 3. Dynamic Plan Adaptation (`AdaptBottomSheet`)
- Adapt to real-world solo travel shifts in 1 tap:
  - 🌧️ **Rain / Cold**: Replaces open walks with covered havelis, museums, and cafes.
  - 🔋 **Low battery**: Reroutes to spots with power outlets and relaxed seating.
  - ⏱️ **Running late**: Recalibrates remaining timing buffers automatically.
  - 🥪 **Hungry now**: Finds immediate counter dining with zero reservation hassle.
  - 👥 **Livelier spot**: Shifts toward social tea counters and communal bookshops.
  - 🌙 **Wrap up early**: Replaces final stops with low-effort takeaway dinner near your lodging.
- **Completed Stop Protection**: Morning stops marked as done remain **100% frozen**.

### 4. Single-Block Swap (`SwapBottomSheet`)
- Swap any stop individually with verified alternatives in the same neighborhood. Flagging a stop as closed permanently excludes it for the session.

---

## 🛠️ Tech Stack

- **Framework**: React 18, TypeScript, Vite 5
- **Styling**: Tailwind CSS with custom glassmorphism and kinetic tokens
- **Icons**: `lucide-react`
- **Testing**: Vitest automated test suite (11/11 tests passing)
- **Local Persistence**: `localStorage` / `idb-keyval` with local-first offline caching

---

## 📦 Local Development

```bash
# Install dependencies
npm install

# Start local dev server
npm run dev

# Run Vitest test suite
npm test -- --run

# Build for production
npm run build
```
