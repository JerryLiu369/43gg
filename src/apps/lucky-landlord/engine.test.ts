import test from 'node:test';
import assert from 'node:assert/strict';
import { LANDLORDS, SYMBOLS, VICTORY_CYCLE } from './content.ts';
import type { RunState } from './types.ts';
import {
  BOARD_SIZE,
  commitSpinAndDraft,
  createNewRun,
  enterEndlessMode,
  evaluateSpin,
  getMergeableDefIds,
  mergeTripleSymbol,
  payRentAndAdvanceCycle,
  renovateBoardCell,
  rerollColumn,
  signRentContract,
  spinBoard,
  swapAdjacentCells,
  toggleCellLock,
} from './engine.ts';

test('content database defines 8 streams, >= 50 symbols, and 4 landlords with valid starter decks', () => {
  assert.ok(SYMBOLS.length >= 50, `Expected >= 50 symbols, got ${SYMBOLS.length}`);
  assert.equal(LANDLORDS.length, 4);

  for (const ll of LANDLORDS) {
    const run = createNewRun(ll.id, 1, 42);
    assert.equal(run.board.length, BOARD_SIZE);
    assert.equal(run.deck.length, ll.starterDeckIds.length);
    assert.equal(run.dispatchTokens, ll.dispatchPerCycle);
    const nonPlainCount = run.board.filter((c) => c.room !== 'plain').length;
    assert.equal(nonPlainCount, ll.initialRooms.length);
  }
});

test('spinBoard places unique deck instances and respects locked cells across spins', () => {
  let run = createNewRun('landlady_chen', 1, 1001);
  run = spinBoard(run);
  assert.equal(run.phase, 'post_spin');
  assert.ok(run.currentEval);

  const occupiedIdx = run.board.findIndex((c) => c.symbolUid !== null);
  assert.ok(occupiedIdx >= 0);
  const targetUid = run.board[occupiedIdx].symbolUid!;

  // Lock this cell during post_spin, commit turn, then spin again
  const tokensBefore = run.dispatchTokens;
  run = toggleCellLock(run, occupiedIdx);
  assert.equal(run.board[occupiedIdx].locked, true);
  assert.equal(run.dispatchTokens, tokensBefore - 1);

  run = commitSpinAndDraft(run, null);
  assert.equal(run.phase, 'ready');
  assert.equal(run.board[occupiedIdx].locked, true);

  // Next spin must keep targetUid anchored at occupiedIdx, then release the lock
  run = spinBoard(run);
  assert.equal(run.board[occupiedIdx].symbolUid, targetUid);
  assert.equal(run.board[occupiedIdx].locked, false);
});

test('swapAdjacentCells recalculates synergies purely without permanent bonus double-dipping', () => {
  const baseRun = createNewRun('landlady_chen', 1, 2026);
  // Set up deterministic deck: orange_cat (sym_1) and tuna_can (sym_2)
  baseRun.deck = [
    { uid: 'cat_1', defId: 'orange_cat', stars: 1, permBonus: 0, counter: 0, turnsAlive: 0 },
    { uid: 'can_1', defId: 'tuna_can', stars: 1, permBonus: 0, counter: 0, turnsAlive: 0 },
    { uid: 'tenant_1', defId: 'worker_tenant', stars: 1, permBonus: 0, counter: 0, turnsAlive: 0 },
  ];
  // Clear initial rooms to plain for clean math verification
  for (const c of baseRun.board) c.room = 'plain';

  const rawPlacement: Array<string | null> = Array(BOARD_SIZE).fill(null);
  rawPlacement[0] = 'cat_1'; // (0,0)
  rawPlacement[2] = 'can_1'; // (0,2) — NOT adjacent to (0,0)
  rawPlacement[19] = 'tenant_1';

  let postSpinState: RunState = {
    ...baseRun,
    phase: 'post_spin',
    rawSpinSymbolUids: rawPlacement,
    board: baseRun.board.map((c, i) => ({ ...c, symbolUid: rawPlacement[i] })),
    currentEval: evaluateSpin(baseRun, rawPlacement),
  };

  const evalApart = postSpinState.currentEval!;
  assert.equal(evalApart.totalCoins, 2 + 1 + 2); // cat(2) + can(1) + tenant(2) = 5

  // Swap cell 0 (cat) with cell 1 (empty) so cat moves to (0,1), adjacent to can at (0,2)!
  postSpinState = swapAdjacentCells(postSpinState, 0, 1);
  const evalTogether = postSpinState.currentEval!;
  // Cat(2 + 9 burst) + Can(1, destroyed) + Tenant(2) = 14
  assert.equal(evalTogether.totalCoins, 14);
  assert.equal(evalTogether.cells[2].destroyed, true);

  // Swap cat back from cell 1 to cell 0 -> must cleanly revert to 5 with zero permanent mutation leak!
  postSpinState = swapAdjacentCells(postSpinState, 1, 0);
  assert.equal(postSpinState.currentEval!.totalCoins, 5);
  assert.equal(postSpinState.deck[0].permBonus, 0);
});

test('actuary_lin gets first column reroll free and subsequent column reroll costs 1 dispatch token', () => {
  let run = createNewRun('actuary_lin', 1, 777);
  run = spinBoard(run);
  const startTokens = run.dispatchTokens;

  run = rerollColumn(run, 0);
  assert.equal(run.dispatchTokens, startTokens, 'First column reroll for actuary_lin should be free');
  assert.equal(run.usedFreeColRerollThisSpin, true);

  run = rerollColumn(run, 1);
  assert.equal(run.dispatchTokens, startTokens - 1, 'Second column reroll should cost 1 token');
});

test('room renovations apply gold_shop x2, express_hub dismantle refund, and quiet_suite thief protection', () => {
  let run = createNewRun('guild_master_zhao', 1, 555);
  for (const c of run.board) c.room = 'plain';
  run.renovationTickets = 3;

  run = renovateBoardCell(run, 0, 'gold_shop');
  run = renovateBoardCell(run, 1, 'express_hub');
  run = renovateBoardCell(run, 10, 'quiet_suite');
  assert.equal(run.renovationTickets, 0);

  run.deck = [
    { uid: 'u_cat', defId: 'orange_cat', stars: 1, permBonus: 0, counter: 0, turnsAlive: 0 },
    { uid: 'u_can', defId: 'tuna_can', stars: 1, permBonus: 0, counter: 0, turnsAlive: 0 },
    { uid: 'u_thief', defId: 'thief', stars: 1, permBonus: 0, counter: 0, turnsAlive: 0 },
  ];

  const placement: Array<string | null> = Array(BOARD_SIZE).fill(null);
  placement[0] = 'u_cat'; // on gold_shop (x2)
  placement[1] = 'u_can'; // on express_hub (adjacent to cat -> eaten -> +8 refund & +1 dispatch!)
  placement[10] = 'u_thief'; // on quiet_suite -> thief steal neutralized to 0!

  const ev = evaluateSpin(run, placement);
  // Cat: (base 2 + eat 9) * 2 (gold_shop) = 22
  assert.equal(ev.cells[0].finalCoins, 22);
  // Can on express_hub: base 1 + hub flat 2 + hub dismantle 8 = 11, and +1 dispatchEarned
  assert.equal(ev.cells[1].finalCoins, 11);
  assert.equal(ev.dispatchEarned, 1);
  // Thief on quiet_suite: 0 instead of -2
  assert.equal(ev.cells[10].finalCoins, 0);
});

test('mergeTripleSymbol combines three 1-star copies into one 2-star golden card preserving permBonus', () => {
  let run = createNewRun('botanist_su', 1, 888);
  run.deck = [
    { uid: 'm1', defId: 'milk_tea', stars: 1, permBonus: 2, counter: 0, turnsAlive: 3 },
    { uid: 'm2', defId: 'milk_tea', stars: 1, permBonus: 1, counter: 0, turnsAlive: 1 },
    { uid: 'm3', defId: 'milk_tea', stars: 1, permBonus: 0, counter: 0, turnsAlive: 0 },
    { uid: 'b1', defId: 'boba_pearl', stars: 1, permBonus: 0, counter: 0, turnsAlive: 0 },
  ];

  const mergeable = getMergeableDefIds(run);
  assert.deepEqual(mergeable, ['milk_tea']);

  const coinsBefore = run.coins;
  run = mergeTripleSymbol(run, 'milk_tea');

  assert.equal(run.deck.length, 2, 'Deck should shrink from 4 to 2');
  const merged = run.deck.find((s) => s.defId === 'milk_tea')!;
  assert.equal(merged.stars, 2);
  assert.equal(merged.permBonus, 3, 'Accumulated permBonus should sum into merged card');
  assert.equal(run.coins, coinsBefore + 15, 'Botanist Su grants +15 coins on merge');
});

test('rent payment, optional contract signing, cycle 12 victory, and endless transition work end-to-end', () => {
  let run = createNewRun('actuary_lin', 1, 999);
  run.coins = 200;
  run.spinsLeftInCycle = 1;
  run = spinBoard(run);
  run = commitSpinAndDraft(run, null);

  assert.equal(run.phase, 'rent_due');
  assert.ok(run.pendingRelicChoices.length > 0);
  assert.ok(run.pendingContractChoices.length > 0);

  const contractId = run.pendingContractChoices[0];
  run = signRentContract(run, contractId);
  assert.equal(run.signedContractThisCycle, true);
  assert.equal(run.activeContracts.length, 1);

  const chosenRelic = run.pendingRelicChoices[0];
  run = payRentAndAdvanceCycle(run, chosenRelic);
  assert.equal(run.phase, 'ready');
  assert.equal(run.cycle, 2);
  assert.ok(run.relicIds.includes(chosenRelic));

  // Simulate Cycle 12 victory -> Endless transition
  run.cycle = VICTORY_CYCLE;
  run.coins = 5000;
  run.rentTarget = 2300;
  run.phase = 'rent_due';
  run = payRentAndAdvanceCycle(run, null);
  assert.equal(run.phase, 'victory');

  run = enterEndlessMode(run);
  assert.equal(run.isEndless, true);
  assert.equal(run.phase, 'ready');
  assert.equal(run.cycle, VICTORY_CYCLE + 1);
});
