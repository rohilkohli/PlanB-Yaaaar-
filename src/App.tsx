import React, { useState, useEffect } from 'react';
import { CalibrationView } from './components/CalibrationView';
import { ActiveCanvasView } from './components/ActiveCanvasView';
import { ExploreView } from './components/ExploreView';
import { NavigationDock } from './components/NavigationDock';
import { GeneratingTransition } from './components/GeneratingTransition';
import { AdaptBottomSheet } from './components/AdaptBottomSheet';
import { SwapBottomSheet } from './components/SwapBottomSheet';
import { GuardrailsModal } from './components/GuardrailsModal';
import { UndoToast } from './components/UndoToast';
import { OfflineBadge } from './components/OfflineBadge';

import { storage } from './services/storage';
import { driftlessEngine } from './services/engine';
import { 
  DayPlan, 
  PlanBlock, 
  CalibrationData, 
  TravelerPreferences, 
  VerifiedVenue, 
  CityData,
  UndoState
} from './types/itinerary';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'calibrate' | 'today' | 'explore'>('today');
  const [activePlan, setActivePlan] = useState<DayPlan | null>(null);
  const [preferences, setPreferences] = useState<TravelerPreferences>(() => storage.getPreferences());

  // Overlays & Sheet states
  const [isGenerating, setIsGenerating] = useState(false);
  const [isQuickDemo, setIsQuickDemo] = useState(false);
  const [isAdaptOpen, setIsAdaptOpen] = useState(false);
  const [swappingBlock, setSwappingBlock] = useState<PlanBlock | null>(null);
  const [isGuardrailsOpen, setIsGuardrailsOpen] = useState(false);
  const [undoState, setUndoState] = useState<UndoState>({ active: false, message: '', expiresAt: null });
  const [isOffline, setIsOffline] = useState<boolean>(() => storage.isOffline());

  // Load existing plan from local storage on mount
  useEffect(() => {
    const saved = storage.getActivePlan();
    if (saved) {
      setActivePlan(saved);
      setActiveTab('today');
    } else {
      setActiveTab('calibrate');
    }

    // Subscribe to Undo changes
    const unsubUndo = storage.subscribeUndo((state) => {
      setUndoState(state);
    });

    // Network listeners
    const handleNet = () => setIsOffline(storage.isOffline());
    window.addEventListener('online', handleNet);
    window.addEventListener('offline', handleNet);

    return () => {
      unsubUndo();
      window.removeEventListener('online', handleNet);
      window.removeEventListener('offline', handleNet);
    };
  }, []);

  // Generate Day Plan Handler
  const handleBuildPlan = (calib: Partial<CalibrationData>, demo = false) => {
    setIsQuickDemo(demo);
    setIsGenerating(true);

    setTimeout(() => {
      const plan = driftlessEngine.generateDayPlan(calib, preferences);
      setActivePlan(plan);
      storage.setActivePlan(plan);
      setIsGenerating(false);
      setActiveTab('today');
    }, demo ? 500 : 1200);
  };

  // Adapt Day Handler
  const handleAdaptDay = (selectedScenarios: string[], note: string) => {
    if (!activePlan) return;
    const adapted = driftlessEngine.adaptDayPlan(activePlan, selectedScenarios, note);
    setActivePlan(adapted);
    storage.setActivePlan(adapted, true, "Plan updated");
    setIsAdaptOpen(false);
  };

  // Swap Single-Block Handler
  const handleSwapConfirm = (blockId: string, newVenue: VerifiedVenue) => {
    if (!activePlan) return;
    const swapped = driftlessEngine.applyBlockSwap(activePlan, blockId, newVenue);
    setActivePlan(swapped);
    storage.setActivePlan(swapped, true, `Swapped to ${newVenue.name}`);
    setSwappingBlock(null);
  };

  // 1-Tap Undo Handler (PRD US-010)
  const handleUndo = () => {
    if (!activePlan || !activePlan.previousSnapshot) return;
    const restored = driftlessEngine.undoMutation(activePlan);
    setActivePlan(restored);
    storage.setActivePlan(restored);
    storage.dismissUndo();
  };

  // Mark block done toggle
  const handleToggleBlockDone = (blockId: string) => {
    if (!activePlan) return;
    const updatedBlocks = activePlan.blocks.map(b => {
      if (b.blockId !== blockId) return b;
      return {
        ...b,
        status: (b.status === 'completed' ? 'upcoming' : 'completed') as any
      };
    });
    const updated = { ...activePlan, blocks: updatedBlocks };
    setActivePlan(updated);
    storage.setActivePlan(updated);
  };

  // Load curated city route from Explore
  const handleLoadCuratedCity = (city: CityData) => {
    const plan = driftlessEngine.generateDayPlan({
      cityId: city.id,
      cityName: city.name,
      country: city.country,
      anchorCoords: city.coords,
      energy: 'balanced',
      budget: '$$',
      afterDark: 'well_lit',
      social: 'ambient'
    }, preferences);

    setActivePlan(plan);
    storage.setActivePlan(plan);
    setActiveTab('today');
  };

  // Save Guardrails Preferences
  const handleSaveGuardrails = (newPrefs: TravelerPreferences) => {
    setPreferences(newPrefs);
    storage.setPreferences(newPrefs);
  };

  // Toggle Simulated Offline
  const handleToggleSimulateOffline = () => {
    const nextVal = !storage.isSimulatedOffline();
    storage.setSimulatedOffline(nextVal);
    setIsOffline(storage.isOffline());
  };

  // Reset all data
  const handleResetAllData = () => {
    if (confirm("Reset all saved plans and preferences?")) {
      storage.clearAllData();
      setActivePlan(null);
      setPreferences(storage.getPreferences());
      setIsGuardrailsOpen(false);
      setActiveTab('calibrate');
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#EEF2E6] flex justify-center text-obsidian antialiased selection:bg-chartreuse selection:text-obsidian">
      <div className="w-full max-w-[440px] min-h-screen bg-canvas shadow-2xl relative flex flex-col border-x border-card-border overflow-x-hidden">
        {/* Ambient Pastel Glow Orbs for Glass Refraction */}
        <div className="pointer-events-none absolute -top-20 -left-20 w-72 h-72 rounded-full bg-chartreuse/20 blur-3xl -z-10" />
        <div className="pointer-events-none absolute top-1/3 -right-24 w-72 h-72 rounded-full bg-coral/10 blur-3xl -z-10" />
        <div className="pointer-events-none absolute bottom-40 -left-20 w-72 h-72 rounded-full bg-chartreuse/15 blur-3xl -z-10" />

        {/* 30-Second Persistent Undo Banner (PRD US-010) */}
        <UndoToast
          undoState={undoState}
          onUndo={handleUndo}
          onDismiss={() => storage.dismissUndo()}
        />

        {/* Offline Mode Banner */}
        <div className="px-5 pt-2">
          <OfflineBadge isOffline={isOffline} />
        </div>

        {/* Main Routed View */}
        {activeTab === 'calibrate' && (
          <CalibrationView
            preferences={preferences}
            onOpenGuardrails={() => setIsGuardrailsOpen(true)}
            onBuildPlan={handleBuildPlan}
          />
        )}

        {activeTab === 'today' && (
          activePlan ? (
            <ActiveCanvasView
              plan={activePlan}
              isOffline={isOffline}
              onOpenAdapt={() => setIsAdaptOpen(true)}
              onOpenSwap={(blk) => setSwappingBlock(blk)}
              onOpenGuardrails={() => setIsGuardrailsOpen(true)}
              onToggleBlockDone={handleToggleBlockDone}
            />
          ) : (
            <CalibrationView
              preferences={preferences}
              onOpenGuardrails={() => setIsGuardrailsOpen(true)}
              onBuildPlan={handleBuildPlan}
            />
          )
        )}

        {activeTab === 'explore' && (
          <ExploreView
            onLoadCity={handleLoadCuratedCity}
            onBackToPlan={() => setActiveTab(activePlan ? 'today' : 'calibrate')}
          />
        )}

        {/* Bottom Floating Navigation Dock */}
        <NavigationDock
          activeTab={activeTab}
          onSelectTab={(tab) => setActiveTab(tab)}
          onOpenAdapt={() => setIsAdaptOpen(true)}
          hasActivePlan={!!activePlan}
        />

        {/* Kinetic Radar Plan Synthesis Overlay */}
        {isGenerating && (
          <GeneratingTransition
            cityName={activePlan?.city.name || "Jaipur"}
            isQuickDemo={isQuickDemo}
            onComplete={() => setIsGenerating(false)}
            onCancel={() => setIsGenerating(false)}
          />
        )}

        {/* 1-Tap Adapt My Day Bottom Sheet */}
        {isAdaptOpen && activePlan && (
          <AdaptBottomSheet
            currentPlan={activePlan}
            onAdapt={handleAdaptDay}
            onClose={() => setIsAdaptOpen(false)}
          />
        )}

        {/* Single-Block Swap Bottom Sheet */}
        {swappingBlock && activePlan && (
          <SwapBottomSheet
            currentPlan={activePlan}
            block={swappingBlock}
            onSwapConfirm={handleSwapConfirm}
            onClose={() => setSwappingBlock(null)}
          />
        )}

        {/* Traveler Guardrails & Preferences Modal */}
        {isGuardrailsOpen && (
          <GuardrailsModal
            preferences={preferences}
            isSimulatedOffline={storage.isSimulatedOffline()}
            onSave={handleSaveGuardrails}
            onToggleSimulateOffline={handleToggleSimulateOffline}
            onResetAllData={handleResetAllData}
            onClose={() => setIsGuardrailsOpen(false)}
          />
        )}
      </div>
    </div>
  );
};

export default App;

