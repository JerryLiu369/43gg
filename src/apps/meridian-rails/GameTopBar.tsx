import { BookOpen, Bot, HelpCircle, Layers, RotateCcw, Ticket, TrainFront } from 'lucide-react';
import type { PublicGameState, PublicPlayerState } from './engine.ts';
import { PLAYER_COLOR_HEX } from './data.ts';
import { SoundControl } from './ui.tsx';
import { cn } from './utils.ts';

export function PlayerPill({
  player,
  active,
  self,
}: {
  player: PublicPlayerState;
  active: boolean;
  self: boolean;
}) {
  return (
    <div
      className={cn(
        'relative flex min-w-0 items-center gap-2 rounded-xl border px-2 py-1 transition',
        active
          ? 'border-(--mer-brass-300)/75 bg-(--mer-brass-400)/[0.15] shadow-[0_0_20px_rgba(217,169,78,.18)]'
          : 'border-white/[0.06] bg-white/[0.02]',
        self && !active && 'border-(--mer-paper-300)/25',
      )}
      title={`${player.displayName}${self ? '（你）' : ''}：${player.score} 分，剩 ${player.trainCarsRemaining} 节车厢、${player.trainCardCount} 张手牌、${player.ticketCount} 张车票、${player.stationsRemaining} 座车站`}
    >
      <span
        className="relative grid size-7 shrink-0 place-items-center rounded-full border-2 text-[11px] font-black text-white shadow"
        style={{ background: PLAYER_COLOR_HEX[player.color], borderColor: active ? '#f5dda4' : 'rgba(255,255,255,.3)' }}
      >
        {player.isBot ? <Bot className="size-3.5" /> : player.displayName.slice(0, 1)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="max-w-20 sm:max-w-28 truncate text-[11px] font-bold text-(--mer-paper-100)">{player.displayName}</span>
          {self && <span className="rounded bg-(--mer-brass-400)/20 px-1 text-[9px] font-bold text-(--mer-brass-200)">你</span>}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] tabular-nums text-(--mer-paper-400)">
          <span className="font-bold text-(--mer-paper-100)">
            {player.score}
            <span className="ml-0.5 font-normal text-(--mer-paper-400)">分</span>
          </span>
          <span className={cn('flex items-center gap-0.5', player.trainCarsRemaining <= 6 && 'font-bold text-red-300')}>
            <TrainFront className="size-2.5" /> {player.trainCarsRemaining}
          </span>
          <span className="flex items-center gap-0.5">
            <Layers className="size-2.5" /> {player.trainCardCount}
          </span>
          <span className="hidden items-center gap-0.5 xl:flex">
            <Ticket className="size-2.5" /> {player.ticketCount}
          </span>
        </div>
      </div>
    </div>
  );
}

export function GameTopBar({
  pub,
  selfPlayerId,
  onNewSetup,
  onHelp,
  onRules,
}: {
  pub: PublicGameState;
  selfPlayerId: string | null;
  onNewSetup: () => void;
  onHelp: () => void;
  onRules: () => void;
}) {
  const ordered = [...pub.players].sort((a, b) => a.seatIndex - b.seatIndex);
  return (
    <header className="relative z-30 shrink-0 border-b border-white/[0.07] bg-(--mer-ink-950)/90">
      <div className="flex h-[54px] items-center gap-2 sm:gap-3 px-2.5 sm:px-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto mer-no-scrollbar" aria-label="玩家">
            {ordered.map((player) => (
              <div key={player.id} className="shrink-0">
                <PlayerPill
                  player={player}
                  active={pub.status === 'IN_PROGRESS' && player.id === pub.activePlayerId}
                  self={player.id === selfPlayerId}
                />
              </div>
            ))}
          </div>
        </div>

        {pub.lastRoundTurnsRemaining !== null && pub.status === 'IN_PROGRESS' && (
          <span
            className="hidden shrink-0 rounded-full border border-red-400/40 bg-red-500/15 px-2.5 py-1 text-[11px] font-bold text-red-100 md:inline"
            title="有玩家的车厢只剩 2 节或更少，每人还能再行动一次"
          >
            最后一轮
          </span>
        )}

        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          <button
            type="button"
            onClick={onHelp}
            className="grid size-8 sm:size-9 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-(--mer-paper-200) transition hover:border-(--mer-brass-400)/40 hover:text-(--mer-brass-200) cursor-pointer"
            aria-label="重温新手引导"
            title="重温新手引导"
          >
            <HelpCircle className="size-4" />
          </button>
          <button
            type="button"
            onClick={onRules}
            className="grid size-8 sm:size-9 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-(--mer-paper-200) transition hover:border-(--mer-brass-400)/40 hover:text-(--mer-brass-200) cursor-pointer"
            aria-label="图文手册"
            title="图文手册"
          >
            <BookOpen className="size-4" />
          </button>
          <SoundControl />
          <button
            type="button"
            onClick={onNewSetup}
            className="grid size-8 sm:size-9 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-(--mer-paper-200) transition hover:border-(--mer-brass-400)/40 hover:text-(--mer-brass-200) cursor-pointer"
            aria-label="重开或调整配置"
            title="重开或调整配置"
          >
            <RotateCcw className="size-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
