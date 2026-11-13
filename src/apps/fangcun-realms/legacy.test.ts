import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_EXPANSIONS, applyAction, legalActions } from './engine/index.ts';
import { advanceFcGuide, fcGuideSignals, findScoringPlacement } from './guide.ts';
import { getCatalog } from './lib/catalog.ts';
import { LEGACY_KEYS, migrateLegacyMatch, migrateModuleList, migrateTileId } from './legacy.ts';
import type { FcLocalMatch } from './lib/types.ts';
import { applyHumanFcAction, createLocalFcMatch, hasPendingFcBot, stepFcBot } from './session.ts';
import { FC_ACTIVE_RUN_KEY, FC_AUDIO_KEY, loadActiveFcRun, loadFcMeta } from './storage.ts';

const cat = getCatalog();

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => void data.delete(key),
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

// The retired app stored these ids; the test turns a current match back into that shape.
const OLD_MODULE: Record<string, string> = {
  STREAM: 'RIVER',
  HERMIT: 'ABBOT',
  PAVILIONS: 'INNS_AND_CATHEDRALS',
  MARKETS: 'TRADERS_AND_BUILDERS',
  KITES: 'FLYING_MACHINES',
  COURIERS: 'MESSENGERS',
  CROSSINGS: 'FERRIES',
  SILVER: 'GOLDMINES',
  OMENS: 'MAGE_AND_WITCH',
  BROKERS: 'ROBBERS',
  BANNERS: 'CROP_CIRCLES',
};
const OLD_PREFIX: Record<string, string> = {
  BASE: 'BASE', STR: 'RIV', PAV: 'IC', MKT: 'TB', KITE: 'FLI', CRS: 'FER', SLV: 'GLD', OMN: 'MAG', BRK: 'ROB', BNR: 'CRP',
};
function toOldTile(id: string): string {
  const m = /^([A-Z]+)_(\d{2})(_G)?$/.exec(id);
  if (!m) return id;
  const suffix = m[1] === 'CRS' ? m[2] : String.fromCharCode(64 + Number(m[2]));
  return `${OLD_PREFIX[m[1]]}_${suffix}${m[3] ?? ''}`;
}
function toOldValue(value: unknown): unknown {
  if (typeof value === 'string') return toOldTile(value);
  if (Array.isArray(value)) return value.map(toOldValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toOldValue(v)]));
  return value;
}
function legacify(match: FcLocalMatch): FcLocalMatch {
  const state = toOldValue(match.state) as FcLocalMatch['state'];
  state.config = { ...state.config, expansions: match.state.config.expansions.map((e) => OLD_MODULE[e] ?? e) as never };
  return { ...match, state };
}

/** Plays a few turns: bots move by themselves, the human takes the first legal action. */
function playSome(match: FcLocalMatch, steps: number): FcLocalMatch {
  let m = match;
  for (let i = 0; i < steps && !m.state.finished; i++) {
    if (hasPendingFcBot(m)) {
      m = stepFcBot(m, cat, '2026-11-13T00:00:00.000Z', 5) ?? m;
      continue;
    }
    const legal = legalActions(m.state, cat);
    const res = applyHumanFcAction(m, legal[0], cat, '2026-11-13T00:00:00.000Z');
    assert.ok(res.ok);
    m = res.match;
  }
  return m;
}

test('every current tile id survives the legacy id rule, and module lists migrate', () => {
  for (const id of Object.keys(cat.tiles)) assert.equal(migrateTileId(toOldTile(id)), id, id);
  assert.equal(migrateTileId('BASE_D'), 'BASE_04');
  assert.equal(migrateTileId('IC_A_G'), 'PAV_01_G');
  assert.equal(migrateTileId('FER_02'), 'CRS_02');
  assert.equal(migrateTileId('PLACE_TILE'), 'PLACE_TILE', 'other strings are left alone');
  assert.equal(migrateTileId('3,-1'), '3,-1');
  const valid = new Set<string>(ALL_EXPANSIONS);
  assert.deepEqual(migrateModuleList(['RIVER', 'ABBOT', 'CROP_CIRCLES', 'STREAM', 'BOGUS', 7], valid), ['STREAM', 'HERMIT', 'BANNERS']);
});

test('an in-progress legacy match with every module carries over unchanged', () => {
  const match = playSome(
    createLocalFcMatch({ playerName: '山人', botLevels: ['EASY', 'NORMAL'], expansions: [...ALL_EXPANSIONS], seed: 'legacy-all' }, cat),
    24,
  );
  assert.ok(Object.keys(match.state.board.tiles).length > 3);
  const migrated = migrateLegacyMatch(JSON.parse(JSON.stringify(legacify(match))), cat);
  assert.ok(migrated);
  assert.deepEqual(migrated.state, match.state);
  // and it keeps playing on the current engine
  const legal = legalActions(migrated.state, cat);
  assert.ok(legal.length > 0 || migrated.state.finished);
  if (legal.length && !hasPendingFcBot(migrated)) applyAction(migrated.state, legal[0], cat);
  assert.equal(migrateLegacyMatch({ seats: [] }), null);
});

test('storage migrates retired-id saves once and drops what does not fit', () => {
  const storage = memoryStorage();
  const match = playSome(createLocalFcMatch({ playerName: '山人', botLevels: ['EASY'], expansions: ['STREAM', 'HERMIT'], seed: 'legacy-store' }, cat), 6);
  storage.setItem(LEGACY_KEYS.meta, JSON.stringify({ gamesPlayed: 4, victories: 1, bestScore: 77, preferredExpansions: ['RIVER', 'MAGE_AND_WITCH'], preferredDifficulty: 'HARD' }));
  storage.setItem(LEGACY_KEYS.tour, '1');
  storage.setItem(LEGACY_KEYS.activeRun, JSON.stringify(legacify(match)));
  storage.setItem(LEGACY_KEYS.audio, '{"muted":false,"volume":0.3}');

  const meta = loadFcMeta(storage);
  assert.equal(meta.gamesPlayed, 4);
  assert.equal(meta.bestScore, 77);
  assert.equal(meta.preferredDifficulty, 'HARD');
  assert.deepEqual(meta.preferredExpansions, ['STREAM', 'OMENS']);
  assert.equal(meta.tutorialCompleted, true);
  assert.deepEqual(loadActiveFcRun(storage)?.state, match.state);
  assert.equal(storage.getItem(FC_AUDIO_KEY), '{"muted":false,"volume":0.3}');
  for (const key of Object.values(LEGACY_KEYS)) assert.equal(storage.getItem(key), null);

  const broken = memoryStorage();
  broken.setItem(LEGACY_KEYS.activeRun, '{"state":');
  broken.setItem(LEGACY_KEYS.meta, 'nope');
  assert.equal(loadFcMeta(broken).gamesPlayed, 0);
  assert.equal(loadActiveFcRun(broken), null);

  const stale = memoryStorage();
  const bad = structuredClone(match);
  bad.state.drawPile = ['NOT_A_TILE', ...bad.state.drawPile];
  stale.setItem(FC_ACTIVE_RUN_KEY, JSON.stringify(bad));
  assert.equal(loadActiveFcRun(stale), null);
});

test('guide steps follow the human\'s real actions and a scoring placement can be found', () => {
  assert.equal(advanceFcGuide('tile', { tiles: 0, figureChoices: 0, points: 0 }), 'tile');
  assert.equal(advanceFcGuide('tile', { tiles: 1, figureChoices: 0, points: 0 }), 'figure');
  assert.equal(advanceFcGuide('figure', { tiles: 1, figureChoices: 1, points: 0 }), 'score');
  assert.equal(advanceFcGuide('score', { tiles: 3, figureChoices: 3, points: 4 }), 'done');
  assert.equal(advanceFcGuide('done', { tiles: 0, figureChoices: 0, points: 0 }), 'done');

  let match = createLocalFcMatch({ playerName: '山人', botLevels: ['EASY'], expansions: [], seed: 'guide-signals' }, cat);
  const from = match.state.actions.length;
  match = playSome(match, 8);
  const sig = fcGuideSignals(match.state, match.humanSeat, from, 0);
  assert.ok(sig.tiles >= 1);
  assert.ok(sig.figureChoices >= 1);

  // Search a few seeded games for a human turn where closing a held feature scores immediately.
  let found = false;
  for (let seed = 0; seed < 30 && !found; seed++) {
    let m = createLocalFcMatch({ playerName: '山人', botLevels: ['EASY'], expansions: [], seed: `guide-score-${seed}` }, cat);
    for (let i = 0; i < 40 && !m.state.finished && !found; i++) {
      if (!hasPendingFcBot(m) && m.state.pending?.type === 'PLACE_TILE') {
        const pick = findScoringPlacement(m.state, cat, m.humanSeat);
        if (pick) {
          const before = m.state.players[m.humanSeat].score;
          let next = applyAction(m.state, pick, cat);
          const skip = legalActions(next, cat).find((a) => a.type === 'SKIP_FIGURE');
          if (skip) next = applyAction(next, skip, cat);
          assert.ok(next.players[m.humanSeat].score > before, 'a suggested placement really scores');
          found = true;
        }
      }
      m = playSome(m, 1);
    }
  }
  assert.ok(found, 'some early turn offers a scoring placement');
});
