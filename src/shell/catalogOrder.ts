/**
 * Hub display order, decoupled from APP_REGISTRY order.
 *
 * - `shuffle` (default): a per-visitor order that is re-rolled once per local day. Stable within the
 *   day so cards don't jump around when the player returns from a game, but no game keeps the top
 *   slot forever. Each app's position comes from hash(seed, day, id), so adding a new game never
 *   reshuffles the relative order of the others on the same day.
 * - `newest`: by `addedAt` descending; ties broken by later registry position first.
 */

import type { StorageReader, StorageWriter } from './hubProgress.ts';

export type CatalogSortMode = 'shuffle' | 'newest';

export const CATALOG_SORT_STORAGE_KEY = '43gg.hub.sort.v1';
export const SHUFFLE_SEED_STORAGE_KEY = '43gg.hub.shuffle_seed.v1';

interface OrderableApp {
  id: string;
  addedAt: string;
}

/** FNV-1a followed by the murmur3 finalizer, so short similar strings still spread over 32 bits. */
function hash32(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function localDayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dailyShuffle<T extends OrderableApp>(
  apps: ReadonlyArray<T>,
  seed: string,
  dayKey: string,
): T[] {
  return apps
    .map((app) => ({ app, key: hash32(`${seed}|${dayKey}|${app.id}`) }))
    .sort((a, b) => a.key - b.key || (a.app.id < b.app.id ? -1 : 1))
    .map((entry) => entry.app);
}

export function newestFirst<T extends OrderableApp>(apps: ReadonlyArray<T>): T[] {
  return apps
    .map((app, index) => ({ app, index }))
    .sort((a, b) => {
      if (a.app.addedAt !== b.app.addedAt) return a.app.addedAt < b.app.addedAt ? 1 : -1;
      return b.index - a.index;
    })
    .map((entry) => entry.app);
}

export function orderCatalog<T extends OrderableApp>(
  apps: ReadonlyArray<T>,
  mode: CatalogSortMode,
  seed: string,
  dayKey: string,
): T[] {
  return mode === 'newest' ? newestFirst(apps) : dailyShuffle(apps, seed, dayKey);
}

export function readSortMode(storage: StorageReader | null): CatalogSortMode {
  try {
    return storage?.getItem(CATALOG_SORT_STORAGE_KEY) === 'newest' ? 'newest' : 'shuffle';
  } catch {
    return 'shuffle';
  }
}

export function writeSortMode(mode: CatalogSortMode, storage: StorageWriter | null): void {
  try {
    storage?.setItem(CATALOG_SORT_STORAGE_KEY, mode);
  } catch {
    // Storage unavailable: the choice simply lasts for this page view.
  }
}

function randomSeed(): string {
  const bytes = new Uint32Array(2);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    bytes[0] = Math.floor(Math.random() * 0xffffffff);
    bytes[1] = Math.floor(Math.random() * 0xffffffff);
  }
  return `${bytes[0].toString(36)}${bytes[1].toString(36)}`;
}

/**
 * Returns this browser's shuffle seed, creating and storing one on first visit.
 * Without storage (private mode, sandboxed iframe) it falls back to a seed for this page view only.
 */
export function readOrCreateShuffleSeed(storage: StorageWriter | null): string {
  try {
    const existing = storage?.getItem(SHUFFLE_SEED_STORAGE_KEY);
    if (existing && /^[a-z0-9]{4,32}$/.test(existing)) return existing;
  } catch {
    return randomSeed();
  }
  const seed = randomSeed();
  try {
    storage?.setItem(SHUFFLE_SEED_STORAGE_KEY, seed);
  } catch {
    // Ignore quota / sandbox errors.
  }
  return seed;
}
