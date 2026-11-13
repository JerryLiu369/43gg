import type { Rotation, TileDef } from '../engine/index.ts';

/** Tile art geometry in a 100×100 box, base orientation (north up); y grows downwards (SVG). */
export interface Point {
  x: number;
  y: number;
}

export interface TileShape {
  cities: { feature: number; path: string }[];
  roads: { feature: number; path: string }[];
  rivers: { feature: number; path: string }[];
  /** Where a figure stands on each feature (base orientation). */
  anchors: Point[];
  /** Something drawn at the centre that roads lead into. */
  hub: 'MONASTERY' | 'VILLAGE' | 'LAKE' | 'SPRING' | null;
}

const C: Point = { x: 50, y: 50 };
const MID: Point[] = [
  { x: 50, y: 0 },
  { x: 100, y: 50 },
  { x: 50, y: 100 },
  { x: 0, y: 50 },
];
/** Clockwise start and end corner of every edge. */
const EDGE_START: Point[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];
const EDGE_END: Point[] = [EDGE_START[1], EDGE_START[2], EDGE_START[3], EDGE_START[0]];

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const avg = (ps: Point[]): Point => ({
  x: ps.reduce((s, p) => s + p.x, 0) / ps.length,
  y: ps.reduce((s, p) => s + p.y, 0) / ps.length,
});
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const fmt = (p: Point) => `${+p.x.toFixed(2)},${+p.y.toFixed(2)}`;

/** Boundary point of a slot (12-slot model, clockwise). */
export function slotPoint(slot: number): Point {
  const d = Math.floor(slot / 3);
  const t = ((2 * (slot % 3) + 1) / 6) * 100;
  switch (d) {
    case 0:
      return { x: t, y: 0 };
    case 1:
      return { x: 100, y: t };
    case 2:
      return { x: 100 - t, y: 100 };
    default:
      return { x: 0, y: 100 - t };
  }
}

/** Rotates a base-orientation point clockwise around the tile centre. */
export function rotatePoint(p: Point, rotation: Rotation): Point {
  let q = p;
  for (let k = 0; k < rotation / 90; k++) q = { x: 100 - q.y, y: q.x };
  return q;
}

function dirsOf(slots: number[]): number[] {
  return [...new Set(slots.map((s) => Math.floor(s / 3)))].sort((a, b) => a - b);
}

function cityPath(dirs: number[]): string {
  if (dirs.length === 4) return 'M0,0 L100,0 L100,100 L0,100 Z';
  const has = (d: number) => dirs.includes(d);
  const start = dirs.find((d) => !has((d + 3) % 4))!;
  let path = `M${fmt(EDGE_START[start])}`;
  let d = start;
  let visited = 0;
  while (visited < 4) {
    if (has(d)) {
      path += ` L${fmt(EDGE_END[d])}`;
      d = (d + 1) % 4;
      visited++;
      continue;
    }
    // Skip the field edges up to the next city edge and close the gap with a curve.
    const gap: number[] = [];
    while (!has(d)) {
      gap.push(d);
      d = (d + 1) % 4;
      visited++;
    }
    const from = EDGE_END[(gap[0] + 3) % 4];
    const to = EDGE_START[d];
    const chord = lerp(from, to, 0.5);
    let m = lerp(chord, C, dirs.length === 1 ? 0.55 : 0.45);
    if (dist(chord, C) < 1) m = lerp(C, avg(gap.map((g) => MID[g])), 0.25);
    const ctrl = { x: 2 * m.x - chord.x, y: 2 * m.y - chord.y };
    path += ` Q${fmt(ctrl)} ${fmt(to)}`;
  }
  return `${path} Z`;
}

function linePath(dirs: number[]): string {
  if (dirs.length === 2) return `M${fmt(MID[dirs[0]])} Q50,50 ${fmt(MID[dirs[1]])}`;
  return dirs.map((d) => `M${fmt(MID[d])} L50,50`).join(' ');
}

function lineAnchor(dirs: number[]): Point {
  if (dirs.length === 2) {
    const [a, b] = [MID[dirs[0]], MID[dirs[1]]];
    return { x: (a.x + 2 * C.x + b.x) / 4, y: (a.y + 2 * C.y + b.y) / 4 };
  }
  if (dirs.length === 1) return lerp(MID[dirs[0]], C, 0.4);
  return lerp(C, MID[dirs[0]], 0.2);
}

const cache = new Map<string, TileShape>();

export function tileShape(def: TileDef): TileShape {
  const hit = cache.get(def.id);
  if (hit) return hit;
  const shape: TileShape = { cities: [], roads: [], rivers: [], anchors: [], hub: null };
  const anchors: (Point | null)[] = def.features.map(() => null);
  const kinds = new Set(def.features.map((f) => f.kind));
  const deadEnds = def.features.filter((f) => (f.kind === 'ROAD' || f.kind === 'RIVER') && dirsOf(f.slots).length === 1);
  if (kinds.has('MONASTERY')) shape.hub = 'MONASTERY';
  else if (def.riverLake || def.ferryLake) shape.hub = 'LAKE';
  else if (def.riverSource) shape.hub = 'SPRING';
  else if (deadEnds.length >= 3 || (deadEnds.length >= 1 && !def.cropCircle)) shape.hub = 'VILLAGE';

  for (const f of def.features) {
    const dirs = dirsOf(f.slots);
    if (f.kind === 'CITY') {
      shape.cities.push({ feature: f.index, path: cityPath(dirs) });
      anchors[f.index] =
        dirs.length === 4 ? { x: 50, y: 36 } : dirs.length === 1 ? lerp(MID[dirs[0]], C, 0.3) : lerp(avg(dirs.map((d) => MID[d])), C, 0.3);
    } else if (f.kind === 'ROAD' || f.kind === 'RIVER') {
      (f.kind === 'ROAD' ? shape.roads : shape.rivers).push({ feature: f.index, path: linePath(dirs) });
      anchors[f.index] = lineAnchor(dirs);
    } else if (f.kind === 'MONASTERY') {
      anchors[f.index] = { x: 50, y: 54 };
    } else if (f.kind === 'GARDEN') {
      anchors[f.index] = kinds.has('MONASTERY') ? { x: 78, y: 78 } : { x: 50, y: 54 };
    }
  }
  // Fields: the boundary point of the field that is farthest from every other figure spot.
  for (const f of def.features) {
    if (f.kind !== 'FIELD') continue;
    const taken = anchors.filter((a): a is Point => a !== null);
    const candidates = f.slots.length
      ? f.slots.map((s) => lerp(slotPoint(s), C, 0.24))
      : [
          { x: 50, y: 62 },
          { x: 40, y: 50 },
          { x: 60, y: 50 },
        ];
    let best = candidates[0];
    let bestScore = -Infinity;
    for (const p of candidates) {
      const score = taken.length ? Math.min(...taken.map((t) => dist(t, p))) : 0;
      if (score > bestScore + 0.01) {
        best = p;
        bestScore = score;
      }
    }
    anchors[f.index] = best;
  }
  // Keep spots apart so every figure stays clickable.
  const placed: Point[] = [];
  shape.anchors = anchors.map((a) => {
    let p = a ?? C;
    for (let i = 0; i < 6 && placed.some((q) => dist(q, p) < 11); i++) p = { x: p.x + 9, y: p.y + 7 };
    p = { x: Math.min(92, Math.max(8, p.x)), y: Math.min(92, Math.max(8, p.y)) };
    placed.push(p);
    return p;
  });
  cache.set(def.id, shape);
  return shape;
}
