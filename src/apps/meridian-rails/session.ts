import {
  BOT_LEVEL_LABELS,
  PLAYER_COLORS,
  applyAction,
  applyTimeout,
  computeValidActions,
  dealNewGame,
  decideBotAction,
  lowestValueTickets,
  projectState,
  type ActionType,
  type ApiErrorCode,
  type AuthoritativeGameState,
  type AuthoritativePlayer,
  type BotLevel,
  type GameSettings,
  type ProjectedGameState,
  type PublicEvent,
  type Rng,
  type SeatedPlayer,
} from './engine.ts';
import { CARD_COLOR_NAME, DEFS, ROUTE_BY_ID, ROUTE_COLOR_NAME, cityName, routeTitle } from './data.ts';
import type { LocalMatchConfig, StoredLogEntry, MerLocalMatch } from './types.ts';

export const OFFLINE_SETTINGS: GameSettings = {
  minPlayers: 2,
  maxPlayers: 5,
  turnTimeLimitSeconds: 0,
  setupTimeLimitSeconds: 0,
  botStepDelayMs: 550,
};

export function createDefaultRng(): Rng {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    return () => {
      const array = new Uint32Array(1);
      globalThis.crypto.getRandomValues(array);
      return array[0] / 0x1_0000_0000;
    };
  }
  return () => Math.random();
}

export function createSeededRng(seedInput: string | number): Rng {
  const s = String(seedInput);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  let state = h || 0x9e3779b9;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

export function errorMessage(code: ApiErrorCode): string {
  const messages: Partial<Record<ApiErrorCode, string>> = {
    MALFORMED_PAYMENT: '支付的卡牌格式不正确',
    INSUFFICIENT_TRAINS: '剩余车厢不足',
    WRONG_CARD_COUNT: '支付卡牌数量不正确',
    MIXED_COLORS: '同一组支付不能混用多种颜色',
    WRONG_COLOR: '支付颜色与路线不匹配',
    NOT_ENOUGH_LOCOMOTIVES: '渡轮需要更多万能牌',
    CARDS_NOT_IN_HAND: '手牌中没有足够的卡牌',
    ROUTE_ALREADY_CLAIMED: '这条路线已被占领',
    DOUBLE_ROUTE_CLOSED: '双线中的另一条已被占领，本线关闭',
    DOUBLE_ROUTE_SAME_PLAYER: '不能同时占领同一组双线',
    NO_STATIONS_REMAINING: '没有剩余车站',
    STATION_CITY_OCCUPIED: '该城市已有车站',
    INVALID_TICKET_SELECTION: '车票选择无效',
    NO_TICKETS_REMAINING: '目的地车票已经抽完',
    NO_CARDS_AVAILABLE: '牌堆中没有可抽的卡牌',
    FACE_UP_LOCOMOTIVE_NOT_ALLOWED: '第二张牌不能拿取明牌万能牌',
    NOT_A_PARTICIPANT: '你不是这局游戏的玩家',
    NOT_YOUR_TURN: '现在不是你的回合',
    ILLEGAL_PHASE: '当前阶段不能执行这个操作',
    UNKNOWN_ROUTE: '未知路线',
    UNKNOWN_CITY: '未知城市',
    INVALID_PAYLOAD: '请求参数无效',
  };
  return messages[code] ?? code;
}

export function summarizeEvent(event: PublicEvent, state: AuthoritativeGameState): string {
  const name = state.players.find((player) => player.id === event.playerId)?.displayName ?? '系统';
  const route = typeof event.detail.routeId === 'string' ? ROUTE_BY_ID.get(event.detail.routeId) : null;
  switch (event.actionType) {
    case 'CHOOSE_INITIAL_TICKETS':
      return `${name} 保留了 ${event.detail.kept ?? '?'} 张初始车票`;
    case 'DRAW_TRAIN_CARD': {
      const card = event.detail.card;
      if (typeof card === 'string' && card in CARD_COLOR_NAME) {
        return `${name} 从明牌区拿取了一张${CARD_COLOR_NAME[card as keyof typeof CARD_COLOR_NAME]}卡`;
      }
      return `${name} 从牌堆摸了一张牌`;
    }
    case 'CLAIM_ROUTE': {
      const title = route ? routeTitle(route) : '一条路线';
      const surcharge = typeof event.detail.surcharge === 'number' ? event.detail.surcharge : null;
      if (surcharge !== null && surcharge > 0) {
        return `${name} 开凿隧道 ${title}，翻出 ${surcharge} 张需加付的牌`;
      }
      if (surcharge === 0) return `${name} 顺利打通隧道，占领了 ${title}`;
      return route
        ? `${name} 占领了 ${title}（${ROUTE_COLOR_NAME[route.color]} · ${route.length} 节）`
        : `${name} 占领了一条路线`;
    }
    case 'CONFIRM_TUNNEL':
      return route ? `${name} 支付隧道加付，占领了 ${routeTitle(route)}` : `${name} 打通了隧道`;
    case 'CANCEL_TUNNEL':
      return `${name} 放弃了这条隧道，收回了手牌`;
    case 'BUILD_STATION':
      return `${name} 在${typeof event.detail.cityId === 'string' ? cityName(event.detail.cityId) : '城市'}建造了车站`;
    case 'DRAW_TICKETS':
      return `${name} 抽取了 ${event.detail.offered ?? 3} 张目的地车票`;
    case 'CHOOSE_TICKETS':
      return `${name} 保留了 ${event.detail.kept ?? '?'} 张目的地车票`;
    case 'TIMEOUT_PASS':
      return `${name} 无可行动作，自动跳过回合`;
    default:
      return `${name} 执行了操作`;
  }
}

function appendLogEntry(
  log: StoredLogEntry[],
  state: AuthoritativeGameState,
  event: {
    actionType: string;
    playerId: string | null;
    detail: Record<string, string | number | boolean | null> | null;
  },
  actorKind: 'HUMAN' | 'BOT' | 'SYSTEM',
  summary: string,
  nowIso: string,
): StoredLogEntry[] {
  const player = event.playerId ? state.players.find((p) => p.id === event.playerId) : null;
  const id = log.reduce((max, item) => Math.max(max, item.id), 0) + 1;
  const entry: StoredLogEntry = {
    id,
    version: state.version,
    playerId: event.playerId,
    playerName: player?.displayName ?? null,
    actorKind,
    actionType: event.actionType,
    summary,
    detail: event.detail,
    createdAt: nowIso,
  };
  const next = [...log, entry];
  return next.length > 200 ? next.slice(next.length - 200) : next;
}

export function createLocalMatch(
  config: LocalMatchConfig,
  rng: Rng = createDefaultRng(),
  nowIso: string = new Date().toISOString(),
): MerLocalMatch {
  const botLevels = config.botLevels.slice(0, 4);
  if (botLevels.length < 1) {
    throw new Error('At least 1 AI opponent is required');
  }

  const humanPlayerId = 'human-1';
  const humanName = config.playerName.trim() || '旅人';
  const seated: SeatedPlayer[] = [
    {
      id: humanPlayerId,
      userId: 'local-human',
      isBot: false,
      botLevel: null,
      color: PLAYER_COLORS[0],
      displayName: humanName,
    },
    ...botLevels.map((level, index): SeatedPlayer => ({
      id: `bot-${index + 1}`,
      userId: null,
      isBot: true,
      botLevel: level,
      color: PLAYER_COLORS[index + 1],
      displayName: `电脑 ${index + 1} (${BOT_LEVEL_LABELS[level]})`,
    })),
  ];

  const state = dealNewGame(
    {
      id: 'local-match',
      roomCode: 'OFFLINE',
      hostUserId: 'local-human',
      version: 0,
      settings: OFFLINE_SETTINGS,
    },
    seated,
    DEFS,
    rng,
    nowIso,
  );

  // Immediately let all bots confirm their initial tickets so the human can focus on picking theirs,
  // or step them deterministically via stepLocalBot. Let's keep them ready to step!
  let log: StoredLogEntry[] = [
    {
      id: 1,
      version: state.version,
      playerId: humanPlayerId,
      playerName: humanName,
      actorKind: 'SYSTEM',
      actionType: 'START_GAME',
      summary: `单机对局开始（共 ${seated.length} 位玩家），请选择初始目的地车票`,
      detail: null,
      createdAt: nowIso,
    },
  ];

  let match: MerLocalMatch = {
    state,
    humanPlayerId,
    log,
    updatedAt: nowIso,
  };

  // Pre-resolve bot initial ticket picks right away so the board starts cleanly after human picks tickets.
  while (match.state.status === 'SETUP_TICKETS') {
    const pendingBot = match.state.players.find((p) => p.isBot && !p.setupConfirmed);
    if (!pendingBot) break;
    match = stepLocalBot(match, rng, nowIso) ?? match;
  }

  return match;
}

export function projectLocalMatch(match: MerLocalMatch): ProjectedGameState {
  return projectState(match.state, match.humanPlayerId, DEFS.tickets, (st, pid) =>
    computeValidActions(st, DEFS, pid),
  );
}

export function hasPendingBotTurn(match: MerLocalMatch): boolean {
  const s = match.state;
  if (s.status === 'SETUP_TICKETS') {
    return s.players.some((p) => p.isBot && !p.setupConfirmed);
  }
  if (s.status !== 'IN_PROGRESS') return false;
  const actor = s.players[s.activeSeat];
  return Boolean(actor?.isBot);
}

export function applyHumanAction(
  match: MerLocalMatch,
  actionType: ActionType,
  payload: unknown,
  rng: Rng = createDefaultRng(),
  nowIso: string = new Date().toISOString(),
): { ok: true; match: MerLocalMatch } | { ok: false; error: string } {
  const res = applyAction(match.state, DEFS, match.humanPlayerId, actionType, payload, rng);
  if (!res.ok) {
    return { ok: false, error: errorMessage(res.error) };
  }

  let log = appendLogEntry(
    match.log,
    res.state,
    {
      actionType: res.event.actionType,
      playerId: res.event.playerId,
      detail: res.event.detail,
    },
    'HUMAN',
    summarizeEvent(res.event, res.state),
    nowIso,
  );

  if (res.state.status === 'GAME_OVER') {
    const winners = res.state.players.filter((p) => res.state.winnerPlayerIds.includes(p.id));
    log = appendLogEntry(
      log,
      res.state,
      { actionType: 'GAME_OVER', playerId: null, detail: null },
      'SYSTEM',
      winners.length > 1
        ? `游戏结束，${winners.map((w) => w.displayName).join('、')} 并列获胜`
        : `游戏结束，${winners[0]?.displayName ?? '—'} 获胜`,
      nowIso,
    );
  }

  return {
    ok: true,
    match: {
      ...match,
      state: res.state,
      log,
      updatedAt: nowIso,
    },
  };
}

function playBotStep(
  state: AuthoritativeGameState,
  bot: AuthoritativePlayer,
  rng: Rng,
): { state: AuthoritativeGameState; events: PublicEvent[] } {
  const view = projectState(state, bot.id, DEFS.tickets, (st, pid) => computeValidActions(st, DEFS, pid));
  const decision = decideBotAction(view, bot.botLevel ?? 'MEDIUM', { defs: DEFS, rng });
  if (decision) {
    const r = applyAction(state, DEFS, bot.id, decision.actionType, decision.payload, rng);
    if (r.ok) {
      return { state: r.state, events: [r.event] };
    }
  }
  if (state.status === 'SETUP_TICKETS') {
    const keep = lowestValueTickets(bot.pendingTicketIds, 2, DEFS);
    const r = applyAction(state, DEFS, bot.id, 'CHOOSE_INITIAL_TICKETS', { keptTicketIds: keep }, rng);
    if (!r.ok) throw new Error(`Bot setup fallback failed: ${r.error}`);
    return { state: r.state, events: [r.event] };
  }
  return applyTimeout(state, DEFS, rng);
}

/**
 * Advances one pending bot step (or skips a stuck turn if no legal action exists).
 * Returns null if it is currently the human player's decision or the game is over.
 */
export function stepLocalBot(
  match: MerLocalMatch,
  rng: Rng = createDefaultRng(),
  nowIso: string = new Date().toISOString(),
): MerLocalMatch | null {
  const s = match.state;
  if (s.status === 'SETUP_TICKETS') {
    const bot = s.players.find((p) => p.isBot && !p.setupConfirmed);
    if (!bot) return null;
    const step = playBotStep(s, bot, rng);
    let log = match.log;
    for (const ev of step.events) {
      log = appendLogEntry(
        log,
        step.state,
        { actionType: ev.actionType, playerId: ev.playerId, detail: ev.detail },
        'BOT',
        summarizeEvent(ev, step.state),
        nowIso,
      );
    }
    return { ...match, state: step.state, log, updatedAt: nowIso };
  }

  if (s.status !== 'IN_PROGRESS') return null;
  const actor = s.players[s.activeSeat];
  if (!actor) return null;

  const validActions = computeValidActions(s, DEFS, actor.id);
  if (!actor.isBot && validActions.length > 0) {
    return null;
  }

  const step =
    validActions.length === 0
      ? applyTimeout(s, DEFS, rng)
      : playBotStep(s, actor, rng);

  let log = match.log;
  for (const ev of step.events) {
    log = appendLogEntry(
      log,
      step.state,
      { actionType: ev.actionType, playerId: ev.playerId, detail: ev.detail },
      actor.isBot ? 'BOT' : 'SYSTEM',
      summarizeEvent(ev, step.state),
      nowIso,
    );
  }

  if (step.state.status === 'GAME_OVER') {
    const winners = step.state.players.filter((p) => step.state.winnerPlayerIds.includes(p.id));
    log = appendLogEntry(
      log,
      step.state,
      { actionType: 'GAME_OVER', playerId: null, detail: null },
      'SYSTEM',
      winners.length > 1
        ? `游戏结束，${winners.map((w) => w.displayName).join('、')} 并列获胜`
        : `游戏结束，${winners[0]?.displayName ?? '—'} 获胜`,
      nowIso,
    );
  }

  return {
    ...match,
    state: step.state,
    log,
    updatedAt: nowIso,
  };
}
