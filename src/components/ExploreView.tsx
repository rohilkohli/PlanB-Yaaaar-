import React, { useState } from 'react';
import { Sun, ArrowRight, Sparkles, Footprints, Coffee, Mountain, BookOpen, Utensils } from 'lucide-react';
import { CITIES, PLACES_DATABASE } from '../data/placesData';
import { sunsetFor } from '../core/calibration';
import { minutesToTimeString } from '../core/time';
import { CityData } from '../types/itinerary';

interface ExploreViewProps {
  onLoadCity: (city: CityData) => void;
  onBackToPlan: () => void;
}

export const ExploreView: React.FC<ExploreViewProps> = ({ onLoadCity, onBackToPlan }) => {
  const [selectedVibe, setSelectedVibe] = useState<string>('all');

  const vibes = [
    { id: 'all', label: 'All Destinations', icon: Sparkles },
    { id: 'coffee', label: 'Chai & Cafes', icon: Coffee },
    { id: 'scenic', label: 'Forts & Ghats', icon: Mountain },
    { id: 'quiet', label: 'Quiet Strolls', icon: BookOpen },
    { id: 'food', label: 'Local Bites', icon: Utensils }
  ];

  const VIBE_CATS: Record<string, string[]> = {
    coffee: ['cafe', 'bakery', 'dining'],
    scenic: ['viewpoint'],
    quiet: ['walk', 'culture'],
    food: ['dining', 'market', 'bakery']
  };
  const today = new Date().toISOString().slice(0, 10);
  const shownCities = CITIES.filter(c =>
    selectedVibe === 'all' || PLACES_DATABASE.some(v => v.cityId === c.id && VIBE_CATS[selectedVibe].includes(v.category))
  );

  return (
    <main className="flex-1 flex flex-col px-5 pt-3 pb-36 space-y-4">
      {/* Header */}
      <header className="sticky top-0 -mx-5 px-5 py-3.5 bg-canvas/80 backdrop-blur-2xl border-b border-card-border/70 z-20 flex items-center justify-between">
        <span className="font-extrabold text-lg text-obsidian tracking-tight">PlanB</span>
        <button
          type="button"
          onClick={onBackToPlan}
          className="text-xs font-semibold text-obsidian px-4 min-h-[44px] rounded-full bg-white/70 backdrop-blur-md border border-white/80 hover:bg-white/90 shadow-2xs transition-all active:scale-95"
        >
          Back to plan
        </button>
      </header>

      {/* Title */}
      <div>
        <h1 className="font-extrabold text-2xl text-obsidian tracking-tight">
          Explore India
        </h1>
        <p className="text-xs text-olive-slate mt-0.5">
          Curated walking days across India for solo wanderers.
        </p>
      </div>

      {/* Browse by Vibe Chips (Stitch Specification) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-5 px-5 no-scrollbar">
        {vibes.map(v => {
          const Icon = v.icon;
          const isActive = selectedVibe === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setSelectedVibe(v.id)}
              className={`shrink-0 h-8 px-3.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 ${
                isActive
                  ? 'bg-linear-to-r from-chartreuse/95 to-[#A3D70F]/90 text-obsidian font-bold shadow-2xs border border-white/60 ring-1 ring-chartreuse/50'
                  : 'bg-white/70 backdrop-blur-md text-olive-slate border border-white/80 hover:bg-white/90 shadow-2xs'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{v.label}</span>
            </button>
          );
        })}
      </div>

      {/* City Cards */}
      <div className="space-y-4">
        {shownCities.map(city => {
          const count = PLACES_DATABASE.filter(v => v.cityId === city.id).length;
          return (
          <article
            key={city.id}
            className="bg-white/75 backdrop-blur-xl rounded-3xl overflow-hidden border border-white/80 shadow-glass-card hover:shadow-[0_12px_36px_rgba(0,0,0,0.08)] transition-all"
          >
            <div className="relative h-44 w-full overflow-hidden">
              <img src={city.heroImage} alt="" className="w-full h-full object-cover" loading="lazy" />
              <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/25 to-transparent" />
              
              <div className="absolute top-3 right-3">
                <span className="px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-md text-white text-xs font-bold flex items-center gap-1 border border-white/30 shadow-2xs">
                  <Sun className="w-3 h-3 text-chartreuse" />
                  <span>Sunset {minutesToTimeString(sunsetFor(city, today))}</span>
                </span>
              </div>

              <div className="absolute bottom-3 left-4 right-4 text-white">
                <h3 className="font-extrabold text-xl tracking-tight leading-tight">{city.name}</h3>
                <p className="text-xs text-white/85 mt-0.5">{city.country} · {city.tagline}</p>
              </div>
            </div>

            {/* Route Stats & Solo Badges */}
            <div className="p-4 flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-2 py-1 px-2.5 rounded-2xl bg-white/60 backdrop-blur-md border border-white/70 text-center text-xs">
                <div>
                  <span className="text-xs uppercase font-bold text-olive-slate block">Walk</span>
                  <span className="font-bold text-obsidian flex items-center justify-center gap-1 mt-0.5">
                    <Footprints className="w-3 h-3 text-spruce" aria-hidden="true" />
                    On foot
                  </span>
                </div>
                <div className="border-x border-card-border/60">
                  <span className="text-xs uppercase font-bold text-olive-slate/80 block">Stops</span>
                  <span className="font-bold text-obsidian block mt-0.5">{count} places</span>
                </div>
                <div>
                  <span className="text-xs uppercase font-bold text-olive-slate block">Day</span>
                  <span className="font-bold text-obsidian block mt-0.5">3–4 stops</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-1 text-xs text-olive-slate font-medium">
                  <span className="px-2 py-0.5 rounded-full bg-white/70 border border-white/80">Curated</span>
                  
                </div>

                <button
                  type="button"
                  onClick={() => onLoadCity(city)}
                  className="min-h-[44px] px-4 rounded-full bg-linear-to-r from-chartreuse/95 to-[#A3D70F]/90 backdrop-blur-md border border-white/60 text-obsidian text-xs font-bold flex items-center gap-1.5 shadow-glass-cta active:scale-95 transition-transform hover:shadow-[0_6px_20px_rgba(184,238,48,0.4)]"
                >
                  <span>Start in {city.name}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </article>
          );
        })}
      </div>
    </main>
  );
};
