import { FIXTURES, MOVABLES, shadowLength } from './content.ts';
import type { Dir, FixtureKind, ParsedLevel, PhaseIndex, PuzzleState } from './types.ts';

/* ------------------------------------------------------------------ */
/* 调色板                                                               */
/* ------------------------------------------------------------------ */

/** 各时辰的日光色（整块庭院正片叠底） */
const SUN_TINT: ReadonlyArray<[number, number, number]> = [
  [255, 228, 186],
  [255, 241, 216],
  [255, 251, 238],
  [255, 236, 204],
  [255, 211, 160],
];

/** 各时辰的阴影色（正片叠底，越蓝越凉） */
const SHADE_TINT: ReadonlyArray<[number, number, number]> = [
  [104, 122, 214],
  [96, 128, 214],
  [88, 126, 210],
  [100, 124, 210],
  [116, 114, 200],
];

/** 影子朝向角（屏幕坐标，y 向下）：西 π → 北 1.5π → 东 2π，单调递增，便于补间 */
const PHASE_ANGLE: ReadonlyArray<number> = [Math.PI, Math.PI, Math.PI * 1.5, Math.PI * 2, Math.PI * 2];

const INK = '#2B2118';

function mixRgb(a: readonly number[], b: readonly number[], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function hash2(x: number, y: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/* ------------------------------------------------------------------ */
/* 对外接口                                                             */
/* ------------------------------------------------------------------ */

export interface BoardOverlay {
  /** 下一时辰的阴影（预览） */
  previewShade: Uint8Array | null;
  /** 现在与下一时辰都阴凉的格子 */
  previewSafe: Uint8Array | null;
  /** 当前时辰的阴影，用于标出即将被晒到的格子 */
  currentShade: Uint8Array | null;
  /** 预览路径（不含起点） */
  path: number[] | null;
  pathKind: 'walk' | 'push' | 'hot' | 'blocked' | null;
  pushFrom: number | null;
  pushTo: number | null;
  /** 提示的路径格子；为空数组表示提示「等日头」 */
  hintPath: number[] | null;
  hover: number | null;
  /** 触屏首点后锁定的目标 */
  pendingTarget: number | null;
}

export const EMPTY_OVERLAY: BoardOverlay = {
  previewShade: null,
  previewSafe: null,
  currentShade: null,
  path: null,
  pathKind: null,
  pushFrom: null,
  pushTo: null,
  hintPath: null,
  hover: null,
  pendingTarget: null,
};

interface Particle {
  active: boolean;
  kind: 'dust' | 'steam' | 'petal' | 'leaf' | 'spark' | 'ripple';
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  spin: number;
  angle: number;
  color: string;
}

interface Floater {
  text: string;
  x: number;
  y: number;
  start: number;
  color: string;
}

interface WalkSegment {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  facing: Dir;
  pushIndex: number | null;
  pushFromX: number;
  pushFromY: number;
  pushToX: number;
  pushToY: number;
  hot: boolean;
}

const STEP_MS = 150;
const PHASE_MS = 950;

/* ------------------------------------------------------------------ */
/* 渲染器                                                               */
/* ------------------------------------------------------------------ */

export class ShadeBoardRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private cssW = 0;
  private cssH = 0;

  private level: ParsedLevel | null = null;
  private state: PuzzleState | null = null;

  private cell = 48;
  private ox = 0;
  private oy = 0;
  private roofBand = 0;
  /** 棋盘四周留白（以格为单位），供测试脚本与引导定位复用 */
  public layoutUnits = { top: 0.62, bottom: 0.5, side: 0.3 };

  private floorCache: HTMLCanvasElement | null = null;
  private readonly maskCanvas: HTMLCanvasElement;
  private readonly maskCtx: CanvasRenderingContext2D;
  private readonly shadeCanvas: HTMLCanvasElement;
  private readonly shadeCtx: CanvasRenderingContext2D;
  private static readonly MASK_RES = 8;
  private readonly cloudCanvas: HTMLCanvasElement;

  // 动画
  private catX = 0;
  private catY = 0;
  private catFacing: Dir = 'down';
  private movX: number[] = [];
  private movY: number[] = [];
  private segments: WalkSegment[] = [];
  private segmentStart = 0;
  private phaseFrom: number = 0;
  private phaseTo: number = 0;
  private phaseStart = 0;
  private phaseDur = PHASE_MS;
  private refuseStart = -1e9;
  private celebrateStart = -1e9;
  private lastStepSoundIndex = -1;
  private flashCell = -1;
  private flashStart = -1e9;
  private flashKind: 'hot' | 'blocked' = 'blocked';
  private lastNow = 0;
  private nextLeafAt = 0;

  private particles: Particle[] = [];
  private floaters: Floater[] = [];

  public overlay: BoardOverlay = EMPTY_OVERLAY;
  public onStep: ((index: number, hot: boolean, pushed: boolean, heavy: boolean) => void) | null = null;
  public onArrive: (() => void) | null = null;

  public constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D 不可用');
    this.ctx = ctx;
    this.maskCanvas = document.createElement('canvas');
    const maskCtx = this.maskCanvas.getContext('2d');
    this.shadeCanvas = document.createElement('canvas');
    const shadeCtx = this.shadeCanvas.getContext('2d');
    if (!maskCtx || !shadeCtx) throw new Error('Canvas 2D 不可用');
    this.maskCtx = maskCtx;
    this.shadeCtx = shadeCtx;
    this.cloudCanvas = document.createElement('canvas');
    for (let i = 0; i < 90; i++) {
      this.particles.push({
        active: false,
        kind: 'dust',
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 1,
        spin: 0,
        angle: 0,
        color: '#fff',
      });
    }
  }

  /* ---------------- 布局 ---------------- */

  public resize(cssW: number, cssH: number, dpr: number): void {
    this.cssW = Math.max(1, Math.floor(cssW));
    this.cssH = Math.max(1, Math.floor(cssH));
    this.dpr = Math.min(2.5, Math.max(1, dpr));
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    this.layout();
  }

  private layout(): void {
    const level = this.level;
    if (!level) return;
    const hasRoof = level.tiles.slice(0, level.width).some((t) => t === 'eave');
    // 流云会从棋盘外飘进来：在云出现的那一侧多留一点边，让玩家提前看见
    let cloudTop = 0;
    let cloudBottom = 0;
    let cloudSide = 0;
    for (const cloud of level.def.clouds ?? []) {
      for (let p = 0; p < 5; p++) {
        for (const [dx, dy] of cloud.cells) {
          const x = cloud.origin[0] + cloud.drift[0] * p + dx;
          const y = cloud.origin[1] + cloud.drift[1] * p + dy;
          const near = (x >= -1 && x <= level.width) && (y >= -1 && y <= level.height);
          if (!near) continue;
          if (y < 0) cloudTop = 1.15;
          if (y >= level.height) cloudBottom = 1.15;
          if (x < 0 || x >= level.width) cloudSide = 1.1;
        }
      }
    }
    const topUnits = Math.max(hasRoof ? 0.62 : 0.3, cloudTop);
    const bottomUnits = Math.max(0.5, cloudBottom);
    const sideUnits = Math.max(0.3, cloudSide);
    const cell = Math.floor(
      Math.min(
        this.cssW / (level.width + sideUnits * 2),
        this.cssH / (level.height + topUnits + bottomUnits),
        104,
      ),
    );
    this.cell = Math.max(18, cell);
    this.roofBand = hasRoof ? this.cell * 0.5 : 0;
    const boardW = this.cell * level.width;
    const boardH = this.cell * level.height;
    const totalH = boardH + this.cell * (topUnits + bottomUnits);
    this.layoutUnits = { top: topUnits, bottom: bottomUnits, side: sideUnits };
    this.ox = Math.round((this.cssW - boardW) / 2);
    this.oy = Math.round((this.cssH - totalH) / 2 + this.cell * topUnits);
    this.buildFloorCache();
    const res = ShadeBoardRenderer.MASK_RES;
    this.maskCanvas.width = level.width * res;
    this.maskCanvas.height = level.height * res;
    this.shadeCanvas.width = Math.max(1, Math.round(boardW * this.dpr));
    this.shadeCanvas.height = Math.max(1, Math.round(boardH * this.dpr));
  }

  public cellAt(clientX: number, clientY: number): number {
    const level = this.level;
    if (!level) return -1;
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left - this.ox) / this.cell);
    const y = Math.floor((clientY - rect.top - this.oy) / this.cell);
    if (x < 0 || y < 0 || x >= level.width || y >= level.height) return -1;
    return y * level.width + x;
  }

  /** 棋盘格在页面中的中心坐标（用于新手引导定位） */
  public cellClientCenter(idx: number): { x: number; y: number } | null {
    const level = this.level;
    if (!level || idx < 0) return null;
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + this.ox + ((idx % level.width) + 0.5) * this.cell,
      y: rect.top + this.oy + (Math.floor(idx / level.width) + 0.5) * this.cell,
    };
  }

  /* ---------------- 状态同步 ---------------- */

  public setLevel(level: ParsedLevel, state: PuzzleState): void {
    this.level = level;
    this.layout();
    this.snapTo(state);
    this.particles.forEach((p) => (p.active = false));
    this.floaters = [];
    this.celebrateStart = -1e9;
  }

  /** 立刻对齐到某个状态（撤回、重来） */
  public snapTo(state: PuzzleState, animatePhase = false): void {
    const level = this.level;
    if (!level) return;
    const prevPhase = this.state ? this.state.phase : state.phase;
    this.state = state;
    this.catX = state.cat % level.width;
    this.catY = Math.floor(state.cat / level.width);
    this.catFacing = state.facing;
    this.movX = state.movables.map((m) => m % level.width);
    this.movY = state.movables.map((m) => Math.floor(m / level.width));
    this.segments = [];
    if (animatePhase && prevPhase !== state.phase) {
      this.phaseFrom = this.currentPhaseFloat(this.lastNow);
      this.phaseTo = state.phase;
      this.phaseStart = this.lastNow;
      this.phaseDur = 420;
    } else {
      this.phaseFrom = state.phase;
      this.phaseTo = state.phase;
    }
    if (!state.won) this.celebrateStart = -1e9;
  }

  /** 播放一段行走（含推动），完成后视图停在 next */
  public playWalk(prev: PuzzleState, steps: PuzzleState[], pushedFlags: Array<number | null>, hotFlags: boolean[]): void {
    const level = this.level;
    if (!level) return;
    const w = level.width;
    this.segments = [];
    let cur = prev;
    steps.forEach((next, i) => {
      const pushIndex = pushedFlags[i];
      this.segments.push({
        fromX: cur.cat % w,
        fromY: Math.floor(cur.cat / w),
        toX: next.cat % w,
        toY: Math.floor(next.cat / w),
        facing: next.facing,
        pushIndex,
        pushFromX: pushIndex !== null ? cur.movables[pushIndex] % w : 0,
        pushFromY: pushIndex !== null ? Math.floor(cur.movables[pushIndex] / w) : 0,
        pushToX: pushIndex !== null ? next.movables[pushIndex] % w : 0,
        pushToY: pushIndex !== null ? Math.floor(next.movables[pushIndex] / w) : 0,
        hot: hotFlags[i],
      });
      cur = next;
    });
    this.segmentStart = this.lastNow;
    this.lastStepSoundIndex = -1;
    this.state = steps[steps.length - 1] ?? prev;
  }

  public playWait(next: PuzzleState, hot: boolean): void {
    this.phaseFrom = this.currentPhaseFloat(this.lastNow);
    this.phaseTo = next.phase;
    this.phaseStart = this.lastNow;
    this.phaseDur = PHASE_MS;
    this.state = next;
    if (hot) this.spawnSteam(this.catX, this.catY, 6);
  }

  public isAnimating(now = this.lastNow): boolean {
    if (this.segments.length > 0) return true;
    return now - this.phaseStart < this.phaseDur && this.phaseFrom !== this.phaseTo;
  }

  public refuse(cell: number, kind: 'hot' | 'blocked'): void {
    this.refuseStart = this.lastNow;
    this.flashCell = cell;
    this.flashStart = this.lastNow;
    this.flashKind = kind;
    const level = this.level;
    if (level && cell >= 0 && kind === 'hot') {
      this.floaters.push({
        text: '烫！',
        x: (cell % level.width) + 0.5,
        y: Math.floor(cell / level.width) + 0.3,
        start: this.lastNow,
        color: '#C2410C',
      });
    }
  }

  public celebrate(): void {
    this.celebrateStart = this.lastNow;
    const level = this.level;
    if (!level) return;
    const gx = (level.goal % level.width) + 0.5;
    const gy = Math.floor(level.goal / level.width) + 0.5;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.8 + Math.random() * 2.2;
      this.emit({
        kind: i % 3 === 0 ? 'spark' : 'petal',
        x: gx,
        y: gy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 1.2,
        maxLife: 1.2 + Math.random() * 0.8,
        size: 0.06 + Math.random() * 0.05,
        spin: (Math.random() - 0.5) * 8,
        color: ['#F2A1B3', '#FFD27A', '#FFFFFF', '#F6C177'][i % 4],
      });
    }
  }

  /* ---------------- 动画辅助 ---------------- */

  private currentPhaseFloat(now: number): number {
    if (this.phaseFrom === this.phaseTo) return this.phaseTo;
    const t = Math.min(1, (now - this.phaseStart) / this.phaseDur);
    return lerp(this.phaseFrom, this.phaseTo, easeInOut(t));
  }

  private emit(p: Partial<Particle> & { kind: Particle['kind']; x: number; y: number }): void {
    const slot = this.particles.find((q) => !q.active);
    if (!slot) return;
    slot.active = true;
    slot.kind = p.kind;
    slot.x = p.x;
    slot.y = p.y;
    slot.vx = p.vx ?? 0;
    slot.vy = p.vy ?? 0;
    slot.maxLife = p.maxLife ?? 1;
    slot.life = slot.maxLife;
    slot.size = p.size ?? 0.05;
    slot.spin = p.spin ?? 0;
    slot.angle = Math.random() * Math.PI * 2;
    slot.color = p.color ?? '#fff';
  }

  private spawnSteam(cx: number, cy: number, count: number): void {
    for (let i = 0; i < count; i++) {
      this.emit({
        kind: 'steam',
        x: cx + 0.5 + (Math.random() - 0.5) * 0.4,
        y: cy + 0.55,
        vx: (Math.random() - 0.5) * 0.2,
        vy: -0.5 - Math.random() * 0.4,
        maxLife: 0.8 + Math.random() * 0.4,
        size: 0.07 + Math.random() * 0.05,
        color: 'rgba(255,255,255,0.8)',
      });
    }
  }

  private spawnDust(cx: number, cy: number): void {
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2;
      this.emit({
        kind: 'dust',
        x: cx + 0.5,
        y: cy + 0.75,
        vx: Math.cos(a) * 0.6,
        vy: Math.sin(a) * 0.25 - 0.1,
        maxLife: 0.5 + Math.random() * 0.3,
        size: 0.05 + Math.random() * 0.04,
        color: 'rgba(170,140,100,0.55)',
      });
    }
  }

  private advanceSegments(now: number): void {
    if (this.segments.length === 0) return;
    const elapsed = now - this.segmentStart;
    const idx = Math.floor(elapsed / STEP_MS);
    if (idx > this.lastStepSoundIndex && idx < this.segments.length) {
      for (let i = this.lastStepSoundIndex + 1; i <= idx; i++) {
        const seg = this.segments[i];
        const heavy =
          seg.pushIndex !== null && this.level?.movableKinds[seg.pushIndex] === 'vat';
        this.onStep?.(i, seg.hot, seg.pushIndex !== null, heavy);
        if (seg.pushIndex !== null) this.spawnDust(seg.pushToX, seg.pushToY);
        if (seg.hot) this.spawnSteam(seg.toX, seg.toY, 4);
      }
      this.lastStepSoundIndex = idx;
    }
    if (idx >= this.segments.length) {
      const last = this.segments[this.segments.length - 1];
      this.catX = last.toX;
      this.catY = last.toY;
      this.catFacing = last.facing;
      for (const seg of this.segments) {
        if (seg.pushIndex !== null) {
          this.movX[seg.pushIndex] = seg.pushToX;
          this.movY[seg.pushIndex] = seg.pushToY;
        }
      }
      this.segments = [];
      if (this.state?.won) {
        this.celebrate();
        this.onArrive?.();
      }
      return;
    }
    const seg = this.segments[idx];
    const t = easeInOut((elapsed - idx * STEP_MS) / STEP_MS);
    this.catX = lerp(seg.fromX, seg.toX, t);
    this.catY = lerp(seg.fromY, seg.toY, t);
    this.catFacing = seg.facing;
    // 之前的推动已经完成
    for (let i = 0; i < idx; i++) {
      const done = this.segments[i];
      if (done.pushIndex !== null) {
        this.movX[done.pushIndex] = done.pushToX;
        this.movY[done.pushIndex] = done.pushToY;
      }
    }
    if (seg.pushIndex !== null) {
      this.movX[seg.pushIndex] = lerp(seg.pushFromX, seg.pushToX, t);
      this.movY[seg.pushIndex] = lerp(seg.pushFromY, seg.pushToY, t);
    }
  }

  /* ---------------- 缓存：地砖 ---------------- */

  private buildFloorCache(): void {
    const level = this.level;
    if (!level) return;
    const c = this.cell;
    const w = level.width * c;
    const h = level.height * c;
    const canvas = this.floorCache ?? document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * this.dpr));
    canvas.height = Math.max(1, Math.round(h * this.dpr));
    const g = canvas.getContext('2d');
    if (!g) return;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const idx = y * level.width + x;
        const tile = level.tiles[idx];
        const px = x * c;
        const py = y * c;
        if (tile === 'eave') {
          this.paintWood(g, px, py, c, x, y);
        } else {
          this.paintBrick(g, px, py, c, x, y);
        }
      }
    }
    this.floorCache = canvas;
  }

  private paintBrick(g: CanvasRenderingContext2D, px: number, py: number, c: number, x: number, y: number): void {
    const v = hash2(x, y);
    const base = [240 - v * 10, 224 - v * 12, 190 - v * 14];
    g.fillStyle = '#D3BC93';
    g.fillRect(px, py, c, c);
    const inset = Math.max(1, c * 0.035);
    g.fillStyle = `rgb(${base[0] | 0},${base[1] | 0},${base[2] | 0})`;
    roundRect(g, px + inset, py + inset, c - inset * 2, c - inset * 2, c * 0.06);
    g.fill();
    // 砖面高光与暗角
    const grad = g.createLinearGradient(px, py, px + c, py + c);
    grad.addColorStop(0, 'rgba(255,255,255,0.18)');
    grad.addColorStop(1, 'rgba(120,90,50,0.08)');
    g.fillStyle = grad;
    roundRect(g, px + inset, py + inset, c - inset * 2, c - inset * 2, c * 0.06);
    g.fill();
    // 细小斑点
    g.fillStyle = 'rgba(140,110,70,0.16)';
    for (let k = 0; k < 4; k++) {
      const sx = px + inset * 2 + hash2(x, y, k + 3) * (c - inset * 4);
      const sy = py + inset * 2 + hash2(x, y, k + 11) * (c - inset * 4);
      g.beginPath();
      g.arc(sx, sy, Math.max(0.6, c * 0.012), 0, Math.PI * 2);
      g.fill();
    }
    if (hash2(x, y, 7) > 0.78) {
      g.strokeStyle = 'rgba(130,100,60,0.22)';
      g.lineWidth = Math.max(0.6, c * 0.012);
      g.beginPath();
      const sx = px + c * (0.2 + hash2(x, y, 8) * 0.3);
      const sy = py + c * (0.25 + hash2(x, y, 9) * 0.4);
      g.moveTo(sx, sy);
      g.lineTo(sx + c * 0.14, sy + c * 0.08);
      g.lineTo(sx + c * 0.22, sy + c * 0.02);
      g.stroke();
    }
  }

  private paintWood(g: CanvasRenderingContext2D, px: number, py: number, c: number, x: number, y: number): void {
    g.fillStyle = '#B88F62';
    g.fillRect(px, py, c, c);
    const planks = 3;
    for (let k = 0; k < planks; k++) {
      const v = hash2(x, y, k + 21);
      g.fillStyle = `rgb(${(226 - v * 16) | 0},${(190 - v * 14) | 0},${(146 - v * 12) | 0})`;
      const ph = c / planks;
      g.fillRect(px, py + k * ph + 0.6, c, ph - 1.2);
      g.strokeStyle = 'rgba(110,70,35,0.25)';
      g.lineWidth = 0.8;
      const seam = px + c * (0.2 + hash2(x, y, k + 31) * 0.6);
      g.beginPath();
      g.moveTo(seam, py + k * ph + 1);
      g.lineTo(seam, py + (k + 1) * ph - 1);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(px, py, c, c * 0.08);
  }

  /* ---------------- 主绘制 ---------------- */

  public render(now: number): void {
    const dt = Math.min(0.05, Math.max(0, (now - this.lastNow) / 1000));
    this.lastNow = now;
    const level = this.level;
    const state = this.state;
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.cssW, this.cssH);
    if (!level || !state) return;

    this.advanceSegments(now);
    const phaseF = this.currentPhaseFloat(now);
    const c = this.cell;
    const bw = level.width * c;
    const bh = level.height * c;
    const ox = this.ox;
    const oy = this.oy;

    // 台基与投影
    g.save();
    g.fillStyle = 'rgba(90,60,30,0.16)';
    roundRect(g, ox - c * 0.06, oy + c * 0.18, bw + c * 0.12, bh + c * 0.3, c * 0.18);
    g.fill();
    g.fillStyle = '#A88E66';
    roundRect(g, ox - c * 0.08, oy - c * 0.08, bw + c * 0.16, bh + c * 0.36, c * 0.14);
    g.fill();
    const side = g.createLinearGradient(0, oy + bh, 0, oy + bh + c * 0.28);
    side.addColorStop(0, '#9A8058');
    side.addColorStop(1, '#7E6744');
    g.fillStyle = side;
    g.fillRect(ox - c * 0.08, oy + bh + c * 0.02, bw + c * 0.16, c * 0.24);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(ox - c * 0.08, oy + bh + c * 0.02, bw + c * 0.16, 1);
    g.restore();

    // 地砖
    if (this.floorCache) g.drawImage(this.floorCache, ox, oy, bw, bh);

    // 水面（在光照之前，以便同样受日光影响）
    this.drawWater(g, now);

    // 日光
    const pLo = Math.floor(phaseF);
    const pHi = Math.min(4, pLo + 1);
    const pt = phaseF - pLo;
    g.save();
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = mixRgb(SUN_TINT[pLo], SUN_TINT[pHi], pt);
    g.fillRect(ox, oy, bw, bh);
    g.restore();

    // 阴影
    this.drawShade(g, phaseF);

    // 太阳一侧的暖光
    this.drawSunGlow(g, phaseF);

    // 叠加提示：即将晒到、预览轮廓、路径
    this.drawOverlayUnder(g, now);

    // 屋檐
    this.drawRoof(g);

    // 云（半透明）画在摆件与猫之下，保证主角始终清晰
    for (const cloud of level.def.clouds ?? []) {
      this.drawCloudPuff(
        g,
        cloud.cells,
        cloud.origin[0] + cloud.drift[0] * phaseF,
        cloud.origin[1] + cloud.drift[1] * phaseF,
        cloud.drift,
        now,
      );
    }

    // 摆件 + 猫 + 鱼干架，按行排序
    this.drawActors(g, now);

    this.drawOverlayOver(g, now);

    // 粒子与飘字
    this.updateParticles(g, dt, now);
    this.drawFloaters(g, now);
  }

  private drawWater(g: CanvasRenderingContext2D, now: number): void {
    const level = this.level as ParsedLevel;
    const c = this.cell;
    for (let i = 0; i < level.tiles.length; i++) {
      if (level.tiles[i] !== 'water') continue;
      const x = i % level.width;
      const y = Math.floor(i / level.width);
      const px = this.ox + x * c;
      const py = this.oy + y * c;
      const n = (dx: number, dy: number) => {
        const nx = x + dx;
        const ny = y + dy;
        return (
          nx >= 0 && ny >= 0 && nx < level.width && ny < level.height &&
          level.tiles[ny * level.width + nx] === 'water'
        );
      };
      const inset = c * 0.08;
      const l = n(-1, 0) ? 0 : inset;
      const r = n(1, 0) ? 0 : inset;
      const t = n(0, -1) ? 0 : inset;
      const b = n(0, 1) ? 0 : inset;
      // 池沿
      g.fillStyle = '#8F9AA0';
      g.fillRect(px, py, c, c);
      const grad = g.createLinearGradient(px, py, px, py + c);
      grad.addColorStop(0, '#4E8C93');
      grad.addColorStop(1, '#6EAAA8');
      g.fillStyle = grad;
      g.fillRect(px + l, py + t, c - l - r, c - t - b);
      // 内侧暗边
      g.fillStyle = 'rgba(20,50,60,0.25)';
      if (t > 0) g.fillRect(px + l, py + t, c - l - r, c * 0.06);
      if (l > 0) g.fillRect(px + l, py + t, c * 0.05, c - t - b);
      // 涟漪
      g.save();
      g.beginPath();
      g.rect(px + l, py + t, c - l - r, c - t - b);
      g.clip();
      const phase = ((now / 1000) * 0.45 + hash2(x, y, 41)) % 1;
      g.strokeStyle = `rgba(220,245,240,${0.45 * (1 - phase)})`;
      g.lineWidth = Math.max(0.8, c * 0.02);
      g.beginPath();
      g.ellipse(
        px + c * (0.3 + hash2(x, y, 42) * 0.4),
        py + c * (0.35 + hash2(x, y, 43) * 0.3),
        c * 0.08 + phase * c * 0.24,
        (c * 0.08 + phase * c * 0.24) * 0.55,
        0,
        0,
        Math.PI * 2,
      );
      g.stroke();
      // 荷叶
      if (hash2(x, y, 44) > 0.45) {
        const lx = px + c * (0.25 + hash2(x, y, 45) * 0.5);
        const ly = py + c * (0.25 + hash2(x, y, 46) * 0.5);
        const lr = c * (0.13 + hash2(x, y, 47) * 0.06);
        const rot = hash2(x, y, 48) * Math.PI * 2;
        g.fillStyle = '#5E9A52';
        g.beginPath();
        g.moveTo(lx, ly);
        g.arc(lx, ly, lr, rot + 0.35, rot + Math.PI * 2 - 0.05);
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(40,80,40,0.45)';
        g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(lx, ly);
        g.lineTo(lx + Math.cos(rot + 1.5) * lr * 0.9, ly + Math.sin(rot + 1.5) * lr * 0.9);
        g.moveTo(lx, ly);
        g.lineTo(lx + Math.cos(rot + 3.4) * lr * 0.9, ly + Math.sin(rot + 3.4) * lr * 0.9);
        g.stroke();
        if (hash2(x, y, 49) > 0.6) {
          // 荷花
          const fx = lx + lr * 0.9;
          const fy = ly - lr * 0.4;
          g.fillStyle = '#F4B6C2';
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * Math.PI * 2;
            g.beginPath();
            g.ellipse(fx + Math.cos(a) * c * 0.035, fy + Math.sin(a) * c * 0.035, c * 0.04, c * 0.025, a, 0, Math.PI * 2);
            g.fill();
          }
          g.fillStyle = '#F6D66B';
          g.beginPath();
          g.arc(fx, fy, c * 0.02, 0, Math.PI * 2);
          g.fill();
        }
      }
      // 锦鲤
      if (hash2(x, y, 50) > 0.55) {
        const tt = (now / 1000) * 0.35 + hash2(x, y, 51) * 10;
        const kx = px + c * 0.5 + Math.cos(tt) * c * 0.26;
        const ky = py + c * 0.5 + Math.sin(tt * 1.3) * c * 0.2;
        const heading = Math.atan2(Math.cos(tt * 1.3) * 1.3 * 0.2, -Math.sin(tt) * 0.26);
        g.save();
        g.translate(kx, ky);
        g.rotate(heading);
        g.fillStyle = 'rgba(232,110,50,0.85)';
        g.beginPath();
        g.ellipse(0, 0, c * 0.08, c * 0.03, 0, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.moveTo(-c * 0.07, 0);
        g.lineTo(-c * 0.12, -c * 0.03);
        g.lineTo(-c * 0.12, c * 0.03);
        g.closePath();
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.8)';
        g.beginPath();
        g.ellipse(c * 0.02, 0, c * 0.025, c * 0.015, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      g.restore();
    }
  }

  /** 影子遮罩：以低分辨率绘制再平滑放大，得到柔和的半影 */
  private drawShade(g: CanvasRenderingContext2D, phaseF: number): void {
    const level = this.level as ParsedLevel;
    const res = ShadeBoardRenderer.MASK_RES;
    const m = this.maskCtx;
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
    m.setTransform(res, 0, 0, res, 0, 0);
    m.fillStyle = '#000';

    const pLo = Math.floor(phaseF);
    const pHi = Math.min(4, pLo + 1);
    const pt = phaseF - pLo;
    const angle = lerp(PHASE_ANGLE[pLo], PHASE_ANGLE[pHi], pt);
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    const castFrom = (cx: number, cy: number, height: number) => {
      const len = lerp(
        shadowLength(pLo as PhaseIndex, height),
        shadowLength(pHi as PhaseIndex, height),
        pt,
      );
      if (len <= 0.001) return;
      // 从物体所在格的边缘起，宽一格、长 len 格；绕物体中心旋转
      const near = 0.5;
      const far = len + 0.5;
      const px = -sinA * 0.5;
      const py = cosA * 0.5;
      m.beginPath();
      m.moveTo(cx + px + cosA * near, cy + py + sinA * near);
      m.lineTo(cx + px + cosA * far, cy + py + sinA * far);
      m.lineTo(cx - px + cosA * far, cy - py + sinA * far);
      m.lineTo(cx - px + cosA * near, cy - py + sinA * near);
      m.closePath();
      m.fill();
    };

    for (let i = 0; i < level.tiles.length; i++) {
      const x = i % level.width;
      const y = Math.floor(i / level.width);
      if (level.tiles[i] === 'eave') m.fillRect(x, y, 1, 1);
      const kind = level.fixtures[i];
      if (kind) castFrom(x + 0.5, y + 0.5, FIXTURES[kind].height);
    }
    for (let k = 0; k < this.movX.length; k++) {
      castFrom(this.movX[k] + 0.5, this.movY[k] + 0.5, MOVABLES[level.movableKinds[k]].height);
    }
    // 云影随时辰平移
    for (const cloud of level.def.clouds ?? []) {
      const offX = cloud.origin[0] + cloud.drift[0] * phaseF;
      const offY = cloud.origin[1] + cloud.drift[1] * phaseF;
      for (const [dx, dy] of cloud.cells) m.fillRect(offX + dx, offY + dy, 1, 1);
    }

    const s = this.shadeCtx;
    const sw = this.shadeCanvas.width;
    const sh = this.shadeCanvas.height;
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.globalCompositeOperation = 'source-over';
    s.clearRect(0, 0, sw, sh);
    s.imageSmoothingEnabled = true;
    s.drawImage(this.maskCanvas, 0, 0, sw, sh);
    s.globalCompositeOperation = 'source-in';
    // 日光色已整体叠过一遍，这里按日光色反向补偿，让阴影保持冷色而不被暖光染成褐色
    const sun = SUN_TINT[pLo].map((v, k) => lerp(v, SUN_TINT[pHi][k], pt));
    const shade = SHADE_TINT[pLo].map((v, k) => lerp(v, SHADE_TINT[pHi][k], pt));
    s.fillStyle = `rgb(${shade.map((v, k) => Math.min(255, Math.round((v * 255) / Math.max(1, sun[k])))).join(',')})`;
    s.fillRect(0, 0, sw, sh);
    s.globalCompositeOperation = 'source-over';

    const bw = level.width * this.cell;
    const bh = level.height * this.cell;
    g.save();
    g.globalCompositeOperation = 'multiply';
    g.drawImage(this.shadeCanvas, this.ox, this.oy, bw, bh);
    g.restore();

  }

  private drawCloudPuff(
    g: CanvasRenderingContext2D,
    cells: ReadonlyArray<readonly [number, number]>,
    offX: number,
    offY: number,
    drift: readonly [number, number],
    now: number,
  ): void {
    const level = this.level as ParsedLevel;
    const c = this.cell;
    // 云画在离屏层上：先描边再填白，得到一整块柔和的云朵轮廓，再半透明叠到棋盘上
    const pad = c * 1.5;
    const lw = (level.width + 3) * c;
    const lh = (level.height + 3) * c;
    const layer = this.cloudCanvas;
    const pw = Math.max(1, Math.round(lw * this.dpr));
    const ph = Math.max(1, Math.round(lh * this.dpr));
    if (layer.width !== pw || layer.height !== ph) {
      layer.width = pw;
      layer.height = ph;
    }
    const lg = layer.getContext('2d');
    if (!lg) return;
    lg.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    lg.clearRect(0, 0, lw, lh);
    const bob = Math.sin(now / 900) * c * 0.02;
    const puffs: Array<[number, number, number]> = [];
    let sx = 0;
    let sy = 0;
    for (const [dx, dy] of cells) {
      const px = pad + (offX + dx + 0.5) * c;
      const py = pad + (offY + dy + 0.5) * c + bob;
      puffs.push([px - c * 0.2, py + c * 0.08, c * 0.25]);
      puffs.push([px + c * 0.18, py + c * 0.1, c * 0.23]);
      puffs.push([px - c * 0.02, py - c * 0.1, c * 0.3]);
      sx += offX + dx + 0.5;
      sy += offY + dy + 0.5;
    }
    const path = () => {
      lg.beginPath();
      for (const [x, y, r] of puffs) {
        lg.moveTo(x + r, y);
        lg.arc(x, y, r, 0, Math.PI * 2);
      }
    };
    path();
    lg.strokeStyle = '#C9D4EA';
    lg.lineWidth = Math.max(2, c * 0.06);
    lg.stroke();
    path();
    lg.fillStyle = '#FFFFFF';
    lg.fill();
    // 云底一抹淡蓝
    lg.globalCompositeOperation = 'source-atop';
    const grad = lg.createLinearGradient(0, pad + (offY + 0.2) * c, 0, pad + (offY + 1.2) * c);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(190,205,235,0.6)');
    lg.fillStyle = grad;
    lg.fillRect(0, 0, lw, lh);
    lg.globalCompositeOperation = 'source-over';
    // 飘移方向
    const n = cells.length;
    const ax = pad + (sx / n) * c;
    const ay = pad + (sy / n) * c + bob;
    const ang = Math.atan2(drift[1], drift[0]);
    lg.save();
    lg.translate(ax, ay);
    lg.rotate(ang);
    lg.fillStyle = 'rgba(31,42,85,0.75)';
    lg.beginPath();
    lg.moveTo(c * 0.2, 0);
    lg.lineTo(c * 0.02, -c * 0.11);
    lg.lineTo(c * 0.02, c * 0.11);
    lg.closePath();
    lg.fill();
    lg.fillRect(-c * 0.14, -c * 0.03, c * 0.18, c * 0.06);
    lg.restore();

    g.save();
    g.globalAlpha = 0.5;
    g.drawImage(layer, this.ox - pad, this.oy - pad, lw, lh);
    g.restore();
  }

  private drawSunGlow(g: CanvasRenderingContext2D, phaseF: number): void {
    const level = this.level as ParsedLevel;
    const c = this.cell;
    const bw = level.width * c;
    const bh = level.height * c;
    // 太阳方位：东(右) → 南(下) → 西(左)，与影子方向相反
    const pLo = Math.floor(phaseF);
    const pHi = Math.min(4, pLo + 1);
    const angle = lerp(PHASE_ANGLE[pLo], PHASE_ANGLE[pHi], phaseF - pLo) + Math.PI;
    const cx = this.ox + bw / 2 + Math.cos(angle) * bw * 0.75;
    const cy = this.oy + bh / 2 + Math.sin(angle) * bh * 0.75;
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(bw, bh) * 0.95);
    const warm = phaseF < 1 || phaseF > 3 ? 0.22 : 0.12;
    grad.addColorStop(0, `rgba(255,214,140,${warm})`);
    grad.addColorStop(1, 'rgba(255,214,140,0)');
    g.save();
    g.globalCompositeOperation = 'screen';
    g.fillStyle = grad;
    g.fillRect(this.ox, this.oy, bw, bh);
    g.restore();
  }

  private drawRoof(g: CanvasRenderingContext2D): void {
    const level = this.level as ParsedLevel;
    if (this.roofBand <= 0) return;
    const c = this.cell;
    let x = 0;
    while (x < level.width) {
      if (level.tiles[x] !== 'eave') {
        x++;
        continue;
      }
      let end = x;
      while (end + 1 < level.width && level.tiles[end + 1] === 'eave') end++;
      const px = this.ox + x * c - c * 0.08;
      const pw = (end - x + 1) * c + c * 0.16;
      const top = this.oy - this.roofBand - c * 0.08;
      const bandH = this.roofBand + c * 0.06;
      // 檐下投影
      const sh = g.createLinearGradient(0, this.oy, 0, this.oy + c * 0.3);
      sh.addColorStop(0, 'rgba(30,30,50,0.35)');
      sh.addColorStop(1, 'rgba(30,30,50,0)');
      g.fillStyle = sh;
      g.fillRect(px + c * 0.08, this.oy, pw - c * 0.16, c * 0.3);
      // 屋面
      const roof = g.createLinearGradient(0, top, 0, top + bandH);
      roof.addColorStop(0, '#5B606B');
      roof.addColorStop(1, '#42464F');
      g.fillStyle = roof;
      roundRect(g, px, top, pw, bandH, c * 0.06);
      g.fill();
      // 瓦垄
      g.strokeStyle = 'rgba(255,255,255,0.12)';
      g.lineWidth = Math.max(1, c * 0.02);
      const step = c * 0.2;
      for (let lx = px + step * 0.5; lx < px + pw; lx += step) {
        g.beginPath();
        g.moveTo(lx, top + 2);
        g.lineTo(lx, top + bandH - c * 0.08);
        g.stroke();
      }
      // 瓦当
      g.fillStyle = '#353841';
      for (let lx = px + step * 0.5; lx < px + pw; lx += step) {
        g.beginPath();
        g.arc(lx, top + bandH - c * 0.04, c * 0.06, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = 'rgba(255,255,255,0.18)';
      for (let lx = px + step * 0.5; lx < px + pw; lx += step) {
        g.beginPath();
        g.arc(lx, top + bandH - c * 0.04, c * 0.025, 0, Math.PI * 2);
        g.fill();
      }
      // 朱红檐枋
      g.fillStyle = '#9E3B26';
      g.fillRect(px + c * 0.04, top - c * 0.05, pw - c * 0.08, c * 0.06);
      x = end + 1;
    }
  }

  /* ---------------- 叠加提示 ---------------- */

  private cellRect(idx: number): [number, number, number] {
    const level = this.level as ParsedLevel;
    return [this.ox + (idx % level.width) * this.cell, this.oy + Math.floor(idx / level.width) * this.cell, this.cell];
  }

  private drawOverlayUnder(g: CanvasRenderingContext2D, now: number): void {
    const level = this.level as ParsedLevel;
    const o = this.overlay;
    const c = this.cell;

    if (o.previewShade && !this.isAnimating(now)) {
      // 即将被晒到的格子：暖橙薄涂
      if (o.currentShade) {
        g.save();
        g.strokeStyle = 'rgba(245,140,50,0.85)';
        g.lineWidth = Math.max(1.5, c * 0.035);
        for (let i = 0; i < o.previewShade.length; i++) {
          if (o.currentShade[i] && !o.previewShade[i] && this.walkableTile(i)) {
            const [px, py] = this.cellRect(i);
            g.save();
            g.beginPath();
            g.rect(px + 2, py + 2, c - 4, c - 4);
            g.clip();
            g.beginPath();
            for (let k = -c; k < c; k += c * 0.2) {
              g.moveTo(px + k, py + c);
              g.lineTo(px + k + c, py);
            }
            g.stroke();
            g.restore();
          }
        }
        g.restore();
      }
      // 下一时辰阴影的虚线轮廓
      g.save();
      g.strokeStyle = 'rgba(30,40,90,0.85)';
      g.lineWidth = Math.max(1.5, c * 0.04);
      g.setLineDash([c * 0.12, c * 0.08]);
      g.lineDashOffset = -(now / 40) % 100;
      g.beginPath();
      const W = level.width;
      for (let i = 0; i < o.previewShade.length; i++) {
        if (!o.previewShade[i]) continue;
        const x = i % W;
        const y = Math.floor(i / W);
        const px = this.ox + x * c;
        const py = this.oy + y * c;
        if (y === 0 || !o.previewShade[i - W]) {
          g.moveTo(px, py);
          g.lineTo(px + c, py);
        }
        if (y === level.height - 1 || !o.previewShade[i + W]) {
          g.moveTo(px, py + c);
          g.lineTo(px + c, py + c);
        }
        if (x === 0 || !o.previewShade[i - 1]) {
          g.moveTo(px, py);
          g.lineTo(px, py + c);
        }
        if (x === W - 1 || !o.previewShade[i + 1]) {
          g.moveTo(px + c, py);
          g.lineTo(px + c, py + c);
        }
      }
      g.stroke();
      g.restore();
      // 安全等待格：小爪印
      if (o.previewSafe) {
        for (let i = 0; i < o.previewSafe.length; i++) {
          if (!o.previewSafe[i] || !this.walkableTile(i)) continue;
          const [px, py] = this.cellRect(i);
          drawPaw(g, px + c * 0.5, py + c * 0.5, c * 0.16, 'rgba(255,255,255,0.75)');
        }
      }
    }

    // 提示路径：金色爪印
    if (o.hintPath && o.hintPath.length > 0) {
      const pulse = 0.65 + 0.35 * Math.sin(now / 220);
      o.hintPath.forEach((cell, i) => {
        const [px, py] = this.cellRect(cell);
        const last = i === o.hintPath!.length - 1;
        g.fillStyle = `rgba(255,200,80,${(last ? 0.5 : 0.28) * pulse})`;
        roundRect(g, px + c * 0.12, py + c * 0.12, c * 0.76, c * 0.76, c * 0.18);
        g.fill();
        drawPaw(g, px + c * 0.5, py + c * 0.5, c * 0.14, `rgba(150,90,10,${0.8 * pulse})`);
      });
    }

    // 悬停格
    if (o.hover !== null && o.hover >= 0 && !o.path) {
      const [px, py] = this.cellRect(o.hover);
      g.strokeStyle = 'rgba(43,33,24,0.35)';
      g.lineWidth = 1.5;
      roundRect(g, px + 2, py + 2, c - 4, c - 4, c * 0.12);
      g.stroke();
    }

    // 触发失败的闪烁格
    const ft = (now - this.flashStart) / 600;
    if (this.flashCell >= 0 && ft < 1) {
      const [px, py] = this.cellRect(this.flashCell);
      const a = (1 - ft) * 0.55;
      g.fillStyle = this.flashKind === 'hot' ? `rgba(230,90,30,${a})` : `rgba(60,50,40,${a * 0.6})`;
      roundRect(g, px + 2, py + 2, c - 4, c - 4, c * 0.12);
      g.fill();
    }
  }

  private walkableTile(i: number): boolean {
    const level = this.level as ParsedLevel;
    const t = level.tiles[i];
    return (t === 'floor' || t === 'eave') && !this.state?.movables.includes(i);
  }

  private drawOverlayOver(g: CanvasRenderingContext2D, now: number): void {
    const o = this.overlay;
    const c = this.cell;
    const level = this.level as ParsedLevel;
    if (!o.path || o.path.length === 0 || this.isAnimating(now)) return;
    const color =
      o.pathKind === 'hot'
        ? '#C2410C'
        : o.pathKind === 'blocked'
          ? '#78716C'
          : '#1F2A55';
    // 路径虚线
    g.save();
    g.strokeStyle = color;
    g.globalAlpha = 0.75;
    g.lineWidth = Math.max(2, c * 0.05);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.setLineDash([c * 0.02, c * 0.12]);
    g.beginPath();
    g.moveTo(this.ox + (this.catX + 0.5) * c, this.oy + (this.catY + 0.5) * c);
    for (const cell of o.path) {
      const [px, py] = this.cellRect(cell);
      g.lineTo(px + c * 0.5, py + c * 0.5);
    }
    g.stroke();
    g.restore();
    // 目标环
    const target = o.path[o.path.length - 1];
    const [tx, ty] = this.cellRect(target);
    const pulse = 1 + Math.sin(now / 180) * 0.06;
    const pending = o.pendingTarget !== null && o.pendingTarget === target;
    g.save();
    g.strokeStyle = color;
    g.lineWidth = Math.max(2, c * (pending ? 0.06 : 0.045));
    g.beginPath();
    g.arc(tx + c / 2, ty + c / 2, c * 0.34 * pulse, 0, Math.PI * 2);
    g.stroke();
    if (pending) {
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fill();
    }
    g.restore();
    // 推动箭头
    if (o.pushFrom !== null && o.pushTo !== null) {
      const [fx, fy] = this.cellRect(o.pushFrom);
      const [ttx, tty] = this.cellRect(o.pushTo);
      const ax = fx + c / 2;
      const ay = fy + c / 2;
      const bx = ttx + c / 2;
      const by = tty + c / 2;
      const ang = Math.atan2(by - ay, bx - ax);
      g.save();
      g.strokeStyle = '#1F2A55';
      g.fillStyle = '#1F2A55';
      g.lineWidth = Math.max(2, c * 0.05);
      g.globalAlpha = 0.85;
      g.beginPath();
      g.moveTo(ax + Math.cos(ang) * c * 0.3, ay + Math.sin(ang) * c * 0.3);
      g.lineTo(bx - Math.cos(ang) * c * 0.12, by - Math.sin(ang) * c * 0.12);
      g.stroke();
      g.translate(bx, by);
      g.rotate(ang);
      g.beginPath();
      g.moveTo(c * 0.06, 0);
      g.lineTo(-c * 0.12, -c * 0.1);
      g.lineTo(-c * 0.12, c * 0.1);
      g.closePath();
      g.fill();
      g.restore();
      // 目的地的虚框
      g.save();
      g.strokeStyle = 'rgba(31,42,85,0.6)';
      g.setLineDash([c * 0.06, c * 0.06]);
      g.lineWidth = 1.5;
      roundRect(g, ttx + c * 0.12, tty + c * 0.12, c * 0.76, c * 0.76, c * 0.18);
      g.stroke();
      g.restore();
    }
    if (o.pathKind === 'hot') {
      drawPaw(g, tx + c * 0.5, ty + c * 0.5, c * 0.14, 'rgba(194,65,12,0.9)');
    }
    void level;
  }

  /* ---------------- 摆件与角色 ---------------- */

  private drawActors(g: CanvasRenderingContext2D, now: number): void {
    const level = this.level as ParsedLevel;
    type Drawable = { y: number; order: number; draw: () => void };
    const list: Drawable[] = [];
    const c = this.cell;
    const phaseF = this.currentPhaseFloat(now);
    for (let i = 0; i < level.fixtures.length; i++) {
      const kind = level.fixtures[i];
      if (!kind) continue;
      const x = i % level.width;
      const y = Math.floor(i / level.width);
      list.push({ y, order: 0, draw: () => this.drawFixture(g, kind, x, y, now, phaseF) });
    }
    for (let k = 0; k < this.movX.length; k++) {
      const mx = this.movX[k];
      const my = this.movY[k];
      const kind = level.movableKinds[k];
      list.push({
        y: my,
        order: 0,
        draw: () => (kind === 'pot' ? this.drawPot(g, mx, my, k) : this.drawVat(g, mx, my, now)),
      });
    }
    const gx = level.goal % level.width;
    const gy = Math.floor(level.goal / level.width);
    list.push({ y: gy, order: -1, draw: () => this.drawFishRack(g, gx, gy, now) });
    list.push({ y: this.catY, order: 1, draw: () => this.drawCat(g, now) });
    list.sort((a, b) => a.y - b.y || a.order - b.order);
    for (const d of list) d.draw();
    void c;
  }

  private drawFixture(
    g: CanvasRenderingContext2D,
    kind: FixtureKind,
    x: number,
    y: number,
    now: number,
    phaseF: number,
  ): void {
    const c = this.cell;
    const cx = this.ox + (x + 0.5) * c;
    const cy = this.oy + (y + 0.5) * c;
    const level = this.level as ParsedLevel;
    // 光照侧：太阳在影子反方向
    const pLo = Math.floor(phaseF);
    const pHi = Math.min(4, pLo + 1);
    const sunAngle = lerp(PHASE_ANGLE[pLo], PHASE_ANGLE[pHi], phaseF - pLo) + Math.PI;
    const lightX = Math.cos(sunAngle);
    switch (kind) {
      case 'stool': {
        contactShadow(g, cx, cy + c * 0.18, c * 0.3, c * 0.1);
        const top = cy - c * 0.08;
        g.fillStyle = '#8F8A80';
        g.beginPath();
        g.ellipse(cx, top + c * 0.2, c * 0.28, c * 0.13, 0, 0, Math.PI);
        g.lineTo(cx - c * 0.28, top);
        g.ellipse(cx, top, c * 0.28, c * 0.13, 0, Math.PI, 0, true);
        g.closePath();
        g.fill();
        g.fillStyle = '#7A756C';
        g.fillRect(cx - c * 0.28, top + c * 0.08, c * 0.56, c * 0.03);
        const tg = g.createLinearGradient(cx - c * 0.28 * lightX, top, cx + c * 0.28 * lightX, top);
        tg.addColorStop(0, '#D2CDC3');
        tg.addColorStop(1, '#ADA89E');
        g.fillStyle = tg;
        g.beginPath();
        g.ellipse(cx, top, c * 0.28, c * 0.13, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(90,85,78,0.4)';
        g.lineWidth = 1;
        g.beginPath();
        g.ellipse(cx, top, c * 0.18, c * 0.08, 0, 0, Math.PI * 2);
        g.stroke();
        break;
      }
      case 'hedge': {
        contactShadow(g, cx, cy + c * 0.2, c * 0.4, c * 0.1);
        g.fillStyle = '#A65A35';
        roundRect(g, cx - c * 0.4, cy - c * 0.08, c * 0.8, c * 0.36, c * 0.05);
        g.fill();
        g.fillStyle = '#C0714A';
        roundRect(g, cx - c * 0.4, cy - c * 0.14, c * 0.8, c * 0.12, c * 0.04);
        g.fill();
        g.strokeStyle = 'rgba(80,40,20,0.35)';
        g.lineWidth = 1;
        for (let k = 1; k < 4; k++) {
          g.beginPath();
          g.moveTo(cx - c * 0.4 + k * c * 0.2, cy - c * 0.02);
          g.lineTo(cx - c * 0.4 + k * c * 0.2, cy + c * 0.26);
          g.stroke();
        }
        const bushes = [
          [-0.24, -0.2, 0.17],
          [0.0, -0.26, 0.19],
          [0.24, -0.2, 0.17],
        ];
        for (const [bx, by, br] of bushes) {
          g.fillStyle = '#4E7F3E';
          g.beginPath();
          g.arc(cx + bx * c, cy + by * c, br * c, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#6E9F52';
          g.beginPath();
          g.arc(cx + bx * c - lightX * c * 0.04 * -1, cy + by * c - c * 0.04, br * c * 0.6, 0, Math.PI * 2);
          g.fill();
        }
        const flowers = ['#F2A1B3', '#FFFFFF', '#F2A1B3', '#FFF3B0'];
        for (let k = 0; k < 6; k++) {
          g.fillStyle = flowers[k % flowers.length];
          g.beginPath();
          g.arc(
            cx + (hash2(x, y, k + 60) - 0.5) * c * 0.62,
            cy - c * 0.2 + (hash2(x, y, k + 70) - 0.5) * c * 0.2,
            c * 0.03,
            0,
            Math.PI * 2,
          );
          g.fill();
        }
        break;
      }
      case 'lantern': {
        contactShadow(g, cx, cy + c * 0.26, c * 0.26, c * 0.08);
        const stone = '#A9A49A';
        const dark = '#7C776E';
        g.fillStyle = dark;
        g.fillRect(cx - c * 0.2, cy + c * 0.12, c * 0.4, c * 0.14);
        g.fillStyle = stone;
        g.fillRect(cx - c * 0.2, cy + c * 0.1, c * 0.4, c * 0.05);
        g.fillStyle = dark;
        g.fillRect(cx - c * 0.06, cy - c * 0.12, c * 0.12, c * 0.24);
        g.fillStyle = stone;
        g.fillRect(cx - c * 0.17, cy - c * 0.18, c * 0.34, c * 0.06);
        g.fillStyle = '#B5B0A6';
        g.fillRect(cx - c * 0.15, cy - c * 0.42, c * 0.3, c * 0.24);
        const glow = 0.6 + 0.15 * Math.sin(now / 600 + x);
        g.fillStyle = `rgba(255,205,110,${glow})`;
        g.fillRect(cx - c * 0.08, cy - c * 0.37, c * 0.16, c * 0.13);
        g.fillStyle = '#6E6A62';
        g.beginPath();
        g.moveTo(cx - c * 0.28, cy - c * 0.42);
        g.quadraticCurveTo(cx, cy - c * 0.5, cx + c * 0.28, cy - c * 0.42);
        g.lineTo(cx + c * 0.1, cy - c * 0.58);
        g.lineTo(cx - c * 0.1, cy - c * 0.58);
        g.closePath();
        g.fill();
        g.fillStyle = '#8D887F';
        g.beginPath();
        g.arc(cx, cy - c * 0.6, c * 0.05, 0, Math.PI * 2);
        g.fill();
        break;
      }
      case 'wall': {
        const W = level.width;
        const idx = y * W + x;
        const left = x > 0 && level.fixtures[idx - 1] === 'wall';
        const right = x < W - 1 && level.fixtures[idx + 1] === 'wall';
        const below = y < level.height - 1 && level.fixtures[idx + W] === 'wall';
        const x0 = left ? this.ox + x * c : cx - c * 0.4;
        const x1 = right ? this.ox + (x + 1) * c : cx + c * 0.4;
        const faceTop = cy - c * 0.34;
        const faceBottom = below ? this.oy + (y + 1) * c : cy + c * 0.3;
        contactShadow(g, (x0 + x1) / 2, cy + c * 0.3, (x1 - x0) / 2, c * 0.06);
        // 墙身
        g.fillStyle = '#F4EFE4';
        g.fillRect(x0, faceTop + c * 0.18, x1 - x0, faceBottom - faceTop - c * 0.18);
        g.fillStyle = 'rgba(160,145,120,0.25)';
        g.fillRect(x0, faceBottom - c * 0.08, x1 - x0, c * 0.08);
        // 墙顶（俯视看到的宽度）
        g.fillStyle = '#E7E0D2';
        g.fillRect(x0, faceTop + c * 0.06, x1 - x0, c * 0.14);
        // 黛瓦压顶
        g.fillStyle = '#4B4F58';
        roundRect(g, x0 - (left ? 0 : c * 0.04), faceTop - c * 0.04, x1 - x0 + (left ? 0 : c * 0.04) + (right ? 0 : c * 0.04), c * 0.14, c * 0.03);
        g.fill();
        g.fillStyle = '#6B707A';
        g.fillRect(x0, faceTop - c * 0.03, x1 - x0, c * 0.03);
        g.fillStyle = '#353841';
        for (let lx = x0 + c * 0.08; lx < x1; lx += c * 0.16) {
          g.beginPath();
          g.arc(lx, faceTop + c * 0.1, c * 0.035, 0, Math.PI * 2);
          g.fill();
        }
        // 漏窗：独立的影壁或墙段的偶数格
        if (!below && (!left || x % 2 === 0)) {
          const wx = cx;
          const wy = cy + c * 0.08;
          const wr = c * 0.13;
          g.save();
          g.fillStyle = '#5C574E';
          g.beginPath();
          g.arc(wx, wy, wr + c * 0.025, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#E4DCCB';
          g.beginPath();
          g.arc(wx, wy, wr, 0, Math.PI * 2);
          g.fill();
          g.clip();
          g.strokeStyle = '#6E685E';
          g.lineWidth = Math.max(1, c * 0.018);
          g.beginPath();
          for (let k = -2; k <= 2; k++) {
            g.moveTo(wx - wr + k * wr * 0.5, wy - wr);
            g.lineTo(wx + wr + k * wr * 0.5, wy + wr);
            g.moveTo(wx + wr + k * wr * 0.5, wy - wr);
            g.lineTo(wx - wr + k * wr * 0.5, wy + wr);
          }
          g.stroke();
          g.restore();
        }
        break;
      }
      case 'rock': {
        contactShadow(g, cx, cy + c * 0.26, c * 0.34, c * 0.09);
        g.fillStyle = '#7F888E';
        g.beginPath();
        g.moveTo(cx - c * 0.34, cy + c * 0.26);
        g.bezierCurveTo(cx - c * 0.42, cy - c * 0.02, cx - c * 0.22, cy - c * 0.18, cx - c * 0.18, cy - c * 0.36);
        g.bezierCurveTo(cx - c * 0.1, cy - c * 0.56, cx + c * 0.12, cy - c * 0.5, cx + c * 0.14, cy - c * 0.3);
        g.bezierCurveTo(cx + c * 0.3, cy - c * 0.34, cx + c * 0.4, cy - c * 0.08, cx + c * 0.34, cy + c * 0.26);
        g.closePath();
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.beginPath();
        g.ellipse(cx + lightX * c * 0.1, cy - c * 0.2, c * 0.12, c * 0.2, 0.3, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#4E565B';
        g.beginPath();
        g.ellipse(cx - c * 0.08, cy - c * 0.22, c * 0.05, c * 0.07, 0.4, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.ellipse(cx + c * 0.14, cy + c * 0.02, c * 0.06, c * 0.045, -0.2, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.ellipse(cx - c * 0.16, cy + c * 0.1, c * 0.035, c * 0.05, 0, 0, Math.PI * 2);
        g.fill();
        // 苔藓
        g.fillStyle = 'rgba(110,150,80,0.55)';
        g.beginPath();
        g.ellipse(cx - c * 0.2, cy + c * 0.22, c * 0.1, c * 0.04, 0, 0, Math.PI * 2);
        g.fill();
        break;
      }
      case 'tree': {
        contactShadow(g, cx, cy + c * 0.3, c * 0.18, c * 0.07);
        g.fillStyle = '#6B4A2F';
        g.fillRect(cx - c * 0.06, cy - c * 0.05, c * 0.12, c * 0.36);
        const sway = Math.sin(now / 1400 + x * 1.7 + y) * c * 0.012;
        const clusters = [
          [0, -0.22, 0.34, '#2E5E36'],
          [-0.2, -0.12, 0.22, '#356B3C'],
          [0.21, -0.14, 0.22, '#356B3C'],
          [-0.1, -0.36, 0.2, '#3F7A45'],
          [0.12, -0.34, 0.21, '#3F7A45'],
          [0.0, -0.18, 0.2, '#4A8A4C'],
        ] as const;
        for (const [dx, dy, r, col] of clusters) {
          g.fillStyle = col;
          g.beginPath();
          g.arc(cx + dx * c + sway, cy + dy * c, r * c, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = 'rgba(160,210,120,0.35)';
        g.beginPath();
        g.arc(cx + lightX * c * 0.12 + sway, cy - c * 0.34, c * 0.12, 0, Math.PI * 2);
        g.fill();
        // 槐花
        g.fillStyle = 'rgba(250,245,215,0.9)';
        for (let k = 0; k < 7; k++) {
          g.beginPath();
          g.arc(
            cx + (hash2(x, y, k + 80) - 0.5) * c * 0.6 + sway,
            cy - c * 0.2 + (hash2(x, y, k + 90) - 0.5) * c * 0.4,
            c * 0.022,
            0,
            Math.PI * 2,
          );
          g.fill();
        }
        break;
      }
      case 'bamboo': {
        contactShadow(g, cx, cy + c * 0.28, c * 0.3, c * 0.08);
        const stalks = [-0.22, -0.07, 0.08, 0.22];
        stalks.forEach((sx, k) => {
          const bx = cx + sx * c;
          const topY = cy - c * (0.52 - (k % 2) * 0.08);
          const sway = Math.sin(now / 1100 + k + x) * c * 0.015;
          g.strokeStyle = k % 2 ? '#5E8A3E' : '#6E9A4A';
          g.lineWidth = c * 0.05;
          g.beginPath();
          g.moveTo(bx, cy + c * 0.28);
          g.lineTo(bx + sway, topY);
          g.stroke();
          g.strokeStyle = '#4F7A35';
          g.lineWidth = 1;
          for (let ny = cy + c * 0.15; ny > topY; ny -= c * 0.18) {
            g.beginPath();
            g.moveTo(bx - c * 0.03, ny);
            g.lineTo(bx + c * 0.03, ny);
            g.stroke();
          }
          g.fillStyle = '#5B8F3E';
          for (let l = 0; l < 3; l++) {
            const ly = topY + l * c * 0.12;
            const dir = (l + k) % 2 ? 1 : -1;
            g.beginPath();
            g.ellipse(bx + dir * c * 0.1 + sway, ly, c * 0.11, c * 0.03, dir * 0.5, 0, Math.PI * 2);
            g.fill();
          }
        });
        break;
      }
    }
  }

  private drawPot(g: CanvasRenderingContext2D, mx: number, my: number, k: number): void {
    const c = this.cell;
    const cx = this.ox + (mx + 0.5) * c;
    const cy = this.oy + (my + 0.5) * c;
    contactShadow(g, cx, cy + c * 0.24, c * 0.26, c * 0.08);
    // 盆身
    g.fillStyle = '#B85D30';
    g.beginPath();
    g.moveTo(cx - c * 0.26, cy - c * 0.06);
    g.lineTo(cx + c * 0.26, cy - c * 0.06);
    g.lineTo(cx + c * 0.19, cy + c * 0.24);
    g.quadraticCurveTo(cx, cy + c * 0.3, cx - c * 0.19, cy + c * 0.24);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,200,160,0.25)';
    g.beginPath();
    g.moveTo(cx - c * 0.2, cy - c * 0.02);
    g.lineTo(cx - c * 0.12, cy - c * 0.02);
    g.lineTo(cx - c * 0.1, cy + c * 0.2);
    g.lineTo(cx - c * 0.15, cy + c * 0.2);
    g.closePath();
    g.fill();
    // 盆沿
    g.fillStyle = '#D9824E';
    g.beginPath();
    g.ellipse(cx, cy - c * 0.07, c * 0.29, c * 0.1, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#5A3A26';
    g.beginPath();
    g.ellipse(cx, cy - c * 0.07, c * 0.23, c * 0.07, 0, 0, Math.PI * 2);
    g.fill();
    // 植物：茉莉 / 月季交替
    const leaves = 7;
    for (let l = 0; l < leaves; l++) {
      const a = (l / leaves) * Math.PI * 2 + k;
      g.fillStyle = l % 2 ? '#4F8A3E' : '#3F7533';
      g.beginPath();
      g.ellipse(
        cx + Math.cos(a) * c * 0.12,
        cy - c * 0.17 + Math.sin(a) * c * 0.06,
        c * 0.1,
        c * 0.045,
        a,
        0,
        Math.PI * 2,
      );
      g.fill();
    }
    const flower = k % 2 ? '#FFFFFF' : '#E2453C';
    for (let f = 0; f < 3; f++) {
      const a = f * 2.1 + k;
      g.fillStyle = flower;
      g.beginPath();
      g.arc(cx + Math.cos(a) * c * 0.08, cy - c * 0.2 + Math.sin(a) * c * 0.04, c * 0.04, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#F6D66B';
      g.beginPath();
      g.arc(cx + Math.cos(a) * c * 0.08, cy - c * 0.2 + Math.sin(a) * c * 0.04, c * 0.014, 0, Math.PI * 2);
      g.fill();
    }
  }

  private drawVat(g: CanvasRenderingContext2D, mx: number, my: number, now: number): void {
    const c = this.cell;
    const cx = this.ox + (mx + 0.5) * c;
    const cy = this.oy + (my + 0.5) * c;
    contactShadow(g, cx, cy + c * 0.3, c * 0.34, c * 0.09);
    const body = g.createLinearGradient(cx - c * 0.36, 0, cx + c * 0.36, 0);
    body.addColorStop(0, '#2E2D33');
    body.addColorStop(0.35, '#55535C');
    body.addColorStop(1, '#2A292E');
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(cx - c * 0.3, cy - c * 0.22);
    g.bezierCurveTo(cx - c * 0.44, cy, cx - c * 0.34, cy + c * 0.28, cx, cy + c * 0.31);
    g.bezierCurveTo(cx + c * 0.34, cy + c * 0.28, cx + c * 0.44, cy, cx + c * 0.3, cy - c * 0.22);
    g.closePath();
    g.fill();
    // 釉面高光
    g.strokeStyle = 'rgba(255,255,255,0.22)';
    g.lineWidth = Math.max(1, c * 0.03);
    g.beginPath();
    g.arc(cx - c * 0.06, cy + c * 0.02, c * 0.25, Math.PI * 0.85, Math.PI * 1.15);
    g.stroke();
    // 缸口
    g.fillStyle = '#6A6870';
    g.beginPath();
    g.ellipse(cx, cy - c * 0.23, c * 0.32, c * 0.12, 0, 0, Math.PI * 2);
    g.fill();
    const water = g.createLinearGradient(0, cy - c * 0.33, 0, cy - c * 0.13);
    water.addColorStop(0, '#4D8C95');
    water.addColorStop(1, '#79B5B1');
    g.fillStyle = water;
    g.beginPath();
    g.ellipse(cx, cy - c * 0.23, c * 0.26, c * 0.09, 0, 0, Math.PI * 2);
    g.fill();
    // 小荷叶随水晃
    const bob = Math.sin(now / 900 + mx * 3) * c * 0.01;
    g.fillStyle = '#5E9A52';
    g.beginPath();
    g.moveTo(cx + c * 0.06, cy - c * 0.24 + bob);
    g.ellipse(cx + c * 0.06, cy - c * 0.24 + bob, c * 0.09, c * 0.045, 0, 0.4, Math.PI * 2 - 0.1);
    g.closePath();
    g.fill();
  }

  private drawFishRack(g: CanvasRenderingContext2D, x: number, y: number, now: number): void {
    const c = this.cell;
    const cx = this.ox + (x + 0.5) * c;
    const cy = this.oy + (y + 0.5) * c;
    const won = this.state?.won ?? false;
    // 地面光圈
    const pulse = 0.5 + 0.5 * Math.sin(now / 500);
    g.fillStyle = `rgba(255,214,120,${0.18 + pulse * 0.14})`;
    g.beginPath();
    g.ellipse(cx, cy + c * 0.22, c * 0.38, c * 0.14, 0, 0, Math.PI * 2);
    g.fill();
    // 竹架
    g.strokeStyle = '#B48E48';
    g.lineWidth = Math.max(1.5, c * 0.04);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx - c * 0.32, cy + c * 0.28);
    g.lineTo(cx - c * 0.24, cy - c * 0.3);
    g.moveTo(cx + c * 0.32, cy + c * 0.28);
    g.lineTo(cx + c * 0.24, cy - c * 0.3);
    g.stroke();
    g.strokeStyle = '#C9A45C';
    g.beginPath();
    g.moveTo(cx - c * 0.34, cy - c * 0.28);
    g.lineTo(cx + c * 0.34, cy - c * 0.28);
    g.stroke();
    g.lineCap = 'butt';
    // 鱼干
    const fishCount = won ? 2 : 3;
    for (let k = 0; k < fishCount; k++) {
      const fx = cx + (k - (fishCount - 1) / 2) * c * 0.2;
      const swing = Math.sin(now / 700 + k * 1.3) * 0.08;
      g.save();
      g.translate(fx, cy - c * 0.28);
      g.rotate(swing);
      g.strokeStyle = 'rgba(90,70,40,0.7)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, c * 0.06);
      g.stroke();
      g.fillStyle = '#C9B48E';
      g.beginPath();
      g.ellipse(0, c * 0.2, c * 0.055, c * 0.14, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#A88F66';
      g.beginPath();
      g.moveTo(0, c * 0.32);
      g.lineTo(-c * 0.05, c * 0.4);
      g.lineTo(c * 0.05, c * 0.4);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.beginPath();
      g.ellipse(-c * 0.015, c * 0.17, c * 0.015, c * 0.08, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#2B2118';
      g.beginPath();
      g.arc(0, c * 0.1, c * 0.012, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    // 闪光
    if (!won) {
      const sp = (now / 1000 + x * 0.3) % 2;
      if (sp < 0.6) {
        const a = Math.sin((sp / 0.6) * Math.PI);
        drawSparkle(g, cx + c * 0.22, cy - c * 0.1, c * 0.08 * a, `rgba(255,236,170,${a})`);
      }
    }
  }

  private drawCat(g: CanvasRenderingContext2D, now: number): void {
    const c = this.cell;
    const t = now / 1000;
    const walking = this.segments.length > 0;
    let cx = this.ox + (this.catX + 0.5) * c;
    let cy = this.oy + (this.catY + 0.5) * c;
    // 行走时的小跳
    let hop = 0;
    if (walking) {
      const frac = ((now - this.segmentStart) % STEP_MS) / STEP_MS;
      hop = Math.sin(frac * Math.PI) * c * 0.07;
    }
    // 拒绝时左右摇
    const rt = (now - this.refuseStart) / 420;
    if (rt >= 0 && rt < 1) cx += Math.sin(rt * Math.PI * 6) * c * 0.05 * (1 - rt);
    // 胜利跳跃
    const ct = (now - this.celebrateStart) / 900;
    if (ct >= 0 && ct < 1) hop += Math.abs(Math.sin(ct * Math.PI * 2)) * c * 0.18 * (1 - ct);
    const breathe = walking ? 1 : 1 + Math.sin(t * 2.4) * 0.018;
    const facing = this.catFacing;
    const flip = facing === 'left' ? -1 : 1;

    // 接地阴影
    contactShadow(g, cx, cy + c * 0.24, c * 0.24 * (1 - hop / c), c * 0.07);
    cy -= hop;

    g.save();
    g.translate(cx, cy);
    g.scale(flip, 1);
    const fur = '#EE9A45';
    const stripe = '#C8712A';
    const outline = 'rgba(107,63,31,0.9)';
    const lw = Math.max(1, c * 0.02);

    // 尾巴
    const tailSway = Math.sin(t * (walking ? 7 : 2.2)) * 0.35;
    g.strokeStyle = outline;
    g.lineCap = 'round';
    g.lineWidth = c * 0.1 + lw * 2;
    const tailBaseX = facing === 'up' ? 0 : -c * 0.16;
    const tailBaseY = facing === 'up' ? c * 0.16 : c * 0.12;
    const tailPath = () => {
      g.beginPath();
      g.moveTo(tailBaseX, tailBaseY);
      if (facing === 'up') {
        g.quadraticCurveTo(c * 0.18 * Math.sin(tailSway * 2), c * 0.32, c * 0.12 + tailSway * c * 0.2, c * 0.38);
      } else {
        g.quadraticCurveTo(
          -c * 0.36,
          c * 0.1,
          -c * 0.3 + tailSway * c * 0.1,
          -c * 0.12 + Math.abs(tailSway) * c * 0.05,
        );
      }
    };
    tailPath();
    g.stroke();
    g.strokeStyle = fur;
    g.lineWidth = c * 0.1;
    tailPath();
    g.stroke();
    g.lineCap = 'butt';

    // 身体
    g.fillStyle = fur;
    g.strokeStyle = outline;
    g.lineWidth = lw;
    g.beginPath();
    g.ellipse(0, c * 0.1, c * 0.2 * breathe, c * 0.17, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    // 背部条纹
    g.strokeStyle = stripe;
    g.lineWidth = Math.max(1, c * 0.025);
    for (let k = -1; k <= 1; k++) {
      g.beginPath();
      g.arc(k * c * 0.07, c * (facing === 'up' ? 0.04 : 0.02), c * 0.08, Math.PI * 1.15, Math.PI * 1.55);
      g.stroke();
    }
    // 胸前白毛（背对时不显示）
    if (facing !== 'up') {
      g.fillStyle = '#FFF4E6';
      g.beginPath();
      g.ellipse(c * (facing === 'down' ? 0 : 0.06), c * 0.14, c * 0.09, c * 0.1, 0, 0, Math.PI * 2);
      g.fill();
    }
    // 前爪
    g.fillStyle = '#FFF4E6';
    g.strokeStyle = outline;
    g.lineWidth = lw;
    const pawShift = walking ? Math.sin(((now - this.segmentStart) / STEP_MS) * Math.PI) * c * 0.03 : 0;
    for (const px of [-0.08, 0.08]) {
      g.beginPath();
      g.ellipse(px * c + (px > 0 ? pawShift : -pawShift), c * 0.25, c * 0.05, c * 0.035, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }

    // 头
    const headY = -c * 0.12;
    const headX = facing === 'down' || facing === 'up' ? 0 : c * 0.04;
    g.fillStyle = fur;
    g.strokeStyle = outline;
    // 耳朵
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(headX + side * c * 0.17, headY - c * 0.04);
      g.lineTo(headX + side * c * 0.16, headY - c * 0.24);
      g.lineTo(headX + side * c * 0.03, headY - c * 0.14);
      g.closePath();
      g.fill();
      g.stroke();
      if (facing !== 'up') {
        g.fillStyle = '#F4B3A6';
        g.beginPath();
        g.moveTo(headX + side * c * 0.145, headY - c * 0.07);
        g.lineTo(headX + side * c * 0.145, headY - c * 0.19);
        g.lineTo(headX + side * c * 0.06, headY - c * 0.13);
        g.closePath();
        g.fill();
        g.fillStyle = fur;
      }
    }
    g.beginPath();
    g.ellipse(headX, headY, c * 0.2, c * 0.165, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    // 额头「王」纹
    g.strokeStyle = stripe;
    g.lineWidth = Math.max(1, c * 0.022);
    for (let k = -1; k <= 1; k++) {
      g.beginPath();
      g.moveTo(headX + k * c * 0.045, headY - c * 0.15);
      g.lineTo(headX + k * c * 0.035, headY - c * (facing === 'up' ? 0.02 : 0.08));
      g.stroke();
    }
    if (facing === 'up') {
      // 后脑勺多两道纹
      g.beginPath();
      g.moveTo(headX - c * 0.14, headY + c * 0.02);
      g.lineTo(headX - c * 0.08, headY + c * 0.04);
      g.moveTo(headX + c * 0.14, headY + c * 0.02);
      g.lineTo(headX + c * 0.08, headY + c * 0.04);
      g.stroke();
    } else {
      const look = facing === 'down' ? 0 : c * 0.035;
      const blinking = (t % 4.2) < 0.12;
      // 眼睛
      for (const ex of [-0.075, 0.075]) {
        const exx = headX + ex * c + look;
        if (blinking) {
          g.strokeStyle = INK;
          g.lineWidth = Math.max(1, c * 0.02);
          g.beginPath();
          g.moveTo(exx - c * 0.03, headY + c * 0.0);
          g.lineTo(exx + c * 0.03, headY + c * 0.0);
          g.stroke();
        } else {
          g.fillStyle = INK;
          g.beginPath();
          g.ellipse(exx, headY, c * 0.03, c * 0.038, 0, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#FFFFFF';
          g.beginPath();
          g.arc(exx + c * 0.01, headY - c * 0.014, c * 0.011, 0, Math.PI * 2);
          g.fill();
        }
      }
      // 鼻子与嘴
      g.fillStyle = '#E98A8A';
      g.beginPath();
      g.moveTo(headX + look - c * 0.022, headY + c * 0.05);
      g.lineTo(headX + look + c * 0.022, headY + c * 0.05);
      g.lineTo(headX + look, headY + c * 0.075);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(107,63,31,0.8)';
      g.lineWidth = Math.max(0.8, c * 0.012);
      g.beginPath();
      g.moveTo(headX + look, headY + c * 0.075);
      g.quadraticCurveTo(headX + look - c * 0.02, headY + c * 0.1, headX + look - c * 0.04, headY + c * 0.085);
      g.moveTo(headX + look, headY + c * 0.075);
      g.quadraticCurveTo(headX + look + c * 0.02, headY + c * 0.1, headX + look + c * 0.04, headY + c * 0.085);
      g.stroke();
      // 腮红
      g.fillStyle = 'rgba(240,120,110,0.35)';
      for (const bx of [-0.12, 0.12]) {
        g.beginPath();
        g.ellipse(headX + bx * c + look * 0.6, headY + c * 0.05, c * 0.035, c * 0.02, 0, 0, Math.PI * 2);
        g.fill();
      }
      // 胡须
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = Math.max(0.6, c * 0.008);
      for (const side of [-1, 1]) {
        for (let k = 0; k < 2; k++) {
          g.beginPath();
          g.moveTo(headX + look + side * c * 0.1, headY + c * (0.05 + k * 0.025));
          g.lineTo(headX + look + side * c * 0.24, headY + c * (0.03 + k * 0.045));
          g.stroke();
        }
      }
    }
    g.restore();

    // 拒绝时冒问号
    if (rt >= 0 && rt < 1.6) {
      const a = Math.min(1, (1.6 - rt) * 1.5);
      g.save();
      g.globalAlpha = a;
      g.fillStyle = '#FFFFFF';
      g.strokeStyle = 'rgba(43,33,24,0.6)';
      g.lineWidth = 1.2;
      const bx = cx + c * 0.26;
      const by = cy - c * 0.42;
      g.beginPath();
      g.arc(bx, by, c * 0.12, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = INK;
      g.font = `700 ${Math.round(c * 0.16)}px "Noto Sans SC", sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('?', bx, by + 1);
      g.restore();
    }
  }

  /* ---------------- 粒子 ---------------- */

  private updateParticles(g: CanvasRenderingContext2D, dt: number, now: number): void {
    const level = this.level as ParsedLevel;
    const c = this.cell;
    // 偶尔从树上飘下一片叶子
    if (now > this.nextLeafAt) {
      this.nextLeafAt = now + 2200 + Math.random() * 2600;
      const trees: number[] = [];
      level.fixtures.forEach((f, i) => {
        if (f === 'tree' || f === 'bamboo') trees.push(i);
      });
      if (trees.length > 0) {
        const t = trees[Math.floor(Math.random() * trees.length)];
        this.emit({
          kind: 'leaf',
          x: (t % level.width) + 0.5 + (Math.random() - 0.5) * 0.4,
          y: Math.floor(t / level.width) + 0.1,
          vx: 0.25 + Math.random() * 0.2,
          vy: 0.18,
          maxLife: 4,
          size: 0.07,
          spin: 1.5,
          color: Math.random() > 0.5 ? '#6E9F52' : '#C9B04A',
        });
      }
    }
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      const lifeT = 1 - p.life / p.maxLife;
      if (p.kind === 'leaf') {
        p.x += (p.vx + Math.sin(now / 400 + p.angle) * 0.25) * dt;
        p.y += p.vy * dt;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      if (p.kind === 'petal' || p.kind === 'spark') p.vy += 2.2 * dt;
      if (p.kind === 'dust') {
        p.vx *= 0.92;
        p.vy *= 0.92;
      }
      p.angle += p.spin * dt;
      const px = this.ox + p.x * c;
      const py = this.oy + p.y * c;
      const alpha = p.kind === 'leaf' ? Math.min(1, p.life) * 0.9 : 1 - lifeT;
      g.save();
      g.globalAlpha = Math.max(0, alpha);
      g.translate(px, py);
      g.rotate(p.angle);
      g.fillStyle = p.color;
      if (p.kind === 'steam') {
        g.beginPath();
        g.arc(0, 0, p.size * c * (1 + lifeT), 0, Math.PI * 2);
        g.fill();
      } else if (p.kind === 'spark') {
        drawSparkle(g, 0, 0, p.size * c, p.color);
      } else if (p.kind === 'leaf' || p.kind === 'petal') {
        g.beginPath();
        g.ellipse(0, 0, p.size * c, p.size * c * 0.45, 0, 0, Math.PI * 2);
        g.fill();
      } else {
        g.beginPath();
        g.arc(0, 0, p.size * c, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }
  }

  private drawFloaters(g: CanvasRenderingContext2D, now: number): void {
    const c = this.cell;
    this.floaters = this.floaters.filter((f) => now - f.start < 900);
    for (const f of this.floaters) {
      const t = (now - f.start) / 900;
      g.save();
      g.globalAlpha = 1 - easeOut(t) * 0.9;
      g.font = `700 ${Math.round(c * 0.24)}px "Noto Sans SC", sans-serif`;
      g.textAlign = 'center';
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(255,250,240,0.9)';
      const px = this.ox + f.x * c;
      const py = this.oy + (f.y - easeOut(t) * 0.4) * c;
      g.strokeText(f.text, px, py);
      g.fillStyle = f.color;
      g.fillText(f.text, px, py);
      g.restore();
    }
  }

  public dispose(): void {
    this.level = null;
    this.state = null;
    this.floorCache = null;
    this.onStep = null;
    this.onArrive = null;
    this.maskCanvas.width = 0;
    this.shadeCanvas.width = 0;
    this.cloudCanvas.width = 0;
  }
}

/* ------------------------------------------------------------------ */
/* 小工具                                                               */
/* ------------------------------------------------------------------ */

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + rr, y);
  g.lineTo(x + w - rr, y);
  g.quadraticCurveTo(x + w, y, x + w, y + rr);
  g.lineTo(x + w, y + h - rr);
  g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  g.lineTo(x + rr, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - rr);
  g.lineTo(x, y + rr);
  g.quadraticCurveTo(x, y, x + rr, y);
  g.closePath();
}

function contactShadow(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number): void {
  g.fillStyle = 'rgba(40,30,60,0.22)';
  g.beginPath();
  g.ellipse(cx, cy, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
  g.fill();
}

function drawPaw(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(cx, cy + r * 0.35, r * 0.62, r * 0.5, 0, 0, Math.PI * 2);
  g.fill();
  const toes: Array<[number, number]> = [
    [-0.62, -0.25],
    [-0.22, -0.62],
    [0.22, -0.62],
    [0.62, -0.25],
  ];
  for (const [tx, ty] of toes) {
    g.beginPath();
    g.ellipse(cx + tx * r, cy + ty * r, r * 0.22, r * 0.27, 0, 0, Math.PI * 2);
    g.fill();
  }
}

function drawSparkle(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  if (r <= 0.2) return;
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y - r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.quadraticCurveTo(x, y, x, y + r);
  g.quadraticCurveTo(x, y, x - r, y);
  g.quadraticCurveTo(x, y, x, y - r);
  g.closePath();
  g.fill();
}

