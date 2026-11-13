import test from 'node:test';
import assert from 'node:assert/strict';
import { getCatalog } from './lib/catalog.ts';
import { BOT_LEVELS, type BotLevel } from './lib/types.ts';
import {
  applyHumanFcAction,
  createLocalFcMatch,
  hasPendingFcBot,
  projectFcMatch,
  stepFcBot,
} from './session.ts';
import {
  FC_ACTIVE_RUN_KEY,
  FC_META_KEY,
  loadActiveFcRun,
  loadFcMeta,
  recordFcMatchOutcome,
  saveActiveFcRun,
} from './storage.ts';

function makeMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}

test('creates offline matches with 1 to 5 AI opponents across all difficulty levels', () => {
  const cat = getCatalog();
  for (const botCount of [1, 2, 3, 4, 5]) {
    const botLevels: BotLevel[] = Array.from(
      { length: botCount },
      (_, idx) => BOT_LEVELS[idx % BOT_LEVELS.length],
    );
    const match = createLocalFcMatch(
      {
        playerName: '测试山人',
        botLevels,
        expansions: ['STREAM', 'HERMIT'],
        seed: `fc-setup-${botCount}`,
      },
      cat,
      '2026-11-13T10:00:00.000Z',
    );
    const view = projectFcMatch(match, cat);
    assert.equal(view.view.players.length, botCount + 1);
    assert.equal(view.view.finished, false);
    assert.ok(view.legal.length > 0);
  }
});

test('simulates a complete deterministic offline base+abbot match to final scoring', () => {
  const cat = getCatalog();
  let match = createLocalFcMatch(
    {
      playerName: '建造师',
      botLevels: ['EASY', 'NORMAL'],
      expansions: ['HERMIT'],
      seed: 'fc-full-match-seed',
    },
    cat,
    '2026-11-13T10:00:00.000Z',
  );

  let steps = 0;
  while (!match.state.finished && steps < 600) {
    steps++;
    if (hasPendingFcBot(match)) {
      const stepped = stepFcBot(match, cat, '2026-11-13T10:01:00.000Z', 120);
      assert.ok(stepped);
      match = stepped;
      continue;
    }

    const projected = projectFcMatch(match, cat);
    assert.ok(projected.legal.length > 0);
    // Pick a deterministic legal action (prefer SKIP_FIGURE or first PLACE_TILE)
    const choice =
      projected.legal.find((a) => a.type === 'PLACE_TILE') ??
      projected.legal.find((a) => a.type === 'SKIP_FIGURE') ??
      projected.legal[0];
    const res = applyHumanFcAction(match, choice, cat);
    assert.equal(res.ok, true);
    if (res.ok) match = res.match;
  }

  assert.equal(match.state.finished, true);
  assert.ok(match.state.final);
  assert.equal(match.state.final.scores.length, 3);
  assert.ok(match.state.final.winners.length >= 1);
});

test('supports all 11 rule modules in local match initialization and first steps', () => {
  const cat = getCatalog();
  let match = createLocalFcMatch(
    {
      playerName: '测试山人',
      botLevels: ['HARD'],
      expansions: [
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
      ],
      seed: 'fc-all-expansions',
    },
    cat,
  );

  // Run 12 steps across human & HARD bot with all 11 expansions active
  for (let i = 0; i < 12 && !match.state.finished; i++) {
    if (hasPendingFcBot(match)) {
      const stepped = stepFcBot(match, cat, undefined, 120);
      assert.ok(stepped);
      match = stepped;
    } else {
      const projected = projectFcMatch(match, cat);
      const res = applyHumanFcAction(match, projected.legal[0], cat);
      assert.equal(res.ok, true);
      if (res.ok) match = res.match;
    }
  }
  assert.ok(match.seq >= 12);
});

test('storage safely handles corrupt JSON and persists the active run', () => {
  const storage = makeMemoryStorage();
  storage.setItem(FC_META_KEY, '{corrupt');
  storage.setItem(FC_ACTIVE_RUN_KEY, '{corrupt');

  const meta = loadFcMeta(storage);
  assert.equal(meta.preferredDifficulty, 'NORMAL');
  assert.equal(meta.gamesPlayed, 0);
  assert.equal(loadActiveFcRun(storage), null);

  const updated = recordFcMatchOutcome(true, 96, storage);
  assert.equal(updated.gamesPlayed, 1);
  assert.equal(updated.victories, 1);
  assert.equal(updated.bestScore, 96);

  const match = createLocalFcMatch({
    playerName: '存储测试',
    botLevels: ['NORMAL'],
    expansions: ['STREAM'],
    seed: 'save-fc',
  });
  saveActiveFcRun(match, storage);
  const loaded = loadActiveFcRun(storage);
  assert.ok(loaded);
  assert.equal(loaded.humanSeat, 0);
});
