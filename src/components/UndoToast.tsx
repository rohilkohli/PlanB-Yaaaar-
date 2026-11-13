import React, { useEffect, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import type { UndoState } from '../types/itinerary';

interface Props { undoState: UndoState; onUndo: () => void; onDismiss: () => void }

export const UndoToast: React.FC<Props> = ({ undoState, onUndo, onDismiss }) => {
  const [secondsRemaining, setSecondsRemaining] = useState(30);

  useEffect(() => {
    if (!undoState.active || !undoState.expiresAt) return;
    const tick = () => setSecondsRemaining(Math.max(0, Math.ceil((undoState.expiresAt! - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [undoState]);

  if (!undoState.active) return null;

  return (
    <div role="status" aria-live="polite" className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] w-[92%] max-w-sm bg-obsidian-deep text-white pl-4 pr-2 py-2 rounded-2xl shadow-float flex items-center justify-between gap-3 animate-slide-down border border-white/10">
      <div className="flex items-center gap-2.5 min-w-0">
        <RotateCcw className="w-4 h-4 text-chartreuse shrink-0" aria-hidden="true" />
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-semibold truncate">{undoState.message}</span>
          <span className="text-[11px] text-white/80">Undo available for {secondsRemaining}s</span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button type="button" onClick={onUndo} className="min-h-[44px] px-4 rounded-full bg-chartreuse text-obsidian text-xs font-bold active:scale-95 transition-transform">
          Undo change
        </button>
        <button type="button" onClick={onDismiss} className="w-11 h-11 rounded-full text-white/80 hover:text-white flex items-center justify-center" aria-label="Dismiss">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
