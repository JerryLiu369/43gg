import {
  BASE_RENT_SCHEDULE,
  CONTRACTS,
  CONTRACTS_BY_ID,
  LANDLORDS_BY_ID,
  MARKET_EVENTS,
  MARKET_EVENTS_BY_ID,
  RARITY_META,
  RELICS,
  ROOMS_BY_ID,
  STREAMS_BY_ID,
  SYMBOLS,
  SYMBOLS_BY_ID,
  VICTORY_CYCLE,
} from './content.ts';
import type {
  BoardCell,
  CellEvalDetail,
  LandlordId,
  RarityId,
  RoomTypeId,
  RunState,
  SpinEvaluation,
  StreamId,
  SymbolInstance,
} from './types.ts';

export const BOARD_ROWS = 4;
export const BOARD_COLS = 5;
export const BOARD_SIZE = BOARD_ROWS * BOARD_COLS;

const STAR2_BASE_COINS: Record<string, number> = {
  milk_tea: 7,
  boba_pearl: 4,
  lemon_tea: 9,
  delivery_rider: 7,
  bbq_stall: 9,
  night_foodie: 10,
  supreme_tea_barrel: 18,
  orange_cat: 7,
  tuna_can: 4,
  calico_cat: 7,
  catnip_pot: 7,
  cat_tree: 10,
  koi_tank: 9,
  fortune_gold_cat: 16,
  worker_tenant: 8,
  mahjong_pal: 7,
  red_dragon_tile: 7,
  hardware_boss: 9,
  security_guard: 9,
  warm_landlady: 10,
  chess_parlor: 16,
  sunflower: 7,
  succulent: 5,
  sun_rain: 7,
  honey_bee: 7,
  watering_can: 7,
  kumquat_tree: 11,
  money_tree: 16,
  raw_ore: 3,
  oyster: 5,
  sea_pearl: 10,
  miner: 7,
  steel_pickaxe: 7,
  ice_jade: 14,
  amethyst_vault: 16,
  parcel_box: 4,
  utility_knife: 7,
  smart_locker: 9,
  flea_stall: 7,
  blind_box: 12,
  group_buy_leader: 15,
  lucky_coin: 7,
  lucky_dice: 0,
  piggy_bank: 3,
  iron_hammer: 7,
  thief: -2,
  vault_safe: 6,
  master_key: 8,
  lease_contract: 7,
  for_rent_sign: 7,
  renovation_crew: 7,
  school_plaque: 11,
  red_deed: 10,
  demolition_notice: 18,
};

/** Deterministic 32-bit PRNG step returning [nextState, floatIn0To1] */
export function nextRandom(rngState: number): [number, number] {
  let t = (rngState + 0x6d2b79f5) | 0;
  const nextState = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const floatVal = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [nextState, floatVal];
}

export function getSymbolBaseCoins(defId: string, stars: 1 | 2): number {
  const def = SYMBOLS_BY_ID[defId];
  if (!def) return 1;
  if (stars === 2) {
    return STAR2_BASE_COINS[defId] ?? def.baseCoins * 3;
  }
  return def.baseCoins;
}

export function getAdjacentIndices(index: number): number[] {
  const r = Math.floor(index / BOARD_COLS);
  const c = index % BOARD_COLS;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < BOARD_ROWS && nc >= 0 && nc < BOARD_COLS) {
        out.push(nr * BOARD_COLS + nc);
      }
    }
  }
  return out;
}

export function getOrthogonalIndices(index: number): number[] {
  const r = Math.floor(index / BOARD_COLS);
  const c = index % BOARD_COLS;
  const out: number[] = [];
  const deltas = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  for (const [dr, dc] of deltas) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < BOARD_ROWS && nc >= 0 && nc < BOARD_COLS) {
      out.push(nr * BOARD_COLS + nc);
    }
  }
  return out;
}

export function areCellsAdjacent(a: number, b: number): boolean {
  if (a === b || a < 0 || b < 0 || a >= BOARD_SIZE || b >= BOARD_SIZE) return false;
  const ra = Math.floor(a / BOARD_COLS);
  const ca = a % BOARD_COLS;
  const rb = Math.floor(b / BOARD_COLS);
  const cb = b % BOARD_COLS;
  return Math.abs(ra - rb) <= 1 && Math.abs(ca - cb) <= 1;
}

export function getRowPeerIndices(index: number): number[] {
  const r = Math.floor(index / BOARD_COLS);
  const out: number[] = [];
  for (let c = 0; c < BOARD_COLS; c++) {
    const idx = r * BOARD_COLS + c;
    if (idx !== index) out.push(idx);
  }
  return out;
}

export function getColPeerIndices(index: number): number[] {
  const c = index % BOARD_COLS;
  const out: number[] = [];
  for (let r = 0; r < BOARD_ROWS; r++) {
    const idx = r * BOARD_COLS + c;
    if (idx !== index) out.push(idx);
  }
  return out;
}

export function computeCycleRentGoal(
  cycle: number,
  landlordId: LandlordId,
  ascension: number,
  relicIds: string[],
  activeContracts: Array<{ contractId: string; remainingCycles: number }>,
): { rentTarget: number; spinsAllowed: number } {
  const landlord = LANDLORDS_BY_ID[landlordId];
  let baseRent: number;
  let spinsAllowed: number;

  if (cycle <= BASE_RENT_SCHEDULE.length) {
    const entry = BASE_RENT_SCHEDULE[cycle - 1];
    baseRent = entry.rent;
    spinsAllowed = entry.spins;
  } else {
    const extra = cycle - BASE_RENT_SCHEDULE.length;
    const last = BASE_RENT_SCHEDULE[BASE_RENT_SCHEDULE.length - 1];
    baseRent = Math.round(last.rent * Math.pow(1.38, extra));
    spinsAllowed = 7;
  }

  // Ascension scaling: +9% rent per ascension step above 1, and -1 spin on late cycles at Asc >= 6
  const ascMultiplier = 1 + Math.max(0, ascension - 1) * 0.09;
  let rent = baseRent * ascMultiplier;

  if (ascension >= 6 && spinsAllowed > 5 && cycle >= 6) {
    spinsAllowed -= 1;
  }

  // Landlord discount
  rent *= 1 - landlord.rentDiscountRatio;

  // Relic tax waiver
  if (relicIds.includes('property_tax_waiver')) {
    rent *= 0.9;
  }

  // Active contract rent multipliers
  for (const ac of activeContracts) {
    const cDef = CONTRACTS_BY_ID[ac.contractId];
    if (cDef?.rentTargetMultiplier) {
      rent *= cDef.rentTargetMultiplier;
    }
  }

  return {
    rentTarget: Math.max(15, Math.round(rent / 5) * 5),
    spinsAllowed,
  };
}

export function getRenovationCoinCost(state: RunState, room: RoomTypeId): number {
  const def = ROOMS_BY_ID[room];
  const base = def.baseCostCoins + state.renovationsCount * 18;
  const discount = state.relicIds.includes('renovation_handbook') ? 0.65 : 1;
  return Math.max(15, Math.round(base * discount));
}

function createSymbolInstance(defId: string, uidNum: number, stars: 1 | 2 = 1): SymbolInstance {
  return {
    uid: `sym_${uidNum}`,
    defId,
    stars,
    permBonus: 0,
    counter: 0,
    turnsAlive: 0,
  };
}

export function rollDraftChoices(
  rngState: number,
  cycle: number,
  count: number,
): [number, string[]] {
  let rng = rngState;
  const choices: string[] = [];
  const used = new Set<string>();

  // Rarity weights shift generously as cycles advance
  const weights: Record<RarityId, number> = {
    common: Math.max(32, RARITY_META.common.weight - cycle * 3),
    uncommon: RARITY_META.uncommon.weight + Math.min(12, cycle * 1.5),
    rare: RARITY_META.rare.weight + Math.max(0, (cycle - 1) * 2.2),
    epic: cycle >= 3 ? RARITY_META.epic.weight + (cycle - 2) * 1.4 : 0.8,
  };

  const candidatesPool = SYMBOLS.filter((s) => s.id !== 'sea_pearl');

  for (let i = 0; i < count; i++) {
    let totalW = 0;
    const available = candidatesPool.filter((s) => !used.has(s.id));
    for (const sym of available) {
      totalW += weights[sym.rarity];
    }
    let roll: number;
    [rng, roll] = nextRandom(rng);
    let target = roll * totalW;
    let picked = available[0];
    for (const sym of available) {
      target -= weights[sym.rarity];
      if (target <= 0) {
        picked = sym;
        break;
      }
    }
    used.add(picked.id);
    choices.push(picked.id);
  }

  return [rng, choices];
}

export function createNewRun(
  landlordId: LandlordId,
  ascension = 1,
  seed = Date.now() & 0x7fffffff,
): RunState {
  const landlord = LANDLORDS_BY_ID[landlordId];
  let uidCounter = 1;
  const deck: SymbolInstance[] = landlord.starterDeckIds.map((defId) =>
    createSymbolInstance(defId, uidCounter++, 1),
  );

  const board: BoardCell[] = Array.from({ length: BOARD_SIZE }, (_, idx) => ({
    index: idx,
    room: 'plain',
    locked: false,
    lockedSymbolUid: null,
    symbolUid: null,
  }));

  for (const initRoom of landlord.initialRooms) {
    if (board[initRoom.cellIndex]) {
      board[initRoom.cellIndex].room = initRoom.room;
    }
  }

  // Place starter symbols onto initial preview positions (including initial renovated room first)
  const previewSlots = [
    ...landlord.initialRooms.map((r) => r.cellIndex),
    6,
    7,
    8,
    11,
    12,
    13,
  ];
  const usedPreviewSlots = new Set<number>();
  let deckIdx = 0;
  for (const slot of previewSlots) {
    if (deckIdx >= deck.length) break;
    if (usedPreviewSlots.has(slot)) continue;
    usedPreviewSlots.add(slot);
    board[slot].symbolUid = deck[deckIdx].uid;
    deckIdx++;
  }

  const goal = computeCycleRentGoal(1, landlordId, ascension, [], []);

  return {
    version: 1,
    seed,
    rngState: seed || 1234567,
    nextUidCounter: uidCounter,
    landlordId,
    ascension: Math.max(1, Math.min(10, ascension)),
    isEndless: false,
    phase: 'ready',

    coins: 5,
    totalCoinsEarned: 5,
    bestSingleSpin: 0,
    totalSpins: 0,

    cycle: 1,
    spinsLeftInCycle: goal.spinsAllowed,
    spinsPerCycle: goal.spinsAllowed,
    rentTarget: goal.rentTarget,

    dispatchTokens: landlord.dispatchPerCycle,
    maxDispatchTokens: landlord.dispatchPerCycle + 2,
    usedFreeColRerollThisSpin: false,
    removeTokens: landlord.startingRemoveTokens,
    renovationTickets: landlord.startingRenovationTickets,
    renovationsCount: landlord.initialRooms.length,
    mergesCount: 0,

    deck,
    board,
    rawSpinSymbolUids: Array(BOARD_SIZE).fill(null),
    currentEval: null,

    draftChoices: [],
    relicIds: [],
    pendingRelicChoices: [],
    pendingContractChoices: [],
    signedContractThisCycle: false,
    activeContracts: [],
    currentEventId: null,

    lastTurnSummary: ['新账本已开启，点击「摇动账本」开始第一轮收租！'],
  };
}

/** Pure deterministic evaluation of a 4x5 symbol placement against current RunState */
export function evaluateSpin(
  state: RunState,
  boardSymbolUids: ReadonlyArray<string | null>,
): SpinEvaluation {
  // Clone deck instances so evaluation never mutates state.deck directly
  const workingByUid = new Map<string, SymbolInstance>();
  for (const inst of state.deck) {
    workingByUid.set(inst.uid, { ...inst });
  }

  const cells: CellEvalDetail[] = Array.from({ length: BOARD_SIZE }, (_, idx) => {
    const uid = boardSymbolUids[idx] ?? null;
    const inst = uid ? workingByUid.get(uid) ?? null : null;
    return {
      cellIndex: idx,
      symbolUid: inst ? inst.uid : null,
      defId: inst ? inst.defId : null,
      stars: inst ? inst.stars : 1,
      baseCoins: 0,
      synergyCoins: 0,
      roomMultiplier: 1,
      finalCoins: 0,
      notes: [],
      destroyed: false,
      spawnedDefIds: [],
    };
  });

  const hasRelic = (id: string) => state.relicIds.includes(id);
  const spawnedInstances: SymbolInstance[] = [];
  let tempUid = state.nextUidCounter;
  let dispatchEarned = 0;
  const removeTokensEarned = 0;
  let renovationTicketsEarned = 0;
  let totalDestructions = 0;

  // Deterministic per-spin hash for dice so swapping other cells doesn't erratically re-roll unmoved dice
  const diceValueAtCell = (cellIdx: number, stars: 1 | 2): number => {
    const h = Math.imul(state.totalSpins * 37 + cellIdx * 131 + state.seed, 2654435761) >>> 0;
    if (stars === 2) {
      return 6 + (h % 9); // 6..14
    }
    const minRoll = hasRelic('loaded_dice_cup') ? 4 : 1;
    const range = 6 - minRoll + 1;
    return minRoll + (h % range);
  };

  // Pre-count board composition
  const streamCounts = new Map<StreamId, number>();
  let renovatedCount = 0;
  let emptyCellCount = 0;

  for (let i = 0; i < BOARD_SIZE; i++) {
    if (state.board[i].room !== 'plain') renovatedCount++;
    const defId = cells[i].defId;
    if (!defId) {
      emptyCellCount++;
      continue;
    }
    const def = SYMBOLS_BY_ID[defId];
    if (def) {
      streamCounts.set(def.stream, (streamCounts.get(def.stream) ?? 0) + 1);
    }
  }

  // Check quiet_suite protection aura (cell itself + orthogonal neighbors)
  const isProtectedByQuietSuite = (idx: number): boolean => {
    if (state.board[idx].room === 'quiet_suite') return true;
    return getOrthogonalIndices(idx).some((n) => state.board[n].room === 'quiet_suite');
  };

  // Pass 1: Base output + permanent bonus + stream relics + room flat bonuses
  for (let i = 0; i < BOARD_SIZE; i++) {
    const room = state.board[i].room;
    const detail = cells[i];
    if (!detail.symbolUid || !detail.defId) {
      if (room === 'express_hub') {
        detail.baseCoins = 2;
        detail.notes.push('驿站保底 +2');
      }
      continue;
    }

    const inst = workingByUid.get(detail.symbolUid)!;
    const def = SYMBOLS_BY_ID[detail.defId]!;
    inst.turnsAlive += 1;

    let base = getSymbolBaseCoins(def.id, inst.stars) + inst.permBonus;

    if (def.id === 'lucky_dice') {
      const roll = diceValueAtCell(i, inst.stars);
      base += roll;
      detail.notes.push(`掷出 ${roll} 点`);
      if ((inst.stars === 1 && roll === 6) || (inst.stars === 2 && roll === 14)) {
        const crit = inst.stars === 2 ? 8 : 4;
        detail.synergyCoins += crit;
        detail.notes.push(`豹子暴击 +${crit}`);
      }
    }

    if (def.id === 'thief' && isProtectedByQuietSuite(i)) {
      base = 0;
      detail.notes.push('隔音防盗 0');
    }

    // Stream relic flat bonuses
    if (def.stream === 'tea_night' && hasRelic('sweet_syrup_ladle')) base += 1;
    if (def.stream === 'pet' && hasRelic('silver_cat_bell')) base += 1;
    if (def.stream === 'folk' && hasRelic('mahjong_score_pad')) base += 1;
    if (def.stream === 'garden' && hasRelic('organic_fertilizer')) base += 1;
    if (
      (def.id === 'sea_pearl' || def.id === 'ice_jade' || def.id === 'lucky_coin') &&
      hasRelic('jeweler_loupe')
    ) {
      base += 3;
    }
    if (
      (def.stream === 'express' || def.id === 'delivery_rider') &&
      hasRelic('electric_scooter_battery')
    ) {
      base += 2;
    }
    if (def.stream === 'curio' && hasRelic('loaded_dice_cup')) base += 1;
    if (
      def.stream === 'tea_night' &&
      hasRelic('night_market_neon') &&
      (streamCounts.get('tea_night') ?? 0) >= 3
    ) {
      base += 3;
    }
    if (inst.stars === 2 && hasRelic('golden_trowel')) {
      base += 5;
    }

    // Room flat bonuses
    if (
      room === 'sun_greenhouse' &&
      (def.stream === 'garden' || def.stream === 'pet' || def.stream === 'tea_night')
    ) {
      base += 3;
      detail.notes.push('温室滋养 +3');
    }
    if (room === 'express_hub') {
      base += 2;
      detail.notes.push('驿站驻点 +2');
    }

    detail.baseCoins = base;
  }

  const markDestroyed = (targetCellIdx: number, reasonNote: string) => {
    const target = cells[targetCellIdx];
    if (target.destroyed || !target.symbolUid) return;
    target.destroyed = true;
    totalDestructions += 1;
    target.notes.push(reasonNote);
    if (state.board[targetCellIdx].room === 'express_hub') {
      target.synergyCoins += 8;
      dispatchEarned += 1;
      target.notes.push('驿站拆解返利 +8 / 调度令+1');
    }
  };

  const queueSpawn = (cellIdx: number, newDefId: string, stars: 1 | 2 = 1) => {
    if (state.deck.length + spawnedInstances.length >= 32) return;
    cells[cellIdx].spawnedDefIds.push(newDefId);
    spawnedInstances.push(createSymbolInstance(newDefId, tempUid++, stars));
  };

  // Pass 2: Security Guard vs Thief, Consumptions, Breakers & Openers
  const guardIndices = cells
    .filter((c) => c.defId === 'security_guard' && !c.destroyed)
    .map((c) => c.cellIndex);

  if (guardIndices.length > 0) {
    const primaryGuard = cells[guardIndices[0]];
    for (const c of cells) {
      if (c.defId === 'thief' && !c.destroyed) {
        const bounty = primaryGuard.stars === 2 ? 50 : 25;
        primaryGuard.synergyCoins += bounty;
        primaryGuard.notes.push(`抓获小偷 +${bounty}`);
        if (c.stars === 2) {
          c.synergyCoins += 55;
          dispatchEarned += 1;
          c.notes.push('大盗赃款 +55 / 调度令+1');
        } else {
          c.baseCoins = 0;
        }
        markDestroyed(c.cellIndex, '落网除名');
      }
    }
  }

  for (let i = 0; i < BOARD_SIZE; i++) {
    const detail = cells[i];
    if (!detail.symbolUid || !detail.defId || detail.destroyed) continue;
    const inst = workingByUid.get(detail.symbolUid)!;
    const adj = getAdjacentIndices(i);

    // 1) Milk Tea consumes adjacent boba_pearl & harvests kumquat_tree
    if (detail.defId === 'milk_tea') {
      for (const nIdx of adj) {
        const nb = cells[nIdx];
        if (!nb.symbolUid || nb.destroyed) continue;
        if (nb.defId === 'boba_pearl') {
          const burst = (inst.stars === 2 ? 10 : 6) + (nb.stars === 2 ? 10 : 0);
          const perm = inst.stars === 2 ? 3 : 1;
          detail.synergyCoins += burst;
          inst.permBonus += perm;
          detail.notes.push(`吸珍珠 +${burst} (永久+${perm})`);
          markDestroyed(nIdx, '化入奶茶');
        } else if (nb.defId === 'kumquat_tree') {
          const teaGain = inst.stars === 2 ? 8 : 5;
          const treeGain = nb.stars === 2 ? 8 : 3;
          detail.synergyCoins += teaGain;
          nb.synergyCoins += treeGain;
          detail.notes.push(`鲜摘金桔 +${teaGain}`);
          nb.notes.push(`茶社采果 +${treeGain}`);
        }
      }
    }

    // 2) Supreme Tea Barrel consumes ALL remaining boba_pearl on board
    if (detail.defId === 'supreme_tea_barrel') {
      for (let t = 0; t < BOARD_SIZE; t++) {
        const nb = cells[t];
        if (nb.defId === 'boba_pearl' && !nb.destroyed) {
          const burst = (inst.stars === 2 ? 20 : 10) + (nb.stars === 2 ? 10 : 0);
          const perm = inst.stars === 2 ? 4 : 2;
          detail.synergyCoins += burst;
          inst.permBonus += perm;
          detail.notes.push(`吨吨吸料 +${burst}`);
          markDestroyed(t, '收入茶桶');
        }
      }
    }

    // 3) Orange Cat consumes adjacent tuna_can
    if (detail.defId === 'orange_cat') {
      for (const nIdx of adj) {
        const nb = cells[nIdx];
        if (nb.defId === 'tuna_can' && !nb.destroyed) {
          const bellBonus = hasRelic('silver_cat_bell') ? 4 : 0;
          const burst =
            (inst.stars === 2 ? 18 : 9) + (nb.stars === 2 ? 12 : 0) + bellBonus;
          const perm = inst.stars === 2 ? 3 : 1;
          detail.synergyCoins += burst;
          inst.permBonus += perm;
          detail.notes.push(`炫罐头 +${burst} (永久+${perm})`);
          markDestroyed(nIdx, '被猫吃光');
        }
      }
    }

    // 4) Breakers: miner, steel_pickaxe, iron_hammer
    if (
      detail.defId === 'miner' ||
      detail.defId === 'steel_pickaxe' ||
      detail.defId === 'iron_hammer'
    ) {
      for (const nIdx of adj) {
        const nb = cells[nIdx];
        if (!nb.symbolUid || nb.destroyed) continue;

        if (nb.defId === 'raw_ore') {
          const oreBurst = nb.stars === 2 ? 32 : 14;
          nb.synergyCoins += oreBurst;
          queueSpawn(nIdx, 'ice_jade', nb.stars);
          markDestroyed(nIdx, `出翡翠 +${oreBurst}`);

          if (detail.defId === 'miner') {
            const wage = inst.stars === 2 ? 16 : 8;
            const perm = inst.stars === 2 ? 2 : 1;
            detail.synergyCoins += wage;
            inst.permBonus += perm;
            detail.notes.push(`采矿赏金 +${wage}`);
          } else if (detail.defId === 'steel_pickaxe') {
            const bonus = inst.stars === 2 ? 12 : 4;
            detail.synergyCoins += bonus;
            detail.notes.push(`镐击碎矿 +${bonus}`);
          } else {
            const bonus = inst.stars === 2 ? 14 : 6;
            detail.synergyCoins += bonus;
            detail.notes.push(`锤碎原石 +${bonus}`);
          }
        } else if (
          nb.defId === 'piggy_bank' &&
          (detail.defId === 'steel_pickaxe' || detail.defId === 'iron_hammer')
        ) {
          const nbInst = workingByUid.get(nb.symbolUid)!;
          const saved = Math.max(6, nbInst.permBonus + 6);
          const mult = nb.stars === 2 ? 3.5 : 3;
          const payout = Math.round(saved * mult);
          nb.synergyCoins += payout;
          markDestroyed(nIdx, `砸罐暴富 +${payout}`);
          const toolBonus = inst.stars === 2 ? 14 : 6;
          detail.synergyCoins += toolBonus;
          detail.notes.push(`破罐奖励 +${toolBonus}`);
        }
      }
    }

    // 5) Openers: utility_knife & master_key
    if (detail.defId === 'utility_knife' || detail.defId === 'master_key') {
      for (const nIdx of adj) {
        const nb = cells[nIdx];
        if (!nb.symbolUid || nb.destroyed) continue;

        const eventExtra =
          state.currentEventId === 'double_eleven_boom' ? 5 : 0;
        const gloveExtra = hasRelic('auto_cutter_gloves') ? 8 : 0;

        if (nb.defId === 'parcel_box') {
          const boxBurst = (nb.stars === 2 ? 28 : 12) + eventExtra + gloveExtra;
          nb.synergyCoins += boxBurst;
          if (nb.stars === 2) dispatchEarned += 1;
          queueSpawn(nIdx, 'blind_box', 1);
          markDestroyed(nIdx, `秒拆快递 +${boxBurst}`);

          const openerGain = inst.stars === 2 ? 14 : 6;
          detail.synergyCoins += openerGain;
          detail.notes.push(`拆包提成 +${openerGain}`);
        } else if (nb.defId === 'blind_box' && detail.defId === 'utility_knife') {
          const blindBurst = (nb.stars === 2 ? 48 : 22) + eventExtra + gloveExtra;
          nb.synergyCoins += blindBurst;
          markDestroyed(nIdx, `开出隐藏款 +${blindBurst}`);

          const openerGain = inst.stars === 2 ? 14 : 6;
          detail.synergyCoins += openerGain;
          detail.notes.push(`开盒惊喜 +${openerGain}`);
        } else if (nb.defId === 'vault_safe' && detail.defId === 'master_key') {
          const safeBurst = nb.stars === 2 ? 80 : 36;
          nb.synergyCoins += safeBurst;
          if (nb.stars === 2) renovationTicketsEarned += 1;
          queueSpawn(nIdx, 'ice_jade', nb.stars);
          markDestroyed(nIdx, `开启金柜 +${safeBurst}`);

          const keyGain = inst.stars === 2 ? 15 : 6;
          detail.synergyCoins += keyGain;
          detail.notes.push(`开锁赏金 +${keyGain}`);
        }
      }
    }
  }

  // Pass 3: Countdowns, Watering Can & Piggy Bank growth for surviving symbols
  for (let i = 0; i < BOARD_SIZE; i++) {
    const detail = cells[i];
    if (!detail.symbolUid || !detail.defId || detail.destroyed) continue;
    const inst = workingByUid.get(detail.symbolUid)!;
    const room = state.board[i].room;
    const adj = getAdjacentIndices(i);

    let step = room === 'sun_greenhouse' ? 2 : 1;
    for (const nIdx of adj) {
      if (cells[nIdx].defId === 'sun_rain' && !cells[nIdx].destroyed) {
        step += cells[nIdx].stars === 2 ? 2 : 1;
      }
    }

    if (detail.defId === 'piggy_bank') {
      const saveAdd = inst.stars === 2 ? 6 : 3;
      inst.permBonus += saveAdd;
      detail.notes.push(`储蓄累计 +${inst.permBonus}`);
    }

    if (detail.defId === 'watering_can') {
      const growAmt = inst.stars === 2 ? 2 : 1;
      for (const nIdx of adj) {
        const nb = cells[nIdx];
        if (
          nb.symbolUid &&
          !nb.destroyed &&
          (nb.defId === 'succulent' ||
            nb.defId === 'kumquat_tree' ||
            nb.defId === 'money_tree')
        ) {
          const nbInst = workingByUid.get(nb.symbolUid)!;
          nbInst.permBonus += growAmt;
          detail.synergyCoins += growAmt * 2;
          nb.notes.push(`浇水永久+${growAmt}`);
        }
      }
    }

    if (detail.defId === 'succulent') {
      inst.counter += step;
      const threshold = inst.stars === 2 ? 2 : 3;
      if (inst.counter >= threshold) {
        inst.counter = 0;
        const inc = inst.stars === 2 ? 2 : 1;
        inst.permBonus += inc;
        detail.notes.push(`多肉长大 永久+${inc}`);
      }
    }

    if (detail.defId === 'koi_tank') {
      inst.counter += step;
      if (inst.counter >= 3) {
        inst.counter = 0;
        const burst = inst.stars === 2 ? 28 : 12;
        detail.synergyCoins += burst;
        if (inst.stars === 2) dispatchEarned += 1;
        detail.notes.push(`锦鲤吐瑞 +${burst}`);
      }
    }

    if (detail.defId === 'money_tree') {
      inst.counter += step;
      if (inst.counter >= 3) {
        inst.counter = 0;
        const burst = inst.stars === 2 ? 24 : 10;
        detail.synergyCoins += burst;
        if (inst.stars === 2) {
          inst.permBonus += 2;
        } else {
          queueSpawn(i, 'lucky_coin', 1);
        }
        detail.notes.push(`摇钱落宝 +${burst}`);
      }
    }

    if (detail.defId === 'oyster') {
      inst.counter += step;
      const threshold = inst.stars === 2 ? 3 : 4;
      if (inst.counter >= threshold) {
        inst.counter = 0;
        const burst = inst.stars === 2 ? 15 : 6;
        detail.synergyCoins += burst;
        queueSpawn(i, 'sea_pearl', 1);
        detail.notes.push(`孕育珍珠 +${burst}`);
      }
    }

    if (detail.defId === 'parcel_box') {
      const autoStep = hasRelic('auto_cutter_gloves') ? step * 2 : step;
      inst.counter += autoStep;
      if (inst.counter >= 3) {
        const gloveExtra = hasRelic('auto_cutter_gloves') ? 8 : 0;
        const eventExtra = state.currentEventId === 'double_eleven_boom' ? 5 : 0;
        const burst = (inst.stars === 2 ? 28 : 12) + gloveExtra + eventExtra;
        detail.synergyCoins += burst;
        if (inst.stars === 2) dispatchEarned += 1;
        queueSpawn(i, 'blind_box', 1);
        markDestroyed(i, `自动拆箱 +${burst}`);
      }
    }

    if (detail.defId === 'smart_locker') {
      inst.counter += step;
      if (inst.counter >= 3) {
        inst.counter = 0;
        if (inst.stars === 2) dispatchEarned += 1;
        queueSpawn(i, 'parcel_box', 1);
        detail.notes.push('新件入柜');
      }
    }

    if (detail.defId === 'renovation_crew') {
      inst.counter += step;
      const threshold = inst.stars === 2 ? 4 : 5;
      if (inst.counter >= threshold) {
        inst.counter = 0;
        const bonus = inst.stars === 2 ? 16 : 8;
        detail.synergyCoins += bonus;
        renovationTicketsEarned += 1;
        detail.notes.push(`施工完毕 +${bonus} / 装修券+1`);
      }
    }
  }

  // Re-count surviving tags/streams for Pass 4 global/adjacent synergies
  const allMahjongCount = cells.filter(
    (c) => c.defId && !c.destroyed && SYMBOLS_BY_ID[c.defId]?.tags.includes('mahjong'),
  ).length;
  const allGemCount = cells.filter(
    (c) => c.defId && !c.destroyed && SYMBOLS_BY_ID[c.defId]?.tags.includes('gem'),
  ).length;
  const allCoinCount = cells.filter(
    (c) => c.defId && !c.destroyed && SYMBOLS_BY_ID[c.defId]?.tags.includes('coin'),
  ).length;
  const hasBankOrVault = cells.some(
    (c) =>
      !c.destroyed && (c.defId === 'piggy_bank' || c.defId === 'amethyst_vault'),
  );

  // Pass 4: Positional & Global Symbol Synergies
  for (let i = 0; i < BOARD_SIZE; i++) {
    const detail = cells[i];
    if (!detail.symbolUid || !detail.defId || detail.destroyed) continue;
    const inst = workingByUid.get(detail.symbolUid)!;
    const def = SYMBOLS_BY_ID[detail.defId]!;
    const adj = getAdjacentIndices(i);
    const room = state.board[i].room;

    if (def.id === 'milk_tea' && inst.stars === 2) {
      const nightCount = streamCounts.get('tea_night') ?? 0;
      if (nightCount > 1) {
        const extra = nightCount - 1;
        detail.synergyCoins += extra;
        detail.notes.push(`招牌人气 +${extra}`);
      }
    }

    if (def.id === 'lemon_tea') {
      let matches = 0;
      for (const nIdx of adj) {
        const nId = cells[nIdx].defId;
        if (nId === 'bbq_stall' || nId === 'night_foodie') matches++;
      }
      if (matches > 0) {
        const gain = matches * (inst.stars === 2 ? 7 : 3);
        detail.synergyCoins += gain;
        detail.notes.push(`清爽解腻 +${gain}`);
      }
    }

    if (def.id === 'delivery_rider') {
      const peers =
        inst.stars === 2
          ? [...getRowPeerIndices(i), ...getColPeerIndices(i)]
          : getRowPeerIndices(i);
      let count = 0;
      for (const pIdx of peers) {
        const pDef = cells[pIdx].defId ? SYMBOLS_BY_ID[cells[pIdx].defId!] : null;
        if (pDef && (pDef.stream === 'tea_night' || pDef.stream === 'express')) {
          count++;
        }
      }
      if (count > 0) {
        const gain = count * (inst.stars === 2 ? 3 : 2);
        detail.synergyCoins += gain;
        detail.notes.push(`顺路派送 +${gain}`);
      }
    }

    if (def.id === 'bbq_stall') {
      let humans = 0;
      for (const nIdx of adj) {
        const nDef = cells[nIdx].defId ? SYMBOLS_BY_ID[cells[nIdx].defId!] : null;
        if (nDef?.tags.includes('human')) humans++;
      }
      if (humans > 0) {
        const gain = humans * (inst.stars === 2 ? 5 : 2);
        detail.synergyCoins += gain;
        detail.notes.push(`食客满座 +${gain}`);
      }
    }

    if (def.id === 'night_foodie') {
      let stalls = 0;
      for (const nIdx of adj) {
        const nDef = cells[nIdx].defId ? SYMBOLS_BY_ID[cells[nIdx].defId!] : null;
        if (nDef && (nDef.tags.includes('drink') || nDef.tags.includes('food'))) {
          stalls++;
        }
      }
      if (stalls > 0) {
        const gain = stalls * (inst.stars === 2 ? 11 : 5);
        detail.synergyCoins += gain;
        detail.notes.push(`大快朵颐 +${gain}`);
      }
    }

    if (def.id === 'calico_cat') {
      let empties = 0;
      let catnips = 0;
      for (const nIdx of adj) {
        if (!cells[nIdx].defId) empties++;
        if (cells[nIdx].defId === 'catnip_pot') catnips++;
      }
      const gain =
        empties * (inst.stars === 2 ? 4 : 2) +
        catnips * (inst.stars === 2 ? 9 : 4);
      if (gain > 0) {
        detail.synergyCoins += gain;
        detail.notes.push(`悠闲踱步 +${gain}`);
      }
    }

    if (def.id === 'catnip_pot') {
      let cats = 0;
      for (const nIdx of adj) {
        const nDef = cells[nIdx].defId ? SYMBOLS_BY_ID[cells[nIdx].defId!] : null;
        if (nDef?.tags.includes('cat')) cats++;
      }
      if (cats > 0) {
        const gain = cats * (inst.stars === 2 ? 7 : 3);
        detail.synergyCoins += gain;
        detail.notes.push(`猫咪讨喜 +${gain}`);
      }
    }

    if (def.id === 'cat_tree') {
      const bonusPerPet = inst.stars === 2 ? 9 : 4;
      for (const nIdx of adj) {
        const nb = cells[nIdx];
        const nDef = nb.defId ? SYMBOLS_BY_ID[nb.defId] : null;
        if (nDef && nDef.stream === 'pet' && !nb.destroyed) {
          nb.synergyCoins += bonusPerPet;
          nb.notes.push(`猫爬架 +${bonusPerPet}`);
        }
      }
    }

    if (def.id === 'fortune_gold_cat') {
      const count = (streamCounts.get('pet') ?? 0) + (streamCounts.get('curio') ?? 0) - 1;
      if (count > 0) {
        const gain = count * (inst.stars === 2 ? 5 : 2);
        detail.synergyCoins += gain;
        detail.notes.push(`八方招财 +${gain}`);
      }
    }

    if (def.id === 'worker_tenant') {
      const hasTeaAdj = adj.some((n) => cells[n].defId === 'milk_tea');
      if (hasTeaAdj || room === 'quiet_suite') {
        const gain = inst.stars === 2 ? 5 : 2;
        detail.synergyCoins += gain;
        detail.notes.push(`舒心安居 +${gain}`);
      }
    }

    if (def.id === 'mahjong_pal' && allMahjongCount >= 3) {
      const gain = inst.stars === 2 ? 7 : 3;
      detail.synergyCoins += gain;
      detail.notes.push(`凑桌开胡 +${gain}`);
    }

    if (def.id === 'red_dragon_tile') {
      let pals = 0;
      for (const nIdx of adj) {
        const nId = cells[nIdx].defId;
        if (nId === 'mahjong_pal' || nId === 'chess_parlor') pals++;
      }
      if (pals > 0) {
        const gain = pals * (inst.stars === 2 ? 9 : 4);
        detail.synergyCoins += gain;
        detail.notes.push(`杠上开花 +${gain}`);
      }
    }

    if (def.id === 'hardware_boss') {
      let tools = 0;
      for (const nIdx of adj) {
        const nDef = cells[nIdx].defId ? SYMBOLS_BY_ID[cells[nIdx].defId!] : null;
        if (
          nDef &&
          (nDef.tags.includes('tool') ||
            nDef.tags.includes('facility') ||
            nDef.id === 'renovation_crew')
        ) {
          tools++;
        }
      }
      if (tools > 0) {
        const gain = tools * (inst.stars === 2 ? 7 : 3);
        detail.synergyCoins += gain;
        detail.notes.push(`巧匠修缮 +${gain}`);
      }
    }

    if (def.id === 'security_guard' && inst.stars === 2) {
      let tenants = 0;
      for (const nIdx of adj) {
        const nDef = cells[nIdx].defId ? SYMBOLS_BY_ID[cells[nIdx].defId!] : null;
        if (nDef?.tags.includes('human')) tenants++;
      }
      if (tenants > 0) {
        const gain = tenants * 2;
        detail.synergyCoins += gain;
        detail.notes.push(`平安巡逻 +${gain}`);
      }
    }

    if (def.id === 'warm_landlady') {
      let humans = 0;
      for (const nIdx of adj) {
        const nDef = cells[nIdx].defId ? SYMBOLS_BY_ID[cells[nIdx].defId!] : null;
        if (nDef?.tags.includes('human')) humans++;
      }
      if (humans > 0) {
        const gain = humans * (inst.stars === 2 ? 7 : 3);
        detail.synergyCoins += gain;
        detail.notes.push(`街坊和睦 +${gain}`);
      }
    }

    if (def.id === 'chess_parlor') {
      const folkCnt = Math.max(0, (streamCounts.get('folk') ?? 0) - 1);
      const teaAdj = adj.some((n) => cells[n].defId === 'milk_tea') ? 5 : 0;
      const gain = folkCnt * (inst.stars === 2 ? 5 : 2) + teaAdj;
      if (gain > 0) {
        detail.synergyCoins += gain;
        detail.notes.push(`茶馆兴隆 +${gain}`);
      }
    }

    if (def.id === 'sunflower') {
      const hasSunAdj = adj.some((n) => cells[n].defId === 'sun_rain');
      if (hasSunAdj || room === 'sun_greenhouse') {
        const gain = inst.stars === 2 ? 9 : 4;
        detail.synergyCoins += gain;
        detail.notes.push(`向阳盛放 +${gain}`);
      }
    }

    if (def.id === 'sun_rain') {
      const perPlant = inst.stars === 2 ? 7 : 3;
      for (const nIdx of adj) {
        const nb = cells[nIdx];
        const nDef = nb.defId ? SYMBOLS_BY_ID[nb.defId] : null;
        if (nDef?.tags.includes('plant') && !nb.destroyed) {
          nb.synergyCoins += perPlant;
          nb.notes.push(`甘露润泽 +${perPlant}`);
        }
      }
    }

    if (def.id === 'honey_bee') {
      let plants = 0;
      for (const nIdx of adj) {
        const nDef = cells[nIdx].defId ? SYMBOLS_BY_ID[cells[nIdx].defId!] : null;
        if (nDef?.tags.includes('plant')) plants++;
      }
      if (plants > 0) {
        const gain = plants * (inst.stars === 2 ? 9 : 4);
        detail.synergyCoins += gain;
        detail.notes.push(`采花酿蜜 +${gain}`);
      }
    }

    if (def.id === 'sea_pearl') {
      const vaultOrCatAdj = adj.some(
        (n) =>
          cells[n].defId === 'amethyst_vault' ||
          cells[n].defId === 'fortune_gold_cat',
      );
      if (vaultOrCatAdj) {
        detail.synergyCoins += 3;
        detail.notes.push('珠光宝气 +3');
      }
    }

    if (def.id === 'ice_jade' && allGemCount > 1) {
      const gain = (allGemCount - 1) * (inst.stars === 2 ? 4 : 2);
      detail.synergyCoins += gain;
      detail.notes.push(`玉石共鸣 +${gain}`);
    }

    if (def.id === 'amethyst_vault') {
      const count = Math.max(0, allGemCount - 1) + allCoinCount;
      if (count > 0) {
        const gain = count * (inst.stars === 2 ? 6 : 3);
        detail.synergyCoins += gain;
        detail.notes.push(`金库珍藏 +${gain}`);
      }
    }

    if (def.id === 'smart_locker') {
      let expAdj = 0;
      for (const nIdx of adj) {
        const nDef = cells[nIdx].defId ? SYMBOLS_BY_ID[cells[nIdx].defId!] : null;
        if (nDef?.stream === 'express') expAdj++;
      }
      if (expAdj > 0) {
        const gain = expAdj * (inst.stars === 2 ? 5 : 2);
        detail.synergyCoins += gain;
        detail.notes.push(`派件流转 +${gain}`);
      }
    }

    if (def.id === 'flea_stall' && totalDestructions > 0) {
      const gain = totalDestructions * (inst.stars === 2 ? 11 : 5);
      detail.synergyCoins += gain;
      detail.notes.push(`闲置回收 +${gain}`);
    }

    if (def.id === 'group_buy_leader') {
      const count =
        (streamCounts.get('express') ?? 0) + (streamCounts.get('folk') ?? 0) - 1;
      if (count > 0) {
        const gain = count * (inst.stars === 2 ? 4 : 2);
        detail.synergyCoins += gain;
        detail.notes.push(`拼团分红 +${gain}`);
      }
    }

    if (def.id === 'lucky_coin' && hasBankOrVault) {
      const gain = inst.stars === 2 ? 5 : 2;
      detail.synergyCoins += gain;
      detail.notes.push(`入库生辉 +${gain}`);
    }

    if (def.id === 'lease_contract') {
      let tenants = 0;
      for (const nIdx of adj) {
        const nDef = cells[nIdx].defId ? SYMBOLS_BY_ID[cells[nIdx].defId!] : null;
        if (nDef?.tags.includes('human')) tenants++;
      }
      if (tenants > 0) {
        const gain = tenants * (inst.stars === 2 ? 5 : 2);
        detail.synergyCoins += gain;
        detail.notes.push(`签约履约 +${gain}`);
      }
    }

    if (def.id === 'for_rent_sign' && room !== 'plain') {
      const gain = inst.stars === 2 ? 10 : 4;
      detail.synergyCoins += gain;
      detail.notes.push(`旺铺溢价 +${gain}`);
    }

    if (def.id === 'school_plaque') {
      const peers =
        inst.stars === 2
          ? [...getRowPeerIndices(i), ...getColPeerIndices(i)]
          : getRowPeerIndices(i);
      const perPeer = inst.stars === 2 ? 6 : 3;
      for (const pIdx of peers) {
        const pb = cells[pIdx];
        const pDef = pb.defId ? SYMBOLS_BY_ID[pb.defId] : null;
        if (pDef && (pDef.stream === 'folk' || pDef.stream === 'estate') && !pb.destroyed) {
          pb.synergyCoins += perPeer;
          pb.notes.push(`学区溢价 +${perPeer}`);
        }
      }
    }

    if (def.id === 'red_deed' && renovatedCount > 0) {
      const gain = renovatedCount * (inst.stars === 2 ? 5 : 2);
      detail.synergyCoins += gain;
      detail.notes.push(`地产增值 +${gain}`);
    }

    if (def.id === 'demolition_notice') {
      const docCount = cells.filter(
        (c) =>
          !c.destroyed &&
          (c.defId === 'red_deed' || c.defId === 'lease_contract'),
      ).length;
      if (docCount > 0) {
        const gain = docCount * (inst.stars === 2 ? 10 : 5);
        detail.synergyCoins += gain;
        detail.notes.push(`产权补偿 +${gain}`);
      }
      const reqRooms = inst.stars === 2 ? 4 : 5;
      if (renovatedCount >= reqRooms) {
        detail.roomMultiplier *= 2;
        detail.notes.push('整片旧改 ×2');
      }
    }
  }

  // Pass 5: Room Multipliers & Market Event Modifiers
  const activeEvent = state.currentEventId
    ? MARKET_EVENTS_BY_ID[state.currentEventId] ?? null
    : null;

  let boardCoins = 0;
  for (let i = 0; i < BOARD_SIZE; i++) {
    const detail = cells[i];
    const room = state.board[i].room;
    const def = detail.defId ? SYMBOLS_BY_ID[detail.defId] : null;

    if (room === 'craft_workshop' && detail.synergyCoins > 0) {
      detail.synergyCoins = detail.synergyCoins * 2 + 5;
      detail.notes.push('工坊连携翻倍+5');
    }

    if (
      room === 'quiet_suite' &&
      def &&
      (def.stream === 'folk' || def.stream === 'estate')
    ) {
      detail.roomMultiplier *= 1.75;
      detail.notes.push('精装 ×1.75');
    }

    if (room === 'gold_shop' && (detail.baseCoins + detail.synergyCoins) > 0) {
      detail.roomMultiplier *= 2;
      detail.notes.push('旺铺 ×2');
    }

    if (activeEvent && def) {
      if (
        (activeEvent.boostedStream === def.stream ||
          activeEvent.secondaryStream === def.stream) &&
        activeEvent.boostMultiplier
      ) {
        detail.roomMultiplier *= activeEvent.boostMultiplier;
        detail.notes.push(`${activeEvent.name} ×${activeEvent.boostMultiplier}`);
      }
      if (
        activeEvent.plainCellPenalty &&
        room === 'plain' &&
        !isProtectedByQuietSuite(i)
      ) {
        detail.synergyCoins -= activeEvent.plainCellPenalty;
        detail.notes.push(`返潮修缮 -${activeEvent.plainCellPenalty}`);
      }
    }

    const rawSum = detail.baseCoins + detail.synergyCoins;
    detail.finalCoins = Math.round(rawSum * detail.roomMultiplier);
    boardCoins += detail.finalCoins;
  }

  // Pass 6: Global Landlord, Relic & Contract Modifiers
  let globalBonusCoins = 0;
  const globalNotes: string[] = [];
  const landlord = LANDLORDS_BY_ID[state.landlordId];
  const uniqueStreams = streamCounts.size;

  if (landlord.diverseStreamsBonus > 0 && uniqueStreams >= 3) {
    const bundles = Math.floor(uniqueStreams / 3);
    const bonus = bundles * landlord.diverseStreamsBonus;
    globalBonusCoins += bonus;
    globalNotes.push(`商会百业(${uniqueStreams}流派) +${bonus}`);
  }

  if (hasRelic('master_ledger_seal') && uniqueStreams > 0) {
    const bonus = uniqueStreams * 4;
    globalBonusCoins += bonus;
    globalNotes.push(`总账玉玺(${uniqueStreams}流派) +${bonus}`);
  }

  if (hasRelic('vacant_room_subsidy') && emptyCellCount > 0) {
    const bonus = emptyCellCount * 2;
    globalBonusCoins += bonus;
    globalNotes.push(`空置补贴 +${bonus}`);
  }

  if (hasRelic('full_house_banner') && emptyCellCount === 0) {
    globalBonusCoins += 14;
    globalNotes.push('满租红锦旗 +14');
  }

  if (hasRelic('renovation_handbook') && renovatedCount > 0) {
    const bonus = renovatedCount * 2;
    globalBonusCoins += bonus;
    globalNotes.push(`鲁班宝典 +${bonus}`);
  }

  if (hasRelic('rosewood_abacus') && boardCoins > 0 && boardCoins % 2 === 0) {
    globalBonusCoins += 5;
    globalNotes.push('紫檀算盘(偶数) +5');
  }

  for (const ac of state.activeContracts) {
    const cDef = CONTRACTS_BY_ID[ac.contractId];
    if (cDef?.perSpinTaxCoins) {
      globalBonusCoins -= cDef.perSpinTaxCoins;
      globalNotes.push(`${cDef.name} -${cDef.perSpinTaxCoins}`);
    }
  }

  const destroyedUids = new Set(
    cells.filter((c) => c.destroyed && c.symbolUid).map((c) => c.symbolUid!),
  );
  const nextDeck: SymbolInstance[] = [];
  for (const orig of state.deck) {
    if (destroyedUids.has(orig.uid)) continue;
    nextDeck.push(workingByUid.get(orig.uid)!);
  }
  for (const sp of spawnedInstances) {
    nextDeck.push(sp);
  }

  const totalCoins = Math.max(0, boardCoins + globalBonusCoins);

  return {
    totalCoins,
    boardCoins,
    globalBonusCoins,
    globalNotes,
    cells,
    nextDeck,
    dispatchEarned,
    removeTokensEarned,
    renovationTicketsEarned,
  };
}

/** Spin the 4x5 board, keeping locked cells anchored and drawing from deck for unlocked cells */
export function spinBoard(state: RunState): RunState {
  if (state.phase !== 'ready') return state;

  let rng = state.rngState;
  const deckUidSet = new Set(state.deck.map((s) => s.uid));

  // Verify locked cells still point to living deck symbols
  const placedSymbolUids: Array<string | null> = Array(BOARD_SIZE).fill(null);
  const usedUids = new Set<string>();

  const nextBoard: BoardCell[] = state.board.map((cell) => ({ ...cell }));

  for (let i = 0; i < BOARD_SIZE; i++) {
    const cell = nextBoard[i];
    if (cell.locked && cell.lockedSymbolUid && deckUidSet.has(cell.lockedSymbolUid)) {
      placedSymbolUids[i] = cell.lockedSymbolUid;
      usedUids.add(cell.lockedSymbolUid);
    } else {
      cell.locked = false;
      cell.lockedSymbolUid = null;
    }
  }

  const unlockedIndices: number[] = [];
  for (let i = 0; i < BOARD_SIZE; i++) {
    if (!nextBoard[i].locked) unlockedIndices.push(i);
  }

  const remainingDeckUids = state.deck
    .map((s) => s.uid)
    .filter((uid) => !usedUids.has(uid));

  // Pool size is max(unlockedIndices.length, remainingDeckUids.length) so empty spaces distribute randomly!
  const pool: Array<string | null> = [...remainingDeckUids];
  while (pool.length < unlockedIndices.length) {
    pool.push(null);
  }

  // Fisher-Yates shuffle pool deterministically
  for (let i = pool.length - 1; i > 0; i--) {
    let rFloat: number;
    [rng, rFloat] = nextRandom(rng);
    const j = Math.floor(rFloat * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }

  for (let k = 0; k < unlockedIndices.length; k++) {
    const cellIdx = unlockedIndices[k];
    placedSymbolUids[cellIdx] = pool[k] ?? null;
  }

  // Locks held through this spin now release so they don't stay stuck forever unless re-locked
  for (let i = 0; i < BOARD_SIZE; i++) {
    nextBoard[i].symbolUid = placedSymbolUids[i];
    nextBoard[i].locked = false;
    nextBoard[i].lockedSymbolUid = null;
  }

  // Determine draft choice count (default 3, adjusted by active contracts)
  let choiceCount = 3;
  for (const ac of state.activeContracts) {
    const cDef = CONTRACTS_BY_ID[ac.contractId];
    if (cDef?.draftChoicesDelta) {
      choiceCount += cDef.draftChoicesDelta;
    }
  }
  choiceCount = Math.max(2, Math.min(4, choiceCount));

  let draftChoices: string[];
  [rng, draftChoices] = rollDraftChoices(rng, state.cycle, choiceCount);

  const interimState: RunState = {
    ...state,
    rngState: rng,
    totalSpins: state.totalSpins + 1,
    usedFreeColRerollThisSpin: false,
    board: nextBoard,
    rawSpinSymbolUids: placedSymbolUids,
    draftChoices,
    phase: 'post_spin',
  };

  const evalResult = evaluateSpin(interimState, placedSymbolUids);
  return {
    ...interimState,
    currentEval: evalResult,
  };
}

/** Toggle Cell Lock (1 Dispatch Token to lock; unlocking refunds 1 Dispatch Token) */
export function toggleCellLock(state: RunState, cellIndex: number): RunState {
  if (cellIndex < 0 || cellIndex >= BOARD_SIZE) return state;
  if (state.phase !== 'ready' && state.phase !== 'post_spin') return state;

  const cell = state.board[cellIndex];
  const currentUid = cell.symbolUid;
  if (!cell.locked && !currentUid) {
    return state; // Cannot lock an empty cell
  }

  // In post_spin, cannot lock a symbol that is being destroyed this turn unless swapped away first
  if (
    !cell.locked &&
    state.phase === 'post_spin' &&
    state.currentEval?.cells[cellIndex]?.destroyed
  ) {
    return state;
  }

  if (cell.locked) {
    const nextBoard = state.board.map((c, idx) =>
      idx === cellIndex ? { ...c, locked: false, lockedSymbolUid: null } : c,
    );
    return {
      ...state,
      board: nextBoard,
      dispatchTokens: Math.min(state.maxDispatchTokens, state.dispatchTokens + 1),
    };
  }

  if (state.dispatchTokens < 1) return state;

  const nextBoard = state.board.map((c, idx) =>
    idx === cellIndex ? { ...c, locked: true, lockedSymbolUid: currentUid } : c,
  );
  return {
    ...state,
    board: nextBoard,
    dispatchTokens: state.dispatchTokens - 1,
  };
}

/** Swap two adjacent cells during post_spin and immediately re-evaluate synergies */
export function swapAdjacentCells(
  state: RunState,
  cellA: number,
  cellB: number,
): RunState {
  if (state.phase !== 'post_spin') return state;
  if (!areCellsAdjacent(cellA, cellB)) return state;
  if (state.dispatchTokens < 1) return state;

  const nextRaw = [...state.rawSpinSymbolUids];
  const tmp = nextRaw[cellA];
  nextRaw[cellA] = nextRaw[cellB];
  nextRaw[cellB] = tmp;

  const nextBoard = state.board.map((c, idx) => {
    if (idx === cellA) {
      return { ...c, symbolUid: nextRaw[cellA], locked: false, lockedSymbolUid: null };
    }
    if (idx === cellB) {
      return { ...c, symbolUid: nextRaw[cellB], locked: false, lockedSymbolUid: null };
    }
    return c;
  });

  const updated: RunState = {
    ...state,
    dispatchTokens: state.dispatchTokens - 1,
    board: nextBoard,
    rawSpinSymbolUids: nextRaw,
  };
  return {
    ...updated,
    currentEval: evaluateSpin(updated, nextRaw),
  };
}

/** Reroll a single column (0..4) during post_spin and re-evaluate board */
export function rerollColumn(state: RunState, colIndex: number): RunState {
  if (state.phase !== 'post_spin') return state;
  if (colIndex < 0 || colIndex >= BOARD_COLS) return state;

  const landlord = LANDLORDS_BY_ID[state.landlordId];
  const isFree = landlord.freeFirstColReroll && !state.usedFreeColRerollThisSpin;
  const cost = isFree ? 0 : 1;
  if (state.dispatchTokens < cost) return state;

  let rng = state.rngState;
  const colCellIndices: number[] = [];
  for (let r = 0; r < BOARD_ROWS; r++) {
    const idx = r * BOARD_COLS + colIndex;
    if (!state.board[idx].locked) {
      colCellIndices.push(idx);
    }
  }
  if (colCellIndices.length === 0) return state;

  // Symbols currently sitting outside this column's unlocked cells stay put
  const otherPlacedUids = new Set<string>();
  for (let i = 0; i < BOARD_SIZE; i++) {
    if (!colCellIndices.includes(i) && state.rawSpinSymbolUids[i]) {
      otherPlacedUids.add(state.rawSpinSymbolUids[i]!);
    }
  }

  const candidateUids = state.deck
    .map((s) => s.uid)
    .filter((uid) => !otherPlacedUids.has(uid));

  const pool: Array<string | null> = [...candidateUids];
  // Pad with empty slots proportional to empty spaces left off-column
  const totalEmptyCapacity = Math.max(0, BOARD_SIZE - state.deck.length);
  let otherEmpties = 0;
  for (let i = 0; i < BOARD_SIZE; i++) {
    if (!colCellIndices.includes(i) && !state.rawSpinSymbolUids[i]) {
      otherEmpties++;
    }
  }
  const remainingEmpties = Math.max(
    colCellIndices.length - pool.length,
    totalEmptyCapacity - otherEmpties,
  );
  for (let e = 0; e < remainingEmpties; e++) {
    pool.push(null);
  }

  for (let i = pool.length - 1; i > 0; i--) {
    let rf: number;
    [rng, rf] = nextRandom(rng);
    const j = Math.floor(rf * (i + 1));
    const t = pool[i];
    pool[i] = pool[j];
    pool[j] = t;
  }

  const nextRaw = [...state.rawSpinSymbolUids];
  for (let k = 0; k < colCellIndices.length; k++) {
    nextRaw[colCellIndices[k]] = pool[k] ?? null;
  }

  const nextBoard = state.board.map((c, idx) => ({
    ...c,
    symbolUid: nextRaw[idx],
  }));

  const updated: RunState = {
    ...state,
    rngState: rng,
    dispatchTokens: state.dispatchTokens - cost,
    usedFreeColRerollThisSpin: state.usedFreeColRerollThisSpin || isFree,
    board: nextBoard,
    rawSpinSymbolUids: nextRaw,
  };
  return {
    ...updated,
    currentEval: evaluateSpin(updated, nextRaw),
  };
}

/** Finalize current post_spin evaluation and optionally add 1 drafted symbol (or null to skip for +2 subsidy) */
export function commitSpinAndDraft(
  state: RunState,
  pickedDefId: string | null,
): RunState {
  if (state.phase !== 'post_spin' || !state.currentEval) return state;

  const ev = state.currentEval;
  let nextUidCounter = state.nextUidCounter + Math.max(0, ev.nextDeck.length - state.deck.length) + 2;
  const nextDeck = [...ev.nextDeck];

  let extraCoins = 0;
  const summaryLines: string[] = [`本轮账面实收 +${ev.totalCoins} 金币`];

  if (pickedDefId && SYMBOLS_BY_ID[pickedDefId]) {
    const newInst = createSymbolInstance(pickedDefId, nextUidCounter++, 1);
    nextDeck.push(newInst);
    summaryLines.push(`新招入驻：【${SYMBOLS_BY_ID[pickedDefId].name}】`);
    if (state.relicIds.includes('double_deposit_slip')) {
      extraCoins += 6;
      summaryLines.push('押二付一收据 +6');
    }
  } else {
    extraCoins += 2;
    summaryLines.push('跳过招募补贴 +2 金币');
  }

  // Keep locked references valid if symbol survived
  const livingUids = new Set(nextDeck.map((s) => s.uid));
  const nextBoard = state.board.map((cell, idx) => {
    const survivedUid =
      ev.cells[idx].destroyed || !cell.symbolUid || !livingUids.has(cell.symbolUid)
        ? null
        : cell.symbolUid;
    const keepLock = cell.locked && cell.lockedSymbolUid && livingUids.has(cell.lockedSymbolUid);
    return {
      ...cell,
      symbolUid: survivedUid,
      locked: Boolean(keepLock),
      lockedSymbolUid: keepLock ? cell.lockedSymbolUid : null,
    };
  });

  const earnedThisTurn = ev.totalCoins + extraCoins;
  const nextCoins = state.coins + earnedThisTurn;
  const nextSpinsLeft = state.spinsLeftInCycle - 1;

  let rng = state.rngState;
  let nextPhase: RunState['phase'] = 'ready';
  let pendingRelicChoices: string[] = [];
  let pendingContractChoices: string[] = [];

  if (nextSpinsLeft <= 0) {
    if (nextCoins < state.rentTarget) {
      nextPhase = 'gameover';
      summaryLines.push(`交租日到期：差 ${state.rentTarget - nextCoins} 金币未能缴清物业账单！`);
    } else {
      nextPhase = 'rent_due';
      // Roll up to 3 unowned relics
      const unownedRelics = RELICS.filter((r) => !state.relicIds.includes(r.id));
      const shuffledRelics = [...unownedRelics];
      for (let i = shuffledRelics.length - 1; i > 0; i--) {
        let rf: number;
        [rng, rf] = nextRandom(rng);
        const j = Math.floor(rf * (i + 1));
        const tmp = shuffledRelics[i];
        shuffledRelics[i] = shuffledRelics[j];
        shuffledRelics[j] = tmp;
      }
      pendingRelicChoices = shuffledRelics.slice(0, 3).map((r) => r.id);

      // Roll 2 optional contracts
      const shuffledContracts = [...CONTRACTS];
      for (let i = shuffledContracts.length - 1; i > 0; i--) {
        let rf: number;
        [rng, rf] = nextRandom(rng);
        const j = Math.floor(rf * (i + 1));
        const tmp = shuffledContracts[i];
        shuffledContracts[i] = shuffledContracts[j];
        shuffledContracts[j] = tmp;
      }
      pendingContractChoices = shuffledContracts.slice(0, 2).map((c) => c.id);
    }
  }

  return {
    ...state,
    rngState: rng,
    nextUidCounter,
    phase: nextPhase,
    coins: nextCoins,
    totalCoinsEarned: state.totalCoinsEarned + earnedThisTurn,
    bestSingleSpin: Math.max(state.bestSingleSpin, ev.totalCoins),
    spinsLeftInCycle: nextSpinsLeft,
    dispatchTokens: Math.min(
      state.maxDispatchTokens,
      state.dispatchTokens + ev.dispatchEarned,
    ),
    removeTokens: state.removeTokens + ev.removeTokensEarned,
    renovationTickets: state.renovationTickets + ev.renovationTicketsEarned,
    deck: nextDeck,
    board: nextBoard,
    currentEval: null,
    draftChoices: [],
    pendingRelicChoices,
    pendingContractChoices,
    signedContractThisCycle: false,
    lastTurnSummary: summaryLines,
  };
}

/** Find all defIds in deck that have at least 3 1-star copies ready for Triple Star Merge */
export function getMergeableDefIds(state: RunState): string[] {
  const counts = new Map<string, number>();
  for (const inst of state.deck) {
    if (inst.stars === 1) {
      counts.set(inst.defId, (counts.get(inst.defId) ?? 0) + 1);
    }
  }
  const out: string[] = [];
  for (const [defId, count] of counts.entries()) {
    if (count >= 3) out.push(defId);
  }
  return out;
}

/** Merge three 1-star copies of `defId` into one 2-star golden card! */
export function mergeTripleSymbol(state: RunState, defId: string): RunState {
  if (state.phase !== 'ready' && state.phase !== 'post_spin' && state.phase !== 'rent_due') {
    return state;
  }

  const candidates = state.deck.filter((s) => s.defId === defId && s.stars === 1);
  if (candidates.length < 3) return state;

  // Prefer merging instances with highest permBonus preserved
  const sorted = [...candidates].sort((a, b) => b.permBonus - a.permBonus);
  const toConsume = sorted.slice(0, 3);
  const consumeSet = new Set(toConsume.map((s) => s.uid));
  const combinedPermBonus = toConsume.reduce((acc, s) => acc + s.permBonus, 0);

  const mergedUid = `sym_${state.nextUidCounter}`;
  const mergedInst: SymbolInstance = {
    uid: mergedUid,
    defId,
    stars: 2,
    permBonus: combinedPermBonus,
    counter: 0,
    turnsAlive: 0,
  };

  const nextDeck = state.deck.filter((s) => !consumeSet.has(s.uid));
  nextDeck.push(mergedInst);

  // Update board references if any consumed uid was currently displayed on the board
  let placedMergedOnBoard = false;
  const nextRaw = state.rawSpinSymbolUids.map((uid) => {
    if (uid && consumeSet.has(uid)) {
      if (!placedMergedOnBoard) {
        placedMergedOnBoard = true;
        return mergedUid;
      }
      return null;
    }
    return uid;
  });

  const nextBoard = state.board.map((cell, idx) => {
    const newSymUid =
      cell.symbolUid && consumeSet.has(cell.symbolUid) ? nextRaw[idx] : cell.symbolUid;
    const newLockUid =
      cell.lockedSymbolUid && consumeSet.has(cell.lockedSymbolUid)
        ? newSymUid
        : cell.lockedSymbolUid;
    return {
      ...cell,
      symbolUid: newSymUid,
      locked: Boolean(cell.locked && newLockUid),
      lockedSymbolUid: cell.locked && newLockUid ? newLockUid : null,
    };
  });

  const landlord = LANDLORDS_BY_ID[state.landlordId];
  let bonusCoins = landlord.mergeBonusCoins;
  let bonusDispatch = 0;
  if (state.relicIds.includes('star_seal_paste')) {
    bonusCoins += 10;
    bonusDispatch += 1;
  }

  const updated: RunState = {
    ...state,
    nextUidCounter: state.nextUidCounter + 1,
    coins: state.coins + bonusCoins,
    totalCoinsEarned: state.totalCoinsEarned + bonusCoins,
    dispatchTokens: Math.min(state.maxDispatchTokens, state.dispatchTokens + bonusDispatch),
    mergesCount: state.mergesCount + 1,
    deck: nextDeck,
    board: nextBoard,
    rawSpinSymbolUids: nextRaw,
    lastTurnSummary: [
      `三连升星：3 张【${SYMBOLS_BY_ID[defId]?.name}】合成为 2★ 精装金卡！`,
      ...(bonusCoins > 0 ? [`升星奖励 +${bonusCoins} 金币`] : []),
    ],
  };

  if (updated.phase === 'post_spin') {
    updated.currentEval = evaluateSpin(updated, nextRaw);
  }
  return updated;
}

/** Remove a symbol from deck using 1 removeToken (keeps deck >= 3 symbols) */
export function removeDeckSymbol(state: RunState, uid: string): RunState {
  if (state.removeTokens < 1 || state.deck.length <= 3) return state;
  const target = state.deck.find((s) => s.uid === uid);
  if (!target) return state;

  const nextDeck = state.deck.filter((s) => s.uid !== uid);
  const nextRaw = state.rawSpinSymbolUids.map((u) => (u === uid ? null : u));
  const nextBoard = state.board.map((c) => ({
    ...c,
    symbolUid: c.symbolUid === uid ? null : c.symbolUid,
    locked: c.lockedSymbolUid === uid ? false : c.locked,
    lockedSymbolUid: c.lockedSymbolUid === uid ? null : c.lockedSymbolUid,
  }));

  const updated: RunState = {
    ...state,
    removeTokens: state.removeTokens - 1,
    deck: nextDeck,
    board: nextBoard,
    rawSpinSymbolUids: nextRaw,
  };
  if (updated.phase === 'post_spin') {
    updated.currentEval = evaluateSpin(updated, nextRaw);
  }
  return updated;
}

/** Renovate a board cell using either a free renovationTicket or coins */
export function renovateBoardCell(
  state: RunState,
  cellIndex: number,
  room: RoomTypeId,
): RunState {
  if (room === 'plain' || cellIndex < 0 || cellIndex >= BOARD_SIZE) return state;
  if (state.board[cellIndex].room === room) return state;

  let nextCoins = state.coins;
  let nextTickets = state.renovationTickets;

  if (nextTickets > 0) {
    nextTickets -= 1;
  } else {
    const cost = getRenovationCoinCost(state, room);
    if (nextCoins < cost) return state;
    nextCoins -= cost;
  }

  const wasPlain = state.board[cellIndex].room === 'plain';
  const nextBoard = state.board.map((c, idx) =>
    idx === cellIndex ? { ...c, room } : c,
  );

  const updated: RunState = {
    ...state,
    coins: nextCoins,
    renovationTickets: nextTickets,
    renovationsCount: state.renovationsCount + (wasPlain ? 1 : 0),
    board: nextBoard,
    lastTurnSummary: [
      `格子 #${cellIndex + 1} 已改造为【${ROOMS_BY_ID[room].name}】！`,
    ],
  };

  if (updated.phase === 'post_spin') {
    updated.currentEval = evaluateSpin(updated, updated.rawSpinSymbolUids);
  }
  return updated;
}

/** Optional: sign a risk-reward contract during rent_due phase (max 1 per rent cycle) */
export function signRentContract(state: RunState, contractId: string): RunState {
  if (state.phase !== 'rent_due' || state.signedContractThisCycle) return state;
  const cDef = CONTRACTS_BY_ID[contractId];
  if (!cDef) return state;

  let rng = state.rngState;
  const nextBoard = state.board.map((c) => ({ ...c }));
  let extraRenovations = 0;

  if (cDef.immediateRandomRoom) {
    const plainIndices = nextBoard
      .filter((c) => c.room === 'plain')
      .map((c) => c.index);
    if (plainIndices.length > 0) {
      let rf: number;
      [rng, rf] = nextRandom(rng);
      const chosenIdx = plainIndices[Math.floor(rf * plainIndices.length)];
      nextBoard[chosenIdx].room = cDef.immediateRandomRoom;
      extraRenovations = 1;
    }
  }

  const immCoins = cDef.immediateCoins ?? 0;
  return {
    ...state,
    rngState: rng,
    coins: state.coins + immCoins,
    totalCoinsEarned: state.totalCoinsEarned + immCoins,
    dispatchTokens: Math.min(
      state.maxDispatchTokens + 2,
      state.dispatchTokens + (cDef.immediateDispatch ?? 0),
    ),
    removeTokens: state.removeTokens + (cDef.immediateRemoveTokens ?? 0),
    renovationTickets:
      state.renovationTickets + (cDef.immediateRenovationTickets ?? 0),
    renovationsCount: state.renovationsCount + extraRenovations,
    board: nextBoard,
    signedContractThisCycle: true,
    activeContracts: [
      ...state.activeContracts,
      { contractId, remainingCycles: cDef.durationCycles },
    ],
    lastTurnSummary: [`已签署【${cDef.name}】：${cDef.rewardDesc}`],
  };
}

/** Pay current cycle rent, claim chosen relic (optional), apply interest, and advance cycle! */
export function payRentAndAdvanceCycle(
  state: RunState,
  pickedRelicId: string | null,
): RunState {
  if (state.phase !== 'rent_due') return state;
  if (state.coins < state.rentTarget) {
    return { ...state, phase: 'gameover' };
  }

  let rng = state.rngState;
  const landlord = LANDLORDS_BY_ID[state.landlordId];
  let nextRelics = [...state.relicIds];
  if (pickedRelicId && !nextRelics.includes(pickedRelicId)) {
    nextRelics.push(pickedRelicId);
  }

  const afterRentCoins = state.coins - state.rentTarget;
  const interestRate =
    landlord.interestRatio + (nextRelics.includes('compound_passbook') ? 0.12 : 0);
  const interestCoins = Math.floor(afterRentCoins * interestRate);
  const finalCoins = afterRentCoins + interestCoins;

  // Check standard victory on completing cycle 12 (when not already in endless mode)
  if (state.cycle === VICTORY_CYCLE && !state.isEndless) {
    return {
      ...state,
      coins: finalCoins,
      totalCoinsEarned: state.totalCoinsEarned + interestCoins,
      relicIds: nextRelics,
      pendingRelicChoices: [],
      pendingContractChoices: [],
      phase: 'victory',
      lastTurnSummary: [
        `恭喜缴清全部 ${VICTORY_CYCLE} 期账单！包租公传奇功成圆满！`,
      ],
    };
  }

  // Decrement active contract durations (newly signed contract this cycle keeps full duration for upcoming cycle)
  const tickedContracts = state.activeContracts
    .map((ac, idx, arr) => {
      const isJustSigned =
        state.signedContractThisCycle && idx === arr.length - 1;
      return isJustSigned
        ? ac
        : { ...ac, remainingCycles: ac.remainingCycles - 1 };
    })
    .filter((ac) => ac.remainingCycles > 0);

  const nextCycle = state.cycle + 1;
  const nextGoal = computeCycleRentGoal(
    nextCycle,
    state.landlordId,
    state.ascension,
    nextRelics,
    tickedContracts,
  );

  // Roll a periodic market event starting from cycle 2
  let nextEventId: string | null = null;
  if (nextCycle >= 2) {
    let rf: number;
    [rng, rf] = nextRandom(rng);
    const ev = MARKET_EVENTS[Math.floor(rf * MARKET_EVENTS.length)];
    nextEventId = ev.id;
  }

  const keychainExtra = nextRelics.includes('brass_keychain') ? 1 : 0;
  const nextMaxDispatch = landlord.dispatchPerCycle + 2 + keychainExtra;
  const rechargedDispatch = Math.min(
    nextMaxDispatch,
    state.dispatchTokens + landlord.dispatchPerCycle + keychainExtra,
  );

  // Grant 1 free renovation ticket every 2 cycles + 1 remove token every 2 cycles
  const freeTicket = nextCycle % 2 === 0 ? 1 : 0;
  const freeRemove = nextCycle % 2 === 1 ? 1 : 0;

  return {
    ...state,
    rngState: rng,
    phase: 'ready',
    coins: finalCoins,
    totalCoinsEarned: state.totalCoinsEarned + interestCoins,
    cycle: nextCycle,
    spinsLeftInCycle: nextGoal.spinsAllowed,
    spinsPerCycle: nextGoal.spinsAllowed,
    rentTarget: nextGoal.rentTarget,
    dispatchTokens: rechargedDispatch,
    maxDispatchTokens: nextMaxDispatch,
    removeTokens: state.removeTokens + freeRemove,
    renovationTickets: state.renovationTickets + freeTicket,
    relicIds: nextRelics,
    pendingRelicChoices: [],
    pendingContractChoices: [],
    signedContractThisCycle: false,
    activeContracts: tickedContracts,
    currentEventId: nextEventId,
    lastTurnSummary: [
      `第 ${state.cycle} 期房租已缴清！${interestCoins > 0 ? `复利生息 +${interestCoins} 金币。` : ''}`,
      ...(nextEventId ? [`新行情：${MARKET_EVENTS_BY_ID[nextEventId].name}`] : []),
    ],
  };
}

/** Continue into Endless Mode after reaching Cycle 12 Victory */
export function enterEndlessMode(state: RunState): RunState {
  if (state.phase !== 'victory') return state;
  const nextCycle = state.cycle + 1;
  const goal = computeCycleRentGoal(
    nextCycle,
    state.landlordId,
    state.ascension,
    state.relicIds,
    state.activeContracts,
  );
  const landlord = LANDLORDS_BY_ID[state.landlordId];

  return {
    ...state,
    isEndless: true,
    phase: 'ready',
    cycle: nextCycle,
    spinsLeftInCycle: goal.spinsAllowed,
    spinsPerCycle: goal.spinsAllowed,
    rentTarget: goal.rentTarget,
    dispatchTokens: Math.min(
      state.maxDispatchTokens,
      state.dispatchTokens + landlord.dispatchPerCycle,
    ),
    renovationTickets: state.renovationTickets + 1,
    removeTokens: state.removeTokens + 1,
    currentEventId: MARKET_EVENTS[nextCycle % MARKET_EVENTS.length].id,
    lastTurnSummary: [`已进入无尽阶梯模式（第 ${nextCycle} 期），冲击极限收租纪录！`],
  };
}

export function getStreamDisplayName(streamId: StreamId): string {
  return STREAMS_BY_ID[streamId]?.name ?? streamId;
}
