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
  type ClientView,
  type FcLocalMatch,
  type FcMatchConfig,
  type LocalSeat,
  type PlayerColor,
  type SeatConfig,
} from './lib/types.ts';

export const MIN_FC_PLAYERS = 2;
export const MAX_FC_PLAYERS = 6;

function generateSeed(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    const buf = new Uint32Array(2);
    globalThis.crypto.getRandomValues(buf);
    return `${buf[0].toString(36)}-${buf[1].toString(36)}`;
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function defaultHumanName(humanIndex: number, totalHumans: number): string {
  if (totalHumans <= 1) return '山人';
  return `玩家 ${humanIndex + 1}`;
}

export function summarizeSeatCounts(seats: readonly { isBot: boolean }[]): {
  total: number;
  humans: number;
  bots: number;
} {
  let humans = 0;
  let bots = 0;
  for (const s of seats) {
    if (s.isBot) bots++;
    else humans++;
  }
  return { total: seats.length, humans, bots };
}

export function formatSeatSummary(seats: readonly { isBot: boolean }[]): string {
  const { humans, bots } = summarizeSeatCounts(seats);
  if (humans > 0 && bots > 0) return `${humans} 真人 · ${bots} 电脑`;
  if (humans > 0) return `${humans} 真人同屏`;
  return `${bots} 电脑观战`;
}

/** Adjusts human count by delta (+1 or -1) while keeping total seats within 2..6. */
export function adjustHumanCount(
  seats: readonly SeatConfig[],
  delta: 1 | -1,
  defaultDifficulty: BotLevel = 'NORMAL',
): SeatConfig[] {
  const next = seats.map((s) => ({ ...s }));
  const { humans, bots, total } = summarizeSeatCounts(next);

  if (delta === 1) {
    if (humans >= MAX_FC_PLAYERS) return next;
    const nextHumanIdx = humans;
    const name = defaultHumanName(nextHumanIdx, humans + 1);
    if (total < MAX_FC_PLAYERS) {
      // Insert new human right after existing humans so humans stay grouped naturally by default
      let insertAt = next.length;
      for (let i = next.length - 1; i >= 0; i--) {
        if (!next[i].isBot) {
          insertAt = i + 1;
          break;
        }
      }
      if (humans === 0) insertAt = 0;
      next.splice(insertAt, 0, { isBot: false, name });
    } else if (bots > 0) {
      // At cap (6): convert the last bot into a human
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].isBot) {
          next[i] = { isBot: false, name };
          break;
        }
      }
    }
    return next;
  }

  // delta === -1
  if (humans <= 0) return next;
  if (total > MIN_FC_PLAYERS) {
    for (let i = next.length - 1; i >= 0; i--) {
      if (!next[i].isBot) {
        next.splice(i, 1);
        break;
      }
    }
  } else {
    // At floor (2): convert last human into a bot so total stays 2
    for (let i = next.length - 1; i >= 0; i--) {
      if (!next[i].isBot) {
        next[i] = { isBot: true, botLevel: defaultDifficulty };
        break;
      }
    }
  }
  return next;
}

/** Adjusts bot count by delta (+1 or -1) while keeping total seats within 2..6. */
export function adjustBotCount(
  seats: readonly SeatConfig[],
  delta: 1 | -1,
  defaultDifficulty: BotLevel = 'NORMAL',
): SeatConfig[] {
  const next = seats.map((s) => ({ ...s }));
  const { humans, bots, total } = summarizeSeatCounts(next);

  if (delta === 1) {
    if (bots >= MAX_FC_PLAYERS) return next;
    if (total < MAX_FC_PLAYERS) {
      next.push({ isBot: true, botLevel: defaultDifficulty });
    } else if (humans > 0) {
      for (let i = next.length - 1; i >= 0; i--) {
        if (!next[i].isBot) {
          next[i] = { isBot: true, botLevel: defaultDifficulty };
          break;
        }
      }
    }
    return next;
  }

  // delta === -1
  if (bots <= 0) return next;
  if (total > MIN_FC_PLAYERS) {
    for (let i = next.length - 1; i >= 0; i--) {
      if (next[i].isBot) {
        next.splice(i, 1);
        break;
      }
    }
  } else {
    // At floor (2): convert last bot into a human so total stays 2
    const nextHumanIdx = humans;
    const name = defaultHumanName(nextHumanIdx, humans + 1);
    for (let i = next.length - 1; i >= 0; i--) {
      if (next[i].isBot) {
        next[i] = { isBot: false, name };
        break;
      }
    }
  }
  return next;
}

/** Toggles a specific seat between human and bot while preserving its position. */
export function toggleSeatType(
  seats: readonly SeatConfig[],
  index: number,
  defaultDifficulty: BotLevel = 'NORMAL',
): SeatConfig[] {
  if (index < 0 || index >= seats.length) return seats.map((s) => ({ ...s }));
  const next = seats.map((s) => ({ ...s }));
  const target = next[index];
  if (target.isBot) {
    const currentHumans = next.filter((s) => !s.isBot).length;
    next[index] = {
      isBot: false,
      name: target.name?.trim() || defaultHumanName(currentHumans, currentHumans + 1),
      color: target.color,
    };
  } else {
    next[index] = {
      isBot: true,
      botLevel: target.botLevel ?? defaultDifficulty,
      color: target.color,
    };
  }
  return next;
}

function buildSeatConfigsFromMatchConfig(config: FcMatchConfig): SeatConfig[] {
  if (config.seats && config.seats.length > 0) {
    return config.seats.slice(0, MAX_FC_PLAYERS);
  }
  const botLevels = (config.botLevels ?? []).slice(0, MAX_FC_PLAYERS - 1);
  if (botLevels.length < 1) {
    throw new Error('At least 2 players are required');
  }
  return [
    { isBot: false, name: config.playerName },
    ...botLevels.map((botLevel): SeatConfig => ({ isBot: true, botLevel })),
  ];
}

export function resolveLocalSeats(rawSeats: readonly SeatConfig[]): LocalSeat[] {
  if (rawSeats.length < MIN_FC_PLAYERS || rawSeats.length > MAX_FC_PLAYERS) {
    throw new Error(`A match needs ${MIN_FC_PLAYERS}-${MAX_FC_PLAYERS} players`);
  }

  const totalHumans = rawSeats.filter((s) => !s.isBot).length;
  const usedColors = new Set<PlayerColor>();
  const assignedColors: (PlayerColor | null)[] = rawSeats.map((s) => {
    if (s.color && PLAYER_COLORS.includes(s.color) && !usedColors.has(s.color)) {
      usedColors.add(s.color);
      return s.color;
    }
    return null;
  });
  const remainingColors = PLAYER_COLORS.filter((c) => !usedColors.has(c));

  let humanIdx = 0;
  let botIdx = 0;
  let remIdx = 0;

  return rawSeats.map((cfg, seatIndex): LocalSeat => {
    const color = assignedColors[seatIndex] ?? remainingColors[remIdx++] ?? PLAYER_COLORS[seatIndex];
    if (cfg.isBot) {
      const level: BotLevel = cfg.botLevel ?? 'NORMAL';
      const num = ++botIdx;
      const customName = cfg.name?.trim();
      const displayName = customName
        ? customName.slice(0, 16)
        : `电脑 ${num} (${BOT_LEVEL_LABELS[level]})`;
      return {
        seatIndex,
        id: `bot-${seatIndex}`,
        displayName,
        color,
        isBot: true,
        botLevel: level,
      };
    }

    const idx = humanIdx++;
    const trimmed = cfg.name?.trim().slice(0, 16);
    const displayName = trimmed || defaultHumanName(idx, totalHumans);
    return {
      seatIndex,
      id: `human-${seatIndex}`,
      displayName,
      color,
      isBot: false,
      botLevel: null,
    };
  });
}

export function createLocalFcMatch(
  config: FcMatchConfig,
  cat: TileCatalog = getCatalog(),
  nowIso: string = new Date().toISOString(),
): FcLocalMatch {
  const seatConfigs = buildSeatConfigsFromMatchConfig(config);
  const seats = resolveLocalSeats(seatConfigs);
  const firstHuman = seats.findIndex((s) => !s.isBot);

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
    humanSeat: firstHuman,
    seq: 0,
    updatedAt: nowIso,
  };
}

export function getHumanSeats(match: FcLocalMatch): LocalSeat[] {
  return match.seats.filter((s) => !s.isBot);
}

export function hasPendingFcHuman(match: FcLocalMatch): boolean {
  if (match.state.finished || !match.state.pending) return false;
  const seat = match.seats[match.state.pending.player];
  return Boolean(seat && !seat.isBot);
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
  const legal = pending && pendingSeat && !pendingSeat.isBot ? legalActions(match.state, cat) : [];
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
  const pending = match.state.pending;
  const pendingSeat = pending ? match.seats[pending.player] ?? null : null;
  if (!pending || !pendingSeat || pendingSeat.isBot) {
    return { ok: false, error: '当前由电脑思考中，请稍候' };
  }
  if (action.player !== pending.player) {
    return { ok: false, error: `当前轮到 ${pendingSeat.displayName} 行动` };
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
