import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowLeftRight,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Compass,
  Cpu,
  Eye,
  EyeOff,
  Flame,
  HelpCircle,
  Orbit,
  Pause,
  Play,
  Sparkles,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { AstrolabeModal } from './AstrolabeModal.tsx';
import { AutomatorPanel } from './AutomatorPanel.tsx';
import { CodexModal } from './CodexModal.tsx';
import {
  OrreryScene3D,
  type OrrerySceneHandle,
} from './OrreryScene3D.tsx';
import { TutorialModal } from './TutorialModal.tsx';
import { OrreryAudioEngine } from './audio.ts';
import {
  ACHIEVEMENTS,
  ASCENSION_NODES,
  CAMERA_PRESETS,
  CRUCIBLE_CHAMBERS,
  DIRECTIVES,
  ERAS,
  MODULES_BY_ID,
  MODULE_DEFS,
  ORBITAL_RINGS,
  RINGS_BY_ID,
  RING_GEAR_MODES,
  TUTORIAL_QUESTS,
  ZODIAC_PALACES,
} from './content.ts';
import {
  ASCENSION_MIN_LUMINANCE,
  angularDistanceToZero,
  applyAutomatorPreset,
  applyOfflineProgress,
  areModulesSynergistic,
  calculatePendingStardust,
  catchGoldenComet,
  createInitialMetaState,
  createNewOrreryRun,
  getAdjacentSlots,
  getBulkRingUpgradeQuote,
  getCrucibleChamberCost,
  getGlobalLuminanceMultiplier,
  getInstalledSlotCount,
  getModuleInstallCost,
  getModuleUpgradeCost,
  getRingMeridianYield,
  getRingMilestoneMultiplier,
  getUnlockedAchievementCount,
  getUnlockedSlotCount,
  installSlotModule,
  isSlotUnlocked,
  performAstrolabeAscension,
  purchaseDirective,
  removeSlotModule,
  setOverdriveSpeed,
  setRingGearMode,
  skipTutorial,
  swapSlotModules,
  triggerManualImpulse,
  triggerSupernovaPulse,
  unlockAscensionNode,
  updateAutomatorRule,
  upgradeCrucibleChamber,
  upgradeOrUnlockRing,
  upgradeSlotModule,
} from './engine.ts';
import { formatDuration, formatNum, formatRate } from './format.ts';
import {
  AstralOrreryEmblemSvg,
  ModuleGlyphSvg,
  ResourceGlyphSvg,
} from './icons.tsx';
import {
  clearAllOrreryStorage,
  loadOrreryMeta,
  loadOrreryPrefs,
  loadOrreryRun,
  saveOrreryMeta,
  saveOrreryPrefs,
  saveOrreryRun,
} from './storage.ts';
import type {
  AscensionNodeId,
  AutomatorPresetId,
  AutomatorRule,
  BuyMode,
  CameraPresetId,
  CrucibleChamberId,
  DirectiveId,
  ModuleTypeId,
  OfflineProgressSummary,
  OrbitalRingId,
  OrreryMetaState,
  OrreryRunState,
  OverdriveSpeed,
  RingGearMode,
  StepEvents,
} from './types.ts';

type ScreenState = 'title' | 'playing' | 'paused' | 'victory';
type DockTab = 'rings' | 'zodiac' | 'crucible' | 'automator' | 'directives';

function hasAutostartFlag(): boolean {
  if (typeof window === 'undefined') return false;
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.get('autostart') === '1') return true;
  const hashQueryIdx = window.location.hash.indexOf('?');
  if (hashQueryIdx >= 0) {
    const hashParams = new URLSearchParams(
      window.location.hash.slice(hashQueryIdx),
    );
    if (hashParams.get('autostart') === '1') return true;
  }
  return false;
}

function cloneSnapshot(state: OrreryRunState): OrreryRunState {
  return {
    ...state,
    comet: { ...state.comet },
    rings: {
      mercury: { ...state.rings.mercury },
      venus: { ...state.rings.venus },
      terra: { ...state.rings.terra },
      mars: { ...state.rings.mars },
      jupiter: { ...state.rings.jupiter },
    },
    slots: state.slots.map((s) => (s ? { ...s } : null)),
    directives: { ...state.directives },
    crucible: {
      ...state.crucible,
      chambers: { ...state.crucible.chambers },
    },
    automator: {
      ...state.automator,
      rules: state.automator.rules.map((r) => ({ ...r })),
    },
    lastSyzygy: state.lastSyzygy ? { ...state.lastSyzygy } : null,
  };
}

export default function AstralOrreryApp() {
  const initialData = useMemo(() => {
    const loadedMeta = loadOrreryMeta();
    const savedRun = loadOrreryRun(loadedMeta);
    const hasSaved = savedRun !== null;
    const activeRun = savedRun ?? createNewOrreryRun(loadedMeta);
    let offline: OfflineProgressSummary | null = null;

    if (savedRun && loadedMeta.lastSavedAt > 0) {
      const elapsedSec = (Date.now() - loadedMeta.lastSavedAt) / 1000;
      offline = applyOfflineProgress(activeRun, loadedMeta, elapsedSec);
    }

    return { loadedMeta, activeRun, hasSaved, offline };
  }, []);

  const runRef = useRef<OrreryRunState>(initialData.activeRun);
  const metaRef = useRef<OrreryMetaState>(initialData.loadedMeta);
  const sceneHandleRef = useRef<OrrerySceneHandle | null>(null);
  const audioRef = useRef<OrreryAudioEngine | null>(null);

  const [hasSavedRun, setHasSavedRun] = useState<boolean>(initialData.hasSaved);
  const [offlineBanner, setOfflineBanner] =
    useState<OfflineProgressSummary | null>(initialData.offline);

  const [prefs, setPrefs] = useState(() => loadOrreryPrefs());
  const [screenState, setScreenState] = useState<ScreenState>(() =>
    hasAutostartFlag() ? 'playing' : 'title',
  );

  const [uiRun, setUiRun] = useState<OrreryRunState>(() =>
    cloneSnapshot(runRef.current),
  );
  const [uiMeta, setUiMeta] = useState<OrreryMetaState>(() => ({
    ...metaRef.current,
    ascensionNodes: { ...metaRef.current.ascensionNodes },
    achievements: { ...metaRef.current.achievements },
  }));

  const [dockTab, setDockTab] = useState<DockTab>('rings');
  const [selectedSlot, setSelectedSlot] = useState<number>(0);
  const [swapSourceSlot, setSwapSourceSlot] = useState<number | null>(null);
  const [showAstrolabeModal, setShowAstrolabeModal] = useState<boolean>(false);
  const [showCodexModal, setShowCodexModal] = useState<boolean>(false);
  const [showTutorialModal, setShowTutorialModal] = useState<boolean>(false);
  const [eraToast, setEraToast] = useState<string | null>(null);
  const [replayCoachStep, setReplayCoachStep] = useState<number | null>(null);

  const syncUiImmediate = useCallback(() => {
    setUiRun(cloneSnapshot(runRef.current));
    setUiMeta({
      ...metaRef.current,
      ascensionNodes: { ...metaRef.current.ascensionNodes },
      achievements: { ...metaRef.current.achievements },
    });
  }, []);

  const pausedRef = useRef<boolean>(false);
  pausedRef.current =
    screenState === 'paused' ||
    screenState === 'victory' ||
    showAstrolabeModal ||
    showCodexModal ||
    showTutorialModal;

  const isTitleScreenRef = useRef<boolean>(screenState === 'title');
  isTitleScreenRef.current = screenState === 'title';

  const selectedSlotRef = useRef<number>(selectedSlot);
  selectedSlotRef.current = selectedSlot;

  const gimbal3dModeRef = useRef<boolean>(prefs.gimbal3dMode);
  gimbal3dModeRef.current = prefs.gimbal3dMode;

  useEffect(() => {
    const audio = new OrreryAudioEngine(prefs.muted);
    audioRef.current = audio;
    return () => {
      saveOrreryRun(runRef.current);
      saveOrreryMeta(metaRef.current);
      audio.dispose();
      audioRef.current = null;
      if (typeof document !== 'undefined') {
        delete document.body.dataset.state;
      }
    };
  }, []);

  useEffect(() => {
    audioRef.current?.setMuted(prefs.muted);
    saveOrreryPrefs(prefs);
  }, [prefs]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (screenState === 'title') {
      document.body.dataset.state = 'title';
    } else if (screenState === 'paused') {
      document.body.dataset.state = 'paused';
    } else if (screenState === 'victory') {
      document.body.dataset.state = 'gameover';
    } else {
      document.body.dataset.state = 'playing';
    }
  }, [screenState]);

  useEffect(() => {
    if (screenState !== 'playing') return;

    const uiTimer = window.setInterval(() => {
      setUiRun(cloneSnapshot(runRef.current));
    }, 125);

    const saveTimer = window.setInterval(() => {
      saveOrreryRun(runRef.current);
      saveOrreryMeta(metaRef.current);
    }, 4000);

    const onBeforeUnload = () => {
      saveOrreryRun(runRef.current);
      saveOrreryMeta(metaRef.current);
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      window.clearInterval(uiTimer);
      window.clearInterval(saveTimer);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [screenState]);

  useEffect(() => {
    if (!eraToast) return;
    const t = window.setTimeout(() => setEraToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [eraToast]);

  const announceActionMilestones = useCallback(
    (prevTutorialStep: number, prevAchCount: number) => {
      const nextStep = runRef.current.tutorialStep;
      const nextAchCount = getUnlockedAchievementCount(metaRef.current);
      if (nextStep > prevTutorialStep) {
        const finished = TUTORIAL_QUESTS[prevTutorialStep];
        if (nextStep >= TUTORIAL_QUESTS.length) {
          setEraToast(
            `完成全部司天初阶指引！获得毕业贺礼 +${finished.rewardLuminance} 星辉 · +${finished.rewardAether} 以太 · +${finished.rewardFlux} 通量`,
          );
          audioRef.current?.playAscensionFanfare();
        } else if (finished) {
          setEraToast(`完成「${finished.title}」· ${finished.rewardText}`);
          audioRef.current?.playSyzygyChord(2);
        }
      } else if (nextAchCount > prevAchCount) {
        const latestAch = ACHIEVEMENTS.find(
          (a) =>
            metaRef.current.achievements[a.id] && !uiMeta.achievements[a.id],
        );
        if (latestAch) {
          setEraToast(
            `达成司天成就【${latestAch.name}】· 全局星辉永久 +12%`,
          );
        }
      }
    },
    [uiMeta.achievements],
  );

  const handleStepEvents = useCallback((ev: StepEvents) => {
    if (ev.automatorAscended) {
      audioRef.current?.playAscensionFanfare();
      setEraToast(
        `发条智械自动完成星盘重铸！收获 +${formatNum(ev.automatorAscended.earnedStardust)} 天枢星尘`,
      );
      setUiMeta({
        ...metaRef.current,
        ascensionNodes: { ...metaRef.current.ascensionNodes },
        achievements: { ...metaRef.current.achievements },
      });
      return;
    }

    if (ev.supernovaTriggeredByAuto) {
      audioRef.current?.playSupernovaBoom();
    }

    if (ev.syzygy) {
      audioRef.current?.playSyzygyChord(ev.syzygy.bodyCount);
    } else if (ev.meridianStrikes.length > 0) {
      const firstRing = RINGS_BY_ID[ev.meridianStrikes[0].ringId];
      audioRef.current?.playMeridianStrike(firstRing.index);
    }

    if (ev.cometAutoCaptured) {
      audioRef.current?.playSyzygyChord(3);
    }

    if (ev.eraUnlocked) {
      const metaEra = ERAS.find((e) => e.era === ev.eraUnlocked);
      if (metaEra) {
        setEraToast(`解锁 ${metaEra.title} · ${metaEra.subtitle}`);
      }
      audioRef.current?.playAscensionFanfare();
    } else if (ev.tutorialCompletedStep !== null) {
      const finished = TUTORIAL_QUESTS[ev.tutorialCompletedStep];
      if (finished) {
        setEraToast(`完成「${finished.title}」· ${finished.rewardText}`);
      }
      audioRef.current?.playSyzygyChord(2);
    } else if (ev.unlockedAchievements.length > 0) {
      const achDef = ACHIEVEMENTS.find(
        (a) => a.id === ev.unlockedAchievements[0],
      );
      if (achDef) {
        setEraToast(`达成司天成就【${achDef.name}】· 全局星辉永久 +12%`);
      }
      setUiMeta({
        ...metaRef.current,
        ascensionNodes: { ...metaRef.current.ascensionNodes },
        achievements: { ...metaRef.current.achievements },
      });
    }
  }, []);

  const onStepEventsRef = useRef(handleStepEvents);
  onStepEventsRef.current = handleStepEvents;

  const handleSelectSlotFrom3D = useCallback((slotIndex: number) => {
    setSelectedSlot(slotIndex);
    setDockTab('zodiac');
    setPrefs((p) => (p.dockCollapsed ? { ...p, dockCollapsed: false } : p));
    audioRef.current?.playBrassRatchet();
  }, []);

  const onSelectSlotRef = useRef(handleSelectSlotFrom3D);
  onSelectSlotRef.current = handleSelectSlotFrom3D;

  const handleManualImpulse = useCallback(() => {
    if (screenState !== 'playing') return;
    const prevStep = runRef.current.tutorialStep;
    const prevAch = getUnlockedAchievementCount(metaRef.current);
    const res = triggerManualImpulse(runRef.current, metaRef.current);
    audioRef.current?.playEscapementTick(res.isPerfect);
    sceneHandleRef.current?.triggerBurst({
      kind: res.isPerfect ? 'perfect_impulse' : 'impulse',
    });
    setReplayCoachStep((s) => (s === 0 ? 1 : s));
    announceActionMilestones(prevStep, prevAch);
    syncUiImmediate();
  }, [announceActionMilestones, screenState, syncUiImmediate]);

  const onCenterImpulseRef = useRef(handleManualImpulse);
  onCenterImpulseRef.current = handleManualImpulse;

  const handleTriggerSupernova = useCallback(() => {
    if (screenState !== 'playing') return;
    const res = triggerSupernovaPulse(runRef.current, metaRef.current);
    if (!res) return;
    audioRef.current?.playSupernovaBoom();
    sceneHandleRef.current?.triggerBurst({ kind: 'supernova' });
    setEraToast(
      `超新星坍缩脉冲释放！已将 ${res.alignedPlanets} 颗星体强行聚拢向黄金子午门，开启 8s ×2.0 超载！`,
    );
    saveOrreryRun(runRef.current);
    syncUiImmediate();
  }, [screenState, syncUiImmediate]);

  const handleCatchComet = useCallback(() => {
    if (screenState !== 'playing') return;
    const res = catchGoldenComet(runRef.current, metaRef.current, false);
    if (!res) return;
    audioRef.current?.playSyzygyChord(3);
    sceneHandleRef.current?.triggerBurst({ kind: 'comet' });
    setEraToast(
      `拦截流火彗星！+${formatNum(res.gainedLuminance)} 星辉 · +${res.gainedFlux} 通量 · 开启 ${res.frenzyAddedSec}s ×2.5 狂热`,
    );
    saveOrreryRun(runRef.current);
    syncUiImmediate();
  }, [screenState, syncUiImmediate]);

  const onCatchCometRef = useRef(handleCatchComet);
  onCatchCometRef.current = handleCatchComet;

  const handleSkipTutorial = useCallback(() => {
    setReplayCoachStep(null);
    skipTutorial(runRef.current, metaRef.current);
    saveOrreryRun(runRef.current);
    saveOrreryMeta(metaRef.current);
    syncUiImmediate();
  }, [syncUiImmediate]);

  const handleStartReplayGuide = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setShowTutorialModal(false);
    setPrefs((p) => ({ ...p, zenMode: false, dockCollapsed: false }));
    setDockTab('rings');
    setReplayCoachStep(0);
    setHasSavedRun(true);
    saveOrreryRun(runRef.current);
    saveOrreryMeta(metaRef.current);
    syncUiImmediate();
    setScreenState('playing');
    audioRef.current?.playBrassRatchet();
  }, [syncUiImmediate]);

  const handleContinueOrStart = useCallback(
    (forceFresh: boolean) => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      if (forceFresh) {
        metaRef.current.tutorialCompletedEver = false;
        runRef.current = createNewOrreryRun(metaRef.current);
        setOfflineBanner(null);
      }
      setShowTutorialModal(false);
      setHasSavedRun(true);
      saveOrreryRun(runRef.current);
      saveOrreryMeta(metaRef.current);
      syncUiImmediate();
      setScreenState('playing');
      audioRef.current?.playBrassRatchet();
    },
    [syncUiImmediate],
  );

  const handleUpgradeRing = useCallback(
    (ringId: OrbitalRingId) => {
      const prevStep = runRef.current.tutorialStep;
      const prevAch = getUnlockedAchievementCount(metaRef.current);
      if (
        upgradeOrUnlockRing(
          runRef.current,
          metaRef.current,
          ringId,
          prefs.buyMode,
        )
      ) {
        audioRef.current?.playBrassRatchet();
        setReplayCoachStep((s) => (s === 1 ? 2 : s === 4 ? null : s));
        announceActionMilestones(prevStep, prevAch);
        saveOrreryRun(runRef.current);
        saveOrreryMeta(metaRef.current);
        syncUiImmediate();
      }
    },
    [announceActionMilestones, prefs.buyMode, syncUiImmediate],
  );

  const handleChangeGearMode = useCallback(
    (ringId: OrbitalRingId, mode: RingGearMode) => {
      if (setRingGearMode(runRef.current, metaRef.current, ringId, mode)) {
        audioRef.current?.playBrassRatchet();
        setReplayCoachStep((s) => (s === 1 ? 2 : s));
        saveOrreryRun(runRef.current);
        syncUiImmediate();
      }
    },
    [syncUiImmediate],
  );

  const handleUpgradeCrucible = useCallback(
    (chamberId: CrucibleChamberId) => {
      const prevAch = getUnlockedAchievementCount(metaRef.current);
      if (
        upgradeCrucibleChamber(runRef.current, metaRef.current, chamberId)
      ) {
        audioRef.current?.playBrassRatchet();
        sceneHandleRef.current?.triggerBurst({ kind: 'impulse' });
        setReplayCoachStep((s) => (s === 4 ? null : s));
        announceActionMilestones(runRef.current.tutorialStep, prevAch);
        saveOrreryRun(runRef.current);
        saveOrreryMeta(metaRef.current);
        syncUiImmediate();
      }
    },
    [announceActionMilestones, syncUiImmediate],
  );

  const handlePurchaseDirective = useCallback(
    (dirId: DirectiveId) => {
      if (purchaseDirective(runRef.current, metaRef.current, dirId)) {
        if (dirId === 'prime_ignition') {
          audioRef.current?.playAscensionFanfare();
          sceneHandleRef.current?.triggerBurst({ kind: 'ascension' });
          setScreenState('victory');
        } else {
          audioRef.current?.playBrassRatchet();
        }
        saveOrreryRun(runRef.current);
        saveOrreryMeta(metaRef.current);
        syncUiImmediate();
      }
    },
    [syncUiImmediate],
  );

  const handleInstallModule = useCallback(
    (typeId: ModuleTypeId) => {
      const prevStep = runRef.current.tutorialStep;
      const prevAch = getUnlockedAchievementCount(metaRef.current);
      if (
        installSlotModule(
          runRef.current,
          metaRef.current,
          selectedSlot,
          typeId,
        )
      ) {
        audioRef.current?.playBrassRatchet();
        setReplayCoachStep((s) => (s === 3 ? 4 : s));
        announceActionMilestones(prevStep, prevAch);
        saveOrreryRun(runRef.current);
        saveOrreryMeta(metaRef.current);
        syncUiImmediate();
      }
    },
    [announceActionMilestones, selectedSlot, syncUiImmediate],
  );

  const handleUpgradeModule = useCallback(() => {
    if (upgradeSlotModule(runRef.current, metaRef.current, selectedSlot)) {
      audioRef.current?.playBrassRatchet();
      setReplayCoachStep((s) => (s === 3 ? 4 : s));
      saveOrreryRun(runRef.current);
      syncUiImmediate();
    }
  }, [selectedSlot, syncUiImmediate]);

  const handleRemoveModule = useCallback(() => {
    if (removeSlotModule(runRef.current, metaRef.current, selectedSlot)) {
      setSwapSourceSlot(null);
      audioRef.current?.playBrassRatchet();
      saveOrreryRun(runRef.current);
      syncUiImmediate();
    }
  }, [selectedSlot, syncUiImmediate]);

  const handleSlotButtonSelect = useCallback(
    (idx: number) => {
      if (
        swapSourceSlot !== null &&
        swapSourceSlot !== idx &&
        isSlotUnlocked(runRef.current, idx)
      ) {
        if (
          swapSlotModules(
            runRef.current,
            metaRef.current,
            swapSourceSlot,
            idx,
          )
        ) {
          audioRef.current?.playBrassRatchet();
          saveOrreryRun(runRef.current);
          syncUiImmediate();
        }
        setSwapSourceSlot(null);
        setSelectedSlot(idx);
        return;
      }
      setSelectedSlot(idx);
      if (runRef.current.slots[idx] !== null) {
        setReplayCoachStep((s) => (s === 3 ? 4 : s));
      }
    },
    [swapSourceSlot, syncUiImmediate],
  );

  const handleOverdriveChange = useCallback(
    (speed: OverdriveSpeed) => {
      const prevStep = runRef.current.tutorialStep;
      const prevAch = getUnlockedAchievementCount(metaRef.current);
      if (setOverdriveSpeed(runRef.current, metaRef.current, speed)) {
        audioRef.current?.playBrassRatchet();
        if (speed >= 2) {
          setReplayCoachStep((s) => (s === 2 ? 3 : s));
        }
        announceActionMilestones(prevStep, prevAch);
        saveOrreryRun(runRef.current);
        saveOrreryMeta(metaRef.current);
        syncUiImmediate();
      }
    },
    [announceActionMilestones, syncUiImmediate],
  );

  const handleUnlockAscensionNode = useCallback(
    (nodeId: AscensionNodeId) => {
      if (unlockAscensionNode(metaRef.current, nodeId, runRef.current)) {
        audioRef.current?.playAscensionFanfare();
        saveOrreryMeta(metaRef.current);
        saveOrreryRun(runRef.current);
        syncUiImmediate();
      }
    },
    [syncUiImmediate],
  );

  const handlePerformAscension = useCallback(() => {
    const res = performAstrolabeAscension(runRef.current, metaRef.current);
    if (!res) return;
    runRef.current = res.nextRun;
    setSwapSourceSlot(null);
    setSelectedSlot(0);
    const hasAffordableNode = ASCENSION_NODES.some(
      (n) =>
        !metaRef.current.ascensionNodes[n.id] &&
        (!n.requires || metaRef.current.ascensionNodes[n.requires]) &&
        metaRef.current.stardust >= n.costStardust,
    );
    setShowAstrolabeModal(hasAffordableNode);
    setEraToast(
      `星盘重铸完成！收获 +${formatNum(res.earnedStardust)} 天枢星尘${
        hasAffordableNode ? '，可立即铭刻星宿天赋' : ''
      }`,
    );
    setScreenState('playing');
    audioRef.current?.playAscensionFanfare();
    sceneHandleRef.current?.triggerBurst({ kind: 'ascension' });
    saveOrreryMeta(metaRef.current);
    saveOrreryRun(runRef.current);
    syncUiImmediate();
  }, [syncUiImmediate]);

  const handleHardReset = useCallback(() => {
    clearAllOrreryStorage();
    metaRef.current = createInitialMetaState();
    runRef.current = createNewOrreryRun(metaRef.current);
    setHasSavedRun(false);
    setOfflineBanner(null);
    setShowCodexModal(false);
    setShowAstrolabeModal(false);
    setShowTutorialModal(false);
    syncUiImmediate();
    setScreenState('title');
  }, [syncUiImmediate]);

  // Automator callbacks
  const handleToggleAutomatorMaster = useCallback(() => {
    runRef.current.automator.enabled = !runRef.current.automator.enabled;
    runRef.current.autoUpgradeEnabled = runRef.current.automator.enabled;
    audioRef.current?.playBrassRatchet();
    setReplayCoachStep((s) => (s === 4 ? null : s));
    saveOrreryRun(runRef.current);
    syncUiImmediate();
  }, [syncUiImmediate]);

  const handleChangeReserveRatio = useCallback(
    (ratio: number) => {
      runRef.current.automator.reserveRatio = ratio;
      audioRef.current?.playBrassRatchet();
      saveOrreryRun(runRef.current);
      syncUiImmediate();
    },
    [syncUiImmediate],
  );

  const handleApplyPreset = useCallback(
    (presetId: AutomatorPresetId) => {
      applyAutomatorPreset(runRef.current, presetId);
      audioRef.current?.playBrassRatchet();
      saveOrreryRun(runRef.current);
      syncUiImmediate();
    },
    [syncUiImmediate],
  );

  const handleUpdateAutomatorRule = useCallback(
    (
      index: number,
      patch: Partial<
        Pick<AutomatorRule, 'enabled' | 'condition' | 'threshold' | 'action'>
      >,
    ) => {
      updateAutomatorRule(runRef.current, index, patch);
      saveOrreryRun(runRef.current);
      syncUiImmediate();
    },
    [syncUiImmediate],
  );

  const handleMoveAutomatorRule = useCallback(
    (index: number, direction: -1 | 1) => {
      const rules = runRef.current.automator.rules;
      const targetIdx = index + direction;
      if (targetIdx < 0 || targetIdx >= rules.length) return;
      const tmp = rules[index];
      rules[index] = rules[targetIdx];
      rules[targetIdx] = tmp;
      runRef.current.automator.activePreset = 'custom';
      audioRef.current?.playBrassRatchet();
      saveOrreryRun(runRef.current);
      syncUiImmediate();
    },
    [syncUiImmediate],
  );

  // Global Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.code === 'KeyH') {
        e.preventDefault();
        setShowTutorialModal((prev) => !prev);
        return;
      }

      if (screenState === 'title') {
        if (e.code === 'Escape' && showTutorialModal) {
          e.preventDefault();
          setShowTutorialModal(false);
          return;
        }
        if (
          !showTutorialModal &&
          (e.code === 'Enter' || e.code === 'Space')
        ) {
          e.preventDefault();
          handleContinueOrStart(false);
        }
        return;
      }

      if (e.code === 'Escape') {
        e.preventDefault();
        if (showTutorialModal) {
          setShowTutorialModal(false);
        } else if (showAstrolabeModal) {
          setShowAstrolabeModal(false);
        } else if (showCodexModal) {
          setShowCodexModal(false);
        } else if (screenState === 'paused') {
          setScreenState('playing');
        } else if (screenState === 'playing') {
          setScreenState('paused');
        }
        return;
      }

      if (showTutorialModal || showAstrolabeModal || showCodexModal) return;

      if (e.code === 'KeyP') {
        e.preventDefault();
        setScreenState((prev) =>
          prev === 'paused' ? 'playing' : prev === 'playing' ? 'paused' : prev,
        );
        return;
      }

      if (e.code === 'KeyM') {
        e.preventDefault();
        setPrefs((p) => ({ ...p, muted: !p.muted }));
        return;
      }

      if (e.code === 'KeyZ' && screenState === 'playing') {
        e.preventDefault();
        setPrefs((p) => ({ ...p, zenMode: !p.zenMode }));
        return;
      }

      if (e.code === 'Tab' && screenState === 'playing') {
        e.preventDefault();
        setPrefs((p) => ({ ...p, dockCollapsed: !p.dockCollapsed }));
        return;
      }

      if (screenState !== 'playing') return;

      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        handleManualImpulse();
      } else if (e.code === 'KeyE' && !e.repeat) {
        e.preventDefault();
        handleTriggerSupernova();
      } else if (e.code === 'Digit1') {
        handleOverdriveChange(1);
      } else if (e.code === 'Digit2') {
        handleOverdriveChange(2);
      } else if (e.code === 'Digit3') {
        handleOverdriveChange(4);
      } else if (e.code === 'Digit4') {
        handleOverdriveChange(8);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleContinueOrStart,
    handleManualImpulse,
    handleOverdriveChange,
    handleTriggerSupernova,
    screenState,
    showAstrolabeModal,
    showCodexModal,
    showTutorialModal,
  ]);

  const currentEraMeta = ERAS.find((e) => e.era === uiRun.era) ?? ERAS[0];
  const nextEraMeta = ERAS.find((e) => e.era === uiRun.era + 1) ?? null;
  const pendingStardust = calculatePendingStardust(uiRun);
  const globalMult = getGlobalLuminanceMultiplier(uiRun, uiMeta);
  const unlockedSlotsCount = getUnlockedSlotCount(uiRun);
  const installedSlotsCount = getInstalledSlotCount(uiRun);
  const activeQuest =
    replayCoachStep !== null && replayCoachStep < TUTORIAL_QUESTS.length
      ? TUTORIAL_QUESTS[replayCoachStep]
      : uiRun.tutorialStep < TUTORIAL_QUESTS.length
        ? TUTORIAL_QUESTS[uiRun.tutorialStep]
        : null;

  const handleFocusQuestTarget = useCallback(() => {
    if (!activeQuest) return;
    setPrefs((p) => ({ ...p, dockCollapsed: false }));
    if (activeQuest.targetArea === 'zodiac') {
      setDockTab('zodiac');
    } else {
      setDockTab('rings');
    }
    audioRef.current?.playBrassRatchet();
  }, [activeQuest]);

  const perfectWindow = uiMeta.ascensionNodes.wide_meridian ? 0.42 : 0.28;
  const isMeridianReady = ORBITAL_RINGS.some(
    (d) =>
      uiRun.rings[d.id].unlocked &&
      angularDistanceToZero(uiRun.rings[d.id].angle) <= perfectWindow,
  );

  const affordableDirectivesCount = DIRECTIVES.filter(
    (d) =>
      !uiRun.directives[d.id] &&
      uiRun.era >= d.era &&
      uiRun.luminance >= d.costLuminance &&
      uiRun.aether >= d.costAether,
  ).length;

  const affordableCrucibleCount = CRUCIBLE_CHAMBERS.filter((ch) => {
    const cost = getCrucibleChamberCost(ch.id, uiRun);
    return (
      uiRun.crucible.stellarFlux >= cost.flux && uiRun.aether >= cost.aether
    );
  }).length;

  const selectedPalace = ZODIAC_PALACES[selectedSlot];
  const selectedSlotUnlocked = isSlotUnlocked(uiRun, selectedSlot);
  const selectedModule = uiRun.slots[selectedSlot];

  const tensionPct = Math.min(
    100,
    Math.max(
      0,
      (uiRun.springTensionSec / Math.max(1, uiRun.maxSpringTensionSec)) * 100,
    ),
  );

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#060A14] text-[#F8FAFC] select-none">
      {/* 100% Full-Bleed 3D Spatial WebGL Observatory */}
      <OrreryScene3D
        ref={sceneHandleRef}
        runRef={runRef}
        metaRef={metaRef}
        pausedRef={pausedRef}
        isTitleScreenRef={isTitleScreenRef}
        selectedSlotRef={selectedSlotRef}
        gimbal3dModeRef={gimbal3dModeRef}
        cameraPreset={prefs.cameraPreset}
        onStepEventsRef={onStepEventsRef}
        onSelectSlotRef={onSelectSlotRef}
        onCenterImpulseRef={onCenterImpulseRef}
        onCatchCometRef={onCatchCometRef}
      />

      {/* =================================================================== */}
      {/* TITLE SCREEN OVERLAY (Negative-Space Left Column Over Live 3D Tour) */}
      {/* =================================================================== */}
      {screenState === 'title' && (
        <section
          aria-label="浑天仪标题与启动面板"
          className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-between p-6 sm:p-10 lg:p-14"
        >
          <div className="pointer-events-auto my-auto max-w-md p-6 sm:p-8 rounded-2xl bg-[#080E1C]/92 border border-[#C89B54]/55 shadow-2xl space-y-5">
            <AstralOrreryEmblemSvg className="w-18 h-18" />

            <div className="space-y-2">
              <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#FDE68A] text-balance">
                天枢浑仪 · ASTRAL ORRERY
              </h1>
              <p className="text-sm text-[#CBD5E1] leading-relaxed">
                三维陀螺星轨与可编程差分智械增量天文台。微调五曜泛音齿比，点燃底座三态以太星炉，编写 IF-THEN 发条智械阵列，引爆共面【朔望连珠】。
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                data-start="true"
                onClick={() => handleContinueOrStart(false)}
                className="px-5 py-2.5 rounded-xl bg-[#F59E0B] hover:bg-[#D97706] text-[#090D16] text-sm font-bold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{hasSavedRun ? '继续运转浑仪' : '启动浑仪'}</span>
              </button>

              <button
                type="button"
                data-testid="open-tutorial-title-btn"
                onClick={() => setShowTutorialModal(true)}
                className="px-4 py-2.5 rounded-xl bg-[#121E36] hover:bg-[#1B2C4D] border border-[#C89B54]/60 text-sm font-semibold text-[#F8FAFC] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <HelpCircle className="w-4 h-4 text-[#FBBF24]" />
                <span>新手指引</span>
              </button>

              {hasSavedRun && (
                <button
                  type="button"
                  onClick={() => handleContinueOrStart(true)}
                  className="px-3.5 py-2.5 rounded-xl bg-[#0D1628] hover:bg-[#16233D] border border-[#334155] text-xs font-medium text-[#94A3B8] hover:text-white cursor-pointer whitespace-nowrap"
                >
                  从零校准新盘
                </button>
              )}
            </div>
          </div>

          <div className="text-xs text-[#94A3B8] font-mono-num">
            鼠标拖拽旋转视角 · 滚轮缩放 · Space 拨动擒纵 · E 超新星脉冲 · Tab 收起控制台 · H 指引
          </div>
        </section>
      )}

      {/* =================================================================== */}
      {/* PLAYING HUD OVERLAY (Pointer-Events Pass-Through to 3D Canvas)      */}
      {/* =================================================================== */}
      {screenState !== 'title' && (
        <div className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-between">
          {/* TOP TELEMETRY & CAMERA BAR */}
          <div className="space-y-1.5">
            <header className="pointer-events-auto px-3 sm:px-5 py-2 bg-[#080E1C]/95 border-b border-[#C89B54]/35 flex flex-wrap items-center justify-between gap-3">
              {/* Left: Live Currencies */}
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <ResourceGlyphSvg
                    kind="luminance"
                    className="w-4 h-4 self-center shrink-0"
                  />
                  <span className="text-xs text-[#94A3B8]">星辉</span>
                  <span
                    data-testid="luminance-value"
                    className="text-lg sm:text-xl font-bold font-mono-num text-[#FDE68A]"
                  >
                    {formatNum(uiRun.luminance)}
                  </span>
                  <span
                    data-testid="luminance-rate"
                    className="text-xs font-mono-num font-semibold text-[#F59E0B]"
                  >
                    {formatRate(uiRun.luminancePerSec)}
                  </span>
                </div>

                <div className="flex items-baseline gap-1.5">
                  <ResourceGlyphSvg
                    kind="flux"
                    className="w-3.5 h-3.5 self-center shrink-0"
                  />
                  <span className="text-xs text-[#94A3B8]">通量</span>
                  <span
                    data-testid="flux-value"
                    className="text-sm sm:text-base font-bold font-mono-num text-[#FB923C]"
                  >
                    {formatNum(uiRun.crucible.stellarFlux)}
                  </span>
                </div>

                {(uiRun.era >= 2 ||
                  uiRun.aether > 0 ||
                  uiRun.totalAetherRun > 0) && (
                  <div className="flex items-baseline gap-1.5">
                    <ResourceGlyphSvg
                      kind="aether"
                      className="w-3.5 h-3.5 self-center shrink-0"
                    />
                    <span className="text-xs text-[#94A3B8]">以太</span>
                    <span
                      data-testid="aether-value"
                      className="text-sm sm:text-base font-bold font-mono-num text-[#38BDF8]"
                    >
                      {formatNum(uiRun.aether)}
                    </span>
                  </div>
                )}

                {(uiMeta.totalStardustEarned > 0 || pendingStardust > 0) && (
                  <div className="flex items-baseline gap-1.5">
                    <ResourceGlyphSvg
                      kind="stardust"
                      className="w-3.5 h-3.5 self-center shrink-0"
                    />
                    <span className="text-xs text-[#94A3B8]">星尘</span>
                    <span className="text-sm sm:text-base font-bold font-mono-num text-[#A5B4FC]">
                      {formatNum(uiMeta.stardust)}
                    </span>
                  </div>
                )}

                {uiRun.frenzySecondsLeft > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-mono-num font-bold text-[#FDE047]">
                    <Flame className="w-3.5 h-3.5 text-[#F59E0B]" />
                    狂热 ×2.5 ({Math.ceil(uiRun.frenzySecondsLeft)}s)
                  </span>
                )}

                {uiRun.crucible.supernovaSecondsLeft > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-mono-num font-bold text-[#67E8F9]">
                    <Zap className="w-3.5 h-3.5 text-[#38BDF8]" />
                    坍缩超载 ×2.0 ({Math.ceil(uiRun.crucible.supernovaSecondsLeft)}s)
                  </span>
                )}

                <span className="hidden 2xl:inline text-xs font-mono-num text-[#94A3B8]">
                  {currentEraMeta.title} · 全局 ×{globalMult.toFixed(2)}
                  {nextEraMeta
                    ? ` · 下纪元 ${formatNum(uiRun.totalLuminanceRun)}/${formatNum(nextEraMeta.unlockLuminance)}`
                    : ''}
                </span>
              </div>

              {/* Center-Right: 3D Camera Choreography & Gimbal Inclination Controls */}
              <div className="flex flex-wrap items-center gap-1.5">
                <select
                  aria-label="切换三维观测视角"
                  value={prefs.cameraPreset}
                  onChange={(e) => {
                    const nextCam = e.target.value as CameraPresetId;
                    setPrefs((p) => ({ ...p, cameraPreset: nextCam }));
                    sceneHandleRef.current?.snapToPreset(nextCam);
                  }}
                  className="md:hidden px-2 py-1 rounded-lg bg-[#0F182C] border border-[#243452] text-xs font-semibold text-[#FDE68A] cursor-pointer"
                >
                  {CAMERA_PRESETS.map((cam) => (
                    <option key={cam.id} value={cam.id}>
                      视角：{cam.label}
                    </option>
                  ))}
                </select>

                <div
                  role="group"
                  aria-label="三维观测视角切换"
                  className="hidden md:inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-[#0F182C] border border-[#243452]"
                >
                  {CAMERA_PRESETS.map((cam) => {
                    const active = prefs.cameraPreset === cam.id;
                    return (
                      <button
                        key={cam.id}
                        type="button"
                        title={cam.hint}
                        onClick={() => {
                          setPrefs((p) => ({ ...p, cameraPreset: cam.id }));
                          sceneHandleRef.current?.snapToPreset(cam.id);
                        }}
                        className={`px-2 py-1 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap ${
                          active
                            ? 'bg-[#C89B54] text-[#090D16]'
                            : 'text-[#94A3B8] hover:text-white'
                        }`}
                      >
                        {cam.label}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  title="切换五曜星环三维立体倾角进动与水平共面模式"
                  onClick={() =>
                    setPrefs((p) => ({ ...p, gimbal3dMode: !p.gimbal3dMode }))
                  }
                  className={`hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    prefs.gimbal3dMode
                      ? 'bg-[#14223D] text-[#38BDF8] border-[#38BDF8]/50'
                      : 'bg-[#0F182C] text-[#94A3B8] border-[#243452]'
                  }`}
                >
                  <Orbit className="w-3.5 h-3.5" />
                  <span>{prefs.gimbal3dMode ? '3D倾角' : '共面盘'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowAstrolabeModal(true)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap border ${
                    pendingStardust > 0
                      ? 'bg-[#F59E0B] text-[#090D16] border-[#FEF08A]'
                      : 'bg-[#121E36] hover:bg-[#1A2B4C] text-[#FDE68A] border-[#C89B54]/50'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    星盘天球
                    {pendingStardust > 0 ? ` (+${formatNum(pendingStardust)})` : ''}
                  </span>
                </button>

                <button
                  type="button"
                  aria-label="新手指引 [H]"
                  title="打开三维图文指南 [H]"
                  onClick={() => setShowTutorialModal(true)}
                  className="px-2 py-1 rounded-lg bg-[#121E36] hover:bg-[#1A2B4C] border border-[#293B5C] text-xs font-medium text-[#E2E8F0] inline-flex items-center gap-1 cursor-pointer"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-[#FBBF24]" />
                  <span className="hidden lg:inline">指引</span>
                </button>

                <button
                  type="button"
                  aria-label="司天典籍"
                  onClick={() => setShowCodexModal(true)}
                  className="px-2 py-1 rounded-lg bg-[#121E36] hover:bg-[#1A2B4C] border border-[#293B5C] text-xs font-medium text-[#E2E8F0] inline-flex items-center gap-1 cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">典籍</span>
                </button>

                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={
                    prefs.zenMode ? '退出专注伴侣模式 [Z]' : '开启专注伴侣模式 [Z]'
                  }
                  title="隐藏全部面板纯享 3D 浑天仪 [Z]"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    setPrefs((p) => ({ ...p, zenMode: !p.zenMode }));
                  }}
                  className={`p-1.5 rounded-lg border cursor-pointer ${
                    prefs.zenMode
                      ? 'bg-[#F59E0B] text-[#090D16] border-[#FDE68A]'
                      : 'bg-[#121E36] hover:bg-[#1A2B4C] text-[#CBD5E1] border-[#293B5C]'
                  }`}
                >
                  {prefs.zenMode ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>

                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={prefs.muted ? '取消静音 [M]' : '静音 [M]'}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    setPrefs((p) => ({ ...p, muted: !p.muted }));
                  }}
                  className="p-1.5 rounded-lg bg-[#121E36] hover:bg-[#1A2B4C] border border-[#293B5C] text-[#CBD5E1] cursor-pointer"
                >
                  {prefs.muted ? (
                    <VolumeX className="w-3.5 h-3.5" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                </button>

                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="暂停 [P]"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    setScreenState('paused');
                  }}
                  className="p-1.5 rounded-lg bg-[#121E36] hover:bg-[#1A2B4C] border border-[#293B5C] text-[#CBD5E1] cursor-pointer"
                >
                  <Pause className="w-3.5 h-3.5" />
                </button>
              </div>
            </header>

            {/* Compact Non-Blocking Top-Center Context Strip (Comet Alert / Toast / Beginner Quest) */}
            {!prefs.zenMode &&
              (uiRun.comet.active || eraToast || offlineBanner || activeQuest) && (
                <div className="px-3 flex justify-center">
                  {uiRun.comet.active ? (
                    <button
                      type="button"
                      onClick={handleCatchComet}
                      className="pointer-events-auto px-4 py-1.5 rounded-lg bg-[#451A03] hover:bg-[#78350F] border border-[#FBBF24] text-xs font-bold text-[#FEF08A] inline-flex items-center gap-2 cursor-pointer shadow-lg"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#FDE047]" />
                      <span>
                        流火彗星正掠过 3D 天穹！点击天际彗星或点此立即拦截（开启 15s ×2.5 狂热）
                      </span>
                    </button>
                  ) : eraToast || offlineBanner ? (
                    <div className="pointer-events-auto max-w-2xl px-4 py-1.5 rounded-lg bg-[#0D1A30]/95 border border-[#C89B54] text-xs text-[#FEF3C7] flex items-center gap-3 shadow-lg">
                      <span className="font-medium">
                        {eraToast
                          ? eraToast
                          : offlineBanner
                            ? `离线运转 ${formatDuration(offlineBanner.elapsedSec)} · +${formatNum(offlineBanner.luminanceGained)} 星辉 · +${formatNum(offlineBanner.fluxGained)} 通量`
                            : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEraToast(null);
                          setOfflineBanner(null);
                        }}
                        className="underline text-[#FDE68A] hover:text-white cursor-pointer whitespace-nowrap"
                      >
                        知悉
                      </button>
                    </div>
                  ) : activeQuest ? (
                    <div
                      data-testid="active-tutorial-quest"
                      className="pointer-events-auto max-w-3xl px-3.5 py-1.5 rounded-lg bg-[#0B1426]/95 border border-[#C89B54]/75 text-xs flex flex-wrap items-center justify-between gap-3 shadow-lg"
                    >
                      <div className="min-w-0">
                        <span className="font-bold text-[#FDE68A] mr-2">
                          {replayCoachStep !== null
                            ? `实战温习 ${replayCoachStep + 1}/${TUTORIAL_QUESTS.length}`
                            : activeQuest.title}
                        </span>
                        <span className="text-[#E2E8F0]">
                          {activeQuest.instruction}
                        </span>
                        {replayCoachStep === null && (
                          <span className="text-[#38BDF8] font-mono-num ml-2">
                            ({activeQuest.rewardText})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={handleFocusQuestTarget}
                          className="px-2 py-0.5 rounded bg-[#15223B] hover:bg-[#1E3054] border border-[#C89B54]/60 text-[11px] font-semibold text-[#FDE68A] cursor-pointer whitespace-nowrap"
                        >
                          定位面板
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowTutorialModal(true)}
                          className="px-2 py-0.5 rounded bg-[#131F36] hover:bg-[#1C2D4F] border border-[#334155] text-[11px] text-[#CBD5E1] hover:text-white cursor-pointer whitespace-nowrap"
                        >
                          图文指南
                        </button>
                        <button
                          type="button"
                          onClick={handleSkipTutorial}
                          className="text-[11px] text-[#94A3B8] hover:text-white underline cursor-pointer whitespace-nowrap"
                        >
                          {replayCoachStep !== null ? '结束带教' : '跳过指引'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
          </div>

          {/* =============================================================== */}
          {/* UNIFIED COLLAPSIBLE BOTTOM COMMAND DOCK (Zero Side-Panel Clutter) */}
          {/* =============================================================== */}
          {!prefs.zenMode && (
            <section
              aria-label="浑天仪主控台"
              className="pointer-events-auto mx-auto mb-2.5 w-[min(1060px,96vw)] rounded-xl bg-[#09101E]/96 border border-[#C89B54]/55 shadow-2xl overflow-hidden flex flex-col"
            >
              {/* Always-Accessible Action & Navigation Bar */}
              <div className="px-3 py-2 bg-[#070C18] border-b border-[#1E2D4A] flex flex-wrap items-center justify-between gap-2">
                {/* Left: Primary Active Verbs (Escapement Impulse + Supernova Collapse + Overdrive) */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    data-testid="manual-impulse-btn"
                    onClick={handleManualImpulse}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer border whitespace-nowrap ${
                      isMeridianReady
                        ? 'bg-[#F59E0B] text-[#090D16] border-[#FEF08A]'
                        : 'bg-[#15223B] hover:bg-[#1E3054] text-[#FDE68A] border-[#C89B54]/60'
                    }`}
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>
                      {isMeridianReady
                        ? `精准擒纵 ×${uiMeta.ascensionNodes.wide_meridian ? 4.2 : 3}! [Space]`
                        : '拨动擒纵 [Space]'}
                    </span>
                  </button>

                  <button
                    type="button"
                    data-testid="supernova-pulse-btn"
                    disabled={uiRun.crucible.supernovaCooldownSec > 0}
                    onClick={handleTriggerSupernova}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 border whitespace-nowrap ${
                      uiRun.crucible.supernovaCooldownSec > 0
                        ? 'bg-[#0D1526] text-[#64748B] border-[#1E293B] cursor-not-allowed font-mono-num'
                        : 'bg-[#0E7490] hover:bg-[#0891B2] text-white border-[#67E8F9] cursor-pointer'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>
                      {uiRun.crucible.supernovaCooldownSec > 0
                        ? `坍缩冷却 ${Math.ceil(uiRun.crucible.supernovaCooldownSec)}s`
                        : '超新星脉冲 [E]'}
                    </span>
                  </button>

                  {/* Compact Chrono-Spring Overdrive Control */}
                  <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#0E172A] border border-[#243452]">
                    <span className="text-[11px] font-mono-num text-[#6EE7B7] whitespace-nowrap">
                      发条 {Math.floor(uiRun.springTensionSec)}s ({Math.round(tensionPct)}%)
                    </span>
                    <div
                      role="group"
                      aria-label="发条超频档位"
                      className="inline-flex items-center gap-0.5"
                    >
                      {([1, 2, 4, 8] as OverdriveSpeed[]).map((spd) => {
                        const locked8 =
                          spd === 8 && !uiMeta.ascensionNodes.perpetual_spring;
                        if (locked8) return null;
                        const active = uiRun.overdriveSpeed === spd;
                        const questGlow =
                          activeQuest?.targetArea === 'overdrive' &&
                          spd === 2 &&
                          !active;
                        return (
                          <button
                            key={spd}
                            type="button"
                            onClick={() => handleOverdriveChange(spd)}
                            className={`px-1.5 py-0.5 rounded text-xs font-mono-num font-bold cursor-pointer ${
                              active
                                ? 'bg-[#10B981] text-[#06121E]'
                                : questGlow
                                  ? 'bg-[#FEF3C7] text-[#92400E]'
                                  : 'text-[#94A3B8] hover:text-white'
                            }`}
                          >
                            {spd}×
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Right: 5 Dock Tabs + Cinema Collapse Toggle */}
                <div className="flex flex-wrap items-center gap-1">
                  <div
                    role="tablist"
                    aria-label="主控台功能分区"
                    className="inline-flex flex-wrap items-center gap-1"
                  >
                    {(
                      [
                        ['rings', '五曜星轨'],
                        [
                          'zodiac',
                          `十二星宫 (${installedSlotsCount}/${unlockedSlotsCount})`,
                        ],
                        [
                          'crucible',
                          `以太星炉${affordableCrucibleCount > 0 ? ` (${affordableCrucibleCount})` : ''}`,
                        ],
                        [
                          'automator',
                          `发条智械${uiRun.automator.enabled ? ' · 启' : ''}`,
                        ],
                        [
                          'directives',
                          `司天敕令${affordableDirectivesCount > 0 ? ` (${affordableDirectivesCount})` : ''}`,
                        ],
                      ] as Array<[DockTab, string]>
                    ).map(([id, label]) => {
                      const active = !prefs.dockCollapsed && dockTab === id;
                      return (
                        <button
                          key={id}
                          role="tab"
                          type="button"
                          aria-selected={active}
                          data-testid={`dock-tab-${id}`}
                          onClick={() => {
                            setDockTab(id);
                            if (prefs.dockCollapsed) {
                              setPrefs((p) => ({ ...p, dockCollapsed: false }));
                            }
                          }}
                          className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap border ${
                            active
                              ? 'bg-[#C89B54] text-[#090D16] border-[#FDE68A]'
                              : 'bg-[#111C33] hover:bg-[#192847] text-[#CBD5E1] border-[#243452]'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    data-testid="toggle-dock-collapse"
                    aria-expanded={!prefs.dockCollapsed}
                    title="收起或展开下方控制抽屉 [Tab]"
                    onClick={() =>
                      setPrefs((p) => ({
                        ...p,
                        dockCollapsed: !p.dockCollapsed,
                      }))
                    }
                    className="px-2 py-1 rounded-md bg-[#111C33] hover:bg-[#192847] border border-[#293B5C] text-xs font-medium text-[#94A3B8] hover:text-white inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    {prefs.dockCollapsed ? (
                      <>
                        <ChevronUp className="w-3.5 h-3.5" />
                        <span>展开</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3.5 h-3.5" />
                        <span>收起</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Collapsible Dock Drawer Body (Max height capped so upper 65%+ of 3D Observatory stays clear!) */}
              {!prefs.dockCollapsed && (
                <div className="p-3 max-h-[196px] sm:max-h-[248px] overflow-y-auto">
                  {/* TAB 1: ORBITAL RINGS & HARMONIC GEAR-RATIO TUNING */}
                  {dockTab === 'rings' && (
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="text-[#94A3B8]">
                          微调各轨<strong className="text-[#FDE68A]">机械齿比</strong>可自由切换「高产通量 / 磁吸连珠 / 极速刷宫」流派；每逢 Lv.10/25/50 触发质变突破
                        </span>
                        <div
                          role="group"
                          aria-label="升阶批量档位"
                          className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-[#111C33] border border-[#243452]"
                        >
                          {(
                            [
                              ['1', '×1'],
                              ['10', '×10'],
                              ['next', '突破'],
                              ['max', '最大'],
                            ] as Array<[BuyMode, string]>
                          ).map(([mode, label]) => {
                            const active = prefs.buyMode === mode;
                            return (
                              <button
                                key={mode}
                                type="button"
                                onClick={() =>
                                  setPrefs((p) => ({ ...p, buyMode: mode }))
                                }
                                className={`px-2 py-0.5 rounded text-xs font-mono-num font-semibold cursor-pointer ${
                                  active
                                    ? 'bg-[#C89B54] text-[#090D16]'
                                    : 'text-[#94A3B8] hover:text-white'
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {ORBITAL_RINGS.map((def, idx) => {
                          const rState = uiRun.rings[def.id];
                          const prevUnlocked =
                            idx === 0 ||
                            uiRun.rings[ORBITAL_RINGS[idx - 1].id].unlocked;
                          if (!rState.unlocked && !prevUnlocked) {
                            return (
                              <div
                                key={def.id}
                                className="p-2.5 rounded-lg bg-[#0B1222] border border-[#1B2740] text-xs text-[#64748B] flex items-center"
                              >
                                解锁上一轨后开放【{def.name}】
                              </div>
                            );
                          }

                          const quote = getBulkRingUpgradeQuote(
                            def.id,
                            uiRun,
                            uiMeta,
                            prefs.buyMode,
                          );
                          const strikeYield = getRingMeridianYield(
                            def.id,
                            uiRun,
                            uiMeta,
                          );
                          const ms = getRingMilestoneMultiplier(
                            Math.max(1, rState.level),
                            uiMeta,
                          );
                          const isQuestTarget =
                            (activeQuest?.targetArea === 'venus' &&
                              def.id === 'venus' &&
                              !rState.unlocked) ||
                            (activeQuest?.targetArea === 'mercury10' &&
                              def.id === 'mercury' &&
                              rState.level < 10);

                          const btnText = quote.isUnlock
                            ? `解锁 ${def.shortName} · ${formatNum(quote.totalCost)}`
                            : `升阶 +${quote.levels} · ${formatNum(quote.totalCost)}`;

                          return (
                            <div
                              key={def.id}
                              className={`p-2.5 rounded-lg bg-[#0E172A] border flex flex-col justify-between gap-2 ${
                                isQuestTarget
                                  ? 'border-[#F59E0B] ring-1 ring-[#FDE68A]'
                                  : 'border-[#243452]'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className="w-2.5 h-2.5 rounded-xs shrink-0"
                                      style={{ backgroundColor: def.colorHex }}
                                      aria-hidden="true"
                                    />
                                    <span className="text-xs font-bold text-[#F8FAFC] truncate">
                                      {def.name}
                                    </span>
                                  </div>
                                  <div className="text-[11px] font-mono-num text-[#94A3B8] mt-0.5">
                                    {rState.unlocked
                                      ? `Lv.${rState.level} · 跨线 +${formatNum(strikeYield)}${
                                          ms.nextLevel
                                            ? ` · 下段 Lv.${ms.nextLevel} (×${ms.nextMult})`
                                            : ''
                                        }`
                                      : def.subtitle}
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  aria-label={
                                    quote.isUnlock
                                      ? btnText
                                      : `${def.shortName} ${btnText}`
                                  }
                                  disabled={!quote.canAfford}
                                  onClick={() => handleUpgradeRing(def.id)}
                                  className={`px-2.5 py-1 rounded text-xs font-mono-num font-bold whitespace-nowrap shrink-0 border ${
                                    quote.canAfford
                                      ? 'bg-[#F59E0B] hover:bg-[#D97706] text-[#090D16] border-[#FDE68A] cursor-pointer'
                                      : 'bg-[#111B30] text-[#475569] border-[#1E293B] cursor-not-allowed'
                                  }`}
                                >
                                  {btnText}
                                </button>
                              </div>

                              {/* Per-Ring Gear Ratio Transmission Switcher */}
                              {rState.unlocked && (
                                <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-[#1A2742]">
                                  <span className="text-[11px] text-[#94A3B8]">
                                    齿比：
                                  </span>
                                  <div
                                    role="group"
                                    aria-label={`${def.shortName} 机械齿比模式`}
                                    className="inline-flex items-center gap-1"
                                  >
                                    {RING_GEAR_MODES.map((gm) => {
                                      const active = rState.gearMode === gm.id;
                                      return (
                                        <button
                                          key={gm.id}
                                          type="button"
                                          title={`${gm.label}：${gm.effectText}`}
                                          aria-label={`${def.shortName} 切换为 ${gm.shortLabel} 齿比`}
                                          onClick={() =>
                                            handleChangeGearMode(def.id, gm.id)
                                          }
                                          className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer ${
                                            active
                                              ? 'bg-[#2563EB] text-white'
                                              : 'bg-[#131F36] text-[#94A3B8] hover:text-white'
                                          }`}
                                        >
                                          {gm.shortLabel}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* TAB 2: 12 ZODIAC MONOLITH SOCKETS */}
                  {dockTab === 'zodiac' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
                      {/* 12 Palace Buttons */}
                      <div className="lg:col-span-5 space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                          <span>点击下方或 3D 外圈石碑选择宫位</span>
                          {swapSourceSlot !== null && (
                            <button
                              type="button"
                              onClick={() => setSwapSourceSlot(null)}
                              className="text-[#FBBF24] underline cursor-pointer"
                            >
                              取消调换
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-6 gap-1.5">
                          {ZODIAC_PALACES.map((p) => {
                            const unlocked = isSlotUnlocked(uiRun, p.index);
                            const mod = uiRun.slots[p.index];
                            const selected = selectedSlot === p.index;
                            const [leftIdx, rightIdx] = getAdjacentSlots(p.index);
                            const hasSynergy =
                              mod &&
                              (areModulesSynergistic(
                                mod.typeId,
                                uiRun.slots[leftIdx]?.typeId,
                              ) ||
                                areModulesSynergistic(
                                  mod.typeId,
                                  uiRun.slots[rightIdx]?.typeId,
                                ));

                            return (
                              <button
                                key={p.index}
                                type="button"
                                aria-label={`${p.branch}宫 ${
                                  mod
                                    ? `${MODULES_BY_ID[mod.typeId].shortName} T${mod.tier}`
                                    : unlocked
                                      ? '空槽'
                                      : '未解锁'
                                }`}
                                onClick={() => handleSlotButtonSelect(p.index)}
                                className={`p-1.5 rounded-lg border flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                                  selected
                                    ? 'bg-[#1D2D4F] border-[#F59E0B] ring-1 ring-[#FDE68A]'
                                    : unlocked
                                      ? hasSynergy
                                        ? 'bg-[#13223D] border-[#C89B54]'
                                        : 'bg-[#0E172A] border-[#243452]'
                                      : 'bg-[#080D18] border-[#162033] opacity-55'
                                }`}
                              >
                                <span className="text-xs font-bold text-[#FDE68A]">
                                  {p.branch}
                                </span>
                                {mod ? (
                                  <span className="text-[10px] font-mono-num text-[#38BDF8]">
                                    {MODULES_BY_ID[mod.typeId].shortName}T{mod.tier}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-[#64748B]">
                                    {unlocked ? '空' : '锁'}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Selected Palace Inspector / Module Installer */}
                      <div className="lg:col-span-7 p-2.5 rounded-lg bg-[#0E172A] border border-[#243452]">
                        {!selectedSlotUnlocked ? (
                          <div className="text-xs text-[#94A3B8] py-4 text-center">
                            【{selectedPalace.name}】尚未开放 · 累计 {formatNum(ERAS[1].unlockLuminance)} 星辉开放四正宫，敕令【八方星盘扩建】与【周天十二宫全开】开放其余石碑。
                          </div>
                        ) : selectedModule ? (
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <ModuleGlyphSvg
                                  typeId={selectedModule.typeId}
                                  className="w-5 h-5"
                                />
                                <span className="text-sm font-bold text-[#F8FAFC]">
                                  {selectedPalace.branch}宫 ·{' '}
                                  {MODULES_BY_ID[selectedModule.typeId].name} (T
                                  {selectedModule.tier}/5)
                                </span>
                              </div>
                              <p className="text-xs text-[#CBD5E1]">
                                {MODULES_BY_ID[selectedModule.typeId].roleSummary}
                              </p>
                              <p className="text-[11px] text-[#FDE68A]">
                                黄金光桥协同：
                                {MODULES_BY_ID[selectedModule.typeId].synergyHint}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              {selectedModule.tier < 5 && (() => {
                                const upCost = getModuleUpgradeCost(selectedModule);
                                const ok =
                                  uiRun.luminance >= upCost.luminance &&
                                  uiRun.aether >= upCost.aether;
                                return (
                                  <button
                                    type="button"
                                    disabled={!ok}
                                    onClick={handleUpgradeModule}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-mono-num font-bold border ${
                                      ok
                                        ? 'bg-[#F59E0B] text-[#090D16] border-[#FDE68A] cursor-pointer'
                                        : 'bg-[#111B30] text-[#475569] border-[#1E293B] cursor-not-allowed'
                                    }`}
                                  >
                                    升至 T{selectedModule.tier + 1} ·{' '}
                                    {formatNum(upCost.luminance)} 星辉
                                    {upCost.aether > 0
                                      ? ` + ${upCost.aether} 以太`
                                      : ''}
                                  </button>
                                );
                              })()}

                              <button
                                type="button"
                                onClick={() =>
                                  setSwapSourceSlot(
                                    swapSourceSlot === selectedSlot
                                      ? null
                                      : selectedSlot,
                                  )
                                }
                                className="px-2.5 py-1.5 rounded-lg bg-[#15223B] hover:bg-[#1E3054] border border-[#334155] text-xs text-[#CBD5E1] inline-flex items-center gap-1 cursor-pointer"
                              >
                                <ArrowLeftRight className="w-3.5 h-3.5" />
                                <span>换位</span>
                              </button>

                              <button
                                type="button"
                                onClick={handleRemoveModule}
                                className="px-2.5 py-1.5 rounded-lg bg-[#2A1215] hover:bg-[#451A1E] border border-[#7F1D1D] text-xs text-[#FCA5A5] cursor-pointer"
                              >
                                拆卸
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="text-xs font-semibold text-[#FDE68A]">
                              在【{selectedPalace.name}】镶嵌石碑机关：
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                              {MODULE_DEFS.map((m) => {
                                const eraOk = uiRun.era >= m.unlockEra;
                                const cost = getModuleInstallCost(m.id, uiRun);
                                const canBuy =
                                  eraOk &&
                                  uiRun.luminance >= cost.luminance &&
                                  uiRun.aether >= cost.aether;
                                return (
                                  <button
                                    key={m.id}
                                    type="button"
                                    disabled={!canBuy}
                                    title={`${m.roleSummary}（${m.synergyHint}）`}
                                    aria-label={`镶嵌 ${m.name} · ${formatNum(cost.luminance)} 星辉`}
                                    onClick={() => handleInstallModule(m.id)}
                                    className={`p-2 rounded-lg border text-left flex items-center justify-between gap-1.5 ${
                                      canBuy
                                        ? 'bg-[#14223D] hover:bg-[#1C2F54] border-[#C89B54]/60 text-white cursor-pointer'
                                        : 'bg-[#0B1222] border-[#1B2740] text-[#64748B] cursor-not-allowed'
                                    }`}
                                  >
                                    <span className="inline-flex items-center gap-1.5 text-xs font-bold truncate">
                                      <ModuleGlyphSvg
                                        typeId={m.id}
                                        className="w-4 h-4 shrink-0"
                                      />
                                      <span>{m.shortName}</span>
                                    </span>
                                    <span className="text-[11px] font-mono-num shrink-0">
                                      {eraOk
                                        ? `${formatNum(cost.luminance)}${cost.aether > 0 ? `+${cost.aether}以` : ''}`
                                        : `第${m.unlockEra}纪`}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 3: ALCHEMICAL STELLAR CRUCIBLE (3 Reaction Chambers) */}
                  {dockTab === 'crucible' && (
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#94A3B8]">
                        <span>
                          每次子午撞击、精准擒纵与连珠都会向底座星炉泵入<strong className="text-[#FB923C]">星芒通量</strong>（切至「以太星炉」视角可近距观赏三釜能量导管！）
                        </span>
                        <span className="font-mono-num text-[#FB923C] font-semibold">
                          当前星芒通量：{formatNum(uiRun.crucible.stellarFlux)}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                        {CRUCIBLE_CHAMBERS.map((ch) => {
                          const lv = uiRun.crucible.chambers[ch.id];
                          const cost = getCrucibleChamberCost(ch.id, uiRun);
                          const canAfford =
                            uiRun.crucible.stellarFlux >= cost.flux &&
                            uiRun.aether >= cost.aether;

                          const liveEffect =
                            ch.id === 'fusion'
                              ? `当前星辉乘区 ×${Math.pow(1.18, lv).toFixed(2)}`
                              : ch.id === 'dilation'
                                ? `转速 +${lv * 6}% · 蓄能回充 +${lv * 15}%`
                                : `连珠 +${lv * 10}% · 通量 +${lv * 15}%${
                                    lv >= 2
                                      ? ` · 以太自凝 ${Math.round(uiRun.crucible.aetherSynthProgress * 100)}%`
                                      : ''
                                  }`;

                          return (
                            <div
                              key={ch.id}
                              className="p-3 rounded-lg bg-[#0E172A] border border-[#243452] flex flex-col justify-between gap-2"
                            >
                              <div>
                                <div className="flex items-center justify-between gap-2">
                                  <span
                                    className="text-xs font-bold"
                                    style={{ color: ch.accentHex }}
                                  >
                                    {ch.name} · Lv.{lv}
                                  </span>
                                  <span className="text-[11px] font-mono-num text-[#E2E8F0]">
                                    {liveEffect}
                                  </span>
                                </div>
                                <p className="text-[11px] text-[#94A3B8] mt-1 leading-snug">
                                  {ch.summary}
                                </p>
                              </div>

                              <button
                                type="button"
                                aria-label={`淬炼 ${ch.name} 至 Lv.${lv + 1} · ${formatNum(cost.flux)} 通量`}
                                disabled={!canAfford}
                                onClick={() => handleUpgradeCrucible(ch.id)}
                                className={`w-full py-1.5 px-3 rounded text-xs font-mono-num font-bold border ${
                                  canAfford
                                    ? 'bg-[#EA580C] hover:bg-[#C2410C] text-white border-[#FDBA74] cursor-pointer'
                                    : 'bg-[#111B30] text-[#475569] border-[#1E293B] cursor-not-allowed'
                                }`}
                              >
                                淬炼升阶 · {formatNum(cost.flux)} 通量
                                {cost.aether > 0 ? ` + ${cost.aether} 以太` : ''}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* TAB 4: PROGRAMMABLE CLOCKWORK LOGIC AUTOMATOR */}
                  {dockTab === 'automator' && (
                    <AutomatorPanel
                      run={uiRun}
                      meta={uiMeta}
                      onToggleMaster={handleToggleAutomatorMaster}
                      onChangeReserveRatio={handleChangeReserveRatio}
                      onApplyPreset={handleApplyPreset}
                      onUpdateRule={handleUpdateAutomatorRule}
                      onMoveRule={handleMoveAutomatorRule}
                    />
                  )}

                  {/* TAB 5: CRAFTSMANSHIP DIRECTIVES */}
                  {dockTab === 'directives' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {DIRECTIVES.map((d) => {
                        const owned = uiRun.directives[d.id];
                        const eraOk = uiRun.era >= d.era;
                        const canBuy =
                          !owned &&
                          eraOk &&
                          uiRun.luminance >= d.costLuminance &&
                          uiRun.aether >= d.costAether;

                        return (
                          <div
                            key={d.id}
                            className={`p-2.5 rounded-lg border flex items-center justify-between gap-3 ${
                              owned
                                ? 'bg-[#102320] border-[#0D9488]/60'
                                : eraOk
                                  ? 'bg-[#0E172A] border-[#243452]'
                                  : 'bg-[#080D18] border-[#162033] opacity-60'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-[#FDE68A]">
                                {d.name}
                                {!eraOk ? ` (第 ${d.era} 纪开放)` : ''}
                              </div>
                              <p className="text-[11px] text-[#CBD5E1] mt-0.5 leading-snug">
                                {d.description}
                              </p>
                            </div>

                            <button
                              type="button"
                              aria-label={`颁布敕令 ${d.name}`}
                              disabled={!canBuy}
                              onClick={() => handlePurchaseDirective(d.id)}
                              className={`px-3 py-1.5 rounded text-xs font-mono-num font-bold shrink-0 border whitespace-nowrap ${
                                owned
                                  ? 'bg-[#0F766E]/30 text-[#5EEAD4] border-[#0D9488]/40 cursor-default'
                                  : canBuy
                                    ? 'bg-[#F59E0B] hover:bg-[#D97706] text-[#090D16] border-[#FDE68A] cursor-pointer'
                                    : 'bg-[#111B30] text-[#475569] border-[#1E293B] cursor-not-allowed'
                              }`}
                            >
                              {owned
                                ? '已颁布'
                                : `${formatNum(d.costLuminance)} 星辉${
                                    d.costAether > 0
                                      ? ` + ${d.costAether} 以太`
                                      : ''
                                  }`}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* PAUSE MODAL                                                         */}
      {/* =================================================================== */}
      {screenState === 'paused' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="浑仪已暂停"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75"
        >
          <div className="w-full max-w-md rounded-xl bg-[#0B1222] border border-[#C89B54] p-6 space-y-5 shadow-2xl">
            <div>
              <h2 className="text-xl font-bold text-[#FDE68A]">
                天枢擒纵已锁止 · 暂停中
              </h2>
              <p className="text-xs text-[#94A3B8] mt-1">
                按 Esc 或 P 键可随时恢复三维天球运转
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="p-3 rounded-lg bg-[#101A2E] border border-[#243452]">
                <div className="text-[11px] text-[#94A3B8]">本局星辉</div>
                <div className="text-sm font-bold font-mono-num text-[#FDE68A] mt-0.5">
                  {formatNum(uiRun.totalLuminanceRun)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#101A2E] border border-[#243452]">
                <div className="text-[11px] text-[#94A3B8]">朔望连珠</div>
                <div className="text-sm font-bold font-mono-num text-[#38BDF8] mt-0.5">
                  {formatNum(uiRun.totalSyzygies)} 次
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#101A2E] border border-[#243452]">
                <div className="text-[11px] text-[#94A3B8]">智械执行</div>
                <div className="text-sm font-bold font-mono-num text-[#6EE7B7] mt-0.5">
                  {formatNum(uiRun.automator.totalActionsExecuted)} 次
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setScreenState('playing')}
                className="w-full py-2.5 rounded-lg bg-[#F59E0B] hover:bg-[#D97706] text-[#090D16] text-xs font-bold cursor-pointer"
              >
                继续运转浑仪
              </button>
              <button
                type="button"
                onClick={handleStartReplayGuide}
                className="w-full py-2 rounded-lg bg-[#15223B] hover:bg-[#1E3054] border border-[#C89B54]/60 text-xs font-semibold text-[#FDE68A] cursor-pointer"
              >
                重温五步实战带教
              </button>
              <button
                type="button"
                onClick={() => setShowTutorialModal(true)}
                className="w-full py-2 rounded-lg bg-[#131F36] hover:bg-[#1C2D4F] border border-[#334155] text-xs font-medium text-[#E2E8F0] cursor-pointer"
              >
                查阅三维图文指南 [H]
              </button>
              <button
                type="button"
                onClick={() => setScreenState('title')}
                className="w-full py-2 rounded-lg bg-[#101829] hover:bg-[#18243D] border border-[#243452] text-xs font-medium text-[#94A3B8] hover:text-white cursor-pointer"
              >
                返回标题星台
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* PRIME SINGULARITY VICTORY MODAL                                     */}
      {/* =================================================================== */}
      {screenState === 'victory' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="浑天归一终章达成"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75"
        >
          <div className="w-full max-w-lg rounded-xl bg-[#0B1222] border border-[#FDE047] p-6 space-y-5 shadow-2xl">
            <div>
              <h2 className="text-2xl font-bold text-[#FDE047]">
                浑天归一 · 本源奇点已引燃！
              </h2>
              <p className="text-xs text-[#CBD5E1] mt-1 leading-relaxed">
                万亿星辉与以太真髓在三维天球中心坍缩为永恒白金奇点，全局星辉产出永久额外 ×2.5，重铸星尘额外 +8！
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="p-3 rounded-lg bg-[#101A2E] border border-[#243452]">
                <div className="text-[11px] text-[#94A3B8]">达成用时</div>
                <div className="text-sm font-bold font-mono-num text-[#FDE68A] mt-0.5">
                  {formatDuration(uiRun.runSeconds)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#101A2E] border border-[#243452]">
                <div className="text-[11px] text-[#94A3B8]">最高连珠</div>
                <div className="text-sm font-bold font-mono-num text-[#38BDF8] mt-0.5">
                  {uiRun.bestSyzygyBodies} 曜同辉
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#101A2E] border border-[#243452]">
                <div className="text-[11px] text-[#94A3B8]">可获星尘</div>
                <div className="text-sm font-bold font-mono-num text-[#A5B4FC] mt-0.5">
                  +{formatNum(pendingStardust)}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                data-start="true"
                onClick={() => {
                  runRef.current.endlessMode = true;
                  setScreenState('playing');
                }}
                className="flex-1 py-2.5 px-4 rounded-lg bg-[#F59E0B] hover:bg-[#D97706] text-[#090D16] text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Cpu className="w-4 h-4" />
                <span>继续无尽推演</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setScreenState('playing');
                  setShowAstrolabeModal(true);
                }}
                className="flex-1 py-2.5 px-4 rounded-lg bg-[#6366F1] hover:bg-[#4F46E5] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>前往星盘重铸</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUB-MODALS */}
      {showAstrolabeModal && (
        <AstrolabeModal
          run={uiRun}
          meta={uiMeta}
          pendingStardust={pendingStardust}
          onUnlockNode={handleUnlockAscensionNode}
          onPerformAscension={handlePerformAscension}
          onClose={() => setShowAstrolabeModal(false)}
        />
      )}

      {showCodexModal && (
        <CodexModal
          run={uiRun}
          meta={uiMeta}
          onHardReset={handleHardReset}
          onClose={() => setShowCodexModal(false)}
        />
      )}

      {showTutorialModal && (
        <TutorialModal
          isTitleScreen={screenState === 'title'}
          onClose={() => setShowTutorialModal(false)}
          onStartFromTutorial={() => handleContinueOrStart(false)}
          onReplayInteractiveGuide={handleStartReplayGuide}
        />
      )}
    </div>
  );
}
