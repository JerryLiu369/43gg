import { SPORT_INPUT_SETTINGS, DEFAULT_TUNING } from './physics.ts';
import type { InputSettings, StageRecord, TuningSetup } from './types.ts';

const RECORDS_KEY = 'chrono_rally_stage_records_v1';
const TUNING_PRESETS_KEY = 'chrono_rally_tuning_presets_v1';
const INPUT_SETTINGS_KEY = 'chrono_rally_input_settings_v2';

export function loadStageRecords(): Record<string, StageRecord> {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, StageRecord>;
  } catch {
    return {};
  }
}

export function saveStageRecord(record: StageRecord): void {
  try {
    const all = loadStageRecords();
    const existing = all[record.stageId];
    if (!existing || record.bestTimeSec < existing.bestTimeSec) {
      all[record.stageId] = record;
      localStorage.setItem(RECORDS_KEY, JSON.stringify(all));
    }
  } catch {
    // Ignore storage quota errors in restricted sandboxes
  }
}

export const BUILTIN_TUNING_PRESETS: TuningSetup[] = [
  DEFAULT_TUNING,
  {
    name: '山地柏油竞技设定 (Tarmac Attack)',
    drivetrain: 'AWD',
    finalDriveRatio: 0.94,
    frontSpringRate: 62,
    rearSpringRate: 58,
    suspensionTravel: 0.16,
    dampingStiffness: 1.3,
    awdFrontTorqueSplit: 0.45,
    diffLock: 0.55,
    brakeBiasFront: 0.66,
    tirePressurePsi: 31,
    tireCompound: 'tarmac_dry',
  },
  {
    name: '北欧冰雪飘移设定 (Snow & Ice)',
    drivetrain: 'AWD',
    finalDriveRatio: 1.08,
    frontSpringRate: 34,
    rearSpringRate: 38,
    suspensionTravel: 0.25,
    dampingStiffness: 0.85,
    awdFrontTorqueSplit: 0.38, // Rear-biased to help rotate car on snow
    diffLock: 0.8,
    brakeBiasFront: 0.56,
    tirePressurePsi: 19,
    tireCompound: 'snow',
  },
  {
    name: 'Group B 后驱猛兽 (RWD Oversteer)',
    drivetrain: 'RWD',
    finalDriveRatio: 1.02,
    frontSpringRate: 46,
    rearSpringRate: 40,
    suspensionTravel: 0.21,
    dampingStiffness: 1.05,
    awdFrontTorqueSplit: 0.0,
    diffLock: 0.7,
    brakeBiasFront: 0.64,
    tirePressurePsi: 25,
    tireCompound: 'gravel',
  },
  {
    name: 'JWRC 前驱紧凑钢炮 (FWD Kit Car)',
    drivetrain: 'FWD',
    finalDriveRatio: 1.12,
    frontSpringRate: 48,
    rearSpringRate: 54, // Stiffer rear helps liftoff oversteer rotation on FWD!
    suspensionTravel: 0.2,
    dampingStiffness: 1.1,
    awdFrontTorqueSplit: 1.0,
    diffLock: 0.5,
    brakeBiasFront: 0.58,
    tirePressurePsi: 26,
    tireCompound: 'gravel',
  },
];

export function loadSavedTuningPresets(): TuningSetup[] {
  try {
    const raw = localStorage.getItem(TUNING_PRESETS_KEY);
    if (!raw) return [...BUILTIN_TUNING_PRESETS];
    const parsed = JSON.parse(raw) as TuningSetup[];
    return parsed.length > 0 ? parsed : [...BUILTIN_TUNING_PRESETS];
  } catch {
    return [...BUILTIN_TUNING_PRESETS];
  }
}

export function saveCustomTuningPreset(preset: TuningSetup): TuningSetup[] {
  const current = loadSavedTuningPresets();
  const idx = current.findIndex((p) => p.name === preset.name);
  if (idx >= 0) {
    current[idx] = preset;
  } else {
    current.push(preset);
  }
  try {
    localStorage.setItem(TUNING_PRESETS_KEY, JSON.stringify(current));
  } catch {
    // Ignore storage error
  }
  return current;
}

export function loadInputSettings(): InputSettings {
  try {
    const raw = localStorage.getItem(INPUT_SETTINGS_KEY);
    if (!raw) return { ...SPORT_INPUT_SETTINGS };
    return { ...SPORT_INPUT_SETTINGS, ...(JSON.parse(raw) as Partial<InputSettings>) };
  } catch {
    return { ...SPORT_INPUT_SETTINGS };
  }
}

export function saveInputSettings(settings: InputSettings): void {
  try {
    localStorage.setItem(INPUT_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore
  }
}
