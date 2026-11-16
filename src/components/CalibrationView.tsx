import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Coffee, Compass, Footprints, Moon, Navigation, Search, Sliders, Sun } from 'lucide-react';
import { CITIES } from '../data/placesData';
import type { CalibrationData, TravelerPreferences } from '../types/itinerary';
import type { CalibrationInput } from '../core/calibration';
import { nearestCity } from '../core/cities';
import { priceRank } from '../core/planner';
import { addDays, minutesToHHMM } from '../core/time';
import { nowIn, testClockMinutes } from '../core/clock';
import { sunsetLocalMinutes } from '../core/sunset';
import { fetchSuggestions } from '../services/planService';
import { track } from '../services/analytics';
import { GlassButton, PrimaryButton, RadioGroup } from './ui';
import { LegalLinks } from '../pages/LegalPages';

export interface BuildMeta { demo?: boolean; usedGps?: boolean }

interface Props {
  preferences: TravelerPreferences;
  onOpenGuardrails: () => void;
  onBuildPlan: (input: CalibrationInput, meta: BuildMeta) => void;
  serverError?: string | null;
  busy?: boolean;
  /** Carry the previous plan's answers over (used by "Plan tomorrow"). */
  prefill?: { cityId?: string; cityName: string; energy: CalibrationData['energy']; budget: string; afterDark: CalibrationData['afterDark']; social: CalibrationData['social'] } | null;
}

/** Smart defaults from the device clock (PRD FR-002: pre-fill so one tap builds a day). */
function defaultWindow(timeZone?: string, tomorrow = false) {
  if (tomorrow) return { start: '09:30', end: '19:30' };
  const d = new Date();
  // Use the DESTINATION's local time when known (planning Jaipur from London must not use London's clock).
  const mins = timeZone ? nowIn(timeZone).minutes : testClockMinutes() ?? d.getHours() * 60 + d.getMinutes();
  if (mins >= 6 * 60 && mins <= 21 * 60 && mins > 9 * 60 + 30) {
    const start = Math.ceil((mins + 15) / 30) * 30;
    return { start: minutesToHHMM(start), end: start >= 17 * 60 ? '22:00' : '19:30' };
  }
  return { start: '09:30', end: '19:30' };
}

export const CalibrationView: React.FC<Props> = ({ preferences, onOpenGuardrails, onBuildPlan, serverError, busy, prefill }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [query, setQuery] = useState(prefill?.cityName ?? '');
  const [cityId, setCityId] = useState<string | undefined>(prefill?.cityId && CITIES.some(c => c.id === prefill.cityId) ? prefill.cityId : undefined);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | undefined>();
  const [usedGps, setUsedGps] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsNotice, setGpsNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Array<{ text: string; cityId?: string }>>([]);
  const [dayOffset, setDayOffset] = useState<0 | 1>(() => (new URLSearchParams(window.location.search).has('tomorrow') ? 1 : 0));
  const defaults = useRef(defaultWindow(undefined, dayOffset === 1));
  const [startTime, setStartTime] = useState(defaults.current.start);
  const [endTime, setEndTime] = useState(defaults.current.end);
  const timesTouched = useRef(false);
  const [energy, setEnergy] = useState<CalibrationData['energy']>(() => prefill?.energy ?? (Math.floor((testClockMinutes() ?? new Date().getHours() * 60) / 60) >= 12 ? 'gentle' : 'balanced'));
  const [budget, setBudget] = useState<'₹' | '₹₹' | '₹₹₹'>(() => (prefill ? (['₹', '₹₹', '₹₹₹'][priceRank(prefill.budget) - 1] as '₹' | '₹₹' | '₹₹₹') : '₹₹'));
  const [afterDark, setAfterDark] = useState<CalibrationData['afterDark']>(prefill?.afterDark ?? (preferences.afterDarkMode || 'well_lit'));
  const [social, setSocial] = useState<CalibrationData['social']>(prefill?.social ?? 'ambient');
  const inputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const city = CITIES.find(c => c.id === cityId) ?? (coords ? nearestCity(coords, 40) : null) ?? undefined;
  const sunset = city
    ? sunsetLocalMinutes(city.coords.lat, city.coords.lng, addDays(nowIn(city.timezone).date, dayOffset), city.timezone)
    : null;

  // Re-derive the default window from the destination's clock until the traveler edits it.
  useEffect(() => {
    if (timesTouched.current) return;
    const w = defaultWindow(city?.timezone, dayOffset === 1);
    setStartTime(w.start); setEndTime(w.end);
  }, [city?.timezone, dayOffset]);

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    headingRef.current?.focus();
  }, [step]);

  // Autocomplete (debounced)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || (city && q.toLowerCase().startsWith(city.name.toLowerCase()))) { setSuggestions([]); return; }
    const t = setTimeout(async () => setSuggestions((await fetchSuggestions(q)).slice(0, 5)), 250);
    return () => clearTimeout(t);
  }, [query, city]);

  const touched = () => track('calibration_started', { entry_source: 'manual', used_gps: usedGps });

  const handleGps = () => {
    touched();
    setGpsLoading(true);
    setGpsNotice(null);
    if (!navigator.geolocation) {
      setGpsLoading(false);
      setGpsNotice('Location access is off — type your city or neighborhood to start.');
      inputRef.current?.focus();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const near = nearestCity(c, 40);
        setCoords(c);
        setUsedGps(true);
        setCityId(near?.id);
        setQuery(near ? near.name : '');
        setGpsLoading(false);
        setError(null);
        setGpsNotice(near ? `Using your location near ${near.name}.` : 'Using your current location.');
      },
      () => {
        setGpsLoading(false);
        setGpsNotice('Location access is off — type your city or neighborhood to start.');
        inputRef.current?.focus();
      },
      { timeout: 8000, maximumAge: 120_000 }
    );
  };

  const buildInput = (): CalibrationInput => ({
    cityId, query: query.trim() || undefined, coords, startTime, endTime, dayOffset, energy, budget, afterDark, social,
    locationLabel: city?.name ?? (query.trim() || undefined)
  });

  const validate = (): boolean => {
    if (!query.trim() && !cityId && !coords) {
      setStep(1);
      setError('Enter a city or neighborhood to build your day.');
      inputRef.current?.focus();
      return false;
    }
    setError(null);
    return true;
  };

  const build = () => { if (validate()) onBuildPlan(buildInput(), { usedGps }); };

  const pickCity = (id: string) => {
    touched();
    const c = CITIES.find(x => x.id === id);
    setCityId(id);
    setCoords(undefined);
    setUsedGps(false);
    setQuery(c?.name ?? '');
    setError(null);
    setSuggestions([]);
  };

  const shown = error || serverError;

  return (
    <main className="flex-1 flex flex-col px-5 pt-3 pb-36">
      <header className="sticky top-0 -mx-5 px-5 py-2 bg-canvas/80 backdrop-blur-2xl border-b border-card-border/70 z-20 flex items-center justify-between mb-4">
        <span className="font-extrabold text-lg text-obsidian tracking-tight">PlanB</span>
        <button
          type="button"
          onClick={onOpenGuardrails}
          className="w-11 h-11 rounded-full bg-white/75 backdrop-blur-xl border border-white/80 flex items-center justify-center text-obsidian hover:bg-white/90 active:scale-95 transition-all shadow-sm"
          aria-label="Preferences and guardrails"
        >
          <Sliders className="w-4 h-4" />
        </button>
      </header>

      <div className="mb-5">
        <div className="flex items-center justify-between text-olive-slate text-xs font-semibold mb-2">
          <span>{step === 1 ? 'Where & when' : step === 2 ? 'Pace & budget' : 'Evening & company'}</span>
          <span className="text-obsidian font-bold">{step} of 3</span>
        </div>
        <div className="grid grid-cols-3 gap-2 w-full" role="group" aria-label="Question progress">
          {([1, 2, 3] as const).map(n => (
            <button
              key={n}
              type="button"
              onClick={() => (n === 1 || validate()) && setStep(n)}
              aria-label={`Question ${n}`}
              aria-current={step === n ? 'step' : undefined}
              className="h-6 flex items-center"
            >
              <span className={`block w-full h-1.5 rounded-full transition-all duration-300 ${step >= n ? 'bg-chartreuse shadow-[0_0_10px_rgba(184,238,48,0.5)]' : 'bg-card-border'}`} />
            </button>
          ))}
        </div>
      </div>

      {step === 1 && (
        <section className="flex-1 flex flex-col animate-fade-in" aria-labelledby="q1">
          <h1 id="q1" ref={headingRef} tabIndex={-1} className="font-bold text-xl text-obsidian leading-snug tracking-tight mb-4 outline-none">
            Where are you heading?
          </h1>

          <div className="relative mb-3">
            <label htmlFor="city-input" className="sr-only">City or neighborhood</label>
            <Search className="w-4 h-4 text-olive-slate absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
            <input
              id="city-input"
              ref={inputRef}
              type="text"
              inputMode="search"
              autoComplete="off"
              value={query}
              onChange={e => { touched(); setQuery(e.target.value); setCityId(undefined); setCoords(undefined); setUsedGps(false); setError(null); }}
              placeholder="City or neighborhood"
              aria-invalid={!!shown}
              aria-describedby={shown ? 'city-error' : undefined}
              aria-autocomplete="list"
              aria-controls={suggestions.length > 0 ? 'city-suggestions' : undefined}
              className={`w-full min-h-[48px] pl-10 pr-3.5 rounded-2xl bg-white/80 backdrop-blur-xl border text-sm text-obsidian placeholder-olive-slate/70 focus:outline-none focus:ring-2 focus:ring-chartreuse shadow-glass-card ${shown ? 'border-red-600' : 'border-white/80'}`}
            />
            {suggestions.length > 0 && (
              <ul id="city-suggestions" role="listbox" aria-label="Suggestions" className="absolute z-30 left-0 right-0 mt-1 rounded-2xl bg-white/95 backdrop-blur-xl border border-card-border shadow-float overflow-hidden">
                {suggestions.map(s => (
                  <li key={s.text} role="option" aria-selected={false}>
                    <button
                      type="button"
                      className="w-full min-h-[44px] px-4 text-left text-sm text-obsidian hover:bg-recessed active:bg-recessed-dark"
                      onClick={() => {
                        if (s.cityId) pickCity(s.cityId);
                        else { setQuery(s.text); setCityId(undefined); setSuggestions([]); setError(null); }
                      }}
                    >
                      {s.text}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {shown && <p id="city-error" role="alert" className="text-xs font-semibold text-red-700 px-1 -mt-1.5 mb-3">{shown}</p>}

          <div className="mb-4">
            <button
              type="button"
              onClick={handleGps}
              disabled={gpsLoading}
              className="w-full min-h-[48px] px-3.5 rounded-2xl bg-white/70 backdrop-blur-xl border border-white/80 shadow-glass-card flex items-center justify-between hover:bg-white/85 active:scale-[0.99] transition-all text-left"
            >
              <span className="flex items-center gap-2.5">
                <Navigation className={`w-4 h-4 text-spruce ${gpsLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
                <span className="text-sm font-semibold text-obsidian">{gpsLoading ? 'Locating…' : 'Use my location'}</span>
              </span>
              <span className="text-[11px] font-bold text-spruce">Once, not tracked</span>
            </button>
            <p className="text-xs text-olive-slate px-2 mt-1.5 leading-snug" aria-live="polite">{gpsNotice}</p>
          </div>

          <fieldset className="mb-4">
            <legend className="text-xs font-bold text-obsidian mb-2">Your day</legend>
            <div className="mb-2.5">
              <RadioGroup
                label="Which day"
                variant="segmented"
                value={String(dayOffset) as '0' | '1'}
                onChange={v => { touched(); setDayOffset(v === '1' ? 1 : 0); }}
                options={[{ value: '0', label: 'Today' }, { value: '1', label: 'Tomorrow' }]}
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { id: 'start', label: 'Start', value: startTime, set: setStartTime },
                { id: 'end', label: 'Finish by', value: endTime, set: setEndTime }
              ].map(f => (
                <label key={f.id} htmlFor={`t-${f.id}`} className="block">
                  <span className="text-[11px] font-semibold text-olive-slate">{f.label}</span>
                  <input
                    id={`t-${f.id}`}
                    type="time"
                    value={f.value}
                    onChange={e => { touched(); timesTouched.current = true; f.set(e.target.value || f.value); }}
                    className="mt-1 w-full min-h-[48px] px-3 rounded-2xl bg-white/80 border border-white/80 text-sm font-semibold text-obsidian focus:outline-none focus:ring-2 focus:ring-chartreuse shadow-glass-card"
                  />
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mb-2">
            <RadioGroup
              label="Popular cities"
              value={(cityId ?? '') as string}
              options={CITIES.map(c => ({ value: c.id, label: c.name, description: c.tagline }))}
              onChange={pickCity}
            />
          </div>

          <div className="pt-5 mt-auto">
            <PrimaryButton onClick={() => (validate() ? setStep(2) : undefined)} className="w-full">
              <span>Next</span><ArrowRight className="w-4 h-4" aria-hidden="true" />
            </PrimaryButton>
            <div className="flex items-center justify-center gap-1 mt-2">
              <button type="button" disabled={busy} onClick={build} className="min-h-[44px] px-3 text-xs font-semibold text-olive-slate underline decoration-dotted underline-offset-4">
                Skip — build with defaults
              </button>
              <span className="text-card-border" aria-hidden="true">·</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => { track('calibration_started', { entry_source: 'sample', used_gps: false }); onBuildPlan({ cityId: 'jaipur', energy: 'balanced', budget: '₹₹', afterDark: 'well_lit', social: 'ambient' }, { demo: true }); }}
                className="min-h-[44px] px-3 text-xs font-semibold text-olive-slate underline decoration-dotted underline-offset-4"
              >
                See a sample day in Jaipur
              </button>
            </div>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="flex-1 flex flex-col animate-fade-in" aria-labelledby="q2">
          <h1 id="q2" ref={headingRef} tabIndex={-1} className="font-bold text-xl text-obsidian leading-snug tracking-tight mb-4 outline-none">
            What’s your pace today?
          </h1>
          <RadioGroup
            label="Energy and pace"
            value={energy}
            onChange={v => { touched(); setEnergy(v); }}
            options={[
              { value: 'gentle', label: 'Relaxed', description: 'Short walks, quiet cafés, time to sit.', icon: <Coffee className="w-4 h-4" /> },
              { value: 'balanced', label: 'Moderate', description: 'Steady walking through central neighborhoods.', icon: <Compass className="w-4 h-4" /> },
              { value: 'active', label: 'Active', description: 'Longer distances, viewpoints, more variety.', icon: <Footprints className="w-4 h-4" /> }
            ]}
          />
          <h2 className="font-bold text-sm text-obsidian mt-5 mb-2" id="budget-label">Budget per stop</h2>
          <RadioGroup
            label="Budget"
            variant="segmented"
            value={budget}
            onChange={v => { touched(); setBudget(v); }}
            options={[
              { value: '₹', label: '₹', description: 'Easy on the wallet' },
              { value: '₹₹', label: '₹₹', description: 'Mid-range' },
              { value: '₹₹₹', label: '₹₹₹', description: 'A treat' }
            ]}
          />
          <div className="pt-5 mt-auto flex items-center gap-2">
            <GlassButton onClick={() => setStep(1)} className="px-4"><ArrowLeft className="w-4 h-4" aria-hidden="true" /><span>Back</span></GlassButton>
            <PrimaryButton onClick={() => setStep(3)} className="flex-1"><span>Next</span><ArrowRight className="w-4 h-4" aria-hidden="true" /></PrimaryButton>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="flex-1 flex flex-col animate-fade-in" aria-labelledby="q3">
          <div className="mb-4">
            <h1 id="q3" ref={headingRef} tabIndex={-1} className="font-bold text-xl text-obsidian leading-snug tracking-tight outline-none">Evening preference</h1>
            {city && sunset !== null && (
              <p className="text-xs text-olive-slate mt-0.5">Sunset in {city.name} is around {new Date(2000, 0, 1, Math.floor(sunset / 60), sunset % 60).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</p>
            )}
          </div>
          <RadioGroup
            label="Evening preference"
            value={afterDark}
            onChange={v => { touched(); setAfterDark(v); }}
            options={[
              { value: 'before_dark', label: 'Finish before dark', description: 'Last stop ends at least 30 minutes before sunset.', icon: <Sun className="w-4 h-4" /> },
              { value: 'well_lit', label: 'Main streets only', description: 'Busy avenues and lively squares after dark.', icon: <Compass className="w-4 h-4" /> },
              { value: 'anywhere', label: 'No preference', description: 'Comfortable with evening markets and late dining.', icon: <Moon className="w-4 h-4" /> }
            ]}
          />
          <h2 className="font-bold text-sm text-obsidian mt-5 mb-2">Company today</h2>
          <RadioGroup
            label="Social appetite"
            variant="segmented"
            value={social}
            onChange={v => { touched(); setSocial(v); }}
            options={[
              { value: 'solitude', label: 'Quiet', description: 'Mostly alone' },
              { value: 'ambient', label: 'Ambient', description: 'Some buzz' },
              { value: 'social', label: 'Lively', description: 'Around people' }
            ]}
          />
          <div className="pt-5 mt-auto flex items-center gap-2">
            <GlassButton onClick={() => setStep(2)} className="px-4"><ArrowLeft className="w-4 h-4" aria-hidden="true" /><span>Back</span></GlassButton>
            <PrimaryButton onClick={build} disabled={busy} className="flex-1"><span>Build my day</span></PrimaryButton>
          </div>
        </section>
      )}
      <nav aria-label="Legal" className="mt-4 text-xs"><LegalLinks /></nav>
    </main>
  );
};
