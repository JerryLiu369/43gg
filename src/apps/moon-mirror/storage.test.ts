import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from './content.ts';
import {
  createDefaultSave,
  recordLevelCompletion,
  sanitizeSave,
} from './storage.ts';

test('unknown versions and out-of-range progress fall back safely', () => {
  assert.deepEqual(sanitizeSave(null), createDefaultSave());
  assert.deepEqual(sanitizeSave('broken'), createDefaultSave());
  for (const value of [
    { version: 99, unlockedLevel: 9 },
    { version: 1, unlockedLevel: 500 },
    { version: 1, unlockedLevel: Number.POSITIVE_INFINITY },
    { version: 1, unlockedLevel: 0 },
  ]) {
    assert.deepEqual(sanitizeSave(value), createDefaultSave());
  }
});

test('completion unlocks the next garden and preserves the best honest record', () => {
  const initial = createDefaultSave();
  const first = recordLevelCompletion(initial, 0, 'standard', 4);
  assert.equal(first.unlockedLevel, 2);
  assert.equal(first.records['first-light'].bestMoves, 4);
  assert.equal(first.records['first-light'].stars, 2);
  assert.equal(first.records['first-light'].completed.standard, true);

  const improved = recordLevelCompletion(first, 0, 'master', 2);
  assert.equal(improved.records['first-light'].bestMoves, 2);
  assert.equal(improved.records['first-light'].stars, 3);
  assert.equal(improved.records['first-light'].completed.standard, true);
  assert.equal(improved.records['first-light'].completed.master, true);

  const slower = recordLevelCompletion(improved, 0, 'casual', 9);
  assert.equal(slower.records['first-light'].bestMoves, 2);
  assert.equal(slower.records['first-light'].stars, 3);
  assert.equal(slower.records['first-light'].completed.casual, true);
});

test('save sanitation retains valid records and clamps finite numeric values', () => {
  const save = sanitizeSave({
    version: 1,
    unlockedLevel: 1,
    tutorialCompleted: true,
    muted: true,
    preferredDifficulty: 'master',
    records: {
      'first-light': { bestMoves: 2.9, stars: 3.8, completed: { master: true } },
    },
  });
  assert.equal(save.unlockedLevel, 2);
  assert.equal(save.tutorialCompleted, true);
  assert.equal(save.muted, true);
  assert.equal(save.preferredDifficulty, 'master');
  assert.equal(save.records['first-light'].bestMoves, 2);
  assert.equal(save.records['first-light'].stars, 3);
});

test('malformed records cannot create NaN, fake completion, or noncontiguous unlocks', () => {
  const save = sanitizeSave({
    version: 1,
    unlockedLevel: 1,
    records: {
      'first-light': { bestMoves: 2, stars: 'bad', completed: { standard: true } },
      'twin-dew': { bestMoves: 2, stars: 3 },
      'far-near': { bestMoves: Number.POSITIVE_INFINITY, stars: 3, completed: { master: true } },
      'two-rivers': { bestMoves: 3, stars: 3, completed: { casual: true } },
      unknown: { bestMoves: 1, stars: 3, completed: { master: true } },
    },
  });
  assert.equal(save.records['first-light'].stars, 1);
  assert.equal(save.records['twin-dew'], undefined);
  assert.equal(save.records['far-near'], undefined);
  assert.equal(save.records.unknown, undefined);
  assert.equal(save.records['two-rivers'].bestMoves, 3);
  assert.equal(save.unlockedLevel, 2);
  assert.equal(Object.values(save.records).every((record) => Number.isFinite(record.bestMoves) && Number.isFinite(record.stars)), true);
  assert.equal(LEVELS.length, 9);
});
