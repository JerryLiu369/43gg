import {
  type Compass8,
  type EdgeKind,
  type Slot,
  COMPASS8,
  dirFromName,
  SLOT_NAMES,
  slotFromName,
} from './geometry.ts';

export type FeatureKind = 'CITY' | 'ROAD' | 'RIVER' | 'FIELD' | 'MONASTERY' | 'GARDEN';
export type TradeGood = 'WINE' | 'WHEAT' | 'CLOTH';
export type CropCircle = 'RAKE' | 'CLUB' | 'SHIELD';
export type ExpansionId =
  | 'BASE'
  | 'STREAM'
  | 'HERMIT'
  | 'PAVILIONS'
  | 'MARKETS'
  | 'KITES'
  | 'COURIERS'
  | 'CROSSINGS'
  | 'SILVER'
  | 'OMENS'
  | 'BROKERS'
  | 'BANNERS';

/** The 11 optional rule modules (the base tiles are always in play). */
export const ALL_EXPANSIONS: readonly ExpansionId[] = [
  'STREAM',
  'HERMIT',
  'PAVILIONS',
  'MARKETS',
  'KITES',
  'COURIERS',
  'CROSSINGS',
  'SILVER',
  'OMENS',
  'BROKERS',
  'BANNERS',
];

export const TRADE_GOODS: readonly TradeGood[] = ['WINE', 'WHEAT', 'CLOTH'];

export interface FeatureDef {
  index: number;
  kind: FeatureKind;
  /** Boundary slots in base orientation (empty for monasteries, gardens and inner fields). */
  slots: Slot[];
  pennants: number;
  cathedral: boolean;
  inn: boolean;
  goods: TradeGood | null;
  /** For fields: indices of the city features on the same tile that this field borders. */
  adjacentCities: number[];
  /** Road segment that ends at a ferry lake. */
  lakePier: boolean;
}

export interface TileDef {
  id: string;
  expansion: ExpansionId;
  count: number;
  /** N, E, S, W in base orientation. */
  edges: [EdgeKind, EdgeKind, EdgeKind, EdgeKind];
  features: FeatureDef[];
  /** Feature index owning each of the 12 boundary slots (base orientation). */
  slotFeature: number[];
  isStart: boolean;
  riverSource: boolean;
  riverLake: boolean;
  ferryLake: boolean;
  goldmine: boolean;
  magic: boolean;
  robber: boolean;
  cropCircle: CropCircle | null;
  flight: Compass8 | null;
}

export interface TileCatalog {
  tiles: Record<string, TileDef>;
  /** Tile ids with multiplicity, per expansion (draw-pile composition, start tile excluded). */
  composition: Record<ExpansionId, string[]>;
  startTileId: string;
  riverSourceId: string | null;
  riverLakeId: string | null;
}

const EDGE_CODES: Record<string, EdgeKind> = { C: 'CITY', R: 'ROAD', F: 'FIELD', S: 'RIVER' };

/** Module keys used in data/tiles-modules.json. */
const EXPANSION_KEYS: Record<string, ExpansionId> = {
  stream: 'STREAM',
  hermit: 'HERMIT',
  pavilions: 'PAVILIONS',
  markets: 'MARKETS',
  kites: 'KITES',
  couriers: 'COURIERS',
  crossings: 'CROSSINGS',
  silver: 'SILVER',
  omens: 'OMENS',
  brokers: 'BROKERS',
  banners: 'BANNERS',
}

const GOODS: Record<string, TradeGood> = { wine: 'WINE', grain: 'WHEAT', wheat: 'WHEAT', cloth: 'CLOTH' };
const CROPS: Record<string, CropCircle> = { rake: 'RAKE', club: 'CLUB', shield: 'SHIELD' };

export interface TopologyInput {
  edges: [EdgeKind, EdgeKind, EdgeKind, EdgeKind];
  cities: number[][]; // groups of directions
  roads: number[][];
  rivers: number[][];
  /** Dead-end roads (by direction) that run into the tile's city or river instead of stopping in the open. */
  roadEndsAt: Partial<Record<number, 'city' | 'river'>>;
  /** All roads, rivers and cities on the tile touch each other and form a single barrier. */
  mergeBarriers: boolean;
  /** Number of enclosed inner fields (not touching any edge). */
  innerFields: number;
}

export interface DerivedField {
  slots: Slot[];
  /** Indices into `cities`. */
  adjacentCities: number[];
}

function middle(dir: number): Slot {
  return 3 * dir + 1;
}

/**
 * Derives the field areas of a tile from its roads, rivers and cities.
 *
 * Every road, river and city drawn on a tile is a connected "barrier" touching the boundary
 * at its slots. Two field slots belong to the same field iff no single barrier separates
 * them, i.e. they lie on the same boundary arc between the barrier's contact slots.
 * Dead-end roads/rivers only form a barrier when two or more of them meet in the centre
 * (village, monastery, lake, crop circle...) or when a road runs into a city gate.
 * A field borders a city when one of its slots is next to one of the city's slots
 * (enclosed inner fields border every city of the tile).
 *
 * The data files store the resulting fields explicitly; this function is the generator and
 * the consistency check for them. Tiles whose drawing cannot be expressed with these hints
 * are flagged with `"field_layout": "explicit"` in the JSON.
 */
export function deriveFields(input: TopologyInput): DerivedField[] {
  const kindAt: (EdgeKind | 'FIELD')[] = [];
  for (let s = 0; s < 12; s++) {
    const e = input.edges[Math.floor(s / 3)];
    if (e === 'CITY') kindAt.push('CITY');
    else if ((e === 'ROAD' || e === 'RIVER') && s % 3 === 1) kindAt.push(e);
    else kindAt.push('FIELD');
  }

  const cityBarriers: Slot[][] = input.cities.map((g) => g.flatMap((d) => [3 * d, 3 * d + 1, 3 * d + 2]));
  const riverBarriers: Slot[][] = input.rivers.filter((g) => g.length >= 2).map((g) => g.map(middle));
  const other: Slot[][] = input.roads.filter((g) => g.length >= 2).map((g) => g.map(middle));
  const hub: Slot[] = [];
  const deadEnds = [...input.roads, ...input.rivers].filter((g) => g.length === 1).map((g) => g[0]);
  const freeDeadEnds = deadEnds.filter((d) => !input.roadEndsAt[d]);
  for (const d of deadEnds) {
    const target = input.roadEndsAt[d];
    if (target === 'city') {
      if (!cityBarriers.length) throw new Error('road runs into a city, but the tile has no city');
      cityBarriers[0].push(middle(d));
    } else if (target === 'river') {
      if (!riverBarriers.length) throw new Error('road runs into a river, but the tile has no through river');
      riverBarriers[0].push(middle(d));
    } else if (freeDeadEnds.length >= 2) {
      hub.push(middle(d));
    }
  }
  let barriers: Slot[][] = [...cityBarriers, ...riverBarriers, ...other];
  if (hub.length) barriers.push(hub);
  if (input.mergeBarriers) {
    const all = [...barriers.flat(), ...deadEnds.map(middle)];
    barriers = [[...new Set(all)]];
  }

  const fieldSlots = [...Array(12).keys()].filter((s) => kindAt[s] === 'FIELD');
  const arcOf = (contacts: Slot[], s: Slot): number => {
    let n = 0;
    for (const c of contacts) if (c < s) n++;
    // Slots before the first contact and after the last one lie on the same (wrapping) arc.
    return n % contacts.length;
  };
  const signature = (s: Slot) => barriers.map((b) => (b.length ? arcOf(b, s) : 0)).join('|');
  const groups = new Map<string, Slot[]>();
  for (const s of fieldSlots) {
    const sig = signature(s);
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig)!.push(s);
  }
  const cityOfSlot = (s: Slot) => input.cities.findIndex((g) => g.includes(Math.floor(s / 3)));
  const fields: DerivedField[] = [...groups.values()].map((slots) => {
    const adj = new Set<number>();
    for (const s of slots) {
      for (const n of [(s + 11) % 12, (s + 1) % 12]) {
        if (kindAt[n] === 'CITY') adj.add(cityOfSlot(n));
      }
    }
    return { slots, adjacentCities: [...adj].sort((a, b) => a - b) };
  });
  for (let i = 0; i < input.innerFields; i++) {
    fields.push({ slots: [], adjacentCities: input.cities.map((_, ci) => ci) });
  }
  return fields;
}

// ---------------------------------------------------------------------------
// JSON → engine catalog
// ---------------------------------------------------------------------------

export interface JsonTile {
  tile_type: string;
  count: number;
  edges: string[];
  features: Record<string, unknown>;
  internal_connectivity: {
    cities?: string[][];
    roads?: string[][];
    rivers?: string[][];
    /** Field areas as slot names (N0..W2), or ["INNER"] for an enclosed field. */
    fields?: string[][];
    /** Parallel to `fields`: one edge name of every city the field borders. */
    field_cities?: string[][];
  };
}

function dirs(groups: string[][] | undefined): number[][] {
  return (groups ?? []).map((g) => g.map(dirFromName));
}

function parseEdges(raw: JsonTile, id: string): [EdgeKind, EdgeKind, EdgeKind, EdgeKind] {
  if (raw.edges.length !== 4) throw new Error(`${id}: a tile has exactly 4 edges`);
  return raw.edges.map((c) => {
    const k = EDGE_CODES[c];
    if (!k) throw new Error(`${id}: bad edge code ${c}`);
    return k;
  }) as [EdgeKind, EdgeKind, EdgeKind, EdgeKind];
}

/** Topology hints of a JSON tile, as consumed by {@link deriveFields}. */
export function topologyInput(raw: JsonTile, id = raw.tile_type): TopologyInput {
  const f = raw.features;
  const roadEndsAt: Partial<Record<number, 'city' | 'river'>> = {};
  for (const [edge, target] of Object.entries((f.road_ends_at as Record<string, string> | undefined) ?? {})) {
    if (target !== 'city' && target !== 'river') throw new Error(`${id}: bad road_ends_at target ${target}`);
    roadEndsAt[dirFromName(edge)] = target;
  }
  return {
    edges: parseEdges(raw, id),
    cities: dirs(raw.internal_connectivity.cities),
    roads: dirs(raw.internal_connectivity.roads),
    rivers: dirs(raw.internal_connectivity.rivers),
    roadEndsAt,
    mergeBarriers: Boolean(f.merge_barriers),
    innerFields: f.has_inner_field ? 1 : 0,
  };
}

/** Reads the field areas stored in a JSON tile. */
export function jsonFields(raw: JsonTile, id = raw.tile_type): DerivedField[] {
  const cities = dirs(raw.internal_connectivity.cities);
  const groups = raw.internal_connectivity.fields ?? [];
  const adjacency = raw.internal_connectivity.field_cities;
  if (!adjacency || adjacency.length !== groups.length) {
    throw new Error(`${id}: field_cities must list the bordering cities of every field`);
  }
  return groups.map((g, i) => ({
    slots: g.length === 1 && g[0] === 'INNER' ? [] : g.map(slotFromName),
    adjacentCities: [
      ...new Set(
        adjacency[i].map((edge) => {
          const ci = cities.findIndex((c) => c.includes(dirFromName(edge)));
          if (ci < 0) throw new Error(`${id}: field_cities refers to non-city edge ${edge}`);
          return ci;
        }),
      ),
    ].sort((a, b) => a - b),
  }));
}

export function buildTileDef(raw: JsonTile, id: string, expansion: ExpansionId): TileDef {
  const f = raw.features;
  const { edges, cities, roads, rivers } = topologyInput(raw, id);
  const fields = jsonFields(raw, id);

  const features: FeatureDef[] = [];
  const base = (kind: FeatureKind, slots: Slot[]): FeatureDef => ({
    index: features.length,
    kind,
    slots,
    pennants: 0,
    cathedral: false,
    inn: false,
    goods: null,
    adjacentCities: [],
    lakePier: false,
  });

  const groupFor = (key: string): number => {
    const edge = f[key] as string | undefined;
    if (!edge) return 0;
    const d = dirFromName(edge);
    const i = cities.findIndex((g) => g.includes(d));
    if (i < 0) throw new Error(`${id}: ${key} refers to a non-city edge ${edge}`);
    return i;
  };
  const shieldCity = groupFor('shield_city');
  const goodsCity = groupFor('trade_good_city');
  const goods = f.trade_good ? GOODS[String(f.trade_good)] : null;
  if (f.trade_good && !goods) throw new Error(`${id}: unknown trade good ${String(f.trade_good)}`);
  if (f.has_shield && !cities.length) throw new Error(`${id}: coat of arms without a city`);
  if (goods && !cities.length) throw new Error(`${id}: trade good without a city`);

  cities.forEach((g, i) => {
    const feat = base('CITY', g.flatMap((d) => [3 * d, 3 * d + 1, 3 * d + 2]));
    if (f.has_shield && i === shieldCity) feat.pennants = Number(f.shield_count ?? 1);
    if (f.has_cathedral) feat.cathedral = true;
    if (goods && i === goodsCity) feat.goods = goods;
    features.push(feat);
  });
  const innEdges: number[] | null = f.has_inn
    ? (((f.inn_road_edges as string[] | undefined) ?? null)?.map(dirFromName) ?? null)
    : [];
  for (const g of roads) {
    const feat = base('ROAD', g.map(middle));
    if (f.has_inn) feat.inn = innEdges === null || g.some((d) => innEdges.includes(d));
    if (f.has_ferry_lake && g.length === 1) feat.lakePier = true;
    features.push(feat);
  }
  for (const g of rivers) features.push(base('RIVER', g.map(middle)));
  for (const fd of fields) {
    const feat = base('FIELD', fd.slots);
    feat.adjacentCities = [...fd.adjacentCities]; // city features come first, so indices coincide
    features.push(feat);
  }
  if (f.is_monastery) features.push(base('MONASTERY', []));
  if (f.has_garden) features.push(base('GARDEN', []));

  const slotFeature: number[] = Array(12).fill(-1);
  for (const feat of features) {
    for (const s of feat.slots) {
      if (slotFeature[s] !== -1) throw new Error(`${id}: slot ${SLOT_NAMES[s]} belongs to two features`);
      slotFeature[s] = feat.index;
    }
  }
  for (let s = 0; s < 12; s++) {
    const e = edges[Math.floor(s / 3)];
    const owner = slotFeature[s];
    if (owner < 0) throw new Error(`${id}: slot ${SLOT_NAMES[s]} is not assigned to any feature`);
    const kind = features[owner].kind;
    const expected = e === 'CITY' ? 'CITY' : (e === 'ROAD' || e === 'RIVER') && s % 3 === 1 ? e : 'FIELD';
    if (kind !== expected) throw new Error(`${id}: slot ${SLOT_NAMES[s]} should be ${expected}, found ${kind}`);
  }
  for (const g of cities) for (const d of g) if (edges[d] !== 'CITY') throw new Error(`${id}: city on non-city edge`);
  for (const g of roads) for (const d of g) if (edges[d] !== 'ROAD') throw new Error(`${id}: road on non-road edge`);
  for (const g of rivers) for (const d of g) if (edges[d] !== 'RIVER') throw new Error(`${id}: river on non-river edge`);

  const flightRaw = f.flight_direction as string | undefined;
  let flight: Compass8 | null = null;
  if (f.has_flying_machine) {
    if (!flightRaw || !(COMPASS8 as readonly string[]).includes(flightRaw)) {
      throw new Error(`${id}: flying machine needs a compass flight_direction`);
    }
    flight = flightRaw as Compass8;
  }
  const crop = f.crop_circle_type ? CROPS[String(f.crop_circle_type)] : null;
  if (f.crop_circle_type && !crop) throw new Error(`${id}: unknown crop circle ${String(f.crop_circle_type)}`);

  return {
    id,
    expansion,
    count: raw.count,
    edges,
    features,
    slotFeature,
    isStart: Boolean(f.is_start_tile),
    riverSource: Boolean(f.is_river_source),
    riverLake: Boolean(f.is_river_lake),
    ferryLake: Boolean(f.has_ferry_lake),
    goldmine: Boolean(f.has_goldmine),
    magic: Boolean(f.has_magic_symbol),
    robber: Boolean(f.has_robber_symbol),
    cropCircle: crop,
    flight,
  };
}

export interface BaseJson {
  tiles: JsonTile[];
}
export interface ExpansionsJson {
  modules: Record<string, { tiles?: JsonTile[] }>;
}

/**
 * A tile type whose copies differ only by a garden (`garden_count` < `count`) becomes two
 * engine tiles: `<id>` without and `<id>_G` with the garden.
 */
function gardenVariants(raw: JsonTile): { raw: JsonTile; suffix: string; count: number }[] {
  const f = raw.features;
  if (!f.has_garden) return [{ raw, suffix: '', count: raw.count }];
  const gardens = f.garden_count === undefined ? raw.count : Number(f.garden_count);
  if (!Number.isInteger(gardens) || gardens < 0 || gardens > raw.count) {
    throw new Error(`${raw.tile_type}: bad garden_count ${String(f.garden_count)}`);
  }
  const plain = { ...raw, features: { ...f, has_garden: false } };
  if (gardens === raw.count) return [{ raw, suffix: '', count: raw.count }];
  if (gardens === 0) return [{ raw: plain, suffix: '', count: raw.count }];
  return [
    { raw: plain, suffix: '', count: raw.count - gardens },
    { raw, suffix: '_G', count: gardens },
  ];
}

export function buildCatalog(baseJson: BaseJson, expansionsJson: ExpansionsJson): TileCatalog {
  const tiles: Record<string, TileDef> = {};
  const composition = Object.fromEntries(
    (['BASE', ...ALL_EXPANSIONS] as ExpansionId[]).map((e) => [e, [] as string[]]),
  ) as Record<ExpansionId, string[]>;
  let startTileId = '';
  let riverSourceId: string | null = null;
  let riverLakeId: string | null = null;
  const add = (raw: JsonTile, baseId: string, expansion: ExpansionId) => {
    for (const v of gardenVariants(raw)) {
      const id = baseId + v.suffix;
      if (tiles[id]) throw new Error(`Duplicate tile id ${id}`);
      const def = buildTileDef(v.raw, id, expansion);
      def.count = v.count;
      tiles[id] = def;
      let copies = v.count;
      if (def.isStart) {
        if (startTileId) throw new Error('More than one start tile type');
        startTileId = id;
        copies -= Number(raw.features.start_tile_count ?? 1);
      }
      if (def.riverSource) riverSourceId = id;
      if (def.riverLake) riverLakeId = id;
      for (let i = 0; i < copies; i++) composition[expansion].push(id);
    }
  };
  for (const raw of baseJson.tiles) add(raw, raw.tile_type, 'BASE');
  for (const [key, exp] of Object.entries(expansionsJson.modules)) {
    const expansion = EXPANSION_KEYS[key];
    if (!expansion) throw new Error(`Unknown module key ${key}`);
    for (const raw of exp.tiles ?? []) add(raw, raw.tile_type, expansion);
  }
  if (!startTileId) throw new Error('No start tile in base data');
  return { tiles, composition, startTileId, riverSourceId, riverLakeId };
}

export function slotNames(slots: Slot[]): string[] {
  return slots.map((s) => SLOT_NAMES[s]);
}
