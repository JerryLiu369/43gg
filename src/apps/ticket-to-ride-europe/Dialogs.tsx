import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CircleDollarSign,
  Flag,
  Info,
  MapPin,
  Mountain,
  Ship,
  Sparkles,
  Ticket,
  TrainFront,
  Trophy,
  Users,
} from 'lucide-react';
import type {
  CardCounts,
  DestinationTicket,
  PlayerFinalScore,
  PrivatePlayerState,
  PublicGameState,
  PublicPlayerState,
  PublicTunnelChallenge,
  RouteDefinition,
  TrainCardColor,
} from './engine.ts';
import {
  countCards,
  routePaymentOptions,
  stationPaymentOptions,
  tunnelExtraOptions,
} from './engine.ts';
import {
  PLAYER_COLOR_HEX,
  ROUTE_BY_ID,
  ROUTE_COLOR_NAME,
  ROUTE_LENGTH_POINTS,
  TICKET_BY_ID,
  cityName,
  routeTitle,
  routeTypeLabel,
  ticketTitle,
} from './data.ts';
import { routeShortfall } from './insights.ts';
import { Badge, Button, LONG_TICKET_HINT, Modal, TicketCard, TrainCard } from './ui.tsx';
import { cn } from './utils.ts';

function PaymentCardRow({ payment, size = 'xs' }: { payment: CardCounts; size?: 'xs' | 'sm' }) {
  const entries = (Object.entries(payment) as [TrainCardColor, number][]).filter(([, n]) => n > 0);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {entries.map(([color, count]) => (
        <div key={color} className="relative">
          <TrainCard color={color} size={size} />
          {count > 1 && <span className="card-count">{count}</span>}
        </div>
      ))}
    </div>
  );
}

export function ClaimRouteDialog({
  route,
  self,
  me,
  acting,
  blockedReason,
  onClose,
  onConfirm,
}: {
  route: RouteDefinition | null;
  self: PrivatePlayerState | null;
  me: PublicPlayerState | null;
  acting: boolean;
  blockedReason?: string | null;
  onClose: () => void;
  onConfirm: (payment: CardCounts) => void;
}) {
  const options = useMemo(
    () => (route && self && me ? routePaymentOptions(route, self.trainCards, me.trainCarsRemaining) : []),
    [route, self, me],
  );
  const shortfall = useMemo(
    () => (route && self && me ? routeShortfall(route, self.trainCards, me.trainCarsRemaining) : null),
    [route, self, me],
  );
  const [selected, setSelected] = useState(0);
  useEffect(() => setSelected(0), [route?.id]);

  if (!route) return null;
  const payment = options[selected];
  const color = ROUTE_COLOR_NAME[route.color];

  return (
    <Modal
      open={Boolean(route)}
      onClose={onClose}
      title={routeTitle(route)}
      subtitle={`${color}路线 · ${route.length} 节车厢 · 占领得 ${route.points} 分 · ${routeTypeLabel(route)}`}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-paper-500">{blockedReason ? '' : '出的牌会进入弃牌堆。'}</p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              {blockedReason || options.length === 0 ? '关闭' : '取消'}
            </Button>
            {!blockedReason && options.length > 0 && (
              <Button disabled={!payment || acting} loading={acting} onClick={() => payment && onConfirm(payment)}>
                <TrainFront className="size-4" /> {route.type === 'TUNNEL' ? '出牌并开凿隧道' : '确认占领'}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge tone="brass">
          <CircleDollarSign className="size-3" /> {route.points} 分
        </Badge>
        <Badge tone="neutral">{route.length} 节车厢</Badge>
        {route.type === 'TUNNEL' && (
          <Badge tone="red">
            <Mountain className="size-3" /> 隧道
          </Badge>
        )}
        {route.type === 'FERRY' && (
          <Badge tone="blue">
            <Ship className="size-3" /> 渡轮 · {route.requiredLocomotives} 火车头
          </Badge>
        )}
        {route.pairRouteId && <Badge tone="neutral">双线路线</Badge>}
      </div>

      {blockedReason && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs leading-5 text-paper-200">
          <Info className="mt-0.5 size-4 shrink-0 text-brass-300" />
          <span>{blockedReason}</span>
        </div>
      )}

      {route.type === 'FERRY' && (
        <div className="mb-4 rounded-xl border border-sky-400/20 bg-sky-400/[0.06] p-3 text-xs leading-6 text-sky-100/90">
          <p className="font-semibold text-sky-200">渡轮</p>
          这条航线至少要用 {route.requiredLocomotives} 张火车头，其余格子用同一种颜色的牌补齐。
        </div>
      )}

      {route.type === 'TUNNEL' && (
        <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-xs leading-6 text-amber-100/90">
          <p className="font-semibold text-amber-200">隧道有风险</p>
          出牌后会从牌堆翻开 3 张：每翻出一张和你出的颜色相同的牌（或火车头），就要多付 1 张。付不起或不想付，可以放弃并收回出的牌，但这回合就结束了。
        </div>
      )}

      {!blockedReason && options.length > 0 && (
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-paper-200">选择用哪些牌来付</p>
          <p className="text-[10px] text-paper-500">{options.length} 种出法</p>
        </div>
      )}

      {blockedReason ? null : options.length === 0 ? (
        <div className="rounded-xl border border-red-400/20 bg-red-400/[0.05] p-4 text-sm leading-6 text-red-100/90">
          <p className="font-semibold">现在还占领不了</p>
          <p className="mt-1 text-xs text-red-100/80">{shortfall?.message ?? '手牌不够。'}先摸牌攒一攒吧。</p>
        </div>
      ) : (
        <div className="space-y-2">
          {options.map((option, index) => {
            const locos = option.LOCOMOTIVE ?? 0;
            return (
              <button
                key={index}
                type="button"
                onClick={() => setSelected(index)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition cursor-pointer',
                  selected === index
                    ? 'border-brass-400/50 bg-brass-400/[0.08]'
                    : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20',
                )}
              >
                <PaymentCardRow payment={option} />
                <span className="text-[10px] font-semibold text-paper-400">
                  {locos > 0 ? `含 ${locos} 张火车头` : '全部同色'}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/15 p-3">
        <p className="text-[11px] font-semibold text-paper-400">我的手牌</p>
        <div className="mt-2">
          {self && countCards(self.trainCards) > 0 ? (
            <PaymentCardRow payment={self.trainCards} size="xs" />
          ) : (
            <p className="text-[11px] text-paper-500">还没有手牌</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function StationDialog({
  cityId,
  self,
  me,
  pub,
  acting,
  onClose,
  onConfirm,
}: {
  cityId: string | null;
  self: PrivatePlayerState | null;
  me: PublicPlayerState | null;
  pub: PublicGameState;
  acting: boolean;
  onClose: () => void;
  onConfirm: (payment: CardCounts) => void;
}) {
  const options = useMemo(
    () => (self && me ? stationPaymentOptions(me.stationsRemaining, self.trainCards) : []),
    [self, me],
  );
  const [selected, setSelected] = useState(0);
  useEffect(() => setSelected(0), [cityId]);

  if (!cityId || !me) return null;
  const cost = 3 - me.stationsRemaining + 1;
  const payment = options[selected];
  const owner = pub.stations.find((station) => station.cityId === cityId);
  const ownerPlayer = owner ? pub.players.find((player) => player.id === owner.ownerPlayerId) : null;

  return (
    <Modal
      open={Boolean(cityId)}
      onClose={onClose}
      title={`在 ${cityName(cityId)} 建造车站`}
      subtitle={`你的第 ${4 - me.stationsRemaining} 座车站 · 需要 ${cost} 张同色牌（火车头可代替）`}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-paper-500">没建的车站每座结算时 +4 分。</p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              取消
            </Button>
            <Button disabled={!payment || acting} loading={acting} onClick={() => payment && onConfirm(payment)}>
              建造车站
            </Button>
          </div>
        </div>
      }
    >
      {ownerPlayer ? (
        <div className="rounded-xl border border-red-400/20 bg-red-400/[0.05] p-4 text-sm text-red-100/90">
          这座城市已经有 {ownerPlayer.displayName} 的车站，不能重复建造。
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-3">
            <span className="grid size-9 place-items-center rounded-lg bg-emerald-400/10 text-emerald-200">
              <MapPin className="size-4" />
            </span>
            <div className="text-xs leading-5 text-paper-300">
              <p className="font-semibold text-emerald-100">{cityName(cityId)} 还没有车站</p>
              <p className="text-paper-400">结算时，这座车站可以借用对手一条连着 {cityName(cityId)} 的路线，帮你连通车票。</p>
            </div>
          </div>
          <p className="mb-2 text-xs font-semibold text-paper-200">选择用哪些牌来付</p>
          {options.length === 0 ? (
            <div className="rounded-xl border border-red-400/20 bg-red-400/[0.05] p-4 text-sm text-red-100/90">
              手牌不够：第 {4 - me.stationsRemaining} 座车站需要 {cost} 张同色牌。
            </div>
          ) : (
            <div className="space-y-2">
              {options.map((option, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setSelected(index)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition cursor-pointer',
                    selected === index
                      ? 'border-brass-400/50 bg-brass-400/[0.08]'
                      : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20',
                  )}
                >
                  <PaymentCardRow payment={option} />
                  <span className="text-[10px] text-paper-400">{countCards(option)} 张</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

export function TicketDialog({
  open,
  offer,
  current,
  minKeep,
  initial,
  acting,
  noteFor,
  onClose,
  onConfirm,
}: {
  open: boolean;
  offer: DestinationTicket[];
  current: DestinationTicket[];
  minKeep: number;
  initial: boolean;
  acting: boolean;
  noteFor?: (ticket: DestinationTicket) => string | undefined;
  onClose: () => void;
  onConfirm: (kept: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const offerKey = offer.map((ticket) => ticket.id).join('|');

  useEffect(() => {
    setSelected([]);
  }, [offerKey]);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const need = Math.min(minKeep, offer.length);
  const long = offer.find((ticket) => ticket.isLong);
  const keptPoints = offer
    .filter((ticket) => selected.includes(ticket.id))
    .reduce((sum, ticket) => sum + ticket.points, 0);
  const sorted = [...offer].sort((a, b) => Number(b.isLong) - Number(a.isLong));

  return (
    <Modal
      open={open && offer.length > 0}
      onClose={onClose}
      closable={!initial}
      title={initial ? '挑选你的目的地车票' : '挑选要保留的车票'}
      subtitle={
        initial
          ? '车票就是你这局的目标：用自己的铁路把车票上的两座城市连起来。'
          : `新抽到 ${offer.length} 张车票，至少保留 1 张，其余放回车票堆底部。`
      }
      size="lg"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-paper-400">
            已选 <b className="text-brass-200">{selected.length}</b> 张
            {selected.length > 0 && <>（共 {keptPoints} 分）</>}
            {selected.length < need && <span className="text-paper-500"> · 至少还要选 {need - selected.length} 张</span>}
          </p>
          <div className="flex gap-2">
            {!initial && (
              <Button variant="ghost" onClick={onClose}>
                稍后再选
              </Button>
            )}
            <Button
              disabled={selected.length < need || acting}
              loading={acting}
              onClick={() => onConfirm(selected)}
            >
              <Ticket className="size-4" /> 保留这 {selected.length} 张
            </Button>
          </div>
        </div>
      }
    >
      <div className="mb-4 grid gap-2 text-xs leading-5 text-paper-300 sm:grid-cols-2">
        <div className="flex gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-3">
          <span className="font-bold text-emerald-300">+</span>
          <span>游戏结束时两座城市已连通：得到车票上的分数。</span>
        </div>
        <div className="flex gap-2 rounded-xl border border-red-400/20 bg-red-400/[0.05] p-3">
          <span className="font-bold text-red-300">−</span>
          <span>没有连通：扣掉同样的分数。所以别贪多，挑顺路的。</span>
        </div>
      </div>

      {initial && long && (
        <div className="mb-4 flex gap-2.5 rounded-xl border border-sky-400/30 bg-sky-400/[0.07] p-3 text-xs leading-5 text-sky-50/90">
          <Info className="mt-0.5 size-4 shrink-0 text-sky-300" />
          <span>
            <b className="text-sky-200">蓝色的是长途车票。</b>
            {LONG_TICKET_HINT}
          </span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {sorted.map((ticket) => (
          <TicketCard
            key={ticket.id}
            ticket={ticket}
            selected={selected.includes(ticket.id)}
            note={noteFor?.(ticket)}
            onClick={() => toggle(ticket.id)}
          />
        ))}
      </div>

      <p className="mt-3 text-[11px] text-paper-500">
        小提示：城市靠得近、方向一致的车票更容易一起完成。
        {initial ? '开局没保留的车票会直接移出游戏。' : ''}
      </p>

      {current.length > 0 && (
        <div className="mt-5 border-t border-white/[0.07] pt-4">
          <p className="mb-2 text-[11px] font-semibold text-paper-400">你已经持有 {current.length} 张车票</p>
          <div className="flex flex-wrap gap-2">
            {current.map((ticket) => (
              <span
                key={ticket.id}
                className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-paper-300"
              >
                {ticketTitle(ticket)} · {ticket.points} 分
              </span>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

export function TunnelDialog({
  challenge,
  self,
  acting,
  onConfirm,
  onCancel,
  open,
  onClose,
}: {
  challenge: PublicTunnelChallenge | null;
  self: PrivatePlayerState | null;
  acting: boolean;
  onConfirm: (extra: CardCounts) => void;
  onCancel: () => void;
  open: boolean;
  onClose: () => void;
}) {
  const options = useMemo(
    () =>
      challenge && self
        ? tunnelExtraOptions(challenge.setColor, challenge.surcharge, self.trainCards)
        : [],
    [challenge, self],
  );
  const [selected, setSelected] = useState(0);
  useEffect(() => setSelected(0), [challenge?.routeId, challenge?.surcharge]);

  if (!challenge) return null;
  const extra = options[selected];
  const route = ROUTE_COLOR_NAME[challenge.setColor === 'LOCOMOTIVE' ? 'GRAY' : challenge.setColor];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={challenge.surcharge > 0 ? `隧道要多付 ${challenge.surcharge} 张牌` : '隧道顺利打通'}
      subtitle={ROUTE_BY_ID.get(challenge.routeId) ? routeTitle(ROUTE_BY_ID.get(challenge.routeId)!) : '隧道路线'}
      footer={
        <div className="flex items-center justify-between gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={acting}>
            放弃，收回出的牌
          </Button>
          <Button disabled={!extra || acting} loading={acting} onClick={() => extra && onConfirm(extra)}>
            再付 {challenge.surcharge} 张，占领路线
          </Button>
        </div>
      }
    >
      <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-100">
          <Mountain className="size-4" /> 从牌堆翻开了 {challenge.revealed.length} 张牌
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {challenge.revealed.length === 0 ? (
            <p className="text-xs text-paper-400">牌堆已经空了，这次不用多付。</p>
          ) : (
            challenge.revealed.map((card, index) => (
              <div key={index} className="relative">
                <TrainCard color={card} size="md" />
                {(card === 'LOCOMOTIVE' || card === challenge.setColor) && (
                  <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-rail-500 text-[10px] font-black text-white shadow">
                    +1
                  </span>
                )}
              </div>
            ))
          )}
        </div>
        <p className="mt-3 text-xs text-paper-300">
          标着 +1 的牌和你出的{challenge.setColor === 'LOCOMOTIVE' ? '火车头' : <b className="text-paper-50">{route}牌</b>}相同，所以要多付{' '}
          <span className="font-bold text-amber-200">{challenge.surcharge} 张</span>
          {challenge.setColor === 'LOCOMOTIVE' ? '火车头。' : `${route}牌（或火车头）。`}
        </p>
      </div>

      <div className="mt-4 rounded-xl border border-white/[0.07] bg-black/15 p-3">
        <p className="text-[11px] font-semibold text-paper-400">你已经出的牌</p>
        <div className="mt-2">
          <PaymentCardRow payment={challenge.laidDown} />
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold text-paper-200">选择用哪些牌补付</p>
        {options.length === 0 ? (
          <div className="rounded-xl border border-red-400/20 bg-red-400/[0.05] p-3 text-xs text-red-100/90">
            手牌不够补付，只能放弃这条隧道；出的牌会退回你手里。
          </div>
        ) : (
          <div className="space-y-2">
            {options.map((option, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setSelected(index)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition cursor-pointer',
                  selected === index
                    ? 'border-brass-400/50 bg-brass-400/[0.08]'
                    : 'border-white/[0.08] bg-white/[0.02]',
                )}
              >
                <PaymentCardRow payment={option} />
                <span className="text-[10px] text-paper-400">{countCards(option)} 张</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

export function FinalScoreDialog({
  open,
  onClose,
  pub,
  selfPlayerId,
  onRematch,
  onNewSetup,
}: {
  open: boolean;
  onClose: () => void;
  pub: PublicGameState;
  selfPlayerId: string | null;
  onRematch: () => void;
  onNewSetup: () => void;
}) {
  const ranked = [...pub.players].sort((a, b) => {
    const ra = a.finalScore?.rank ?? 99;
    const rb = b.finalScore?.rank ?? 99;
    return ra - rb || (b.finalScore?.total ?? 0) - (a.finalScore?.total ?? 0);
  });
  const winners = pub.players.filter((player) => pub.winnerPlayerIds.includes(player.id));
  const mine = pub.players.find((player) => player.id === selfPlayerId)?.finalScore ?? null;
  const iWon = Boolean(selfPlayerId && pub.winnerPlayerIds.includes(selfPlayerId));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="终点站 · 最终结算"
      subtitle={
        winners.length > 1
          ? `${winners.map((player) => player.displayName).join('、')} 并列获胜`
          : `${winners[0]?.displayName ?? '—'} 获得胜利`
      }
      size="xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" onClick={onNewSetup}>
            调整对手配置
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              看看版图
            </Button>
            <Button onClick={onRematch}>
              <TrainFront className="size-4" /> 再来一局
            </Button>
          </div>
        </div>
      }
    >
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-brass-400/25 bg-gradient-to-r from-brass-400/[0.12] to-transparent p-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brass-400 text-stone-950 shadow-lg">
          <Trophy className="size-5" />
        </span>
        <div>
          <p className="ttr-display text-xl text-paper-50">
            {iWon ? (winners.length > 1 ? '你和对手并列第一！' : '你赢了！') : winners.length > 1 ? '并列获胜' : `${winners[0]?.displayName ?? ''} 获胜`}
          </p>
          <p className="text-xs text-paper-400">
            {mine
              ? `你得了 ${mine.total} 分，排第 ${mine.rank} 名，完成了 ${mine.completedTicketCount} 张车票。`
              : '恭喜完成横贯欧洲的铁路计划'}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
        <table className="w-full min-w-[600px] text-left text-xs">
          <thead className="bg-white/[0.04] text-[11px] text-paper-400">
            <tr>
              <th className="px-3 py-2.5">名次</th>
              <th className="px-3 py-2.5">玩家</th>
              <th className="px-3 py-2.5 text-right" title="占领路线的得分">路线</th>
              <th className="px-3 py-2.5 text-right" title="完成车票的得分">完成车票</th>
              <th className="px-3 py-2.5 text-right" title="未完成车票的扣分">未完成</th>
              <th className="px-3 py-2.5 text-right" title="每座没用的车站 +4">车站</th>
              <th className="px-3 py-2.5 text-right" title="最长连续铁路 +10">最长铁路</th>
              <th className="px-3 py-2.5 text-right">总分</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((player) => {
              const score = player.finalScore as PlayerFinalScore | null;
              return (
                <tr key={player.id} className={cn('border-t border-white/[0.06]', score?.rank === 1 && 'bg-brass-400/[0.05]')}>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        'grid size-6 place-items-center rounded-full text-[10px] font-black',
                        score?.rank === 1 ? 'bg-brass-300 text-stone-950' : 'bg-white/[0.06] text-paper-300',
                      )}
                    >
                      {score?.rank ?? '—'}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ background: PLAYER_COLOR_HEX[player.color] }}
                      />
                      <span className="font-semibold text-paper-100">{player.displayName}</span>
                      {player.isBot && <Badge tone="neutral">电脑</Badge>}
                      {player.id === selfPlayerId && <Badge tone="brass">你</Badge>}
                      {score?.hasEuropeanExpress && (
                        <span title="最长连续铁路 +10">
                          <Sparkles className="size-3.5 text-brass-300" />
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[10px] text-paper-500">
                      完成 {score?.completedTicketCount ?? 0} 张车票 · 最长铁路 {score?.longestPathLength ?? 0} 格
                    </p>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-paper-200">{score?.routePoints ?? '—'}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-emerald-300">+{score?.ticketPointsGained ?? 0}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-red-300">−{score?.ticketPointsLost ?? 0}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-paper-200">{score?.stationPoints ?? 0}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-brass-300">
                    {score?.europeanExpressBonus ? `+${score.europeanExpressBonus}` : '—'}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className="ttr-display text-lg font-bold text-paper-50">{score?.total ?? 0}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {ranked.map((player) => {
          const score = player.finalScore;
          if (!score) return null;
          return (
            <div key={player.id} className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
              <p className="flex items-center gap-2 text-xs font-semibold text-paper-200">
                <span className="size-2 rounded-full" style={{ background: PLAYER_COLOR_HEX[player.color] }} />
                {player.displayName} 的车票
              </p>
              <div className="mt-2 space-y-1">
                {score.ticketOutcomes.map((outcome) => (
                  <div key={outcome.ticketId} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className={outcome.completed ? 'text-paper-300' : 'text-paper-500 line-through'}>
                      {ticketTitle(TICKET_BY_ID.get(outcome.ticketId) ?? decodeTicket(outcome.ticketId))}
                    </span>
                    <span className={outcome.completed ? 'font-semibold text-emerald-300' : 'font-semibold text-red-300'}>
                      {outcome.completed ? '+' : '−'}
                      {Math.abs(outcome.points)}
                    </span>
                  </div>
                ))}
                {score.ticketOutcomes.length === 0 && (
                  <p className="text-[10px] text-paper-500">没有持有车票</p>
                )}
              </div>
              {Object.keys(score.borrowedRouteByCity).length > 0 && (
                <p className="mt-2 text-[10px] text-amber-200/80">
                  车站借用：{Object.entries(score.borrowedRouteByCity)
                    .map(([city, routeId]) => {
                      const borrowed = ROUTE_BY_ID.get(String(routeId));
                      return `${cityName(city)}站借用 ${borrowed ? routeTitle(borrowed) : '一条路线'}`;
                    })
                    .join('、')}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

const RULE_SECTIONS = [
  {
    icon: TrainFront,
    title: '每回合一个行动',
    body: '摸两张车厢卡、占领一条路线、拿新的目的地车票，或建造一座车站，四选一。做完后轮到下一位玩家。',
    items: [
      '摸牌：可以拿 5 张明牌中的任意一张，或从牌堆摸一张未知颜色的牌。',
      '第一张就拿明牌火车头的话，这回合只能拿这 1 张；第二张不能拿明牌火车头。从牌堆摸到火车头不受限制。',
      '明牌区出现 3 个火车头时，弃掉整排并重新发 5 张。',
      '牌堆摸完时，把弃牌洗匀作为新牌堆。',
    ],
  },
  {
    icon: CircleDollarSign,
    title: '占领路线',
    body: '打出与路线格数相同数量的牌。除火车头外，这些牌必须是同一种颜色；灰色路线可以用任意一种颜色。',
    items: [
      '火车头可以代替任意颜色。',
      '彩色路线必须使用路线颜色，灰色路线自由选择。',
      '渡轮路线上每个火车头图标，至少要用一张火车头来付。',
      '双线路线：2–3 人对局中，一条被占后另一条就不能再用；任何人数下，同一玩家都不能两条都占。',
    ],
  },
  {
    icon: Mountain,
    title: '隧道',
    body: '先打出与路线格数相同的牌，再从牌堆翻开 3 张。每翻出一张与你所出颜色相同的牌或火车头，就要多付 1 张同色牌或火车头。',
    items: [
      '如果全部用火车头付，只有翻出的火车头才需要多付，而且多付的也必须是火车头。',
      '补付后即占领路线；也可以放弃，收回出的牌，但这回合就结束了。',
      '牌不够 3 张时，有几张翻几张。',
    ],
  },
  {
    icon: Ship,
    title: '渡轮',
    body: '渡轮路线上印有火车头图标。付牌时，火车头数量至少要和图标一样多，其余的牌仍然要同一种颜色。',
    items: ['多出来的格子也可以用火车头来付。', '渡轮大多是灰色路线，其余格子任选一种颜色。'],
  },
  {
    icon: MapPin,
    title: '车站',
    body: '车站可以建在任何还没有车站的城市。第 1、2、3 座车站分别要付 1、2、3 张同色牌（火车头可代替）。',
    items: [
      '每回合最多建一座车站，每座城市只能有一座车站。',
      '结算时，每座车站可以借用对手一条连着该城市的路线，帮你连通车票。',
      '没有建的车站，每座 +4 分。',
    ],
  },
  {
    icon: Ticket,
    title: '目的地车票',
    body: '游戏中可以从车票堆抽 3 张目的地车票（不够就抽剩下的），至少保留 1 张，其余放回车票堆底部。',
    items: [
      '开局每人发 1 张长途车票和 3 张普通车票，至少保留 2 张；开局没保留的车票直接移出游戏。',
      '长途车票分值高（20–21 分），横跨大半个欧洲，开局时每人只会拿到 1 张。',
      '连通得到车票上的分数，没连通扣掉同样的分数。保留的车票之后不能再丢掉。',
    ],
  },
  {
    icon: Flag,
    title: '游戏结束',
    body: '只要有玩家在回合结束时只剩 0、1 或 2 节车厢，就进入最后一轮：包括他在内，每人再行动一次。',
    items: [
      '最后一轮结束后统一结算：路线分、车票分、没建的车站、欧洲快车奖励。',
      '拥有最长连续铁路的玩家获得欧洲快车奖励 +10 分，并列时都能拿到。',
      '车站借用的路线不算进最长连续铁路。',
    ],
  },
  {
    icon: Trophy,
    title: '胜负判定',
    body: '总分最高者获胜。平分时依次比较：完成的车票更多、用掉的车站更少、拿到欧洲快车奖励。仍然相同就并列获胜。',
    items: [
      '路线长度 1、2、3、4、6、8 格，分别得 1、2、4、7、15、21 分。',
      '车票分 = 完成车票的分数之和 − 未完成车票的分数之和。',
      '每座没建的车站 +4 分；最长连续铁路并列者各 +10 分。',
    ],
  },
];

export function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="欧洲篇规则速查"
      subtitle="依据《Ticket to Ride Europe》官方规则整理 · 47 座城市 · 101 条路线 · 46 张车票"
      size="xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-[11px] text-paper-400">
            <BookOpen className="size-3.5 text-brass-300" />
            单机对局不设思考倒计时，可从容规划线路
          </span>
          <Button onClick={onClose}>知道了</Button>
        </div>
      }
    >
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
          <p className="text-[11px] text-paper-400">对局人数</p>
          <p className="mt-1 flex items-center gap-2 ttr-display text-lg text-paper-50">
            <Users className="size-4 text-brass-300" /> 2–5 人（你 + 1~4 电脑）
          </p>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
          <p className="text-[11px] text-paper-400">路线得分（格数 → 分数）</p>
          <p className="mt-1 ttr-display text-base text-paper-50">
            {Object.entries(ROUTE_LENGTH_POINTS)
              .map(([length, points]) => `${length}→${points}`)
              .join(' · ')}
          </p>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
          <p className="text-[11px] text-paper-400">最长连续铁路</p>
          <p className="mt-1 flex items-center gap-2 ttr-display text-lg text-paper-50">
            <Sparkles className="size-4 text-brass-300" /> 欧洲快车 +10
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {RULE_SECTIONS.map((section) => (
          <section key={section.title} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex items-center gap-2.5 sm:w-44 sm:shrink-0 sm:items-start">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-brass-400/20 bg-brass-400/10 text-brass-300">
                  <section.icon className="size-4" />
                </span>
                <h3 className="ttr-display text-base leading-tight text-paper-50 sm:pt-1">{section.title}</h3>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs leading-6 text-paper-200">{section.body}</p>
                <ul className="mt-2 grid gap-1 text-[11px] leading-5 text-paper-400">
                  {section.items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-2 size-1 shrink-0 rounded-full bg-brass-400/70" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ))}
      </div>
    </Modal>
  );
}

function decodeTicket(id: string) {
  const parts = id.split('_');
  return {
    id,
    from: parts[0],
    to: parts[1],
    points: Number(parts[parts.length - 1].replace('pts', '')) || 0,
    isLong: false,
  } satisfies DestinationTicket;
}
