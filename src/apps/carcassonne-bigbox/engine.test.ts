import test from 'node:test';
import assert from 'node:assert/strict';
import { getCatalog } from './lib/catalog.ts';
import { BOT_LEVELS, type BotLevel } from './lib/types.ts';
import {
  applyHumanCarcAction,
  createLocalCarcMatch,
  hasPendingCarcBot,
  projectCarcMatch,
  stepCarcBot,
} from './session.ts';
import {
  CARC_ACTIVE_RUN_KEY,
  CARC_META_KEY,
  loadActiveCarcRun,
  loadCarcMeta,
  recordCarcMatchOutcome,
  saveActiveCarcRun,
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

test('creates offline Carcassonne matches with 1 to 5 AI opponents across all difficulty levels', () => {
  const cat = getCatalog();
  for (const botCount of [1, 2, 3, 4, 5]) {
    const botLevels: BotLevel[] = Array.from(
      { length: botCount },
      (_, idx) => BOT_LEVELS[idx % BOT_LEVELS.length],
    );
    const match = createLocalCarcMatch(
      {
        playerName: '测试领主',
        botLevels,
        expansions: ['RIVER', 'ABBOT'],
        seed: `carc-setup-${botCount}`,
      },
      cat,
      '2026-11-13T10:00:00.000Z',
    );
    const view = projectCarcMatch(match, cat);
    assert.equal(view.view.players.length, botCount + 1);
    assert.equal(view.view.finished, false);
    assert.ok(view.legal.length > 0);
  }
});

test('simulates a complete deterministic offline base+abbot match to final scoring', () => {
  const cat = getCatalog();
  let match = createLocalCarcMatch(
    {
      playerName: '建造师',
      botLevels: ['EASY', 'NORMAL'],
      expansions: ['ABBOT'],
      seed: 'carc-full-match-seed',
    },
    cat,
    '2026-11-13T10:00:00.000Z',
  );

  let steps = 0;
  while (!match.state.finished && steps < 600) {
    steps++;
    if (hasPendingCarcBot(match)) {
      const stepped = stepCarcBot(match, cat, '2026-11-13T10:01:00.000Z', 120);
      assert.ok(stepped);
      match = stepped;
      continue;
    }

    const projected = projectCarcMatch(match, cat);
    assert.ok(projected.legal.length > 0);
    // Pick a deterministic legal action (prefer SKIP_FIGURE or first PLACE_TILE)
    const choice =
      projected.legal.find((a) => a.type === 'PLACE_TILE') ??
      projected.legal.find((a) => a.type === 'SKIP_FIGURE') ??
      projected.legal[0];
    const res = applyHumanCarcAction(match, choice, cat);
    assert.equal(res.ok, true);
    if (res.ok) match = res.match;
  }

  assert.equal(match.state.finished, true);
  assert.ok(match.state.final);
  assert.equal(match.state.final.scores.length, 3);
  assert.ok(match.state.final.winners.length >= 1);
});

test('supports all 11 Big Box expansion modules in local match initialization and first steps', () => {
  const cat = getCatalog();
  let match = createLocalCarcMatch(
    {
      playerName: '大盒领主',
      botLevels: ['HARD'],
      expansions: [
        'RIVER',
        'ABBOT',
        'INNS_AND_CATHEDRALS',
        'TRADERS_AND_BUILDERS',
        'FLYING_MACHINES',
        'MESSENGERS',
        'FERRIES',
        'GOLDMINES',
        'MAGE_AND_WITCH',
        'ROBBERS',
        'CROP_CIRCLES',
      ],
      seed: 'carc-all-expansions',
    },
    cat,
  );

  // Run 12 steps across human & HARD bot with all 11 expansions active
  for (let i = 0; i < 12 && !match.state.finished; i++) {
    if (hasPendingCarcBot(match)) {
      const stepped = stepCarcBot(match, cat, undefined, 120);
      assert.ok(stepped);
      match = stepped;
    } else {
      const projected = projectCarcMatch(match, cat);
      const res = applyHumanCarcAction(match, projected.legal[0], cat);
      assert.equal(res.ok, true);
      if (res.ok) match = res.match;
    }
  }
  assert.ok(match.seq >= 12);
});

test('storage safely handles corrupt JSON and persists active Carcassonne run', () => {
  const storage = makeMemoryStorage();
  storage.setItem(CARC_META_KEY, '{corrupt');
  storage.setItem(CARC_ACTIVE_RUN_KEY, '{corrupt');

  const meta = loadCarcMeta(storage);
  assert.equal(meta.preferredDifficulty, 'NORMAL');
  assert.equal(meta.gamesPlayed, 0);
  assert.equal(loadActiveCarcRun(storage), null);

  const updated = recordCarcMatchOutcome(true, 96, storage);
  assert.equal(updated.gamesPlayed, 1);
  assert.equal(updated.victories, 1);
  assert.equal(updated.bestScore, 96);

  const match = createLocalCarcMatch({
    playerName: '存储测试',
    botLevels: ['NORMAL'],
    expansions: ['RIVER'],
    seed: 'save-carc',
  });
  saveActiveCarcRun(match, storage);
  const loaded = loadActiveCarcRun(storage);
  assert.ok(loaded);
  assert.equal(loaded.humanSeat, 0);
});
