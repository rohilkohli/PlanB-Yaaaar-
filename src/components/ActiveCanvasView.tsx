import React, { useState } from 'react';
import { 
  ExternalLink, 
  RefreshCw, 
  CheckCircle2, 
  Circle, 
  Sliders, 
  Footprints, 
  CloudOff,
  Sun,
  Info,
  Clock,
  Navigation,
  List,
  Compass
} from 'lucide-react';
import { AlertCircle, Copy, Moon, PartyPopper, Plus, RotateCw, ShieldCheck, CalendarPlus } from 'lucide-react';
import { DayPlan, PlanBlock } from '../types/itinerary';
import { haversineKm } from '../core/geo';
import { nowIn } from '../core/clock';
import { VenueImage } from './ui';
import { transitUrl, uberUrl } from '../core/transport';
import { DataSourcesLink } from '../pages/LegalPages';
import { t } from '../i18n';

interface ActiveCanvasViewProps {
  plan: DayPlan;
  isOffline: boolean;
  onOpenAdapt: () => void;
  onOpenSwap: (block: PlanBlock) => void;
  onOpenGuardrails: () => void;
  onToggleBlockDone: (blockId: string) => void;
  onNewDay: (tomorrow?: boolean) => void;
  onMapsClick: (block: PlanBlock) => void;
  onAddBonus: () => void;
  onRetryLive: () => void;
  onCopyPlan: () => void;
  storageBlocked: boolean;
  busy: boolean;
  units: 'km' | 'mi';
  notice?: string | null;
}

const vName = (v: { name: string }) => v.name || 'Saved stop';

export const ActiveCanvasView: React.FC<ActiveCanvasViewProps> = ({
  plan,
  isOffline,
  onOpenAdapt,
  onOpenSwap,
  onOpenGuardrails,
  onToggleBlockDone,
  onNewDay,
  onMapsClick,
  onAddBonus,
  onRetryLive,
  onCopyPlan,
  storageBlocked,
  busy,
  units,
  notice
}) => {
  const [viewMode, setViewMode] = useState<'timeline' | 'map'>('timeline');
  const [filter, setFilter] = useState<'all' | 'morning' | 'afternoon' | 'evening'>('all');
  const [openTipBlockIds, setOpenTipBlockIds] = useState<Set<string>>(new Set());
  const [selectedMapBlockId, setSelectedMapBlockId] = useState<string>(plan.blocks[0]?.blockId || '');

  const toggleTip = (blockId: string) => {
    setOpenTipBlockIds(prev => {
      const next = new Set(prev);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  };

  const completedCount = plan.blocks.filter(b => b.status === 'completed').length;
  const nextStopIndex = plan.blocks.findIndex(b => b.status !== 'completed');

  const filteredBlocks = plan.blocks.filter(b => {
    if (filter === 'all') return true;
    if (filter === 'morning') return b.venue.timeSlot === 'morning';
    if (filter === 'afternoon') return b.venue.timeSlot === 'afternoon' || b.venue.timeSlot === 'lunch';
    if (filter === 'evening') return b.venue.timeSlot === 'evening';
    return true;
  });

  const walkKm = plan.blocks.reduce((sum, b, i) => {
    const from = i === 0 ? plan.calibration.anchorCoords : plan.blocks[i - 1].venue.coords;
    return sum + haversineKm(from, b.venue.coords) * 1.25;
  }, 0);
  const walkLabel = units === 'mi' ? `~${(walkKm * 0.621).toFixed(1)} mi` : `~${walkKm.toFixed(1)} km`;
  const hoursStale = plan.blocks.some(b => b.venue.source === 'google_places' && b.venue.verifiedAt && Date.now() - Date.parse(b.venue.verifiedAt) > 24 * 3600_000);
  const adapt = plan.lastAdaptation;

  const selectedMapBlock = plan.blocks.find(b => b.blockId === selectedMapBlockId) || plan.blocks[0];

  return (
    <main className="flex-1 flex flex-col px-5 pt-3 pb-36">
      {/* Top Header */}
      <header className="sticky top-0 -mx-5 px-5 py-3.5 bg-canvas/80 backdrop-blur-2xl border-b border-card-border/70 z-20 flex items-center justify-between mb-4">
        <span className="font-extrabold text-lg text-obsidian tracking-tight">PlanB</span>

        <div className="flex items-center gap-2">
          {isOffline ? (
            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold flex items-center gap-1 border border-amber-300">
              <CloudOff className="w-3 h-3" />
              <span>Offline</span>
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full bg-white/70 backdrop-blur-md text-olive-slate text-[11px] font-semibold flex items-center gap-1 border border-white/80 shadow-2xs">
              <Sun className="w-3 h-3 text-coral" />
              <span>Sunset {plan.localSunsetTime}</span>
            </span>
          )}

          <button
            type="button"
            onClick={() => onNewDay()}
            className="min-h-[44px] px-3.5 rounded-full bg-white/75 backdrop-blur-xl border border-white/80 text-xs font-bold text-obsidian hover:bg-white/90 active:scale-95 transition-all shadow-sm"
          >
            {t('today.newDay')}
          </button>

          <button
            type="button"
            onClick={onOpenGuardrails}
            className="w-11 h-11 rounded-full bg-white/75 backdrop-blur-xl border border-white/80 flex items-center justify-center text-obsidian hover:bg-white/90 active:scale-95 transition-all shadow-sm"
            title="Preferences"
            aria-label="Preferences and guardrails"
          >
            <Sliders className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Status banners */}
      <div className="space-y-2 mb-3" aria-live="polite">
        {storageBlocked && (
          <div role="status" className="p-3 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <p>Private browsing detected — copy your plan to keep it saved.</p>
              <button type="button" onClick={onCopyPlan} className="mt-1.5 min-h-[44px] px-3 rounded-full bg-white border border-amber-300 font-bold flex items-center gap-1.5">
                <Copy className="w-3.5 h-3.5" aria-hidden="true" /> Copy plan
              </button>
            </div>
          </div>
        )}
        {plan.usedFallback && (
          <div role="status" className="p-2.5 pl-3 rounded-2xl bg-white/70 border border-white/80 text-xs text-olive-slate flex items-center justify-between gap-2">
            <span>{notice || 'Built in fast local mode'}</span>
            {!isOffline && (
              <button type="button" disabled={busy} onClick={onRetryLive} className="min-h-[44px] px-3 rounded-full bg-white border border-card-border font-bold text-obsidian flex items-center gap-1.5 disabled:opacity-50">
                <RotateCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" /> Retry
              </button>
            )}
          </div>
        )}
        {adapt && adapt.changedBlockIds.length + adapt.removedNames.length > 0 && (
          <div role="status" className="p-3 rounded-2xl bg-chartreuse/25 border border-chartreuse/70 text-xs text-obsidian">
            <p className="font-semibold">{adapt.message}</p>
            {adapt.removedNames.length > 0 && <p className="mt-0.5 text-olive-slate">Set aside: {adapt.removedNames.join(', ')}</p>}
          </div>
        )}
        {hoursStale && (
          <p className="text-[11px] text-olive-slate px-1">Opening hours were last checked over a day ago. Reconnect to refresh them.</p>
        )}
      </div>

      {/* City Title */}
      <section className="flex flex-col space-y-0.5 mb-3.5">
        <div className="flex items-center justify-between">
          <h1 className="font-extrabold text-2xl text-obsidian tracking-tight">
            {plan.city.name}
          </h1>
          <span className="text-xs font-semibold text-spruce bg-white/70 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/80 shadow-2xs">
            {completedCount} of {plan.blocks.length} done
          </span>
        </div>
        <p className="text-xs text-olive-slate">
          {plan.city.country}{plan.city.tagline ? ` · ${plan.city.tagline}` : ''}
        </p>
        {plan.calibration.date > nowIn(plan.city.timezone).date && (
          <p className="text-xs font-bold text-spruce">Plan for tomorrow · {new Date(`${plan.calibration.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}</p>
        )}
      </section>

      {/* Master Day Summary Glass Module (From Google Stitch Specification) */}
      <div className="mb-4 bg-white/70 backdrop-blur-xl rounded-2xl p-3 border border-white/80 shadow-glass-card grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-2 bg-white/60 backdrop-blur-md p-2 rounded-xl border border-white/60">
          <Clock className="w-3.5 h-3.5 text-spruce shrink-0" />
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-olive-slate/80 block leading-tight">Time Span</span>
            <span className="font-bold text-obsidian truncate block">{plan.calibration.startTime} – {plan.calibration.endTime}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-white/60 backdrop-blur-md p-2 rounded-xl border border-white/60">
          <Footprints className="w-3.5 h-3.5 text-spruce shrink-0" />
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-olive-slate/80 block leading-tight">Walking</span>
            <span className="font-bold text-obsidian truncate block">{walkLabel}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-white/60 backdrop-blur-md p-2 rounded-xl border border-white/60">
          <Compass className="w-3.5 h-3.5 text-spruce shrink-0" />
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-olive-slate/80 block leading-tight">Pace</span>
            <span className="font-bold text-obsidian capitalize truncate block">{plan.calibration.energy} pace</span>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-white/60 backdrop-blur-md p-2 rounded-xl border border-white/60">
          <Sun className="w-3.5 h-3.5 text-coral shrink-0" />
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-olive-slate/80 block leading-tight">Daylight</span>
            <span className="font-bold text-obsidian truncate block">Sunset {plan.localSunsetTime}</span>
          </div>
        </div>
      </div>

      {/* Segmented View Switcher: Timeline vs Map (Stitch Design Token) */}
      <div className="p-1 rounded-full bg-white/70 backdrop-blur-xl border border-white/80 shadow-2xs flex items-center mb-4">
        <button
          type="button"
          onClick={() => setViewMode('timeline')}
          className={`flex-1 min-h-[44px] py-1.5 rounded-full text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
            viewMode === 'timeline'
              ? 'bg-gradient-to-r from-chartreuse/95 to-[#A3D70F]/90 text-obsidian shadow-xs border border-white/50'
              : 'text-olive-slate hover:text-obsidian'
          }`}
        >
          <List className="w-3.5 h-3.5" />
          <span>{t('today.timeline')}</span>
        </button>
        <button
          type="button"
          onClick={() => setViewMode('map')}
          className={`flex-1 min-h-[44px] py-1.5 rounded-full text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
            viewMode === 'map'
              ? 'bg-gradient-to-r from-chartreuse/95 to-[#A3D70F]/90 text-obsidian shadow-xs border border-white/50'
              : 'text-olive-slate hover:text-obsidian'
          }`}
        >
          <Navigation className="w-3.5 h-3.5" />
          <span>{t('today.map')}</span>
        </button>
      </div>

      {/* VIEW MODE 1: TIMELINE STREAM */}
      {viewMode === 'timeline' && (
        <section className="animate-fade-in">
          {/* Time Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3.5 no-scrollbar">
            {(['all', 'morning', 'afternoon', 'evening'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                className={`shrink-0 min-h-[44px] px-4 rounded-full text-xs font-semibold capitalize transition-all ${
                  filter === tab
                    ? 'bg-chartreuse text-obsidian shadow-sm border border-white/60'
                    : 'bg-white/70 backdrop-blur-md text-olive-slate border border-white/80 hover:bg-white/90'
                }`}
              >
                {tab === 'all' ? t('filter.all') : t('filter.' + tab)}
              </button>
            ))}
          </div>

          {/* Stops List */}
          <div className="relative flex flex-col space-y-3.5">
            <div className="absolute left-6 top-8 bottom-8 w-px bg-card-border/80 -z-10" />

            {filteredBlocks.map((block, idx) => {
              const isDone = block.status === 'completed';
              const isNextUp = idx === nextStopIndex && !isDone;

              return (
                <React.Fragment key={block.blockId}>
                  {/* STOP CARD WITH GLASSMORPHISM */}
                  <article
                    aria-label={`Stop ${block.sequence}: ${vName(block.venue)}`}
                    className={`w-full bg-white/75 backdrop-blur-xl rounded-3xl p-4 sm:p-5 border relative transition-all ${
                      block.isAdapted
                        ? 'border-chartreuse/80 ring-2 ring-chartreuse/40 shadow-[0_10px_32px_rgba(184,238,48,0.22)]'
                        : isNextUp
                        ? 'border-chartreuse/90 ring-2 ring-chartreuse/40 shadow-[0_8px_28px_rgba(184,238,48,0.18)]'
                        : 'border-white/80 shadow-glass-card'
                    } ${isDone ? 'bg-white/60' : ''}`}
                  >
                    {/* Diff highlight tag if adapted or Up Next */}
                    {block.isAdapted ? (
                      <div className="absolute -top-2.5 right-4 bg-chartreuse text-obsidian text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm border border-white/40">
                        {block.adaptationReason || 'Updated'}
                      </div>
                    ) : isNextUp ? (
                      <div className="absolute -top-2.5 right-4 bg-chartreuse text-obsidian text-[10px] font-extrabold px-2.5 py-0.5 rounded-full shadow-sm border border-white/40">
                        {t('card.upNext')}
                      </div>
                    ) : null}

                    {/* Timing & Type */}
                    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-5 h-5 rounded-full font-bold text-[10px] flex items-center justify-center ${
                            isDone ? 'bg-spruce text-white' : 'bg-obsidian text-white'
                          }`}
                        >
                          {isDone ? '✓' : block.sequence}
                        </span>
                        <span className="text-xs font-bold text-obsidian">
                          {block.timeLabel}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-olive-slate font-medium bg-white/60 backdrop-blur-xs px-2 py-0.5 rounded-full border border-white/60">
                          {block.venue.isIndoor ? 'Indoor' : 'Outdoor'}
                        </span>

                        {/* (i) Info Tip Button */}
                        <button
                          type="button"
                          onClick={() => toggleTip(block.blockId)}
                          title={openTipBlockIds.has(block.blockId) ? "Hide tip" : "View tip"}
                          aria-label={`Solo tip for ${vName(block.venue)}`}
                          aria-expanded={openTipBlockIds.has(block.blockId)}
                          className={`w-11 h-11 -my-2.5 -mr-1.5 rounded-full flex items-center justify-center transition-all ${
                            openTipBlockIds.has(block.blockId)
                              ? 'bg-chartreuse text-obsidian shadow-xs ring-1 ring-chartreuse/60'
                              : 'bg-white/70 backdrop-blur-xs text-olive-slate hover:text-obsidian border border-white/80 shadow-2xs'
                          }`}
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Venue Details & Image */}
                    <div className="flex gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] uppercase font-bold text-olive-slate">
                          {block.venue.category} · {block.venue.neighborhood}
                        </span>
                        <h2
                          className={`font-bold text-base text-obsidian tracking-tight leading-snug mt-0.5 ${
                            isDone ? 'line-through text-olive-slate' : ''
                          }`}
                        >
                          {vName(block.venue)}
                        </h2>
                        <p className="text-xs text-olive-slate mt-0.5 line-clamp-3">
                          {block.whyItFits}
                        </p>
                        {block.fitLine && (
                          <p className="text-[11px] font-semibold text-spruce mt-1.5">{block.fitLine}</p>
                        )}
                      </div>

                      <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-white/60 border border-white/70 shadow-xs shrink-0">
                        <VenueImage
                          src={block.venue.imageUrl}
                          placeId={block.venue.placeId}
                          autoLoad={isNextUp}
                          className={`w-full h-full object-cover ${isDone ? 'grayscale-[60%]' : ''}`}
                        />
                        {block.venue.rating > 0 && (
                          <span className="absolute top-1 right-1 bg-obsidian/85 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-sm shadow-xs">
                            ★ {block.venue.rating}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Solo Tip (Hidden upfront, revealed on (i) tap) */}
                    {openTipBlockIds.has(block.blockId) && (
                      <div className="w-full p-2.5 rounded-xl bg-white/65 backdrop-blur-md border border-white/80 flex items-start gap-2 mb-3 shadow-2xs animate-fade-in">
                        <Info className="w-3.5 h-3.5 text-spruce shrink-0 mt-0.5" />
                        <p className="text-xs text-olive-slate leading-relaxed">
                          <strong className="text-obsidian font-semibold">Tip: </strong>
                          {block.soloTip}
                        </p>
                      </div>
                    )}

                    {/* Per-Card Glass Actions */}
                    <div className="grid grid-cols-3 gap-2">
                      <a
                        href={block.venue.mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => onMapsClick(block)}
                        aria-label={`Open ${vName(block.venue)} in Maps`}
                        className="min-h-[44px] rounded-full bg-gradient-to-r from-chartreuse/95 to-[#A3D70F]/90 backdrop-blur-md border border-white/60 text-obsidian text-xs font-bold flex items-center justify-center gap-1 active:scale-95 transition-transform shadow-[0_4px_14px_rgba(184,238,48,0.35)] hover:shadow-[0_6px_18px_rgba(184,238,48,0.45)]"
                      >
                        <span>Maps</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>

                      <button
                        type="button"
                        onClick={() => onOpenSwap(block)}
                        disabled={isOffline || isDone}
                        aria-label={`Swap, ${vName(block.venue)}`}
                        title={isOffline ? 'Reconnect to swap' : undefined}
                        className="min-h-[44px] rounded-full bg-white/70 backdrop-blur-md text-obsidian text-xs font-semibold border border-white/80 flex items-center justify-center gap-1 hover:bg-white/90 active:scale-95 transition-transform shadow-2xs disabled:opacity-45 disabled:cursor-not-allowed"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>{t('card.swap')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onToggleBlockDone(block.blockId)}
                        aria-pressed={isDone}
                        aria-label={isDone ? `Done, ${vName(block.venue)}` : `Mark done, ${vName(block.venue)}`}
                        className={`min-h-[44px] rounded-full text-xs font-semibold flex items-center justify-center gap-1 active:scale-95 transition-transform ${
                          isDone
                            ? 'bg-spruce text-white shadow-sm'
                            : 'bg-white/70 backdrop-blur-md text-olive-slate border border-white/80 hover:bg-white/90 shadow-2xs'
                        }`}
                      >
                        {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                        <span>{isDone ? t('card.done') : t('card.markDone')}</span>
                      </button>
                    </div>
                    {/* Getting there: public links, no key needed */}
                    <div className="mt-2.5 flex items-center gap-2 flex-wrap text-[11px]">
                      <span className="text-olive-slate font-semibold">Get there:</span>
                      <a href={transitUrl(block.venue)} target="_blank" rel="noopener noreferrer" aria-label={`Metro / bus directions to ${vName(block.venue)}`}
                        className="min-h-[36px] px-3 inline-flex items-center rounded-full bg-white/80 border border-white/80 font-semibold text-obsidian hover:bg-white">Metro / bus</a>
                      <a href={uberUrl(block.venue)} target="_blank" rel="noopener noreferrer" aria-label={`Uber ride to ${vName(block.venue)}`}
                        className="min-h-[36px] px-3 inline-flex items-center rounded-full bg-white/80 border border-white/80 font-semibold text-obsidian hover:bg-white">Uber</a>
                      <span className="text-olive-slate">Auto-rickshaw: show the drop-off on Maps and agree the fare first.</span>
                    </div>
                  </article>

                  {/* Transit Connector */}
                  {idx < filteredBlocks.length - 1 && (
                    <div className="flex items-center justify-center py-0.5">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/65 backdrop-blur-md text-olive-slate text-[11px] border border-white/70 shadow-2xs">
                        <Footprints className="w-3 h-3 text-spruce" />
                        <span>{filteredBlocks[idx + 1].transitFromPrev}</span>
                        <span className="text-card-border">·</span>
                        <span className="text-obsidian font-medium">Built-in breather</span>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {plan.needsTomorrow && (
            <div className="mt-5 p-4 rounded-2xl bg-white/80 border border-white/80 shadow-glass-card flex gap-3">
              <Moon className="w-5 h-5 text-spruce shrink-0" aria-hidden="true" />
              <div>
                <h4 className="font-bold text-sm text-obsidian">It’s a little late for a daylight plan</h4>
                <p className="text-xs text-olive-slate mt-0.5">Rest up. You could set up tomorrow morning instead.</p>
                <button type="button" onClick={() => onNewDay(true)} className="mt-2 min-h-[44px] px-4 rounded-full bg-chartreuse text-obsidian text-xs font-bold flex items-center gap-1.5">
                  <CalendarPlus className="w-4 h-4" aria-hidden="true" /> Plan tomorrow
                </button>
              </div>
            </div>
          )}

          {plan.blocks.length > 0 && plan.blocks.every(b => b.status === 'completed' || b.status === 'skipped') && (
            <div className="mt-5 p-4 rounded-2xl bg-white/80 border border-white/80 shadow-glass-card flex gap-3">
              <PartyPopper className="w-5 h-5 text-spruce shrink-0" aria-hidden="true" />
              <div>
                <h4 className="font-bold text-sm text-obsidian">That’s the day. Nicely paced.</h4>
                <p className="text-xs text-olive-slate mt-0.5">Add one optional bonus stop, or set up tomorrow.</p>
                <div className="mt-2 flex gap-2 flex-wrap">
                  <button type="button" disabled={busy || isOffline} onClick={onAddBonus} className="min-h-[44px] px-4 rounded-full bg-chartreuse text-obsidian text-xs font-bold flex items-center gap-1.5 disabled:opacity-50">
                    <Plus className="w-4 h-4" aria-hidden="true" /> One bonus stop
                  </button>
                  <button type="button" onClick={() => onNewDay(true)} className="min-h-[44px] px-4 rounded-full bg-white border border-card-border text-obsidian text-xs font-bold flex items-center gap-1.5">
                    <CalendarPlus className="w-4 h-4" aria-hidden="true" /> Tomorrow
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Understated Glass End Action */}
          <div className="mt-6 mb-2 p-4 rounded-2xl bg-white/75 backdrop-blur-xl border border-white/80 flex items-center justify-between gap-3 shadow-glass-card">
            <div>
              <h4 className="font-bold text-xs text-obsidian">{t('today.needAdjust')}</h4>
              <p className="text-[11px] text-olive-slate">Rain, low battery, or change of pace.</p>
            </div>
            <button
              type="button"
              onClick={onOpenAdapt}
              className="min-h-[44px] px-4 rounded-full bg-gradient-to-r from-chartreuse/95 to-[#A3D70F]/90 backdrop-blur-md border border-white/60 text-obsidian text-xs font-bold shrink-0 active:scale-95 transition-transform shadow-[0_4px_14px_rgba(184,238,48,0.35)] hover:shadow-[0_6px_18px_rgba(184,238,48,0.45)]"
            >
              {t('today.adjust')}
            </button>
          </div>

          <p className="mt-4 mb-1 px-1 text-[11px] leading-relaxed text-olive-slate flex gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-spruce shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              {plan.dataSource === 'google_places' ? <><span translate="no" className="notranslate">Google Maps</span> place data. </> : 'Hours from a curated listing — confirm in Maps. '}
              Street conditions change, so your own judgment always comes first. <DataSourcesLink />
            </span>
          </p>
        </section>
      )}

      {/* VIEW MODE 2: INTERACTIVE MAP OVERVIEW (Stitch Map Explorer Specification) */}
      {viewMode === 'map' && (
        <section className="flex-1 flex flex-col space-y-3.5 animate-fade-in">
          {/* Stylized Visual Map Canvas */}
          <div className="relative w-full h-84 rounded-3xl overflow-hidden bg-[#F2F5EB] border border-white/80 shadow-glass-card select-none">
            {/* Background Map Grid & Vector Art */}
            <svg className="absolute inset-0 w-full h-full object-cover" viewBox="0 0 380 340" fill="none">
              <defs>
                <linearGradient id="waterFlow" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#D9E7F5" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#C8DDF2" stopOpacity="0.8" />
                </linearGradient>
                <radialGradient id="puckGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#B8EE30" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#B8EE30" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* Base terrain */}
              <rect width="380" height="340" fill="#F4F7ED" />

              {/* Park Foliage Zones */}
              <path d="M 20 40 Q 90 20, 110 90 T 50 140 Z" fill="#E2EBD6" opacity="0.6" />
              <path d="M 270 50 Q 340 30, 360 110 T 290 150 Z" fill="#E2EBD6" opacity="0.6" />

              {/* River / Waterway */}
              <path
                d="M -20 250 Q 110 220, 210 260 T 400 240 L 400 360 L -20 360 Z"
                fill="url(#waterFlow)"
              />

              {/* City secondary streets */}
              <g stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M -20 80 L 120 110 L 260 70 L 400 120" />
                <path d="M 70 20 L 90 180 L 130 260 L 100 340" />
                <path d="M 290 20 L 270 160 L 310 250 L 290 340" />
                <path d="M -10 190 L 160 170 L 300 200 L 400 170" />
              </g>

              {/* Street Casing Lines */}
              <g stroke="#DCE2D1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M -20 80 L 120 110 L 260 70 L 400 120" />
                <path d="M 70 20 L 90 180 L 130 260 L 100 340" />
                <path d="M 290 20 L 270 160 L 310 250 L 290 340" />
                <path d="M -10 190 L 160 170 L 300 200 L 400 170" />
              </g>

              {/* Dynamic Street / Neighborhood Labels from Active Plan */}
              <text x="60" y="70" fill="#8C937E" fontSize="8" fontWeight="700" letterSpacing="0.8">
                {(plan.blocks[0]?.venue.neighborhood || 'OLD BAZAAR').toUpperCase()}
              </text>
              <text x="210" y="60" fill="#8C937E" fontSize="8" fontWeight="700" letterSpacing="0.8">
                {(plan.blocks[1]?.venue.neighborhood || 'HERITAGE PRECINCT').toUpperCase()}
              </text>
              <text x="140" y="215" fill="#8C937E" fontSize="8" fontWeight="700" letterSpacing="0.8">
                {(plan.blocks[2]?.venue.neighborhood || 'CULTURE CORRIDOR').toUpperCase()}
              </text>
              <text x="260" y="295" fill="#7690AF" fontSize="8" fontWeight="700" letterSpacing="0.8">
                {(plan.blocks[3]?.venue.neighborhood || 'LAKESIDE / HILLS').toUpperCase()}
              </text>

              {/* Walking Route Active Polyline (Electric Chartreuse) */}
              <path
                d="M 68 85 Q 160 115, 205 135 T 310 185"
                stroke="#B8EE30"
                strokeWidth="5"
                strokeDasharray="6 4"
                strokeLinecap="round"
                className="drop-shadow-sm"
              />

              {/* Directional Chevrons */}
              <path d="M 125 102 L 132 98 L 130 106" stroke="#4C6700" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M 245 152 L 252 148 L 250 156" stroke="#4C6700" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>

            {/* Waypoint Pins across the map */}
            {plan.blocks.map((b, i) => {
              const coords = [
                { x: '18%', y: '25%' },
                { x: '44%', y: '36%' },
                { x: '58%', y: '48%' },
                { x: '82%', y: '62%' }
              ][i] || { x: '50%', y: '50%' };

              const isSelected = selectedMapBlockId === b.blockId;
              const isDone = b.status === 'completed';

              return (
                <div
                  key={b.blockId}
                  onClick={() => setSelectedMapBlockId(b.blockId)}
                  style={{ left: coords.x, top: coords.y }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer z-10 group"
                >
                  {/* Radar pulse on active/selected stop */}
                  {isSelected && (
                    <span className="absolute -inset-2.5 rounded-full bg-chartreuse/60 animate-ping opacity-75" />
                  )}

                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shadow-float border transition-all ${
                      isSelected
                        ? 'bg-chartreuse text-obsidian border-obsidian scale-110 ring-2 ring-chartreuse/60 shadow-[0_6px_20px_rgba(184,238,48,0.5)]'
                        : isDone
                        ? 'bg-spruce text-white border-white'
                        : 'bg-white text-obsidian border-card-border hover:scale-105'
                    }`}
                  >
                    <span>{isDone ? '✓' : `0${b.sequence}`}</span>
                  </div>

                  <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap bg-obsidian/80 backdrop-blur-xs text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-xs pointer-events-none">
                    {b.venue.neighborhood}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Selected Pin Focus Glass Card */}
          {selectedMapBlock && (
            <div className="bg-white/80 backdrop-blur-2xl rounded-3xl p-4 border border-white/85 shadow-glass-card animate-slide-up">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-bold text-olive-slate bg-white/70 px-2.5 py-0.5 rounded-full border border-white/80">
                  Stop {selectedMapBlock.sequence} · {selectedMapBlock.timeLabel}
                </span>
                <span className="text-xs font-semibold text-spruce">
                  {selectedMapBlock.venue.openHoursToday.split('·')[0]}
                </span>
              </div>

              <div className="flex gap-3 mb-3">
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-white/60 shrink-0 border border-white/80">
                  <img
                    src={selectedMapBlock.venue.imageUrl}
                    alt={vName(selectedMapBlock.venue)}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-sm text-obsidian truncate">
                    {vName(selectedMapBlock.venue)}
                  </h3>
                  <p className="text-xs text-olive-slate line-clamp-2 mt-0.5">
                    {selectedMapBlock.whyItFits}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <a
                  href={selectedMapBlock.venue.mapsUrl}
                  onClick={() => onMapsClick(selectedMapBlock)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 rounded-full bg-gradient-to-r from-chartreuse/95 to-[#A3D70F]/90 backdrop-blur-md border border-white/60 text-obsidian text-xs font-bold flex items-center justify-center gap-1 shadow-glass-cta active:scale-95 transition-all"
                >
                  <span>Maps</span>
                  <ExternalLink className="w-3 h-3" />
                </a>

                <button
                  type="button"
                  onClick={() => setViewMode('timeline')}
                  className="h-9 rounded-full bg-white/70 backdrop-blur-md text-obsidian text-xs font-semibold border border-white/80 flex items-center justify-center gap-1 hover:bg-white/90 active:scale-95 transition-all shadow-2xs"
                >
                  <span>Timeline</span>
                </button>

                <button
                  type="button"
                  onClick={() => onToggleBlockDone(selectedMapBlock.blockId)}
                  className={`h-9 px-3 rounded-full text-xs font-semibold flex items-center justify-center gap-1 active:scale-95 transition-all ${
                    selectedMapBlock.status === 'completed'
                      ? 'bg-spruce/90 text-white'
                      : 'bg-white/70 backdrop-blur-md text-olive-slate border border-white/80 hover:bg-white/90'
                  }`}
                >
                  {selectedMapBlock.status === 'completed' ? 'Done' : 'Mark done'}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
};
