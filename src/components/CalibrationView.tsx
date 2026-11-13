import React, { useState, useEffect } from 'react';
import { 
  MapPin, 
  Navigation, 
  ArrowRight, 
  ArrowLeft, 
  Check, 
  Sliders, 
  Sun, 
  Moon, 
  Compass, 
  Coffee, 
  Footprints 
} from 'lucide-react';
import { CITIES } from '../data/placesData';
import { CalibrationData, TravelerPreferences } from '../types/itinerary';
import { calculateCitySunset } from '../services/sunset';

interface CalibrationViewProps {
  preferences: TravelerPreferences;
  onOpenGuardrails: () => void;
  onBuildPlan: (calibration: Partial<CalibrationData>, isQuickDemo?: boolean) => void;
}

export const CalibrationView: React.FC<CalibrationViewProps> = ({
  preferences,
  onOpenGuardrails,
  onBuildPlan
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedCityId, setSelectedCityId] = useState('jaipur');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsNotice, setGpsNotice] = useState<string | null>(null);

  const [energy, setEnergy] = useState<'gentle' | 'balanced' | 'active'>('balanced');
  const [afterDark, setAfterDark] = useState<'before_dark' | 'well_lit' | 'anywhere'>(preferences.afterDarkMode || 'well_lit');
  const [budget] = useState<'$' | '$$' | '$$$'>('$$');
  const [social] = useState<'solitude' | 'ambient' | 'social'>('ambient');

  const selectedCity = CITIES.find(c => c.id === selectedCityId) || CITIES[0];
  const sunsetTime = calculateCitySunset(selectedCityId);

  useEffect(() => {
    const currentHour = new Date().getHours();
    if (currentHour >= 12 && currentHour < 17) {
      setEnergy('gentle');
      setAfterDark('well_lit');
    } else if (currentHour >= 17) {
      setAfterDark('well_lit');
    }
  }, []);

  const handleGpsLocate = () => {
    setGpsLoading(true);
    setGpsNotice(null);

    if (!navigator.geolocation) {
      setGpsNotice("Location unavailable on this device.");
      setGpsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      () => {
        setGpsLoading(false);
        setGpsNotice("Location set.");
      },
      () => {
        setGpsLoading(false);
        setGpsNotice("Location access denied.");
      },
      { timeout: 6000 }
    );
  };

  const handleFinish = (isQuickDemo = false) => {
    onBuildPlan({
      cityId: selectedCityId,
      cityName: selectedCity.name,
      country: selectedCity.country,
      anchorCoords: selectedCity.coords,
      startTime: "09:30",
      endTime: "19:30",
      energy,
      budget,
      afterDark,
      social,
      sunsetTime
    }, isQuickDemo);
  };

  return (
    <div className="flex-1 flex flex-col px-5 pt-3 pb-36">
      {/* Top Header */}
      <header className="sticky top-0 -mx-5 px-5 py-3.5 bg-canvas/80 backdrop-blur-2xl border-b border-card-border/70 z-20 flex items-center justify-between mb-4">
        <span className="font-extrabold text-lg text-obsidian tracking-tight">PlanB</span>
        <button
          type="button"
          onClick={onOpenGuardrails}
          className="w-9 h-9 rounded-full bg-white/75 backdrop-blur-xl border border-white/80 flex items-center justify-center text-obsidian hover:bg-white/90 active:scale-95 transition-all shadow-sm"
          title="Preferences"
          aria-label="Preferences"
        >
          <Sliders className="w-4 h-4" />
        </button>
      </header>

      {/* Step Indicator */}
      <div className="mb-5">
        <div className="flex items-center justify-between text-olive-slate text-xs font-semibold mb-2">
          <span>
            {step === 1 && "Destination"}
            {step === 2 && "Pace"}
            {step === 3 && "Evening"}
          </span>
          <span className="text-obsidian font-bold">{step} of 3</span>
        </div>
        <div className="grid grid-cols-3 gap-2 w-full h-1.5">
          <button
            type="button"
            onClick={() => setStep(1)}
            aria-label="Step 1"
            className={`h-full rounded-full transition-all duration-300 ${
              step >= 1 ? 'bg-chartreuse shadow-[0_0_10px_rgba(184,238,48,0.5)]' : 'bg-card-border'
            }`}
          />
          <button
            type="button"
            onClick={() => setStep(2)}
            aria-label="Step 2"
            className={`h-full rounded-full transition-all duration-300 ${
              step >= 2 ? 'bg-chartreuse shadow-[0_0_10px_rgba(184,238,48,0.5)]' : 'bg-card-border'
            }`}
          />
          <button
            type="button"
            onClick={() => setStep(3)}
            aria-label="Step 3"
            className={`h-full rounded-full transition-all duration-300 ${
              step >= 3 ? 'bg-chartreuse shadow-[0_0_10px_rgba(184,238,48,0.5)]' : 'bg-card-border'
            }`}
          />
        </div>
      </div>

      {/* QUESTION 1: DESTINATION */}
      {step === 1 && (
        <section className="flex-1 flex flex-col animate-fade-in">
          <h1 className="font-bold text-xl text-obsidian leading-snug tracking-tight mb-4">
            Where are you heading?
          </h1>

          {/* GPS Glass Button */}
          <div className="mb-3.5">
            <button
              type="button"
              onClick={handleGpsLocate}
              disabled={gpsLoading}
              className="w-full py-2.5 px-3.5 rounded-2xl bg-white/70 backdrop-blur-xl border border-white/80 shadow-glass-card flex items-center justify-between hover:bg-white/85 active:scale-[0.99] transition-all text-left"
            >
              <div className="flex items-center gap-2.5">
                <Navigation className={`w-4 h-4 text-spruce ${gpsLoading ? 'animate-spin' : ''}`} />
                <span className="text-xs font-semibold text-obsidian">
                  {gpsLoading ? 'Locating...' : 'Use current location'}
                </span>
              </div>
              <span className="text-[11px] font-bold text-spruce">GPS</span>
            </button>
            {gpsNotice && (
              <p className="text-[11px] text-olive-slate px-2 mt-1 leading-snug">{gpsNotice}</p>
            )}
          </div>

          {/* City Selection Glass Cards */}
          <div className="space-y-2 flex-1" role="radiogroup" aria-label="City selection">
            {CITIES.map((city) => {
              const isSelected = selectedCityId === city.id;
              return (
                <div
                  key={city.id}
                  onClick={() => setSelectedCityId(city.id)}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                  className={`p-3.5 rounded-2xl cursor-pointer transition-all duration-200 border flex items-center justify-between ${
                    isSelected
                      ? 'bg-white/90 backdrop-blur-2xl border-chartreuse/80 ring-2 ring-chartreuse/40 shadow-[0_8px_24px_rgba(184,238,48,0.22)]'
                      : 'bg-white/65 backdrop-blur-xl border-white/80 hover:bg-white/85 shadow-glass-card'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-white/80 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/80 shadow-xs">
                      <MapPin className="w-4 h-4 text-spruce" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-obsidian">{city.name}</span>
                        <span className="text-[10px] text-olive-slate font-medium">{city.country}</span>
                      </div>
                      <p className="text-xs text-olive-slate truncate">{city.tagline}</p>
                    </div>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                      isSelected ? 'bg-chartreuse text-obsidian shadow-xs' : 'bg-white/60 text-transparent'
                    }`}
                  >
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Navigation CTA */}
          <div className="pt-5 pb-8 mt-auto">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="w-full h-12 rounded-2xl bg-gradient-to-r from-chartreuse/95 to-[#A3D70F]/90 backdrop-blur-xl border border-white/60 text-obsidian font-extrabold text-sm flex items-center justify-center gap-2 shadow-glass-cta active:scale-98 hover:shadow-[0_10px_28px_rgba(184,238,48,0.45)] transition-all"
            >
              <span>Next</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedCityId('jaipur');
                handleFinish(true);
              }}
              className="w-full text-center mt-3 py-1 text-xs text-olive-slate hover:text-obsidian transition-colors underline decoration-dotted"
            >
              Preview Jaipur sample day
            </button>
          </div>
        </section>
      )}

      {/* QUESTION 2: PACE */}
      {step === 2 && (
        <section className="flex-1 flex flex-col animate-fade-in">
          <h1 className="font-bold text-xl text-obsidian leading-snug tracking-tight mb-4">
            What's your pace today?
          </h1>

          <div className="space-y-2.5 flex-1" role="radiogroup" aria-label="Pace selection">
            {/* Relaxed */}
            <div
              onClick={() => setEnergy('gentle')}
              role="radio"
              aria-checked={energy === 'gentle'}
              tabIndex={0}
              className={`p-4 rounded-2xl cursor-pointer transition-all duration-200 border flex items-start justify-between ${
                energy === 'gentle'
                  ? 'bg-white/90 backdrop-blur-2xl border-chartreuse/80 ring-2 ring-chartreuse/40 shadow-[0_8px_24px_rgba(184,238,48,0.22)]'
                  : 'bg-white/65 backdrop-blur-xl border-white/80 hover:bg-white/85 shadow-glass-card'
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white/80 backdrop-blur-md flex items-center justify-center text-spruce shrink-0 mt-0.5 border border-white/80">
                  <Coffee className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-obsidian">Relaxed</h3>
                  <p className="text-xs text-olive-slate mt-0.5">Short walks, quiet cafes, and time to sit.</p>
                </div>
              </div>
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                  energy === 'gentle' ? 'bg-chartreuse text-obsidian shadow-xs' : 'bg-white/60 text-transparent'
                }`}
              >
                <Check className="w-3 h-3 stroke-[3]" />
              </div>
            </div>

            {/* Moderate */}
            <div
              onClick={() => setEnergy('balanced')}
              role="radio"
              aria-checked={energy === 'balanced'}
              tabIndex={0}
              className={`p-4 rounded-2xl cursor-pointer transition-all duration-200 border flex items-start justify-between ${
                energy === 'balanced'
                  ? 'bg-white/90 backdrop-blur-2xl border-chartreuse/80 ring-2 ring-chartreuse/40 shadow-[0_8px_24px_rgba(184,238,48,0.22)]'
                  : 'bg-white/65 backdrop-blur-xl border-white/80 hover:bg-white/85 shadow-glass-card'
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white/80 backdrop-blur-md flex items-center justify-center text-spruce shrink-0 mt-0.5 border border-white/80">
                  <Compass className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-obsidian">Moderate</h3>
                  <p className="text-xs text-olive-slate mt-0.5">Steady walking through central neighborhoods and sights.</p>
                </div>
              </div>
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                  energy === 'balanced' ? 'bg-chartreuse text-obsidian shadow-xs' : 'bg-white/60 text-transparent'
                }`}
              >
                <Check className="w-3 h-3 stroke-[3]" />
              </div>
            </div>

            {/* Active */}
            <div
              onClick={() => setEnergy('active')}
              role="radio"
              aria-checked={energy === 'active'}
              tabIndex={0}
              className={`p-4 rounded-2xl cursor-pointer transition-all duration-200 border flex items-start justify-between ${
                energy === 'active'
                  ? 'bg-white/90 backdrop-blur-2xl border-chartreuse/80 ring-2 ring-chartreuse/40 shadow-[0_8px_24px_rgba(184,238,48,0.22)]'
                  : 'bg-white/65 backdrop-blur-xl border-white/80 hover:bg-white/85 shadow-glass-card'
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white/80 backdrop-blur-md flex items-center justify-center text-spruce shrink-0 mt-0.5 border border-white/80">
                  <Footprints className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-obsidian">Active</h3>
                  <p className="text-xs text-olive-slate mt-0.5">Longer distances, viewpoints, and varied neighborhoods.</p>
                </div>
              </div>
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                  energy === 'active' ? 'bg-chartreuse text-obsidian shadow-xs' : 'bg-white/60 text-transparent'
                }`}
              >
                <Check className="w-3 h-3 stroke-[3]" />
              </div>
            </div>
          </div>

          {/* Navigation CTAs */}
          <div className="pt-5 pb-8 mt-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="h-12 px-4 rounded-2xl bg-white/70 backdrop-blur-xl border border-white/80 text-obsidian font-bold text-sm flex items-center justify-center gap-1 active:scale-95 transition-all shadow-sm hover:bg-white/90"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="flex-1 h-12 rounded-2xl bg-gradient-to-r from-chartreuse/95 to-[#A3D70F]/90 backdrop-blur-xl border border-white/60 text-obsidian font-extrabold text-sm flex items-center justify-center gap-2 shadow-glass-cta active:scale-98 hover:shadow-[0_10px_28px_rgba(184,238,48,0.45)] transition-all"
            >
              <span>Next</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}

      {/* QUESTION 3: EVENING */}
      {step === 3 && (
        <section className="flex-1 flex flex-col animate-fade-in">
          <div className="mb-4">
            <h1 className="font-bold text-xl text-obsidian leading-snug tracking-tight">
              Evening preference
            </h1>
            <p className="text-xs text-olive-slate mt-0.5">
              Sunset in {selectedCity.name} is at {sunsetTime}.
            </p>
          </div>

          <div className="space-y-2.5 flex-1" role="radiogroup" aria-label="Evening preference selection">
            {/* Before sunset */}
            <div
              onClick={() => setAfterDark('before_dark')}
              role="radio"
              aria-checked={afterDark === 'before_dark'}
              tabIndex={0}
              className={`p-4 rounded-2xl cursor-pointer transition-all duration-200 border flex items-start justify-between ${
                afterDark === 'before_dark'
                  ? 'bg-white/90 backdrop-blur-2xl border-chartreuse/80 ring-2 ring-chartreuse/40 shadow-[0_8px_24px_rgba(184,238,48,0.22)]'
                  : 'bg-white/65 backdrop-blur-xl border-white/80 hover:bg-white/85 shadow-glass-card'
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white/80 backdrop-blur-md flex items-center justify-center text-spruce shrink-0 mt-0.5 border border-white/80">
                  <Sun className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-obsidian">Finish before dark</h3>
                  <p className="text-xs text-olive-slate mt-0.5">All stops wrap up before sunset.</p>
                </div>
              </div>
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                  afterDark === 'before_dark' ? 'bg-chartreuse text-obsidian shadow-xs' : 'bg-white/60 text-transparent'
                }`}
              >
                <Check className="w-3 h-3 stroke-[3]" />
              </div>
            </div>

            {/* Well-lit */}
            <div
              onClick={() => setAfterDark('well_lit')}
              role="radio"
              aria-checked={afterDark === 'well_lit'}
              tabIndex={0}
              className={`p-4 rounded-2xl cursor-pointer transition-all duration-200 border flex items-start justify-between ${
                afterDark === 'well_lit'
                  ? 'bg-white/90 backdrop-blur-2xl border-chartreuse/80 ring-2 ring-chartreuse/40 shadow-[0_8px_24px_rgba(184,238,48,0.22)]'
                  : 'bg-white/65 backdrop-blur-xl border-white/80 hover:bg-white/85 shadow-glass-card'
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white/80 backdrop-blur-md flex items-center justify-center text-spruce shrink-0 mt-0.5 border border-white/80">
                  <Compass className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-obsidian">Main streets only</h3>
                  <p className="text-xs text-olive-slate mt-0.5">Busy avenues and lively squares after dark.</p>
                </div>
              </div>
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                  afterDark === 'well_lit' ? 'bg-chartreuse text-obsidian shadow-xs' : 'bg-white/60 text-transparent'
                }`}
              >
                <Check className="w-3 h-3 stroke-[3]" />
              </div>
            </div>

            {/* Late */}
            <div
              onClick={() => setAfterDark('anywhere')}
              role="radio"
              aria-checked={afterDark === 'anywhere'}
              tabIndex={0}
              className={`p-4 rounded-2xl cursor-pointer transition-all duration-200 border flex items-start justify-between ${
                afterDark === 'anywhere'
                  ? 'bg-white/90 backdrop-blur-2xl border-chartreuse/80 ring-2 ring-chartreuse/40 shadow-[0_8px_24px_rgba(184,238,48,0.22)]'
                  : 'bg-white/65 backdrop-blur-xl border-white/80 hover:bg-white/85 shadow-glass-card'
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white/80 backdrop-blur-md flex items-center justify-center text-spruce shrink-0 mt-0.5 border border-white/80">
                  <Moon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-obsidian">No preference</h3>
                  <p className="text-xs text-olive-slate mt-0.5">Comfortable with evening markets and late dining.</p>
                </div>
              </div>
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                  afterDark === 'anywhere' ? 'bg-chartreuse text-obsidian shadow-xs' : 'bg-white/60 text-transparent'
                }`}
              >
                <Check className="w-3 h-3 stroke-[3]" />
              </div>
            </div>
          </div>

          {/* Navigation CTAs */}
          <div className="pt-5 pb-8 mt-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="h-12 px-4 rounded-2xl bg-white/70 backdrop-blur-xl border border-white/80 text-obsidian font-bold text-sm flex items-center justify-center gap-1 active:scale-95 transition-all shadow-sm hover:bg-white/90"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <button
              type="button"
              onClick={() => handleFinish(false)}
              className="flex-1 h-12 rounded-2xl bg-gradient-to-r from-chartreuse/95 to-[#A3D70F]/90 backdrop-blur-xl border border-white/60 text-obsidian font-extrabold text-sm flex items-center justify-center gap-2 shadow-glass-cta active:scale-98 hover:shadow-[0_10px_28px_rgba(184,238,48,0.45)] transition-all"
            >
              <span>Create Plan</span>
            </button>
          </div>
        </section>
      )}
    </div>
  );
};
