import React, { useEffect, useState } from 'react';
import { BellRing, Download, X } from 'lucide-react';
import { t } from '../i18n';
import type { DayPlan } from '../types/itinerary';
import {
  canPromptInstall, disableReminders, dismissInstall, enableReminders, installDismissedRecently, isIos, isStandalone, onInstallChange,
  promptInstall, pushNeedsInstall, pushSupported, reminderKey, remindersOn
} from '../services/pushService';

/** Install first, then (only on a tap) reminders. Hidden once installed + reminders on, or dismissed for 7 days. */
export const InstallCard: React.FC<{ plan: DayPlan }> = ({ plan }) => {
  const [, tick] = useState(0);
  const [pushKey, setPushKey] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(installDismissedRecently);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => onInstallChange(() => tick(n => n + 1)), []);
  useEffect(() => { reminderKey().then(setPushKey); }, []);

  const standalone = isStandalone();
  const installable = !standalone && (canPromptInstall() || isIos());
  const pushOk = !!pushKey && pushSupported() && !pushNeedsInstall();
  const on = remindersOn();

  if (dismissed && !on) return null;
  if (!installable && !pushOk) return null;
  if (!installable && on && !msg) return null;

  const row = 'flex flex-wrap items-center gap-x-3 gap-y-1';
  const primary = 'ml-auto shrink-0 min-h-[44px] px-4 rounded-full bg-chartreuse text-obsidian text-xs font-bold active:scale-95 transition-transform';
  return (
    <section aria-label={t('install.title')} className="mb-3 rounded-2xl bg-surface/85 border border-edge/80 shadow-glass-card pl-3.5 pr-1 py-1 flex items-start gap-1">
      <div className="flex-1 min-w-0 divide-y divide-card-border/70">
        {installable && (
          <div className={`${row} py-2`}>
            <Download className="w-5 h-5 text-spruce shrink-0" aria-hidden="true" />
            <div className="min-w-[11rem] flex-1">
              <h4 className="font-bold text-sm text-obsidian leading-tight">{t('install.title')}</h4>
              <p className="text-xs text-olive-slate leading-snug">{canPromptInstall() ? t('install.body') : t('install.ios')}</p>
            </div>
            {canPromptInstall() && <button type="button" onClick={() => promptInstall()} className={primary}>{t('install.button')}</button>}
          </div>
        )}
        {pushOk && (
          <div className={`${row} py-2`}>
            <BellRing className="w-5 h-5 text-spruce shrink-0" aria-hidden="true" />
            <div className="min-w-[11rem] flex-1">
              <h4 className="font-bold text-sm text-obsidian leading-tight">{on ? t('remind.enabled') : t('remind.title')}</h4>
              <p className="text-xs text-olive-slate leading-snug">{t('remind.body')}</p>
              {msg && <p role="status" className="text-xs text-red-800 mt-1">{msg}</p>}
            </div>
            {on
              ? <button type="button" onClick={async () => { await disableReminders(); tick(n => n + 1); }} className="ml-auto shrink-0 min-h-[44px] px-3.5 rounded-full bg-surface border border-card-border text-obsidian text-xs font-bold">{t('remind.off')}</button>
              : <button type="button" onClick={async () => { const r = await enableReminders(plan); setMsg(r === 'denied' ? t('remind.denied') : null); tick(n => n + 1); }} className={primary}>{t('remind.on')}</button>}
          </div>
        )}
      </div>
      {!on && (
        <button type="button" aria-label={t('install.later')} onClick={() => { dismissInstall(); setDismissed(true); }} className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-olive-slate hover:bg-recessed active:scale-95">
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </section>
  );
};
