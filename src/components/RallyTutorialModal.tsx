import React from 'react';
import { PacenoteSignSvg } from './PacenoteSignSvg.tsx';
import type { PacenoteItem } from '../game/types.ts';

interface RallyTutorialModalProps {
  onClose: () => void;
  onStartGuidedDrive?: () => void;
}

const SAMPLE_NOTES: Array<{
  note: PacenoteItem;
  titleZh: string;
  actionZh: string;
}> = [
  {
    note: {
      id: 'tut_6l',
      triggerDistanceM: 0,
      cornerDistanceM: 100,
      type: 'left_6',
      severity: 6,
      direction: 'left',
      calloutTextZh: '左六 全油',
      calloutSpeechZh: '左六',
    },
    titleZh: '5–6 级缓弯（绿牌）',
    actionZh: '高速弯，保持全油或微收油门顺畅切过弯心。',
  },
  {
    note: {
      id: 'tut_4r',
      triggerDistanceM: 0,
      cornerDistanceM: 100,
      type: 'right_4',
      severity: 4,
      direction: 'right',
      calloutTextZh: '右四 控油',
      calloutSpeechZh: '右四',
    },
    titleZh: '3–4 级中速弯（黄绿/琥珀）',
    actionZh: '入弯前轻点刹车把重心压向前轮，半油稳住姿态出弯。',
  },
  {
    note: {
      id: 'tut_2l',
      triggerDistanceM: 0,
      cornerDistanceM: 100,
      type: 'left_2',
      severity: 2,
      direction: 'left',
      calloutTextZh: '左二 勿切',
      calloutSpeechZh: '左二勿切',
    },
    titleZh: '2 级急弯（橙牌）',
    actionZh: '提前直线重刹降速，切忌带满速猛打方向冲出路肩。',
  },
  {
    note: {
      id: 'tut_1h',
      triggerDistanceM: 0,
      cornerDistanceM: 100,
      type: 'hairpin_right',
      severity: 1,
      direction: 'right',
      calloutTextZh: '右回头弯',
      calloutSpeechZh: '右回头弯',
    },
    titleZh: '1 级发卡弯（红牌）',
    actionZh: '重刹降至低速，打方向同时轻拉手刹甩正车头再给油弹射。',
  },
  {
    note: {
      id: 'tut_jump',
      triggerDistanceM: 0,
      cornerDistanceM: 100,
      type: 'jump',
      severity: 0,
      direction: 'center',
      calloutTextZh: '坡峰大跳',
      calloutSpeechZh: '坡峰大跳',
    },
    titleZh: '坡峰飞跳 / 窄桥（蓝牌）',
    actionZh: '腾空前务必回正方向盘并留出提前量，防止斜向重着陆撞树。',
  },
];

export const RallyTutorialModal: React.FC<RallyTutorialModalProps> = ({
  onClose,
  onStartGuidedDrive,
}) => {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/82 p-3 sm:p-5 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rally-tutorial-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-lg bg-[#0f1319] border border-slate-700 text-slate-100 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 bg-[#131922] border-b border-slate-800">
          <div>
            <div className="text-[11px] font-mono-num tracking-wider text-[#f59e0b] font-semibold">
              FIA CO-DRIVER &amp; STAGE DRIVING BRIEFING
            </div>
            <h2
              id="rally-tutorial-title"
              className="font-display text-2xl sm:text-3xl font-bold tracking-wide text-white mt-0.5"
            >
              拉力领航路书与实战驾驶指引
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭驾驶指引"
            className="px-3 py-1.5 rounded bg-[#1a2230] hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
          >
            关闭 [Esc]
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-3.5 sm:p-4 overflow-y-auto space-y-3.5 text-sm leading-relaxed">
          {/* Step 1: Pacenote Numbers & Color System */}
          <section className="rounded-lg bg-[#131821] border border-slate-800 p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm sm:text-base font-bold text-[#f59e0b]">
                第一步：听懂领航员路书（数字越大弯越缓，1 最急 · 6 最快）
              </h3>
              <span className="text-xs text-slate-400">
                拉力赛道没有重复圈数，领航员会提前播报前方盲弯等级
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {SAMPLE_NOTES.map((item) => (
                <div
                  key={item.note.id}
                  className="flex items-center gap-2.5 p-2.5 rounded bg-[#0c1016] border border-slate-800/90"
                >
                  <PacenoteSignSvg note={item.note} size={42} />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      {item.titleZh}
                    </div>
                    <p className="text-[11px] text-slate-300 leading-snug mt-0.5">
                      {item.actionZh}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Step 2: Slow-In Fast-Out Weight Transfer Diagram */}
          <section className="rounded-lg bg-[#131821] border border-slate-800 p-3.5 space-y-2.5">
            <h3 className="text-sm sm:text-base font-bold text-emerald-400">
              第二步：拉力过弯三拍法（慢进快出 · 重心转移抓地）
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-center">
              <div className="md:col-span-5 rounded bg-[#0b0e14] border border-slate-800 p-2.5 flex items-center justify-center">
                <svg
                  viewBox="0 0 260 132"
                  className="w-full max-w-[250px] h-auto"
                  aria-label="直线刹车、弯心循迹、出弯给油三段式线路图"
                >
                  {/* Road surface */}
                  <path
                    d="M 28 122 L 28 66 Q 28 18 82 18 L 236 18"
                    fill="none"
                    stroke="#1e293b"
                    strokeWidth="36"
                    strokeLinecap="round"
                  />
                  <path
                    d="M 28 122 L 28 66 Q 28 18 82 18 L 236 18"
                    fill="none"
                    stroke="#334155"
                    strokeWidth="1.5"
                    strokeDasharray="5 5"
                  />
                  {/* Zone 1: Straight-line braking (Red) */}
                  <line
                    x1="20"
                    y1="118"
                    x2="20"
                    y2="68"
                    stroke="#ef4444"
                    strokeWidth="4.5"
                    strokeLinecap="round"
                  />
                  {/* Zone 2: Turn-in & Apex (Amber) */}
                  <path
                    d="M 20 68 Q 24 26 78 24"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="4.5"
                    strokeLinecap="round"
                  />
                  {/* Zone 3: Exit Acceleration (Emerald) */}
                  <path
                    d="M 78 24 Q 130 22 228 14"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="4.5"
                    strokeLinecap="round"
                  />
                  <polygon points="224,8 238,13 226,21" fill="#10b981" />

                  <circle cx="20" cy="96" r="5" fill="#ef4444" />
                  <text x="34" y="100" fill="#fca5a5" fontSize="10" fontWeight="700">
                    ① 入弯前直线刹车
                  </text>

                  <circle cx="44" cy="36" r="5" fill="#f59e0b" />
                  <text x="56" y="46" fill="#fcd34d" fontSize="10" fontWeight="700">
                    ② 贴内侧弯心
                  </text>

                  <circle cx="152" cy="20" r="5" fill="#10b981" />
                  <text x="122" y="42" fill="#6ee7b7" fontSize="10" fontWeight="700">
                    ③ 回正全油出弯
                  </text>
                </svg>
              </div>

              <div className="md:col-span-7 space-y-2 text-xs text-slate-300">
                <p>
                  <strong className="text-rose-300">① 直线重刹压前轮：</strong>
                  看见橙/红路书牌或路边刹车牌时，先在直线上踩刹车减速；赛车重心前移会让前轮抓地力倍增，切向弯心更犀利。
                </p>
                <p>
                  <strong className="text-amber-300">② 砂石/冰雪提前半拍打方向：</strong>
                  抓地系数遵循 <span className="font-mono-num text-white">干柏油 &gt; 砂石 &gt; 积雪 &gt; 暗冰</span>。松软路面需提前轻柔入弯，顺着轻微侧滑对准出弯口。
                </p>
                <p>
                  <strong className="text-emerald-300">③ 起步偏时点火弹射：</strong>
                  发车倒数 <span className="font-mono-num text-white">3–2–1</span> 期间按住油门憋出涡轮正压，绿灯瞬间即可触发完美弹射起步！
                </p>
              </div>
            </div>
          </section>

          {/* Step 3: Multi-device Controls & Difficulty */}
          <section className="rounded-lg bg-[#131821] border border-slate-800 p-3.5 space-y-2">
            <h3 className="text-sm sm:text-base font-bold text-sky-400">
              第三步：多端操控、救援复位与三档难度说明
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-slate-300">
              <div className="p-2.5 rounded bg-[#0c1016] border border-slate-800 space-y-1">
                <div className="font-bold text-white">桌面键盘 / 手柄操控</div>
                <p>
                  <span className="font-mono-num text-[#f59e0b]">W/S</span> 或{' '}
                  <span className="font-mono-num text-[#f59e0b]">↑/↓</span> 油门与刹车（停稳长按刹车自动挂倒挡）；
                  <span className="font-mono-num text-[#f59e0b]">A/D</span> 或{' '}
                  <span className="font-mono-num text-[#f59e0b]">←/→</span> 转向；
                  <span className="font-mono-num text-[#f59e0b]">Space</span> 手刹；
                  <span className="font-mono-num text-[#f59e0b]">C</span> 四视角；
                  <span className="font-mono-num text-[#f59e0b]">R</span> 一键回正脱困。
                </p>
              </div>
              <div className="p-2.5 rounded bg-[#0c1016] border border-slate-800 space-y-1">
                <div className="font-bold text-white">手机 / 平板触屏与三档难度</div>
                <p>
                  移动竖屏/横屏自动显示左拇指 <span className="text-[#f59e0b]">左/右转向键</span> 与右拇指{' '}
                  <span className="text-emerald-300">油门 / 刹车 / 手刹</span>。新手推荐在标题页开启「轻松领航」（碰撞车损减半、救援罚时仅 +8s）。
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Footer CTAs */}
        <div className="px-5 py-3.5 bg-[#131922] border-t border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
          <span className="text-xs text-slate-400">
            赛段中随时可按 <strong className="text-slate-200 font-mono-num">H</strong> 键或右上角「指引」重阅本手册
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {onStartGuidedDrive && (
              <button
                type="button"
                data-testid="replay-rally-guide-btn"
                onClick={onStartGuidedDrive}
                className="px-4 py-2 rounded bg-[#1b2433] hover:bg-slate-700 border border-[#f59e0b]/60 text-[#fbbf24] text-xs font-bold transition-colors cursor-pointer"
              >
                开启四步领航实战带教
              </button>
            )}
            <button
              type="button"
              data-testid="close-rally-tutorial-btn"
              onClick={onClose}
              className="px-5 py-2 rounded bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold transition-colors cursor-pointer"
            >
              明白，握紧方向盘发车！
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
