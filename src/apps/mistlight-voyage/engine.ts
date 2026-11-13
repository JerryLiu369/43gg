import { DIFFICULTY_DEFS } from './content.ts';
import type {
  Action,
  Difficulty,
  Direction,
  Level,
  Position,
  Run,
  Solution,
  Trace,
} from './types.ts';

const DELTAS = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];
export const isRotatable = (tile: Level['tiles'][number]) =>
  tile.kind === 'mirror' || tile.kind === 'splitter';
export const hasTide = (level: Level) =>
  level.tiles.some((tile) => tile.kind === 'gate' || tile.kind === 'tidal');
export const reflect = (direction: Direction, turn: number): Direction =>
  (turn % 2 ? direction ^ 1 : 3 - direction) as Direction;
export function createRun(level: Level): Run {
  return {
    turns: Object.fromEntries(
      level.tiles.filter(isRotatable).map((tile) => [tile.id, tile.initial]),
    ),
    tide: level.initialTide,
    moves: 0,
    hints: 0,
    history: [],
    won: false,
  };
}
export function changePosition(
  level: Level,
  position: Position,
  action: Action,
): Position {
  if (action.type === 'tide')
    return hasTide(level)
      ? { turns: { ...position.turns }, tide: position.tide === 0 ? 1 : 0 }
      : position;
  const tile = level.tiles.find(
    (tile) => tile.id === action.id && isRotatable(tile),
  );
  return tile
    ? {
        turns: {
          ...position.turns,
          [tile.id]: ((position.turns[tile.id] ?? tile.initial) + 1) % 2,
        },
        tide: position.tide,
      }
    : position;
}
export function act(level: Level, run: Run, action: Action): Run {
  if (run.won) return run;
  const next = changePosition(level, run, action);
  if (next === run) return run;
  return {
    ...run,
    ...next,
    moves: run.moves + 1,
    history: [
      ...run.history.slice(-199),
      { turns: { ...run.turns }, tide: run.tide },
    ],
  };
}
export function undo(run: Run): Run {
  if (!run.history.length || run.won) return run;
  return {
    ...run,
    ...run.history[run.history.length - 1],
    moves: Math.max(0, run.moves - 1),
    history: run.history.slice(0, -1),
  };
}

/** 所有分支共享有向状态去重；保留光色，闭环与汇流都能在有限步内结束。 */
export function traceLight(level: Level, position: Position): Trace {
  const received: Record<string, number> = Object.fromEntries(
    level.beacons.map((beacon) => [beacon.id, 0]),
  );
  const segments: Trace['segments'] = [];
  const seen = new Set<string>();
  const tiles = new Map(
    level.tiles.map((tile) => [`${tile.x},${tile.y}`, tile]),
  );
  const beacons = new Map(
    level.beacons.map((beacon) => [`${beacon.x},${beacon.y}`, beacon]),
  );
  const sources = new Set(
    level.sources.map((source) => `${source.x},${source.y}`),
  );
  const queue = level.sources.map((source) => ({ ...source }));
  let loop = false;
  for (let index = 0; index < queue.length; index++) {
    let { x, y, direction, color } = queue[index];
    while (true) {
      const key = `${x},${y},${direction},${color}`;
      if (seen.has(key)) {
        loop = true;
        break;
      }
      seen.add(key);
      const delta = DELTAS[direction];
      const next = { x: x + delta.x, y: y + delta.y };
      if (
        next.x < 0 ||
        next.y < 0 ||
        next.x >= level.size ||
        next.y >= level.size
      ) {
        segments.push({
          from: { x, y },
          to: { x: x + delta.x * 0.55, y: y + delta.y * 0.55 },
          color,
        });
        break;
      }
      segments.push({ from: { x, y }, to: next, color });
      x = next.x;
      y = next.y;
      const cellKey = `${x},${y}`;
      const beacon = beacons.get(cellKey);
      if (beacon) {
        received[beacon.id] |= color;
        break;
      }
      if (sources.has(cellKey)) break;
      const tile = tiles.get(cellKey);
      if (!tile || (tile.kind === 'gate' && position.tide === 1)) continue;
      if (tile.kind === 'rock' || tile.kind === 'gate') break;
      const turn =
        tile.kind === 'tidal'
          ? tile.initial ^ position.tide
          : (position.turns[tile.id] ?? tile.initial);
      if (tile.kind === 'splitter') queue.push({ x, y, direction, color });
      direction = reflect(direction, turn);
    }
  }
  const lit = level.beacons
    .filter((beacon) => (received[beacon.id] & beacon.color) === beacon.color)
    .map((beacon) => beacon.id);
  return {
    segments,
    received,
    lit,
    solved: lit.length === level.beacons.length,
    loop,
  };
}

/** 固定小棋盘穷举全部二值朝向，求当前局面的最近解，不依赖预写答案。 */
export function solve(level: Level, position: Position): Solution | null {
  const mirrors = level.tiles.filter(isRotatable);
  const tidal = hasTide(level);
  let best: Solution | null = null;
  for (let mask = 0; mask < 2 ** (mirrors.length + Number(tidal)); mask++) {
    const candidate: Position = {
      turns: {},
      tide: tidal ? (((mask >> mirrors.length) & 1) as 0 | 1) : position.tide,
    };
    const actions: Action[] = [];
    mirrors.forEach((tile, index) => {
      candidate.turns[tile.id] = (mask >> index) & 1;
      if (
        candidate.turns[tile.id] !== (position.turns[tile.id] ?? tile.initial)
      )
        actions.push({ type: 'rotate', id: tile.id });
    });
    if (candidate.tide !== position.tide) actions.push({ type: 'tide' });
    if (best && actions.length >= best.actions.length) continue;
    if (traceLight(level, candidate).solved)
      best = { actions, position: candidate };
  }
  return best;
}
export function signal(level: Level, run: Run): Run {
  return traceLight(level, run).solved ? { ...run, won: true } : run;
}
export function starRating(
  level: Level,
  run: Run,
  difficulty: Difficulty,
): number {
  if (!run.won) return 0;
  const optimum = solve(level, createRun(level))?.actions.length ?? 0;
  const limit = optimum + DIFFICULTY_DEFS[difficulty].allowance;
  if (run.hints === 0 && run.moves <= limit) return 3;
  return run.moves <= limit + 4 ? 2 : 1;
}
export function coordinate(point: { x: number; y: number }): string {
  return `${String.fromCharCode(65 + point.x)}${point.y + 1}`;
}
