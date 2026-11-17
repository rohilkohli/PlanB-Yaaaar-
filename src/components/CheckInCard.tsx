import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { t } from '../i18n';
import type { DayPlan } from '../types/itinerary';
import { checkinStore, sendStatus } from '../services/liveShare';
import { nowIn } from '../core/clock';

/** Shows once the day is done (or 15 min after the last stop ends) and the traveler has not checked in. */
export function checkInDue(plan: DayPlan): boolean {
  if (!plan.blocks.length || checkinStore.done(plan.planId)) return false;
  const live = nowIn(plan.city.timezone);
  if (live.date !== plan.calibration.date) return false;
  const allDone = plan.blocks.every(b => b.status === 'completed' || b.status === 'skipped');
  return allDone || live.minutes >= plan.blocks[plan.blocks.length - 1].endMinutes + 15;
}

export const CheckInCard: React.FC<{ plan: DayPlan; onOpenSafety: () => void }> = ({ plan, onOpenSafety }) => {
  const [hidden, setHidden] = useState(false);
  if (hidden || !checkInDue(plan)) return null;
  return (
    <section aria-label={t('checkin.title')} className="mb-4 p-4 rounded-2xl bg-white/85 border border-white/80 shadow-glass-card flex gap-3">
      <ShieldCheck className="w-5 h-5 text-spruce shrink-0 mt-0.5" aria-hidden="true" />
      <div className="min-w-0">
        <h4 className="font-bold text-sm text-obsidian">{t('checkin.title')}</h4>
        <p className="text-xs text-olive-slate mt-0.5">{t('checkin.body')}</p>
        <div className="mt-2 flex gap-2 flex-wrap">
          <button type="button" onClick={async () => { await sendStatus('safe', plan); setHidden(true); }} className="min-h-[44px] px-4 rounded-full bg-chartreuse text-obsidian text-xs font-bold">{t('safety.safe')}</button>
          <button type="button" onClick={onOpenSafety} className="min-h-[44px] px-4 rounded-full bg-white border border-card-border text-obsidian text-xs font-bold">{t('safety.button')}</button>
        </div>
      </div>
    </section>
  );
};
