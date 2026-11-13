export type Direction = 0 | 1 | 2 | 3;
export type Light = 1 | 2 | 3;
export type Difficulty = 'relaxed' | 'standard' | 'expert';
export type Point = { x: number; y: number };
export type TileKind = 'mirror' | 'splitter' | 'tidal' | 'rock' | 'gate';
export interface Tile extends Point {
  id: string;
  kind: TileKind;
  initial: 0 | 1;
}
export interface Source extends Point {
  direction: Direction;
  color: 1 | 2;
}
export interface Beacon extends Point {
  id: string;
  color: Light;
}
export interface Level {
  id: string;
  name: string;
  chapter: string;
  description: string;
  size: number;
  tiles: Tile[];
  sources: Source[];
  beacons: Beacon[];
  initialTide: 0 | 1;
}
export interface Position {
  turns: Record<string, number>;
  tide: 0 | 1;
}
export interface Run extends Position {
  moves: number;
  hints: number;
  history: Position[];
  won: boolean;
}
export type Action = { type: 'rotate'; id: string } | { type: 'tide' };
export interface Segment {
  from: Point;
  to: Point;
  color: 1 | 2;
}
export interface Trace {
  segments: Segment[];
  received: Record<string, number>;
  lit: string[];
  solved: boolean;
  loop: boolean;
}
export interface Solution {
  actions: Action[];
  position: Position;
}
export interface RecordEntry {
  stars: number;
  moves: number;
  difficulty: Difficulty;
}
export interface Progress {
  version: 1;
  tutorialCompleted: boolean;
  preferredDifficulty: Difficulty;
  muted: boolean;
  records: Record<string, RecordEntry>;
  active: { levelId: string; run: Run } | null;
}
