import React, { useState } from 'react';
import { 
  X, 
  Check, 
  Sliders, 
  Trash2, 
  WifiOff
} from 'lucide-react';
import { TravelerPreferences } from '../types/itinerary';

interface GuardrailsModalProps {
  preferences: TravelerPreferences;
  isSimulatedOffline: boolean;
  onSave: (prefs: TravelerPreferences) => void;
  onToggleSimulateOffline: () => void;
  onResetAllData: () => void;
  onClose: () => void;
}

export const GuardrailsModal: React.FC<GuardrailsModalProps> = ({
  preferences,
  isSimulatedOffline,
  onSave,
  onToggleSimulateOffline,
  onResetAllData,
  onClose
}) => {
  const [mobility, setMobility] = useState(preferences.mobility || 'stairs_okay');
  const [maxStride, setMaxStride] = useState(preferences.maxStrideMinutes || 25);
  const [dietary, setDietary] = useState<string[]>(preferences.dietary || ['counter_preferred', 'no_reservations']);
  const [units, setUnits] = useState<'km' | 'mi'>(preferences.units || 'km');
  const [afterDark, setAfterDark] = useState<'before_dark' | 'well_lit' | 'anywhere'>(preferences.afterDarkMode || 'well_lit');

  const toggleDietary = (item: string) => {
    setDietary(prev =>
      prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]
    );
  };

  const handleSave = () => {
    onSave({
      mobility,
      maxStrideMinutes: maxStride,
      dietary,
      units,
      afterDarkMode: afterDark
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-obsidian-deep/40 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-canvas/90 backdrop-blur-2xl rounded-t-4xl sm:rounded-3xl max-h-[90vh] flex flex-col shadow-float border border-white/80 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-card-border/60 flex items-center justify-between bg-white/80 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/80 backdrop-blur-md border border-white/80 flex items-center justify-center text-obsidian">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-base text-obsidian">Preferences</h2>
              <p className="text-[11px] text-olive-slate">Saved on your device</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/70 backdrop-blur-md border border-white/80 flex items-center justify-center text-obsidian hover:bg-white/90 transition-colors shadow-2xs"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-5">
          {/* Walking & Mobility */}
          <div>
            <span className="text-xs font-bold text-obsidian block mb-2">Walking & Mobility</span>
            <div className="flex flex-wrap gap-2 mb-3">
              {[
                { id: 'stairs_okay', label: 'Stairs okay' },
                { id: 'avoid_hills', label: 'Avoid steep hills' },
                { id: 'transit_first', label: 'Prefer transit' }
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setMobility(opt.id as any)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    mobility === opt.id
                      ? 'bg-obsidian/90 backdrop-blur-md text-white shadow-xs'
                      : 'bg-white/70 backdrop-blur-md text-obsidian border border-white/80 hover:bg-white/90'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Max Walk */}
            <div className="bg-white/70 backdrop-blur-md rounded-2xl p-3 border border-white/80 shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-obsidian">Max walk between stops</span>
                <span className="text-xs font-bold text-spruce">{maxStride} min</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[15, 25, 40].map(stride => (
                  <button
                    key={stride}
                    type="button"
                    onClick={() => setMaxStride(stride as any)}
                    className={`py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      maxStride === stride
                        ? 'bg-gradient-to-r from-chartreuse/95 to-[#A3D70F]/90 backdrop-blur-md border border-white/60 text-obsidian font-bold shadow-xs'
                        : 'bg-white/60 backdrop-blur-md text-olive-slate border border-white/60 hover:bg-white/80'
                    }`}
                  >
                    {stride} min
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Dining Preferences */}
          <div>
            <span className="text-xs font-bold text-obsidian block mb-2">Dining Preferences</span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'counter_preferred', label: 'Counter seating' },
                { id: 'quiet_corner', label: 'Quiet corner tables' },
                { id: 'no_reservations', label: 'No reservations' },
                { id: 'vegetarian', label: 'Vegetarian friendly' }
              ].map(diet => {
                const isSelected = dietary.includes(diet.id);
                return (
                  <button
                    key={diet.id}
                    type="button"
                    onClick={() => toggleDietary(diet.id)}
                    className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between text-left transition-all ${
                      isSelected
                        ? 'bg-white/90 backdrop-blur-md border-chartreuse/80 ring-1 ring-chartreuse/40 text-obsidian shadow-2xs'
                        : 'bg-white/65 backdrop-blur-md border-white/80 text-olive-slate hover:text-obsidian'
                    }`}
                  >
                    <span className="truncate pr-1">{diet.label}</span>
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${isSelected ? 'bg-chartreuse text-obsidian' : 'bg-white/60 text-transparent'}`}>
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Evening */}
          <div>
            <span className="text-xs font-bold text-obsidian block mb-2">Evening Preference</span>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'before_dark', label: 'Before dark' },
                { id: 'well_lit', label: 'Main streets' },
                { id: 'anywhere', label: 'Anytime' }
              ].map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setAfterDark(item.id as any)}
                  className={`py-2 px-2 rounded-xl border text-xs font-semibold text-center transition-all ${
                    afterDark === item.id
                      ? 'bg-obsidian/90 backdrop-blur-md text-white border-obsidian shadow-xs'
                      : 'bg-white/70 backdrop-blur-md text-olive-slate border border-white/80 hover:bg-white/90'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Units */}
          <div>
            <span className="text-xs font-bold text-obsidian block mb-2">Units</span>
            <div className="inline-flex rounded-xl bg-white/70 backdrop-blur-md border border-white/80 p-1">
              <button
                type="button"
                onClick={() => setUnits('km')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  units === 'km' ? 'bg-chartreuse text-obsidian shadow-xs' : 'text-olive-slate'
                }`}
              >
                Kilometers (km)
              </button>
              <button
                type="button"
                onClick={() => setUnits('mi')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  units === 'mi' ? 'bg-chartreuse text-obsidian shadow-xs' : 'text-olive-slate'
                }`}
              >
                Miles (mi)
              </button>
            </div>
          </div>

          {/* Offline Mode Toggle */}
          <div className="bg-white/70 backdrop-blur-md rounded-2xl p-3.5 border border-white/80 flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2.5">
              <WifiOff className="w-4 h-4 text-olive-slate" />
              <div>
                <span className="text-xs font-bold text-obsidian block">Simulate offline mode</span>
                <span className="text-[11px] text-olive-slate">Test offline caching</span>
              </div>
            </div>
            <button
              type="button"
              onClick={onToggleSimulateOffline}
              className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                isSimulatedOffline ? 'bg-chartreuse' : 'bg-card-border'
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-white shadow-sm transform transition-transform ${
                  isSimulatedOffline ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Clear Data */}
          <div className="pt-2 border-t border-card-border/60">
            <button
              type="button"
              onClick={onResetAllData}
              className="w-full py-2.5 px-3 rounded-2xl border border-red-200/80 bg-red-50/50 backdrop-blur-sm text-red-600 hover:bg-red-50 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Reset all saved data</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-white/80 backdrop-blur-md border-t border-card-border/60 flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="h-11 px-4 rounded-xl bg-white/70 backdrop-blur-md border border-white/80 text-obsidian text-xs font-semibold hover:bg-white/90"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 h-11 rounded-xl bg-gradient-to-r from-chartreuse/95 to-[#A3D70F]/90 backdrop-blur-md border border-white/60 text-obsidian text-xs font-bold flex items-center justify-center gap-1 shadow-glass-cta active:scale-98 hover:shadow-[0_6px_20px_rgba(184,238,48,0.4)]"
          >
            Save Preferences
          </button>
        </div>
      </div>
    </div>
  );
};
