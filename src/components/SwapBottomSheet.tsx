import React, { useState } from 'react';
import { X, Clock, AlertTriangle, ArrowRight } from 'lucide-react';
import { DayPlan, PlanBlock, VerifiedVenue } from '../types/itinerary';
import { driftlessEngine } from '../services/engine';

interface SwapBottomSheetProps {
  currentPlan: DayPlan;
  block: PlanBlock;
  onSwapConfirm: (blockId: string, newVenue: VerifiedVenue) => void;
  onClose: () => void;
}

export const SwapBottomSheet: React.FC<SwapBottomSheetProps> = ({
  currentPlan,
  block,
  onSwapConfirm,
  onClose
}) => {
  const [selectedReason, setSelectedReason] = useState<string>('vibe');
  const [alternatives, setAlternatives] = useState<VerifiedVenue[]>(() =>
    driftlessEngine.getSwapAlternatives(currentPlan, block.blockId, 'vibe')
  );

  const handleReasonClick = (reason: string) => {
    setSelectedReason(reason);
    const refreshed = driftlessEngine.getSwapAlternatives(currentPlan, block.blockId, reason);
    setAlternatives(refreshed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-obsidian-deep/40 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-white/85 backdrop-blur-2xl rounded-t-4xl shadow-[0_-16px_40px_rgba(0,0,0,0.08)] px-5 pt-3.5 pb-8 flex flex-col max-h-[92vh] overflow-y-auto animate-slide-up border-t border-white/80">
        {/* Drag Pill Handle */}
        <div className="w-full flex justify-center pb-3">
          <div className="w-12 h-1.5 bg-card-border rounded-full" />
        </div>

        {/* Clean Header */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="font-bold text-lg text-obsidian">
              Replace "{block.venue.name}"
            </h2>
            <p className="text-xs text-olive-slate">
              Choose an alternative nearby.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/70 backdrop-blur-md border border-white/80 text-obsidian flex items-center justify-center text-xs hover:bg-white/90 shadow-2xs"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Reason Feedback Chips */}
        <div className="mb-4">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {[
              { id: 'vibe', label: 'Different vibe' },
              { id: 'distance', label: 'Too far' },
              { id: 'closed', label: "Closed" },
              { id: 'food', label: 'Food instead' }
            ].map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => handleReasonClick(r.id)}
                className={`shrink-0 h-8 px-3 rounded-full text-xs font-semibold transition-all flex items-center gap-1 ${
                  selectedReason === r.id
                    ? r.id === 'closed' ? 'bg-red-600 text-white' : 'bg-obsidian/90 backdrop-blur-md text-white shadow-sm'
                    : 'bg-white/70 backdrop-blur-md text-olive-slate border border-white/80 hover:bg-white/90 shadow-2xs'
                }`}
              >
                {r.id === 'closed' && <AlertTriangle className="w-3 h-3" />}
                <span>{r.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Alternatives List */}
        <div className="space-y-3">
          {alternatives.length === 0 ? (
            <div className="p-6 text-center bg-white/60 backdrop-blur-md border border-white/80 rounded-2xl text-xs text-olive-slate">
              No other nearby places found.
            </div>
          ) : (
            alternatives.map(alt => (
              <article
                key={alt.placeId}
                className="bg-white/70 backdrop-blur-xl rounded-2xl p-3.5 border border-white/80 flex flex-col gap-2.5 shadow-glass-card"
              >
                <div className="relative w-full h-32 rounded-xl overflow-hidden border border-white/60">
                  <img src={alt.imageUrl} alt={alt.name} className="w-full h-full object-cover" />
                  <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-md text-white text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{alt.openHoursToday.split('·')[0]}</span>
                  </div>
                </div>

                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] uppercase font-bold text-olive-slate">{alt.category}</span>
                      <span className="text-[10px] text-olive-slate/60">·</span>
                      <span className="text-[10px] text-olive-slate">{alt.neighborhood}</span>
                    </div>
                    <h3 className="font-bold text-sm text-obsidian">{alt.name}</h3>
                    <p className="text-xs text-olive-slate mt-0.5 line-clamp-2">{alt.whyItFits}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onSwapConfirm(block.blockId, alt)}
                  className="w-full h-10 rounded-full bg-gradient-to-r from-chartreuse/95 to-[#A3D70F]/90 backdrop-blur-md border border-white/60 text-obsidian text-xs font-bold flex items-center justify-center gap-1.5 active:scale-98 transition-all shadow-glass-cta hover:shadow-[0_6px_20px_rgba(184,238,48,0.4)]"
                >
                  <span>Select this place</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
