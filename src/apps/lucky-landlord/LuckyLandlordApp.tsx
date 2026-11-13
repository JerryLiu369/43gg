import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  BookOpen,
  Check,
  Hammer,
  HelpCircle,
  Layers,
  Lock,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import {
  CONTRACTS_BY_ID,
  LANDLORDS,
  LANDLORDS_BY_ID,
  MARKET_EVENTS_BY_ID,
  RARITY_META,
  RELICS_BY_ID,
  ROOMS,
  ROOMS_BY_ID,
  STREAMS_BY_ID,
  SYMBOLS_BY_ID,
  VICTORY_CYCLE,
} from './content.ts';
import { CompendiumModal } from './CompendiumModal.tsx';
import { DeckAndMergeModal } from './DeckAndMergeModal.tsx';
import { TutorialModal } from './TutorialModal.tsx';
import { LedgerAudioEngine } from './audio.ts';
import {
  BOARD_COLS,
  areCellsAdjacent,
  commitSpinAndDraft,
  createNewRun,
  enterEndlessMode,
  getMergeableDefIds,
  getRenovationCoinCost,
  getSymbolBaseCoins,
  mergeTripleSymbol,
  payRentAndAdvanceCycle,
  removeDeckSymbol,
  renovateBoardCell,
  rerollColumn,
  signRentContract,
  spinBoard,
  swapAdjacentCells,
  toggleCellLock,
} from './engine.ts';
import { LuckyLedgerEmblemSvg, RoomBadgeSvg, SymbolArtSvg } from './icons.tsx';
import {
  loadMetaSave,
  loadSavedActiveRun,
  loadUserPrefs,
  recordRunCompletion,
  saveActiveRun,
  saveUserPrefs,
  syncDiscoveredFromRun,
} from './storage.ts';
import type {
  LandlordId,
  MetaSaveData,
  RoomTypeId,
  RunState,
  TacticalMode,
} from './types.ts';

type ShellScreenState = 'title' | 'playing' | 'paused';

const UPGRADEABLE_ROOMS = ROOMS.filter((r) => r.id !== 'plain');

export default function LuckyLandlordApp() {
  const [meta, setMeta] = useState<MetaSaveData>(() => loadMetaSave());
  const [savedRunPreview, setSavedRunPreview] = useState<RunState | null>(() =>
    loadSavedActiveRun(),
  );
  const [prefs, setPrefs] = useState(() => loadUserPrefs());

  const [selectedLandlordId, setSelectedLandlordId] =
    useState<LandlordId>('landlady_chen');
  const [selectedAscension, setSelectedAscension] = useState<number>(1);

  const [screenState, setScreenState] = useState<ShellScreenState>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') return 'playing';
    }
    return 'title';
  });

  const [run, setRun] = useState<RunState>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') {
        return savedRunPreview ?? createNewRun('landlady_chen', 1);
      }
    }
    return savedRunPreview ?? createNewRun('landlady_chen', 1);
  });

  const [tacticalMode, setTacticalMode] = useState<TacticalMode>('none');
  const [swapAnchorIdx, setSwapAnchorIdx] = useState<number | null>(null);
  const [selectedRoomBrush, setSelectedRoomBrush] =
    useState<RoomTypeId>('gold_shop');
  const [inspectedCellIdx, setInspectedCellIdx] = useState<number>(7);
  const [inspectedDraftDefId, setInspectedDraftDefId] = useState<string | null>(
    null,
  );
  const [selectedRelicId, setSelectedRelicId] = useState<string | null>(null);

  const [showCompendium, setShowCompendium] = useState<boolean>(false);
  const [showDeckModal, setShowDeckModal] = useState<boolean>(false);
  const [showTutorialModal, setShowTutorialModal] = useState<boolean>(false);
  const [onboardingStep, setOnboardingStep] = useState<0 | 1 | 2 | 3 | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') return null;
    }
    return loadUserPrefs().tutorialCompleted ? null : 0;
  });
  const [rollingCols, setRollingCols] = useState<boolean[]>([
    false,
    false,
    false,
    false,
    false,
  ]);

  const audioRef = useRef<LedgerAudioEngine | null>(null);
  const timersRef = useRef<number[]>([]);
  const recordedOutcomeRef = useRef<string | null>(null);

  const clearPendingTimers = useCallback(() => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];
  }, []);

  // Initialize & dispose Web Audio cleanly
  useEffect(() => {
    const audio = new LedgerAudioEngine(prefs.muted);
    audioRef.current = audio;
    return () => {
      clearPendingTimers();
      audio.dispose();
      audioRef.current = null;
      if (typeof document !== 'undefined') {
        delete document.body.dataset.state;
      }
    };
  }, [clearPendingTimers]);

  useEffect(() => {
    audioRef.current?.setMuted(prefs.muted);
    saveUserPrefs(prefs);
  }, [prefs]);

  // Mirror state machine to document.body.dataset.state
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (screenState === 'title') {
      document.body.dataset.state = 'title';
    } else if (screenState === 'paused') {
      document.body.dataset.state = 'paused';
    } else if (run.phase === 'gameover' || run.phase === 'victory') {
      document.body.dataset.state = 'gameover';
    } else {
      document.body.dataset.state = 'playing';
    }
  }, [screenState, run.phase]);

  // Sync discovered compendium entries & auto-save active run
  useEffect(() => {
    if (screenState === 'title') return;
    setMeta((prev) => syncDiscoveredFromRun(prev, run));

    if (run.phase === 'gameover') {
      saveActiveRun(null);
      setSavedRunPreview(null);
      const key = `${run.seed}_${run.totalSpins}_bankrupt`;
      if (recordedOutcomeRef.current !== key) {
        recordedOutcomeRef.current = key;
        audioRef.current?.playBankrupt();
        setMeta((prev) =>
          recordRunCompletion(
            prev,
            run,
            run.isEndless ? 'endless' : 'bankrupt',
          ),
        );
      }
    } else if (run.phase === 'victory') {
      saveActiveRun(run);
      const key = `${run.seed}_victory`;
      if (recordedOutcomeRef.current !== key) {
        recordedOutcomeRef.current = key;
        audioRef.current?.playRentSuccess();
        setMeta((prev) => recordRunCompletion(prev, run, 'victory'));
      }
    } else {
      saveActiveRun(run);
      setSavedRunPreview(run);
    }
  }, [run, screenState]);

  // Auto-select first relic candidate when entering rent_due
  useEffect(() => {
    if (run.phase === 'rent_due') {
      setSelectedRelicId(run.pendingRelicChoices[0] ?? null);
      setTacticalMode('none');
      setSwapAnchorIdx(null);
    }
  }, [run.phase, run.pendingRelicChoices]);

  const startFreshRun = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    clearPendingTimers();
    recordedOutcomeRef.current = null;
    const fresh = createNewRun(selectedLandlordId, selectedAscension);
    setRun(fresh);
    setTacticalMode('none');
    setSwapAnchorIdx(null);
    setInspectedDraftDefId(null);
    setScreenState('playing');
    audioRef.current?.playStamp();
  }, [clearPendingTimers, selectedAscension, selectedLandlordId]);

  const resumeSavedRun = useCallback(() => {
    if (!savedRunPreview) return;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setRun(savedRunPreview);
    setTacticalMode('none');
    setSwapAnchorIdx(null);
    setScreenState('playing');
    audioRef.current?.playStamp();
  }, [savedRunPreview]);

  const triggerReelAnimation = useCallback(
    (colsToAnimate: number[], finalTotalCoins: number) => {
      clearPendingTimers();
      if (prefs.fastSpin) {
        audioRef.current?.playReelStop(2);
        audioRef.current?.playCoinPayout(finalTotalCoins);
        setRollingCols([false, false, false, false, false]);
        return;
      }

      setRollingCols((prev) => {
        const next = [...prev];
        for (const c of colsToAnimate) next[c] = true;
        return next;
      });

      colsToAnimate.forEach((colIdx, stepIdx) => {
        const delay = 45 + stepIdx * 36;
        const tid = window.setTimeout(() => {
          audioRef.current?.playReelStop(colIdx);
          setRollingCols((prev) => {
            const copy = [...prev];
            copy[colIdx] = false;
            return copy;
          });
          if (stepIdx === colsToAnimate.length - 1) {
            audioRef.current?.playCoinPayout(finalTotalCoins);
          }
        }, delay);
        timersRef.current.push(tid);
      });
    },
    [clearPendingTimers, prefs.fastSpin],
  );

  const handleSpin = useCallback(() => {
    if (screenState !== 'playing' || run.phase !== 'ready') return;
    setTacticalMode('none');
    setSwapAnchorIdx(null);
    setInspectedDraftDefId(null);
    const nextState = spinBoard(run);
    setRun(nextState);
    setOnboardingStep((s) => (s === 0 ? 1 : s));
    triggerReelAnimation([0, 1, 2, 3, 4], nextState.currentEval?.totalCoins ?? 0);
  }, [run, screenState, triggerReelAnimation]);

  const handleDraftPick = useCallback(
    (defId: string | null) => {
      if (screenState !== 'playing' || run.phase !== 'post_spin') return;
      setTacticalMode('none');
      setSwapAnchorIdx(null);
      setInspectedDraftDefId(null);
      const nextState = commitSpinAndDraft(run, defId);
      setRun(nextState);
      setOnboardingStep((s) => (s === 1 || s === 2 ? 3 : s));
      if (nextState.phase === 'rent_due') {
        audioRef.current?.playRentSuccess();
      } else {
        audioRef.current?.playStamp();
      }
    },
    [run, screenState],
  );

  const handleColumnReroll = useCallback(
    (colIndex: number) => {
      if (run.phase !== 'post_spin') return;
      const nextState = rerollColumn(run, colIndex);
      if (nextState === run) return;
      setRun(nextState);
      setOnboardingStep((s) => (s === 1 ? 2 : s));
      triggerReelAnimation([colIndex], nextState.currentEval?.totalCoins ?? 0);
    },
    [run, triggerReelAnimation],
  );

  const handleCellClick = useCallback(
    (cellIdx: number) => {
      setInspectedCellIdx(cellIdx);
      setInspectedDraftDefId(null);

      if (tacticalMode === 'lock') {
        const nextState = toggleCellLock(run, cellIdx);
        if (nextState !== run) {
          setRun(nextState);
          setOnboardingStep((s) => (s === 1 ? 2 : s));
          audioRef.current?.playStamp();
        }
        return;
      }

      if (tacticalMode === 'reroll_col') {
        const col = cellIdx % BOARD_COLS;
        handleColumnReroll(col);
        setTacticalMode('none');
        return;
      }

      if (tacticalMode === 'swap') {
        if (run.phase !== 'post_spin') return;
        if (swapAnchorIdx === null) {
          setSwapAnchorIdx(cellIdx);
          return;
        }
        if (swapAnchorIdx === cellIdx) {
          setSwapAnchorIdx(null);
          return;
        }
        if (areCellsAdjacent(swapAnchorIdx, cellIdx)) {
          const nextState = swapAdjacentCells(run, swapAnchorIdx, cellIdx);
          if (nextState !== run) {
            setRun(nextState);
            setOnboardingStep((s) => (s === 1 ? 2 : s));
            audioRef.current?.playCoinPayout(
              nextState.currentEval?.totalCoins ?? 0,
            );
          }
          setSwapAnchorIdx(null);
          setTacticalMode('none');
        } else {
          setSwapAnchorIdx(cellIdx);
        }
        return;
      }

      if (tacticalMode === 'renovate') {
        const nextState = renovateBoardCell(run, cellIdx, selectedRoomBrush);
        if (nextState !== run) {
          setRun(nextState);
          audioRef.current?.playStamp();
        }
      }
    },
    [
      handleColumnReroll,
      run,
      selectedRoomBrush,
      swapAnchorIdx,
      tacticalMode,
    ],
  );

  const handleMergeSymbol = useCallback(
    (defId: string) => {
      const nextState = mergeTripleSymbol(run, defId);
      if (nextState !== run) {
        setRun(nextState);
        audioRef.current?.playStarMerge();
      }
    },
    [run],
  );

  const handleRemoveSymbol = useCallback(
    (uid: string) => {
      const nextState = removeDeckSymbol(run, uid);
      if (nextState !== run) {
        setRun(nextState);
        audioRef.current?.playStamp();
      }
    },
    [run],
  );

  const handleSignContract = useCallback(
    (contractId: string) => {
      const nextState = signRentContract(run, contractId);
      if (nextState !== run) {
        setRun(nextState);
        audioRef.current?.playStamp();
      }
    },
    [run],
  );

  const handlePayRent = useCallback(() => {
    const nextState = payRentAndAdvanceCycle(run, selectedRelicId);
    if (nextState !== run) {
      setRun(nextState);
      setOnboardingStep(null);
      setPrefs((p) => (p.tutorialCompleted ? p : { ...p, tutorialCompleted: true }));
      audioRef.current?.playRentSuccess();
    }
  }, [run, selectedRelicId]);

  const handleDismissOnboarding = useCallback(() => {
    setOnboardingStep(null);
    setPrefs((p) => (p.tutorialCompleted ? p : { ...p, tutorialCompleted: true }));
  }, []);

  const handleReplayOnboarding = useCallback(() => {
    setShowTutorialModal(false);
    setShowCompendium(false);
    setShowDeckModal(false);
    setOnboardingStep(0);
    setScreenState('playing');
    audioRef.current?.playStamp();
  }, []);

  const handleEnterEndless = useCallback(() => {
    const nextState = enterEndlessMode(run);
    setRun(nextState);
    audioRef.current?.playStamp();
  }, [run]);

  // Global keyboard shortcuts (Title Enter/Space, Playing Space/1-3/L/S/R/B/H/M/P/Esc)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (showCompendium || showDeckModal || showTutorialModal) {
        if (e.code === 'Escape' || (e.code === 'KeyH' && showTutorialModal)) {
          e.preventDefault();
          setShowTutorialModal(false);
          setShowCompendium(false);
          setShowDeckModal(false);
        }
        return;
      }

      if (e.code === 'KeyH') {
        e.preventDefault();
        setShowTutorialModal(true);
        return;
      }

      if (screenState === 'title') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          startFreshRun();
        }
        return;
      }

      if (e.code === 'KeyM') {
        e.preventDefault();
        setPrefs((p) => ({ ...p, muted: !p.muted }));
        return;
      }

      if (e.code === 'Escape') {
        e.preventDefault();
        if (tacticalMode !== 'none') {
          setTacticalMode('none');
          setSwapAnchorIdx(null);
          return;
        }
        setScreenState((s) => (s === 'playing' ? 'paused' : 'playing'));
        return;
      }

      if (e.code === 'KeyP') {
        e.preventDefault();
        setScreenState((s) => (s === 'playing' ? 'paused' : 'playing'));
        return;
      }

      if (screenState !== 'playing') return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (run.phase === 'ready') {
          handleSpin();
        } else if (run.phase === 'post_spin') {
          handleDraftPick(null);
        } else if (run.phase === 'rent_due') {
          handlePayRent();
        }
        return;
      }

      if (run.phase === 'post_spin') {
        if (e.code === 'Digit1' && run.draftChoices[0]) {
          e.preventDefault();
          handleDraftPick(run.draftChoices[0]);
        } else if (e.code === 'Digit2' && run.draftChoices[1]) {
          e.preventDefault();
          handleDraftPick(run.draftChoices[1]);
        } else if (e.code === 'Digit3' && run.draftChoices[2]) {
          e.preventDefault();
          handleDraftPick(run.draftChoices[2]);
        }
      }

      if (e.code === 'KeyL') {
        e.preventDefault();
        setSwapAnchorIdx(null);
        setTacticalMode((m) => (m === 'lock' ? 'none' : 'lock'));
      } else if (e.code === 'KeyS' && run.phase === 'post_spin') {
        e.preventDefault();
        setSwapAnchorIdx(null);
        setTacticalMode((m) => (m === 'swap' ? 'none' : 'swap'));
      } else if (e.code === 'KeyR' && run.phase === 'post_spin') {
        e.preventDefault();
        setSwapAnchorIdx(null);
        setTacticalMode((m) => (m === 'reroll_col' ? 'none' : 'reroll_col'));
      } else if (e.code === 'KeyB') {
        e.preventDefault();
        setSwapAnchorIdx(null);
        setTacticalMode((m) => (m === 'renovate' ? 'none' : 'renovate'));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleDraftPick,
    handlePayRent,
    handleSpin,
    run.draftChoices,
    run.phase,
    screenState,
    showCompendium,
    showDeckModal,
    showTutorialModal,
    startFreshRun,
    tacticalMode,
  ]);

  const deckByUid = useMemo(() => {
    const map = new Map(run.deck.map((s) => [s.uid, s]));
    return map;
  }, [run.deck]);

  const mergeableDefIds = useMemo(() => getMergeableDefIds(run), [run]);
  const landlordDef = LANDLORDS_BY_ID[run.landlordId];
  const activeMarketEvent = run.currentEventId
    ? MARKET_EVENTS_BY_ID[run.currentEventId] ?? null
    : null;

  // ==================== 1. TITLE SCREEN ====================
  if (screenState === 'title') {
    const chosenLandlord = LANDLORDS_BY_ID[selectedLandlordId];

    return (
      <main className="w-full h-full overflow-y-auto bg-[#FAF8F4] text-[#1C1917]">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-8 sm:py-12 flex flex-col justify-between min-h-full gap-8">
          {/* Top Hero Lockup */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start border-b border-[#E4DFD5] pb-8">
            <div className="lg:col-span-7 flex items-start gap-5">
              <LuckyLedgerEmblemSvg className="w-16 h-16 sm:w-20 sm:h-20 shrink-0" />
              <div className="space-y-2">
                <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-[#1C1917]">
                  吉星包租公
                </h1>
                <p className="text-sm sm:text-base text-[#57534E] leading-relaxed max-w-xl">
                  四乘五账本滚轮构筑，融合主动调换控盘、单列重摇、永久房型改造与三连金卡升星的策略收租肉鸽。
                </p>
              </div>
            </div>

            {/* Primary Actions */}
            <div className="lg:col-span-5 flex flex-col sm:flex-row lg:flex-col items-stretch gap-2.5">
              <button
                type="button"
                data-start="true"
                data-testid="start-new-run"
                onClick={startFreshRun}
                className="px-5 py-3.5 rounded-lg bg-[#C2410C] hover:bg-[#9A3412] text-white text-sm font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>开张新账本（以{chosenLandlord.name}开局）</span>
              </button>

              {savedRunPreview && (
                <button
                  type="button"
                  data-testid="resume-saved-run"
                  onClick={resumeSavedRun}
                  className="px-5 py-2.5 rounded-lg bg-white hover:bg-[#F2EFE9] border border-[#D6D0C4] text-[#1C1917] text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap text-center tabular-nums"
                >
                  继续未完账本（{LANDLORDS_BY_ID[savedRunPreview.landlordId].name} · 第{' '}
                  {savedRunPreview.cycle} 期 · {savedRunPreview.coins} 金币）
                </button>
              )}

              <button
                type="button"
                data-testid="open-tutorial-title"
                onClick={() => setShowTutorialModal(true)}
                className="px-5 py-2.5 rounded-lg bg-[#FFFBEB] hover:bg-[#FEF3C7] border border-[#F59E0B] text-[#92400E] text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>新手指引（30秒上手）</span>
              </button>

              <button
                type="button"
                data-testid="open-compendium-title"
                onClick={() => setShowCompendium(true)}
                className="px-5 py-2.5 rounded-lg bg-[#F2EFE9] hover:bg-[#E7E2D8] text-[#1C1917] text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>查阅全图鉴与收租榜单</span>
              </button>
            </div>
          </section>

          {/* Landlord Archetype Selection */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-base font-bold text-[#1C1917]">
                选择当家房东与初始产业
              </h2>
              <div className="flex items-center gap-2 text-xs text-[#57534E]">
                <label htmlFor="ascension-select" className="font-medium">
                  挑战难度曲线：
                </label>
                <select
                  id="ascension-select"
                  data-testid="ascension-select"
                  value={selectedAscension}
                  onChange={(e) => setSelectedAscension(Number(e.target.value))}
                  className="px-2.5 py-1 rounded border border-[#D6D0C4] bg-white text-[#1C1917] font-mono-num text-xs"
                >
                  <option value={0}>
                    难度 0（轻松休闲 · 租金 -18% + 赠调度令）
                  </option>
                  {Array.from({ length: 10 }, (_, idx) => idx + 1).map((lvl) => (
                    <option
                      key={lvl}
                      value={lvl}
                      disabled={lvl > meta.unlockedAscension}
                    >
                      难度 {lvl}{' '}
                      {lvl > meta.unlockedAscension
                        ? '（通关前一阶梯解锁）'
                        : lvl === 1
                          ? '（标准推荐）'
                          : `（宗师阶梯 · 租金 +${(lvl - 1) * 9}%）`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {LANDLORDS.map((ll) => {
                const active = ll.id === selectedLandlordId;
                return (
                  <button
                    key={ll.id}
                    type="button"
                    data-testid={`select-landlord-${ll.id}`}
                    onClick={() => setSelectedLandlordId(ll.id)}
                    className={`text-left p-5 rounded-xl border transition-colors cursor-pointer flex flex-col justify-between gap-3 ${
                      active
                        ? 'bg-white border-[#C2410C]'
                        : 'bg-white/70 border-[#E4DFD5] hover:border-[#A8A29E]'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="text-base font-bold text-[#1C1917]">
                          {ll.name}{' '}
                          <span className="text-xs font-normal text-[#78716C]">
                            · {ll.title}
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-[#C2410C]">
                          {active ? '已选定' : '点击选用'}
                        </span>
                      </div>
                      <p className="text-xs text-[#78716C]">{ll.motto}</p>
                      <p className="text-xs text-[#1C1917] leading-relaxed pt-1">
                        {ll.perkSummary}
                      </p>
                    </div>
                    <div className="pt-2.5 border-t border-[#F2EFE9] text-[11px] text-[#57534E]">
                      初始班底：
                      {ll.starterDeckIds
                        .map((id) => SYMBOLS_BY_ID[id]?.name)
                        .join(' · ')}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Flat Single-Line Control Hint */}
          <footer className="pt-4 border-t border-[#E4DFD5] flex flex-wrap items-center justify-between gap-2 text-xs text-[#78716C]">
            <span>
              快捷键：Space 摇动账本或跳过选牌 · 1/2/3 招募候选 · L 锁定格子 · S 相邻调换 · R 单列重摇 · B 装修 · P 暂停
            </span>
            <span className="font-mono-num">
              最高纪录：第 {meta.highestCycle} 期 · 单轮 +{meta.highestSingleSpin}
            </span>
          </footer>
        </div>

        {showCompendium && (
          <CompendiumModal meta={meta} onClose={() => setShowCompendium(false)} />
        )}

        {showTutorialModal && (
          <TutorialModal
            onClose={() => setShowTutorialModal(false)}
            onStartGuidedPractice={() => {
              setShowTutorialModal(false);
              setOnboardingStep(0);
              startFreshRun();
            }}
          />
        )}
      </main>
    );
  }

  // ==================== 2. ACTIVE PLAY LEDGER TABLETOP ====================
  const rentProgressPct = Math.min(
    100,
    Math.round((run.coins / Math.max(1, run.rentTarget)) * 100),
  );
  const rentMet = run.coins >= run.rentTarget;
  const isFreeColReroll =
    landlordDef.freeFirstColReroll && !run.usedFreeColRerollThisSpin;
  const colRerollCost = isFreeColReroll ? 0 : 1;

  // Determine inspected detail for the right-hand ledger inspector
  const inspectedCell = run.board[inspectedCellIdx] ?? run.board[0];
  const inspectedEvalCell = run.currentEval?.cells[inspectedCellIdx] ?? null;
  const inspectedBoardInst = inspectedCell.symbolUid
    ? deckByUid.get(inspectedCell.symbolUid) ?? null
    : null;
  const inspectedDef = inspectedDraftDefId
    ? SYMBOLS_BY_ID[inspectedDraftDefId] ?? null
    : inspectedBoardInst
      ? SYMBOLS_BY_ID[inspectedBoardInst.defId] ?? null
      : null;

  return (
    <main className="relative w-full h-full overflow-y-auto bg-[#FAF8F4] text-[#1C1917] select-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 sm:py-3 space-y-2.5">
        {/* Top Unified Ledger Perimeter Bar */}
        <section
          aria-label="当期账单与控盘资源"
          className="bg-white border border-[#E4DFD5] rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3"
        >
          {/* Left: Cycle & Rent Progress */}
          <div className="flex flex-wrap items-center gap-5">
            <div>
              <div className="text-[11px] text-[#78716C]">
                {landlordDef.name} ·{' '}
                {run.ascension === 0 ? '轻松休闲' : `阶梯 ${run.ascension}`} ·{' '}
                {run.isEndless
                  ? `无尽第 ${run.cycle} 期`
                  : `第 ${run.cycle}/${VICTORY_CYCLE} 期账单`}
              </div>
              <div className="flex items-baseline gap-2 mt-0.5 font-mono-num">
                <span
                  data-testid="hud-coins"
                  className={`text-2xl sm:text-3xl font-bold ${
                    rentMet ? 'text-[#15803D]' : 'text-[#1C1917]'
                  }`}
                >
                  {run.coins}
                </span>
                <span className="text-sm text-[#78716C]">
                  / {run.rentTarget} 租金目标
                </span>
                <span
                  className={`text-xs font-sans font-semibold ${
                    rentMet ? 'text-[#15803D]' : 'text-[#B45309]'
                  }`}
                >
                  {rentMet
                    ? '（已攒够本期房租）'
                    : `（还差 ${run.rentTarget - run.coins}）`}
                </span>
              </div>
              <div className="w-52 sm:w-64 h-1.5 bg-[#F2EFE9] rounded-full overflow-hidden mt-1.5">
                <div
                  className={`h-full transition-transform duration-150 origin-left ${
                    rentMet ? 'bg-[#15803D]' : 'bg-[#C2410C]'
                  }`}
                  style={{ transform: `scaleX(${rentProgressPct / 100})` }}
                />
              </div>
            </div>

            {/* Spins Remaining & Dispatch Tokens */}
            <div className="flex items-center gap-4 border-l border-[#E4DFD5] pl-4">
              <div>
                <div className="text-[11px] text-[#78716C]">交租剩余轮数</div>
                <div
                  data-testid="hud-spins-left"
                  className="text-xl font-bold font-mono-num text-[#1C1917]"
                >
                  {run.spinsLeftInCycle}{' '}
                  <span className="text-xs font-normal text-[#78716C]">
                    / {run.spinsPerCycle} 轮
                  </span>
                </div>
              </div>

              <div>
                <div className="text-[11px] text-[#78716C]">主动调度令</div>
                <div
                  data-testid="hud-dispatch-tokens"
                  className="flex items-center gap-1.5 mt-0.5"
                >
                  <span className="text-xl font-bold font-mono-num text-[#C2410C]">
                    {run.dispatchTokens}
                  </span>
                  <span className="text-xs font-mono-num text-[#78716C]">
                    /{run.maxDispatchTokens}
                  </span>
                </div>
              </div>

              <div className="hidden sm:block text-xs text-[#57534E] font-mono-num">
                <div>装修券：{run.renovationTickets}</div>
                <div>移除券：{run.removeTokens}</div>
              </div>
            </div>
          </div>

          {/* Right: Deck, Compendium, Speed, Mute, Pause */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="open-deck-btn"
              onClick={(e) => {
                e.currentTarget.blur();
                setShowDeckModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#F2EFE9] hover:bg-[#E7E2D8] text-xs font-semibold text-[#1C1917] transition-colors cursor-pointer whitespace-nowrap"
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="tabular-nums">牌库 ({run.deck.length})</span>
            </button>

            <button
              type="button"
              data-testid="open-compendium-btn"
              onClick={(e) => {
                e.currentTarget.blur();
                setShowCompendium(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#F2EFE9] hover:bg-[#E7E2D8] text-xs font-semibold text-[#1C1917] transition-colors cursor-pointer whitespace-nowrap"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>图鉴</span>
            </button>

            <button
              type="button"
              data-testid="open-tutorial-btn"
              onClick={(e) => {
                e.currentTarget.blur();
                setShowTutorialModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FFFBEB] hover:bg-[#FEF3C7] border border-[#F59E0B] text-xs font-bold text-[#92400E] transition-colors cursor-pointer whitespace-nowrap"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>指引</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                setPrefs((p) => ({ ...p, fastSpin: !p.fastSpin }));
              }}
              aria-label={prefs.fastSpin ? '切换标准转速' : '切换极速落位'}
              title={prefs.fastSpin ? '极速落位已开启' : '标准滚轮节奏'}
              className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                prefs.fastSpin
                  ? 'bg-[#FEF3C7] border-[#F59E0B] text-[#92400E]'
                  : 'bg-white border-[#E4DFD5] text-[#57534E] hover:text-[#1C1917]'
              }`}
            >
              <Zap className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                setPrefs((p) => ({ ...p, muted: !p.muted }));
              }}
              aria-label={prefs.muted ? '开启音效' : '静音'}
              title="静音切换 [M]"
              className="p-2 rounded-lg bg-white border border-[#E4DFD5] text-[#57534E] hover:text-[#1C1917] transition-colors cursor-pointer"
            >
              {prefs.muted ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>

            <button
              type="button"
              data-testid="pause-game-btn"
              onClick={(e) => {
                e.currentTarget.blur();
                setScreenState('paused');
              }}
              aria-label="暂停游戏"
              title="暂停 [P]"
              className="p-2 rounded-lg bg-white border border-[#E4DFD5] text-[#57534E] hover:text-[#1C1917] transition-colors cursor-pointer"
            >
              <Pause className="w-4 h-4" />
            </button>
          </div>
        </section>

        {/* Active Market Event / Contract Notice Strip (only when active) */}
        {(activeMarketEvent || run.activeContracts.length > 0) && (
          <div className="px-4 py-2 rounded-lg bg-[#F2EFE9] border border-[#E4DFD5] flex flex-wrap items-center justify-between gap-2 text-xs text-[#57534E]">
            {activeMarketEvent && (
              <div>
                <span className="font-bold text-[#1C1917]">
                  当期街区行情 · {activeMarketEvent.name}：
                </span>
                <span>{activeMarketEvent.desc}</span>
              </div>
            )}
            {run.activeContracts.length > 0 && (
              <div className="text-[#9A3412] font-medium">
                生效契约：
                {run.activeContracts
                  .map(
                    (ac) =>
                      `${CONTRACTS_BY_ID[ac.contractId]?.name}（余 ${ac.remainingCycles} 期）`,
                  )
                  .join(' · ')}
              </div>
            )}
          </div>
        )}

        {/* Main 2-Column Asymmetric Ledger Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* LEFT 8 COLS: 4x5 Board + Tactical Controls + Draft / Rent Dock */}
          <div className="lg:col-span-8 space-y-2.5">
            {/* Action-Driven 4-Step Live Onboarding Coach Strip (Auto-guides first-time players & supports anytime replay) */}
            {onboardingStep !== null && (
              <div
                data-testid="beginner-coach-strip"
                className="p-3 rounded-xl bg-[#FFFBEB] border border-[#F59E0B] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 text-xs">
                  <div className="font-bold text-[#92400E]">
                    {onboardingStep === 0
                      ? '实战带教 1/4 · 摇动账本自动收租'
                      : onboardingStep === 1
                        ? '实战带教 2/4 · 试试「主动调度令」控盘改命'
                        : onboardingStep === 2
                          ? '实战带教 3/4 · 三选一精选连携租客（不贪杂牌）'
                          : run.phase === 'rent_due'
                            ? '实战带教 4/4 · 账单达标！选枚传家宝印章缴租过关'
                            : '实战带教 4/4 · 善用免费装修券改造旺铺，攒够左上角房租'}
                  </div>
                  <p className="text-[#57534E] leading-relaxed">
                    {onboardingStep === 0
                      ? '点击棋盘下方的橙色按钮【摇动账本收租】（或按空格键），租客会落入 20 间房并自动结算相邻 8 格连携加成。'
                      : onboardingStep === 1
                        ? '若两个有配合的租客差一格没挨着，点【相邻调换】挪到一起即可当场补领连携差额（也可点【单列重摇】或直接选牌进入下一步）。'
                        : onboardingStep === 2
                          ? '从下方 3 张候选卡挑选 1 张能配合当前流派的租客入驻；若无合适配合，果断点击【跳过招募领 +2 补贴】精简牌库。'
                          : run.phase === 'rent_due'
                            ? '下方挑选 1 枚传家宝印章并点击绿色按钮【缴清房租进入下一期】即可完成首轮实战结业！'
                            : '盯着左上角剩余轮数与租金目标：有免费装修券时可点【格子装修】打造收益翻倍的临街旺铺，凑齐 3 张同名卡还能一键升 2★！'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {onboardingStep === 0 && run.phase === 'ready' && (
                    <button
                      type="button"
                      onClick={handleSpin}
                      className="px-2.5 py-1.5 rounded-lg bg-[#C2410C] hover:bg-[#9A3412] text-xs font-bold text-white cursor-pointer whitespace-nowrap"
                    >
                      立即摇动账本
                    </button>
                  )}
                  {onboardingStep === 1 &&
                    run.phase === 'post_spin' &&
                    run.dispatchTokens >= 1 &&
                    tacticalMode !== 'swap' && (
                      <button
                        type="button"
                        onClick={() => {
                          setSwapAnchorIdx(null);
                          setTacticalMode('swap');
                          setOnboardingStep(2);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-[#C2410C] hover:bg-[#9A3412] text-xs font-bold text-white cursor-pointer whitespace-nowrap"
                      >
                        开启相邻调换
                      </button>
                    )}
                  {onboardingStep === 3 &&
                    run.phase !== 'rent_due' &&
                    run.renovationTickets > 0 &&
                    tacticalMode !== 'renovate' && (
                      <button
                        type="button"
                        onClick={() => {
                          setSwapAnchorIdx(null);
                          setTacticalMode('renovate');
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-[#15803D] hover:bg-[#166534] text-xs font-bold text-white cursor-pointer whitespace-nowrap"
                      >
                        开启格子装修
                      </button>
                    )}
                  <button
                    type="button"
                    onClick={() => setShowTutorialModal(true)}
                    className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-[#FAF8F4] border border-[#D6D0C4] text-xs font-semibold text-[#1C1917] cursor-pointer whitespace-nowrap"
                  >
                    图文详解
                  </button>
                  <button
                    type="button"
                    data-testid="dismiss-coach-btn"
                    onClick={handleDismissOnboarding}
                    className="px-2.5 py-1.5 rounded-lg bg-[#EDE9E0] hover:bg-[#E2DDD1] text-xs font-medium text-[#57534E] hover:text-[#1C1917] cursor-pointer whitespace-nowrap"
                  >
                    {onboardingStep === 3 ? '完成带教' : '跳过指引'}
                  </button>
                </div>
              </div>
            )}

            {/* Tactical Manipulation Toolbar */}
            <div className="pb-2 border-b border-[#E4DFD5] flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  data-testid="tool-lock"
                  disabled={run.phase === 'rent_due'}
                  onClick={() => {
                    setSwapAnchorIdx(null);
                    setTacticalMode((m) => (m === 'lock' ? 'none' : 'lock'));
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                    tacticalMode === 'lock'
                      ? 'bg-[#1C1917] text-white border-[#1C1917]'
                      : 'bg-white text-[#1C1917] border-[#E4DFD5] hover:border-[#A8A29E]'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>锁定格子 [L] · 1令</span>
                </button>

                <button
                  type="button"
                  data-testid="tool-swap"
                  disabled={run.phase !== 'post_spin' || run.dispatchTokens < 1}
                  onClick={() => {
                    setSwapAnchorIdx(null);
                    setOnboardingStep((s) => (s === 1 ? 2 : s));
                    setTacticalMode((m) => (m === 'swap' ? 'none' : 'swap'));
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
                    tacticalMode === 'swap'
                      ? 'bg-[#C2410C] text-white border-[#C2410C] cursor-pointer'
                      : run.phase === 'post_spin' && run.dispatchTokens >= 1
                        ? 'bg-[#FAF8F4] text-[#1C1917] border-[#E4DFD5] hover:border-[#A8A29E] cursor-pointer'
                        : 'bg-[#FAF8F4] text-[#A8A29E] border-[#E4DFD5] cursor-not-allowed'
                  }`}
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  <span>相邻调换 [S] · 1令</span>
                </button>

                <button
                  type="button"
                  data-testid="tool-reroll-col"
                  disabled={
                    run.phase !== 'post_spin' ||
                    run.dispatchTokens < colRerollCost
                  }
                  onClick={() => {
                    setSwapAnchorIdx(null);
                    setOnboardingStep((s) => (s === 1 ? 2 : s));
                    setTacticalMode((m) =>
                      m === 'reroll_col' ? 'none' : 'reroll_col',
                    );
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
                    tacticalMode === 'reroll_col'
                      ? 'bg-[#C2410C] text-white border-[#C2410C] cursor-pointer'
                      : run.phase === 'post_spin' &&
                          run.dispatchTokens >= colRerollCost
                        ? 'bg-[#FAF8F4] text-[#1C1917] border-[#E4DFD5] hover:border-[#A8A29E] cursor-pointer'
                        : 'bg-[#FAF8F4] text-[#A8A29E] border-[#E4DFD5] cursor-not-allowed'
                  }`}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>
                    单列重摇 [R] · {isFreeColReroll ? '首抽免费' : '1令'}
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="tool-renovate"
                  onClick={() => {
                    setSwapAnchorIdx(null);
                    setTacticalMode((m) =>
                      m === 'renovate' ? 'none' : 'renovate',
                    );
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                    tacticalMode === 'renovate'
                      ? 'bg-[#15803D] text-white border-[#15803D]'
                      : 'bg-[#FAF8F4] text-[#1C1917] border-[#E4DFD5] hover:border-[#A8A29E]'
                  }`}
                >
                  <Hammer className="w-3.5 h-3.5" />
                  <span>
                    格子装修 [B]
                    {run.renovationTickets > 0
                      ? ` · 免费券(${run.renovationTickets})`
                      : ''}
                  </span>
                </button>
              </div>

              {/* Instant 1-Click Triple Star Merge Button when available */}
              {mergeableDefIds.length > 0 && (
                <button
                  type="button"
                  data-testid="quick-merge-btn"
                  onClick={() => handleMergeSymbol(mergeableDefIds[0])}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#B45309] hover:bg-[#92400E] text-white text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    三连升星：{SYMBOLS_BY_ID[mergeableDefIds[0]]?.name} → 2★
                  </span>
                </button>
              )}
            </div>

            {/* Active Mode Helper Banner or Room Renovation Brush Picker */}
            {tacticalMode === 'renovate' && (
              <div className="p-3 rounded-xl bg-white border border-[#86EFAC] space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-[#15803D]">
                    选择房型图纸后点击下方任意棋盘格子永久改造：
                  </span>
                  <button
                    type="button"
                    onClick={() => setTacticalMode('none')}
                    className="text-[#78716C] hover:text-[#1C1917] cursor-pointer"
                  >
                    完成装修
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {UPGRADEABLE_ROOMS.map((rm) => {
                    const cost =
                      run.renovationTickets > 0
                        ? '免券 1 张'
                        : `${getRenovationCoinCost(run, rm.id)} 金币`;
                    const selected = selectedRoomBrush === rm.id;
                    return (
                      <button
                        key={rm.id}
                        type="button"
                        data-testid={`brush-${rm.id}`}
                        onClick={() => setSelectedRoomBrush(rm.id)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                          selected
                            ? 'bg-[#1C1917] text-white border-[#1C1917]'
                            : 'bg-[#FAF8F4] text-[#1C1917] border-[#E4DFD5] hover:border-[#1C1917]'
                        }`}
                      >
                        <RoomBadgeSvg room={rm.id} className="w-3.5 h-3.5" />
                        <span>{rm.name}</span>
                        <span className="font-mono-num opacity-80">({cost})</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-[#57534E]">
                  {ROOMS_BY_ID[selectedRoomBrush].desc}
                </p>
              </div>
            )}

            {tacticalMode === 'swap' && (
              <div className="px-3.5 py-2 rounded-lg bg-[#FFFBEB] border border-[#F59E0B] text-xs text-[#92400E] flex items-center justify-between">
                <span>
                  {swapAnchorIdx === null
                    ? '相邻调换模式：请点击棋盘上第一个要移动的格子。'
                    : `已选定第 #${swapAnchorIdx + 1} 格，请点击高亮相邻格完成对调并实时重算连携（Esc 取消）。`}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setTacticalMode('none');
                    setSwapAnchorIdx(null);
                  }}
                  className="font-semibold underline cursor-pointer"
                >
                  取消
                </button>
              </div>
            )}

            {tacticalMode === 'lock' && (
              <div className="px-3.5 py-2 rounded-lg bg-[#F2EFE9] border border-[#D6D0C4] text-xs text-[#1C1917] flex items-center justify-between">
                <span>
                  锁定模式：点击任意有符号的格子将其锚定，下次摇动账本时该符号将留在原格不动（再次点击退还调度令）。
                </span>
                <button
                  type="button"
                  onClick={() => setTacticalMode('none')}
                  className="font-semibold underline cursor-pointer"
                >
                  退出锁定
                </button>
              </div>
            )}

            {/* 4x5 Ledger Board Grid (Single Elevation — Cells Directly on Warm Paper) */}
            <div data-testid="ledger-board" className="space-y-1.5">
              {/* Column Headers + Direct Column Reroll Buttons */}
              <div className="grid grid-cols-5 gap-2">
                {[0, 1, 2, 3, 4].map((col) => {
                  const canReroll =
                    run.phase === 'post_spin' &&
                    run.dispatchTokens >= colRerollCost;
                  return (
                    <div
                      key={col}
                      className="flex items-center justify-between px-1 text-[11px] text-[#78716C]"
                    >
                      <span className="font-mono-num">第 {col + 1} 列</span>
                      {run.phase === 'post_spin' && (
                        <button
                          type="button"
                          disabled={!canReroll}
                          onClick={() => handleColumnReroll(col)}
                          title={
                            isFreeColReroll
                              ? '免费重摇此列'
                              : '消耗 1 调度令重摇此列'
                          }
                          className={`inline-flex items-center gap-0.5 font-semibold transition-colors ${
                            canReroll
                              ? 'text-[#C2410C] hover:underline cursor-pointer'
                              : 'text-[#D6D0C4] cursor-not-allowed'
                          }`}
                        >
                          <RefreshCw className="w-2.5 h-2.5" />
                          <span>重摇</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 20 Cells (4 rows x 5 cols) */}
              <div className="grid grid-cols-5 gap-2">
                {run.board.map((cell) => {
                  const colIdx = cell.index % BOARD_COLS;
                  const isColRolling = rollingCols[colIdx];
                  const roomDef = ROOMS_BY_ID[cell.room];
                  const inst = cell.symbolUid
                    ? deckByUid.get(cell.symbolUid) ?? null
                    : null;
                  const symDef = inst ? SYMBOLS_BY_ID[inst.defId] ?? null : null;
                  const evalCell = run.currentEval?.cells[cell.index] ?? null;

                  const isSwapSource = swapAnchorIdx === cell.index;
                  const isSwapNeighbor =
                    tacticalMode === 'swap' &&
                    swapAnchorIdx !== null &&
                    areCellsAdjacent(swapAnchorIdx, cell.index);
                  const isInspected =
                    inspectedCellIdx === cell.index && !inspectedDraftDefId;

                  return (
                    <button
                      key={cell.index}
                      type="button"
                      data-testid={`board-cell-${cell.index}`}
                      onClick={() => handleCellClick(cell.index)}
                      onMouseEnter={() => {
                        setInspectedCellIdx(cell.index);
                        setInspectedDraftDefId(null);
                      }}
                      style={{
                        backgroundColor: roomDef.bgHex,
                        borderColor: isSwapSource
                          ? '#C2410C'
                          : isSwapNeighbor
                            ? '#D97706'
                            : isInspected
                              ? '#1C1917'
                              : roomDef.borderHex,
                      }}
                      className={`relative min-h-[76px] sm:min-h-[82px] rounded-lg border px-2 py-1.5 flex flex-col items-center justify-between transition-transform duration-150 cursor-pointer ${
                        isSwapNeighbor ? 'border-dashed border-2' : ''
                      } ${isColRolling ? 'opacity-55 scale-95' : 'opacity-100 scale-100'}`}
                    >
                      {/* Top Row: Room Label & Lock Indicator */}
                      <div className="w-full flex items-center justify-between gap-1 text-[10px] leading-none">
                        {cell.room !== 'plain' ? (
                          <span
                            style={{ color: roomDef.accentHex }}
                            className="inline-flex items-center gap-0.5 font-bold truncate"
                          >
                            <RoomBadgeSvg
                              room={cell.room}
                              className="w-3 h-3 shrink-0"
                            />
                            <span>{roomDef.shortLabel}</span>
                          </span>
                        ) : (
                          <span className="text-[#A8A29E] font-mono-num">
                            #{cell.index + 1}
                          </span>
                        )}

                        {cell.locked && (
                          <span className="inline-flex items-center gap-0.5 font-bold text-[#1C1917]">
                            <Lock className="w-2.5 h-2.5" />
                            <span>锁</span>
                          </span>
                        )}
                      </div>

                      {/* Center Symbol Art & Star Tag */}
                      {symDef && inst ? (
                        <div
                          className={`flex flex-col items-center my-0.5 ${
                            evalCell?.destroyed ? 'opacity-45' : ''
                          }`}
                        >
                          <div className="relative">
                            <SymbolArtSvg
                              defId={symDef.id}
                              stars={inst.stars}
                              className="w-8 h-8 sm:w-9 sm:h-9"
                            />
                            {inst.stars === 2 && (
                              <span className="absolute -top-1 -right-2 text-[10px] font-mono-num font-bold text-[#B45309] bg-[#FEF3C7] px-1 rounded">
                                2★
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] sm:text-xs font-semibold text-[#1C1917] truncate max-w-[74px] sm:max-w-[92px] mt-0.5">
                            {symDef.name}
                          </span>
                        </div>
                      ) : (
                        <div className="flex-1 flex items-center justify-center text-[11px] text-[#CBC4B6]">
                          空置
                        </div>
                      )}

                      {/* Bottom Row: Live Spin Payout or Idle Base Output */}
                      <div className="w-full flex items-center justify-between text-[10px] font-mono-num leading-none">
                        {inst && symDef?.countdown ? (
                          <span className="text-[#78716C]">
                            计 {inst.counter}/{symDef.countdown}
                          </span>
                        ) : inst && inst.permBonus > 0 ? (
                          <span className="text-[#15803D]">
                            养+{inst.permBonus}
                          </span>
                        ) : (
                          <span />
                        )}

                        {evalCell &&
                        (evalCell.finalCoins !== 0 || evalCell.destroyed) ? (
                          <span
                            className={`font-bold ${
                              evalCell.destroyed
                                ? 'text-[#C2410C]'
                                : evalCell.finalCoins > 0
                                  ? 'text-[#15803D]'
                                  : 'text-[#DC2626]'
                            }`}
                          >
                            {evalCell.destroyed
                              ? `拆 ${evalCell.finalCoins >= 0 ? `+${evalCell.finalCoins}` : evalCell.finalCoins}`
                              : evalCell.finalCoins > 0
                                ? `+${evalCell.finalCoins}`
                                : evalCell.finalCoins}
                          </span>
                        ) : symDef && inst ? (
                          <span className="text-[#78716C]">
                            基准{' '}
                            {getSymbolBaseCoins(symDef.id, inst.stars) +
                              inst.permBonus}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Primary Bottom Action / Draft / Rent Settlement Dock */}
            {run.phase === 'ready' && (
              <div className="bg-white border border-[#E4DFD5] rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs text-[#57534E] space-y-0.5">
                  <div className="font-semibold text-[#1C1917]">
                    {run.lastTurnSummary[0] ?? '账本待命'}
                  </div>
                  {run.lastTurnSummary[1] && <div>{run.lastTurnSummary[1]}</div>}
                </div>

                <button
                  type="button"
                  data-testid="spin-board-btn"
                  onClick={handleSpin}
                  className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-[#C2410C] hover:bg-[#9A3412] text-white text-sm font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  摇动账本收租 [Space]
                </button>
              </div>
            )}

            {run.phase === 'post_spin' && run.currentEval && (
              <div
                data-testid="draft-dock"
                className="pt-2.5 border-t border-[#E4DFD5] space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-sm font-bold text-[#1C1917]">
                      本轮账面实收{' '}
                      <span className="font-mono-num text-base text-[#15803D]">
                        +{run.currentEval.totalCoins}
                      </span>{' '}
                      金币
                    </span>
                    <span className="text-xs text-[#78716C] ml-2">
                      · 可先用【相邻调换 / 单列重摇】改命，再招募 1 项入驻结算
                    </span>
                  </div>

                  <button
                    type="button"
                    data-testid="skip-draft-btn"
                    onClick={() => handleDraftPick(null)}
                    className="px-3 py-1.5 rounded-lg bg-[#EDE9E0] hover:bg-[#E2DDD1] text-xs font-semibold text-[#1C1917] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    跳过招募领 +2 补贴 [Space]
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {run.draftChoices.map((defId, idx) => {
                    const def = SYMBOLS_BY_ID[defId];
                    if (!def) return null;
                    const st = STREAMS_BY_ID[def.stream];
                    const rar = RARITY_META[def.rarity];
                    const ownedCopies = run.deck.filter(
                      (s) => s.defId === defId && s.stars === 1,
                    ).length;

                    return (
                      <button
                        key={`${defId}_${idx}`}
                        type="button"
                        data-testid={`draft-card-${idx}`}
                        onMouseEnter={() => setInspectedDraftDefId(defId)}
                        onClick={() => handleDraftPick(defId)}
                        className="text-left p-3 rounded-lg bg-white hover:bg-[#FFFBEB] border border-[#E4DFD5] hover:border-[#C2410C] transition-colors cursor-pointer flex flex-col justify-between gap-1.5"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <SymbolArtSvg
                                defId={def.id}
                                stars={1}
                                className="w-6 h-6 shrink-0"
                              />
                              <span className="text-sm font-bold text-[#1C1917] truncate">
                                {def.name}
                              </span>
                            </div>
                            <span className="text-xs font-mono-num text-[#78716C] shrink-0">
                              [{idx + 1}]
                            </span>
                          </div>

                          <div className="text-[11px] text-[#78716C]">
                            <span
                              style={{ color: st.colorHex }}
                              className="font-semibold"
                            >
                              {st.name}
                            </span>
                            <span> · </span>
                            <span style={{ color: rar.colorHex }}>
                              {rar.label}
                            </span>
                            <span> · 基准 </span>
                            <span className="font-mono-num font-semibold text-[#1C1917]">
                              {def.baseCoins >= 0
                                ? `+${def.baseCoins}`
                                : def.baseCoins}
                            </span>
                            {ownedCopies > 0 && (
                              <span className="text-[#B45309] font-semibold">
                                {' '}
                                · 已拥 {ownedCopies}/3
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-[#57534E] leading-snug line-clamp-2">
                            {def.desc}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {run.phase === 'rent_due' && (
              <div
                data-testid="rent-due-panel"
                className="bg-white border border-[#15803D] rounded-xl p-5 space-y-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#E4DFD5] pb-3">
                  <div>
                    <h2 className="text-base font-bold text-[#15803D]">
                      第 {run.cycle} 期物业账单核验通过（应缴 {run.rentTarget} 金币）
                    </h2>
                    <p className="text-xs text-[#57534E] mt-0.5">
                      请选择 1 枚传家宝印章奖励，并可自愿签署 1 份下周期对赌契约。
                    </p>
                  </div>
                  <span className="text-xs font-mono-num text-[#1C1917]">
                    缴后结余：{run.coins - run.rentTarget} 金币
                  </span>
                </div>

                {/* Relic Pick */}
                {run.pendingRelicChoices.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-[#1C1917]">
                      第一步：挑选传家宝印章（三选一）
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {run.pendingRelicChoices.map((rId) => {
                        const rel = RELICS_BY_ID[rId];
                        if (!rel) return null;
                        const active = selectedRelicId === rId;
                        return (
                          <button
                            key={rId}
                            type="button"
                            onClick={() => setSelectedRelicId(rId)}
                            className={`text-left p-3 rounded-lg border transition-colors cursor-pointer space-y-1 ${
                              active
                                ? 'bg-[#FFFBEB] border-[#C2410C]'
                                : 'bg-[#FAF8F4] border-[#E4DFD5] hover:border-[#A8A29E]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-bold text-[#1C1917]">
                                {rel.name}
                              </span>
                              {active && (
                                <Check className="w-3.5 h-3.5 text-[#C2410C]" />
                              )}
                            </div>
                            <p className="text-[11px] text-[#57534E] leading-relaxed">
                              {rel.desc}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Optional Boss Contracts */}
                {run.pendingContractChoices.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-[#1C1917]">
                      第二步：可选风险收益契约（可不签）
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {run.pendingContractChoices.map((cId) => {
                        const cDef = CONTRACTS_BY_ID[cId];
                        if (!cDef) return null;
                        return (
                          <div
                            key={cId}
                            className="p-3 rounded-lg bg-[#FAF8F4] border border-[#E4DFD5] flex items-start justify-between gap-3"
                          >
                            <div className="space-y-1 text-xs">
                              <div className="font-bold text-[#1C1917]">
                                {cDef.name}
                              </div>
                              <div className="text-[#15803D]">
                                收益：{cDef.rewardDesc}
                              </div>
                              <div className="text-[#B45309]">
                                代价：{cDef.riskDesc}
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={run.signedContractThisCycle}
                              onClick={() => handleSignContract(cId)}
                              className={`px-3 py-1.5 rounded text-xs font-semibold shrink-0 whitespace-nowrap ${
                                run.signedContractThisCycle
                                  ? 'bg-[#E7E2D8] text-[#78716C] cursor-not-allowed'
                                  : 'bg-[#1C1917] hover:bg-[#3F3A36] text-white cursor-pointer'
                              }`}
                            >
                              {run.signedContractThisCycle ? '已签约' : '盖章签约'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    data-testid="pay-rent-btn"
                    onClick={handlePayRent}
                    className="px-6 py-3 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white text-sm font-bold transition-colors cursor-pointer whitespace-nowrap"
                  >
                    缴清房租进入下一期 [Space]
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT 4 COLS: Live Inspector + Turn Ledger Breakdown + Owned Relics */}
          <aside className="lg:col-span-4 space-y-4">
            {/* Symbol & Room Inspector */}
            <section className="bg-white border border-[#E4DFD5] rounded-xl p-4 space-y-3">
              <div className="flex items-baseline justify-between border-b border-[#F2EFE9] pb-2">
                <h2 className="text-xs font-bold text-[#78716C]">
                  账本检视栏
                </h2>
                <span className="text-[11px] font-mono-num text-[#78716C]">
                  {inspectedDraftDefId
                    ? '候选招募预览'
                    : `格位 #${inspectedCell.index + 1} · ${ROOMS_BY_ID[inspectedCell.room].name}`}
                </span>
              </div>

              {inspectedDef ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-lg bg-[#FAF8F4] border border-[#E4DFD5] flex items-center justify-center shrink-0">
                      <SymbolArtSvg
                        defId={inspectedDef.id}
                        stars={
                          !inspectedDraftDefId && inspectedBoardInst
                            ? inspectedBoardInst.stars
                            : 1
                        }
                        className="w-8 h-8"
                      />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-[#1C1917]">
                        {inspectedDef.name}{' '}
                        {!inspectedDraftDefId &&
                          inspectedBoardInst?.stars === 2 && (
                            <span className="text-xs text-[#B45309]">2★精装</span>
                          )}
                      </div>
                      <div className="text-xs text-[#78716C]">
                        <span
                          style={{
                            color: STREAMS_BY_ID[inspectedDef.stream].colorHex,
                          }}
                          className="font-semibold"
                        >
                          {STREAMS_BY_ID[inspectedDef.stream].name}
                        </span>
                        <span> · </span>
                        <span>{RARITY_META[inspectedDef.rarity].label}</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-[#1C1917] leading-relaxed">
                    {inspectedDef.desc}
                  </p>
                  <p className="text-[11px] text-[#9A3412] leading-relaxed">
                    {inspectedDef.star2Desc}
                  </p>
                  <p className="text-[11px] text-[#78716C]">{inspectedDef.flavor}</p>

                  {!inspectedDraftDefId &&
                    inspectedEvalCell &&
                    inspectedEvalCell.notes.length > 0 && (
                      <div className="pt-2 border-t border-[#F2EFE9] text-xs text-[#15803D] font-medium">
                        本轮触发：{inspectedEvalCell.notes.join(' · ')}
                      </div>
                    )}
                </div>
              ) : (
                <div className="text-xs text-[#57534E] space-y-1">
                  <div className="font-semibold text-[#1C1917]">
                    {ROOMS_BY_ID[inspectedCell.room].name}（当前空置）
                  </div>
                  <p className="leading-relaxed">
                    {ROOMS_BY_ID[inspectedCell.room].desc}
                  </p>
                </div>
              )}
            </section>

            {/* Turn Revenue Ledger Stream */}
            <section className="bg-white border border-[#E4DFD5] rounded-xl p-4 space-y-2.5">
              <div className="flex items-baseline justify-between border-b border-[#F2EFE9] pb-2">
                <h2 className="text-xs font-bold text-[#78716C]">本轮连携流水</h2>
                <span className="text-xs font-mono-num font-bold text-[#15803D]">
                  {run.currentEval
                    ? `合计 +${run.currentEval.totalCoins}`
                    : `上轮小结`}
                </span>
              </div>

              {run.currentEval ? (
                <div className="max-h-48 overflow-y-auto space-y-1.5 text-xs">
                  {run.currentEval.cells
                    .filter((c) => c.notes.length > 0 || c.finalCoins >= 5)
                    .map((c) => (
                      <div
                        key={c.cellIndex}
                        className="flex items-baseline justify-between gap-2 text-[#57534E]"
                      >
                        <span className="truncate">
                          #{c.cellIndex + 1}{' '}
                          {c.defId ? SYMBOLS_BY_ID[c.defId]?.name : '驿站'}{' '}
                          {c.notes.length > 0 ? `(${c.notes.join(' / ')})` : ''}
                        </span>
                        <span className="font-mono-num font-semibold text-[#1C1917] shrink-0">
                          {c.finalCoins >= 0 ? `+${c.finalCoins}` : c.finalCoins}
                        </span>
                      </div>
                    ))}
                  {run.currentEval.globalNotes.map((gn, idx) => (
                    <div
                      key={idx}
                      className="text-[#9A3412] font-medium pt-1 border-t border-[#F2EFE9]"
                    >
                      全局结算：{gn}
                    </div>
                  ))}
                  {run.currentEval.cells.every(
                    (c) => c.notes.length === 0 && c.finalCoins < 5,
                  ) &&
                    run.currentEval.globalNotes.length === 0 && (
                      <div className="text-[#78716C]">
                        基础租金结算完毕，招募连携符号或装修格子可触发高倍流水。
                      </div>
                    )}
                </div>
              ) : (
                <ul className="space-y-1 text-xs text-[#57534E]">
                  {run.lastTurnSummary.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              )}
            </section>

            {/* Owned Relics List */}
            <section className="bg-white border border-[#E4DFD5] rounded-xl p-4 space-y-2">
              <div className="flex items-baseline justify-between border-b border-[#F2EFE9] pb-2">
                <h2 className="text-xs font-bold text-[#78716C]">
                  持有传家宝印章
                </h2>
                <span className="text-xs font-mono-num text-[#78716C]">
                  {run.relicIds.length} 枚
                </span>
              </div>
              {run.relicIds.length === 0 ? (
                <p className="text-xs text-[#78716C]">
                  每缴清一期房租即可免费挑选 1 枚传家宝印章。
                </p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {run.relicIds.map((rId) => {
                    const rel = RELICS_BY_ID[rId];
                    if (!rel) return null;
                    return (
                      <div key={rId} className="text-xs">
                        <span className="font-bold text-[#1C1917]">
                          {rel.name}：
                        </span>
                        <span className="text-[#57534E]">{rel.desc}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>

      {/* ==================== PAUSE MODAL ==================== */}
      {screenState === 'paused' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="游戏已暂停"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1C1917]/45"
        >
          <div className="w-full max-w-sm bg-[#FAF8F4] border border-[#D6D0C4] rounded-xl p-6 space-y-4">
            <h2 className="text-xl font-bold text-[#1C1917]">账本已暂歇</h2>
            <p className="text-xs text-[#57534E] tabular-nums">
              当前进度已自动保存：第 {run.cycle} 期 · 存款 {run.coins} /{' '}
              {run.rentTarget} 金币
            </p>
            <div className="flex flex-col gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setScreenState('playing')}
                className="w-full py-2.5 rounded-lg bg-[#C2410C] hover:bg-[#9A3412] text-white text-xs font-bold cursor-pointer"
              >
                继续收租
              </button>
              <button
                type="button"
                onClick={handleReplayOnboarding}
                className="w-full py-2.5 rounded-lg bg-[#FFFBEB] hover:bg-[#FEF3C7] border border-[#F59E0B] text-[#92400E] text-xs font-bold cursor-pointer"
              >
                重温四步实战带教
              </button>
              <button
                type="button"
                onClick={() => {
                  setScreenState('playing');
                  setShowTutorialModal(true);
                }}
                className="w-full py-2.5 rounded-lg bg-white hover:bg-[#F2EFE9] border border-[#D6D0C4] text-[#1C1917] text-xs font-semibold cursor-pointer"
              >
                查阅图文新手指引 [H]
              </button>
              <button
                type="button"
                onClick={startFreshRun}
                className="w-full py-2.5 rounded-lg bg-white hover:bg-[#F2EFE9] border border-[#D6D0C4] text-[#1C1917] text-xs font-semibold cursor-pointer inline-flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>重新开张本局</span>
              </button>
              <button
                type="button"
                onClick={() => setScreenState('title')}
                className="w-full py-2.5 rounded-lg bg-[#F2EFE9] hover:bg-[#E7E2D8] text-[#57534E] hover:text-[#1C1917] text-xs font-semibold cursor-pointer"
              >
                返回角色选择台
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== VICTORY / GAMEOVER MODAL ==================== */}
      {(run.phase === 'victory' || run.phase === 'gameover') && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={run.phase === 'victory' ? '收租通关结算' : '账期断租结算'}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1C1917]/50"
        >
          <div className="w-full max-w-md bg-[#FAF8F4] border border-[#D6D0C4] rounded-xl p-6 space-y-5">
            <div className="space-y-1">
              <h2
                className={`text-2xl font-bold ${
                  run.phase === 'victory' ? 'text-[#15803D]' : 'text-[#C2410C]'
                }`}
              >
                {run.phase === 'victory'
                  ? '十二期房租圆满结清！'
                  : '本期物业账单未能凑齐'}
              </h2>
              <p className="text-xs text-[#57534E]">
                {run.phase === 'victory'
                  ? `已解锁阶梯难度 ${meta.unlockedAscension}！你可以就此光荣封账，或进入无尽阶梯冲击极限单轮纪录。`
                  : `最终止步于第 ${run.cycle} 期（差 ${Math.max(0, run.rentTarget - run.coins)} 金币交租）。合理利用锁定格子与三连升星能显著稳定后期收益。`}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 rounded-lg bg-white border border-[#E4DFD5]">
                <div className="text-[11px] text-[#78716C]">到达账期</div>
                <div className="text-lg font-bold font-mono-num text-[#1C1917] mt-0.5">
                  第 {run.cycle} 期
                </div>
              </div>
              <div className="p-3 rounded-lg bg-white border border-[#E4DFD5]">
                <div className="text-[11px] text-[#78716C]">单轮最高</div>
                <div className="text-lg font-bold font-mono-num text-[#C2410C] mt-0.5">
                  +{run.bestSingleSpin}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-white border border-[#E4DFD5]">
                <div className="text-[11px] text-[#78716C]">累计总营收</div>
                <div className="text-lg font-bold font-mono-num text-[#1C1917] mt-0.5">
                  {run.totalCoinsEarned}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              {run.phase === 'victory' && (
                <button
                  type="button"
                  onClick={handleEnterEndless}
                  className="w-full py-3 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white text-xs font-bold cursor-pointer"
                >
                  转入无尽阶梯模式继续冲分
                </button>
              )}
              <button
                type="button"
                data-start="true"
                onClick={startFreshRun}
                className="w-full py-3 rounded-lg bg-[#C2410C] hover:bg-[#9A3412] text-white text-xs font-bold cursor-pointer"
              >
                再来一局新账本
              </button>
              <button
                type="button"
                onClick={() => setScreenState('title')}
                className="w-full py-2.5 rounded-lg bg-white hover:bg-[#F2EFE9] border border-[#D6D0C4] text-[#1C1917] text-xs font-semibold cursor-pointer"
              >
                返回房东选择台
              </button>
            </div>
          </div>
        </div>
      )}

      {showCompendium && (
        <CompendiumModal meta={meta} onClose={() => setShowCompendium(false)} />
      )}

      {showDeckModal && (
        <DeckAndMergeModal
          run={run}
          onMergeDefId={handleMergeSymbol}
          onRemoveSymbolUid={handleRemoveSymbol}
          onClose={() => setShowDeckModal(false)}
        />
      )}

      {showTutorialModal && (
        <TutorialModal
          onClose={() => setShowTutorialModal(false)}
          onStartGuidedPractice={handleReplayOnboarding}
        />
      )}
    </main>
  );
}
