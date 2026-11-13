/** 难度档位：轻松 / 标准 / 宗师 */
export type Difficulty = 'casual' | 'standard' | 'master';

/** 一天中可游玩的五个时辰：辰、巳、午、未、申（申时之后日落） */
export type PhaseIndex = 0 | 1 | 2 | 3 | 4;

export type Dir = 'up' | 'down' | 'left' | 'right';

/** 固定不动、会投影的庭院摆件 */
export type FixtureKind = 'stool' | 'hedge' | 'lantern' | 'wall' | 'tree' | 'bamboo' | 'rock';

/** 猫可以推动的摆件 */
export type MovableKind = 'pot' | 'vat';

export type TileKind = 'floor' | 'eave' | 'water' | 'fixture';

export interface CloudDef {
  /** 云影覆盖的格子，相对 origin 的偏移 [dx, dy] */
  cells: ReadonlyArray<readonly [number, number]>;
  /** 第 0 个时辰（辰时）时云影的锚点，可以在棋盘外 */
  origin: readonly [number, number];
  /** 每过一个时辰云影的位移 */
  drift: readonly [number, number];
}

export interface LevelDef {
  id: string;
  /** 所属章节序号（0 起） */
  chapter: number;
  /** 关卡名 */
  name: string;
  /** 进入关卡时给玩家的一句提示 */
  note: string;
  /**
   * 地图字符：
   * `.` 地砖 · `=` 屋檐（常阴可走）· `~` 水池
   * `s` 石墩(1) · `h` 矮花坛(1) · `l` 石灯(2) · `w` 粉墙(2) · `r` 假山(2) · `T` 槐树(3) · `b` 竹丛(3)
   * `o` 花盆(1，可推) · `v` 大水缸(2，可推)
   * `C` 猫（地砖上）· `c` 猫（屋檐下）· `F` 鱼干架（终点）
   */
  map: ReadonlyArray<string>;
  /** 开局时辰，默认辰时 */
  startPhase?: PhaseIndex;
  clouds?: ReadonlyArray<CloudDef>;
  /** 不借助凉爪时的最少步数（由单元测试用求解器校验） */
  par: number;
}

export interface ParsedLevel {
  def: LevelDef;
  width: number;
  height: number;
  /** 每格地形 */
  tiles: TileKind[];
  /** 每格固定摆件（无则为 null） */
  fixtures: Array<FixtureKind | null>;
  movableKinds: MovableKind[];
  initialMovables: number[];
  catStart: number;
  goal: number;
  startPhase: PhaseIndex;
  /** 每个时辰由屋檐、固定摆件与流云构成的静态阴影 */
  staticShade: Uint8Array[];
  /** 每个时辰的云影（用于渲染） */
  cloudShade: Uint8Array[];
}

export interface PuzzleState {
  cat: number;
  phase: PhaseIndex;
  /** 与 ParsedLevel.movableKinds 一一对应的位置 */
  movables: number[];
  /** 剩余凉爪（可踏入阳光的次数） */
  paws: number;
  pawsUsed: number;
  steps: number;
  waits: number;
  facing: Dir;
  won: boolean;
}

export type BlockReason = 'edge' | 'water' | 'fixture' | 'push-blocked' | 'hot' | 'sunset' | 'won';

export type PuzzleAction = { type: 'move'; dir: Dir } | { type: 'wait' };

export type ActionResult =
  | { ok: true; state: PuzzleState; pushed: number | null; usedPaw: boolean }
  | { ok: false; reason: BlockReason; at: number | null };

export interface SolveResult {
  solvable: boolean;
  /** 最少步数（等日头不计步） */
  steps: number;
  actions: PuzzleAction[];
  explored: number;
  /** 搜索因节点上限被截断时为 true，此时 solvable=false 不代表无解 */
  truncated: boolean;
}

export interface DifficultyDef {
  id: Difficulty;
  label: string;
  tagline: string;
  desc: string;
  /** 每关凉爪数 */
  paws: number;
  /** 每关提示次数，-1 表示不限 */
  hints: number;
  /** 步数上限的余量，null 表示不限步数 */
  stepSlack: ((par: number) => number) | null;
  /** 走进死局时是否立刻提醒 */
  instantDeadEndNotice: boolean;
}

export interface LevelRecord {
  solved: boolean;
  bestSteps: number | null;
  /** 不用凉爪且步数不超过最少步数时获得「妙」印 */
  seal: boolean;
}

export interface InchOfShadeMeta {
  version: 1;
  records: Record<string, LevelRecord>;
  lastLevelId: string | null;
  preferredDifficulty: Difficulty;
  tutorialCompleted: boolean;
  muted: boolean;
}
