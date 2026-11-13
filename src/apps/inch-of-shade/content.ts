import type {
  Difficulty,
  DifficultyDef,
  FixtureKind,
  MovableKind,
  PhaseIndex,
} from './types.ts';

export interface PhaseDef {
  index: PhaseIndex;
  /** 时辰名 */
  name: string;
  /** 对应钟点 */
  clock: string;
  /** 太阳方位 */
  sunSide: string;
  /** 影子朝向（格坐标增量） */
  shadowDir: readonly [number, number];
  /** 影子朝向的中文 */
  shadowSide: string;
  /** 影长 = 高度 + lengthDelta */
  lengthDelta: number;
}

/**
 * 坐北朝南的庭院：太阳从东边升起、经南天、在西边落下。
 * 早晚影子比高度长一格，巳未两时与高度相同，正午向北缩短一格。
 */
export const PHASES: ReadonlyArray<PhaseDef> = [
  { index: 0, name: '辰时', clock: '七点', sunSide: '东', shadowDir: [-1, 0], shadowSide: '西', lengthDelta: 1 },
  { index: 1, name: '巳时', clock: '九点', sunSide: '东南', shadowDir: [-1, 0], shadowSide: '西', lengthDelta: 0 },
  { index: 2, name: '午时', clock: '正午', sunSide: '南', shadowDir: [0, -1], shadowSide: '北', lengthDelta: -1 },
  { index: 3, name: '未时', clock: '一点', sunSide: '西南', shadowDir: [1, 0], shadowSide: '东', lengthDelta: 0 },
  { index: 4, name: '申时', clock: '三点', sunSide: '西', shadowDir: [1, 0], shadowSide: '东', lengthDelta: 1 },
];

export const LAST_PHASE: PhaseIndex = 4;

export function shadowLength(phase: PhaseIndex, height: number): number {
  return Math.max(0, height + PHASES[phase].lengthDelta);
}

export interface FixtureDef {
  kind: FixtureKind;
  name: string;
  height: number;
}

export const FIXTURES: Record<FixtureKind, FixtureDef> = {
  stool: { kind: 'stool', name: '石墩', height: 1 },
  hedge: { kind: 'hedge', name: '花坛', height: 1 },
  lantern: { kind: 'lantern', name: '石灯', height: 2 },
  wall: { kind: 'wall', name: '粉墙', height: 2 },
  rock: { kind: 'rock', name: '假山', height: 2 },
  tree: { kind: 'tree', name: '槐树', height: 3 },
  bamboo: { kind: 'bamboo', name: '竹丛', height: 3 },
};

export const FIXTURE_CHARS: Record<string, FixtureKind> = {
  s: 'stool',
  h: 'hedge',
  l: 'lantern',
  w: 'wall',
  r: 'rock',
  T: 'tree',
  b: 'bamboo',
};

export interface MovableDef {
  kind: MovableKind;
  name: string;
  height: number;
}

export const MOVABLES: Record<MovableKind, MovableDef> = {
  pot: { kind: 'pot', name: '花盆', height: 1 },
  vat: { kind: 'vat', name: '水缸', height: 2 },
};

export const MOVABLE_CHARS: Record<string, MovableKind> = {
  o: 'pot',
  v: 'vat',
};

export const DIFFICULTY_ORDER: ReadonlyArray<Difficulty> = ['casual', 'standard', 'master'];

export const DIFFICULTY_DEFS: Record<Difficulty, DifficultyDef> = {
  casual: {
    id: 'casual',
    label: '轻松',
    tagline: '每关 2 次凉爪 · 提示不限',
    desc: '每关可以踩进阳光 2 次，提示随便用，走进死局会马上提醒。',
    paws: 2,
    hints: -1,
    stepSlack: null,
    instantDeadEndNotice: true,
  },
  standard: {
    id: 'standard',
    label: '标准',
    tagline: '只走阴凉 · 每关 3 次提示',
    desc: '猫只肯走在影子里，每关 3 次提示，走进死局会马上提醒。',
    paws: 0,
    hints: 3,
    stepSlack: null,
    instantDeadEndNotice: true,
  },
  master: {
    id: 'master',
    label: '宗师',
    tagline: '限定步数 · 没有提示',
    desc: '没有提示，步数上限只比最少步数多一点，日落前才会告诉你是否走进了死局。',
    paws: 0,
    hints: 0,
    stepSlack: (par: number) => Math.max(2, Math.ceil(par * 0.2)),
    instantDeadEndNotice: false,
  },
};

export function stepBudget(difficulty: Difficulty, par: number): number | null {
  const slack = DIFFICULTY_DEFS[difficulty].stepSlack;
  return slack ? par + slack(par) : null;
}

export interface ChapterDef {
  index: number;
  name: string;
  /** 本章新登场的机制 */
  lesson: string;
}

export const CHAPTERS: ReadonlyArray<ChapterDef> = [
  { index: 0, name: '檐下', lesson: '影子随时辰转动' },
  { index: 1, name: '花盆', lesson: '推花盆，造影子' },
  { index: 2, name: '流云', lesson: '云影随风飘移' },
  { index: 3, name: '水缸', lesson: '更高的影子' },
];
