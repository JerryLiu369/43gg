import {
  createInitialAutomatorState,
  createInitialMetaState,
  createNewOrreryRun,
} from './engine.ts';
import { RING_ORDER } from './content.ts';
import type {
  BuyMode,
  CameraPresetId,
  OrreryMetaState,
  OrreryPrefs,
  OrreryRunState,
} from './types.ts';

const RUN_STORAGE_KEY = 'gaistudio.astral_orrery.run.v1';
const META_STORAGE_KEY = 'gaistudio.astral_orrery.meta.v1';
const PREFS_STORAGE_KEY = 'gaistudio.astral_orrery.prefs.v1';

const VALID_BUY_MODES = new Set<BuyMode>(['1', '10', 'next', 'max']);
const VALID_CAMERAS = new Set<CameraPresetId>([
  'overview',
  'meridian',
  'crucible',
  'zenith',
]);

export function createDefaultPrefs(): OrreryPrefs {
  return {
    muted: false,
    zenMode: false,
    buyMode: '1',
    cameraPreset: 'overview',
    gimbal3dMode: true,
    dockCollapsed: false,
  };
}

export function loadOrreryMeta(): OrreryMetaState {
  if (typeof window === 'undefined') return createInitialMetaState();
  try {
    const raw = window.localStorage.getItem(META_STORAGE_KEY);
    if (!raw) return createInitialMetaState();
    const parsed = JSON.parse(raw) as Partial<OrreryMetaState>;
    const defaults = createInitialMetaState();
    return {
      ...defaults,
      ...parsed,
      ascensionNodes: {
        ...defaults.ascensionNodes,
        ...(parsed.ascensionNodes ?? {}),
      },
      achievements: {
        ...defaults.achievements,
        ...(parsed.achievements ?? {}),
      },
    };
  } catch {
    return createInitialMetaState();
  }
}

export function saveOrreryMeta(meta: OrreryMetaState): void {
  if (typeof window === 'undefined') return;
  try {
    meta.lastSavedAt = Date.now();
    window.localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadOrreryRun(meta: OrreryMetaState): OrreryRunState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(RUN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OrreryRunState>;
    if (!parsed || typeof parsed.luminance !== 'number' || !parsed.rings) {
      return null;
    }
    const fresh = createNewOrreryRun(meta);

    const mergedRings = { ...fresh.rings };
    for (const rid of RING_ORDER) {
      if (parsed.rings[rid]) {
        mergedRings[rid] = {
          ...fresh.rings[rid],
          ...parsed.rings[rid],
          gearMode: parsed.rings[rid].gearMode ?? fresh.rings[rid].gearMode,
        };
      }
    }

    const defaultAuto = createInitialAutomatorState(
      Boolean(parsed.autoUpgradeEnabled),
    );
    const parsedAuto = parsed.automator;
    const mergedRules =
      parsedAuto && Array.isArray(parsedAuto.rules) && parsedAuto.rules.length === 6
        ? parsedAuto.rules.map((r, idx) => ({
            ...defaultAuto.rules[idx],
            ...r,
          }))
        : defaultAuto.rules;

    return {
      ...fresh,
      ...parsed,
      comet: {
        ...fresh.comet,
        ...(parsed.comet ?? {}),
      },
      rings: mergedRings,
      directives: {
        ...fresh.directives,
        ...(parsed.directives ?? {}),
      },
      crucible: {
        ...fresh.crucible,
        ...(parsed.crucible ?? {}),
        chambers: {
          ...fresh.crucible.chambers,
          ...(parsed.crucible?.chambers ?? {}),
        },
      },
      automator: {
        ...defaultAuto,
        ...(parsedAuto ?? {}),
        rules: mergedRules,
      },
      slots:
        Array.isArray(parsed.slots) && parsed.slots.length === 12
          ? parsed.slots
          : fresh.slots,
    };
  } catch {
    return null;
  }
}

export function saveOrreryRun(run: OrreryRunState | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!run) {
      window.localStorage.removeItem(RUN_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(run));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadOrreryPrefs(): OrreryPrefs {
  const defaults = createDefaultPrefs();
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<OrreryPrefs>;
    const bm =
      parsed.buyMode && VALID_BUY_MODES.has(parsed.buyMode)
        ? parsed.buyMode
        : '1';
    const cam =
      parsed.cameraPreset && VALID_CAMERAS.has(parsed.cameraPreset)
        ? parsed.cameraPreset
        : 'overview';
    return {
      muted: Boolean(parsed.muted),
      zenMode: Boolean(parsed.zenMode),
      buyMode: bm,
      cameraPreset: cam,
      gimbal3dMode:
        parsed.gimbal3dMode !== undefined ? Boolean(parsed.gimbal3dMode) : true,
      dockCollapsed: Boolean(parsed.dockCollapsed),
    };
  } catch {
    return defaults;
  }
}

export function saveOrreryPrefs(prefs: OrreryPrefs): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore
  }
}

export function clearAllOrreryStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(RUN_STORAGE_KEY);
    window.localStorage.removeItem(META_STORAGE_KEY);
  } catch {
    // Ignore
  }
}
