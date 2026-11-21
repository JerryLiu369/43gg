import test from 'node:test';
import assert from 'node:assert/strict';
import { getCatalog } from './lib/catalog.ts';
import { BOT_LEVELS, type BotLevel } from './lib/types.ts';
import {
  adjustBotCount,
  adjustHumanCount,
  applyHumanFcAction,
  createLocalFcMatch,
  formatSeatSummary,
  getHumanSeats,
  hasPendingFcBot,
  hasPendingFcHuman,
  projectFcMatch,
  resolveLocalSeats,
  stepFcBot,
  summarizeSeatCounts,
  toggleSeatType,
} from './session.ts';
import {
  FC_ACTIVE_RUN_KEY,
  FC_META_KEY,
  loadActiveFcRun,
  loadFcMeta,
  recordFcMatchOutcome,
  saveActiveFcRun,
  updateFcPreferences,
} from './storage.ts';
import type { SeatConfig } from './lib/types.ts';

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

test('seat roster helpers support any n humans + m bots within 2..6 players', () => {
  let seats: SeatConfig[] = [
    { isBot: false, name: '山人' },
    { isBot: true, botLevel: 'NORMAL' },
  ];

  // Floor swap: reducing bots at total 2 converts bot into human (2 humans + 0 bots)
  seats = adjustBotCount(seats, -1, 'NORMAL');
  assert.deepEqual(summarizeSeatCounts(seats), { total: 2, humans: 2, bots: 0 });
  assert.equal(formatSeatSummary(seats), '2 真人同屏');

  // Adding humans up to 6
  for (let i = 0; i < 4; i++) seats = adjustHumanCount(seats, 1, 'NORMAL');
  assert.deepEqual(summarizeSeatCounts(seats), { total: 6, humans: 6, bots: 0 });
  // Cannot exceed 6 humans
  seats = adjustHumanCount(seats, 1, 'NORMAL');
  assert.deepEqual(summarizeSeatCounts(seats), { total: 6, humans: 6, bots: 0 });

  // At cap 6, adding a bot converts last human into a bot (5 humans + 1 bot)
  seats = adjustBotCount(seats, 1, 'HARD');
  assert.deepEqual(summarizeSeatCounts(seats), { total: 6, humans: 5, bots: 1 });
  assert.equal(seats[5].isBot, true);
  assert.equal(seats[5].botLevel, 'HARD');
  assert.equal(formatSeatSummary(seats), '5 真人 · 1 电脑');

  // Reducing humans below 6 removes human seats until floor 2, then swaps to bots
  for (let i = 0; i < 5; i++) seats = adjustHumanCount(seats, -1, 'EASY');
  assert.deepEqual(summarizeSeatCounts(seats), { total: 2, humans: 0, bots: 2 });
  assert.equal(formatSeatSummary(seats), '2 电脑观战');

  // Toggle individual seat preserves index and assigns sensible default name/level
  const toggled = toggleSeatType(seats, 1, 'NORMAL');
  assert.equal(toggled[0].isBot, true);
  assert.equal(toggled[1].isBot, false);
  assert.equal(toggled[1].name, '山人');

  // Resolve seats validates boundaries and assigns unique colors and default names
  assert.throws(() => resolveLocalSeats([{ isBot: false }]));
  assert.throws(() => resolveLocalSeats(Array.from({ length: 7 }, () => ({ isBot: false }))));
  const resolved = resolveLocalSeats([
    { isBot: false, name: '小明' },
    { isBot: true, botLevel: 'EASY' },
    { isBot: false, name: '' },
    { isBot: true, botLevel: 'HARD' },
  ]);
  assert.equal(resolved.length, 4);
  assert.equal(resolved[0].displayName, '小明');
  assert.equal(resolved[1].displayName, '电脑 1 (轻松)');
  assert.equal(resolved[2].displayName, '玩家 2');
  assert.equal(resolved[3].displayName, '电脑 2 (宗师)');
  assert.equal(new Set(resolved.map((s) => s.color)).size, 4);
});

test('simulates a complete mixed 2 humans + 1 bot local match and enforces turn ownership', () => {
  const cat = getCatalog();
  let match = createLocalFcMatch(
    {
      seats: [
        { isBot: false, name: '小明' },
        { isBot: false, name: '小红' },
        { isBot: true, botLevel: 'EASY' },
      ],
      expansions: [],
      seed: 'fc-2h-1b-seed',
    },
    cat,
    '2026-11-20T10:00:00.000Z',
  );

  assert.equal(match.humanSeat, 0);
  assert.equal(getHumanSeats(match).length, 2);
  assert.equal(hasPendingFcHuman(match), true);
  assert.equal(hasPendingFcBot(match), false);

  // Reject action claiming wrong human seat
  const initialProj = projectFcMatch(match, cat);
  assert.equal(initialProj.pendingSeat?.seatIndex, 0);
  const wrongPlayer = { ...initialProj.legal[0], player: 1 };
  const rejected = applyHumanFcAction(match, wrongPlayer, cat);
  assert.equal(rejected.ok, false);

  const actedHumans = new Set<number>();
  let botSteps = 0;
  let steps = 0;
  while (!match.state.finished && steps < 700) {
    steps++;
    if (hasPendingFcBot(match)) {
      // Human action during bot turn must be rejected
      const botRejected = applyHumanFcAction(match, { type: 'SKIP_FIGURE', player: 2 }, cat);
      assert.equal(botRejected.ok, false);
      const stepped = stepFcBot(match, cat, '2026-11-20T10:01:00.000Z', 80);
      assert.ok(stepped);
      match = stepped;
      botSteps++;
      continue;
    }

    const projected = projectFcMatch(match, cat);
    assert.ok(projected.pendingSeat && !projected.pendingSeat.isBot);
    assert.ok(projected.legal.length > 0);
    actedHumans.add(projected.pendingSeat.seatIndex);
    const choice =
      projected.legal.find((a) => a.type === 'PLACE_TILE') ??
      projected.legal.find((a) => a.type === 'SKIP_FIGURE') ??
      projected.legal[0];
    const res = applyHumanFcAction(match, choice, cat);
    assert.equal(res.ok, true);
    if (res.ok) match = res.match;
  }

  assert.equal(match.state.finished, true);
  assert.deepEqual([...actedHumans].sort((a, b) => a - b), [0, 1]);
  assert.ok(botSteps > 0);
  assert.equal(match.state.final?.scores.length, 3);
});

test('simulates a pure 3-human hot-seat match and a 0-human 2-bot spectate match to completion', () => {
  const cat = getCatalog();

  // Pure 3-human hot-seat (0 bots)
  let hotseat = createLocalFcMatch(
    {
      seats: [
        { isBot: false, name: '甲' },
        { isBot: false, name: '乙' },
        { isBot: false, name: '丙' },
      ],
      expansions: [],
      seed: 'fc-3h-0b-seed',
    },
    cat,
  );
  const seenHotseatPlayers = new Set<number>();
  for (let steps = 0; !hotseat.state.finished && steps < 700; steps++) {
    assert.equal(hasPendingFcBot(hotseat), false);
    const projected = projectFcMatch(hotseat, cat);
    assert.ok(projected.legal.length > 0);
    if (projected.pendingSeat) seenHotseatPlayers.add(projected.pendingSeat.seatIndex);
    const choice =
      projected.legal.find((a) => a.type === 'PLACE_TILE') ??
      projected.legal.find((a) => a.type === 'SKIP_FIGURE') ??
      projected.legal[0];
    const res = applyHumanFcAction(hotseat, choice, cat);
    assert.equal(res.ok, true);
    if (res.ok) hotseat = res.match;
  }
  assert.equal(hotseat.state.finished, true);
  assert.deepEqual([...seenHotseatPlayers].sort((a, b) => a - b), [0, 1, 2]);
  assert.equal(hotseat.state.final?.scores.length, 3);

  // Pure 2-bot spectate (0 humans)
  let spectate = createLocalFcMatch(
    {
      seats: [
        { isBot: true, botLevel: 'EASY' },
        { isBot: true, botLevel: 'EASY' },
      ],
      expansions: [],
      seed: 'fc-0h-2b-seed',
    },
    cat,
  );
  assert.equal(spectate.humanSeat, -1);
  assert.equal(getHumanSeats(spectate).length, 0);
  for (let steps = 0; !spectate.state.finished && steps < 700; steps++) {
    assert.equal(hasPendingFcHuman(spectate), false);
    assert.equal(hasPendingFcBot(spectate), true);
    const projected = projectFcMatch(spectate, cat);
    assert.equal(projected.legal.length, 0);
    const stepped = stepFcBot(spectate, cat, undefined, 60);
    assert.ok(stepped);
    spectate = stepped;
  }
  assert.equal(spectate.state.finished, true);
  assert.equal(spectate.state.final?.scores.length, 2);
});

test('supports interleaved human/bot seat ordering starting with a bot', () => {
  const cat = getCatalog();
  let match = createLocalFcMatch(
    {
      seats: [
        { isBot: true, botLevel: 'EASY' },
        { isBot: false, name: '二席玩家' },
        { isBot: true, botLevel: 'NORMAL' },
        { isBot: false, name: '四席玩家' },
      ],
      expansions: ['STREAM'],
      seed: 'fc-interleaved-seed',
    },
    cat,
  );
  assert.equal(match.humanSeat, 1);
  assert.equal(hasPendingFcBot(match), true);
  assert.equal(projectFcMatch(match, cat).legal.length, 0);

  // Step bot 0 until human seat 1 gets the turn
  let guard = 0;
  while (hasPendingFcBot(match) && guard++ < 10) {
    const stepped = stepFcBot(match, cat, undefined, 80);
    assert.ok(stepped);
    match = stepped;
  }
  const proj = projectFcMatch(match, cat);
  assert.equal(proj.pendingSeat?.seatIndex, 1);
  assert.equal(proj.pendingSeat?.displayName, '二席玩家');
  assert.ok(proj.legal.length > 0);
});

test('storage safely handles corrupt JSON and persists multi-human preferences and active run', () => {
  const storage = makeMemoryStorage();
  storage.setItem(FC_META_KEY, '{corrupt');
  storage.setItem(FC_ACTIVE_RUN_KEY, '{corrupt');

  const meta = loadFcMeta(storage);
  assert.equal(meta.preferredDifficulty, 'NORMAL');
  assert.equal(meta.gamesPlayed, 0);
  assert.equal(meta.preferredSeats, undefined);
  assert.equal(loadActiveFcRun(storage), null);

  const updated = recordFcMatchOutcome(true, 96, storage);
  assert.equal(updated.gamesPlayed, 1);
  assert.equal(updated.victories, 1);
  assert.equal(updated.bestScore, 96);

  const prefMeta = updateFcPreferences(
    {
      preferredBotCount: 0,
      preferredSeats: [
        { isBot: false, name: '阿明' },
        { isBot: false, name: '阿红' },
        { isBot: true, botLevel: 'HARD' },
      ],
    },
    storage,
  );
  assert.equal(prefMeta.preferredBotCount, 0);
  assert.equal(prefMeta.preferredSeats?.length, 3);
  const reloadedMeta = loadFcMeta(storage);
  assert.equal(reloadedMeta.preferredBotCount, 0);
  assert.deepEqual(reloadedMeta.preferredSeats, [
    { isBot: false, name: '阿明' },
    { isBot: false, name: '阿红' },
    { isBot: true, botLevel: 'HARD' },
  ]);

  const match = createLocalFcMatch({
    seats: [
      { isBot: false, name: '阿明' },
      { isBot: false, name: '阿红' },
    ],
    expansions: ['STREAM'],
    seed: 'save-fc-hotseat',
  });
  saveActiveFcRun(match, storage);
  const loaded = loadActiveFcRun(storage);
  assert.ok(loaded);
  assert.equal(loaded.humanSeat, 0);
  assert.equal(loaded.seats.length, 2);
  assert.equal(loaded.seats[1].displayName, '阿红');
  assert.equal(loaded.seats[1].isBot, false);
});
