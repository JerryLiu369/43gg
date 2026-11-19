import {
  BOARD_BOTTOM,
  BOARD_LEFT,
  BOARD_RIGHT,
  BOARD_TOP,
  CRUCIBLE_Y,
  ENEMY_DEFS,
  LAUNCHER_X,
  LAUNCHER_Y,
  ORB_DEFS,
  PEG_META,
  WORLD_H,
  WORLD_W,
} from './content.ts';
import { computeAimPreview, getActiveOrb } from './engine.ts';
import type {
  AimPreviewResult,
  EnemyInstance,
  ForgeRunState,
  PegEntity,
  SimEventBatch,
} from './types.ts';

interface SparkParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  gravity: number;
}

const PARTICLE_POOL_SIZE = 280;
const AMBIENT_EMBER_COUNT = 28;

export class EmberForgeRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private pool: SparkParticle[];
  private poolCursor = 0;
  private ambientEmbers: Array<{ x: number; y: number; vy: number; r: number; phase: number }>;
  private dpr = 1;
  private logicalScale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private cachedAimKey = '';
  private cachedAimPreview: AimPreviewResult | null = null;
  private backdropCanvas: HTMLCanvasElement | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not initialize 2D context for Ember Forge');
    }
    this.ctx = context;

    this.pool = Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 2,
      life: 0,
      maxLife: 1,
      color: '#F59E0B',
      gravity: 240,
    }));

    this.ambientEmbers = Array.from({ length: AMBIENT_EMBER_COUNT }, (_, i) => ({
      x: BOARD_LEFT + ((i * 83) % (BOARD_RIGHT - BOARD_LEFT)),
      y: BOARD_TOP + ((i * 57) % (BOARD_BOTTOM - BOARD_TOP)),
      vy: 14 + (i % 5) * 6,
      r: 1.1 + (i % 3) * 0.65,
      phase: i * 0.7,
    }));
  }

  resize(cssWidth: number, cssHeight: number): void {
    const w = Math.max(240, Math.floor(cssWidth));
    const h = Math.max(300, Math.floor(cssHeight));
    this.dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);

    const scaleX = w / WORLD_W;
    const scaleY = h / WORLD_H;
    this.logicalScale = Math.min(scaleX, scaleY);
    this.offsetX = (w - WORLD_W * this.logicalScale) * 0.5;
    this.offsetY = (h - WORLD_H * this.logicalScale) * 0.5;
    this.rebuildBackdropCache();
  }

  private rebuildBackdropCache(): void {
    if (typeof document === 'undefined') return;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    if (cw <= 0 || ch <= 0) return;
    if (!this.backdropCanvas) {
      this.backdropCanvas = document.createElement('canvas');
    }
    this.backdropCanvas.width = cw;
    this.backdropCanvas.height = ch;
    const bctx = this.backdropCanvas.getContext('2d');
    if (!bctx) return;

    // Full-viewport seamless forged-iron kiln fill
    const outerGrad = bctx.createLinearGradient(0, 0, 0, ch);
    outerGrad.addColorStop(0, '#161110');
    outerGrad.addColorStop(0.28, '#130F0E');
    outerGrad.addColorStop(0.82, '#1A1310');
    outerGrad.addColorStop(1, '#2C150D');
    bctx.fillStyle = outerGrad;
    bctx.fillRect(0, 0, cw, ch);

    bctx.save();
    bctx.setTransform(
      this.dpr * this.logicalScale,
      0,
      0,
      this.dpr * this.logicalScale,
      this.dpr * this.offsetX,
      this.dpr * this.offsetY,
    );

    // Kiln cavity inner warmth
    const bgGrad = bctx.createLinearGradient(0, 0, 0, WORLD_H);
    bgGrad.addColorStop(0, '#171211');
    bgGrad.addColorStop(0.24, '#141110');
    bgGrad.addColorStop(0.82, '#1A1310');
    bgGrad.addColorStop(1, '#2D160E');
    bctx.fillStyle = bgGrad;
    bctx.fillRect(BOARD_LEFT, 0, BOARD_RIGHT - BOARD_LEFT, WORLD_H);

    // Subtle forged bronze geometric kiln arch & framing lines
    bctx.strokeStyle = 'rgba(180, 140, 100, 0.16)';
    bctx.lineWidth = 1.2;
    bctx.strokeRect(BOARD_LEFT, BOARD_TOP, BOARD_RIGHT - BOARD_LEFT, BOARD_BOTTOM - BOARD_TOP);

    // Architectural decorative rivets along bronze kiln walls
    bctx.fillStyle = 'rgba(194, 149, 107, 0.28)';
    for (let y = BOARD_TOP + 28; y < BOARD_BOTTOM - 20; y += 56) {
      bctx.beginPath();
      bctx.arc(BOARD_LEFT - 8, y, 2.3, 0, Math.PI * 2);
      bctx.arc(BOARD_RIGHT + 8, y, 2.3, 0, Math.PI * 2);
      bctx.fill();
    }

    // Subtle concentric kiln medallion watermark
    bctx.strokeStyle = 'rgba(245, 158, 11, 0.055)';
    bctx.lineWidth = 1.2;
    bctx.beginPath();
    bctx.arc(WORLD_W / 2, 396, 156, 0, Math.PI * 2);
    bctx.stroke();
    bctx.beginPath();
    bctx.arc(WORLD_W / 2, 396, 102, 0, Math.PI * 2);
    bctx.stroke();

    // Enemy gallery divider ledge
    bctx.fillStyle = '#211A17';
    bctx.fillRect(BOARD_LEFT - 10, 136, BOARD_RIGHT - BOARD_LEFT + 20, 10);
    bctx.strokeStyle = '#57463B';
    bctx.lineWidth = 1.5;
    bctx.beginPath();
    bctx.moveTo(BOARD_LEFT - 10, 136);
    bctx.lineTo(BOARD_RIGHT + 10, 136);
    bctx.moveTo(BOARD_LEFT - 10, 146);
    bctx.lineTo(BOARD_RIGHT + 10, 146);
    bctx.stroke();

    // Molten bed glow along furnace floor
    const glow = bctx.createLinearGradient(0, CRUCIBLE_Y - 24, 0, WORLD_H);
    glow.addColorStop(0, 'rgba(232, 93, 38, 0)');
    glow.addColorStop(1, 'rgba(232, 93, 38, 0.34)');
    bctx.fillStyle = glow;
    bctx.fillRect(BOARD_LEFT, CRUCIBLE_Y - 24, BOARD_RIGHT - BOARD_LEFT, WORLD_H - CRUCIBLE_Y + 24);

    bctx.restore();
  }

  screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    return {
      x: (localX - this.offsetX) / Math.max(0.001, this.logicalScale),
      y: (localY - this.offsetY) / Math.max(0.001, this.logicalScale),
    };
  }

  private spawnSpark(
    x: number,
    y: number,
    vx: number,
    vy: number,
    color: string,
    size: number,
    maxLife: number,
    gravity: number = 280,
  ): void {
    const p = this.pool[this.poolCursor];
    this.poolCursor = (this.poolCursor + 1) % PARTICLE_POOL_SIZE;
    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.color = color;
    p.size = size;
    p.life = maxLife;
    p.maxLife = maxLife;
    p.gravity = gravity;
  }

  emitBurst(
    x: number,
    y: number,
    count: number,
    color: string,
    speedMin: number,
    speedMax: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const spd = speedMin + Math.random() * (speedMax - speedMin);
      this.spawnSpark(
        x,
        y,
        Math.cos(ang) * spd,
        Math.sin(ang) * spd - 35,
        i % 3 === 0 ? '#FEF3C7' : color,
        1.8 + Math.random() * 2.4,
        0.28 + Math.random() * 0.34,
      );
    }
  }

  ingestEvents(events: SimEventBatch): void {
    for (const hit of events.pegHits) {
      const meta = PEG_META[hit.kind];
      this.emitBurst(hit.x, hit.y, hit.kind === 'bronze' ? 6 : 12, meta.litColor, 65, 195);
    }
    for (const b of events.bellowsTriggered) {
      this.emitBurst(b.x, b.y, 18, '#2DD4BF', 90, 260);
    }
    for (const bomb of events.bombsDetonated) {
      this.emitBurst(bomb.x, bomb.y, 26, '#FF4D4D', 110, 320);
    }
    for (const eh of events.enemyHit) {
      this.emitBurst(
        eh.x,
        eh.y,
        eh.killed ? 28 : eh.isCrit ? 20 : 12,
        eh.isCrit ? '#FDE047' : '#F97316',
        85,
        280,
      );
    }
  }

  stepParticles(dt: number, reducedMotion: boolean): void {
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.98;
    }

    if (!reducedMotion) {
      for (const e of this.ambientEmbers) {
        e.y -= e.vy * dt;
        e.phase += dt * 1.4;
        if (e.y < BOARD_TOP) {
          e.y = BOARD_BOTTOM;
        }
      }
    }
  }

  render(
    state: ForgeRunState,
    options: {
      isTitleBackdrop?: boolean;
      highlightCritGuide?: boolean;
      reducedMotion?: boolean;
    } = {},
  ): void {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Fast blit of cached seamless kiln backdrop
    if (this.backdropCanvas) {
      ctx.drawImage(this.backdropCanvas, 0, 0);
    } else {
      ctx.fillStyle = '#141110';
      ctx.fillRect(0, 0, cw, ch);
    }

    // Apply DPR + world transform + decaying trauma^2 camera shake
    const shakeMag = options.reducedMotion ? 0 : state.shakeTrauma * state.shakeTrauma * 9;
    const shakeX = shakeMag > 0.05 ? (Math.sin(state.elapsedTime * 71) * shakeMag) : 0;
    const shakeY = shakeMag > 0.05 ? (Math.cos(state.elapsedTime * 89) * shakeMag) : 0;

    ctx.setTransform(
      this.dpr * this.logicalScale,
      0,
      0,
      this.dpr * this.logicalScale,
      this.dpr * (this.offsetX + shakeX),
      this.dpr * (this.offsetY + shakeY),
    );

    this.drawFoundryBackdrop(ctx, state, Boolean(options.reducedMotion));
    this.drawEnemyArena(ctx, state);
    this.drawCrucibleCatcher(ctx, state);
    this.drawBumpers(ctx, state);
    this.drawPegs(ctx, state, Boolean(options.highlightCritGuide));

    if (!options.isTitleBackdrop && state.phase === 'aiming') {
      this.drawAimGuide(ctx, state);
    }

    this.drawLauncher(ctx, state);
    this.drawActiveBalls(ctx, state);
    this.drawVolleys(ctx, state);
    this.drawShockwaves(ctx, state);
    this.drawParticles(ctx);
    this.drawCallouts(ctx, state);

    // Critical low-HP or player hurt vignette
    if (state.playerHitFlash > 0 || state.hp <= state.maxHp * 0.25) {
      const alpha =
        state.playerHitFlash > 0
          ? Math.min(0.42, state.playerHitFlash * 1.1)
          : 0.14 + Math.sin(state.elapsedTime * 4) * 0.05;
      const grad = ctx.createRadialGradient(
        WORLD_W / 2,
        WORLD_H / 2,
        150,
        WORLD_W / 2,
        WORLD_H / 2,
        WORLD_H * 0.65,
      );
      grad.addColorStop(0, 'rgba(220, 38, 38, 0)');
      grad.addColorStop(1, `rgba(220, 38, 38, ${alpha.toFixed(3)})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }

    ctx.restore();
  }

  private drawFoundryBackdrop(
    ctx: CanvasRenderingContext2D,
    state: ForgeRunState,
    reducedMotion: boolean,
  ): void {
    // Drifting foundry embers (dynamic layer over cached static kiln)
    if (!reducedMotion) {
      ctx.fillStyle = 'rgba(251, 146, 60, 0.28)';
      ctx.beginPath();
      for (const e of this.ambientEmbers) {
        const driftX = Math.sin(e.phase) * 9;
        ctx.moveTo(e.x + driftX + e.r, e.y);
        ctx.arc(e.x + driftX, e.y, e.r, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    // Subtle stage heat pulse if combo is high
    if (state.shotTally.hits >= 10) {
      const intensity = Math.min(0.14, (state.shotTally.hits - 8) * 0.01);
      ctx.fillStyle = `rgba(245, 158, 11, ${intensity.toFixed(3)})`;
      ctx.fillRect(BOARD_LEFT, BOARD_TOP, BOARD_RIGHT - BOARD_LEFT, BOARD_BOTTOM - BOARD_TOP);
    }
  }

  private drawEnemyArena(ctx: CanvasRenderingContext2D, state: ForgeRunState): void {
    for (const enemy of state.enemies) {
      if (enemy.dead && enemy.dyingTimer <= 0) continue;
      this.drawSingleEnemy(ctx, state, enemy);
    }
  }

  private drawSingleEnemy(
    ctx: CanvasRenderingContext2D,
    state: ForgeRunState,
    enemy: EnemyInstance,
  ): void {
    const def = ENEMY_DEFS[enemy.archetype];
    const isSelected = state.selectedEnemyUid === enemy.uid && !enemy.dead;
    const alpha = enemy.dead ? Math.max(0, enemy.dyingTimer / 0.42) : 1;
    const lungeY = enemy.attackAnim > 0 ? Math.sin((enemy.attackAnim / 0.34) * Math.PI) * 18 : 0;
    const bobY = enemy.dead ? (1 - alpha) * 14 : Math.sin(state.elapsedTime * 2.4 + enemy.x * 0.03) * 2.5;
    const cx = enemy.x;
    const cy = enemy.y + lungeY + bobY;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Target lock reticle under selected enemy
    if (isSelected) {
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, enemy.radius + 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Stylized Nuo-mask / bronze automaton body
    const r = enemy.radius;
    ctx.fillStyle = enemy.hitFlash > 0 ? '#FEF3C7' : def.color;
    ctx.strokeStyle = enemy.hitFlash > 0 ? '#FFFFFF' : def.accent;
    ctx.lineWidth = enemy.archetype === 'taotie_boss' ? 2.6 : 2;

    ctx.beginPath();
    if (enemy.archetype === 'taotie_boss') {
      // Horned Taotie bronze cauldron mask
      ctx.moveTo(cx - r * 0.95, cy - r * 0.35);
      ctx.lineTo(cx - r * 1.25, cy - r * 0.95);
      ctx.lineTo(cx - r * 0.55, cy - r * 0.72);
      ctx.lineTo(cx, cy - r * 1.02);
      ctx.lineTo(cx + r * 0.55, cy - r * 0.72);
      ctx.lineTo(cx + r * 1.25, cy - r * 0.95);
      ctx.lineTo(cx + r * 0.95, cy - r * 0.35);
      ctx.lineTo(cx + r * 0.82, cy + r * 0.75);
      ctx.lineTo(cx, cy + r * 0.95);
      ctx.lineTo(cx - r * 0.82, cy + r * 0.75);
      ctx.closePath();
    } else if (enemy.archetype === 'bronze_guard') {
      // Hexagonal heavy shield golem
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 - Math.PI / 6;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else if (enemy.archetype === 'ember_archer') {
      // Diamond sharpshooter mask
      ctx.moveTo(cx, cy - r * 1.08);
      ctx.lineTo(cx + r * 0.96, cy);
      ctx.lineTo(cx, cy + r * 0.95);
      ctx.lineTo(cx - r * 0.96, cy);
      ctx.closePath();
    } else {
      // Carved ritual mask oval with horns
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();

    // Glowing mask eyes
    ctx.fillStyle = enemy.chilled ? '#38BDF8' : enemy.bossPhase === 2 ? '#FF4D4D' : '#FDE047';
    const eyeOff = r * 0.34;
    ctx.beginPath();
    ctx.ellipse(cx - eyeOff, cy - r * 0.1, r * 0.17, r * 0.11, -0.2, 0, Math.PI * 2);
    ctx.ellipse(cx + eyeOff, cy - r * 0.1, r * 0.17, r * 0.11, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Carved bronze brow/mouth motif
    ctx.strokeStyle = 'rgba(250, 245, 238, 0.45)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.35, cy + r * 0.35);
    ctx.lineTo(cx, cy + r * 0.22);
    ctx.lineTo(cx + r * 0.35, cy + r * 0.35);
    ctx.stroke();

    if (!enemy.dead) {
      // Name + Intent tag above enemy
      const intentColor =
        enemy.intent.kind === 'attack' || enemy.intent.kind === 'heavy_attack'
          ? '#FCA5A5'
          : enemy.intent.kind === 'freeze'
            ? '#7DD3FC'
            : enemy.intent.kind === 'heal'
              ? '#6EE7B7'
              : '#93C5FD';
      const intentLabel = enemy.chilled && (enemy.intent.kind === 'attack' || enemy.intent.kind === 'heavy_attack')
        ? `霜减 ${Math.max(1, Math.round(enemy.intent.value * 0.55))}`
        : enemy.intent.label;

      ctx.font = '600 11px "Noto Sans SC", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = intentColor;
      ctx.fillText(intentLabel, cx, cy - r - 11);

      // HP Bar under enemy
      const barW = Math.max(66, r * 2.5);
      const barH = 7;
      const bx = cx - barW / 2;
      const by = cy + r + 5;
      ctx.fillStyle = '#29221F';
      ctx.fillRect(bx, by, barW, barH);
      const frac = Math.max(0, Math.min(1, enemy.hp / enemy.maxHp));
      ctx.fillStyle = enemy.archetype === 'taotie_boss' ? '#F59E0B' : '#E85D26';
      ctx.fillRect(bx, by, barW * frac, barH);
      ctx.strokeStyle = '#574940';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, barW, barH);

      // HP numeric readout + shield readout
      ctx.font = '700 10.5px "JetBrains Mono", monospace';
      ctx.fillStyle = '#FAF5EE';
      const hpText = enemy.shield > 0 ? `${enemy.hp} (+${enemy.shield}盾)` : `${enemy.hp}/${enemy.maxHp}`;
      ctx.fillText(hpText, cx, by + 16);
    }

    ctx.restore();
  }

  private drawCrucibleCatcher(ctx: CanvasRenderingContext2D, state: ForgeRunState): void {
    const w = state.crucibleWidth;
    const x = state.crucibleX - w / 2;
    const y = CRUCIBLE_Y;

    ctx.save();
    // Moving bronze rail
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(BOARD_LEFT + 12, y + 10);
    ctx.lineTo(BOARD_RIGHT - 12, y + 10);
    ctx.stroke();

    // Crucible cauldron lip
    const grad = ctx.createLinearGradient(x, y, x, y + 18);
    grad.addColorStop(0, '#F59E0B');
    grad.addColorStop(1, '#9A3412');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w - 10, y + 16);
    ctx.lineTo(x + 10, y + 16);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#FDE68A';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Label inside crucible
    ctx.font = '600 10px "Noto Sans SC", system-ui, sans-serif';
    ctx.fillStyle = '#FFFBEB';
    ctx.textAlign = 'center';
    ctx.fillText('承火金盂', state.crucibleX, y + 12);
    ctx.restore();
  }

  private drawBumpers(ctx: CanvasRenderingContext2D, state: ForgeRunState): void {
    for (const b of state.bumpers) {
      ctx.save();
      ctx.translate(b.cx, b.cy);
      ctx.rotate(b.angle);

      ctx.fillStyle = b.flashTimer > 0 ? '#FDE047' : '#3E332C';
      ctx.strokeStyle = b.flashTimer > 0 ? '#FFFBEB' : '#C2956B';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.roundRect(-b.halfLen, -b.thickness / 2, b.halfLen * 2, b.thickness, 4);
      ctx.fill();
      ctx.stroke();

      // Center pivot pin
      ctx.fillStyle = '#F59E0B';
      ctx.beginPath();
      ctx.arc(0, 0, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawPegs(
    ctx: CanvasRenderingContext2D,
    state: ForgeRunState,
    highlightCritGuide: boolean,
  ): void {
    for (const peg of state.pegs) {
      this.drawSinglePeg(ctx, state, peg, highlightCritGuide);
    }
  }

  private drawSinglePeg(
    ctx: CanvasRenderingContext2D,
    state: ForgeRunState,
    peg: PegEntity,
    highlightCritGuide: boolean,
  ): void {
    const meta = PEG_META[peg.kind];
    const r = peg.radius + (peg.flashTimer > 0 ? peg.flashTimer * 10 : 0);

    ctx.save();

    // Soft radiant halo when lit or special (lightweight concentric glow without per-frame gradient allocation)
    if (peg.lit || peg.kind !== 'bronze') {
      const outerR = peg.lit ? r * 1.85 : r * 1.48;
      const innerR = peg.lit ? r * 1.42 : r * 1.22;
      ctx.fillStyle = meta.litColor;
      ctx.globalAlpha = peg.lit ? 0.14 : 0.08;
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, outerR, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = peg.lit ? 0.24 : 0.12;
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, innerR, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Onboarding highlight ring on Crit/Mult pegs
    if (highlightCritGuide && !peg.lit && (peg.kind === 'crit' || peg.kind === 'mult')) {
      const pulse = 1 + Math.sin(state.elapsedTime * 6) * 0.16;
      ctx.strokeStyle = '#FDE047';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, (r + 7) * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Core peg body
    ctx.fillStyle = peg.frozen
      ? '#1E3A5F'
      : peg.lit
        ? meta.litColor
        : meta.baseColor;
    ctx.strokeStyle = peg.frozen
      ? '#7DD3FC'
      : peg.lit
        ? '#FFFBEB'
        : meta.rimColor;
    ctx.lineWidth = peg.lit ? 2.2 : 1.5;

    ctx.beginPath();
    ctx.arc(peg.x, peg.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Inner specular craft mark or distinct icon glyph per peg kind
    ctx.fillStyle = peg.lit ? '#1C1917' : '#FAF5EE';
    ctx.strokeStyle = peg.lit ? '#1C1917' : '#FAF5EE';
    ctx.lineWidth = 1.5;

    if (peg.frozen) {
      // Ice crystal cross
      ctx.strokeStyle = '#BAE6FD';
      ctx.beginPath();
      ctx.moveTo(peg.x - 5, peg.y);
      ctx.lineTo(peg.x + 5, peg.y);
      ctx.moveTo(peg.x, peg.y - 5);
      ctx.lineTo(peg.x, peg.y + 5);
      ctx.stroke();
    } else if (peg.kind === 'crit') {
      // 4-point bell star
      ctx.beginPath();
      ctx.moveTo(peg.x, peg.y - 5.5);
      ctx.lineTo(peg.x + 2, peg.y - 2);
      ctx.lineTo(peg.x + 5.5, peg.y);
      ctx.lineTo(peg.x + 2, peg.y + 2);
      ctx.lineTo(peg.x, peg.y + 5.5);
      ctx.lineTo(peg.x - 2, peg.y + 2);
      ctx.lineTo(peg.x - 5.5, peg.y);
      ctx.lineTo(peg.x - 2, peg.y - 2);
      ctx.closePath();
      ctx.fill();
    } else if (peg.kind === 'mult') {
      // Plus multiplier icon
      ctx.beginPath();
      ctx.moveTo(peg.x - 4.5, peg.y);
      ctx.lineTo(peg.x + 4.5, peg.y);
      ctx.moveTo(peg.x, peg.y - 4.5);
      ctx.lineTo(peg.x, peg.y + 4.5);
      ctx.stroke();
    } else if (peg.kind === 'bomb') {
      // Explosive ring core
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, 3.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (peg.kind === 'wind') {
      // Upward chevron
      ctx.beginPath();
      ctx.moveTo(peg.x - 4.5, peg.y + 2);
      ctx.lineTo(peg.x, peg.y - 3.5);
      ctx.lineTo(peg.x + 4.5, peg.y + 2);
      ctx.stroke();
    } else if (peg.kind === 'prism') {
      // Diamond split icon
      ctx.beginPath();
      ctx.moveTo(peg.x, peg.y - 5);
      ctx.lineTo(peg.x + 4.5, peg.y);
      ctx.lineTo(peg.x, peg.y + 5);
      ctx.lineTo(peg.x - 4.5, peg.y);
      ctx.closePath();
      ctx.stroke();
    } else if (peg.kind === 'shield') {
      // Shield chevron
      ctx.beginPath();
      ctx.moveTo(peg.x - 4, peg.y - 3.5);
      ctx.lineTo(peg.x + 4, peg.y - 3.5);
      ctx.lineTo(peg.x + 3.5, peg.y + 1.5);
      ctx.lineTo(peg.x, peg.y + 4.8);
      ctx.lineTo(peg.x - 3.5, peg.y + 1.5);
      ctx.closePath();
      ctx.stroke();
    } else {
      // Subtle metallic top glint on bronze peg
      ctx.fillStyle = peg.lit ? 'rgba(255,255,255,0.65)' : 'rgba(255,245,230,0.38)';
      ctx.beginPath();
      ctx.arc(peg.x - 3, peg.y - 3, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawAimGuide(ctx: CanvasRenderingContext2D, state: ForgeRunState): void {
    const timeBucket = Math.floor(state.elapsedTime * 20);
    const key = `${state.stageIndex}:${state.totalShots}:${state.activeOrbIndex}:${Math.round(state.aimAngle * 1000)}:${timeBucket}`;
    if (!this.cachedAimPreview || this.cachedAimKey !== key) {
      this.cachedAimKey = key;
      this.cachedAimPreview = computeAimPreview(state);
    }
    const preview = this.cachedAimPreview;
    const orb = getActiveOrb(state);
    const def = ORB_DEFS[orb.typeId];

    ctx.save();
    // Primary ballistic arc dots
    preview.points.forEach((pt, idx) => {
      if (idx === 0) return;
      const frac = 1 - idx / Math.max(1, preview.points.length);
      ctx.fillStyle = def.coreColor;
      ctx.globalAlpha = 0.25 + frac * 0.65;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2.2 + frac * 1.4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Impact ring & predicted first rebound vector
    if (preview.hitPoint) {
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = preview.hitPegKind ? PEG_META[preview.hitPegKind].litColor : '#FDE047';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(preview.hitPoint.x, preview.hitPoint.y, def.radius, 0, Math.PI * 2);
      ctx.stroke();

      if (preview.bouncePoints.length > 1) {
        ctx.strokeStyle = 'rgba(254, 243, 199, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(preview.bouncePoints[0].x, preview.bouncePoints[0].y);
        for (let i = 1; i < preview.bouncePoints.length; i++) {
          ctx.lineTo(preview.bouncePoints[i].x, preview.bouncePoints[i].y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  private drawLauncher(ctx: CanvasRenderingContext2D, state: ForgeRunState): void {
    const orb = getActiveOrb(state);
    const def = ORB_DEFS[orb.typeId];

    ctx.save();
    ctx.translate(LAUNCHER_X, LAUNCHER_Y);

    // Bronze turret bezel
    ctx.fillStyle = '#2B221E';
    ctx.strokeStyle = '#C2956B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 21, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Aiming barrel
    ctx.rotate(state.aimAngle);
    ctx.fillStyle = '#473830';
    ctx.strokeStyle = '#E6B88A';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(6, -6.5, 22, 13, 3);
    ctx.fill();
    ctx.stroke();

    // Loaded glowing orb preview inside launcher when aiming
    if (state.phase === 'aiming') {
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(0, 0, def.radius * 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = def.coreColor;
      ctx.beginPath();
      ctx.arc(-2, -2, def.radius * 0.36, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawActiveBalls(ctx: CanvasRenderingContext2D, state: ForgeRunState): void {
    for (const ball of state.balls) {
      if (!ball.alive) continue;
      const def = ORB_DEFS[ball.orbId];

      ctx.save();
      // Molten ribbon trail
      for (let i = 0; i < ball.trail.length; i++) {
        const pt = ball.trail[i];
        const ratio = (i + 1) / ball.trail.length;
        ctx.fillStyle = def.color;
        ctx.globalAlpha = ratio * 0.45;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, ball.radius * ratio * 0.88, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Radiant aura
      const grad = ctx.createRadialGradient(ball.x, ball.y, 2, ball.x, ball.y, ball.radius * 2.1);
      grad.addColorStop(0, def.coreColor);
      grad.addColorStop(0.5, def.color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius * 2.1, 0, Math.PI * 2);
      ctx.fill();

      // Solid molten core
      ctx.fillStyle = def.color;
      ctx.strokeStyle = def.coreColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(ball.x - ball.radius * 0.25, ball.y - ball.radius * 0.25, ball.radius * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawVolleys(ctx: CanvasRenderingContext2D, state: ForgeRunState): void {
    for (const v of state.volleys) {
      ctx.save();
      const grad = ctx.createRadialGradient(v.x, v.y, 2, v.x, v.y, 22);
      grad.addColorStop(0, '#FFFFFF');
      grad.addColorStop(0.45, v.color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(v.x, v.y, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawShockwaves(ctx: CanvasRenderingContext2D, state: ForgeRunState): void {
    for (const s of state.shockwaves) {
      const alpha = Math.max(0, s.life / s.maxLife);
      ctx.save();
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = alpha * 0.85;
      ctx.lineWidth = 2.6 * alpha + 0.8;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawCallouts(ctx: CanvasRenderingContext2D, state: ForgeRunState): void {
    ctx.save();
    ctx.textAlign = 'center';
    for (const c of state.callouts) {
      const alpha = Math.min(1, (c.life / c.maxLife) * 1.6);
      const size = Math.round(13 * c.scale);
      ctx.globalAlpha = alpha;
      ctx.font = `700 ${size}px "Noto Sans SC", "Plus Jakarta Sans", sans-serif`;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(16, 13, 12, 0.9)';
      ctx.strokeText(c.text, c.x, c.y);
      ctx.fillStyle = c.color;
      ctx.fillText(c.text, c.x, c.y);
    }
    ctx.restore();
  }
}
