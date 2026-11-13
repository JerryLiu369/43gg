import type { Direction, Rotation } from './geometry.ts';
import type { BoardState, FeatureRef } from './board.ts';
import type { CropCircle, ExpansionId, TradeGood } from './tiles.ts';

/** Followers (meeples in the rules sense) count for majorities; builders and pigs never do. */
export type FollowerKind = 'MEEPLE' | 'LARGE' | 'ABBOT';
export type FigureKind = FollowerKind | 'BUILDER' | 'PIG';
export type MagicFigure = 'MAGE' | 'WITCH';
/** The two scoreboard figures of a player (the messenger only exists with The Messengers). */
export type TrackFigure = 'SCORE' | 'MESSENGER';
export type CropMode = 'ADD' | 'REMOVE';
export type PartKind = 'NORMAL' | 'BUILDER' | 'MESSAGE';

export interface GameOptions {
  /** 2-6 players. */
  players: number;
  seed: string | number;
  /** Optional modules; the base game is always active. Defaults to none. */
  expansions?: readonly ExpansionId[];
  /**
   * River: also forbid a bend that makes the river flow against the direction it leaves the source
   * (official clarification, default true). Two bends placed directly one after the other may never
   * turn the same way.
   */
  riverForbidReverseBend?: boolean;
  /** Test/scenario hooks: fixed order of the main stack (top first) instead of a shuffle. */
  tileOrder?: readonly string[];
  /** Fixed order of the river tiles between source and lake. */
  riverOrder?: readonly string[];
  /** Fixed order of the message stack (top first). */
  messageOrder?: readonly number[];
}

export interface GameConfig {
  players: number;
  seed: string;
  expansions: ExpansionId[];
  riverForbidReverseBend: boolean;
}

export interface Figure {
  id: number;
  owner: number;
  kind: FigureKind;
  x: number;
  y: number;
  feature: number;
}

export interface PlayerState {
  index: number;
  /** Points of the score meeple. */
  score: number;
  /** Points of the messenger (The Messengers); merged into `score` before final scoring. */
  messengerScore: number;
  supply: Record<FigureKind, number>;
  goods: Record<TradeGood, number>;
  gold: number;
  /** Scoreboard space of the player's robber, or null while it is in the supply. */
  robber: number | null;
}

export type AwardSource = 'FEATURE' | 'ABBOT' | 'ROBBER' | 'MESSAGE';

/** Points waiting to be moved on the scoreboard (with The Messengers the recipient picks a figure). */
export interface Award {
  player: number;
  points: number;
  source: AwardSource;
  figure?: TrackFigure;
}

export type Step =
  | 'DRAW'
  | 'ROBBERS'
  | 'PLACE_TILE'
  | 'SEPARATE_1'
  | 'MAGIC'
  | 'GOLD'
  | 'FIGURE'
  | 'FERRY_PLACE'
  | 'FERRY_MOVE'
  | 'SEPARATE_2'
  | 'SCORE'
  | 'GOLD_DRAFT'
  | 'ROBBER_RESOLVE'
  | 'MESSAGES'
  | 'CROP'
  | 'END_PART';

export interface GoldDraft {
  /** Players from the active player clockwise. */
  order: number[];
  /** Index in `order` of the next player to take an ingot. */
  next: number;
  /** Tile key → players entitled to the ingots on that tile. */
  entitled: Record<string, number[]>;
}

/** One tile placement with everything attached to it (a turn has 1 part, or more with builder/message 4). */
export interface PartState {
  kind: PartKind;
  step: Step;
  tileId: string | null;
  placed: boolean;
  x: number;
  y: number;
  rotation: Rotation;
  builderTriggered: boolean;
  /** Players still to act in the robber deployment or crop-circle round. */
  queue: number[];
  magicDone: boolean;
  goldDone: boolean;
  figureDone: boolean;
  landing: { x: number; y: number; kind: 'MEEPLE' | 'LARGE' } | null;
  ferryPlaced: boolean;
  ferryCandidates: string[] | null;
  /** Pier features whose ferry connection changed this part (their roads may have been completed). */
  changedPiers: FeatureRef[];
  scored: boolean;
  goldDraft: GoldDraft | null;
  cropMode: CropMode | null;
  cropDone: boolean;
}

export interface TurnState {
  number: number;
  player: number;
  builderUsed: boolean;
  extraParts: PartKind[];
  /** Ferries (tile keys) already repositioned this turn. */
  ferriesMoved: string[];
  part: PartState;
}

/** Robber bookkeeping between two robber resolutions. */
export interface RobberRound {
  /** `${player}:${figure}` of track figures that already moved (only their first move can trigger). */
  moved: string[];
  /** Points each player scored from features/abbot since the last resolution. */
  points: number[];
  /** Robber owner → triggered by these players. */
  triggers: Record<number, number[]>;
}

export interface RiverState {
  /** Open river end: tile and the board direction the water flows out of it. */
  open: { x: number; y: number; dir: Direction } | null;
  sourceDir: Direction | null;
  /** Turn of the previous river tile if it was a bend: 1 = right (clockwise), 3 = left; null after a straight. */
  lastTurn: 1 | 3 | null;
}

export type Pending =
  | { type: 'PLACE_ROBBER'; player: number; spaces: number[]; canKeep: boolean }
  | { type: 'PLACE_TILE'; player: number; tileId: string }
  | { type: 'MAGIC'; player: number; reason: 'SYMBOL' | 'SEPARATE' }
  | { type: 'PLACE_GOLD'; player: number }
  | { type: 'FIGURE'; player: number }
  | { type: 'LAND'; player: number; x: number; y: number; kind: 'MEEPLE' | 'LARGE' }
  | { type: 'PLACE_FERRY'; player: number; x: number; y: number }
  | { type: 'MOVE_FERRY'; player: number; x: number; y: number }
  | { type: 'SCORE_FIGURE'; player: number; points: number; source: AwardSource }
  | { type: 'PICK_GOLD'; player: number; tiles: string[] }
  | { type: 'CHOOSE_VICTIM'; player: number; victims: number[] }
  | { type: 'MESSAGE'; player: number; message: number }
  | { type: 'CROP_MODE'; player: number; circle: CropCircle }
  | { type: 'CROP_ACTION'; player: number; mode: CropMode; circle: CropCircle };

export type Action =
  | { type: 'PLACE_ROBBER'; player: number; space: number }
  | { type: 'KEEP_ROBBER'; player: number }
  | { type: 'PLACE_TILE'; player: number; x: number; y: number; rotation: Rotation }
  | { type: 'PLACE_MAGIC'; player: number; figure: MagicFigure; x: number; y: number; feature: number }
  | { type: 'REMOVE_MAGIC'; player: number; figure: MagicFigure }
  | { type: 'PLACE_GOLD'; player: number; x: number; y: number }
  | { type: 'PLACE_FIGURE'; player: number; kind: FigureKind; feature: number }
  | { type: 'FLY'; player: number; kind: 'MEEPLE' | 'LARGE' }
  | { type: 'LAND'; player: number; feature: number }
  | { type: 'RECALL_ABBOT'; player: number }
  | { type: 'SKIP_FIGURE'; player: number }
  | { type: 'PLACE_FERRY'; player: number; a: number; b: number }
  | { type: 'MOVE_FERRY'; player: number; a: number; b: number }
  | { type: 'CHOOSE_SCORE_FIGURE'; player: number; figure: TrackFigure }
  | { type: 'PICK_GOLD'; player: number; x: number; y: number }
  | { type: 'CHOOSE_VICTIM'; player: number; victim: number }
  | { type: 'RESOLVE_MESSAGE'; player: number; perform: boolean; figureId?: number }
  | { type: 'CHOOSE_CROP_MODE'; player: number; mode: CropMode }
  | { type: 'CROP_ADD'; player: number; nextTo: number; kind: 'MEEPLE' | 'LARGE' }
  | { type: 'CROP_SKIP'; player: number }
  | { type: 'CROP_REMOVE'; player: number; figureId: number };

export interface GameEvent {
  type: string;
  turn: number;
  [key: string]: unknown;
}

export interface FinalBreakdown {
  robbers: number;
  roads: number;
  cities: number;
  monasteries: number;
  gardens: number;
  fields: number;
  goods: number;
  gold: number;
}

export interface FinalResult {
  scores: number[];
  /** Points added during final scoring, per player. */
  breakdown: FinalBreakdown[];
  winners: number[];
}

export interface GameState {
  config: GameConfig;
  rng: number;
  players: PlayerState[];
  board: BoardState;
  figures: Figure[];
  nextFigureId: number;
  magic: Record<MagicFigure, FeatureRef | null>;
  /** Gold ingots lying on tiles (tile key → count). */
  gold: Record<string, number>;
  supplies: { gold: number; ferries: number; goods: Record<TradeGood, number> };
  riverPile: string[];
  drawPile: string[];
  discarded: string[];
  river: RiverState;
  messageDeck: number[];
  turn: TurnState;
  awards: Award[];
  robberRound: RobberRound;
  /** Track figures of the active player moved since the last message check. */
  messageWatch: TrackFigure[];
  pending: Pending | null;
  log: GameEvent[];
  actions: Action[];
  finished: boolean;
  final: FinalResult | null;
}
