import React, { useState } from 'react';
import { Copy, MessageCircle, Phone, Share2, ShieldCheck, Siren, Square } from 'lucide-react';
import { BottomSheet } from './ui';
import { t } from '../i18n';
import type { DayPlan } from '../types/itinerary';
import { contactStore, endShare, sendStatus, shareLink, shareStore, startShare, whatsappLink, type ShareState } from '../services/liveShare';

interface Props { plan: DayPlan; isOffline: boolean; onClose: () => void }

export const SafetySheet: React.FC<Props> = ({ plan, isOffline, onClose }) => {
  const [contact, setContact] = useState(() => contactStore.get() ?? { name: '', phone: '' });
  const [saved, setSaved] = useState(!!contactStore.get());
  const [share, setShare] = useState<ShareState | null>(() => shareStore.get());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<'none' | 'safe' | 'help'>('none');

  const link = share ? shareLink(share.token) : '';
  const message = `I’m sharing my day with you on PlanB. You can follow my plan and where I am: ${link}`;

  const begin = async () => {
    setBusy(true); setError(null);
    try { setShare(await startShare(plan)); }
    catch (e) { setError((e as Error).message || 'Could not start sharing. Please try again.'); }
    finally { setBusy(false); }
  };
  const stop = async () => { setBusy(true); await endShare(); setShare(null); setBusy(false); };
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { setError(link); } };
  const nativeShare = async () => { try { await navigator.share({ text: message }); } catch { /* cancelled */ } };
  const answer = async (s: 'safe' | 'help') => { setMode(s); await sendStatus(s, plan); };

  const btn = 'min-h-[44px] px-4 rounded-full text-sm font-bold inline-flex items-center justify-center gap-2 active:scale-95 transition-all';

  return (
    <BottomSheet title={t('safety.title')} subtitle={t('safety.subtitle')} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {/* Check-in */}
        <section aria-label="Check in" className="flex gap-2 flex-wrap">
          <button type="button" onClick={() => answer('safe')} className={`${btn} bg-chartreuse text-obsidian flex-1`}><ShieldCheck className="w-4 h-4" aria-hidden="true" />{t('safety.safe')}</button>
          <button type="button" onClick={() => answer('help')} className={`${btn} bg-red-700 text-white flex-1`}><Siren className="w-4 h-4" aria-hidden="true" />{t('safety.help')}</button>
        </section>
        {mode === 'safe' && <p role="status" className="text-sm text-spruce font-semibold">{t('safety.safeDone')}</p>}
        {mode === 'help' && (
          <section role="alert" className="rounded-2xl bg-red-50 border border-red-200 p-3.5 flex flex-col gap-2.5">
            <p className="text-sm font-bold text-red-900">{t('safety.helpTitle')}</p>
            <div className="flex gap-2 flex-wrap">
              <a href="tel:112" className={`${btn} bg-red-700 text-white`}><Phone className="w-4 h-4" aria-hidden="true" />{t('safety.call112')}</a>
              {contact.phone && <a href={`tel:${contact.phone}`} className={`${btn} bg-white border border-red-300 text-red-900`}><Phone className="w-4 h-4" aria-hidden="true" />{t('safety.callContact')} {contact.name || contact.phone}</a>}
            </div>
            {share && <p className="text-xs text-red-900/80">{t('safety.shareOn')}</p>}
          </section>
        )}

        {/* Live share */}
        <section aria-label={t('safety.shareStart')} className="rounded-2xl bg-white/80 border border-card-border p-3.5 flex flex-col gap-3">
          {!share ? (
            <>
              <button type="button" disabled={busy || isOffline} onClick={begin} className={`${btn} bg-obsidian text-white disabled:opacity-50`}><Share2 className="w-4 h-4" aria-hidden="true" />{busy ? '…' : t('safety.shareStart')}</button>
              {isOffline && <p className="text-xs text-olive-slate">{t('safety.offline')}</p>}
            </>
          ) : (
            <>
              <p className="text-sm font-bold text-obsidian flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-spruce animate-pulse" aria-hidden="true" />{t('safety.shareOn')}</p>
              <div className="flex gap-2 flex-wrap">
                <a href={whatsappLink(message, contact.phone)} target="_blank" rel="noopener noreferrer" className={`${btn} bg-chartreuse text-obsidian`}><MessageCircle className="w-4 h-4" aria-hidden="true" />{t('safety.whatsapp')}</a>
                {'share' in navigator && <button type="button" onClick={nativeShare} className={`${btn} bg-white border border-card-border text-obsidian`}><Share2 className="w-4 h-4" aria-hidden="true" />{t('safety.share')}</button>}
                <button type="button" onClick={copy} className={`${btn} bg-white border border-card-border text-obsidian`}><Copy className="w-4 h-4" aria-hidden="true" />{copied ? t('safety.copied') : t('safety.copy')}</button>
              </div>
              <button type="button" disabled={busy} onClick={stop} className={`${btn} bg-white border border-red-300 text-red-900`}><Square className="w-4 h-4" aria-hidden="true" />{t('safety.shareStop')}</button>
            </>
          )}
          <p className="text-xs text-olive-slate">{t('safety.shareNote')}</p>
          {error && <p role="alert" className="text-xs text-red-800 break-all">{error}</p>}
        </section>

        {/* Trusted contact (kept on this phone) */}
        <section aria-label={t('safety.contact')} className="rounded-2xl bg-white/80 border border-card-border p-3.5 flex flex-col gap-2.5">
          <h3 className="text-sm font-bold text-obsidian">{t('safety.contact')}</h3>
          <p className="text-xs text-olive-slate">{t('safety.contactHint')}</p>
          <label className="text-xs font-semibold text-obsidian flex flex-col gap-1">{t('safety.name')}
            <input value={contact.name} onChange={e => { setContact({ ...contact, name: e.target.value }); setSaved(false); }} maxLength={40} autoComplete="off" className="min-h-[44px] rounded-xl border border-card-border bg-white px-3 text-sm font-normal" />
          </label>
          <label className="text-xs font-semibold text-obsidian flex flex-col gap-1">{t('safety.phone')}
            <input value={contact.phone} onChange={e => { setContact({ ...contact, phone: e.target.value }); setSaved(false); }} inputMode="tel" placeholder="+91…" maxLength={20} autoComplete="off" className="min-h-[44px] rounded-xl border border-card-border bg-white px-3 text-sm font-normal" />
          </label>
          <button type="button" disabled={saved || !contact.phone.trim()} onClick={() => { contactStore.set(contact); setContact(contactStore.get() ?? contact); setSaved(true); }} className={`${btn} bg-white border border-card-border text-obsidian disabled:opacity-50 self-start`}>{saved ? '✓ ' : ''}{t('safety.saveContact')}</button>
        </section>

        <p className="text-xs text-olive-slate">{t('safety.notEmergency')}</p>
      </div>
    </BottomSheet>
  );
};
