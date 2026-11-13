/**
 * Deterministic pseudo-random numbers. The generator state is a single uint32 stored in the
 * game state, so a game is fully reproducible from its seed and the list of player actions.
 */

/** FNV-1a hash of a seed string, used as the initial generator state. */
export function seedFromString(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** One mulberry32 step: returns a float in [0, 1) and the next state. */
export function nextRandom(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: next };
}

/** Uniform integer in [0, n). */
export function randomInt(state: number, n: number): { value: number; state: number } {
  if (!Number.isInteger(n) || n <= 0) throw new Error(`randomInt: bad range ${n}`);
  const r = nextRandom(state);
  return { value: Math.floor(r.value * n), state: r.state };
}

/** Fisher-Yates shuffle into a new array. */
export function shuffle<T>(items: readonly T[], state: number): { items: T[]; state: number } {
  const out = [...items];
  let s = state;
  for (let i = out.length - 1; i > 0; i--) {
    const r = randomInt(s, i + 1);
    s = r.state;
    const j = r.value;
    [out[i], out[j]] = [out[j], out[i]];
  }
  return { items: out, state: s };
}
