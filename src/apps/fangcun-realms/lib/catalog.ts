import baseJson from '../data/tiles-core.json' with { type: 'json' };
import expansionsJson from '../data/tiles-modules.json' with { type: 'json' };
import { buildCatalog, type BaseJson, type ExpansionsJson, type TileCatalog } from '../engine/index.ts';

let cached: TileCatalog | null = null;

/**
 * The tile catalog built from the bundled JSON data.
 * Works identically in browser (Vite) and Node 22 (`node --test`).
 */
export function getCatalog(): TileCatalog {
  cached ??= buildCatalog(baseJson as unknown as BaseJson, expansionsJson as unknown as ExpansionsJson);
  return cached;
}
