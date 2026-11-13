export type Direction = 0 | 1 | 2 | 3; // 0 N, 1 E, 2 S, 3 W
export type Rotation = 0 | 90 | 180 | 270;
export type EdgeKind = 'CITY' | 'ROAD' | 'FIELD' | 'RIVER';

export const DIRECTIONS: readonly Direction[] = [0, 1, 2, 3];
export const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];
export const DIR_NAMES = ['N', 'E', 'S', 'W'] as const;

/** +X is east, +Y is north. */
export const DIR_OFFSETS: Record<Direction, { dx: number; dy: number }> = {
  0: { dx: 0, dy: 1 },
  1: { dx: 1, dy: 0 },
  2: { dx: 0, dy: -1 },
  3: { dx: -1, dy: 0 },
};

/** Eight compass directions used by flying machines, clockwise from north. */
export type Compass8 = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
export const COMPASS8: readonly Compass8[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const COMPASS8_OFFSETS: Record<Compass8, { dx: number; dy: number }> = {
  N: { dx: 0, dy: 1 },
  NE: { dx: 1, dy: 1 },
  E: { dx: 1, dy: 0 },
  SE: { dx: 1, dy: -1 },
  S: { dx: 0, dy: -1 },
  SW: { dx: -1, dy: -1 },
  W: { dx: -1, dy: 0 },
  NW: { dx: -1, dy: 1 },
};

export function rotateCompass8(dir: Compass8, rotation: Rotation): Compass8 {
  const i = COMPASS8.indexOf(dir);
  return COMPASS8[(i + (rotation / 45)) % 8];
}

export function compass8Offset(dir: Compass8): { dx: number; dy: number } {
  return COMPASS8_OFFSETS[dir];
}

export function opposite(d: Direction): Direction {
  return ((d + 2) % 4) as Direction;
}

export function rotationSteps(rotation: Rotation): number {
  return rotation / 90;
}

/** Board direction of a tile's base-orientation edge after a clockwise rotation. */
export function rotateDir(baseDir: Direction, rotation: Rotation): Direction {
  return ((baseDir + rotationSteps(rotation)) % 4) as Direction;
}

/** Base-orientation edge that ends up facing board direction `dir`. */
export function unrotateDir(dir: Direction, rotation: Rotation): Direction {
  return ((dir - rotationSteps(rotation) + 4) % 4) as Direction;
}

export function edgeAt(edges: readonly EdgeKind[], dir: Direction, rotation: Rotation): EdgeKind {
  return edges[unrotateDir(dir, rotation)];
}

/*
 * 12-slot boundary model, clockwise: N0 N1 N2 (west→east), E0 E1 E2 (north→south),
 * S0 S1 S2 (east→west), W0 W1 W2 (south→north). Slot index = 3 * edge + k.
 * Roads and rivers use the middle slot of an edge; a city edge uses all three.
 */
export type Slot = number;

export function slotDir(slot: Slot): Direction {
  return Math.floor(slot / 3) as Direction;
}

export function rotateSlot(slot: Slot, rotation: Rotation): Slot {
  return (slot + 3 * rotationSteps(rotation)) % 12;
}

export function unrotateSlot(slot: Slot, rotation: Rotation): Slot {
  return (slot - 3 * rotationSteps(rotation) + 12) % 12;
}

/** Slot on the neighbouring tile (in board orientation) that touches board slot `slot`. */
export function facingSlot(slot: Slot): Slot {
  const d = slotDir(slot);
  const k = slot % 3;
  return 3 * opposite(d) + (2 - k);
}

export const SLOT_NAMES: readonly string[] = DIR_NAMES.flatMap((d) => [`${d}0`, `${d}1`, `${d}2`]);

export function slotFromName(name: string): Slot {
  const i = SLOT_NAMES.indexOf(name);
  if (i < 0) throw new Error(`Unknown slot name ${name}`);
  return i;
}

export function dirFromName(name: string): Direction {
  const i = (DIR_NAMES as readonly string[]).indexOf(name);
  if (i < 0) throw new Error(`Unknown direction ${name}`);
  return i as Direction;
}

export function coordKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function parseKey(key: string): { x: number; y: number } {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

export function neighbourCoord(x: number, y: number, dir: Direction): { x: number; y: number } {
  const o = DIR_OFFSETS[dir];
  return { x: x + o.dx, y: y + o.dy };
}

/** The 8 tiles around (x, y). */
export function ring8(x: number, y: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx !== 0 || dy !== 0) out.push({ x: x + dx, y: y + dy });
    }
  }
  return out;
}
