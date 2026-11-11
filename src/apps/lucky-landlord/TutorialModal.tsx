import React from 'react';
import { ArrowLeftRight, Hammer, Lock, RefreshCw, Sparkles, X } from 'lucide-react';
import { RoomBadgeSvg, SymbolArtSvg } from './icons.tsx';

interface TutorialModalProps {
  onClose: () => void;
}

export const TutorialModal: React.FC<TutorialModalProps> = ({ onClose }) => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="吉星包租公新手指引"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1C1917]/50"
    >
      <div className="w-full max-w-3xl max-h-[88vh] flex flex-col bg-[#FAF8F4] border border-[#D6D0C4] rounded-xl overflow-hidden shadow-xl">
        {/* Header */}
        <div className="px-6 py-4 bg-white border-b border-[#E4DFD5] flex items-center justify-between gap-4 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-[#1C1917]">
              新手指引 · 30 秒玩懂《吉星包租公》
            </h2>
            <p className="text-xs text-[#57534E] mt-0.5">
              这不是纯靠运气的转盘——学会“凑相邻连携 + 主动调换控盘 + 三连升星”，轻松做金牌包租公。
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭新手指引"
            onClick={onClose}
            className="p-2 rounded-lg bg-[#F2EFE9] hover:bg-[#E7E2D8] text-[#1C1917] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-[#1C1917]">
          {/* Step 1: Core Loop */}
          <section className="p-4 rounded-xl bg-white border border-[#E4DFD5] space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#C2410C]">
                01. 核心目标：在限期轮数内攒够房租
              </h3>
              <span className="font-mono-num text-[11px] text-[#78716C]">
                通关条件：缴清全部 12 期物业账单
              </span>
            </div>
            <p className="text-[#57534E] leading-relaxed">
              左上角显示你的<strong>当前金币 / 本期租金目标</strong>以及<strong>交租剩余轮数</strong>。每摇动一次账本消耗 1 轮：只要在轮数用完前攒够目标金币，就能顺利缴租并免费挑选 1 枚强力【传家宝印章】进入下一期！
            </p>
          </section>

          {/* Step 2: Two-Stage Turn & Adjacency Synergies */}
          <section className="p-4 rounded-xl bg-white border border-[#E4DFD5] space-y-3">
            <h3 className="text-sm font-bold text-[#1C1917]">
              02. 每轮只需两步：先摇账本收租，再三选一招租客
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-[#FAF8F4] border border-[#E4DFD5] space-y-1.5">
                <div className="font-bold text-[#1C1917]">第一步：摇动账本自动算连携</div>
                <p className="text-[#57534E] leading-relaxed">
                  点击橙色按钮【摇动账本收租】（快捷键 <kbd className="px-1 bg-white border border-[#D6D0C4] rounded">Space</kbd>），牌库中的租客会随机落入 4×5 房间。当有配合的符号落在<strong>上下左右或斜向相邻 8 格</strong>时，会擦出高倍连携收益！
                </p>
                <div className="flex items-center gap-2 pt-1 text-[11px] text-[#15803D] font-semibold">
                  <SymbolArtSvg defId="worker_tenant" stars={1} className="w-6 h-6" />
                  <span>+</span>
                  <SymbolArtSvg defId="milk_tea" stars={1} className="w-6 h-6" />
                  <span>例：打工人喝掉相邻冰镇奶茶，当场爆出高额加班补贴！</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#FAF8F4] border border-[#E4DFD5] space-y-1.5">
                <div className="font-bold text-[#1C1917]">第二步：候选三选一（不贪多！）</div>
                <p className="text-[#57534E] leading-relaxed">
                  摇完结算后，底部会弹出 3 张新符号供你招募 1 张进牌库。<strong>小窍门：</strong>棋盘一共只有 20 格，千万别什么杂牌都拿！如果没有能配合你现有流派的好牌，果断点击<strong>【跳过招募领 +2 补贴】</strong>保持牌库精简。
                </p>
              </div>
            </div>
          </section>

          {/* Step 3: Active Board Control */}
          <section className="p-4 rounded-xl bg-white border border-[#E4DFD5] space-y-3">
            <h3 className="text-sm font-bold text-[#1C1917]">
              03. 告别纯看脸：善用「主动调度令」与「格子装修」逆天改命
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="p-2.5 rounded-lg bg-[#FAF8F4] border border-[#E4DFD5] flex items-start gap-2.5">
                <ArrowLeftRight className="w-4 h-4 text-[#C2410C] shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">相邻调换 [S]（摇完后可用）</div>
                  <p className="text-[#57534E] mt-0.5 leading-relaxed">
                    摇完发现“打工人”和“奶茶”刚好隔了一格没触发？点【相邻调换】把它们挪到一起，<strong>系统会当场重新结算差额并补发金币！</strong>
                  </p>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-[#FAF8F4] border border-[#E4DFD5] flex items-start gap-2.5">
                <RefreshCw className="w-4 h-4 text-[#C2410C] shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">单列重摇 [R] &amp; 锁定格子 [L]</div>
                  <p className="text-[#57534E] mt-0.5 leading-relaxed">
                    某列全是空置格可【单列重摇】重抽该列；核心高产租客落在好位置时可【锁定格子】保留到下一轮。
                  </p>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-[#FAF8F4] border border-[#E4DFD5] flex items-start gap-2.5">
                <Hammer className="w-4 h-4 text-[#15803D] shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">格子装修 [B]（永久改造地板）</div>
                  <p className="text-[#57534E] mt-0.5 leading-relaxed">
                    用装修券或金币把普通格改造成
                    <span className="inline-flex items-center gap-0.5 mx-1 font-semibold text-[#B45309]">
                      <RoomBadgeSvg room="gold_shop" className="w-3 h-3" />
                      临街旺铺(收益×2)
                    </span>
                    或阳光温室，整局永久生效！
                  </p>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-[#FAF8F4] border border-[#E4DFD5] flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">三连升星（3 张合成 2★ 精装）</div>
                  <p className="text-[#57534E] mt-0.5 leading-relaxed">
                    凑齐 3 张同名 1★ 符号即可一键合成为 1 张 <strong>2★ 精装卡</strong>：收益翻倍，还能腾出 2 个宝贵房间空位！
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Quick Lock Tip */}
          <div className="px-4 py-2.5 rounded-lg bg-[#F2EFE9] text-[#57534E] flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-[#1C1917] shrink-0" />
              <span>随时把鼠标悬停在任意棋盘格或候选牌上，右侧【账本检视栏】都会实时显示它的连携条件与 2★ 效果。</span>
            </span>
          </div>
        </div>

        {/* Footer CTA */}
        <div className="px-6 py-3.5 bg-white border-t border-[#E4DFD5] flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            data-testid="close-tutorial-btn"
            onClick={onClose}
            className="px-6 py-2.5 rounded-lg bg-[#C2410C] hover:bg-[#9A3412] text-white text-xs font-bold transition-colors cursor-pointer"
          >
            明白了，开始收租赚钱！
          </button>
        </div>
      </div>
    </div>
  );
};
