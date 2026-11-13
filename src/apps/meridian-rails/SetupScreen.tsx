import { useState } from 'react';
import { BookOpen, Bot, GraduationCap, Play, RotateCcw, SlidersHorizontal, Trophy, Users } from 'lucide-react';
import { BOT_LEVEL_LABELS, BOT_LEVEL_ORDER, type BotLevel } from './engine.ts';
import type { MerLocalMatch, MerMetaSave } from './types.ts';
import { Button, SoundControl } from './ui.tsx';
import { cn } from './utils.ts';

const DIFFICULTY_HINTS: Record<BotLevel, string> = {
  EASY: '电脑多摸牌、少抢线，常留下好走的路，适合第一次上手',
  MEDIUM: '电脑会照着自己的车票修线，也会先占你可能要走的枢纽',
  ADVANCED: '电脑会算长途车票、抢双线、用隧道和车站堵路，适合熟手',
};

export function SetupScreen({
  meta,
  savedMatch,
  onStartNew,
  onResume,
  onOpenRules,
  onStartGuided,
}: {
  meta: MerMetaSave;
  savedMatch: MerLocalMatch | null;
  onStartNew: (config: { playerName: string; botLevels: BotLevel[]; defaultDifficulty: BotLevel }) => void;
  onResume: () => void;
  onOpenRules: () => void;
  /** Starts a match with the step-by-step guide switched on. */
  onStartGuided: (config: { playerName: string; botLevels: BotLevel[]; defaultDifficulty: BotLevel }) => void;
}) {
  const firstGame = !meta.tutorialCompleted && meta.gamesPlayed === 0;
  const [playerName, setPlayerName] = useState(meta.preferredName || '旅人');
  // A first game starts against a single opponent: fewer rivals, fewer blocked routes.
  const [botCount, setBotCount] = useState(firstGame ? 1 : meta.preferredBotCount);
  const [difficulty, setDifficulty] = useState<BotLevel>(meta.preferredDifficulty);
  const [customBots, setCustomBots] = useState(false);
  const [botLevels, setBotLevels] = useState<BotLevel[]>(() =>
    Array.from({ length: 4 }, () => meta.preferredDifficulty),
  );

  const handleGlobalDifficulty = (level: BotLevel) => {
    setDifficulty(level);
    if (!customBots) {
      setBotLevels(Array.from({ length: 4 }, () => level));
    }
  };

  const effectiveLevels: BotLevel[] = Array.from({ length: botCount }, (_, idx) =>
    customBots ? botLevels[idx] ?? difficulty : difficulty,
  );

  return (
    <div className="h-full w-full overflow-y-auto px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="mer-display text-3xl text-(--mer-paper-50) sm:text-4xl">经纬铁道</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-(--mer-paper-300)">
              在欧陆版图上攒同色车厢卡、修铁路，把手里车票上的两座城市连起来。和 1 至 4 位电脑对手比谁的线路网更值钱。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                onStartGuided({
                  playerName: playerName.trim() || '旅人',
                  botLevels: Array.from({ length: botCount }, (_, idx) => (customBots ? botLevels[idx] ?? difficulty : difficulty)),
                  defaultDifficulty: difficulty,
                })
              }
            >
              <GraduationCap className="size-4" /> 带引导开一局
            </Button>
            <Button variant="secondary" size="sm" onClick={onOpenRules}>
              <BookOpen className="size-4" /> 图文手册
            </Button>
            <SoundControl />
          </div>
        </div>

        {savedMatch && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-(--mer-brass-400)/35 bg-gradient-to-r from-(--mer-brass-400)/[0.12] to-transparent p-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-(--mer-brass-200)">检测到未完成的单机对局</p>
              <p className="mt-0.5 text-xs text-(--mer-paper-300)">
                第 {savedMatch.state.turnNumber} 回合 · {savedMatch.state.players.length} 位玩家 · 可立即继续上次进度
              </p>
            </div>
            <Button onClick={onResume}>
              <RotateCcw className="size-4" /> 继续上一局
            </Button>
          </div>
        )}

        <div className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="mer-panel rounded-2xl p-5 sm:p-6">
            <h2 className="mer-display text-lg text-(--mer-paper-50)">开局配置</h2>

            <div className="mt-5 space-y-5">
              <div>
                <label htmlFor="mer-player-name" className="block text-xs font-semibold text-(--mer-paper-200)">
                  你的列车长称号
                </label>
                <input
                  id="mer-player-name"
                  type="text"
                  maxLength={16}
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="旅人"
                  className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/25 px-3.5 py-2.5 text-sm text-(--mer-paper-50) placeholder:text-(--mer-paper-500) focus:border-(--mer-brass-400) focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-(--mer-paper-200)">
                    <Users className="size-3.5 text-(--mer-brass-300)" /> 电脑对手数量
                  </span>
                  <span className="text-[11px] text-(--mer-paper-400)">共 {botCount + 1} 位玩家</span>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setBotCount(count)}
                      aria-pressed={botCount === count}
                      className={cn(
                        'rounded-xl border py-2.5 text-xs font-semibold transition cursor-pointer',
                        botCount === count
                          ? 'border-(--mer-brass-300)/70 bg-(--mer-brass-400)/15 text-(--mer-brass-100)'
                          : 'border-white/10 bg-white/[0.03] text-(--mer-paper-300) hover:border-white/25',
                      )}
                    >
                      {count} 个电脑
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-(--mer-paper-400)">
                  {firstGame && botCount === 1
                    ? '第一局先和 1 位电脑练手，熟悉后再加人。'
                    : botCount <= 2
                      ? '2–3 人局：双线里一条被占后，另一条就不能再用。'
                      : '4–5 人局：双线的两条可以由不同玩家各占一条。'}
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-(--mer-paper-200)">
                    <Bot className="size-3.5 text-(--mer-brass-300)" /> 对手难度
                  </span>
                  <button
                    type="button"
                    onClick={() => setCustomBots((v) => !v)}
                    className="inline-flex items-center gap-1 text-[11px] text-(--mer-brass-300) hover:text-(--mer-brass-200) cursor-pointer"
                  >
                    <SlidersHorizontal className="size-3" />
                    {customBots ? '改为统一难度' : '分别设置每个电脑'}
                  </button>
                </div>

                {!customBots ? (
                  <>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {BOT_LEVEL_ORDER.map((level) => (
                        <button
                          key={level}
                          type="button"
                          onClick={() => handleGlobalDifficulty(level)}
                          aria-pressed={difficulty === level}
                          className={cn(
                            'rounded-xl border py-2.5 text-xs font-semibold transition cursor-pointer',
                            difficulty === level
                              ? 'border-(--mer-brass-300)/70 bg-(--mer-brass-400)/15 text-(--mer-brass-100)'
                              : 'border-white/10 bg-white/[0.03] text-(--mer-paper-300) hover:border-white/25',
                          )}
                        >
                          {BOT_LEVEL_LABELS[level]}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[11px] text-(--mer-paper-400)">{DIFFICULTY_HINTS[difficulty]}</p>
                  </>
                ) : (
                  <div className="mt-2 space-y-2">
                    {Array.from({ length: botCount }, (_, idx) => {
                      const current = botLevels[idx] ?? difficulty;
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2"
                        >
                          <span className="text-xs font-medium text-(--mer-paper-200)">电脑 {idx + 1}</span>
                          <div className="flex gap-1.5">
                            {BOT_LEVEL_ORDER.map((level) => (
                              <button
                                key={level}
                                type="button"
                                onClick={() =>
                                  setBotLevels((prev) => prev.map((item, i) => (i === idx ? level : item)))
                                }
                                aria-pressed={current === level}
                                className={cn(
                                  'rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer',
                                  current === level
                                    ? 'border-(--mer-brass-300)/70 bg-(--mer-brass-400)/20 text-(--mer-brass-100)'
                                    : 'border-white/10 bg-white/[0.02] text-(--mer-paper-400) hover:text-(--mer-paper-200)',
                                )}
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

              <div className="pt-1">
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() =>
                    onStartNew({
                      playerName: playerName.trim() || '旅人',
                      botLevels: effectiveLevels,
                      defaultDifficulty: difficulty,
                    })
                  }
                >
                  <Play className="size-4" /> 开始单机对局
                </Button>
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <section className="mer-panel rounded-2xl p-5">
              <h2 className="flex items-center gap-2 mer-display text-base text-(--mer-paper-50)">
                <Trophy className="size-4 text-(--mer-brass-300)" /> 你的战绩
              </h2>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-white/[0.07] bg-black/20 p-2.5">
                  <p className="text-[11px] text-(--mer-paper-400)">已完赛</p>
                  <p className="mt-1 mer-display text-xl text-(--mer-paper-50) tabular-nums">{meta.gamesPlayed}</p>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-black/20 p-2.5">
                  <p className="text-[11px] text-(--mer-paper-400)">胜场</p>
                  <p className="mt-1 mer-display text-xl text-emerald-300 tabular-nums">{meta.victories}</p>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-black/20 p-2.5">
                  <p className="text-[11px] text-(--mer-paper-400)">最高分</p>
                  <p className="mt-1 mer-display text-xl text-(--mer-brass-200) tabular-nums">{meta.bestScore}</p>
                </div>
              </div>
            </section>

            <section className="mer-panel rounded-2xl p-5">
              <h2 className="mer-display text-base text-(--mer-paper-50)">三种特别的线路</h2>
              <dl className="mt-3 space-y-2.5 text-xs leading-5 text-(--mer-paper-300)">
                <div>
                  <dt className="font-semibold text-(--mer-paper-100)">隧道（虚线描边）</dt>
                  <dd>付完牌再翻 3 张，翻出同色或万能牌，每张要多付 1 张。</dd>
                </div>
                <div>
                  <dt className="font-semibold text-(--mer-paper-100)">渡轮（带星标）</dt>
                  <dd>每个星标格必须用 1 张万能牌付。</dd>
                </div>
                <div>
                  <dt className="font-semibold text-(--mer-paper-100)">车站</dt>
                  <dd>每人 3 座。终局时可以借一条对手连到这座城的线路来完成车票，没用的每座 +4 分。</dd>
                </div>
              </dl>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
