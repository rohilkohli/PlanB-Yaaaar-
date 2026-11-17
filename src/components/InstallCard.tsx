import React, { useEffect, useState } from 'react';
import { BellRing, Download } from 'lucide-react';
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

  return (
    <section aria-label={t('install.title')} className="mb-4 p-4 rounded-2xl bg-white/85 border border-white/80 shadow-glass-card flex flex-col gap-3">
      {installable && (
        <div className="flex gap-3">
          <Download className="w-5 h-5 text-spruce shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <h4 className="font-bold text-sm text-obsidian">{t('install.title')}</h4>
            <p className="text-xs text-olive-slate mt-0.5">{canPromptInstall() ? t('install.body') : t('install.ios')}</p>
            {canPromptInstall() && <button type="button" onClick={() => promptInstall()} className="mt-2 min-h-[44px] px-4 rounded-full bg-chartreuse text-obsidian text-xs font-bold">{t('install.button')}</button>}
          </div>
        </div>
      )}
      {pushOk && (
        <div className="flex gap-3">
          <BellRing className="w-5 h-5 text-spruce shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <h4 className="font-bold text-sm text-obsidian">{on ? t('remind.enabled') : t('remind.title')}</h4>
            <p className="text-xs text-olive-slate mt-0.5">{t('remind.body')}</p>
            {on
              ? <button type="button" onClick={async () => { await disableReminders(); tick(n => n + 1); }} className="mt-2 min-h-[44px] px-4 rounded-full bg-white border border-card-border text-obsidian text-xs font-bold">{t('remind.off')}</button>
              : <button type="button" onClick={async () => { const r = await enableReminders(plan); setMsg(r === 'denied' ? t('remind.denied') : null); tick(n => n + 1); }} className="mt-2 min-h-[44px] px-4 rounded-full bg-chartreuse text-obsidian text-xs font-bold">{t('remind.on')}</button>}
            {msg && <p role="status" className="text-xs text-red-800 mt-1.5">{msg}</p>}
          </div>
        </div>
      )}
      {!on && <button type="button" onClick={() => { dismissInstall(); setDismissed(true); }} className="self-end min-h-[44px] px-3 text-xs font-semibold text-olive-slate">{t('install.later')}</button>}
    </section>
  );
};
