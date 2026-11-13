/**
 * First-game guide for 方寸山河: three hands-on steps that advance when the player actually does
 * them (place a tile → send a follower or pass → score points). Pure, so it is unit tested.
 */
import { applyAction, legalActions, type Action, type GameState, type TileCatalog } from './engine/index.ts';

export type FcGuideStep = 'tile' | 'figure' | 'score';

export const FC_GUIDE_STEPS: readonly FcGuideStep[] = ['tile', 'figure', 'score'];

export const FC_GUIDE_TEXT: Readonly<Record<FcGuideStep, { title: string; body: string; demo: string }>> = {
  tile: {
    title: '放下地块',
    body: '点版图上的虚线方格预览摆法，旋转到四边都接得上，再点「确认放置」。',
    demo: '帮我摆一块',
  },
  figure: {
    title: '派一位随从',
    body: '刚放的地块上会出现圆点：点一个把随从派进城池、驿道、寺院或田野；不想派就选「这回合不派人」。',
    demo: '帮我选个位置',
  },
  score: {
    title: '拿到第一笔分',
    body: '城池围合、驿道两头封口、寺院四周铺满时，占多数的一方得分，随从也会回到手里。',
    demo: '找一块能得分的',
  },
};

export interface FcGuideSignals {
  /** Tiles the human placed since the guide started. */
  tiles: number;
  /** Follower decisions (sent or passed) the human made since the guide started. */
  figureChoices: number;
  /** Points the human gained since the guide started. */
  points: number;
}

/** Returns the first step still unmet at or after `step`, or `'done'`. Steps never go backwards. */
export function advanceFcGuide(step: FcGuideStep | 'done', signals: FcGuideSignals): FcGuideStep | 'done' {
  if (step === 'done') return 'done';
  const met: Record<FcGuideStep, boolean> = {
    tile: signals.tiles > 0,
    figure: signals.figureChoices > 0,
    score: signals.points > 0,
  };
  for (let i = FC_GUIDE_STEPS.indexOf(step); i < FC_GUIDE_STEPS.length; i++) {
    if (!met[FC_GUIDE_STEPS[i]]) return FC_GUIDE_STEPS[i];
  }
  return 'done';
}

/** Counts the human's guide-relevant actions in `state.actions` from index `from`. */
export function fcGuideSignals(state: GameState, seat: number, from: number, scoreAtStart: number): FcGuideSignals {
  const recent = state.actions.slice(from).filter((a) => a.player === seat);
  const p = state.players[seat];
  return {
    tiles: recent.filter((a) => a.type === 'PLACE_TILE').length,
    figureChoices: recent.filter((a) => a.type === 'PLACE_FIGURE' || a.type === 'SKIP_FIGURE').length,
    points: (p ? p.score + p.messengerScore : 0) - scoreAtStart,
  };
}

/**
 * Finds a legal tile placement that scores for `seat` this turn even without sending a new
 * follower (it closes a feature the seat already holds). Returns null when none exists.
 */
export function findScoringPlacement(state: GameState, cat: TileCatalog, seat: number): Action | null {
  if (state.pending?.type !== 'PLACE_TILE' || state.pending.player !== seat) return null;
  const before = state.players[seat].score + state.players[seat].messengerScore;
  let best: { action: Action; gain: number } | null = null;
  for (const action of legalActions(state, cat)) {
    if (action.type !== 'PLACE_TILE') continue;
    try {
      let next = applyAction(state, action, cat);
      // Pass on the follower step so only the tile itself decides the score.
      for (let guard = 0; guard < 4 && next.pending?.player === seat && next.pending.type === 'FIGURE'; guard++) {
        const skip = legalActions(next, cat).find((a) => a.type === 'SKIP_FIGURE');
        if (!skip) break;
        next = applyAction(next, skip, cat);
      }
      const gain = next.players[seat].score + next.players[seat].messengerScore - before;
      if (gain > 0 && (!best || gain > best.gain)) best = { action, gain };
    } catch {
      // A placement that needs further choices first is simply not suggested.
    }
  }
  return best?.action ?? null;
}
