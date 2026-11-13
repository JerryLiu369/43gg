import {
  type Direction,
  type Rotation,
  DIRECTIONS,
  coordKey,
  edgeAt,
  facingSlot,
  neighbourCoord,
  opposite,
  ring8,
  rotateSlot,
  slotDir,
  unrotateSlot,
} from './geometry.ts';
import type { FeatureKind, TileCatalog, TileDef, TradeGood } from './tiles.ts';

export interface PlacedTile {
  tileId: string;
  x: number;
  y: number;
  rotation: Rotation;
}

/** A feature of one placed tile: tile position plus the feature index of its {@link TileDef}. */
export interface FeatureRef {
  x: number;
  y: number;
  feature: number;
}

/** A wooden ferry on a ferry-lake tile, joining the two pier road features `a` and `b`. */
export interface FerryState {
  x: number;
  y: number;
  a: number;
  b: number;
}

export interface BoardState {
  tiles: Record<string, PlacedTile>;
  ferries: FerryState[];
}

export function nodeKey(x: number, y: number, feature: number): string {
  return `${x},${y}#${feature}`;
}

export function placedDef(cat: TileCatalog, p: PlacedTile): TileDef {
  const def = cat.tiles[p.tileId];
  if (!def) throw new Error(`Unknown tile ${p.tileId}`);
  return def;
}

/** Feature index of a placed tile that owns the given board-orientation slot. */
export function featureAtSlot(cat: TileCatalog, p: PlacedTile, boardSlot: number): number {
  return placedDef(cat, p).slotFeature[unrotateSlot(boardSlot, p.rotation)];
}

/** Board directions of the edges a feature of a placed tile touches. */
export function featureDirections(cat: TileCatalog, p: PlacedTile, feature: number): Direction[] {
  const slots = placedDef(cat, p).features[feature].slots;
  return [...new Set(slots.map((s) => slotDir(rotateSlot(s, p.rotation))))];
}

/** Edge-matching test: the square is empty, touches at least one tile and every touching edge matches. */
export function fitsEdges(
  cat: TileCatalog,
  board: BoardState,
  def: TileDef,
  x: number,
  y: number,
  rotation: Rotation,
): boolean {
  if (board.tiles[coordKey(x, y)]) return false;
  let neighbours = 0;
  for (const d of DIRECTIONS) {
    const n = neighbourCoord(x, y, d);
    const q = board.tiles[coordKey(n.x, n.y)];
    if (!q) continue;
    neighbours++;
    if (edgeAt(def.edges, d, rotation) !== edgeAt(placedDef(cat, q).edges, opposite(d), q.rotation)) return false;
  }
  return neighbours > 0;
}

/** Empty squares orthogonally adjacent to the placed tiles, in a stable order. */
export function frontier(board: BoardState): { x: number; y: number }[] {
  const seen = new Set<string>();
  const out: { x: number; y: number }[] = [];
  for (const p of Object.values(board.tiles)) {
    for (const d of DIRECTIONS) {
      const n = neighbourCoord(p.x, p.y, d);
      const k = coordKey(n.x, n.y);
      if (board.tiles[k] || seen.has(k)) continue;
      seen.add(k);
      out.push(n);
    }
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Number of tiles among the 8 squares around (x, y). */
export function surroundingCount(board: BoardState, x: number, y: number): number {
  return ring8(x, y).filter((c) => board.tiles[coordKey(c.x, c.y)]).length;
}

/** A connected feature on the board (a whole road, city, field, river, or one monastery/garden). */
export interface Component {
  id: number;
  kind: FeatureKind;
  nodes: FeatureRef[];
  /** Distinct tiles (coordinate keys) the feature lies on. */
  tiles: string[];
  /** Boundary slots facing an empty square. */
  openSlots: number;
  /** Roads/cities: no open edge. Monasteries/gardens: all 8 surrounding squares filled. Fields: never. */
  complete: boolean;
  /** Monasteries/gardens: tiles around them (0-8). */
  surrounding: number;
  pennants: number;
  cathedral: boolean;
  inn: boolean;
  goods: TradeGood[];
  /** Fields only: ids of the city components the field borders. */
  adjacentCities: number[];
}

export interface Analysis {
  components: Component[];
  /** nodeKey → component id */
  byNode: Map<string, number>;
}

export function componentOf(an: Analysis, ref: FeatureRef): Component {
  const id = an.byNode.get(nodeKey(ref.x, ref.y, ref.feature));
  if (id === undefined) throw new Error(`No feature at ${nodeKey(ref.x, ref.y, ref.feature)}`);
  return an.components[id];
}

/** Builds the feature graph of the board: tile features joined across edges and by ferries. */
export function analyzeBoard(cat: TileCatalog, board: BoardState): Analysis {
  const refs: FeatureRef[] = [];
  const index = new Map<string, number>();
  const placed = Object.values(board.tiles);
  for (const p of placed) {
    for (const f of placedDef(cat, p).features) {
      index.set(nodeKey(p.x, p.y, f.index), refs.length);
      refs.push({ x: p.x, y: p.y, feature: f.index });
    }
  }
  const parent = refs.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  const node = (x: number, y: number, f: number) => index.get(nodeKey(x, y, f))!;
  const open = new Array<number>(refs.length).fill(0);

  for (const p of placed) {
    for (let slot = 0; slot < 12; slot++) {
      const f = featureAtSlot(cat, p, slot);
      const d = slotDir(slot);
      const n = neighbourCoord(p.x, p.y, d);
      const q = board.tiles[coordKey(n.x, n.y)];
      if (!q) {
        open[node(p.x, p.y, f)]++;
        continue;
      }
      union(node(p.x, p.y, f), node(q.x, q.y, featureAtSlot(cat, q, facingSlot(slot))));
    }
  }
  for (const fr of board.ferries) union(node(fr.x, fr.y, fr.a), node(fr.x, fr.y, fr.b));

  const byRoot = new Map<number, number>();
  const components: Component[] = [];
  const byNode = new Map<string, number>();
  refs.forEach((ref, i) => {
    const root = find(i);
    let id = byRoot.get(root);
    if (id === undefined) {
      id = components.length;
      byRoot.set(root, id);
      const kind = placedDef(cat, board.tiles[coordKey(ref.x, ref.y)]).features[ref.feature].kind;
      components.push({
        id,
        kind,
        nodes: [],
        tiles: [],
        openSlots: 0,
        complete: false,
        surrounding: 0,
        pennants: 0,
        cathedral: false,
        inn: false,
        goods: [],
        adjacentCities: [],
      });
    }
    const comp = components[id];
    const p = board.tiles[coordKey(ref.x, ref.y)];
    const fd = placedDef(cat, p).features[ref.feature];
    comp.nodes.push(ref);
    const tk = coordKey(ref.x, ref.y);
    if (!comp.tiles.includes(tk)) comp.tiles.push(tk);
    comp.openSlots += open[i];
    comp.pennants += fd.pennants;
    comp.cathedral ||= fd.cathedral;
    comp.inn ||= fd.inn;
    if (fd.goods) comp.goods.push(fd.goods);
    byNode.set(nodeKey(ref.x, ref.y, ref.feature), id);
  });

  for (const comp of components) {
    if (comp.kind === 'MONASTERY' || comp.kind === 'GARDEN') {
      comp.surrounding = surroundingCount(board, comp.nodes[0].x, comp.nodes[0].y);
      comp.complete = comp.surrounding === 8;
    } else if (comp.kind === 'ROAD' || comp.kind === 'CITY') {
      comp.complete = comp.openSlots === 0;
    }
    if (comp.kind === 'FIELD') {
      const cities = new Set<number>();
      for (const ref of comp.nodes) {
        const fd = placedDef(cat, board.tiles[coordKey(ref.x, ref.y)]).features[ref.feature];
        for (const ci of fd.adjacentCities) cities.add(byNode.get(nodeKey(ref.x, ref.y, ci))!);
      }
      comp.adjacentCities = [...cities].sort((a, b) => a - b);
    }
  }
  return { components, byNode };
}
