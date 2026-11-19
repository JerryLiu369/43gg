import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BookOpen,
  Flame,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Sparkles,
  Volume2,
  VolumeX,
  Wind,
  Zap,
} from 'lucide-react';
import {
  ACT_NAMES,
  CAMPAIGN_STAGE_COUNT,
  DIFFICULTY_DEFS,
  DIFFICULTY_ORDER,
  ORB_DEFS,
  PEG_META,
  RELIC_DEFS,
} from './content.ts';
import { EmberForgeAudio } from './audio.ts';
import {
  computeAutoAimAngle,
  computeExpectedShotDamage,
  createNewForgeRun,
  enterEndlessMode,
  fireOrb,
  getActiveOrb,
  getStageDef,
  selectEnemyTarget,
  selectForgeReward,
  selectOrbIndex,
  setAimTowardPoint,
  stepSimulation,
  triggerBellowsPulse,
} from './engine.ts';
import { ForgeRewardModal } from './ForgeRewardModal.tsx';
import { HandbookModal } from './HandbookModal.tsx';
import { EmberForgeTitleEmblem, OrbGlyphSvg, PegGlyphSvg } from './icons.tsx';
import { EmberForgeRenderer } from './renderer.ts';
import {
  loadActiveForgeRun,
  loadForgeMeta,
  recordRunOutcome,
  saveActiveForgeRun,
  saveForgeMeta,
} from './storage.ts';
import type {
  BattlePhase,
  ForgeDifficulty,
  ForgeMetaSave,
  ForgeRewardOption,
  ForgeRunState,
  OwnedOrb,
  PegKind,
  RelicId,
  RunSummary,
  ScreenMode,
} from './types.ts';

type OnboardingStep = 1 | 2 | 3 | 4 | null;

const QUICK_LEGEND_PEGS: PegKind[] = ['crit', 'mult', 'bomb', 'wind', 'prism', 'shield'];

function hasAutostartFlag(): boolean {
  if (typeof window === 'undefined') return false;
  if (new URLSearchParams(window.location.search).get('autostart') === '1') {
    return true;
  }
  const hashIdx = window.location.hash.indexOf('?');
  if (hashIdx >= 0) {
    return (
      new URLSearchParams(window.location.hash.slice(hashIdx)).get('autostart') ===
      '1'
    );
  }
  return false;
}

interface LowFreqHud {
  phase: BattlePhase;
  stageIndex: number;
  isEndless: boolean;
  hp: number;
  maxHp: number;
  shield: number;
  score: number;
  bestCombo: number;
  bellowsCharges: number;
  maxBellowsCharges: number;
  activeOrbIndex: number;
  deck: OwnedOrb[];
  relics: RelicId[];
  pendingRewards: ForgeRewardOption[];
  summary: RunSummary | null;
  difficulty: ForgeDifficulty;
}

function snapshotHud(run: ForgeRunState): LowFreqHud {
  return {
    phase: run.phase,
    stageIndex: run.stageIndex,
    isEndless: run.isEndless,
    hp: run.hp,
    maxHp: run.maxHp,
    shield: run.shield,
    score: run.score,
    bestCombo: run.bestCombo,
    bellowsCharges: run.bellowsCharges,
    maxBellowsCharges: run.maxBellowsCharges,
    activeOrbIndex: run.activeOrbIndex,
    deck: run.deck.map((o) => ({ ...o })),
    relics: [...run.relics],
    pendingRewards: run.pendingRewards.map((r) => ({ ...r })),
    summary: run.summary ? { ...run.summary } : null,
    difficulty: run.difficulty,
  };
}

function hudEqual(a: LowFreqHud, b: LowFreqHud): boolean {
  return (
    a.phase === b.phase &&
    a.stageIndex === b.stageIndex &&
    a.isEndless === b.isEndless &&
    a.hp === b.hp &&
    a.maxHp === b.maxHp &&
    a.shield === b.shield &&
    a.score === b.score &&
    a.bestCombo === b.bestCombo &&
    a.bellowsCharges === b.bellowsCharges &&
    a.maxBellowsCharges === b.maxBellowsCharges &&
    a.activeOrbIndex === b.activeOrbIndex &&
    a.deck.length === b.deck.length &&
    a.deck.every(
      (o, i) =>
        o.uid === b.deck[i]?.uid &&
        o.typeId === b.deck[i]?.typeId &&
        o.level === b.deck[i]?.level,
    ) &&
    a.relics.length === b.relics.length &&
    a.pendingRewards.length === b.pendingRewards.length &&
    a.summary?.outcome === b.summary?.outcome &&
    a.difficulty === b.difficulty
  );
}

const ONBOARDING_COPY: Record<
  Exclude<OnboardingStep, null>,
  { title: string; detail: string }
> = {
  1: {
    title: '实战指引 1/4 · 瞄准并打出首枚炽铁球',
    detail: '移动指针或拖动炉膛观察反弹虚线，点击发射（手机点底部「发射」键），或点右侧示范。',
  },
  2: {
    title: '实战指引 2/4 · 半空发动「鼓风磁冲」',
    detail: '铁球弹跳下落时，按空格 / 右键或点击「鼓风磁冲」，将铁球托举回符钉阵继续攒连击！',
  },
  3: {
    title: '实战指引 3/4 · 撞响金铃暴击与倍增鼓',
    detail: '瞄准高亮的金铃（暴击×2）或火鼓（+0.5x），叠高火候后让铁球落底齐射破敌。',
  },
  4: {
    title: '实战指引 4/4 · 肃清敌军并在铁砧强化',
    detail: '击败上方傩偶后，可在铁砧三选一锻造新弹丸或铭刻炉火圣物，祝你通关三幕！',
  },
};

export default function EmberForgeApp() {
  const autostart = useMemo(() => hasAutostartFlag(), []);
  const [meta, setMeta] = useState<ForgeMetaSave>(() => loadForgeMeta());
  const metaRef = useRef<ForgeMetaSave>(meta);
  metaRef.current = meta;

  const savedRunInitial = useMemo(() => loadActiveForgeRun(), []);
  const [hasSavedRun, setHasSavedRun] = useState<boolean>(
    savedRunInitial !== null && savedRunInitial.phase !== 'victory' && savedRunInitial.phase !== 'defeat',
  );

  const [screenMode, setScreenMode] = useState<ScreenMode>(() =>
    autostart ? 'playing' : 'title',
  );
  const screenModeRef = useRef<ScreenMode>(screenMode);
  screenModeRef.current = screenMode;

  const [showHandbook, setShowHandbook] = useState<boolean>(false);
  const showHandbookRef = useRef<boolean>(false);
  showHandbookRef.current = showHandbook;

  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>(() =>
    !autostart && !meta.tutorialCompleted ? 1 : null,
  );
  const onboardingStepRef = useRef<OnboardingStep>(onboardingStep);
  onboardingStepRef.current = onboardingStep;

  const runRef = useRef<ForgeRunState>(
    autostart
      ? createNewForgeRun(meta.preferredDifficulty, Date.now() >>> 0, 0)
      : savedRunInitial ?? createNewForgeRun(meta.preferredDifficulty, Date.now() >>> 0, 0),
  );
  const [hud, setHud] = useState<LowFreqHud>(() => snapshotHud(runRef.current));
  const hudRef = useRef<LowFreqHud>(hud);
  hudRef.current = hud;

  // High-frequency DOM refs updated at 60Hz without React re-renders
  const comboElRef = useRef<HTMLSpanElement | null>(null);
  const multElRef = useRef<HTMLSpanElement | null>(null);
  const dmgElRef = useRef<HTMLSpanElement | null>(null);
  const mobileDmgElRef = useRef<HTMLSpanElement | null>(null);

  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<EmberForgeRenderer | null>(null);
  const audioRef = useRef<EmberForgeAudio | null>(null);
  const recordedOutcomeRef = useRef<string>('');
  const lastTouchAimRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const syncHudNow = useCallback(() => {
    const next = snapshotHud(runRef.current);
    if (!hudEqual(hudRef.current, next)) {
      hudRef.current = next;
      setHud(next);
    }
  }, []);

  const updateMeta = useCallback((updater: (prev: ForgeMetaSave) => ForgeMetaSave) => {
    const next = updater(metaRef.current);
    metaRef.current = next;
    saveForgeMeta(next);
    setMeta(next);
  }, []);

  const completeTutorial = useCallback(() => {
    setOnboardingStep(null);
    if (!metaRef.current.tutorialCompleted) {
      updateMeta((prev) => ({ ...prev, tutorialCompleted: true }));
    }
  }, [updateMeta]);

  // Mirror state machine to document.body.dataset.state
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (screenMode === 'title') {
      document.body.dataset.state = 'title';
    } else if (screenMode === 'paused') {
      document.body.dataset.state = 'paused';
    } else if (hud.phase === 'victory' || hud.phase === 'defeat') {
      document.body.dataset.state = 'gameover';
    } else {
      document.body.dataset.state = 'playing';
    }
  }, [screenMode, hud.phase]);

  const startFreshRun = useCallback(
    (difficulty: ForgeDifficulty = metaRef.current.preferredDifficulty, withTutorial?: boolean) => {
      const fresh = createNewForgeRun(difficulty, Date.now() >>> 0, 0);
      runRef.current = fresh;
      recordedOutcomeRef.current = '';
      saveActiveForgeRun(fresh);
      setHasSavedRun(true);
      setShowHandbook(false);
      setScreenMode('playing');
      if (withTutorial === true) {
        setOnboardingStep(1);
      } else if (withTutorial === false) {
        setOnboardingStep(null);
      } else {
        setOnboardingStep(!autostart && !metaRef.current.tutorialCompleted ? 1 : null);
      }
      syncHudNow();
      (document.activeElement as HTMLElement | null)?.blur?.();
    },
    [autostart, syncHudNow],
  );

  const resumeSavedRun = useCallback(() => {
    const loaded = loadActiveForgeRun();
    if (loaded) {
      runRef.current = loaded;
    }
    recordedOutcomeRef.current = '';
    setShowHandbook(false);
    setScreenMode('playing');
    syncHudNow();
    (document.activeElement as HTMLElement | null)?.blur?.();
  }, [syncHudNow]);

  const handleFireCurrentAim = useCallback(
    (explicitAngle?: number) => {
      const run = runRef.current;
      if (screenModeRef.current !== 'playing' || run.phase !== 'aiming') return;
      if (fireOrb(run, explicitAngle)) {
        audioRef.current?.playLaunch();
        if (onboardingStepRef.current === 1) {
          setOnboardingStep(2);
        }
        syncHudNow();
      }
    },
    [syncHudNow],
  );

  const handleTriggerBellows = useCallback(() => {
    const run = runRef.current;
    if (screenModeRef.current !== 'playing' || run.phase !== 'firing') return;
    const events = {
      pegHits: [],
      bellowsTriggered: [],
      bombsDetonated: [],
      crucibleCaught: false,
      volleyLaunched: false,
      enemyHit: [],
      playerDamaged: 0,
      stageCleared: false,
      victory: false,
      defeat: false,
    };
    if (triggerBellowsPulse(run, events)) {
      audioRef.current?.playBellowsPulse();
      rendererRef.current?.ingestEvents(events);
      if (onboardingStepRef.current === 2) {
        setOnboardingStep(3);
      }
      syncHudNow();
    }
  }, [syncHudNow]);

  const handleDemoShot = useCallback(() => {
    const run = runRef.current;
    if (run.phase !== 'aiming') return;
    const bestAngle = computeAutoAimAngle(run);
    run.aimAngle = bestAngle;
    handleFireCurrentAim(bestAngle);
  }, [handleFireCurrentAim]);

  const handleSelectReward = useCallback(
    (index: number) => {
      const run = runRef.current;
      if (selectForgeReward(run, index)) {
        audioRef.current?.playForgeAnvil();
        saveActiveForgeRun(run);
        updateMeta((prev) => ({
          ...prev,
          highestStageReached: Math.max(prev.highestStageReached, run.stageIndex + 1),
        }));
        if (onboardingStepRef.current === 4) {
          completeTutorial();
        }
        syncHudNow();
      }
    },
    [completeTutorial, syncHudNow, updateMeta],
  );

  const handleEnterEndless = useCallback(() => {
    const run = runRef.current;
    if (enterEndlessMode(run)) {
      audioRef.current?.playForgeAnvil();
      saveActiveForgeRun(run);
      syncHudNow();
    }
  }, [syncHudNow]);

  const handleToggleMute = useCallback(() => {
    updateMeta((prev) => {
      const nextMuted = !prev.muted;
      audioRef.current?.setMuted(nextMuted);
      return { ...prev, muted: nextMuted };
    });
  }, [updateMeta]);

  const handleSelectDifficulty = useCallback(
    (diff: ForgeDifficulty) => {
      updateMeta((prev) => ({ ...prev, preferredDifficulty: diff }));
      if (screenModeRef.current === 'title') {
        runRef.current = createNewForgeRun(diff, Date.now() >>> 0, 0);
        syncHudNow();
      }
    },
    [syncHudNow, updateMeta],
  );

  // Single-mount Canvas2D + RAF Loop + ResizeObserver + Audio Lifecycle
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = canvasWrapRef.current;
    if (!canvas || !wrap) return;

    const renderer = new EmberForgeRenderer(canvas);
    rendererRef.current = renderer;
    const audio = new EmberForgeAudio(metaRef.current.muted);
    audioRef.current = audio;

    const measure = () => {
      const rect = wrap.getBoundingClientRect();
      renderer.resize(rect.width, rect.height);
    };
    measure();

    const ro = new ResizeObserver(() => measure());
    ro.observe(wrap);

    const reducedMotionMedia =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;

    let rafId = 0;
    let lastTime = performance.now();

    const frame = (now: number) => {
      rafId = window.requestAnimationFrame(frame);
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(0.05, Math.max(0, rawDt));
      const reducedMotion = Boolean(reducedMotionMedia?.matches);

      const mode = screenModeRef.current;
      const run = runRef.current;

      if (mode === 'title') {
        run.elapsedTime += dt;
        renderer.stepParticles(dt, reducedMotion);
        renderer.render(run, { isTitleBackdrop: true, reducedMotion });
        return;
      }

      if (mode === 'playing' && !showHandbookRef.current) {
        const prevPhase = run.phase;
        const events = stepSimulation(run, dt);

        renderer.ingestEvents(events);
        renderer.stepParticles(dt, reducedMotion);

        // Trigger procedural audio from deterministic events
        if (events.pegHits.length > 0) {
          const lastHit = events.pegHits[events.pegHits.length - 1];
          audio.playPegHit(lastHit.kind, lastHit.combo);
          if (
            onboardingStepRef.current === 3 &&
            (lastHit.kind === 'crit' || lastHit.kind === 'mult')
          ) {
            setOnboardingStep(4);
          }
        }
        if (events.bombsDetonated.length > 0) {
          audio.playBomb();
        }
        if (events.enemyHit.length > 0) {
          const anyCrit = events.enemyHit.some((e) => e.isCrit);
          audio.playVolleyHit(anyCrit);
        }
        if (events.playerDamaged > 0) {
          audio.playPlayerHurt();
        }
        if (events.victory) {
          audio.playVictory();
        }

        // Persist run & meta milestones on phase transitions
        if (prevPhase !== run.phase) {
          if (run.phase === 'aiming' || run.phase === 'forge_reward') {
            saveActiveForgeRun(run);
            setHasSavedRun(true);
            if (run.phase === 'forge_reward' && onboardingStepRef.current !== null) {
              setOnboardingStep(4);
            }
          } else if (run.phase === 'victory' || run.phase === 'defeat') {
            const key = `${run.seed}:${run.stageIndex}:${run.totalShots}:${run.phase}`;
            if (recordedOutcomeRef.current !== key) {
              recordedOutcomeRef.current = key;
              saveActiveForgeRun(run.phase === 'victory' ? run : null);
              setHasSavedRun(run.phase === 'victory');
              updateMeta((prev) =>
                recordRunOutcome(
                  prev,
                  run.phase === 'victory' ? 'victory' : 'defeat',
                  run.score,
                  run.bestCombo,
                  run.stageIndex + 1,
                ),
              );
            }
          }
        }

        // Direct 60Hz DOM telemetry updates (only touch DOM when value changes!)
        const expectedDmg = computeExpectedShotDamage(run);
        const comboStr = String(run.shotTally.hits);
        if (comboElRef.current && comboElRef.current.textContent !== comboStr) {
          comboElRef.current.textContent = comboStr;
        }
        const multStr = run.shotTally.critTriggered
          ? `×${(run.shotTally.multiplier * 2).toFixed(1)}`
          : `×${run.shotTally.multiplier.toFixed(1)}`;
        if (multElRef.current && multElRef.current.textContent !== multStr) {
          multElRef.current.textContent = multStr;
        }
        const dmgStr = String(expectedDmg);
        if (dmgElRef.current && dmgElRef.current.textContent !== dmgStr) {
          dmgElRef.current.textContent = dmgStr;
        }
        const mobileStr =
          run.shotTally.hits > 0
            ? `${run.shotTally.hits}连 · ${expectedDmg}伤`
            : '瞄准出球';
        if (mobileDmgElRef.current && mobileDmgElRef.current.textContent !== mobileStr) {
          mobileDmgElRef.current.textContent = mobileStr;
        }

        syncHudNow();
      }

      renderer.render(run, {
        isTitleBackdrop: false,
        highlightCritGuide: onboardingStepRef.current === 3,
        reducedMotion,
      });
    };

    rafId = window.requestAnimationFrame(frame);

    return () => {
      window.cancelAnimationFrame(rafId);
      ro.disconnect();
      audio.dispose();
      audioRef.current = null;
      rendererRef.current = null;
      if (typeof document !== 'undefined') {
        delete document.body.dataset.state;
      }
    };
  }, [syncHudNow, updateMeta]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showHandbookRef.current) return;
      const mode = screenModeRef.current;

      if (mode === 'title') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          startFreshRun(metaRef.current.preferredDifficulty);
        }
        return;
      }

      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        if (mode === 'playing') setScreenMode('paused');
        else if (mode === 'paused') setScreenMode('playing');
        return;
      }

      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        handleToggleMute();
        return;
      }

      if (mode !== 'playing') return;

      const run = runRef.current;
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        if (run.phase === 'aiming') {
          handleFireCurrentAim();
        } else if (run.phase === 'firing') {
          handleTriggerBellows();
        }
        return;
      }

      if (run.phase === 'aiming') {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
          e.preventDefault();
          run.aimAngle = Math.min(0.86 * Math.PI, run.aimAngle + 0.055);
        } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          run.aimAngle = Math.max(0.14 * Math.PI, run.aimAngle - 0.055);
        } else if (e.key === 'q' || e.key === 'Q') {
          selectOrbIndex(run, run.activeOrbIndex - 1);
          syncHudNow();
        } else if (e.key === 'e' || e.key === 'E') {
          selectOrbIndex(run, run.activeOrbIndex + 1);
          syncHudNow();
        } else if (e.key >= '1' && e.key <= '6') {
          const idx = parseInt(e.key, 10) - 1;
          if (idx < run.deck.length) {
            selectOrbIndex(run, idx);
            syncHudNow();
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleFireCurrentAim,
    handleToggleMute,
    handleTriggerBellows,
    startFreshRun,
    syncHudNow,
  ]);

  // Pointer handlers on canvas (mouse instant aim/click + touch safe drag-preview)
  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const renderer = rendererRef.current;
    const run = runRef.current;
    if (!renderer || screenModeRef.current !== 'playing' || run.phase !== 'aiming') {
      return;
    }
    const world = renderer.screenToWorld(e.clientX, e.clientY);
    if (world.y >= 145) {
      setAimTowardPoint(run, world.x, world.y);
    }
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const renderer = rendererRef.current;
    const run = runRef.current;
    if (!renderer || screenModeRef.current !== 'playing') return;

    // Right click triggers Bellows Pulse in mid-flight
    if (e.button === 2) {
      e.preventDefault();
      handleTriggerBellows();
      return;
    }

    const world = renderer.screenToWorld(e.clientX, e.clientY);

    // Check enemy click for target locking
    for (const enemy of run.enemies) {
      if (enemy.dead) continue;
      if (Math.hypot(world.x - enemy.x, world.y - enemy.y) <= enemy.radius + 14) {
        selectEnemyTarget(run, enemy.uid);
        return;
      }
    }

    if (run.phase === 'firing') {
      handleTriggerBellows();
      return;
    }

    if (run.phase !== 'aiming') return;

    if (e.pointerType === 'mouse') {
      if (world.y >= 145) {
        setAimTowardPoint(run, world.x, world.y);
        handleFireCurrentAim();
      }
    } else {
      // Touch: first tap / drag adjusts aim safely; second tap near same spot or bottom button fires
      const now = Date.now();
      const prev = lastTouchAimRef.current;
      if (world.y >= 145) {
        setAimTowardPoint(run, world.x, world.y);
        if (
          prev &&
          now - prev.time < 1200 &&
          Math.hypot(world.x - prev.x, world.y - prev.y) < 34
        ) {
          lastTouchAimRef.current = null;
          handleFireCurrentAim();
        } else {
          lastTouchAimRef.current = { x: world.x, y: world.y, time: now };
        }
      }
    }
  };

  const stageDef = getStageDef(hud.stageIndex);
  const activeOrb = getActiveOrb(runRef.current);
  const activeOrbDef = ORB_DEFS[activeOrb.typeId];
  const hpPct = Math.max(0, Math.min(100, Math.round((hud.hp / Math.max(1, hud.maxHp)) * 100)));

  return (
    <div
      className="relative w-full h-full bg-[#100D0C] text-[#FAF5EE] flex flex-col overflow-hidden select-none"
      data-testid="ember-forge-root"
    >
      {/* MAIN RESPONSIVE FOUNDRY STAGE */}
      <div
        className={`flex-1 min-h-0 w-full flex flex-col overflow-hidden ${
          screenMode === 'title'
            ? ''
            : 'lg:grid lg:grid-cols-[268px_minmax(0,1fr)_272px]'
        }`}
      >
        {/* MOBILE TOP COMPACT HUD BAR (< lg) */}
        {screenMode !== 'title' && (
          <div className="lg:hidden shrink-0 px-3 py-2 bg-[#161110] border-b border-[#342923] flex items-center justify-between gap-2 z-20">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex items-center gap-1 text-xs font-bold text-[#FAF5EE] tabular-nums shrink-0">
                <Flame className="w-3.5 h-3.5 text-[#E85D26]" aria-hidden="true" />
                <span>
                  {hud.hp}/{hud.maxHp}
                </span>
                {hud.shield > 0 && (
                  <span className="ml-1 inline-flex items-center gap-0.5 text-[#60A5FA]">
                    <Shield className="w-3 h-3" aria-hidden="true" />
                    {hud.shield}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-[#C7B8AC] truncate">
                {stageDef.name}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span
                ref={mobileDmgElRef}
                className="text-xs font-mono font-bold text-[#F59E0B] tabular-nums mr-1"
              >
                瞄准出球
              </span>
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  handleToggleMute();
                }}
                aria-label={meta.muted ? '开启音效' : '静音'}
                className="w-8 h-8 flex items-center justify-center rounded-md bg-[#231B18] border border-[#3E312B] text-[#E6DAD0] cursor-pointer"
              >
                {meta.muted ? (
                  <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  setShowHandbook(true);
                }}
                aria-label="打开锻造手册"
                className="w-8 h-8 flex items-center justify-center rounded-md bg-[#231B18] border border-[#3E312B] text-[#E6DAD0] cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  setScreenMode((m) => (m === 'paused' ? 'playing' : 'paused'));
                }}
                aria-label="暂停游戏"
                className="w-8 h-8 flex items-center justify-center rounded-md bg-[#231B18] border border-[#3E312B] text-[#E6DAD0] cursor-pointer"
              >
                <Pause className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* DESKTOP LEFT FOUNDRY RAIL (lg+, hidden on title screen) */}
        {screenMode !== 'title' && (
        <aside className="hidden lg:flex flex-col justify-between p-4 bg-[#151110] border-r border-[#2E241F] overflow-y-auto">
          <div className="space-y-4">
            {/* Stage & Act */}
            <div>
              <div className="text-[11px] font-medium text-[#D6B594]">
                {hud.isEndless
                  ? `无尽熔炉 · 第 ${hud.stageIndex + 1} 阵`
                  : `${ACT_NAMES[stageDef.act]} · 第 ${hud.stageIndex + 1}/${CAMPAIGN_STAGE_COUNT} 阵`}
              </div>
              <h1 className="mt-0.5 text-lg font-bold text-[#FAF5EE] tracking-tight">
                {stageDef.name}
              </h1>
              <div className="mt-1 flex items-center justify-between text-xs text-[#C7B8AC] tabular-nums">
                <span>难度 · {DIFFICULTY_DEFS[hud.difficulty].name}</span>
                <span>总分 {hud.score}</span>
              </div>
            </div>

            {/* Furnace Vitality Bar */}
            <div className="p-3.5 rounded-lg bg-[#1E1715] border border-[#362A24]">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#E6DAD0] inline-flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-[#E85D26]" aria-hidden="true" />
                  炉心耐久
                </span>
                <span className="font-mono font-bold text-[#FAF5EE] tabular-nums">
                  {hud.hp} / {hud.maxHp}
                </span>
              </div>
              <div className="mt-2 h-2.5 w-full rounded-sm bg-[#2C231F] overflow-hidden">
                <div
                  className="h-full bg-[#E85D26] transition-[width] duration-200"
                  style={{ width: `${hpPct}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-[#93C5FD] tabular-nums">
                <span className="inline-flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5" aria-hidden="true" />
                  炉壁护盾
                </span>
                <span className="font-mono font-bold">{hud.shield}</span>
              </div>
            </div>

            {/* Live 60Hz Shot Output Meter */}
            <div className="p-3.5 rounded-lg bg-[#1E1715] border border-[#362A24]">
              <div className="text-[11px] font-semibold text-[#D6B594]">
                本发齐射火候
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded bg-[#14100E] border border-[#2D231E]">
                  <div className="text-[10px] text-[#A89B90]">连击</div>
                  <span
                    ref={comboElRef}
                    className="block mt-0.5 text-lg font-mono font-bold text-[#FAF5EE] tabular-nums"
                  >
                    0
                  </span>
                </div>
                <div className="p-2 rounded bg-[#14100E] border border-[#2D231E]">
                  <div className="text-[10px] text-[#A89B90]">倍率</div>
                  <span
                    ref={multElRef}
                    className="block mt-0.5 text-lg font-mono font-bold text-[#FB923C] tabular-nums"
                  >
                    ×1.0
                  </span>
                </div>
                <div className="p-2 rounded bg-[#14100E] border border-[#2D231E]">
                  <div className="text-[10px] text-[#A89B90]">预计伤害</div>
                  <span
                    ref={dmgElRef}
                    className="block mt-0.5 text-lg font-mono font-bold text-[#FDE047] tabular-nums"
                  >
                    0
                  </span>
                </div>
              </div>
            </div>

            {/* Relics Owned */}
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-[#D6B594] mb-2">
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#F59E0B]" aria-hidden="true" />
                  已铭刻炉火圣物
                </span>
                <span className="font-mono text-[#A89B90] tabular-nums">
                  {hud.relics.length}
                </span>
              </div>
              {hud.relics.length === 0 ? (
                <div className="p-3 rounded-lg bg-[#1B1513] border border-[#2D231E] text-xs text-[#9C8E82]">
                  肃清炉阵后，可在铁砧挑选改写规则的圣物。
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {hud.relics.map((rid) => {
                    const r = RELIC_DEFS[rid];
                    return (
                      <li
                        key={rid}
                        className="p-2.5 rounded-lg bg-[#1E1715] border border-[#382C25]"
                      >
                        <div className="text-xs font-semibold text-[#FDE68A]">
                          {r.name}
                          <span className="ml-1.5 font-normal text-[11px] text-[#B8A99D]">
                            · {r.tag}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#C7B8AC] mt-0.5 leading-snug">
                          {r.description}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Mini Peg Key */}
          <div className="pt-3 border-t border-[#2E241F]">
            <div className="grid grid-cols-2 gap-1.5">
              {QUICK_LEGEND_PEGS.map((k) => (
                <div
                  key={k}
                  className="flex items-center gap-1.5 text-[11px] text-[#C7B8AC]"
                >
                  <PegGlyphSvg kind={k} size={14} />
                  <span className="truncate">{PEG_META[k].short}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
        )}

        {/* CENTER LIVE PHYSICS CANVAS VIEWPORT */}
        <main className="relative flex-1 min-h-0 flex flex-col overflow-hidden bg-[#100D0C]">
          {/* Non-blocking Step-by-Step Onboarding Coach Bar */}
          {screenMode === 'playing' &&
            onboardingStep !== null &&
            hud.phase !== 'victory' &&
            hud.phase !== 'defeat' && (
              <div
                data-testid="onboarding-bar"
                className="shrink-0 mx-2.5 mt-2 px-3.5 py-2 rounded-lg bg-[#231A15] border border-[#B45309] flex flex-wrap items-center justify-between gap-2 z-20"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-[#FDE047]">
                    {ONBOARDING_COPY[onboardingStep].title}
                  </div>
                  <div className="text-[11px] text-[#E6DAD0] leading-snug mt-0.5">
                    {ONBOARDING_COPY[onboardingStep].detail}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {onboardingStep === 1 && hud.phase === 'aiming' && (
                    <button
                      type="button"
                      onClick={handleDemoShot}
                      className="px-2.5 py-1 rounded bg-[#E85D26] hover:bg-[#C2410C] text-[11px] font-semibold text-white cursor-pointer whitespace-nowrap"
                    >
                      一键示范
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={completeTutorial}
                    className="px-2 py-1 rounded bg-[#2F241F] hover:bg-[#3F312B] border border-[#524036] text-[11px] text-[#D6C7B9] cursor-pointer whitespace-nowrap"
                  >
                    跳过
                  </button>
                </div>
              </div>
            )}

          {/* Physics Foundry Canvas Container */}
          <div
            ref={canvasWrapRef}
            className="flex-1 min-h-0 w-full relative overflow-hidden"
          >
            <canvas
              ref={canvasRef}
              data-testid="ember-forge-canvas"
              onPointerMove={handleCanvasPointerMove}
              onPointerDown={handleCanvasPointerDown}
              onContextMenu={(e) => e.preventDefault()}
              className="absolute inset-0 block w-full h-full touch-none cursor-crosshair"
            />
          </div>
        </main>

        {/* DESKTOP RIGHT ARSENAL & BELLOWS RAIL (lg+, hidden on title screen) */}
        {screenMode !== 'title' && (
        <aside className="hidden lg:flex flex-col justify-between p-4 bg-[#151110] border-l border-[#2E241F] overflow-y-auto">
          <div className="space-y-4">
            {/* Compact Utility Controls */}
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  handleToggleMute();
                }}
                aria-label={meta.muted ? '开启音效' : '静音'}
                title="音效开关 [M]"
                className="w-8 h-8 flex items-center justify-center rounded-md bg-[#221B18] hover:bg-[#302621] border border-[#3E312B] focus:outline-none focus-visible:border-[#F59E0B] text-[#E6DAD0] cursor-pointer"
              >
                {meta.muted ? (
                  <VolumeX className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Volume2 className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  setShowHandbook(true);
                }}
                aria-label="打开锻造手册"
                title="锻造手册"
                className="w-8 h-8 flex items-center justify-center rounded-md bg-[#221B18] hover:bg-[#302621] border border-[#3E312B] focus:outline-none focus-visible:border-[#F59E0B] text-[#E6DAD0] cursor-pointer"
              >
                <BookOpen className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  setScreenMode((m) => (m === 'paused' ? 'playing' : 'paused'));
                }}
                aria-label="暂停游戏"
                title="暂停 [P / Esc]"
                className="w-8 h-8 flex items-center justify-center rounded-md bg-[#221B18] hover:bg-[#302621] border border-[#3E312B] focus:outline-none focus-visible:border-[#F59E0B] text-[#E6DAD0] cursor-pointer"
              >
                <Pause className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {/* Active Bellows Pulse Control */}
            <div className="p-3.5 rounded-lg bg-[#1E1715] border border-[#362A24]">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-bold text-[#2DD4BF] inline-flex items-center gap-1.5">
                  <Wind className="w-3.5 h-3.5" aria-hidden="true" />
                  鼓风磁冲
                </span>
                <span className="font-mono text-[#FAF5EE] tabular-nums">
                  {hud.bellowsCharges} / {hud.maxBellowsCharges}
                </span>
              </div>

              <div className="flex items-center gap-1.5 mb-3">
                {Array.from({ length: hud.maxBellowsCharges }, (_, i) => {
                  const full = i < hud.bellowsCharges;
                  return (
                    <div
                      key={i}
                      className={`h-2 flex-1 rounded-sm border ${
                        full
                          ? 'bg-[#14B8A6] border-[#5EEAD4]'
                          : 'bg-[#14100E] border-[#382C25]'
                      }`}
                    />
                  );
                })}
              </div>

              <button
                type="button"
                data-testid="bellows-pulse-btn"
                disabled={
                  hud.phase !== 'firing' || hud.bellowsCharges <= 0
                }
                onClick={handleTriggerBellows}
                className={`w-full py-2.5 px-3 rounded-md text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                  hud.phase === 'firing' && hud.bellowsCharges > 0
                    ? 'bg-[#0F766E] hover:bg-[#14B8A6] text-white border border-[#5EEAD4]'
                    : 'bg-[#261E1B] text-[#A89B90] border border-[#3C302A]'
                }`}
              >
                <Zap className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {hud.phase === 'firing'
                    ? '引爆鼓风气浪 [Space]'
                    : '铁球飞行中可用 [Space]'}
                </span>
              </button>
              <p className="mt-2 text-[11px] text-[#B8A99D] leading-snug">
                半空托举铁球重返高倍金铃区，并震响周边 84px 内全部符钉。
              </p>
            </div>

            {/* Orb Arsenal Switcher */}
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-[#D6B594] mb-2">
                <span>弹囊切换 [1-{hud.deck.length}]</span>
                <span className="text-[11px] text-[#A89B90]">Q / E</span>
              </div>
              <div className="space-y-1.5">
                {hud.deck.map((orb, idx) => {
                  const def = ORB_DEFS[orb.typeId];
                  const selected = idx === hud.activeOrbIndex;
                  return (
                    <button
                      key={orb.uid}
                      type="button"
                      disabled={hud.phase !== 'aiming'}
                      onClick={() => {
                        selectOrbIndex(runRef.current, idx);
                        syncHudNow();
                      }}
                      className={`w-full text-left p-2.5 rounded-lg border transition-colors flex items-start gap-2.5 cursor-pointer disabled:cursor-default ${
                        selected
                          ? 'bg-[#2A201B] border-[#F59E0B]'
                          : 'bg-[#1A1412] border-[#302520] hover:border-[#5C493E]'
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        <OrbGlyphSvg orbId={orb.typeId} size={24} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-[#FAF5EE] truncate">
                            {def.name}
                            {orb.level > 1 ? ` Lv.${orb.level}` : ''}
                          </span>
                          <span className="text-[10px] font-mono text-[#D6B594] shrink-0">
                            [{idx + 1}]
                          </span>
                        </div>
                        <div className="text-[11px] text-[#C7B8AC] mt-0.5 line-clamp-2 leading-snug">
                          {def.tag} · {def.description}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-[#2E241F] text-[11px] text-[#9C8E82]">
            左键瞄准发射 · 空格/右键鼓风 · 点击上方敌军切换锁定
          </div>
        </aside>
        )}

        {/* MOBILE BOTTOM THUMB DOCK (< lg) */}
        {screenMode !== 'title' && (
          <div className="lg:hidden shrink-0 px-3 py-2.5 bg-[#161110] border-t border-[#342923] space-y-2 z-20">
            {/* Compact Orb Selector Row */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {hud.deck.map((orb, idx) => {
                const def = ORB_DEFS[orb.typeId];
                const selected = idx === hud.activeOrbIndex;
                return (
                  <button
                    key={orb.uid}
                    type="button"
                    disabled={hud.phase !== 'aiming'}
                    onClick={() => {
                      selectOrbIndex(runRef.current, idx);
                      syncHudNow();
                    }}
                    className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-semibold transition-colors cursor-pointer ${
                      selected
                        ? 'bg-[#2C211C] border-[#F59E0B] text-[#FAF5EE]'
                        : 'bg-[#1D1614] border-[#362A24] text-[#C7B8AC]'
                    }`}
                  >
                    <OrbGlyphSvg orbId={orb.typeId} size={16} />
                    <span>{def.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Primary Thumb Action Button: Aim-Confirm Launch OR Mid-Flight Bellows Pulse */}
            <div className="flex items-center gap-2">
              {hud.phase === 'firing' ? (
                <button
                  type="button"
                  data-testid="mobile-bellows-btn"
                  disabled={hud.bellowsCharges <= 0}
                  onClick={handleTriggerBellows}
                  className="flex-1 h-11 rounded-lg bg-[#0F766E] active:bg-[#14B8A6] disabled:opacity-45 border border-[#5EEAD4] text-sm font-bold text-white inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Wind className="w-4 h-4" aria-hidden="true" />
                  <span>鼓风磁冲（剩余 {hud.bellowsCharges} 次）</span>
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="mobile-fire-btn"
                  disabled={hud.phase !== 'aiming'}
                  onClick={() => handleFireCurrentAim()}
                  className="flex-1 h-11 rounded-lg bg-[#E85D26] active:bg-[#C2410C] disabled:opacity-45 border border-[#FB923C] text-sm font-bold text-white inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Flame className="w-4 h-4" aria-hidden="true" />
                  <span>
                    {hud.phase === 'aiming'
                      ? `发射 · ${activeOrbDef.name}`
                      : '火候结算中…'}
                  </span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* TITLE OVERLAY (Interactive Foundry Stage Backdrop) */}
      {screenMode === 'title' && (
        <div
          data-testid="title-screen"
          className="absolute inset-0 z-30 flex flex-col items-center justify-between p-5 sm:p-6 bg-gradient-to-b from-[#100D0C]/88 via-[#100D0C]/72 to-[#100D0C]/90"
        >
          <div className="w-full flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleToggleMute}
              aria-label={meta.muted ? '开启音效' : '静音'}
              className="w-9 h-9 flex items-center justify-center rounded-md bg-[#1D1614] hover:bg-[#2B221E] border border-[#46372E] focus:outline-none focus-visible:border-[#F59E0B] text-[#E6DAD0] cursor-pointer"
            >
              {meta.muted ? (
                <VolumeX className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Volume2 className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowHandbook(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#1D1614] hover:bg-[#2B221E] border border-[#46372E] focus:outline-none focus-visible:border-[#F59E0B] text-xs font-medium text-[#FAF5EE] cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
              <span>锻造手册</span>
            </button>
          </div>

          <div className="w-full max-w-md flex flex-col items-center text-center my-auto">
            <EmberForgeTitleEmblem className="w-full max-w-[350px] h-auto" />

            {/* 3-Tier Difficulty Selector */}
            <div
              role="group"
              aria-label="选择炉火难度"
              className="mt-6 w-full grid grid-cols-3 gap-2"
            >
              {DIFFICULTY_ORDER.map((diffId) => {
                const d = DIFFICULTY_DEFS[diffId];
                const active = meta.preferredDifficulty === diffId;
                return (
                  <button
                    key={diffId}
                    type="button"
                    aria-pressed={active}
                    onClick={() => handleSelectDifficulty(diffId)}
                    className={`py-2.5 px-2 rounded-lg border text-center transition-colors cursor-pointer focus:outline-none focus-visible:border-[#F59E0B] ${
                      active
                        ? 'bg-[#2C2019] border-[#F59E0B] text-[#FAF5EE]'
                        : 'bg-[#191412] border-[#382C25] text-[#C7B8AC] hover:border-[#5C493E]'
                    }`}
                  >
                    <div className="text-sm font-bold">{d.name}</div>
                    <div className="text-[11px] text-[#D6B594] mt-0.5 tabular-nums">
                      炉心 {d.startHp}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-[#C7B8AC]">
              {DIFFICULTY_DEFS[meta.preferredDifficulty].tagline}
            </p>

            {/* Primary & Secondary CTAs */}
            <div className="mt-6 w-full flex flex-col sm:flex-row items-center gap-2.5">
              <button
                type="button"
                data-start="true"
                onClick={() => startFreshRun(meta.preferredDifficulty)}
                className="w-full sm:flex-1 h-12 px-5 rounded-lg bg-[#E85D26] hover:bg-[#C2410C] focus:outline-none focus-visible:border-[#FDE047] border border-[#FB923C] text-sm font-bold text-white inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" aria-hidden="true" />
                <span>开炉锻打</span>
              </button>

              {hasSavedRun && (
                <button
                  type="button"
                  onClick={resumeSavedRun}
                  className="w-full sm:w-auto h-12 px-5 rounded-lg bg-[#231B18] hover:bg-[#312621] border border-[#5C493E] focus:outline-none focus-visible:border-[#F59E0B] text-sm font-semibold text-[#FAF5EE] inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <span>继续上次炉阵</span>
                </button>
              )}
            </div>

            {meta.bestScore > 0 && (
              <div className="mt-4 text-xs text-[#B8A99D] tabular-nums">
                最高纪录 {meta.bestScore} 分 · 最高 {meta.bestCombo} 连击 · 通关 {meta.victories} 次
              </div>
            )}
          </div>

          <div className="text-xs text-[#9C8E82] text-center">
            鼠标瞄准发射 · 空格/右键半空鼓风磁冲 · 1-6 切换弹丸 · P 暂停
          </div>
        </div>
      )}

      {/* FORGE REWARD MODAL BETWEEN STAGES */}
      {screenMode === 'playing' && hud.phase === 'forge_reward' && (
        <ForgeRewardModal
          stageClearedNum={hud.stageIndex + 1}
          options={hud.pendingRewards}
          onSelect={handleSelectReward}
        />
      )}

      {/* PAUSE MODAL */}
      {screenMode === 'paused' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ef-pause-title"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4"
        >
          <div className="w-full max-w-sm rounded-xl bg-[#1A1412] border border-[#524036] p-6 text-center">
            <h2 id="ef-pause-title" className="text-lg font-bold text-[#FAF5EE]">
              炉火暂歇
            </h2>
            <p className="mt-1 text-xs text-[#C7B8AC] tabular-nums">
              {stageDef.name} · 总分 {hud.score} · 炉心 {hud.hp}/{hud.maxHp}
            </p>
            <div className="mt-5 space-y-2.5">
              <button
                type="button"
                onClick={() => setScreenMode('playing')}
                className="w-full h-10 rounded-lg bg-[#E85D26] hover:bg-[#C2410C] text-sm font-bold text-white cursor-pointer"
              >
                继续锻打
              </button>
              <button
                type="button"
                onClick={() => startFreshRun(hud.difficulty, false)}
                className="w-full h-10 rounded-lg bg-[#261E1B] hover:bg-[#352A25] border border-[#4D3D34] text-sm font-semibold text-[#FAF5EE] inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>重开本局</span>
              </button>
              <button
                type="button"
                onClick={() => setScreenMode('title')}
                className="w-full h-10 rounded-lg bg-transparent hover:bg-[#241C19] border border-[#3A2E28] text-sm font-medium text-[#C7B8AC] cursor-pointer"
              >
                返回标题页
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VICTORY / DEFEAT MODAL */}
      {screenMode === 'playing' &&
        (hud.phase === 'victory' || hud.phase === 'defeat') &&
        hud.summary && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ef-outcome-title"
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4"
          >
            <div className="w-full max-w-md rounded-xl bg-[#1A1412] border border-[#5C483C] p-6 text-center">
              <div
                className={`text-xs font-bold ${
                  hud.summary.outcome === 'victory'
                    ? 'text-[#FDE047]'
                    : 'text-[#F87171]'
                }`}
              >
                {hud.summary.outcome === 'victory'
                  ? '玄铁饕餮伏诛 · 熔金贯穹'
                  : '炉火熄灭 · 锻造中断'}
              </div>
              <h2
                id="ef-outcome-title"
                className="mt-1 text-2xl font-bold text-[#FAF5EE]"
              >
                {hud.summary.outcome === 'victory' ? '三幕大捷' : '再炼一炉'}
              </h2>

              <div className="mt-5 grid grid-cols-3 gap-2.5 text-center">
                <div className="p-3 rounded-lg bg-[#231B18] border border-[#382C25]">
                  <div className="text-[11px] text-[#B8A99D]">总分</div>
                  <div className="mt-1 text-lg font-mono font-bold text-[#FDE047] tabular-nums">
                    {hud.summary.score}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-[#231B18] border border-[#382C25]">
                  <div className="text-[11px] text-[#B8A99D]">最高连击</div>
                  <div className="mt-1 text-lg font-mono font-bold text-[#FB923C] tabular-nums">
                    {hud.summary.bestCombo}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-[#231B18] border border-[#382C25]">
                  <div className="text-[11px] text-[#B8A99D]">抵达阵数</div>
                  <div className="mt-1 text-lg font-mono font-bold text-[#FAF5EE] tabular-nums">
                    {hud.summary.stageReached}/{hud.summary.totalStages}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-2.5">
                {hud.summary.outcome === 'victory' && !hud.summary.isEndless && (
                  <button
                    type="button"
                    onClick={handleEnterEndless}
                    className="w-full h-11 rounded-lg bg-[#0F766E] hover:bg-[#14B8A6] border border-[#5EEAD4] text-sm font-bold text-white cursor-pointer"
                  >
                    乘胜进入无尽熔炉
                  </button>
                )}
                <button
                  type="button"
                  data-start="true"
                  onClick={() => startFreshRun(hud.difficulty, false)}
                  className="w-full h-11 rounded-lg bg-[#E85D26] hover:bg-[#C2410C] text-sm font-bold text-white cursor-pointer"
                >
                  再来一局
                </button>
                <button
                  type="button"
                  onClick={() => setScreenMode('title')}
                  className="w-full h-10 rounded-lg bg-[#241C19] hover:bg-[#322722] border border-[#42342D] text-xs font-medium text-[#D6C7B9] cursor-pointer"
                >
                  返回标题页
                </button>
              </div>
            </div>
          </div>
        )}

      {/* FORGE HANDBOOK MODAL */}
      <HandbookModal
        open={showHandbook}
        onClose={() => setShowHandbook(false)}
        onReplayTutorial={() => startFreshRun(meta.preferredDifficulty, true)}
      />
    </div>
  );
}
