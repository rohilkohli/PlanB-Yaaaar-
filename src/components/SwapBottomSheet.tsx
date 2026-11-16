import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Clock, CloudOff } from 'lucide-react';
import type { DayPlan, PlanBlock, VerifiedVenue } from '../types/itinerary';
import { openUntilLabel } from '../core/hours';
import { swapRemote } from '../services/planService';
import { BottomSheet, PrimaryButton, VenueImage } from './ui';

interface Props {
  currentPlan: DayPlan;
  block: PlanBlock;
  isOffline: boolean;
  onSwapConfirm: (blockId: string, newVenue: VerifiedVenue, reason: string) => void;
  onClose: () => void;
}

const REASONS = [
  { id: 'vibe', label: 'Not my vibe' },
  { id: 'distance', label: 'Too far' },
  { id: 'closed', label: 'It’s closed' },
  { id: 'food', label: 'Food instead' }
] as const;

export const SwapBottomSheet: React.FC<Props> = ({ currentPlan, block, isOffline, onSwapConfirm, onClose }) => {
  const [reason, setReason] = useState<string>('vibe');
  const [alts, setAlts] = useState<VerifiedVenue[] | null>(null);
  const [noBackup, setNoBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setAlts(null); setError(null);
    swapRemote(currentPlan, block.blockId, reason)
      .then(r => { if (live) { setAlts(r.alternatives); setNoBackup(r.noNearbyBackup); } })
      .catch(e => { if (live) { setAlts([]); setError(e?.message || 'Couldn’t load alternatives.'); } });
    return () => { live = false; };
  }, [reason, block.blockId, currentPlan]);

  return (
    <BottomSheet title={`Replace ${block.venue.name}`} subtitle="Two nearby options. The rest of your day stays put." onClose={onClose}>
      <div role="radiogroup" aria-label="Why swap" className="flex items-center gap-2 overflow-x-auto pb-2 mb-3 no-scrollbar">
        {REASONS.map(r => (
          <button
            key={r.id} type="button" role="radio" aria-checked={reason === r.id} onClick={() => setReason(r.id)}
            className={`shrink-0 min-h-[44px] px-4 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all ${
              reason === r.id ? (r.id === 'closed' ? 'bg-red-700 text-white' : 'bg-obsidian text-white') : 'bg-white/80 text-obsidian border border-white/80 hover:bg-white'
            }`}
          >
            {r.id === 'closed' && <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />}
            {r.label}
          </button>
        ))}
      </div>

      {isOffline && (
        <div role="alert" className="mb-3 p-3 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex gap-2">
          <CloudOff className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <p>You’re offline — reconnect to swap this stop. Your current plan is saved below.</p>
        </div>
      )}

      <div className="space-y-3" aria-live="polite" aria-busy={alts === null}>
        {alts === null && [0, 1].map(i => (
          <div key={i} className="h-44 rounded-2xl bg-white/60 border border-white/80 animate-pulse" aria-hidden="true" />
        ))}

        {alts && alts.length === 0 && (
          <div className="p-5 text-center bg-white/70 border border-white/80 rounded-2xl text-sm text-olive-slate">
            {error || 'No open backup nearby right now. Your current stop stays in place.'}
          </div>
        )}

        {alts && noBackup && alts.length > 0 && (
          <p className="text-xs text-olive-slate px-1">Fewer options close by, so these are a little further away.</p>
        )}

        {alts?.map(alt => (
          <article key={alt.placeId} className="bg-white/75 backdrop-blur-xl rounded-2xl p-3.5 border border-white/80 flex flex-col gap-2.5 shadow-glass-card">
            <div className="relative w-full h-28 rounded-xl overflow-hidden border border-white/60">
              <VenueImage src={alt.imageUrl} className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase font-bold text-olive-slate tracking-wide">{alt.category} · {alt.neighborhood}</p>
              <h3 className="font-bold text-sm text-obsidian">{alt.name}</h3>
              <p className="text-xs text-olive-slate mt-0.5 line-clamp-2">{alt.whyItFits}</p>
              <p className="text-[11px] text-olive-slate mt-1 flex items-center gap-1">
                <Clock className="w-3 h-3" aria-hidden="true" />
                Open until {openUntilLabel(alt)} · {alt.source === 'google_places' ? 'Verified via Google Places' : 'Curated listing'}
              </p>
            </div>
            <PrimaryButton disabled={isOffline} onClick={() => onSwapConfirm(block.blockId, alt, reason)} className="w-full">
              <span>Replace with this</span><ArrowRight className="w-4 h-4" aria-hidden="true" />
            </PrimaryButton>
          </article>
        ))}
      </div>
    </BottomSheet>
  );
};
