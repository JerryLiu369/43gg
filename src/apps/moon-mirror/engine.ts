import { DIFFICULTY_DEFS } from './content.ts';
import type {
  Coord,
  DifficultyTier,
  Direction,
  LevelDef,
  LightPiece,
  LightSimulation,
  PuzzleAction,
  PuzzleState,
} from './types.ts';

export const DIRECTION_DELTAS: ReadonlyArray<Coord> = [
  { r: -1, c: 0 },
  { r: 0, c: 1 },
  { r: 1, c: 0 },
  { r: 0, c: -1 },
];

const MIRROR_TURNS: Record<Direction, Readonly<Record<0 | 1, Direction>>> = {
  0: { 0: 1, 1: 3 },
  1: { 0: 0, 1: 2 },
  2: { 0: 3, 1: 1 },
  3: { 0: 2, 1: 0 },
};

const coordKey = (r: number, c: number): string => `${r},${c}`;
const sameCoord = (a: Coord, b: Coord): boolean => a.r === b.r && a.c === b.c;
const inside = (level: LevelDef, r: number, c: number): boolean =>
  r >= 0 && r < level.rows && c >= 0 && c < level.cols;

export function createPuzzleState(level: LevelDef): PuzzleState {
  return {
    levelId: level.id,
    pieces: level.pieces.map((piece) => ({ ...piece })),
    moves: 0,
    hintsUsed: 0,
    status: 'playing',
  };
}

export function getMoveLimit(level: LevelDef, difficulty: DifficultyTier): number {
  return level.par + DIFFICULTY_DEFS[difficulty].extraMoves;
}

export function getStars(level: LevelDef, moves: number): 1 | 2 | 3 {
  if (moves <= level.par) return 3;
  if (moves <= level.par + 3) return 2;
  return 1;
}

export function simulateLight(level: LevelDef, pieces: LightPiece[]): LightSimulation {
  const pieceByCell = new Map(pieces.map((piece) => [coordKey(piece.r, piece.c), piece]));
  const wallCells = new Set(level.walls.map((wall) => coordKey(wall.r, wall.c)));
  const flowerByCell = new Map(level.flowers.map((flower) => [coordKey(flower.r, flower.c), flower]));
  const portalByCell = new Map(level.portals.map((portal) => [coordKey(portal.r, portal.c), portal]));
  const portalById = new Map(level.portals.map((portal) => [portal.id, portal]));
  const received = new Map(level.flowers.map((flower) => [flower.id, 0]));
  const cellLight: Record<string, number> = {};
  const paths: LightSimulation['paths'] = [];
  const visited = new Set<string>();
  let rayId = 0;
  let steps = 0;

  const addCellLight = (r: number, c: number, color: number) => {
    const key = coordKey(r, c);
    cellLight[key] = (cellLight[key] ?? 0) | color;
  };

  const trace = (start: Coord, initialDir: Direction, color: number) => {
    let current = { ...start };
    let dir = initialDir;
    let points: Coord[] = [{ ...start }];

    const finishPath = () => {
      if (points.length > 1) paths.push({ id: `ray-${rayId++}`, color, points });
    };

    while (steps++ < 512) {
      const visitKey = `${current.r},${current.c},${dir},${color}`;
      if (visited.has(visitKey)) {
        finishPath();
        return;
      }
      visited.add(visitKey);

      const delta = DIRECTION_DELTAS[dir];
      const next = { r: current.r + delta.r, c: current.c + delta.c };
      if (!inside(level, next.r, next.c)) {
        finishPath();
        return;
      }

      points.push({ ...next });
      addCellLight(next.r, next.c, color);
      current = next;

      if (wallCells.has(coordKey(current.r, current.c))) {
        finishPath();
        return;
      }

      const flower = flowerByCell.get(coordKey(current.r, current.c));
      if (flower) {
        received.set(flower.id, (received.get(flower.id) ?? 0) | color);
        finishPath();
        return;
      }

      const portal = portalByCell.get(coordKey(current.r, current.c));
      if (portal) {
        const exit = portalById.get(portal.pairId);
        if (exit) {
          finishPath();
          current = { r: exit.r, c: exit.c };
          points = [{ ...current }];
          addCellLight(current.r, current.c, color);
          continue;
        }
      }

      const piece = pieceByCell.get(coordKey(current.r, current.c));
      if (!piece) continue;

      if (piece.kind === 'mirror') {
        dir = MIRROR_TURNS[dir][piece.orientation];
        continue;
      }

      finishPath();
      trace(current, ((dir + 3) % 4) as Direction, color);
      trace(current, ((dir + 1) % 4) as Direction, color);
      return;
    }
    finishPath();
  };

  for (const emitter of level.emitters) {
    addCellLight(emitter.r, emitter.c, emitter.color);
    trace({ r: emitter.r, c: emitter.c }, emitter.dir, emitter.color);
  }

  return {
    paths,
    flowers: level.flowers.map((flower) => {
      const incoming = received.get(flower.id) ?? 0;
      return {
        id: flower.id,
        received: incoming,
        lit: (incoming & flower.color) === flower.color,
      };
    }),
    cellLight,
  };
}

export function getLegalActions(level: LevelDef, state: PuzzleState): PuzzleAction[] {
  if (state.status !== 'playing') return [];
  const actions: PuzzleAction[] = [];
  const occupied = new Set<string>([
    ...level.walls.map((item) => coordKey(item.r, item.c)),
    ...level.emitters.map((item) => coordKey(item.r, item.c)),
    ...level.flowers.map((item) => coordKey(item.r, item.c)),
    ...level.portals.map((item) => coordKey(item.r, item.c)),
    ...state.pieces.map((item) => coordKey(item.r, item.c)),
  ]);

  for (const piece of state.pieces) {
    if (piece.rotatable) actions.push({ kind: 'rotate', pieceId: piece.id });
    if (!piece.movable) continue;
    for (const delta of DIRECTION_DELTAS) {
      const to = { r: piece.r + delta.r, c: piece.c + delta.c };
      if (inside(level, to.r, to.c) && !occupied.has(coordKey(to.r, to.c))) {
        actions.push({ kind: 'move', pieceId: piece.id, to });
      }
    }
  }
  return actions;
}

export function applyPuzzleAction(
  level: LevelDef,
  state: PuzzleState,
  action: PuzzleAction,
  difficulty: DifficultyTier,
): PuzzleState {
  const legal = getLegalActions(level, state).some((candidate) => {
    if (candidate.kind !== action.kind || candidate.pieceId !== action.pieceId) return false;
    if (action.kind === 'rotate') return true;
    return candidate.to && action.to && sameCoord(candidate.to, action.to);
  });
  if (!legal) return state;

  const pieces = state.pieces.map((piece) => {
    if (piece.id !== action.pieceId) return { ...piece };
    if (action.kind === 'rotate') {
      return { ...piece, orientation: (piece.orientation === 0 ? 1 : 0) as 0 | 1 };
    }
    return { ...piece, r: action.to!.r, c: action.to!.c };
  });
  const moves = state.moves + 1;
  const won = simulateLight(level, pieces).flowers.every((flower) => flower.lit);
  const status = won ? 'won' : moves >= getMoveLimit(level, difficulty) ? 'lost' : 'playing';

  return { ...state, pieces, moves, status };
}

export function replaySolution(level: LevelDef, difficulty: DifficultyTier = 'master'): PuzzleState {
  return level.solution.reduce(
    (state, action) => applyPuzzleAction(level, state, action, difficulty),
    createPuzzleState(level),
  );
}

const stateKey = (state: PuzzleState): string =>
  state.pieces
    .map((piece) => `${piece.id}:${piece.r},${piece.c},${piece.orientation}`)
    .sort()
    .join('|');

export function findSolution(
  level: LevelDef,
  initialState = createPuzzleState(level),
  maxNodes = 60000,
): PuzzleAction[] | null {
  if (simulateLight(level, initialState.pieces).flowers.every((flower) => flower.lit)) return [];
  const queue: Array<{ state: PuzzleState; actions: PuzzleAction[] }> = [
    { state: { ...initialState, status: 'playing' }, actions: [] },
  ];
  const seen = new Set([stateKey(initialState)]);
  let cursor = 0;
  let visitedNodes = 0;

  while (cursor < queue.length && visitedNodes < maxNodes) {
    const current = queue[cursor++];
    visitedNodes++;
    if (current.actions.length >= level.par + 4) continue;

    for (const action of getLegalActions(level, current.state)) {
      const next = applyPuzzleAction(level, current.state, action, 'casual');
      const key = stateKey(next);
      if (seen.has(key)) continue;
      seen.add(key);
      const actions = [...current.actions, action];
      if (next.status === 'won') return actions;
      queue.push({ state: { ...next, status: 'playing' }, actions });
    }
  }
  return null;
}

export function getHint(level: LevelDef, state: PuzzleState): PuzzleAction | null {
  return findSolution(level, state, 20000)?.[0] ?? null;
}
