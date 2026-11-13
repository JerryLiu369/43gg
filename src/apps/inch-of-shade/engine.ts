import {
  FIXTURES,
  FIXTURE_CHARS,
  LAST_PHASE,
  MOVABLES,
  MOVABLE_CHARS,
  PHASES,
  shadowLength,
} from './content.ts';
import type {
  ActionResult,
  Dir,
  FixtureKind,
  LevelDef,
  MovableKind,
  ParsedLevel,
  PhaseIndex,
  PuzzleAction,
  PuzzleState,
  SolveResult,
  TileKind,
} from './types.ts';

export const DIRS: ReadonlyArray<Dir> = ['up', 'right', 'down', 'left'];

export const DIR_DELTA: Record<Dir, readonly [number, number]> = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0],
};

const PHASE_COUNT = PHASES.length;

/* ------------------------------------------------------------------ */
/* 关卡解析                                                             */
/* ------------------------------------------------------------------ */

export function parseLevel(def: LevelDef): ParsedLevel {
  const height = def.map.length;
  const width = def.map[0]?.length ?? 0;
  if (width === 0 || height === 0) throw new Error(`关卡 ${def.id} 地图为空`);

  const n = width * height;
  const tiles: TileKind[] = new Array(n).fill('floor');
  const fixtures: Array<FixtureKind | null> = new Array(n).fill(null);
  const movableKinds: MovableKind[] = [];
  const initialMovables: number[] = [];
  let catStart = -1;
  let goal = -1;

  for (let y = 0; y < height; y++) {
    const row = def.map[y];
    if (row.length !== width) throw new Error(`关卡 ${def.id} 第 ${y + 1} 行宽度不一致`);
    for (let x = 0; x < width; x++) {
      const ch = row[x];
      const idx = y * width + x;
      if (ch === '.') continue;
      if (ch === '=') {
        tiles[idx] = 'eave';
      } else if (ch === '~') {
        tiles[idx] = 'water';
      } else if (ch in FIXTURE_CHARS) {
        tiles[idx] = 'fixture';
        fixtures[idx] = FIXTURE_CHARS[ch];
      } else if (ch in MOVABLE_CHARS) {
        movableKinds.push(MOVABLE_CHARS[ch]);
        initialMovables.push(idx);
      } else if (ch === 'C' || ch === 'c') {
        if (catStart >= 0) throw new Error(`关卡 ${def.id} 有多只猫`);
        catStart = idx;
        if (ch === 'c') tiles[idx] = 'eave';
      } else if (ch === 'F') {
        if (goal >= 0) throw new Error(`关卡 ${def.id} 有多个终点`);
        goal = idx;
      } else {
        throw new Error(`关卡 ${def.id} 出现未知字符「${ch}」`);
      }
    }
  }
  if (catStart < 0) throw new Error(`关卡 ${def.id} 缺少猫`);
  if (goal < 0) throw new Error(`关卡 ${def.id} 缺少鱼干架`);

  const cloudShade: Uint8Array[] = [];
  const staticShade: Uint8Array[] = [];
  for (let p = 0; p < PHASE_COUNT; p++) {
    const phase = p as PhaseIndex;
    const clouds = new Uint8Array(n);
    for (const cloud of def.clouds ?? []) {
      const ox = cloud.origin[0] + cloud.drift[0] * p;
      const oy = cloud.origin[1] + cloud.drift[1] * p;
      for (const [dx, dy] of cloud.cells) {
        const cx = ox + dx;
        const cy = oy + dy;
        if (cx >= 0 && cy >= 0 && cx < width && cy < height) clouds[cy * width + cx] = 1;
      }
    }
    const shade = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (tiles[i] === 'eave' || clouds[i]) shade[i] = 1;
    }
    for (let i = 0; i < n; i++) {
      const kind = fixtures[i];
      if (kind) castShadow(shade, width, height, i, FIXTURES[kind].height, phase);
    }
    cloudShade.push(clouds);
    staticShade.push(shade);
  }

  return {
    def,
    width,
    height,
    tiles,
    fixtures,
    movableKinds,
    initialMovables,
    catStart,
    goal,
    startPhase: def.startPhase ?? 0,
    staticShade,
    cloudShade,
  };
}

function castShadow(
  shade: Uint8Array,
  width: number,
  height: number,
  from: number,
  objectHeight: number,
  phase: PhaseIndex,
): void {
  const len = shadowLength(phase, objectHeight);
  const [dx, dy] = PHASES[phase].shadowDir;
  let x = from % width;
  let y = Math.floor(from / width);
  for (let k = 0; k < len; k++) {
    x += dx;
    y += dy;
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    shade[y * width + x] = 1;
  }
}

/* ------------------------------------------------------------------ */
/* 状态与阴影                                                           */
/* ------------------------------------------------------------------ */

export function createInitialState(level: ParsedLevel, paws: number): PuzzleState {
  return {
    cat: level.catStart,
    phase: level.startPhase,
    movables: [...level.initialMovables],
    paws,
    pawsUsed: 0,
    steps: 0,
    waits: 0,
    facing: 'down',
    won: false,
  };
}

/** 指定时辰下整张棋盘的阴影（1 为阴凉） */
export function computeShade(
  level: ParsedLevel,
  phase: PhaseIndex,
  movables: ReadonlyArray<number>,
): Uint8Array {
  const shade = level.staticShade[phase].slice();
  for (let i = 0; i < movables.length; i++) {
    castShadow(
      shade,
      level.width,
      level.height,
      movables[i],
      MOVABLES[level.movableKinds[i]].height,
      phase,
    );
  }
  return shade;
}

export function neighbor(level: ParsedLevel, idx: number, dir: Dir): number {
  const [dx, dy] = DIR_DELTA[dir];
  const x = (idx % level.width) + dx;
  const y = Math.floor(idx / level.width) + dy;
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return -1;
  return y * level.width + x;
}

function isOpenTile(level: ParsedLevel, idx: number): boolean {
  const tile = level.tiles[idx];
  return tile === 'floor' || tile === 'eave';
}

/* ------------------------------------------------------------------ */
/* 动作                                                                 */
/* ------------------------------------------------------------------ */

export function applyMove(level: ParsedLevel, state: PuzzleState, dir: Dir): ActionResult {
  if (state.won) return { ok: false, reason: 'won', at: null };
  const target = neighbor(level, state.cat, dir);
  if (target < 0) return { ok: false, reason: 'edge', at: null };
  const tile = level.tiles[target];
  if (tile === 'water') return { ok: false, reason: 'water', at: target };
  if (tile === 'fixture') return { ok: false, reason: 'fixture', at: target };

  let movables = state.movables;
  let pushed: number | null = null;
  const blockerIndex = state.movables.indexOf(target);
  if (blockerIndex >= 0) {
    const dest = neighbor(level, target, dir);
    if (
      dest < 0 ||
      !isOpenTile(level, dest) ||
      dest === level.goal ||
      state.movables.includes(dest)
    ) {
      return { ok: false, reason: 'push-blocked', at: target };
    }
    movables = [...state.movables];
    movables[blockerIndex] = dest;
    pushed = blockerIndex;
  }

  let paws = state.paws;
  let usedPaw = false;
  if (target !== level.goal) {
    const shade = computeShade(level, state.phase, movables);
    if (!shade[target]) {
      if (paws <= 0) return { ok: false, reason: 'hot', at: target };
      paws -= 1;
      usedPaw = true;
    }
  }

  return {
    ok: true,
    pushed,
    usedPaw,
    state: {
      ...state,
      cat: target,
      movables,
      paws,
      pawsUsed: state.pawsUsed + (usedPaw ? 1 : 0),
      steps: state.steps + 1,
      facing: dir,
      won: target === level.goal,
    },
  };
}

export function applyWait(level: ParsedLevel, state: PuzzleState): ActionResult {
  if (state.won) return { ok: false, reason: 'won', at: null };
  if (state.phase >= LAST_PHASE) return { ok: false, reason: 'sunset', at: null };
  const nextPhase = (state.phase + 1) as PhaseIndex;
  const shade = computeShade(level, nextPhase, state.movables);
  let paws = state.paws;
  let usedPaw = false;
  if (!shade[state.cat]) {
    if (paws <= 0) return { ok: false, reason: 'hot', at: state.cat };
    paws -= 1;
    usedPaw = true;
  }
  return {
    ok: true,
    pushed: null,
    usedPaw,
    state: {
      ...state,
      phase: nextPhase,
      paws,
      pawsUsed: state.pawsUsed + (usedPaw ? 1 : 0),
      waits: state.waits + 1,
    },
  };
}

export function applyAction(
  level: ParsedLevel,
  state: PuzzleState,
  action: PuzzleAction,
): ActionResult {
  return action.type === 'wait' ? applyWait(level, state) : applyMove(level, state, action.dir);
}

/* ------------------------------------------------------------------ */
/* 寻路：只走阴凉、不推东西                                             */
/* ------------------------------------------------------------------ */

export interface WalkMap {
  /** 每格到达所需步数，-1 为不可达 */
  dist: Int16Array;
  /** 回溯用：到达该格的上一格 */
  prev: Int16Array;
}

export function computeWalkMap(level: ParsedLevel, state: PuzzleState): WalkMap {
  const n = level.width * level.height;
  const dist = new Int16Array(n).fill(-1);
  const prev = new Int16Array(n).fill(-1);
  const shade = computeShade(level, state.phase, state.movables);
  const queue: number[] = [state.cat];
  dist[state.cat] = 0;
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    if (cur === level.goal) continue;
    for (const dir of DIRS) {
      const nb = neighbor(level, cur, dir);
      if (nb < 0 || dist[nb] >= 0) continue;
      if (!isOpenTile(level, nb) || state.movables.includes(nb)) continue;
      if (nb !== level.goal && !shade[nb]) continue;
      dist[nb] = dist[cur] + 1;
      prev[nb] = cur;
      queue.push(nb);
    }
  }
  return { dist, prev };
}

/** 从猫的位置走到 target 的方向序列；不可达返回 null */
export function walkPath(level: ParsedLevel, walk: WalkMap, from: number, target: number): Dir[] | null {
  if (walk.dist[target] < 0) return null;
  const cells: number[] = [];
  let cur = target;
  while (cur !== from) {
    cells.push(cur);
    cur = walk.prev[cur];
    if (cur < 0) return null;
  }
  cells.reverse();
  const dirs: Dir[] = [];
  let at = from;
  for (const cell of cells) {
    const dir = DIRS.find((d) => neighbor(level, at, d) === cell);
    if (!dir) return null;
    dirs.push(dir);
    at = cell;
  }
  return dirs;
}

/* ------------------------------------------------------------------ */
/* 求解器：0-1 BFS，移动计 1 步、等日头计 0 步                          */
/* ------------------------------------------------------------------ */

export interface SolveOptions {
  maxNodes?: number;
  /** 视为固定不动的可推摆件（用于测试「必须推」） */
  frozenMovables?: boolean;
}

function canonicalMovableCode(level: ParsedLevel, movables: ReadonlyArray<number>, n: number): number {
  // 同类摆件可互换：按种类分组后排序，保证同一局面只有一个编码
  let code = 0;
  let mul = 1;
  const kinds: MovableKind[] = ['pot', 'vat'];
  for (const kind of kinds) {
    const positions: number[] = [];
    for (let i = 0; i < movables.length; i++) {
      if (level.movableKinds[i] === kind) positions.push(movables[i]);
    }
    positions.sort((a, b) => a - b);
    for (const p of positions) {
      code += p * mul;
      mul *= n;
    }
  }
  return code;
}

function stateKey(level: ParsedLevel, s: PuzzleState, n: number): number {
  const movCode = canonicalMovableCode(level, s.movables, n);
  return s.cat + n * (s.phase + PHASE_COUNT * (s.paws + 4 * movCode));
}

interface SearchNode {
  state: PuzzleState;
  parent: number;
  action: PuzzleAction | null;
}

export function solve(
  level: ParsedLevel,
  start: PuzzleState,
  options: SolveOptions = {},
): SolveResult {
  const maxNodes = options.maxNodes ?? 400_000;
  const n = level.width * level.height;
  const nodes: SearchNode[] = [];
  const best = new Map<number, number>();
  const settled = new Set<number>();

  // 双端队列：数组 + 头指针，0 代价边插到头部
  const front: number[] = [];
  const back: number[] = [];
  let backHead = 0;

  const startKey = stateKey(level, start, n);
  nodes.push({ state: { ...start, movables: [...start.movables] }, parent: -1, action: null });
  best.set(startKey, start.steps);
  back.push(0);

  let explored = 0;
  let truncated = false;

  const pushNode = (state: PuzzleState, parent: number, action: PuzzleAction, zeroCost: boolean) => {
    const key = stateKey(level, state, n);
    const prevBest = best.get(key);
    if (prevBest !== undefined && prevBest <= state.steps) return;
    best.set(key, state.steps);
    nodes.push({ state, parent, action });
    if (zeroCost) front.push(nodes.length - 1);
    else back.push(nodes.length - 1);
  };

  while (front.length > 0 || backHead < back.length) {
    const nodeIndex = front.length > 0 ? (front.pop() as number) : back[backHead++];
    const node = nodes[nodeIndex];
    const key = stateKey(level, node.state, n);
    if (settled.has(key)) continue;
    if ((best.get(key) ?? Infinity) < node.state.steps) continue;
    settled.add(key);
    explored++;

    if (node.state.won) {
      const actions: PuzzleAction[] = [];
      let cur = nodeIndex;
      while (nodes[cur].parent >= 0) {
        actions.push(nodes[cur].action as PuzzleAction);
        cur = nodes[cur].parent;
      }
      actions.reverse();
      return {
        solvable: true,
        steps: node.state.steps - start.steps,
        actions,
        explored,
        truncated: false,
      };
    }

    if (explored >= maxNodes) {
      truncated = true;
      break;
    }

    const wait = applyWait(level, node.state);
    if (wait.ok) pushNode(wait.state, nodeIndex, { type: 'wait' }, true);

    for (const dir of DIRS) {
      const res = applyMove(level, node.state, dir);
      if (!res.ok) continue;
      if (options.frozenMovables && res.pushed !== null) continue;
      pushNode(res.state, nodeIndex, { type: 'move', dir }, false);
    }
  }

  return { solvable: false, steps: -1, actions: [], explored, truncated };
}

/* ------------------------------------------------------------------ */
/* 辅助                                                                 */
/* ------------------------------------------------------------------ */

/** 当前与下一时辰都在阴影里的格子：在这里等日头是安全的 */
export function safeWaitCells(level: ParsedLevel, state: PuzzleState): Uint8Array | null {
  if (state.phase >= LAST_PHASE) return null;
  const now = computeShade(level, state.phase, state.movables);
  const next = computeShade(level, (state.phase + 1) as PhaseIndex, state.movables);
  const out = new Uint8Array(now.length);
  for (let i = 0; i < now.length; i++) out[i] = now[i] & next[i];
  return out;
}

/** 把求解得到的动作序列压缩成「下一段提示」：一段连续行走（含推动）或一次等日头 */
export function nextHintSegment(actions: ReadonlyArray<PuzzleAction>): PuzzleAction[] {
  if (actions.length === 0) return [];
  if (actions[0].type === 'wait') return [actions[0]];
  const segment: PuzzleAction[] = [];
  for (const action of actions) {
    if (action.type === 'wait') break;
    segment.push(action);
  }
  return segment;
}

export function cellXY(level: ParsedLevel, idx: number): [number, number] {
  return [idx % level.width, Math.floor(idx / level.width)];
}
