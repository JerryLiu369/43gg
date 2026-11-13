import {
  Bot,
  Hand,
  Layers,
  MapPin,
  Mountain,
  Ticket,
  TrainFront,
  Trophy,
  Warehouse,
} from 'lucide-react';
import type { PrivatePlayerState, PublicGameState, PublicPlayerState, TrainCardColor } from './engine.ts';
import { canDrawAnyCard, canTakeFaceUp } from './engine.ts';
import { CARD_COLOR_NAME, PLAYER_COLOR_HEX, ROUTE_BY_ID, routeTitle } from './data.ts';
import { Button, TrainCard } from './ui.tsx';
import { cn } from './utils.ts';

export interface GuideContext {
  pub: PublicGameState;
  self: PrivatePlayerState | null;
  me: PublicPlayerState | null;
  isMyTurn: boolean;
  acting: boolean;
  stationMode: boolean;
  affordableCount: number;
}

function anyCardDrawable(pub: PublicGameState): boolean {
  return canDrawAnyCard(
    {
      deck: new Array(pub.trainDeckCount).fill('RED' as TrainCardColor),
      discard: new Array(pub.trainDiscardCount).fill('RED' as TrainCardColor),
      faceUp: pub.faceUpTrainCards,
    },
    pub.turnPhase,
  );
}

export function ActionGuide({
  ctx,
  onOpenTickets,
  onOpenTunnel,
  onShowScores,
  onRematch,
}: {
  ctx: GuideContext;
  onOpenTickets: () => void;
  onOpenTunnel: () => void;
  onShowScores: () => void;
  onRematch: () => void;
}) {
  const { pub, self, me, isMyTurn, stationMode, affordableCount } = ctx;
  const active = pub.players.find((player) => player.id === pub.activePlayerId) ?? null;
  const phase = pub.turnPhase;

  if (pub.status === 'GAME_OVER') {
    const winners = pub.players.filter((player) => pub.winnerPlayerIds.includes(player.id));
    const iWon = Boolean(me && pub.winnerPlayerIds.includes(me.id));
    return (
      <GuideShell
        tone="brass"
        icon={Trophy}
        eyebrow="对局结束"
        title={iWon ? '恭喜，你赢了！' : `${winners.map((p) => p.displayName).join('、')} 获胜`}
      >
        <p>所有车票已经翻开计分。看看每个人的得分明细，或者马上再来一局。</p>
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={onShowScores} className="flex-1">
            <Trophy className="size-3.5" /> 查看结算
          </Button>
          <Button size="sm" variant="secondary" onClick={onRematch} className="flex-1">
            <TrainFront className="size-3.5" /> 再来一局
          </Button>
        </div>
      </GuideShell>
    );
  }

  if (pub.status === 'SETUP_TICKETS') {
    const pending = self?.pendingTicketOffer.length ?? 0;
    return (
      <GuideShell tone="sky" icon={Ticket} eyebrow="准备阶段" title={pending > 0 ? '先挑选你的目的地车票' : '准备开局'}>
        <p>车票上的两座城市就是你这局的目标。开局抽到 4 张车票，至少保留 2 张。</p>
        {pending > 0 && (
          <Button size="sm" className="mt-3 w-full animate-attention" onClick={onOpenTickets}>
            <Ticket className="size-3.5" /> 挑选车票（{pending} 张）
          </Button>
        )}
      </GuideShell>
    );
  }

  if (!isMyTurn) {
    return (
      <GuideShell
        tone="neutral"
        icon={active?.isBot ? Bot : Hand}
        eyebrow={`第 ${pub.turnNumber} 回合`}
        title={`${active?.displayName ?? '对手'} 正在思考…`}
        accent={active ? PLAYER_COLOR_HEX[active.color] : undefined}
      >
        <p>等待的时候可以规划路线：把鼠标移到车票上（手机点一下），版图会标出最短连通方案。</p>
      </GuideShell>
    );
  }

  if (phase === 'SELECTING_TICKETS') {
    return (
      <GuideShell tone="sky" icon={Ticket} eyebrow="轮到你了" title="挑选要保留的车票">
        <p>至少保留 1 张，其余放回车票堆底部。</p>
        <Button size="sm" className="mt-3 w-full animate-attention" onClick={onOpenTickets}>
          <Ticket className="size-3.5" /> 查看车票
        </Button>
      </GuideShell>
    );
  }

  if (phase === 'AWAITING_TUNNEL_PAYMENT') {
    const challenge = pub.tunnelChallenge;
    const route = challenge ? ROUTE_BY_ID.get(challenge.routeId) : null;
    return (
      <GuideShell tone="amber" icon={Mountain} eyebrow="隧道" title={`需要再付 ${challenge?.surcharge ?? 0} 张牌`}>
        <p>{route ? routeTitle(route) : '这条隧道'} 翻出了同色牌。补付就能占领，也可以放弃并收回已出的牌。</p>
        <Button size="sm" className="mt-3 w-full animate-attention" onClick={onOpenTunnel}>
          <Mountain className="size-3.5" /> 处理隧道
        </Button>
      </GuideShell>
    );
  }

  if (phase === 'DRAWING_SECOND_CARD') {
    return (
      <GuideShell tone="brass" icon={Layers} eyebrow="轮到你了" title="再摸 1 张牌">
        <p>从下方明牌或牌堆再拿一张。第二张不能拿明牌里的火车头。</p>
      </GuideShell>
    );
  }

  if (stationMode) {
    return (
      <GuideShell tone="green" icon={Warehouse} eyebrow="建造车站" title="点击版图上发光的城市">
        <p>车站能借用对手的一条路线来连通你的车票。再点一次“取消建站”可以退出。</p>
      </GuideShell>
    );
  }

  const canDraw = anyCardDrawable(pub);
  const canTickets = self?.validActions.includes('DRAW_TICKETS') ?? false;
  const canStation = self?.validActions.includes('BUILD_STATION') ?? false;
  const nextStationCost = me ? 4 - me.stationsRemaining : 1;

  return (
    <GuideShell tone="brass" icon={TrainFront} eyebrow="轮到你了" title="选择一个行动" highlight>
      <p className="lg:hidden">
        四选一：摸牌、占领发光的路线（{affordableCount} 条可占）、拿新车票或建车站。
      </p>
      <ul className="mt-1 hidden space-y-1.5 lg:block">
        <GuideOption icon={Layers} ok={canDraw} title="摸 2 张车厢卡" body={canDraw ? '点下方的明牌或牌堆' : '没有牌可摸了'} />
        <GuideOption
          icon={TrainFront}
          ok={affordableCount > 0}
          title="占领一条路线"
          body={affordableCount > 0 ? `版图上发光的 ${affordableCount} 条路线现在就能占` : '手牌还不够，先摸牌攒同色牌'}
        />
        <GuideOption icon={Ticket} ok={canTickets} title="拿新车票" body={canTickets ? '抽 3 张，至少留 1 张' : '车票已经抽完了'} />
        <GuideOption
          icon={Warehouse}
          ok={canStation}
          title="建车站"
          body={
            me && me.stationsRemaining === 0
              ? '3 座车站都已建好'
              : canStation
                ? `这座要 ${nextStationCost} 张同色牌`
                : `需要 ${nextStationCost} 张同色牌`
          }
        />
      </ul>
    </GuideShell>
  );
}

function GuideOption({ icon: Icon, ok, title, body }: { icon: typeof Layers; ok: boolean; title: string; body: string }) {
  return (
    <li className={cn('flex items-center gap-2.5 rounded-lg px-2 py-1.5', ok ? 'bg-white/[0.04]' : 'opacity-45')}>
      <Icon className={cn('size-4 shrink-0', ok ? 'text-brass-300' : 'text-paper-500')} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-paper-100">{title}</span>
        <span className="block truncate text-[11px] text-paper-400">{body}</span>
      </span>
    </li>
  );
}

const TONES = {
  brass: 'border-brass-400/40 bg-gradient-to-br from-brass-400/[0.14] via-brass-400/[0.04] to-transparent',
  sky: 'border-sky-400/35 bg-gradient-to-br from-sky-400/[0.12] to-transparent',
  amber: 'border-amber-400/40 bg-gradient-to-br from-amber-400/[0.14] to-transparent',
  green: 'border-emerald-400/35 bg-gradient-to-br from-emerald-400/[0.12] to-transparent',
  neutral: 'border-white/[0.08] bg-white/[0.025]',
} as const;

function GuideShell({
  tone,
  icon: Icon,
  eyebrow,
  title,
  accent,
  highlight,
  children,
}: {
  tone: keyof typeof TONES;
  icon: typeof Layers;
  eyebrow: string;
  title: string;
  accent?: string;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      data-coach="guide"
      aria-live="polite"
      className={cn('relative overflow-hidden rounded-2xl border p-3.5 sm:p-4 shadow-xl', TONES[tone], highlight && 'animate-attention')}
    >
      <div className="flex items-start gap-3">
        <span
          className="grid size-9 sm:size-10 shrink-0 place-items-center rounded-xl bg-black/25 text-brass-200"
          style={accent ? { background: accent, color: '#fff' } : undefined}
        >
          <Icon className="size-4 sm:size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-paper-400">{eyebrow}</p>
          <h2 className="ttr-display text-base sm:text-lg leading-snug text-paper-50">{title}</h2>
        </div>
      </div>
      <div className="mt-2 text-xs leading-5 text-paper-300">{children}</div>
    </section>
  );
}

export function Market({
  ctx,
  onDrawCard,
  onDrawTickets,
  onToggleStation,
}: {
  ctx: GuideContext;
  onDrawCard: (source: 'FACE_UP' | 'DECK', slotIndex?: number) => void;
  onDrawTickets: () => void;
  onToggleStation: () => void;
}) {
  const { pub, self, me, isMyTurn, acting, stationMode } = ctx;
  const phase = pub.turnPhase;
  const valid = new Set(self?.validActions ?? []);
  const drawPhase = isMyTurn && (phase === 'STANDBY' || phase === 'DRAWING_SECOND_CARD') && !stationMode;
  const canDraw = drawPhase && valid.has('DRAW_TRAIN_CARD');
  const deckAvailable = pub.trainDeckCount + pub.trainDiscardCount > 0;
  const standby = isMyTurn && phase === 'STANDBY';
  const canTickets = standby && !stationMode && valid.has('DRAW_TICKETS');
  const canStation = standby && valid.has('BUILD_STATION');
  const live = canDraw && !acting;

  return (
    <section data-coach="market" className="ttr-panel overflow-hidden rounded-2xl">
      <header className="flex items-center justify-between gap-2 px-4 pt-3.5">
        <h2 className="flex items-center gap-2 ttr-display text-base text-paper-50">
          <Layers className="size-4 text-brass-300" /> 摸牌区
        </h2>
        <p className={cn('text-[11px]', live ? 'font-semibold text-brass-200' : 'text-paper-500')}>
          {live
            ? phase === 'DRAWING_SECOND_CARD'
              ? '再拿 1 张'
              : '点一张牌拿走'
            : '每回合可摸 2 张'}
        </p>
      </header>

      <div className={cn('mx-3 mt-2.5 rounded-xl p-2.5 transition', live ? 'bg-brass-400/[0.07] ring-1 ring-brass-400/40' : 'bg-black/15')}>
        <div className="grid grid-cols-6 items-end gap-1.5">
          {pub.faceUpTrainCards.map((card, index) => {
            const legal = Boolean(canDraw && card && canTakeFaceUp(phase, card));
            if (!card) {
              return (
                <div
                  key={`empty-${index}`}
                  className="grid h-16 place-items-center rounded-md border border-dashed border-white/10 text-[10px] text-paper-500"
                >
                  空
                </div>
              );
            }
            const blockedLoco = canDraw && card === 'LOCOMOTIVE' && phase === 'DRAWING_SECOND_CARD';
            return (
              <div key={`${index}-${card}`} className="relative animate-card-in">
                <TrainCard
                  color={card}
                  size="md"
                  fullWidth
                  disabled={(!legal && canDraw) || acting}
                  onClick={legal && !acting ? () => onDrawCard('FACE_UP', index) : undefined}
                  label={
                    legal
                      ? card === 'LOCOMOTIVE'
                        ? '拿这张火车头（万能牌，拿了本回合就只能拿这 1 张）'
                        : `拿这张${CARD_COLOR_NAME[card]}牌`
                      : blockedLoco
                        ? '第二张不能拿明牌火车头'
                        : CARD_COLOR_NAME[card]
                  }
                />
                {card === 'LOCOMOTIVE' && (
                  <span className="pointer-events-none absolute -bottom-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-ink-950/90 px-1 text-[9px] font-bold text-brass-200">
                    {blockedLoco ? '不可拿' : '算 2 张'}
                  </span>
                )}
              </div>
            );
          })}
          <button
            type="button"
            disabled={!canDraw || !deckAvailable || acting}
            onClick={() => onDrawCard('DECK')}
            className={cn(
              'card-back group flex h-16 w-full flex-col items-center justify-center text-[10px] font-bold text-brass-100 transition',
              canDraw && deckAvailable && !acting ? 'hover:-translate-y-1 cursor-pointer' : 'cursor-default opacity-80',
            )}
            aria-label={`从牌堆摸一张牌（剩 ${pub.trainDeckCount} 张）`}
            title={`从牌堆摸一张不知道颜色的牌。牌堆剩 ${pub.trainDeckCount} 张，弃牌 ${pub.trainDiscardCount} 张会在牌堆摸完后洗回。`}
          >
            <span className="relative z-[1] text-sm tabular-nums">{pub.trainDeckCount}</span>
            <span className="relative z-[1]">牌堆</span>
          </button>
        </div>
        {canDraw && !deckAvailable && !pub.faceUpTrainCards.some((card) => canTakeFaceUp(phase, card)) && (
          <p className="mt-2 text-[11px] leading-5 text-amber-200/90">没有可以摸的牌了，请选择其他行动。</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 p-3">
        <button
          type="button"
          disabled={!canTickets || acting}
          onClick={onDrawTickets}
          className={cn(
            'flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition cursor-pointer disabled:cursor-default',
            canTickets && !acting
              ? 'border-sky-400/30 bg-sky-400/[0.06] hover:border-sky-300/60 hover:bg-sky-400/[0.12]'
              : 'border-white/[0.06] bg-white/[0.015] opacity-60',
          )}
          title="从车票堆抽 3 张目的地车票，至少保留 1 张"
        >
          <span className="ticket-back card-back relative grid h-10 w-8 shrink-0 place-items-center rounded-md text-[10px] font-bold text-white">
            <span className="relative z-[1] tabular-nums">{pub.ticketDeckCount}</span>
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-paper-100">拿新车票</span>
            <span className="block text-[10px] text-paper-400">抽 3 留 ≥1</span>
          </span>
        </button>
        <button
          type="button"
          disabled={(!canStation && !stationMode) || acting}
          onClick={onToggleStation}
          className={cn(
            'flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition cursor-pointer disabled:cursor-default',
            stationMode
              ? 'border-emerald-300/60 bg-emerald-400/[0.16]'
              : canStation && !acting
                ? 'border-emerald-400/30 bg-emerald-400/[0.05] hover:border-emerald-300/60 hover:bg-emerald-400/[0.1]'
                : 'border-white/[0.06] bg-white/[0.015] opacity-60',
          )}
          title="在没有车站的城市建一座车站，结算时可借用对手的一条路线"
        >
          <span className="grid h-10 w-8 shrink-0 place-items-center rounded-md bg-black/25 text-emerald-200">
            <MapPin className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-paper-100">{stationMode ? '取消建站' : '建车站'}</span>
            <span className="block text-[10px] text-paper-400">剩 {me?.stationsRemaining ?? 0} 座</span>
          </span>
        </button>
      </div>
    </section>
  );
}
