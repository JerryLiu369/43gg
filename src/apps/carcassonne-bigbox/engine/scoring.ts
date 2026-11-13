import type { Component } from './board.ts';
import type { FigureKind } from './types.ts';
import { TRADE_GOODS, type TradeGood } from './tiles.ts';

/** Majority strength: a large meeple counts as two followers; builders and pigs count zero. */
export const FIGURE_STRENGTH: Record<FigureKind, number> = { MEEPLE: 1, LARGE: 2, ABBOT: 1, BUILDER: 0, PIG: 0 };

/** Players with the (shared) majority among the given figures, ascending. Empty when nobody has strength. */
export function majorityOwners(figures: readonly { owner: number; kind: FigureKind }[]): number[] {
  const strength = new Map<number, number>();
  for (const f of figures) strength.set(f.owner, (strength.get(f.owner) ?? 0) + FIGURE_STRENGTH[f.kind]);
  const max = Math.max(0, ...strength.values());
  if (max === 0) return [];
  return [...strength.entries()]
    .filter(([, v]) => v === max)
    .map(([p]) => p)
    .sort((a, b) => a - b);
}

export interface MagicPresence {
  mage: boolean;
  witch: boolean;
}

/**
 * Points of a road, city, monastery or garden in its current state: complete features score as
 * in the game, incomplete ones as in the final scoring.
 *
 * - Road: 1/tile; with an inn 2/tile when complete, 0 when incomplete.
 * - City: complete 2/tile + 2/coat of arms; incomplete 1 + 1. A cathedral makes it 3 + 3 when
 *   complete and 0 when incomplete.
 * - Monastery/garden: 9 when complete, otherwise 1 + surrounding tiles.
 * - Mage: +1 per tile (roads and cities only, also on top of an incomplete inn/cathedral 0).
 *   Witch: half of the total, rounded up.
 */
export function featureValue(comp: Component, magic: MagicPresence = { mage: false, witch: false }): number {
  const tiles = comp.tiles.length;
  switch (comp.kind) {
    case 'ROAD':
    case 'CITY': {
      let value: number;
      if (comp.kind === 'ROAD') {
        value = tiles * (comp.inn ? (comp.complete ? 2 : 0) : 1);
      } else {
        const per = comp.cathedral ? (comp.complete ? 3 : 0) : comp.complete ? 2 : 1;
        value = per * (tiles + comp.pennants);
      }
      if (magic.mage) value += tiles;
      if (magic.witch) value = Math.ceil(value / 2);
      return value;
    }
    case 'MONASTERY':
    case 'GARDEN':
      return comp.complete ? 9 : 1 + comp.surrounding;
    default:
      throw new Error(`featureValue: ${comp.kind} is not scored this way`);
  }
}

/** Field points for one majority player: 3 per completed bordering city, 4 with their own pig in the field. */
export function fieldPoints(completedCities: number, ownPig: boolean): number {
  return completedCities * (ownPig ? 4 : 3);
}

/** Gold ingot table: 1/2/3/4 points per ingot for 1-3/4-6/7-9/10+ ingots. */
export function goldPoints(ingots: number): number {
  if (ingots <= 0) return 0;
  const each = ingots >= 10 ? 4 : ingots >= 7 ? 3 : ingots >= 4 ? 2 : 1;
  return ingots * each;
}

/** Trade goods: 10 points per kind to every player holding the most (at least one) tokens of that kind. */
export function goodsPoints(goods: readonly Record<TradeGood, number>[]): number[] {
  const out = goods.map(() => 0);
  for (const g of TRADE_GOODS) {
    const max = Math.max(...goods.map((p) => p[g]));
    if (max <= 0) continue;
    goods.forEach((p, i) => {
      if (p[g] === max) out[i] += 10;
    });
  }
  return out;
}

/** Robber share: half of the victim's points, rounded up. */
export function robberShare(points: number): number {
  return Math.ceil(points / 2);
}
