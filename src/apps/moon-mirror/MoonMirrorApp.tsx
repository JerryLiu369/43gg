import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronRight,
  Flower2,
  Lightbulb,
  Lock,
  Moon,
  Move,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Sparkles,
  Star,
  Undo2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { MoonBoard } from './MoonBoard.tsx';
import { TutorialModal } from './TutorialModal.tsx';
import { MoonMirrorAudio } from './audio.ts';
import { CHAPTERS, DIFFICULTY_DEFS, LEVELS } from './content.ts';
import {
  applyPuzzleAction,
  createPuzzleState,
  getHint,
  getLegalActions,
  getMoveLimit,
  getStars,
  simulateLight,
} from './engine.ts';
import {
  loadMoonMirrorSave,
  recordLevelCompletion,
  saveMoonMirrorSave,
} from './storage.ts';
import type {
  Coord,
  DifficultyTier,
  LevelDef,
  PuzzleAction,
  PuzzleState,
} from './types.ts';
import './moon-mirror.css';

type ScreenState = 'title' | 'playing' | 'paused';
type TutorialStep = 1 | 2 | 3 | null;

function isAutostart(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('autostart') === '1';
}

function sameAction(a: PuzzleAction | null, b: PuzzleAction): boolean {
  if (!a || a.kind !== b.kind || a.pieceId !== b.pieceId) return false;
  if (a.kind === 'rotate') return true;
  return a.to?.r === b.to?.r && a.to?.c === b.to?.c;
}

function actionText(action: PuzzleAction): string {
  return action.kind === 'rotate' ? '旋转银镜九十度' : '将银镜移到高亮位置';
}

function MoonGardenEmblem() {
  return (
    <svg className="mm-hero-emblem" viewBox="0 0 520 420" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id="mm-hero-moon">
          <stop offset="0" stopColor="#fffce8" />
          <stop offset="0.65" stopColor="#efe3b4" />
          <stop offset="1" stopColor="#9e946f" />
        </radialGradient>
        <linearGradient id="mm-hero-metal" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#6d969a" />
          <stop offset="0.45" stopColor="#f4f8df" />
          <stop offset="1" stopColor="#769a9b" />
        </linearGradient>
        <filter id="mm-hero-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <circle cx="265" cy="190" r="142" fill="#d7f4e9" opacity="0.025" />
      <circle cx="265" cy="190" r="112" stroke="#85aaa5" strokeOpacity="0.18" strokeDasharray="2 9" />
      <circle cx="265" cy="190" r="79" fill="url(#mm-hero-moon)" opacity="0.94" />
      <path d="M229 135C252 123 277 129 286 142M238 239C266 249 296 239 307 221" stroke="#a9a17e" strokeOpacity="0.32" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="253" cy="164" rx="16" ry="9" stroke="#aaa27f" strokeOpacity="0.24" strokeWidth="3" transform="rotate(-18 253 164)" />
      <path d="M52 307H224L308 223" stroke="#ffdc8f" strokeWidth="14" strokeOpacity="0.08" filter="url(#mm-hero-glow)" />
      <path d="M52 307H224L308 223" stroke="#ffdc8f" strokeWidth="3" filter="url(#mm-hero-glow)" />
      <path d="M309 223H442" stroke="#8debf2" strokeWidth="12" strokeOpacity="0.08" filter="url(#mm-hero-glow)" />
      <path d="M309 223H442" stroke="#8debf2" strokeWidth="3" filter="url(#mm-hero-glow)" />
      <g transform="translate(266 265) rotate(-45)">
        <circle r="45" fill="#0b2025" stroke="#607f80" strokeWidth="2" />
        <path d="M-35 0H35" stroke="#203d42" strokeWidth="17" strokeLinecap="round" />
        <path d="M-35 0H35" stroke="url(#mm-hero-metal)" strokeWidth="10" strokeLinecap="round" />
        <circle r="6" fill="#f5eac6" />
      </g>
      <g transform="translate(446 223)" filter="url(#mm-hero-glow)">
        {Array.from({ length: 6 }, (_, index) => (
          <ellipse key={index} cx="0" cy="-23" rx="12" ry="24" transform={`rotate(${index * 60})`} fill="#baf3cf" stroke="#fff7d7" strokeOpacity="0.65" />
        ))}
        <circle r="13" fill="#fff8d8" />
        <circle r="5" fill="#8debf2" />
      </g>
      <path d="M36 352Q166 324 282 352T496 348" stroke="#6b9b96" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M68 374Q170 351 274 374T464 371" stroke="#6b9b96" strokeOpacity="0.13" strokeWidth="2" />
      <g fill="#d5eee2">
        <circle cx="75" cy="98" r="2" opacity="0.45" />
        <circle cx="420" cy="91" r="2.5" opacity="0.4" />
        <circle cx="465" cy="142" r="1.5" opacity="0.35" />
        <circle cx="110" cy="181" r="1.5" opacity="0.28" />
      </g>
    </svg>
  );
}

export default function MoonMirrorApp() {
  const autostart = useMemo(isAutostart, []);
  const [save, setSave] = useState(loadMoonMirrorSave);
  const [screen, setScreen] = useState<ScreenState>(autostart ? 'playing' : 'title');
  const [levelIndex, setLevelIndex] = useState(() => Math.min(LEVELS.length - 1, loadMoonMirrorSave().unlockedLevel - 1));
  const [difficulty, setDifficulty] = useState<DifficultyTier>(save.preferredDifficulty);
  const [puzzle, setPuzzle] = useState<PuzzleState>(() => createPuzzleState(LEVELS[Math.min(LEVELS.length - 1, save.unlockedLevel - 1)]));
  const [history, setHistory] = useState<PuzzleState[]>([]);
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [moveMode, setMoveMode] = useState(false);
  const [pendingAction, setPendingAction] = useState<PuzzleAction | null>(null);
  const [hoverAction, setHoverAction] = useState<PuzzleAction | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [tutorialStep, setTutorialStep] = useState<TutorialStep>(
    !autostart && !save.tutorialCompleted ? 1 : null,
  );
  const [notice, setNotice] = useState('点选一枚银镜，开始整理光路。');
  const audioRef = useRef<MoonMirrorAudio | null>(null);
  const completionRef = useRef<string | null>(null);
  const attemptRef = useRef(0);
  const previousLitCountRef = useRef(0);
  const level = LEVELS[levelIndex];
  const difficultyDef = DIFFICULTY_DEFS[difficulty];

  const clearInteraction = useCallback(() => {
    setSelectedPieceId(null);
    setMoveMode(false);
    setPendingAction(null);
    setHoverAction(null);
  }, []);

  useEffect(() => {
    const audio = new MoonMirrorAudio(save.muted);
    audioRef.current = audio;
    return () => {
      audio.dispose();
      audioRef.current = null;
      delete document.body.dataset.state;
    };
    // Audio lifetime is tied to app mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => saveMoonMirrorSave(save), [save]);
  useEffect(() => audioRef.current?.setMuted(save.muted), [save.muted]);
  useEffect(() => {
    document.body.dataset.state = screen === 'playing' ? puzzle.status : screen;
  }, [puzzle.status, screen]);

  const startLevel = useCallback((index: number, withTutorial = false) => {
    const safeIndex = Math.max(0, Math.min(LEVELS.length - 1, index));
    attemptRef.current += 1;
    completionRef.current = null;
    previousLitCountRef.current = 0;
    setLevelIndex(safeIndex);
    setPuzzle(createPuzzleState(LEVELS[safeIndex]));
    setHistory([]);
    clearInteraction();
    setNotice('点选一枚银镜，开始整理光路。');
    setScreen('playing');
    setShowManual(false);
    setTutorialStep(withTutorial || (!save.tutorialCompleted && safeIndex === 0 && !autostart) ? 1 : null);
    audioRef.current?.playSelect();
  }, [autostart, clearInteraction, save.tutorialCompleted]);

  const commitAction = useCallback((action: PuzzleAction, assisted = false) => {
    if (screen !== 'playing' || puzzle.status !== 'playing') return;
    const next = applyPuzzleAction(level, puzzle, action, difficulty);
    if (next === puzzle) {
      setNotice('这里无法执行该动作，请选择高亮位置。');
      audioRef.current?.playError();
      return;
    }
    if (assisted) next.hintsUsed += 1;
    setHistory((items) => [...items, puzzle].slice(-80));
    setPuzzle(next);
    clearInteraction();
    setNotice(next.status === 'won' ? '所有花铃都已醒来。' : action.kind === 'rotate' ? '镜面已转动，光路重新汇流。' : '银镜已移位，检查新的光路。');
    if (action.kind === 'rotate') audioRef.current?.playRotate();
    else audioRef.current?.playMove();

    if (tutorialStep === 2 && action.kind === 'rotate') setTutorialStep(3);
    if (tutorialStep === 3 && action.kind === 'move') {
      setTutorialStep(null);
      setSave((previous) => ({ ...previous, tutorialCompleted: true }));
    }
  }, [clearInteraction, difficulty, level, puzzle, screen, tutorialStep]);

  const undo = useCallback(() => {
    const previous = history[history.length - 1];
    if (!previous) {
      setNotice('已经回到本关最初的状态。');
      audioRef.current?.playError();
      return;
    }
    setPuzzle(previous);
    setHistory((items) => items.slice(0, -1));
    clearInteraction();
    completionRef.current = null;
    setNotice('已撤销上一步，步数与花铃状态一同恢复。');
    audioRef.current?.playSelect();
  }, [clearInteraction, history]);

  const legalActions = useMemo(() => getLegalActions(level, puzzle), [level, puzzle]);
  const legalTargets = useMemo(() => {
    if (!moveMode || !selectedPieceId) return [];
    return legalActions
      .filter((action) => action.kind === 'move' && action.pieceId === selectedPieceId && action.to)
      .map((action) => action.to as Coord);
  }, [legalActions, moveMode, selectedPieceId]);

  const previewAction = pendingAction ?? hoverAction;
  const previewState = useMemo(() => {
    if (!previewAction || puzzle.status !== 'playing') return null;
    const next = applyPuzzleAction(level, puzzle, previewAction, difficulty);
    return next === puzzle ? null : next;
  }, [difficulty, level, previewAction, puzzle]);
  const displayedPuzzle = previewState ?? puzzle;
  const simulation = useMemo(() => simulateLight(level, displayedPuzzle.pieces), [displayedPuzzle.pieces, level]);
  const baseSimulation = useMemo(() => simulateLight(level, puzzle.pieces), [level, puzzle.pieces]);
  const litCount = baseSimulation.flowers.filter((flower) => flower.lit).length;
  const previewLitCount = simulation.flowers.filter((flower) => flower.lit).length;
  const selectedPiece = puzzle.pieces.find((piece) => piece.id === selectedPieceId && piece.kind === 'mirror') ?? null;
  const remainingMoves = Math.max(0, getMoveLimit(level, difficulty) - puzzle.moves);
  const hintsRemaining = Math.max(0, difficultyDef.hints - puzzle.hintsUsed);

  useEffect(() => {
    if (litCount > previousLitCountRef.current && puzzle.status !== 'won') audioRef.current?.playFlower();
    previousLitCountRef.current = litCount;
  }, [litCount, puzzle.status]);

  useEffect(() => {
    if (puzzle.status !== 'won') return;
    const completionKey = `${level.id}:${attemptRef.current}`;
    if (completionRef.current === completionKey) return;
    completionRef.current = completionKey;
    setSave((previous) => ({
      ...recordLevelCompletion(previous, levelIndex, difficulty, puzzle.moves),
      tutorialCompleted: previous.tutorialCompleted || levelIndex === 0,
    }));
    setTutorialStep(null);
    audioRef.current?.playWin();
  }, [difficulty, level.id, levelIndex, puzzle.moves, puzzle.status]);

  const selectDifficulty = (next: DifficultyTier) => {
    setDifficulty(next);
    setSave((previous) => ({ ...previous, preferredDifficulty: next }));
    audioRef.current?.playSelect();
  };

  const handleCellPress = (r: number, c: number, pointerType: string) => {
    if (screen !== 'playing' || puzzle.status !== 'playing') return;
    const piece = puzzle.pieces.find((item) => item.r === r && item.c === c && item.kind === 'mirror');
    if (piece) {
      if (tutorialStep === 1) setTutorialStep(2);
      if (pointerType !== 'mouse' && pointerType !== 'keyboard') {
        const rotateAction: PuzzleAction = { kind: 'rotate', pieceId: piece.id };
        if (selectedPieceId === piece.id && sameAction(pendingAction, rotateAction)) {
          commitAction(rotateAction);
        } else {
          setSelectedPieceId(piece.id);
          setMoveMode(false);
          setPendingAction(rotateAction);
          setHoverAction(null);
          setNotice('正在预演旋转，再点同一枚银镜或按确认执行。');
          audioRef.current?.playSelect();
        }
      } else {
        setSelectedPieceId(piece.id);
        setMoveMode(false);
        setPendingAction(null);
        setHoverAction(null);
        setNotice(piece.movable ? '可以旋转镜面，或进入移动模式。' : '这枚银镜位置固定，可以旋转镜面。');
        audioRef.current?.playSelect();
      }
      return;
    }

    if (moveMode && selectedPieceId) {
      const target = legalTargets.find((item) => item.r === r && item.c === c);
      if (target) {
        const action: PuzzleAction = { kind: 'move', pieceId: selectedPieceId, to: target };
        if (pointerType !== 'mouse' && pointerType !== 'keyboard') {
          if (sameAction(pendingAction, action)) commitAction(action);
          else {
            setPendingAction(action);
            setNotice('正在预演移动，再点同一格或按确认执行。');
            audioRef.current?.playSelect();
          }
        } else {
          commitAction(action);
        }
        return;
      }
    }
    setNotice(moveMode ? '只能移到相邻的空格，虚线光圈标出了可行位置。' : '先点选一枚银镜。');
  };

  const handleCellHover = (r: number, c: number) => {
    if (pendingAction || screen !== 'playing') return;
    if (moveMode && selectedPieceId && legalTargets.some((target) => target.r === r && target.c === c)) {
      setHoverAction({ kind: 'move', pieceId: selectedPieceId, to: { r, c } });
      return;
    }
    const piece = puzzle.pieces.find((item) => item.r === r && item.c === c && item.kind === 'mirror');
    if (piece && piece.id === selectedPieceId && piece.rotatable && !moveMode) {
      setHoverAction({ kind: 'rotate', pieceId: piece.id });
    } else {
      setHoverAction(null);
    }
  };

  const requestHint = () => {
    if (hintsRemaining <= 0 || puzzle.status !== 'playing') return;
    const hint = getHint(level, puzzle);
    if (!hint) {
      setNotice('当前光路较复杂，可以撤销几步或重开本关。');
      audioRef.current?.playError();
      return;
    }
    commitAction(hint, true);
  };

  const demonstrateTutorial = () => {
    if (tutorialStep === 1) {
      setSelectedPieceId('a');
      setTutorialStep(2);
      setNotice('已选中金镜，下一步旋转它。');
      audioRef.current?.playSelect();
      return;
    }
    const hint = getHint(level, puzzle);
    if (hint) commitAction(hint);
  };

  const skipTutorial = () => {
    setTutorialStep(null);
    setSave((previous) => ({ ...previous, tutorialCompleted: true }));
    clearInteraction();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (showManual) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (screen === 'playing') undo();
        return;
      }
      if (event.key === 'Escape') {
        if (puzzle.status !== 'playing') return;
        if (screen === 'playing') setScreen('paused');
        else if (screen === 'paused') setScreen('playing');
        clearInteraction();
        return;
      }
      if (screen !== 'playing' || puzzle.status !== 'playing') return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.toLowerCase() === 'r' && selectedPiece?.rotatable) {
        event.preventDefault();
        commitAction({ kind: 'rotate', pieceId: selectedPiece.id });
      }
      if (event.key.toLowerCase() === 'm' && selectedPiece?.movable) {
        event.preventDefault();
        setMoveMode(true);
        setPendingAction(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clearInteraction, commitAction, puzzle.status, screen, selectedPiece, showManual, undo]);

  useEffect(() => {
    if (showManual || screen === 'title' || (screen === 'playing' && puzzle.status === 'playing')) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = document.querySelector<HTMLElement>('.mm-result-modal');
    const focusable = dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]');
    focusable?.[0]?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trapFocus);
    return () => {
      document.removeEventListener('keydown', trapFocus);
      previous?.focus();
    };
  }, [puzzle.status, screen, showManual]);

  const completedCount = Object.keys(save.records).filter((id) => LEVELS.some((level) => level.id === id)).length;
  const closeManual = useCallback(() => setShowManual(false), []);

  if (screen === 'title') {
    const continueIndex = Math.min(save.unlockedLevel - 1, LEVELS.length - 1);
    return (
      <main className="mm-app mm-title-screen">
        <header className="mm-title-nav">
          <div className="mm-wordmark"><Moon size={20} /><span>月镜庭</span></div>
          <div className="mm-nav-actions">
            <button type="button" className="mm-text-button" onClick={() => setShowManual(true)}><BookOpen size={16} />观月手册</button>
            <button type="button" className="mm-icon-button" onClick={() => setSave((previous) => ({ ...previous, muted: !previous.muted }))} aria-label={save.muted ? '开启声音' : '静音'} title={save.muted ? '开启声音' : '静音'}>{save.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
          </div>
        </header>

        <div className="mm-title-content">
          <section className="mm-hero">
            <div className="mm-hero-copy">
              <p className="mm-kicker">光学机关解谜</p>
              <h1>月镜庭</h1>
              <p className="mm-hero-tagline">转动一束月光，<br />唤醒一座夜庭。</p>
              <p className="mm-hero-description">推移银镜，折转光路。九座手工机关庭园，从第一面镜子到三色合光，每一次改变都清晰可见。</p>
              <div className="mm-hero-actions">
                <button type="button" className="mm-primary-button mm-start-button" onClick={() => startLevel(continueIndex)} data-testid="start-game">
                  <Play size={18} fill="currentColor" />{completedCount > 0 ? `继续 · ${LEVELS[continueIndex].name}` : '走进夜庭'}<ChevronRight size={18} />
                </button>
                <button type="button" className="mm-secondary-button" onClick={() => startLevel(0, true)}><Sparkles size={17} />实战带教</button>
              </div>
              <div className="mm-difficulty-picker">
                <div className="mm-section-label"><span>游园节奏</span><span>{difficultyDef.description}</span></div>
                <div className="mm-difficulty-options" role="group" aria-label="难度选择">
                  {(Object.keys(DIFFICULTY_DEFS) as DifficultyTier[]).map((tier) => (
                    <button key={tier} type="button" aria-pressed={difficulty === tier} className={difficulty === tier ? 'is-active' : ''} onClick={() => selectDifficulty(tier)}>
                      <span>{DIFFICULTY_DEFS[tier].label}</span>
                      <small>{tier === 'casual' ? '宽裕步数 · 三次提示' : tier === 'standard' ? '三步余量 · 一次提示' : '最优步数 · 无提示'}</small>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mm-hero-art"><MoonGardenEmblem /></div>
          </section>

          <section className="mm-level-atlas" aria-labelledby="mm-atlas-title">
            <header>
              <div><p className="mm-kicker">夜庭图册</p><h2 id="mm-atlas-title">九次月升</h2></div>
              <span>已唤醒 {completedCount} / {LEVELS.length} 座</span>
            </header>
            {CHAPTERS.map((chapter) => (
              <div className="mm-chapter" key={chapter}>
                <h3>{chapter}</h3>
                <div className="mm-level-grid">
                  {LEVELS.filter((item) => item.chapter === chapter).map((item) => {
                    const unlocked = item.index < save.unlockedLevel;
                    const record = save.records[item.id];
                    return (
                      <button key={item.id} type="button" className={`mm-level-card ${record ? 'is-complete' : ''}`} disabled={!unlocked} onClick={() => startLevel(item.index)} data-testid={`level-${item.index}`}>
                        <span className="mm-level-number">第 {item.index + 1} 庭</span>
                        <strong>{unlocked ? item.name : '尚未月升'}</strong>
                        <span className="mm-level-subtitle">{unlocked ? item.subtitle : '唤醒前一座夜庭后解锁'}</span>
                        <span className="mm-level-record">
                          {!unlocked ? <><Lock size={14} />未解锁</> : record ? <><span className="mm-stars" aria-label={`${record.stars} 星`}>{[1, 2, 3].map((star) => <Star key={star} size={13} fill={star <= record.stars ? 'currentColor' : 'none'} className={star <= record.stars ? 'is-earned' : ''} />)}</span>最佳 {record.bestMoves} 步</> : <><Flower2 size={14} />等待点亮</>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        </div>
        {showManual && <TutorialModal onClose={closeManual} />}
      </main>
    );
  }

  return (
    <main className="mm-app mm-game-screen">
      <header className="mm-game-nav">
        <div className="mm-game-title">
          <button type="button" className="mm-icon-button" onClick={() => { setScreen('title'); clearInteraction(); }} aria-label="返回夜庭图册" title="返回夜庭图册"><Moon size={18} /></button>
          <div><span>{level.chapter} · 第 {level.index + 1} 庭</span><strong>{level.name}</strong></div>
        </div>
        <div className="mm-nav-actions">
          <button type="button" className="mm-text-button mm-help-button" onClick={() => setShowManual(true)}><BookOpen size={16} />手册</button>
          <button type="button" className="mm-icon-button" onClick={() => setSave((previous) => ({ ...previous, muted: !previous.muted }))} aria-label={save.muted ? '开启声音' : '静音'} title={save.muted ? '开启声音' : '静音'}>{save.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
          <button type="button" className="mm-icon-button" onClick={() => { setScreen('paused'); clearInteraction(); }} aria-label="暂停" title="暂停"><Pause size={18} /></button>
        </div>
      </header>

      <div className="mm-game-main">
        <div className="mm-game-layout">
          <section className="mm-play-column">
            <div className="mm-board-status">
              <div><Flower2 size={16} /><span>花铃</span><strong className="font-mono-num">{previewAction ? previewLitCount : litCount} / {level.flowers.length}</strong></div>
              <div><span>剩余步数</span><strong className="font-mono-num">{remainingMoves}</strong><span className="mm-par-label">最优 {level.par}</span></div>
            </div>
            <div className="mm-board-shell">
              <MoonBoard
                level={level}
                state={displayedPuzzle}
                simulation={simulation}
                selectedPieceId={selectedPieceId}
                legalTargets={legalTargets}
                pendingAction={pendingAction}
                preview={Boolean(previewState)}
                onCellPress={handleCellPress}
                onCellHover={handleCellHover}
                onHoverEnd={() => setHoverAction(null)}
              />
              {previewState && <div className="mm-preview-badge"><Sparkles size={13} />光路预演</div>}
              {pendingAction && (
                <div className="mm-confirm-bar" role="status">
                  <span>{actionText(pendingAction)}</span>
                  <button type="button" className="mm-confirm-button" onClick={() => commitAction(pendingAction)}><Check size={16} />确认执行</button>
                  <button type="button" className="mm-icon-button" onClick={() => { setPendingAction(null); setNotice('已取消预演，没有消耗步数。'); }} aria-label="取消预演" title="取消预演"><X size={17} /></button>
                </div>
              )}
            </div>

            {tutorialStep && (
              <div className="mm-onboarding" data-testid="tutorial-bar">
                <div className="mm-tutorial-icon"><Sparkles size={19} /></div>
                <div><strong>{tutorialStep === 1 ? '先找到金色光路上的银镜' : tutorialStep === 2 ? '让金光转向花铃' : '再挪动青色银镜'}</strong><p>{tutorialStep === 1 ? '点选中央的银镜。选镜不会消耗步数。' : tutorialStep === 2 ? '使用「旋转九十度」，观察金色光路如何改变。' : '选择下方青镜，进入「移动」，把它右移一格，完成本关。'}</p></div>
                <div className="mm-onboarding-actions"><button type="button" onClick={demonstrateTutorial}>一键示范</button><button type="button" onClick={skipTutorial}>跳过</button></div>
              </div>
            )}
            <p className="mm-notice" aria-live="polite">{notice}</p>
          </section>

          <aside className="mm-control-panel">
            <section className="mm-selection-panel">
              <p className="mm-kicker">{moveMode ? '选择落点' : '镜台'}</p>
              {selectedPiece ? (
                <>
                  <div className="mm-selected-title"><span className={`mm-orientation-swatch ${selectedPiece.orientation === 0 ? 'is-slash' : 'is-backslash'}`} /><div><strong>银镜 · {selectedPiece.orientation === 0 ? '左斜' : '右斜'}</strong><span>{selectedPiece.movable ? '镜座可移动' : '镜座已固定'}</span></div></div>
                  <div className="mm-piece-actions">
                    <button type="button" className="mm-primary-button" disabled={moveMode || !selectedPiece.rotatable} onMouseEnter={() => setHoverAction({ kind: 'rotate', pieceId: selectedPiece.id })} onMouseLeave={() => setHoverAction(null)} onClick={() => commitAction({ kind: 'rotate', pieceId: selectedPiece.id })} data-testid="rotate-selected"><RotateCw size={17} />旋转九十度</button>
                    <button type="button" className={moveMode ? 'mm-secondary-button is-active' : 'mm-secondary-button'} disabled={!selectedPiece.movable} onClick={() => { setMoveMode((value) => !value); setPendingAction(null); setHoverAction(null); setNotice(moveMode ? '已退出移动模式。' : '选择相邻的虚线光圈，预演移动结果。'); }} data-testid="move-selected"><Move size={17} />{moveMode ? '取消移动' : '移动银镜'}</button>
                  </div>
                </>
              ) : (
                <div className="mm-empty-selection"><Moon size={26} /><strong>选择一枚银镜</strong><p>镜面可以旋转，带虚线镜座的银镜还能逐格移动。</p></div>
              )}
            </section>

            <section className="mm-utility-controls" aria-label="本关操作">
              <button type="button" onClick={undo} disabled={history.length === 0}><Undo2 size={17} /><span>撤销</span></button>
              <button type="button" onClick={() => startLevel(levelIndex, Boolean(tutorialStep))}><RotateCcw size={17} /><span>重开</span></button>
              <button type="button" onClick={requestHint} disabled={hintsRemaining <= 0 || puzzle.status !== 'playing'} data-testid="hint-button"><Lightbulb size={17} /><span>寻光 {difficultyDef.hints > 0 ? `· ${hintsRemaining}` : ''}</span></button>
            </section>

            <section className="mm-level-brief">
              <div><span>本庭目标</span><strong>{level.subtitle}</strong></div>
              <div><span>{difficultyDef.label}难度</span><span>上限 {getMoveLimit(level, difficulty)} 步</span></div>
            </section>

            <section className="mm-light-legend">
              <span><i className="is-gold" />金光</span><span><i className="is-cyan" />青光</span><span><i className="is-rose" />朱光</span>
            </section>
          </aside>
        </div>
      </div>

      {screen === 'paused' && (
        <div className="mm-modal-backdrop">
          <section className="mm-result-modal" role="dialog" aria-modal="true" aria-labelledby="mm-pause-title">
            <Moon size={34} />
            <p className="mm-kicker">月轮暂歇</p><h2 id="mm-pause-title">光路会在这里等你</h2><p>当前棋局仍保留。回到夜庭后可继续旋转与移动。</p>
            <button type="button" className="mm-primary-button" onClick={() => setScreen('playing')}><Play size={17} />继续游园</button>
            <button type="button" className="mm-secondary-button" onClick={() => startLevel(levelIndex)}><RotateCcw size={17} />重新开始</button>
            <button type="button" className="mm-text-button" onClick={() => setScreen('title')}>返回夜庭图册</button>
          </section>
        </div>
      )}

      {puzzle.status === 'lost' && (
        <div className="mm-modal-backdrop">
          <section className="mm-result-modal" role="dialog" aria-modal="true" aria-labelledby="mm-lost-title">
            <Moon size={34} />
            <p className="mm-kicker">月光尚未抵达</p><h2 id="mm-lost-title">还差一条光路</h2><p>本庭的步数已经用完。撤销一步重新推演，或回到最初的布局。</p>
            <button type="button" className="mm-primary-button" onClick={undo} disabled={history.length === 0}><Undo2 size={17} />撤销一步</button>
            <button type="button" className="mm-secondary-button" onClick={() => startLevel(levelIndex)}><RotateCcw size={17} />重新游园</button>
            <button type="button" className="mm-text-button" onClick={() => setScreen('title')}>返回夜庭图册</button>
          </section>
        </div>
      )}

      {puzzle.status === 'won' && (
        <div className="mm-modal-backdrop mm-victory-backdrop">
          <section className="mm-result-modal mm-victory-modal" role="dialog" aria-modal="true" aria-labelledby="mm-won-title" data-testid="victory-modal">
            <div className="mm-victory-flower"><Flower2 size={40} /></div>
            <p className="mm-kicker">{level.index === LEVELS.length - 1 ? '满月已升' : '花铃已醒'}</p>
            <h2 id="mm-won-title">{level.index === LEVELS.length - 1 ? '九庭灯火，共此月明' : `${level.name}，重见清辉`}</h2>
            <div className="mm-result-stars" aria-label={`获得 ${getStars(level, puzzle.moves)} 星`}>{[1, 2, 3].map((star) => <Star key={star} size={26} fill={star <= getStars(level, puzzle.moves) ? 'currentColor' : 'none'} className={star <= getStars(level, puzzle.moves) ? 'is-earned' : ''} />)}</div>
            <p>用 {puzzle.moves} 步完成 · 最优 {level.par} 步{puzzle.hintsUsed > 0 ? ` · 寻光 ${puzzle.hintsUsed} 次` : ''}</p>
            <button type="button" className="mm-primary-button" onClick={() => level.index < LEVELS.length - 1 ? startLevel(levelIndex + 1) : setScreen('title')} data-testid="next-level">{level.index < LEVELS.length - 1 ? <><Play size={17} />前往下一庭</> : <><Moon size={17} />回到夜庭图册</>}<ChevronRight size={17} /></button>
            <button type="button" className="mm-text-button" onClick={() => setScreen('title')}>查看本关记录</button>
          </section>
        </div>
      )}

      {showManual && <TutorialModal onClose={closeManual} />}
    </main>
  );
}
