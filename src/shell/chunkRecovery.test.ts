import test from 'node:test';
import assert from 'node:assert/strict';
import { CHUNK_RELOAD_FLAG_KEY, isChunkLoadError, withChunkRecovery } from './chunkRecovery.ts';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const staleChunk = () =>
  Promise.reject(
    new TypeError(
      'Failed to fetch dynamically imported module: https://example.com/43gg/assets/InkBladeApp-old.js',
    ),
  );

test('isChunkLoadError recognises browser chunk-load messages only', () => {
  assert.ok(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: x.js')));
  assert.ok(isChunkLoadError(new TypeError('error loading dynamically imported module: x.js')));
  assert.ok(isChunkLoadError(new TypeError('Importing a module script failed.')));
  assert.equal(isChunkLoadError(new Error('Cannot read properties of undefined')), false);
});

test('stale chunk triggers exactly one reload, then surfaces the error', async () => {
  const storage = memoryStorage();
  let reloads = 0;
  const load = withChunkRecovery(staleChunk, { storage, reload: () => reloads++ });

  const pending = load();
  const outcome = await Promise.race([pending.then(() => 'resolved'), new Promise((r) => setTimeout(() => r('pending'), 20))]);
  assert.equal(outcome, 'pending', 'should stay pending while the page reloads');
  assert.equal(reloads, 1);
  assert.equal(storage.map.get(CHUNK_RELOAD_FLAG_KEY), '1');

  await assert.rejects(load(), /Failed to fetch dynamically imported module/);
  assert.equal(reloads, 1, 'must not reload twice in a row');
});

test('successful load clears the reload guard; unrelated errors are rethrown untouched', async () => {
  const storage = memoryStorage();
  storage.setItem(CHUNK_RELOAD_FLAG_KEY, '1');
  let reloads = 0;
  const ok = withChunkRecovery(async () => 'module', { storage, reload: () => reloads++ });
  assert.equal(await ok(), 'module');
  assert.equal(storage.map.has(CHUNK_RELOAD_FLAG_KEY), false);

  const boom = withChunkRecovery(() => Promise.reject(new Error('render bug')), { storage, reload: () => reloads++ });
  await assert.rejects(boom(), /render bug/);
  assert.equal(reloads, 0);
});

test('without storage it never auto-reloads', async () => {
  let reloads = 0;
  const load = withChunkRecovery(staleChunk, { storage: null, reload: () => reloads++ });
  await assert.rejects(load(), /Failed to fetch/);
  assert.equal(reloads, 0);
});
