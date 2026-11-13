import {
  MESSAGE_IDS,
  coordKey,
  randomInt,
  shuffle,
  type GameState,
  type PublicGameView,
  type TileCatalog,
} from '../engine/index.ts';

/** What a bot is allowed to see: the public view (the journals are optional). */
export type BotView = Omit<PublicGameView, 'log' | 'actions'> & Partial<Pick<PublicGameView, 'log' | 'actions'>>;

function takeOne(pool: string[], id: string): void {
  const i = pool.indexOf(id);
  if (i >= 0) pool.splice(i, 1);
}

/**
 * Turns a public view into a full engine state by filling the hidden information (stack orders,
 * message order, RNG) with a random guess consistent with everything public. The engine can then
 * simulate actions on it without the bot ever seeing the real draw pile or the flight die.
 */
export function determinize(view: BotView, cat: TileCatalog, rng: number): { state: GameState; rng: number } {
  const expansions = view.config.expansions;
  const main: string[] = [...cat.composition.BASE];
  for (const e of expansions) if (e !== 'STREAM') main.push(...cat.composition[e]);
  const river = expansions.includes('STREAM')
    ? cat.composition.STREAM.filter((id) => id !== cat.riverSourceId && id !== cat.riverLakeId)
    : [];
  let lakeLeft = expansions.includes('STREAM') && cat.riverLakeId !== null;

  const used: string[] = [...view.discarded];
  for (const [key, p] of Object.entries(view.board.tiles)) if (key !== coordKey(0, 0)) used.push(p.tileId);
  if (view.turn.part.tileId && !view.turn.part.placed) used.push(view.turn.part.tileId);
  for (const id of used) {
    if (id === cat.riverLakeId) lakeLeft = false;
    else if (cat.tiles[id]?.expansion === 'STREAM') takeOne(river, id);
    else takeOne(main, id);
  }

  let r = shuffle(main, rng);
  const drawPile = r.items.slice(0, view.drawPileCount);
  r = shuffle(river, r.state);
  let riverPile = lakeLeft && cat.riverLakeId ? [...r.items, cat.riverLakeId] : r.items;
  riverPile = riverPile.slice(Math.max(0, riverPile.length - view.riverPileCount));

  const held = view.pending?.type === 'MESSAGE' ? view.pending.message : null;
  const m = shuffle(
    MESSAGE_IDS.filter((id) => id !== held),
    r.state,
  );
  const messageDeck = m.items.slice(0, view.messageDeckCount);
  const seed = randomInt(m.state, 0x7fffffff);

  const { drawPileCount: _d, riverPileCount: _r, messageDeckCount: _m, ...rest } = view as BotView & Record<string, unknown>;
  const state = {
    ...structuredClone(rest),
    config: { ...view.config, seed: 'determinized' },
    rng: seed.value >>> 0,
    drawPile,
    riverPile,
    messageDeck,
    log: [],
    actions: [],
  } as unknown as GameState;
  delete (state as unknown as Record<string, unknown>).logLength;
  delete (state as unknown as Record<string, unknown>).actionCount;
  return { state, rng: seed.state };
}
