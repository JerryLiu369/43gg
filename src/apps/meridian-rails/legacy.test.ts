import test from 'node:test';
import assert from 'node:assert/strict';
import { CITIES, ROUTES, ROUTE_BY_ID, TICKETS, TICKET_BY_ID } from './data.ts';
import { advanceGuide } from './guide.ts';
import {
  LEGACY_CITY_IDS,
  LEGACY_KEYS,
  migrateLegacyMatch,
  migrateRouteId,
  parseLegacyTicketId,
} from './legacy.ts';
import { createLocalMatch, createSeededRng } from './session.ts';
import {
  MER_ACTIVE_RUN_KEY,
  MER_AUDIO_KEY,
  MER_META_KEY,
  loadActiveMerRun,
  loadMerMeta,
} from './storage.ts';
import type { MerLocalMatch } from './types.ts';

function memoryStorage(): Storage & { dump(): Map<string, string> } {
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
    dump: () => data,
  };
}

const OLD_OF = Object.fromEntries(Object.entries(LEGACY_CITY_IDS).map(([oldId, newId]) => [newId, oldId]));
const toOldCity = (id: string) => OLD_OF[id] ?? id;
const toOldRoute = (id: string) => {
  const [a, b, track] = id.split('_');
  const [x, y] = [toOldCity(a), toOldCity(b)].sort();
  return track ? `${x}_${y}_${track}` : `${x}_${y}`;
};
const toOldTicket = (id: string) => {
  const t = TICKET_BY_ID.get(id)!;
  return `${toOldCity(t.from)}_${toOldCity(t.to)}_${t.points}pts`;
};

/** Rewrites a current match the way the retired app would have stored it. */
function legacify(match: MerLocalMatch): MerLocalMatch {
  const s = match.state;
  return {
    ...match,
    state: {
      ...s,
      claims: s.claims.map((c) => ({ ...c, routeId: toOldRoute(c.routeId) })),
      stations: s.stations.map((st) => ({ ...st, cityId: toOldCity(st.cityId) })),
      players: s.players.map((p) => ({
        ...p,
        ticketIds: p.ticketIds.map(toOldTicket),
        pendingTicketIds: p.pendingTicketIds.map(toOldTicket),
      })),
      regularTicketDeck: s.regularTicketDeck.map(toOldTicket),
      boxedTicketIds: s.boxedTicketIds.map(toOldTicket),
    },
  };
}

function shortestCars(from: string, to: string): number {
  const dist = new Map<string, number>([[from, 0]]);
  const open = new Set(CITIES.map((c) => c.id));
  while (open.size) {
    let u: string | null = null;
    for (const id of open) if (dist.has(id) && (u === null || dist.get(id)! < dist.get(u)!)) u = id;
    if (u === null) break;
    open.delete(u);
    for (const r of ROUTES) {
      if (r.city1 !== u && r.city2 !== u) continue;
      const v = r.city1 === u ? r.city2 : r.city1;
      const d = dist.get(u)! + r.length;
      if (d < (dist.get(v) ?? Infinity)) dist.set(v, d);
    }
  }
  return dist.get(to)!;
}

test('board data: route ids are canonical, colours balanced, ferries gray, tickets priced by shortest path', () => {
  assert.equal(CITIES.length, 47);
  assert.equal(ROUTES.length, 101);
  for (const r of ROUTES) {
    const [a, b] = r.id.split('_');
    assert.deepEqual([a, b], [r.city1, r.city2].sort(), `route id ${r.id} lists its cities in order`);
    if (r.type === 'FERRY') assert.equal(r.color, 'GRAY', `${r.id}: ferries take any colour`);
  }
  const carsByColour = new Map<string, number>();
  for (const r of ROUTES) if (r.color !== 'GRAY') carsByColour.set(r.color, (carsByColour.get(r.color) ?? 0) + r.length);
  assert.equal(carsByColour.size, 8);
  const cars = [...carsByColour.values()];
  assert.ok(Math.max(...cars) - Math.min(...cars) <= 2, `colour totals stay even: ${cars.join(', ')}`);

  assert.equal(TICKETS.length, 46);
  assert.equal(TICKETS.filter((t) => t.isLong).length, 6);
  const used = new Map<string, number>();
  for (const t of TICKETS) {
    assert.equal(t.points, shortestCars(t.from, t.to), `${t.id} is worth its shortest connection`);
    for (const c of [t.from, t.to]) used.set(c, (used.get(c) ?? 0) + 1);
  }
  assert.equal(used.size, CITIES.length, 'every city appears on at least one ticket');
  assert.ok(Math.max(...used.values()) <= 3);
});

test('legacy route and ticket ids map onto the current board', () => {
  assert.equal(migrateRouteId('amsterdam_bruxelles'), 'amsterdam_brussels');
  assert.equal(migrateRouteId('angora_constantinople'), 'ankara_istanbul');
  assert.equal(migrateRouteId('berlin_warszawa_2'), 'berlin_warsaw_2');
  assert.equal(migrateRouteId('paris_zurich'), 'paris_zurich');
  for (const r of ROUTES) assert.ok(ROUTE_BY_ID.has(migrateRouteId(toOldRoute(r.id))), r.id);
  assert.deepEqual(parseLegacyTicketId('brest_petrograd_20pts'), { from: 'brest', to: 'petersburg', points: 20 });
  assert.equal(parseLegacyTicketId('garbage'), null);
});

test('an in-progress legacy match carries over with the same routes, stations and tickets', () => {
  const match = createLocalMatch({ playerName: '旅人', botLevels: ['MEDIUM', 'EASY'] }, createSeededRng('legacy-roundtrip'));
  const human = match.state.players[0];
  match.state.claims.push({ routeId: ROUTES[3].id, ownerPlayerId: human.id });
  match.state.stations.push({ cityId: 'istanbul', ownerPlayerId: match.state.players[1].id });
  match.log.push({
    id: 999,
    version: 1,
    playerId: human.id,
    playerName: human.displayName,
    actorKind: 'HUMAN',
    actionType: 'CLAIM_ROUTE',
    summary: 'x',
    detail: { routeId: toOldRoute(ROUTES[3].id) },
    createdAt: '2026-11-13T00:00:00.000Z',
  });

  const migrated = migrateLegacyMatch(JSON.parse(JSON.stringify(legacify(match))));
  assert.ok(migrated);
  assert.deepEqual(migrated.state.claims, match.state.claims);
  assert.deepEqual(migrated.state.stations, match.state.stations);
  migrated.state.players.forEach((p, i) => {
    assert.deepEqual(p.ticketIds, match.state.players[i].ticketIds);
    assert.deepEqual(p.pendingTicketIds, match.state.players[i].pendingTicketIds);
  });
  assert.deepEqual(migrated.state.regularTicketDeck, match.state.regularTicketDeck, 'deck order is kept');
  assert.deepEqual(migrated.state.boxedTicketIds, match.state.boxedTicketIds);
  assert.equal(migrated.log.at(-1)?.detail?.routeId, ROUTES[3].id);
});

test('legacy tickets without a twin become unused tickets of the same kind, never duplicates', () => {
  const match = legacify(createLocalMatch({ playerName: '旅人', botLevels: ['MEDIUM'] }, createSeededRng('legacy-swap')));
  const human = match.state.players.find((p) => !p.isBot)!;
  const bot = match.state.players.find((p) => p.isBot)!;
  // The human holds an old long ticket that has no twin: one long ticket leaves the box for it.
  match.state.boxedTicketIds.shift();
  human.ticketIds = ['lisboa_danzig_20pts', 'zagrab_wien_2pts'];
  human.pendingTicketIds = [];
  bot.ticketIds = ['nowhere_atall_7pts'];
  const migrated = migrateLegacyMatch(match);
  assert.ok(migrated);
  const h = migrated.state.players.find((p) => !p.isBot)!;
  const b = migrated.state.players.find((p) => p.isBot)!;
  assert.equal(h.ticketIds.length, 2);
  assert.ok(TICKET_BY_ID.get(h.ticketIds[0])!.isLong, 'a long ticket stays long');
  assert.ok(!TICKET_BY_ID.get(h.ticketIds[1])!.isLong);
  assert.equal(b.ticketIds.length, 1);
  const before = [
    ...match.state.players.flatMap((p) => [...p.ticketIds, ...p.pendingTicketIds]),
    ...match.state.regularTicketDeck,
    ...match.state.boxedTicketIds,
  ];
  const all = [
    ...migrated.state.players.flatMap((p) => [...p.ticketIds, ...p.pendingTicketIds]),
    ...migrated.state.regularTicketDeck,
    ...migrated.state.boxedTicketIds,
  ];
  assert.equal(new Set(all).size, all.length, 'no ticket is dealt twice');
  assert.equal(all.length, before.length, 'tickets removed from play stay removed');
  assert.ok(all.every((id) => TICKET_BY_ID.has(id)));
  assert.equal(migrateLegacyMatch({ state: null }), null);
});

test('storage migrates retired-id saves once, then removes the old keys', () => {
  const storage = memoryStorage();
  const legacyRun = legacify(createLocalMatch({ playerName: '旅人', botLevels: ['EASY'] }, createSeededRng('legacy-store')));
  storage.setItem(LEGACY_KEYS.meta, JSON.stringify({ gamesPlayed: 3, victories: 2, bestScore: 141, preferredName: '老玩家', preferredDifficulty: 'ADVANCED', preferredBotCount: 3 }));
  storage.setItem(LEGACY_KEYS.tour, '1');
  storage.setItem(LEGACY_KEYS.activeRun, JSON.stringify(legacyRun));
  storage.setItem(LEGACY_KEYS.audio, '{"muted":true,"volume":0.4}');

  const meta = loadMerMeta(storage);
  assert.equal(meta.gamesPlayed, 3);
  assert.equal(meta.victories, 2);
  assert.equal(meta.bestScore, 141);
  assert.equal(meta.preferredName, '老玩家');
  assert.equal(meta.preferredDifficulty, 'ADVANCED');
  assert.equal(meta.tutorialCompleted, true);
  const run = loadActiveMerRun(storage);
  assert.ok(run);
  assert.equal(run.state.players[0].ticketIds.every((id) => TICKET_BY_ID.has(id)), true);
  assert.equal(storage.getItem(MER_AUDIO_KEY), '{"muted":true,"volume":0.4}');
  for (const key of Object.values(LEGACY_KEYS)) assert.equal(storage.getItem(key), null, `${key} removed`);

  // New keys always win over a stale legacy copy that reappears.
  storage.setItem(LEGACY_KEYS.meta, JSON.stringify({ gamesPlayed: 99 }));
  assert.equal(loadMerMeta(storage).gamesPlayed, 3);
});

test('corrupt legacy saves fall back safely and stale runs on the new key are ignored', () => {
  const storage = memoryStorage();
  storage.setItem(LEGACY_KEYS.meta, '{broken');
  storage.setItem(LEGACY_KEYS.activeRun, '{"state":');
  const meta = loadMerMeta(storage);
  assert.equal(meta.gamesPlayed, 0);
  assert.equal(meta.tutorialCompleted, false);
  assert.equal(loadActiveMerRun(storage), null);
  assert.equal(storage.getItem(LEGACY_KEYS.activeRun), null);

  const other = memoryStorage();
  const stale = createLocalMatch({ playerName: '旅人', botLevels: ['EASY'] }, createSeededRng('stale'));
  stale.state.claims.push({ routeId: 'atlantis_paris', ownerPlayerId: stale.humanPlayerId });
  other.setItem(MER_ACTIVE_RUN_KEY, JSON.stringify(stale));
  other.setItem(MER_META_KEY, '{}');
  assert.equal(loadActiveMerRun(other), null);
});

test('guide advances only on real actions and never goes back', () => {
  const none = { ticketPinned: false, draws: 0, claims: 0 };
  assert.equal(advanceGuide('ticket', none), 'ticket');
  assert.equal(advanceGuide('ticket', { ...none, ticketPinned: true }), 'draw');
  assert.equal(advanceGuide('draw', { ...none, ticketPinned: true, draws: 1 }), 'claim');
  // Steps already passed stay passed even if the player unpins the ticket later.
  assert.equal(advanceGuide('claim', { ...none, draws: 2 }), 'claim');
  assert.equal(advanceGuide('claim', { ...none, claims: 1 }), 'done');
  // Doing things out of order skips ahead.
  assert.equal(advanceGuide('ticket', { ticketPinned: true, draws: 2, claims: 1 }), 'done');
  assert.equal(advanceGuide('done', none), 'done');
});
