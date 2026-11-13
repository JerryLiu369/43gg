import { useState } from 'react';
import { BookOpen, Bot, GraduationCap, Play, RotateCcw, SlidersHorizontal, Trophy, Users } from 'lucide-react';
import { ALL_EXPANSIONS, type ExpansionId } from './engine/index.ts';
import { EXPANSION_INFO, MODULE_GROUPS } from './lib/labels.ts';
import { BOT_LEVELS, BOT_LEVEL_LABELS, type BotLevel, type FcLocalMatch, type FcMetaSave } from './lib/types.ts';
import { SoundControl } from './SoundControl.tsx';

const EXPANSION_IDS = ALL_EXPANSIONS.filter((e): e is Exclude<ExpansionId, 'BASE'> => e !== 'BASE');

const DIFFICULTY_HINTS: Record<BotLevel, string> = {
  EASY: '电脑想得浅、常留空档，适合第一次熟悉规则',
  NORMAL: '电脑会抢城池、封驿道，也懂得及时把随从收回来',
  HARD: '电脑会往前多算几步，擅长挤进你的地盘和卡位封堵',
};

export function SetupScreen({
  meta,
  savedMatch,
  onStartNew,
  onResume,
  onOpenRules,
  onStartGuided,
}: {
  meta: FcMetaSave;
  savedMatch: FcLocalMatch | null;
  onStartNew: (config: {
    playerName: string;
    botLevels: BotLevel[];
    expansions: ExpansionId[];
    defaultDifficulty: BotLevel;
  }) => void;
  onResume: () => void;
  onOpenRules: () => void;
  /** Starts a match with the step-by-step guide switched on. */
  onStartGuided: (config: {
    playerName: string;
    botLevels: BotLevel[];
    expansions: ExpansionId[];
    defaultDifficulty: BotLevel;
  }) => void;
}) {
  const firstGame = !meta.tutorialCompleted && meta.gamesPlayed === 0;
  const [playerName, setPlayerName] = useState(meta.preferredName || '山人');
  // A first game is one opponent and the stream start only: fewer rules, fewer rivals.
  const [botCount, setBotCount] = useState(firstGame ? 1 : meta.preferredBotCount);
  const [difficulty, setDifficulty] = useState<BotLevel>(meta.preferredDifficulty);
  const [customBots, setCustomBots] = useState(false);
  const [botLevels, setBotLevels] = useState<BotLevel[]>(() =>
    Array.from({ length: 5 }, () => meta.preferredDifficulty),
  );
  const [expansions, setExpansions] = useState<ExpansionId[]>(() => (firstGame ? ['STREAM'] : meta.preferredExpansions));

  const handleGlobalDifficulty = (level: BotLevel) => {
    setDifficulty(level);
    if (!customBots) {
      setBotLevels(Array.from({ length: 5 }, () => level));
    }
  };

  const toggleExpansion = (id: ExpansionId) => {
    setExpansions((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const effectiveLevels: BotLevel[] = Array.from({ length: botCount }, (_, idx) =>
    customBots ? botLevels[idx] ?? difficulty : difficulty,
  );

  return (
    <div className="h-full w-full overflow-y-auto px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="fc-display text-3xl font-bold text-white sm:text-4xl">方寸山河</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
              一块块方地拼出城池、驿道、寺院与田野，派随从抢占地盘。和 1 至 5 位电脑对手比谁收下的山河更多。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="fc-btn secondary"
              onClick={() =>
                onStartGuided({
                  playerName: playerName.trim() || '山人',
                  botLevels: effectiveLevels,
                  expansions,
                  defaultDifficulty: difficulty,
                })
              }
            >
              <GraduationCap className="size-4" /> 带引导开一局
            </button>
            <button type="button" className="fc-btn secondary" onClick={onOpenRules}>
              <BookOpen className="size-4" /> 图文手册
            </button>
            <SoundControl />
          </div>
        </div>

        {savedMatch && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-400/35 bg-gradient-to-r from-amber-400/15 to-transparent p-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-amber-200">检测到未完成的单机对局</p>
              <p className="mt-0.5 text-xs text-slate-300">
                第 {savedMatch.state.turn.number} 回合 · {savedMatch.seats.length} 位玩家 · 牌堆剩余{' '}
                {savedMatch.state.drawPile.length + savedMatch.state.riverPile.length} 张
              </p>
            </div>
            <button type="button" className="fc-btn primary" onClick={onResume}>
              <RotateCcw className="size-4" /> 继续上一局
            </button>
          </div>
        )}

        <div className="mt-6 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
          <section className="fc-panel space-y-5 p-5 sm:p-6">
            <h2 className="fc-display text-lg font-bold text-white">对局配置</h2>

            <div>
              <label htmlFor="fc-player-name" className="block text-xs font-semibold text-slate-200">
                你的名字
              </label>
              <input
                id="fc-player-name"
                type="text"
                maxLength={16}
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="山人"
                className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/30 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                  <Users className="size-3.5 text-amber-300" /> 电脑对手数量
                </span>
                <span className="text-[11px] text-slate-400">共 {botCount + 1} 位玩家</span>
              </div>
              <div className="mt-2 grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setBotCount(count)}
                    aria-pressed={botCount === count}
                    className={`rounded-xl border py-2 text-xs font-semibold transition cursor-pointer ${
                      botCount === count
                        ? 'border-amber-300/70 bg-amber-400/20 text-amber-100'
                        : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25'
                    }`}
                  >
                    {count} 电脑
                  </button>
                ))}
              </div>
              {firstGame && botCount === 1 && (
                <p className="mt-1.5 text-[11px] text-slate-400">第一局先和 1 位电脑练手、只开溪流开局，熟悉后再加人加模块。</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                  <Bot className="size-3.5 text-amber-300" /> 对手难度
                </span>
                <button
                  type="button"
                  onClick={() => setCustomBots((v) => !v)}
                  className="inline-flex items-center gap-1 text-[11px] text-amber-300 hover:text-amber-200 cursor-pointer"
                >
                  <SlidersHorizontal className="size-3" />
                  {customBots ? '改为统一难度' : '分别设置每个电脑'}
                </button>
              </div>

              {!customBots ? (
                <>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {BOT_LEVELS.map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => handleGlobalDifficulty(level)}
                        aria-pressed={difficulty === level}
                        className={`rounded-xl border py-2.5 text-xs font-semibold transition cursor-pointer ${
                          difficulty === level
                            ? 'border-amber-300/70 bg-amber-400/20 text-amber-100'
                            : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25'
                        }`}
                      >
                        {BOT_LEVEL_LABELS[level]}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-400">{DIFFICULTY_HINTS[difficulty]}</p>
                </>
              ) : (
                <div className="mt-2 space-y-2">
                  {Array.from({ length: botCount }, (_, idx) => {
                    const current = botLevels[idx] ?? difficulty;
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
                      >
                        <span className="text-xs font-medium text-slate-200">电脑 {idx + 1}</span>
                        <div className="flex gap-1.5">
                          {BOT_LEVELS.map((level) => (
                            <button
                              key={level}
                              type="button"
                              onClick={() =>
                                setBotLevels((prev) => prev.map((item, i) => (i === idx ? level : item)))
                              }
                              aria-pressed={current === level}
                              className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                                current === level
                                  ? 'border-amber-300/70 bg-amber-400/20 text-amber-100'
                                  : 'border-white/10 bg-white/[0.02] text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {BOT_LEVEL_LABELS[level]}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-200">
                  规则模块（已选 {expansions.length} / {EXPANSION_IDS.length}）
                </span>
                <div className="flex gap-1.5 text-[11px]">
                  <button type="button" onClick={() => setExpansions([])} className="fc-btn px-2 py-0.5 text-[11px]">
                    只玩基础
                  </button>
                  <button type="button" onClick={() => setExpansions(['STREAM', 'HERMIT'])} className="fc-btn px-2 py-0.5 text-[11px]">
                    入门搭配
                  </button>
                  <button type="button" onClick={() => setExpansions([...EXPANSION_IDS])} className="fc-btn px-2 py-0.5 text-[11px]">
                    全部开启
                  </button>
                </div>
              </div>
              <div className="mt-2 space-y-2.5">
                {MODULE_GROUPS.map((group) => (
                  <fieldset key={group.label}>
                    <legend className="text-[11px] font-semibold text-slate-400">{group.label}</legend>
                    <div className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                      {group.modules.map((id) => {
                        const active = expansions.includes(id);
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => toggleExpansion(id)}
                            aria-pressed={active}
                            title={EXPANSION_INFO[id].hint}
                            className={`rounded-xl border px-2.5 py-2 text-left transition cursor-pointer focus-visible:border-amber-300 focus-visible:outline-none ${
                              active
                                ? 'border-amber-300/70 bg-amber-400/15 text-amber-100'
                                : 'border-white/10 bg-black/20 text-slate-400 hover:border-white/25 hover:text-slate-200'
                            }`}
                          >
                            <span className="block truncate text-xs font-semibold">{EXPANSION_INFO[id].name}</span>
                            <span className="mt-0.5 line-clamp-2 block text-[10px] leading-4 opacity-80">{EXPANSION_INFO[id].hint}</span>
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="fc-btn primary w-full py-3 text-sm font-bold"
              onClick={() =>
                onStartNew({
                  playerName: playerName.trim() || '山人',
                  botLevels: effectiveLevels,
                  expansions,
                  defaultDifficulty: difficulty,
                })
              }
            >
              <Play className="size-4" /> 开始单机对局
            </button>
          </section>

          <aside className="space-y-4">
            <section className="fc-panel p-5">
              <h2 className="flex items-center gap-2 fc-display text-base font-bold text-white">
                <Trophy className="size-4 text-amber-300" /> 你的战绩
              </h2>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-white/[0.07] bg-black/25 p-2.5">
                  <p className="text-[11px] text-slate-400">已完赛</p>
                  <p className="mt-1 fc-display text-xl text-white tabular-nums">{meta.gamesPlayed}</p>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-black/25 p-2.5">
                  <p className="text-[11px] text-slate-400">胜场</p>
                  <p className="mt-1 fc-display text-xl text-emerald-300 tabular-nums">{meta.victories}</p>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-black/25 p-2.5">
                  <p className="text-[11px] text-slate-400">最高分</p>
                  <p className="mt-1 fc-display text-xl text-amber-200 tabular-nums">{meta.bestScore}</p>
                </div>
              </div>
            </section>

            <section className="fc-panel p-5">
              <h2 className="fc-display text-base font-bold text-white">怎么操作</h2>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-300">
                <li>拖动版图平移，滚轮或双指缩放。</li>
                <li>点虚线方格预览摆法，再点同一格或用旋转键换朝向，四边接上后确认放置。</li>
                <li>手机上点圆点只是预选，再点一次或按确认才派出随从。</li>
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
