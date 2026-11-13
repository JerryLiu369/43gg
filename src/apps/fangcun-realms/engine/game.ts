import {
  type Direction,
  type Rotation,
  ROTATIONS,
  compass8Offset,
  coordKey,
  edgeAt,
  neighbourCoord,
  opposite,
  parseKey,
  ring8,
  rotateCompass8,
  rotateSlot,
  slotDir,
} from './geometry.ts';
import {
  ALL_EXPANSIONS,
  type CropCircle,
  type ExpansionId,
  type FeatureKind,
  type TileCatalog,
  type TileDef,
} from './tiles.ts';
import {
  type Analysis,
  type Component,
  type FeatureRef,
  analyzeBoard,
  componentOf,
  featureAtSlot,
  featureDirections,
  fitsEdges,
  frontier,
  nodeKey,
  placedDef,
  surroundingCount,
} from './board.ts';
import {
  type MagicPresence,
  featureValue,
  fieldPoints,
  goldPoints,
  goodsPoints,
  majorityOwners,
  robberShare,
} from './scoring.ts';
import { randomInt, seedFromString, shuffle } from './rng.ts';
import type {
  Action,
  AwardSource,
  FigureKind,
  Figure,
  FinalBreakdown,
  GameOptions,
  GameState,
  MagicFigure,
  PartKind,
  PartState,
  Pending,
  RobberRound,
  Step,
  TrackFigure,
} from './types.ts';

export const FLIGHT_DIE: readonly number[] = [1, 1, 2, 2, 3, 3];
export const SCOREBOARD_SPACES = 50;
export const MESSAGE_IDS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8];
export const INITIAL_SUPPLY = { gold: 16, ferries: 8, goods: { WINE: 9, WHEAT: 6, CLOTH: 5 } } as const;

const FOLLOWERS: readonly FigureKind[] = ['MEEPLE', 'LARGE', 'ABBOT'];
const MAGIC_FIGURES: readonly MagicFigure[] = ['MAGE', 'WITCH'];
const CROP_FEATURE: Record<CropCircle, FeatureKind> = { RAKE: 'FIELD', CLUB: 'ROAD', SHIELD: 'CITY' };
const MESSAGE_FEATURE: Record<number, FeatureKind> = { 1: 'ROAD', 2: 'CITY', 3: 'MONASTERY' };
const SCORED_KINDS: readonly FeatureKind[] = ['CITY', 'ROAD', 'MONASTERY', 'GARDEN'];

interface Ctx {
  cat: TileCatalog;
  s: GameState;
  an: Analysis | null;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function analysis(c: Ctx): Analysis {
  c.an ??= analyzeBoard(c.cat, c.s.board);
  return c.an;
}

function boardChanged(c: Ctx): void {
  c.an = null;
}

function on(c: Ctx, e: ExpansionId): boolean {
  return c.s.config.expansions.includes(e);
}

function log(c: Ctx, type: string, data: Record<string, unknown> = {}): void {
  c.s.log.push({ type, turn: c.s.turn.number, ...data });
}

function activePlayer(c: Ctx): number {
  return c.s.turn.player;
}

function currentPart(c: Ctx): PartState {
  return c.s.turn.part;
}

function partDef(c: Ctx): TileDef {
  const id = c.s.turn.part.tileId;
  if (!id) throw new Error('No tile in the current turn part');
  return c.cat.tiles[id];
}

function playersFrom(c: Ctx, start: number): number[] {
  const n = c.s.players.length;
  return Array.from({ length: n }, (_, i) => (((start + i) % n) + n) % n);
}

function compId(c: Ctx, ref: FeatureRef): number {
  const id = analysis(c).byNode.get(nodeKey(ref.x, ref.y, ref.feature));
  if (id === undefined) throw new Error(`No feature at ${nodeKey(ref.x, ref.y, ref.feature)}`);
  return id;
}

function figureComp(c: Ctx, f: FeatureRef): Component {
  return componentOf(analysis(c), f);
}

function isFollower(kind: FigureKind): boolean {
  return FOLLOWERS.includes(kind);
}

function isMeeple(kind: FigureKind): boolean {
  return kind === 'MEEPLE' || kind === 'LARGE';
}

function followersIn(c: Ctx, id: number): Figure[] {
  return c.s.figures.filter((f) => isFollower(f.kind) && compId(c, f) === id);
}

function magicIn(c: Ctx, comp: Component): MagicPresence {
  const at = (m: MagicFigure) => {
    const ref = c.s.magic[m];
    return ref !== null && compId(c, ref) === comp.id;
  };
  return { mage: at('MAGE'), witch: at('WITCH') };
}

export function trackPosition(score: number): number {
  return score % SCOREBOARD_SPACES;
}

function trackPos(c: Ctx, player: number, fig: TrackFigure): number {
  const p = c.s.players[player];
  return trackPosition(fig === 'SCORE' ? p.score : p.messengerScore);
}

function riverDirs(def: TileDef, rotation: Rotation): Direction[] {
  return def.features
    .filter((f) => f.kind === 'RIVER')
    .flatMap((f) => f.slots.map((s) => slotDir(rotateSlot(s, rotation))));
}

function pierPairs(def: TileDef): [number, number][] {
  const piers = def.features.filter((f) => f.lakePier).map((f) => f.index);
  const out: [number, number][] = [];
  for (let i = 0; i < piers.length; i++) for (let j = i + 1; j < piers.length; j++) out.push([piers[i], piers[j]]);
  return out;
}

function newPart(kind: PartKind): PartState {
  return {
    kind,
    step: 'DRAW',
    tileId: null,
    placed: false,
    x: 0,
    y: 0,
    rotation: 0,
    builderTriggered: false,
    queue: [],
    magicDone: false,
    goldDone: false,
    figureDone: false,
    landing: null,
    ferryPlaced: false,
    ferryCandidates: null,
    changedPiers: [],
    scored: false,
    goldDraft: null,
    cropMode: null,
    cropDone: false,
  };
}

function emptyRobberRound(players: number): RobberRound {
  return { moved: [], points: new Array<number>(players).fill(0), triggers: {} };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/** Creates a game and runs it up to the first decision (player 0 placing the first drawn tile). */
export function createGame(options: GameOptions, cat: TileCatalog): GameState {
  const n = options.players;
  if (!Number.isInteger(n) || n < 2 || n > 6) throw new Error('A match needs 2-6 players');
  const expansions = [...new Set(options.expansions ?? [])];
  for (const e of expansions) if (!ALL_EXPANSIONS.includes(e)) throw new Error(`Unknown expansion ${e}`);
  expansions.sort((a, b) => ALL_EXPANSIONS.indexOf(a) - ALL_EXPANSIONS.indexOf(b));
  const has = (e: ExpansionId) => expansions.includes(e);
  const seed = String(options.seed);
  let rng = seedFromString(seed);
  const checkIds = (ids: readonly string[]) => {
    for (const id of ids) if (!cat.tiles[id]) throw new Error(`Unknown tile id ${id}`);
    return [...ids];
  };

  let drawPile: string[];
  if (options.tileOrder) {
    drawPile = checkIds(options.tileOrder);
  } else {
    const main = [...cat.composition.BASE];
    for (const e of expansions) if (e !== 'STREAM') main.push(...cat.composition[e]);
    const r = shuffle(main, rng);
    drawPile = r.items;
    rng = r.state;
  }

  let startId = cat.startTileId;
  let riverPile: string[] = [];
  if (has('STREAM')) {
    if (!cat.riverSourceId || !cat.riverLakeId) throw new Error('River data lacks source or lake');
    startId = cat.riverSourceId;
    const middle = cat.composition.STREAM.filter((id) => id !== cat.riverSourceId && id !== cat.riverLakeId);
    let order: string[];
    if (options.riverOrder) {
      order = checkIds(options.riverOrder);
    } else {
      const r = shuffle(middle, rng);
      order = r.items;
      rng = r.state;
    }
    riverPile = [...order, cat.riverLakeId];
  }

  let messageDeck: number[] = [];
  if (has('COURIERS')) {
    if (options.messageOrder) {
      messageDeck = [...options.messageOrder];
      if (messageDeck.some((m) => !MESSAGE_IDS.includes(m))) throw new Error('Messages are numbered 1-8');
    } else {
      const r = shuffle(MESSAGE_IDS, rng);
      messageDeck = r.items;
      rng = r.state;
    }
  }

  const s: GameState = {
    config: { players: n, seed, expansions, riverForbidReverseBend: options.riverForbidReverseBend ?? true },
    rng,
    players: Array.from({ length: n }, (_, index) => ({
      index,
      score: 0,
      messengerScore: 0,
      // 8 pawns per colour, one of them is the score marker on the scoreboard.
      supply: {
        MEEPLE: 7,
        LARGE: has('PAVILIONS') ? 1 : 0,
        ABBOT: has('HERMIT') ? 1 : 0,
        BUILDER: has('MARKETS') ? 1 : 0,
        PIG: has('MARKETS') ? 1 : 0,
      },
      goods: { WINE: 0, WHEAT: 0, CLOTH: 0 },
      gold: 0,
      robber: null,
    })),
    board: { tiles: {}, ferries: [] },
    figures: [],
    nextFigureId: 1,
    magic: { MAGE: null, WITCH: null },
    gold: {},
    supplies: {
      gold: has('SILVER') ? INITIAL_SUPPLY.gold : 0,
      ferries: has('CROSSINGS') ? INITIAL_SUPPLY.ferries : 0,
      goods: has('MARKETS') ? { ...INITIAL_SUPPLY.goods } : { WINE: 0, WHEAT: 0, CLOTH: 0 },
    },
    riverPile,
    drawPile,
    discarded: [],
    river: { open: null, sourceDir: null, lastTurn: null },
    messageDeck,
    turn: { number: 1, player: 0, builderUsed: false, extraParts: [], ferriesMoved: [], part: newPart('NORMAL') },
    awards: [],
    robberRound: emptyRobberRound(n),
    messageWatch: [],
    pending: null,
    log: [],
    actions: [],
    finished: false,
    final: null,
  };
  const c: Ctx = { cat, s, an: null };
  s.board.tiles[coordKey(0, 0)] = { tileId: startId, x: 0, y: 0, rotation: 0 };
  if (has('STREAM')) {
    const dir = riverDirs(cat.tiles[startId], 0)[0];
    s.river = { open: { x: 0, y: 0, dir }, sourceDir: dir, lastTurn: null };
  }
  // The log is public: never put the seed in it.
  log(c, 'GAME_STARTED', { players: n, expansions, startTile: startId });
  advance(c);
  return s;
}

/** Replays a list of actions from a fresh game (event sourcing: options + actions fully determine the state). */
export function replay(options: GameOptions, actions: readonly Action[], cat: TileCatalog): GameState {
  let s = createGame(options, cat);
  for (const a of actions) s = applyAction(s, a, cat);
  return s;
}

// ---------------------------------------------------------------------------
// Public reducer
// ---------------------------------------------------------------------------

export function applyAction(state: GameState, action: Action, cat: TileCatalog): GameState {
  if (state.finished) throw new Error('The game is over');
  const pending = state.pending;
  if (!pending) throw new Error('No decision is pending');
  if (action.player !== pending.player) {
    throw new Error(`Player ${action.player} cannot act now; waiting for player ${pending.player} (${pending.type})`);
  }
  const s = structuredClone(state);
  const c: Ctx = { cat, s, an: null };
  if (!isLegal(c, action)) throw new Error(`Illegal action ${JSON.stringify(action)} for decision ${pending.type}`);
  s.pending = null;
  s.actions.push(structuredClone(action));
  handle(c, action, pending);
  advance(c);
  return s;
}

/** Every legal action for the pending decision (empty when the game is over). */
export function legalActions(state: GameState, cat: TileCatalog): Action[] {
  return actionsFor({ cat, s: state, an: null });
}

/** What every client may see: the state without the seed, the RNG state and the order of hidden stacks. */
export type PublicGameView = Omit<GameState, 'config' | 'rng' | 'drawPile' | 'riverPile' | 'messageDeck'> & {
  config: Omit<GameState['config'], 'seed'>;
  drawPileCount: number;
  riverPileCount: number;
  messageDeckCount: number;
};

export function publicView(state: GameState): PublicGameView {
  const { config, rng: _rng, drawPile, riverPile, messageDeck, ...rest } = structuredClone(state);
  const { seed: _seed, ...publicConfig } = config;
  return {
    ...rest,
    config: publicConfig,
    drawPileCount: drawPile.length,
    riverPileCount: riverPile.length,
    messageDeckCount: messageDeck.length,
  };
}

export function boardAnalysis(state: GameState, cat: TileCatalog): Analysis {
  return analyzeBoard(cat, state.board);
}

function actionKey(a: Action): string {
  const rec = a as unknown as Record<string, unknown>;
  return JSON.stringify(
    Object.keys(rec)
      .filter((k) => rec[k] !== undefined)
      .sort()
      .map((k) => [k, rec[k]]),
  );
}

function isLegal(c: Ctx, action: Action): boolean {
  const legal = actionsFor(c);
  if (action.type === 'PLACE_MAGIC') {
    // Any tile of the target road/city designates the same feature.
    const target = analysis(c).byNode.get(nodeKey(action.x, action.y, action.feature));
    if (target === undefined) return false;
    return legal.some((l) => l.type === 'PLACE_MAGIC' && l.figure === action.figure && compId(c, l) === target);
  }
  const key = actionKey(action);
  return legal.some((l) => actionKey(l) === key);
}

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------

const STEPS: Record<Step, (c: Ctx) => void> = {
  DRAW: stepDraw,
  ROBBERS: stepRobbers,
  PLACE_TILE: stepPlaceTile,
  SEPARATE_1: (c) => stepSeparate(c, 'MAGIC'),
  MAGIC: stepMagic,
  GOLD: stepGold,
  FIGURE: stepFigure,
  FERRY_PLACE: stepFerryPlace,
  FERRY_MOVE: stepFerryMove,
  SEPARATE_2: (c) => stepSeparate(c, 'SCORE'),
  SCORE: stepScore,
  GOLD_DRAFT: stepGoldDraft,
  ROBBER_RESOLVE: stepRobberResolve,
  MESSAGES: stepMessages,
  CROP: stepCrop,
  END_PART: stepEndPart,
};

/** Runs automatic steps until a player decision is needed or the game ends. */
function advance(c: Ctx): void {
  const s = c.s;
  let guard = 0;
  while (!s.finished && !s.pending) {
    if (++guard > 100_000) throw new Error('Engine did not reach a decision');
    if (s.awards.length) {
      processAward(c);
      continue;
    }
    STEPS[s.turn.part.step](c);
  }
}

function processAward(c: Ctx): void {
  const s = c.s;
  const a = s.awards[0];
  if (a.points <= 0) {
    s.awards.shift();
    return;
  }
  if (on(c, 'COURIERS') && !a.figure) {
    s.pending = { type: 'SCORE_FIGURE', player: a.player, points: a.points, source: a.source };
    return;
  }
  s.awards.shift();
  moveTrackFigure(c, a.player, a.figure ?? 'SCORE', a.points, a.source);
}

function moveTrackFigure(c: Ctx, player: number, fig: TrackFigure, points: number, source: AwardSource): void {
  const s = c.s;
  const pl = s.players[player];
  const start = trackPos(c, player, fig);
  if (fig === 'SCORE') pl.score += points;
  else pl.messengerScore += points;
  const end = trackPos(c, player, fig);
  log(c, 'POINTS', { player, points, figure: fig, source, score: pl.score, messengerScore: pl.messengerScore });
  if (on(c, 'BROKERS')) {
    const rr = s.robberRound;
    if (source === 'FEATURE' || source === 'ABBOT') {
      rr.points[player] += points;
      const key = `${player}:${fig}`;
      if (!rr.moved.includes(key)) {
        rr.moved.push(key);
        for (const q of s.players) {
          if (q.index === player || q.robber !== start) continue;
          const list = (rr.triggers[q.index] ??= []);
          if (!list.includes(player)) list.push(player);
        }
      }
    } else if (source === 'ROBBER') {
      // Points from robbing never trigger robbers: robbers waiting there travel along.
      for (const q of s.players) {
        if (q.index === player || q.robber !== start || rr.triggers[q.index]?.length) continue;
        q.robber = end;
        log(c, 'ROBBER_MOVED_ALONG', { player: q.index, space: end });
      }
    }
  }
  if (on(c, 'COURIERS') && player === activePlayer(c) && !s.messageWatch.includes(fig)) s.messageWatch.push(fig);
}

function stepDraw(c: Ctx): void {
  const s = c.s;
  const part = currentPart(c);
  for (;;) {
    const pile = s.riverPile.length ? s.riverPile : s.drawPile;
    if (!pile.length) {
      if (part.kind === 'NORMAL') finishGame(c);
      else part.step = 'END_PART';
      return;
    }
    const id = pile.shift()!;
    if (!hasLegalPlacement(c, id)) {
      s.discarded.push(id);
      log(c, 'TILE_DISCARDED', { player: activePlayer(c), tileId: id });
      continue;
    }
    part.tileId = id;
    log(c, 'TILE_DRAWN', { player: activePlayer(c), tileId: id, part: part.kind });
    if (on(c, 'BROKERS') && c.cat.tiles[id].robber) {
      part.queue = playersFrom(c, activePlayer(c));
      part.step = 'ROBBERS';
    } else {
      part.step = 'PLACE_TILE';
    }
    return;
  }
}

/** Spaces holding at least one score figure of another player. */
function robberSpaces(c: Ctx, player: number): number[] {
  const spaces = new Set<number>();
  for (const p of c.s.players) {
    if (p.index === player) continue;
    spaces.add(trackPos(c, p.index, 'SCORE'));
    if (on(c, 'COURIERS')) spaces.add(trackPos(c, p.index, 'MESSENGER'));
  }
  return [...spaces].sort((a, b) => a - b);
}

function stepRobbers(c: Ctx): void {
  const s = c.s;
  const part = currentPart(c);
  while (part.queue.length) {
    const q = part.queue[0];
    const robber = s.players[q].robber;
    const spaces = robberSpaces(c, q);
    if (robber === null) {
      if (spaces.length) {
        s.pending = { type: 'PLACE_ROBBER', player: q, spaces, canKeep: false };
        return;
      }
    } else if (q === activePlayer(c)) {
      const others = spaces.filter((x) => x !== robber);
      if (others.length) {
        s.pending = { type: 'PLACE_ROBBER', player: q, spaces: others, canKeep: true };
        return;
      }
    }
    part.queue.shift();
  }
  part.step = 'PLACE_TILE';
}

function stepPlaceTile(c: Ctx): void {
  const part = currentPart(c);
  if (!part.placed) {
    c.s.pending = { type: 'PLACE_TILE', player: activePlayer(c), tileId: part.tileId! };
    return;
  }
  part.step = 'SEPARATE_1';
}

function magicTogether(c: Ctx): boolean {
  const { MAGE, WITCH } = c.s.magic;
  return MAGE !== null && WITCH !== null && compId(c, MAGE) === compId(c, WITCH);
}

function stepSeparate(c: Ctx, next: Step): void {
  cleanupAttachments(c);
  if (on(c, 'OMENS') && magicTogether(c)) {
    c.s.pending = { type: 'MAGIC', player: activePlayer(c), reason: 'SEPARATE' };
    return;
  }
  currentPart(c).step = next;
}

function stepMagic(c: Ctx): void {
  const part = currentPart(c);
  if (!on(c, 'OMENS') || !partDef(c).magic || part.magicDone) {
    part.step = 'GOLD';
    return;
  }
  const o = magicOptions(c, 'SYMBOL');
  if (!o.places.length && !o.removes.length) {
    part.magicDone = true;
    log(c, 'MAGIC_NO_TARGET', { player: activePlayer(c) });
    return;
  }
  c.s.pending = { type: 'MAGIC', player: activePlayer(c), reason: 'SYMBOL' };
}

function stepGold(c: Ctx): void {
  const s = c.s;
  const part = currentPart(c);
  if (!on(c, 'SILVER') || !partDef(c).goldmine || part.goldDone) {
    part.step = 'FIGURE';
    return;
  }
  if (s.supplies.gold > 0) addGold(c, coordKey(part.x, part.y));
  if (s.supplies.gold > 0) s.pending = { type: 'PLACE_GOLD', player: activePlayer(c) };
  else part.goldDone = true;
}

function stepFigure(c: Ctx): void {
  const part = currentPart(c);
  if (!part.figureDone) {
    if (figureActions(c).length > 1) {
      c.s.pending = { type: 'FIGURE', player: activePlayer(c) };
      return;
    }
    part.figureDone = true;
  }
  if (part.landing) {
    const l = part.landing;
    c.s.pending = { type: 'LAND', player: activePlayer(c), x: l.x, y: l.y, kind: l.kind };
    return;
  }
  part.step = 'FERRY_PLACE';
}

function stepFerryPlace(c: Ctx): void {
  const part = currentPart(c);
  const def = partDef(c);
  if (!part.ferryPlaced && on(c, 'CROSSINGS') && def.ferryLake && c.s.supplies.ferries > 0 && pierPairs(def).length) {
    c.s.pending = { type: 'PLACE_FERRY', player: activePlayer(c), x: part.x, y: part.y };
    return;
  }
  part.step = 'FERRY_MOVE';
}

function stepFerryMove(c: Ctx): void {
  const part = currentPart(c);
  if (on(c, 'CROSSINGS')) {
    part.ferryCandidates ??= ferryCandidates(c);
    if (part.ferryCandidates.length) {
      const { x, y } = parseKey(part.ferryCandidates[0]);
      c.s.pending = { type: 'MOVE_FERRY', player: activePlayer(c), x, y };
      return;
    }
  }
  part.step = 'SEPARATE_2';
}

function stepScore(c: Ctx): void {
  const part = currentPart(c);
  if (!part.scored) {
    scoreCompletedFeatures(c);
    part.scored = true;
  }
  part.step = 'GOLD_DRAFT';
}

function stepGoldDraft(c: Ctx): void {
  const s = c.s;
  const part = currentPart(c);
  const d = part.goldDraft;
  if (!d) {
    part.step = 'ROBBER_RESOLVE';
    return;
  }
  const avail = (p: number) =>
    Object.keys(d.entitled)
      .filter((k) => (s.gold[k] ?? 0) > 0 && d.entitled[k].includes(p))
      .sort();
  const claimants = d.order.filter((p) => avail(p).length > 0);
  if (!claimants.length) {
    part.goldDraft = null;
    part.step = 'ROBBER_RESOLVE';
    return;
  }
  for (let i = 0; i < d.order.length; i++) {
    const idx = (d.next + i) % d.order.length;
    const p = d.order[idx];
    const opts = avail(p);
    if (!opts.length) continue;
    if (claimants.length === 1 || opts.length === 1) {
      takeGold(c, p, opts[0]);
      d.next = (idx + 1) % d.order.length;
      return;
    }
    d.next = idx;
    s.pending = { type: 'PICK_GOLD', player: p, tiles: opts };
    return;
  }
}

function stepRobberResolve(c: Ctx): void {
  const s = c.s;
  if (on(c, 'BROKERS')) {
    for (const q of playersFrom(c, activePlayer(c))) {
      const victims = s.robberRound.triggers[q];
      if (!victims?.length) continue;
      if (victims.length > 1) {
        s.pending = { type: 'CHOOSE_VICTIM', player: q, victims: [...victims] };
        return;
      }
      resolveRobber(c, q, victims[0]);
      return;
    }
  }
  s.robberRound = emptyRobberRound(s.players.length);
  currentPart(c).step = 'MESSAGES';
}

function resolveRobber(c: Ctx, owner: number, victim: number): void {
  const s = c.s;
  const points = robberShare(s.robberRound.points[victim]);
  delete s.robberRound.triggers[owner];
  s.players[owner].robber = null;
  log(c, 'ROBBER_STOLE', { player: owner, victim, points });
  s.awards.push({ player: owner, points, source: 'ROBBER' });
}

function stepMessages(c: Ctx): void {
  const s = c.s;
  if (on(c, 'COURIERS')) {
    const p = activePlayer(c);
    const dark = s.messageWatch.some((f) => trackPos(c, p, f) % 5 === 0);
    s.messageWatch = [];
    if (dark && s.messageDeck.length) {
      const message = s.messageDeck.shift()!;
      log(c, 'MESSAGE_DRAWN', { player: p, message });
      s.pending = { type: 'MESSAGE', player: p, message };
      return;
    }
  }
  currentPart(c).step = 'CROP';
}

function cropFigures(c: Ctx, player: number, circle: CropCircle): Figure[] {
  const kind = CROP_FEATURE[circle];
  return c.s.figures.filter((f) => f.owner === player && isMeeple(f.kind) && figureComp(c, f).kind === kind);
}

function stepCrop(c: Ctx): void {
  const s = c.s;
  const part = currentPart(c);
  const circle = partDef(c).cropCircle;
  if (!on(c, 'BANNERS') || !circle || part.cropDone) {
    part.step = 'END_PART';
    return;
  }
  if (!part.cropMode) {
    s.pending = { type: 'CROP_MODE', player: activePlayer(c), circle };
    return;
  }
  while (part.queue.length) {
    const q = part.queue[0];
    const supply = s.players[q].supply;
    if (cropFigures(c, q, circle).length && (part.cropMode === 'REMOVE' || supply.MEEPLE + supply.LARGE > 0)) {
      s.pending = { type: 'CROP_ACTION', player: q, mode: part.cropMode, circle };
      return;
    }
    part.queue.shift();
  }
  part.cropDone = true;
  part.step = 'END_PART';
}

function stepEndPart(c: Ctx): void {
  const s = c.s;
  const t = s.turn;
  if (t.part.builderTriggered && !t.builderUsed) {
    t.builderUsed = true;
    t.extraParts.unshift('BUILDER');
    log(c, 'BUILDER_EXTRA_TILE', { player: t.player });
  }
  const next = t.extraParts.shift();
  if (next) {
    t.part = newPart(next);
    return;
  }
  s.turn = {
    number: t.number + 1,
    player: (t.player + 1) % s.players.length,
    builderUsed: false,
    extraParts: [],
    ferriesMoved: [],
    part: newPart('NORMAL'),
  };
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

function handle(c: Ctx, a: Action, pending: Pending): void {
  const s = c.s;
  const part = currentPart(c);
  switch (a.type) {
    case 'PLACE_ROBBER':
      s.players[a.player].robber = a.space;
      log(c, 'ROBBER_PLACED', { player: a.player, space: a.space });
      part.queue.shift();
      return;
    case 'KEEP_ROBBER':
      part.queue.shift();
      return;
    case 'PLACE_TILE':
      placeTile(c, a.x, a.y, a.rotation);
      return;
    case 'PLACE_MAGIC': {
      const moved = s.magic[a.figure] !== null;
      s.magic[a.figure] = { x: a.x, y: a.y, feature: a.feature };
      log(c, moved ? 'MAGIC_MOVED' : 'MAGIC_PLACED', { player: a.player, figure: a.figure, x: a.x, y: a.y, feature: a.feature });
      if (pending.type === 'MAGIC' && pending.reason === 'SYMBOL') part.magicDone = true;
      return;
    }
    case 'REMOVE_MAGIC':
      s.magic[a.figure] = null;
      log(c, 'MAGIC_REMOVED', { player: a.player, figure: a.figure });
      if (pending.type === 'MAGIC' && pending.reason === 'SYMBOL') part.magicDone = true;
      return;
    case 'PLACE_GOLD':
      addGold(c, coordKey(a.x, a.y));
      part.goldDone = true;
      return;
    case 'PLACE_FIGURE':
      addFigure(c, a.player, a.kind, { x: part.x, y: part.y, feature: a.feature });
      part.figureDone = true;
      return;
    case 'FLY':
      fly(c, a.kind);
      part.figureDone = true;
      return;
    case 'LAND': {
      const l = part.landing!;
      addFigure(c, a.player, l.kind, { x: l.x, y: l.y, feature: a.feature });
      part.landing = null;
      return;
    }
    case 'RECALL_ABBOT': {
      const abbot = s.figures.find((f) => f.owner === a.player && f.kind === 'ABBOT')!;
      const points = 1 + surroundingCount(s.board, abbot.x, abbot.y);
      returnFigure(c, abbot, 'RECALLED');
      log(c, 'ABBOT_RECALLED', { player: a.player, points });
      s.awards.push({ player: a.player, points, source: 'ABBOT' });
      part.figureDone = true;
      return;
    }
    case 'SKIP_FIGURE':
      part.figureDone = true;
      return;
    case 'PLACE_FERRY':
      s.board.ferries.push({ x: part.x, y: part.y, a: a.a, b: a.b });
      s.supplies.ferries--;
      part.ferryPlaced = true;
      part.changedPiers.push({ x: part.x, y: part.y, feature: a.a }, { x: part.x, y: part.y, feature: a.b });
      boardChanged(c);
      log(c, 'FERRY_PLACED', { player: a.player, x: part.x, y: part.y, a: a.a, b: a.b });
      return;
    case 'MOVE_FERRY': {
      const key = part.ferryCandidates!.shift()!;
      s.turn.ferriesMoved.push(key);
      const fr = s.board.ferries.find((f) => coordKey(f.x, f.y) === key)!;
      const same = (fr.a === a.a && fr.b === a.b) || (fr.a === a.b && fr.b === a.a);
      if (same) {
        log(c, 'FERRY_KEPT', { player: a.player, x: fr.x, y: fr.y });
        return;
      }
      for (const f of [fr.a, fr.b, a.a, a.b]) part.changedPiers.push({ x: fr.x, y: fr.y, feature: f });
      log(c, 'FERRY_MOVED', { player: a.player, x: fr.x, y: fr.y, from: [fr.a, fr.b], to: [a.a, a.b] });
      fr.a = a.a;
      fr.b = a.b;
      boardChanged(c);
      return;
    }
    case 'CHOOSE_SCORE_FIGURE':
      s.awards[0].figure = a.figure;
      return;
    case 'PICK_GOLD': {
      const d = part.goldDraft!;
      takeGold(c, a.player, coordKey(a.x, a.y));
      d.next = (d.next + 1) % d.order.length;
      return;
    }
    case 'CHOOSE_VICTIM':
      resolveRobber(c, a.player, a.victim);
      return;
    case 'RESOLVE_MESSAGE':
      if (pending.type !== 'MESSAGE') throw new Error('No message pending');
      resolveMessage(c, a.player, pending.message, a.perform, a.figureId);
      return;
    case 'CHOOSE_CROP_MODE':
      part.cropMode = a.mode;
      part.queue = playersFrom(c, a.player + 1);
      log(c, 'CROP_CIRCLE', { player: a.player, circle: partDef(c).cropCircle, mode: a.mode });
      return;
    case 'CROP_ADD': {
      const base = s.figures.find((f) => f.id === a.nextTo)!;
      addFigure(c, a.player, a.kind, { x: base.x, y: base.y, feature: base.feature });
      part.queue.shift();
      return;
    }
    case 'CROP_SKIP':
      part.queue.shift();
      return;
    case 'CROP_REMOVE':
      returnFigure(c, s.figures.find((f) => f.id === a.figureId)!, 'CROP_CIRCLE');
      cleanupAttachments(c);
      part.queue.shift();
      return;
  }
}

function placeTile(c: Ctx, x: number, y: number, rotation: Rotation): void {
  const s = c.s;
  const part = currentPart(c);
  const def = partDef(c);
  s.board.tiles[coordKey(x, y)] = { tileId: def.id, x, y, rotation };
  part.placed = true;
  part.x = x;
  part.y = y;
  part.rotation = rotation;
  boardChanged(c);
  if (def.expansion === 'STREAM' && !def.riverSource) {
    const open = s.river.open!;
    const inDir = opposite(open.dir);
    const outs = riverDirs(def, rotation).filter((d) => d !== inDir);
    if (!outs.length) {
      s.river.open = null;
    } else {
      s.river.lastTurn = outs[0] === open.dir ? null : (((outs[0] - open.dir + 4) % 4) as 1 | 3);
      s.river.open = { x, y, dir: outs[0] };
    }
  }
  log(c, 'TILE_PLACED', { player: activePlayer(c), tileId: def.id, x, y, rotation });
  if (on(c, 'MARKETS') && !s.turn.builderUsed && part.kind !== 'BUILDER') {
    const touched = new Set(def.features.map((f) => compId(c, { x, y, feature: f.index })));
    part.builderTriggered = s.figures.some(
      (f) => f.owner === activePlayer(c) && f.kind === 'BUILDER' && touched.has(compId(c, f)),
    );
  }
}

function addFigure(c: Ctx, owner: number, kind: FigureKind, ref: FeatureRef): void {
  const s = c.s;
  if (s.players[owner].supply[kind] <= 0) throw new Error(`Player ${owner} has no ${kind} in supply`);
  const fig: Figure = { id: s.nextFigureId++, owner, kind, x: ref.x, y: ref.y, feature: ref.feature };
  s.figures.push(fig);
  s.players[owner].supply[kind]--;
  log(c, 'FIGURE_PLACED', { player: owner, figureId: fig.id, kind, x: ref.x, y: ref.y, feature: ref.feature });
}

function returnFigure(c: Ctx, fig: Figure, reason: string): void {
  const s = c.s;
  s.figures = s.figures.filter((f) => f.id !== fig.id);
  s.players[fig.owner].supply[fig.kind]++;
  log(c, 'FIGURE_RETURNED', { player: fig.owner, figureId: fig.id, kind: fig.kind, reason });
}

/** Builders and pigs return to the supply once their owner has no follower left in their feature. */
function cleanupAttachments(c: Ctx): void {
  for (const f of [...c.s.figures]) {
    if (f.kind !== 'BUILDER' && f.kind !== 'PIG') continue;
    const id = compId(c, f);
    const supported = c.s.figures.some((g) => g.owner === f.owner && isMeeple(g.kind) && compId(c, g) === id);
    if (!supported) returnFigure(c, f, 'NO_MEEPLE_LEFT');
  }
}

function addGold(c: Ctx, key: string): void {
  c.s.gold[key] = (c.s.gold[key] ?? 0) + 1;
  c.s.supplies.gold--;
  const { x, y } = parseKey(key);
  log(c, 'GOLD_PLACED', { player: activePlayer(c), x, y });
}

function takeGold(c: Ctx, player: number, key: string): void {
  const s = c.s;
  s.gold[key]--;
  if (s.gold[key] === 0) delete s.gold[key];
  s.players[player].gold++;
  const { x, y } = parseKey(key);
  log(c, 'GOLD_TAKEN', { player, x, y });
}

function fly(c: Ctx, kind: 'MEEPLE' | 'LARGE'): void {
  const s = c.s;
  const part = currentPart(c);
  const def = partDef(c);
  const roll = randomInt(s.rng, FLIGHT_DIE.length);
  s.rng = roll.state;
  const distance = FLIGHT_DIE[roll.value];
  const direction = rotateCompass8(def.flight!, part.rotation);
  const o = compass8Offset(direction);
  const x = part.x + o.dx * distance;
  const y = part.y + o.dy * distance;
  const options = landingFeatures(c, x, y);
  log(c, 'FLIGHT', { player: activePlayer(c), kind, direction, distance, x, y, canLand: options.length > 0 });
  if (options.length) part.landing = { x, y, kind };
}

/** Incomplete roads, cities and monasteries of the landing tile (occupied ones included). */
function landingFeatures(c: Ctx, x: number, y: number): number[] {
  const p = c.s.board.tiles[coordKey(x, y)];
  if (!p) return [];
  return placedDef(c.cat, p)
    .features.filter((f) => f.kind === 'ROAD' || f.kind === 'CITY' || f.kind === 'MONASTERY')
    .filter((f) => !figureComp(c, { x, y, feature: f.index }).complete)
    .map((f) => f.index);
}

/**
 * Ferries that may be repositioned: following each road of the new tile outwards, the first
 * ferry met (each ferry once per turn; the ferry of the new tile itself is excluded).
 */
function ferryCandidates(c: Ctx): string[] {
  const s = c.s;
  const part = currentPart(c);
  const placedKey = coordKey(part.x, part.y);
  const p = s.board.tiles[placedKey];
  const found: string[] = [];
  for (const f of placedDef(c.cat, p).features) {
    if (f.kind !== 'ROAD') continue;
    for (const d of featureDirections(c.cat, p, f.index)) {
      const n = neighbourCoord(p.x, p.y, d);
      const nk = coordKey(n.x, n.y);
      if (!s.board.tiles[nk]) continue;
      const hit = walkToFerry(c, nk, opposite(d), placedKey);
      if (hit && hit !== placedKey && !found.includes(hit) && !s.turn.ferriesMoved.includes(hit)) found.push(hit);
    }
  }
  return found;
}

function walkToFerry(c: Ctx, key: string, enter: Direction, placedKey: string): string | null {
  const s = c.s;
  const seen = new Set<string>();
  for (;;) {
    const state = `${key}/${enter}`;
    if (seen.has(state)) return null;
    seen.add(state);
    const p = s.board.tiles[key];
    const f = featureAtSlot(c.cat, p, 3 * enter + 1);
    const ferry = s.board.ferries.find((fr) => coordKey(fr.x, fr.y) === key);
    if (ferry && (ferry.a === f || ferry.b === f)) return key;
    if (key === placedKey) return null;
    const exits = featureDirections(c.cat, p, f).filter((d) => d !== enter);
    if (exits.length !== 1) return null;
    const n = neighbourCoord(p.x, p.y, exits[0]);
    const nk = coordKey(n.x, n.y);
    if (!s.board.tiles[nk]) return null;
    key = nk;
    enter = opposite(exits[0]);
  }
}

function scoreCompletedFeatures(c: Ctx): void {
  const s = c.s;
  const part = currentPart(c);
  const an = analysis(c);
  const ids = new Set<number>();
  const def = partDef(c);
  for (const f of def.features) ids.add(compId(c, { x: part.x, y: part.y, feature: f.index }));
  for (const sq of [{ x: part.x, y: part.y }, ...ring8(part.x, part.y)]) {
    const q = s.board.tiles[coordKey(sq.x, sq.y)];
    if (!q) continue;
    for (const f of placedDef(c.cat, q).features) {
      if (f.kind === 'MONASTERY' || f.kind === 'GARDEN') ids.add(compId(c, { x: q.x, y: q.y, feature: f.index }));
    }
  }
  for (const ref of part.changedPiers) ids.add(compId(c, ref));
  const done = [...ids]
    .map((i) => an.components[i])
    .filter((k) => k.complete && SCORED_KINDS.includes(k.kind))
    .sort((x, y) => SCORED_KINDS.indexOf(x.kind) - SCORED_KINDS.indexOf(y.kind) || x.id - y.id);

  const entitled: Record<string, number[]> = {};
  for (const comp of done) {
    const followers = followersIn(c, comp.id);
    const owners = majorityOwners(followers);
    const magic = magicIn(c, comp);
    const points = featureValue(comp, magic);
    log(c, 'FEATURE_COMPLETED', {
      kind: comp.kind,
      tiles: comp.tiles.length,
      points,
      owners,
      mage: magic.mage,
      witch: magic.witch,
    });
    for (const o of owners) s.awards.push({ player: o, points, source: 'FEATURE' });
    if (comp.kind === 'CITY' && on(c, 'MARKETS')) {
      for (const g of comp.goods) {
        if (s.supplies.goods[g] <= 0) continue;
        s.supplies.goods[g]--;
        s.players[activePlayer(c)].goods[g]++;
        log(c, 'GOODS_TAKEN', { player: activePlayer(c), good: g });
      }
    }
    if (on(c, 'SILVER') && owners.length) {
      const origin = comp.nodes[0];
      const area =
        comp.kind === 'ROAD' || comp.kind === 'CITY'
          ? comp.tiles
          : [origin, ...ring8(origin.x, origin.y)].map((q) => coordKey(q.x, q.y));
      for (const k of area) {
        if (!(s.gold[k] > 0)) continue;
        const list = (entitled[k] ??= []);
        for (const o of owners) if (!list.includes(o)) list.push(o);
      }
    }
    for (const f of followers) returnFigure(c, f, 'SCORED');
    for (const m of MAGIC_FIGURES) {
      if (!(m === 'MAGE' ? magic.mage : magic.witch)) continue;
      s.magic[m] = null;
      log(c, 'MAGIC_REMOVED', { figure: m, reason: 'SCORED' });
    }
  }
  cleanupAttachments(c);
  if (Object.keys(entitled).length) {
    part.goldDraft = { order: playersFrom(c, activePlayer(c)), next: 0, entitled };
  }
}

function fieldScoreFor(c: Ctx, field: Component, player: number): number {
  const an = analysis(c);
  const cities = field.adjacentCities.filter((id) => an.components[id].complete).length;
  const pig = c.s.figures.some((f) => f.owner === player && f.kind === 'PIG' && compId(c, f) === field.id);
  return fieldPoints(cities, pig);
}

function ownFigures(c: Ctx, player: number, kind: FeatureKind): Figure[] {
  return c.s.figures.filter((f) => f.owner === player && isMeeple(f.kind) && figureComp(c, f).kind === kind);
}

function resolveMessage(c: Ctx, player: number, message: number, perform: boolean, figureId?: number): void {
  const s = c.s;
  s.messageDeck.push(message);
  log(c, 'MESSAGE_RESOLVED', { player, message, performed: perform });
  const award = (points: number) => s.awards.push({ player, points, source: 'MESSAGE' });
  if (!perform) {
    award(2);
    return;
  }
  const figure = () => s.figures.find((f) => f.id === figureId)!;
  switch (message) {
    case 1:
    case 2:
    case 3: {
      const comp = figureComp(c, figure());
      award(featureValue(comp, magicIn(c, comp)));
      return;
    }
    case 4:
      s.turn.extraParts.push('MESSAGE');
      return;
    case 5: {
      const cities = new Set(ownFigures(c, player, 'CITY').map((f) => compId(c, f)));
      let pennants = 0;
      for (const id of cities) pennants += analysis(c).components[id].pennants;
      award(2 * pennants);
      return;
    }
    case 6:
      award(2 * ownFigures(c, player, 'CITY').length);
      return;
    case 7:
      award(2 * ownFigures(c, player, 'FIELD').length);
      return;
    case 8: {
      const fig = figure();
      const comp = figureComp(c, fig);
      if (majorityOwners(followersIn(c, comp.id)).includes(player)) {
        award(comp.kind === 'FIELD' ? fieldScoreFor(c, comp, player) : featureValue(comp, magicIn(c, comp)));
      }
      returnFigure(c, fig, 'MESSAGE');
      cleanupAttachments(c);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Legal actions
// ---------------------------------------------------------------------------

function riverAllows(c: Ctx, def: TileDef, x: number, y: number, rotation: Rotation): boolean {
  if (def.expansion !== 'STREAM') return true;
  const s = c.s;
  const open = s.river.open;
  if (!open) return false;
  const n = neighbourCoord(open.x, open.y, open.dir);
  if (n.x !== x || n.y !== y) return false;
  const inDir = opposite(open.dir);
  if (edgeAt(def.edges, inDir, rotation) !== 'RIVER') return false;
  const out = riverDirs(def, rotation).find((d) => d !== inDir);
  if (out === undefined || out === open.dir) return true;
  const turn = (out - open.dir + 4) % 4;
  if (s.river.lastTurn === turn) return false;
  if (s.config.riverForbidReverseBend && s.river.sourceDir !== null && out === opposite(s.river.sourceDir)) return false;
  return true;
}

function legalPlacements(c: Ctx, tileId: string, firstOnly = false): { x: number; y: number; rotation: Rotation }[] {
  const def = c.cat.tiles[tileId];
  const out: { x: number; y: number; rotation: Rotation }[] = [];
  for (const sq of frontier(c.s.board)) {
    for (const rotation of ROTATIONS) {
      if (fitsEdges(c.cat, c.s.board, def, sq.x, sq.y, rotation) && riverAllows(c, def, sq.x, sq.y, rotation)) {
        out.push({ x: sq.x, y: sq.y, rotation });
        if (firstOnly) return out;
      }
    }
  }
  return out;
}

function hasLegalPlacement(c: Ctx, tileId: string): boolean {
  return legalPlacements(c, tileId, true).length > 0;
}

/** Legal tile placements for a tile id in the current position (exported for UIs and tests). */
export function tilePlacements(state: GameState, tileId: string, cat: TileCatalog) {
  return legalPlacements({ cat, s: state, an: null }, tileId);
}

function magicOptions(c: Ctx, reason: 'SYMBOL' | 'SEPARATE') {
  const s = c.s;
  const targets = analysis(c).components.filter((k) => (k.kind === 'ROAD' || k.kind === 'CITY') && !k.complete);
  const at = (m: MagicFigure) => (s.magic[m] ? compId(c, s.magic[m]!) : null);
  const pos: Record<MagicFigure, number | null> = { MAGE: at('MAGE'), WITCH: at('WITCH') };
  const places: { figure: MagicFigure; comp: Component }[] = [];
  for (const figure of MAGIC_FIGURES) {
    if (reason === 'SEPARATE' && pos[figure] === null) continue;
    const other = pos[figure === 'MAGE' ? 'WITCH' : 'MAGE'];
    for (const t of targets) {
      if (t.id === other || t.id === pos[figure]) continue;
      places.push({ figure, comp: t });
    }
  }
  const removes = places.length ? [] : MAGIC_FIGURES.filter((m) => s.magic[m] !== null);
  return { places, removes };
}

function figureActions(c: Ctx): Action[] {
  const s = c.s;
  const player = activePlayer(c);
  const supply = s.players[player].supply;
  const part = currentPart(c);
  const def = partDef(c);
  const out: Action[] = [];
  for (const f of def.features) {
    const comp = figureComp(c, { x: part.x, y: part.y, feature: f.index });
    const followers = followersIn(c, comp.id);
    const occupied = followers.length > 0;
    const mine = followers.some((g) => g.owner === player && isMeeple(g.kind));
    if (!occupied && (f.kind === 'ROAD' || f.kind === 'CITY' || f.kind === 'MONASTERY' || f.kind === 'FIELD')) {
      for (const kind of ['MEEPLE', 'LARGE'] as const) {
        if (supply[kind] > 0) out.push({ type: 'PLACE_FIGURE', player, kind, feature: f.index });
      }
    }
    if (!occupied && supply.ABBOT > 0 && (f.kind === 'MONASTERY' || f.kind === 'GARDEN')) {
      out.push({ type: 'PLACE_FIGURE', player, kind: 'ABBOT', feature: f.index });
    }
    if (mine && supply.BUILDER > 0 && (f.kind === 'ROAD' || f.kind === 'CITY')) {
      out.push({ type: 'PLACE_FIGURE', player, kind: 'BUILDER', feature: f.index });
    }
    if (mine && supply.PIG > 0 && f.kind === 'FIELD') {
      out.push({ type: 'PLACE_FIGURE', player, kind: 'PIG', feature: f.index });
    }
  }
  if (on(c, 'KITES') && def.flight) {
    for (const kind of ['MEEPLE', 'LARGE'] as const) if (supply[kind] > 0) out.push({ type: 'FLY', player, kind });
  }
  // The abbot can only be recalled from a monastery or garden that is still incomplete after this tile.
  const abbot = s.figures.find((f) => f.owner === player && f.kind === 'ABBOT');
  if (abbot && !figureComp(c, abbot).complete) out.push({ type: 'RECALL_ABBOT', player });
  out.push({ type: 'SKIP_FIGURE', player });
  return out;
}

function messageActions(c: Ctx, player: number, message: number): Action[] {
  const s = c.s;
  const out: Action[] = [{ type: 'RESOLVE_MESSAGE', player, perform: false }];
  switch (message) {
    case 1:
    case 2:
    case 3: {
      const kind = MESSAGE_FEATURE[message];
      const byComp = new Map<number, { figureId: number; value: number }>();
      for (const f of s.figures) {
        if (f.owner !== player || !isFollower(f.kind)) continue;
        const comp = figureComp(c, f);
        if (comp.kind !== kind || byComp.has(comp.id)) continue;
        byComp.set(comp.id, { figureId: f.id, value: featureValue(comp, magicIn(c, comp)) });
      }
      const min = Math.min(...[...byComp.values()].map((v) => v.value));
      for (const v of byComp.values()) {
        if (v.value === min) out.push({ type: 'RESOLVE_MESSAGE', player, perform: true, figureId: v.figureId });
      }
      break;
    }
    case 4:
      if (s.riverPile.length + s.drawPile.length > 0) out.push({ type: 'RESOLVE_MESSAGE', player, perform: true });
      break;
    case 5:
    case 6:
    case 7:
      out.push({ type: 'RESOLVE_MESSAGE', player, perform: true });
      break;
    case 8:
      for (const f of s.figures) {
        if (f.owner === player && isFollower(f.kind)) {
          out.push({ type: 'RESOLVE_MESSAGE', player, perform: true, figureId: f.id });
        }
      }
      break;
  }
  return out;
}

function actionsFor(c: Ctx): Action[] {
  const s = c.s;
  const p = s.pending;
  if (!p || s.finished) return [];
  const player = p.player;
  switch (p.type) {
    case 'PLACE_ROBBER':
      return [
        ...p.spaces.map((space): Action => ({ type: 'PLACE_ROBBER', player, space })),
        ...(p.canKeep ? [{ type: 'KEEP_ROBBER', player } as Action] : []),
      ];
    case 'PLACE_TILE':
      return legalPlacements(c, p.tileId).map((pl): Action => ({ type: 'PLACE_TILE', player, ...pl }));
    case 'MAGIC': {
      const o = magicOptions(c, p.reason);
      if (o.places.length) {
        return o.places.map(({ figure, comp }): Action => ({ type: 'PLACE_MAGIC', player, figure, ...comp.nodes[0] }));
      }
      return o.removes.map((figure): Action => ({ type: 'REMOVE_MAGIC', player, figure }));
    }
    case 'PLACE_GOLD': {
      const part = currentPart(c);
      return ring8(part.x, part.y)
        .filter((q) => s.board.tiles[coordKey(q.x, q.y)])
        .map((q): Action => ({ type: 'PLACE_GOLD', player, x: q.x, y: q.y }));
    }
    case 'FIGURE':
      return figureActions(c);
    case 'LAND':
      return landingFeatures(c, p.x, p.y).map((feature): Action => ({ type: 'LAND', player, feature }));
    case 'PLACE_FERRY':
    case 'MOVE_FERRY': {
      const def = placedDef(c.cat, s.board.tiles[coordKey(p.x, p.y)]);
      return pierPairs(def).map(([a, b]): Action => ({ type: p.type, player, a, b }));
    }
    case 'SCORE_FIGURE':
      return (['SCORE', 'MESSENGER'] as const).map((figure): Action => ({ type: 'CHOOSE_SCORE_FIGURE', player, figure }));
    case 'PICK_GOLD':
      return p.tiles.map((k): Action => ({ type: 'PICK_GOLD', player, ...parseKey(k) }));
    case 'CHOOSE_VICTIM':
      return p.victims.map((victim): Action => ({ type: 'CHOOSE_VICTIM', player, victim }));
    case 'MESSAGE':
      return messageActions(c, player, p.message);
    case 'CROP_MODE':
      return (['ADD', 'REMOVE'] as const).map((mode): Action => ({ type: 'CHOOSE_CROP_MODE', player, mode }));
    case 'CROP_ACTION': {
      const mine = cropFigures(c, player, p.circle);
      if (p.mode === 'REMOVE') return mine.map((f): Action => ({ type: 'CROP_REMOVE', player, figureId: f.id }));
      const supply = s.players[player].supply;
      const out: Action[] = [];
      for (const f of mine) {
        for (const kind of ['MEEPLE', 'LARGE'] as const) {
          if (supply[kind] > 0) out.push({ type: 'CROP_ADD', player, nextTo: f.id, kind });
        }
      }
      out.push({ type: 'CROP_SKIP', player });
      return out;
    }
  }
}

// ---------------------------------------------------------------------------
// Final scoring
// ---------------------------------------------------------------------------

function finishGame(c: Ctx): void {
  const s = c.s;
  log(c, 'GAME_END_REACHED', {});
  const breakdown: FinalBreakdown[] = s.players.map(() => ({
    robbers: 0,
    roads: 0,
    cities: 0,
    monasteries: 0,
    gardens: 0,
    fields: 0,
    goods: 0,
    gold: 0,
  }));
  const add = (player: number, key: keyof FinalBreakdown, points: number) => {
    if (points <= 0) return;
    s.players[player].score += points;
    breakdown[player][key] += points;
  };
  for (const pl of s.players) {
    if (pl.robber === null) continue;
    add(pl.index, 'robbers', 3);
    pl.robber = null;
  }
  if (on(c, 'COURIERS')) {
    for (const pl of s.players) {
      pl.score += pl.messengerScore;
      pl.messengerScore = 0;
    }
  }
  const leftover = Object.values(s.gold).reduce((a, b) => a + b, 0);
  if (leftover) log(c, 'GOLD_DISCARDED', { ingots: leftover });
  s.gold = {};

  const keyOf: Partial<Record<FeatureKind, keyof FinalBreakdown>> = {
    ROAD: 'roads',
    CITY: 'cities',
    MONASTERY: 'monasteries',
    GARDEN: 'gardens',
  };
  for (const comp of analysis(c).components) {
    if (comp.kind === 'RIVER') continue;
    const followers = followersIn(c, comp.id);
    if (!followers.length) continue;
    const owners = majorityOwners(followers);
    if (comp.kind === 'FIELD') {
      for (const o of owners) add(o, 'fields', fieldScoreFor(c, comp, o));
      continue;
    }
    const points = featureValue(comp, magicIn(c, comp));
    for (const o of owners) add(o, keyOf[comp.kind]!, points);
    log(c, 'FINAL_FEATURE', { kind: comp.kind, tiles: comp.tiles.length, points, owners });
  }
  if (on(c, 'MARKETS')) {
    goodsPoints(s.players.map((p) => p.goods)).forEach((v, i) => add(i, 'goods', v));
  }
  if (on(c, 'SILVER')) for (const pl of s.players) add(pl.index, 'gold', goldPoints(pl.gold));

  const scores = s.players.map((p) => p.score);
  const best = Math.max(...scores);
  const winners = scores.flatMap((v, i) => (v === best ? [i] : []));
  s.final = { scores, breakdown, winners };
  s.finished = true;
  s.pending = null;
  log(c, 'GAME_OVER', { scores, winners });
}
