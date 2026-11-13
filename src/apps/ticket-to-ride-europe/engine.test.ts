import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOT_LEVEL_ORDER,
  computeFinalScores,
  longestContinuousPath,
  routePaymentOptions,
  validateRouteAvailability,
  validateRoutePayment,
  type BotLevel,
} from './engine.ts';
import { DEFS, ROUTES } from './data.ts';
import {
  applyHumanAction,
  createLocalMatch,
  createSeededRng,
  hasPendingBotTurn,
  projectLocalMatch,
  stepLocalBot,
} from './session.ts';
import {
  TTR_ACTIVE_RUN_KEY,
  TTR_META_KEY,
  loadActiveTtrRun,
  loadTtrMeta,
  recordTtrMatchOutcome,
  saveActiveTtrRun,
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

test('creates offline match with 1 to 4 AI opponents across all difficulty tiers', () => {
  for (const botCount of [1, 2, 3, 4]) {
    const botLevels: BotLevel[] = Array.from(
      { length: botCount },
      (_, idx) => BOT_LEVEL_ORDER[idx % BOT_LEVEL_ORDER.length],
    );
    const rng = createSeededRng(`ttr-setup-${botCount}`);
    const match = createLocalMatch({ playerName: '测试车长', botLevels }, rng, '2026-11-13T10:00:00.000Z');
    const view = projectLocalMatch(match);

    assert.equal(view.public.players.length, botCount + 1);
    assert.equal(view.public.status, 'SETUP_TICKETS');
    assert.ok(view.self);
    assert.equal(view.self.pendingTicketOffer.length, 4);
    assert.equal(view.self.pendingTicketOffer.filter((t) => t.isLong).length, 1);

    // Bots already confirmed setup tickets so human immediately enters gameplay after choosing theirs
    const botsConfirmed = match.state.players.filter((p) => p.isBot).every((p) => p.setupConfirmed);
    assert.equal(botsConfirmed, true);
  }
});

test('validates route payments for regular, ferry, and tunnel routes', () => {
  const ferry = ROUTES.find((r) => r.type === 'FERRY' && r.requiredLocomotives > 0)!;
  const hand = { BLUE: 10, LOCOMOTIVE: 4 };
  const badFerry = validateRoutePayment(ferry, { BLUE: ferry.length }, hand, 45);
  assert.equal(badFerry.ok, false);
  const goodFerry = validateRoutePayment(
    ferry,
    { LOCOMOTIVE: ferry.requiredLocomotives, BLUE: ferry.length - ferry.requiredLocomotives },
    hand,
    45,
  );
  assert.equal(goodFerry.ok, true);

  const gray2 = ROUTES.find((r) => r.color === 'GRAY' && r.type === 'REGULAR' && r.length === 2)!;
  const opts = routePaymentOptions(gray2, { RED: 2, BLUE: 1, LOCOMOTIVE: 1 }, 10);
  assert.ok(opts.length > 0);

  // Double route closed in 2-3 player games
  const doubleRoute = ROUTES.find((r) => r.pairRouteId !== null)!;
  const owners = new Map([[doubleRoute.pairRouteId!, 'bot-1']]);
  assert.equal(validateRouteAvailability(doubleRoute, 'human-1', 3, owners), 'DOUBLE_ROUTE_CLOSED');
  assert.equal(validateRouteAvailability(doubleRoute, 'human-1', 4, owners), null);
});

test('simulates a complete deterministic offline match across all 3 bot difficulties', () => {
  const rng = createSeededRng('ttr-full-match-2026');
  let match = createLocalMatch(
    {
      playerName: '领航员',
      botLevels: ['EASY', 'MEDIUM', 'ADVANCED'],
    },
    rng,
    '2026-11-13T10:00:00.000Z',
  );

  // Human picks 2 lowest-point tickets to keep it clean
  const initialOffer = projectLocalMatch(match).self!.pendingTicketOffer;
  const kept = [...initialOffer]
    .sort((a, b) => a.points - b.points)
    .slice(0, 2)
    .map((t) => t.id);

  const setupRes = applyHumanAction(match, 'CHOOSE_INITIAL_TICKETS', { keptTicketIds: kept }, rng);
  assert.equal(setupRes.ok, true);
  if (!setupRes.ok) return;
  match = setupRes.match;
  assert.equal(match.state.status, 'IN_PROGRESS');

  // Drive human with simple deterministic draws/claims + step bots until GAME_OVER
  let safety = 0;
  while (match.state.status !== 'GAME_OVER' && safety < 900) {
    safety++;
    if (hasPendingBotTurn(match)) {
      const stepped = stepLocalBot(match, rng);
      assert.ok(stepped);
      match = stepped;
      continue;
    }

    const view = projectLocalMatch(match);
    const phase = view.public.turnPhase;
    if (phase === 'AWAITING_TUNNEL_PAYMENT') {
      const res = applyHumanAction(match, 'CANCEL_TUNNEL', {}, rng);
      assert.equal(res.ok, true);
      if (res.ok) match = res.match;
      continue;
    }
    if (phase === 'SELECTING_TICKETS') {
      const offer = view.self!.pendingTicketOffer;
      const res = applyHumanAction(match, 'CHOOSE_TICKETS', { keptTicketIds: [offer[0].id] }, rng);
      assert.equal(res.ok, true);
      if (res.ok) match = res.match;
      continue;
    }

    // Try claiming any affordable route first to advance toward end-game
    const me = view.public.players.find((p) => p.id === view.self!.playerId)!;
    const owners = new Map(view.public.claims.map((c) => [c.routeId, c.ownerPlayerId]));
    let claimed = false;
    if (phase === 'STANDBY') {
      for (const route of ROUTES) {
        if (owners.has(route.id)) continue;
        if (validateRouteAvailability(route, view.self!.playerId, view.public.players.length, owners)) continue;
        const pay = routePaymentOptions(route, view.self!.trainCards, me.trainCarsRemaining);
        if (pay.length > 0) {
          const res = applyHumanAction(match, 'CLAIM_ROUTE', { routeId: route.id, payment: pay[0] }, rng);
          assert.equal(res.ok, true);
          if (res.ok) {
            match = res.match;
            claimed = true;
            break;
          }
        }
      }
    }
    if (claimed) continue;

    if (view.self!.validActions.includes('DRAW_TRAIN_CARD')) {
      if (view.public.trainDeckCount + view.public.trainDiscardCount > 0) {
        const res = applyHumanAction(match, 'DRAW_TRAIN_CARD', { source: 'DECK' }, rng);
        assert.equal(res.ok, true);
        if (res.ok) match = res.match;
        continue;
      }
      const slot = view.public.faceUpTrainCards.findIndex(
        (c) => c !== null && (phase === 'STANDBY' || c !== 'LOCOMOTIVE'),
      );
      if (slot >= 0) {
        const res = applyHumanAction(match, 'DRAW_TRAIN_CARD', { source: 'FACE_UP', slotIndex: slot }, rng);
        assert.equal(res.ok, true);
        if (res.ok) match = res.match;
        continue;
      }
    }

    const fallback = stepLocalBot(match, rng);
    assert.ok(fallback);
    match = fallback;
  }

  assert.equal(match.state.status, 'GAME_OVER');
  assert.ok(match.state.winnerPlayerIds.length >= 1);
  const finalView = projectLocalMatch(match);
  assert.ok(finalView.public.players.every((p) => p.finalScore !== null));
});

test('computes longest continuous path and final scores cleanly', () => {
  const r1 = ROUTES[0];
  const result = longestContinuousPath([r1]);
  assert.equal(result.length, r1.length);

  const scores = computeFinalScores(
    [
      {
        id: 'p1',
        runningScore: r1.points,
        ticketIds: [],
        stationsRemaining: 3,
      },
      {
        id: 'p2',
        runningScore: 0,
        ticketIds: [],
        stationsRemaining: 2,
      },
    ],
    [{ routeId: r1.id, ownerPlayerId: 'p1' }],
    [],
    DEFS.routes,
    DEFS.tickets,
  );
  const p1Score = scores.scores.find((s) => s.playerId === 'p1');
  assert.equal(p1Score?.europeanExpressBonus, 10);
  assert.equal(p1Score?.total, r1.points + 12 + 10);
  assert.deepEqual(scores.winnerPlayerIds, ['p1']);
});

test('storage safely handles corrupt JSON and persists match progress', () => {
  const storage = makeMemoryStorage();
  storage.setItem(TTR_META_KEY, '{not-valid-json');
  storage.setItem(TTR_ACTIVE_RUN_KEY, '{corrupt');

  const meta = loadTtrMeta(storage);
  assert.equal(meta.preferredDifficulty, 'MEDIUM');
  assert.equal(meta.gamesPlayed, 0);
  assert.equal(loadActiveTtrRun(storage), null);

  const updated = recordTtrMatchOutcome(true, 118, storage);
  assert.equal(updated.gamesPlayed, 1);
  assert.equal(updated.victories, 1);
  assert.equal(updated.bestScore, 118);

  const match = createLocalMatch(
    { playerName: '旅客', botLevels: ['MEDIUM', 'EASY'] },
    createSeededRng('save-test'),
  );
  saveActiveTtrRun(match, storage);
  const loaded = loadActiveTtrRun(storage);
  assert.ok(loaded);
  assert.equal(loaded.humanPlayerId, 'human-1');
});
