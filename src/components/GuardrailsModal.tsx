import React, { useState } from 'react';
import { Trash2, WifiOff, ShieldCheck } from 'lucide-react';
import type { TravelerPreferences } from '../types/itinerary';
import { BottomSheet, GlassButton, PrimaryButton, RadioGroup } from './ui';
import { LegalLinks } from '../pages/LegalPages';
import { t } from '../i18n';

interface Props {
  preferences: TravelerPreferences;
  lang: 'en' | 'hi';
  onLangChange: (l: 'en' | 'hi') => void;
  isSimulatedOffline: boolean;
  onSave: (prefs: TravelerPreferences) => void;
  onToggleSimulateOffline: () => void;
  onResetAllData: () => void;
  onClose: () => void;
}

const DIET = [
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'alcohol_free', label: 'Alcohol-free venues' },
  { id: 'counter_preferred', label: 'Counter seating' },
  { id: 'quiet_corner', label: 'Quiet corners' }
];

export const GuardrailsModal: React.FC<Props> = ({ preferences, lang, onLangChange, isSimulatedOffline, onSave, onToggleSimulateOffline, onResetAllData, onClose }) => {
  const [mobility, setMobility] = useState(preferences.mobility || 'stairs_okay');
  const [maxStride, setMaxStride] = useState<'15' | '25' | '40'>(String(preferences.maxStrideMinutes || 25) as '15' | '25' | '40');
  const [dietary, setDietary] = useState<string[]>(preferences.dietary || []);
  const [units, setUnits] = useState<'km' | 'mi'>(preferences.units || 'km');
  const [afterDark, setAfterDark] = useState(preferences.afterDarkMode || 'well_lit');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saved, setSaved] = useState(false);

  const toggle = (id: string) => setDietary(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));

  const save = () => {
    onSave({ mobility, maxStrideMinutes: Number(maxStride) as 15 | 25 | 40, dietary, units, afterDarkMode: afterDark });
    setSaved(true);
    setTimeout(onClose, 700);
  };

  return (
    <BottomSheet title={t('prefs.title')} subtitle="Saved on this device. Applied to every plan." onClose={onClose}>
      <div className="space-y-5">
        <section aria-labelledby="g-mob">
          <h3 id="g-mob" className="text-xs font-bold text-obsidian mb-2">Walking & mobility</h3>
          <RadioGroup
            label="Walking and mobility"
            variant="segmented"
            value={mobility}
            onChange={setMobility}
            options={[
              { value: 'stairs_okay', label: 'No limits' },
              { value: 'avoid_hills', label: 'Avoid hills' },
              { value: 'step_free', label: 'Step-free' },
              { value: 'transit_first', label: 'Short walks' }
            ]}
          />
          <h4 className="text-xs font-semibold text-olive-slate mt-3 mb-1.5">Longest walk between stops</h4>
          <RadioGroup
            label="Longest walk"
            variant="segmented"
            value={maxStride}
            onChange={setMaxStride}
            options={[{ value: '15', label: '15 min' }, { value: '25', label: '25 min' }, { value: '40', label: '40 min' }]}
          />
        </section>

        <section aria-labelledby="g-diet">
          <h3 id="g-diet" className="text-xs font-bold text-obsidian mb-2">Dining</h3>
          <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="g-diet">
            {DIET.map(d => {
              const on = dietary.includes(d.id);
              return (
                <button key={d.id} type="button" aria-pressed={on} onClick={() => toggle(d.id)}
                  className={`min-h-[48px] px-3 rounded-2xl border text-xs font-semibold text-left transition-all ${on ? 'bg-white border-chartreuse ring-2 ring-chartreuse/40 text-obsidian' : 'bg-white/65 border-white/80 text-olive-slate'}`}>
                  {d.label}
                </button>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="g-eve">
          <h3 id="g-eve" className="text-xs font-bold text-obsidian mb-2">Evening</h3>
          <RadioGroup
            label="Evening preference"
            variant="segmented"
            value={afterDark}
            onChange={setAfterDark}
            options={[{ value: 'before_dark', label: 'Before dark' }, { value: 'well_lit', label: 'Main streets' }, { value: 'anywhere', label: 'Anytime' }]}
          />
        </section>

        <section aria-labelledby="g-units">
          <h3 id="g-units" className="text-xs font-bold text-obsidian mb-2">Units</h3>
          <RadioGroup label="Distance units" variant="segmented" value={units} onChange={setUnits}
            options={[{ value: 'km', label: 'Kilometres' }, { value: 'mi', label: 'Miles' }]} />
        </section>

        <section aria-labelledby="g-lang">
          <h3 id="g-lang" className="text-xs font-bold text-obsidian mb-2">{t('prefs.language')}</h3>
          <RadioGroup label={t('prefs.language')} variant="segmented" value={lang} onChange={v => onLangChange(v)}
            options={[{ value: 'en', label: 'English' }, { value: 'hi', label: 'हिन्दी' }]} />
          <p className="text-[11px] text-olive-slate mt-1.5">Hindi covers the main screens. Venue descriptions remain in English for now.</p>
        </section>

        <section aria-label={t('emergency.title')} className="rounded-2xl bg-red-50 border border-red-200 p-3.5 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-red-900">{t('emergency.title')}</p>
            <p className="text-xs text-red-900/80">{t('emergency.note')}</p>
          </div>
          <a href="tel:112" className="min-h-[44px] min-w-[72px] px-4 rounded-full bg-red-700 text-white text-sm font-bold inline-flex items-center justify-center">112</a>
        </section>

        <section className="rounded-2xl bg-white/70 border border-white/80 p-3.5 flex gap-2.5 text-xs text-olive-slate">
          <ShieldCheck className="w-4 h-4 text-spruce shrink-0 mt-0.5" aria-hidden="true" />
          <p>No account, no tracking. Your plan and preferences stay on this device and are deleted after 14 days. Location is only used when you ask for it.</p>
        </section>

        <div className="rounded-2xl bg-white/70 border border-white/80 p-3.5 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2.5 min-w-0">
            <WifiOff className="w-4 h-4 text-olive-slate shrink-0" aria-hidden="true" />
            <span>
              <span id="sim-off" className="text-xs font-bold text-obsidian block">Simulate offline mode</span>
              <span className="text-[11px] text-olive-slate">Check how your saved plan behaves</span>
            </span>
          </span>
          <button type="button" role="switch" aria-checked={isSimulatedOffline} aria-labelledby="sim-off" onClick={onToggleSimulateOffline}
            className="w-14 h-11 flex items-center justify-center shrink-0">
            <span className={`w-11 h-6 rounded-full relative p-0.5 transition-colors ${isSimulatedOffline ? 'bg-chartreuse' : 'bg-card-border'}`}>
              <span className={`block w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${isSimulatedOffline ? 'translate-x-5' : ''}`} />
            </span>
          </button>
        </div>

        <div className="pt-1 border-t border-card-border/60">
          {!confirmDelete ? (
            <button type="button" onClick={() => setConfirmDelete(true)}
              className="w-full min-h-[48px] rounded-2xl border border-red-300 bg-red-50 text-red-800 text-xs font-bold flex items-center justify-center gap-1.5">
              <Trash2 className="w-4 h-4" aria-hidden="true" /><span>{t('prefs.reset')}</span>
            </button>
          ) : (
            <div role="alert" className="rounded-2xl border border-red-300 bg-red-50 p-3 space-y-2">
              <p className="text-xs text-red-900 font-semibold">Delete your saved plan and preferences from this device?</p>
              <div className="grid grid-cols-2 gap-2">
                <GlassButton onClick={() => setConfirmDelete(false)}>Keep</GlassButton>
                <button type="button" onClick={onResetAllData} className="min-h-[44px] rounded-2xl bg-red-700 text-white text-sm font-bold">Delete all</button>
              </div>
            </div>
          )}
        </div>

        <nav aria-label="Legal" className="text-xs"><LegalLinks /></nav>

        <div className="flex items-center gap-2.5 pt-1" aria-live="polite">
          <GlassButton onClick={onClose} className="px-4">Cancel</GlassButton>
          <PrimaryButton onClick={save} className="flex-1">{saved ? 'Saved on this device ✓' : t('prefs.save')}</PrimaryButton>
        </div>
      </div>
    </BottomSheet>
  );
};
