import type { AuthoritativeGameState, BotLevel } from './engine.ts';

export interface StoredLogEntry {
  id: number;
  version: number;
  playerId: string | null;
  playerName: string | null;
  actorKind: 'HUMAN' | 'BOT' | 'SYSTEM';
  actionType: string;
  summary: string;
  detail: Record<string, string | number | boolean | null> | null;
  createdAt: string;
}

export interface LocalMatchConfig {
  playerName: string;
  botLevels: BotLevel[];
}

export interface TtrLocalMatch {
  state: AuthoritativeGameState;
  humanPlayerId: string;
  log: StoredLogEntry[];
  updatedAt: string;
}

export interface TtrMetaSave {
  gamesPlayed: number;
  victories: number;
  bestScore: number;
  preferredName: string;
  preferredDifficulty: BotLevel;
  preferredBotCount: number;
  lastPlayedAt: string | null;
}
