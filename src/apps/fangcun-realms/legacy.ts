/**
 * Reading saves written before the 2026-11-13 rename (app id `carcassonne-bigbox`).
 *
 * Rules and tile shapes did not change; only ids did. Module ids and tile ids are rewritten by
 * the rules below, then the match is checked against the current catalog. A save that still does
 * not fit is dropped instead of loaded. See docs/compatibility.md「应用 id 改名与别名」.
 */
import type { ExpansionId, TileCatalog } from './engine/index.ts';
import { getCatalog } from './lib/catalog.ts';
import type { FcLocalMatch } from './lib/types.ts';

/** Save keys of the retired app id, by purpose. */
export const LEGACY_KEYS = {
  meta: '43gg.carcassonne_bigbox.meta.v1',
  activeRun: '43gg.carcassonne_bigbox.active_run.v1',
  tour: '43gg.carcassonne_bigbox.tour.v1',
  audio: '43gg.carcassonne_bigbox.audio.v1',
} as const;

/** Old module ids, as stored in preferences and match config. */
const LEGACY_MODULE_IDS: Readonly<Record<string, ExpansionId>> = {
  RIVER: 'STREAM',
  ABBOT: 'HERMIT',
  INNS_AND_CATHEDRALS: 'PAVILIONS',
  TRADERS_AND_BUILDERS: 'MARKETS',
  FLYING_MACHINES: 'KITES',
  MESSENGERS: 'COURIERS',
  FERRIES: 'CROSSINGS',
  GOLDMINES: 'SILVER',
  MAGE_AND_WITCH: 'OMENS',
  ROBBERS: 'BROKERS',
  CROP_CIRCLES: 'BANNERS',
};

/** Old tile-id prefixes; the suffix letter A, B, C… became 01, 02, 03… */
const LEGACY_TILE_PREFIX: Readonly<Record<string, string>> = {
  BASE: 'BASE',
  RIV: 'STR',
  IC: 'PAV',
  TB: 'MKT',
  FLI: 'KITE',
  FER: 'CRS',
  GLD: 'SLV',
  MAG: 'OMN',
  ROB: 'BRK',
  CRP: 'BNR',
};

const LEGACY_TILE = /^([A-Z]+)_([A-Z]|\d{2})(_G)?$/;

export function migrateModuleId(id: string): ExpansionId | null {
  return LEGACY_MODULE_IDS[id] ?? null;
}

/** Returns the current id for an old tile id, or the input unchanged when it is not one. */
export function migrateTileId(id: string): string {
  const m = LEGACY_TILE.exec(id);
  if (!m || !LEGACY_TILE_PREFIX[m[1]]) return id;
  const suffix = /^[A-Z]$/.test(m[2]) ? String(m[2].charCodeAt(0) - 64).padStart(2, '0') : m[2];
  return `${LEGACY_TILE_PREFIX[m[1]]}_${suffix}${m[3] ?? ''}`;
}

/** Maps a stored module list (old or current ids) to current ids, dropping unknown entries. */
export function migrateModuleList(list: unknown, valid: ReadonlySet<string>): ExpansionId[] {
  if (!Array.isArray(list)) return [];
  const out: ExpansionId[] = [];
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const id = valid.has(raw) ? (raw as ExpansionId) : migrateModuleId(raw);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

function rewriteTileIds(value: unknown): unknown {
  if (typeof value === 'string') return migrateTileId(value);
  if (Array.isArray(value)) return value.map(rewriteTileIds);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewriteTileIds(v)]));
  }
  return value;
}

/** True when every tile the match refers to exists in the catalog. */
export function isMatchOnCurrentCatalog(match: FcLocalMatch, cat: TileCatalog = getCatalog()): boolean {
  const s = match.state;
  const known = (id: unknown) => typeof id === 'string' && Boolean(cat.tiles[id]);
  return (
    Array.isArray(s.drawPile) &&
    s.drawPile.every(known) &&
    Array.isArray(s.riverPile) &&
    s.riverPile.every(known) &&
    Object.values(s.board?.tiles ?? {}).every((t) => known(t.tileId)) &&
    (s.turn?.part?.tileId == null || known(s.turn.part.tileId)) &&
    Array.isArray(s.config?.expansions) &&
    s.config.expansions.every((e) => e === 'BASE' || Boolean(cat.composition[e]))
  );
}

/** Converts a match saved by the retired app; returns null when it cannot be carried over. */
export function migrateLegacyMatch(raw: unknown, cat: TileCatalog = getCatalog()): FcLocalMatch | null {
  try {
    const match = raw as FcLocalMatch;
    if (!match?.state?.config || !Array.isArray(match.seats)) return null;
    const valid = new Set<string>(Object.keys(cat.composition));
    const state = rewriteTileIds(match.state) as FcLocalMatch['state'];
    state.config = { ...state.config, expansions: migrateModuleList(match.state.config.expansions, valid) };
    const next: FcLocalMatch = { ...match, state };
    return isMatchOnCurrentCatalog(next, cat) ? next : null;
  } catch {
    return null;
  }
}
