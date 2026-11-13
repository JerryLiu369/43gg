import type {
  DifficultyDef,
  DifficultyTier,
  Emitter,
  Flower,
  LevelDef,
  LightPiece,
  MirrorOrientation,
  Portal,
  PuzzleAction,
  Wall,
} from './types.ts';
import { LIGHT_CYAN, LIGHT_GOLD, LIGHT_ROSE } from './types.ts';

export const DIFFICULTY_DEFS: Record<DifficultyTier, DifficultyDef> = {
  casual: {
    id: 'casual',
    label: '轻松',
    description: '更多步数余量与三次寻光提示，适合慢慢欣赏夜庭。',
    extraMoves: 8,
    hints: 3,
  },
  standard: {
    id: 'standard',
    label: '标准',
    description: '最优解之外保留三步余量与一次提示。',
    extraMoves: 3,
    hints: 1,
  },
  master: {
    id: 'master',
    label: '宗师',
    description: '月光恰够走完最优解，没有提示，撤销仍然可用。',
    extraMoves: 0,
    hints: 0,
  },
};

const emitter = (
  id: string,
  r: number,
  c: number,
  dir: Emitter['dir'],
  color: number,
): Emitter => ({ id, r, c, dir, color });

const flower = (id: string, r: number, c: number, color: number): Flower => ({
  id,
  r,
  c,
  color,
});

const mirror = (
  id: string,
  r: number,
  c: number,
  orientation: MirrorOrientation,
  movable = true,
): LightPiece => ({ id, kind: 'mirror', r, c, orientation, movable, rotatable: true });

const splitter = (id: string, r: number, c: number): LightPiece => ({
  id,
  kind: 'splitter',
  r,
  c,
  orientation: 0,
  movable: false,
  rotatable: false,
});

const wall = (r: number, c: number, variant: Wall['variant'] = 'stone'): Wall => ({
  r,
  c,
  variant,
});

const portal = (id: string, pairId: string, r: number, c: number): Portal => ({
  id,
  pairId,
  r,
  c,
});

const rotate = (pieceId: string): PuzzleAction => ({ kind: 'rotate', pieceId });
const move = (pieceId: string, r: number, c: number): PuzzleAction => ({
  kind: 'move',
  pieceId,
  to: { r, c },
});

const rowsCols = { rows: 6, cols: 6 };

export const LEVELS: LevelDef[] = [
  {
    ...rowsCols,
    id: 'first-light',
    index: 0,
    name: '初照',
    chapter: '月露圃',
    subtitle: '转动银镜，再挪动映月的位置',
    par: 2,
    emitters: [
      emitter('sun-a', 2, 0, 1, LIGHT_GOLD),
      emitter('sun-b', 4, 0, 1, LIGHT_CYAN),
    ],
    flowers: [flower('gold', 0, 2, LIGHT_GOLD), flower('cyan', 5, 3, LIGHT_CYAN)],
    walls: [wall(0, 5, 'bamboo'), wall(5, 5, 'bamboo')],
    portals: [],
    pieces: [mirror('a', 2, 2, 1, false), mirror('b', 4, 2, 1)],
    solution: [rotate('a'), move('b', 4, 3)],
  },
  {
    ...rowsCols,
    id: 'twin-dew',
    index: 1,
    name: '双露',
    chapter: '月露圃',
    subtitle: '晶簇将来光分成两翼',
    par: 2,
    emitters: [emitter('source', 2, 0, 1, LIGHT_GOLD)],
    flowers: [flower('north', 0, 5, LIGHT_GOLD), flower('south', 5, 5, LIGHT_GOLD)],
    walls: [wall(0, 0), wall(5, 0), wall(3, 4, 'bamboo')],
    portals: [],
    pieces: [splitter('prism', 2, 2), mirror('a', 0, 2, 1, false), mirror('b', 5, 2, 0, false)],
    solution: [rotate('a'), rotate('b')],
  },
  {
    ...rowsCols,
    id: 'far-near',
    index: 2,
    name: '远近',
    chapter: '月露圃',
    subtitle: '成月环会把光束送往另一端',
    par: 2,
    emitters: [
      emitter('gold-source', 0, 0, 1, LIGHT_GOLD),
      emitter('cyan-source', 5, 1, 0, LIGHT_CYAN),
    ],
    flowers: [flower('gold', 1, 5, LIGHT_GOLD), flower('cyan', 2, 4, LIGHT_CYAN)],
    walls: [wall(3, 3), wall(4, 0, 'bamboo')],
    portals: [portal('ring-a', 'ring-b', 0, 2), portal('ring-b', 'ring-a', 4, 4)],
    pieces: [mirror('a', 4, 5, 1, false), mirror('b', 2, 1, 1, false)],
    solution: [rotate('a'), rotate('b')],
  },
  {
    ...rowsCols,
    id: 'two-rivers',
    index: 3,
    name: '双流',
    chapter: '镜波榭',
    subtitle: '让两色月光各自找到归处',
    par: 3,
    emitters: [
      emitter('gold-source', 1, 0, 1, LIGHT_GOLD),
      emitter('cyan-source', 0, 5, 2, LIGHT_CYAN),
    ],
    flowers: [flower('gold', 4, 0, LIGHT_GOLD), flower('cyan', 3, 1, LIGHT_CYAN)],
    walls: [wall(0, 2), wall(5, 4, 'bamboo')],
    portals: [],
    pieces: [mirror('a', 1, 2, 0), mirror('b', 3, 5, 1), mirror('c', 4, 2, 1)],
    solution: [rotate('a'), rotate('b'), rotate('c')],
  },
  {
    ...rowsCols,
    id: 'moving-stars',
    index: 4,
    name: '移星',
    chapter: '镜波榭',
    subtitle: '银镜可以在空格间逐格移动',
    par: 4,
    emitters: [
      emitter('gold-source', 2, 0, 1, LIGHT_GOLD),
      emitter('cyan-source', 5, 5, 0, LIGHT_CYAN),
    ],
    flowers: [flower('gold', 0, 3, LIGHT_GOLD), flower('cyan', 4, 2, LIGHT_CYAN)],
    walls: [wall(0, 0), wall(1, 4, 'bamboo'), wall(3, 2)],
    portals: [],
    pieces: [mirror('a', 2, 1, 1), mirror('b', 4, 5, 0)],
    solution: [move('a', 2, 2), move('a', 2, 3), rotate('a'), rotate('b')],
  },
  {
    ...rowsCols,
    id: 'color-chorus',
    index: 5,
    name: '和光',
    chapter: '镜波榭',
    subtitle: '双色同抵一朵花，才会唤醒新的色彩',
    par: 3,
    emitters: [
      emitter('gold-source', 0, 0, 2, LIGHT_GOLD),
      emitter('cyan-source', 5, 5, 0, LIGHT_CYAN),
      emitter('rose-source', 0, 2, 2, LIGHT_ROSE),
    ],
    flowers: [flower('chorus', 2, 4, LIGHT_GOLD | LIGHT_CYAN), flower('rose', 4, 0, LIGHT_ROSE)],
    walls: [wall(0, 5), wall(5, 0, 'bamboo')],
    portals: [],
    pieces: [mirror('a', 2, 0, 0, false), mirror('b', 2, 5, 0, false), mirror('c', 4, 2, 1, false)],
    solution: [rotate('a'), rotate('b'), rotate('c')],
  },
  {
    ...rowsCols,
    id: 'echo-court',
    index: 6,
    name: '回声庭',
    chapter: '天心台',
    subtitle: '分光、跃迁与移位在同一座夜庭相遇',
    par: 3,
    emitters: [
      emitter('gold-source', 0, 0, 1, LIGHT_GOLD),
      emitter('cyan-source', 5, 0, 0, LIGHT_CYAN),
    ],
    flowers: [
      flower('north', 1, 1, LIGHT_GOLD),
      flower('south', 4, 1, LIGHT_GOLD),
      flower('cyan', 2, 4, LIGHT_CYAN),
    ],
    walls: [wall(0, 4, 'bamboo'), wall(5, 5)],
    portals: [portal('ring-a', 'ring-b', 0, 2), portal('ring-b', 'ring-a', 3, 3)],
    pieces: [
      splitter('prism', 3, 5),
      mirror('a', 1, 5, 0, false),
      mirror('b', 4, 5, 1, false),
      mirror('c', 3, 0, 0),
    ],
    solution: [rotate('a'), rotate('b'), move('c', 2, 0)],
  },
  {
    ...rowsCols,
    id: 'three-colors',
    index: 7,
    name: '三晖',
    chapter: '天心台',
    subtitle: '金、青、朱三色合一，开出月白花',
    par: 3,
    emitters: [
      emitter('gold-source', 0, 0, 2, LIGHT_GOLD),
      emitter('cyan-source', 5, 5, 0, LIGHT_CYAN),
      emitter('rose-source', 0, 3, 2, LIGHT_ROSE),
    ],
    flowers: [flower('white', 3, 3, LIGHT_GOLD | LIGHT_CYAN | LIGHT_ROSE)],
    walls: [wall(1, 5), wall(5, 1, 'bamboo')],
    portals: [],
    pieces: [mirror('a', 2, 0, 1), mirror('b', 4, 5, 0)],
    solution: [move('a', 3, 0), move('b', 3, 5), rotate('b')],
  },
  {
    ...rowsCols,
    id: 'full-moon',
    index: 8,
    name: '满月',
    chapter: '天心台',
    subtitle: '让所有光路在同一轮月下收束',
    par: 4,
    emitters: [
      emitter('gold-source', 0, 0, 2, LIGHT_GOLD),
      emitter('cyan-source', 5, 5, 0, LIGHT_CYAN),
      emitter('rose-source', 0, 2, 2, LIGHT_ROSE),
      emitter('twin-source', 4, 0, 1, LIGHT_GOLD),
    ],
    flowers: [
      flower('white', 2, 2, LIGHT_GOLD | LIGHT_CYAN | LIGHT_ROSE),
      flower('north', 3, 0, LIGHT_GOLD),
      flower('south', 5, 0, LIGHT_GOLD),
    ],
    walls: [wall(0, 5), wall(5, 3, 'bamboo')],
    portals: [],
    pieces: [
      mirror('a', 1, 0, 1),
      mirror('b', 2, 5, 0, false),
      splitter('prism', 4, 2),
      mirror('c', 3, 2, 0, false),
      mirror('d', 5, 2, 1, false),
    ],
    solution: [move('a', 2, 0), rotate('b'), rotate('c'), rotate('d')],
  },
];

export const LEVELS_BY_ID = Object.fromEntries(LEVELS.map((level) => [level.id, level])) as Record<
  string,
  LevelDef
>;

export const CHAPTERS = Array.from(new Set(LEVELS.map((level) => level.chapter)));
