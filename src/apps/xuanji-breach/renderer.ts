import { BOARD_SIZE, LUOPAN_CENTER } from './content.ts';
import {
  coordsEqual,
  DIR_VECTORS,
  isLuopanZone,
} from './engine.ts';
import type {
  ActionPreviewResult,
  BattleState,
  Direction4,
  GridCoord,
  TileState,
  UnitState,
  VisualFxEvent,
} from './types.ts';

interface PooledParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface FloatingBanner {
  active: boolean;
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

interface ActiveAnimArc {
  kind: VisualFxEvent['kind'];
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  pathScreen?: Array<{ x: number; y: number }>;
  progress: number;
  duration: number;
  color: string;
}

const PARTICLE_POOL_SIZE = 140;
const BANNER_POOL_SIZE = 24;

export class XuanjiIsometricRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width = 1280;
  private height = 800;
  private dpr = 1;

  private originX = 640;
  private originY = 160;
  private halfW = 52;
  private halfH = 27;

  private timeSec = 0;
  private hitstopTimer = 0;
  private shakeTrauma = 0;
  private luopanVisualOffsetRad = 0;

  private particles: PooledParticle[] = [];
  private banners: FloatingBanner[] = [];
  private activeArcs: ActiveAnimArc[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to initialize 2D context for XuanjiIsometricRenderer');
    }
    this.ctx = ctx;

    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 3,
        color: '#F59E0B',
      });
    }

    for (let i = 0; i < BANNER_POOL_SIZE; i++) {
      this.banners.push({
        active: false,
        x: 0,
        y: 0,
        text: '',
        color: '#FEF3C7',
        life: 0,
        maxLife: 1,
      });
    }

    this.resize(canvas.clientWidth || 1280, canvas.clientHeight || 800);
  }

  public resize(clientWidth: number, clientHeight: number): void {
    this.width = Math.max(320, clientWidth);
    this.height = Math.max(320, clientHeight);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);

    const isMobile = this.width < 640;
    const availW = this.width * (isMobile ? 0.94 : 0.82);
    const availH = this.height * (isMobile ? 0.44 : 0.56);
    this.halfW = Math.max(
      21,
      Math.min(58, Math.min(availW / 14.3, availH / 7.5)),
    );
    this.halfH = this.halfW * 0.52;

    this.originX = this.width * 0.5;
    const boardPixelH = BOARD_SIZE * 2 * this.halfH;
    this.originY = isMobile
      ? Math.max(198, (this.height - boardPixelH) * 0.44)
      : Math.max(92, (this.height - boardPixelH) * 0.42);
  }

  public tileToScreen(
    r: number,
    c: number,
    elevation = 0,
  ): { x: number; y: number } {
    const x = this.originX + (c - r) * this.halfW;
    const y =
      this.originY +
      (c + r) * this.halfH +
      this.halfH -
      elevation * (this.halfH * 0.55);
    return { x, y };
  }

  public screenToTile(
    clientX: number,
    clientY: number,
    state: BattleState,
  ): GridCoord | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const sx = ((clientX - rect.left) / rect.width) * this.width;
    const sy = ((clientY - rect.top) / rect.height) * this.height;

    // Test tiles in front-to-back order so elevated tiles (mountains/citadels) hit accurately
    for (let sum = (BOARD_SIZE - 1) * 2; sum >= 0; sum--) {
      for (let r = 0; r < BOARD_SIZE; r++) {
        const c = sum - r;
        if (c < 0 || c >= BOARD_SIZE) continue;
        const tile = state.board[r][c];
        const elev = Math.max(0, tile.elevation);
        const center = this.tileToScreen(r, c, elev);
        const dx = Math.abs(sx - center.x) / this.halfW;
        const dy = Math.abs(sy - center.y) / this.halfH;
        if (dx + dy <= 1.02) {
          return { r, c };
        }
      }
    }

    // Fallback algebraic inversion on ground plane
    const adjY = sy - this.originY;
    const adjX = sx - this.originX;
    const dx = adjX / this.halfW;
    const dy = adjY / this.halfH;
    const c = Math.floor((dx + dy) * 0.5);
    const r = Math.floor((dy - dx) * 0.5);
    if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
      return { r, c };
    }
    return null;
  }

  public emitVisualFxEvents(events: VisualFxEvent[]): void {
    for (const ev of events) {
      const fromPt = this.tileToScreen(ev.from.r, ev.from.c, 0.4);
      const toPt = this.tileToScreen(ev.to.r, ev.to.c, 0.4);

      if (ev.kind === 'luopan_spin') {
        this.luopanVisualOffsetRad = ev.clockwise ? -Math.PI / 2 : Math.PI / 2;
        this.shakeTrauma = Math.min(1, this.shakeTrauma + 0.45);
        this.spawnParticles(toPt.x, toPt.y, 24, '#F59E0B', 110);
        if (ev.label) {
          this.spawnBanner(toPt.x, toPt.y - 28, ev.label, '#FDE68A');
        }
      } else if (ev.kind === 'slash_impact' || ev.kind === 'push_bump') {
        this.hitstopTimer = 0.045;
        this.shakeTrauma = Math.min(1, this.shakeTrauma + 0.55);
        this.spawnParticles(toPt.x, toPt.y, 18, ev.colorHex, 130);
        this.activeArcs.push({
          kind: ev.kind,
          fromX: fromPt.x,
          fromY: fromPt.y,
          toX: toPt.x,
          toY: toPt.y,
          progress: 0,
          duration: 0.26,
          color: ev.colorHex,
        });
        if (ev.label) {
          this.spawnBanner(toPt.x, toPt.y - 24, ev.label, '#FEF08A');
        }
      } else if (ev.kind === 'mortar_arc') {
        this.hitstopTimer = 0.05;
        this.shakeTrauma = Math.min(1, this.shakeTrauma + 0.65);
        this.spawnParticles(toPt.x, toPt.y, 26, '#F59E0B', 150);
        this.activeArcs.push({
          kind: 'mortar_arc',
          fromX: fromPt.x,
          fromY: fromPt.y,
          toX: toPt.x,
          toY: toPt.y,
          progress: 0,
          duration: 0.34,
          color: '#F59E0B',
        });
        if (ev.label) {
          this.spawnBanner(toPt.x, toPt.y - 26, ev.label, '#FDE68A');
        }
      } else if (ev.kind === 'lightning_chain' || ev.kind === 'beam_laser') {
        this.hitstopTimer = 0.04;
        this.shakeTrauma = Math.min(1, this.shakeTrauma + 0.5);
        const pathPts = (ev.path ?? [ev.from, ev.to]).map((p) =>
          this.tileToScreen(p.r, p.c, 0.4),
        );
        for (const pt of pathPts) {
          this.spawnParticles(pt.x, pt.y, 10, ev.colorHex, 100);
        }
        this.activeArcs.push({
          kind: ev.kind,
          fromX: fromPt.x,
          fromY: fromPt.y,
          toX: toPt.x,
          toY: toPt.y,
          pathScreen: pathPts,
          progress: 0,
          duration: 0.35,
          color: ev.colorHex,
        });
        if (ev.label) {
          this.spawnBanner(toPt.x, toPt.y - 24, ev.label, '#7DD3FC');
        }
      } else {
        this.spawnParticles(toPt.x, toPt.y, 16, ev.colorHex, 100);
        this.activeArcs.push({
          kind: ev.kind,
          fromX: fromPt.x,
          fromY: fromPt.y,
          toX: toPt.x,
          toY: toPt.y,
          progress: 0,
          duration: 0.3,
          color: ev.colorHex,
        });
        if (ev.label) {
          this.spawnBanner(toPt.x, toPt.y - 24, ev.label, '#A7F3D0');
        }
      }
    }
  }

  private spawnParticles(
    x: number,
    y: number,
    count: number,
    color: string,
    speed: number,
  ): void {
    let spawned = 0;
    for (let i = 0; i < this.particles.length && spawned < count; i++) {
      const p = this.particles[i];
      if (p.active) continue;
      const angle = (Math.PI * 2 * spawned) / count + (Math.random() - 0.5) * 0.4;
      const spd = speed * (0.45 + Math.random() * 0.65);
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * spd;
      p.vy = Math.sin(angle) * spd * 0.65 - 28;
      p.life = 0;
      p.maxLife = 0.28 + Math.random() * 0.26;
      p.size = 2.2 + Math.random() * 2.8;
      p.color = color;
      spawned++;
    }
  }

  public spawnBanner(
    x: number,
    y: number,
    text: string,
    color = '#FEF3C7',
  ): void {
    for (const b of this.banners) {
      if (!b.active) {
        b.active = true;
        b.x = x;
        b.y = y;
        b.text = text;
        b.color = color;
        b.life = 0;
        b.maxLife = 1.05;
        return;
      }
    }
  }

  public stepAndRender(
    rawDt: number,
    state: BattleState,
    options: {
      isTitleTour?: boolean;
      selectedUnitUid: string | null;
      hoveredTile: GridCoord | null;
      reachableTiles: GridCoord[];
      validWeaponTargets: GridCoord[];
      previewResult: ActionPreviewResult | null;
      hintPreview: ActionPreviewResult | null;
      tutorialSpotlightCoord?: GridCoord | null;
    },
  ): void {
    const dt = Math.min(rawDt, 0.05);
    this.timeSec += dt;

    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
    }
    if (this.shakeTrauma > 0) {
      this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 2.4);
    }
    if (Math.abs(this.luopanVisualOffsetRad) > 0.002) {
      this.luopanVisualOffsetRad *= Math.pow(0.001, dt * 3.2);
    } else {
      this.luopanVisualOffsetRad = 0;
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // 1. Deep Obsidian & Bronze Chamber Backdrop
    const prevOriginX = this.originX;
    if (options.isTitleTour && this.width >= 1024) {
      this.originX = this.width * 0.6;
    }

    const bgGrad = ctx.createRadialGradient(
      this.originX,
      this.height * 0.45,
      40,
      this.originX,
      this.height * 0.5,
      Math.max(this.width, this.height) * 0.72,
    );
    bgGrad.addColorStop(0, '#211C17');
    bgGrad.addColorStop(0.55, '#15120F');
    bgGrad.addColorStop(1, '#0C0A08');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, this.width, this.height);

    // Subtle geometric compass rings in the background chamber
    this.drawChamberAstrolabeBackdrop(ctx, options.isTitleTour ?? false);

    // Apply decaying trauma^2 camera shake
    if (this.shakeTrauma > 0) {
      const mag = this.shakeTrauma * this.shakeTrauma * 9;
      const ox = Math.sin(this.timeSec * 57) * mag;
      const oy = Math.cos(this.timeSec * 49) * mag;
      ctx.translate(ox, oy);
    }

    const activePreview = options.previewResult ?? options.hintPreview;
    const displayState = activePreview ? activePreview.resultingState : state;

    // 2. Sunken Bronze Sand-Table Base Pedestal
    this.drawBoardPedestal(ctx);

    // 3. Draw Board Tiles & Units in Isometric Back-to-Front Painter's Order
    for (let sum = 0; sum <= (BOARD_SIZE - 1) * 2; sum++) {
      for (let r = 0; r < BOARD_SIZE; r++) {
        const c = sum - r;
        if (c < 0 || c >= BOARD_SIZE) continue;

        const tile = state.board[r][c];
        const isHovered =
          options.hoveredTile !== null &&
          options.hoveredTile.r === r &&
          options.hoveredTile.c === c;
        const isReachable = options.reachableTiles.some(
          (t) => t.r === r && t.c === c,
        );
        const isWeaponTarget = options.validWeaponTargets.some(
          (t) => t.r === r && t.c === c,
        );

        this.drawIsometricTile(
          ctx,
          tile,
          isHovered,
          isReachable,
          isWeaponTarget,
        );
      }
    }

    // 4. Draw Enemy Attack Telegraphs (reflecting preview state if active!)
    this.drawEnemyTelegraphs(ctx, displayState);

    // 5. Draw Units in Back-to-Front Order
    for (let sum = 0; sum <= (BOARD_SIZE - 1) * 2; sum++) {
      for (let r = 0; r < BOARD_SIZE; r++) {
        const c = sum - r;
        if (c < 0 || c >= BOARD_SIZE) continue;

        const unit = state.units.find(
          (u) => u.hp > 0 && u.r === r && u.c === c,
        );
        if (unit) {
          const isSelected = unit.uid === options.selectedUnitUid;
          const tileElev = Math.max(0, state.board[r][c].elevation);
          this.drawUnitConstruct(ctx, unit, tileElev, isSelected);
        }
      }
    }

    // 6. Draw Live Consequence Preview Vectors, Ghost Positions & Badges
    if (activePreview && activePreview.valid) {
      this.drawConsequencePreview(
        ctx,
        state,
        activePreview,
        options.hintPreview !== null && options.previewResult === null,
      );
    }

    // 6.5. Draw Interactive Tutorial Spotlight Reticle when onboarding is active
    if (options.tutorialSpotlightCoord) {
      const sc = options.tutorialSpotlightCoord;
      const stTile = state.board[sc.r]?.[sc.c];
      const spPt = this.tileToScreen(
        sc.r,
        sc.c,
        Math.max(0, stTile?.elevation ?? 0) + 0.35,
      );
      const pulse = 1 + Math.sin(this.timeSec * 5.2) * 0.1;
      ctx.save();
      ctx.strokeStyle = '#FDE047';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.ellipse(
        spPt.x,
        spPt.y - 6,
        this.halfW * 0.68 * pulse,
        this.halfH * 0.72 * pulse,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.restore();
    }

    // 7. Step & Render Active Weapon Arcs, Particles & Floating Banners
    this.updateAndDrawEffects(ctx, dt);

    this.originX = prevOriginX;
    ctx.restore();
  }

  private drawChamberAstrolabeBackdrop(
    ctx: CanvasRenderingContext2D,
    isTitleTour: boolean,
  ): void {
    const cx = this.originX;
    const cy = this.originY + BOARD_SIZE * this.halfH;
    const rx = this.halfW * 7.6;
    const ry = this.halfH * 7.6;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    ctx.rotate(
      this.timeSec * (isTitleTour ? 0.12 : 0.03) + this.luopanVisualOffsetRad,
    );

    ctx.strokeStyle = 'rgba(217, 119, 6, 0.14)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(217, 119, 6, 0.09)';
    ctx.setLineDash([8, 10]);
    ctx.beginPath();
    ctx.arc(0, 0, rx * 0.88, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 8 Bagua radial ticks
    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * rx * 0.84, Math.sin(ang) * rx * 0.84);
      ctx.lineTo(Math.cos(ang) * rx * 0.98, Math.sin(ang) * rx * 0.98);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawBoardPedestal(ctx: CanvasRenderingContext2D): void {
    const top = this.tileToScreen(0, 0, 0);
    const right = this.tileToScreen(0, BOARD_SIZE - 1, 0);
    const bottom = this.tileToScreen(BOARD_SIZE - 1, BOARD_SIZE - 1, 0);
    const left = this.tileToScreen(BOARD_SIZE - 1, 0, 0);

    const padW = this.halfW * 1.18;
    const padH = this.halfH * 1.18;
    const rimDepth = 18;

    const pTop = { x: top.x, y: top.y - padH };
    const pRight = { x: right.x + padW, y: right.y };
    const pBottom = { x: bottom.x, y: bottom.y + padH };
    const pLeft = { x: left.x - padW, y: left.y };

    // Left bronze pedestal wall
    ctx.fillStyle = '#2B2219';
    ctx.beginPath();
    ctx.moveTo(pLeft.x, pLeft.y);
    ctx.lineTo(pBottom.x, pBottom.y);
    ctx.lineTo(pBottom.x, pBottom.y + rimDepth);
    ctx.lineTo(pLeft.x, pLeft.y + rimDepth);
    ctx.closePath();
    ctx.fill();

    // Right bronze pedestal wall
    ctx.fillStyle = '#1D1610';
    ctx.beginPath();
    ctx.moveTo(pBottom.x, pBottom.y);
    ctx.lineTo(pRight.x, pRight.y);
    ctx.lineTo(pRight.x, pRight.y + rimDepth);
    ctx.lineTo(pBottom.x, pBottom.y + rimDepth);
    ctx.closePath();
    ctx.fill();

    // Pedestal top rim
    ctx.fillStyle = '#191410';
    ctx.strokeStyle = '#6B563E';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pTop.x, pTop.y);
    ctx.lineTo(pRight.x, pRight.y);
    ctx.lineTo(pBottom.x, pBottom.y);
    ctx.lineTo(pLeft.x, pLeft.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  private drawIsometricTile(
    ctx: CanvasRenderingContext2D,
    tile: TileState,
    isHovered: boolean,
    isReachable: boolean,
    isWeaponTarget: boolean,
  ): void {
    const hoverLift = isHovered ? 0.14 : 0;
    const elev = Math.max(0, tile.elevation) + hoverLift;
    const center = this.tileToScreen(tile.r, tile.c, elev);
    const groundCenter = this.tileToScreen(tile.r, tile.c, 0);
    const hw = this.halfW * 0.96;
    const hh = this.halfH * 0.96;

    const topPt = { x: center.x, y: center.y - hh };
    const rightPt = { x: center.x + hw, y: center.y };
    const bottomPt = { x: center.x, y: center.y + hh };
    const leftPt = { x: center.x - hw, y: center.y };

    const blockDepth =
      tile.terrain === 'chasm'
        ? 4
        : Math.max(12, 14 + (groundCenter.y - center.y));

    // Palette by terrain & Luopan status
    let topFill = '#DDD4C3';
    let leftBevel = '#B0A490';
    let rightBevel = '#8A7E6B';
    let strokeHex = '#786D5C';

    if (tile.terrain === 'chasm') {
      topFill = '#0F0D0B';
      leftBevel = '#1C1814';
      rightBevel = '#14110E';
      strokeHex = '#382E26';
    } else if (tile.terrain === 'water') {
      topFill = '#125E70';
      leftBevel = '#0D4352';
      rightBevel = '#092F3A';
      strokeHex = '#22D3EE';
    } else if (tile.terrain === 'magma') {
      topFill = '#5C1D0E';
      leftBevel = '#3E1208';
      rightBevel = '#2B0C05';
      strokeHex = '#F97316';
    } else if (tile.terrain === 'mountain') {
      topFill = '#57534E';
      leftBevel = '#44403C';
      rightBevel = '#292524';
      strokeHex = '#78716C';
    } else if (tile.terrain === 'citadel') {
      topFill = '#E7E0D0';
      leftBevel = '#C4B9A5';
      rightBevel = '#9E9380';
      strokeHex = '#D97706';
    } else if (tile.isLuopanCenter) {
      topFill = '#3B2D1E';
      leftBevel = '#291F14';
      rightBevel = '#1D150D';
      strokeHex = '#F59E0B';
    } else if (tile.isLuopanRing) {
      topFill = '#4A3926';
      leftBevel = '#36291B';
      rightBevel = '#261C12';
      strokeHex = '#D97706';
    }

    // Left 3D extruded bevel
    ctx.fillStyle = leftBevel;
    ctx.beginPath();
    ctx.moveTo(leftPt.x, leftPt.y);
    ctx.lineTo(bottomPt.x, bottomPt.y);
    ctx.lineTo(bottomPt.x, bottomPt.y + blockDepth);
    ctx.lineTo(leftPt.x, leftPt.y + blockDepth);
    ctx.closePath();
    ctx.fill();

    // Right 3D extruded bevel
    ctx.fillStyle = rightBevel;
    ctx.beginPath();
    ctx.moveTo(bottomPt.x, bottomPt.y);
    ctx.lineTo(rightPt.x, rightPt.y);
    ctx.lineTo(rightPt.x, rightPt.y + blockDepth);
    ctx.lineTo(bottomPt.x, bottomPt.y + blockDepth);
    ctx.closePath();
    ctx.fill();

    // Top Isometric Diamond Face
    ctx.fillStyle = topFill;
    ctx.strokeStyle = isHovered ? '#FEF08A' : strokeHex;
    ctx.lineWidth = isHovered ? 2.2 : tile.isLuopanRing || tile.isLuopanCenter ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(topPt.x, topPt.y);
    ctx.lineTo(rightPt.x, rightPt.y);
    ctx.lineTo(bottomPt.x, bottomPt.y);
    ctx.lineTo(leftPt.x, leftPt.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Surface Detail by Terrain
    if (tile.isLuopanRing && tile.terrain === 'plain') {
      // Engraved bronze gear inlay on the rotatable 3x3 ring
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.42)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(center.x, center.y - hh * 0.65);
      ctx.lineTo(center.x + hw * 0.65, center.y);
      ctx.lineTo(center.x, center.y + hh * 0.65);
      ctx.lineTo(center.x - hw * 0.65, center.y);
      ctx.closePath();
      ctx.stroke();
    } else if (tile.isLuopanCenter) {
      // Central Sinan Compass Pivot
      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.scale(1, 0.52);
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, hw * 0.48, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (tile.terrain === 'water') {
      // Animated Celadon River ripples
      const waveOffset = Math.sin(this.timeSec * 3.2 + tile.r + tile.c) * 4;
      ctx.strokeStyle = 'rgba(103, 232, 249, 0.48)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(center.x - hw * 0.38 + waveOffset, center.y - 2);
      ctx.lineTo(center.x + hw * 0.25 + waveOffset, center.y - 2);
      ctx.moveTo(center.x - hw * 0.25 - waveOffset, center.y + 4);
      ctx.lineTo(center.x + hw * 0.38 - waveOffset, center.y + 4);
      ctx.stroke();
    } else if (tile.terrain === 'magma') {
      // Glowing molten fissures
      const pulse = 0.55 + 0.4 * Math.sin(this.timeSec * 4 + tile.r * 2);
      ctx.strokeStyle = `rgba(251, 146, 60, ${pulse.toFixed(2)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(center.x - hw * 0.35, center.y - 2);
      ctx.lineTo(center.x + hw * 0.05, center.y + 3);
      ctx.lineTo(center.x + hw * 0.35, center.y - 3);
      ctx.stroke();
    } else if (tile.terrain === 'mountain') {
      // 3D Basalt Spire Peak
      const peakH = this.halfH * 1.15;
      ctx.fillStyle = '#57534E';
      ctx.beginPath();
      ctx.moveTo(center.x, center.y - peakH);
      ctx.lineTo(center.x - hw * 0.58, center.y + hh * 0.2);
      ctx.lineTo(center.x, center.y + hh * 0.55);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#3F3B37';
      ctx.beginPath();
      ctx.moveTo(center.x, center.y - peakH);
      ctx.lineTo(center.x + hw * 0.58, center.y + hh * 0.2);
      ctx.lineTo(center.x, center.y + hh * 0.55);
      ctx.closePath();
      ctx.fill();
    } else if (tile.terrain === 'citadel') {
      this.drawCitadelPavilion(ctx, center.x, center.y, tile.citadelHp);
    }

    // Subterranean Emergence Fissure Warning
    if (tile.hasEmergenceCrack) {
      ctx.fillStyle = '#1C140F';
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(center.x, center.y - hh * 0.45);
      ctx.lineTo(center.x + hw * 0.45, center.y);
      ctx.lineTo(center.x, center.y + hh * 0.45);
      ctx.lineTo(center.x - hw * 0.45, center.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(24, 18, 14, 0.92)';
      ctx.strokeStyle = '#D97706';
      ctx.lineWidth = 1;
      ctx.fillRect(center.x - 19, center.y - 16, 38, 14);
      ctx.strokeRect(center.x - 19, center.y - 16, 38, 14);

      ctx.fillStyle = '#FDE68A';
      ctx.font = '700 10px "Plus Jakarta Sans", "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('▲涌穴', center.x, center.y - 6);
    }

    // Reachable Movement Overlay (Jade Diamond)
    if (isReachable) {
      ctx.fillStyle = isHovered
        ? 'rgba(16, 185, 129, 0.44)'
        : 'rgba(16, 185, 129, 0.22)';
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(center.x, center.y - hh * 0.8);
      ctx.lineTo(center.x + hw * 0.8, center.y);
      ctx.lineTo(center.x, center.y + hh * 0.8);
      ctx.lineTo(center.x - hw * 0.8, center.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Weapon Targeting Reticle Overlay (Amber Gold)
    if (isWeaponTarget) {
      ctx.fillStyle = isHovered
        ? 'rgba(245, 158, 11, 0.46)'
        : 'rgba(245, 158, 11, 0.22)';
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(center.x, center.y - hh * 0.82);
      ctx.lineTo(center.x + hw * 0.82, center.y);
      ctx.lineTo(center.x, center.y + hh * 0.82);
      ctx.lineTo(center.x - hw * 0.82, center.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  private drawCitadelPavilion(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    citadelHp: number,
  ): void {
    const w = this.halfW * 0.46;
    const h = this.halfH * 0.95;

    if (citadelHp <= 0) {
      // Ruined citadel base
      ctx.fillStyle = '#44403C';
      ctx.fillRect(cx - w * 0.7, cy - 8, w * 1.4, 8);
      return;
    }

    // Whitewashed fortress walls
    ctx.fillStyle = '#F5F0E6';
    ctx.fillRect(cx - w * 0.7, cy - h, w * 1.4, h);
    ctx.fillStyle = '#D6CFC2';
    ctx.fillRect(cx, cy - h, w * 0.7, h);

    // Upturned Cinnabar Pagoda Roof
    ctx.fillStyle = '#B91C1C';
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - h - 13);
    ctx.lineTo(cx + w * 1.1, cy - h + 2);
    ctx.lineTo(cx - w * 1.1, cy - h + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Glowing Leyline Windows (1 or 2 pips)
    ctx.fillStyle = '#FBBF24';
    for (let i = 0; i < citadelHp; i++) {
      const wx = cx - (citadelHp === 2 ? 5 : 0) + i * 10;
      ctx.fillRect(wx - 2.5, cy - h * 0.65, 5, 7);
    }
  }

  private drawEnemyTelegraphs(
    ctx: CanvasRenderingContext2D,
    state: BattleState,
  ): void {
    const hw = this.halfW * 0.72;
    const hh = this.halfH * 0.72;

    for (const enemy of state.units) {
      if (enemy.team !== 'enemy' || enemy.hp <= 0 || !enemy.intent) continue;
      const fromPt = this.tileToScreen(
        enemy.r,
        enemy.c,
        Math.max(0, state.board[enemy.r][enemy.c].elevation) + 0.35,
      );
      const targetTile =
        state.board[enemy.intent.targetCoord.r]?.[enemy.intent.targetCoord.c];
      const toPt = this.tileToScreen(
        enemy.intent.targetCoord.r,
        enemy.intent.targetCoord.c,
        Math.max(0, targetTile?.elevation ?? 0) + 0.15,
      );

      // Draw affected danger tiles
      for (const cell of enemy.intent.affectedTiles) {
        const cellTile = state.board[cell.r]?.[cell.c];
        if (!cellTile) continue;
        const cPt = this.tileToScreen(
          cell.r,
          cell.c,
          Math.max(0, cellTile.elevation) + 0.04,
        );
        const occupant = state.units.find(
          (u) => u.hp > 0 && u.r === cell.r && u.c === cell.c,
        );
        const isFriendlyFire =
          occupant && occupant.team === 'enemy' && occupant.uid !== enemy.uid;

        ctx.fillStyle = isFriendlyFire
          ? 'rgba(245, 158, 11, 0.34)'
          : 'rgba(239, 68, 68, 0.28)';
        ctx.strokeStyle = isFriendlyFire ? '#FBBF24' : '#EF4444';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(cPt.x, cPt.y - hh);
        ctx.lineTo(cPt.x + hw, cPt.y);
        ctx.lineTo(cPt.x, cPt.y + hh);
        ctx.lineTo(cPt.x - hw, cPt.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Draw aim line from enemy to target
      ctx.save();
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.86)';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      if (enemy.intent.pattern === 'lob_artillery') {
        const midX = (fromPt.x + toPt.x) * 0.5;
        const midY = Math.min(fromPt.y, toPt.y) - 44;
        ctx.moveTo(fromPt.x, fromPt.y - 12);
        ctx.quadraticCurveTo(midX, midY, toPt.x, toPt.y);
      } else {
        ctx.moveTo(fromPt.x, fromPt.y - 8);
        ctx.lineTo(toPt.x, toPt.y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawUnitConstruct(
    ctx: CanvasRenderingContext2D,
    unit: UnitState,
    tileElev: number,
    isSelected: boolean,
  ): void {
    const hoverBob = unit.flying
      ? Math.sin(this.timeSec * 3.8 + unit.r) * 4 - 8
      : 0;
    const basePt = this.tileToScreen(unit.r, unit.c, tileElev);
    const ux = basePt.x;
    const uy = basePt.y + hoverBob;

    // Ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.ellipse(
      basePt.x,
      basePt.y + 3,
      this.halfW * 0.38,
      this.halfH * 0.36,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    // Selection ring
    if (isSelected) {
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(
        basePt.x,
        basePt.y + 2,
        this.halfW * 0.52,
        this.halfH * 0.52,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }

    if (unit.team === 'player') {
      // Player Bronze-and-Jade Automaton
      const mainHex =
        unit.mechId === 'titan'
          ? '#10B981'
          : unit.mechId === 'arbalest'
            ? '#F59E0B'
            : '#06B6D4';

      // Chassis body
      ctx.fillStyle = '#1F2937';
      ctx.strokeStyle = mainHex;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ux, uy - 28);
      ctx.lineTo(ux + 15, uy - 14);
      ctx.lineTo(ux + 12, uy + 2);
      ctx.lineTo(ux - 12, uy + 2);
      ctx.lineTo(ux - 15, uy - 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Glowing core visor
      ctx.fillStyle = mainHex;
      ctx.fillRect(ux - 6, uy - 18, 12, 5);
    } else {
      // Enemy Abyssal Iron Construct
      const isBoss = unit.enemyId === 'taotie_boss';
      const rSize = isBoss ? 19 : 14;
      const hSize = isBoss ? 32 : 24;

      ctx.fillStyle = '#2A1215';
      ctx.strokeStyle = isBoss ? '#FBBF24' : '#EF4444';
      ctx.lineWidth = isBoss ? 2.5 : 1.8;
      ctx.beginPath();
      ctx.moveTo(ux, uy - hSize);
      ctx.lineTo(ux + rSize, uy - hSize * 0.45);
      ctx.lineTo(ux + rSize * 0.8, uy + 2);
      ctx.lineTo(ux - rSize * 0.8, uy + 2);
      ctx.lineTo(ux - rSize, uy - hSize * 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Crimson eye core
      ctx.fillStyle = '#FCA5A5';
      ctx.beginPath();
      ctx.arc(ux, uy - hSize * 0.5, isBoss ? 4.5 : 3.2, 0, Math.PI * 2);
      ctx.fill();

      // Order Index badge (#1, #2...)
      ctx.fillStyle = '#18181B';
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(ux + rSize, uy - hSize + 2, 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#FCA5A5';
      ctx.font = '700 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${unit.orderIndex}`, ux + rSize, uy - hSize + 5);
    }

    // Jade Aegis Shield Dome
    if (unit.shielded) {
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.85)';
      ctx.fillStyle = 'rgba(6, 182, 212, 0.18)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(ux, uy - 12, 19, 17, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Waterlogged / Disabled indicator
    if (unit.waterlogged || unit.shocked) {
      ctx.fillStyle = '#38BDF8';
      ctx.font = '700 10px "Plus Jakarta Sans", "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('熄火', ux, uy + 13);
    }

    // Segmented HP Bar above construct
    const pipW = 7;
    const pipGap = 2;
    const totalW = unit.maxHp * pipW + (unit.maxHp - 1) * pipGap;
    const startX = ux - totalW * 0.5;
    const barY = uy - (unit.enemyId === 'taotie_boss' ? 40 : 35);

    ctx.fillStyle = 'rgba(12, 10, 9, 0.85)';
    ctx.fillRect(startX - 2, barY - 2, totalW + 4, 8);

    for (let i = 0; i < unit.maxHp; i++) {
      const px = startX + i * (pipW + pipGap);
      if (i < unit.hp) {
        ctx.fillStyle = unit.team === 'player' ? '#10B981' : '#EF4444';
      } else {
        ctx.fillStyle = '#3F3F46';
      }
      ctx.fillRect(px, barY, pipW, 4);
    }
  }

  private drawConsequencePreview(
    ctx: CanvasRenderingContext2D,
    baseState: BattleState,
    preview: ActionPreviewResult,
    isHintSuggestion: boolean,
  ): void {
    // 1. Lightning conduction path
    if (preview.lightningPath.length > 1) {
      ctx.save();
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      preview.lightningPath.forEach((coord, idx) => {
        const pt = this.tileToScreen(coord.r, coord.c, 0.35);
        if (idx === 0) ctx.moveTo(pt.x, pt.y - 10);
        else ctx.lineTo(pt.x, pt.y - 10);
      });
      ctx.stroke();
      ctx.restore();
    }

    // 2. Displacement arrows (Push / Pull / Swap / Luopan Rotate)
    for (const disp of preview.displacements) {
      const fTile = baseState.board[disp.from.r]?.[disp.from.c];
      const tTile = baseState.board[disp.to.r]?.[disp.to.c];
      const fromPt = this.tileToScreen(
        disp.from.r,
        disp.from.c,
        Math.max(0, fTile?.elevation ?? 0) + 0.25,
      );
      const toPt = this.tileToScreen(
        disp.to.r,
        disp.to.c,
        Math.max(0, tTile?.elevation ?? 0) + 0.25,
      );

      if (!coordsEqual(disp.from, disp.to)) {
        ctx.save();
        ctx.strokeStyle = isHintSuggestion ? '#34D399' : '#FBBF24';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(fromPt.x, fromPt.y - 8);
        ctx.lineTo(toPt.x, toPt.y - 8);
        ctx.stroke();

        // Arrowhead
        const ang = Math.atan2(toPt.y - fromPt.y, toPt.x - fromPt.x);
        ctx.fillStyle = isHintSuggestion ? '#34D399' : '#FBBF24';
        ctx.beginPath();
        ctx.moveTo(toPt.x, toPt.y - 8);
        ctx.lineTo(
          toPt.x - Math.cos(ang - 0.45) * 11,
          toPt.y - 8 - Math.sin(ang - 0.45) * 11,
        );
        ctx.lineTo(
          toPt.x - Math.cos(ang + 0.45) * 11,
          toPt.y - 8 - Math.sin(ang + 0.45) * 11,
        );
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // 3. Consequence Badges on Affected Tiles
    for (const eff of preview.affectedTiles) {
      if (!eff.badgeText) continue;
      const tile = baseState.board[eff.coord.r]?.[eff.coord.c];
      const pt = this.tileToScreen(
        eff.coord.r,
        eff.coord.c,
        Math.max(0, tile?.elevation ?? 0) + 0.65,
      );

      const bgHex =
        eff.badgeTone === 'danger'
          ? 'rgba(153, 27, 27, 0.94)'
          : eff.badgeTone === 'jade'
            ? 'rgba(6, 95, 70, 0.94)'
            : eff.badgeTone === 'cyan'
              ? 'rgba(14, 116, 144, 0.94)'
              : 'rgba(146, 64, 14, 0.94)';
      const borderHex =
        eff.badgeTone === 'danger'
          ? '#FCA5A5'
          : eff.badgeTone === 'jade'
            ? '#6EE7B7'
            : eff.badgeTone === 'cyan'
              ? '#67E8F9'
              : '#FDE68A';

      ctx.font = '700 11px "Plus Jakarta Sans", "Noto Sans SC", sans-serif';
      const textW = ctx.measureText(eff.badgeText).width + 12;
      const bx = pt.x - textW * 0.5;
      const by = pt.y - 34;

      ctx.fillStyle = bgHex;
      ctx.strokeStyle = borderHex;
      ctx.lineWidth = 1.2;
      ctx.fillRect(bx, by, textW, 18);
      ctx.strokeRect(bx, by, textW, 18);

      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(eff.badgeText, pt.x, by + 13);
    }
  }

  private updateAndDrawEffects(
    ctx: CanvasRenderingContext2D,
    dt: number,
  ): void {
    // Active weapon arcs
    for (let i = this.activeArcs.length - 1; i >= 0; i--) {
      const arc = this.activeArcs[i];
      arc.progress += dt / arc.duration;
      if (arc.progress >= 1) {
        this.activeArcs.splice(i, 1);
        continue;
      }

      const t = arc.progress;
      ctx.save();
      ctx.strokeStyle = arc.color;
      ctx.lineWidth = 3 * (1 - t * 0.5);

      if (arc.kind === 'mortar_arc') {
        const cx = arc.fromX + (arc.toX - arc.fromX) * t;
        const cy =
          arc.fromY +
          (arc.toY - arc.fromY) * t -
          Math.sin(t * Math.PI) * 90;
        ctx.fillStyle = '#FBBF24';
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fill();
      } else if (arc.pathScreen && arc.pathScreen.length > 1) {
        ctx.beginPath();
        arc.pathScreen.forEach((pt, idx) => {
          const jitterX = (Math.random() - 0.5) * 6;
          const jitterY = (Math.random() - 0.5) * 6;
          if (idx === 0) ctx.moveTo(pt.x, pt.y - 12);
          else ctx.lineTo(pt.x + jitterX, pt.y - 12 + jitterY);
        });
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(arc.fromX, arc.fromY - 12);
        ctx.lineTo(arc.toX, arc.toY - 12);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Pooled particles
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 180 * dt;
      const alpha = Math.max(0, 1 - p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // Pooled floating banners
    for (const b of this.banners) {
      if (!b.active) continue;
      b.life += dt;
      if (b.life >= b.maxLife) {
        b.active = false;
        continue;
      }
      b.y -= 22 * dt;
      const alpha = Math.max(0, 1 - b.life / b.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = '700 13px "Plus Jakarta Sans", "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#09090B';
      ctx.fillText(b.text, b.x + 1, b.y + 1);
      ctx.fillStyle = b.color;
      ctx.fillText(b.text, b.x, b.y);
      ctx.restore();
    }
  }
}
