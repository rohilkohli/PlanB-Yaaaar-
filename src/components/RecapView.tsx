import React, { useState } from 'react';
import { ArrowLeft, Copy, MessageCircle, Trash2 } from 'lucide-react';
import { t } from '../i18n';
import type { DayPlan } from '../types/itinerary';
import { deleteRecap, notesStore, recapLink, recapStore, shareRecap, whatsappLink, type ShareState } from '../services/liveShare';

const vName = (v: { name: string }) => v.name || 'Saved stop';

export const RecapView: React.FC<{ plan: DayPlan; isOffline: boolean; onBack: () => void }> = ({ plan, isOffline, onBack }) => {
  const [notes, setNotes] = useState<Record<string, string>>(() => notesStore.all());
  const [share, setShare] = useState<ShareState | null>(() => { const r = recapStore.get(); return r && r.planId === plan.planId ? r : null; });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const link = share ? recapLink(share.token) : '';
  const btn = 'min-h-[44px] px-4 rounded-full text-sm font-bold inline-flex items-center justify-center gap-2 active:scale-95 transition-all';

  const create = async () => { setBusy(true); setErr(null); try { setShare(await shareRecap(plan)); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  const remove = async () => { setBusy(true); await deleteRecap(); setShare(null); setBusy(false); };

  return (
    <main className="flex-1 flex flex-col px-5 pt-3 pb-36">
      <header className="flex items-center gap-3 py-3">
        <button type="button" onClick={onBack} aria-label={t('recap.back')} className="w-11 h-11 rounded-full bg-surface/80 border border-card-border flex items-center justify-center active:scale-95"><ArrowLeft className="w-5 h-5" /></button>
        <div className="min-w-0">
          <h1 className="font-extrabold text-xl text-obsidian tracking-tight">{t('recap.title')} · {plan.city.name}</h1>
          <p className="text-xs text-olive-slate">{t('recap.subtitle')}</p>
        </div>
      </header>

      <ol className="mt-2 flex flex-col gap-3">
        {plan.blocks.map(b => (
          <li key={b.blockId} className="p-3.5 rounded-2xl bg-surface/85 border border-card-border">
            <p className="text-xs font-semibold text-olive-slate">{b.timeLabel} · {b.status === 'completed' ? 'Done' : b.status === 'skipped' ? 'Skipped' : 'Planned'}</p>
            <h2 className="font-bold text-sm text-obsidian mt-0.5">{vName(b.venue)}</h2>
            <label className="sr-only" htmlFor={`note-${b.blockId}`}>Note for {vName(b.venue)}</label>
            <textarea
              id={`note-${b.blockId}`} value={notes[b.blockId] ?? ''} maxLength={240} rows={2} placeholder={t('recap.notePlaceholder')}
              onChange={e => { setNotes({ ...notes, [b.blockId]: e.target.value }); notesStore.set(b.blockId, e.target.value); }}
              className="mt-2 w-full rounded-xl border border-card-border bg-surface px-3 py-2 text-sm"
            />
          </li>
        ))}
      </ol>

      <section aria-label={t('recap.share')} className="mt-5 p-3.5 rounded-2xl bg-surface/85 border border-card-border flex flex-col gap-3">
        {!share ? (
          <button type="button" disabled={busy || isOffline} onClick={create} className={`${btn} bg-obsidian text-canvas disabled:opacity-50`}>{busy ? '…' : t('recap.share')}</button>
        ) : (
          <>
            <p className="text-sm text-obsidian break-all">{link}</p>
            <div className="flex gap-2 flex-wrap">
              <a href={whatsappLink(`My day in ${plan.city.name} with PlanB: ${link}`)} target="_blank" rel="noopener noreferrer" className={`${btn} bg-chartreuse text-obsidian`}><MessageCircle className="w-4 h-4" aria-hidden="true" />{t('safety.whatsapp')}</a>
              <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { setErr(link); } }} className={`${btn} bg-surface border border-card-border text-obsidian`}><Copy className="w-4 h-4" aria-hidden="true" />{copied ? t('safety.copied') : t('safety.copy')}</button>
              <button type="button" disabled={busy} onClick={remove} className={`${btn} bg-surface border border-red-300 text-red-900`}><Trash2 className="w-4 h-4" aria-hidden="true" />{t('recap.delete')}</button>
            </div>
          </>
        )}
        <p className="text-xs text-olive-slate">{t('recap.note')}</p>
        {err && <p role="alert" className="text-xs text-red-800 break-all">{err}</p>}
      </section>
    </main>
  );
};
