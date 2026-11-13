import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BookOpen,
  Check,
  Compass,
  HelpCircle,
  Lock,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Sparkles,
  Undo2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { CodexModal } from './CodexModal.tsx';
import { ForgeModal } from './ForgeModal.tsx';
import { TutorialModal } from './TutorialModal.tsx';
import { XuanjiAudioEngine } from './audio.ts';
import {
  DIFFICULTY_DEFS,
  DIFFICULTY_ORDER,
  ENEMY_DEFS,
  MECH_DEFS,
  MECH_ORDER,
  RELIC_DEFS,
  SECTORS,
  TERRAIN_META,
} from './content.ts';
import {
  cloneBattleState,
  coordsEqual,
  createBattleState,
  executeTacticalActionInPlace,
  findBestTacticalAction,
  getReachableTiles,
  getThreatenedCitadels,
  getTile,
  getUnitAt,
  getUnitById,
  getValidWeaponTargets,
  isLuopanRingTile,
  resetCurrentTurn,
  resolveEndTurn,
  simulateActionPreview,
  undoUnitMove,
} from './engine.ts';
import {
  GridPowerPipSvg,
  MechClassIconSvg,
  XuanjiBreachEmblemSvg,
} from './icons.tsx';
import { XuanjiIsometricRenderer } from './renderer.ts';
import {
  loadXuanjiMeta,
  recordXuanjiRunOutcome,
  saveXuanjiMeta,
} from './storage.ts';
import type {
  ActionPreviewResult,
  BattleState,
  DifficultyTier,
  GridCoord,
  RelicId,
  TacticalAction,
  WeaponSlotKey,
  XuanjiMetaSave,
} from './types.ts';

type ScreenMode = 'title' | 'playing' | 'paused' | 'forge' | 'gameover';
type CommandMode = 'move' | 'primary' | 'secondary';
type OnboardingStep = 1 | 2 | 3 | 4 | null;

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

export default function XuanjiBreachApp() {
  const initialAutostart = useMemo(() => hasAutostartParam(), []);
  const [meta, setMeta] = useState<XuanjiMetaSave>(() => loadXuanjiMeta());
  const metaRef = useRef<XuanjiMetaSave>(meta);
  metaRef.current = meta;

  const [selectedStartSector, setSelectedStartSector] = useState<number>(0);
  const [screenMode, setScreenMode] = useState<ScreenMode>(() =>
    initialAutostart ? 'playing' : 'title',
  );
  const screenModeRef = useRef<ScreenMode>(screenMode);
  screenModeRef.current = screenMode;

  const [showCodex, setShowCodex] = useState<boolean>(false);
  const showCodexRef = useRef<boolean>(false);
  showCodexRef.current = showCodex;

  const [showTutorial, setShowTutorial] = useState<boolean>(false);
  const showTutorialRef = useRef<boolean>(false);
  showTutorialRef.current = showTutorial;

  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>(null);
  const onboardingStepRef = useRef<OnboardingStep>(onboardingStep);
  onboardingStepRef.current = onboardingStep;

  const [battle, setBattle] = useState<BattleState>(() =>
    createBattleState(
      0,
      [],
      undefined,
      undefined,
      2,
      0,
      false,
      0,
      Date.now() & 0x7fffffff,
      meta.preferredDifficulty,
    ),
  );
  const battleRef = useRef<BattleState>(battle);
  battleRef.current = battle;

  const [selectedUnitUid, setSelectedUnitUid] = useState<string | null>(
    'mech_titan',
  );
  const [commandMode, setCommandMode] = useState<CommandMode>('move');
  const [hoveredTile, setHoveredTile] = useState<GridCoord | null>(null);
  const [hoveredLuopanDir, setHoveredLuopanDir] = useState<
    'cw' | 'ccw' | null
  >(null);
  const [activeHint, setActiveHint] = useState<ActionPreviewResult | null>(
    null,
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<XuanjiIsometricRenderer | null>(null);
  const audioRef = useRef<XuanjiAudioEngine | null>(null);
  const recordedOutcomeKeyRef = useRef<string>('');
  const lastPointerTypeRef = useRef<string>('mouse');

  // Mirror state machine to document.body.dataset.state
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (screenMode === 'title') {
      document.body.dataset.state = 'title';
    } else if (screenMode === 'paused') {
      document.body.dataset.state = 'paused';
    } else if (screenMode === 'gameover') {
      document.body.dataset.state = 'gameover';
    } else {
      document.body.dataset.state = 'playing';
    }
  }, [screenMode]);

  const markTutorialDone = useCallback(() => {
    setOnboardingStep(null);
    setMeta((prev) => {
      if (prev.tutorialCompleted) return prev;
      const next = { ...prev, tutorialCompleted: true };
      saveXuanjiMeta(next);
      return next;
    });
  }, []);

  const handleSelectDifficulty = useCallback((tier: DifficultyTier) => {
    setMeta((prev) => {
      const next = { ...prev, preferredDifficulty: tier };
      saveXuanjiMeta(next);
      return next;
    });
    if (screenModeRef.current === 'title') {
      const preview = createBattleState(
        selectedStartSector,
        [],
        undefined,
        undefined,
        2,
        0,
        false,
        0,
        Date.now() & 0x7fffffff,
        tier,
      );
      battleRef.current = preview;
      setBattle(preview);
    }
    audioRef.current?.playSelect();
  }, [selectedStartSector]);

  const reachableTiles = useMemo(() => {
    if (
      screenMode !== 'playing' ||
      battle.phase !== 'player_turn' ||
      !selectedUnitUid ||
      commandMode !== 'move'
    ) {
      return [];
    }
    return getReachableTiles(battle, selectedUnitUid);
  }, [screenMode, battle, selectedUnitUid, commandMode]);

  const validWeaponTargets = useMemo(() => {
    if (
      screenMode !== 'playing' ||
      battle.phase !== 'player_turn' ||
      !selectedUnitUid ||
      commandMode === 'move'
    ) {
      return [];
    }
    const slot: WeaponSlotKey =
      commandMode === 'primary' ? 'primary' : 'secondary';
    return getValidWeaponTargets(battle, selectedUnitUid, slot);
  }, [screenMode, battle, selectedUnitUid, commandMode]);

  const livePreviewResult = useMemo<ActionPreviewResult | null>(() => {
    if (screenMode !== 'playing' || battle.phase !== 'player_turn') {
      return null;
    }
    if (hoveredLuopanDir !== null && battle.luopanCharges > 0) {
      return simulateActionPreview(battle, {
        kind: 'luopan_rotate',
        clockwise: hoveredLuopanDir === 'cw',
      });
    }
    if (!hoveredTile || !selectedUnitUid) return null;

    if (commandMode === 'move') {
      if (reachableTiles.some((t) => coordsEqual(t, hoveredTile))) {
        return simulateActionPreview(battle, {
          kind: 'move',
          unitUid: selectedUnitUid,
          to: hoveredTile,
        });
      }
      return null;
    }

    const slot: WeaponSlotKey =
      commandMode === 'primary' ? 'primary' : 'secondary';
    if (validWeaponTargets.some((t) => coordsEqual(t, hoveredTile))) {
      return simulateActionPreview(battle, {
        kind: 'weapon',
        unitUid: selectedUnitUid,
        slot,
        target: hoveredTile,
      });
    }
    return null;
  }, [
    screenMode,
    battle,
    hoveredLuopanDir,
    hoveredTile,
    selectedUnitUid,
    commandMode,
    reachableTiles,
    validWeaponTargets,
  ]);

  const tutorialSpotlightCoord = useMemo<GridCoord | null>(() => {
    if (screenMode !== 'playing' || !onboardingStep) return null;
    if (onboardingStep === 1) {
      const ringEnemy = battle.units.find(
        (u) => u.team === 'enemy' && u.hp > 0 && isLuopanRingTile(u.r, u.c),
      );
      return ringEnemy ? { r: ringEnemy.r, c: ringEnemy.c } : { r: 2, c: 3 };
    }
    if (onboardingStep === 2 && reachableTiles.length > 0) {
      // Spotlight a reachable tile closer to center/enemies
      const best =
        reachableTiles.find((c) => isLuopanRingTile(c.r, c.c)) ??
        reachableTiles[0];
      return best;
    }
    if (onboardingStep === 3 && validWeaponTargets.length > 0) {
      const enemyTarget = validWeaponTargets.find((coord) => {
        const u = getUnitAt(battle, coord.r, coord.c);
        return u && u.team === 'enemy';
      });
      return enemyTarget ?? validWeaponTargets[0];
    }
    return null;
  }, [
    screenMode,
    onboardingStep,
    battle,
    reachableTiles,
    validWeaponTargets,
  ]);

  const renderOptionsRef = useRef({
    isTitleTour: screenMode === 'title',
    selectedUnitUid,
    hoveredTile,
    reachableTiles,
    validWeaponTargets,
    previewResult: livePreviewResult,
    hintPreview: activeHint,
    tutorialSpotlightCoord,
  });
  renderOptionsRef.current = {
    isTitleTour: screenMode === 'title',
    selectedUnitUid,
    hoveredTile,
    reachableTiles,
    validWeaponTargets,
    previewResult: livePreviewResult,
    hintPreview: activeHint,
    tutorialSpotlightCoord,
  };

  // Single-mount Canvas & Web Audio lifecycle
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new XuanjiIsometricRenderer(canvas);
    rendererRef.current = renderer;

    const audio = new XuanjiAudioEngine(metaRef.current.muted);
    audioRef.current = audio;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          renderer.resize(width, height);
        }
      }
    });
    ro.observe(canvas);

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
    let lastTime = performance.now();

    const scheduleNext = () => {
      if (disposed) return;
      if (isSoftwareRenderer) {
        afterDrawTimerId = window.setTimeout(() => {
          if (!disposed) loop(performance.now());
        }, 70);
      } else {
        rafId = window.requestAnimationFrame(loop);
      }
    };

    const loop = (now: number) => {
      if (disposed) return;
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      renderer.stepAndRender(dt, battleRef.current, renderOptionsRef.current);
      scheduleNext();
    };
    loop(performance.now());

    return () => {
      disposed = true;
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(afterDrawTimerId);
      ro.disconnect();
      audio.dispose();
      rendererRef.current = null;
      audioRef.current = null;
      if (typeof document !== 'undefined') {
        delete document.body.dataset.state;
      }
    };
  }, []);

  const commitBattleUpdate = useCallback((next: BattleState) => {
    battleRef.current = next;
    setBattle(next);
    if (next.lastFxEvents.length > 0) {
      rendererRef.current?.emitVisualFxEvents(next.lastFxEvents);
    }

    if (next.phase === 'defeat') {
      audioRef.current?.playDefeatSting();
      const key = `defeat_${next.seed}_${next.sectorIndex}_${next.turn}`;
      if (recordedOutcomeKeyRef.current !== key) {
        recordedOutcomeKeyRef.current = key;
        setMeta((prev) =>
          recordXuanjiRunOutcome(
            prev,
            next.score,
            next.sectorIndex,
            next.chainKills,
            false,
          ),
        );
      }
      setScreenMode('gameover');
    } else if (next.phase === 'victory') {
      audioRef.current?.playVictoryFanfare();
      const reachedNext = Math.min(SECTORS.length - 1, next.sectorIndex + 1);
      const wonFullCampaign = !next.isEndless && next.sectorIndex >= SECTORS.length - 1;
      const key = `win_${next.seed}_${next.sectorIndex}_${next.endlessLoop}`;
      if (recordedOutcomeKeyRef.current !== key) {
        recordedOutcomeKeyRef.current = key;
        setMeta((prev) =>
          recordXuanjiRunOutcome(
            prev,
            next.score,
            reachedNext,
            next.chainKills,
            wonFullCampaign,
          ),
        );
      }
      if (wonFullCampaign) {
        setScreenMode('gameover');
      } else {
        setScreenMode('forge');
      }
    }
  }, []);

  const handleStartCampaign = useCallback(
    (
      sectorIdx = selectedStartSector,
      endless = false,
      forceOnboarding = false,
    ) => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      const tier = metaRef.current.preferredDifficulty;
      const fresh = createBattleState(
        sectorIdx,
        [],
        undefined,
        undefined,
        2,
        0,
        endless,
        0,
        Date.now() & 0x7fffffff,
        tier,
      );
      battleRef.current = fresh;
      setBattle(fresh);
      setSelectedUnitUid('mech_titan');
      setCommandMode('move');
      setHoveredTile(null);
      setHoveredLuopanDir(null);
      setActiveHint(null);
      setShowTutorial(false);
      if (
        forceOnboarding ||
        (!metaRef.current.tutorialCompleted &&
          !initialAutostart &&
          sectorIdx === 0 &&
          !endless)
      ) {
        setOnboardingStep(1);
      } else {
        setOnboardingStep(null);
      }
      setScreenMode('playing');
      audioRef.current?.playSelect();
    },
    [selectedStartSector, initialAutostart],
  );

  const handleExecuteTacticalAction = useCallback(
    (action: TacticalAction) => {
      const next = cloneBattleState(battleRef.current);
      const ok = executeTacticalActionInPlace(next, action);
      if (!ok) return;

      setActiveHint(null);
      setHoveredLuopanDir(null);
      setHoveredTile(null);

      if (action.kind === 'move') {
        audioRef.current?.playMoveStep();
        setCommandMode('primary');
        if (onboardingStepRef.current === 2) {
          setOnboardingStep(3);
        }
      } else if (action.kind === 'luopan_rotate') {
        audioRef.current?.playLuopanRotate();
        if (onboardingStepRef.current === 1) {
          setOnboardingStep(2);
        }
      } else if (action.kind === 'weapon') {
        const unit = getUnitById(next, action.unitUid);
        if (unit?.mechId === 'arbalest' && action.slot === 'secondary') {
          audioRef.current?.playLightningArc();
        } else if (unit?.mechId === 'geomancer' && action.slot === 'secondary') {
          audioRef.current?.playShieldChime();
        } else {
          audioRef.current?.playHeavyImpact();
        }
        if (onboardingStepRef.current === 3) {
          setOnboardingStep(4);
        }
        // Auto-select next available player mech that hasn't acted yet
        const nextReadyMech = next.units.find(
          (u) => u.team === 'player' && u.hp > 0 && !u.hasActed,
        );
        if (nextReadyMech) {
          setSelectedUnitUid(nextReadyMech.uid);
          setCommandMode(nextReadyMech.hasMoved ? 'primary' : 'move');
        }
      }

      commitBattleUpdate(next);
    },
    [commitBattleUpdate],
  );

  const handleEndTurn = useCallback(() => {
    if (
      screenModeRef.current !== 'playing' ||
      battleRef.current.phase !== 'player_turn'
    ) {
      return;
    }
    if (onboardingStepRef.current !== null) {
      markTutorialDone();
    }
    const next = cloneBattleState(battleRef.current);
    resolveEndTurn(next);
    audioRef.current?.playHeavyImpact();
    setActiveHint(null);
    setHoveredLuopanDir(null);
    setHoveredTile(null);

    const firstMech = next.units.find((u) => u.team === 'player' && u.hp > 0);
    if (firstMech) {
      setSelectedUnitUid(firstMech.uid);
      setCommandMode('move');
    }
    commitBattleUpdate(next);
  }, [commitBattleUpdate, markTutorialDone]);

  const handleUndoMove = useCallback(() => {
    if (!selectedUnitUid) return;
    const next = cloneBattleState(battleRef.current);
    if (undoUnitMove(next, selectedUnitUid)) {
      audioRef.current?.playSelect();
      setCommandMode('move');
      setActiveHint(null);
      setHoveredTile(null);
      commitBattleUpdate(next);
    }
  }, [selectedUnitUid, commitBattleUpdate]);

  const handleTemporalReset = useCallback(() => {
    const restored = resetCurrentTurn(battleRef.current);
    if (!restored) return;
    audioRef.current?.playLuopanRotate();
    setActiveHint(null);
    setHoveredTile(null);
    setSelectedUnitUid('mech_titan');
    setCommandMode('move');
    commitBattleUpdate(restored);
  }, [commitBattleUpdate]);

  const handleTriggerHint = useCallback(() => {
    const rec = findBestTacticalAction(battleRef.current);
    setActiveHint(rec);
    if (rec) {
      audioRef.current?.playSelect();
      if (rec.action.kind === 'weapon' || rec.action.kind === 'move') {
        setSelectedUnitUid(rec.action.unitUid);
      }
    }
  }, []);

  const handlePerformOnboardingDemoStep = useCallback(() => {
    const step = onboardingStepRef.current;
    const cur = battleRef.current;
    if (!step || cur.phase !== 'player_turn') return;

    if (step === 1) {
      if (cur.luopanCharges > 0) {
        handleExecuteTacticalAction({ kind: 'luopan_rotate', clockwise: true });
      } else {
        setOnboardingStep(2);
      }
      return;
    }

    if (step === 2) {
      const uid = selectedUnitUid ?? 'mech_titan';
      const tiles = getReachableTiles(cur, uid);
      if (tiles.length > 0) {
        const dest = tiles.find((c) => isLuopanRingTile(c.r, c.c)) ?? tiles[0];
        handleExecuteTacticalAction({ kind: 'move', unitUid: uid, to: dest });
      } else {
        setOnboardingStep(3);
      }
      return;
    }

    if (step === 3) {
      const rec = findBestTacticalAction(cur);
      if (rec && rec.action.kind === 'weapon') {
        handleExecuteTacticalAction(rec.action);
        return;
      }
      // Fallback: find any mech with a valid primary/secondary target on an enemy
      for (const mechId of MECH_ORDER) {
        const u = getUnitById(cur, `mech_${mechId}`);
        if (!u || u.hp <= 0 || u.hasActed) continue;
        const pTargets = getValidWeaponTargets(cur, u.uid, 'primary');
        const enemyTarget = pTargets.find((coord) => {
          const hit = getUnitAt(cur, coord.r, coord.c);
          return hit && hit.team === 'enemy';
        });
        if (enemyTarget) {
          handleExecuteTacticalAction({
            kind: 'weapon',
            unitUid: u.uid,
            slot: 'primary',
            target: enemyTarget,
          });
          return;
        }
      }
      setOnboardingStep(4);
      return;
    }

    if (step === 4) {
      handleEndTurn();
    }
  }, [selectedUnitUid, handleExecuteTacticalAction, handleEndTurn]);

  const handleToggleMute = useCallback(() => {
    setMeta((prev) => {
      const next = { ...prev, muted: !prev.muted };
      saveXuanjiMeta(next);
      audioRef.current?.setMuted(next.muted);
      return next;
    });
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showTutorialRef.current) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowTutorial(false);
        }
        return;
      }

      if (showCodexRef.current) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowCodex(false);
        }
        return;
      }

      if (screenModeRef.current === 'title') {
        if (e.key === 'Enter' || e.key === ' ') {
          const activeTag = document.activeElement?.tagName;
          if (activeTag !== 'BUTTON') {
            e.preventDefault();
            handleStartCampaign(selectedStartSector, false);
          }
        }
        return;
      }

      if (e.key === 'Escape' || e.key.toLowerCase() === 'p') {
        if (
          screenModeRef.current === 'playing' ||
          screenModeRef.current === 'paused'
        ) {
          e.preventDefault();
          setScreenMode((prev) => (prev === 'playing' ? 'paused' : 'playing'));
          return;
        }
      }

      if (screenModeRef.current !== 'playing') return;

      const key = e.key.toLowerCase();
      if (key === '1' || key === '2' || key === '3') {
        const idx = Number(key) - 1;
        const mechId = MECH_ORDER[idx];
        const unit = getUnitById(battleRef.current, `mech_${mechId}`);
        if (unit && unit.hp > 0) {
          setSelectedUnitUid(unit.uid);
          setCommandMode(unit.hasMoved ? 'primary' : 'move');
          setHoveredTile(null);
          audioRef.current?.playSelect();
        }
      } else if (key === 'q') {
        setCommandMode('primary');
        setHoveredTile(null);
        audioRef.current?.playSelect();
      } else if (key === 'e') {
        setCommandMode('secondary');
        setHoveredTile(null);
        audioRef.current?.playSelect();
      } else if (key === 'w') {
        setCommandMode('move');
        setHoveredTile(null);
        audioRef.current?.playSelect();
      } else if (key === 'z') {
        handleUndoMove();
      } else if (key === 'r') {
        handleExecuteTacticalAction({
          kind: 'luopan_rotate',
          clockwise: true,
        });
      } else if (key === 't') {
        handleExecuteTacticalAction({
          kind: 'luopan_rotate',
          clockwise: false,
        });
      } else if (key === 'h') {
        handleTriggerHint();
      } else if (key === 'g') {
        setShowCodex(true);
      } else if (key === 'm') {
        handleToggleMute();
      } else if (e.key === ' ' || e.key === 'Enter') {
        const activeTag = document.activeElement?.tagName;
        if (activeTag !== 'BUTTON') {
          e.preventDefault();
          handleEndTurn();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    selectedStartSector,
    handleStartCampaign,
    handleUndoMove,
    handleExecuteTacticalAction,
    handleTriggerHint,
    handleToggleMute,
    handleEndTurn,
  ]);

  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      lastPointerTypeRef.current = e.pointerType || 'mouse';
    },
    [],
  );

  const handleCanvasPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      if (screenMode !== 'playing' || !rendererRef.current) return;
      const coord = rendererRef.current.screenToTile(
        e.clientX,
        e.clientY,
        battleRef.current,
      );
      setHoveredTile((prev) => {
        if (!coord && !prev) return null;
        if (coord && prev && coordsEqual(coord, prev)) return prev;
        return coord;
      });
    },
    [screenMode],
  );

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (
        screenMode !== 'playing' ||
        battle.phase !== 'player_turn' ||
        !rendererRef.current
      ) {
        return;
      }
      const coord = rendererRef.current.screenToTile(
        e.clientX,
        e.clientY,
        battle,
      );
      if (!coord) return;

      const isTouchPointer = lastPointerTypeRef.current !== 'mouse';

      // 1. If in primary/secondary weapon mode and clicked/tapped a valid target
      if (
        selectedUnitUid &&
        commandMode !== 'move' &&
        validWeaponTargets.some((t) => coordsEqual(t, coord))
      ) {
        if (isTouchPointer && (!hoveredTile || !coordsEqual(hoveredTile, coord))) {
          setHoveredTile(coord);
          audioRef.current?.playSelect();
          return;
        }
        handleExecuteTacticalAction({
          kind: 'weapon',
          unitUid: selectedUnitUid,
          slot: commandMode === 'primary' ? 'primary' : 'secondary',
          target: coord,
        });
        return;
      }

      // 2. If in move mode and clicked/tapped a reachable tile
      if (
        selectedUnitUid &&
        commandMode === 'move' &&
        reachableTiles.some((t) => coordsEqual(t, coord))
      ) {
        if (isTouchPointer && (!hoveredTile || !coordsEqual(hoveredTile, coord))) {
          setHoveredTile(coord);
          audioRef.current?.playSelect();
          return;
        }
        handleExecuteTacticalAction({
          kind: 'move',
          unitUid: selectedUnitUid,
          to: coord,
        });
        return;
      }

      // 3. Otherwise, if clicked on a friendly Mech, select it; on touch, also allow inspecting any tile
      const clickedUnit = getUnitAt(battle, coord.r, coord.c);
      if (clickedUnit && clickedUnit.team === 'player') {
        setSelectedUnitUid(clickedUnit.uid);
        setCommandMode(clickedUnit.hasMoved ? 'primary' : 'move');
        setHoveredTile(null);
        audioRef.current?.playSelect();
      } else if (isTouchPointer) {
        setHoveredTile(coord);
      }
    },
    [
      screenMode,
      battle,
      selectedUnitUid,
      commandMode,
      validWeaponTargets,
      reachableTiles,
      hoveredTile,
      handleExecuteTacticalAction,
    ],
  );

  const selectedUnit = useMemo(
    () => (selectedUnitUid ? getUnitById(battle, selectedUnitUid) : undefined),
    [battle, selectedUnitUid],
  );

  const inspectedTileInfo = useMemo(() => {
    const coord =
      hoveredTile ??
      (selectedUnit ? { r: selectedUnit.r, c: selectedUnit.c } : null);
    if (!coord) return null;
    const tile = getTile(battle, coord.r, coord.c);
    const unit = getUnitAt(battle, coord.r, coord.c);
    return { coord, tile, unit };
  }, [battle, hoveredTile, selectedUnit]);

  const threatenedCitadelCount = useMemo(
    () => getThreatenedCitadels(battle).length,
    [battle],
  );

  const activeSector = SECTORS[battle.sectorIndex % SECTORS.length];
  const activeDifficultyDef = DIFFICULTY_DEFS[battle.difficulty];
  const displayPreview = livePreviewResult ?? activeHint;

  const onboardingCopy = useMemo(() => {
    if (!onboardingStep) return null;
    if (onboardingStep === 1) {
      return {
        badge: '实战带教 1/4 · 璇玑移星',
        instruction:
          '金色圆环标出的荒兽正锁定我方灵脉城池！点击下方「顺旋」将中央 3×3 青铜璇玑环连同敌军弹道偏转 90°，瞬间化解城池危机。',
        ctaLabel: '示范顺旋',
      };
    }
    if (onboardingStep === 2) {
      return {
        badge: '实战带教 2/4 · 机动走位',
        instruction:
          '城池已转危为安！点击沙盘上的青绿高亮格移动「镇岳」（触屏设备首次轻点预演落点，再次轻点或点「确认执行」落子）。',
        ctaLabel: '示范走位',
      };
    }
    if (onboardingStep === 3) {
      return {
        badge: '实战带教 3/4 · 奇门撞击',
        instruction:
          '移动后已切入主武器！瞄准橙红靶格出击，或点右上「司南推演」一键查看击退坠渊与撞击连锁的最优妙手。',
        ctaLabel: '示范攻击',
      };
    }
    return {
      badge: '实战带教 4/4 · 结算借刀',
      instruction:
        '本回合部署妥当！点击右下角「结束回合」观看偏转后的荒兽空放或自相残杀；坚守完 4 回合即可破阵获胜。',
      ctaLabel: '结束首回合',
    };
  }, [onboardingStep]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#12100E] text-[#F7F3E8] select-none">
      {/* Isolated Full-Viewport Isometric Canvas */}
      <canvas
        ref={canvasRef}
        data-testid="xuanji-canvas"
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') setHoveredTile(null);
        }}
        onClick={handleCanvasClick}
        className="block w-full h-full cursor-pointer touch-manipulation"
      />

      {/* ==================== 1. TITLE SCREEN OVERLAY ==================== */}
      {screenMode === 'title' && (
        <div className="fixed inset-0 top-11 z-30 pointer-events-none flex flex-col justify-between p-4 sm:p-10 overflow-y-auto bg-gradient-to-b sm:bg-gradient-to-r from-[#0E0C0A]/95 via-[#12100E]/82 to-transparent">
          <div className="max-w-xl pointer-events-auto space-y-4 sm:space-y-5 my-auto">
            <div className="flex items-center gap-3.5 sm:gap-4">
              <XuanjiBreachEmblemSvg className="w-14 h-14 sm:w-20 sm:h-20 shrink-0" />
              <div>
                <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-[#FEF3C7]">
                  璇玑破阵
                </h1>
                <p className="text-xs sm:text-base font-medium text-[#D97706] mt-0.5 sm:mt-1">
                  青铜罗盘移星 · 全明牌立体沙盘战棋
                </p>
              </div>
            </div>

            <p className="text-xs sm:text-sm leading-relaxed text-[#D6D0C4] max-w-lg">
              率领「镇岳、惊鸿、天工」三尊青铜神机镇守九州灵脉。荒兽每回合明牌锁定弹道，善用击退撞击、水脉连电与中央 3×3「青铜璇玑环」90° 旋转，令群敌坠入深渊或自相残杀。
            </p>

            {/* Difficulty Tier Selector */}
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-[#A8A29E]">
                推演难度（随时可调，默认推荐「破阵·标准」）
              </div>
              <div
                role="group"
                aria-label="选择推演难度"
                className="grid grid-cols-3 gap-2"
              >
                {DIFFICULTY_ORDER.map((tier) => {
                  const def = DIFFICULTY_DEFS[tier];
                  const active = meta.preferredDifficulty === tier;
                  return (
                    <button
                      key={tier}
                      type="button"
                      data-testid={`xuanji-diff-${tier}`}
                      aria-pressed={active}
                      onClick={() => handleSelectDifficulty(tier)}
                      className={`p-2 sm:p-2.5 rounded text-left border transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#2E2318] border-[#F59E0B] text-[#FEF3C7]'
                          : 'bg-[#1C1814] hover:bg-[#26201A] border-[#44382C] text-[#D6D0C4]'
                      }`}
                    >
                      <div className="text-xs font-bold">{def.label}</div>
                      <div className="text-[11px] text-[#A8A29E] mt-0.5 truncate">
                        {def.shortTag}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sector Selector */}
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-[#A8A29E]">
                出征战区（已解锁第 {meta.highestSectorReached + 1} 战区 · 最高 {meta.bestScore} 分）
              </div>
              <div
                role="group"
                aria-label="选择出征战区"
                className="grid grid-cols-3 gap-2"
              >
                {SECTORS.map((sec, idx) => {
                  const locked = idx > meta.highestSectorReached;
                  const active = selectedStartSector === idx;
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      disabled={locked}
                      aria-pressed={active}
                      onClick={() => setSelectedStartSector(idx)}
                      className={`p-2 sm:p-3 rounded text-left border transition-colors cursor-pointer disabled:cursor-not-allowed ${
                        active
                          ? 'bg-[#2E2318] border-[#F59E0B] text-[#FEF3C7]'
                          : locked
                            ? 'bg-[#171411] border-[#2E2720] text-[#57534E]'
                            : 'bg-[#1C1814] hover:bg-[#26201A] border-[#44382C] text-[#D6D0C4]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold truncate">
                          {sec.name}
                        </span>
                        {locked && <Lock className="w-3.5 h-3.5 shrink-0" />}
                      </div>
                      <div className="text-[11px] text-[#A8A29E] mt-0.5 truncate">
                        {sec.subtitle}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Primary CTAs (<= 3 actions) */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                data-start="true"
                data-testid="start-xuanji-btn"
                onClick={() => handleStartCampaign(selectedStartSector, false)}
                className="inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 rounded bg-[#D97706] hover:bg-[#B45309] text-sm font-bold text-white transition-colors cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>开始破阵</span>
              </button>

              <button
                type="button"
                data-testid="open-xuanji-tutorial-btn"
                onClick={() => setShowTutorial(true)}
                className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2.5 sm:py-3 rounded bg-[#211C17] hover:bg-[#2E261F] border border-[#6B563E] text-sm font-semibold text-[#FDE68A] transition-colors cursor-pointer"
              >
                <HelpCircle className="w-4 h-4 text-[#F59E0B]" />
                <span>新手教学</span>
              </button>

              <button
                type="button"
                onClick={() => setShowCodex(true)}
                className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2.5 sm:py-3 rounded bg-[#211C17] hover:bg-[#2E261F] border border-[#5C4D3C] text-sm font-semibold text-[#E7E0D0] transition-colors cursor-pointer"
              >
                <BookOpen className="w-4 h-4" />
                <span>兵法典籍</span>
              </button>
            </div>
          </div>

          {/* Flat Borderless Single-Line Control Hint in Bottom Margin */}
          <div className="text-[11px] sm:text-xs text-[#A8A29E] tracking-wide pt-2">
            桌面键鼠悬停即刻预演，触屏首次轻点预演、二次轻点确认 · [R/T] 旋转璇玑环 · [H] 司南妙手提示
          </div>
        </div>
      )}

      {/* ==================== 2. PLAYING HUD ==================== */}
      {screenMode !== 'title' && (
        <div className="fixed inset-0 top-11 z-20 pointer-events-none flex flex-col justify-between p-2 sm:p-4">
          {/* Top Stack: Tactical Bar + Optional Onboarding Coach + Consequence Banner */}
          <div className="space-y-1.5 sm:space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              {/* Left: Sector, Difficulty, Turn & Leyline Power Grid */}
              <div className="pointer-events-auto flex flex-wrap items-center gap-2.5 sm:gap-4 px-2.5 sm:px-4 py-1.5 sm:py-2.5 rounded bg-[#181411]/95 border border-[#5C4D3C]">
                <div>
                  <div className="text-[11px] font-semibold text-[#A8A29E]">
                    {battle.isEndless
                      ? `无尽推演 · 第 ${battle.endlessLoop + 1} 轮`
                      : `${activeSector.name} · ${activeDifficultyDef.label}`}
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5">
                    <span className="text-sm sm:text-base font-bold font-mono-num text-[#FEF3C7]">
                      回合 {battle.turn}/{battle.maxTurns}
                    </span>
                    <span className="text-xs text-[#A8A29E]">·</span>
                    <span className="text-xs font-mono-num text-[#FBBF24]">
                      星铁 {battle.starIron}
                    </span>
                    <span className="hidden sm:inline text-xs text-[#A8A29E]">
                      ·
                    </span>
                    <span className="hidden sm:inline text-xs font-mono-num text-[#34D399]">
                      得分 {battle.score}
                    </span>
                  </div>
                </div>

                <div className="h-6 sm:h-7 w-px bg-[#382E26]" />

                {/* Leyline Grid Power Pips */}
                <div>
                  <div className="flex items-center justify-between gap-1.5 text-[10px] sm:text-[11px] text-[#A8A29E] mb-0.5 sm:mb-1">
                    <span>灵脉电力</span>
                    <span className="font-mono-num font-bold text-[#FDE68A]">
                      {battle.gridPower}/{battle.maxGridPower}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5 sm:gap-1">
                    {Array.from({ length: battle.maxGridPower }).map(
                      (_, idx) => {
                        let pipState: 'full' | 'threatened' | 'empty' = 'empty';
                        if (idx < battle.gridPower) {
                          pipState =
                            idx >= battle.gridPower - threatenedCitadelCount
                              ? 'threatened'
                              : 'full';
                        }
                        return <GridPowerPipSvg key={idx} state={pipState} />;
                      },
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Compact Utility Controls */}
              <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5">
                <button
                  type="button"
                  tabIndex={-1}
                  data-testid="tactical-hint-btn"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    handleTriggerHint();
                  }}
                  title="司南推演提示 [H]"
                  className="inline-flex items-center gap-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded bg-[#1F1A15]/95 hover:bg-[#2E261E] border border-[#6B563E] text-xs font-semibold text-[#FDE68A] cursor-pointer"
                >
                  <Compass className="w-3.5 h-3.5 text-[#F59E0B]" />
                  <span>
                    司南<span className="hidden sm:inline">推演 [H]</span>
                  </span>
                </button>

                <button
                  type="button"
                  tabIndex={-1}
                  disabled={battle.resetsRemaining <= 0}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    handleTemporalReset();
                  }}
                  title="回溯本回合初"
                  className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1.5 sm:py-2 rounded bg-[#1F1A15]/95 hover:bg-[#2E261E] disabled:opacity-40 border border-[#5C4D3C] text-xs font-medium text-[#E7E0D0] cursor-pointer disabled:cursor-not-allowed"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>({battle.resetsRemaining})</span>
                </button>

                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    setShowTutorial(true);
                  }}
                  aria-label="打开新手指引"
                  title="新手指引"
                  className="p-1.5 sm:p-2 rounded bg-[#1F1A15]/95 hover:bg-[#2E261E] border border-[#5C4D3C] text-[#FDE68A] cursor-pointer"
                >
                  <HelpCircle className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    setShowCodex(true);
                  }}
                  aria-label="打开兵法典籍"
                  title="兵法典籍 [G]"
                  className="p-1.5 sm:p-2 rounded bg-[#1F1A15]/95 hover:bg-[#2E261E] border border-[#5C4D3C] text-[#E7E0D0] cursor-pointer"
                >
                  <BookOpen className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    handleToggleMute();
                  }}
                  aria-label={meta.muted ? '取消静音' : '静音'}
                  title="静音切换 [M]"
                  className="hidden sm:inline-flex p-2 rounded bg-[#1F1A15]/95 hover:bg-[#2E261E] border border-[#5C4D3C] text-[#E7E0D0] cursor-pointer"
                >
                  {meta.muted ? (
                    <VolumeX className="w-4 h-4 text-[#EF4444]" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>

                <button
                  type="button"
                  tabIndex={-1}
                  data-testid="pause-xuanji-btn"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    setScreenMode('paused');
                  }}
                  aria-label="暂停游戏"
                  title="暂停 [P]"
                  className="p-1.5 sm:p-2 rounded bg-[#1F1A15]/95 hover:bg-[#2E261E] border border-[#5C4D3C] text-[#E7E0D0] cursor-pointer"
                >
                  <Pause className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Interactive 4-Step Live Onboarding Coach Bar */}
            {onboardingCopy && (
              <div
                data-testid="xuanji-onboarding-bar"
                className="pointer-events-auto max-w-2xl px-3 py-2 rounded bg-[#231B12]/96 border border-[#F59E0B] flex flex-wrap sm:flex-nowrap items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-[#FBBF24]">
                    {onboardingCopy.badge}
                  </div>
                  <div className="text-xs text-[#F7F3E8] leading-snug mt-0.5">
                    {onboardingCopy.instruction}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    data-testid="onboarding-demo-btn"
                    onClick={handlePerformOnboardingDemoStep}
                    className="px-2.5 py-1.5 rounded bg-[#D97706] hover:bg-[#B45309] text-xs font-bold text-white cursor-pointer whitespace-nowrap"
                  >
                    {onboardingCopy.ctaLabel}
                  </button>
                  <button
                    type="button"
                    data-testid="onboarding-skip-btn"
                    onClick={markTutorialDone}
                    className="px-2 py-1.5 rounded bg-[#1C1814] hover:bg-[#29221B] border border-[#5C4D3C] text-[11px] text-[#A8A29E] hover:text-[#F7F3E8] cursor-pointer whitespace-nowrap"
                  >
                    跳过
                  </button>
                </div>
              </div>
            )}

            {/* Consequence Preview / Touch Confirm / Tactical Advisor Banner */}
            {displayPreview && displayPreview.valid && (
              <div
                data-testid="xuanji-preview-banner"
                className="pointer-events-auto max-w-xl px-3 py-2 rounded bg-[#1C1612]/95 border border-[#F59E0B] flex items-center justify-between gap-2.5"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#FDE68A] truncate">
                    {activeHint && !livePreviewResult
                      ? `司南妙手推荐：${displayPreview.summaryTitle}`
                      : displayPreview.summaryTitle}
                  </div>
                  <div className="text-[11px] text-[#D6D0C4] leading-snug">
                    {displayPreview.summaryDetail}
                  </div>
                </div>

                {livePreviewResult && hoveredTile && (
                  <button
                    type="button"
                    data-testid="confirm-preview-action-btn"
                    onClick={() =>
                      handleExecuteTacticalAction(livePreviewResult.action)
                    }
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-[#10B981] hover:bg-[#059669] text-xs font-bold text-[#052E16] cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>确认执行</span>
                  </button>
                )}

                {activeHint && !livePreviewResult && (
                  <button
                    type="button"
                    data-testid="execute-hint-btn"
                    onClick={() =>
                      handleExecuteTacticalAction(activeHint.action)
                    }
                    className="px-3 py-1.5 rounded bg-[#10B981] hover:bg-[#059669] text-xs font-bold text-[#052E16] cursor-pointer whitespace-nowrap shrink-0"
                  >
                    执行此妙手
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Middle Right: Compact Tile / Unit Inspector (Desktop & Tablet only to keep phone board clean) */}
          {inspectedTileInfo && inspectedTileInfo.tile && (
            <div className="hidden md:block self-end pointer-events-none max-w-xs px-3.5 py-2.5 rounded bg-[#161310]/92 border border-[#44382C] text-xs space-y-1">
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold text-[#FEF3C7]">
                  {TERRAIN_META[inspectedTileInfo.tile.terrain]?.name ?? '方砖'}{' '}
                  ({inspectedTileInfo.coord.r + 1},
                  {inspectedTileInfo.coord.c + 1})
                </span>
                {inspectedTileInfo.tile.isLuopanRing && (
                  <span className="text-[11px] text-[#F59E0B]">璇玑旋转环</span>
                )}
              </div>
              {inspectedTileInfo.unit ? (
                <div className="pt-1 border-t border-[#2E261F]">
                  <div className="font-semibold text-[#FDE68A]">
                    {inspectedTileInfo.unit.name} · HP {inspectedTileInfo.unit.hp}
                    /{inspectedTileInfo.unit.maxHp}
                  </div>
                  {inspectedTileInfo.unit.enemyId && (
                    <div className="text-[11px] text-[#A8A29E] mt-0.5">
                      {ENEMY_DEFS[inspectedTileInfo.unit.enemyId].attackDesc}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[11px] text-[#A8A29E]">
                  {TERRAIN_META[inspectedTileInfo.tile.terrain]?.desc}
                </div>
              )}
            </div>
          )}

          {/* Bottom Unified Command Dock (Responsive for 390px mobile & 1440px desktop) */}
          <div className="pointer-events-auto w-full max-w-7xl mx-auto rounded-lg bg-[#161310]/96 border border-[#5C4D3C] px-2 sm:px-3 py-2 sm:py-2.5 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-1.5 sm:gap-2.5">
            {/* Zone 1: 3 Mech Squad Selectors */}
            <div className="grid grid-cols-3 sm:flex sm:items-center gap-1 sm:gap-1.5 shrink-0">
              {MECH_ORDER.map((mechId, idx) => {
                const unit = getUnitById(battle, `mech_${mechId}`);
                if (!unit) return null;
                const isSelected = selectedUnitUid === unit.uid;
                return (
                  <button
                    key={unit.uid}
                    type="button"
                    data-testid={`select-mech-${mechId}`}
                    onClick={() => {
                      setSelectedUnitUid(unit.uid);
                      setCommandMode(unit.hasMoved ? 'primary' : 'move');
                      setHoveredTile(null);
                      audioRef.current?.playSelect();
                    }}
                    className={`px-2 sm:px-2.5 py-1.5 rounded border text-left transition-colors cursor-pointer flex items-center gap-1.5 sm:gap-2 min-w-0 ${
                      isSelected
                        ? 'bg-[#292118] border-[#10B981] text-[#FEF3C7]'
                        : 'bg-[#1C1814] hover:bg-[#241E19] border-[#382E26] text-[#D6D0C4]'
                    }`}
                  >
                    <MechClassIconSvg
                      mechId={mechId}
                      className="w-4 h-4 sm:w-5 sm:h-5 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 text-[11px] sm:text-xs font-bold truncate">
                        <span className="truncate">
                          <span className="hidden sm:inline">[{idx + 1}] </span>
                          {MECH_DEFS[mechId].name.split(' · ')[0]}
                        </span>
                        {unit.hasActed && (
                          <span className="text-[10px] font-normal text-[#78716C]">
                            毕
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] sm:text-[11px] font-mono-num text-[#A8A29E] truncate">
                        HP {unit.hp}/{unit.maxHp}
                        {unit.shielded ? '·盾' : ''}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Zone 2: Selected Mech Weapons & Undo */}
            {selectedUnit && selectedUnit.mechId && (
              <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 overflow-x-auto">
                <button
                  type="button"
                  disabled={selectedUnit.hasMoved || selectedUnit.hasActed}
                  onClick={() => {
                    setCommandMode('move');
                    setHoveredTile(null);
                  }}
                  className={`flex-1 sm:flex-none px-2 sm:px-2.5 py-1.5 rounded border text-left transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
                    commandMode === 'move'
                      ? 'bg-[#112A26] border-[#10B981] text-[#A7F3D0]'
                      : 'bg-[#1C1814] border-[#44382C] text-[#D6D0C4]'
                  }`}
                >
                  <div className="text-[11px] sm:text-xs font-bold">
                    <span className="hidden sm:inline">[W] </span>走位
                  </div>
                  <div className="text-[10px] text-[#A8A29E]">
                    射程 {selectedUnit.moveRange} 格
                  </div>
                </button>

                <button
                  type="button"
                  data-testid="weapon-primary-btn"
                  disabled={selectedUnit.hasActed}
                  onClick={() => {
                    setCommandMode('primary');
                    setHoveredTile(null);
                  }}
                  className={`flex-1 sm:flex-none px-2 sm:px-2.5 py-1.5 rounded border text-left transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
                    commandMode === 'primary'
                      ? 'bg-[#2E2113] border-[#F59E0B] text-[#FEF3C7]'
                      : 'bg-[#1C1814] border-[#44382C] text-[#D6D0C4]'
                  }`}
                >
                  <div className="text-[11px] sm:text-xs font-bold">
                    <span className="hidden sm:inline">[Q] </span>
                    {MECH_DEFS[selectedUnit.mechId].primaryWeapon.name}
                  </div>
                  <div className="text-[10px] text-[#A8A29E] truncate">
                    {MECH_DEFS[selectedUnit.mechId].primaryWeapon.shortDesc}
                  </div>
                </button>

                <button
                  type="button"
                  data-testid="weapon-secondary-btn"
                  disabled={
                    selectedUnit.hasActed || selectedUnit.secondaryCooldown > 0
                  }
                  onClick={() => {
                    setCommandMode('secondary');
                    setHoveredTile(null);
                  }}
                  className={`flex-1 sm:flex-none px-2 sm:px-2.5 py-1.5 rounded border text-left transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
                    commandMode === 'secondary'
                      ? 'bg-[#2E2113] border-[#F59E0B] text-[#FEF3C7]'
                      : 'bg-[#1C1814] border-[#44382C] text-[#D6D0C4]'
                  }`}
                >
                  <div className="text-[11px] sm:text-xs font-bold">
                    <span className="hidden sm:inline">[E] </span>
                    {MECH_DEFS[selectedUnit.mechId].secondaryWeapon.name}
                    {selectedUnit.secondaryCooldown > 0
                      ? ` (${selectedUnit.secondaryCooldown})`
                      : ''}
                  </div>
                  <div className="text-[10px] text-[#A8A29E] truncate">
                    {MECH_DEFS[selectedUnit.mechId].secondaryWeapon.shortDesc}
                  </div>
                </button>

                {selectedUnit.hasMoved && !selectedUnit.hasActed && (
                  <button
                    type="button"
                    onClick={handleUndoMove}
                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded bg-[#241E19] hover:bg-[#332A22] border border-[#5C4D3C] text-[11px] sm:text-xs text-[#E7E0D0] cursor-pointer whitespace-nowrap"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>撤回</span>
                  </button>
                )}
              </div>
            )}

            {/* Zone 3: Bronze Luopan Ring Controls & End Turn */}
            <div className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-2 shrink-0">
              <div className="flex items-center gap-1 px-2 py-1 rounded bg-[#231C14] border border-[#6B563E]">
                <span className="text-[11px] font-semibold text-[#FBBF24] mr-0.5 whitespace-nowrap">
                  璇玑({battle.luopanCharges})
                </span>
                <button
                  type="button"
                  data-testid="luopan-cw-btn"
                  disabled={battle.luopanCharges <= 0}
                  onMouseEnter={() => setHoveredLuopanDir('cw')}
                  onMouseLeave={() => setHoveredLuopanDir(null)}
                  onClick={() =>
                    handleExecuteTacticalAction({
                      kind: 'luopan_rotate',
                      clockwise: true,
                    })
                  }
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#3B2D1E] hover:bg-[#523E29] disabled:opacity-40 border border-[#D97706] text-xs font-bold text-[#FEF3C7] cursor-pointer whitespace-nowrap disabled:cursor-not-allowed"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>
                    顺旋<span className="hidden sm:inline"> [R]</span>
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="luopan-ccw-btn"
                  disabled={battle.luopanCharges <= 0}
                  onMouseEnter={() => setHoveredLuopanDir('ccw')}
                  onMouseLeave={() => setHoveredLuopanDir(null)}
                  onClick={() =>
                    handleExecuteTacticalAction({
                      kind: 'luopan_rotate',
                      clockwise: false,
                    })
                  }
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#3B2D1E] hover:bg-[#523E29] disabled:opacity-40 border border-[#D97706] text-xs font-bold text-[#FEF3C7] cursor-pointer whitespace-nowrap disabled:cursor-not-allowed"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>
                    逆旋<span className="hidden sm:inline"> [T]</span>
                  </span>
                </button>
              </div>

              <button
                type="button"
                data-testid="end-turn-btn"
                onClick={handleEndTurn}
                className="px-3 sm:px-3.5 py-2 sm:py-2.5 rounded bg-[#D97706] hover:bg-[#B45309] text-xs font-bold text-white transition-colors cursor-pointer whitespace-nowrap"
              >
                结束回合<span className="hidden sm:inline"> [Space]</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 3. PAUSE MODAL ==================== */}
      {screenMode === 'paused' && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4 pointer-events-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="xuanji-pause-title"
        >
          <div className="w-full max-w-md p-6 rounded-lg bg-[#161310] border border-[#6B563E] text-[#F7F3E8] space-y-5 shadow-2xl">
            <div>
              <h2
                id="xuanji-pause-title"
                className="text-xl font-bold text-[#FEF3C7]"
              >
                沙盘推演已暂停
              </h2>
              <p className="text-xs text-[#A8A29E] mt-1">
                {activeSector.name} · {activeDifficultyDef.label} · 第{' '}
                {battle.turn}/{battle.maxTurns} 回合
              </p>
            </div>

            {battle.relics.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-[#FBBF24]">
                  已装配奇门秘宝：
                </div>
                <div className="space-y-1">
                  {battle.relics.map((rId) => (
                    <div
                      key={rId}
                      className="text-xs text-[#D6D0C4] bg-[#1F1A15] px-3 py-1.5 rounded border border-[#382E26]"
                    >
                      <strong>{RELIC_DEFS[rId].name}</strong>：
                      {RELIC_DEFS[rId].desc}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setScreenMode('playing')}
                className="w-full py-2.5 rounded bg-[#D97706] hover:bg-[#B45309] text-sm font-bold text-white cursor-pointer"
              >
                继续破阵
              </button>
              <button
                type="button"
                onClick={() => {
                  setOnboardingStep(1);
                  setScreenMode('playing');
                }}
                className="w-full py-2.5 rounded bg-[#241E19] hover:bg-[#332A22] border border-[#6B563E] text-sm font-semibold text-[#FDE68A] cursor-pointer"
              >
                开启四步实战带教
              </button>
              <button
                type="button"
                onClick={() =>
                  handleStartCampaign(battle.sectorIndex, battle.isEndless)
                }
                className="w-full py-2.5 rounded bg-[#241E19] hover:bg-[#332A22] border border-[#5C4D3C] text-sm font-semibold text-[#E7E0D0] cursor-pointer"
              >
                重开本战区
              </button>
              <button
                type="button"
                onClick={() => setScreenMode('title')}
                className="w-full py-2.5 rounded bg-[#1C1814] hover:bg-[#26201A] border border-[#382E26] text-sm text-[#A8A29E] cursor-pointer"
              >
                返回主标题
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 4. FORGE & RELIC DRAFT MODAL ==================== */}
      {screenMode === 'forge' && (
        <ForgeModal
          battleState={battle}
          onClaimRelic={(relicId: RelicId) => {
            const next = cloneBattleState(battle);
            if (!next.relics.includes(relicId)) {
              next.relics.push(relicId);
            }
            audioRef.current?.playShieldChime();
            battleRef.current = next;
            setBattle(next);
          }}
          onUpgradeMech={(mechId, stat, cost) => {
            if (battle.starIron < cost) return;
            const next = cloneBattleState(battle);
            next.starIron -= cost;
            next.mechUpgrades[mechId][stat] += 1;
            audioRef.current?.playSelect();
            battleRef.current = next;
            setBattle(next);
          }}
          onRepairGrid={(cost) => {
            if (
              battle.starIron < cost ||
              battle.gridPower >= battle.maxGridPower
            ) {
              return;
            }
            const next = cloneBattleState(battle);
            next.starIron -= cost;
            next.gridPower = Math.min(next.maxGridPower, next.gridPower + 1);
            audioRef.current?.playShieldChime();
            battleRef.current = next;
            setBattle(next);
          }}
          onProceedNextSector={() => {
            const nextIdx = (battle.sectorIndex + 1) % SECTORS.length;
            const nextEndlessLoop =
              battle.isEndless && nextIdx === 0
                ? battle.endlessLoop + 1
                : battle.endlessLoop;
            const nextBattle = createBattleState(
              nextIdx,
              battle.relics,
              battle.mechUpgrades,
              battle.gridPower,
              battle.starIron,
              battle.score,
              battle.isEndless,
              nextEndlessLoop,
              battle.seed + 99,
              battle.difficulty,
            );
            battleRef.current = nextBattle;
            setBattle(nextBattle);
            setSelectedUnitUid('mech_titan');
            setCommandMode('move');
            setHoveredTile(null);
            setScreenMode('playing');
            audioRef.current?.playSelect();
          }}
        />
      )}

      {/* ==================== 5. VICTORY / DEFEAT MODAL ==================== */}
      {screenMode === 'gameover' && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4 pointer-events-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="xuanji-outcome-title"
        >
          <div className="w-full max-w-lg p-6 rounded-lg bg-[#161310] border border-[#D97706] text-[#F7F3E8] space-y-5 shadow-2xl">
            <div>
              <div
                className={`text-xs font-bold uppercase tracking-wider ${
                  battle.phase === 'victory'
                    ? 'text-[#34D399]'
                    : 'text-[#EF4444]'
                }`}
              >
                {battle.phase === 'victory'
                  ? '九州大阵功成 · 饕餮伏诛'
                  : '九州灵脉枯竭 · 防线失守'}
              </div>
              <h2
                id="xuanji-outcome-title"
                className="text-2xl font-bold text-[#FEF3C7] mt-1"
              >
                {battle.phase === 'victory'
                  ? '天枢王庭战役大捷！'
                  : '机巧沙盘推演终结'}
              </h2>
            </div>

            <div className="grid grid-cols-3 gap-3 font-mono-num">
              <div className="p-3 rounded bg-[#1F1A15] border border-[#44382C]">
                <div className="text-[11px] text-[#A8A29E]">总战功得分</div>
                <div className="text-lg font-bold text-[#FBBF24] mt-0.5">
                  {battle.score}
                </div>
              </div>
              <div className="p-3 rounded bg-[#1F1A15] border border-[#44382C]">
                <div className="text-[11px] text-[#A8A29E]">击破荒兽</div>
                <div className="text-lg font-bold text-[#34D399] mt-0.5">
                  {battle.totalKills}
                </div>
              </div>
              <div className="p-3 rounded bg-[#1F1A15] border border-[#44382C]">
                <div className="text-[11px] text-[#A8A29E]">奇门连锁/误伤</div>
                <div className="text-lg font-bold text-[#38BDF8] mt-0.5">
                  {battle.chainKills + battle.friendlyFireCount}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              {battle.phase === 'victory' && (
                <button
                  type="button"
                  onClick={() => {
                    const endlessBattle = createBattleState(
                      0,
                      battle.relics,
                      battle.mechUpgrades,
                      battle.gridPower,
                      battle.starIron,
                      battle.score,
                      true,
                      1,
                      battle.seed + 313,
                      battle.difficulty,
                    );
                    battleRef.current = endlessBattle;
                    setBattle(endlessBattle);
                    setSelectedUnitUid('mech_titan');
                    setCommandMode('move');
                    setHoveredTile(null);
                    setScreenMode('playing');
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded bg-[#112A26] hover:bg-[#163832] border border-[#10B981] text-xs font-bold text-[#A7F3D0] cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>携神机进入无尽推演</span>
                </button>
              )}

              <button
                type="button"
                data-start="true"
                onClick={() => handleStartCampaign(0, false)}
                className="px-5 py-2.5 rounded bg-[#D97706] hover:bg-[#B45309] text-xs font-bold text-white cursor-pointer"
              >
                再战一局
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 6. TUTORIAL & CODEX MODALS ==================== */}
      {showTutorial && (
        <TutorialModal
          onClose={() => setShowTutorial(false)}
          onStartGuidedPractice={() => {
            setShowTutorial(false);
            if (screenMode === 'title') {
              handleStartCampaign(0, false, true);
            } else {
              setOnboardingStep(1);
              setScreenMode('playing');
            }
          }}
        />
      )}
      {showCodex && <CodexModal onClose={() => setShowCodex(false)} />}
    </div>
  );
}
