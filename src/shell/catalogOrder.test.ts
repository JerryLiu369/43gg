import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_REGISTRY } from '../apps/registry.ts';
import {
  SHUFFLE_SEED_STORAGE_KEY,
  dailyShuffle,
  localDayKey,
  newestFirst,
  orderCatalog,
  readOrCreateShuffleSeed,
  readSortMode,
  writeSortMode,
} from './catalogOrder.ts';

const ids = (apps: ReadonlyArray<{ id: string }>) => apps.map((app) => app.id);

function makeCatalog(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `game-${i}`,
    addedAt: `2026-11-${String(10 + Math.floor(i / 3)).padStart(2, '0')}`,
  }));
}

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

test('APP_REGISTRY is append-only: every entry has a valid addedAt and new games go at the end', () => {
  for (const app of APP_REGISTRY) {
    assert.match(app.addedAt, /^\d{4}-\d{2}-\d{2}$/, `${app.id} needs addedAt as YYYY-MM-DD`);
    assert.ok(!Number.isNaN(Date.parse(app.addedAt)), `${app.id} addedAt must be a real date`);
  }
  for (let i = 1; i < APP_REGISTRY.length; i++) {
    assert.ok(
      APP_REGISTRY[i - 1].addedAt <= APP_REGISTRY[i].addedAt,
      `Append new games at the end of APP_REGISTRY: ${APP_REGISTRY[i].id} is older than the entry above it`,
    );
  }
});

test('dailyShuffle is a deterministic permutation for a given visitor seed and day', () => {
  const catalog = makeCatalog(12);
  const a = dailyShuffle(catalog, 'seed1', '2026-11-13');
  const b = dailyShuffle(catalog, 'seed1', '2026-11-13');
  assert.deepEqual(ids(a), ids(b));
  assert.deepEqual([...ids(a)].sort(), [...ids(catalog)].sort());
  assert.notDeepEqual(ids(a), ids(catalog), 'should not just echo registry order');
});

test('dailyShuffle changes with the day and with the visitor', () => {
  const catalog = makeCatalog(12);
  const base = ids(dailyShuffle(catalog, 'seed1', '2026-11-13'));
  const days = ['2026-11-14', '2026-11-15', '2026-11-16'].map((day) =>
    ids(dailyShuffle(catalog, 'seed1', day)),
  );
  assert.ok(days.every((order) => order.join() !== base.join()));
  assert.notDeepEqual(ids(dailyShuffle(catalog, 'seed2', '2026-11-13')), base);
});

test('dailyShuffle gives every game a fair shot at the top slot', () => {
  const catalog = makeCatalog(10);
  const firsts = new Map<string, number>();
  const runs = 5000;
  for (let i = 0; i < runs; i++) {
    const top = dailyShuffle(catalog, `v${i}`, '2026-11-13')[0].id;
    firsts.set(top, (firsts.get(top) ?? 0) + 1);
  }
  const expected = runs / catalog.length;
  for (const app of catalog) {
    const count = firsts.get(app.id) ?? 0;
    assert.ok(
      Math.abs(count - expected) < expected * 0.25,
      `${app.id} led ${count} times, expected about ${expected}`,
    );
  }
});

test('adding a game does not reshuffle the others on the same day', () => {
  const catalog = makeCatalog(9);
  const before = ids(dailyShuffle(catalog, 'seed1', '2026-11-13'));
  const after = ids(dailyShuffle([...catalog, { id: 'brand-new', addedAt: '2026-11-20' }], 'seed1', '2026-11-13'));
  assert.deepEqual(after.filter((id) => id !== 'brand-new'), before);
});

test('newestFirst sorts by addedAt descending and later registry entries first on ties', () => {
  const catalog = [
    { id: 'a', addedAt: '2026-11-11' },
    { id: 'b', addedAt: '2026-11-13' },
    { id: 'c', addedAt: '2026-11-12' },
    { id: 'd', addedAt: '2026-11-13' },
  ];
  assert.deepEqual(ids(newestFirst(catalog)), ['d', 'b', 'c', 'a']);
  assert.deepEqual(ids(orderCatalog(catalog, 'newest', 'x', '2026-11-13')), ['d', 'b', 'c', 'a']);
  assert.equal(ids(newestFirst(APP_REGISTRY))[0], APP_REGISTRY[APP_REGISTRY.length - 1].id);
});

test('sort mode and shuffle seed persist per browser and survive broken storage', () => {
  const storage = memoryStorage();
  assert.equal(readSortMode(storage), 'shuffle');
  writeSortMode('newest', storage);
  assert.equal(readSortMode(storage), 'newest');
  storage.store.set('43gg.hub.sort.v1', 'garbage');
  assert.equal(readSortMode(storage), 'shuffle');

  const seed = readOrCreateShuffleSeed(storage);
  assert.match(seed, /^[a-z0-9]{4,32}$/);
  assert.equal(storage.store.get(SHUFFLE_SEED_STORAGE_KEY), seed);
  assert.equal(readOrCreateShuffleSeed(storage), seed);

  storage.store.set(SHUFFLE_SEED_STORAGE_KEY, '<bad seed>');
  assert.notEqual(readOrCreateShuffleSeed(storage), '<bad seed>');

  const throwing = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  assert.equal(readSortMode(throwing), 'shuffle');
  assert.doesNotThrow(() => writeSortMode('newest', throwing));
  assert.match(readOrCreateShuffleSeed(throwing), /^[a-z0-9]{4,32}$/);
  assert.match(readOrCreateShuffleSeed(null), /^[a-z0-9]{4,32}$/);
});

test('localDayKey formats the local calendar day', () => {
  assert.equal(localDayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});
