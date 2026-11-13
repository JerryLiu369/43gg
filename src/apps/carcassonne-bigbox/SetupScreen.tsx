import { useState } from 'react';
import { BookOpen, Bot, Layers, Play, RotateCcw, SlidersHorizontal, Trophy, Users } from 'lucide-react';
import { ALL_EXPANSIONS, type ExpansionId } from './engine/index.ts';
import { EXPANSION_INFO } from './lib/labels.ts';
import { BOT_LEVELS, BOT_LEVEL_LABELS, type BotLevel, type CarcLocalMatch, type CarcMetaSave } from './lib/types.ts';
import { SoundControl } from './SoundControl.tsx';

const EXPANSION_IDS = ALL_EXPANSIONS.filter((e): e is Exclude<ExpansionId, 'BASE'> => e !== 'BASE');

const DIFFICULTY_HINTS: Record<BotLevel, string> = {
  EASY: '轻松节奏，电脑随机性与失误率较高，适合新手熟悉规则',
  NORMAL: '标准搜索深度，电脑会合理抢城、抢路并回收米宝',
  HARD: '宗师级别多步前瞻推演，擅长合流争夺与卡位防守',
};

export function SetupScreen({
  meta,
  savedMatch,
  onStartNew,
  onResume,
  onOpenRules,
}: {
  meta: CarcMetaSave;
  savedMatch: CarcLocalMatch | null;
  onStartNew: (config: {
    playerName: string;
    botLevels: BotLevel[];
    expansions: ExpansionId[];
    defaultDifficulty: BotLevel;
  }) => void;
  onResume: () => void;
  onOpenRules: () => void;
}) {
  const [playerName, setPlayerName] = useState(meta.preferredName || '领主');
  const [botCount, setBotCount] = useState(meta.preferredBotCount);
  const [difficulty, setDifficulty] = useState<BotLevel>(meta.preferredDifficulty);
  const [customBots, setCustomBots] = useState(false);
  const [botLevels, setBotLevels] = useState<BotLevel[]>(() =>
    Array.from({ length: 5 }, () => meta.preferredDifficulty),
  );
  const [expansions, setExpansions] = useState<ExpansionId[]>(() => meta.preferredExpansions);

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
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold text-amber-200">
              <Layers className="size-3.5" /> 完整大盒版 · 11 扩展自由搭配
            </span>
            <h1 className="mt-3 carc-display text-3xl font-bold text-white sm:text-4xl">卡卡颂：大盒版</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
              抽牌拼放中世纪版图，派遣骑士、强盗、修士与农夫争夺积分。支持单人本地对战 1 至 5 位可调难度的电脑领主。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="carc-btn secondary" onClick={onOpenRules}>
              <BookOpen className="size-4" /> 玩法规则
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
            <button type="button" className="carc-btn primary" onClick={onResume}>
              <RotateCcw className="size-4" /> 继续上一局
            </button>
          </div>
        )}

        <div className="mt-6 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
          <section className="carc-panel space-y-5 p-5 sm:p-6">
            <h2 className="carc-display text-lg font-bold text-white">对局配置</h2>

            <div>
              <label htmlFor="carc-player-name" className="block text-xs font-semibold text-slate-200">
                你的领主名称
              </label>
              <input
                id="carc-player-name"
                type="text"
                maxLength={16}
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="领主"
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
                  启用扩展模块（已选 {expansions.length} / {EXPANSION_IDS.length}）
                </span>
                <div className="flex gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setExpansions([])}
                    className="rounded-md border border-white/10 px-2 py-0.5 text-slate-300 hover:border-amber-400/40 cursor-pointer"
                  >
                    纯基础版
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpansions(['RIVER', 'ABBOT'])}
                    className="rounded-md border border-white/10 px-2 py-0.5 text-slate-300 hover:border-amber-400/40 cursor-pointer"
                  >
                    推荐入门
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpansions([...EXPANSION_IDS])}
                    className="rounded-md border border-white/10 px-2 py-0.5 text-slate-300 hover:border-amber-400/40 cursor-pointer"
                  >
                    全部开启
                  </button>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {EXPANSION_IDS.map((id) => {
                  const active = expansions.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleExpansion(id)}
                      aria-pressed={active}
                      title={EXPANSION_INFO[id].hint}
                      className={`rounded-xl border px-2.5 py-2 text-left transition cursor-pointer ${
                        active
                          ? 'border-amber-300/70 bg-amber-400/15 text-amber-100'
                          : 'border-white/10 bg-black/20 text-slate-400 hover:border-white/25 hover:text-slate-200'
                      }`}
                    >
                      <span className="block truncate text-xs font-semibold">{EXPANSION_INFO[id].name}</span>
                      <span className="block truncate text-[10px] opacity-80">{EXPANSION_INFO[id].hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              className="carc-btn primary w-full py-3 text-sm font-bold"
              onClick={() =>
                onStartNew({
                  playerName: playerName.trim() || '领主',
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
            <section className="carc-panel p-5">
              <h2 className="flex items-center gap-2 carc-display text-base font-bold text-white">
                <Trophy className="size-4 text-amber-300" /> 你的战绩
              </h2>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-white/[0.07] bg-black/25 p-2.5">
                  <p className="text-[11px] text-slate-400">已完赛</p>
                  <p className="mt-1 carc-display text-xl text-white tabular-nums">{meta.gamesPlayed}</p>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-black/25 p-2.5">
                  <p className="text-[11px] text-slate-400">胜场</p>
                  <p className="mt-1 carc-display text-xl text-emerald-300 tabular-nums">{meta.victories}</p>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-black/25 p-2.5">
                  <p className="text-[11px] text-slate-400">最高分</p>
                  <p className="mt-1 carc-display text-xl text-amber-200 tabular-nums">{meta.bestScore}</p>
                </div>
              </div>
            </section>

            <section className="carc-panel p-5">
              <h2 className="carc-display text-base font-bold text-white">操作提示</h2>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-300">
                <li className="flex gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-300" />
                  <span>拖动地图可平移，滚轮或双指缩放；点击金色格子预览放置板块。</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-300" />
                  <span>按 R 键或点击旋转按钮调整方向，边缘吻合即可确认放置。</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-300" />
                  <span>棋盘上的圆点可直接点选派遣米宝的位置。</span>
                </li>
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
