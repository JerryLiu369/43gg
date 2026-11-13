import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Bot, Check, GraduationCap, RotateCcw, RotateCw, Settings2, Sparkles, Trophy, Undo2 } from 'lucide-react';
import { coordKey, type Action, type GameEvent, type Rotation } from './engine/index.ts';
import { getCatalog } from './lib/catalog.ts';
import {
  COLOR_HEX,
  FIGURE_NAMES,
  GOOD_NAMES,
  describeAction,
  describeEvent,
  describePending,
  type LabelContext,
} from './lib/labels.ts';
import type { ClientView, LocalSeat } from './lib/types.ts';
import { BoardCanvas, type FeatureTarget, type SquareTarget } from './BoardCanvas.tsx';
import { FigureGlyph } from './FigureGlyph.tsx';
import { GuideBar } from './GuideBar.tsx';
import type { FcGuideStep } from './guide.ts';
import { SoundControl } from './SoundControl.tsx';
import { TileArt } from './TileArt.tsx';
import { sound } from './sound.ts';

const cat = getCatalog();

type MobileTab = 'play' | 'players' | 'log';

interface Props {
  view: ClientView;
  seats: LocalSeat[];
  humanSeat: number;
  legal: Action[];
  log: GameEvent[];
  seq: number;
  error: string | null;
  busy: boolean;
  onAction: (action: Action) => void;
  onOpenTour: () => void;
  onOpenRules: () => void;
  onRematch: () => void;
  onNewSetup: () => void;
  /** Current guided step, or null when the guide is off. */
  guideStep: FcGuideStep | null;
  /** A placement that scores right away for the human, if any (used by the guide demo). */
  suggestedPlacement: Action | null;
  onSkipGuide: () => void;
}

function actionSpot(a: Action, view: ClientView): { x: number; y: number; feature: number } | null {
  const fig = (id: number | undefined) => view.figures.find((f) => f.id === id) ?? null;
  switch (a.type) {
    case 'PLACE_FIGURE':
      return { x: view.turn.part.x, y: view.turn.part.y, feature: a.feature };
    case 'LAND':
      return view.pending?.type === 'LAND' ? { x: view.pending.x, y: view.pending.y, feature: a.feature } : null;
    case 'PLACE_MAGIC':
      return { x: a.x, y: a.y, feature: a.feature };
    case 'RESOLVE_MESSAGE':
    case 'CROP_REMOVE': {
      const f = fig(a.figureId);
      return f && { x: f.x, y: f.y, feature: f.feature };
    }
    case 'CROP_ADD': {
      const f = fig(a.nextTo);
      return f && { x: f.x, y: f.y, feature: f.feature };
    }
    default:
      return null;
  }
}

export function GameScreen({
  view,
  seats,
  humanSeat,
  legal,
  log,
  seq,
  error,
  busy,
  onAction,
  onOpenTour,
  onOpenRules,
  onRematch,
  onNewSetup,
  guideStep,
  suggestedPlacement,
  onSkipGuide,
}: Props) {
  const orderedSeats = useMemo(() => [...seats].sort((a, b) => a.seatIndex - b.seatIndex), [seats]);
  const names = orderedSeats.map((p) => p.displayName);
  const colors = orderedSeats.map((p) => COLOR_HEX[p.color]);
  const ctx: LabelContext = { view, names, cat };
  const pending = view.pending;

  const [sel, setSel] = useState<{ x: number; y: number; rotation: Rotation } | null>(null);
  const [preferredRotation, setPreferredRotation] = useState<Rotation>(0);
  const [spot, setSpot] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('play');
  const [hint, setHint] = useState<string | null>(null);
  // Touch and pen taps first select a spot (preview), a second tap or the confirm button acts.
  const pointerType = useRef<string>('mouse');

  useEffect(() => {
    setSel(null);
    setSpot(null);
    setHint(null);
  }, [seq]);

  const rotationsBySquare = useMemo(() => {
    const m = new Map<string, { x: number; y: number; rotations: Rotation[] }>();
    for (const a of legal) {
      if (a.type !== 'PLACE_TILE') continue;
      const k = coordKey(a.x, a.y);
      if (!m.has(k)) m.set(k, { x: a.x, y: a.y, rotations: [] });
      m.get(k)!.rotations.push(a.rotation);
    }
    return m;
  }, [legal]);

  const placing = pending?.type === 'PLACE_TILE' && rotationsBySquare.size > 0;
  const rotsForSel = sel ? (rotationsBySquare.get(coordKey(sel.x, sel.y))?.rotations ?? []) : [];
  const isLegal = sel ? rotsForSel.includes(sel.rotation) : false;

  const rotate = useCallback(
    (dir: 1 | -1 = 1) => {
      if (sel) {
        const next = (((sel.rotation + dir * 90 + 360) % 360) as Rotation);
        setSel({ ...sel, rotation: next });
        setPreferredRotation(next);
      } else {
        setPreferredRotation((r) => (((r + dir * 90 + 360) % 360) as Rotation));
      }
    },
    [sel],
  );

  const confirmTile = useCallback(() => {
    if (!sel || !pending || pending.type !== 'PLACE_TILE' || !isLegal) return;
    onAction({ type: 'PLACE_TILE', player: pending.player, x: sel.x, y: sel.y, rotation: sel.rotation });
  }, [sel, pending, onAction, isLegal]);

  useEffect(() => {
    if (!placing) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'r' || e.key === 'R') rotate(e.shiftKey ? -1 : 1);
      if (e.key === 'Enter') confirmTile();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placing, rotate, confirmTile]);

  const squares: SquareTarget[] = [];
  if (placing) {
    for (const [k, s] of rotationsBySquare) {
      squares.push({
        key: `p${k}`,
        x: s.x,
        y: s.y,
        selected: sel !== null && coordKey(sel.x, sel.y) === k,
        onClick: () => {
          sound.play('click');
          if (sel && coordKey(sel.x, sel.y) === k) {
            const i = s.rotations.indexOf(sel.rotation);
            const next = s.rotations[(i + 1) % s.rotations.length];
            setSel({ ...sel, rotation: next });
            setPreferredRotation(next);
          } else {
            const rotation = s.rotations.includes(preferredRotation) ? preferredRotation : s.rotations[0];
            setSel({ x: s.x, y: s.y, rotation });
          }
        },
      });
    }
  }
  for (const a of legal) {
    if (a.type === 'PLACE_GOLD' || a.type === 'PICK_GOLD') {
      const key = `g${a.x},${a.y}`;
      squares.push({
        key,
        x: a.x,
        y: a.y,
        label: '银',
        selected: spot === key,
        onClick: () => {
          if (pointerType.current === 'mouse' || spot === key) onAction(a);
          else setSpot(key);
        },
      });
    }
  }

  const bySpot = useMemo(() => {
    const m = new Map<string, { x: number; y: number; feature: number; actions: Action[] }>();
    for (const a of legal) {
      const s = actionSpot(a, view);
      if (!s) continue;
      const k = `${s.x},${s.y}#${s.feature}`;
      if (!m.has(k)) m.set(k, { ...s, actions: [] });
      m.get(k)!.actions.push(a);
    }
    return m;
  }, [legal, view]);

  const features: FeatureTarget[] = [...bySpot.entries()].map(([k, s]) => ({
    key: k,
    x: s.x,
    y: s.y,
    feature: s.feature,
    selected: spot === k,
    label: s.actions.map((a) => describeAction(a, ctx)).join(' / '),
    onClick: () => {
      if (s.actions.length === 1 && (pointerType.current === 'mouse' || spot === k)) onAction(s.actions[0]);
      else setSpot(k);
    },
  }));

  const inHand = view.turn.part.tileId && !view.turn.part.placed ? view.turn.part.tileId : null;
  const ghost = placing && sel && pending?.type === 'PLACE_TILE' ? { tileId: pending.tileId, ...sel, legal: isLegal } : null;
  const focus = sel ?? (view.turn.part.placed ? { x: view.turn.part.x, y: view.turn.part.y } : null);

  const otherActions = legal.filter((a) => a.type !== 'PLACE_TILE');
  const goldSpot = spot?.startsWith('g') ? legal.find((a) => (a.type === 'PLACE_GOLD' || a.type === 'PICK_GOLD') && `g${a.x},${a.y}` === spot) : undefined;
  const spotActions = spot ? (goldSpot ? [goldSpot] : (bySpot.get(spot)?.actions ?? [])) : [];

  const runGuideDemo = () => {
    sound.play('click');
    setMobileTab('play');
    if (guideStep === 'figure') {
      const first = [...bySpot.keys()][0];
      if (first) {
        setSpot(first);
        setHint('已选好一个位置，看下面的按钮再确认；也可以点版图上别的圆点。');
      } else if (legal.some((a) => a.type === 'SKIP_FIGURE')) {
        setHint('这块地上没有能派人的地方，点「这回合不派人」继续。');
      } else {
        setHint('先放好地块，圆点会出现在刚放的那一块上。');
      }
      return;
    }
    if (!placing) {
      setHint('等轮到你摸到地块后再试。');
      return;
    }
    const fallback = legal.find((a) => a.type === 'PLACE_TILE');
    const pick = (guideStep === 'score' ? suggestedPlacement : null) ?? suggestedPlacement ?? fallback;
    if (pick?.type === 'PLACE_TILE') {
      setSel({ x: pick.x, y: pick.y, rotation: pick.rotation });
      setHint(
        guideStep === 'score' && !suggestedPlacement
          ? '这一块暂时封不了口，先接在你随从所在的地形旁边，下一块再收尾。'
          : '已帮你摆好预览，确认放置即可。',
      );
    }
  };
  const events = log
    .map((e, i) => ({ i, text: describeEvent(e, { names, cat }) }))
    .filter((e): e is { i: number; text: string } => e.text !== null)
    .reverse()
    .slice(0, 60);
  const finished = view.finished && view.final;

  const myState = view.players[humanSeat];
  const remainingTiles = view.drawPileCount + view.riverPileCount;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <header className="fc-topbar select-none">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-semibold text-amber-200 tabular-nums">
            第 {view.turn.number} 回合 · 剩 {remainingTiles} 块
          </span>
          {myState && (
            <span className="hidden sm:inline text-xs text-slate-300 tabular-nums">
              你的得分：<b className="text-amber-300">{myState.score}</b> 分
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              sound.play('toggle');
              onOpenTour();
            }}
            className="fc-btn secondary py-1 px-2.5 text-xs"
            title="重温新手引导"
            aria-label="重温新手引导"
          >
            <GraduationCap className="size-3.5" />
            <span className="hidden sm:inline">引导</span>
          </button>
          <button
            type="button"
            onClick={onOpenRules}
            className="fc-btn py-1 px-2.5 text-xs"
            title="图文手册"
            aria-label="图文手册"
          >
            <BookOpen className="size-3.5" />
            <span className="hidden sm:inline">手册</span>
          </button>
          <SoundControl />
          <button
            type="button"
            onClick={onNewSetup}
            className="fc-btn py-1 px-2.5 text-xs"
            title="回到对局设置"
            aria-label="回到对局设置"
          >
            <Settings2 className="size-3.5" />
          </button>
        </div>
      </header>

      {guideStep && !view.finished && <GuideBar step={guideStep} onDemo={runGuideDemo} onSkip={onSkipGuide} />}

      <div
        className="fc-game"
        onPointerDownCapture={(event) => {
          pointerType.current = event.pointerType || 'mouse';
        }}
        onKeyDownCapture={() => {
          pointerType.current = 'mouse';
        }}
      >
        <BoardCanvas
          view={view}
          cat={cat}
          colors={colors}
          squares={squares}
          ghost={ghost}
          features={features}
          focus={focus}
        />

        <aside className="fc-sidebar">
          {pending && !finished && (
            <div className={`fc-pending ${legal.length ? 'mine' : ''}`}>
              {legal.length ? '轮到你：' : '等待：'}
              {describePending(pending, ctx)}
            </div>
          )}

          {finished && view.final && (
            <div className="fc-panel border-amber-400/40 bg-amber-400/10">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 fc-display text-base font-bold text-amber-200">
                  <Trophy className="size-4" />
                  {view.final.winners.includes(humanSeat) ? '恭喜你取得胜利！' : '终局结算完成'}
                </span>
                <button type="button" onClick={onRematch} className="fc-btn primary py-1 px-3 text-xs">
                  再来一局
                </button>
              </div>
            </div>
          )}

          <div className="flex shrink-0 gap-1 rounded-xl border border-white/10 bg-black/25 p-1 min-[901px]:hidden">
            {(
              [
                ['play', '操作'],
                ['players', '玩家'],
                ['log', '记录'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMobileTab(key)}
                className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition cursor-pointer ${
                  mobileTab === key ? 'bg-amber-400/20 text-amber-200' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className={`space-y-3 ${mobileTab !== 'play' ? 'hidden min-[901px]:block' : ''}`}>
            {inHand && (
              <section className="fc-panel flex items-start gap-3" data-coach="tile-hand">
                <div className="rounded-xl border border-amber-400/25 bg-black/40 p-1.5 shrink-0">
                  <svg viewBox="-4 -4 108 108" width={82} height={82}>
                    <TileArt def={cat.tiles[inHand]} rotation={sel?.rotation ?? preferredRotation} />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-amber-300">摸到的地块</div>
                  {placing ? (
                    <>
                      <p className="mt-1 text-[11px] leading-4 text-slate-300">
                        点版图上的虚线方格预览摆法，再点同一格或旋转键换朝向（键盘按 R）。
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          className="fc-btn text-xs py-1 px-2.5"
                          onClick={() => {
                            sound.play('click');
                            rotate(-1);
                          }}
                          disabled={busy}
                          title="逆时针旋转 90 度"
                          aria-label="逆时针旋转"
                        >
                          <RotateCcw className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          className="fc-btn text-xs py-1 px-2.5"
                          onClick={() => {
                            sound.play('click');
                            rotate(1);
                          }}
                          disabled={busy}
                          title="顺时针旋转 90 度"
                          aria-label="顺时针旋转"
                        >
                          <RotateCw className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          className="fc-btn primary text-xs py-1 px-3"
                          disabled={!sel || !isLegal || busy}
                          onClick={confirmTile}
                          style={!isLegal && sel ? { background: '#7f1d1d', borderColor: '#ef4444', color: '#fca5a5' } : undefined}
                        >
                          {isLegal || !sel ? <Check className="size-3.5" /> : null}
                          {!sel ? '先选位置' : isLegal ? '确认放置' : '边缘接不上'}
                        </button>
                      </div>
                      {sel && !isLegal && (
                        <p className="mt-1.5 text-[11px] font-semibold text-red-400">
                          这个朝向有边接不上，再转一转。
                        </p>
                      )}
                      {sel && isLegal && (
                        <p className="mt-1.5 text-[11px] font-semibold text-amber-300">
                          四边都接上了，可以确认放置。
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">{names[view.turn.player]} 正在思考…</p>
                  )}
                </div>
              </section>
            )}

            {otherActions.length > 0 && (
              <section className="fc-panel space-y-2" data-coach="figure-actions">
                {spotActions.length > 0 && (
                  <div className="space-y-1.5 pb-2 border-b border-white/10">
                    <div className="text-xs font-semibold text-amber-300">确认这一步</div>
                    {spotActions.map((a, i) => (
                      <button
                        key={`s${i}`}
                        type="button"
                        className="fc-btn primary w-full justify-start text-left"
                        disabled={busy}
                        onClick={() => onAction(a)}
                      >
                        <Check className="size-3.5 shrink-0" />
                        {describeAction(a, ctx)}
                      </button>
                    ))}
                    <button type="button" className="fc-btn ghost w-full text-xs" onClick={() => setSpot(null)}>
                      换个位置
                    </button>
                  </div>
                )}
                {bySpot.size > 0 && (
                  <p className="text-[11px] text-slate-400">点版图上的圆点预选位置，或直接在下面选：</p>
                )}
                <div className="flex flex-col gap-1.5">
                  {otherActions.map((a, i) => (
                    <button
                      key={i}
                      type="button"
                      className="fc-btn w-full justify-start text-left"
                      disabled={busy}
                      onClick={() => onAction(a)}
                    >
                      {describeAction(a, ctx)}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {hint && !error && (
              <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100" role="status">
                {hint}
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-400/35 bg-red-500/15 px-3 py-2 text-xs text-red-200">
                {error}
              </div>
            )}

            {finished && view.final && (
              <section className="fc-panel space-y-3">
                <h3 className="fc-display text-sm font-bold text-amber-200">终局得分明细</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-white/10 text-[11px] text-slate-400">
                      <tr>
                        <th className="py-1.5 pr-2">玩家</th>
                        <th className="py-1.5 px-1 text-right">总分</th>
                        <th className="py-1.5 px-1 text-right">城</th>
                        <th className="py-1.5 px-1 text-right">路</th>
                        <th className="py-1.5 px-1 text-right">寺</th>
                        <th className="py-1.5 px-1 text-right">田</th>
                        <th className="py-1.5 pl-1 text-right">其他</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderedSeats
                        .map((p) => ({
                          p,
                          s: view.final!.scores[p.seatIndex],
                          b: view.final!.breakdown[p.seatIndex],
                        }))
                        .sort((a, b) => b.s - a.s)
                        .map(({ p, s, b }) => (
                          <tr
                            key={p.id}
                            className={`border-b border-white/[0.06] ${
                              view.final!.winners.includes(p.seatIndex) ? 'bg-amber-400/10 font-semibold text-amber-100' : ''
                            }`}
                          >
                            <td className="py-1.5 pr-2">
                              <span className="inline-flex items-center gap-1.5">
                                <span className="fc-swatch" style={{ background: COLOR_HEX[p.color] }} />
                                <span className="truncate max-w-20">{p.displayName}</span>
                              </span>
                            </td>
                            <td className="py-1.5 px-1 text-right tabular-nums font-bold">{s}</td>
                            <td className="py-1.5 px-1 text-right tabular-nums">{b.cities}</td>
                            <td className="py-1.5 px-1 text-right tabular-nums">{b.roads}</td>
                            <td className="py-1.5 px-1 text-right tabular-nums">{b.monasteries + b.gardens}</td>
                            <td className="py-1.5 px-1 text-right tabular-nums">{b.fields}</td>
                            <td className="py-1.5 pl-1 text-right tabular-nums">{b.goods + b.gold + b.robbers}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="fc-btn flex-1" onClick={onNewSetup}>
                    <Undo2 className="size-3.5" /> 调整对手与模块
                  </button>
                  <button type="button" className="fc-btn primary flex-1" onClick={onRematch}>
                    <Sparkles className="size-3.5" /> 再来一局
                  </button>
                </div>
              </section>
            )}
          </div>

          <section
            className={`fc-panel space-y-2 ${mobileTab !== 'players' ? 'hidden min-[901px]:block' : ''}`}
            data-coach="player-hud"
          >
            {orderedSeats.map((p) => {
              const st = view.players[p.seatIndex];
              if (!st) return null;
              const active = pending?.player === p.seatIndex;
              return (
                <div key={p.id} className={`fc-player ${active ? 'active' : ''}`}>
                  <span className="fc-swatch" style={{ background: COLOR_HEX[p.color] }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-white">
                        <span className="truncate">{p.displayName}</span>
                        {p.seatIndex === humanSeat && <span className="fc-tag">你</span>}
                        {p.isBot && (
                          <span className="fc-tag">
                            <Bot className="size-3" />
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-sm font-bold text-amber-200 tabular-nums">
                        {st.score} <small className="text-[10px] font-normal text-slate-400">分</small>
                        {view.config.expansions.includes('COURIERS') && (
                          <small className="text-[10px] font-normal text-slate-400"> + 驿使 {st.messengerScore}</small>
                        )}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-slate-400">
                      {(Object.keys(FIGURE_NAMES) as (keyof typeof FIGURE_NAMES)[])
                        .filter((k) => st.supply[k] > 0 || k === 'MEEPLE')
                        .map((k) => (
                          <span key={k} className="inline-flex items-center gap-0.5" title={FIGURE_NAMES[k]}>
                            <svg width={14} height={16} viewBox="-10 -14 20 24">
                              <FigureGlyph kind={k} color={COLOR_HEX[p.color]} x={0} y={0} scale={k === 'LARGE' ? 0.75 : 1} />
                            </svg>
                            {st.supply[k]}
                          </span>
                        ))}
                      {view.config.expansions.includes('MARKETS') &&
                        (Object.keys(GOOD_NAMES) as (keyof typeof GOOD_NAMES)[]).map((g) => (
                          <span key={g}>
                            {GOOD_NAMES[g]}
                            {st.goods[g]}
                          </span>
                        ))}
                      {view.config.expansions.includes('SILVER') && <span>银锭 {st.gold}</span>}
                      {st.robber !== null && <span>掮客在 {st.robber} 格</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </section>

          <section className={`fc-panel ${mobileTab !== 'log' ? 'hidden min-[901px]:block' : ''}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">事件记录</span>
              <button
                type="button"
                onClick={() => setShowLog((v) => !v)}
                className="hidden min-[901px]:inline text-xs text-amber-300 hover:underline cursor-pointer"
              >
                {showLog ? '收起' : '展开'}
              </button>
            </div>
            <ol
              className={`mt-2 list-decimal space-y-1 pl-5 text-xs text-slate-400 overflow-y-auto ${
                showLog ? 'max-h-96' : 'max-h-40 min-[901px]:max-h-36'
              }`}
            >
              {events.map((e) => (
                <li key={e.i}>{e.text}</li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
