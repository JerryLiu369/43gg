import {
  applyAction,
  legalActions,
  randomInt,
  seedFromString,
  trackPosition,
  type Action,
  type GameState,
  type TileCatalog,
} from '../engine/index.ts';
import type { BotLevel } from '../lib/types.ts';
import { determinize, type BotView } from './determinize.ts';
import { evaluateFor } from './evaluate.ts';

export interface BotOptions {
  level: BotLevel;
  cat: TileCatalog;
  /** Seed of the bot's own randomness (not the game seed, which bots never see). */
  seed: string;
  /** Upper bound for one decision; the search returns its best answer so far when it runs out. */
  timeBudgetMs?: number;
}

interface LevelParams {
  /** Evaluation noise (points). */
  noise: number;
  /** Probability of a uniformly random move. */
  blunder: number;
  /** Candidates whose own follow-up decisions are searched. */
  beam: number;
  /** Depth of own follow-up decisions searched for beam candidates. */
  depth: number;
  /** Determinizations averaged for actions with a random outcome (flight die, draws). */
  samples: number;
  /** Maximum candidates evaluated at the first level. */
  width: number;
  budgetMs: number;
}

const LEVELS: Record<BotLevel, LevelParams> = {
  EASY: { noise: 3, blunder: 0.2, beam: 0, depth: 0, samples: 1, width: 40, budgetMs: 300 },
  NORMAL: { noise: 0.5, blunder: 0, beam: 6, depth: 1, samples: 1, width: 120, budgetMs: 1200 },
  HARD: { noise: 0, blunder: 0, beam: 14, depth: 2, samples: 3, width: 220, budgetMs: 3000 },
};

/** Decisions whose outcome depends on hidden randomness and benefit from several determinizations. */
const RANDOM_OUTCOME = new Set<Action['type']>(['FLY']);

/** The "do nothing" answer used for timed-out human decisions (spec §2 notes). */
export function passiveAction(legal: readonly Action[]): Action {
  const prefer = legal.find(
    (a) =>
      a.type === 'SKIP_FIGURE' ||
      a.type === 'KEEP_ROBBER' ||
      a.type === 'CROP_SKIP' ||
      (a.type === 'RESOLVE_MESSAGE' && !a.perform) ||
      (a.type === 'CHOOSE_SCORE_FIGURE' && a.figure === 'SCORE'),
  );
  const a = prefer ?? legal[0];
  if (!a) throw new Error('No legal action');
  return a;
}

/** Robbers: rob the strongest opponent whose track figure stands on an allowed space. */
function robberAction(view: BotView, legal: readonly Action[], me: number): Action | null {
  const totals = view.players.map((p) => p.score + p.messengerScore);
  const strength = (space: number) =>
    Math.max(
      -1,
      ...view.players
        .filter((p) => p.index !== me)
        .filter((p) => trackPosition(p.score) === space || trackPosition(p.messengerScore) === space)
        .map((p) => totals[p.index]),
    );
  let best: Action | null = null;
  let bestValue = -Infinity;
  for (const a of legal) {
    let v = -Infinity;
    if (a.type === 'PLACE_ROBBER') v = strength(a.space);
    else if (a.type === 'KEEP_ROBBER') {
      const at = view.players[me].robber;
      v = at === null ? -1 : strength(at) + 0.5;
    } else return null;
    if (v > bestValue) {
      bestValue = v;
      best = a;
    }
  }
  return best;
}

/** Chooses one of the legal actions for the pending decision using only the public view. */
export function chooseBotAction(view: BotView, legal: readonly Action[], opts: BotOptions): Action {
  if (legal.length === 0) throw new Error('No legal action');
  if (legal.length === 1) return legal[0];
  const p = LEVELS[opts.level];
  const me = legal[0].player;
  const cat = opts.cat;
  const deadline = Date.now() + Math.min(opts.timeBudgetMs ?? p.budgetMs, p.budgetMs);
  let rng = seedFromString(`${opts.seed}:${opts.level}`);
  const rand = (n: number) => {
    const r = randomInt(rng, n);
    rng = r.state;
    return r.value;
  };

  if (p.blunder > 0 && rand(1000) < p.blunder * 1000) return legal[rand(legal.length)];
  if (legal[0].type === 'PLACE_ROBBER' || legal[0].type === 'KEEP_ROBBER') {
    const r = robberAction(view, legal, me);
    if (r) return r;
  }

  const worlds: GameState[] = [];
  for (let i = 0; i < p.samples; i++) {
    const d = determinize(view, cat, rng);
    rng = d.rng;
    worlds.push(d.state);
  }
  const simulate = (s: GameState, a: Action): GameState | null => {
    try {
      return applyAction(s, a, cat);
    } catch {
      return null;
    }
  };
  const noise = () => (p.noise ? ((rand(2001) - 1000) / 1000) * p.noise : 0);

  /** Best value reachable for `me` from `s` by choosing own follow-up decisions greedily. */
  const search = (s: GameState, depth: number): number => {
    if (depth <= 0 || !s.pending || s.pending.player !== me || s.finished || Date.now() > deadline) {
      return evaluateFor(s, me, cat);
    }
    let options = legalActions(s, cat);
    if (options.length > 24) options = sample(options, 24);
    let best = -Infinity;
    for (const a of options) {
      const next = simulate(s, a);
      if (next) best = Math.max(best, search(next, depth - 1));
    }
    return best === -Infinity ? evaluateFor(s, me, cat) : best;
  };

  const sample = <T,>(items: readonly T[], k: number): T[] => {
    const pool = [...items];
    const out: T[] = [];
    while (out.length < k && pool.length) out.push(pool.splice(rand(pool.length), 1)[0]);
    return out;
  };

  const candidates = legal.length > p.width ? sample(legal, p.width) : [...legal];
  const value = (a: Action, depth: number): number => {
    const runs = RANDOM_OUTCOME.has(a.type) ? worlds : worlds.slice(0, 1);
    let total = 0;
    let count = 0;
    for (const w of runs) {
      const next = simulate(w, a);
      if (!next) continue;
      total += search(next, depth);
      count++;
    }
    return count ? total / count : -Infinity;
  };

  const scored = candidates.map((a) => ({ a, v: Date.now() > deadline ? -Infinity : value(a, 0) + noise() }));
  scored.sort((x, y) => y.v - x.v);
  if (p.beam > 0 && p.depth > 0) {
    for (const c of scored.slice(0, p.beam)) {
      if (Date.now() > deadline) break;
      if (c.v === -Infinity) continue;
      c.v = value(c.a, p.depth) + noise();
    }
    scored.sort((x, y) => y.v - x.v);
  }
  const best = scored[0];
  return best && best.v > -Infinity ? best.a : passiveAction(legal);
}
