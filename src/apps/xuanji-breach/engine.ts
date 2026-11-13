import {
  BATTLE_MAX_TURNS,
  BOARD_SIZE,
  DIFFICULTY_DEFS,
  ENEMY_DEFS,
  LUOPAN_CENTER,
  MECH_DEFS,
  MECH_ORDER,
  RELIC_LIST,
  SECTORS,
} from './content.ts';
import type {
  ActionPreviewResult,
  BattleState,
  CombatEventLog,
  DifficultyTier,
  Direction4,
  DisplacementVector,
  EnemyArchetypeId,
  EnemyIntent,
  GridCoord,
  MechClassId,
  RelicId,
  TacticalAction,
  TerrainType,
  TileEffectPreview,
  TileState,
  UnitState,
  VisualFxEvent,
  WeaponSlotKey,
} from './types.ts';

export const DIR_VECTORS: Record<Direction4, GridCoord> = {
  0: { r: -1, c: 0 }, // North
  1: { r: 0, c: 1 }, // East
  2: { r: 1, c: 0 }, // South
  3: { r: 0, c: -1 }, // West
};

export function isInBounds(r: number, c: number): boolean {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

export function coordsEqual(a: GridCoord, b: GridCoord): boolean {
  return a.r === b.r && a.c === b.c;
}

export function manhattanDist(a: GridCoord, b: GridCoord): number {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
}

export function isLuopanZone(r: number, c: number): boolean {
  return (
    Math.max(Math.abs(r - LUOPAN_CENTER.r), Math.abs(c - LUOPAN_CENTER.c)) <= 1
  );
}

export function isLuopanRingTile(r: number, c: number): boolean {
  return (
    Math.max(Math.abs(r - LUOPAN_CENTER.r), Math.abs(c - LUOPAN_CENTER.c)) === 1
  );
}

export function rotateLuopanCoord(
  coord: GridCoord,
  clockwise: boolean,
): GridCoord {
  if (!isLuopanZone(coord.r, coord.c)) return { ...coord };
  const dr = coord.r - LUOPAN_CENTER.r;
  const dc = coord.c - LUOPAN_CENTER.c;
  if (clockwise) {
    return {
      r: LUOPAN_CENTER.r + dc,
      c: LUOPAN_CENTER.c - dr,
    };
  }
  return {
    r: LUOPAN_CENTER.r - dc,
    c: LUOPAN_CENTER.c + dr,
  };
}

export function rotateDir4(dir: Direction4, clockwise: boolean): Direction4 {
  return ((dir + (clockwise ? 1 : 3)) % 4) as Direction4;
}

export function getDirectionBetween(
  from: GridCoord,
  to: GridCoord,
): Direction4 {
  const dr = to.r - from.r;
  const dc = to.c - from.c;
  if (Math.abs(dr) >= Math.abs(dc)) {
    return dr < 0 ? 0 : 2;
  }
  return dc >= 0 ? 1 : 3;
}

export function nextRng(seed: number): { value: number; nextSeed: number } {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const val = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value: val, nextSeed: (seed + 1) | 0 };
}

export function cloneBattleState(state: BattleState): BattleState {
  return {
    ...state,
    board: state.board.map((row) => row.map((tile) => ({ ...tile }))),
    units: state.units.map((u) => ({
      ...u,
      moveStartCoord: u.moveStartCoord ? { ...u.moveStartCoord } : null,
      intent: u.intent
        ? {
            ...u.intent,
            targetCoord: { ...u.intent.targetCoord },
            affectedTiles: u.intent.affectedTiles.map((c) => ({ ...c })),
          }
        : null,
    })),
    relics: [...state.relics],
    mechUpgrades: {
      titan: { ...state.mechUpgrades.titan },
      arbalest: { ...state.mechUpgrades.arbalest },
      geomancer: { ...state.mechUpgrades.geomancer },
    },
    objectives: { ...state.objectives },
    logs: state.logs.map((l) => ({ ...l })),
    lastFxEvents: state.lastFxEvents.map((e) => ({
      ...e,
      from: { ...e.from },
      to: { ...e.to },
      path: e.path ? e.path.map((p) => ({ ...p })) : undefined,
    })),
  };
}

export function getTile(
  state: BattleState,
  r: number,
  c: number,
): TileState | null {
  if (!isInBounds(r, c)) return null;
  return state.board[r][c];
}

export function getUnitAt(
  state: BattleState,
  r: number,
  c: number,
): UnitState | undefined {
  return state.units.find((u) => u.hp > 0 && u.r === r && u.c === c);
}

export function getUnitById(
  state: BattleState,
  uid: string,
): UnitState | undefined {
  return state.units.find((u) => u.hp > 0 && u.uid === uid);
}

function appendLog(
  state: BattleState,
  text: string,
  tone: CombatEventLog['tone'] = 'info',
): void {
  const nextId =
    state.logs.length > 0 ? state.logs[state.logs.length - 1].id + 1 : 1;
  state.logs.push({
    id: nextId,
    turn: state.turn,
    text,
    tone,
  });
  if (state.logs.length > 36) {
    state.logs.shift();
  }
}

function buildSectorBoard(sectorIndex: number): TileState[][] {
  const theme = SECTORS[sectorIndex % SECTORS.length].terrainTheme;
  const board: TileState[][] = [];

  for (let r = 0; r < BOARD_SIZE; r++) {
    const row: TileState[] = [];
    for (let c = 0; c < BOARD_SIZE; c++) {
      row.push({
        r,
        c,
        terrain: 'plain',
        elevation: 0,
        isLuopanRing: isLuopanRingTile(r, c),
        isLuopanCenter: r === LUOPAN_CENTER.r && c === LUOPAN_CENTER.c,
        citadelHp: 0,
        citadelMaxHp: 0,
        hasEmergenceCrack: false,
        emergingEnemyType: null,
        onFire: false,
      });
    }
    board.push(row);
  }

  const setTerrain = (r: number, c: number, terrain: TerrainType) => {
    const tile = board[r][c];
    tile.terrain = terrain;
    if (terrain === 'mountain') {
      tile.elevation = 2;
    } else if (terrain === 'citadel') {
      tile.elevation = 1;
      tile.citadelHp = 2;
      tile.citadelMaxHp = 2;
    } else if (terrain === 'water' || terrain === 'magma') {
      tile.elevation = -0.35;
    } else if (terrain === 'chasm') {
      tile.elevation = -1.5;
    } else {
      tile.elevation = 0;
    }
  };

  if (theme === 'waterway') {
    // Sector 1: Canglan Waterway — river veins + citadels + corner chasms
    setTerrain(0, 0, 'mountain');
    setTerrain(0, 6, 'mountain');
    setTerrain(6, 0, 'mountain');
    setTerrain(6, 6, 'chasm');

    // Citadels to protect
    setTerrain(4, 1, 'citadel');
    setTerrain(5, 3, 'citadel');
    setTerrain(4, 5, 'citadel');

    // Conductive river & Luopan water tiles
    setTerrain(1, 1, 'water');
    setTerrain(2, 2, 'water');
    setTerrain(2, 4, 'water');
    setTerrain(3, 5, 'water');
    setTerrain(1, 5, 'chasm');
  } else if (theme === 'foundry') {
    // Sector 2: Ronglu Foundry — twin chasms + magma vents + central ring
    setTerrain(0, 0, 'mountain');
    setTerrain(0, 6, 'mountain');
    setTerrain(1, 0, 'chasm');
    setTerrain(2, 0, 'chasm');
    setTerrain(1, 6, 'chasm');
    setTerrain(2, 6, 'chasm');

    // Magma & ring hazards
    setTerrain(2, 3, 'magma');
    setTerrain(3, 2, 'chasm');
    setTerrain(1, 4, 'magma');

    // Citadels
    setTerrain(5, 1, 'citadel');
    setTerrain(5, 3, 'citadel');
    setTerrain(5, 5, 'citadel');
    setTerrain(4, 0, 'mountain');
  } else {
    // Sector 3: Tianshu Imperial Citadel — high-stakes boss arena
    setTerrain(0, 0, 'chasm');
    setTerrain(0, 6, 'chasm');
    setTerrain(2, 0, 'chasm');
    setTerrain(2, 6, 'chasm');
    setTerrain(6, 0, 'mountain');
    setTerrain(6, 6, 'mountain');

    setTerrain(2, 2, 'water');
    setTerrain(2, 4, 'water');
    setTerrain(3, 4, 'magma');
    setTerrain(1, 3, 'water');

    setTerrain(4, 1, 'citadel');
    setTerrain(5, 2, 'citadel');
    setTerrain(5, 4, 'citadel');
    setTerrain(4, 5, 'citadel');
  }

  return board;
}

export function recomputeEnemyIntentGeometry(
  state: BattleState,
  enemy: UnitState,
): void {
  if (enemy.team !== 'enemy' || enemy.hp <= 0) {
    enemy.intent = null;
    return;
  }
  if (enemy.waterlogged || enemy.shocked) {
    enemy.intent = null;
    return;
  }
  if (!enemy.intent) return;

  const dir = enemy.intent.dir;
  const vec = DIR_VECTORS[dir];
  const pattern = enemy.intent.pattern;
  const affected: GridCoord[] = [];
  let targetCoord: GridCoord = {
    r: enemy.r + vec.r,
    c: enemy.c + vec.c,
  };

  if (pattern === 'charge_line') {
    let currR = enemy.r + vec.r;
    let currC = enemy.c + vec.c;
    while (isInBounds(currR, currC)) {
      affected.push({ r: currR, c: currC });
      targetCoord = { r: currR, c: currC };
      const tile = state.board[currR][currC];
      const occ = getUnitAt(state, currR, currC);
      if (
        occ ||
        tile.terrain === 'mountain' ||
        tile.terrain === 'citadel' ||
        tile.terrain === 'chasm'
      ) {
        break;
      }
      currR += vec.r;
      currC += vec.c;
    }
    enemy.intent.pushDir = dir;
  } else if (pattern === 'lob_artillery') {
    const dist = Math.max(
      2,
      Math.min(
        4,
        manhattanDist(
          { r: enemy.r, c: enemy.c },
          enemy.intent.targetCoord,
        ) || 3,
      ),
    );
    const tr = Math.max(0, Math.min(BOARD_SIZE - 1, enemy.r + vec.r * dist));
    const tc = Math.max(0, Math.min(BOARD_SIZE - 1, enemy.c + vec.c * dist));
    targetCoord = { r: tr, c: tc };
    affected.push({ r: tr, c: tc });
    enemy.intent.pushDir = dir;
  } else if (pattern === 'wide_cleave') {
    const fr = enemy.r + vec.r;
    const fc = enemy.c + vec.c;
    targetCoord = { r: fr, c: fc };
    const perpDirs: Direction4[] =
      dir === 0 || dir === 2 ? [1, 3] : [0, 2];
    if (isInBounds(fr, fc)) {
      affected.push({ r: fr, c: fc });
    }
    for (const pDir of perpDirs) {
      const pv = DIR_VECTORS[pDir];
      const sr = fr + pv.r;
      const sc = fc + pv.c;
      if (isInBounds(sr, sc)) {
        affected.push({ r: sr, c: sc });
      }
    }
    enemy.intent.pushDir = dir;
  } else if (pattern === 'pierce_beam') {
    for (let step = 1; step <= 3; step++) {
      const br = enemy.r + vec.r * step;
      const bc = enemy.c + vec.c * step;
      if (!isInBounds(br, bc)) break;
      affected.push({ r: br, c: bc });
      targetCoord = { r: br, c: bc };
      if (state.board[br][bc].terrain === 'mountain') break;
    }
    enemy.intent.pushDir = null;
  } else if (pattern === 'boss_crush') {
    const fr = enemy.r + vec.r;
    const fc = enemy.c + vec.c;
    targetCoord = { r: fr, c: fc };
    if (isInBounds(fr, fc)) affected.push({ r: fr, c: fc });
    for (const d of [0, 1, 2, 3] as Direction4[]) {
      const dv = DIR_VECTORS[d];
      const nr = fr + dv.r;
      const nc = fc + dv.c;
      if (
        isInBounds(nr, nc) &&
        !(nr === enemy.r && nc === enemy.c) &&
        !affected.some((p) => p.r === nr && p.c === nc)
      ) {
        affected.push({ r: nr, c: nc });
      }
    }
    enemy.intent.pushDir = dir;
  }

  enemy.facing = dir;
  enemy.intent.targetCoord = targetCoord;
  enemy.intent.affectedTiles = affected;
}

export function recalculateAllEnemyTelegraphs(state: BattleState): void {
  for (const unit of state.units) {
    if (unit.team === 'enemy' && unit.hp > 0) {
      recomputeEnemyIntentGeometry(state, unit);
    }
  }
}

function chooseEnemyMoveAndIntent(
  state: BattleState,
  enemy: UnitState,
): void {
  if (enemy.hp <= 0) return;
  const def = ENEMY_DEFS[enemy.enemyId!];
  const reachable = getReachableTiles(state, enemy.uid);
  reachable.unshift({ r: enemy.r, c: enemy.c });

  // Evaluate candidate (pos, dir) pairs to find a high-threat telegraph against Citadels or Player Mechs
  let bestScore = -999;
  let bestPos: GridCoord = { r: enemy.r, c: enemy.c };
  let bestIntent: EnemyIntent | null = null;

  const pattern: EnemyIntent['pattern'] =
    enemy.enemyId === 'juggernaut'
      ? 'charge_line'
      : enemy.enemyId === 'scorpion'
        ? 'lob_artillery'
        : enemy.enemyId === 'bastion'
          ? 'wide_cleave'
          : enemy.enemyId === 'stormwing'
            ? 'pierce_beam'
            : 'boss_crush';

  const origR = enemy.r;
  const origC = enemy.c;

  for (const pos of reachable) {
    const posTile = state.board[pos.r][pos.c];
    if (!enemy.flying && (posTile.terrain === 'water' || posTile.terrain === 'chasm')) {
      continue;
    }

    enemy.r = pos.r;
    enemy.c = pos.c;

    for (const dir of [0, 1, 2, 3] as Direction4[]) {
      const vec = DIR_VECTORS[dir];
      const baseDist = pattern === 'lob_artillery' ? 3 : 1;
      enemy.intent = {
        pattern,
        dir,
        targetCoord: {
          r: pos.r + vec.r * baseDist,
          c: pos.c + vec.c * baseDist,
        },
        affectedTiles: [],
        pushDir: dir,
        damage: def.damage + (state.isEndless ? state.endlessLoop : 0),
      };
      recomputeEnemyIntentGeometry(state, enemy);

      let score = 0;
      // Bonus for standing on or near the Luopan ring so the player has rich counterplay
      if (isLuopanRingTile(pos.r, pos.c)) {
        score += 6;
      }
      if (posTile.terrain === 'magma') {
        score -= 8;
      }

      for (const cell of enemy.intent.affectedTiles) {
        if (!isInBounds(cell.r, cell.c)) continue;
        const tile = state.board[cell.r][cell.c];
        const occ = getUnitAt(state, cell.r, cell.c);

        if (tile.terrain === 'citadel' && tile.citadelHp > 0) {
          score += 36;
        }
        if (occ && occ.team === 'player') {
          score += 28;
        }
        if (occ && occ.team === 'enemy' && occ.uid !== enemy.uid) {
          score -= 22;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestPos = { ...pos };
        bestIntent = {
          ...enemy.intent,
          targetCoord: { ...enemy.intent.targetCoord },
          affectedTiles: enemy.intent.affectedTiles.map((c) => ({ ...c })),
        };
      }
    }
  }

  enemy.r = bestPos.r;
  enemy.c = bestPos.c;
  enemy.intent = bestIntent;
  if (enemy.intent) {
    enemy.facing = enemy.intent.dir;
    recomputeEnemyIntentGeometry(state, enemy);
  } else {
    enemy.r = origR;
    enemy.c = origC;
  }
}

function getMaxConcurrentEnemies(state: BattleState): number {
  const diff = DIFFICULTY_DEFS[state.difficulty];
  const sectorBonus = state.sectorIndex === 0 ? 0 : 1;
  return diff.maxConcurrentEnemiesBase + sectorBonus + (state.isEndless ? 1 : 0);
}

function seedEmergenceCracks(state: BattleState, requestedCount: number): void {
  const livingEnemies = state.units.filter(
    (u) => u.team === 'enemy' && u.hp > 0,
  ).length;
  const maxCap = getMaxConcurrentEnemies(state);
  const availableSlots = Math.max(0, maxCap - livingEnemies);
  const count = Math.min(requestedCount, Math.max(state.difficulty === 'master' ? 1 : 0, availableSlots));
  if (count <= 0) return;

  const candidates: GridCoord[] = [];
  for (let r = 0; r <= 3; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const tile = state.board[r][c];
      if (
        tile.terrain === 'plain' &&
        !tile.hasEmergenceCrack &&
        !getUnitAt(state, r, c)
      ) {
        candidates.push({ r, c });
      }
    }
  }

  const pool: EnemyArchetypeId[] =
    state.sectorIndex === 0
      ? state.difficulty === 'casual'
        ? ['juggernaut', 'scorpion']
        : ['juggernaut', 'scorpion', 'bastion']
      : state.sectorIndex === 1
        ? ['juggernaut', 'scorpion', 'bastion', 'stormwing']
        : ['juggernaut', 'bastion', 'stormwing', 'scorpion'];

  for (let i = 0; i < count && candidates.length > 0; i++) {
    const rPick = nextRng(state.seed);
    state.seed = rPick.nextSeed;
    const idx = Math.floor(rPick.value * candidates.length);
    const chosen = candidates.splice(idx, 1)[0];

    const typePick = nextRng(state.seed);
    state.seed = typePick.nextSeed;
    const arch = pool[Math.floor(typePick.value * pool.length)];

    state.board[chosen.r][chosen.c].hasEmergenceCrack = true;
    state.board[chosen.r][chosen.c].emergingEnemyType = arch;
  }
}

export function createBattleState(
  sectorIndex = 0,
  existingRelics: RelicId[] = [],
  existingUpgrades?: BattleState['mechUpgrades'],
  carryGridPower?: number,
  carryStarIron = 2,
  carryScore = 0,
  isEndless = false,
  endlessLoop = 0,
  seed = 20261112,
  difficulty: DifficultyTier = 'standard',
): BattleState {
  const board = buildSectorBoard(sectorIndex);
  const diffDef = DIFFICULTY_DEFS[difficulty];
  const upgrades: BattleState['mechUpgrades'] = existingUpgrades ?? {
    titan: { bonusHp: 0, bonusMove: 0, bonusDamage: 0 },
    arbalest: { bonusHp: 0, bonusMove: 0, bonusDamage: 0 },
    geomancer: { bonusHp: 0, bonusMove: 0, bonusDamage: 0 },
  };

  const hasJadeAegis = existingRelics.includes('jade_aegis');
  const hasDoubleLuopan = existingRelics.includes('double_luopan');
  const hasOverclock = existingRelics.includes('overclock_thrusters');

  const maxGridPower = diffDef.gridPower + (hasJadeAegis ? 1 : 0);
  const gridPower =
    carryGridPower !== undefined
      ? Math.min(maxGridPower, Math.max(3, carryGridPower))
      : maxGridPower;
  const maxLuopanCharges = diffDef.luopanCharges + (hasDoubleLuopan ? 2 : 0);

  const state: BattleState = {
    seed,
    difficulty,
    sectorIndex,
    isEndless,
    endlessLoop,
    turn: 1,
    maxTurns: BATTLE_MAX_TURNS,
    phase: 'player_turn',
    gridPower,
    maxGridPower,
    starIron: carryStarIron,
    score: carryScore,
    totalKills: 0,
    chainKills: 0,
    friendlyFireCount: 0,
    luopanCharges: maxLuopanCharges,
    maxLuopanCharges,
    resetsRemaining: diffDef.resets,
    board,
    units: [],
    relics: [...existingRelics],
    mechUpgrades: upgrades,
    objectives: {
      zeroGridDamage: true,
      chainKillsTarget: 2,
      chainKillsAchieved: 0,
      blockedSpawnsTarget: 1,
      blockedSpawnsAchieved: 0,
    },
    logs: [],
    turnStartSnapshot: null,
    lastFxEvents: [],
  };

  // Spawn 3 Player Mechs in the southern defense perimeter
  const mechSpawns: Record<MechClassId, GridCoord> = {
    titan: { r: 4, c: 3 },
    arbalest: { r: 6, c: 2 },
    geomancer: { r: 5, c: 5 },
  };
  if (board[5][5].terrain === 'citadel') {
    mechSpawns.geomancer = { r: 6, c: 4 };
  }

  for (const mechId of MECH_ORDER) {
    const def = MECH_DEFS[mechId];
    const upg = upgrades[mechId];
    const pos = mechSpawns[mechId];
    const maxHp = def.maxHp + upg.bonusHp + diffDef.mechBonusHp;
    state.units.push({
      uid: `mech_${mechId}`,
      team: 'player',
      mechId,
      name: def.name,
      r: pos.r,
      c: pos.c,
      hp: maxHp,
      maxHp,
      moveRange: def.moveRange + upg.bonusMove + (hasOverclock ? 1 : 0),
      flying: def.flying,
      armor: def.armor,
      frontShielded: false,
      facing: 0,
      shielded: hasJadeAegis || diffDef.startShielded,
      shocked: false,
      waterlogged: false,
      burning: false,
      hasMoved: false,
      hasActed: false,
      moveStartCoord: { ...pos },
      secondaryCooldown: 0,
      bonusDamage: upg.bonusDamage,
      intent: null,
      orderIndex: 0,
    });
  }

  // Spawn initial curated enemy formation on/around the Luopan Ring
  const sector0Enemies: Array<{
    enemyId: EnemyArchetypeId;
    r: number;
    c: number;
    dir: Direction4;
    targetCoord: GridCoord;
  }> = [
    {
      enemyId: 'juggernaut',
      r: 2,
      c: 3,
      dir: 2,
      targetCoord: { r: 4, c: 3 },
    },
    {
      enemyId: 'scorpion',
      r: 1,
      c: 5,
      dir: 2,
      targetCoord: { r: 4, c: 5 },
    },
  ];
  if (difficulty !== 'casual') {
    sector0Enemies.push({
      enemyId: 'bastion',
      r: 3,
      c: 1,
      dir: 2,
      targetCoord: { r: 4, c: 1 },
    });
  }

  const initialEnemies: Array<{
    enemyId: EnemyArchetypeId;
    r: number;
    c: number;
    dir: Direction4;
    targetCoord: GridCoord;
  }> =
    sectorIndex === 0
      ? sector0Enemies
      : sectorIndex === 1
        ? [
            {
              enemyId: 'bastion',
              r: 2,
              c: 2,
              dir: 2,
              targetCoord: { r: 3, c: 2 },
            },
            {
              enemyId: 'juggernaut',
              r: 3,
              c: 3,
              dir: 2,
              targetCoord: { r: 5, c: 3 },
            },
            {
              enemyId: 'stormwing',
              r: 2,
              c: 5,
              dir: 2,
              targetCoord: { r: 5, c: 5 },
            },
            ...(difficulty === 'casual'
              ? []
              : [
                  {
                    enemyId: 'scorpion' as const,
                    r: 2,
                    c: 1,
                    dir: 2 as Direction4,
                    targetCoord: { r: 5, c: 1 },
                  },
                ]),
          ]
        : [
            {
              enemyId: 'taotie_boss',
              r: 2,
              c: 3,
              dir: 2,
              targetCoord: { r: 3, c: 3 },
            },
            {
              enemyId: 'stormwing',
              r: 3,
              c: 4,
              dir: 2,
              targetCoord: { r: 5, c: 4 },
            },
            {
              enemyId: 'juggernaut',
              r: 2,
              c: 1,
              dir: 2,
              targetCoord: { r: 4, c: 1 },
            },
            ...(difficulty === 'casual'
              ? []
              : [
                  {
                    enemyId: 'scorpion' as const,
                    r: 2,
                    c: 5,
                    dir: 2 as Direction4,
                    targetCoord: { r: 4, c: 5 },
                  },
                ]),
          ];

  // Ensure Sector 1 (1,5) is plain if scorpion spawns there
  if (sectorIndex === 0) {
    state.board[1][5].terrain = 'plain';
    state.board[1][5].elevation = 0;
    state.board[0][5].terrain = 'chasm';
    state.board[0][5].elevation = -1.5;
  }

  let orderCounter = 1;
  for (const spec of initialEnemies) {
    const def = ENEMY_DEFS[spec.enemyId];
    const diffHpDelta =
      difficulty === 'casual' && spec.enemyId === 'taotie_boss'
        ? -1
        : difficulty === 'master' && (spec.enemyId === 'taotie_boss' || spec.enemyId === 'bastion')
          ? 1
          : sectorIndex === 0 && spec.enemyId === 'bastion' && difficulty === 'standard'
            ? -1
            : 0;
    const hpBoost = (isEndless ? endlessLoop : 0) + diffHpDelta;
    const baseMaxHp = Math.max(2, def.maxHp + hpBoost);
    // Warm-up Sector 0 on casual/standard keeps Bastion unshielded so new players learn displacement cleanly
    const frontShielded =
      sectorIndex === 0 && difficulty !== 'master' ? false : def.frontShielded;

    const pattern: EnemyIntent['pattern'] =
      spec.enemyId === 'juggernaut'
        ? 'charge_line'
        : spec.enemyId === 'scorpion'
          ? 'lob_artillery'
          : spec.enemyId === 'bastion'
            ? 'wide_cleave'
            : spec.enemyId === 'stormwing'
              ? 'pierce_beam'
              : 'boss_crush';

    const unit: UnitState = {
      uid: `enemy_${orderCounter}_${spec.enemyId}`,
      team: 'enemy',
      enemyId: spec.enemyId,
      name: def.name,
      r: spec.r,
      c: spec.c,
      hp: baseMaxHp,
      maxHp: baseMaxHp,
      moveRange: def.moveRange,
      flying: def.flying,
      armor: 0,
      frontShielded,
      facing: spec.dir,
      shielded: false,
      shocked: false,
      waterlogged: false,
      burning: false,
      hasMoved: false,
      hasActed: false,
      moveStartCoord: { r: spec.r, c: spec.c },
      secondaryCooldown: 0,
      bonusDamage: 0,
      intent: {
        pattern,
        dir: spec.dir,
        targetCoord: { ...spec.targetCoord },
        affectedTiles: [],
        pushDir: spec.dir,
        damage: def.damage + (isEndless ? endlessLoop : 0),
      },
      orderIndex: orderCounter++,
    };
    state.units.push(unit);
    recomputeEnemyIntentGeometry(state, unit);
  }

  const initialCracks =
    difficulty === 'casual' || (sectorIndex === 0 && difficulty === 'standard')
      ? 1
      : 2;
  seedEmergenceCracks(state, initialCracks);
  appendLog(
    state,
    `进入${SECTORS[sectorIndex % SECTORS.length].name}：荒兽已锁定弹道，请调度神机或旋转「璇玑罗盘」化解危机！`,
    'amber',
  );
  saveTurnStartSnapshot(state);
  return state;
}

export function saveTurnStartSnapshot(state: BattleState): void {
  const copy = cloneBattleState(state);
  copy.turnStartSnapshot = null;
  copy.lastFxEvents = [];
  state.turnStartSnapshot = JSON.stringify(copy);
}

export function getReachableTiles(
  state: BattleState,
  unitUid: string,
): GridCoord[] {
  const unit = getUnitById(state, unitUid);
  if (!unit || unit.hasMoved || unit.hasActed) return [];

  const visited = new Map<string, number>();
  const queue: Array<{ r: number; c: number; dist: number }> = [
    { r: unit.r, c: unit.c, dist: 0 },
  ];
  visited.set(`${unit.r},${unit.c}`, 0);
  const results: GridCoord[] = [];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr.dist >= unit.moveRange) continue;

    for (const dir of [0, 1, 2, 3] as Direction4[]) {
      const vec = DIR_VECTORS[dir];
      const nr = curr.r + vec.r;
      const nc = curr.c + vec.c;
      if (!isInBounds(nr, nc)) continue;
      const key = `${nr},${nc}`;
      if (visited.has(key)) continue;

      const tile = state.board[nr][nc];
      const occupant = getUnitAt(state, nr, nc);

      if (!unit.flying) {
        if (
          tile.terrain === 'mountain' ||
          tile.terrain === 'citadel' ||
          tile.terrain === 'chasm'
        ) {
          continue;
        }
        if (occupant && occupant.team !== unit.team) {
          continue;
        }
      }

      visited.set(key, curr.dist + 1);
      queue.push({ r: nr, c: nc, dist: curr.dist + 1 });

      // Can only stop on an unoccupied tile that supports the unit
      const canStopTerrain =
        unit.flying ||
        (tile.terrain !== 'mountain' &&
          tile.terrain !== 'citadel' &&
          tile.terrain !== 'chasm');
      if (!occupant && canStopTerrain) {
        results.push({ r: nr, c: nc });
      }
    }
  }

  return results;
}

export function getValidWeaponTargets(
  state: BattleState,
  unitUid: string,
  slot: WeaponSlotKey,
): GridCoord[] {
  const unit = getUnitById(state, unitUid);
  if (!unit || unit.team !== 'player' || unit.hasActed || !unit.mechId) {
    return [];
  }
  if (slot === 'secondary' && unit.secondaryCooldown > 0) {
    return [];
  }
  if (unit.waterlogged && !unit.flying) {
    return [];
  }

  const mechDef = MECH_DEFS[unit.mechId];
  const weapon =
    slot === 'primary' ? mechDef.primaryWeapon : mechDef.secondaryWeapon;
  const targets: GridCoord[] = [];

  if (weapon.pattern === 'melee_cleave_push') {
    for (const dir of [0, 1, 2, 3] as Direction4[]) {
      const vec = DIR_VECTORS[dir];
      const tr = unit.r + vec.r;
      const tc = unit.c + vec.c;
      if (isInBounds(tr, tc)) {
        targets.push({ r: tr, c: tc });
      }
    }
  } else if (weapon.pattern === 'grapple_pull') {
    for (const dir of [0, 1, 2, 3] as Direction4[]) {
      const vec = DIR_VECTORS[dir];
      for (let d = 1; d <= weapon.rangeMax; d++) {
        const tr = unit.r + vec.r * d;
        const tc = unit.c + vec.c * d;
        if (!isInBounds(tr, tc)) break;
        const tile = state.board[tr][tc];
        const occ = getUnitAt(state, tr, tc);
        if (
          occ ||
          tile.terrain === 'mountain' ||
          tile.terrain === 'citadel'
        ) {
          if (d >= weapon.rangeMin) {
            targets.push({ r: tr, c: tc });
          }
          break;
        }
      }
    }
  } else if (
    weapon.pattern === 'mortar_cross_push' ||
    weapon.pattern === 'arc_lightning' ||
    weapon.pattern === 'aegis_pulse'
  ) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const dist = manhattanDist({ r: unit.r, c: unit.c }, { r, c });
        if (dist >= weapon.rangeMin && dist <= weapon.rangeMax) {
          targets.push({ r, c });
        }
      }
    }
  } else if (weapon.pattern === 'swap_teleport') {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const dist = manhattanDist({ r: unit.r, c: unit.c }, { r, c });
        if (dist >= weapon.rangeMin && dist <= weapon.rangeMax) {
          const occ = getUnitAt(state, r, c);
          if (occ && occ.uid !== unit.uid) {
            targets.push({ r, c });
          }
        }
      }
    }
  }

  return targets;
}

function dealDamageToUnit(
  state: BattleState,
  target: UnitState,
  rawDamage: number,
  sourceDesc: string,
  isChainOrCollision = false,
  attackFromDir: Direction4 | null = null,
): number {
  if (target.hp <= 0 || rawDamage <= 0) return 0;

  if (target.shielded) {
    target.shielded = false;
    appendLog(state, `${target.name}的「玉璋圣盾」抵消了${sourceDesc}伤害！`, 'jade');
    return 0;
  }

  let dmg = rawDamage;
  if (
    target.frontShielded &&
    !isChainOrCollision &&
    attackFromDir !== null
  ) {
    // If attack hits frontal shield (attack direction is opposite to unit facing)
    const oppositeFacing = ((target.facing + 2) % 4) as Direction4;
    if (attackFromDir === oppositeFacing) {
      dmg = Math.max(0, dmg - 1);
      appendLog(state, `${target.name}正面重盾减免了 1 点直击伤害！`, 'info');
    }
  }
  if (target.armor > 0 && !isChainOrCollision) {
    dmg = Math.max(1, dmg - target.armor);
  }

  target.hp = Math.max(0, target.hp - dmg);

  if (
    target.team === 'player' &&
    target.hp > 0 &&
    !target.shielded &&
    state.relics.includes('overclock_thrusters') &&
    (target.mechId === 'titan' || target.mechId === 'arbalest')
  ) {
    target.shielded = true;
  }

  if (target.hp === 0 && target.team === 'enemy') {
    target.intent = null;
    state.totalKills += 1;
    state.score += target.enemyId === 'taotie_boss' ? 350 : 120;
    if (isChainOrCollision) {
      state.chainKills += 1;
      state.objectives.chainKillsAchieved += 1;
      state.score += 80;
      triggerVampiricRelicIfUnlocked(state);
    }
    appendLog(
      state,
      `击破【${target.name}】（${sourceDesc}）！`,
      isChainOrCollision ? 'amber' : 'jade',
    );
  }

  return dmg;
}

function triggerVampiricRelicIfUnlocked(state: BattleState): void {
  if (!state.relics.includes('vampiric_bronze')) return;
  if (state.gridPower < state.maxGridPower) {
    state.gridPower += 1;
  }
  for (const u of state.units) {
    if (u.team === 'player' && u.hp > 0) {
      u.hp = Math.min(u.maxHp, u.hp + 1);
    }
  }
}

function damageCitadelAt(
  state: BattleState,
  r: number,
  c: number,
  amount: number,
  reason: string,
): void {
  const tile = getTile(state, r, c);
  if (!tile || tile.terrain !== 'citadel' || tile.citadelHp <= 0) return;

  const actual = Math.min(tile.citadelHp, amount);
  tile.citadelHp -= actual;
  state.gridPower = Math.max(0, state.gridPower - actual);
  state.objectives.zeroGridDamage = false;
  appendLog(
    state,
    `警告：九州灵脉塔 (${r + 1},${c + 1}) 遭受${reason}，灵脉电力 -${actual}！`,
    'danger',
  );
  if (state.gridPower <= 0) {
    state.phase = 'defeat';
    appendLog(state, '九州灵脉彻底枯竭，防线失守！', 'danger');
  }
}

function applyTileHazardAfterDisplacement(
  state: BattleState,
  unit: UnitState,
  dispRecord?: DisplacementVector,
): void {
  if (unit.hp <= 0) return;
  const tile = state.board[unit.r][unit.c];

  if (tile.terrain === 'chasm' && !unit.flying) {
    unit.hp = 0;
    unit.intent = null;
    if (dispRecord) dispRecord.droppedInChasm = true;
    state.lastFxEvents.push({
      kind: 'chasm_fall',
      from: { r: unit.r, c: unit.c },
      to: { r: unit.r, c: unit.c },
      colorHex: '#EF4444',
      label: '坠渊!',
    });
    if (unit.team === 'enemy') {
      state.totalKills += 1;
      state.chainKills += 1;
      state.objectives.chainKillsAchieved += 1;
      state.score += 200;
      triggerVampiricRelicIfUnlocked(state);
      appendLog(state, `【${unit.name}】坠入千丈深渊，当场粉身碎骨！`, 'amber');
    } else {
      appendLog(state, `【${unit.name}】坠入深渊重创！`, 'danger');
    }
    return;
  }

  if (tile.terrain === 'water' && !unit.flying) {
    if (
      unit.team === 'player' &&
      state.relics.includes('thunder_conductor')
    ) {
      unit.shielded = true;
      unit.waterlogged = false;
    } else {
      unit.waterlogged = true;
      if (dispRecord) dispRecord.drownedInWater = true;
      if (unit.team === 'enemy') {
        unit.intent = null;
        appendLog(
          state,
          `【${unit.name}】落入沧澜水脉，机关短路熄火，本回合攻击取消！`,
          'jade',
        );
      }
    }
  } else {
    unit.waterlogged = false;
  }

  if (tile.terrain === 'magma' || tile.onFire) {
    unit.burning = true;
    dealDamageToUnit(state, unit, 1, '熔岩地火灼烧', true, null);
  }
}

export function pushUnitInDirection(
  state: BattleState,
  unit: UnitState,
  dir: Direction4,
  displacements: DisplacementVector[],
): void {
  if (unit.hp <= 0) return;
  const vec = DIR_VECTORS[dir];
  const nr = unit.r + vec.r;
  const nc = unit.c + vec.c;
  const collisionDmg = state.relics.includes('seismic_shock') ? 2 : 1;

  const fromCoord = { r: unit.r, c: unit.c };

  // Out of board edge acts as wall collision
  if (!isInBounds(nr, nc)) {
    dealDamageToUnit(state, unit, collisionDmg, '撞击边界石壁', true, null);
    displacements.push({
      unitUid: unit.uid,
      from: fromCoord,
      to: fromCoord,
      collided: true,
      droppedInChasm: false,
      drownedInWater: false,
    });
    recomputeEnemyIntentGeometry(state, unit);
    return;
  }

  const destTile = state.board[nr][nc];
  const otherUnit = getUnitAt(state, nr, nc);

  if (otherUnit) {
    // Unit-to-unit collision: both take collision damage!
    dealDamageToUnit(
      state,
      unit,
      collisionDmg,
      `与${otherUnit.name}猛烈相撞`,
      true,
      null,
    );
    dealDamageToUnit(
      state,
      otherUnit,
      collisionDmg,
      `被${unit.name}撞击`,
      true,
      null,
    );
    displacements.push({
      unitUid: unit.uid,
      from: fromCoord,
      to: { r: nr, c: nc },
      collided: true,
      droppedInChasm: false,
      drownedInWater: false,
    });
    state.lastFxEvents.push({
      kind: 'push_bump',
      from: fromCoord,
      to: { r: nr, c: nc },
      colorHex: '#F59E0B',
      label: `撞击 -${collisionDmg}`,
    });
    recomputeEnemyIntentGeometry(state, unit);
    recomputeEnemyIntentGeometry(state, otherUnit);
    return;
  }

  if (destTile.terrain === 'mountain') {
    dealDamageToUnit(state, unit, collisionDmg, '撞击玄武岩山', true, null);
    displacements.push({
      unitUid: unit.uid,
      from: fromCoord,
      to: { r: nr, c: nc },
      collided: true,
      droppedInChasm: false,
      drownedInWater: false,
    });
    state.lastFxEvents.push({
      kind: 'push_bump',
      from: fromCoord,
      to: { r: nr, c: nc },
      colorHex: '#F59E0B',
      label: `撞山 -${collisionDmg}`,
    });
    recomputeEnemyIntentGeometry(state, unit);
    return;
  }

  if (destTile.terrain === 'citadel' && destTile.citadelHp > 0) {
    dealDamageToUnit(state, unit, collisionDmg, '撞击灵脉城垣', true, null);
    damageCitadelAt(state, nr, nc, 1, `${unit.name}撞击`);
    displacements.push({
      unitUid: unit.uid,
      from: fromCoord,
      to: { r: nr, c: nc },
      collided: true,
      droppedInChasm: false,
      drownedInWater: false,
    });
    recomputeEnemyIntentGeometry(state, unit);
    return;
  }

  // Tile is open (plain, water, magma, or chasm) — unit slides into (nr, nc)
  unit.r = nr;
  unit.c = nc;
  const dispRecord: DisplacementVector = {
    unitUid: unit.uid,
    from: fromCoord,
    to: { r: nr, c: nc },
    collided: false,
    droppedInChasm: false,
    drownedInWater: false,
  };
  displacements.push(dispRecord);
  applyTileHazardAfterDisplacement(state, unit, dispRecord);
  recomputeEnemyIntentGeometry(state, unit);
}

function collectConnectedLightningChain(
  state: BattleState,
  startCoord: GridCoord,
): GridCoord[] {
  const visited = new Set<string>();
  const queue: GridCoord[] = [startCoord];
  const chain: GridCoord[] = [];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const key = `${curr.r},${curr.c}`;
    if (visited.has(key)) continue;
    visited.add(key);

    const tile = getTile(state, curr.r, curr.c);
    const occ = getUnitAt(state, curr.r, curr.c);
    const isConductive =
      (tile && tile.terrain === 'water') ||
      occ !== undefined ||
      coordsEqual(curr, startCoord);

    if (!isConductive) continue;
    chain.push(curr);

    for (const dir of [0, 1, 2, 3] as Direction4[]) {
      const vec = DIR_VECTORS[dir];
      const nr = curr.r + vec.r;
      const nc = curr.c + vec.c;
      if (!isInBounds(nr, nc)) continue;
      const nKey = `${nr},${nc}`;
      if (visited.has(nKey)) continue;
      const nTile = state.board[nr][nc];
      const nOcc = getUnitAt(state, nr, nc);
      if (nTile.terrain === 'water' || nOcc !== undefined) {
        queue.push({ r: nr, c: nc });
      }
    }
  }

  return chain;
}

export function getThreatenedCitadels(state: BattleState): GridCoord[] {
  const threatened: GridCoord[] = [];
  for (const u of state.units) {
    if (u.team !== 'enemy' || u.hp <= 0 || !u.intent) continue;
    for (const cell of u.intent.affectedTiles) {
      const tile = getTile(state, cell.r, cell.c);
      if (
        tile &&
        tile.terrain === 'citadel' &&
        tile.citadelHp > 0 &&
        !threatened.some((t) => t.r === cell.r && t.c === cell.c)
      ) {
        threatened.push({ r: cell.r, c: cell.c });
      }
    }
  }
  return threatened;
}

export function countFriendlyFireTargets(state: BattleState): number {
  let count = 0;
  for (const attacker of state.units) {
    if (attacker.team !== 'enemy' || attacker.hp <= 0 || !attacker.intent) {
      continue;
    }
    for (const cell of attacker.intent.affectedTiles) {
      const victim = getUnitAt(state, cell.r, cell.c);
      if (
        victim &&
        victim.team === 'enemy' &&
        victim.uid !== attacker.uid &&
        victim.hp > 0
      ) {
        count += 1;
      }
    }
  }
  return count;
}

export function executeTacticalActionInPlace(
  state: BattleState,
  action: TacticalAction,
  displacementsOut: DisplacementVector[] = [],
  lightningPathOut: GridCoord[] = [],
): boolean {
  state.lastFxEvents = [];

  if (action.kind === 'move') {
    const unit = getUnitById(state, action.unitUid);
    if (!unit || unit.team !== 'player' || unit.hasMoved || unit.hasActed) {
      return false;
    }
    const reachable = getReachableTiles(state, unit.uid);
    if (!reachable.some((c) => coordsEqual(c, action.to))) {
      return false;
    }
    unit.moveStartCoord = { r: unit.r, c: unit.c };
    unit.facing = getDirectionBetween(
      { r: unit.r, c: unit.c },
      action.to,
    );
    unit.r = action.to.r;
    unit.c = action.to.c;
    unit.hasMoved = true;

    const tile = state.board[unit.r][unit.c];
    if (tile.terrain === 'water' && !unit.flying) {
      if (state.relics.includes('thunder_conductor')) {
        unit.shielded = true;
      } else {
        unit.waterlogged = true;
      }
    } else {
      unit.waterlogged = false;
    }

    recalculateAllEnemyTelegraphs(state);
    appendLog(
      state,
      `${unit.name} 机动部署至 (${action.to.r + 1}, ${action.to.c + 1})。`,
      'info',
    );
    return true;
  }

  if (action.kind === 'luopan_rotate') {
    if (state.luopanCharges <= 0) return false;
    state.luopanCharges -= 1;

    // Rotate emergence cracks on the 3x3 Luopan ring
    const ringCoords: GridCoord[] = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (isLuopanZone(r, c)) {
          ringCoords.push({ r, c });
        }
      }
    }

    const oldCracks = ringCoords.map((pos) => ({
      pos,
      hasCrack: state.board[pos.r][pos.c].hasEmergenceCrack,
      type: state.board[pos.r][pos.c].emergingEnemyType,
    }));
    for (const item of oldCracks) {
      state.board[item.pos.r][item.pos.c].hasEmergenceCrack = false;
      state.board[item.pos.r][item.pos.c].emergingEnemyType = null;
    }
    for (const item of oldCracks) {
      if (item.hasCrack) {
        const nextPos = rotateLuopanCoord(item.pos, action.clockwise);
        state.board[nextPos.r][nextPos.c].hasEmergenceCrack = true;
        state.board[nextPos.r][nextPos.c].emergingEnemyType = item.type;
      }
    }

    // Rotate all units sitting on the 3x3 Luopan zone AND rotate their facing / intent directions
    const unitsOnRing = state.units.filter(
      (u) => u.hp > 0 && isLuopanZone(u.r, u.c),
    );
    const rotatedMoves = unitsOnRing.map((u) => ({
      unit: u,
      from: { r: u.r, c: u.c },
      to: rotateLuopanCoord({ r: u.r, c: u.c }, action.clockwise),
      nextFacing: rotateDir4(u.facing, action.clockwise),
    }));

    for (const move of rotatedMoves) {
      move.unit.r = move.to.r;
      move.unit.c = move.to.c;
      move.unit.facing = move.nextFacing;
      if (move.unit.team === 'player') {
        move.unit.moveStartCoord = null; // Lock undo after ring rotation
        if (state.relics.includes('double_luopan')) {
          move.unit.hp = Math.min(move.unit.maxHp, move.unit.hp + 1);
        }
      }
      if (move.unit.intent) {
        move.unit.intent.dir = rotateDir4(
          move.unit.intent.dir,
          action.clockwise,
        );
        if (move.unit.intent.pushDir !== null) {
          move.unit.intent.pushDir = rotateDir4(
            move.unit.intent.pushDir,
            action.clockwise,
          );
        }
      }
      displacementsOut.push({
        unitUid: move.unit.uid,
        from: move.from,
        to: move.to,
        collided: false,
        droppedInChasm: false,
        drownedInWater: false,
      });
    }

    // Apply terrain effects at rotated destinations
    for (const move of rotatedMoves) {
      const disp = displacementsOut.find((d) => d.unitUid === move.unit.uid);
      applyTileHazardAfterDisplacement(state, move.unit, disp);
    }

    recalculateAllEnemyTelegraphs(state);
    state.lastFxEvents.push({
      kind: 'luopan_spin',
      from: { ...LUOPAN_CENTER },
      to: { ...LUOPAN_CENTER },
      clockwise: action.clockwise,
      colorHex: '#F59E0B',
      label: action.clockwise ? '璇玑顺旋 90°' : '璇玑逆旋 90°',
    });
    appendLog(
      state,
      `发动【璇玑移星】：青铜内环${action.clockwise ? '顺时针' : '逆时针'}旋转 90°，环上单位与敌方弹道同步偏转！`,
      'amber',
    );
    return true;
  }

  if (action.kind === 'weapon') {
    const unit = getUnitById(state, action.unitUid);
    if (!unit || unit.team !== 'player' || !unit.mechId || unit.hasActed) {
      return false;
    }
    const validTargets = getValidWeaponTargets(state, unit.uid, action.slot);
    if (!validTargets.some((c) => coordsEqual(c, action.target))) {
      return false;
    }

    const mechDef = MECH_DEFS[unit.mechId];
    const weapon =
      action.slot === 'primary'
        ? mechDef.primaryWeapon
        : mechDef.secondaryWeapon;
    const totalDmg = weapon.baseDamage + unit.bonusDamage;
    const dir = getDirectionBetween(
      { r: unit.r, c: unit.c },
      action.target,
    );
    unit.facing = dir;
    unit.hasActed = true;
    unit.moveStartCoord = null;

    if (
      action.slot === 'secondary' &&
      !state.relics.includes('artillery_echo')
    ) {
      unit.secondaryCooldown = weapon.cooldownTurns;
    }

    if (weapon.pattern === 'melee_cleave_push') {
      state.lastFxEvents.push({
        kind: 'slash_impact',
        from: { r: unit.r, c: unit.c },
        to: { ...action.target },
        colorHex: '#10B981',
        label: weapon.name,
      });
      const victim = getUnitAt(state, action.target.r, action.target.c);
      if (victim) {
        dealDamageToUnit(state, victim, totalDmg, weapon.name, false, dir);
        if (victim.hp > 0) {
          pushUnitInDirection(state, victim, dir, displacementsOut);
        }
      }
    } else if (weapon.pattern === 'grapple_pull') {
      state.lastFxEvents.push({
        kind: 'grapple_line',
        from: { r: unit.r, c: unit.c },
        to: { ...action.target },
        colorHex: '#10B981',
        label: weapon.name,
      });
      const targetUnit = getUnitAt(state, action.target.r, action.target.c);
      const vec = DIR_VECTORS[dir];

      if (targetUnit) {
        dealDamageToUnit(state, targetUnit, totalDmg, weapon.name, false, dir);
        if (targetUnit.hp > 0) {
          const destR = unit.r + vec.r;
          const destC = unit.c + vec.c;
          if (!getUnitAt(state, destR, destC)) {
            const fromCoord = { r: targetUnit.r, c: targetUnit.c };
            targetUnit.r = destR;
            targetUnit.c = destC;
            const disp: DisplacementVector = {
              unitUid: targetUnit.uid,
              from: fromCoord,
              to: { r: destR, c: destC },
              collided: false,
              droppedInChasm: false,
              drownedInWater: false,
            };
            displacementsOut.push(disp);
            applyTileHazardAfterDisplacement(state, targetUnit, disp);
          }
        }
      } else {
        // Grapple to mountain or citadel pulls the Titan right in front of it
        const destR = action.target.r - vec.r;
        const destC = action.target.c - vec.c;
        if (!getUnitAt(state, destR, destC)) {
          const fromCoord = { r: unit.r, c: unit.c };
          unit.r = destR;
          unit.c = destC;
          const disp: DisplacementVector = {
            unitUid: unit.uid,
            from: fromCoord,
            to: { r: destR, c: destC },
            collided: false,
            droppedInChasm: false,
            drownedInWater: false,
          };
          displacementsOut.push(disp);
          applyTileHazardAfterDisplacement(state, unit, disp);
        }
      }
    } else if (weapon.pattern === 'mortar_cross_push') {
      state.lastFxEvents.push({
        kind: 'mortar_arc',
        from: { r: unit.r, c: unit.c },
        to: { ...action.target },
        colorHex: '#F59E0B',
        label: weapon.name,
      });
      const centerVictim = getUnitAt(state, action.target.r, action.target.c);
      if (centerVictim) {
        dealDamageToUnit(
          state,
          centerVictim,
          totalDmg,
          weapon.name,
          false,
          null,
        );
      }
      // Push all 4 adjacent units outward away from impact center
      for (const pDir of [0, 1, 2, 3] as Direction4[]) {
        const pv = DIR_VECTORS[pDir];
        const ar = action.target.r + pv.r;
        const ac = action.target.c + pv.c;
        const adjUnit = getUnitAt(state, ar, ac);
        if (adjUnit) {
          pushUnitInDirection(state, adjUnit, pDir, displacementsOut);
        }
      }
    } else if (weapon.pattern === 'arc_lightning') {
      const chain = collectConnectedLightningChain(state, action.target);
      const bonusLightning = state.relics.includes('thunder_conductor') ? 1 : 0;
      const arcDmg = totalDmg + bonusLightning;

      for (const node of chain) {
        lightningPathOut.push({ ...node });
        const occ = getUnitAt(state, node.r, node.c);
        if (occ && occ.team === 'enemy') {
          const isWaterChain =
            state.board[node.r][node.c].terrain === 'water' ||
            chain.length > 1;
          dealDamageToUnit(
            state,
            occ,
            arcDmg,
            '紫电奔雷链',
            isWaterChain,
            null,
          );
          if (occ.hp > 0 && state.board[node.r][node.c].terrain === 'water') {
            occ.shocked = true;
            occ.intent = null;
          }
        }
      }

      state.lastFxEvents.push({
        kind: 'lightning_chain',
        from: { r: unit.r, c: unit.c },
        to: { ...action.target },
        path: chain.map((c) => ({ ...c })),
        colorHex: '#38BDF8',
        label: `雷链 ×${chain.length}`,
      });
    } else if (weapon.pattern === 'swap_teleport') {
      const other = getUnitAt(state, action.target.r, action.target.c);
      if (!other) return false;

      const uFrom = { r: unit.r, c: unit.c };
      const oFrom = { r: other.r, c: other.c };
      unit.r = oFrom.r;
      unit.c = oFrom.c;
      other.r = uFrom.r;
      other.c = uFrom.c;

      const dispA: DisplacementVector = {
        unitUid: unit.uid,
        from: uFrom,
        to: oFrom,
        collided: false,
        droppedInChasm: false,
        drownedInWater: false,
      };
      const dispB: DisplacementVector = {
        unitUid: other.uid,
        from: oFrom,
        to: uFrom,
        collided: false,
        droppedInChasm: false,
        drownedInWater: false,
      };
      displacementsOut.push(dispA, dispB);

      if (other.team === 'enemy') {
        dealDamageToUnit(state, other, totalDmg, weapon.name, true, null);
      }
      applyTileHazardAfterDisplacement(state, unit, dispA);
      applyTileHazardAfterDisplacement(state, other, dispB);

      state.lastFxEvents.push({
        kind: 'swap_flash',
        from: uFrom,
        to: oFrom,
        colorHex: '#06B6D4',
        label: '乾坤移星',
      });
    } else if (weapon.pattern === 'aegis_pulse') {
      const targetTile = state.board[action.target.r][action.target.c];
      const targetUnit = getUnitAt(state, action.target.r, action.target.c);

      if (targetUnit && targetUnit.team === 'player') {
        targetUnit.shielded = true;
        targetUnit.hp = Math.min(targetUnit.maxHp, targetUnit.hp + 1);
        targetUnit.waterlogged = false;
        targetUnit.burning = false;
      }
      if (targetTile.terrain === 'citadel' && targetTile.citadelHp < targetTile.citadelMaxHp) {
        targetTile.citadelHp += 1;
        state.gridPower = Math.min(state.maxGridPower, state.gridPower + 1);
      }

      for (const pDir of [0, 1, 2, 3] as Direction4[]) {
        const pv = DIR_VECTORS[pDir];
        const ar = action.target.r + pv.r;
        const ac = action.target.c + pv.c;
        const adjEnemy = getUnitAt(state, ar, ac);
        if (adjEnemy && adjEnemy.team === 'enemy') {
          pushUnitInDirection(state, adjEnemy, pDir, displacementsOut);
        }
      }

      state.lastFxEvents.push({
        kind: 'shield_dome',
        from: { r: unit.r, c: unit.c },
        to: { ...action.target },
        colorHex: '#06B6D4',
        label: '金汤圣盾',
      });
    }

    recalculateAllEnemyTelegraphs(state);
    return true;
  }

  return false;
}

export function simulateActionPreview(
  state: BattleState,
  action: TacticalAction,
): ActionPreviewResult {
  const beforeThreatened = getThreatenedCitadels(state);
  const beforeEnemiesAlive = state.units.filter(
    (u) => u.team === 'enemy' && u.hp > 0,
  ).length;

  const sim = cloneBattleState(state);
  const displacements: DisplacementVector[] = [];
  const lightningPath: GridCoord[] = [];
  const valid = executeTacticalActionInPlace(
    sim,
    action,
    displacements,
    lightningPath,
  );

  const afterThreatened = getThreatenedCitadels(sim);
  const savedCitadels = beforeThreatened.filter(
    (b) => !afterThreatened.some((a) => coordsEqual(a, b)),
  );
  const afterEnemiesAlive = sim.units.filter(
    (u) => u.team === 'enemy' && u.hp > 0,
  ).length;
  const enemyKills = Math.max(0, beforeEnemiesAlive - afterEnemiesAlive);
  const friendlyFireRedirects = countFriendlyFireTargets(sim);

  const affectedTiles: TileEffectPreview[] = [];

  for (const disp of displacements) {
    const beforeUnit = state.units.find((u) => u.uid === disp.unitUid);
    const afterUnit = sim.units.find((u) => u.uid === disp.unitUid);
    const hpLost =
      beforeUnit && afterUnit ? Math.max(0, beforeUnit.hp - afterUnit.hp) : 0;

    let badgeText: string | null = null;
    let badgeTone: TileEffectPreview['badgeTone'] = 'amber';
    if (disp.droppedInChasm) {
      badgeText = '坠渊秒杀!';
      badgeTone = 'danger';
    } else if (disp.drownedInWater) {
      badgeText = '落水熄火!';
      badgeTone = 'cyan';
    } else if (disp.collided) {
      badgeText = `撞击 -${hpLost}`;
      badgeTone = 'danger';
    }

    affectedTiles.push({
      coord: disp.to,
      damage: hpLost,
      shieldApplied: Boolean(afterUnit?.shielded && !beforeUnit?.shielded),
      healAmount: 0,
      badgeText,
      badgeTone,
      pushDir: coordsEqual(disp.from, disp.to)
        ? null
        : getDirectionBetween(disp.from, disp.to),
    });
  }

  // Also check stationary units that took direct damage or shield
  for (const bUnit of state.units) {
    if (bUnit.hp <= 0) continue;
    const aUnit = sim.units.find((u) => u.uid === bUnit.uid);
    if (!aUnit) continue;
    const alreadyListed = affectedTiles.some((t) =>
      coordsEqual(t.coord, { r: aUnit.r, c: aUnit.c }),
    );
    const dmg = Math.max(0, bUnit.hp - aUnit.hp);
    const healed = Math.max(0, aUnit.hp - bUnit.hp);
    const newlyShielded = aUnit.shielded && !bUnit.shielded;

    if (!alreadyListed && (dmg > 0 || healed > 0 || newlyShielded)) {
      affectedTiles.push({
        coord: { r: aUnit.r, c: aUnit.c },
        damage: dmg,
        shieldApplied: newlyShielded,
        healAmount: healed,
        badgeText:
          aUnit.hp <= 0
            ? '击破!'
            : dmg > 0
              ? `-${dmg}`
              : newlyShielded
                ? '+圣盾'
                : `+${healed}`,
        badgeTone: dmg > 0 ? 'danger' : 'jade',
        pushDir: null,
      });
    }
  }

  for (const saved of savedCitadels) {
    affectedTiles.push({
      coord: saved,
      damage: 0,
      shieldApplied: false,
      healAmount: 0,
      badgeText: '危机解除',
      badgeTone: 'jade',
      pushDir: null,
    });
  }

  let summaryTitle = '战术预演';
  const tags: string[] = [];
  if (enemyKills > 0) tags.push(`击杀 ${enemyKills} 敌`);
  if (savedCitadels.length > 0) tags.push(`解救灵脉 ×${savedCitadels.length}`);
  if (friendlyFireRedirects > 0)
    tags.push(`借刀杀人 ×${friendlyFireRedirects}`);
  if (displacements.some((d) => d.drownedInWater)) tags.push('落水熄火');
  if (displacements.some((d) => d.collided)) tags.push('触发碰撞');

  if (action.kind === 'luopan_rotate') {
    summaryTitle = action.clockwise
      ? '璇玑罗盘 · 顺旋 90°'
      : '璇玑罗盘 · 逆旋 90°';
  } else if (action.kind === 'weapon') {
    const u = getUnitById(state, action.unitUid);
    if (u && u.mechId) {
      const w =
        action.slot === 'primary'
          ? MECH_DEFS[u.mechId].primaryWeapon
          : MECH_DEFS[u.mechId].secondaryWeapon;
      summaryTitle = `${u.name} · ${w.name}`;
    }
  } else if (action.kind === 'move') {
    const u = getUnitById(state, action.unitUid);
    summaryTitle = `${u?.name ?? '神机'} · 机动走位`;
  }

  return {
    valid,
    action,
    summaryTitle,
    summaryDetail:
      tags.length > 0 ? tags.join(' · ') : '调整阵型与弹道位置',
    affectedTiles,
    displacements,
    lightningPath,
    savedCitadels,
    friendlyFireRedirects,
    enemyKills,
    resultingState: sim,
  };
}

export function undoUnitMove(state: BattleState, unitUid: string): boolean {
  const unit = getUnitById(state, unitUid);
  if (
    !unit ||
    unit.team !== 'player' ||
    !unit.hasMoved ||
    unit.hasActed ||
    !unit.moveStartCoord
  ) {
    return false;
  }
  unit.r = unit.moveStartCoord.r;
  unit.c = unit.moveStartCoord.c;
  unit.hasMoved = false;
  unit.waterlogged = false;
  recalculateAllEnemyTelegraphs(state);
  appendLog(state, `${unit.name} 撤回了本回合移动。`, 'info');
  return true;
}

export function resetCurrentTurn(state: BattleState): BattleState | null {
  if (state.resetsRemaining <= 0 || !state.turnStartSnapshot) {
    return null;
  }
  const restored = JSON.parse(state.turnStartSnapshot) as BattleState;
  restored.resetsRemaining = state.resetsRemaining - 1;
  restored.turnStartSnapshot = state.turnStartSnapshot;
  appendLog(
    restored,
    '发动【司南回溯】：时间倒流至本回合初！（剩余回溯次数 0）',
    'amber',
  );
  return restored;
}

export function resolveEndTurn(state: BattleState): void {
  if (state.phase !== 'player_turn') return;
  state.lastFxEvents = [];

  // 1. Burn damage on magma/burning units
  for (const unit of state.units) {
    if (unit.hp <= 0) continue;
    const tile = state.board[unit.r][unit.c];
    if (unit.burning || tile.terrain === 'magma') {
      dealDamageToUnit(state, unit, 1, '地火灼烧', true, null);
    }
  }

  // 2. Enemy Attack Resolution in orderIndex sequence
  const enemies = state.units
    .filter((u) => u.team === 'enemy' && u.hp > 0)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  for (const enemy of enemies) {
    if (enemy.hp <= 0 || !enemy.intent || enemy.waterlogged || enemy.shocked) {
      continue;
    }

    recomputeEnemyIntentGeometry(state, enemy);
    const intent = enemy.intent;
    if (!intent) continue;

    if (intent.pattern === 'charge_line') {
      // Move enemy up to the tile right before the impact tile
      const path = intent.affectedTiles;
      if (path.length > 0) {
        const hitCoord = path[path.length - 1];
        if (path.length >= 2) {
          const stopCoord = path[path.length - 2];
          if (!getUnitAt(state, stopCoord.r, stopCoord.c)) {
            enemy.r = stopCoord.r;
            enemy.c = stopCoord.c;
          }
        }
        const hitTile = getTile(state, hitCoord.r, hitCoord.c);
        const hitUnit = getUnitAt(state, hitCoord.r, hitCoord.c);

        if (hitTile && hitTile.terrain === 'chasm' && !enemy.flying) {
          enemy.r = hitCoord.r;
          enemy.c = hitCoord.c;
          applyTileHazardAfterDisplacement(state, enemy);
          continue;
        }
        if (hitUnit && hitUnit.uid !== enemy.uid) {
          const isFriendlyFire = hitUnit.team === 'enemy';
          if (isFriendlyFire) {
            state.friendlyFireCount += 1;
            appendLog(
              state,
              `借刀杀人：【${enemy.name}】蛮横冲撞误伤了友军【${hitUnit.name}】！`,
              'amber',
            );
          }
          dealDamageToUnit(
            state,
            hitUnit,
            intent.damage,
            `${enemy.name}冲锋`,
            isFriendlyFire,
            intent.dir,
          );
          if (hitUnit.hp > 0 && intent.pushDir !== null) {
            pushUnitInDirection(state, hitUnit, intent.pushDir, []);
          }
        } else if (hitTile && hitTile.terrain === 'citadel') {
          damageCitadelAt(
            state,
            hitCoord.r,
            hitCoord.c,
            1,
            `${enemy.name}冲撞`,
          );
        }
      }
    } else {
      if (intent.pattern === 'pierce_beam') {
        state.lastFxEvents.push({
          kind: 'beam_laser',
          from: { r: enemy.r, c: enemy.c },
          to: { ...intent.targetCoord },
          path: intent.affectedTiles.map((c) => ({ ...c })),
          colorHex: '#EC4899',
        });
      }

      for (const cell of intent.affectedTiles) {
        const tile = getTile(state, cell.r, cell.c);
        const victim = getUnitAt(state, cell.r, cell.c);

        if (victim && victim.uid !== enemy.uid) {
          const isFriendlyFire = victim.team === 'enemy';
          if (isFriendlyFire) {
            state.friendlyFireCount += 1;
            appendLog(
              state,
              `借刀杀人：【${enemy.name}】的攻击误中了友军【${victim.name}】！`,
              'amber',
            );
          }
          dealDamageToUnit(
            state,
            victim,
            intent.damage,
            enemy.name,
            isFriendlyFire,
            intent.dir,
          );
          if (
            victim.hp > 0 &&
            intent.pattern === 'boss_crush' &&
            intent.pushDir !== null
          ) {
            pushUnitInDirection(state, victim, intent.pushDir, []);
          }
        }

        if (tile && tile.terrain === 'citadel' && tile.citadelHp > 0) {
          damageCitadelAt(state, cell.r, cell.c, 1, `${enemy.name}轰击`);
        }
      }
    }

    if (state.gridPower <= 0) return;
  }

  // 3. Check if final turn completed -> Sector Victory!
  if (state.turn >= state.maxTurns) {
    state.phase = 'victory';
    let bonusIron = 2;
    if (state.objectives.zeroGridDamage) bonusIron += 2;
    if (state.objectives.chainKillsAchieved >= state.objectives.chainKillsTarget) {
      bonusIron += 1;
    }
    if (
      state.objectives.blockedSpawnsAchieved >=
      state.objectives.blockedSpawnsTarget
    ) {
      bonusIron += 1;
    }
    if (state.difficulty !== 'master' && state.gridPower < state.maxGridPower) {
      state.gridPower = Math.min(state.maxGridPower, state.gridPower + 1);
    }
    const mult = DIFFICULTY_DEFS[state.difficulty].scoreMult;
    state.starIron += bonusIron;
    state.score += Math.round((state.gridPower * 150 + bonusIron * 100) * mult);
    appendLog(
      state,
      `成功坚守 ${state.maxTurns} 回合，璇玑大阵封印完成！获得 +${bonusIron} 星铁奖励！`,
      'jade',
    );
    return;
  }

  // 4. Advance Turn & Process Subterranean Emergence Fissures
  state.turn += 1;
  let maxOrder = state.units.reduce(
    (acc, u) => Math.max(acc, u.orderIndex),
    1,
  );

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const tile = state.board[r][c];
      if (!tile.hasEmergenceCrack || !tile.emergingEnemyType) continue;

      const blocker = getUnitAt(state, r, c);
      if (blocker) {
        tile.hasEmergenceCrack = false;
        tile.emergingEnemyType = null;
        state.objectives.blockedSpawnsAchieved += 1;
        state.score += 100;

        if (
          blocker.team === 'player' &&
          state.relics.includes('fissure_spikes')
        ) {
          state.starIron += 2;
          appendLog(
            state,
            `【镇脉伏龙钉】生效：${blocker.name}零伤镇压地脉涌穴，额外获 +2 星铁！`,
            'jade',
          );
        } else {
          dealDamageToUnit(state, blocker, 1, '封堵地脉涌穴反震', true, null);
          appendLog(
            state,
            `${blocker.name}以身躯压制了 (${r + 1},${c + 1}) 的地底荒兽破土！`,
            'amber',
          );
        }
      } else {
        const arch = tile.emergingEnemyType;
        const def = ENEMY_DEFS[arch];
        tile.hasEmergenceCrack = false;
        tile.emergingEnemyType = null;
        maxOrder += 1;
        const hpBoost = state.isEndless ? state.endlessLoop : 0;

        const spawned: UnitState = {
          uid: `enemy_t${state.turn}_${maxOrder}_${arch}`,
          team: 'enemy',
          enemyId: arch,
          name: def.name,
          r,
          c,
          hp: def.maxHp + hpBoost,
          maxHp: def.maxHp + hpBoost,
          moveRange: def.moveRange,
          flying: def.flying,
          armor: 0,
          frontShielded: def.frontShielded,
          facing: 2,
          shielded: false,
          shocked: false,
          waterlogged: false,
          burning: false,
          hasMoved: false,
          hasActed: false,
          moveStartCoord: { r, c },
          secondaryCooldown: 0,
          bonusDamage: 0,
          intent: null,
          orderIndex: maxOrder,
        };
        state.units.push(spawned);
      }
    }
  }

  // Remove dead enemy corpses so board stays clean
  state.units = state.units.filter((u) => u.team === 'player' || u.hp > 0);

  // 5. Refresh Player Mechs (or revive downed pilots at 2 HP with repair protocol)
  for (const u of state.units) {
    if (u.team === 'player') {
      if (u.hp <= 0) {
        u.hp = 2;
      }
      u.hasMoved = false;
      u.hasActed = false;
      u.shocked = false;
      u.waterlogged = false;
      u.moveStartCoord = { r: u.r, c: u.c };
      if (u.secondaryCooldown > 0) {
        u.secondaryCooldown -= 1;
      }
    } else {
      u.shocked = false;
      u.waterlogged = false;
    }
  }

  // 6. Living Enemies Move & Lock In New Telegraphs
  for (const enemy of state.units) {
    if (enemy.team === 'enemy' && enemy.hp > 0) {
      chooseEnemyMoveAndIntent(state, enemy);
    }
  }

  // 7. Seed new Emergence Cracks if not final turn (scaled by difficulty & sector)
  if (state.turn < state.maxTurns) {
    const desiredCracks =
      state.difficulty === 'casual' ||
      (state.sectorIndex === 0 && state.difficulty === 'standard' && state.turn <= 2)
        ? 1
        : 2;
    seedEmergenceCracks(state, desiredCracks);
  }

  saveTurnStartSnapshot(state);
}

/**
 * Deterministic Tactical AI Advisor ("司南推演"):
 * Evaluates all available 1-step actions (Luopan rotations + Mech attacks)
 * and returns the best tactical action to help the player discover clever chain reactions.
 */
export function findBestTacticalAction(
  state: BattleState,
): ActionPreviewResult | null {
  if (state.phase !== 'player_turn') return null;

  const candidates: TacticalAction[] = [];

  if (state.luopanCharges > 0) {
    candidates.push({ kind: 'luopan_rotate', clockwise: true });
    candidates.push({ kind: 'luopan_rotate', clockwise: false });
  }

  for (const unit of state.units) {
    if (unit.team !== 'player' || unit.hp <= 0 || unit.hasActed) continue;

    for (const slot of ['primary', 'secondary'] as WeaponSlotKey[]) {
      const targets = getValidWeaponTargets(state, unit.uid, slot);
      for (const target of targets) {
        candidates.push({
          kind: 'weapon',
          unitUid: unit.uid,
          slot,
          target,
        });
      }
    }
  }

  let bestPreview: ActionPreviewResult | null = null;
  let bestScore = -9999;

  for (const act of candidates) {
    const preview = simulateActionPreview(state, act);
    if (!preview.valid) continue;

    let score = 0;
    score += preview.savedCitadels.length * 140;
    score += preview.enemyKills * 110;
    score += preview.friendlyFireRedirects * 95;

    for (const disp of preview.displacements) {
      if (disp.droppedInChasm) score += 120;
      if (disp.drownedInWater) score += 85;
      if (disp.collided) score += 55;
    }

    for (const tileEff of preview.affectedTiles) {
      const targetUnit = getUnitAt(state, tileEff.coord.r, tileEff.coord.c);
      if (targetUnit?.team === 'enemy') {
        score += tileEff.damage * 35;
      } else if (targetUnit?.team === 'player') {
        score -= tileEff.damage * 60;
        if (tileEff.shieldApplied) score += 30;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestPreview = preview;
    }
  }

  return bestPreview;
}

export function getDraftableRelics(
  state: BattleState,
  count = 3,
): RelicId[] {
  const unowned = RELIC_LIST.map((r) => r.id).filter(
    (id) => !state.relics.includes(id),
  );
  if (unowned.length <= count) return unowned;
  const result: RelicId[] = [];
  let s = state.seed + state.sectorIndex * 37;
  const pool = [...unowned];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const r = nextRng(s);
    s = r.nextSeed;
    const idx = Math.floor(r.value * pool.length);
    result.push(pool.splice(idx, 1)[0]);
  }
  return result;
}
