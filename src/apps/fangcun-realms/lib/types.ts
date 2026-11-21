import type { ExpansionId, GameState, PublicGameView } from '../engine/index.ts';

export const PLAYER_COLORS = ['RED', 'BLUE', 'GREEN', 'YELLOW', 'BLACK', 'PINK'] as const;
export type PlayerColor = (typeof PLAYER_COLORS)[number];

export const BOT_LEVELS = ['EASY', 'NORMAL', 'HARD'] as const;
export type BotLevel = (typeof BOT_LEVELS)[number];

export const BOT_LEVEL_LABELS: Readonly<Record<BotLevel, string>> = {
  EASY: '轻松',
  NORMAL: '标准',
  HARD: '宗师',
};

export type ClientView = Omit<PublicGameView, 'log' | 'actions'> & {
  logLength: number;
  actionCount: number;
};

export function toClientView(view: PublicGameView): ClientView {
  const { log, actions, ...rest } = view;
  return { ...rest, logLength: log.length, actionCount: actions.length };
}

export interface LocalSeat {
  seatIndex: number;
  id: string;
  displayName: string;
  color: PlayerColor;
  isBot: boolean;
  botLevel: BotLevel | null;
}

export interface SeatConfig {
  isBot: boolean;
  name?: string;
  botLevel?: BotLevel;
  color?: PlayerColor;
}

export interface FcMatchConfig {
  /** Explicit seat roster (2–6 seats, any mix of humans and bots). Takes precedence over playerName + botLevels. */
  seats?: SeatConfig[];
  /** Legacy single-human shortcut: 1 human + botLevels.length bots. */
  playerName?: string;
  botLevels?: BotLevel[];
  expansions: ExpansionId[];
  riverForbidReverseBend?: boolean;
  seed?: string;
}

export interface FcLocalMatch {
  state: GameState;
  seats: LocalSeat[];
  /** First human seat index, or -1 in all-bot spectate matches. Kept for backward compatibility. */
  humanSeat: number;
  seq: number;
  updatedAt: string;
}

export interface FcMetaSave {
  gamesPlayed: number;
  victories: number;
  bestScore: number;
  preferredName: string;
  preferredDifficulty: BotLevel;
  preferredBotCount: number;
  preferredSeats?: SeatConfig[];
  preferredExpansions: ExpansionId[];
  /** The guided first game has been finished or skipped. */
  tutorialCompleted: boolean;
  lastPlayedAt: string | null;
}
