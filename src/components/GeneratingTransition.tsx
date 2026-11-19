import React, { useEffect, useState } from 'react';
import { Compass, X } from 'lucide-react';
import { useFocusTrap } from './ui';

interface Props {
  cityName: string;
  onCancel: () => void;
  /** Sample days are instant, so skip the staged copy. */
  isQuickDemo?: boolean;
}

const STAGES = ['Checking open hours…', 'Mapping short walks…', 'Building in breathing room…'];

/** Calm loading state with skeleton cards (PRD §19). Real work is awaited by the caller; this just reassures. */
export const GeneratingTransition: React.FC<Props> = ({ cityName, onCancel, isQuickDemo = false }) => {
  const [stage, setStage] = useState(0);
  const ref = useFocusTrap(true, onCancel);

  useEffect(() => {
    const t = setInterval(() => setStage(s => Math.min(s + 1, STAGES.length - 1)), isQuickDemo ? 400 : 1400);
    return () => clearInterval(t);
  }, [isQuickDemo]);

  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label="Building your day" tabIndex={-1} className="fixed inset-0 z-50 bg-canvas flex flex-col px-6 pt-safe pb-safe animate-fade-in outline-hidden">
      <div className="flex items-center justify-between py-2">
        <span className="font-extrabold text-base text-obsidian tracking-tight">PlanB</span>
        <button type="button" onClick={onCancel} aria-label="Cancel" className="w-11 h-11 rounded-full bg-surface border border-card-border flex items-center justify-center text-obsidian hover:bg-recessed active:scale-90">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-col items-center text-center mt-6" role="status" aria-live="polite">
        <div className="relative w-20 h-20 flex items-center justify-center mb-4" aria-hidden="true">
          <div className="absolute inset-0 rounded-full bg-chartreuse/25 blur-2xl animate-pulse" />
          <div className="absolute inset-0 rounded-full border border-dashed border-chartreuse/70 animate-spin" style={{ animationDuration: '14s' }} />
          <Compass className="w-7 h-7 text-spruce animate-spin" style={{ animationDuration: '6s' }} />
        </div>
        <h3 className="text-base font-bold text-obsidian">Setting up {cityName || 'your day'}</h3>
        <p className="text-sm text-olive-slate mt-1">{STAGES[stage]}</p>
      </div>

      <div className="mt-8 space-y-3.5" aria-hidden="true">
        {[0, 1, 2].map(i => (
          <div key={i} className="rounded-3xl bg-surface/75 border border-edge/80 p-4 shadow-glass-card animate-pulse" style={{ animationDelay: `${i * 150}ms` }}>
            <div className="h-3 w-24 rounded-full bg-recessed-dark mb-3" />
            <div className="flex gap-3">
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 rounded-full bg-recessed-dark" />
                <div className="h-3 w-full rounded-full bg-recessed" />
                <div className="h-3 w-2/3 rounded-full bg-recessed" />
              </div>
              <div className="w-20 h-20 rounded-xl bg-recessed-dark" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
