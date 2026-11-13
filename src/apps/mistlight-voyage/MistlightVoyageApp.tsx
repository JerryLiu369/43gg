import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  Compass,
  Flag,
  Lightbulb,
  Map,
  Play,
  RotateCcw,
  RotateCw,
  Send,
  SkipForward,
  Star,
  Undo2,
  Volume2,
  VolumeX,
  Waves,
  X,
  Lock,
} from 'lucide-react';
import { DIFFICULTY_DEFS, LEVELS, LIGHT_NAMES } from './content.ts';
import {
  act,
  changePosition,
  coordinate,
  createRun,
  hasTide,
  signal,
  solve,
  starRating,
  traceLight,
  undo,
} from './engine.ts';
import { isUnlocked, loadProgress, saveProgress } from './storage.ts';
import { createSound } from './audio.ts';
import { SeaBoard } from './SeaBoard.tsx';
import type { Action, Difficulty, Progress, Run } from './types.ts';
import './mistlight.css';

const sameAction = (a: Action | null, b: Action) =>
  a?.type === b.type &&
  (a.type === 'tide' || (b.type === 'rotate' && a.id === b.id));
const AUTOSTART =
  new URLSearchParams(window.location.search).get('autostart') === '1';
function initialProgress(): Progress {
  const saved = loadProgress();
  if (!saved.active) {
    const next = LEVELS.find((level) => !saved.records[level.id]) ?? LEVELS[0];
    saved.active = { levelId: next.id, run: createRun(next) };
  }
  return saved;
}
function ToolButton({
  label,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      {...props}
      className={`ml-tool ${props.className ?? ''}`}
      aria-label={label}
    >
      <span aria-hidden="true">{children}</span>
      <span className="ml-tooltip">{label}</span>
    </button>
  );
}
function Stars({ count }: { count: number }) {
  return (
    <span className="ml-stars" aria-label={`${count} 枚星`}>
      {[1, 2, 3].map((i) => (
        <Star
          key={i}
          size={18}
          aria-hidden="true"
          fill={i <= count ? 'currentColor' : 'none'}
          opacity={i <= count ? 1 : 0.25}
        />
      ))}
    </span>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      trigger?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="ml-modal"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) {
          const r = ref.current.getBoundingClientRect();
          if (
            event.clientX < r.left ||
            event.clientX > r.right ||
            event.clientY < r.top ||
            event.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="ml-modal-heading">
        <h2>{title}</h2>
        <ToolButton label="关闭" onClick={onClose}>
          <X size={20} />
        </ToolButton>
      </div>
      {children}
    </dialog>
  );
}
function TutorialModal({
  onClose,
  onReplay,
}: {
  onClose: () => void;
  onReplay: () => void;
}) {
  return (
    <Modal title="领航手册" onClose={onClose}>
      <p className="ml-muted">
        让对应颜色的光抵达每座灯塔，再发出通航信号。没有倒计时，随时可以撤回。
      </p>
      <div className="ml-guide-grid">
        <article>
          <svg viewBox="0 0 180 75" aria-hidden="true">
            <path
              d="M15 58H95V9"
              stroke="#f3c779"
              strokeWidth="2"
              fill="none"
            />
            <path d="m79 72 31-31" stroke="#c2d7c7" strokeWidth="7" />
            <circle cx="95" cy="9" r="5" fill="#f3c779" />
          </svg>
          <h3>镜塔 · 改变方向</h3>
          <p>
            每转一次，镜面切换一个朝向。鼠标悬停看预演，点击旋转；触屏先点选，再点同一塔确认。
          </p>
        </article>
        <article>
          <svg viewBox="0 0 180 75" aria-hidden="true">
            <path
              d="M15 58H165M95 58V9"
              stroke="#f3c779"
              strokeWidth="2"
              fill="none"
            />
            <path d="m79 72 31-31" stroke="#7cddd2" strokeWidth="5" />
            <path d="m86 72 31-31" stroke="#c2d7c7" strokeWidth="2" />
          </svg>
          <h3>分光塔 · 同时照亮</h3>
          <p>
            双层镜面将光分成直行与反射两束。所有灯塔必须同时接通，先亮后灭不算完成。
          </p>
        </article>
        <article>
          <svg viewBox="0 0 180 75" aria-hidden="true">
            <ellipse
              cx="80"
              cy="37"
              rx="33"
              ry="22"
              stroke="#7cddd2"
              strokeDasharray="4 4"
              fill="none"
            />
            <path
              d="m67 50 26-26M119 50q12-8 24 0t24 0"
              stroke="#7cddd2"
              strokeWidth="3"
              fill="none"
            />
          </svg>
          <h3>潮汐 · 牵动全局</h3>
          <p>
            涨潮时潮礁沉入水下，光可穿过；带虚线圆环的潮镜随潮翻转，不能单独旋转。
          </p>
        </article>
        <article>
          <svg viewBox="0 0 180 75" aria-hidden="true">
            <path d="M15 37H90" stroke="#f3c779" strokeWidth="3" />
            <path d="M90 65V37" stroke="#7cddd2" strokeWidth="3" />
            <circle cx="90" cy="30" r="12" fill="#f3c779" />
            <path d="M90 18a12 12 0 0 1 0 24Z" fill="#7cddd2" />
          </svg>
          <h3>双辉 · 两色相遇</h3>
          <p>
            金色灯塔接金光，青色灯塔接青光。双色灯塔需要两色同时抵达；交叉的光互不干扰。
          </p>
        </article>
      </div>
      <p className="ml-muted ml-key-help">
        键盘：Tab 选塔，回车旋转；Z 撤回，T 预演潮汐，Esc
        取消预演。使用提示后，本关最高两枚星。
      </p>
      <button type="button" className="ml-primary" onClick={onReplay}>
        <Play size={17} />
        重温三步实战
      </button>
    </Modal>
  );
}
export default function MistlightVoyageApp() {
  const [progress, setProgress] = useState(initialProgress);
  const [screen, setScreen] = useState<'title' | 'game'>(
    AUTOSTART ? 'game' : 'title',
  );
  const [modal, setModal] = useState<'guide' | 'map' | null>(null);
  const [tutorial, setTutorial] = useState<number | null>(null);
  const [pending, setPending] = useState<Action | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [storageFailed, setStorageFailed] = useState(false);
  const sound = useRef<ReturnType<typeof createSound> | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const levelIndex = Math.max(
    0,
    LEVELS.findIndex((level) => level.id === progress.active?.levelId),
  );
  const level = LEVELS[levelIndex];
  const run = progress.active!.run;
  const difficulty = progress.preferredDifficulty;
  const difficultyDef = DIFFICULTY_DEFS[difficulty];
  const trace = useMemo(() => traceLight(level, run), [level, run]);
  const optimum = useMemo(
    () => solve(level, createRun(level))!.actions.length,
    [level],
  );
  const previewAction = run.won
    ? null
    : (pending ?? (hover ? { type: 'rotate' as const, id: hover } : null));
  const previewPosition = previewAction
    ? changePosition(level, run, previewAction)
    : null;
  const preview = previewPosition ? traceLight(level, previewPosition) : null;
  const completed = LEVELS.filter((level) => progress.records[level.id]).length;
  const totalStars = Object.values(progress.records).reduce(
    (sum, entry) => sum + entry.stars,
    0,
  );

  useEffect(() => {
    sound.current = createSound();
    return () => {
      sound.current?.dispose();
      sound.current = null;
    };
  }, []);
  useEffect(() => {
    setStorageFailed(!saveProgress(progress));
  }, [progress]);
  useEffect(() => {
    if (run.won && screen === 'game') nextRef.current?.focus();
  }, [run.won, screen]);
  const setRun = (next: Run) =>
    setProgress((old) => ({
      ...old,
      active: { levelId: level.id, run: next },
    }));
  const clearPreview = () => {
    setPending(null);
    setHover(null);
  };
  const execute = (action: Action) => {
    if (run.won) return;
    setRun(act(level, run, action));
    clearPreview();
    setMessage('');
    sound.current?.play(
      action.type === 'tide' ? 'tide' : 'turn',
      progress.muted,
    );
    if (tutorial === 1 && action.type === 'rotate') setTutorial(2);
  };
  const selectTower = (id: string, pointer: string) => {
    if (run.won) return;
    const action: Action = { type: 'rotate', id };
    if (tutorial === 0) {
      setPending(action);
      setTutorial(1);
      return;
    }
    if (
      pointer === 'mouse' ||
      pointer === 'keyboard' ||
      sameAction(pending, action)
    )
      execute(action);
    else {
      setPending(action);
      setHover(null);
      setMessage('');
    }
  };
  const selectTide = () => {
    if (!hasTide(level) || run.won) return;
    if (pending?.type === 'tide') execute(pending);
    else {
      setPending({ type: 'tide' });
      setHover(null);
      setMessage('');
    }
  };
  const goToLevel = (index: number) => {
    const target = LEVELS[index];
    setProgress((old) => ({
      ...old,
      active: { levelId: target.id, run: createRun(target) },
    }));
    clearPreview();
    setMessage('');
    setModal(null);
    setTutorial(null);
    setScreen('game');
  };
  const start = () => {
    setScreen('game');
    clearPreview();
    if (!progress.tutorialCompleted && !AUTOSTART) {
      setProgress((old) => ({
        ...old,
        active: { levelId: LEVELS[0].id, run: createRun(LEVELS[0]) },
      }));
      setTutorial(0);
    }
  };
  const replay = () => {
    goToLevel(0);
    setTutorial(0);
  };
  const finishTutorial = () => {
    setTutorial(null);
    setProgress((old) => ({ ...old, tutorialCompleted: true }));
  };
  const sendSignal = () => {
    clearPreview();
    const next = signal(level, run);
    if (!next.won) {
      setMessage(
        `还有 ${level.beacons.length - trace.lit.length} 座灯塔未接通，继续调整镜塔。`,
      );
      return;
    }
    const stars = starRating(level, next, difficulty);
    setProgress((old) => {
      const previous = old.records[level.id];
      const better =
        !previous ||
        stars > previous.stars ||
        (stars === previous.stars && next.moves < previous.moves);
      return {
        ...old,
        tutorialCompleted: old.tutorialCompleted || tutorial !== null,
        active: { levelId: level.id, run: next },
        records: better
          ? {
              ...old.records,
              [level.id]: { stars, moves: next.moves, difficulty },
            }
          : old.records,
      };
    });
    setTutorial(null);
    setMessage('');
    sound.current?.play('signal', progress.muted);
  };
  const hint = () => {
    if (run.hints >= difficultyDef.hints || run.won) return;
    const solution = solve(level, run);
    if (!solution?.actions.length) {
      setMessage('所有灯塔已接通，现在可以发出通航信号。');
      return;
    }
    const action = solution.actions[0];
    setPending(action);
    setHover(null);
    setRun({ ...run, hints: run.hints + 1 });
    setMessage(
      action.type === 'tide'
        ? '建议切换潮汐。虚线显示改变后的整条光路。'
        : `建议旋转 ${coordinate(level.tiles.find((tile) => tile.id === action.id)!)} 镜塔。虚线是执行后的光路。`,
    );
  };
  const demo = () => {
    if (tutorial === 0) {
      setPending({ type: 'rotate', id: 'a' });
      setTutorial(1);
    } else if (tutorial === 1) execute({ type: 'rotate', id: 'a' });
    else sendSignal();
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        modal ||
        screen !== 'game' ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.target instanceof HTMLSelectElement
      )
        return;
      if (event.key === 'Escape') {
        clearPreview();
      }
      if (event.key.toLowerCase() === 'z' && !run.won) {
        event.preventDefault();
        setRun(undo(run));
        clearPreview();
        setMessage('');
        if (tutorial === 2) setTutorial(1);
      }
      if (event.key.toLowerCase() === 't') {
        event.preventDefault();
        selectTide();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const titleLevel = LEVELS[10];
  const titlePosition = useMemo(
    () => solve(titleLevel, createRun(titleLevel))!.position,
    [],
  );
  const titleTrace = useMemo(() => traceLight(titleLevel, titlePosition), []);
  const actionLabel =
    previewAction?.type === 'tide'
      ? run.tide
        ? '退潮'
        : '涨潮'
      : previewAction?.type === 'rotate'
        ? `旋转 ${coordinate(level.tiles.find((tile) => tile.id === previewAction.id)!)}`
        : '';
  const shownTrace = preview ?? trace;
  return (
    <main className={`ml-app ${screen === 'title' ? 'ml-title-mode' : ''}`}>
      <div className="ml-frame">
        <header className="ml-header">
          <button
            type="button"
            className="ml-brand"
            onClick={() => {
              setScreen('title');
              clearPreview();
            }}
            aria-label="返回雾海折光标题页"
          >
            <Compass size={24} />
            <span>雾海折光</span>
          </button>
          <div className="ml-header-tools">
            {screen === 'game' && (
              <button
                type="button"
                className="ml-text-button"
                onClick={() => setModal('map')}
              >
                <Map size={17} />
                航路图
              </button>
            )}
            <ToolButton label="领航手册" onClick={() => setModal('guide')}>
              <BookOpen size={19} />
            </ToolButton>
            <ToolButton
              label={progress.muted ? '开启声音' : '关闭声音'}
              onClick={() => {
                setProgress((old) => ({ ...old, muted: !old.muted }));
                if (progress.muted) sound.current?.play('turn', false);
              }}
            >
              <>
                {progress.muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
              </>
            </ToolButton>
          </div>
        </header>
        {screen === 'title' ? (
          <section className="ml-title-layout">
            <div className="ml-title-copy">
              <div className="ml-title-chapter">十二道谜题 · 一程归航</div>
              <h1>
                雾海
                <br />
                <span>折光</span>
                <span className="ml-title-seal" aria-hidden="true">
                  <Compass size={28} />
                </span>
              </h1>
              <p className="ml-intro">
                转动镜塔，把光送往海的另一端。
                <br />
                在潮汐与群岛之间，找回回家的航路。
              </p>
              <div className="ml-difficulty" role="group" aria-label="航行难度">
                {(Object.keys(DIFFICULTY_DEFS) as Difficulty[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={difficulty === key}
                    onClick={() =>
                      setProgress((old) => ({
                        ...old,
                        preferredDifficulty: key,
                      }))
                    }
                  >
                    {DIFFICULTY_DEFS[key].name}
                  </button>
                ))}
              </div>
              <p className="ml-difficulty-note">{difficultyDef.description}</p>
              <button
                type="button"
                className="ml-primary ml-start"
                onClick={start}
              >
                <Play size={18} fill="currentColor" />
                {completed || run.moves ? '继续航程' : '启程'}
                <ArrowRight size={19} />
              </button>
              <div className="ml-title-secondary">
                <button
                  type="button"
                  className="ml-text-button"
                  onClick={() => setModal('map')}
                >
                  <Map size={16} />
                  航路图
                </button>
                <button
                  type="button"
                  className="ml-text-button"
                  onClick={replay}
                >
                  <RotateCw size={16} />
                  实战领航
                </button>
              </div>
              {completed > 0 && (
                <p className="ml-saved-progress">
                  已通航 {completed} / {LEVELS.length} 海域 · 收集 {totalStars}{' '}
                  枚星
                </p>
              )}
            </div>
            <div className="ml-title-art">
              <SeaBoard
                level={titleLevel}
                position={titlePosition}
                trace={titleTrace}
                cinematic
              />
              <div className="ml-art-caption">
                <span>镜塔将光折向远方</span>
                <span>灯塔等你点亮</span>
              </div>
            </div>
          </section>
        ) : (
          <>
            <div className="ml-game-heading">
              <div>
                <p className="ml-section-label">
                  {level.chapter} · 海域{' '}
                  {String(levelIndex + 1).padStart(2, '0')} / {LEVELS.length}
                </p>
                <h1>{level.name}</h1>
              </div>
              <span className="ml-difficulty-label">{difficultyDef.name}</span>
            </div>
            {tutorial !== null && (
              <aside className="ml-onboarding" aria-label="实战领航">
                <div>
                  <span className="ml-step">{tutorial + 1} / 3</span>
                  <div>
                    <strong>
                      {
                        ['选一座镜塔', '看清光路，再转镜', '为归人发出信号'][
                          tutorial
                        ]
                      }
                    </strong>
                    <p>
                      {
                        [
                          '点选海图中央 D5 的镜塔。光路虚线会显示旋转后的去向。',
                          '再次点镜塔，或按「确认执行」。让金光抵达上方的 D2 灯塔。',
                          '灯塔已接通。按「发出通航信号」，完成第一段航程。',
                        ][tutorial]
                      }
                    </p>
                  </div>
                </div>
                <div className="ml-onboard-tools">
                  <button type="button" onClick={demo}>
                    示范这一步
                  </button>
                  <ToolButton label="跳过引导" onClick={finishTutorial}>
                    <SkipForward size={17} />
                  </ToolButton>
                </div>
              </aside>
            )}
            <div className="ml-play-layout">
              <section
                className="ml-sea-region"
                aria-label={`${level.name}海图`}
              >
                <SeaBoard
                  level={level}
                  position={run}
                  trace={trace}
                  preview={preview}
                  previewPosition={previewPosition}
                  selected={
                    previewAction?.type === 'rotate' ? previewAction.id : null
                  }
                  onHover={setHover}
                  onChoose={selectTower}
                  celebrating={run.won}
                />
                <div className="ml-board-caption">
                  <span>
                    <i className="ml-beam-key" />
                    光路{preview ? ' · 虚线为预演' : ''}
                  </span>
                  <span>
                    {hasTide(level)
                      ? run.tide
                        ? '涨潮 · 潮礁已沉没'
                        : '退潮 · 潮礁露出'
                      : '点选镜塔，改变光的方向'}
                  </span>
                </div>
              </section>
              <aside className="ml-command">
                {run.won ? (
                  <section className="ml-victory" aria-live="polite">
                    <div className="ml-victory-symbol">
                      <Flag size={28} />
                    </div>
                    <p className="ml-section-label">
                      {completed === LEVELS.length
                        ? '群岛的灯，全部亮了'
                        : '这片海域已通航'}
                    </p>
                    <h2>
                      {completed === LEVELS.length
                        ? '欢迎归航'
                        : '远方，有了回应'}
                    </h2>
                    <Stars count={starRating(level, run, difficulty)} />
                    <p>
                      用 {run.moves} 步接通 {level.beacons.length} 座灯塔。
                      {run.hints
                        ? `使用了 ${run.hints} 次提示。`
                        : '没有借助提示。'}
                    </p>
                    <button
                      ref={nextRef}
                      type="button"
                      className="ml-primary"
                      onClick={() => {
                        if (levelIndex + 1 < LEVELS.length)
                          goToLevel(levelIndex + 1);
                        else setModal('map');
                      }}
                    >
                      {levelIndex + 1 < LEVELS.length
                        ? '驶向下一海域'
                        : '回看完整航路'}
                      <ArrowRight size={18} />
                    </button>
                    <button
                      type="button"
                      className="ml-text-button"
                      onClick={() => goToLevel(levelIndex)}
                    >
                      <RotateCcw size={16} />
                      再走一条更短的路
                    </button>
                  </section>
                ) : (
                  <>
                    <div className="ml-objective">
                      <span className="ml-section-label">本次航路</span>
                      <p>{level.description}</p>
                    </div>
                    <div className="ml-status">
                      <span>{preview ? '预演接通' : '接通灯塔'}</span>
                      <strong>
                        {shownTrace.lit.length}
                        <small> / {level.beacons.length}</small>
                      </strong>
                    </div>
                    <div className="ml-beacons">
                      {level.beacons.map((beacon) => (
                        <div
                          key={beacon.id}
                          className={
                            shownTrace.lit.includes(beacon.id) ? 'is-lit' : ''
                          }
                        >
                          <span
                            className={`ml-beacon-dot light-${beacon.color}`}
                          />
                          <span>
                            {coordinate(beacon)} · {LIGHT_NAMES[beacon.color]}
                          </span>
                          {shownTrace.lit.includes(beacon.id) ? (
                            <Check size={15} />
                          ) : (
                            <span className="ml-beacon-wait">
                              {beacon.color === 3 &&
                              shownTrace.received[beacon.id]
                                ? shownTrace.received[beacon.id] === 1
                                  ? '缺青光'
                                  : '缺金光'
                                : '待接通'}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="ml-move-count">
                      <span>
                        转镜 / 转潮 <b>{run.moves}</b>
                      </span>
                      <span>
                        三枚星 ≤ {optimum + difficultyDef.allowance} 步
                      </span>
                    </div>
                    <div
                      className={`ml-preview ${preview ? 'has-preview' : ''}`}
                      aria-live="polite"
                    >
                      <strong>
                        {preview
                          ? `${actionLabel}之后`
                          : trace.solved
                            ? '所有灯塔已接通'
                            : '先看光，再动手'}
                      </strong>
                      <p>
                        {message ||
                          (preview
                            ? `将接通 ${preview.lit.length} / ${level.beacons.length} 座灯塔。${preview.solved ? '整条航路就绪。' : '虚线显示完整变化。'}`
                            : trace.solved
                              ? '发出信号，让航船穿过这片海域。'
                              : '点选镜塔预演。触屏再点一次，或按确认执行。')}
                      </p>
                      {pending && (
                        <div className="ml-preview-actions">
                          <button
                            type="button"
                            className="ml-confirm"
                            onClick={() => execute(pending)}
                          >
                            <Check size={16} />
                            确认执行
                          </button>
                          <ToolButton label="取消预演" onClick={clearPreview}>
                            <X size={17} />
                          </ToolButton>
                        </div>
                      )}
                    </div>
                    {hasTide(level) && (
                      <button
                        type="button"
                        className="ml-tide"
                        onClick={selectTide}
                        aria-pressed={pending?.type === 'tide'}
                      >
                        <Waves size={20} />
                        <span>{run.tide ? '预演退潮' : '预演涨潮'}</span>
                        <RotateCw size={15} />
                      </button>
                    )}
                    <button
                      type="button"
                      className={`ml-primary ml-signal ${trace.solved ? 'is-ready' : ''}`}
                      onClick={sendSignal}
                    >
                      <Send size={17} />
                      发出通航信号
                      <ArrowRight size={17} />
                    </button>
                    <div className="ml-bottom-tools">
                      <ToolButton
                        label="撤回一步（Z）"
                        disabled={!run.history.length}
                        onClick={() => {
                          setRun(undo(run));
                          clearPreview();
                          setMessage('');
                          if (tutorial === 2) setTutorial(1);
                        }}
                      >
                        <Undo2 size={19} />
                      </ToolButton>
                      <ToolButton
                        label="重新开始本关"
                        disabled={!run.moves && !run.hints}
                        onClick={() => {
                          setRun(createRun(level));
                          clearPreview();
                          setMessage('');
                          if (tutorial !== null) setTutorial(0);
                        }}
                      >
                        <RotateCcw size={18} />
                      </ToolButton>
                      <button
                        type="button"
                        className="ml-hint"
                        disabled={run.hints >= difficultyDef.hints}
                        onClick={hint}
                      >
                        <Lightbulb size={17} />
                        <span>
                          {difficulty === 'expert'
                            ? '专家档不提供提示'
                            : `提示${Number.isFinite(difficultyDef.hints) ? ` ${Math.max(0, difficultyDef.hints - run.hints)}` : ''}`}
                        </span>
                      </button>
                    </div>
                  </>
                )}
              </aside>
            </div>
          </>
        )}
        <footer className="ml-footer">
          <span>
            {screen === 'title'
              ? '无需赶路，光会等你。'
              : '每一次撤回，都是另一种可能。'}
          </span>
          <span>
            {storageFailed
              ? '浏览器无法保存，当前航程仅在本次有效'
              : '航程自动保存在此浏览器'}
          </span>
        </footer>
      </div>
      {modal === 'guide' && (
        <TutorialModal onClose={() => setModal(null)} onReplay={replay} />
      )}
      {modal === 'map' && (
        <Modal title="群岛航路图" onClose={() => setModal(null)}>
          <p className="ml-muted">
            已通航 {completed} / {LEVELS.length} 海域 · {totalStars} /{' '}
            {LEVELS.length * 3} 枚星。完成前一片海域，即可继续向前。
          </p>
          {['初航', '潮间', '归航'].map((chapter) => (
            <section className="ml-map-chapter" key={chapter}>
              <h3>{chapter}</h3>
              <div className="ml-level-grid">
                {LEVELS.map((item, index) =>
                  item.chapter === chapter ? (
                    <button
                      key={item.id}
                      type="button"
                      className="ml-level-card"
                      disabled={!isUnlocked(item.id, progress)}
                      onClick={() => goToLevel(index)}
                    >
                      <span className="ml-level-number">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <strong>{item.name}</strong>
                      {isUnlocked(item.id, progress) ? (
                        <Stars count={progress.records[item.id]?.stars ?? 0} />
                      ) : (
                        <Lock size={15} />
                      )}
                    </button>
                  ) : null,
                )}
              </div>
            </section>
          ))}
        </Modal>
      )}
    </main>
  );
}
