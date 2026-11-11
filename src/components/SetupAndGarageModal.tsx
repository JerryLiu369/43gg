import React, { useState } from 'react';
import {
  REPAIR_COSTS_MIN,
  applyDrivingPreset,
  getDrivingPreset,
} from '../game/physics.ts';
import type {
  DamageState,
  DrivetrainType,
  InputSettings,
  TireCompound,
  TuningSetup,
} from '../game/types.ts';

interface SetupAndGarageModalProps {
  tuning: TuningSetup;
  presets: TuningSetup[];
  inputSettings: InputSettings;
  damage: DamageState;
  serviceMinutesLeft: number;
  showServiceTab?: boolean;
  onUpdateTuning: (next: TuningSetup) => void;
  onSavePreset: (preset: TuningSetup) => void;
  onUpdateInputSettings: (next: InputSettings) => void;
  onRepairZone: (
    zone: 'steering' | 'engine' | 'gearbox' | 'suspension' | 'tires' | 'lights',
    costMin: number
  ) => void;
  onClose: () => void;
}

export const SetupAndGarageModal: React.FC<SetupAndGarageModalProps> = ({
  tuning,
  presets,
  inputSettings,
  damage,
  serviceMinutesLeft,
  showServiceTab = false,
  onUpdateTuning,
  onSavePreset,
  onUpdateInputSettings,
  onRepairZone,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'tuning' | 'input' | 'service'>(
    showServiceTab ? 'service' : 'tuning'
  );
  const [customName, setCustomName] = useState(tuning.name);

  // Calculate live mechanical handling balance index (-100 Understeer to +100 Oversteer)
  // Stiffer rear springs, rearward AWD split, or RWD shift balance toward Oversteer;
  // Stiffer front springs, forward brake bias, or FWD shift balance toward Understeer.
  const springBalance = ((tuning.rearSpringRate - tuning.frontSpringRate) / 50) * 45;
  const drivetrainBalance =
    tuning.drivetrain === 'RWD'
      ? 38
      : tuning.drivetrain === 'FWD'
        ? -42
        : (0.5 - tuning.awdFrontTorqueSplit) * 95;
  const brakeBalance = (0.62 - tuning.brakeBiasFront) * 80;
  const handlingScore = Math.max(
    -100,
    Math.min(100, Math.round(springBalance + drivetrainBalance + brakeBalance))
  );

  const handlingLabel =
    handlingScore < -18
      ? `偏向推头 / 稳定入弯 (${handlingScore})`
      : handlingScore > 18
        ? `偏向甩尾 / 车尾灵活 (+${handlingScore})`
        : `中性均衡 / 四轮可控 (${handlingScore >= 0 ? `+${handlingScore}` : handlingScore})`;

  const damageZones: Array<
    'steering' | 'suspension' | 'engine' | 'gearbox' | 'tires' | 'lights'
  > = ['steering', 'suspension', 'engine', 'gearbox', 'tires', 'lights'];

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-[#090b0e]/92 p-4 pointer-events-auto"
      role="dialog"
      aria-label="车辆调校与维修车间"
    >
      <div className="w-full max-w-5xl max-h-[90vh] flex flex-col bg-[#0f1319] border border-slate-800 rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#0b0e13]">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-wide text-slate-100">
              赛事维修区与机械调校台 (SERVICE PARK &amp; SETUP)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              每一项机械参数都会直接改变物理引擎中的载荷转移、轮胎滑移率与差速锁止特性
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-[#161b22] p-1 rounded border border-slate-800">
              {showServiceTab && (
                <button
                  type="button"
                  onClick={() => setActiveTab('service')}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 ${
                    activeTab === 'service'
                      ? 'bg-[#f59e0b] text-black'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  抢修车间 ({serviceMinutesLeft} min)
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveTab('tuning')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'tuning'
                    ? 'bg-[#f59e0b] text-black'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                底盘与传动调校
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('input')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'input'
                    ? 'bg-[#f59e0b] text-black'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                外设曲线与领航员
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 rounded transition-colors whitespace-nowrap shrink-0"
            >
              返回 (Esc)
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'service' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-[#141922] border border-slate-800 rounded">
                <div>
                  <div className="text-sm font-semibold text-slate-200">
                    赛段间限时维修预算 (Service Time Budget)
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    总维修时间有限（45 分钟），请根据下一段路况优先修复致命部位（如夜间赛段务必保住车灯，高速赛段优先修转向与悬挂）。
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">剩余可用工时</div>
                  <div className="font-mono-num text-2xl font-bold text-[#f59e0b]">
                    {serviceMinutesLeft} / 45 MIN
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {damageZones.map((zone) => {
                  const info = REPAIR_COSTS_MIN[zone];
                  const dmgPct = Math.round(damage[zone] * 100);
                  const healthPct = 100 - dmgPct;
                  const canRepair = dmgPct > 0 && serviceMinutesLeft >= info.costMin;

                  return (
                    <div
                      key={zone}
                      className="p-4 bg-[#131820] border border-slate-800 rounded flex flex-col justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-slate-100">
                            {info.labelZh}
                          </span>
                          <span
                            className={`font-mono-num text-xs font-bold ${
                              healthPct > 75
                                ? 'text-emerald-400'
                                : healthPct > 40
                                  ? 'text-amber-400'
                                  : 'text-rose-400'
                            }`}
                          >
                            完好度 {healthPct}% (损伤 {dmgPct}%)
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{info.descZh}</p>
                        <div className="w-full h-2 bg-slate-900 rounded overflow-hidden mt-2.5">
                          <div
                            className={`h-full transition-all ${
                              healthPct > 75
                                ? 'bg-emerald-500'
                                : healthPct > 40
                                  ? 'bg-amber-500'
                                  : 'bg-rose-500'
                            }`}
                            style={{ width: `${healthPct}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                        <span className="font-mono-num text-xs text-slate-400">
                          耗时：{info.costMin} 分钟
                        </span>
                        <button
                          type="button"
                          disabled={!canRepair}
                          onClick={() => onRepairZone(zone, info.costMin)}
                          className={`px-3.5 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 ${
                            canRepair
                              ? 'bg-[#f59e0b] hover:bg-[#d97706] text-black'
                              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          {dmgPct === 0 ? '状态完好' : `立即抢修 (-${info.costMin}m)`}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'tuning' && (
            <div className="space-y-6">
              {/* Presets & Balance Preview Bar */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 bg-[#131820] border border-slate-800 rounded">
                <div className="lg:col-span-7 space-y-2">
                  <label className="block text-xs font-semibold text-slate-400">
                    调校存档与厂队预设 (Setup Presets)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {presets.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => {
                          onUpdateTuning({ ...p });
                          setCustomName(p.name);
                        }}
                        className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
                          tuning.name === p.name
                            ? 'bg-[#f59e0b]/15 border-[#f59e0b] text-[#f59e0b]'
                            : 'bg-[#0d1117] border-slate-800 text-slate-300 hover:border-slate-600'
                        }`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="text"
                      aria-label="自定义调校档名称"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="输入自定义调校名称..."
                      className="px-3 py-1.5 text-xs bg-[#090b0e] border border-slate-700 rounded text-slate-100 w-60"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const clean = customName.trim() || '自定义赛段调校';
                        const next = { ...tuning, name: clean };
                        onUpdateTuning(next);
                        onSavePreset(next);
                      }}
                      className="px-3.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 rounded transition-colors whitespace-nowrap shrink-0"
                    >
                      保存当前调校成档
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-5 flex flex-col justify-center border-t lg:border-t-0 lg:border-l border-slate-800 pt-3 lg:pt-0 lg:pl-5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">动态转向性格预测</span>
                    <span className="font-mono-num font-semibold text-[#f59e0b]">
                      {handlingLabel}
                    </span>
                  </div>
                  <div className="relative w-full h-3 bg-slate-900 rounded-full mt-2 overflow-hidden border border-slate-800">
                    <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-500" />
                    <div
                      className="absolute top-0.5 bottom-0.5 w-3 bg-[#f59e0b] rounded-full transition-all"
                      style={{
                        left: `calc(${50 + handlingScore * 0.45}% - 6px)`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                    <span>推头稳定 (Understeer)</span>
                    <span>中性 (Neutral)</span>
                    <span>激进甩尾 (Oversteer)</span>
                  </div>
                </div>
              </div>

              {/* Drivetrain & Tire Compound Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-[#131820] border border-slate-800 rounded space-y-2.5">
                  <div className="text-sm font-semibold text-slate-100">
                    驱动布局 (Drivetrain Architecture)
                  </div>
                  <p className="text-xs text-slate-400">
                    四驱依靠重心转移与出弯牵引；后驱给油极易动力甩尾；前驱出弯推头明显、需靠收油或左脚刹车甩尾入弯。
                  </p>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {(['AWD', 'RWD', 'FWD'] as DrivetrainType[]).map((dt) => (
                      <button
                        key={dt}
                        type="button"
                        onClick={() => onUpdateTuning({ ...tuning, drivetrain: dt })}
                        className={`py-2 px-3 text-xs font-bold rounded border transition-colors whitespace-nowrap shrink-0 ${
                          tuning.drivetrain === dt
                            ? 'bg-[#f59e0b] text-black border-[#f59e0b]'
                            : 'bg-[#0b0e13] text-slate-300 border-slate-800 hover:border-slate-600'
                        }`}
                      >
                        {dt === 'AWD'
                          ? 'AWD 全时四驱'
                          : dt === 'RWD'
                            ? 'RWD 经典后驱'
                            : 'FWD 竞技前驱'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-[#131820] border border-slate-800 rounded space-y-2.5">
                  <div className="text-sm font-semibold text-slate-100">
                    轮胎配方选择 (Tire Compound)
                  </div>
                  <p className="text-xs text-slate-400">
                    选错胎抓地力将大幅惩罚（如干地胎上冰面几乎无法刹车，雪地钉胎跑干柏油胎面发飘）。
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    {(
                      [
                        { id: 'gravel', label: '砂石拉力胎' },
                        { id: 'tarmac_dry', label: '干地柏油胎' },
                        { id: 'tarmac_wet', label: '湿地排水胎' },
                        { id: 'snow', label: '北欧钉胎(Snow)' },
                      ] as Array<{ id: TireCompound; label: string }>
                    ).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => onUpdateTuning({ ...tuning, tireCompound: t.id })}
                        className={`py-2 px-2.5 text-xs font-bold rounded border transition-colors whitespace-nowrap shrink-0 ${
                          tuning.tireCompound === t.id
                            ? 'bg-[#f59e0b] text-black border-[#f59e0b]'
                            : 'bg-[#0b0e13] text-slate-300 border-slate-800 hover:border-slate-600'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Mechanical Sliders Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Final Drive Ratio */}
                <div className="p-4 bg-[#131820] border border-slate-800 rounded space-y-2">
                  <div className="flex justify-between text-xs">
                    <label htmlFor="slider-final-drive" className="font-semibold text-slate-200">
                      主减速比 / 齿比疏密 (Final Drive Ratio)
                    </label>
                    <span className="font-mono-num text-[#f59e0b]">
                      {tuning.finalDriveRatio.toFixed(2)}x (
                      {tuning.finalDriveRatio > 1.05
                        ? '密齿加速型'
                        : tuning.finalDriveRatio < 0.95
                          ? '疏齿极速型'
                          : '标准齿比'}
                      )
                    </span>
                  </div>
                  <input
                    id="slider-final-drive"
                    type="range"
                    min="0.82"
                    max="1.22"
                    step="0.02"
                    value={tuning.finalDriveRatio}
                    onChange={(e) =>
                      onUpdateTuning({ ...tuning, finalDriveRatio: parseFloat(e.target.value) })
                    }
                    className="w-full accent-[#f59e0b]"
                  />
                  <p className="text-[11px] text-slate-400">
                    调大(密齿)：提升陡坡与发夹弯出弯爆发力，但极速降低；调小(疏齿)：适合瑞典/威尔士高速直道。
                  </p>
                </div>

                {/* AWD Front/Rear Torque Split */}
                <div className="p-4 bg-[#131820] border border-slate-800 rounded space-y-2">
                  <div className="flex justify-between text-xs">
                    <label htmlFor="slider-torque-split" className="font-semibold text-slate-200">
                      中央差速器前后扭矩分配 (AWD Torque Split)
                    </label>
                    <span className="font-mono-num text-[#f59e0b]">
                      前 {Math.round(tuning.awdFrontTorqueSplit * 100)}% / 后{' '}
                      {Math.round((1 - tuning.awdFrontTorqueSplit) * 100)}%
                    </span>
                  </div>
                  <input
                    id="slider-torque-split"
                    type="range"
                    min="0.25"
                    max="0.65"
                    step="0.01"
                    disabled={tuning.drivetrain !== 'AWD'}
                    value={tuning.awdFrontTorqueSplit}
                    onChange={(e) =>
                      onUpdateTuning({
                        ...tuning,
                        awdFrontTorqueSplit: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-[#f59e0b]"
                  />
                  <p className="text-[11px] text-slate-400">
                    后轮比例越高：给油越容易帮助车尾摆动过弯；前轮比例越高：出弯车头拉拽感更强更稳定。
                  </p>
                </div>

                {/* Front & Rear Springs */}
                <div className="p-4 bg-[#131820] border border-slate-800 rounded space-y-2">
                  <div className="flex justify-between text-xs">
                    <label htmlFor="slider-front-spring" className="font-semibold text-slate-200">
                      前悬挂弹簧刚度 (Front Spring Rate)
                    </label>
                    <span className="font-mono-num text-[#f59e0b]">{tuning.frontSpringRate} kN/m</span>
                  </div>
                  <input
                    id="slider-front-spring"
                    type="range"
                    min="26"
                    max="74"
                    step="2"
                    value={tuning.frontSpringRate}
                    onChange={(e) =>
                      onUpdateTuning({ ...tuning, frontSpringRate: parseFloat(e.target.value) })
                    }
                    className="w-full accent-[#f59e0b]"
                  />
                  <div className="flex justify-between text-xs pt-2">
                    <label htmlFor="slider-rear-spring" className="font-semibold text-slate-200">
                      后悬挂弹簧刚度 (Rear Spring Rate)
                    </label>
                    <span className="font-mono-num text-[#f59e0b]">{tuning.rearSpringRate} kN/m</span>
                  </div>
                  <input
                    id="slider-rear-spring"
                    type="range"
                    min="26"
                    max="74"
                    step="2"
                    value={tuning.rearSpringRate}
                    onChange={(e) =>
                      onUpdateTuning({ ...tuning, rearSpringRate: parseFloat(e.target.value) })
                    }
                    className="w-full accent-[#f59e0b]"
                  />
                  <p className="text-[11px] text-slate-400">
                    “前软后硬”让车尾更活泼易甩尾；“前硬后软”增加车头抗俯仰支撑但容易推头。烂路宜偏软吸震。
                  </p>
                </div>

                {/* Suspension Travel & Damper */}
                <div className="p-4 bg-[#131820] border border-slate-800 rounded space-y-2">
                  <div className="flex justify-between text-xs">
                    <label htmlFor="slider-susp-travel" className="font-semibold text-slate-200">
                      悬挂有效行程与车高 (Suspension Travel)
                    </label>
                    <span className="font-mono-num text-[#f59e0b]">
                      {Math.round(tuning.suspensionTravel * 1000)} mm
                    </span>
                  </div>
                  <input
                    id="slider-susp-travel"
                    type="range"
                    min="0.14"
                    max="0.28"
                    step="0.01"
                    value={tuning.suspensionTravel}
                    onChange={(e) =>
                      onUpdateTuning({ ...tuning, suspensionTravel: parseFloat(e.target.value) })
                    }
                    className="w-full accent-[#f59e0b]"
                  />
                  <div className="flex justify-between text-xs pt-2">
                    <label htmlFor="slider-damping" className="font-semibold text-slate-200">
                      避震压缩/回弹阻尼 (Damper Stiffness)
                    </label>
                    <span className="font-mono-num text-[#f59e0b]">
                      {tuning.dampingStiffness.toFixed(2)}x
                    </span>
                  </div>
                  <input
                    id="slider-damping"
                    type="range"
                    min="0.6"
                    max="1.45"
                    step="0.05"
                    value={tuning.dampingStiffness}
                    onChange={(e) =>
                      onUpdateTuning({ ...tuning, dampingStiffness: parseFloat(e.target.value) })
                    }
                    className="w-full accent-[#f59e0b]"
                  />
                  <p className="text-[11px] text-slate-400">
                    大跳坡与砂石赛段需增加行程（220-260mm）防止落地触底失控；柏油赛段降低车高提升侧倾响应。
                  </p>
                </div>

                {/* Brake Bias */}
                <div className="p-4 bg-[#131820] border border-slate-800 rounded space-y-2">
                  <div className="flex justify-between text-xs">
                    <label htmlFor="slider-brake-bias" className="font-semibold text-slate-200">
                      前后刹车制动力平衡 (Front Brake Bias)
                    </label>
                    <span className="font-mono-num text-[#f59e0b]">
                      前 {Math.round(tuning.brakeBiasFront * 100)}% / 后{' '}
                      {Math.round((1 - tuning.brakeBiasFront) * 100)}%
                    </span>
                  </div>
                  <input
                    id="slider-brake-bias"
                    type="range"
                    min="0.50"
                    max="0.76"
                    step="0.01"
                    value={tuning.brakeBiasFront}
                    onChange={(e) =>
                      onUpdateTuning({ ...tuning, brakeBiasFront: parseFloat(e.target.value) })
                    }
                    className="w-full accent-[#f59e0b]"
                  />
                  <p className="text-[11px] text-slate-400">
                    后移制动力（52%-56%）可在重刹入弯时让后轮轻微锁死帮助车头指向弯心（循迹刹车甩尾）。
                  </p>
                </div>

                {/* Tire Pressure & Center Diff Lock */}
                <div className="p-4 bg-[#131820] border border-slate-800 rounded space-y-2">
                  <div className="flex justify-between text-xs">
                    <label htmlFor="slider-tire-psi" className="font-semibold text-slate-200">
                      轮胎冷态胎压 (Tire Pressure)
                    </label>
                    <span className="font-mono-num text-[#f59e0b]">{tuning.tirePressurePsi} PSI</span>
                  </div>
                  <input
                    id="slider-tire-psi"
                    type="range"
                    min="17"
                    max="35"
                    step="1"
                    value={tuning.tirePressurePsi}
                    onChange={(e) =>
                      onUpdateTuning({ ...tuning, tirePressurePsi: parseFloat(e.target.value) })
                    }
                    className="w-full accent-[#f59e0b]"
                  />
                  <div className="flex justify-between text-xs pt-2">
                    <label htmlFor="slider-diff-lock" className="font-semibold text-slate-200">
                      差速器锁止率 (Differential Lock)
                    </label>
                    <span className="font-mono-num text-[#f59e0b]">
                      {Math.round(tuning.diffLock * 100)}%
                    </span>
                  </div>
                  <input
                    id="slider-diff-lock"
                    type="range"
                    min="0.2"
                    max="0.95"
                    step="0.05"
                    value={tuning.diffLock}
                    onChange={(e) =>
                      onUpdateTuning({ ...tuning, diffLock: parseFloat(e.target.value) })
                    }
                    className="w-full accent-[#f59e0b]"
                  />
                  <p className="text-[11px] text-slate-400">
                    冰雪/泥泞路面宜降低胎压（18-22 PSI）并提高差速锁止率；干燥柏油适合高胎压（29-33 PSI）。
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'input' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-[#131820] border border-slate-800 rounded space-y-3">
                  <div className="text-sm font-semibold text-slate-100">
                    转向输入曲线与灵敏度 (Steering Calibration)
                  </div>
                  <div>
                    <div className="flex justify-between text-xs">
                      <label htmlFor="in-sens" className="text-slate-300">转向灵敏度 (Sensitivity)</label>
                      <span className="font-mono-num text-[#f59e0b]">
                        {inputSettings.steerSensitivity.toFixed(2)}x
                      </span>
                    </div>
                    <input
                      id="in-sens"
                      type="range"
                      min="0.6"
                      max="1.6"
                      step="0.05"
                      value={inputSettings.steerSensitivity}
                      onChange={(e) =>
                        onUpdateInputSettings({
                          ...inputSettings,
                          steerSensitivity: parseFloat(e.target.value),
                        })
                      }
                      className="w-full accent-[#f59e0b]"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs">
                      <label htmlFor="in-lin" className="text-slate-300">转向非线性指数 (Linearity)</label>
                      <span className="font-mono-num text-[#f59e0b]">
                        {inputSettings.steerLinearity.toFixed(2)}
                      </span>
                    </div>
                    <input
                      id="in-lin"
                      type="range"
                      min="1.0"
                      max="2.5"
                      step="0.05"
                      value={inputSettings.steerLinearity}
                      onChange={(e) =>
                        onUpdateInputSettings({
                          ...inputSettings,
                          steerLinearity: parseFloat(e.target.value),
                        })
                      }
                      className="w-full accent-[#f59e0b]"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs">
                      <label htmlFor="in-dz" className="text-slate-300">摇杆中心死区 (Deadzone)</label>
                      <span className="font-mono-num text-[#f59e0b]">
                        {Math.round(inputSettings.steerDeadzone * 100)}%
                      </span>
                    </div>
                    <input
                      id="in-dz"
                      type="range"
                      min="0.0"
                      max="0.2"
                      step="0.01"
                      value={inputSettings.steerDeadzone}
                      onChange={(e) =>
                        onUpdateInputSettings({
                          ...inputSettings,
                          steerDeadzone: parseFloat(e.target.value),
                        })
                      }
                      className="w-full accent-[#f59e0b]"
                    />
                  </div>
                </div>

                <div className="p-4 bg-[#131820] border border-slate-800 rounded space-y-3">
                  <div className="text-sm font-semibold text-slate-100">
                    线性扳机曲线与领航员播报 (Pedals &amp; Co-Driver)
                  </div>
                  <div>
                    <div className="flex justify-between text-xs">
                      <label htmlFor="in-thr" className="text-slate-300">油门踏板线性度 (Throttle Gamma)</label>
                      <span className="font-mono-num text-[#f59e0b]">
                        {inputSettings.throttleGamma.toFixed(2)}
                      </span>
                    </div>
                    <input
                      id="in-thr"
                      type="range"
                      min="0.7"
                      max="2.0"
                      step="0.05"
                      value={inputSettings.throttleGamma}
                      onChange={(e) =>
                        onUpdateInputSettings({
                          ...inputSettings,
                          throttleGamma: parseFloat(e.target.value),
                        })
                      }
                      className="w-full accent-[#f59e0b]"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs">
                      <label htmlFor="in-brk" className="text-slate-300">刹车踏板线性度 (Brake Gamma)</label>
                      <span className="font-mono-num text-[#f59e0b]">
                        {inputSettings.brakeGamma.toFixed(2)}
                      </span>
                    </div>
                    <input
                      id="in-brk"
                      type="range"
                      min="0.7"
                      max="2.0"
                      step="0.05"
                      value={inputSettings.brakeGamma}
                      onChange={(e) =>
                        onUpdateInputSettings({
                          ...inputSettings,
                          brakeGamma: parseFloat(e.target.value),
                        })
                      }
                      className="w-full accent-[#f59e0b]"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs">
                      <label htmlFor="in-lead" className="text-slate-300">
                        领航员路书提前量系数 (Pacenote Lead Time)
                      </label>
                      <span className="font-mono-num text-[#f59e0b]">
                        {inputSettings.pacenoteLeadScale.toFixed(2)}x
                      </span>
                    </div>
                    <input
                      id="in-lead"
                      type="range"
                      min="0.65"
                      max="1.45"
                      step="0.05"
                      value={inputSettings.pacenoteLeadScale}
                      onChange={(e) =>
                        onUpdateInputSettings({
                          ...inputSettings,
                          pacenoteLeadScale: parseFloat(e.target.value),
                        })
                      }
                      className="w-full accent-[#f59e0b]"
                    />
                  </div>
                </div>
              </div>

              {/* Co-Driver & Mechanical Assists + Quick Sport/Pro Preset Switch */}
              <div className="p-4 bg-[#131820] border border-slate-800 rounded space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">
                      换挡模式预设与驾驶辅助 (Transmission &amp; Assists)
                    </div>
                    <p className="text-xs text-slate-400">
                      物理引擎无任何隐藏车身稳定系统（ESP）。可一键切换「运动序列挡」或「硬核手排+离合」，赛段中也可按 G 键即时切换。
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateInputSettings(applyDrivingPreset(inputSettings, 'sport'))
                      }
                      className={`px-3 py-1.5 text-xs font-bold rounded border transition-colors whitespace-nowrap ${
                        getDrivingPreset(inputSettings) === 'sport'
                          ? 'bg-[#f59e0b] text-black border-[#f59e0b]'
                          : 'bg-[#0b0e13] text-slate-300 border-slate-700 hover:border-slate-500'
                      }`}
                    >
                      运动序列挡 (自动换挡+防熄火)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateInputSettings(applyDrivingPreset(inputSettings, 'pro'))
                      }
                      className={`px-3 py-1.5 text-xs font-bold rounded border transition-colors whitespace-nowrap ${
                        getDrivingPreset(inputSettings) === 'pro'
                          ? 'bg-[#f59e0b] text-black border-[#f59e0b]'
                          : 'bg-[#0b0e13] text-slate-300 border-slate-700 hover:border-slate-500'
                      }`}
                    >
                      硬核手排 (手动 Q/E + Shift 离合)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                  {[
                    {
                      key: 'pacenoteAudioEnabled' as const,
                      label: '领航员语音播报 (Co-Driver Voice)',
                      desc: '实时合成人声路书与无线电提示音',
                    },
                    {
                      key: 'pacenoteVisualEnabled' as const,
                      label: '顶部屏幕路书条 (Visual Pacenotes)',
                      desc: '显示 FIA 标准弯道等级图标与修饰提示',
                    },
                    {
                      key: 'autoGearbox' as const,
                      label: '智能序列自动换挡 (Auto Gearbox)',
                      desc: '开启时仍可随时按 Q/E 人工干预抢挡并自动倒车',
                    },
                    {
                      key: 'autoClutch' as const,
                      label: '自动离合防熄火 (Auto Clutch)',
                      desc: '关闭时陡坡/低转不踩 Shift 离合会导致引擎熄火',
                    },
                    {
                      key: 'absAssist' as const,
                      label: '防抱死刹车辅助 (ABS)',
                      desc: '关闭时重刹锁死前轮会失去入弯转向能力',
                    },
                    {
                      key: 'tcsAssist' as const,
                      label: '牵引力控制辅助 (TCS)',
                      desc: '关闭时可自由靠油门深浅控制甩尾滑移角',
                    },
                  ].map((item) => {
                    const checked = inputSettings[item.key];
                    return (
                      <label
                        key={item.key}
                        className="flex items-start gap-3 p-3 bg-[#0c1016] border border-slate-800 rounded cursor-pointer hover:border-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            onUpdateInputSettings({
                              ...inputSettings,
                              [item.key]: e.target.checked,
                            })
                          }
                          className="mt-0.5 accent-[#f59e0b]"
                        />
                        <div>
                          <div className="text-xs font-semibold text-slate-200">{item.label}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">{item.desc}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
