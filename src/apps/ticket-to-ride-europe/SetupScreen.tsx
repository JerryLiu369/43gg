import { useState } from 'react';
import { BookOpen, Bot, Play, RotateCcw, SlidersHorizontal, TrainFront, Trophy, Users } from 'lucide-react';
import { BOT_LEVEL_LABELS, BOT_LEVEL_ORDER, type BotLevel } from './engine.ts';
import type { TtrLocalMatch, TtrMetaSave } from './types.ts';
import { Badge, Button, SoundControl } from './ui.tsx';
import { cn } from './utils.ts';

const DIFFICULTY_HINTS: Record<BotLevel, string> = {
  EASY: '对手偏重随缘摸牌与短线连接，适合轻松体验欧洲地图',
  MEDIUM: '标准对局节奏，会主动抢占关键枢纽与车票路线',
  ADVANCED: '进阶推演对手，精准卡位双线与高分长途通道',
};

export function SetupScreen({
  meta,
  savedMatch,
  onStartNew,
  onResume,
  onOpenRules,
}: {
  meta: TtrMetaSave;
  savedMatch: TtrLocalMatch | null;
  onStartNew: (config: { playerName: string; botLevels: BotLevel[]; defaultDifficulty: BotLevel }) => void;
  onResume: () => void;
  onOpenRules: () => void;
}) {
  const [playerName, setPlayerName] = useState(meta.preferredName || '旅人');
  const [botCount, setBotCount] = useState(meta.preferredBotCount);
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
            <Badge tone="brass">
              <TrainFront className="size-3" /> 19 世纪欧洲铁路版图 · 离线单机
            </Badge>
            <h1 className="mt-3 ttr-display text-3xl text-paper-50 sm:text-4xl">车票之旅：欧洲</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-paper-300">
              收集各色车厢卡，打通隧道与渡轮，修筑车站并连通跨洲目的地车票。支持 1 位玩家与 1 至 4 位电脑对手同台竞速。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onOpenRules}>
              <BookOpen className="size-4" /> 玩法规则
            </Button>
            <SoundControl />
          </div>
        </div>

        {savedMatch && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brass-400/35 bg-gradient-to-r from-brass-400/[0.12] to-transparent p-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-brass-200">检测到未完成的单机对局</p>
              <p className="mt-0.5 text-xs text-paper-300">
                第 {savedMatch.state.turnNumber} 回合 · {savedMatch.state.players.length} 位玩家 · 可立即继续上次进度
              </p>
            </div>
            <Button onClick={onResume}>
              <RotateCcw className="size-4" /> 继续上一局
            </Button>
          </div>
        )}

        <div className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="ttr-panel rounded-2xl p-5 sm:p-6">
            <h2 className="ttr-display text-lg text-paper-50">开局配置</h2>

            <div className="mt-5 space-y-5">
              <div>
                <label htmlFor="ttr-player-name" className="block text-xs font-semibold text-paper-200">
                  你的列车长称号
                </label>
                <input
                  id="ttr-player-name"
                  type="text"
                  maxLength={16}
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="旅人"
                  className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/25 px-3.5 py-2.5 text-sm text-paper-50 placeholder:text-paper-500 focus:border-brass-400 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-paper-200">
                    <Users className="size-3.5 text-brass-300" /> 电脑对手数量
                  </span>
                  <span className="text-[11px] text-paper-400">共 {botCount + 1} 位玩家</span>
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
                          ? 'border-brass-300/70 bg-brass-400/15 text-brass-100'
                          : 'border-white/10 bg-white/[0.03] text-paper-300 hover:border-white/25',
                      )}
                    >
                      {count} 个电脑
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-paper-400">
                  {botCount <= 2
                    ? '2–3 人局：双线铁路中一条被占后，另一条将关闭。'
                    : '4–5 人局：双线铁路可由不同玩家分别占领。'}
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-paper-200">
                    <Bot className="size-3.5 text-brass-300" /> 对手难度
                  </span>
                  <button
                    type="button"
                    onClick={() => setCustomBots((v) => !v)}
                    className="inline-flex items-center gap-1 text-[11px] text-brass-300 hover:text-brass-200 cursor-pointer"
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
                              ? 'border-brass-300/70 bg-brass-400/15 text-brass-100'
                              : 'border-white/10 bg-white/[0.03] text-paper-300 hover:border-white/25',
                          )}
                        >
                          {BOT_LEVEL_LABELS[level]}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[11px] text-paper-400">{DIFFICULTY_HINTS[difficulty]}</p>
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
                          <span className="text-xs font-medium text-paper-200">电脑 {idx + 1}</span>
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
                                    ? 'border-brass-300/70 bg-brass-400/20 text-brass-100'
                                    : 'border-white/10 bg-white/[0.02] text-paper-400 hover:text-paper-200',
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
            <section className="ttr-panel rounded-2xl p-5">
              <h2 className="flex items-center gap-2 ttr-display text-base text-paper-50">
                <Trophy className="size-4 text-brass-300" /> 你的战绩
              </h2>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-white/[0.07] bg-black/20 p-2.5">
                  <p className="text-[11px] text-paper-400">已完赛</p>
                  <p className="mt-1 ttr-display text-xl text-paper-50 tabular-nums">{meta.gamesPlayed}</p>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-black/20 p-2.5">
                  <p className="text-[11px] text-paper-400">胜场</p>
                  <p className="mt-1 ttr-display text-xl text-emerald-300 tabular-nums">{meta.victories}</p>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-black/20 p-2.5">
                  <p className="text-[11px] text-paper-400">最高分</p>
                  <p className="mt-1 ttr-display text-xl text-brass-200 tabular-nums">{meta.bestScore}</p>
                </div>
              </div>
            </section>

            <section className="ttr-panel rounded-2xl p-5">
              <h2 className="ttr-display text-base text-paper-50">欧洲篇特色机制</h2>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-paper-300">
                <li className="flex gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brass-300" />
                  <span>
                    <b className="text-paper-100">隧道</b>：铺设时从牌堆翻开 3 张牌，若出现同色牌或火车头需加付。
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-sky-300" />
                  <span>
                    <b className="text-paper-100">渡轮</b>：跨海航线必须包含指定数量的火车头万能牌。
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-emerald-300" />
                  <span>
                    <b className="text-paper-100">车站</b>：每人 3 座车站，可借用对手一条相邻铁路来连通车票；未用车站每座 +4 分。
                  </span>
                </li>
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
