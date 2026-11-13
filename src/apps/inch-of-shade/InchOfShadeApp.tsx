import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  GraduationCap,
  LayoutGrid,
  Lightbulb,
  Lock,
  Play,
  RotateCcw,
  Undo2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { ShadeAudioEngine } from './audio.ts';
import { CodexModal } from './CodexModal.tsx';
import {
  CHAPTERS,
  DIFFICULTY_DEFS,
  DIFFICULTY_ORDER,
  LAST_PHASE,
  PHASES,
  stepBudget,
} from './content.ts';
import {
  DIRS,
  applyMove,
  applyWait,
  computeShade,
  computeWalkMap,
  createInitialState,
  neighbor,
  nextHintSegment,
  parseLevel,
  safeWaitCells,
  solve,
  walkPath,
} from './engine.ts';
import { CourtyardEmblem, PawIcon, SealStamp, SunGlyph } from './icons.tsx';
import { LEVELS, LEVEL_IDS, isLevelUnlocked, levelIndexById } from './levels.ts';
import { EMPTY_OVERLAY, ShadeBoardRenderer } from './renderer.ts';
import { loadMeta, recordSolve, saveMeta } from './storage.ts';
import { SunDial, shadowRuleText } from './SunDial.tsx';
import type {
  BlockReason,
  Difficulty,
  Dir,
  InchOfShadeMeta,
  ParsedLevel,
  PuzzleState,
} from './types.ts';

/* ------------------------------------------------------------------ */
/* 工具                                                                 */
/* ------------------------------------------------------------------ */

type Screen = 'title' | 'playing';
type OnboardingStep = 1 | 2 | 3 | 4 | null;

interface GameSnapshot {
  state: PuzzleState;
  history: PuzzleState[];
}

interface MovePlan {
  kind: 'walk' | 'push' | 'hot' | 'blocked';
  target: number;
  dirs: Dir[];
  cells: number[];
  pushFrom: number | null;
  pushTo: number | null;
  reason: BlockReason | null;
}

interface WinInfo {
  steps: number;
  par: number;
  pawsUsed: number;
  sealEarned: boolean;
  sealOwned: boolean;
  improved: boolean;
  best: number | null;
}

type HintState = { kind: 'walk'; cells: number[] } | { kind: 'wait' } | null;

const CHINESE_NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

function levelLabel(index: number): string {
  const def = LEVELS[index];
  const inChapter = LEVELS.filter((l) => l.chapter === def.chapter).indexOf(def);
  return `${def.chapter + 1}-${inChapter + 1}`;
}

function hasAutostartParam(): boolean {
  if (typeof window === 'undefined') return false;
  if (new URLSearchParams(window.location.search).get('autostart') === '1') return true;
  const hashIdx = window.location.hash.indexOf('?');
  return hashIdx >= 0 && new URLSearchParams(window.location.hash.slice(hashIdx)).get('autostart') === '1';
}

const BLOCK_MESSAGES: Record<BlockReason, string> = {
  edge: '再往外就是院墙了。',
  water: '猫不下水。',
  fixture: '那里有东西挡着。',
  'push-blocked': '推不动：前面被挡住了。',
  hot: '那里晒着太阳，猫不肯去。',
  sunset: '申时已过，没有下一个时辰了。',
  won: '',
};

const SERIF_GLYPHS = Array.from(
  new Set(
    [
      '寸阴日晷光影解谜继续开始第关章叼到鱼干了妙玩法手册新手教学选关等日头确认前往',
      ...LEVELS.map((l) => l.name),
      ...CHAPTERS.map((c) => c.name),
      ...PHASES.map((p) => p.name),
      '一二三四五六七八九十辰巳午未申酉',
    ].join(''),
  ),
).join('');

/* ------------------------------------------------------------------ */
/* 主组件                                                               */
/* ------------------------------------------------------------------ */

export default function InchOfShadeApp() {
  const autostart = useMemo(() => hasAutostartParam(), []);
  const [meta, setMeta] = useState<InchOfShadeMeta>(() => loadMeta(LEVEL_IDS));
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const updateMeta = useCallback((fn: (prev: InchOfShadeMeta) => InchOfShadeMeta) => {
    const next = fn(metaRef.current);
    metaRef.current = next;
    saveMeta(next);
    setMeta(next);
  }, []);

  const difficulty = meta.preferredDifficulty;
  const diffDef = DIFFICULTY_DEFS[difficulty];

  const [screen, setScreen] = useState<Screen>(autostart ? 'playing' : 'title');
  const [levelIndex, setLevelIndex] = useState<number>(() => {
    if (autostart) return 0;
    const last = levelIndexById(meta.lastLevelId);
    return last >= 0 ? last : 0;
  });
  const level = useMemo<ParsedLevel>(() => parseLevel(LEVELS[levelIndex]), [levelIndex]);
  const levelRef = useRef(level);
  levelRef.current = level;

  const [game, setGame] = useState<GameSnapshot>(() => ({
    state: createInitialState(parseLevel(LEVELS[autostart ? 0 : Math.max(0, levelIndexById(meta.lastLevelId))]), DIFFICULTY_DEFS[meta.preferredDifficulty].paws),
    history: [],
  }));
  const gameRef = useRef(game);
  gameRef.current = game;

  const [hintsLeft, setHintsLeft] = useState<number>(diffDef.hints);
  const [hint, setHint] = useState<HintState>(null);
  const [previewToggle, setPreviewToggle] = useState(false);
  const [previewHover, setPreviewHover] = useState(false);
  const [waitPending, setWaitPending] = useState(false);
  const [hoverCell, setHoverCell] = useState<number | null>(null);
  const [pendingPlan, setPendingPlan] = useState<MovePlan | null>(null);
  const [deadEnd, setDeadEnd] = useState<'dead' | 'sunset' | null>(null);
  const [winInfo, setWinInfo] = useState<WinInfo | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showCodex, setShowCodex] = useState(false);
  const [onboarding, setOnboarding] = useState<OnboardingStep>(() =>
    !autostart && !meta.tutorialCompleted && levelIndexById(meta.lastLevelId) <= 0 ? 1 : null,
  );
  const onboardingRef = useRef(onboarding);
  onboardingRef.current = onboarding;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ShadeBoardRenderer | null>(null);
  const audioRef = useRef<ShadeAudioEngine | null>(null);
  const timersRef = useRef<Set<number>>(new Set());
  const pointerStartRef = useRef<{ x: number; y: number; type: string; id: number } | null>(null);
  const lastPointerTypeRef = useRef<string>('mouse');
  const pendingWinRef = useRef<WinInfo | null>(null);
  const messageStampRef = useRef(0);

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, ms);
    timersRef.current.add(id);
  }, []);

  const audio = useCallback((): ShadeAudioEngine => {
    if (!audioRef.current) audioRef.current = new ShadeAudioEngine(metaRef.current.muted);
    return audioRef.current;
  }, []);

  /* ---------------- 字体与生命周期 ---------------- */

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@600;900&display=swap&text=${encodeURIComponent(SERIF_GLYPHS)}`;
    document.head.appendChild(link);
    const timers = timersRef.current;
    return () => {
      link.remove();
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  /* ---------------- 渲染器挂载 ---------------- */

  useEffect(() => {
    if (screen !== 'playing') return;
    const canvas = canvasRef.current;
    const board = boardRef.current;
    if (!canvas || !board) return;
    const renderer = new ShadeBoardRenderer(canvas);
    rendererRef.current = renderer;
    renderer.onStep = (i, hot, pushed, heavy) => {
      const a = audio();
      if (pushed) a.push(heavy);
      else a.step(i);
      if (hot) a.sizzle();
    };
    renderer.onArrive = () => {
      audio().win();
      const pending = pendingWinRef.current;
      if (pending) {
        later(() => setWinInfo(pending), 650);
      }
    };
    const fit = () => {
      const rect = board.getBoundingClientRect();
      renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1);
    };
    fit();
    renderer.setLevel(levelRef.current, gameRef.current.state);
    const ro = new ResizeObserver(fit);
    ro.observe(board);
    let raf = 0;
    const loop = (t: number) => {
      renderer.render(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [screen, audio, later]);

  /* ---------------- 开局 ---------------- */

  const startLevel = useCallback(
    (index: number, opts: { tutorial?: boolean; difficulty?: Difficulty } = {}) => {
      const d = opts.difficulty ?? metaRef.current.preferredDifficulty;
      const parsed = parseLevel(LEVELS[index]);
      const state = createInitialState(parsed, DIFFICULTY_DEFS[d].paws);
      levelRef.current = parsed;
      const snap = { state, history: [] };
      gameRef.current = snap;
      setLevelIndex(index);
      setGame(snap);
      setHintsLeft(DIFFICULTY_DEFS[d].hints);
      setHint(null);
      setPreviewToggle(false);
      setPreviewHover(false);
      setWaitPending(false);
      setPendingPlan(null);
      setDeadEnd(null);
      setWinInfo(null);
      setMessage(null);
      pendingWinRef.current = null;
      const tutorial =
        opts.tutorial ?? (index === 0 && !metaRef.current.tutorialCompleted && !autostart);
      setOnboarding(tutorial ? 1 : null);
      setScreen('playing');
      updateMeta((m) => ({ ...m, lastLevelId: LEVELS[index].id }));
      rendererRef.current?.setLevel(parsed, state);
      const a = audio();
      a.ui();
      a.setAmbience(state.phase);
    },
    [audio, autostart, updateMeta],
  );

  const backToTitle = useCallback(() => {
    audioRef.current?.stopAmbience();
    setScreen('title');
    setShowCodex(false);
    setWinInfo(null);
  }, []);

  /* ---------------- 提示文字 ---------------- */

  const flashMessage = useCallback(
    (text: string) => {
      setMessage(text);
      const stamp = Date.now();
      messageStampRef.current = stamp;
      later(() => {
        if (messageStampRef.current === stamp) setMessage(null);
      }, 2800);
    },
    [later],
  );

  /* ---------------- 死局检测 ---------------- */

  const checkDeadEnd = useCallback(
    (s: PuzzleState) => {
      if (s.won) {
        setDeadEnd(null);
        return;
      }
      const def = DIFFICULTY_DEFS[metaRef.current.preferredDifficulty];
      if (!def.instantDeadEndNotice && s.phase < LAST_PHASE) {
        setDeadEnd(null);
        return;
      }
      later(() => {
        if (gameRef.current.state !== s) return;
        const res = solve(levelRef.current, s, { maxNodes: 150_000 });
        if (!res.solvable && !res.truncated) {
          setDeadEnd(s.phase >= LAST_PHASE ? 'sunset' : 'dead');
        } else {
          setDeadEnd(null);
        }
      }, 40);
    },
    [later],
  );

  /* ---------------- 动作提交 ---------------- */

  const isBusy = useCallback(() => {
    const r = rendererRef.current;
    return Boolean(r?.isAnimating()) || gameRef.current.state.won;
  }, []);

  const afterAction = useCallback(
    (next: PuzzleState, kind: 'move' | 'wait') => {
      setHint(null);
      setPendingPlan(null);
      setWaitPending(false);
      const step = onboardingRef.current;
      if (step !== null) {
        if (kind === 'move' && step === 1) setOnboarding(2);
        if (kind === 'wait' && step <= 3) setOnboarding(4);
      }
      if (next.won) {
        const lvl = LEVELS[levelIndex];
        const res = recordSolve(metaRef.current, lvl.id, next.steps, lvl.par, next.pawsUsed);
        let nextMeta = res.meta;
        if (onboardingRef.current !== null) {
          nextMeta = { ...nextMeta, tutorialCompleted: true };
          setOnboarding(null);
        }
        updateMeta(() => nextMeta);
        pendingWinRef.current = {
          steps: next.steps,
          par: lvl.par,
          pawsUsed: next.pawsUsed,
          sealEarned: res.sealEarned,
          sealOwned: nextMeta.records[lvl.id]?.seal ?? false,
          improved: res.improved,
          best: nextMeta.records[lvl.id]?.bestSteps ?? null,
        };
        setDeadEnd(null);
        return;
      }
      checkDeadEnd(next);
    },
    [checkDeadEnd, levelIndex, updateMeta],
  );

  const commit = useCallback((next: PuzzleState) => {
    const g = gameRef.current;
    const snap = { state: next, history: [...g.history, g.state] };
    gameRef.current = snap;
    setGame(snap);
  }, []);

  const budget = stepBudget(difficulty, LEVELS[levelIndex].par);

  const refuse = useCallback(
    (reason: BlockReason, at: number | null) => {
      const r = rendererRef.current;
      const s = gameRef.current.state;
      r?.refuse(at ?? s.cat, reason === 'hot' ? 'hot' : 'blocked');
      const a = audio();
      if (reason === 'hot' || reason === 'sunset') a.refuse();
      else a.bump();
      if (BLOCK_MESSAGES[reason]) flashMessage(BLOCK_MESSAGES[reason]);
    },
    [audio, flashMessage],
  );

  const runMoves = useCallback(
    (dirs: Dir[]) => {
      if (isBusy() || dirs.length === 0) return false;
      const lvl = levelRef.current;
      const start = gameRef.current.state;
      const limit = stepBudget(metaRef.current.preferredDifficulty, lvl.def.par);
      if (limit !== null && start.steps + dirs.length > limit) {
        audio().refuse();
        flashMessage(`宗师限 ${limit} 步，步数不够了。撤回几步换条路吧。`);
        return false;
      }
      let s = start;
      const states: PuzzleState[] = [];
      const pushed: Array<number | null> = [];
      const hot: boolean[] = [];
      for (const dir of dirs) {
        const res = applyMove(lvl, s, dir);
        if (!res.ok) {
          if (states.length === 0) {
            refuse(res.reason, res.at);
            return false;
          }
          break;
        }
        states.push(res.state);
        pushed.push(res.pushed);
        hot.push(res.usedPaw);
        s = res.state;
      }
      rendererRef.current?.playWalk(start, states, pushed, hot);
      commit(s);
      afterAction(s, 'move');
      return true;
    },
    [afterAction, audio, commit, flashMessage, isBusy, refuse],
  );

  const doWait = useCallback(() => {
    if (isBusy()) return;
    const lvl = levelRef.current;
    const s = gameRef.current.state;
    const res = applyWait(lvl, s);
    if (!res.ok) {
      if (res.reason === 'hot') {
        refuse('hot', s.cat);
        flashMessage('下个时辰这里会被晒到。先挪到带爪印的格子再等。');
      } else {
        refuse(res.reason, null);
      }
      setWaitPending(false);
      return;
    }
    rendererRef.current?.playWait(res.state, res.usedPaw);
    const a = audio();
    a.chime(res.state.phase);
    if (res.usedPaw) a.sizzle();
    a.setAmbience(res.state.phase);
    commit(res.state);
    afterAction(res.state, 'wait');
  }, [afterAction, audio, commit, flashMessage, isBusy, refuse]);

  const undo = useCallback(() => {
    const r = rendererRef.current;
    if (r?.isAnimating()) return;
    const g = gameRef.current;
    if (g.history.length === 0 || g.state.won) return;
    const prev = g.history[g.history.length - 1];
    const snap = { state: prev, history: g.history.slice(0, -1) };
    gameRef.current = snap;
    setGame(snap);
    r?.snapTo(prev, true);
    setHint(null);
    setPendingPlan(null);
    setWaitPending(false);
    setDeadEnd(null);
    const a = audio();
    a.undo();
    a.setAmbience(prev.phase);
    checkDeadEnd(prev);
  }, [audio, checkDeadEnd]);

  const restart = useCallback(() => {
    const r = rendererRef.current;
    if (r?.isAnimating()) return;
    const lvl = levelRef.current;
    const s = createInitialState(lvl, DIFFICULTY_DEFS[metaRef.current.preferredDifficulty].paws);
    const snap = { state: s, history: [] };
    gameRef.current = snap;
    setGame(snap);
    r?.snapTo(s, true);
    setHint(null);
    setPendingPlan(null);
    setWaitPending(false);
    setDeadEnd(null);
    setWinInfo(null);
    pendingWinRef.current = null;
    const a = audio();
    a.undo();
    a.setAmbience(s.phase);
  }, [audio]);

  /* ---------------- 规划：点击某格会发生什么 ---------------- */

  const planFor = useCallback((target: number): MovePlan | null => {
    const lvl = levelRef.current;
    const s = gameRef.current.state;
    if (target < 0 || target === s.cat || s.won) return null;
    const adjDir = DIRS.find((d) => neighbor(lvl, s.cat, d) === target) ?? null;
    const base = { target, pushFrom: null, pushTo: null, reason: null } as const;
    if (s.movables.includes(target)) {
      if (!adjDir) return null;
      const res = applyMove(lvl, s, adjDir);
      if (!res.ok) return { ...base, kind: 'blocked', dirs: [adjDir], cells: [target], reason: res.reason };
      return {
        ...base,
        kind: 'push',
        dirs: [adjDir],
        cells: [target],
        pushFrom: target,
        pushTo: res.pushed !== null ? res.state.movables[res.pushed] : null,
      };
    }
    const walk = computeWalkMap(lvl, s);
    if (walk.dist[target] > 0) {
      const dirs = walkPath(lvl, walk, s.cat, target);
      if (dirs) {
        const cells: number[] = [];
        let at = s.cat;
        for (const d of dirs) {
          at = neighbor(lvl, at, d);
          cells.push(at);
        }
        return { ...base, kind: 'walk', dirs, cells };
      }
    }
    if (adjDir) {
      const res = applyMove(lvl, s, adjDir);
      if (res.ok && res.usedPaw) return { ...base, kind: 'hot', dirs: [adjDir], cells: [target] };
      if (!res.ok) return { ...base, kind: 'blocked', dirs: [adjDir], cells: [target], reason: res.reason };
    }
    return null;
  }, []);

  const executePlan = useCallback(
    (plan: MovePlan) => {
      if (plan.kind === 'blocked') {
        refuse(plan.reason ?? 'fixture', plan.target);
        setPendingPlan(null);
        return;
      }
      runMoves(plan.dirs);
    },
    [refuse, runMoves],
  );

  const tapCell = useCallback(
    (cell: number, pointerType: string) => {
      if (cell < 0 || isBusy()) return;
      setWaitPending(false);
      const plan = planFor(cell);
      if (!plan) {
        setPendingPlan(null);
        const lvl = levelRef.current;
        const s = gameRef.current.state;
        if (cell !== s.cat && lvl.tiles[cell] !== 'fixture' && lvl.tiles[cell] !== 'water') {
          if (s.movables.includes(cell)) flashMessage('走到它旁边，再顶着它走一步就能推动。');
          else flashMessage('那里晒着太阳，现在走不过去。');
        }
        return;
      }
      if (pointerType === 'mouse') {
        executePlan(plan);
        return;
      }
      // 触屏：首次轻点预览，再点同一格或点「前往」才执行
      if (pendingPlan && pendingPlan.target === cell) {
        executePlan(plan);
        return;
      }
      if (plan.kind === 'blocked') {
        executePlan(plan);
        return;
      }
      setPendingPlan(plan);
      audio().ui();
    },
    [audio, executePlan, flashMessage, isBusy, pendingPlan, planFor],
  );

  /* ---------------- 提示 ---------------- */

  const requestHint = useCallback(() => {
    if (isBusy()) return;
    const hints = hintsLeft;
    if (hints === 0) {
      flashMessage(diffDef.hints === 0 ? '宗师难度没有提示。' : '这一关的提示用完了。');
      return;
    }
    const lvl = levelRef.current;
    const s = gameRef.current.state;
    const res = solve(lvl, s, { maxNodes: 300_000 });
    if (!res.solvable) {
      setDeadEnd(s.phase >= LAST_PHASE ? 'sunset' : 'dead');
      flashMessage('从这里已经到不了鱼干了，先撤回几步。');
      return;
    }
    const seg = nextHintSegment(res.actions);
    if (seg.length === 0) return;
    if (seg[0].type === 'wait') {
      setHint({ kind: 'wait' });
      flashMessage('提示：现在就等日头。');
    } else {
      const cells: number[] = [];
      let at = s.cat;
      for (const a of seg) {
        if (a.type !== 'move') break;
        at = neighbor(lvl, at, a.dir);
        cells.push(at);
      }
      setHint({ kind: 'walk', cells });
      flashMessage('提示：沿金色爪印走。');
    }
    if (hints > 0) setHintsLeft(hints - 1);
    audio().hint();
  }, [audio, diffDef.hints, flashMessage, hintsLeft, isBusy]);

  /* ---------------- 等日头按钮 ---------------- */

  const onWaitButton = useCallback(() => {
    const type = lastPointerTypeRef.current;
    if ((type === 'touch' || type === 'pen') && !waitPending) {
      setPendingPlan(null);
      setWaitPending(true);
      audio().ui();
      return;
    }
    doWait();
  }, [audio, doWait, waitPending]);

  /* ---------------- 预览与叠加层 ---------------- */

  const state = game.state;
  const previewing =
    screen === 'playing' &&
    !state.won &&
    state.phase < LAST_PHASE &&
    (previewToggle || previewHover || waitPending || hint?.kind === 'wait');

  useEffect(() => {
    if (previewing && onboarding === 2) setOnboarding(3);
  }, [previewing, onboarding]);

  const hoverPlan = useMemo(() => {
    if (hoverCell === null) return null;
    return planFor(hoverCell);
    // game.state 变化时重新规划
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverCell, planFor, game.state]);

  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    const shownPlan = pendingPlan ?? hoverPlan;
    r.overlay = {
      ...EMPTY_OVERLAY,
      previewShade: previewing ? computeShade(level, (state.phase + 1) as 1 | 2 | 3 | 4, state.movables) : null,
      previewSafe: previewing ? safeWaitCells(level, state) : null,
      currentShade: previewing ? computeShade(level, state.phase, state.movables) : null,
      path: shownPlan ? shownPlan.cells : null,
      pathKind: shownPlan ? shownPlan.kind : null,
      pushFrom: shownPlan?.pushFrom ?? null,
      pushTo: shownPlan?.pushTo ?? null,
      hintPath: hint?.kind === 'walk' ? hint.cells : null,
      hover: hoverCell,
      pendingTarget: pendingPlan?.target ?? null,
    };
  }, [previewing, state, level, hoverPlan, pendingPlan, hint, hoverCell, screen]);

  /* ---------------- 键盘 ---------------- */

  useEffect(() => {
    if (screen !== 'playing') return;
    const onKey = (e: KeyboardEvent) => {
      if (showCodex || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const key = e.key.toLowerCase();
      const dirByKey: Record<string, Dir> = {
        arrowup: 'up',
        w: 'up',
        arrowdown: 'down',
        s: 'down',
        arrowleft: 'left',
        a: 'left',
        arrowright: 'right',
        d: 'right',
      };
      if (winInfo) {
        if (target && target.tagName === 'BUTTON') return;
        if (key === 'enter' || key === ' ') {
          e.preventDefault();
          nextLevelRef.current();
        }
        return;
      }
      if (key in dirByKey) {
        e.preventDefault();
        setPendingPlan(null);
        runMoves([dirByKey[key]]);
      } else if (key === ' ' || key === 'enter') {
        if (target && target.tagName === 'BUTTON' && key === 'enter') return;
        e.preventDefault();
        if (e.repeat) return;
        lastPointerTypeRef.current = 'keyboard';
        doWait();
      } else if (key === 'q') {
        setPreviewToggle((v) => !v);
      } else if (key === 'z' || key === 'backspace' || key === 'u') {
        e.preventDefault();
        undo();
      } else if (key === 'r') {
        restart();
      } else if (key === 'h') {
        requestHint();
      } else if (key === 'escape') {
        setPendingPlan(null);
        setWaitPending(false);
        setPreviewToggle(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, showCodex, winInfo, runMoves, doWait, undo, restart, requestHint]);

  /* ---------------- 棋盘指针 ---------------- */

  const onBoardPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    lastPointerTypeRef.current = e.pointerType;
    pointerStartRef.current = { x: e.clientX, y: e.clientY, type: e.pointerType, id: e.pointerId };
  };

  const onBoardPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start || start.id !== e.pointerId) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const dist = Math.hypot(dx, dy);
    if (start.type !== 'mouse' && dist > 26) {
      const dir: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      setPendingPlan(null);
      setWaitPending(false);
      runMoves([dir]);
      return;
    }
    const cell = rendererRef.current?.cellAt(e.clientX, e.clientY) ?? -1;
    tapCell(cell, start.type);
  };

  const onBoardPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== 'mouse') return;
    const cell = rendererRef.current?.cellAt(e.clientX, e.clientY) ?? -1;
    setHoverCell(cell >= 0 ? cell : null);
  };

  /* ---------------- 胜利后 ---------------- */

  const goNextLevel = useCallback(() => {
    if (levelIndex + 1 < LEVELS.length) startLevel(levelIndex + 1);
    else backToTitle();
  }, [backToTitle, levelIndex, startLevel]);
  const nextLevelRef = useRef(goNextLevel);
  nextLevelRef.current = goNextLevel;

  /* ---------------- 新手引导：示范 ---------------- */

  const demoStep = useCallback(() => {
    const lvl = levelRef.current;
    const s = gameRef.current.state;
    const step = onboardingRef.current;
    const toCell = (x: number, y: number) => y * lvl.width + x;
    const walkTo = (cell: number) => {
      const plan = planFor(cell);
      if (plan && plan.kind === 'walk') {
        runMoves(plan.dirs);
        return plan.dirs.length;
      }
      return 0;
    };
    if (step === 1) {
      walkTo(toCell(4, 2));
    } else if (step === 2) {
      setPreviewToggle(true);
    } else if (step === 3) {
      const safe = safeWaitCells(lvl, s);
      if (safe && safe[s.cat]) {
        doWait();
      } else {
        const n = walkTo(toCell(4, 2));
        later(() => doWait(), n * 150 + 120);
      }
    } else if (step === 4) {
      const n = walkTo(lvl.goal);
      if (n === 0) requestHint();
    }
  }, [doWait, later, planFor, runMoves, requestHint]);

  const skipOnboarding = useCallback(() => {
    setOnboarding(null);
    updateMeta((m) => ({ ...m, tutorialCompleted: true }));
  }, [updateMeta]);

  const onboardingCopy = useMemo(() => {
    switch (onboarding) {
      case 1:
        return '猫只肯走在影子里。点一下槐树影子里的格子（或按方向键），让它走过去。';
      case 2:
        return '看看下个时辰：把鼠标停在「等日头」上，触屏就先点它一下。虚线框是申时的影子。';
      case 3:
        return '带白色爪印的格子下个时辰仍有影子。站在那里，确认「等日头」。';
      case 4:
        return '申时影子长了一格，沿着它走到鱼干架。';
      default:
        return null;
    }
  }, [onboarding]);

  /* ---------------- 静音 ---------------- */

  const toggleMute = useCallback(() => {
    const muted = !metaRef.current.muted;
    updateMeta((m) => ({ ...m, muted }));
    const a = audio();
    a.setMuted(muted);
    if (!muted && screen === 'playing') a.setAmbience(gameRef.current.state.phase);
  }, [audio, screen, updateMeta]);

  const setDifficulty = useCallback(
    (d: Difficulty) => {
      updateMeta((m) => ({ ...m, preferredDifficulty: d }));
      audio().ui();
    },
    [audio, updateMeta],
  );

  /* ---------------- 视图 ---------------- */

  const solvedIds = useMemo(
    () => new Set(Object.entries(meta.records).filter(([, r]) => r.solved).map(([id]) => id)),
    [meta.records],
  );
  const sealCount = Object.values(meta.records).filter((r) => r.seal).length;

  const rootStyle = `
    .ios-root { --ios-serif: 'Noto Serif SC', 'Songti SC', 'STSong', 'SimSun', serif; }
    .ios-serif { font-family: var(--ios-serif); }
    .ios-btn, .ios-btn-ghost, .ios-btn-primary, .ios-tile { transition: background-color .15s ease, border-color .15s ease, color .15s ease, transform .15s ease; }
    .ios-btn { background: #FFFBF3; border: 1px solid #E2D4BB; color: #3D3226; }
    .ios-btn:hover:not(:disabled) { background: #F6EDDD; }
    .ios-btn:focus-visible, .ios-btn-ghost:focus-visible, .ios-tile:focus-visible { outline: none; border-color: #C2410C; }
    .ios-btn-ghost { background: transparent; border: 1px solid transparent; color: #5C4F3B; }
    .ios-btn-ghost:hover:not(:disabled) { background: #F3EAD9; }
    .ios-btn-primary { background: #C2410C; border: 1px solid #C2410C; color: #FFF8F1; }
    .ios-btn-primary:hover:not(:disabled) { background: #9A3412; border-color: #9A3412; }
    .ios-btn-primary:focus-visible { outline: none; border-color: #2B2118; box-shadow: inset 0 0 0 1px #FFF8F1; }
    .ios-btn:disabled, .ios-btn-primary:disabled, .ios-btn-ghost:disabled { opacity: .45; cursor: not-allowed; }
    .ios-scroll { scrollbar-width: thin; scrollbar-color: #D9CBB0 transparent; }
    .ios-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
    .ios-scroll::-webkit-scrollbar-thumb { background: #D9CBB0; border-radius: 3px; }
    .ios-scroll::-webkit-scrollbar-track { background: transparent; }
    @keyframes ios-glow { 0%,100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); } 50% { box-shadow: 0 0 0 4px rgba(245,158,11,.35); } }
    .ios-hint-glow { animation: ios-glow 1.2s ease-in-out infinite; }
    @keyframes ios-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
    .ios-rise { animation: ios-rise .35s ease-out both; }
  `;

  if (screen === 'title') {
    return (
      <div className="ios-root ios-scroll h-full w-full overflow-y-auto bg-[#F4ECDD] text-[#2B2118]">
        <style>{rootStyle}</style>
        <TitleScreen
          meta={meta}
          solvedIds={solvedIds}
          sealCount={sealCount}
          lastIndex={Math.max(0, levelIndexById(meta.lastLevelId))}
          onStart={(i) => startLevel(i)}
          onTutorial={() => startLevel(0, { tutorial: true })}
          onCodex={() => setShowCodex(true)}
          onDifficulty={setDifficulty}
          onToggleMute={toggleMute}
        />
        {showCodex && <CodexModal onClose={() => setShowCodex(false)} />}
      </div>
    );
  }

  const def = LEVELS[levelIndex];
  const chapter = CHAPTERS[def.chapter];
  const phaseDef = PHASES[state.phase];
  const nextPhaseDef = state.phase < LAST_PHASE ? PHASES[state.phase + 1] : null;
  const canUndo = game.history.length > 0 && !state.won;
  const hintLabel = diffDef.hints === -1 ? '不限' : `${hintsLeft}`;
  const hintDisabled = hintsLeft === 0 || state.won;
  const waitLabel = waitPending && nextPhaseDef ? `确认 · 进入${nextPhaseDef.name}` : '等日头';
  const pendingText = pendingPlan
    ? pendingPlan.kind === 'push'
      ? `推动${level.movableKinds[state.movables.indexOf(pendingPlan.target)] === 'vat' ? '水缸' : '花盆'}`
      : pendingPlan.kind === 'hot'
        ? '踩进阳光（用掉 1 次凉爪）'
        : `走到这里 · ${pendingPlan.dirs.length} 步`
    : null;

  const statusLine =
    message ??
    (state.won
      ? '叼到鱼干了！'
      : previewing && nextPhaseDef
        ? `预览${nextPhaseDef.name}：虚线是下个时辰的影子，白爪印处可以安心等。`
        : def.note);

  return (
    <div className="ios-root relative h-full w-full overflow-hidden bg-[#F4ECDD] text-[#2B2118] flex flex-col lg:flex-row">
      <style>{rootStyle}</style>

      {/* 手机：顶栏 */}
      <div className="lg:hidden shrink-0 px-3 pt-2 pb-1 flex items-center gap-2">
        <button
          type="button"
          onClick={backToTitle}
          className="ios-btn h-9 px-2.5 rounded-lg inline-flex items-center gap-1.5 text-xs font-semibold"
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          选关
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-[#8C7A5C] leading-tight truncate">
            {levelLabel(levelIndex)} · 第{CHINESE_NUMERALS[def.chapter]}章 {chapter.name}
          </div>
          <div className="text-base font-bold leading-tight truncate ios-serif">{def.name}</div>
        </div>
        <button
          type="button"
          onClick={() => setShowCodex(true)}
          aria-label="玩法手册"
          className="ios-btn-ghost w-9 h-9 rounded-lg inline-flex items-center justify-center"
        >
          <BookOpen className="w-4.5 h-4.5" />
        </button>
        <button
          type="button"
          onClick={toggleMute}
          aria-label={meta.muted ? '打开声音' : '静音'}
          aria-pressed={meta.muted}
          className="ios-btn-ghost w-9 h-9 rounded-lg inline-flex items-center justify-center"
        >
          {meta.muted ? <VolumeX className="w-4.5 h-4.5" /> : <Volume2 className="w-4.5 h-4.5" />}
        </button>
      </div>

      {/* 手机：日晷条 */}
      <div className="lg:hidden shrink-0 mx-3 mb-1 px-2 py-1 rounded-xl bg-[#FBF6EC] border border-[#E9DCC5] flex items-center gap-2">
        <SunDial phase={state.phase} previewing={previewing} compact />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold ios-serif">
            {phaseDef.name}
            <span className="ml-1.5 text-[11px] font-normal text-[#8C7A5C]">{phaseDef.clock}</span>
          </div>
          <div className="text-[11px] text-[#5C4F3B] leading-snug">{shadowRuleText(state.phase)}</div>
        </div>
        <StatsBlock state={state} par={def.par} budget={budget} paws={diffDef.paws} compact />
      </div>

      {/* 棋盘区 */}
      <div className="relative flex-1 min-h-0 min-w-0 flex flex-col">
        {onboardingCopy && (
          <div
            data-testid="ios-onboarding-bar"
            className="ios-rise shrink-0 mx-3 lg:mx-6 mt-1 lg:mt-4 px-3 py-2 rounded-xl bg-[#2B2118] text-[#FBF3E4] flex items-center gap-3"
          >
            <span className="shrink-0 text-[11px] font-mono-num px-1.5 py-0.5 rounded bg-[#C2410C] text-white">
              {onboarding}/4
            </span>
            <p className="flex-1 min-w-0 text-xs sm:text-sm leading-snug">{onboardingCopy}</p>
            <button
              type="button"
              onClick={demoStep}
              className="shrink-0 h-8 px-2.5 rounded-lg bg-[#FBF3E4] text-[#2B2118] text-xs font-semibold border border-transparent focus:outline-none focus-visible:border-[#C2410C]"
            >
              示范
            </button>
            <button
              type="button"
              onClick={skipOnboarding}
              className="shrink-0 h-8 px-2 rounded-lg text-[#D9CBB0] hover:text-white text-xs border border-transparent focus:outline-none focus-visible:border-[#C2410C]"
            >
              跳过
            </button>
          </div>
        )}

        <div ref={boardRef} className="relative flex-1 min-h-0">
          <canvas
            ref={canvasRef}
            data-testid="ios-board"
            aria-label={`棋盘：${def.name}，${phaseDef.name}`}
            className="absolute inset-0 w-full h-full touch-none select-none"
            onPointerDown={onBoardPointerDown}
            onPointerUp={onBoardPointerUp}
            onPointerMove={onBoardPointerMove}
            onPointerLeave={() => setHoverCell(null)}
            onPointerCancel={() => (pointerStartRef.current = null)}
          />

          {deadEnd && !state.won && (
            <div className="ios-rise absolute left-1/2 -translate-x-1/2 top-2 max-w-[92%] px-3 py-2 rounded-xl bg-[#FFF7EC] border border-[#E9B98F] shadow-sm flex items-center gap-2 text-xs sm:text-sm">
              <span className="text-[#9A3412] font-semibold">
                {deadEnd === 'sunset' ? '日头落山前到不了鱼干了。' : '这一步之后已经到不了鱼干了。'}
              </span>
              <button type="button" onClick={undo} className="ios-btn h-7 px-2 rounded-md text-xs font-semibold inline-flex items-center gap-1">
                <Undo2 className="w-3.5 h-3.5" />
                撤回
              </button>
            </div>
          )}

          {winInfo && (
            <WinCard
              info={winInfo}
              levelName={def.name}
              hasNext={levelIndex + 1 < LEVELS.length}
              onNext={goNextLevel}
              onReplay={restart}
              onLevels={backToTitle}
            />
          )}
        </div>

        <p
          className="shrink-0 px-4 lg:px-6 pb-1 lg:pb-4 text-center text-xs sm:text-sm text-[#5C4F3B] min-h-[1.5rem] leading-snug"
          aria-live="polite"
        >
          {statusLine}
        </p>

        {/* 手机：触屏确认条 */}
        {pendingPlan && pendingText && (
          <div className="lg:hidden shrink-0 mx-3 mb-1.5 px-3 py-1.5 rounded-xl bg-[#1F2A55] text-white flex items-center gap-2">
            <span className="flex-1 text-xs">{pendingText}</span>
            <button
              type="button"
              onClick={() => executePlan(pendingPlan)}
              className="h-8 px-3 rounded-lg bg-white text-[#1F2A55] text-xs font-bold inline-flex items-center gap-1 border border-transparent focus:outline-none focus-visible:border-[#C2410C]"
            >
              <Check className="w-3.5 h-3.5" />
              前往
            </button>
            <button
              type="button"
              onClick={() => setPendingPlan(null)}
              aria-label="取消"
              className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-white/80 border border-transparent focus:outline-none focus-visible:border-[#C2410C]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 手机：操作坞 */}
        <div className="lg:hidden shrink-0 px-3 pb-3 pt-1 grid grid-cols-[1fr_1fr_2.2fr_1fr_1fr] gap-1.5">
          <DockButton label="撤回" onClick={undo} disabled={!canUndo}>
            <Undo2 className="w-5 h-5" />
          </DockButton>
          <DockButton label="重来" onClick={restart} disabled={game.history.length === 0}>
            <RotateCcw className="w-5 h-5" />
          </DockButton>
          <button
            type="button"
            data-testid="ios-wait"
            onPointerDown={(e) => (lastPointerTypeRef.current = e.pointerType)}
            onClick={onWaitButton}
            disabled={state.won || state.phase >= LAST_PHASE}
            className={`ios-btn-primary h-14 rounded-xl inline-flex flex-col items-center justify-center font-bold ${hint?.kind === 'wait' ? 'ios-hint-glow' : ''}`}
          >
            <span className="inline-flex items-center gap-1.5 text-sm">
              <SunGlyph className="w-4.5 h-4.5" />
              {state.phase >= LAST_PHASE ? '已是申时' : waitLabel}
            </span>
            {!waitPending && nextPhaseDef && (
              <span className="text-[10px] font-normal opacity-80">到{nextPhaseDef.name}</span>
            )}
          </button>
          <DockButton
            label="预览"
            onClick={() => setPreviewToggle((v) => !v)}
            pressed={previewToggle}
            disabled={state.phase >= LAST_PHASE}
          >
            {previewToggle ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </DockButton>
          <DockButton label={`提示 ${diffDef.hints === 0 ? '无' : hintLabel}`} onClick={requestHint} disabled={hintDisabled}>
            <Lightbulb className="w-5 h-5" />
          </DockButton>
        </div>
      </div>

      {/* 桌面：侧栏 */}
      <aside className="hidden lg:flex ios-scroll shrink-0 w-[320px] xl:w-[340px] flex-col gap-4 overflow-y-auto border-l border-[#E5D9C3] bg-[#FBF6EC] px-5 py-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs text-[#8C7A5C]">
              {levelLabel(levelIndex)} · 第{CHINESE_NUMERALS[def.chapter]}章 {chapter.name} · {diffDef.label}
            </div>
            <h1 className="mt-0.5 text-2xl font-black ios-serif">{def.name}</h1>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setShowCodex(true)}
              aria-label="玩法手册"
              title="玩法手册"
              className="ios-btn-ghost w-9 h-9 rounded-lg inline-flex items-center justify-center"
            >
              <BookOpen className="w-4.5 h-4.5" />
            </button>
            <button
              type="button"
              onClick={toggleMute}
              aria-label={meta.muted ? '打开声音' : '静音'}
              title={meta.muted ? '打开声音' : '静音'}
              aria-pressed={meta.muted}
              className="ios-btn-ghost w-9 h-9 rounded-lg inline-flex items-center justify-center"
            >
              {meta.muted ? <VolumeX className="w-4.5 h-4.5" /> : <Volume2 className="w-4.5 h-4.5" />}
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-white/70 border border-[#EADFCB] px-3 pt-3 pb-2">
          <SunDial phase={state.phase} previewing={previewing} />
          <div className="mt-1 text-center">
            <div className="text-lg font-bold ios-serif">
              {phaseDef.name}
              <span className="ml-2 text-xs font-normal text-[#8C7A5C]">{phaseDef.clock}</span>
            </div>
            <div className="text-xs text-[#5C4F3B]">{shadowRuleText(state.phase)}</div>
          </div>
        </div>

        <StatsBlock state={state} par={def.par} budget={budget} paws={diffDef.paws} />

        <div className="flex flex-col gap-2">
          <button
            type="button"
            data-testid="ios-wait-desktop"
            onPointerDown={(e) => (lastPointerTypeRef.current = e.pointerType)}
            onMouseEnter={() => setPreviewHover(true)}
            onMouseLeave={() => setPreviewHover(false)}
            onFocus={() => setPreviewHover(true)}
            onBlur={() => setPreviewHover(false)}
            onClick={onWaitButton}
            disabled={state.won || state.phase >= LAST_PHASE}
            className={`ios-btn-primary h-14 rounded-xl inline-flex items-center justify-center gap-2 text-base font-bold ${hint?.kind === 'wait' ? 'ios-hint-glow' : ''}`}
          >
            <SunGlyph className="w-5 h-5" />
            {state.phase >= LAST_PHASE ? '已是申时，日落前到达' : waitLabel}
            {!waitPending && nextPhaseDef && (
              <span className="text-xs font-normal opacity-80">→ {nextPhaseDef.name}</span>
            )}
          </button>
          <div className="grid grid-cols-3 gap-2">
            <SideButton onClick={undo} disabled={!canUndo} shortcut="Z">
              <Undo2 className="w-4 h-4" />
              撤回
            </SideButton>
            <SideButton onClick={restart} disabled={game.history.length === 0} shortcut="R">
              <RotateCcw className="w-4 h-4" />
              重来
            </SideButton>
            <SideButton onClick={requestHint} disabled={hintDisabled} shortcut="H">
              <Lightbulb className="w-4 h-4" />
              提示 {diffDef.hints === 0 ? '无' : hintLabel}
            </SideButton>
          </div>
          <button
            type="button"
            onClick={() => setPreviewToggle((v) => !v)}
            aria-pressed={previewToggle}
            disabled={state.phase >= LAST_PHASE}
            className={`ios-btn h-10 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-medium ${previewToggle ? '!bg-[#1F2A55] !text-white !border-[#1F2A55]' : ''}`}
          >
            {previewToggle ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {previewToggle ? '收起预览' : '常开下个时辰的预览'}
            <kbd className="ml-1 text-[10px] font-mono opacity-70">Q</kbd>
          </button>
        </div>

        <div className="mt-auto flex flex-col gap-2 pt-2">
          <button
            type="button"
            onClick={backToTitle}
            className="ios-btn h-10 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-medium"
          >
            <LayoutGrid className="w-4 h-4" />
            选关与难度
          </button>
          <p className="text-[11px] leading-relaxed text-[#8C7A5C]">
            方向键 / WASD 走一步 · 空格等日头 · 单击格子沿影子走过去 · 顶着花盆走就能推
          </p>
        </div>
      </aside>

      {showCodex && <CodexModal onClose={() => setShowCodex(false)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 子组件                                                               */
/* ------------------------------------------------------------------ */

const StatsBlock: React.FC<{
  state: PuzzleState;
  par: number;
  budget: number | null;
  paws: number;
  compact?: boolean;
}> = ({ state, par, budget, paws, compact }) => {
  const over = budget !== null && state.steps >= budget;
  if (compact) {
    return (
      <div className="shrink-0 text-right leading-tight">
        <div className={`text-sm font-mono-num font-bold ${over ? 'text-[#C2410C]' : ''}`}>
          {state.steps}
          <span className="text-[11px] font-normal text-[#8C7A5C]"> / {budget ?? par}</span>
        </div>
        <div className="text-[10px] text-[#8C7A5C]">{budget !== null ? '步数上限' : '步 · 最少'}</div>
        {paws > 0 && (
          <div className="mt-0.5 flex justify-end gap-0.5" aria-label={`凉爪剩 ${state.paws} 次`}>
            {Array.from({ length: paws }).map((_, i) => (
              <PawIcon key={i} className={`w-3 h-3 ${i < state.paws ? 'text-[#4C5F8F]' : 'text-[#D9CBB0]'}`} />
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <dl className="grid grid-cols-3 gap-2 text-center">
      <div className="rounded-xl bg-white/70 border border-[#EADFCB] py-2">
        <dt className="text-[11px] text-[#8C7A5C]">步数</dt>
        <dd className={`text-xl font-bold font-mono-num ${over ? 'text-[#C2410C]' : ''}`}>{state.steps}</dd>
      </div>
      <div className="rounded-xl bg-white/70 border border-[#EADFCB] py-2">
        <dt className="text-[11px] text-[#8C7A5C]">{budget !== null ? '上限' : '最少'}</dt>
        <dd className="text-xl font-bold font-mono-num">{budget ?? par}</dd>
      </div>
      <div className="rounded-xl bg-white/70 border border-[#EADFCB] py-2">
        <dt className="text-[11px] text-[#8C7A5C]">凉爪</dt>
        <dd className="h-7 flex items-center justify-center gap-0.5" aria-label={`凉爪剩 ${state.paws} 次`}>
          {paws === 0 ? (
            <span className="text-sm text-[#8C7A5C]">无</span>
          ) : (
            Array.from({ length: paws }).map((_, i) => (
              <PawIcon key={i} className={`w-4 h-4 ${i < state.paws ? 'text-[#4C5F8F]' : 'text-[#D9CBB0]'}`} />
            ))
          )}
        </dd>
      </div>
    </dl>
  );
};

const DockButton: React.FC<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: React.ReactNode;
}> = ({ label, onClick, disabled, pressed, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-pressed={pressed}
    className={`ios-btn h-14 rounded-xl inline-flex flex-col items-center justify-center gap-0.5 ${pressed ? '!bg-[#1F2A55] !text-white !border-[#1F2A55]' : ''}`}
  >
    {children}
    <span className="text-[10px] leading-none">{label}</span>
  </button>
);

const SideButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  shortcut: string;
  children: React.ReactNode;
}> = ({ onClick, disabled, shortcut, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={`快捷键 ${shortcut}`}
    className="ios-btn h-10 rounded-lg inline-flex items-center justify-center gap-1.5 text-sm font-medium whitespace-nowrap"
  >
    {children}
  </button>
);

const WinCard: React.FC<{
  info: WinInfo;
  levelName: string;
  hasNext: boolean;
  onNext: () => void;
  onReplay: () => void;
  onLevels: () => void;
}> = ({ info, levelName, hasNext, onNext, onReplay, onLevels }) => {
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    nextRef.current?.focus();
  }, []);
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#2B2118]/25 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ios-win-title"
        className="ios-rise w-full max-w-sm rounded-2xl bg-[#FFFBF3] border border-[#E5D9C3] shadow-xl px-6 py-5 text-center"
      >
        <div className="flex items-center justify-center gap-3">
          <h2 id="ios-win-title" className="text-2xl font-black ios-serif">
            叼到鱼干了
          </h2>
          {info.sealOwned && <SealStamp className="w-9 h-9" title="妙" />}
        </div>
        <p className="mt-1 text-sm text-[#5C4F3B]">「{levelName}」</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-white border border-[#EADFCB] py-2">
            <div className="text-[11px] text-[#8C7A5C]">本次步数</div>
            <div className="text-2xl font-bold font-mono-num">{info.steps}</div>
          </div>
          <div className="rounded-xl bg-white border border-[#EADFCB] py-2">
            <div className="text-[11px] text-[#8C7A5C]">最少步数</div>
            <div className="text-2xl font-bold font-mono-num">{info.par}</div>
          </div>
        </div>
        <p className="mt-3 text-xs text-[#5C4F3B] min-h-[1rem]">
          {info.sealEarned
            ? '一步不多，也没踩过阳光：盖上「妙」字印。'
            : info.pawsUsed > 0
              ? `用了 ${info.pawsUsed} 次凉爪。只走阴凉、步数达到最少即可得「妙」印。`
              : info.steps > info.par
                ? `比最少步数多走了 ${info.steps - info.par} 步。`
                : info.improved && info.best !== null
                  ? `最佳成绩 ${info.best} 步。`
                  : ''}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            ref={nextRef}
            type="button"
            onClick={onNext}
            className="ios-btn-primary h-11 rounded-xl inline-flex items-center justify-center gap-1.5 font-bold"
          >
            {hasNext ? '下一关' : '回到选关'}
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onReplay} className="ios-btn h-10 rounded-xl inline-flex items-center justify-center gap-1.5 text-sm">
              <RotateCcw className="w-4 h-4" />
              再玩一次
            </button>
            <button type="button" onClick={onLevels} className="ios-btn h-10 rounded-xl inline-flex items-center justify-center gap-1.5 text-sm">
              <LayoutGrid className="w-4 h-4" />
              选关
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const TitleScreen: React.FC<{
  meta: InchOfShadeMeta;
  solvedIds: ReadonlySet<string>;
  sealCount: number;
  lastIndex: number;
  onStart: (index: number) => void;
  onTutorial: () => void;
  onCodex: () => void;
  onDifficulty: (d: Difficulty) => void;
  onToggleMute: () => void;
}> = ({ meta, solvedIds, sealCount, lastIndex, onStart, onTutorial, onCodex, onDifficulty, onToggleMute }) => {
  const firstUnsolved = LEVELS.findIndex((l, i) => !solvedIds.has(l.id) && isLevelUnlocked(i, solvedIds));
  const continueIndex = solvedIds.size === 0 ? 0 : firstUnsolved >= 0 ? firstUnsolved : lastIndex;
  const fresh = solvedIds.size === 0;
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-8 py-6 sm:py-10 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-12">
      <section className="flex flex-col">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-6xl sm:text-7xl font-black tracking-wider ios-serif leading-none">寸阴</h1>
            <p className="mt-3 text-sm sm:text-base font-semibold text-[#C2410C]">日晷光影解谜 · 橘猫只走阴凉处</p>
          </div>
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={meta.muted ? '打开声音' : '静音'}
            aria-pressed={meta.muted}
            className="ios-btn-ghost w-10 h-10 rounded-lg inline-flex items-center justify-center"
          >
            {meta.muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>
        <CourtyardEmblem className="mt-4 w-full max-w-md self-center" />
        <p className="mt-2 text-sm sm:text-[15px] leading-relaxed text-[#4A3F31]">
          盛夏的庭院，地砖晒得发烫。推动时辰让影子转向，推开花盆、借着云影，带橘猫一路踩着阴凉，赶在日落前叼到鱼干。
        </p>

        <div className="mt-5 flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            data-testid="ios-continue"
            onClick={() => onStart(continueIndex)}
            className="ios-btn-primary h-12 px-5 rounded-xl inline-flex items-center justify-center gap-2 font-bold"
          >
            <Play className="w-4 h-4" />
            {fresh ? '开始：' : '继续：'}
            {levelLabel(continueIndex)} {LEVELS[continueIndex].name}
          </button>
          <button
            type="button"
            onClick={onTutorial}
            className="ios-btn h-12 px-4 rounded-xl inline-flex items-center justify-center gap-2 font-semibold"
          >
            <GraduationCap className="w-4 h-4" />
            新手教学
          </button>
          <button
            type="button"
            onClick={onCodex}
            className="ios-btn h-12 px-4 rounded-xl inline-flex items-center justify-center gap-2 font-semibold"
          >
            <BookOpen className="w-4 h-4" />
            玩法手册
          </button>
        </div>

        <fieldset className="mt-6">
          <legend className="text-xs font-semibold text-[#8C7A5C] mb-2">难度（随时可改，新开一关时生效）</legend>
          <div className="grid grid-cols-3 gap-2">
            {DIFFICULTY_ORDER.map((d) => {
              const def = DIFFICULTY_DEFS[d];
              const active = meta.preferredDifficulty === d;
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onDifficulty(d)}
                  className={`ios-tile text-left rounded-xl border px-3 py-2.5 ${
                    active ? 'bg-[#2B2118] border-[#2B2118] text-[#FBF3E4]' : 'bg-[#FFFBF3] border-[#E2D4BB] hover:bg-[#F6EDDD]'
                  }`}
                >
                  <div className="text-sm font-bold">{def.label}</div>
                  <div className={`mt-0.5 text-[11px] leading-snug ${active ? 'text-[#E9DCC5]' : 'text-[#8C7A5C]'}`}>
                    {def.tagline}
                  </div>
                </button>
              );
            })}
          </div>
        </fieldset>
      </section>

      <section aria-labelledby="ios-levels-title">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="ios-levels-title" className="text-xl font-bold ios-serif">
            选关
          </h2>
          <p className="text-xs text-[#8C7A5C] font-mono-num">
            已叼到 {solvedIds.size} / {LEVELS.length} 条鱼干 · 「妙」印 {sealCount}
          </p>
        </div>
        <div className="mt-3 flex flex-col gap-5">
          {CHAPTERS.map((chapter) => (
            <div key={chapter.index}>
              <div className="flex items-baseline gap-2 mb-2">
                <h3 className="text-base font-bold ios-serif">
                  第{CHINESE_NUMERALS[chapter.index]}章 · {chapter.name}
                </h3>
                <span className="text-xs text-[#8C7A5C]">{chapter.lesson}</span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {LEVELS.map((l, i) => ({ l, i }))
                  .filter(({ l }) => l.chapter === chapter.index)
                  .map(({ l, i }) => {
                    const rec = meta.records[l.id];
                    const unlocked = isLevelUnlocked(i, solvedIds);
                    const solved = Boolean(rec?.solved);
                    return (
                      <button
                        key={l.id}
                        type="button"
                        disabled={!unlocked}
                        onClick={() => onStart(i)}
                        aria-label={`${levelLabel(i)} ${l.name}${solved ? '，已通关' : ''}${unlocked ? '' : '，未解锁'}`}
                        className={`ios-tile relative aspect-square sm:aspect-[4/5] rounded-xl border flex flex-col items-center justify-center gap-0.5 px-1 ${
                          !unlocked
                            ? 'bg-[#EFE6D6] border-[#E2D4BB] text-[#B4A68D] cursor-not-allowed'
                            : solved
                              ? 'bg-[#FFFBF3] border-[#D9CBB0] hover:bg-[#F6EDDD]'
                              : 'bg-white border-[#E2D4BB] hover:bg-[#F6EDDD]'
                        }`}
                      >
                        <span className="text-[10px] font-mono-num text-[#8C7A5C]">{levelLabel(i)}</span>
                        <span className="text-sm sm:text-base font-bold ios-serif leading-tight text-center">
                          {unlocked ? l.name : <Lock className="w-4 h-4 mx-auto" aria-hidden="true" />}
                        </span>
                        {solved && (
                          <span className="hidden sm:block text-[10px] text-[#8C7A5C] font-mono-num">
                            {rec?.bestSteps} 步
                          </span>
                        )}
                        {rec?.seal && <SealStamp className="absolute -top-1.5 -right-1.5 w-6 h-6" />}
                        {solved && !rec?.seal && (
                          <Check className="absolute top-1 right-1 w-3.5 h-3.5 text-[#4C5F8F]" aria-hidden="true" />
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-5 text-xs leading-relaxed text-[#8C7A5C]">
          可以先跳过一道没解开的关。桌面：单击格子前往、鼠标停在「等日头」上预览；触屏：先点一下看路线，再点一次出发。
        </p>
      </section>
    </div>
  );
};
