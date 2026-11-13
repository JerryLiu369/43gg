import {
  applyAction,
  createGame,
  legalActions,
  publicView,
  type Action,
  type TileCatalog,
} from './engine/index.ts';
import { chooseBotAction, type BotView } from './bot/index.ts';
import { getCatalog } from './lib/catalog.ts';
import {
  BOT_LEVEL_LABELS,
  PLAYER_COLORS,
  toClientView,
  type BotLevel,
  type FcLocalMatch,
  type FcMatchConfig,
  type ClientView,
  type LocalSeat,
} from './lib/types.ts';

function generateSeed(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    const buf = new Uint32Array(2);
    globalThis.crypto.getRandomValues(buf);
    return `${buf[0].toString(36)}-${buf[1].toString(36)}`;
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createLocalFcMatch(
  config: FcMatchConfig,
  cat: TileCatalog = getCatalog(),
  nowIso: string = new Date().toISOString(),
): FcLocalMatch {
  const botLevels = config.botLevels.slice(0, 5);
  if (botLevels.length < 1) {
    throw new Error('At least 1 AI opponent is required');
  }

  const humanName = config.playerName.trim() || '山人';
  const seats: LocalSeat[] = [
    {
      seatIndex: 0,
      id: 'human-0',
      displayName: humanName,
      color: PLAYER_COLORS[0],
      isBot: false,
      botLevel: null,
    },
    ...botLevels.map((level, idx): LocalSeat => ({
      seatIndex: idx + 1,
      id: `bot-${idx + 1}`,
      displayName: `电脑 ${idx + 1} (${BOT_LEVEL_LABELS[level]})`,
      color: PLAYER_COLORS[idx + 1],
      isBot: true,
      botLevel: level,
    })),
  ];

  const seed = config.seed ?? generateSeed();
  const state = createGame(
    {
      players: seats.length,
      seed,
      expansions: config.expansions,
      riverForbidReverseBend: config.riverForbidReverseBend ?? true,
    },
    cat,
  );

  return {
    state,
    seats,
    humanSeat: 0,
    seq: 0,
    updatedAt: nowIso,
  };
}

export function projectFcMatch(
  match: FcLocalMatch,
  cat: TileCatalog = getCatalog(),
): {
  view: ClientView;
  legal: Action[];
  pendingSeat: LocalSeat | null;
} {
  const pub = publicView(match.state);
  const view = toClientView(pub);
  const pending = match.state.pending;
  const pendingSeat = pending ? match.seats[pending.player] ?? null : null;
  const legal = pending && pending.player === match.humanSeat ? legalActions(match.state, cat) : [];
  return { view, legal, pendingSeat };
}

export function hasPendingFcBot(match: FcLocalMatch): boolean {
  if (match.state.finished || !match.state.pending) return false;
  const seat = match.seats[match.state.pending.player];
  return Boolean(seat?.isBot);
}

export function applyHumanFcAction(
  match: FcLocalMatch,
  action: Action,
  cat: TileCatalog = getCatalog(),
  nowIso: string = new Date().toISOString(),
): { ok: true; match: FcLocalMatch } | { ok: false; error: string } {
  if (match.state.finished) {
    return { ok: false, error: '对局已经结束' };
  }
  if (!match.state.pending || match.state.pending.player !== match.humanSeat) {
    return { ok: false, error: '当前不是你的行动阶段' };
  }
  try {
    const nextState = applyAction(match.state, action, cat);
    return {
      ok: true,
      match: {
        ...match,
        state: nextState,
        seq: match.seq + 1,
        updatedAt: nowIso,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : '无法执行该操作',
    };
  }
}

const UI_TIME_BUDGET_MS: Record<BotLevel, number> = {
  EASY: 250,
  NORMAL: 500,
  HARD: 900,
};

export function stepFcBot(
  match: FcLocalMatch,
  cat: TileCatalog = getCatalog(),
  nowIso: string = new Date().toISOString(),
  timeBudgetMs?: number,
): FcLocalMatch | null {
  if (match.state.finished || !match.state.pending) return null;
  const seat = match.seats[match.state.pending.player];
  if (!seat || !seat.isBot) return null;

  const legal = legalActions(match.state, cat);
  if (legal.length === 0) return null;

  const pub = publicView(match.state);
  const botView: BotView = toClientView(pub);
  const level: BotLevel = seat.botLevel ?? 'NORMAL';
  const chosen = chooseBotAction(botView, legal, {
    level,
    cat,
    seed: `bot:${match.seq}:${seat.seatIndex}:${match.state.turn.number}`,
    timeBudgetMs: timeBudgetMs ?? UI_TIME_BUDGET_MS[level],
  });

  const nextState = applyAction(match.state, chosen, cat);
  return {
    ...match,
    state: nextState,
    seq: match.seq + 1,
    updatedAt: nowIso,
  };
}
