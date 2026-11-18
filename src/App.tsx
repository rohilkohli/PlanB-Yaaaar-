import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { CalibrationView, type BuildMeta } from './components/CalibrationView';
import { ActiveCanvasView } from './components/ActiveCanvasView';
import { CITIES } from './data/placesData';
import { DataSourcesPage, PrivacyPage, TermsPage } from './pages/LegalPages';
import { getLang, setLang, t, type Lang } from './i18n';
import { NavigationDock } from './components/NavigationDock';
import { GeneratingTransition } from './components/GeneratingTransition';
import type { AdaptSubmit } from './components/AdaptBottomSheet';
import { UndoToast } from './components/UndoToast';
import { OfflineBadge } from './components/OfflineBadge';
import { CheckInCard } from './components/CheckInCard';
import { InstallCard } from './components/InstallCard';
import { clearShareData, deleteRecap, endShare, liveLocation, syncBlockStatus } from './services/liveShare';
import { disableReminders, syncReminders } from './services/pushService';
import { tripStore } from './services/trip';

import { storage } from './services/storage';
import { adaptRemote, buildPlan, fetchRainHint, hydratePlan, loadServerConfig, PlanError } from './services/planService';
import { track, ttfpMs } from './services/analytics';
import { navigate, useRoute } from './router';
import { applyBlockSwap, undoMutation } from './core/planner';
import { nowIn } from './core/clock';
import type { CalibrationInput } from './core/calibration';
import type { CityData, DayPlan, PlanBlock, TravelerPreferences, UndoState, VerifiedVenue } from './types/itinerary';

const todayIn = (tz: string) => nowIn(tz).date;

// Screens that aren't needed for the first paint load on demand, which keeps the initial download small.
const MapExplorerView = lazy(() => import('./components/MapExplorerView').then(m => ({ default: m.MapExplorerView })));
const ExploreView = lazy(() => import('./components/ExploreView').then(m => ({ default: m.ExploreView })));
const AdaptBottomSheet = lazy(() => import('./components/AdaptBottomSheet').then(m => ({ default: m.AdaptBottomSheet })));
const SwapBottomSheet = lazy(() => import('./components/SwapBottomSheet').then(m => ({ default: m.SwapBottomSheet })));
const SafetySheet = lazy(() => import('./components/SafetySheet').then(m => ({ default: m.SafetySheet })));
const RecapView = lazy(() => import('./components/RecapView').then(m => ({ default: m.RecapView })));
const SharedPage = lazy(() => import('./pages/SharedPage').then(m => ({ default: m.SharedPage })));
const GuardrailsModal = lazy(() => import('./components/GuardrailsModal').then(m => ({ default: m.GuardrailsModal })));

export const App: React.FC = () => {
  const route = useRoute();
  const [lang, setLangState] = useState<Lang>(() => getLang());
  const changeLang = (l: Lang) => { setLang(l); setLangState(l); };
  const [ready, setReady] = useState(false);
  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [preferences, setPreferences] = useState<TravelerPreferences>(() => storage.getPreferences());
  const [isOffline, setIsOffline] = useState<boolean>(() => storage.isOffline());
  const [undoState, setUndoState] = useState<UndoState>({ active: false, message: '', expiresAt: null });
  const [generating, setGenerating] = useState<{ city: string; demo: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [calError, setCalError] = useState<string | null>(null);
  const [adaptError, setAdaptError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rainLikely, setRainLikely] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [tripDismissed, setTripDismissed] = useState(false);
  const lastInput = useRef<CalibrationInput | null>(null);
  const abortGen = useRef(false);

  /* ---------------------------------------------------------------- boot: load local-first state */
  useEffect(() => {
    let alive = true;
    storage.init().then(() => {
      if (!alive) return;
      const saved = storage.getActivePlan();
      setPlan(saved);
      loadServerConfig().then(c => storage.setAllowPlacesStorage(c.placesOfflineStorage));
      if (saved) hydratePlan(saved).then(h => { if (alive && h !== saved) setPlan(h); });
      setPreferences(storage.getPreferences());
      liveLocation.sync(); // resume location sharing if a share is still active
      setReady(true);
    });
    const unsub = storage.subscribeUndo(setUndoState);
    const net = () => setIsOffline(storage.isOffline());
    window.addEventListener('online', net);
    window.addEventListener('offline', net);
    return () => { alive = false; unsub(); window.removeEventListener('online', net); window.removeEventListener('offline', net); };
  }, []);

  /* ---------------------------------------------------------------- routing rules (PRD §13) */
  const planIsToday = !!plan && plan.calibration.date === todayIn(plan.city.timezone);
  const params = new URLSearchParams(route.search);
  const wantsNew = params.has('new');
  const isLegal = ['/privacy', '/terms', '/data-sources'].includes(route.path);
  const shared = route.path.match(/^\/(s|r)\/([A-Za-z0-9_-]{10,60})$/);
  const base: 'calibrate' | 'today' | 'explore' | 'map' =
    route.path === '/explore' ? 'explore' : route.path === '/map' ? 'map' : route.path === '/today' || route.path === '/preferences' || route.path === '/recap' ? (plan ? 'today' : 'calibrate') : 'calibrate';

  useEffect(() => {
    if (!ready || shared) return;
    if (route.path === '/' && plan && planIsToday && !wantsNew) navigate('/today', { replace: true });
    else if (route.path === '/today' && !plan) navigate('/', { replace: true });
    else if (!['/', '/today', '/preferences', '/explore', '/map', '/recap', '/privacy', '/terms', '/data-sources'].includes(route.path)) navigate(plan && planIsToday ? '/today' : '/', { replace: true });
  }, [ready, shared, route.path, plan, planIsToday, wantsNew]);

  const isPrefsOpen = route.path === '/preferences';
  const isSafetyOpen = route.path === '/today' && (route.hash === 'safety' || route.hash === 'checkin') && !!plan;
  const isRecap = route.path === '/recap' && !!plan;
  const isAdaptOpen = route.path === '/today' && route.hash === 'adapt' && !!plan;
  const swapBlock: PlanBlock | undefined = route.path === '/today' && route.hash.startsWith('swap-') && plan
    ? plan.blocks.find(b => b.blockId === route.hash.slice(5)) : undefined;

  // Rain nudge (F-09, on-demand: only checked when the adapt sheet opens)
  useEffect(() => {
    if (!isAdaptOpen || !plan) return;
    let alive = true;
    fetchRainHint(plan.calibration.anchorCoords).then(v => alive && setRainLikely(v));
    return () => { alive = false; };
  }, [isAdaptOpen, plan]);

  const closeSheet = useCallback(() => navigate(route.path === '/preferences' ? (plan ? '/today' : '/') : '/today'), [route.path, plan]);

  /* ---------------------------------------------------------------- persistence helpers */
  const commit = useCallback(async (next: DayPlan, undoMessage?: string, say?: string) => {
    setPlan(next);
    await storage.setActivePlan(next, undoMessage);
    if (say) setAnnounce(say);
    void syncReminders(next); // keeps the (max two) push reminders in step with the plan
  }, []);

  /* ---------------------------------------------------------------- generate */
  const handleBuildPlan = async (input: CalibrationInput, meta: BuildMeta) => {
    lastInput.current = input;
    setCalError(null);
    abortGen.current = false;
    setGenerating({ city: input.query || input.locationLabel || '', demo: !!meta.demo });
    const started = Date.now();
    try {
      // Multi-day: remember how the last day went, then leave already-seen places out of this one.
      if (plan && !tripDismissed) tripStore.record(plan);
      const { plan: p, meta: m } = await buildPlan(input, preferences, tripDismissed ? [] : tripStore.excludeFor(input));
      setTripDismissed(false);
      if (abortGen.current) return;
      setNotice(m.notice ?? null);
      await commit(p, undefined, `Your plan for ${p.city.name} is ready.`);
      const rec = storage.recordPlanDate(p.calibration.date);
      if (rec.returnedNextDay) track('next_day_returned', { days_since_first_plan: rec.daysSinceFirst });
      track('plan_generated', {
        city: p.city.id, energy: p.calibration.energy, budget: p.calibration.budget, after_dark: p.calibration.afterDark,
        social: p.calibration.social, latency_ms: m.latencyMs || Date.now() - started, used_fallback: m.usedFallback,
        ...(ttfpMs() !== undefined ? { ttfp_ms: ttfpMs()! } : {})
      });
      navigate('/today', { replace: true });
    } catch (e) {
      if (abortGen.current) return;
      setCalError(e instanceof PlanError ? e.message : 'Something went wrong. Please try again.');
      navigate('/?new=1', { replace: true });
    } finally {
      setGenerating(null);
    }
  };

  const handleRetryLive = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      const input: CalibrationInput = lastInput.current ?? { cityId: plan.city.id, energy: plan.calibration.energy, budget: plan.calibration.budget, afterDark: plan.calibration.afterDark, social: plan.calibration.social, startTime: plan.calibration.startTime, endTime: plan.calibration.endTime };
      const { plan: p, meta: m } = await buildPlan({ ...input, date: plan.calibration.date }, plan.guardrails);
      // Keep progress: only swap in the retried plan if nothing is completed yet.
      if (!plan.blocks.some(b => b.status === 'completed')) await commit(p);
      setNotice(m.usedFallback ? 'Still in fast local mode' : null);
    } finally { setBusy(false); }
  };

  /* ---------------------------------------------------------------- adapt (US-008) */
  const handleAdapt = async (r: AdaptSubmit) => {
    if (!plan) return;
    setBusy(true); setAdaptError(null);
    const started = Date.now();
    try {
      let currentCoords: { lat: number; lng: number } | undefined;
      if (r.useLocation && navigator.geolocation) {
        currentCoords = await new Promise(res => navigator.geolocation.getCurrentPosition(
          p => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res(undefined), { timeout: 5000, maximumAge: 60_000 }));
      }
      const { plan: next, meta } = await adaptRemote(plan, { scenarios: r.scenarios, note: r.note, socialShift: r.socialShift, currentCoords });
      setNotice(meta.usedFallback ? 'Built in fast local mode' : null);
      await commit(next, next.lastAdaptation?.message ?? 'Plan updated', next.lastAdaptation?.message);
      track('day_adapted', { triggers: r.scenarios, completed_count: plan.blocks.filter(b => b.status === 'completed').length, latency_ms: Date.now() - started });
      navigate('/today', { replace: true });
    } catch (e) {
      setAdaptError(e instanceof Error ? e.message : 'Couldn’t update your plan.');
    } finally { setBusy(false); }
  };

  const handleBonus = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      const { plan: next } = await adaptRemote(plan, { scenarios: [], note: '', bonus: true });
      await commit(next, 'Bonus stop added', 'One optional bonus stop added.');
    } catch (e) { setNotice(e instanceof Error ? e.message : null); }
    finally { setBusy(false); }
  };

  /* ---------------------------------------------------------------- swap (US-009) + undo (US-010) */
  const handleSwapConfirm = async (blockId: string, venue: VerifiedVenue, reason: string) => {
    if (!plan) return;
    const idx = plan.blocks.findIndex(b => b.blockId === blockId);
    const next = applyBlockSwap(plan, blockId, venue);
    await commit(next, `Swapped to ${venue.name}`, `Swapped to ${venue.name}.`);
    track('block_swapped', { block_sequence: idx + 1, swap_reason: reason });
    if (reason === 'closed') track('venue_issue_flagged', { flag_reason: 'closed' });
    navigate('/today', { replace: true });
  };

  const handleUndo = async () => {
    if (!plan?.previousSnapshot) return;
    const kind = plan.lastAdaptation?.scenarios[0] === 'swap' ? 'swap' : 'adapt';
    const restored = undoMutation(plan);
    await commit(restored, undefined, 'Previous plan restored.');
    storage.dismissUndo();
    track('adaptation_undone', { action_type: kind });
  };

  const handleToggleDone = async (blockId: string) => {
    if (!plan) return;
    const blocks = plan.blocks.map(b => b.blockId === blockId ? { ...b, status: (b.status === 'completed' ? 'upcoming' : 'completed') as PlanBlock['status'] } : b);
    const firstOpen = blocks.findIndex(b => b.status !== 'completed' && b.status !== 'skipped');
    const normalised = blocks.map((b, i) => b.status === 'completed' || b.status === 'skipped' ? b : { ...b, status: (i === firstOpen ? 'in_progress' : 'upcoming') as PlanBlock['status'] });
    await commit({ ...plan, blocks: normalised, allDone: normalised.every(b => b.status === 'completed' || b.status === 'skipped') });
    const changed = normalised.find(b => b.blockId === blockId);
    if (changed) void syncBlockStatus(blockId, changed.status); // reflected on a live share, if one is on
  };

  const handleLoadCurated = (city: CityData) => {
    handleBuildPlan({ cityId: city.id, energy: 'balanced', budget: '₹₹', afterDark: 'well_lit', social: 'ambient' }, { demo: true });
  };

  const handleCopyPlan = async () => {
    if (!plan) return;
    const lines = [`PlanB — ${plan.city.name}, ${plan.calibration.date}`, ...plan.blocks.map(b => `${b.timeLabel}  ${b.venue.name} — ${b.venue.address}`)];
    try { await navigator.clipboard.writeText(lines.join('\n')); setAnnounce('Plan copied.'); } catch { setAnnounce('Couldn’t copy automatically.'); }
  };

  const handleSavePrefs = (p: TravelerPreferences) => { setPreferences(p); storage.setPreferences(p); };

  const handleToggleOffline = () => { storage.setSimulatedOffline(!storage.isSimulatedOffline()); setIsOffline(storage.isOffline()); };

  const handleResetAll = async () => {
    // Delete everything that left the phone too: the live share, the shared recap and the push subscription.
    await Promise.allSettled([endShare(), deleteRecap(), disableReminders()]);
    clearShareData();
    tripStore.clear();
    await storage.clearAllData();
    setPlan(null);
    setPreferences(storage.getPreferences());
    navigate('/', { replace: true });
  };

  /* ---------------------------------------------------------------- render */
  if (!ready) {
    return (
      <div className="min-h-screen w-full bg-[#EEF2E6] flex justify-center">
        <div className="w-full max-w-[440px] min-h-screen bg-canvas flex items-center justify-center" role="status" aria-label="Loading">
          <span className="font-extrabold text-lg text-obsidian tracking-tight animate-pulse">PlanB</span>
        </div>
      </div>
    );
  }

  if (shared) {
    return (
      <Suspense fallback={null}>
        <div className="min-h-screen w-full bg-[#EEF2E6] flex justify-center text-obsidian antialiased">
          <div className="w-full max-w-[440px] min-h-screen bg-canvas shadow-2xl relative flex flex-col border-x border-card-border overflow-x-hidden">
            <SharedPage kind={shared[1] === 's' ? 'share' : 'recap'} token={shared[2]} />
          </div>
        </div>
      </Suspense>
    );
  }

  const trip = params.has('tomorrow') && plan ? tripStore.preview(plan) : null;
  const tripNote = trip && !tripDismissed ? {
    title: t('trip.day').replace('{n}', String(trip.day)).replace('{city}', plan?.city.name ?? ''),
    detail: trip.skipping > 0 ? t('trip.skipping').replace('{count}', String(trip.skipping)) : '',
    onReset: () => { tripStore.clear(); setTripDismissed(true); }
  } : null;

  const tab = base;

  return (
    <Suspense fallback={null}>
    <div className="min-h-screen w-full bg-[#EEF2E6] flex justify-center text-obsidian antialiased selection:bg-chartreuse selection:text-obsidian">
      <div className="w-full max-w-[440px] min-h-screen bg-canvas shadow-2xl relative flex flex-col border-x border-card-border overflow-x-hidden">
        <div className="pointer-events-none absolute -top-20 -left-20 w-72 h-72 rounded-full bg-chartreuse/20 blur-3xl -z-10" aria-hidden="true" />
        <div className="pointer-events-none absolute top-1/3 -right-24 w-72 h-72 rounded-full bg-coral/10 blur-3xl -z-10" aria-hidden="true" />

        <p className="sr-only-live" role="status" aria-live="polite">{announce}</p>

        <UndoToast undoState={undoState} onUndo={handleUndo} onDismiss={() => storage.dismissUndo()} />

        {!isLegal && tab !== 'calibrate' && tab !== 'map' && <div className="px-5 pt-2"><OfflineBadge isOffline={isOffline} /></div>}

        {!isLegal && tab === 'calibrate' && (
          <CalibrationView
            preferences={preferences}
            onOpenGuardrails={() => navigate('/preferences')}
            onBuildPlan={handleBuildPlan}
            serverError={calError}
            busy={!!generating}
            tripNote={tripNote}
            prefill={params.has('tomorrow') && plan ? { cityId: plan.city.id, cityName: plan.city.name, energy: plan.calibration.energy, budget: plan.calibration.budget, afterDark: plan.calibration.afterDark, social: plan.calibration.social } : null}
          />
        )}

        {!isLegal && tab === 'today' && plan && !isRecap && (
          <ActiveCanvasView
            plan={plan}
            isOffline={isOffline}
            units={preferences.units}
            busy={busy}
            notice={notice}
            storageBlocked={storage.isStorageBlocked()}
            onOpenAdapt={() => navigate('/today#adapt')}
            onOpenSwap={blk => navigate(`/today#swap-${blk.blockId}`)}
            onOpenGuardrails={() => navigate('/preferences')}
            onToggleBlockDone={handleToggleDone}
            onNewDay={tomorrow => navigate(tomorrow ? '/?new=1&tomorrow=1' : '/?new=1')}
            onMapsClick={b => track('block_maps_clicked', { block_sequence: b.sequence, category: b.venue.category, is_adapted: !!b.isAdapted })}
            onAddBonus={handleBonus}
            onRetryLive={handleRetryLive}
            onCopyPlan={handleCopyPlan}
            onOpenSafety={() => navigate('/today#safety')}
            onOpenRecap={() => navigate('/recap')}
            banner={<><CheckInCard plan={plan} onOpenSafety={() => navigate('/today#safety')} /><InstallCard plan={plan} /></>}
          />
        )}

        {isRecap && plan && <RecapView plan={plan} isOffline={isOffline} onBack={() => navigate('/today')} />}

        {isLegal && (route.path === '/privacy' ? <PrivacyPage /> : route.path === '/terms' ? <TermsPage /> : <DataSourcesPage />)}

        {!isLegal && tab === 'map' && (
          <MapExplorerView
            center={plan?.calibration.anchorCoords ?? CITIES[0].coords}
            cityName={plan?.city.name ?? CITIES[0].name}
            onBack={() => navigate(plan ? '/today' : '/')}
          />
        )}

        {!isLegal && tab === 'explore' && (
          <ExploreView onLoadCity={handleLoadCurated} onBackToPlan={() => navigate(plan ? '/today' : '/')} />
        )}

        <NavigationDock
          activeTab={tab}
          onSelectTab={t => navigate(t === 'calibrate' ? '/?new=1' : t === 'today' ? (plan ? '/today' : '/') : t === 'map' ? '/map' : '/explore')}
          onOpenAdapt={() => navigate('/today#adapt')}
          hasActivePlan={!!plan}
        />

        {generating && (
          <GeneratingTransition
            cityName={generating.city}
            isQuickDemo={generating.demo}
            onCancel={() => { abortGen.current = true; setGenerating(null); }}
          />
        )}

        {isAdaptOpen && plan && (
          <AdaptBottomSheet currentPlan={plan} isOffline={isOffline} busy={busy} error={adaptError} rainLikely={rainLikely} onAdapt={handleAdapt} onClose={closeSheet} />
        )}

        {swapBlock && plan && (
          <SwapBottomSheet currentPlan={plan} block={swapBlock} isOffline={isOffline} onSwapConfirm={handleSwapConfirm} onClose={closeSheet} />
        )}

        {isSafetyOpen && plan && <SafetySheet plan={plan} isOffline={isOffline} onClose={closeSheet} />}

        {isPrefsOpen && (
          <GuardrailsModal
            preferences={preferences}
            isSimulatedOffline={storage.isSimulatedOffline()}
            lang={lang}
            onLangChange={changeLang}
            onSave={handleSavePrefs}
            onToggleSimulateOffline={handleToggleOffline}
            onResetAllData={handleResetAll}
            onClose={closeSheet}
          />
        )}
      </div>
    </div>
    </Suspense>
  );
};

export default App;
