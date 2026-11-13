import {
  analyzeBoard,
  featureValue,
  goldPoints,
  goodsPoints,
  majorityOwners,
  nodeKey,
  type Component,
  type Figure,
  type GameState,
  type MagicFigure,
  type TileCatalog,
} from '../engine/index.ts';

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Expected final points of every player in a (determinized) state: the current score plus the
 * likely value of every feature the player holds, trade goods, gold, robbers and figures still in
 * the supply. Only public information is used.
 */
export function expectedPoints(s: GameState, cat: TileCatalog): number[] {
  if (s.finished && s.final) return [...s.final.scores];
  const n = s.players.length;
  const remaining = s.drawPile.length + s.riverPile.length;
  // Chance that there are still enough tiles to finish a feature.
  const avail = clamp01(remaining / (6 * n));
  const an = analyzeBoard(cat, s.board);
  const byComp = new Map<number, Figure[]>();
  for (const f of s.figures) {
    const id = an.byNode.get(nodeKey(f.x, f.y, f.feature));
    if (id === undefined) continue;
    if (!byComp.has(id)) byComp.set(id, []);
    byComp.get(id)!.push(f);
  }
  const magicComp = (m: MagicFigure) => {
    const ref = s.magic[m];
    return ref ? an.byNode.get(nodeKey(ref.x, ref.y, ref.feature)) : undefined;
  };
  const mage = magicComp('MAGE');
  const witch = magicComp('WITCH');

  const value = s.players.map((p) => p.score + p.messengerScore + goldPoints(p.gold) + (p.robber !== null ? 3 : 0));
  goodsPoints(s.players.map((p) => p.goods)).forEach((v, i) => (value[i] += 0.8 * v));

  const fieldValue = (comp: Component, owner: number, figures: Figure[]) => {
    let done = 0;
    let open = 0;
    for (const id of comp.adjacentCities) {
      if (an.components[id].complete) done++;
      else open++;
    }
    const pig = figures.some((f) => f.owner === owner && f.kind === 'PIG');
    return (3 * done + 1.3 * open * avail) * (pig ? 4 / 3 : 1);
  };

  for (const [id, figures] of byComp) {
    const comp = an.components[id];
    const owners = majorityOwners(figures.filter((f) => f.kind !== 'BUILDER' && f.kind !== 'PIG'));
    if (!owners.length) continue;
    let points = 0;
    if (comp.kind === 'ROAD' || comp.kind === 'CITY') {
      const magic = { mage: mage === id, witch: witch === id };
      const now = featureValue(comp, magic);
      if (comp.complete) points = now;
      else {
        const whenDone = featureValue({ ...comp, complete: true }, magic);
        const openEdges = comp.kind === 'CITY' ? comp.openSlots / 3 : comp.openSlots;
        const pc = clamp01((1 - 0.2 * Math.max(0, openEdges - 1)) * avail);
        points = now + (whenDone - now) * pc;
        // A builder on its own feature promises extra tiles.
        if (figures.some((f) => f.kind === 'BUILDER')) points += 1.5 * avail;
      }
    } else if (comp.kind === 'MONASTERY' || comp.kind === 'GARDEN') {
      const now = featureValue(comp);
      const pc = comp.complete ? 1 : clamp01((1 - 0.08 * (8 - comp.surrounding)) * avail);
      points = now + (9 - now) * pc;
    }
    for (const o of owners) {
      const v = comp.kind === 'FIELD' ? fieldValue(comp, o, figures) : points;
      value[o] += owners.length > 1 ? v * 0.9 : v;
    }
  }

  // Figures in the supply can still earn points; a locked-up meeple cannot.
  const meeple = 2.2 * avail;
  for (const p of s.players) {
    value[p.index] +=
      meeple * Math.min(p.supply.MEEPLE, 5) +
      1.5 * meeple * p.supply.LARGE +
      0.8 * meeple * (p.supply.ABBOT + p.supply.BUILDER) +
      0.4 * meeple * p.supply.PIG;
  }
  return value;
}

/** How good a state is for `player`: own expected points against the strongest and average opponent. */
export function evaluateFor(s: GameState, player: number, cat: TileCatalog): number {
  const v = expectedPoints(s, cat);
  const others = v.filter((_, i) => i !== player);
  if (!others.length) return v[player];
  const best = Math.max(...others);
  const mean = others.reduce((a, b) => a + b, 0) / others.length;
  return v[player] - 0.5 * best - 0.5 * mean;
}
