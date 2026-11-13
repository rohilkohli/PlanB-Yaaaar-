import React, { useEffect, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { UndoState } from '../types/itinerary';

interface UndoToastProps {
  undoState: UndoState;
  onUndo: () => void;
  onDismiss: () => void;
}

export const UndoToast: React.FC<UndoToastProps> = ({ undoState, onUndo, onDismiss }) => {
  const [secondsRemaining, setSecondsRemaining] = useState(30);

  useEffect(() => {
    if (!undoState.active || !undoState.expiresAt) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((undoState.expiresAt! - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [undoState]);

  if (!undoState.active) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-sm bg-obsidian-deep text-white px-4 py-3 rounded-2xl shadow-float flex items-center justify-between gap-3 animate-slide-down border border-white/10">
      <div className="flex items-center gap-2.5 min-w-0">
        <RotateCcw className="w-4 h-4 text-chartreuse shrink-0" />
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-semibold truncate">{undoState.message}</span>
          <span className="text-[10px] text-white/60">Undo available ({secondsRemaining}s)</span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onUndo}
          className="px-3.5 py-1.5 rounded-full bg-chartreuse text-obsidian text-xs font-bold active:scale-95 transition-transform flex items-center gap-1 shadow-sm"
        >
          <span>Undo</span>
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="w-7 h-7 rounded-full bg-white/10 text-white/80 hover:text-white flex items-center justify-center text-xs"
          aria-label="Dismiss undo banner"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

