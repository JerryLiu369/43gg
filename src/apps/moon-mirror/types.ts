export type Direction = 0 | 1 | 2 | 3;
export type MirrorOrientation = 0 | 1;
export type DifficultyTier = 'casual' | 'standard' | 'master';
export type PuzzleStatus = 'playing' | 'won' | 'lost';

export const LIGHT_GOLD = 1;
export const LIGHT_CYAN = 2;
export const LIGHT_ROSE = 4;

export interface Coord {
  r: number;
  c: number;
}

export interface Emitter extends Coord {
  id: string;
  dir: Direction;
  color: number;
}

export interface Flower extends Coord {
  id: string;
  color: number;
}

export interface Wall extends Coord {
  variant?: 'stone' | 'bamboo';
}

export interface Portal extends Coord {
  id: string;
  pairId: string;
}

export interface LightPiece extends Coord {
  id: string;
  kind: 'mirror' | 'splitter';
  orientation: MirrorOrientation;
  movable: boolean;
  rotatable: boolean;
}

export interface PuzzleAction {
  kind: 'rotate' | 'move';
  pieceId: string;
  to?: Coord;
}

export interface LevelDef {
  id: string;
  index: number;
  name: string;
  chapter: string;
  subtitle: string;
  rows: number;
  cols: number;
  par: number;
  emitters: Emitter[];
  flowers: Flower[];
  walls: Wall[];
  portals: Portal[];
  pieces: LightPiece[];
  solution: PuzzleAction[];
}

export interface PuzzleState {
  levelId: string;
  pieces: LightPiece[];
  moves: number;
  hintsUsed: number;
  status: PuzzleStatus;
}

export interface BeamPath {
  id: string;
  color: number;
  points: Coord[];
}

export interface FlowerLight {
  id: string;
  received: number;
  lit: boolean;
}

export interface LightSimulation {
  paths: BeamPath[];
  flowers: FlowerLight[];
  cellLight: Record<string, number>;
}

export interface DifficultyDef {
  id: DifficultyTier;
  label: string;
  description: string;
  extraMoves: number;
  hints: number;
}

export interface LevelRecord {
  bestMoves: number;
  stars: 1 | 2 | 3;
  completed: Partial<Record<DifficultyTier, boolean>>;
}

export interface MoonMirrorSave {
  version: 1;
  unlockedLevel: number;
  records: Record<string, LevelRecord>;
  muted: boolean;
  tutorialCompleted: boolean;
  preferredDifficulty: DifficultyTier;
}
