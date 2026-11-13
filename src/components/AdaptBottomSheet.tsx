import React, { useState } from 'react';
import { 
  X, 
  Check, 
  Edit3, 
  Lock 
} from 'lucide-react';
import { DayPlan } from '../types/itinerary';

interface AdaptBottomSheetProps {
  currentPlan: DayPlan;
  onAdapt: (selectedScenarios: string[], note: string) => void;
  onClose: () => void;
}

export const AdaptBottomSheet: React.FC<AdaptBottomSheetProps> = ({
  currentPlan,
  onAdapt,
  onClose
}) => {
  const [selectedScenarios, setSelectedScenarios] = useState<string[]>([]);
  const [note, setNote] = useState('');

  const completedBlocks = currentPlan.blocks.filter(b => b.status === 'completed');

  const scenarios = [
    { id: 'weather_turned', label: 'Rain / Cold', emoji: '🌧️' },
    { id: 'low_battery', label: 'Low battery', emoji: '🔋' },
    { id: 'running_late', label: 'Running late', emoji: '⏱️' },
    { id: 'hungry_now', label: 'Hungry now', emoji: '🥪' },
    { id: 'want_light_company', label: 'Livelier spot', emoji: '👥' },
    { id: 'early_night', label: 'Wrap up early', emoji: '🌙' }
  ];

  const toggleScenario = (id: string) => {
    setSelectedScenarios(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const handleApply = () => {
    if (selectedScenarios.length === 0 && !note.trim()) {
      onClose();
      return;
    }
    onAdapt(selectedScenarios, note);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-obsidian-deep/40 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-white/85 backdrop-blur-2xl rounded-t-4xl shadow-[0_-16px_40px_rgba(0,0,0,0.08)] px-5 pt-3.5 pb-8 flex flex-col max-h-[92vh] overflow-y-auto animate-slide-up border-t border-white/80">
        {/* Drag Pill Handle */}
        <div className="w-full flex justify-center pb-3">
          <div className="w-12 h-1.5 bg-card-border rounded-full" />
        </div>

        {/* Clean Header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-bold text-lg text-obsidian tracking-tight">
              What changed?
            </h2>
            <p className="text-xs text-olive-slate">
              Adjust upcoming stops for the rest of today.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/70 backdrop-blur-md border border-white/80 flex items-center justify-center text-obsidian hover:bg-white/90 transition-colors shadow-2xs"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scenario Chips */}
        <div className="grid grid-cols-2 gap-2 mb-4" role="group" aria-label="Select scenarios">
          {scenarios.map(s => {
            const isSelected = selectedScenarios.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleScenario(s.id)}
                className={`flex items-center justify-between min-h-[46px] px-3.5 py-2 rounded-2xl transition-all text-left active:scale-[0.98] ${
                  isSelected
                    ? 'bg-obsidian/90 backdrop-blur-md text-white shadow-sm'
                    : 'bg-white/70 backdrop-blur-md text-obsidian border border-white/80 hover:bg-white/90 shadow-2xs'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0 pr-1">
                  <span>{s.emoji}</span>
                  <span className="text-xs font-semibold truncate">{s.label}</span>
                </span>
                <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${isSelected ? 'bg-chartreuse text-obsidian' : 'text-olive-slate/40'}`}>
                  {isSelected ? <Check className="w-3 h-3" /> : '+'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Completed Stops Note if any */}
        {completedBlocks.length > 0 && (
          <div className="w-full bg-white/60 backdrop-blur-md rounded-2xl px-3.5 py-2.5 mb-3.5 flex items-center gap-2 border border-white/80 text-xs text-olive-slate shadow-2xs">
            <Lock className="w-3.5 h-3.5 text-spruce shrink-0" />
            <span>{completedBlocks.length} completed stop{completedBlocks.length > 1 ? 's' : ''} will stay unchanged.</span>
          </div>
        )}

        {/* Note Input */}
        <div className="w-full mb-4">
          <label htmlFor="adapt-note" className="sr-only">Add a note</label>
          <div className="relative flex items-center">
            <Edit3 className="w-3.5 h-3.5 text-olive-slate/60 absolute left-3.5" />
            <input
              id="adapt-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note (e.g. coffee craving)..."
              className="w-full pl-9 pr-3.5 py-2.5 rounded-2xl bg-white/70 backdrop-blur-md border border-white/80 text-xs text-obsidian placeholder-olive-slate/50 focus:outline-none focus:ring-2 focus:ring-chartreuse shadow-2xs"
            />
          </div>
        </div>

        {/* Action Button */}
        <button
          type="button"
          onClick={handleApply}
          className="w-full h-12 rounded-2xl bg-gradient-to-r from-chartreuse/95 to-[#A3D70F]/90 backdrop-blur-md border border-white/60 text-obsidian text-xs font-bold flex items-center justify-center gap-1.5 active:scale-98 transition-all shadow-glass-cta hover:shadow-[0_8px_24px_rgba(184,238,48,0.4)]"
        >
          <span>Update Plan</span>
        </button>
      </div>
    </div>
  );
};
