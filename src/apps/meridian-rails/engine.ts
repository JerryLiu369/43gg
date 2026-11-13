/**
 * 经纬铁道 rules engine: game state, legal actions, payments, scoring and computer players.
 *
 * Pure module: no DOM, network or storage access. Card colours, routes and tickets are data
 * (see data.ts); the engine only knows the rule mechanics.
 */
/* eslint-disable */

export const CARD_COLORS = ['PURPLE', 'WHITE', 'BLUE', 'YELLOW', 'ORANGE', 'BLACK', 'RED', 'GREEN'] as const;
export type CardColor = (typeof CARD_COLORS)[number];
export const TRAIN_CARD_COLORS = [...CARD_COLORS, 'LOCOMOTIVE'] as const;
export type TrainCardColor = (typeof TRAIN_CARD_COLORS)[number];
export type RouteColor = CardColor | 'GRAY';
export const ROUTE_COLORS: readonly RouteColor[] = [...CARD_COLORS, 'GRAY'];

export type PlayerColor = 'RED' | 'BLUE' | 'GREEN' | 'YELLOW' | 'BLACK';
export const PLAYER_COLORS: readonly PlayerColor[] = ['RED', 'BLUE', 'GREEN', 'YELLOW', 'BLACK'];
export type BotLevel = 'EASY' | 'MEDIUM' | 'ADVANCED';
export const BOT_LEVEL_ORDER: readonly BotLevel[] = ['EASY', 'MEDIUM', 'ADVANCED'];
export const BOT_LEVEL_LABELS: Readonly<Record<BotLevel, string>> = {
  EASY: '轻松',
  MEDIUM: '标准',
  ADVANCED: '宗师',
};
export type RouteTrackType = 'REGULAR' | 'FERRY' | 'TUNNEL';
export type GameStatus = 'LOBBY' | 'SETUP_TICKETS' | 'IN_PROGRESS' | 'GAME_OVER' | 'ABANDONED';
export type TurnPhase = 'STANDBY' | 'DRAWING_SECOND_CARD' | 'AWAITING_TUNNEL_PAYMENT' | 'SELECTING_TICKETS';

/** Multiset of train cards. Missing keys mean 0. */
export type CardCounts = Partial<Record<TrainCardColor, number>>;
export type Rng = () => number; // uniform in [0, 1)

export const TRAIN_CARS_PER_PLAYER = 45;
export const STATIONS_PER_PLAYER = 3;
export const FACE_UP_SLOTS = 5;
export const LAST_ROUND_TRAIN_THRESHOLD = 2;
export const LONGEST_ROUTE_BONUS_POINTS = 10;
export const UNUSED_STATION_POINTS = 4;
export const ROUTE_POINTS: Readonly<Record<number, number>> = { 1: 1, 2: 2, 3: 4, 4: 7, 6: 15, 8: 21 };

export interface CityDefinition {
  id: string;
  name: string;
  nameZh: string;
  boardX: number; // board SVG viewBox coordinates
  boardY: number;
}

export interface RouteDefinition {
  id: string;
  city1: string; // city id
  city2: string; // city id
  length: number;
  color: RouteColor;
  type: RouteTrackType;
  requiredLocomotives: number; // > 0 only for ferries
  points: number;
  pairRouteId: string | null; // the other track of a double route
}

export interface DestinationTicket {
  id: string;
  from: string; // city id
  to: string; // city id
  points: number;
  isLong: boolean;
}

export interface ClaimedRouteRef {
  routeId: string;
  ownerPlayerId: string;
}

export interface StationRef {
  cityId: string;
  ownerPlayerId: string;
}

export interface TrainPiles {
  deck: TrainCardColor[]; // top = last element
  discard: TrainCardColor[];
  faceUp: (TrainCardColor | null)[]; // always FACE_UP_SLOTS entries
}

export type RuleViolation =
  | 'MALFORMED_PAYMENT'
  | 'INSUFFICIENT_TRAINS'
  | 'WRONG_CARD_COUNT'
  | 'MIXED_COLORS'
  | 'WRONG_COLOR'
  | 'NOT_ENOUGH_LOCOMOTIVES'
  | 'CARDS_NOT_IN_HAND'
  | 'ROUTE_ALREADY_CLAIMED'
  | 'DOUBLE_ROUTE_CLOSED'
  | 'DOUBLE_ROUTE_SAME_PLAYER'
  | 'NO_STATIONS_REMAINING'
  | 'STATION_CITY_OCCUPIED'
  | 'INVALID_TICKET_SELECTION'
  | 'NO_TICKETS_REMAINING'
  | 'NO_CARDS_AVAILABLE'
  | 'FACE_UP_LOCOMOTIVE_NOT_ALLOWED';

// Raw records as stored in data/*.json
export interface RawCityRecord {
  id: string;
  name: string;
  name_zh: string;
  board_x: number;
  board_y: number;
}

export interface RawRouteRecord {
  id: string;
  city1_id: string;
  city2_id: string;
  length: number;
  color: string;
  points: number;
  is_ferry: boolean;
  locomotives: number;
  is_tunnel: boolean;
  pair_route_id: string | null;
}

export interface RawTicketRecord {
  id: string;
  city1_id: string;
  city2_id: string;
  points: number;
  type: 'long' | 'regular';
}

export function toCityDefinition(raw: RawCityRecord): CityDefinition {
  return { id: raw.id, name: raw.name, nameZh: raw.name_zh, boardX: raw.board_x, boardY: raw.board_y };
}

export function toRouteDefinition(raw: RawRouteRecord): RouteDefinition {
  const color = raw.color.toUpperCase() as RouteColor;
  if (!ROUTE_COLORS.includes(color)) throw new Error(`Route ${raw.id}: unknown colour ${raw.color}`);
  if (ROUTE_POINTS[raw.length] !== raw.points) throw new Error(`Route ${raw.id}: points do not match length`);
  if (raw.is_ferry && raw.is_tunnel) throw new Error(`Route ${raw.id}: cannot be ferry and tunnel`);
  if (raw.is_ferry !== raw.locomotives > 0) throw new Error(`Route ${raw.id}: ferry flag and locomotives disagree`);
  return {
    id: raw.id,
    city1: raw.city1_id,
    city2: raw.city2_id,
    length: raw.length,
    color,
    type: raw.is_tunnel ? 'TUNNEL' : raw.is_ferry ? 'FERRY' : 'REGULAR',
    requiredLocomotives: raw.locomotives,
    points: raw.points,
    pairRouteId: raw.pair_route_id,
  };
}

export function toDestinationTicket(raw: RawTicketRecord): DestinationTicket {
  return { id: raw.id, from: raw.city1_id, to: raw.city2_id, points: raw.points, isLong: raw.type === 'long' };
}

export interface GameSettings {
  minPlayers: number;
  maxPlayers: number;
  turnTimeLimitSeconds: number;
  setupTimeLimitSeconds: number;
  botStepDelayMs: number; // think time before each bot step
}

// Server only. Assembled from all tables inside the action transaction.
export interface AuthoritativeGameState {
  id: string;
  roomCode: string;
  hostUserId: string;
  settings: GameSettings;
  status: GameStatus;
  turnPhase: TurnPhase;
  activeSeat: number;
  turnNumber: number;
  version: number;
  lastRoundTurnsRemaining: number | null;
  lastRoundTriggerPlayerId: string | null;
  piles: TrainPiles;
  regularTicketDeck: string[];
  boxedTicketIds: string[];
  tunnelChallenge: PublicTunnelChallenge | null;
  turnDeadlineAt: string | null; // ISO timestamp
  players: AuthoritativePlayer[]; // ordered by seatIndex
  claims: ClaimedRouteRef[];
  stations: StationRef[];
  winnerPlayerIds: string[];
}

export interface AuthoritativePlayer {
  id: string;
  userId: string | null; // null for bots
  isBot: boolean;
  botLevel: BotLevel | null;
  seatIndex: number;
  color: PlayerColor;
  displayName: string;
  trainCarsRemaining: number;
  stationsRemaining: number;
  trainCards: CardCounts; // SECRET
  ticketIds: string[]; // SECRET
  pendingTicketIds: string[]; // SECRET
  setupConfirmed: boolean;
  score: number; // running route points
  lastSeenAt: string;
  finalScore: PlayerFinalScore | null;
}

export interface PublicTunnelChallenge {
  routeId: string;
  actorPlayerId: string;
  laidDown: CardCounts; // cards on the table, public as in the physical game
  setColor: TrainCardColor; // colour the reveal had to match
  revealed: TrainCardColor[]; // 0–3 cards
  surcharge: number; // extra cards required
}

export interface PublicPlayerState {
  id: string;
  seatIndex: number;
  color: PlayerColor;
  displayName: string;
  isBot: boolean;
  botLevel: BotLevel | null;
  trainCarsRemaining: number;
  stationsRemaining: number;
  trainCardCount: number;
  ticketCount: number;
  pendingTicketCount: number;
  setupConfirmed: boolean;
  score: number;
  isOnline: boolean; // from Realtime Presence on the client; server value is lastSeenAt-based; bots are always online
  finalScore: PlayerFinalScore | null; // only at GAME_OVER
  revealedTicketIds: string[] | null; // only at GAME_OVER
}

export interface PublicGameState {
  id: string;
  roomCode: string;
  status: GameStatus;
  turnPhase: TurnPhase;
  activeSeat: number;
  activePlayerId: string | null;
  turnNumber: number;
  version: number;
  lastRoundTurnsRemaining: number | null;
  faceUpTrainCards: (TrainCardColor | null)[];
  trainDeckCount: number;
  trainDiscardCount: number;
  ticketDeckCount: number;
  claims: ClaimedRouteRef[];
  stations: StationRef[];
  players: PublicPlayerState[];
  tunnelChallenge: PublicTunnelChallenge | null;
  turnDeadlineAt: string | null;
  winnerPlayerIds: string[];
}

export interface PrivatePlayerState {
  playerId: string;
  trainCards: CardCounts;
  tickets: DestinationTicket[];
  pendingTicketOffer: DestinationTicket[]; // empty when no offer is open
  validActions: ActionType[];
}

export interface ProjectedGameState {
  public: PublicGameState;
  self: PrivatePlayerState | null; // null for spectators
}

export type ActionType =
  | 'CHOOSE_INITIAL_TICKETS'
  | 'DRAW_TRAIN_CARD'
  | 'CLAIM_ROUTE'
  | 'CONFIRM_TUNNEL'
  | 'CANCEL_TUNNEL'
  | 'BUILD_STATION'
  | 'DRAW_TICKETS'
  | 'CHOOSE_TICKETS';

export interface ActionRequest<T = unknown> {
  actionType: ActionType;
  expectedVersion: number;
  idempotencyKey: string; // UUID v4, new for every user intent, reused on network retry
  payload: T;
}

export interface ChooseTicketsPayload { keptTicketIds: string[] } // initial: ≥ 2, mid-game: ≥ 1
export interface DrawTrainCardPayload { source: 'FACE_UP' | 'DECK'; slotIndex?: number } // slotIndex 0–4 for FACE_UP
export interface ClaimRoutePayload { routeId: string; payment: CardCounts }
export interface ConfirmTunnelPayload { extraPayment: CardCounts }
export interface BuildStationPayload { cityId: string; payment: CardCounts }
// CANCEL_TUNNEL and DRAW_TICKETS have an empty payload: {}

export type ApiErrorCode =
  | RuleViolation
  | 'UNAUTHENTICATED'
  | 'NOT_A_PARTICIPANT'
  | 'GAME_NOT_FOUND'
  | 'VERSION_MISMATCH'
  | 'NOT_YOUR_TURN'
  | 'ILLEGAL_PHASE'
  | 'UNKNOWN_ROUTE'
  | 'UNKNOWN_CITY'
  | 'INVALID_PAYLOAD'
  | 'NOT_HOST' // lobby management is host-only
  | 'ROOM_FULL'
  | 'NOT_ENOUGH_PLAYERS'
  | 'PLAYER_NOT_FOUND'
  | 'NOT_A_BOT'
  | 'INTERNAL_ERROR';

export type ActionResponse =
  | { ok: true; version: number; state: ProjectedGameState }
  | { ok: false; error: ApiErrorCode; message: string; currentVersion: number };

export function projectState(
  auth: AuthoritativeGameState,
  viewerPlayerId: string | null,
  ticketDefs: ReadonlyMap<string, DestinationTicket>,
  computeValidActions: (auth: AuthoritativeGameState, playerId: string) => ActionType[]
): ProjectedGameState {
  const isOver = auth.status === 'GAME_OVER';
  const viewer = auth.players.find(p => p.id === viewerPlayerId) ?? null;
  const active = auth.status === 'IN_PROGRESS' ? auth.players[auth.activeSeat] : null;
  const ticket = (id: string) => {
    const t = ticketDefs.get(id);
    if (!t) throw new Error(`Unknown ticket ${id}`);
    return t;
  };
  const sum = (c: CardCounts) => Object.values(c).reduce((s, n) => s + (n ?? 0), 0);

  const players: PublicPlayerState[] = auth.players.map(p => ({
    id: p.id,
    seatIndex: p.seatIndex,
    color: p.color,
    displayName: p.displayName,
    isBot: p.isBot,
    botLevel: p.botLevel,
    trainCarsRemaining: p.trainCarsRemaining,
    stationsRemaining: p.stationsRemaining,
    trainCardCount: sum(p.trainCards),
    ticketCount: p.ticketIds.length,
    pendingTicketCount: p.pendingTicketIds.length,
    setupConfirmed: p.setupConfirmed,
    score: p.score,
    isOnline: p.isBot || Date.now() - Date.parse(p.lastSeenAt) < 60_000,
    finalScore: isOver ? p.finalScore : null,
    revealedTicketIds: isOver ? [...p.ticketIds] : null,
  }));

  return {
    public: {
      id: auth.id,
      roomCode: auth.roomCode,
      status: auth.status,
      turnPhase: auth.turnPhase,
      activeSeat: auth.activeSeat,
      activePlayerId: active?.id ?? null,
      turnNumber: auth.turnNumber,
      version: auth.version,
      lastRoundTurnsRemaining: auth.lastRoundTurnsRemaining,
      faceUpTrainCards: [...auth.piles.faceUp],
      trainDeckCount: auth.piles.deck.length,
      trainDiscardCount: auth.piles.discard.length,
      ticketDeckCount: auth.regularTicketDeck.length,
      claims: auth.claims,
      stations: auth.stations,
      players,
      tunnelChallenge: auth.tunnelChallenge,
      turnDeadlineAt: auth.turnDeadlineAt,
      winnerPlayerIds: auth.winnerPlayerIds,
    },
    self: viewer && {
      playerId: viewer.id,
      trainCards: { ...viewer.trainCards },
      tickets: viewer.ticketIds.map(ticket),
      // Each player has their own offer during setup, so the offer is read from the viewer, not the active seat.
      pendingTicketOffer: viewer.pendingTicketIds.map(ticket),
      validActions: computeValidActions(auth, viewer.id),
    },
  };
}

export function countCards(cards: CardCounts): number {
  let total = 0;
  for (const color of TRAIN_CARD_COLORS) total += cards[color] ?? 0;
  return total;
}

export function isWellFormedCounts(cards: CardCounts): boolean {
  return Object.entries(cards).every(
    ([color, n]) =>
      (TRAIN_CARD_COLORS as readonly string[]).includes(color) &&
      typeof n === 'number' &&
      Number.isInteger(n) &&
      n >= 0
  );
}

export function hasCards(hand: CardCounts, needed: CardCounts): boolean {
  return TRAIN_CARD_COLORS.every(c => (hand[c] ?? 0) >= (needed[c] ?? 0));
}

export function addCards(a: CardCounts, b: CardCounts): CardCounts {
  const out: CardCounts = {};
  for (const c of TRAIN_CARD_COLORS) {
    const n = (a[c] ?? 0) + (b[c] ?? 0);
    if (n > 0) out[c] = n;
  }
  return out;
}

export function subtractCards(hand: CardCounts, paid: CardCounts): CardCounts {
  if (!hasCards(hand, paid)) throw new Error('subtractCards: payment exceeds hand');
  const out: CardCounts = {};
  for (const c of TRAIN_CARD_COLORS) {
    const n = (hand[c] ?? 0) - (paid[c] ?? 0);
    if (n > 0) out[c] = n;
  }
  return out;
}

/** Colours (excluding Locomotive) that appear in a payment. */
export function nonLocomotiveColors(cards: CardCounts): CardColor[] {
  return CARD_COLORS.filter(c => (cards[c] ?? 0) > 0);
}

export function countsFromList(cards: readonly TrainCardColor[]): CardCounts {
  const out: CardCounts = {};
  for (const c of cards) out[c] = (out[c] ?? 0) + 1;
  return out;
}

export type PaymentResult =
  | { ok: true; setColor: TrainCardColor }
  | { ok: false; violation: RuleViolation };

export function validateRoutePayment(
  route: RouteDefinition,
  payment: CardCounts,
  hand: CardCounts,
  trainsRemaining: number
): PaymentResult {
  if (!isWellFormedCounts(payment)) return { ok: false, violation: 'MALFORMED_PAYMENT' };
  if (trainsRemaining < route.length) return { ok: false, violation: 'INSUFFICIENT_TRAINS' };
  if (countCards(payment) !== route.length) return { ok: false, violation: 'WRONG_CARD_COUNT' };

  const colors = nonLocomotiveColors(payment);
  if (colors.length > 1) return { ok: false, violation: 'MIXED_COLORS' };
  if (colors.length === 1 && route.color !== 'GRAY' && colors[0] !== route.color) {
    return { ok: false, violation: 'WRONG_COLOR' };
  }
  if ((payment.LOCOMOTIVE ?? 0) < route.requiredLocomotives) {
    return { ok: false, violation: 'NOT_ENOUGH_LOCOMOTIVES' };
  }
  if (!hasCards(hand, payment)) return { ok: false, violation: 'CARDS_NOT_IN_HAND' };

  return { ok: true, setColor: colors[0] ?? 'LOCOMOTIVE' };
}

export function validateRouteAvailability(
  route: RouteDefinition,
  playerId: string,
  playerCount: number,
  ownerByRouteId: ReadonlyMap<string, string>
): RuleViolation | null {
  if (ownerByRouteId.has(route.id)) return 'ROUTE_ALREADY_CLAIMED';
  if (route.pairRouteId === null) return null;

  const pairOwner = ownerByRouteId.get(route.pairRouteId);
  if (pairOwner === undefined) return null;
  if (playerCount <= 3) return 'DOUBLE_ROUTE_CLOSED';
  if (pairOwner === playerId) return 'DOUBLE_ROUTE_SAME_PLAYER';
  return null;
}

export function tunnelSurcharge(setColor: TrainCardColor, revealed: readonly TrainCardColor[]): number {
  // A Locomotive always matches; when setColor is LOCOMOTIVE this reduces to "count Locomotives".
  return revealed.filter(c => c === 'LOCOMOTIVE' || c === setColor).length;
}

export function validateTunnelSurcharge(
  setColor: TrainCardColor,
  surcharge: number,
  extra: CardCounts,
  handAfterLayDown: CardCounts
): RuleViolation | null {
  if (!isWellFormedCounts(extra)) return 'MALFORMED_PAYMENT';
  if (countCards(extra) !== surcharge) return 'WRONG_CARD_COUNT';
  const allowed = new Set<TrainCardColor>(['LOCOMOTIVE', setColor]);
  for (const c of TRAIN_CARD_COLORS) {
    if ((extra[c] ?? 0) > 0 && !allowed.has(c)) return 'WRONG_COLOR';
  }
  if (!hasCards(handAfterLayDown, extra)) return 'CARDS_NOT_IN_HAND';
  return null;
}

export function revealTunnelCards(piles: TrainPiles, rng: Rng): TrainCardColor[] {
  const revealed: TrainCardColor[] = [];
  for (let i = 0; i < 3; i++) {
    const card = drawFromDeck(piles, rng);
    if (card === null) break;
    revealed.push(card);
  }
  return revealed;
}

export const MAX_FACE_UP_RESETS = 10;

export function shuffleInPlace<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** Top of the deck is the end of the array. Reshuffles the discard pile when the deck is empty. */
export function drawFromDeck(piles: TrainPiles, rng: Rng): TrainCardColor | null {
  if (piles.deck.length === 0 && piles.discard.length > 0) {
    piles.deck = shuffleInPlace(piles.discard, rng);
    piles.discard = [];
  }
  return piles.deck.pop() ?? null;
}

export function countLocomotives(row: readonly (TrainCardColor | null)[]): number {
  return row.filter(c => c === 'LOCOMOTIVE').length;
}

/** Fills empty slots, then applies the 3-Locomotive reset. Returns the number of resets performed. */
export function refillFaceUp(piles: TrainPiles, rng: Rng): number {
  for (let i = 0; i < FACE_UP_SLOTS; i++) {
    if (piles.faceUp[i] === null) piles.faceUp[i] = drawFromDeck(piles, rng);
  }
  let resets = 0;
  while (countLocomotives(piles.faceUp) >= 3 && resets < MAX_FACE_UP_RESETS) {
    const nonLocomotivesInCirculation = [...piles.deck, ...piles.discard, ...piles.faceUp].filter(
      c => c !== null && c !== 'LOCOMOTIVE'
    ).length;
    // [house] A new row could never have fewer than 3 Locomotives: stop instead of looping.
    if (nonLocomotivesInCirculation < 3) break;
    for (const c of piles.faceUp) if (c !== null) piles.discard.push(c);
    piles.faceUp = new Array(FACE_UP_SLOTS).fill(null);
    for (let i = 0; i < FACE_UP_SLOTS; i++) piles.faceUp[i] = drawFromDeck(piles, rng);
    resets++;
  }
  return resets;
}

export function canTakeFaceUp(phase: TurnPhase, card: TrainCardColor | null): boolean {
  if (card === null) return false;
  if (phase === 'STANDBY') return true;
  return phase === 'DRAWING_SECOND_CARD' && card !== 'LOCOMOTIVE';
}

/** True when the player in `phase` could legally take at least one card. */
export function canDrawAnyCard(piles: TrainPiles, phase: TurnPhase): boolean {
  if (piles.deck.length > 0 || piles.discard.length > 0) return true;
  return piles.faceUp.some(c => canTakeFaceUp(phase, c));
}

/** Top of the ticket deck is index 0. Returns the offer and mutates the deck. */
export function drawTicketOffer(deck: string[], count = 3): string[] {
  return deck.splice(0, Math.min(count, deck.length));
}

export function validateTicketChoice(
  offer: readonly string[],
  kept: readonly string[],
  minKeep: number
): RuleViolation | null {
  const unique = new Set(kept);
  if (unique.size !== kept.length) return 'INVALID_TICKET_SELECTION';
  if (!kept.every(id => offer.includes(id))) return 'INVALID_TICKET_SELECTION';
  if (kept.length < Math.min(minKeep, offer.length)) return 'INVALID_TICKET_SELECTION';
  return null;
}

/** Mid-game draw: unkept tickets go to the bottom of the deck, in offer order. */
export function returnUnkeptToBottom(deck: string[], offer: readonly string[], kept: readonly string[]): void {
  for (const id of offer) if (!kept.includes(id)) deck.push(id);
}

export function validateStationBuild(
  cityId: string,
  stationsRemaining: number,
  occupiedCityIds: ReadonlySet<string>,
  payment: CardCounts,
  hand: CardCounts
): RuleViolation | null {
  if (stationsRemaining <= 0) return 'NO_STATIONS_REMAINING';
  if (occupiedCityIds.has(cityId)) return 'STATION_CITY_OCCUPIED';
  if (!isWellFormedCounts(payment)) return 'MALFORMED_PAYMENT';
  const cost = STATIONS_PER_PLAYER - stationsRemaining + 1; // 1, 2, 3
  if (countCards(payment) !== cost) return 'WRONG_CARD_COUNT';
  if (nonLocomotiveColors(payment).length > 1) return 'MIXED_COLORS';
  if (!hasCards(hand, payment)) return 'CARDS_NOT_IN_HAND';
  return null;
}

export class DisjointSet {
  private parent = new Map<string, string>();

  find(x: string): string {
    let root = x;
    while (this.parent.has(root) && this.parent.get(root) !== root) root = this.parent.get(root)!;
    let node = x;
    while (node !== root) {
      const next = this.parent.get(node) ?? root;
      this.parent.set(node, root);
      node = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }

  connected(a: string, b: string): boolean {
    return this.find(a) === this.find(b);
  }

  clone(): DisjointSet {
    const copy = new DisjointSet();
    for (const [k, v] of this.parent) copy.parent.set(k, v);
    return copy;
  }
}

export interface TicketOutcome {
  ticketId: string;
  completed: boolean;
  points: number; // +value or -value
}

export interface TicketEvaluation {
  borrowedRouteByCity: Record<string, string>;
  outcomes: TicketOutcome[];
  netPoints: number;
  completedCount: number;
}

export function evaluateTicketsWithStations(
  playerId: string,
  tickets: readonly DestinationTicket[],
  claims: readonly ClaimedRouteRef[],
  stations: readonly StationRef[],
  routeDefs: ReadonlyMap<string, RouteDefinition>
): TicketEvaluation {
  const base = new DisjointSet();
  for (const c of claims) {
    if (c.ownerPlayerId !== playerId) continue;
    const r = routeDefs.get(c.routeId)!;
    base.union(r.city1, r.city2);
  }

  const opponentRoutes = claims
    .filter(c => c.ownerPlayerId !== playerId)
    .map(c => routeDefs.get(c.routeId)!);
  const stationCities = stations.filter(s => s.ownerPlayerId === playerId).map(s => s.cityId);
  const options: (RouteDefinition | null)[][] = stationCities.map(city => [
    null,
    ...opponentRoutes.filter(r => r.city1 === city || r.city2 === city),
  ]);

  const score = (dsu: DisjointSet) => {
    const outcomes = tickets.map(t => {
      const completed = dsu.connected(t.from, t.to);
      return { ticketId: t.id, completed, points: completed ? t.points : -t.points };
    });
    return {
      outcomes,
      netPoints: outcomes.reduce((sum, o) => sum + o.points, 0),
      completedCount: outcomes.filter(o => o.completed).length,
    };
  };

  let best: TicketEvaluation | null = null;
  const choice: (RouteDefinition | null)[] = [];

  const visit = (i: number): void => {
    if (i === options.length) {
      const dsu = base.clone();
      for (const r of choice) if (r) dsu.union(r.city1, r.city2);
      const result = score(dsu);
      if (
        best === null ||
        result.netPoints > best.netPoints ||
        (result.netPoints === best.netPoints && result.completedCount > best.completedCount)
      ) {
        const borrowedRouteByCity: Record<string, string> = {};
        choice.forEach((r, k) => {
          if (r) borrowedRouteByCity[stationCities[k]] = r.id;
        });
        best = { borrowedRouteByCity, ...result };
      }
      return;
    }
    for (const option of options[i]) {
      choice[i] = option;
      visit(i + 1);
    }
  };

  visit(0);
  return best!;
}

export interface LongestPathResult {
  length: number;
  routeIds: string[];
}

export function longestContinuousPath(routes: readonly RouteDefinition[]): LongestPathResult {
  const adjacency = new Map<string, { to: string; route: RouteDefinition }[]>();
  const link = (from: string, to: string, route: RouteDefinition) => {
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from)!.push({ to, route });
  };
  for (const r of routes) {
    link(r.city1, r.city2, r);
    link(r.city2, r.city1, r);
  }

  // Connected components, as lists of routes.
  const seen = new Set<string>();
  const components: RouteDefinition[][] = [];
  for (const start of adjacency.keys()) {
    if (seen.has(start)) continue;
    const routeIds = new Set<string>();
    const component: RouteDefinition[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const city = stack.pop()!;
      for (const { to, route } of adjacency.get(city)!) {
        if (!routeIds.has(route.id)) {
          routeIds.add(route.id);
          component.push(route);
        }
        if (!seen.has(to)) {
          seen.add(to);
          stack.push(to);
        }
      }
    }
    components.push(component);
  }

  let best: LongestPathResult = { length: 0, routeIds: [] };
  const used = new Set<string>();
  const path: string[] = [];

  const dfs = (city: string, length: number, unusedWeight: number): void => {
    if (length > best.length) best = { length, routeIds: [...path] };
    if (length + unusedWeight <= best.length) return;
    for (const { to, route } of adjacency.get(city)!) {
      if (used.has(route.id)) continue;
      used.add(route.id);
      path.push(route.id);
      dfs(to, length + route.length, unusedWeight - route.length);
      path.pop();
      used.delete(route.id);
    }
  };

  for (const component of components) {
    const total = component.reduce((sum, r) => sum + r.length, 0);
    if (total <= best.length) continue;
    const cities = [...new Set(component.flatMap(r => [r.city1, r.city2]))];
    const degree = (c: string) => adjacency.get(c)!.length;
    cities.sort((a, b) => (degree(b) % 2) - (degree(a) % 2) || degree(a) - degree(b));
    for (const start of cities) dfs(start, 0, total);
  }
  return best;
}

export function onTurnCompleted(
  lastRoundTurnsRemaining: number | null,
  actorTrainsRemaining: number,
  playerCount: number
): { lastRoundTurnsRemaining: number | null; gameOver: boolean } {
  if (lastRoundTurnsRemaining === null) {
    if (actorTrainsRemaining <= LAST_ROUND_TRAIN_THRESHOLD) {
      return { lastRoundTurnsRemaining: playerCount, gameOver: false };
    }
    return { lastRoundTurnsRemaining: null, gameOver: false };
  }
  const left = lastRoundTurnsRemaining - 1;
  return { lastRoundTurnsRemaining: left, gameOver: left === 0 };
}

export interface FinalScoringPlayer {
  id: string;
  runningScore: number;
  stationsRemaining: number;
  ticketIds: readonly string[];
}

export interface PlayerFinalScore {
  playerId: string;
  routePoints: number;
  ticketPointsGained: number;
  ticketPointsLost: number;
  stationPoints: number;
  longestRouteBonus: number;
  longestPathLength: number;
  longestPathRouteIds: string[];
  completedTicketCount: number;
  stationsUsed: number;
  hasLongestRoute: boolean;
  borrowedRouteByCity: Record<string, string>;
  ticketOutcomes: TicketOutcome[];
  total: number;
  rank: number; // 1 = winner; equal ranks share the place
}

export function compareForVictory(a: PlayerFinalScore, b: PlayerFinalScore): number {
  return (
    b.total - a.total ||
    b.completedTicketCount - a.completedTicketCount ||
    a.stationsUsed - b.stationsUsed ||
    Number(b.hasLongestRoute) - Number(a.hasLongestRoute)
  );
}

export function computeFinalScores(
  players: readonly FinalScoringPlayer[],
  claims: readonly ClaimedRouteRef[],
  stations: readonly StationRef[],
  routeDefs: ReadonlyMap<string, RouteDefinition>,
  ticketDefs: ReadonlyMap<string, DestinationTicket>
): { scores: PlayerFinalScore[]; winnerPlayerIds: string[] } {
  const paths = new Map<string, LongestPathResult>();
  for (const p of players) {
    const owned = claims.filter(c => c.ownerPlayerId === p.id).map(c => routeDefs.get(c.routeId)!);
    paths.set(p.id, longestContinuousPath(owned));
  }
  const longest = Math.max(0, ...[...paths.values()].map(r => r.length));

  const scores: PlayerFinalScore[] = players.map(p => {
    const routePoints = claims
      .filter(c => c.ownerPlayerId === p.id)
      .reduce((sum, c) => sum + ROUTE_POINTS[routeDefs.get(c.routeId)!.length], 0);
    if (routePoints !== p.runningScore) {
      throw new Error(`Route points mismatch for ${p.id}: recount ${routePoints}, running ${p.runningScore}`);
    }

    const tickets = p.ticketIds.map(id => ticketDefs.get(id)!);
    const evaluation = evaluateTicketsWithStations(p.id, tickets, claims, stations, routeDefs);
    const ticketPointsGained = evaluation.outcomes.filter(o => o.completed).reduce((s, o) => s + o.points, 0);
    const ticketPointsLost = -evaluation.outcomes.filter(o => !o.completed).reduce((s, o) => s + o.points, 0);

    const path = paths.get(p.id)!;
    const hasLongestRoute = longest > 0 && path.length === longest;
    const longestRouteBonus = hasLongestRoute ? LONGEST_ROUTE_BONUS_POINTS : 0;
    const stationPoints = p.stationsRemaining * UNUSED_STATION_POINTS;

    return {
      playerId: p.id,
      routePoints,
      ticketPointsGained,
      ticketPointsLost,
      stationPoints,
      longestRouteBonus,
      longestPathLength: path.length,
      longestPathRouteIds: path.routeIds,
      completedTicketCount: evaluation.completedCount,
      stationsUsed: STATIONS_PER_PLAYER - p.stationsRemaining,
      hasLongestRoute,
      borrowedRouteByCity: evaluation.borrowedRouteByCity,
      ticketOutcomes: evaluation.outcomes,
      total: routePoints + ticketPointsGained - ticketPointsLost + stationPoints + longestRouteBonus,
      rank: 0,
    };
  });

  const ordered = [...scores].sort(compareForVictory);
  ordered.forEach((s, i) => {
    s.rank = i > 0 && compareForVictory(ordered[i - 1], s) === 0 ? ordered[i - 1].rank : i + 1;
  });
  const winnerPlayerIds = ordered.filter(s => s.rank === 1).map(s => s.playerId);
  return { scores, winnerPlayerIds };
}

export interface GameDefinitions {
  routes: ReadonlyMap<string, RouteDefinition>;
  tickets: ReadonlyMap<string, DestinationTicket>;
  cityIds: ReadonlySet<string>;
}

export function buildDefinitions(
  cities: readonly RawCityRecord[],
  routes: readonly RawRouteRecord[],
  tickets: readonly RawTicketRecord[]
): GameDefinitions {
  return {
    routes: new Map(routes.map(r => [r.id, toRouteDefinition(r)])),
    tickets: new Map(tickets.map(t => [t.id, toDestinationTicket(t)])),
    cityIds: new Set(cities.map(c => c.id)),
  };
}

export interface SeatedPlayer {
  id: string;
  userId: string | null;
  isBot: boolean;
  botLevel: BotLevel | null;
  color: PlayerColor;
  displayName: string;
}

export function fullTrainDeck(): TrainCardColor[] {
  const deck: TrainCardColor[] = [];
  for (const c of CARD_COLORS) for (let i = 0; i < 12; i++) deck.push(c);
  for (let i = 0; i < 14; i++) deck.push('LOCOMOTIVE');
  return deck;
}

export function listFromCounts(cards: CardCounts): TrainCardColor[] {
  const out: TrainCardColor[] = [];
  for (const c of TRAIN_CARD_COLORS) for (let i = 0; i < (cards[c] ?? 0); i++) out.push(c);
  return out;
}

export function dealNewGame(
  game: { id: string; roomCode: string; hostUserId: string; version: number; settings: GameSettings },
  seated: readonly SeatedPlayer[],
  defs: GameDefinitions,
  rng: Rng,
  nowIso: string
): AuthoritativeGameState {
  if (seated.length < 2 || seated.length > PLAYER_COLORS.length) throw new Error('dealNewGame: 2-5 players required');
  const piles: TrainPiles = {
    deck: shuffleInPlace(fullTrainDeck(), rng),
    discard: [],
    faceUp: new Array(FACE_UP_SLOTS).fill(null),
  };
  const allTickets = [...defs.tickets.values()];
  const longIds = shuffleInPlace(allTickets.filter(t => t.isLong).map(t => t.id), rng);
  const regularTicketDeck = shuffleInPlace(allTickets.filter(t => !t.isLong).map(t => t.id), rng);

  const players: AuthoritativePlayer[] = shuffleInPlace([...seated], rng).map((p, seatIndex) => ({
    id: p.id,
    userId: p.userId,
    isBot: p.isBot,
    botLevel: p.botLevel,
    seatIndex,
    color: p.color,
    displayName: p.displayName,
    trainCarsRemaining: TRAIN_CARS_PER_PLAYER,
    stationsRemaining: STATIONS_PER_PLAYER,
    trainCards: countsFromList(piles.deck.splice(piles.deck.length - 4, 4)),
    ticketIds: [],
    pendingTicketIds: [longIds.pop()!, ...drawTicketOffer(regularTicketDeck, 3)],
    setupConfirmed: false,
    score: 0,
    lastSeenAt: nowIso,
    finalScore: null,
  }));
  refillFaceUp(piles, rng);

  return {
    id: game.id,
    roomCode: game.roomCode,
    hostUserId: game.hostUserId,
    settings: game.settings,
    status: 'SETUP_TICKETS',
    turnPhase: 'STANDBY',
    activeSeat: 0,
    turnNumber: 1,
    version: game.version + 1,
    lastRoundTurnsRemaining: null,
    lastRoundTriggerPlayerId: null,
    piles,
    regularTicketDeck,
    boxedTicketIds: longIds, // undealt long tickets
    tunnelChallenge: null,
    turnDeadlineAt: null,
    players,
    claims: [],
    stations: [],
    winnerPlayerIds: [],
  };
}

function singleColourOptions(
  colors: readonly CardColor[],
  total: number,
  minLocomotives: number,
  hand: CardCounts
): CardCounts[] {
  const out: CardCounts[] = [];
  const locos = hand.LOCOMOTIVE ?? 0;
  for (const color of colors) {
    for (let l = minLocomotives; l < total; l++) {
      const n = total - l;
      if ((hand[color] ?? 0) >= n && locos >= l) out.push(l > 0 ? { [color]: n, LOCOMOTIVE: l } : { [color]: n });
    }
  }
  if (locos >= total) out.push({ LOCOMOTIVE: total });
  return out;
}

export function routePaymentOptions(route: RouteDefinition, hand: CardCounts, trainsRemaining: number): CardCounts[] {
  if (trainsRemaining < route.length) return [];
  const colors = route.color === 'GRAY' ? CARD_COLORS : [route.color];
  return singleColourOptions(colors, route.length, route.requiredLocomotives, hand);
}

export function stationPaymentOptions(stationsRemaining: number, hand: CardCounts): CardCounts[] {
  if (stationsRemaining <= 0) return [];
  return singleColourOptions(CARD_COLORS, STATIONS_PER_PLAYER - stationsRemaining + 1, 0, hand);
}

export function tunnelExtraOptions(setColor: TrainCardColor, surcharge: number, hand: CardCounts): CardCounts[] {
  if (setColor === 'LOCOMOTIVE') return (hand.LOCOMOTIVE ?? 0) >= surcharge ? [{ LOCOMOTIVE: surcharge }] : [];
  return singleColourOptions([setColor], surcharge, 0, hand);
}

export function ownerByRoute(claims: readonly ClaimedRouteRef[]): Map<string, string> {
  return new Map(claims.map(c => [c.routeId, c.ownerPlayerId]));
}

/** Routes the player may claim right now: available to them and payable from the hand. */
export function claimableRoutes(
  routes: Iterable<RouteDefinition>,
  playerId: string,
  playerCount: number,
  claims: readonly ClaimedRouteRef[],
  hand: CardCounts,
  trainsRemaining: number
): RouteDefinition[] {
  const owners = ownerByRoute(claims);
  const out: RouteDefinition[] = [];
  for (const r of routes) {
    if (validateRouteAvailability(r, playerId, playerCount, owners) !== null) continue;
    if (routePaymentOptions(r, hand, trainsRemaining).length > 0) out.push(r);
  }
  return out;
}

export function computeValidActions(state: AuthoritativeGameState, defs: GameDefinitions, playerId: string): ActionType[] {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return [];
  if (state.status === 'SETUP_TICKETS') return player.setupConfirmed ? [] : ['CHOOSE_INITIAL_TICKETS'];
  if (state.status !== 'IN_PROGRESS' || state.players[state.activeSeat].id !== playerId) return [];

  switch (state.turnPhase) {
    case 'DRAWING_SECOND_CARD':
      return ['DRAW_TRAIN_CARD'];
    case 'SELECTING_TICKETS':
      return ['CHOOSE_TICKETS'];
    case 'AWAITING_TUNNEL_PAYMENT': {
      const ch = state.tunnelChallenge!;
      return tunnelExtraOptions(ch.setColor, ch.surcharge, player.trainCards).length > 0
        ? ['CONFIRM_TUNNEL', 'CANCEL_TUNNEL']
        : ['CANCEL_TUNNEL'];
    }
    case 'STANDBY': {
      const out: ActionType[] = [];
      if (canDrawAnyCard(state.piles, 'STANDBY')) out.push('DRAW_TRAIN_CARD');
      const hand = player.trainCards;
      if (claimableRoutes(defs.routes.values(), playerId, state.players.length, state.claims, hand, player.trainCarsRemaining).length > 0) {
        out.push('CLAIM_ROUTE');
      }
      // 47 cities and at most 15 stations: a free city always exists.
      if (stationPaymentOptions(player.stationsRemaining, hand).length > 0) out.push('BUILD_STATION');
      if (state.regularTicketDeck.length > 0) out.push('DRAW_TICKETS');
      return out;
    }
  }
}

export interface PublicEvent {
  actionType: ActionType | 'TIMEOUT_PASS';
  playerId: string;
  turnEnded: boolean;
  detail: Record<string, string | number | boolean | null>;
}

export type EngineResult =
  | { ok: true; state: AuthoritativeGameState; event: PublicEvent }
  | { ok: false; error: ApiErrorCode };

class EngineRejection extends Error {
  code: ApiErrorCode;
  constructor(code: ApiErrorCode) {
    super(code);
    this.code = code;
  }
}

function reject(code: ApiErrorCode): never {
  throw new EngineRejection(code);
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function cardsField(v: unknown): CardCounts {
  if (!isRecord(v)) reject('INVALID_PAYLOAD');
  return v as CardCounts; // shape errors inside are reported as MALFORMED_PAYMENT by the validators
}

function ticketIdsField(v: unknown): string[] {
  if (!Array.isArray(v) || !v.every(x => typeof x === 'string')) reject('INVALID_PAYLOAD');
  return v as string[];
}

function claimRouteFor(s: AuthoritativeGameState, player: AuthoritativePlayer, route: RouteDefinition): void {
  player.trainCarsRemaining -= route.length;
  player.score += ROUTE_POINTS[route.length];
  s.claims.push({ routeId: route.id, ownerPlayerId: player.id });
}

function finishGame(s: AuthoritativeGameState, defs: GameDefinitions): void {
  const { scores, winnerPlayerIds } = computeFinalScores(
    s.players.map(p => ({ id: p.id, runningScore: p.score, stationsRemaining: p.stationsRemaining, ticketIds: p.ticketIds })),
    s.claims,
    s.stations,
    defs.routes,
    defs.tickets
  );
  for (const p of s.players) p.finalScore = scores.find(x => x.playerId === p.id)!;
  s.winnerPlayerIds = winnerPlayerIds;
  s.status = 'GAME_OVER';
  s.turnDeadlineAt = null;
}

function endTurn(s: AuthoritativeGameState, defs: GameDefinitions, rng: Rng): void {
  const actor = s.players[s.activeSeat];
  // [house] Slots left empty by an exhausted deck are refilled once discards exist again.
  if (s.piles.faceUp.includes(null)) refillFaceUp(s.piles, rng);
  s.tunnelChallenge = null;
  s.turnPhase = 'STANDBY';
  const r = onTurnCompleted(s.lastRoundTurnsRemaining, actor.trainCarsRemaining, s.players.length);
  if (s.lastRoundTurnsRemaining === null && r.lastRoundTurnsRemaining !== null) s.lastRoundTriggerPlayerId = actor.id;
  s.lastRoundTurnsRemaining = r.lastRoundTurnsRemaining;
  if (r.gameOver) {
    finishGame(s, defs);
    return;
  }
  s.activeSeat = (s.activeSeat + 1) % s.players.length;
  s.turnNumber += 1;
}

function dispatch(
  s: AuthoritativeGameState,
  defs: GameDefinitions,
  playerId: string,
  actionType: ActionType,
  payload: unknown,
  rng: Rng
): PublicEvent {
  const player = s.players.find(p => p.id === playerId) ?? reject('NOT_A_PARTICIPANT');
  const event = (turnEnded: boolean, detail: PublicEvent['detail'] = {}): PublicEvent => ({ actionType, playerId, turnEnded, detail });

  if (actionType === 'CHOOSE_INITIAL_TICKETS') {
    if (s.status !== 'SETUP_TICKETS' || player.setupConfirmed) reject('ILLEGAL_PHASE');
    const kept = ticketIdsField(isRecord(payload) ? payload.keptTicketIds : undefined);
    const violation = validateTicketChoice(player.pendingTicketIds, kept, 2);
    if (violation) reject(violation);
    s.boxedTicketIds.push(...player.pendingTicketIds.filter(id => !kept.includes(id)));
    player.ticketIds = [...kept];
    player.pendingTicketIds = [];
    player.setupConfirmed = true;
    if (s.players.every(p => p.setupConfirmed)) {
      s.status = 'IN_PROGRESS';
      s.turnPhase = 'STANDBY';
      s.activeSeat = 0;
    }
    return event(false, { kept: kept.length });
  }

  if (s.status !== 'IN_PROGRESS') reject('ILLEGAL_PHASE');
  if (s.players[s.activeSeat].id !== playerId) reject('NOT_YOUR_TURN');
  const phase = s.turnPhase;
  const requirePhase = (...allowed: TurnPhase[]) => {
    if (!allowed.includes(phase)) reject('ILLEGAL_PHASE');
  };
  if (!isRecord(payload)) reject('INVALID_PAYLOAD');
  const p = payload;

  switch (actionType) {
    case 'DRAW_TRAIN_CARD': {
      requirePhase('STANDBY', 'DRAWING_SECOND_CARD');
      let card: TrainCardColor | null = null;
      const fromFaceUp = p.source === 'FACE_UP';
      if (fromFaceUp) {
        const slot = p.slotIndex;
        if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot >= FACE_UP_SLOTS) reject('INVALID_PAYLOAD');
        card = s.piles.faceUp[slot];
        if (card === null) reject('INVALID_PAYLOAD');
        if (!canTakeFaceUp(phase, card)) reject('FACE_UP_LOCOMOTIVE_NOT_ALLOWED');
        s.piles.faceUp[slot] = null;
      } else if (p.source === 'DECK') {
        card = drawFromDeck(s.piles, rng);
        if (card === null) reject('NO_CARDS_AVAILABLE');
      } else {
        reject('INVALID_PAYLOAD');
      }
      player.trainCards = addCards(player.trainCards, { [card]: 1 });
      if (fromFaceUp) refillFaceUp(s.piles, rng);
      const turnEnded =
        phase === 'DRAWING_SECOND_CARD' ||
        (fromFaceUp && card === 'LOCOMOTIVE') ||
        !canDrawAnyCard(s.piles, 'DRAWING_SECOND_CARD');
      const ev = event(turnEnded, { source: p.source as string, card: fromFaceUp ? card : null });
      if (turnEnded) endTurn(s, defs, rng);
      else s.turnPhase = 'DRAWING_SECOND_CARD';
      return ev;
    }

    case 'CLAIM_ROUTE': {
      requirePhase('STANDBY');
      if (typeof p.routeId !== 'string') reject('INVALID_PAYLOAD');
      const route = defs.routes.get(p.routeId) ?? reject('UNKNOWN_ROUTE');
      const payment = cardsField(p.payment);
      const blocked = validateRouteAvailability(route, playerId, s.players.length, ownerByRoute(s.claims));
      if (blocked) reject(blocked);
      const pay = validateRoutePayment(route, payment, player.trainCards, player.trainCarsRemaining);
      if (!pay.ok) reject(pay.violation);
      player.trainCards = subtractCards(player.trainCards, payment);

      if (route.type !== 'TUNNEL') {
        s.piles.discard.push(...listFromCounts(payment));
        claimRouteFor(s, player, route);
        const ev = event(true, { routeId: route.id });
        endTurn(s, defs, rng);
        return ev;
      }
      const revealed = revealTunnelCards(s.piles, rng);
      const surcharge = tunnelSurcharge(pay.setColor, revealed);
      if (surcharge === 0) {
        s.piles.discard.push(...listFromCounts(payment), ...revealed);
        claimRouteFor(s, player, route);
        const ev = event(true, { routeId: route.id, revealed: revealed.join(','), surcharge: 0 });
        endTurn(s, defs, rng);
        return ev;
      }
      s.tunnelChallenge = { routeId: route.id, actorPlayerId: playerId, laidDown: payment, setColor: pay.setColor, revealed, surcharge };
      s.turnPhase = 'AWAITING_TUNNEL_PAYMENT';
      return event(false, { routeId: route.id, revealed: revealed.join(','), surcharge });
    }

    case 'CONFIRM_TUNNEL': {
      requirePhase('AWAITING_TUNNEL_PAYMENT');
      const ch = s.tunnelChallenge!;
      const extra = cardsField(p.extraPayment);
      const violation = validateTunnelSurcharge(ch.setColor, ch.surcharge, extra, player.trainCards);
      if (violation) reject(violation);
      player.trainCards = subtractCards(player.trainCards, extra);
      s.piles.discard.push(...listFromCounts(ch.laidDown), ...listFromCounts(extra), ...ch.revealed);
      claimRouteFor(s, player, defs.routes.get(ch.routeId)!);
      const ev = event(true, { routeId: ch.routeId });
      endTurn(s, defs, rng);
      return ev;
    }

    case 'CANCEL_TUNNEL': {
      requirePhase('AWAITING_TUNNEL_PAYMENT');
      const ch = s.tunnelChallenge!;
      player.trainCards = addCards(player.trainCards, ch.laidDown);
      s.piles.discard.push(...ch.revealed);
      const ev = event(true, { routeId: ch.routeId });
      endTurn(s, defs, rng);
      return ev;
    }

    case 'BUILD_STATION': {
      requirePhase('STANDBY');
      if (typeof p.cityId !== 'string') reject('INVALID_PAYLOAD');
      const cityId = p.cityId;
      if (!defs.cityIds.has(cityId)) reject('UNKNOWN_CITY');
      const payment = cardsField(p.payment);
      const occupied = new Set(s.stations.map(st => st.cityId));
      const violation = validateStationBuild(cityId, player.stationsRemaining, occupied, payment, player.trainCards);
      if (violation) reject(violation);
      player.trainCards = subtractCards(player.trainCards, payment);
      s.piles.discard.push(...listFromCounts(payment));
      player.stationsRemaining -= 1;
      s.stations.push({ cityId, ownerPlayerId: playerId });
      const ev = event(true, { cityId });
      endTurn(s, defs, rng);
      return ev;
    }

    case 'DRAW_TICKETS': {
      requirePhase('STANDBY');
      if (s.regularTicketDeck.length === 0) reject('NO_TICKETS_REMAINING');
      player.pendingTicketIds = drawTicketOffer(s.regularTicketDeck);
      s.turnPhase = 'SELECTING_TICKETS';
      return event(false, { offered: player.pendingTicketIds.length });
    }

    case 'CHOOSE_TICKETS': {
      requirePhase('SELECTING_TICKETS');
      const kept = ticketIdsField(p.keptTicketIds);
      const violation = validateTicketChoice(player.pendingTicketIds, kept, 1);
      if (violation) reject(violation);
      player.ticketIds.push(...kept);
      returnUnkeptToBottom(s.regularTicketDeck, player.pendingTicketIds, kept);
      player.pendingTicketIds = [];
      const ev = event(true, { kept: kept.length });
      endTurn(s, defs, rng);
      return ev;
    }

    default:
      return reject('INVALID_PAYLOAD');
  }
}

export function applyAction(
  state: AuthoritativeGameState,
  defs: GameDefinitions,
  playerId: string,
  actionType: ActionType,
  payload: unknown,
  rng: Rng
): EngineResult {
  const next = structuredClone(state);
  try {
    const event = dispatch(next, defs, playerId, actionType, payload, rng);
    next.version += 1;
    return { ok: true, state: next, event };
  } catch (err) {
    if (err instanceof EngineRejection) return { ok: false, error: err.code };
    throw err;
  }
}

export function lowestValueTickets(ids: readonly string[], count: number, defs: GameDefinitions): string[] {
  return [...ids]
    .sort((a, b) => defs.tickets.get(a)!.points - defs.tickets.get(b)!.points || a.localeCompare(b))
    .slice(0, Math.min(count, ids.length));
}

export function applyTimeout(
  state: AuthoritativeGameState,
  defs: GameDefinitions,
  rng: Rng
): { state: AuthoritativeGameState; events: PublicEvent[] } {
  let s = state;
  const events: PublicEvent[] = [];
  const step = (playerId: string, actionType: ActionType, payload: unknown) => {
    const r = applyAction(s, defs, playerId, actionType, payload, rng);
    if (!r.ok) throw new Error(`timeout default ${actionType} rejected: ${r.error}`);
    s = r.state;
    events.push(r.event);
  };

  if (s.status === 'SETUP_TICKETS') {
    for (const p of state.players) {
      if (!p.setupConfirmed) step(p.id, 'CHOOSE_INITIAL_TICKETS', { keptTicketIds: lowestValueTickets(p.pendingTicketIds, 2, defs) });
    }
    return { state: s, events };
  }
  if (s.status !== 'IN_PROGRESS') return { state: s, events };

  const actor = s.players[s.activeSeat];
  if (s.turnPhase === 'AWAITING_TUNNEL_PAYMENT') {
    step(actor.id, 'CANCEL_TUNNEL', {});
  } else if (s.turnPhase === 'SELECTING_TICKETS') {
    step(actor.id, 'CHOOSE_TICKETS', { keptTicketIds: lowestValueTickets(actor.pendingTicketIds, 1, defs) });
  } else {
    const turn = s.turnNumber;
    const sameTurn = () => s.status === 'IN_PROGRESS' && s.turnNumber === turn;
    while (sameTurn() && s.piles.deck.length + s.piles.discard.length > 0) step(actor.id, 'DRAW_TRAIN_CARD', { source: 'DECK' });
    if (sameTurn()) {
      const next = structuredClone(s);
      endTurn(next, defs, rng);
      next.version += 1;
      events.push({ actionType: 'TIMEOUT_PASS', playerId: actor.id, turnEnded: true, detail: {} });
      s = next;
    }
  }
  return { state: s, events };
}

export interface LobbySeat {
  playerId: string;
  userId: string | null;
  isBot: boolean;
  botLevel: BotLevel | null;
  seatIndex: number;
  color: PlayerColor;
  displayName: string;
}

export interface LobbyState {
  status: GameStatus;
  hostUserId: string;
  settings: GameSettings;
  seats: LobbySeat[]; // ordered by seatIndex
}

export type LobbyResult = { ok: true; lobby: LobbyState } | { ok: false; error: ApiErrorCode };

export const BOT_NAME_PREFIX = '电脑';

function hostOnlyInLobby(lobby: LobbyState, requesterUserId: string): ApiErrorCode | null {
  if (lobby.status !== 'LOBBY') return 'ILLEGAL_PHASE';
  if (requesterUserId !== lobby.hostUserId) return 'NOT_HOST';
  return null;
}

function seatNewPlayer(lobby: LobbyState, seat: Omit<LobbySeat, 'seatIndex' | 'color'>): LobbyResult {
  const capacity = Math.min(lobby.settings.maxPlayers, PLAYER_COLORS.length);
  if (lobby.seats.length >= capacity) return { ok: false, error: 'ROOM_FULL' };
  const usedSeats = new Set(lobby.seats.map(s => s.seatIndex));
  const usedColors = new Set(lobby.seats.map(s => s.color));
  let seatIndex = 0;
  while (usedSeats.has(seatIndex)) seatIndex++;
  const color = PLAYER_COLORS.find(c => !usedColors.has(c))!;
  const seats = [...lobby.seats, { ...seat, seatIndex, color }].sort((a, b) => a.seatIndex - b.seatIndex);
  return { ok: true, lobby: { ...lobby, seats } };
}

export function joinLobby(lobby: LobbyState, userId: string, displayName: string, newPlayerId: string): LobbyResult {
  if (lobby.seats.some(s => s.userId === userId)) return { ok: true, lobby };
  if (lobby.status !== 'LOBBY') return { ok: false, error: 'ILLEGAL_PHASE' };
  return seatNewPlayer(lobby, { playerId: newPlayerId, userId, isBot: false, botLevel: null, displayName });
}

export function addBot(lobby: LobbyState, requesterUserId: string, level: BotLevel, newPlayerId: string): LobbyResult {
  const denied = hostOnlyInLobby(lobby, requesterUserId);
  if (denied) return { ok: false, error: denied };
  const names = new Set(lobby.seats.filter(s => s.isBot).map(s => s.displayName));
  let n = 1;
  while (names.has(`${BOT_NAME_PREFIX} ${n}`)) n++;
  return seatNewPlayer(lobby, {
    playerId: newPlayerId,
    userId: null,
    isBot: true,
    botLevel: level,
    displayName: `${BOT_NAME_PREFIX} ${n}`,
  });
}

function findBot(lobby: LobbyState, playerId: string): LobbySeat | ApiErrorCode {
  const seat = lobby.seats.find(s => s.playerId === playerId);
  if (!seat) return 'PLAYER_NOT_FOUND';
  return seat.isBot ? seat : 'NOT_A_BOT';
}

export function removeBot(lobby: LobbyState, requesterUserId: string, playerId: string): LobbyResult {
  const denied = hostOnlyInLobby(lobby, requesterUserId);
  if (denied) return { ok: false, error: denied };
  const bot = findBot(lobby, playerId);
  if (typeof bot === 'string') return { ok: false, error: bot };
  return { ok: true, lobby: { ...lobby, seats: lobby.seats.filter(s => s.playerId !== playerId) } };
}

export function setBotLevel(lobby: LobbyState, requesterUserId: string, playerId: string, level: BotLevel): LobbyResult {
  const denied = hostOnlyInLobby(lobby, requesterUserId);
  if (denied) return { ok: false, error: denied };
  const bot = findBot(lobby, playerId);
  if (typeof bot === 'string') return { ok: false, error: bot };
  return { ok: true, lobby: { ...lobby, seats: lobby.seats.map(s => (s.playerId === playerId ? { ...s, botLevel: level } : s)) } };
}

export function leaveLobby(lobby: LobbyState, userId: string): LobbyResult {
  if (lobby.status !== 'LOBBY') return { ok: false, error: 'ILLEGAL_PHASE' };
  if (!lobby.seats.some(s => s.userId === userId)) return { ok: false, error: 'PLAYER_NOT_FOUND' };
  const seats = lobby.seats.filter(s => s.userId !== userId);
  const humans = seats.filter(s => !s.isBot);
  if (humans.length === 0) return { ok: true, lobby: { ...lobby, status: 'ABANDONED', seats } };
  const hostUserId = userId === lobby.hostUserId ? humans[0].userId! : lobby.hostUserId;
  return { ok: true, lobby: { ...lobby, hostUserId, seats } };
}

export function validateStart(lobby: LobbyState, requesterUserId: string): ApiErrorCode | null {
  const denied = hostOnlyInLobby(lobby, requesterUserId);
  if (denied) return denied;
  const n = lobby.seats.length;
  if (n < Math.max(2, lobby.settings.minPlayers) || n > lobby.settings.maxPlayers) return 'NOT_ENOUGH_PLAYERS';
  if (!lobby.seats.some(s => s.userId === lobby.hostUserId)) return 'NOT_ENOUGH_PLAYERS';
  return null;
}

export function seatedPlayers(lobby: LobbyState): SeatedPlayer[] {
  return lobby.seats.map(s => ({
    id: s.playerId,
    userId: s.userId,
    isBot: s.isBot,
    botLevel: s.botLevel,
    color: s.color,
    displayName: s.displayName,
  }));
}

export const MAX_AUTOMATIC_STEPS_PER_REQUEST = 32;

export interface AutomaticStep {
  actorKind: 'BOT' | 'SYSTEM';
  playerId: string | null; // null: setup timeout for several players
  events: PublicEvent[];
  privateNote: string; // game_action_logs.private_payload only
}

export function scheduleDeadline(prev: AuthoritativeGameState | null, next: AuthoritativeGameState, nowMs: number): void {
  const at = (ms: number) => new Date(nowMs + ms).toISOString();
  if (next.status === 'SETUP_TICKETS') {
    if (prev === null || prev.status !== 'SETUP_TICKETS') next.turnDeadlineAt = at(next.settings.setupTimeLimitSeconds * 1000);
    return;
  }
  if (next.status !== 'IN_PROGRESS') {
    next.turnDeadlineAt = null;
    return;
  }
  const actor = next.players[next.activeSeat];
  if (actor.isBot) {
    next.turnDeadlineAt = at(next.settings.botStepDelayMs);
  } else if (prev === null || prev.status !== 'IN_PROGRESS' || prev.turnNumber !== next.turnNumber) {
    next.turnDeadlineAt = at(next.settings.turnTimeLimitSeconds * 1000);
  }
}

export function advanceAutomaticActors(
  state: AuthoritativeGameState,
  defs: GameDefinitions,
  nowMs: number,
  rng: Rng,
  maxSteps = MAX_AUTOMATIC_STEPS_PER_REQUEST
): { state: AuthoritativeGameState; steps: AutomaticStep[] } {
  let s = state;
  const steps: AutomaticStep[] = [];
  const due = () => s.turnDeadlineAt !== null && Date.parse(s.turnDeadlineAt) <= nowMs;
  const record = (next: AuthoritativeGameState, step: AutomaticStep) => {
    scheduleDeadline(s, next, nowMs);
    s = next;
    steps.push(step);
  };
  const timeout = (playerId: string | null, note: string) => {
    const r = applyTimeout(s, defs, rng);
    record(r.state, { actorKind: 'SYSTEM', playerId, events: r.events, privateNote: note });
  };

  const playBot = (bot: AuthoritativePlayer) => {
    const view = projectState(s, bot.id, defs.tickets, (st, pid) => computeValidActions(st, defs, pid));
    const decision = decideBotAction(view, bot.botLevel ?? 'EASY', { defs, rng });
    let failure = 'bot fallback: no decision';
    if (decision) {
      const r = applyAction(s, defs, bot.id, decision.actionType, decision.payload, rng);
      if (r.ok) {
        record(r.state, { actorKind: 'BOT', playerId: bot.id, events: [r.event], privateNote: decision.reason });
        return;
      }
      failure = `bot fallback: ${decision.actionType} rejected with ${r.error}`;
    }
    if (s.status === 'SETUP_TICKETS') {
      const keep = lowestValueTickets(bot.pendingTicketIds, 2, defs);
      const r = applyAction(s, defs, bot.id, 'CHOOSE_INITIAL_TICKETS', { keptTicketIds: keep }, rng);
      if (!r.ok) throw new Error(`setup fallback rejected: ${r.error}`);
      record(r.state, { actorKind: 'SYSTEM', playerId: bot.id, events: [r.event], privateNote: failure });
    } else {
      timeout(bot.id, failure);
    }
  };

  while (steps.length < maxSteps) {
    if (s.status === 'SETUP_TICKETS') {
      const bot = s.players.find(p => p.isBot && !p.setupConfirmed);
      if (bot) playBot(bot);
      else if (due()) timeout(null, 'setup deadline');
      else break;
      continue;
    }
    if (s.status !== 'IN_PROGRESS') break;
    const actor = s.players[s.activeSeat];
    if (computeValidActions(s, defs, actor.id).length === 0) timeout(actor.id, 'no legal action');
    else if (!due()) break;
    else if (actor.isBot) playBot(actor);
    else timeout(actor.id, 'turn deadline');
  }
  return { state: s, steps };
}

export interface BotContext {
  defs: GameDefinitions;
  rng: Rng;
}

export interface BotDecision {
  actionType: ActionType;
  payload: unknown;
  reason: string; // private, logged only
}

export type BotState =
  | 'IDLE'
  | 'CHOOSING_INITIAL_TICKETS'
  | 'PLANNING_TURN'
  | 'DRAWING_SECOND_CARD'
  | 'RESOLVING_TUNNEL'
  | 'CHOOSING_TICKETS';

export function botStateOf(view: ProjectedGameState): BotState {
  const self = view.self;
  if (!self || self.validActions.length === 0) return 'IDLE';
  if (view.public.status === 'SETUP_TICKETS') return 'CHOOSING_INITIAL_TICKETS';
  if (view.public.status !== 'IN_PROGRESS') return 'IDLE';
  switch (view.public.turnPhase) {
    case 'STANDBY':
      return 'PLANNING_TURN';
    case 'DRAWING_SECOND_CARD':
      return 'DRAWING_SECOND_CARD';
    case 'AWAITING_TUNNEL_PAYMENT':
      return 'RESOLVING_TUNNEL';
    case 'SELECTING_TICKETS':
      return 'CHOOSING_TICKETS';
  }
}

export function decideBotAction(view: ProjectedGameState, level: BotLevel, ctx: BotContext): BotDecision | null {
  const state = botStateOf(view);
  if (state === 'IDLE') return null;
  const a = analyseView(view, BOT_PROFILES[level], ctx);
  switch (state) {
    case 'CHOOSING_INITIAL_TICKETS':
      return {
        actionType: 'CHOOSE_INITIAL_TICKETS',
        payload: { keptTicketIds: chooseTickets(a, a.self.pendingTicketOffer, 2) },
        reason: 'initial tickets',
      };
    case 'CHOOSING_TICKETS':
      return {
        actionType: 'CHOOSE_TICKETS',
        payload: { keptTicketIds: chooseTickets(a, a.self.pendingTicketOffer, 1) },
        reason: 'mid-game tickets',
      };
    case 'RESOLVING_TUNNEL':
      return resolveTunnel(a);
    case 'DRAWING_SECOND_CARD': {
      const draw = chooseCardDraw(a, buildPlan(a, a.self.tickets), 'DRAWING_SECOND_CARD');
      return draw && { actionType: 'DRAW_TRAIN_CARD', payload: draw, reason: 'second card' };
    }
    case 'PLANNING_TURN':
      return planTurn(a);
  }
}

export interface StrategyProfile {
  level: BotLevel;
  jointPlanning: boolean; // plan all tickets together instead of one at a time
  ticketSubsetSearch: boolean; // evaluate every kept-ticket combination
  trainCostWeight: number; // ticket points traded per extra train space
  claimTurnCost: number; // path cost added per route (each claim is a turn)
  ferryLocoCost: number; // extra path cost per required Locomotive
  tunnelCost: number; // extra path cost for a tunnel
  criticalFirst: boolean; // claim the route whose loss would hurt most
  protectPlanCards: boolean; // payments avoid cards other plan routes need
  tunnelBuffer: number; // spare matching cards wanted before trying a tunnel
  useStations: boolean;
  finalTurnSearch: boolean;
  faceUpLocomotives: boolean;
  midgameTicketMinTrains: number;
  locoPaymentWeight: number;
  mistakeRate: number; // chance a planned turn becomes a blind draw
}

export const BOT_PROFILES: Readonly<Record<BotLevel, StrategyProfile>> = {
  EASY: {
    level: 'EASY',
    jointPlanning: false,
    ticketSubsetSearch: false,
    trainCostWeight: 0,
    claimTurnCost: 0,
    ferryLocoCost: 0,
    tunnelCost: 0,
    criticalFirst: false,
    protectPlanCards: false,
    tunnelBuffer: 0,
    useStations: false,
    finalTurnSearch: false,
    faceUpLocomotives: false,
    midgameTicketMinTrains: 30,
    locoPaymentWeight: 1,
    mistakeRate: 0.15,
  },
  MEDIUM: {
    level: 'MEDIUM',
    jointPlanning: true,
    ticketSubsetSearch: false,
    trainCostWeight: 0.25,
    claimTurnCost: 0.3,
    ferryLocoCost: 0.6,
    tunnelCost: 0.5,
    criticalFirst: false,
    protectPlanCards: true,
    tunnelBuffer: 0,
    useStations: true,
    finalTurnSearch: false,
    faceUpLocomotives: true,
    midgameTicketMinTrains: 20,
    locoPaymentWeight: 2,
    mistakeRate: 0.04,
  },
  ADVANCED: {
    level: 'ADVANCED',
    jointPlanning: true,
    ticketSubsetSearch: true,
    trainCostWeight: 0.45,
    claimTurnCost: 0.5,
    ferryLocoCost: 1,
    tunnelCost: 1,
    criticalFirst: true,
    protectPlanCards: true,
    tunnelBuffer: 1,
    useStations: true,
    finalTurnSearch: true,
    faceUpLocomotives: true,
    midgameTicketMinTrains: 14,
    locoPaymentWeight: 3,
    mistakeRate: 0,
  },
};

export const TRAINS_SPENT_PER_TURN = 1.7;
export const MIN_TURNS_FOR_NEW_TICKETS = 5;
export const BRIDGE_COST = 6; // path cost of borrowing an opponent route through a station

interface BoardEdge {
  route: RouteDefinition;
  to: string;
}

const ADJACENCY_CACHE = new WeakMap<GameDefinitions, Map<string, BoardEdge[]>>();
const NO_ROUTES: ReadonlySet<string> = new Set();

function boardAdjacency(defs: GameDefinitions): Map<string, BoardEdge[]> {
  let adj = ADJACENCY_CACHE.get(defs);
  if (!adj) {
    adj = new Map([...defs.cityIds].map(c => [c, [] as BoardEdge[]]));
    for (const r of defs.routes.values()) {
      adj.get(r.city1)!.push({ route: r, to: r.city2 });
      adj.get(r.city2)!.push({ route: r, to: r.city1 });
    }
    ADJACENCY_CACHE.set(defs, adj);
  }
  return adj;
}

export interface BotAnalysis {
  profile: StrategyProfile;
  ctx: BotContext;
  pub: PublicGameState;
  self: PrivatePlayerState;
  me: PublicPlayerState;
  hand: CardCounts;
  trains: number;
  owners: Map<string, string>;
  stationOwnerByCity: Map<string, string>;
  network: DisjointSet; // own routes only
  completedTicketIds: Set<string>; // own tickets complete now, stations included
  ticketNet: number; // current net ticket points with the best station use
  turnsLeft: number;
}

export function analyseView(view: ProjectedGameState, profile: StrategyProfile, ctx: BotContext): BotAnalysis {
  const pub = view.public;
  const self = view.self!;
  const me = pub.players.find(p => p.id === self.playerId)!;
  const network = new DisjointSet();
  for (const c of pub.claims) {
    if (c.ownerPlayerId !== me.id) continue;
    const r = ctx.defs.routes.get(c.routeId)!;
    network.union(r.city1, r.city2);
  }
  const evaluation = evaluateTicketsWithStations(me.id, self.tickets, pub.claims, pub.stations, ctx.defs.routes);
  const minTrains = Math.min(...pub.players.map(p => p.trainCarsRemaining));
  const turnsLeft =
    pub.lastRoundTurnsRemaining !== null
      ? 1
      : 1 + Math.max(0, Math.floor((minTrains - LAST_ROUND_TRAIN_THRESHOLD) / TRAINS_SPENT_PER_TURN));
  return {
    profile,
    ctx,
    pub,
    self,
    me,
    hand: self.trainCards,
    trains: me.trainCarsRemaining,
    owners: ownerByRoute(pub.claims),
    stationOwnerByCity: new Map(pub.stations.map(s => [s.cityId, s.ownerPlayerId])),
    network,
    completedTicketIds: new Set(evaluation.outcomes.filter(o => o.completed).map(o => o.ticketId)),
    ticketNet: evaluation.netPoints,
    turnsLeft,
  };
}

function isOpenFor(a: BotAnalysis, r: RouteDefinition): boolean {
  return validateRouteAvailability(r, a.me.id, a.pub.players.length, a.owners) === null;
}

function isTicketDone(a: BotAnalysis, t: DestinationTicket): boolean {
  return a.completedTicketIds.has(t.id) || a.network.connected(t.from, t.to);
}

function pathEdgeCost(profile: StrategyProfile, r: RouteDefinition): number {
  return (
    r.length +
    profile.claimTurnCost +
    (r.type === 'FERRY' ? profile.ferryLocoCost * r.requiredLocomotives : 0) +
    (r.type === 'TUNNEL' ? profile.tunnelCost : 0)
  );
}

function canBridge(a: BotAnalysis, r: RouteDefinition): boolean {
  return [r.city1, r.city2].some(city => {
    const owner = a.stationOwnerByCity.get(city);
    return owner === a.me.id || (owner === undefined && a.me.stationsRemaining > 0);
  });
}

interface Connection {
  cost: number;
  routeIds: string[]; // unclaimed routes on the path
  bridgeRouteId: string | null;
}

function connectCities(
  a: BotAnalysis,
  from: string,
  to: string,
  free: ReadonlySet<string>,
  allowBridge: boolean,
  excludedRouteId: string | null = null
): Connection | null {
  if (from === to) return { cost: 0, routeIds: [], bridgeRouteId: null };
  const adj = boardAdjacency(a.ctx.defs);
  const dist = new Map<string, number>([[`${from}|0`, 0]]);
  const prev = new Map<string, { node: string; route: RouteDefinition }>();
  const done = new Set<string>();
  for (;;) {
    let node: string | null = null;
    let d = Infinity;
    for (const [k, v] of dist) {
      if (v < d && !done.has(k)) {
        node = k;
        d = v;
      }
    }
    if (node === null) return null;
    done.add(node);
    const [city, layer] = node.split('|');
    if (city === to) {
      const routeIds: string[] = [];
      let bridgeRouteId: string | null = null;
      for (let k = node; prev.has(k); k = prev.get(k)!.node) {
        const r = prev.get(k)!.route;
        const owner = a.owners.get(r.id);
        if (owner === undefined) routeIds.push(r.id);
        else if (owner !== a.me.id) bridgeRouteId = r.id;
      }
      return { cost: d, routeIds, bridgeRouteId };
    }
    for (const { route: r, to: next } of adj.get(city)!) {
      if (r.id === excludedRouteId) continue;
      const owner = a.owners.get(r.id);
      let cost: number;
      let nextLayer = layer;
      if (owner === a.me.id || free.has(r.id)) {
        cost = 0;
      } else if (owner === undefined) {
        if (r.length > a.trains || !isOpenFor(a, r)) continue;
        cost = pathEdgeCost(a.profile, r);
      } else if (allowBridge && layer === '0' && canBridge(a, r)) {
        cost = BRIDGE_COST;
        nextLayer = '1';
      } else {
        continue;
      }
      const key = `${next}|${nextLayer}`;
      if (d + cost < (dist.get(key) ?? Infinity)) {
        dist.set(key, d + cost);
        prev.set(key, { node, route: r });
      }
    }
  }
}

export interface BotPlan {
  routes: RouteDefinition[]; // still to claim
  bridgeRouteIds: string[]; // opponent routes to borrow with a station
  ticketsByRoute: Map<string, DestinationTicket[]>;
  reachable: DestinationTicket[];
  unreachable: DestinationTicket[];
  trains: number;
}

export function buildPlan(a: BotAnalysis, tickets: readonly DestinationTicket[], excludedRouteId: string | null = null): BotPlan {
  const free = new Set<string>();
  const bridges = new Set<string>();
  const ticketsByRoute = new Map<string, DestinationTicket[]>();
  const reachable: DestinationTicket[] = [];
  const unreachable: DestinationTicket[] = [];
  const open = tickets.filter(t => !isTicketDone(a, t));
  const ordered = a.profile.jointPlanning ? [...open].sort((x, y) => y.points - x.points || x.id.localeCompare(y.id)) : open;
  for (const t of ordered) {
    if (!a.profile.jointPlanning && reachable.length > 0) break; // Easy: one ticket at a time
    const c = connectCities(a, t.from, t.to, a.profile.jointPlanning ? free : NO_ROUTES, a.profile.useStations, excludedRouteId);
    if (!c) {
      unreachable.push(t);
      continue;
    }
    reachable.push(t);
    for (const id of c.routeIds) {
      free.add(id);
      ticketsByRoute.set(id, [...(ticketsByRoute.get(id) ?? []), t]);
    }
    if (c.bridgeRouteId) bridges.add(c.bridgeRouteId);
  }
  const routes = [...free].map(id => a.ctx.defs.routes.get(id)!);
  return {
    routes,
    bridgeRouteIds: [...bridges],
    ticketsByRoute,
    reachable,
    unreachable,
    trains: routes.reduce((sum, r) => sum + r.length, 0),
  };
}

export interface CardDemand {
  need: CardCounts;
  deficit: CardCounts;
  missing: number; // cards still to collect, after spare Locomotives
}

export function cardDemand(routes: readonly RouteDefinition[], hand: CardCounts): CardDemand {
  const need = Object.fromEntries(TRAIN_CARD_COLORS.map(c => [c, 0])) as Record<TrainCardColor, number>;
  for (const r of routes) {
    need.LOCOMOTIVE += r.requiredLocomotives;
    if (r.color !== 'GRAY') need[r.color] += r.length - r.requiredLocomotives;
  }
  const grays = routes.filter(r => r.color === 'GRAY').sort((x, y) => y.length - x.length);
  for (const r of grays) {
    const spare = (c: CardColor) => (hand[c] ?? 0) - need[c];
    const color = CARD_COLORS.reduce((best, c) => (spare(c) > spare(best) ? c : best));
    need[color] += r.length - r.requiredLocomotives;
  }
  const deficit: CardCounts = {};
  let colourShort = 0;
  for (const c of CARD_COLORS) {
    const d = Math.max(0, need[c] - (hand[c] ?? 0));
    if (d > 0) deficit[c] = d;
    colourShort += d;
  }
  const locoShort = Math.max(0, need.LOCOMOTIVE - (hand.LOCOMOTIVE ?? 0));
  if (locoShort > 0) deficit.LOCOMOTIVE = locoShort;
  const spareLocos = Math.max(0, (hand.LOCOMOTIVE ?? 0) - need.LOCOMOTIVE);
  return { need, deficit, missing: locoShort + Math.max(0, colourShort - spareLocos) };
}

function turnsNeeded(plan: BotPlan, hand: CardCounts): number {
  return Math.ceil(cardDemand(plan.routes, hand).missing / 2) + plan.routes.length + plan.bridgeRouteIds.length;
}

const FACE_UP_LOCOMOTIVE_FOR_FERRY = 3; // a ferry shortfall makes a face-up Locomotive worth a whole turn
const BLIND_PAIR_THRESHOLD = 0.9;

export function chooseTickets(a: BotAnalysis, offer: readonly DestinationTicket[], minKeep: number): string[] {
  const keep = Math.min(minKeep, offer.length);
  if (!a.profile.ticketSubsetSearch) {
    const cost = (t: DestinationTicket) =>
      isTicketDone(a, t) ? 0 : (connectCities(a, t.from, t.to, NO_ROUTES, false)?.cost ?? Infinity);
    return offer
      .map(t => ({ t, c: cost(t) }))
      .sort((x, y) => x.c - y.c || y.t.points - x.t.points)
      .slice(0, keep)
      .map(x => x.t.id);
  }
  const held = a.self.tickets;
  const base = buildPlan(a, held);
  let best = { value: -Infinity, ids: [] as string[] };
  for (let mask = 1; mask < 1 << offer.length; mask++) {
    const subset = offer.filter((_, i) => (mask & (1 << i)) !== 0);
    if (subset.length < keep) continue;
    const plan = buildPlan(a, [...held, ...subset]);
    const points = subset.reduce((s, t) => s + t.points, 0);
    const signed = subset.reduce((s, t) => s + (plan.unreachable.includes(t) ? -t.points : t.points), 0);
    let value = signed - a.profile.trainCostWeight * (plan.trains - base.trains);
    const feasible = plan.trains <= a.trains && turnsNeeded(plan, a.hand) <= a.turnsLeft;
    if (!feasible) value -= 2 * points;
    if (value > best.value || (value === best.value && subset.length < best.ids.length)) {
      best = { value, ids: subset.map(t => t.id) };
    }
  }
  return best.ids;
}

function choosePayment(a: BotAnalysis, options: readonly CardCounts[], otherPlanRoutes: readonly RouteDefinition[]): CardCounts {
  const reserved = a.profile.protectPlanCards ? cardDemand(otherPlanRoutes, a.hand).need : {};
  let best = options[0];
  let bestCost = Infinity;
  for (const option of options) {
    let cost = (option.LOCOMOTIVE ?? 0) * a.profile.locoPaymentWeight;
    for (const c of CARD_COLORS) {
      const used = option[c] ?? 0;
      if (used === 0) continue;
      const have = a.hand[c] ?? 0;
      const want = reserved[c] ?? 0;
      cost += 2 * (Math.max(0, want - (have - used)) - Math.max(0, want - have));
      cost += 0.01 * (have - used); // prefer emptying a colour over splitting a large one
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = option;
    }
  }
  return best;
}

function detourCost(a: BotAnalysis, plan: BotPlan, r: RouteDefinition): number {
  let total = 0;
  for (const t of plan.ticketsByRoute.get(r.id) ?? []) {
    const withRoute = connectCities(a, t.from, t.to, NO_ROUTES, a.profile.useStations);
    const without = connectCities(a, t.from, t.to, NO_ROUTES, a.profile.useStations, r.id);
    total += withRoute && without ? without.cost - withRoute.cost : 2 * t.points;
  }
  return total;
}

function tunnelReady(a: BotAnalysis, payment: CardCounts): boolean {
  if (a.profile.tunnelBuffer === 0 || a.turnsLeft <= 1) return true;
  const after = subtractCards(a.hand, payment);
  const color = nonLocomotiveColors(payment)[0];
  const spare = (after.LOCOMOTIVE ?? 0) + (color ? (after[color] ?? 0) : 0);
  return spare >= a.profile.tunnelBuffer;
}

function chooseClaim(a: BotAnalysis, plan: BotPlan): BotDecision | null {
  const candidates = plan.routes
    .map(r => ({ r, options: routePaymentOptions(r, a.hand, a.trains) }))
    .filter(x => x.options.length > 0);
  if (candidates.length === 0) return null;
  const ranked = candidates
    .map(x => ({ ...x, priority: a.profile.criticalFirst ? 2 * detourCost(a, plan, x.r) + x.r.length : x.r.length + a.ctx.rng() * 0.5 }))
    .sort((x, y) => y.priority - x.priority);
  for (const { r, options } of ranked) {
    const payment = choosePayment(a, options, plan.routes.filter(o => o.id !== r.id));
    if (r.type === 'TUNNEL' && !tunnelReady(a, payment)) continue;
    return { actionType: 'CLAIM_ROUTE', payload: { routeId: r.id, payment }, reason: `plan route ${r.id}` };
  }
  return null;
}

/** Best off-plan route: most points, a bonus for extending the own network (longest path), no unready tunnels. */
function chooseFreeClaim(a: BotAnalysis, minLength: number): BotDecision | null {
  const touches = (r: RouteDefinition) =>
    a.pub.claims.some(c => {
      if (c.ownerPlayerId !== a.me.id) return false;
      const own = a.ctx.defs.routes.get(c.routeId)!;
      return [own.city1, own.city2].some(x => x === r.city1 || x === r.city2);
    });
  let best: { decision: BotDecision; value: number } | null = null;
  for (const r of claimableRoutes(a.ctx.defs.routes.values(), a.me.id, a.pub.players.length, a.pub.claims, a.hand, a.trains)) {
    if (r.length < minLength) continue;
    const payment = choosePayment(a, routePaymentOptions(r, a.hand, a.trains), []);
    if (r.type === 'TUNNEL' && !tunnelReady(a, payment)) continue;
    const value = ROUTE_POINTS[r.length] + (a.profile.jointPlanning && touches(r) ? 2 : 0);
    if (best === null || value > best.value) {
      best = { decision: { actionType: 'CLAIM_ROUTE', payload: { routeId: r.id, payment }, reason: `points ${r.id}` }, value };
    }
  }
  return best?.decision ?? null;
}

function fallbackTargets(a: BotAnalysis): RouteDefinition[] {
  return [...a.ctx.defs.routes.values()]
    .filter(r => !a.owners.has(r.id) && r.length <= a.trains && isOpenFor(a, r))
    .sort((x, y) => y.length - x.length || x.id.localeCompare(y.id))
    .slice(0, 3);
}

export function chooseCardDraw(a: BotAnalysis, plan: BotPlan, phase: TurnPhase): DrawTrainCardPayload | null {
  const targets = plan.routes.length > 0 ? plan.routes : fallbackTargets(a);
  const demand = cardDemand(targets, a.hand);
  const faceUp = a.pub.faceUpTrainCards;
  let bestSlot = -1;
  let bestValue = 0;
  faceUp.forEach((card, slot) => {
    if (card === null || !canTakeFaceUp(phase, card)) return;
    const value =
      card === 'LOCOMOTIVE'
        ? a.profile.faceUpLocomotives && (demand.deficit.LOCOMOTIVE ?? 0) > 0 ? FACE_UP_LOCOMOTIVE_FOR_FERRY : 0
        : (demand.deficit[card] ?? 0);
    if (value > bestValue) {
      bestValue = value;
      bestSlot = slot;
    }
  });
  if (bestSlot >= 0) return { source: 'FACE_UP', slotIndex: bestSlot };

  const deckHasCards = a.pub.trainDeckCount + a.pub.trainDiscardCount > 0;
  const locoSlot = faceUp.findIndex(c => c === 'LOCOMOTIVE');
  if (a.profile.faceUpLocomotives && phase === 'STANDBY' && locoSlot >= 0 && demand.missing > 0) {
    // Expected useful cards from two blind draws, from the deck composition (12 per colour, 14 Locomotives).
    const usefulColours = CARD_COLORS.filter(c => (demand.deficit[c] ?? 0) > 0).length;
    const blindValue = (2 * (usefulColours * 12 + 14)) / 110;
    if (!deckHasCards || blindValue < BLIND_PAIR_THRESHOLD) return { source: 'FACE_UP', slotIndex: locoSlot };
  }
  if (deckHasCards) return { source: 'DECK' };
  const legal = faceUp
    .map((card, slot) => ({ card, slot }))
    .filter(x => x.card !== null && canTakeFaceUp(phase, x.card))
    .sort((x, y) => Number(x.card === 'LOCOMOTIVE') - Number(y.card === 'LOCOMOTIVE'));
  return legal.length > 0 ? { source: 'FACE_UP', slotIndex: legal[0].slot } : null;
}

function chooseStation(a: BotAnalysis, plan: BotPlan, everyOpponentRoute: boolean): { decision: BotDecision; gain: number } | null {
  if (!a.profile.useStations || a.me.stationsRemaining === 0) return null;
  const options = stationPaymentOptions(a.me.stationsRemaining, a.hand);
  if (options.length === 0 || a.self.tickets.every(t => a.completedTicketIds.has(t.id))) return null;
  const routeIds = everyOpponentRoute
    ? a.pub.claims.filter(c => c.ownerPlayerId !== a.me.id).map(c => c.routeId)
    : plan.bridgeRouteIds;
  const cities = new Set<string>();
  for (const id of routeIds) {
    const r = a.ctx.defs.routes.get(id)!;
    for (const city of [r.city1, r.city2]) if (!a.stationOwnerByCity.has(city)) cities.add(city);
  }
  let best: { city: string; gain: number } | null = null;
  for (const city of cities) {
    const stations = [...a.pub.stations, { cityId: city, ownerPlayerId: a.me.id }];
    const ev = evaluateTicketsWithStations(a.me.id, a.self.tickets, a.pub.claims, stations, a.ctx.defs.routes);
    const gain = ev.netPoints - a.ticketNet - UNUSED_STATION_POINTS;
    if (gain > 0 && (best === null || gain > best.gain)) best = { city, gain };
  }
  if (!best) return null;
  const payment = choosePayment(a, options, plan.routes);
  return {
    decision: { actionType: 'BUILD_STATION', payload: { cityId: best.city, payment }, reason: `station ${best.city} +${best.gain}` },
    gain: best.gain,
  };
}

function chooseFinalTurn(a: BotAnalysis, plan: BotPlan): BotDecision | null {
  let best: { decision: BotDecision; value: number } | null = null;
  const open = a.self.tickets.filter(t => !isTicketDone(a, t));
  for (const r of claimableRoutes(a.ctx.defs.routes.values(), a.me.id, a.pub.players.length, a.pub.claims, a.hand, a.trains)) {
    const dsu = a.network.clone();
    dsu.union(r.city1, r.city2);
    const swing = open.filter(t => dsu.connected(t.from, t.to)).reduce((s, t) => s + 2 * t.points, 0);
    const value = ROUTE_POINTS[r.length] + swing;
    if (best === null || value > best.value) {
      const payment = choosePayment(a, routePaymentOptions(r, a.hand, a.trains), []);
      best = { decision: { actionType: 'CLAIM_ROUTE', payload: { routeId: r.id, payment }, reason: `final turn ${r.id} +${value}` }, value };
    }
  }
  const station = chooseStation(a, plan, true);
  if (station && (best === null || station.gain > best.value)) return station.decision;
  return best?.decision ?? null;
}

function resolveTunnel(a: BotAnalysis): BotDecision {
  const ch = a.pub.tunnelChallenge!;
  const cancel: BotDecision = { actionType: 'CANCEL_TUNNEL', payload: {}, reason: `cancel tunnel ${ch.routeId}` };
  const options = tunnelExtraOptions(ch.setColor, ch.surcharge, a.hand);
  if (options.length === 0) return cancel;
  const plan = buildPlan(a, a.self.tickets);
  const worth = !a.profile.criticalFirst || ch.surcharge <= 1 || a.turnsLeft <= 2 || plan.routes.some(r => r.id === ch.routeId);
  if (!worth) return cancel;
  const extraPayment = choosePayment(a, options, plan.routes.filter(r => r.id !== ch.routeId));
  return { actionType: 'CONFIRM_TUNNEL', payload: { extraPayment }, reason: `pay tunnel ${ch.routeId} +${ch.surcharge}` };
}

function planTurn(a: BotAnalysis): BotDecision | null {
  const valid = new Set(a.self.validActions);
  const plan = buildPlan(a, a.self.tickets);
  const draw = (reason: string): BotDecision | null => {
    const d = chooseCardDraw(a, plan, 'STANDBY');
    return d && { actionType: 'DRAW_TRAIN_CARD', payload: d, reason };
  };
  const deckHasCards = a.pub.trainDeckCount + a.pub.trainDiscardCount > 0;

  if (a.profile.mistakeRate > 0 && valid.has('DRAW_TRAIN_CARD') && deckHasCards && a.ctx.rng() < a.profile.mistakeRate) {
    return { actionType: 'DRAW_TRAIN_CARD', payload: { source: 'DECK' }, reason: 'hesitation' };
  }
  if (a.profile.finalTurnSearch && a.turnsLeft <= 1) {
    const final = chooseFinalTurn(a, plan);
    if (final) return final;
  }
  if (valid.has('BUILD_STATION') && plan.bridgeRouteIds.length > 0) {
    const station = chooseStation(a, plan, false);
    if (station) return station.decision;
  }
  if (valid.has('CLAIM_ROUTE')) {
    const claim = chooseClaim(a, plan);
    if (claim) return claim;
  }
  if (plan.routes.length === 0 && plan.bridgeRouteIds.length === 0) {
    const wantsTickets =
      valid.has('DRAW_TICKETS') &&
      a.trains >= a.profile.midgameTicketMinTrains &&
      a.turnsLeft >= MIN_TURNS_FOR_NEW_TICKETS;
    if (wantsTickets) return { actionType: 'DRAW_TICKETS', payload: {}, reason: 'all tickets done' };
    if (valid.has('CLAIM_ROUTE')) {
      const minLength = a.profile.jointPlanning && a.trains > 8 && deckHasCards ? 3 : 1;
      const claim = chooseFreeClaim(a, minLength);
      if (claim) return claim;
    }
  }
  if (valid.has('DRAW_TRAIN_CARD')) {
    const d = draw('collect cards');
    if (d) return d;
  }
  if (valid.has('CLAIM_ROUTE')) return chooseFreeClaim(a, 1);
  if (valid.has('DRAW_TICKETS') && a.turnsLeft >= MIN_TURNS_FOR_NEW_TICKETS) {
    return { actionType: 'DRAW_TICKETS', payload: {}, reason: 'nothing else to do' };
  }
  return null; // pass: the runtime applies the timeout default
}
