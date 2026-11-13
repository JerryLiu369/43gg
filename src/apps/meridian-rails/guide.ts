/**
 * First-game guide for 经纬铁道: three hands-on steps that advance when the player actually
 * does the thing (plan with a ticket → draw cards → claim a route). Pure, so it is unit tested.
 */
export type MerGuideStep = 'ticket' | 'draw' | 'claim';

export const MER_GUIDE_STEPS: readonly MerGuideStep[] = ['ticket', 'draw', 'claim'];

export const MER_GUIDE_TEXT: Readonly<Record<MerGuideStep, { title: string; body: string; demo: string }>> = {
  ticket: {
    title: '先看车票',
    body: '点一张车票，版图会用蓝色标出连通两城最省车厢的线路，这就是你这局的目标。',
    demo: '帮我点一张',
  },
  draw: {
    title: '摸车厢卡',
    body: '轮到你时点明牌或牌堆，一回合拿 2 张。尽量攒目标线路需要的颜色。',
    demo: '帮我摸一张',
  },
  claim: {
    title: '占一条线路',
    body: '同色牌够了，版图上能占的线路会发亮：点它、选好付哪些牌、确认，马上得分。',
    demo: '帮我挑一条',
  },
};

/** What the app observed since the guide (re)started. */
export interface MerGuideSignals {
  /** A ticket is pinned on the board. */
  ticketPinned: boolean;
  /** Train cards the human drew since the guide started. */
  draws: number;
  /** Routes the human owns now minus routes owned when the guide started. */
  claims: number;
}

/** Returns the first step still unmet at or after `step`, or `'done'`. Steps never go backwards. */
export function advanceGuide(step: MerGuideStep | 'done', signals: MerGuideSignals): MerGuideStep | 'done' {
  if (step === 'done') return 'done';
  const met: Record<MerGuideStep, boolean> = {
    ticket: signals.ticketPinned,
    draw: signals.draws > 0,
    claim: signals.claims > 0,
  };
  for (let i = MER_GUIDE_STEPS.indexOf(step); i < MER_GUIDE_STEPS.length; i++) {
    const s = MER_GUIDE_STEPS[i];
    if (!met[s]) return s;
  }
  return 'done';
}
