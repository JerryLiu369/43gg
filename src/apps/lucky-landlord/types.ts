export type StreamId =
  | 'tea_night'
  | 'pet'
  | 'folk'
  | 'garden'
  | 'ore'
  | 'express'
  | 'curio'
  | 'estate';

export type RarityId = 'common' | 'uncommon' | 'rare' | 'epic';

export type RoomTypeId =
  | 'plain'
  | 'gold_shop'
  | 'sun_greenhouse'
  | 'craft_workshop'
  | 'express_hub'
  | 'quiet_suite';

export type LandlordId =
  | 'landlady_chen'
  | 'actuary_lin'
  | 'botanist_su'
  | 'guild_master_zhao';

export type TacticalMode =
  | 'none'
  | 'lock'
  | 'swap'
  | 'reroll_col'
  | 'renovate';

export type RunPhase =
  | 'ready'
  | 'post_spin'
  | 'rent_due'
  | 'victory'
  | 'gameover';

export interface SymbolDef {
  id: string;
  name: string;
  stream: StreamId;
  rarity: RarityId;
  baseCoins: number;
  /** Concise mechanics description for 1-star */
  desc: string;
  /** Additional or upgraded perk unlocked at 2-star merge */
  star2Desc: string;
  /** Short witty flavor line */
  flavor: string;
  /** Tags used by deterministic synergy rules */
  tags: string[];
  /** Optional countdown max if the symbol uses a periodic/countdown trigger */
  countdown?: number;
}

export interface RoomDef {
  id: RoomTypeId;
  name: string;
  shortLabel: string;
  desc: string;
  baseCostCoins: number;
  accentHex: string;
  bgHex: string;
  borderHex: string;
}

export interface LandlordDef {
  id: LandlordId;
  name: string;
  title: string;
  motto: string;
  perkSummary: string;
  dispatchPerCycle: number;
  rentDiscountRatio: number;
  interestRatio: number;
  freeFirstColReroll: boolean;
  mergeBonusCoins: number;
  diverseStreamsBonus: number;
  initialRooms: Array<{ cellIndex: number; room: RoomTypeId }>;
  starterDeckIds: string[];
  startingRemoveTokens: number;
  startingRenovationTickets: number;
}

export interface RelicDef {
  id: string;
  name: string;
  rarity: Exclude<RarityId, 'common'> | 'common';
  streamHint?: StreamId;
  desc: string;
}

export interface ContractDef {
  id: string;
  name: string;
  riskDesc: string;
  rewardDesc: string;
  durationCycles: number;
  /** Immediate rewards upon signing */
  immediateCoins?: number;
  immediateDispatch?: number;
  immediateRemoveTokens?: number;
  immediateRenovationTickets?: number;
  immediateRandomRoom?: RoomTypeId;
  /** Temporary cycle modifiers while active */
  rentTargetMultiplier?: number;
  draftChoicesDelta?: number;
  perSpinTaxCoins?: number;
}

export interface MarketEventDef {
  id: string;
  name: string;
  desc: string;
  boostedStream?: StreamId;
  secondaryStream?: StreamId;
  boostMultiplier?: number;
  plainCellPenalty?: number;
  expressDoubleBonus?: boolean;
}

export interface SymbolInstance {
  uid: string;
  defId: string;
  stars: 1 | 2;
  permBonus: number;
  counter: number;
  turnsAlive: number;
}

export interface BoardCell {
  index: number;
  room: RoomTypeId;
  locked: boolean;
  lockedSymbolUid: string | null;
  symbolUid: string | null;
}

export interface CellEvalDetail {
  cellIndex: number;
  symbolUid: string | null;
  defId: string | null;
  stars: 1 | 2;
  baseCoins: number;
  synergyCoins: number;
  roomMultiplier: number;
  finalCoins: number;
  notes: string[];
  destroyed: boolean;
  spawnedDefIds: string[];
}

export interface SpinEvaluation {
  totalCoins: number;
  boardCoins: number;
  globalBonusCoins: number;
  globalNotes: string[];
  cells: CellEvalDetail[];
  nextDeck: SymbolInstance[];
  dispatchEarned: number;
  removeTokensEarned: number;
  renovationTicketsEarned: number;
}

export interface ActiveContractState {
  contractId: string;
  remainingCycles: number;
}

export interface RentCycleGoal {
  cycle: number;
  rentTarget: number;
  spinsAllowed: number;
}

export interface RunState {
  version: number;
  seed: number;
  rngState: number;
  nextUidCounter: number;
  landlordId: LandlordId;
  ascension: number;
  isEndless: boolean;
  phase: RunPhase;

  coins: number;
  totalCoinsEarned: number;
  bestSingleSpin: number;
  totalSpins: number;

  cycle: number;
  spinsLeftInCycle: number;
  spinsPerCycle: number;
  rentTarget: number;

  dispatchTokens: number;
  maxDispatchTokens: number;
  usedFreeColRerollThisSpin: boolean;
  removeTokens: number;
  renovationTickets: number;
  renovationsCount: number;
  mergesCount: number;

  deck: SymbolInstance[];
  board: BoardCell[];
  /** Snapshot of board symbols right after spin/reroll/swap, before committing turn */
  rawSpinSymbolUids: Array<string | null>;
  /** Evaluation of the current post_spin board */
  currentEval: SpinEvaluation | null;

  draftChoices: string[];
  relicIds: string[];
  pendingRelicChoices: string[];
  pendingContractChoices: string[];
  signedContractThisCycle: boolean;
  activeContracts: ActiveContractState[];
  currentEventId: string | null;

  lastTurnSummary: string[];
}

export interface RunRecordSummary {
  id: string;
  dateIso: string;
  landlordId: LandlordId;
  ascension: number;
  outcome: 'victory' | 'endless' | 'bankrupt';
  cycleReached: number;
  totalCoinsEarned: number;
  bestSingleSpin: number;
}

export interface MetaSaveData {
  version: number;
  unlockedAscension: number;
  discoveredSymbols: string[];
  discoveredRelics: string[];
  discoveredRooms: RoomTypeId[];
  totalRuns: number;
  totalVictories: number;
  highestCycle: number;
  highestSingleSpin: number;
  recentRecords: RunRecordSummary[];
}
