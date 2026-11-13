import React, { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { ASCENSION_NODES, ASCENSION_NODES_BY_ID } from './content.ts';
import { ASCENSION_MIN_LUMINANCE } from './engine.ts';
import { formatNum } from './format.ts';
import { ResourceGlyphSvg } from './icons.tsx';
import type {
  AscensionNodeId,
  OrreryMetaState,
  OrreryRunState,
} from './types.ts';

interface AstrolabeModalProps {
  run: OrreryRunState;
  meta: OrreryMetaState;
  pendingStardust: number;
  onUnlockNode: (nodeId: AscensionNodeId) => void;
  onPerformAscension: () => void;
  onClose: () => void;
}

export const AstrolabeModal: React.FC<AstrolabeModalProps> = ({
  run,
  meta,
  pendingStardust,
  onUnlockNode,
  onPerformAscension,
  onClose,
}) => {
  const [selectedNodeId, setSelectedNodeId] =
    useState<AscensionNodeId>('star_seed');
  const [confirmingReset, setConfirmingReset] = useState(false);

  const selectedDef = ASCENSION_NODES_BY_ID[selectedNodeId];
  const isUnlocked = meta.ascensionNodes[selectedNodeId];
  const reqMet =
    !selectedDef.requires || meta.ascensionNodes[selectedDef.requires];
  const canAfford =
    !isUnlocked && reqMet && meta.stardust >= selectedDef.costStardust;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="星盘天球 · 转生星宿天赋"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75"
    >
      <div className="w-full max-w-3xl bg-[#0B1222] border border-[#C89B54] rounded-xl shadow-2xl overflow-hidden text-[#F8FAFC] flex flex-col max-h-[88vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-[#070C18] border-b border-[#243452] flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-[#FDE68A]">
              天枢星盘 · 星宿重铸与永恒铭刻
            </h2>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              每枚未消耗的天枢星尘常驻提供 +12% 全局星辉产出 · 重铸将完整保留您的【发条智械】编程规则 · 已重铸 {meta.ascensionCount} 次
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭星盘天球窗口"
            onClick={onClose}
            className="p-2 rounded-lg bg-[#131F36] hover:bg-[#1E2F52] border border-[#334155] text-[#F8FAFC] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Interactive SVG Constellation Map */}
          <div className="md:col-span-7 bg-[#060A14] border border-[#243452] rounded-xl p-4 flex flex-col justify-between min-h-[300px]">
            <div className="flex items-center justify-between text-xs text-[#CBD5E1] mb-2">
              <span className="inline-flex items-center gap-1.5 font-semibold text-[#E0E7FF]">
                <ResourceGlyphSvg kind="stardust" className="w-4 h-4" />
                当前可用星尘：
                <span className="font-mono-num text-sm text-white">
                  {formatNum(meta.stardust)}
                </span>
              </span>
              <span className="text-[#94A3B8]">点击星宿节点查看详情</span>
            </div>

            <div className="relative w-full aspect-[4/3]">
              <svg
                viewBox="0 0 100 92"
                className="w-full h-full"
                aria-hidden="true"
              >
                <circle
                  cx="50"
                  cy="48"
                  r="38"
                  fill="none"
                  stroke="#1E293B"
                  strokeWidth="0.5"
                />
                <circle
                  cx="50"
                  cy="48"
                  r="24"
                  fill="none"
                  stroke="#1E293B"
                  strokeWidth="0.5"
                  strokeDasharray="2 2"
                />

                {ASCENSION_NODES.map((node) => {
                  if (!node.requires) return null;
                  const parent = ASCENSION_NODES_BY_ID[node.requires];
                  const activeEdge =
                    meta.ascensionNodes[node.id] &&
                    meta.ascensionNodes[parent.id];
                  return (
                    <line
                      key={`${parent.id}-${node.id}`}
                      x1={parent.x}
                      y1={parent.y}
                      x2={node.x}
                      y2={node.y}
                      stroke={activeEdge ? '#FBBF24' : '#334155'}
                      strokeWidth={activeEdge ? '1.1' : '0.7'}
                    />
                  );
                })}
              </svg>

              {ASCENSION_NODES.map((node) => {
                const unlocked = meta.ascensionNodes[node.id];
                const parentOk =
                  !node.requires || meta.ascensionNodes[node.requires];
                const selected = selectedNodeId === node.id;

                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => setSelectedNodeId(node.id)}
                    style={{
                      left: `${node.x}%`,
                      top: `${(node.y / 92) * 100}%`,
                    }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap border ${
                      unlocked
                        ? 'bg-[#F59E0B] text-[#090D16] border-[#FEF08A]'
                        : parentOk
                          ? 'bg-[#172542] text-[#F8FAFC] border-[#818CF8]'
                          : 'bg-[#0D1426] text-[#64748B] border-[#26344F]'
                    } ${selected ? 'ring-2 ring-white scale-105' : ''}`}
                  >
                    {node.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Panel: Selected Node & Ascension Action */}
          <div className="md:col-span-5 flex flex-col justify-between gap-4">
            <div className="p-4 rounded-xl bg-[#101A2E] border border-[#243452]">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-bold text-[#F8FAFC]">
                  {selectedDef.name}
                </h3>
                <span className="text-xs font-mono-num font-semibold text-[#A5B4FC]">
                  {isUnlocked ? '已铭刻' : `${selectedDef.costStardust} 星尘`}
                </span>
              </div>

              <p className="text-sm text-[#CBD5E1] leading-relaxed mt-2">
                {selectedDef.description}
              </p>

              {selectedDef.requires &&
                !meta.ascensionNodes[selectedDef.requires] && (
                  <p className="text-xs text-[#FBBF24] mt-2">
                    前置星宿：{ASCENSION_NODES_BY_ID[selectedDef.requires].name}
                  </p>
                )}

              <button
                type="button"
                disabled={!canAfford}
                onClick={() => onUnlockNode(selectedNodeId)}
                className={`mt-4 w-full py-2 px-4 rounded-lg text-xs font-bold whitespace-nowrap ${
                  isUnlocked
                    ? 'bg-[#1B2842] text-[#94A3B8] cursor-default'
                    : canAfford
                      ? 'bg-[#6366F1] hover:bg-[#4F46E5] text-white cursor-pointer'
                      : 'bg-[#0D1528] text-[#475569] border border-[#1E293B] cursor-not-allowed'
                }`}
              >
                {isUnlocked
                  ? '该星宿已永久激活'
                  : canAfford
                    ? `铭刻【${selectedDef.name}】`
                    : '星尘不足或未解锁前置'}
              </button>
            </div>

            {/* Ascension Prestige Trigger Box */}
            <div className="p-4 rounded-xl bg-[#09101E] border border-[#293B5C]">
              <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                <span>本局累计星辉</span>
                <span className="font-mono-num font-semibold text-[#F8FAFC]">
                  {formatNum(run.totalLuminanceRun)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-[#94A3B8] mt-1.5">
                <span>重铸可获天枢星尘</span>
                <span className="font-mono-num font-bold text-[#A5B4FC] text-sm">
                  +{formatNum(pendingStardust)}
                </span>
              </div>

              {pendingStardust <= 0 ? (
                <p className="text-xs text-[#64748B] mt-3">
                  本局累计达到 {formatNum(ASCENSION_MIN_LUMINANCE)} 星辉后即可开启星盘重铸。
                </p>
              ) : !confirmingReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmingReset(true)}
                  className="mt-3 w-full py-2.5 px-4 rounded-lg bg-[#F59E0B] hover:bg-[#D97706] text-[#090D16] text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>重铸星盘（收获 +{formatNum(pendingStardust)} 星尘）</span>
                </button>
              ) : (
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingReset(false);
                      onPerformAscension();
                    }}
                    className="flex-1 py-2 px-3 rounded-lg bg-[#EA580C] hover:bg-[#C2410C] text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                  >
                    确认重铸开启新周目
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingReset(false)}
                    className="py-2 px-3 rounded-lg bg-[#162136] border border-[#334155] text-xs font-medium text-[#CBD5E1] cursor-pointer whitespace-nowrap"
                  >
                    取消
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
