import { ENEMY_ARCHETYPES, STAGES } from './content.ts';
import { computeSlashPreview, PLAYER_RADIUS } from './engine.ts';
import type {
  ArenaObstacle,
  EnemyEntity,
  InkBladeRunState,
  InkDecalCommand,
  SimulationEvents,
  StageDef,
  Vec2,
} from './types.ts';

interface PooledParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  kind: 'spark' | 'ink' | 'leaf' | 'rain' | 'ripple';
  angle: number;
  vAngle: number;
}

interface DashAfterimage {
  active: boolean;
  x: number;
  y: number;
  facing: number;
  life: number;
  maxLife: number;
  tint: string;
}

const PARTICLE_POOL_SIZE = 256;
const AFTERIMAGE_POOL_SIZE = 24;

export class InkBladeCanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private decalCanvas: HTMLCanvasElement;
  private decalCtx: CanvasRenderingContext2D;

  private cssWidth = 1280;
  private cssHeight = 800;
  private dpr = 1;

  private viewScale = 1;
  private viewOffsetX = 0;
  private viewOffsetY = 0;
  private camLeadX = 0;
  private camLeadY = 0;

  private bakedStageKey = '';
  private particles: PooledParticle[];
  private particleCursor = 0;
  private afterimages: DashAfterimage[];
  private afterimageCursor = 0;
  private ambientTimer = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('2D canvas context unavailable');
    }
    this.ctx = ctx;

    this.decalCanvas = document.createElement('canvas');
    this.decalCanvas.width = 1200;
    this.decalCanvas.height = 740;
    const dCtx = this.decalCanvas.getContext('2d');
    if (!dCtx) {
      throw new Error('Offscreen decal 2D context unavailable');
    }
    this.decalCtx = dCtx;

    this.particles = Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 3,
      life: 0,
      maxLife: 1,
      color: '#1C1917',
      kind: 'ink',
      angle: 0,
      vAngle: 0,
    }));

    this.afterimages = Array.from({ length: AFTERIMAGE_POOL_SIZE }, () => ({
      active: false,
      x: 0,
      y: 0,
      facing: 0,
      life: 0,
      maxLife: 0.25,
      tint: '#1C1917',
    }));
  }

  public resize(cssWidth: number, cssHeight: number): void {
    this.cssWidth = Math.max(320, Math.floor(cssWidth));
    this.cssHeight = Math.max(240, Math.floor(cssHeight));
    this.dpr =
      typeof window !== 'undefined'
        ? Math.min(window.devicePixelRatio || 1, 2)
        : 1;
    const targetW = Math.floor(this.cssWidth * this.dpr);
    const targetH = Math.floor(this.cssHeight * this.dpr);
    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }
  }

  public screenToWorld(clientX: number, clientY: number): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const scale = this.viewScale || 1;
    return {
      x: (sx - this.viewOffsetX) / scale,
      y: (sy - this.viewOffsetY) / scale,
    };
  }

  public resetFloorForStage(stage: StageDef, endlessLoop = 0): void {
    this.bakedStageKey = `${stage.id}_${endlessLoop}`;
    if (
      this.decalCanvas.width !== stage.arenaWidth ||
      this.decalCanvas.height !== stage.arenaHeight
    ) {
      this.decalCanvas.width = stage.arenaWidth;
      this.decalCanvas.height = stage.arenaHeight;
    }

    const g = this.decalCtx;
    const w = stage.arenaWidth;
    const h = stage.arenaHeight;

    // 1. Base Xuan-paper / Stone courtyard surface with subtle warm radial wash
    g.fillStyle = stage.palette.groundPrimary;
    g.fillRect(0, 0, w, h);

    const wash = g.createRadialGradient(
      w * 0.5,
      h * 0.5,
      80,
      w * 0.5,
      h * 0.5,
      w * 0.62,
    );
    wash.addColorStop(0, 'rgba(255, 253, 248, 0.36)');
    wash.addColorStop(1, 'rgba(28, 25, 23, 0.07)');
    g.fillStyle = wash;
    g.fillRect(0, 0, w, h);

    // 2. Architectural Stone Ashlar Flagstones / Bridge Planks / Zen Raked Sand
    g.strokeStyle = stage.palette.gridLine;
    g.lineWidth = 1.1;

    if (stage.theme === 'misty_pine') {
      // Zen raked gravel concentric garden waves + stone walkway axis
      g.save();
      g.globalAlpha = 0.62;
      for (let r = 56; r < 660; r += 18) {
        g.beginPath();
        g.arc(w * 0.5, h * 0.5, r, 0, Math.PI * 2);
        g.stroke();
      }
      g.restore();

      // Central stone slab path
      g.fillStyle = '#E1E4DF';
      g.fillRect(42, h * 0.5 - 52, w - 84, 104);
      g.strokeRect(42, h * 0.5 - 52, w - 84, 104);
    } else if (stage.theme === 'vermilion_bridge') {
      // Warm cedar timber bridge planks running vertically across the span
      g.fillStyle = '#E6D8C3';
      g.fillRect(38, 155, w - 76, h - 310);
      g.strokeStyle = '#C9B69B';
      g.beginPath();
      for (let x = 48; x < w - 48; x += 28) {
        g.moveTo(x, 38);
        g.lineTo(x, h - 38);
      }
      g.stroke();
      // Vermilion lacquered bridge runner beams
      g.fillStyle = '#9A3412';
      g.fillRect(38, 154, w - 76, 8);
      g.fillRect(38, h - 162, w - 76, 8);
    } else {
      // Staggered classical courtyard ashlar stone slabs (running bond, not spreadsheet grid!)
      const rowH = 62;
      const colW = 92;
      let rowIdx = 0;
      g.beginPath();
      for (let y = 38; y <= h - 38; y += rowH) {
        g.moveTo(38, y);
        g.lineTo(w - 38, y);
        const offset = (rowIdx % 2) * (colW * 0.5);
        const nextY = Math.min(h - 38, y + rowH);
        if (y < h - 38) {
          for (let x = 38 + offset; x < w - 38; x += colW) {
            if (x > 38) {
              g.moveTo(x, y);
              g.lineTo(x, nextY);
            }
          }
        }
        rowIdx++;
      }
      g.stroke();

      // Subtle weathered darker stone slabs for organic rhythm
      g.fillStyle = 'rgba(120, 113, 108, 0.065)';
      for (let i = 0; i < 18; i++) {
        const r = (i * 5) % 9;
        const c = (i * 7 + 2) % 11;
        const sx = 42 + c * colW + ((r % 2) * colW * 0.5);
        const sy = 40 + r * rowH;
        if (sx + colW < w - 42 && sy + rowH < h - 40) {
          g.fillRect(sx + 2, sy + 2, colW - 4, rowH - 4);
        }
      }
    }

    // 3. Central Courtyard Ceremonial Compass / Dojo Crest
    g.save();
    g.translate(w * 0.5, h * 0.5);
    g.strokeStyle = 'rgba(41, 37, 36, 0.16)';
    g.lineWidth = 2.2;
    g.beginPath();
    g.arc(0, 0, 108, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(0, 0, 96, 0, Math.PI * 2);
    g.stroke();

    // Cardinal brush ticks
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      g.beginPath();
      g.moveTo(Math.cos(a) * 86, Math.sin(a) * 86);
      g.lineTo(Math.cos(a) * 118, Math.sin(a) * 118);
      g.stroke();
    }
    g.restore();

    // 4. Perimeter Tiled Courtyard Roof Eaves (回廊飞檐瓦当) + Diagonal Eave Shadow
    g.fillStyle = 'rgba(28, 25, 23, 0.11)';
    g.fillRect(36, 36, w - 72, 18);
    g.fillRect(36, 36, 16, h - 72);

    const eaveThick = 36;
    g.fillStyle = '#262321';
    g.fillRect(0, 0, w, eaveThick);
    g.fillRect(0, h - eaveThick, w, eaveThick);
    g.fillRect(0, 0, eaveThick, h);
    g.fillRect(w - eaveThick, 0, eaveThick, h);

    // Clay roof tile ribs along the 4 eaves
    g.strokeStyle = 'rgba(250, 248, 244, 0.14)';
    g.lineWidth = 1.2;
    g.beginPath();
    for (let x = eaveThick; x <= w - eaveThick; x += 20) {
      g.moveTo(x, 0);
      g.lineTo(x, eaveThick);
      g.moveTo(x, h - eaveThick);
      g.lineTo(x, h);
    }
    for (let y = eaveThick; y <= h - eaveThick; y += 20) {
      g.moveTo(0, y);
      g.lineTo(eaveThick, y);
      g.moveTo(w - eaveThick, y);
      g.lineTo(w, y);
    }
    g.stroke();

    // Corner diagonal hip-roof ridge spines (戗脊)
    g.strokeStyle = '#57534E';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(eaveThick, eaveThick);
    g.moveTo(w, 0);
    g.lineTo(w - eaveThick, eaveThick);
    g.moveTo(0, h);
    g.lineTo(eaveThick, h - eaveThick);
    g.moveTo(w, h);
    g.lineTo(w - eaveThick, h - eaveThick);
    g.stroke();

    // Vermilion timber wall beam inside eave
    g.strokeStyle = stage.palette.accentHex;
    g.lineWidth = 2.5;
    g.strokeRect(eaveThick, eaveThick, w - eaveThick * 2, h - eaveThick * 2);
  }

  private spawnParticle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    size: number,
    maxLife: number,
    color: string,
    kind: PooledParticle['kind'],
  ): void {
    const p = this.particles[this.particleCursor];
    this.particleCursor = (this.particleCursor + 1) % PARTICLE_POOL_SIZE;
    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.size = size;
    p.life = maxLife;
    p.maxLife = maxLife;
    p.color = color;
    p.kind = kind;
    p.angle = Math.random() * Math.PI * 2;
    p.vAngle = (Math.random() - 0.5) * 6;
  }

  private spawnAfterimage(x: number, y: number, facing: number, tint: string, life: number): void {
    const a = this.afterimages[this.afterimageCursor];
    this.afterimageCursor = (this.afterimageCursor + 1) % AFTERIMAGE_POOL_SIZE;
    a.active = true;
    a.x = x;
    a.y = y;
    a.facing = facing;
    a.life = life;
    a.maxLife = life;
    a.tint = tint;
  }

  public ingestEvents(state: InkBladeRunState, events: SimulationEvents): void {
    for (const cmd of events.decalCommands) {
      this.stampDecal(cmd);
    }

    if (events.playerSlashed && state.slashArcs.length > 0) {
      const latestArc = state.slashArcs[state.slashArcs.length - 1];
      // Spawn 4 ghosted ink-silhouette afterimages along the slash dash path
      for (let step = 0; step < 4; step++) {
        const frac = step / 4;
        const ax = latestArc.startX + (latestArc.endX - latestArc.startX) * frac;
        const ay = latestArc.startY + (latestArc.endY - latestArc.startY) * frac;
        this.spawnAfterimage(
          ax,
          ay,
          latestArc.angle,
          events.chainResetTriggered ? '#C2410C' : '#1C1917',
          0.16 + frac * 0.1,
        );
      }

      for (let i = 0; i < 12; i++) {
        const ang = state.player.facing + (Math.random() - 0.5) * 0.9;
        const spd = 90 + Math.random() * 190;
        this.spawnParticle(
          state.player.x - Math.cos(state.player.facing) * 28,
          state.player.y - Math.sin(state.player.facing) * 28,
          Math.cos(ang) * spd,
          Math.sin(ang) * spd,
          2.5 + Math.random() * 2.5,
          0.26 + Math.random() * 0.14,
          events.chainResetTriggered ? '#D97706' : '#1C1917',
          'spark',
        );
      }
    }

    if (events.perfectDeflectCount > 0) {
      for (let i = 0; i < 20; i++) {
        const ang = (i / 20) * Math.PI * 2 + Math.random() * 0.2;
        const spd = 140 + Math.random() * 240;
        this.spawnParticle(
          state.player.x,
          state.player.y,
          Math.cos(ang) * spd,
          Math.sin(ang) * spd,
          3.2,
          0.34,
          i % 2 === 0 ? '#F59E0B' : '#C2410C',
          'spark',
        );
      }
    }

    if (events.enemiesHit > 0) {
      const burstCount = events.enemiesKilled > 0 ? 18 : 8;
      for (let i = 0; i < burstCount; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 60 + Math.random() * 210;
        this.spawnParticle(
          state.player.x,
          state.player.y,
          Math.cos(ang) * spd,
          Math.sin(ang) * spd,
          3 + Math.random() * 3.5,
          0.35 + Math.random() * 0.18,
          i % 3 === 0 ? '#B91C1C' : '#1C1917',
          'ink',
        );
      }
    }

    if (events.jarExplodedCount > 0) {
      for (let i = 0; i < 24; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 120 + Math.random() * 280;
        this.spawnParticle(
          state.player.x,
          state.player.y,
          Math.cos(ang) * spd,
          Math.sin(ang) * spd,
          3.5 + Math.random() * 3,
          0.42,
          i % 2 === 0 ? '#EA580C' : '#FBBF24',
          'spark',
        );
      }
    }
  }

  private stampDecal(cmd: InkDecalCommand): void {
    const g = this.decalCtx;
    g.save();
    g.translate(cmd.x, cmd.y);
    g.rotate(cmd.angle);
    g.scale(cmd.scale, cmd.scale);

    if (cmd.kind === 'splatter') {
      g.fillStyle = cmd.colorHex;
      g.globalAlpha = cmd.colorHex === '#991B1B' ? 0.38 : 0.24;
      g.beginPath();
      g.ellipse(10, 0, 24, 6.5, 0, 0, Math.PI * 2);
      g.fill();
      for (let i = 0; i < 5; i++) {
        const ox = 14 + i * 7;
        const oy = ((i * 19) % 16) - 8;
        const r = Math.max(1.5, 4.5 - i * 0.7);
        g.beginPath();
        g.arc(ox, oy, r, 0, Math.PI * 2);
        g.fill();
      }
    } else if (cmd.kind === 'slash_scuff') {
      g.strokeStyle = 'rgba(28, 25, 23, 0.22)';
      g.lineWidth = 2.4;
      g.beginPath();
      g.moveTo(-68, 0);
      g.lineTo(68, 0);
      g.stroke();
    } else if (cmd.kind === 'scorch') {
      const grad = g.createRadialGradient(0, 0, 4, 0, 0, 48);
      grad.addColorStop(0, 'rgba(28, 25, 23, 0.45)');
      grad.addColorStop(0.65, 'rgba(68, 64, 60, 0.2)');
      grad.addColorStop(1, 'rgba(28, 25, 23, 0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(0, 0, 48, 0, Math.PI * 2);
      g.fill();
    } else if (cmd.kind === 'fallen_hat') {
      g.globalAlpha = 0.55;
      g.fillStyle = cmd.colorHex;
      g.beginPath();
      g.arc(0, 0, 12.5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#78716C';
      g.lineWidth = 1.2;
      g.stroke();
    }

    g.restore();
  }

  private updateParticles(dt: number, stage: StageDef): void {
    this.ambientTimer += dt;
    if (this.ambientTimer >= 0.075) {
      this.ambientTimer = 0;
      const rx = 50 + Math.random() * (stage.arenaWidth - 100);
      const ry = 50 + Math.random() * (stage.arenaHeight - 100);

      if (stage.theme === 'bamboo_rain' || stage.theme === 'storm_tenshu') {
        this.spawnParticle(
          rx,
          ry - 60,
          -95,
          360,
          14,
          0.35,
          stage.theme === 'storm_tenshu'
            ? 'rgba(51, 65, 85, 0.46)'
            : 'rgba(68, 64, 60, 0.36)',
          'rain',
        );
        if (Math.random() < 0.45) {
          this.spawnParticle(
            rx,
            ry,
            0,
            0,
            15,
            0.55,
            'rgba(87, 83, 78, 0.32)',
            'ripple',
          );
        }
      } else if (stage.theme === 'vermilion_bridge') {
        this.spawnParticle(
          rx,
          ry,
          28 + Math.random() * 24,
          18 + Math.random() * 18,
          4.8,
          2.2,
          Math.random() < 0.6 ? '#C2410C' : '#B45309',
          'leaf',
        );
      } else if (stage.theme === 'crucible_forge') {
        this.spawnParticle(
          rx,
          ry,
          (Math.random() - 0.5) * 26,
          -38 - Math.random() * 32,
          2.8,
          1.4,
          '#EA580C',
          'spark',
        );
      } else {
        this.spawnParticle(
          rx,
          ry,
          18 + Math.random() * 14,
          8 + Math.random() * 10,
          4.2,
          2.4,
          '#115E59',
          'leaf',
        );
      }
    }

    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.vAngle * dt;
      if (p.kind === 'spark' || p.kind === 'ink') {
        p.vx *= Math.exp(-5.5 * dt);
        p.vy *= Math.exp(-5.5 * dt);
      }
    }

    for (const a of this.afterimages) {
      if (!a.active) continue;
      a.life -= dt;
      if (a.life <= 0) a.active = false;
    }
  }

  public render(
    state: InkBladeRunState,
    dt: number,
    aimWorldX: number,
    aimWorldY: number,
    isTitleMode: boolean,
  ): void {
    const stage = STAGES[Math.max(0, Math.min(STAGES.length - 1, state.stageIndex))];
    const expectedKey = `${stage.id}_${state.endlessLoop}`;
    if (this.bakedStageKey !== expectedKey) {
      this.resetFloorForStage(stage, state.endlessLoop);
    }

    this.updateParticles(dt, stage);

    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // Outer Xuan-paper architectural mat
    ctx.fillStyle = '#DED6C8';
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);

    const padX = 28;
    const padY = 24;
    const fitScale = Math.min(
      (this.cssWidth - padX * 2) / state.arenaWidth,
      (this.cssHeight - padY * 2) / state.arenaHeight,
    );
    const scale = Math.max(0.4, fitScale * (isTitleMode ? 1.05 : 1.02));
    this.viewScale = scale;

    const targetLeadX = isTitleMode
      ? -120
      : ((state.player.x - state.arenaWidth * 0.5) * -0.08 +
          (aimWorldX - state.player.x) * -0.035) *
        scale;
    const targetLeadY = isTitleMode
      ? 0
      : ((state.player.y - state.arenaHeight * 0.5) * -0.08 +
          (aimWorldY - state.player.y) * -0.035) *
        scale;

    const blend = 1 - Math.exp(-8 * Math.max(0.001, dt));
    this.camLeadX += (targetLeadX - this.camLeadX) * blend;
    this.camLeadY += (targetLeadY - this.camLeadY) * blend;

    const shakeAmp = state.cameraTrauma * state.cameraTrauma * 14;
    const shakeX = shakeAmp > 0.1 ? (Math.random() * 2 - 1) * shakeAmp : 0;
    const shakeY = shakeAmp > 0.1 ? (Math.random() * 2 - 1) * shakeAmp : 0;

    const baseOffsetX =
      (this.cssWidth - state.arenaWidth * scale) * 0.5 +
      (isTitleMode ? this.cssWidth * 0.11 : this.camLeadX) +
      shakeX;
    const baseOffsetY =
      (this.cssHeight - state.arenaHeight * scale) * 0.5 +
      this.camLeadY +
      shakeY;

    this.viewOffsetX = baseOffsetX;
    this.viewOffsetY = baseOffsetY;

    ctx.save();
    ctx.translate(baseOffsetX, baseOffsetY);
    ctx.scale(scale, scale);

    // Architectural elevation shadow
    ctx.fillStyle = 'rgba(28, 25, 23, 0.2)';
    ctx.fillRect(12, 16, state.arenaWidth, state.arenaHeight);

    // 1. Baked Courtyard + Battle Scars Decal Layer
    ctx.drawImage(this.decalCanvas, 0, 0);

    // 2. Water Trenches & Ground Telegraphs
    for (const obs of state.obstacles) {
      if (obs.kind === 'water_trench') {
        this.drawObstacle(ctx, obs, state.elapsedSec);
      }
    }

    this.drawGroundTelegraphs(ctx, state);

    // 3. Shockwave Rings
    for (const sw of state.shockwaves) {
      const alpha = Math.max(0, sw.life / sw.maxLife);
      ctx.save();
      ctx.strokeStyle = sw.colorHex;
      ctx.globalAlpha = alpha * 0.88;
      ctx.lineWidth = sw.lineWidth;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 4. Mind's Eye Trajectory Preview
    if (!isTitleMode && state.phase === 'fighting' && state.player.slashCooldown <= 0) {
      this.drawSlashPreview(ctx, state, aimWorldX, aimWorldY);
    }

    // 5. Explosive Powder Jars
    for (const jar of state.jars) {
      if (jar.exploded) continue;
      this.drawPowderJar(ctx, jar.x, jar.y, jar.radius, jar.triggered, state.elapsedSec);
    }

    // 6. Solid Architectural Obstacles
    for (const obs of state.obstacles) {
      if (obs.kind !== 'water_trench') {
        this.drawObstacle(ctx, obs, state.elapsedSec);
      }
    }

    // 7. Dash Ink Afterimages
    for (const a of this.afterimages) {
      if (!a.active) continue;
      const alpha = (a.life / a.maxLife) * 0.36;
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.facing);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = a.tint;
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_RADIUS * 0.88, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 8. Enemies (rendered at full crisp silhouette on Title screen too!)
    for (const enemy of state.enemies) {
      this.drawEnemy(ctx, enemy, state.elapsedSec, isTitleMode);
    }

    // 9. Player Ronin Swordsman
    this.drawPlayer(ctx, state, aimWorldX, aimWorldY, isTitleMode);

    // 10. Calligraphic Slash Arcs
    for (const arc of state.slashArcs) {
      this.drawSlashArc(ctx, arc);
    }

    // 11. Projectiles
    this.drawProjectiles(ctx, state);

    // 12. Overhanging Corner Foliage Silhouettes (Sumi Bamboo / Maple / Pine)
    this.drawCornerFoliageCanopies(ctx, stage, state.elapsedSec);

    // 13. Pooled Ambient & Combat Particles
    this.drawParticles(ctx);

    // 14. Floating Combat Callouts
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const c of state.callouts) {
      const alpha = Math.min(1, (c.life / c.maxLife) * 1.4);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = '700 14px "Noto Sans SC", "Plus Jakarta Sans", sans-serif';
      ctx.strokeStyle = '#FAF8F4';
      ctx.lineWidth = 3.5;
      ctx.strokeText(c.text, c.x, c.y);
      ctx.fillStyle = c.colorHex;
      ctx.fillText(c.text, c.x, c.y);
      ctx.restore();
    }

    // 15. World-Space Brush Crosshair Reticle during active combat
    if (!isTitleMode && state.phase === 'fighting') {
      this.drawAimReticle(ctx, state, aimWorldX, aimWorldY);
    }

    ctx.restore();

    // Screen-space Mind's Eye focus vignette & Storm Lightning flash
    if (state.player.mindsEyeActive && !isTitleMode) {
      const grad = ctx.createRadialGradient(
        this.cssWidth * 0.5,
        this.cssHeight * 0.5,
        this.cssHeight * 0.25,
        this.cssWidth * 0.5,
        this.cssHeight * 0.5,
        this.cssWidth * 0.7,
      );
      grad.addColorStop(0, 'rgba(15, 118, 110, 0)');
      grad.addColorStop(1, 'rgba(15, 23, 42, 0.28)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);
    }

    if (state.player.hp === 1 && !isTitleMode && state.phase === 'fighting') {
      const pulse = 0.14 + Math.sin(state.elapsedSec * 6) * 0.04;
      const vGrad = ctx.createRadialGradient(
        this.cssWidth * 0.5,
        this.cssHeight * 0.5,
        this.cssHeight * 0.32,
        this.cssWidth * 0.5,
        this.cssHeight * 0.5,
        this.cssWidth * 0.68,
      );
      vGrad.addColorStop(0, 'rgba(185, 28, 28, 0)');
      vGrad.addColorStop(1, `rgba(185, 28, 28, ${pulse.toFixed(3)})`);
      ctx.fillStyle = vGrad;
      ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);
    }

    if (state.lightningFlash > 0.01) {
      ctx.fillStyle = `rgba(250, 248, 244, ${(state.lightningFlash * 0.38).toFixed(3)})`;
      ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);
    }

    ctx.restore();
  }

  private drawCornerFoliageCanopies(
    ctx: CanvasRenderingContext2D,
    stage: StageDef,
    t: number,
  ): void {
    const sway = Math.sin(t * 1.6) * 4;
    const leafColor =
      stage.theme === 'vermilion_bridge'
        ? '#9A3412'
        : stage.theme === 'crucible_forge'
          ? '#292524'
          : '#1C3128';

    ctx.save();
    ctx.fillStyle = leafColor;
    ctx.globalAlpha = 0.82;

    // Top-right & bottom-right overhanging Sumi bamboo/maple boughs
    for (const [bx, by, signX, signY] of [
      [stage.arenaWidth - 28, 28, -1, 1],
      [stage.arenaWidth - 28, stage.arenaHeight - 28, -1, -1],
      [28, 28, 1, 1],
    ] as const) {
      ctx.save();
      ctx.translate(bx, by);
      for (let b = 0; b < 5; b++) {
        const ang =
          (signX > 0 ? 0.3 : Math.PI - 0.3) * (signY > 0 ? 1 : -1) +
          (b - 2) * 0.22 +
          sway * 0.012;
        const len = 36 + (b % 3) * 16;
        ctx.save();
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(len * 0.5, -6, len, 0);
        ctx.quadraticCurveTo(len * 0.5, 6, 0, 0);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  private drawAimReticle(
    ctx: CanvasRenderingContext2D,
    state: InkBladeRunState,
    aimX: number,
    aimY: number,
  ): void {
    const ready = state.player.slashCooldown <= 0;
    ctx.save();
    ctx.translate(aimX, aimY);

    ctx.strokeStyle = ready ? '#C2410C' : 'rgba(87, 83, 78, 0.65)';
    ctx.lineWidth = 1.8;

    // Crisp diamond seal crosshair
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(10, 0);
    ctx.lineTo(0, 10);
    ctx.lineTo(-10, 0);
    ctx.closePath();
    ctx.stroke();

    if (ready) {
      ctx.fillStyle = '#C2410C';
      ctx.beginPath();
      ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const prog =
        1 -
        Math.min(
          1,
          state.player.slashCooldown / Math.max(0.1, state.player.maxSlashCooldown),
        );
      ctx.strokeStyle = '#C2410C';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, 14, -Math.PI * 0.5, -Math.PI * 0.5 + prog * Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawObstacle(
    ctx: CanvasRenderingContext2D,
    obs: ArenaObstacle,
    t: number,
  ): void {
    const cx = obs.x + obs.w * 0.5;
    const cy = obs.y + obs.h * 0.5;

    if (obs.kind === 'water_trench') {
      ctx.save();
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.24)';
      ctx.lineWidth = 1.5;
      for (let row = 0; row < 4; row++) {
        const wy = obs.y + 20 + row * 26;
        const shift = ((t * 36 + row * 45) % 80) - 40;
        ctx.beginPath();
        ctx.moveTo(obs.x + 16, wy);
        ctx.quadraticCurveTo(cx + shift, wy - 5, obs.x + obs.w - 16, wy);
        ctx.stroke();
      }
      ctx.strokeStyle = '#9A3412';
      ctx.lineWidth = 3.5;
      ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
      ctx.restore();
      return;
    }

    // Architectural drop shadow
    ctx.fillStyle = 'rgba(28, 25, 23, 0.22)';
    ctx.beginPath();
    ctx.roundRect(obs.x + 7, obs.y + 9, obs.w, obs.h, 6);
    ctx.fill();

    if (obs.kind === 'pillar') {
      // Carved granite plinth base
      ctx.fillStyle = '#D6CEBE';
      ctx.strokeStyle = '#1C1917';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 6);
      ctx.fill();
      ctx.stroke();

      // Dark slate pavilion roof cap with cross-ridge lines
      ctx.fillStyle = '#262321';
      ctx.beginPath();
      ctx.roundRect(obs.x + 5, obs.y + 5, obs.w - 10, obs.h - 10, 4);
      ctx.fill();

      ctx.strokeStyle = '#57534E';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(obs.x + 7, obs.y + 7);
      ctx.lineTo(obs.x + obs.w - 7, obs.y + obs.h - 7);
      ctx.moveTo(obs.x + obs.w - 7, obs.y + 7);
      ctx.lineTo(obs.x + 7, obs.y + obs.h - 7);
      ctx.stroke();

      // Vermilion lacquered column finial
      ctx.fillStyle = '#9A3412';
      ctx.strokeStyle = '#FAF8F4';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, 9.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (obs.kind === 'lantern') {
      const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, 64);
      glow.addColorStop(0, 'rgba(245, 158, 11, 0.28)');
      glow.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, 64, 0, Math.PI * 2);
      ctx.fill();

      // Hexagonal / Stone Toro Lantern Roof
      ctx.fillStyle = '#57534E';
      ctx.strokeStyle = '#1C1917';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 6);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#292524';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(obs.x + 4, obs.y + 4);
      ctx.lineTo(obs.x + obs.w - 4, obs.y + obs.h - 4);
      ctx.moveTo(obs.x + obs.w - 4, obs.y + 4);
      ctx.lineTo(obs.x + 4, obs.y + obs.h - 4);
      ctx.stroke();

      ctx.fillStyle = '#FBBF24';
      ctx.beginPath();
      ctx.arc(cx, cy, 7.5 + Math.sin(t * 5) * 0.8, 0, Math.PI * 2);
      ctx.fill();
    } else if (obs.kind === 'brazier') {
      const glow = ctx.createRadialGradient(cx, cy, 8, cx, cy, 96);
      glow.addColorStop(0, 'rgba(234, 88, 12, 0.34)');
      glow.addColorStop(1, 'rgba(234, 88, 12, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, 96, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#1C1917';
      ctx.strokeStyle = '#78716C';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 12);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#EA580C';
      ctx.beginPath();
      ctx.arc(cx, cy, 21 + Math.sin(t * 7) * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FDE047';
      ctx.beginPath();
      ctx.arc(cx, cy, 9.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (obs.kind === 'bamboo_grove') {
      ctx.fillStyle = '#1E3A2F';
      ctx.strokeStyle = '#13261F';
      ctx.lineWidth = 2;
      const sway = Math.sin(t * 2.2 + obs.x * 0.02) * 2.5;
      for (const [ox, oy, r] of [
        [-14, -12, 18],
        [15, -10, 16],
        [0, 12, 19],
        [-12, 14, 14],
      ] as const) {
        ctx.beginPath();
        ctx.arc(cx + ox + sway, cy + oy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = '#A7F3D0';
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(cx + sway - 4, cy - 4, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  private drawPowderJar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    triggered: boolean,
    t: number,
  ): void {
    ctx.fillStyle = 'rgba(28, 25, 23, 0.24)';
    ctx.beginPath();
    ctx.ellipse(x + 3, y + 5, r, r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();

    const pulse = triggered ? 1 + Math.sin(t * 36) * 0.14 : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, pulse);

    ctx.fillStyle = triggered ? '#EF4444' : '#9A3412';
    ctx.strokeStyle = '#1C1917';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Hemp rope cross-binding + paper talisman
    ctx.strokeStyle = '#D6CEBE';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-r * 0.7, -r * 0.7);
    ctx.lineTo(r * 0.7, r * 0.7);
    ctx.moveTo(r * 0.7, -r * 0.7);
    ctx.lineTo(-r * 0.7, r * 0.7);
    ctx.stroke();

    ctx.fillStyle = '#FAF8F4';
    ctx.fillRect(-5.5, -5.5, 11, 11);
    ctx.fillStyle = '#C2410C';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawGroundTelegraphs(ctx: CanvasRenderingContext2D, state: InkBladeRunState): void {
    for (const e of state.enemies) {
      if (e.aiPhase !== 'windup') continue;
      const def = ENEMY_ARCHETYPES[e.archetype];
      const prog = 1 - Math.max(0, Math.min(1, e.phaseTimer / def.windupSec));

      ctx.save();
      if (
        e.archetype === 'marksman' ||
        (e.archetype === 'shogun_boss' &&
          Math.hypot(state.player.x - e.x, state.player.y - e.y) > 210)
      ) {
        const count =
          e.archetype === 'shogun_boss' ? (e.bossPhase === 2 ? 5 : 3) : 1;
        const spread = 0.22;
        for (let k = 0; k < count; k++) {
          const ang =
            count === 1
              ? e.lockedAngle
              : e.lockedAngle + (k - (count - 1) * 0.5) * spread;
          ctx.strokeStyle = prog > 0.72 ? '#DC2626' : 'rgba(194, 65, 12, 0.58)';
          ctx.lineWidth = prog > 0.72 ? 2.6 : 1.5;
          ctx.setLineDash(prog > 0.72 ? [] : [8, 6]);
          ctx.beginPath();
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(e.x + Math.cos(ang) * 620, e.y + Math.sin(ang) * 620);
          ctx.stroke();
        }
      } else if (e.archetype === 'ironclad') {
        const maxR = 118;
        ctx.fillStyle = 'rgba(180, 83, 9, 0.12)';
        ctx.beginPath();
        ctx.arc(e.x, e.y, maxR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#D97706';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, maxR * prog, 0, Math.PI * 2);
        ctx.stroke();
      } else if (
        e.archetype === 'ronin' ||
        e.archetype === 'kusarigama' ||
        e.archetype === 'shogun_boss'
      ) {
        const dashDist = e.archetype === 'kusarigama' ? 175 : 115;
        ctx.strokeStyle =
          e.archetype === 'kusarigama'
            ? 'rgba(15, 118, 110, 0.68)'
            : 'rgba(220, 38, 38, 0.62)';
        ctx.lineWidth = e.radius * 1.1;
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.22 + prog * 0.25;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(
          e.x + Math.cos(e.lockedAngle) * dashDist,
          e.y + Math.sin(e.lockedAngle) * dashDist,
        );
        ctx.stroke();
      }
      ctx.restore();
    }

    for (const proj of state.projectiles) {
      if (
        proj.kind === 'mortar' &&
        proj.owner === 'enemy' &&
        proj.targetX !== undefined &&
        proj.targetY !== undefined
      ) {
        const br = proj.blastRadius ?? 92;
        const prog = 1 - Math.max(0, Math.min(1, proj.life / proj.maxLife));
        ctx.save();
        ctx.fillStyle = 'rgba(234, 88, 12, 0.12)';
        ctx.beginPath();
        ctx.arc(proj.targetX, proj.targetY, br, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#EA580C';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = 'rgba(220, 38, 38, 0.22)';
        ctx.beginPath();
        ctx.arc(proj.targetX, proj.targetY, br * prog, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  private drawSlashPreview(
    ctx: CanvasRenderingContext2D,
    state: InkBladeRunState,
    aimX: number,
    aimY: number,
  ): void {
    const preview = computeSlashPreview(state, aimX, aimY);
    const isSlow = state.player.mindsEyeActive;

    ctx.save();
    ctx.strokeStyle = isSlow
      ? 'rgba(194, 65, 12, 0.62)'
      : 'rgba(28, 25, 23, 0.2)';
    ctx.lineWidth = isSlow ? 2.4 : 1.4;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.moveTo(preview.startX, preview.startY);
    ctx.lineTo(preview.endX, preview.endY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = isSlow ? '#C2410C' : 'rgba(28, 25, 23, 0.35)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(preview.endX, preview.endY, isSlow ? 12 : 7, 0, Math.PI * 2);
    ctx.stroke();

    for (const e of state.enemies) {
      if (preview.targetEnemyUids.includes(e.uid)) {
        ctx.strokeStyle = '#C2410C';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius + 9, 0, Math.PI * 2);
        ctx.stroke();
      } else if (preview.blockedByShieldUids.includes(e.uid)) {
        ctx.strokeStyle = '#78716C';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius + 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  private drawEnemy(
    ctx: CanvasRenderingContext2D,
    e: EnemyEntity,
    t: number,
    isTitleMode: boolean,
  ): void {
    const def = ENEMY_ARCHETYPES[e.archetype];
    ctx.save();
    ctx.translate(e.x, e.y);

    if (!isTitleMode && e.aiPhase === 'spawning') {
      ctx.globalAlpha = Math.max(0.45, 1 - e.phaseTimer * 0.65);
    } else if (e.aiPhase === 'dying') {
      ctx.globalAlpha = 1 - e.koProgress;
      ctx.scale(1 + e.koProgress * 0.15, 1 - e.koProgress * 0.25);
    }

    // Contact shadow
    ctx.fillStyle = 'rgba(28, 25, 23, 0.26)';
    ctx.beginPath();
    ctx.ellipse(3, 6, e.radius * 1.08, e.radius * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();

    const bob = Math.sin(e.gaitDist * 0.08 + t * 1.8) * 1.6;
    ctx.save();
    ctx.rotate(e.facing);
    ctx.translate(bob, 0);

    // Frontal Heavy Shield Arc
    if (e.frontalShield && !e.shieldBroken) {
      ctx.strokeStyle = '#D97706';
      ctx.lineWidth = 5.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, e.radius + 7, -1.05, 1.05);
      ctx.stroke();

      ctx.strokeStyle = '#1C1917';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius + 10, -0.95, 0.95);
      ctx.stroke();
    }

    // Drawn Weapon
    ctx.strokeStyle = e.hitFlashTimer > 0 ? '#FFFFFF' : '#78716C';
    ctx.lineWidth = e.archetype === 'shogun_boss' ? 4.5 : 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (e.archetype === 'marksman') {
      ctx.moveTo(e.radius * 0.6, -13);
      ctx.quadraticCurveTo(e.radius + 13, 0, e.radius * 0.6, 13);
    } else if (e.archetype === 'shogun_boss') {
      ctx.moveTo(-12, 16);
      ctx.lineTo(e.radius + 28, 8);
    } else {
      ctx.moveTo(4, e.radius * 0.72);
      ctx.lineTo(e.radius + 18, 2);
    }
    ctx.stroke();

    // Primary cloak / armor shoulders
    ctx.fillStyle = e.hitFlashTimer > 0 ? '#FAF8F4' : def.coatHex;
    ctx.strokeStyle = '#0C0A09';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, e.radius * 0.92, e.radius * 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Secondary conical sedge hat / helm with radial rib lines
    ctx.fillStyle = e.hitFlashTimer > 0 ? '#FDBA74' : def.trimHex;
    ctx.beginPath();
    ctx.arc(2, 0, e.radius * 0.64, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#1C1917';
    ctx.beginPath();
    ctx.arc(2, 0, 2.8, 0, Math.PI * 2);
    ctx.fill();

    if (e.archetype === 'shogun_boss') {
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(10, -5);
      ctx.lineTo(24, -18);
      ctx.moveTo(10, 5);
      ctx.lineTo(24, 18);
      ctx.stroke();
    }

    if (e.aiPhase === 'windup') {
      const flashR = 5 + Math.sin(t * 28) * 2;
      ctx.fillStyle = '#EF4444';
      ctx.beginPath();
      ctx.arc(e.radius + 8, 0, flashR, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    if (e.aiPhase === 'staggered') {
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, e.radius + 8, t * 4, t * 4 + Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (
      e.archetype !== 'shogun_boss' &&
      e.aiPhase !== 'dying' &&
      e.maxHp > 1 &&
      e.hp < e.maxHp
    ) {
      const pipW = 7;
      const gap = 3;
      const totalW = e.maxHp * pipW + (e.maxHp - 1) * gap;
      const startX = -totalW * 0.5;
      const py = -e.radius - 12;
      for (let k = 0; k < e.maxHp; k++) {
        ctx.fillStyle = k < e.hp ? '#C2410C' : 'rgba(28, 25, 23, 0.25)';
        ctx.fillRect(startX + k * (pipW + gap), py, pipW, 4);
      }
    }

    ctx.restore();
  }

  private drawPlayer(
    ctx: CanvasRenderingContext2D,
    state: InkBladeRunState,
    aimX: number,
    aimY: number,
    isTitleMode: boolean,
  ): void {
    const p = state.player;
    ctx.save();
    ctx.translate(p.x, p.y);

    if (p.parryActiveTimer > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(245, 158, 11, 0.16)';
      ctx.strokeStyle = '#D97706';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 56, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    if (p.isenReadyFlash > 0) {
      ctx.save();
      ctx.strokeStyle = '#C2410C';
      ctx.globalAlpha = Math.min(1, p.isenReadyFlash * 2.5);
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_RADIUS + 14 * (1 - p.isenReadyFlash), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Contact shadow
    ctx.fillStyle = 'rgba(28, 25, 23, 0.3)';
    ctx.beginPath();
    ctx.ellipse(3, 6, PLAYER_RADIUS * 1.18, PLAYER_RADIUS * 0.96, 0, 0, Math.PI * 2);
    ctx.fill();

    const angle = isTitleMode
      ? Math.atan2(aimY - p.y, aimX - p.x)
      : p.facing;
    ctx.rotate(angle);
    ctx.scale(p.scaleX, p.scaleY);

    // Flowing crimson scarf tail
    const speed = Math.hypot(p.vx, p.vy);
    const flutter = Math.sin(state.elapsedSec * 10 + p.gaitDist * 0.05) * (3 + speed * 0.01);
    ctx.strokeStyle = '#C2410C';
    ctx.lineWidth = 5.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-8, -4);
    ctx.quadraticCurveTo(-20, flutter - 5, -31, flutter);
    ctx.stroke();

    // Drawn Steel Katana with dark outline so it pops cleanly on light Xuan paper!
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1C1917';
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    if (p.mindsEyeActive) {
      ctx.moveTo(-6, -14);
      ctx.lineTo(20, -18);
    } else {
      ctx.moveTo(2, 13);
      ctx.lineTo(PLAYER_RADIUS + 24, 3);
    }
    ctx.stroke();

    ctx.strokeStyle = p.slashCooldown <= 0 ? '#FAF8F4' : '#D6D3D1';
    ctx.lineWidth = 2.8;
    ctx.stroke();

    // Dark sumi haori shoulders
    ctx.fillStyle = p.hitFlashTimer > 0 ? '#EF4444' : '#1C1917';
    ctx.strokeStyle = '#FAF8F4';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, 0, PLAYER_RADIUS * 0.94, PLAYER_RADIUS * 1.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Woven Ronin Kasa (Conical Sedge Hat)
    ctx.fillStyle = '#F5F0E6';
    ctx.strokeStyle = '#1C1917';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(2, 0, PLAYER_RADIUS * 0.84, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(28, 25, 23, 0.35)';
    ctx.lineWidth = 1;
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(2 + Math.cos(a) * 11, Math.sin(a) * 11);
      ctx.lineTo(2 - Math.cos(a) * 11, -Math.sin(a) * 11);
      ctx.stroke();
    }

    ctx.fillStyle = '#C2410C';
    ctx.beginPath();
    ctx.arc(2, 0, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawSlashArc(
    ctx: CanvasRenderingContext2D,
    arc: InkBladeRunState['slashArcs'][number],
  ): void {
    const alpha = Math.max(0, arc.life / arc.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';

    ctx.strokeStyle = arc.isThunderWake
      ? '#D97706'
      : arc.isChainReset
        ? '#C2410C'
        : '#1C1917';
    ctx.lineWidth = arc.width * 0.62 * alpha + 4;
    ctx.beginPath();
    ctx.moveTo(arc.startX, arc.startY);
    ctx.lineTo(arc.endX, arc.endY);
    ctx.stroke();

    ctx.strokeStyle = '#FAF8F4';
    ctx.lineWidth = Math.max(2, arc.width * 0.2 * alpha);
    ctx.beginPath();
    ctx.moveTo(arc.startX, arc.startY);
    ctx.lineTo(arc.endX, arc.endY);
    ctx.stroke();

    ctx.restore();
  }

  private drawProjectiles(ctx: CanvasRenderingContext2D, state: InkBladeRunState): void {
    for (const proj of state.projectiles) {
      ctx.save();
      if (proj.kind === 'mortar' && proj.owner === 'enemy') {
        const prog = 1 - Math.max(0, Math.min(1, proj.life / proj.maxLife));
        const arcLift = Math.sin(prog * Math.PI) * 58;
        ctx.fillStyle = 'rgba(28, 25, 23, 0.22)';
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, 9, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#1C1917';
        ctx.strokeStyle = '#EA580C';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(proj.x, proj.y - arcLift, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        const ang = Math.atan2(proj.vy, proj.vx);
        ctx.translate(proj.x, proj.y);
        ctx.rotate(ang);

        const isPlayer = proj.owner === 'player';
        ctx.strokeStyle = isPlayer ? '#F59E0B' : '#DC2626';
        ctx.lineWidth = isPlayer ? 4.5 : 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-26, 0);
        ctx.lineTo(8, 0);
        ctx.stroke();

        ctx.fillStyle = isPlayer ? '#FAF8F4' : '#1C1917';
        ctx.beginPath();
        ctx.moveTo(13, 0);
        ctx.lineTo(-2, -5.5);
        ctx.lineTo(2, 0);
        ctx.lineTo(-2, 5.5);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;

      if (p.kind === 'rain') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - 5, p.y + p.size);
        ctx.stroke();
      } else if (p.kind === 'ripple') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - alpha), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'leaf') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.48, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * alpha), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}
