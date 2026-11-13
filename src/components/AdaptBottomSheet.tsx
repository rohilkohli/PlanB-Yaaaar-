import React, { useState } from 'react';
import { CloudRain, Battery, Clock, Utensils, Users, Moon, Lock, Edit3, Loader2, CloudOff } from 'lucide-react';
import type { DayPlan } from '../types/itinerary';
import { BottomSheet, PrimaryButton } from './ui';
import { OFFLINE_MESSAGE } from './OfflineBadge';

export interface AdaptSubmit {
  scenarios: string[];
  note: string;
  socialShift?: 'quieter' | 'livelier';
  useLocation: boolean;
}

interface Props {
  currentPlan: DayPlan;
  isOffline: boolean;
  busy: boolean;
  error?: string | null;
  rainLikely?: boolean;
  onAdapt: (r: AdaptSubmit) => void;
  onClose: () => void;
}

const SCENARIOS = [
  { id: 'running_late', label: 'Running late', icon: Clock },
  { id: 'low_battery', label: 'Low battery', icon: Battery },
  { id: 'weather_turned', label: 'Weather turned', icon: CloudRain },
  { id: 'hungry_now', label: 'Hungry now', icon: Utensils },
  { id: 'shift_social', label: 'Shift social', icon: Users },
  { id: 'early_night', label: 'Early night', icon: Moon }
] as const;

export const AdaptBottomSheet: React.FC<Props> = ({ currentPlan, isOffline, busy, error, rainLikely, onAdapt, onClose }) => {
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [socialShift, setSocialShift] = useState<'quieter' | 'livelier'>('quieter');
  const [useLocation, setUseLocation] = useState(false);

  const done = currentPlan.blocks.filter(b => b.status === 'completed').length;
  const toggle = (id: string) => setSelected(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  const canSubmit = !isOffline && !busy && (selected.length > 0 || note.trim().length > 0);

  return (
    <BottomSheet title="What changed?" subtitle="Reshape the rest of today. Finished stops stay as they are." onClose={onClose}>
      {isOffline && (
        <div role="alert" className="mb-3 p-3 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex gap-2">
          <CloudOff className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <p>{OFFLINE_MESSAGE.replace('Offline mode — your plan and addresses are saved. Reconnect to adapt.', 'You’re offline — reconnect to recalculate new stops. Your current plan is saved below.')}</p>
        </div>
      )}

      {rainLikely && !selected.includes('weather_turned') && !isOffline && (
        <button type="button" onClick={() => toggle('weather_turned')} className="mb-3 w-full min-h-[44px] px-3 py-2 rounded-2xl bg-sky-50 border border-sky-200 text-sky-950 text-xs font-semibold text-left flex items-center gap-2">
          <CloudRain className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Rain looks likely soon. Tap to choose “Weather turned”.</span>
        </button>
      )}

      <div className="grid grid-cols-2 gap-2 mb-3" role="group" aria-label="What changed">
        {SCENARIOS.map(s => {
          const on = selected.includes(s.id);
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={on}
              disabled={isOffline}
              onClick={() => toggle(s.id)}
              className={`min-h-[52px] px-3 py-2 rounded-2xl transition-all text-left active:scale-[0.98] flex items-center gap-2 disabled:opacity-50 ${
                on ? 'bg-obsidian text-white shadow-sm' : 'bg-white/80 text-obsidian border border-white/80 hover:bg-white shadow-2xs'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${on ? 'text-chartreuse' : 'text-spruce'}`} aria-hidden="true" />
              <span className="text-xs font-semibold">{s.label}</span>
            </button>
          );
        })}
      </div>

      {selected.includes('shift_social') && (
        <div role="radiogroup" aria-label="Shift social direction" className="grid grid-cols-2 gap-2 mb-3">
          {(['quieter', 'livelier'] as const).map(v => (
            <button key={v} type="button" role="radio" aria-checked={socialShift === v} onClick={() => setSocialShift(v)}
              className={`min-h-[44px] rounded-2xl text-xs font-bold border ${socialShift === v ? 'bg-white border-chartreuse ring-2 ring-chartreuse/40' : 'bg-white/60 border-white/80'}`}>
              {v === 'quieter' ? 'Something quieter' : 'Something livelier'}
            </button>
          ))}
        </div>
      )}

      {done > 0 && (
        <div className="mb-3 px-3.5 py-2.5 rounded-2xl bg-white/70 border border-white/80 flex items-center gap-2 text-xs text-olive-slate">
          <Lock className="w-3.5 h-3.5 text-spruce shrink-0" aria-hidden="true" />
          <span>{done} finished stop{done > 1 ? 's' : ''} will stay unchanged.</span>
        </div>
      )}

      <label htmlFor="adapt-note" className="sr-only">Optional note</label>
      <div className="relative mb-3">
        <Edit3 className="w-3.5 h-3.5 text-olive-slate absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
        <input
          id="adapt-note" type="text" maxLength={140} value={note} disabled={isOffline}
          onChange={e => setNote(e.target.value)}
          placeholder="Optional note (e.g. a coffee craving)"
          className="w-full min-h-[48px] pl-9 pr-3.5 rounded-2xl bg-white/80 border border-white/80 text-sm text-obsidian placeholder-olive-slate/70 focus:outline-none focus:ring-2 focus:ring-chartreuse shadow-2xs"
        />
      </div>

      <label className="mb-4 min-h-[44px] flex items-center gap-2.5 text-xs text-olive-slate">
        <input type="checkbox" checked={useLocation} disabled={isOffline} onChange={e => setUseLocation(e.target.checked)} className="w-5 h-5 accent-[#4C6700]" />
        <span>Use my current location for this update (once, not stored)</span>
      </label>

      {error && <p role="alert" className="mb-3 text-xs font-semibold text-red-700">{error}</p>}

      <PrimaryButton disabled={!canSubmit} onClick={() => onAdapt({ scenarios: selected, note: note.trim(), socialShift, useLocation })} className="w-full">
        {busy ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /><span>Reshaping…</span></> : <span>Reshape rest of day</span>}
      </PrimaryButton>
    </BottomSheet>
  );
};
