import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BookOpen,
  HelpCircle,
  Lock,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { GuideModal } from './GuideModal.tsx';
import { InkBladeAudioEngine } from './audio.ts';
import {
  BOONS_BY_ID,
  DIFFICULTY_DEFS,
  DIFFICULTY_ORDER,
  STAGES,
} from './content.ts';
import {
  createNewRun,
  enterEndlessAfterVictory,
  getActiveStageDef,
  getComboWindowSec,
  selectBoonAndAdvance,
  stepSimulation,
} from './engine.ts';
import {
  BoonSealSvg,
  InkBladeTitleEmblemSvg,
  VitalitySealPipSvg,
} from './icons.tsx';
import { InkBladeCanvasRenderer } from './renderer.ts';
import {
  loadInkBladeMeta,
  recordInkBladeOutcome,
  saveInkBladeMeta,
} from './storage.ts';
import type {
  BoonId,
  GameScreenState,
  InkBladeDifficulty,
  InkBladeRunState,
  InkBladeSaveMeta,
  RunPhase,
  RunSummarySnapshot,
} from './types.ts';

type InkOnboardingStep = 1 | 2 | 3 | null;

function hasAutostartParam(): boolean {
  if (typeof window === 'undefined') return false;
  const search = new URLSearchParams(window.location.search);
  if (search.get('autostart') === '1') return true;
  const hashIdx = window.location.hash.indexOf('?');
  if (hashIdx >= 0) {
    const hashParams = new URLSearchParams(window.location.hash.slice(hashIdx));
    if (hashParams.get('autostart') === '1') return true;
  }
  return false;
}

function detectTouchOrCompactViewport(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.innerWidth < 900) return true;
  if (typeof window.matchMedia === 'function') {
    if (window.matchMedia('(pointer: coarse)').matches) return true;
  }
  return navigator.maxTouchPoints > 0 && window.innerWidth < 1100;
}

function formatClearTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${rem.toString().padStart(2, '0')}`;
}

interface LowFreqHudState {
  phase: RunPhase;
  difficulty: InkBladeDifficulty;
  stageIndex: number;
  waveIndex: number;
  totalWaves: number;
  enemiesRemaining: number;
  hp: number;
  maxHp: number;
  lastHurtActive: boolean;
  score: number;
  combo: number;
  deflects: number;
  isEndless: boolean;
  endlessLoop: number;
  slashReady: boolean;
  parryReady: boolean;
  boons: BoonId[];
  pendingBoonChoices: BoonId[];
  bossHp: number;
  bossMaxHp: number;
  bossPhase: 1 | 2;
  summary: RunSummarySnapshot | null;
}

function extractHudState(run: InkBladeRunState): LowFreqHudState {
  const stage = getActiveStageDef(run);
  const livingEnemies = run.enemies.filter((e) => e.aiPhase !== 'dying');
  const boss = livingEnemies.find((e) => e.archetype === 'shogun_boss');
  return {
    phase: run.phase,
    difficulty: run.difficulty,
    stageIndex: run.stageIndex,
    waveIndex: run.waveIndex,
    totalWaves: stage.waves.length,
    enemiesRemaining: livingEnemies.length,
    hp: run.player.hp,
    maxHp: run.player.maxHp,
    lastHurtActive: run.player.hitFlashTimer > 0,
    score: run.score,
    combo: run.combo,
    deflects: run.deflects,
    isEndless: run.isEndless,
    endlessLoop: run.endlessLoop,
    slashReady: run.player.slashCooldown <= 0,
    parryReady: run.player.parryCooldown <= 0,
    boons: [...run.boons],
    pendingBoonChoices: [...run.pendingBoonChoices],
    bossHp: boss ? boss.hp : 0,
    bossMaxHp: boss ? boss.maxHp : 0,
    bossPhase: boss ? boss.bossPhase : 1,
    summary: run.summarySnapshot ? { ...run.summarySnapshot } : null,
  };
}

function hudStatesEqual(a: LowFreqHudState, b: LowFreqHudState): boolean {
  return (
    a.phase === b.phase &&
    a.difficulty === b.difficulty &&
    a.stageIndex === b.stageIndex &&
    a.waveIndex === b.waveIndex &&
    a.enemiesRemaining === b.enemiesRemaining &&
    a.hp === b.hp &&
    a.maxHp === b.maxHp &&
    a.lastHurtActive === b.lastHurtActive &&
    a.score === b.score &&
    a.combo === b.combo &&
    a.deflects === b.deflects &&
    a.isEndless === b.isEndless &&
    a.endlessLoop === b.endlessLoop &&
    a.slashReady === b.slashReady &&
    a.parryReady === b.parryReady &&
    a.bossHp === b.bossHp &&
    a.bossPhase === b.bossPhase &&
    a.boons.length === b.boons.length &&
    a.pendingBoonChoices.length === b.pendingBoonChoices.length &&
    a.summary?.outcome === b.summary?.outcome
  );
}

export default function InkBladeApp() {
  const initialAutostart = useMemo(() => hasAutostartParam(), []);
  const [meta, setMeta] = useState<InkBladeSaveMeta>(() => loadInkBladeMeta());
  const metaRef = useRef<InkBladeSaveMeta>(meta);
  metaRef.current = meta;

  const [selectedStartStage, setSelectedStartStage] = useState<number>(0);
  const [screenState, setScreenState] = useState<GameScreenState>(() =>
    initialAutostart ? 'playing' : 'title',
  );
  const screenStateRef = useRef<GameScreenState>(screenState);
  screenStateRef.current = screenState;

  const [showGuide, setShowGuide] = useState<boolean>(false);
  const showGuideRef = useRef<boolean>(false);
  showGuideRef.current = showGuide;

  const [onboardingStep, setOnboardingStep] =
    useState<InkOnboardingStep>(null);
  const onboardingStepRef = useRef<InkOnboardingStep>(onboardingStep);
  onboardingStepRef.current = onboardingStep;

  const [showTouchControls, setShowTouchControls] = useState<boolean>(() =>
    detectTouchOrCompactViewport(),
  );
  const [joystickKnob, setJoystickKnob] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [slashPadAiming, setSlashPadAiming] = useState<boolean>(false);

  const runRef = useRef<InkBladeRunState>(
    createNewRun(0, false, Date.now() >>> 0, meta.preferredDifficulty),
  );
  const [hud, setHud] = useState<LowFreqHudState>(() =>
    extractHudState(runRef.current),
  );
  const lastHudRef = useRef<LowFreqHudState>(hud);

  const mountRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<InkBladeCanvasRenderer | null>(null);
  const audioRef = useRef<InkBladeAudioEngine | null>(null);

  // 60Hz DOM refs for smooth bars without React re-renders
  const focusBarRef = useRef<HTMLDivElement | null>(null);
  const focusGhostBarRef = useRef<HTMLDivElement | null>(null);
  const slashCooldownTextRef = useRef<HTMLSpanElement | null>(null);
  const parryCooldownTextRef = useRef<HTMLSpanElement | null>(null);
  const comboDecayBarRef = useRef<HTMLDivElement | null>(null);

  // Unified input hub refs (Keyboard + Mouse + Virtual Touch Pads)
  const keysHeldRef = useRef<Set<string>>(new Set());
  const touchMoveRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchJoystickIdRef = useRef<number | null>(null);
  const touchJoystickOriginRef = useRef<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const touchSlashIdRef = useRef<number | null>(null);
  const touchSlashOriginRef = useRef<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const touchSlashDownAtRef = useRef<number | null>(null);

  const pointerWorldRef = useRef<{ x: number; y: number }>({ x: 760, y: 370 });
  const leftMouseDownAtRef = useRef<number | null>(null);
  const keyAttackDownAtRef = useRef<number | null>(null);
  const slashJustPressedRef = useRef<boolean>(false);
  const slashJustReleasedRef = useRef<boolean>(false);
  const parryJustPressedRef = useRef<boolean>(false);
  const focusGhostValRef = useRef<number>(1);
  const recordedSummarySeedRef = useRef<string>('');

  const markTutorialDone = useCallback(() => {
    onboardingStepRef.current = null;
    setOnboardingStep(null);
    setMeta((prev) => {
      if (prev.tutorialCompleted) return prev;
      const next = { ...prev, tutorialCompleted: true };
      saveInkBladeMeta(next);
      return next;
    });
  }, []);

  const clearHeldInputs = useCallback(() => {
    keysHeldRef.current.clear();
    touchMoveRef.current = { x: 0, y: 0 };
    touchJoystickIdRef.current = null;
    touchSlashIdRef.current = null;
    touchSlashDownAtRef.current = null;
    setJoystickKnob({ x: 0, y: 0 });
    setSlashPadAiming(false);
    leftMouseDownAtRef.current = null;
    keyAttackDownAtRef.current = null;
    slashJustPressedRef.current = false;
    slashJustReleasedRef.current = false;
    parryJustPressedRef.current = false;
  }, []);

  const syncHudImmediate = useCallback(() => {
    const next = extractHudState(runRef.current);
    lastHudRef.current = next;
    setHud(next);
  }, []);

  const aimTowardNearestEnemy = useCallback(() => {
    const run = runRef.current;
    let bestDistSq = Infinity;
    let bestEnemy = null;
    for (const e of run.enemies) {
      if (e.aiPhase === 'dying') continue;
      const dx = e.x - run.player.x;
      const dy = e.y - run.player.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        bestEnemy = e;
      }
    }
    if (bestEnemy) {
      pointerWorldRef.current = { x: bestEnemy.x, y: bestEnemy.y };
    } else {
      pointerWorldRef.current = {
        x: run.player.x + Math.cos(run.player.facing) * 220,
        y: run.player.y + Math.sin(run.player.facing) * 220,
      };
    }
  }, []);

  const startFreshRun = useCallback(
    (stageIdx: number, endless = false, forceOnboarding = false) => {
      const diff = metaRef.current.preferredDifficulty;
      const fresh = createNewRun(stageIdx, endless, Date.now() >>> 0, diff);
      runRef.current = fresh;
      recordedSummarySeedRef.current = '';
      focusGhostValRef.current = 1;
      rendererRef.current?.resetFloorForStage(
        getActiveStageDef(fresh),
        fresh.endlessLoop,
      );
      clearHeldInputs();
      if (
        forceOnboarding ||
        (!metaRef.current.tutorialCompleted &&
          !initialAutostart &&
          stageIdx === 0 &&
          !endless)
      ) {
        onboardingStepRef.current = 1;
        setOnboardingStep(1);
      } else {
        onboardingStepRef.current = null;
        setOnboardingStep(null);
      }
      if (typeof document !== 'undefined') {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        document.body.dataset.state = 'playing';
      }
      screenStateRef.current = 'playing';
      setScreenState('playing');
      syncHudImmediate();
      canvasRef.current?.focus();
    },
    [clearHeldInputs, syncHudImmediate, initialAutostart],
  );

  const handleSelectDifficulty = useCallback(
    (tier: InkBladeDifficulty) => {
      setMeta((prev) => {
        const next = { ...prev, preferredDifficulty: tier };
        metaRef.current = next;
        saveInkBladeMeta(next);
        return next;
      });
      if (screenStateRef.current === 'title') {
        const preview = createNewRun(
          selectedStartStage,
          false,
          Date.now() >>> 0,
          tier,
        );
        runRef.current = preview;
        rendererRef.current?.resetFloorForStage(getActiveStageDef(preview), 0);
        syncHudImmediate();
      }
    },
    [selectedStartStage, syncHudImmediate],
  );

  const handleToggleMute = useCallback(() => {
    setMeta((prev) => {
      const next = { ...prev, muted: !prev.muted };
      saveInkBladeMeta(next);
      audioRef.current?.setMuted(next.muted);
      return next;
    });
  }, []);

  const handleChooseBoon = useCallback(
    (boonId: BoonId) => {
      if (runRef.current.phase !== 'boon_select') return;
      selectBoonAndAdvance(runRef.current, boonId);
      const stage = getActiveStageDef(runRef.current);
      rendererRef.current?.resetFloorForStage(
        stage,
        runRef.current.endlessLoop,
      );
      audioRef.current?.playWaveClear();
      clearHeldInputs();
      syncHudImmediate();
    },
    [clearHeldInputs, syncHudImmediate],
  );

  const handleEnterEndless = useCallback(() => {
    enterEndlessAfterVictory(runRef.current);
    recordedSummarySeedRef.current = '';
    if (typeof document !== 'undefined') {
      document.body.dataset.state = 'playing';
    }
    screenStateRef.current = 'playing';
    setScreenState('playing');
    syncHudImmediate();
  }, [syncHudImmediate]);

  const handleReturnToTitle = useCallback(() => {
    const previewRun = createNewRun(
      selectedStartStage,
      false,
      Date.now() >>> 0,
      metaRef.current.preferredDifficulty,
    );
    runRef.current = previewRun;
    rendererRef.current?.resetFloorForStage(getActiveStageDef(previewRun), 0);
    clearHeldInputs();
    if (typeof document !== 'undefined') {
      document.body.dataset.state = 'title';
    }
    screenStateRef.current = 'title';
    setScreenState('title');
    syncHudImmediate();
  }, [clearHeldInputs, selectedStartStage, syncHudImmediate]);

  // Mirror screenState + run outcome to document.body.dataset.state
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (screenState === 'title') {
      document.body.dataset.state = 'title';
    } else if (screenState === 'paused') {
      document.body.dataset.state = 'paused';
    } else if (hud.phase === 'victory' || hud.phase === 'defeat') {
      document.body.dataset.state = 'gameover';
    } else {
      document.body.dataset.state = 'playing';
    }
  }, [screenState, hud.phase]);

  // Update preview stage on Title screen when user clicks stage tabs
  const handleSelectTitleStage = useCallback(
    (idx: number) => {
      setSelectedStartStage(idx);
      if (screenStateRef.current === 'title') {
        const preview = createNewRun(
          idx,
          false,
          Date.now() >>> 0,
          metaRef.current.preferredDifficulty,
        );
        runRef.current = preview;
        rendererRef.current?.resetFloorForStage(getActiveStageDef(preview), 0);
        syncHudImmediate();
      }
    },
    [syncHudImmediate],
  );

  // Single-mount Canvas2D + Simulation RAF + Audio + Listeners lifecycle
  useEffect(() => {
    const canvas = canvasRef.current;
    const mount = mountRef.current;
    if (!canvas || !mount) return;

    const audio = new InkBladeAudioEngine(metaRef.current.muted);
    audioRef.current = audio;

    const renderer = new InkBladeCanvasRenderer(canvas);
    rendererRef.current = renderer;

    const rect = mount.getBoundingClientRect();
    renderer.resize(rect.width || 1280, rect.height || 800);
    renderer.resetFloorForStage(getActiveStageDef(runRef.current), 0);

    const resizeObs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        if (cr.width > 0 && cr.height > 0) {
          renderer.resize(cr.width, cr.height);
          if (cr.width < 900) {
            setShowTouchControls(true);
          }
        }
      }
    });
    resizeObs.observe(mount);

    const onKeyDown = (e: KeyboardEvent) => {
      if (showGuideRef.current) return;

      const code = e.code;

      // Title screen Enter / Space start handshake
      if (screenStateRef.current === 'title') {
        if (code === 'Enter' || code === 'Space') {
          const activeTag = document.activeElement?.tagName;
          if (activeTag !== 'BUTTON') {
            e.preventDefault();
            startFreshRun(selectedStartStage, false);
          }
        }
        return;
      }

      // Pause toggle
      if (code === 'Escape' || code === 'KeyP') {
        const phase = runRef.current.phase;
        if (
          phase !== 'victory' &&
          phase !== 'defeat' &&
          phase !== 'boon_select'
        ) {
          e.preventDefault();
          clearHeldInputs();
          const nextState =
            screenStateRef.current === 'paused' ? 'playing' : 'paused';
          screenStateRef.current = nextState;
          setScreenState(nextState);
          return;
        }
      }

      if (code === 'KeyM') {
        e.preventDefault();
        handleToggleMute();
        return;
      }

      if (code === 'KeyH') {
        e.preventDefault();
        clearHeldInputs();
        setShowGuide((v) => !v);
        return;
      }

      if (code === 'KeyR' && screenStateRef.current === 'playing') {
        e.preventDefault();
        startFreshRun(runRef.current.stageIndex, runRef.current.isEndless);
        return;
      }

      // Boon selection shortcuts 1 / 2 / 3
      if (
        screenStateRef.current === 'playing' &&
        runRef.current.phase === 'boon_select'
      ) {
        const choices = runRef.current.pendingBoonChoices;
        if (code === 'Digit1' && choices[0]) handleChooseBoon(choices[0]);
        if (code === 'Digit2' && choices[1]) handleChooseBoon(choices[1]);
        if (code === 'Digit3' && choices[2]) handleChooseBoon(choices[2]);
        return;
      }

      // Victory / Defeat Enter or Space quick retry
      if (
        runRef.current.phase === 'victory' ||
        runRef.current.phase === 'defeat'
      ) {
        if (code === 'Enter' || code === 'Space') {
          const activeTag = document.activeElement?.tagName;
          if (activeTag !== 'BUTTON') {
            e.preventDefault();
            startFreshRun(selectedStartStage, false);
          }
        }
        return;
      }

      if (screenStateRef.current !== 'playing') return;

      if (
        code === 'KeyW' ||
        code === 'KeyA' ||
        code === 'KeyS' ||
        code === 'KeyD' ||
        code === 'ArrowUp' ||
        code === 'ArrowDown' ||
        code === 'ArrowLeft' ||
        code === 'ArrowRight' ||
        code === 'Space'
      ) {
        e.preventDefault();
      }

      if (!e.repeat) {
        if (code === 'KeyJ' || code === 'KeyZ') {
          keyAttackDownAtRef.current = performance.now();
        }
        if (code === 'Space' || code === 'KeyK' || code === 'KeyX') {
          parryJustPressedRef.current = true;
          audio.playParryStance();
          if (onboardingStepRef.current === 3) {
            markTutorialDone();
          }
        }
      }

      keysHeldRef.current.add(code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      keysHeldRef.current.delete(code);
      if (code === 'KeyJ' || code === 'KeyZ') {
        if (keyAttackDownAtRef.current !== null) {
          const heldMs = performance.now() - keyAttackDownAtRef.current;
          keyAttackDownAtRef.current = null;
          if (heldMs < 135) {
            slashJustPressedRef.current = true;
          } else {
            slashJustReleasedRef.current = true;
          }
        }
      }
    };

    const onWindowBlur = () => {
      clearHeldInputs();
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        clearHeldInputs();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);

    const isSoftwareRenderer = (() => {
      try {
        const probe = document.createElement('canvas');
        const gl = probe.getContext('webgl2') || probe.getContext('webgl');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const gpu = String(
          gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
        );
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return false;
      }
    })();

    let rafId = 0;
    let afterDrawTimerId = 0;
    let disposed = false;
    let prevTime = performance.now();
    let frozenFramePainted = false;

    const resizeObsWithRedraw = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        if (cr.width > 0 && cr.height > 0) {
          frozenFramePainted = false;
        }
      }
    });
    resizeObsWithRedraw.observe(mount);

    const scheduleNextFrame = (idlePaused = false) => {
      if (disposed) return;
      if (idlePaused) {
        afterDrawTimerId = window.setTimeout(() => {
          if (!disposed) loop(performance.now());
        }, 120);
      } else if (isSoftwareRenderer) {
        afterDrawTimerId = window.setTimeout(() => {
          if (!disposed) loop(performance.now());
        }, 70);
      } else {
        rafId = window.requestAnimationFrame(loop);
      }
    };

    const loop = (now: number) => {
      if (disposed) return;
      const rawDt = (now - prevTime) / 1000;
      prevTime = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.08);

      const curScreen = screenStateRef.current;
      const run = runRef.current;

      if (curScreen === 'title') {
        frozenFramePainted = false;
        run.elapsedSec += dt;
        renderer.render(
          run,
          dt,
          pointerWorldRef.current.x,
          pointerWorldRef.current.y,
          true,
        );
        scheduleNextFrame(false);
        return;
      }

      if (curScreen === 'paused' || showGuideRef.current) {
        if (!frozenFramePainted) {
          renderer.render(
            run,
            0,
            pointerWorldRef.current.x,
            pointerWorldRef.current.y,
            false,
          );
          frozenFramePainted = true;
        }
        scheduleNextFrame(true);
        return;
      }

      frozenFramePainted = false;
      {
        const keys = keysHeldRef.current;
        let moveX = touchMoveRef.current.x;
        let moveY = touchMoveRef.current.y;
        if (keys.has('KeyA') || keys.has('ArrowLeft')) moveX -= 1;
        if (keys.has('KeyD') || keys.has('ArrowRight')) moveX += 1;
        if (keys.has('KeyW') || keys.has('ArrowUp')) moveY -= 1;
        if (keys.has('KeyS') || keys.has('ArrowDown')) moveY += 1;

        // Project aim along movement vector if keyboard/joystick moving without explicit aim drag
        if (
          (keyAttackDownAtRef.current !== null ||
            touchJoystickIdRef.current !== null) &&
          touchSlashIdRef.current === null &&
          leftMouseDownAtRef.current === null &&
          (Math.abs(moveX) > 0.1 || Math.abs(moveY) > 0.1)
        ) {
          pointerWorldRef.current = {
            x: run.player.x + moveX * 240,
            y: run.player.y + moveY * 240,
          };
        }

        const mouseHeldMs =
          leftMouseDownAtRef.current !== null
            ? now - leftMouseDownAtRef.current
            : 0;
        const keyHeldMs =
          keyAttackDownAtRef.current !== null
            ? now - keyAttackDownAtRef.current
            : 0;
        const touchSlashHeldMs =
          touchSlashDownAtRef.current !== null
            ? now - touchSlashDownAtRef.current
            : 0;
        const mindsEyeHeld =
          mouseHeldMs >= 135 || keyHeldMs >= 135 || touchSlashHeldMs >= 110;

        const events = stepSimulation(run, dt, {
          moveX,
          moveY,
          aimWorldX: pointerWorldRef.current.x,
          aimWorldY: pointerWorldRef.current.y,
          mindsEyeHeld,
          slashJustPressed: slashJustPressedRef.current,
          slashJustReleased: slashJustReleasedRef.current,
          parryJustPressed: parryJustPressedRef.current,
        });

        slashJustPressedRef.current = false;
        slashJustReleasedRef.current = false;
        parryJustPressedRef.current = false;

        // Live Onboarding progression checks
        if (onboardingStepRef.current === 1 && run.player.gaitDist >= 90) {
          onboardingStepRef.current = 2;
          setOnboardingStep(2);
        } else if (onboardingStepRef.current === 2 && events.playerSlashed) {
          onboardingStepRef.current = 3;
          setOnboardingStep(3);
        } else if (
          onboardingStepRef.current === 3 &&
          (events.perfectDeflectCount > 0 || events.waveCleared)
        ) {
          markTutorialDone();
        }

        // Trigger procedural Web Audio cues
        if (events.playerSlashed) {
          audio.playSlash(events.chainResetTriggered);
        }
        if (events.enemiesKilled > 0) {
          audio.playKillHit();
        }
        if (events.perfectDeflectCount > 0) {
          audio.playDeflect();
        }
        if (events.jarExplodedCount > 0 || events.bossPhaseShifted) {
          audio.playExplosion();
        }
        if (events.playerDamaged) {
          audio.playPlayerHurt();
        } else if (events.enemyTelegraphStarted) {
          audio.playTelegraph();
        }
        if (events.waveCleared || events.stageCleared) {
          audio.playWaveClear();
        }
        if (events.runVictory) {
          audio.playVictory();
        }

        // Persist outcome summary once on Victory or Defeat
        if (
          (run.phase === 'victory' || run.phase === 'defeat') &&
          run.summarySnapshot
        ) {
          const outcomeKey = `${run.seed}_${run.phase}_${run.score}`;
          if (recordedSummarySeedRef.current !== outcomeKey) {
            recordedSummarySeedRef.current = outcomeKey;
            const { nextMeta, isNewBest } = recordInkBladeOutcome(
              metaRef.current,
              run.summarySnapshot,
            );
            run.summarySnapshot.isNewBest = isNewBest;
            metaRef.current = nextMeta;
            setMeta(nextMeta);
            screenStateRef.current = 'gameover';
            setScreenState('gameover');
          }
        }

        renderer.ingestEvents(run, events);
        renderer.render(
          run,
          dt,
          pointerWorldRef.current.x,
          pointerWorldRef.current.y,
          false,
        );

        // High-frequency 60Hz DOM ref mutations
        const focusRatio = Math.max(
          0,
          Math.min(1, run.player.focus / run.player.maxFocus),
        );
        focusGhostValRef.current = Math.max(
          focusRatio,
          focusGhostValRef.current - dt * 0.45,
        );
        const focusScaleStr = `scaleX(${focusRatio.toFixed(2)})`;
        if (
          focusBarRef.current &&
          focusBarRef.current.style.transform !== focusScaleStr
        ) {
          focusBarRef.current.style.transform = focusScaleStr;
        }
        const ghostScaleStr = `scaleX(${focusGhostValRef.current.toFixed(2)})`;
        if (
          focusGhostBarRef.current &&
          focusGhostBarRef.current.style.transform !== ghostScaleStr
        ) {
          focusGhostBarRef.current.style.transform = ghostScaleStr;
        }
        if (slashCooldownTextRef.current) {
          const nextSlashTxt =
            run.player.slashCooldown > 0.04
              ? `${run.player.slashCooldown.toFixed(1)}s`
              : '就绪';
          if (slashCooldownTextRef.current.textContent !== nextSlashTxt) {
            slashCooldownTextRef.current.textContent = nextSlashTxt;
          }
        }
        if (parryCooldownTextRef.current) {
          const nextParryTxt =
            run.player.parryCooldown > 0.04
              ? `${run.player.parryCooldown.toFixed(1)}s`
              : '就绪';
          if (parryCooldownTextRef.current.textContent !== nextParryTxt) {
            parryCooldownTextRef.current.textContent = nextParryTxt;
          }
        }
        if (comboDecayBarRef.current) {
          const comboRatio =
            run.combo > 0
              ? Math.max(
                  0,
                  Math.min(1, run.comboTimer / getComboWindowSec(run)),
                )
              : 0;
          const comboScaleStr = `scaleX(${comboRatio.toFixed(2)})`;
          if (comboDecayBarRef.current.style.transform !== comboScaleStr) {
            comboDecayBarRef.current.style.transform = comboScaleStr;
          }
        }

        const nextHud = extractHudState(run);
        if (!hudStatesEqual(lastHudRef.current, nextHud)) {
          lastHudRef.current = nextHud;
          setHud(nextHud);
        }
      }

      scheduleNextFrame(false);
    };

    scheduleNextFrame(false);

    return () => {
      disposed = true;
      window.clearTimeout(afterDrawTimerId);
      window.cancelAnimationFrame(rafId);
      resizeObs.disconnect();
      resizeObsWithRedraw.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      audio.dispose();
      audioRef.current = null;
      rendererRef.current = null;
      if (typeof document !== 'undefined') {
        delete document.body.dataset.state;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCanvasPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!rendererRef.current) return;
      if (e.pointerType === 'touch' && leftMouseDownAtRef.current === null) {
        return;
      }
      pointerWorldRef.current = rendererRef.current.screenToWorld(
        e.clientX,
        e.clientY,
      );
    },
    [],
  );

  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.pointerType === 'touch') {
        setShowTouchControls(true);
      }
      if (screenStateRef.current !== 'playing') return;
      if (runRef.current.phase !== 'fighting') return;
      if (rendererRef.current) {
        pointerWorldRef.current = rendererRef.current.screenToWorld(
          e.clientX,
          e.clientY,
        );
      }
      if (e.button === 2) {
        e.preventDefault();
        parryJustPressedRef.current = true;
        audioRef.current?.playParryStance();
        if (onboardingStepRef.current === 3) {
          markTutorialDone();
        }
      } else {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        leftMouseDownAtRef.current = performance.now();
      }
    },
    [markTutorialDone],
  );

  const onCanvasPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (leftMouseDownAtRef.current !== null) {
        const heldMs = performance.now() - leftMouseDownAtRef.current;
        leftMouseDownAtRef.current = null;
        if (rendererRef.current) {
          pointerWorldRef.current = rendererRef.current.screenToWorld(
            e.clientX,
            e.clientY,
          );
        }
        if (heldMs < 135) {
          slashJustPressedRef.current = true;
        } else {
          slashJustReleasedRef.current = true;
        }
      }
    },
    [],
  );

  // Virtual Left-Thumb Joystick Handlers
  const handleJoystickDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      const rect = e.currentTarget.getBoundingClientRect();
      const cx = rect.left + rect.width * 0.5;
      const cy = rect.top + rect.height * 0.5;
      touchJoystickIdRef.current = e.pointerId;
      touchJoystickOriginRef.current = { x: cx, y: cy };

      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const maxR = 36;
      const dist = Math.hypot(dx, dy);
      const clampedR = Math.min(maxR, dist);
      const ang = dist > 1 ? Math.atan2(dy, dx) : 0;
      const nx = dist > 5 ? (dx / dist) * (clampedR / maxR) : 0;
      const ny = dist > 5 ? (dy / dist) * (clampedR / maxR) : 0;
      touchMoveRef.current = { x: nx, y: ny };
      setJoystickKnob({
        x: Math.cos(ang) * clampedR,
        y: Math.sin(ang) * clampedR,
      });
    },
    [],
  );

  const handleJoystickMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (touchJoystickIdRef.current !== e.pointerId) return;
      const { x: cx, y: cy } = touchJoystickOriginRef.current;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const maxR = 36;
      const dist = Math.hypot(dx, dy);
      const clampedR = Math.min(maxR, dist);
      const ang = dist > 1 ? Math.atan2(dy, dx) : 0;
      const nx = dist > 5 ? (dx / dist) * (clampedR / maxR) : 0;
      const ny = dist > 5 ? (dy / dist) * (clampedR / maxR) : 0;
      touchMoveRef.current = { x: nx, y: ny };
      setJoystickKnob({
        x: Math.cos(ang) * clampedR,
        y: Math.sin(ang) * clampedR,
      });
    },
    [],
  );

  const handleJoystickUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (touchJoystickIdRef.current !== e.pointerId) return;
      touchJoystickIdRef.current = null;
      touchMoveRef.current = { x: 0, y: 0 };
      setJoystickKnob({ x: 0, y: 0 });
    },
    [],
  );

  // Virtual Right-Thumb Slash (Press-Hold Mind's Eye + Drag Aim + Release Slash)
  const handleSlashPadDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      const rect = e.currentTarget.getBoundingClientRect();
      touchSlashIdRef.current = e.pointerId;
      touchSlashOriginRef.current = {
        x: rect.left + rect.width * 0.5,
        y: rect.top + rect.height * 0.5,
      };
      touchSlashDownAtRef.current = performance.now();
      setSlashPadAiming(true);
      aimTowardNearestEnemy();
    },
    [aimTowardNearestEnemy],
  );

  const handleSlashPadMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (touchSlashIdRef.current !== e.pointerId) return;
      const dx = e.clientX - touchSlashOriginRef.current.x;
      const dy = e.clientY - touchSlashOriginRef.current.y;
      if (Math.hypot(dx, dy) > 10) {
        const ang = Math.atan2(dy, dx);
        const p = runRef.current.player;
        pointerWorldRef.current = {
          x: p.x + Math.cos(ang) * 260,
          y: p.y + Math.sin(ang) * 260,
        };
      }
    },
    [],
  );

  const handleSlashPadUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (touchSlashIdRef.current !== e.pointerId) return;
      const heldMs =
        touchSlashDownAtRef.current !== null
          ? performance.now() - touchSlashDownAtRef.current
          : 0;
      touchSlashIdRef.current = null;
      touchSlashDownAtRef.current = null;
      setSlashPadAiming(false);
      if (heldMs < 120) {
        slashJustPressedRef.current = true;
      } else {
        slashJustReleasedRef.current = true;
      }
    },
    [],
  );

  const handleParryPadDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      parryJustPressedRef.current = true;
      audioRef.current?.playParryStance();
      if (onboardingStepRef.current === 3) {
        markTutorialDone();
      }
    },
    [markTutorialDone],
  );

  const activeStage =
    STAGES[Math.max(0, Math.min(STAGES.length - 1, hud.stageIndex))];
  const activeDiffDef = DIFFICULTY_DEFS[hud.difficulty];

  const onboardingCopy = useMemo(() => {
    if (!onboardingStep) return null;
    if (onboardingStep === 1) {
      return {
        badge: '实战带教 1/3 · 身法游走',
        text: '使用 WASD / 方向键（触屏拖动左下摇杆）在庭院中移动走位，避开敌军正面逼近。',
      };
    }
    if (onboardingStep === 2) {
      return {
        badge: '实战带教 2/3 · 心眼一闪',
        text: '按住左键 / J（触屏按住右下「疾斩」拖动瞄准）开启心眼慢镜，松手瞬身斩杀并立即刷新冷却！',
      };
    }
    return {
      badge: '实战带教 3/3 · 刹那弹反',
      text: '见敌方红光突刺或弩箭逼近时，按右键 / Space（触屏点「弹反」）震晕敌军并倍速奉还飞矢！',
    };
  }, [onboardingStep]);

  return (
    <div
      ref={mountRef}
      className="relative w-full h-full overflow-hidden select-none bg-[#E2DBD0] text-[#1C1917]"
    >
      {/* Isolated Full-Viewport 2D Architectural Ink Canvas */}
      <canvas
        ref={canvasRef}
        data-testid="ink-blade-canvas"
        tabIndex={-1}
        onPointerMove={onCanvasPointerMove}
        onPointerDown={onCanvasPointerDown}
        onPointerUp={onCanvasPointerUp}
        onContextMenu={(e) => e.preventDefault()}
        className="block w-full h-full cursor-crosshair focus:outline-none touch-none"
      />

      {/* ==================== TITLE SCREEN OVERLAY ==================== */}
      {screenState === 'title' && (
        <div
          className="absolute inset-0 z-20 flex flex-col justify-between p-5 sm:p-10 overflow-y-auto pointer-events-none"
          style={{
            background:
              'linear-gradient(90deg, rgba(250, 248, 244, 0.96) 0%, rgba(250, 248, 244, 0.88) 46%, rgba(250, 248, 244, 0.16) 80%, rgba(250, 248, 244, 0) 100%)',
          }}
        >
          <div className="max-w-md pointer-events-auto my-auto space-y-4 sm:space-y-5">
            <div className="flex items-center gap-3.5 sm:gap-4">
              <InkBladeTitleEmblemSvg className="w-14 h-14 sm:w-16 sm:h-16 shrink-0" />
              <div>
                <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-[#1C1917]">
                  墨刃：一闪
                </h1>
                <p className="text-xs sm:text-sm font-medium text-[#57534E] mt-1">
                  瞬身斩击 · 心眼慢镜 · 刹那弹反破阵
                </p>
              </div>
            </div>

            {/* Difficulty Selector */}
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-[#57534E]">
                剑道难度（默认推荐「剑豪·标准」）
              </div>
              <div
                role="group"
                aria-label="选择剑道难度"
                className="grid grid-cols-3 gap-1.5"
              >
                {DIFFICULTY_ORDER.map((tier) => {
                  const def = DIFFICULTY_DEFS[tier];
                  const active = meta.preferredDifficulty === tier;
                  return (
                    <button
                      key={tier}
                      type="button"
                      data-testid={`ink-diff-${tier}`}
                      aria-pressed={active}
                      onClick={() => handleSelectDifficulty(tier)}
                      className={`p-2 rounded-lg border text-left transition-colors cursor-pointer ${
                        active
                          ? 'bg-white border-[#C2410C] text-[#1C1917] shadow-xs'
                          : 'bg-white/85 hover:bg-white border-[#D6D0C4] text-[#57534E] hover:text-[#1C1917]'
                      } focus:outline-none focus-visible:border-[#C2410C]`}
                    >
                      <div className="text-xs font-bold">{def.label}</div>
                      <div className="text-[10px] text-[#78716C] mt-0.5 truncate">
                        {def.subtitle}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Stage Selector */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-[#57534E]">
                <span>择院入阵</span>
                {meta.bestScore > 0 && (
                  <span className="font-mono-num text-[#1C1917]">
                    最高评定 {meta.bestScore} · 极连 {meta.bestMaxCombo}
                  </span>
                )}
              </div>
              <div
                role="group"
                aria-label="选择出战庭院"
                className="grid grid-cols-3 sm:grid-cols-5 gap-1.5"
              >
                {STAGES.map((st, idx) => {
                  const locked = idx > meta.highestUnlockedStage;
                  const active = selectedStartStage === idx;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      disabled={locked}
                      aria-pressed={active}
                      onClick={() => handleSelectTitleStage(idx)}
                      className={`px-2 py-2 rounded-lg border text-left transition-colors whitespace-nowrap ${
                        locked
                          ? 'bg-[#EFECE5] border-[#E4DFD5] text-[#A8A29E] cursor-not-allowed'
                          : active
                            ? 'bg-white border-[#C2410C] text-[#1C1917] cursor-pointer shadow-xs'
                            : 'bg-white/85 hover:bg-white border-[#D6D0C4] text-[#57534E] hover:text-[#1C1917] cursor-pointer'
                      } focus:outline-none focus-visible:border-[#C2410C]`}
                    >
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span>{st.numeral}</span>
                        {locked && (
                          <Lock className="w-3 h-3" aria-hidden="true" />
                        )}
                      </div>
                      <div className="text-[11px] mt-0.5 truncate">
                        {st.name}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Primary & Secondary Actions (<= 3 menu actions) */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                data-start="true"
                data-testid="start-ink-blade"
                onClick={() => startFreshRun(selectedStartStage, false)}
                className="inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 rounded-lg bg-[#C2410C] hover:bg-[#9A3412] text-white text-sm font-bold border border-[#9A3412] transition-colors cursor-pointer whitespace-nowrap focus:outline-none focus-visible:border-[#1C1917]"
              >
                <Play className="w-4 h-4 fill-current" aria-hidden="true" />
                <span>拔刀入阵</span>
              </button>

              <button
                type="button"
                data-testid="start-ink-tutorial-btn"
                onClick={() => startFreshRun(0, false, true)}
                className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-lg bg-white hover:bg-[#F3EFE6] text-[#9A3412] text-sm font-semibold border border-[#C2410C]/45 transition-colors cursor-pointer whitespace-nowrap focus:outline-none focus-visible:border-[#C2410C]"
              >
                <HelpCircle className="w-4 h-4" aria-hidden="true" />
                <span>新手带教</span>
              </button>

              <button
                type="button"
                onClick={() => setShowGuide(true)}
                className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-lg bg-white hover:bg-[#F3EFE6] text-[#1C1917] text-sm font-semibold border border-[#CFC7B8] transition-colors cursor-pointer whitespace-nowrap focus:outline-none focus-visible:border-[#C2410C]"
              >
                <BookOpen className="w-4 h-4" aria-hidden="true" />
                <span>剑谱心法</span>
              </button>
            </div>
          </div>

          <div className="text-[11px] sm:text-xs font-medium text-[#57534E] tracking-wide pt-2">
            键鼠：WASD 移动 · 左键/J 疾斩（长按慢镜） · 右键/Space 弹反 ｜ 触屏：双摇杆直觉挥刃
          </div>
        </div>
      )}

      {/* ==================== PLAYING PERIMETER HUD ==================== */}
      {screenState !== 'title' && (
        <div className="absolute inset-0 z-10 pointer-events-none p-2.5 sm:p-5 flex flex-col justify-between">
          {/* Top Stack: Perimeter Clusters + Optional Live Onboarding Banner */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-4">
              {/* Top-Left: Vitality Seal Pips + Focus Ghost Bar */}
              <div
                className="px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-lg border border-[#CFC7B8] space-y-1.5 sm:space-y-2 pointer-events-auto"
                style={{ backgroundColor: 'rgba(250, 248, 244, 0.92)' }}
              >
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="text-[11px] font-bold text-[#57534E] tracking-wider">
                    气血
                  </span>
                  <div
                    className="flex items-center gap-0.5 sm:gap-1"
                    aria-label={`当前气血 ${hud.hp} / ${hud.maxHp}`}
                  >
                    {Array.from({ length: hud.maxHp }).map((_, idx) => {
                      const pipState =
                        idx < hud.hp
                          ? 'full'
                          : idx === hud.hp && hud.lastHurtActive
                            ? 'cracked'
                            : 'empty';
                      return <VitalitySealPipSvg key={idx} state={pipState} />;
                    })}
                  </div>
                </div>

                {/* Mind's Eye Focus Meter */}
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="text-[11px] font-bold text-[#57534E] tracking-wider">
                    心眼
                  </span>
                  <div className="relative w-24 sm:w-32 h-2 rounded-xs bg-[#E4DFD5] overflow-hidden">
                    <div
                      ref={focusGhostBarRef}
                      className="absolute inset-0 origin-left bg-[#F59E0B]"
                      style={{ transform: 'scaleX(1)' }}
                    />
                    <div
                      ref={focusBarRef}
                      className="absolute inset-0 origin-left bg-[#0F766E]"
                      style={{ transform: 'scaleX(1)' }}
                    />
                  </div>
                </div>

                {/* Active Stance Cooldown Readouts (Desktop/Tablet) */}
                <div className="hidden sm:flex items-center gap-4 text-[11px] font-medium text-[#57534E] pt-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="px-1 py-0.2 rounded-xs bg-[#EFECE5] border border-[#D6D0C4] font-mono-num text-[10px] text-[#1C1917]">
                      左键/J
                    </span>
                    <span>疾斩</span>
                    <span
                      ref={slashCooldownTextRef}
                      className={`inline-block w-7 text-right font-mono-num font-bold ${
                        hud.slashReady ? 'text-[#C2410C]' : 'text-[#78716C]'
                      }`}
                    >
                      就绪
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="px-1 py-0.2 rounded-xs bg-[#EFECE5] border border-[#D6D0C4] font-mono-num text-[10px] text-[#1C1917]">
                      右键/空
                    </span>
                    <span>弹反</span>
                    <span
                      ref={parryCooldownTextRef}
                      className={`inline-block w-7 text-right font-mono-num font-bold ${
                        hud.parryReady ? 'text-[#D97706]' : 'text-[#78716C]'
                      }`}
                    >
                      就绪
                    </span>
                  </div>
                </div>
              </div>

              {/* Top-Center: Courtyard Name & Wave Counter */}
              <div
                className="px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg border border-[#CFC7B8] text-center"
                style={{ backgroundColor: 'rgba(250, 248, 244, 0.92)' }}
              >
                <div className="text-[11px] sm:text-xs font-bold text-[#1C1917] whitespace-nowrap">
                  {hud.isEndless
                    ? `修罗第 ${hud.endlessLoop} 轮 · ${activeStage.name}`
                    : `${activeStage.numeral} · ${activeStage.name}（${activeDiffDef.label.split('·')[0]}）`}
                </div>
                <div className="text-[10px] sm:text-[11px] text-[#57534E] font-mono-num mt-0.5 whitespace-nowrap">
                  第 {hud.waveIndex + 1}/{hud.totalWaves} 阵 · 余敌{' '}
                  {hud.enemiesRemaining}
                </div>
              </div>

              {/* Top-Right: Score / Issen Combo + Compact Utility Buttons */}
              <div className="flex items-start gap-1.5 sm:gap-2.5 pointer-events-auto">
                <div
                  className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg border border-[#CFC7B8] text-right min-w-[88px] sm:min-w-[116px]"
                  style={{ backgroundColor: 'rgba(250, 248, 244, 0.92)' }}
                >
                  <div className="flex items-baseline justify-end gap-1.5">
                    <span className="text-[10px] font-bold text-[#78716C]">
                      评定
                    </span>
                    <span className="text-base sm:text-lg font-bold font-mono-num leading-none text-[#1C1917]">
                      {hud.score}
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-1.5 mt-0.5 sm:mt-1">
                    <span className="text-[10px] sm:text-[11px] font-bold text-[#C2410C] font-mono-num">
                      {hud.combo > 0 ? `${hud.combo} 连斩` : '蓄势待发'}
                    </span>
                  </div>
                  <div className="w-full h-1 bg-[#E4DFD5] rounded-xs overflow-hidden mt-1">
                    <div
                      ref={comboDecayBarRef}
                      className="h-full bg-[#C2410C] origin-left"
                      style={{ transform: 'scaleX(0)' }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={meta.muted ? '取消静音 [M]' : '静音 [M]'}
                    title={meta.muted ? '取消静音 (M)' : '静音 (M)'}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      handleToggleMute();
                    }}
                    className="hidden sm:flex w-9 h-9 rounded-lg bg-[#FAF8F4] hover:bg-white border border-[#CFC7B8] items-center justify-center text-[#1C1917] cursor-pointer focus:outline-none focus-visible:border-[#C2410C]"
                  >
                    {meta.muted ? (
                      <VolumeX className="w-4 h-4 text-[#78716C]" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>

                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label="剑谱心法 [H]"
                    title="剑谱心法 (H)"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      clearHeldInputs();
                      setShowGuide(true);
                    }}
                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#FAF8F4] hover:bg-white border border-[#CFC7B8] flex items-center justify-center text-[#1C1917] cursor-pointer focus:outline-none focus-visible:border-[#C2410C]"
                  >
                    <BookOpen className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label="重新开始本关 [R]"
                    title="重新开始 (R)"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      startFreshRun(
                        runRef.current.stageIndex,
                        runRef.current.isEndless,
                      );
                    }}
                    className="hidden sm:flex w-9 h-9 rounded-lg bg-[#FAF8F4] hover:bg-white border border-[#CFC7B8] items-center justify-center text-[#1C1917] cursor-pointer focus:outline-none focus-visible:border-[#C2410C]"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label="暂停游戏 [P]"
                    title="暂停 (P / Esc)"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      clearHeldInputs();
                      const next =
                        screenStateRef.current === 'paused'
                          ? 'playing'
                          : 'paused';
                      screenStateRef.current = next;
                      setScreenState(next);
                    }}
                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#FAF8F4] hover:bg-white border border-[#CFC7B8] flex items-center justify-center text-[#1C1917] cursor-pointer focus:outline-none focus-visible:border-[#C2410C]"
                  >
                    <Pause className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Interactive 3-Step Live Onboarding Coach Bar */}
            {onboardingCopy && (
              <div
                data-testid="ink-onboarding-bar"
                className="pointer-events-auto max-w-xl px-3 py-2 rounded-lg bg-[#FAF8F4]/95 border-2 border-[#C2410C] flex items-center justify-between gap-2.5 shadow-sm"
              >
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-[#C2410C]">
                    {onboardingCopy.badge}
                  </div>
                  <div className="text-xs text-[#1C1917] leading-snug mt-0.5">
                    {onboardingCopy.text}
                  </div>
                </div>
                <button
                  type="button"
                  data-testid="ink-onboarding-skip"
                  onClick={markTutorialDone}
                  className="px-2.5 py-1 rounded bg-white hover:bg-[#F3EFE6] border border-[#CFC7B8] text-[11px] font-semibold text-[#57534E] hover:text-[#1C1917] cursor-pointer whitespace-nowrap shrink-0"
                >
                  跳过
                </button>
              </div>
            )}
          </div>

          {/* Bottom Row: Mobile Touch Pads + Collected Boons Strip + Boss Health Bar */}
          <div className="space-y-2">
            {hud.bossMaxHp > 0 && (
              <div
                className="w-full max-w-md mx-auto px-4 py-2 rounded-lg border-2 border-[#1C1917]"
                style={{ backgroundColor: 'rgba(250, 248, 244, 0.95)' }}
              >
                <div className="flex items-center justify-between text-xs font-bold mb-1">
                  <span className="text-[#1C1917]">
                    玄铁镇岳将 {hud.bossPhase === 2 ? '· 狂澜破甲' : ''}
                  </span>
                  <span className="font-mono-num text-[#B91C1C]">
                    {hud.bossHp} / {hud.bossMaxHp}
                  </span>
                </div>
                <div className="w-full h-2 bg-[#E4DFD5] rounded-xs overflow-hidden">
                  <div
                    className="h-full bg-[#B91C1C] transition-transform duration-100 origin-left"
                    style={{
                      transform: `scaleX(${Math.max(0, hud.bossHp / hud.bossMaxHp).toFixed(3)})`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Mobile / Tablet Dual-Thumb Touch Controls */}
            {showTouchControls &&
              screenState === 'playing' &&
              hud.phase === 'fighting' && (
                <div
                  data-testid="ink-touch-controls"
                  className="flex items-end justify-between px-1 pb-1 pointer-events-none"
                >
                  {/* Left-Thumb Virtual Joystick */}
                  <div
                    data-testid="ink-touch-joystick"
                    onPointerDown={handleJoystickDown}
                    onPointerMove={handleJoystickMove}
                    onPointerUp={handleJoystickUp}
                    onPointerCancel={handleJoystickUp}
                    className="pointer-events-auto touch-none relative w-24 h-24 sm:w-28 sm:h-28 rounded-full border-2 border-[#1C1917]/40 bg-[#FAF8F4]/72 flex items-center justify-center"
                  >
                    <div
                      className="absolute w-11 h-11 rounded-full bg-[#1C1917]/90 border border-[#C2410C] shadow-md pointer-events-none flex items-center justify-center"
                      style={{
                        transform: `translate(${joystickKnob.x.toFixed(1)}px, ${joystickKnob.y.toFixed(1)}px)`,
                      }}
                    >
                      <span className="text-[10px] font-bold text-[#FAF8F4] select-none">
                        身法
                      </span>
                    </div>
                  </div>

                  {/* Right-Thumb Parry & Aim-Slash Cluster */}
                  <div className="pointer-events-auto flex items-end gap-3">
                    <button
                      type="button"
                      data-testid="ink-touch-parry"
                      onPointerDown={handleParryPadDown}
                      className={`touch-none w-15 h-15 sm:w-16 sm:h-16 rounded-full border-2 flex flex-col items-center justify-center shadow-md cursor-pointer ${
                        hud.parryReady
                          ? 'bg-[#FAF8F4]/92 border-[#D97706] text-[#9A3412]'
                          : 'bg-[#E4DFD5]/80 border-[#A8A29E] text-[#78716C]'
                      }`}
                    >
                      <span className="text-xs font-bold">弹反</span>
                      <span className="text-[9px] font-mono-num">
                        {hud.parryReady ? '就绪' : '调息'}
                      </span>
                    </button>

                    <button
                      type="button"
                      data-testid="ink-touch-slash"
                      onPointerDown={handleSlashPadDown}
                      onPointerMove={handleSlashPadMove}
                      onPointerUp={handleSlashPadUp}
                      onPointerCancel={handleSlashPadUp}
                      className={`touch-none w-20 h-20 sm:w-22 sm:h-22 rounded-full border-2 flex flex-col items-center justify-center shadow-lg cursor-pointer ${
                        slashPadAiming
                          ? 'bg-[#0F766E] border-[#1C1917] text-white scale-105'
                          : hud.slashReady
                            ? 'bg-[#C2410C]/92 border-[#7C2D12] text-white'
                            : 'bg-[#D6D0C4]/85 border-[#78716C] text-[#57534E]'
                      }`}
                    >
                      <span className="text-sm font-bold">
                        {slashPadAiming ? '松手斩' : '疾斩'}
                      </span>
                      <span className="text-[10px]">
                        {slashPadAiming ? '拖动瞄准' : '按住慢镜'}
                      </span>
                    </button>
                  </div>
                </div>
              )}

            {hud.boons.length > 0 && (
              <div className="flex items-center justify-start">
                <div
                  className="px-2.5 py-1.5 rounded-lg border border-[#CFC7B8] flex flex-wrap items-center gap-1.5 pointer-events-auto"
                  style={{ backgroundColor: 'rgba(250, 248, 244, 0.9)' }}
                  aria-label="已习得刀铭"
                >
                  {hud.boons.map((id) => {
                    const def = BOONS_BY_ID[id];
                    return (
                      <div
                        key={id}
                        title={`${def.name}：${def.desc}`}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-white border border-[#E4DFD5]"
                      >
                        <BoonSealSvg
                          category={def.category}
                          accentHex={def.accentHex}
                          className="w-4 h-4"
                        />
                        <span className="text-[11px] font-semibold text-[#1C1917] whitespace-nowrap">
                          {def.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== BETWEEN-STAGE BOON SHRINE MODAL ==================== */}
      {screenState === 'playing' && hud.phase === 'boon_select' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="boon-shrine-title"
          className="absolute inset-0 z-30 flex items-center justify-center p-4 sm:p-6 overflow-y-auto pointer-events-auto"
          style={{ backgroundColor: 'rgba(28, 25, 23, 0.68)' }}
        >
          <div className="w-full max-w-2xl bg-[#FAF8F4] border-2 border-[#1C1917] rounded-xl p-5 sm:p-7 shadow-2xl space-y-4 sm:space-y-5 my-auto">
            <div className="flex items-baseline justify-between gap-4 border-b border-[#E4DFD5] pb-3 sm:pb-4">
              <div>
                <h2
                  id="boon-shrine-title"
                  className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1917]"
                >
                  庭院肃清 · 刀铭择一
                </h2>
                <p className="text-xs text-[#57534E] mt-1">
                  择一刻印于佩刀之上，同时恢复气血并踏入下一座庭院
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {hud.pendingBoonChoices.map((boonId, idx) => {
                const boon = BOONS_BY_ID[boonId];
                return (
                  <button
                    key={boonId}
                    type="button"
                    onClick={() => handleChooseBoon(boonId)}
                    className="group text-left p-3.5 sm:p-4 rounded-lg bg-white hover:bg-[#F9F6F0] border border-[#D6D0C4] hover:border-[#C2410C] transition-colors flex flex-col justify-between gap-2.5 cursor-pointer focus:outline-none focus-visible:border-[#C2410C]"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <BoonSealSvg
                          category={boon.category}
                          accentHex={boon.accentHex}
                          className="w-8 h-8 sm:w-9 sm:h-9"
                        />
                        <span className="text-xs font-mono-num font-bold text-[#78716C] group-hover:text-[#C2410C]">
                          [{idx + 1}] {boon.shortTag}
                        </span>
                      </div>
                      <h3 className="text-sm sm:text-base font-bold text-[#1C1917]">
                        {boon.name}
                      </h3>
                      <p className="text-xs text-[#57534E] leading-relaxed">
                        {boon.desc}
                      </p>
                    </div>

                    <span className="text-xs font-bold text-[#C2410C] pt-1">
                      铭刻入刀 →
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ==================== PAUSE MODAL ==================== */}
      {screenState === 'paused' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pause-modal-title"
          className="absolute inset-0 z-30 flex items-center justify-center p-4 pointer-events-auto"
          style={{ backgroundColor: 'rgba(28, 25, 23, 0.68)' }}
        >
          <div className="w-full max-w-sm bg-[#FAF8F4] border-2 border-[#1C1917] rounded-xl p-6 shadow-2xl space-y-4">
            <div>
              <h2
                id="pause-modal-title"
                className="text-2xl font-bold tracking-tight text-[#1C1917]"
              >
                收刀入鞘 · 暂歇
              </h2>
              <p className="text-xs text-[#57534E] mt-1">
                {activeStage.name} · {activeDiffDef.label} · 第{' '}
                {hud.waveIndex + 1}/{hud.totalWaves} 阵
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-white border border-[#E4DFD5]">
                <div className="text-[11px] text-[#78716C]">当前评定</div>
                <div className="text-lg font-bold font-mono-num text-[#1C1917] mt-0.5">
                  {hud.score}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-white border border-[#E4DFD5]">
                <div className="text-[11px] text-[#78716C]">弹反破招</div>
                <div className="text-lg font-bold font-mono-num text-[#D97706] mt-0.5">
                  {hud.deflects}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  screenStateRef.current = 'playing';
                  setScreenState('playing');
                }}
                className="w-full py-2.5 px-4 rounded-lg bg-[#C2410C] hover:bg-[#9A3412] text-white text-sm font-bold transition-colors cursor-pointer focus:outline-none focus-visible:border-[#1C1917]"
              >
                继续挥刃
              </button>
              <button
                type="button"
                onClick={() => {
                  onboardingStepRef.current = 1;
                  setOnboardingStep(1);
                  screenStateRef.current = 'playing';
                  setScreenState('playing');
                }}
                className="w-full py-2 px-4 rounded-lg bg-white hover:bg-[#F3EFE6] border border-[#C2410C]/45 text-[#9A3412] text-sm font-semibold transition-colors cursor-pointer"
              >
                重温三步实战带教
              </button>
              <button
                type="button"
                onClick={() => setShowTouchControls((v) => !v)}
                className="w-full py-2 px-4 rounded-lg bg-white hover:bg-[#F3EFE6] border border-[#CFC7B8] text-[#1C1917] text-xs font-semibold transition-colors cursor-pointer"
              >
                {showTouchControls ? '隐藏触屏虚拟摇杆' : '显示触屏虚拟摇杆'}
              </button>
              <button
                type="button"
                onClick={() =>
                  startFreshRun(
                    runRef.current.stageIndex,
                    runRef.current.isEndless,
                  )
                }
                className="w-full py-2 px-4 rounded-lg bg-white hover:bg-[#F3EFE6] border border-[#CFC7B8] text-[#1C1917] text-sm font-semibold transition-colors cursor-pointer focus:outline-none focus-visible:border-[#C2410C]"
              >
                重整旗鼓
              </button>
              <button
                type="button"
                onClick={handleReturnToTitle}
                className="w-full py-2 px-4 rounded-lg bg-white hover:bg-[#F3EFE6] border border-[#E4DFD5] text-[#57534E] hover:text-[#1C1917] text-sm font-medium transition-colors cursor-pointer focus:outline-none focus-visible:border-[#C2410C]"
              >
                退回庭院标题
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== VICTORY / DEFEAT OUTCOME MODAL ==================== */}
      {screenState === 'gameover' && hud.summary && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="outcome-modal-title"
          className="absolute inset-0 z-30 flex items-center justify-center p-4 pointer-events-auto"
          style={{ backgroundColor: 'rgba(28, 25, 23, 0.75)' }}
        >
          <div className="w-full max-w-md bg-[#FAF8F4] border-2 border-[#1C1917] rounded-xl p-6 sm:p-7 shadow-2xl space-y-5">
            <div>
              <h2
                id="outcome-modal-title"
                className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1C1917]"
              >
                {hud.summary.outcome === 'victory'
                  ? '五阵皆破 · 剑心通明'
                  : '兵败身陨 · 剑意未绝'}
              </h2>
              <p className="text-xs text-[#57534E] mt-1">
                {hud.summary.outcome === 'victory'
                  ? `讨平天守雷阁，总用时 ${formatClearTime(hud.summary.clearTimeSec)}`
                  : `止步于「${hud.summary.stageName}」第 ${hud.summary.waveNumber}/${hud.summary.totalWavesInStage} 阵`}
                {hud.summary.isNewBest ? ' · 刷新最高纪录' : ''}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div className="p-3 rounded-lg bg-white border border-[#E4DFD5]">
                <div className="text-[11px] text-[#78716C]">总评得分</div>
                <div className="text-lg font-bold font-mono-num text-[#1C1917] mt-0.5">
                  {hud.summary.score}
                </div>
                <div className="text-[10px] font-mono-num text-[#78716C]">
                  最高 {meta.bestScore}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-white border border-[#E4DFD5]">
                <div className="text-[11px] text-[#78716C]">极意连斩</div>
                <div className="text-lg font-bold font-mono-num text-[#C2410C] mt-0.5">
                  {hud.summary.maxCombo}
                </div>
                <div className="text-[10px] font-mono-num text-[#78716C]">
                  斩敌 {hud.summary.kills}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-white border border-[#E4DFD5]">
                <div className="text-[11px] text-[#78716C]">刹那弹反</div>
                <div className="text-lg font-bold font-mono-num text-[#D97706] mt-0.5">
                  {hud.summary.deflects}
                </div>
                <div className="text-[10px] font-mono-num text-[#78716C]">
                  受创 {hud.summary.damageTaken}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5 pt-1">
              {hud.summary.outcome === 'victory' && !hud.summary.isEndless && (
                <button
                  type="button"
                  onClick={handleEnterEndless}
                  className="w-full py-2.5 px-4 rounded-lg bg-[#1C1917] hover:bg-[#292524] text-white text-sm font-bold transition-colors cursor-pointer focus:outline-none focus-visible:border-[#C2410C]"
                >
                  踏入修罗无尽轮回
                </button>
              )}

              <button
                type="button"
                data-start="true"
                onClick={() =>
                  startFreshRun(
                    hud.summary?.outcome === 'victory' ? 0 : hud.stageIndex,
                    false,
                  )
                }
                className="w-full py-2.5 px-4 rounded-lg bg-[#C2410C] hover:bg-[#9A3412] text-white text-sm font-bold transition-colors cursor-pointer focus:outline-none focus-visible:border-[#1C1917]"
              >
                {hud.summary.outcome === 'victory' ? '再战一局' : '再试锋芒'}
              </button>

              <button
                type="button"
                onClick={handleReturnToTitle}
                className="w-full py-2.5 px-4 rounded-lg bg-white hover:bg-[#F3EFE6] border border-[#E4DFD5] text-[#57534E] hover:text-[#1C1917] text-sm font-medium transition-colors cursor-pointer focus:outline-none focus-visible:border-[#C2410C]"
              >
                返回庭院标题
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guide Modal */}
      {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}
    </div>
  );
}
