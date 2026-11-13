import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Layers, MapPin, ScrollText, Ticket, TrainFront } from 'lucide-react';
import type { DestinationTicket, PrivatePlayerState, PublicGameState, PublicPlayerState, TrainCardColor } from './engine.ts';
import { PLAYER_COLOR_HEX } from './data.ts';
import { planTicket, sortedHand } from './insights.ts';
import type { StoredLogEntry } from './types.ts';
import { Button, TicketCard, TrainCard } from './ui.tsx';
import { cn, formatClock } from './utils.ts';

export function HandTray({
  self,
  me,
  className,
}: {
  self: PrivatePlayerState | null;
  me: PublicPlayerState | null;
  className?: string;
}) {
  const entries = useMemo(() => (self ? sortedHand(self.trainCards) : []), [self]);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);

  const previous = useRef<Partial<Record<TrainCardColor, number>> | null>(null);
  const [fresh, setFresh] = useState<Set<TrainCardColor>>(new Set());
  const freshTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (freshTimer.current) window.clearTimeout(freshTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (!self) return;
    const before = previous.current;
    previous.current = { ...self.trainCards };
    if (!before) return;
    const grown = new Set<TrainCardColor>();
    for (const [color, count] of Object.entries(self.trainCards) as [TrainCardColor, number][]) {
      if (count > (before[color] ?? 0)) grown.add(color);
    }
    if (grown.size === 0) return;
    setFresh(grown);
    if (freshTimer.current) window.clearTimeout(freshTimer.current);
    freshTimer.current = window.setTimeout(() => setFresh(new Set()), 1800);
  }, [self]);

  return (
    <section data-coach="hand" className={cn('mer-panel rounded-2xl px-4 py-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 className="flex items-center gap-2 mer-display text-base text-(--mer-paper-50)">
          <Layers className="size-4 text-(--mer-brass-300)" /> 我的手牌
          <span className="font-sans text-xs font-semibold text-(--mer-paper-400)">{total} 张</span>
        </h2>
        {me && (
          <div className="flex items-center gap-3 text-[11px] text-(--mer-paper-400)">
            <span className="flex items-center gap-1" title="剩余小火车（车厢）">
              <TrainFront className="size-3.5 text-(--mer-paper-300)" />
              <b className={cn('tabular-nums', me.trainCarsRemaining <= 6 ? 'text-red-300' : 'text-(--mer-paper-100)')}>
                {me.trainCarsRemaining}
              </b>
              节车厢
            </span>
            <span className="flex items-center gap-1" title="剩余车站">
              <MapPin className="size-3.5 text-(--mer-paper-300)" />
              <b className="tabular-nums text-(--mer-paper-100)">{me.stationsRemaining}</b> 座车站
            </span>
          </div>
        )}
      </div>
      <div className="mt-2.5 min-h-16">
        {!self ? (
          <p className="text-xs text-(--mer-paper-400)">暂无手牌。</p>
        ) : entries.length === 0 ? (
          <p className="pt-4 text-xs text-(--mer-paper-400)">手里还没有车厢卡，从摸牌区拿几张吧。</p>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            {entries.map(([color, count]) => (
              <div
                key={color}
                className={cn('relative transition-transform', fresh.has(color) && 'animate-card-in -translate-y-1')}
              >
                <TrainCard
                  color={color}
                  size="md"
                  count={count}
                  label={`${count} 张${color === 'LOCOMOTIVE' ? '万能牌' : ''}`}
                />
                {fresh.has(color) && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-1.5 text-[9px] font-black text-white shadow">
                    新
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function TicketsPanel({
  self,
  pub,
  focusedTicketId,
  onFocusTicket,
  onOpenTickets,
}: {
  self: PrivatePlayerState | null;
  pub: PublicGameState;
  focusedTicketId: string | null;
  onFocusTicket: (ticket: DestinationTicket | null, pinned?: boolean) => void;
  onOpenTickets: () => void;
}) {
  const plans = useMemo(() => {
    const map = new Map<string, ReturnType<typeof planTicket>>();
    if (!self) return map;
    for (const ticket of self.tickets) {
      map.set(ticket.id, planTicket(ticket, pub.claims, self.playerId, pub.players.length));
    }
    return map;
  }, [self, pub.claims, pub.players.length]);

  const tickets = useMemo(() => {
    if (!self) return [];
    return [...self.tickets].sort((a, b) => {
      const da = plans.get(a.id)?.connected ? 1 : 0;
      const db = plans.get(b.id)?.connected ? 1 : 0;
      return da - db || b.points - a.points;
    });
  }, [self, plans]);

  const done = tickets.filter((ticket) => plans.get(ticket.id)?.connected);
  const gained = done.reduce((sum, ticket) => sum + ticket.points, 0);
  const atRisk = tickets
    .filter((ticket) => !plans.get(ticket.id)?.connected)
    .reduce((sum, ticket) => sum + ticket.points, 0);

  return (
    <section data-coach="tickets" className="mer-panel rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 mer-display text-base text-(--mer-paper-50)">
          <Ticket className="size-4 text-(--mer-brass-300)" /> 我的车票
        </h2>
        {tickets.length > 0 && (
          <p className="text-[11px] text-(--mer-paper-400)">
            已完成 <b className="text-emerald-300">+{gained}</b>
            <span className="mx-1 text-(--mer-paper-600)">·</span>
            未完成 <b className="text-red-300">−{atRisk}</b>
          </p>
        )}
      </div>

      {self && self.pendingTicketOffer.length > 0 && (
        <Button size="sm" className="mb-3 w-full animate-attention" onClick={onOpenTickets}>
          <Ticket className="size-3.5" /> 有 {self.pendingTicketOffer.length} 张车票等你挑选
        </Button>
      )}

      {tickets.length === 0 ? (
        <p className="text-xs leading-5 text-(--mer-paper-400)">
          {pub.status === 'SETUP_TICKETS' ? '选好的车票会出现在这里。' : '还没有车票。'}
        </p>
      ) : (
        <>
          <p className="mb-2 text-[11px] text-(--mer-paper-500)">鼠标移到车票上（手机点一下）可在版图上查看建议路线。</p>
          <div className="space-y-2">
            {tickets.map((ticket) => {
              const plan = plans.get(ticket.id);
              const note = !plan
                ? undefined
                : plan.connected
                  ? '已连通，结算时得分'
                  : !plan.reachable
                    ? '路被堵住了：可以建车站借用对手的路线'
                    : `最少还要 ${plan.trainsNeeded} 节车厢（${plan.routeIds.length} 条路线）`;
              return (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  compact
                  completed={plan?.connected}
                  note={note}
                  selected={focusedTicketId === ticket.id}
                  onHover={(hovering) => onFocusTicket(hovering ? ticket : null)}
                  onClick={() => onFocusTicket(focusedTicketId === ticket.id ? null : ticket, true)}
                />
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

export function LogPanel({ log, pub }: { log: StoredLogEntry[]; pub: PublicGameState }) {
  const entries = [...log].reverse().slice(0, 40);
  const colorOf = new Map(pub.players.map((player) => [player.id, PLAYER_COLOR_HEX[player.color]]));
  return (
    <section className="mer-panel rounded-2xl p-4">
      <h2 className="mb-3 flex items-center gap-2 mer-display text-base text-(--mer-paper-50)">
        <ScrollText className="size-4 text-(--mer-brass-300)" /> 对局记录
      </h2>
      {entries.length === 0 ? (
        <p className="text-xs text-(--mer-paper-400)">还没有任何行动。</p>
      ) : (
        <ol className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.id} className="flex gap-2 text-[11px] leading-5">
              <span
                className="mt-1.5 size-2 shrink-0 rounded-full"
                style={{ background: (entry.playerId && colorOf.get(entry.playerId)) || '#8a7a62' }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-(--mer-paper-200)">
                  {entry.summary}
                  {entry.actorKind === 'BOT' && <Bot className="ml-1 inline size-3 -translate-y-px text-(--mer-paper-500)" />}
                </p>
                <p className="text-[10px] text-(--mer-paper-500)">{formatClock(entry.createdAt)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
