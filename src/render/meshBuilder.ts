import type { RoadsideProp, StageDefinition, SurfaceType } from '../game/types.ts';

/**
 * Interleaved Vertex Format (10 floats per vertex = 40 bytes):
 * [x, y, z, nx, ny, nz, r, g, b, matType]
 * matType:
 *  0 = standard matte/terrain
 *  1 = road surface (procedural high-freq gravel/tarmac/snow shader)
 *  2 = glossy car body / metallic
 *  3 = emissive / lamp / shift LED / backfire
 *  4 = retro-reflective chevron / brake board / gantry banner (brightens intensely in headlight cone)
 *  5 = water / ice specular surface
 *  6 = unlit atmospheric particle / contact shadow (fog-integrated, never darkens into black cubes)
 */
export const FLOATS_PER_VERTEX = 10;

export class DynamicMeshBuilder {
  private data: number[] = [];

  public clear(): void {
    this.data.length = 0;
  }

  public getFloat32Array(): Float32Array {
    return new Float32Array(this.data);
  }

  public getVertexCount(): number {
    return this.data.length / FLOATS_PER_VERTEX;
  }

  public pushVertex(
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    r: number,
    g: number,
    b: number,
    matType: number = 0
  ): void {
    this.data.push(x, y, z, nx, ny, nz, r, g, b, matType);
  }

  public addTriangle(
    x1: number, y1: number, z1: number,
    x2: number, y2: number, z2: number,
    x3: number, y3: number, z3: number,
    r: number, g: number, b: number,
    matType: number = 0
  ): void {
    const ux = x2 - x1;
    const uy = y2 - y1;
    const uz = z2 - z1;
    const vx = x3 - x1;
    const vy = y3 - y1;
    const vz = z3 - z1;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;

    this.pushVertex(x1, y1, z1, nx, ny, nz, r, g, b, matType);
    this.pushVertex(x2, y2, z2, nx, ny, nz, r, g, b, matType);
    this.pushVertex(x3, y3, z3, nx, ny, nz, r, g, b, matType);
  }

  public addQuad(
    x1: number, y1: number, z1: number,
    x2: number, y2: number, z2: number,
    x3: number, y3: number, z3: number,
    x4: number, y4: number, z4: number,
    r: number, g: number, b: number,
    matType: number = 0
  ): void {
    this.addTriangle(x1, y1, z1, x2, y2, z2, x3, y3, z3, r, g, b, matType);
    this.addTriangle(x1, y1, z1, x3, y3, z3, x4, y4, z4, r, g, b, matType);
  }

  public addBox(
    cx: number,
    cy: number,
    cz: number,
    sx: number,
    sy: number,
    sz: number,
    r: number,
    g: number,
    b: number,
    matType: number = 0,
    yaw: number = 0
  ): void {
    const hx = sx * 0.5;
    const hy = sy * 0.5;
    const hz = sz * 0.5;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);

    const rot = (lx: number, ly: number, lz: number): [number, number, number] => [
      cx + lx * cosY + lz * sinY,
      cy + ly,
      cz - lx * sinY + lz * cosY,
    ];

    const p000 = rot(-hx, -hy, -hz);
    const p100 = rot(hx, -hy, -hz);
    const p101 = rot(hx, -hy, hz);
    const p001 = rot(-hx, -hy, hz);

    const p010 = rot(-hx, hy, -hz);
    const p110 = rot(hx, hy, -hz);
    const p111 = rot(hx, hy, hz);
    const p011 = rot(-hx, hy, hz);

    const shade = matType === 6 ? 1.0 : 0.88;
    const bottomShade = matType === 6 ? 1.0 : 0.72;

    // Top (+Y)
    this.addQuad(...p010, ...p011, ...p111, ...p110, r, g, b, matType);
    // Bottom (-Y)
    this.addQuad(...p000, ...p100, ...p101, ...p001, r * bottomShade, g * bottomShade, b * bottomShade, matType);
    // Front (+Z)
    this.addQuad(...p001, ...p101, ...p111, ...p011, r * shade, g * shade, b * shade, matType);
    // Back (-Z)
    this.addQuad(...p100, ...p000, ...p010, ...p110, r * shade, g * shade, b * shade, matType);
    // Right (+X)
    this.addQuad(...p101, ...p100, ...p110, ...p111, r * shade, g * shade, b * shade, matType);
    // Left (-X)
    this.addQuad(...p000, ...p001, ...p011, ...p010, r * shade, g * shade, b * shade, matType);
  }

  public addCone(
    cx: number,
    baseY: number,
    cz: number,
    radius: number,
    height: number,
    segments: number,
    r: number,
    g: number,
    b: number,
    matType: number = 0
  ): void {
    const topY = baseY + height;
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const x0 = cx + Math.cos(a0) * radius;
      const z0 = cz + Math.sin(a0) * radius;
      const x1 = cx + Math.cos(a1) * radius;
      const z1 = cz + Math.sin(a1) * radius;
      this.addTriangle(x0, baseY, z0, x1, baseY, z1, cx, topY, cz, r, g, b, matType);
    }
  }
}

function getRoadSurfaceColor(surface: SurfaceType, stageId: string): [number, number, number, number] {
  switch (surface) {
    case 'gravel':
      // Warmer golden gravel on Finland Ouninpohja vs wet Welsh slate-brown gravel
      if (stageId === 'finland_jumps') {
        return [0.58, 0.46, 0.31, 1];
      }
      return [0.46, 0.37, 0.28, 1];
    case 'tarmac':
      return [0.22, 0.24, 0.28, 1];
    case 'tarmac_dirty':
      return [0.36, 0.32, 0.27, 1];
    case 'snow':
      return [0.87, 0.91, 0.96, 1];
    case 'ice':
      return [0.62, 0.78, 0.93, 5];
    case 'water_puddle':
      return [0.19, 0.30, 0.39, 5];
    case 'offtrack':
      return [0.22, 0.31, 0.18, 0];
  }
}

function getVergeColor(primarySurface: SurfaceType, stageId: string): [number, number, number] {
  if (primarySurface === 'snow') return [0.90, 0.93, 0.98];
  if (stageId === 'finland_jumps') return [0.26, 0.38, 0.18];
  if (stageId === 'sichuan_cloud_pass') return [0.25, 0.31, 0.24];
  if (primarySurface === 'tarmac') return [0.26, 0.32, 0.22];
  return [0.23, 0.33, 0.17];
}

/**
 * Builds the entire 3D stage road ribbon, wheel ruts, tarmac edge markings, apex rumble curbs,
 * shoulders, ditches, wide valley embankments, and all 3D composite roadside landmarks.
 */
export function buildStageStaticMesh(stage: StageDefinition): Float32Array {
  const mb = new DynamicMeshBuilder();
  const segs = stage.segments;
  const vergeBase = getVergeColor(stage.primarySurface, stage.id);

  for (let i = 0; i < segs.length - 1; i++) {
    const s0 = segs[i];
    const s1 = segs[i + 1];

    const hw0 = s0.widthM * 0.5;
    const hw1 = s1.widthM * 0.5;

    const cam0 = Math.sin(s0.camberRad);
    const cam1 = Math.sin(s1.camberRad);

    // Road left and right edges
    const l0x = s0.x - s0.normalX * hw0;
    const l0y = s0.y - hw0 * cam0;
    const l0z = s0.z - s0.normalZ * hw0;

    const r0x = s0.x + s0.normalX * hw0;
    const r0y = s0.y + hw0 * cam0;
    const r0z = s0.z + s0.normalZ * hw0;

    const l1x = s1.x - s1.normalX * hw1;
    const l1y = s1.y - hw1 * cam1;
    const l1z = s1.z - s1.normalZ * hw1;

    const r1x = s1.x + s1.normalX * hw1;
    const r1y = s1.y + hw1 * cam1;
    const r1z = s1.z + s1.normalZ * hw1;

    const [rr, rg, rb, rMat] = getRoadSurfaceColor(s0.surface, stage.id);

    // Subdivide road across width into 3 strips so wheel ruts and crown are visible in 3D
    const il0x = s0.x - s0.normalX * (hw0 * 0.38);
    const il0y = s0.y - hw0 * 0.38 * cam0 - 0.02;
    const il0z = s0.z - s0.normalZ * (hw0 * 0.38);

    const ir0x = s0.x + s0.normalX * (hw0 * 0.38);
    const ir0y = s0.y + hw0 * 0.38 * cam0 - 0.02;
    const ir0z = s0.z + s0.normalZ * (hw0 * 0.38);

    const il1x = s1.x - s1.normalX * (hw1 * 0.38);
    const il1y = s1.y - hw1 * 0.38 * cam1 - 0.02;
    const il1z = s1.z - s1.normalZ * (hw1 * 0.38);

    const ir1x = s1.x + s1.normalX * (hw1 * 0.38);
    const ir1y = s1.y + hw1 * 0.38 * cam1 - 0.02;
    const ir1z = s1.z + s1.normalZ * (hw1 * 0.38);

    // Left outer lane
    mb.addQuad(l0x, l0y, l0z, il0x, il0y, il0z, il1x, il1y, il1z, l1x, l1y, l1z, rr, rg, rb, rMat);
    // Center crown / rut strip
    mb.addQuad(
      il0x, il0y, il0z,
      ir0x, ir0y, ir0z,
      ir1x, ir1y, ir1z,
      il1x, il1y, il1z,
      rr * 0.87,
      rg * 0.87,
      rb * 0.87,
      rMat
    );
    // Right outer lane
    mb.addQuad(ir0x, ir0y, ir0z, r0x, r0y, r0z, r1x, r1y, r1z, ir1x, ir1y, ir1z, rr, rg, rb, rMat);

    // Painted edge stripes on Tarmac / Dirty Tarmac (offset +0.02m on Y to prevent Z-fighting)
    if (s0.surface === 'tarmac' || s0.surface === 'tarmac_dirty') {
      const lineInset = 0.24;
      const lineW = 0.13;
      const lineTone = s0.surface === 'tarmac_dirty' ? 0.62 : 0.84;

      // Left edge line
      const ll0x = l0x + s0.normalX * lineInset;
      const ll0z = l0z + s0.normalZ * lineInset;
      const ll1x = l1x + s1.normalX * lineInset;
      const ll1z = l1z + s1.normalZ * lineInset;
      mb.addQuad(
        ll0x, l0y + 0.02, ll0z,
        ll0x + s0.normalX * lineW, l0y + 0.02, ll0z + s0.normalZ * lineW,
        ll1x + s1.normalX * lineW, l1y + 0.02, ll1z + s1.normalZ * lineW,
        ll1x, l1y + 0.02, ll1z,
        lineTone, lineTone, lineTone * 0.96, 0
      );

      // Right edge line
      const rl0x = r0x - s0.normalX * (lineInset + lineW);
      const rl0z = r0z - s0.normalZ * (lineInset + lineW);
      const rl1x = r1x - s1.normalX * (lineInset + lineW);
      const rl1z = r1z - s1.normalZ * (lineInset + lineW);
      mb.addQuad(
        rl0x, r0y + 0.02, rl0z,
        rl0x + s0.normalX * lineW, r0y + 0.02, rl0z + s0.normalZ * lineW,
        rl1x + s1.normalX * lineW, r1y + 0.02, rl1z + s1.normalZ * lineW,
        rl1x, r1y + 0.02, rl1z,
        lineTone, lineTone, lineTone * 0.96, 0
      );
    }

    // FIA Red-and-White Apex Rumble Curbs on medium-to-tight corners (|curvature| > 0.015)
    if (Math.abs(s0.curvature) > 0.015 && stage.primarySurface !== 'snow') {
      const curbW = 0.42;
      const isRed = i % 2 === 0;
      const cr = isRed ? 0.86 : 0.93;
      const cg = isRed ? 0.16 : 0.93;
      const cb = isRed ? 0.14 : 0.95;

      if (s0.curvature > 0) {
        // Right turn -> inside apex curb on right edge
        mb.addQuad(
          r0x - s0.normalX * 0.1, r0y + 0.03, r0z - s0.normalZ * 0.1,
          r0x + s0.normalX * curbW, r0y + 0.04, r0z + s0.normalZ * curbW,
          r1x + s1.normalX * curbW, r1y + 0.04, r1z + s1.normalZ * curbW,
          r1x - s1.normalX * 0.1, r1y + 0.03, r1z - s1.normalZ * 0.1,
          cr, cg, cb, 0
        );
      } else {
        // Left turn -> inside apex curb on left edge
        mb.addQuad(
          l0x - s0.normalX * curbW, l0y + 0.04, l0z - s0.normalZ * curbW,
          l0x + s0.normalX * 0.1, l0y + 0.03, l0z + s0.normalZ * 0.1,
          l1x + s1.normalX * 0.1, l1y + 0.03, l1z + s1.normalZ * 0.1,
          l1x - s1.normalX * curbW, l1y + 0.04, l1z - s1.normalZ * curbW,
          cr, cg, cb, 0
        );
      }
    }

    // Shoulder / drainage ditch (3.5m wide)
    const ditchW = 3.5;
    const dl0x = l0x - s0.normalX * ditchW;
    const dl0y = l0y - 0.32;
    const dl0z = l0z - s0.normalZ * ditchW;

    const dr0x = r0x + s0.normalX * ditchW;
    const dr0y = r0y - 0.32;
    const dr0z = r0z + s0.normalZ * ditchW;

    const dl1x = l1x - s1.normalX * ditchW;
    const dl1y = l1y - 0.32;
    const dl1z = l1z - s1.normalZ * ditchW;

    const dr1x = r1x + s1.normalX * ditchW;
    const dr1y = r1y - 0.32;
    const dr1z = r1z + s1.normalZ * ditchW;

    const shR = stage.primarySurface === 'snow' ? 0.92 : vergeBase[0] * 1.1;
    const shG = stage.primarySurface === 'snow' ? 0.95 : vergeBase[1] * 1.05;
    const shB = stage.primarySurface === 'snow' ? 0.99 : vergeBase[2] * 0.95;

    mb.addQuad(dl0x, dl0y, dl0z, l0x, l0y, l0z, l1x, l1y, l1z, dl1x, dl1y, dl1z, shR, shG, shB, 0);
    mb.addQuad(r0x, r0y, r0z, dr0x, dr0y, dr0z, dr1x, dr1y, dr1z, r1x, r1y, r1z, shR, shG, shB, 0);

    // Wide outer valley / mountain embankment (54m each side so terrain meets horizon seamlessly)
    const outW = 54.0;
    const leftSlopeH0 =
      s0.sceneryType === 'cliff'
        ? s0.curvature >= 0
          ? -14.0
          : 19.5
        : 5.5 + Math.sin(i * 0.13) * 3.2;
    const rightSlopeH0 =
      s0.sceneryType === 'cliff'
        ? s0.curvature >= 0
          ? 19.5
          : -14.0
        : 5.5 + Math.cos(i * 0.11) * 3.2;
    const leftSlopeH1 =
      s1.sceneryType === 'cliff'
        ? s1.curvature >= 0
          ? -14.0
          : 19.5
        : 5.5 + Math.sin((i + 1) * 0.13) * 3.2;
    const rightSlopeH1 =
      s1.sceneryType === 'cliff'
        ? s1.curvature >= 0
          ? 19.5
          : -14.0
        : 5.5 + Math.cos((i + 1) * 0.11) * 3.2;

    const ol0x = dl0x - s0.normalX * outW;
    const ol0y = dl0y + leftSlopeH0;
    const ol0z = dl0z - s0.normalZ * outW;

    const or0x = dr0x + s0.normalX * outW;
    const or0y = dr0y + rightSlopeH0;
    const or0z = dr0z + s0.normalZ * outW;

    const ol1x = dl1x - s1.normalX * outW;
    const ol1y = dl1y + leftSlopeH1;
    const ol1z = dl1z - s1.normalZ * outW;

    const or1x = dr1x + s1.normalX * outW;
    const or1y = dr1y + rightSlopeH1;
    const or1z = dr1z + s1.normalZ * outW;

    mb.addQuad(
      ol0x, ol0y, ol0z,
      dl0x, dl0y, dl0z,
      dl1x, dl1y, dl1z,
      ol1x, ol1y, ol1z,
      vergeBase[0],
      vergeBase[1],
      vergeBase[2],
      0
    );
    mb.addQuad(
      dr0x, dr0y, dr0z,
      or0x, or0y, or0z,
      or1x, or1y, or1z,
      dr1x, dr1y, dr1z,
      vergeBase[0] * 0.92,
      vergeBase[1] * 0.92,
      vergeBase[2] * 0.92,
      0
    );
  }

  // Add all 3D Roadside Props (Multi-part composite meshes)
  const isSnow = stage.primarySurface === 'snow';
  const isFinland = stage.id === 'finland_jumps';
  for (const prop of stage.props) {
    appendPropMesh(mb, prop, isSnow, isFinland);
  }

  return mb.getFloat32Array();
}

function appendPropMesh(
  mb: DynamicMeshBuilder,
  p: RoadsideProp,
  isSnowStage: boolean,
  isFinlandStage: boolean
): void {
  const s = p.scale;
  switch (p.type) {
    case 'pine_tree': {
      mb.addBox(p.x, p.y + 1.1 * s, p.z, 0.36 * s, 2.2 * s, 0.36 * s, 0.34, 0.22, 0.14, 0, p.yaw);
      const gTint = isSnowStage ? 0.65 : 0.33;
      const bTint = isSnowStage ? 0.72 : 0.18;
      const rTint = isSnowStage ? 0.58 : 0.14;
      mb.addCone(p.x, p.y + 1.6 * s, p.z, 1.85 * s, 2.8 * s, 6, rTint, gTint, bTint, 0);
      mb.addCone(p.x, p.y + 3.2 * s, p.z, 1.45 * s, 2.5 * s, 6, rTint * 1.08, gTint * 1.08, bTint * 1.08, 0);
      mb.addCone(p.x, p.y + 4.7 * s, p.z, 0.98 * s, 2.2 * s, 6, rTint * 1.18, gTint * 1.18, bTint * 1.18, 0);
      break;
    }
    case 'birch_tree': {
      // White birch bark trunk + autumn gold / snowy / fresh green canopy
      mb.addBox(p.x, p.y + 1.6 * s, p.z, 0.26 * s, 3.2 * s, 0.26 * s, 0.88, 0.87, 0.84, 0, p.yaw);
      const rLeaf = isSnowStage ? 0.74 : isFinlandStage ? 0.78 : 0.32;
      const gLeaf = isSnowStage ? 0.80 : isFinlandStage ? 0.64 : 0.52;
      const bLeaf = isSnowStage ? 0.86 : isFinlandStage ? 0.18 : 0.22;
      mb.addCone(p.x, p.y + 2.4 * s, p.z, 1.5 * s, 3.0 * s, 6, rLeaf, gLeaf, bLeaf, 0);
      mb.addCone(p.x, p.y + 4.1 * s, p.z, 1.1 * s, 2.2 * s, 6, rLeaf * 1.1, gLeaf * 1.1, bLeaf * 1.1, 0);
      break;
    }
    case 'rock_outcrop': {
      mb.addBox(p.x, p.y + 0.65 * s, p.z, 1.8 * s, 1.3 * s, 1.5 * s, 0.38, 0.39, 0.42, 0, p.yaw);
      mb.addBox(
        p.x + 0.45 * s,
        p.y + 1.1 * s,
        p.z - 0.2 * s,
        1.1 * s,
        1.2 * s,
        1.1 * s,
        0.45,
        0.46,
        0.49,
        0,
        p.yaw + 0.6
      );
      break;
    }
    case 'guardrail': {
      mb.addBox(p.x, p.y + 0.62, p.z, 0.18, 0.28, 8.8, 0.70, 0.73, 0.78, 2, p.yaw);
      mb.addBox(p.x, p.y + 0.35, p.z, 0.14, 0.7, 0.14, 0.42, 0.44, 0.47, 0, p.yaw);
      break;
    }
    case 'bridge_parapet': {
      mb.addBox(p.x, p.y + 0.65, p.z, 0.44, 1.3, 9.6, 0.48, 0.43, 0.37, 0, p.yaw);
      mb.addBox(p.x, p.y + 1.35, p.z, 0.50, 0.16, 9.6, 0.90, 0.55, 0.10, 4, p.yaw);
      break;
    }
    case 'stone_wall': {
      // Alpine village masonry house + pitched terracotta roof + warm glowing windows
      mb.addBox(p.x, p.y + 1.8 * s, p.z, 1.8 * s, 3.6 * s, 8.4, 0.58, 0.54, 0.48, 0, p.yaw);
      mb.addBox(p.x, p.y + 3.78 * s, p.z, 2.15 * s, 0.38 * s, 8.7, 0.46, 0.24, 0.17, 0, p.yaw);
      mb.addBox(p.x, p.y + 2.15 * s, p.z, 1.86 * s, 0.55, 1.2, 0.98, 0.78, 0.36, 3, p.yaw);
      break;
    }
    case 'chevron_sign': {
      mb.addBox(p.x, p.y + 0.65, p.z, 0.1, 1.3, 0.1, 0.5, 0.5, 0.55, 0, p.yaw);
      mb.addBox(p.x, p.y + 1.35, p.z, 0.14, 0.65, 1.15, 0.98, 0.76, 0.08, 4, p.yaw);
      mb.addBox(p.x, p.y + 1.35, p.z, 0.16, 0.32, 0.55, 0.92, 0.15, 0.12, 4, p.yaw);
      break;
    }
    case 'brake_board': {
      // FIA Red/White High-Visibility Braking Marker Board
      mb.addBox(p.x, p.y + 0.55 * s, p.z, 0.09, 1.1 * s, 0.09, 0.75, 0.76, 0.78, 0, p.yaw);
      mb.addBox(p.x, p.y + 1.22 * s, p.z, 0.78 * s, 0.56 * s, 0.10, 0.92, 0.14, 0.12, 4, p.yaw);
      mb.addBox(p.x, p.y + 1.22 * s, p.z, 0.56 * s, 0.22 * s, 0.12, 0.96, 0.96, 0.98, 4, p.yaw);
      break;
    }
    case 'spectator_tent': {
      // WRC Rally Fan Zone Canopy Tent + Warm Flood Lamp
      mb.addBox(p.x, p.y + 1.25, p.z, 3.2, 0.12, 3.2, 0.12, 0.38, 0.78, 2, p.yaw);
      mb.addCone(p.x, p.y + 2.45, p.z, 2.25, 0.95, 4, 0.95, 0.60, 0.08, 2);
      mb.addBox(p.x - 1.3, p.y + 1.2, p.z - 1.3, 0.08, 2.4, 0.08, 0.65, 0.68, 0.72, 0, p.yaw);
      mb.addBox(p.x + 1.3, p.y + 1.2, p.z + 1.3, 0.08, 2.4, 0.08, 0.65, 0.68, 0.72, 0, p.yaw);
      mb.addBox(p.x, p.y + 2.15, p.z, 0.32, 0.18, 0.32, 1.0, 0.86, 0.52, 3, p.yaw);
      break;
    }
    case 'marshal_hut': {
      mb.addBox(p.x, p.y + 1.25, p.z, 2.4, 2.5, 3.2, 0.18, 0.22, 0.28, 0, p.yaw);
      mb.addBox(p.x, p.y + 2.6, p.z, 2.7, 0.25, 3.5, 0.95, 0.60, 0.08, 3, p.yaw);
      break;
    }
    case 'start_arch': {
      // Grand WRC Stage Start Truss Gantry + 5 Start Countdown Lamps
      const cosY = Math.cos(p.yaw);
      const sinY = Math.sin(p.yaw);
      const span = 4.75;
      // Left & Right steel truss towers
      mb.addBox(p.x - cosY * span, p.y + 2.6, p.z + sinY * span, 0.58, 5.2, 0.58, 0.14, 0.17, 0.22, 2, p.yaw);
      mb.addBox(p.x + cosY * span, p.y + 2.6, p.z - sinY * span, 0.58, 5.2, 0.58, 0.14, 0.17, 0.22, 2, p.yaw);
      // Amber vertical accent stripes on towers
      mb.addBox(p.x - cosY * span, p.y + 2.6, p.z + sinY * span, 0.62, 3.4, 0.22, 0.95, 0.60, 0.08, 4, p.yaw);
      mb.addBox(p.x + cosY * span, p.y + 2.6, p.z - sinY * span, 0.62, 3.4, 0.22, 0.95, 0.60, 0.08, 4, p.yaw);
      // Main overhead gantry bridge + glowing start light bar
      mb.addBox(p.x, p.y + 4.85, p.z, 10.2, 0.82, 0.72, 0.11, 0.14, 0.19, 2, p.yaw);
      mb.addBox(p.x, p.y + 4.85, p.z, 7.6, 0.34, 0.78, 0.96, 0.62, 0.08, 3, p.yaw);
      mb.addBox(p.x, p.y + 4.25, p.z, 3.2, 0.24, 0.35, 0.12, 0.92, 0.52, 3, p.yaw);
      break;
    }
    case 'split_arch': {
      // Intermediate Sector Split Timing Gantry
      const cosY = Math.cos(p.yaw);
      const sinY = Math.sin(p.yaw);
      const span = 4.55;
      mb.addBox(p.x - cosY * span, p.y + 2.3, p.z + sinY * span, 0.38, 4.6, 0.38, 0.20, 0.25, 0.32, 2, p.yaw);
      mb.addBox(p.x + cosY * span, p.y + 2.3, p.z - sinY * span, 0.38, 4.6, 0.38, 0.20, 0.25, 0.32, 2, p.yaw);
      mb.addBox(p.x, p.y + 4.45, p.z, 9.5, 0.46, 0.42, 0.14, 0.68, 0.88, 4, p.yaw);
      break;
    }
    case 'finish_arch': {
      // Spanning FIA Stage Flying Finish Gantry Arch
      const cosY = Math.cos(p.yaw);
      const sinY = Math.sin(p.yaw);
      const span = 4.7;
      mb.addBox(p.x - cosY * span, p.y + 2.5, p.z + sinY * span, 0.58, 5.0, 0.58, 0.88, 0.16, 0.14, 2, p.yaw);
      mb.addBox(p.x + cosY * span, p.y + 2.5, p.z - sinY * span, 0.58, 5.0, 0.58, 0.88, 0.16, 0.14, 2, p.yaw);
      mb.addBox(p.x, p.y + 4.65, p.z, 10.0, 0.82, 0.68, 0.96, 0.65, 0.08, 3, p.yaw);
      break;
    }
  }
}

/**
 * Builds the 12-part 3D WRC Rally1 Hybrid Chassis mesh (excluding the 4 independent wheels).
 */
export function buildRallyCarChassisMesh(isGhost: boolean = false): Float32Array {
  const mb = new DynamicMeshBuilder();
  if (isGhost) {
    mb.addBox(0, 0.56, 0, 1.76, 0.52, 4.12, 0.15, 0.82, 0.96, 3);
    mb.addBox(0, 1.02, -0.18, 1.44, 0.46, 2.05, 0.12, 0.65, 0.88, 3);
    mb.addBox(0, 1.18, -1.88, 1.62, 0.28, 0.42, 0.2, 0.9, 1.0, 3);
    return mb.getFloat32Array();
  }

  // 1. Main widebody lower tub (Motorsport Pearl White & Carbon trim)
  mb.addBox(0, 0.54, 0, 1.78, 0.48, 4.16, 0.94, 0.95, 0.97, 2);
  // 2. Front & Rear flared rally wheel arches + side hybrid air intakes
  mb.addBox(0, 0.58, 1.28, 1.90, 0.38, 0.96, 0.95, 0.60, 0.08, 2);
  mb.addBox(0, 0.60, -1.28, 1.90, 0.40, 0.98, 0.15, 0.19, 0.25, 2);
  mb.addBox(0, 0.62, -0.58, 1.86, 0.24, 0.52, 0.11, 0.13, 0.16, 0);
  // 3. Carbon front splitter, aero dive planes & rear WRC diffuser
  mb.addBox(0, 0.28, 2.05, 1.84, 0.11, 0.30, 0.09, 0.10, 0.12, 0);
  mb.addBox(0, 0.27, -2.04, 1.68, 0.14, 0.22, 0.09, 0.10, 0.12, 0);
  // 4. Greenhouse cabin & dark tinted windows
  mb.addBox(0, 1.02, -0.16, 1.46, 0.48, 2.12, 0.11, 0.14, 0.19, 2);
  // 5. Roof panel & WRC roof snorkel intake scoop
  mb.addBox(0, 1.28, -0.16, 1.36, 0.06, 1.65, 0.95, 0.96, 0.98, 2);
  mb.addBox(0, 1.35, 0.32, 0.34, 0.10, 0.48, 0.95, 0.60, 0.08, 2);
  // 6. Wing mirrors
  mb.addBox(-0.84, 0.92, 0.48, 0.16, 0.08, 0.12, 0.95, 0.60, 0.08, 2);
  mb.addBox(0.84, 0.92, 0.48, 0.16, 0.08, 0.12, 0.95, 0.60, 0.08, 2);
  // 7. Quad Rally Lamp Pod on front hood (emissive lenses)
  mb.addBox(0, 0.82, 1.92, 1.12, 0.16, 0.22, 0.12, 0.12, 0.14, 0);
  mb.addBox(0, 0.82, 2.03, 1.04, 0.12, 0.04, 1.0, 0.96, 0.82, 3);
  // 8. Rear Bi-Plane WRC Downforce Wing
  mb.addBox(-0.68, 1.08, -1.92, 0.06, 0.44, 0.44, 0.12, 0.13, 0.15, 0);
  mb.addBox(0.68, 1.08, -1.92, 0.06, 0.44, 0.44, 0.12, 0.13, 0.15, 0);
  mb.addBox(0, 1.28, -1.94, 1.70, 0.06, 0.40, 0.95, 0.60, 0.08, 2);
  mb.addBox(0, 1.13, -1.92, 1.56, 0.05, 0.32, 0.14, 0.15, 0.18, 0);
  // 9. Rear LED Tail Light Strip (running dim red; dynamic brake overlay brightens on braking)
  mb.addBox(0, 0.72, -2.09, 1.52, 0.09, 0.04, 0.55, 0.08, 0.08, 3);
  // 10. Red Rally Mudflaps behind all 4 wheels
  mb.addBox(-0.82, 0.26, 0.82, 0.28, 0.26, 0.03, 0.85, 0.14, 0.12, 0);
  mb.addBox(0.82, 0.26, 0.82, 0.28, 0.26, 0.03, 0.85, 0.14, 0.12, 0);
  mb.addBox(-0.82, 0.26, -1.72, 0.28, 0.28, 0.03, 0.85, 0.14, 0.12, 0);
  mb.addBox(0.82, 0.26, -1.72, 0.28, 0.28, 0.03, 0.85, 0.14, 0.12, 0);
  // 11. Twin Exhaust Tailpipes
  mb.addBox(0.48, 0.26, -2.12, 0.13, 0.13, 0.18, 0.38, 0.40, 0.44, 2);
  mb.addBox(-0.48, 0.26, -2.12, 0.13, 0.13, 0.18, 0.38, 0.40, 0.44, 2);

  return mb.getFloat32Array();
}

/**
 * Soft layered contact shadow quad beneath the WRC car for crisp figure-ground separation.
 */
export function buildCarContactShadowMesh(): Float32Array {
  const mb = new DynamicMeshBuilder();
  mb.addQuad(
    -1.02, 0.025, -2.22,
    1.02, 0.025, -2.22,
    1.02, 0.025, 2.22,
    -1.02, 0.025, 2.22,
    0.03, 0.04, 0.06, 6
  );
  return mb.getFloat32Array();
}

/**
 * High-intensity rear brake LED + high-mount wing brake lamp overlay when driver presses brake.
 */
export function buildBrakeGlowMesh(): Float32Array {
  const mb = new DynamicMeshBuilder();
  mb.addBox(0, 0.72, -2.115, 1.56, 0.11, 0.03, 1.0, 0.12, 0.08, 3);
  mb.addBox(0, 1.24, -2.12, 0.42, 0.045, 0.03, 1.0, 0.18, 0.08, 3);
  return mb.getFloat32Array();
}

/**
 * Twin WRC Anti-Lag Turbo Backfire Exhaust Flame plumes behind the rear tailpipes.
 */
export function buildExhaustBackfireMesh(): Float32Array {
  const mb = new DynamicMeshBuilder();
  for (const xOff of [-0.48, 0.48]) {
    // Inner blue-white hot core
    mb.addBox(xOff, 0.26, -2.32, 0.10, 0.10, 0.32, 0.85, 0.94, 1.0, 3);
    // Outer orange-amber flame plume
    mb.addBox(xOff, 0.26, -2.52, 0.17, 0.16, 0.56, 1.0, 0.52, 0.08, 3);
  }
  return mb.getFloat32Array();
}

/**
 * Builds a single 3D Rally Wheel & Tarmac/Gravel Rim mesh.
 */
export function buildWheelMesh(): Float32Array {
  const mb = new DynamicMeshBuilder();
  const r = 0.33;
  const halfW = 0.13;
  const segs = 12;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const y0 = Math.cos(a0) * r;
    const z0 = Math.sin(a0) * r;
    const y1 = Math.cos(a1) * r;
    const z1 = Math.sin(a1) * r;

    const treadShade = i % 2 === 0 ? 0.13 : 0.17;
    mb.addQuad(
      -halfW, y0, z0,
      halfW, y0, z0,
      halfW, y1, z1,
      -halfW, y1, z1,
      treadShade,
      treadShade,
      treadShade + 0.02,
      0
    );

    const spokeColor = i % 2 === 0 ? 0.90 : 0.52;
    mb.addTriangle(halfW, 0, 0, halfW, y1 * 0.72, z1 * 0.72, halfW, y0 * 0.72, z0 * 0.72, spokeColor, spokeColor * 0.92, 0.68, 2);
    mb.addTriangle(-halfW, 0, 0, -halfW, y0 * 0.72, z0 * 0.72, -halfW, y1 * 0.72, z1 * 0.72, spokeColor, spokeColor * 0.92, 0.68, 2);
  }
  return mb.getFloat32Array();
}

/**
 * Builds the 3D Cockpit Interior mesh — lowered dashboard & sleek FIA rollcage A-pillars
 * so the driver enjoys a wide, commanding windshield view of corners and crests.
 */
export function buildCockpitInteriorMesh(): Float32Array {
  const mb = new DynamicMeshBuilder();
  // Low-profile Alcantara charcoal dashboard cowl
  mb.addBox(0, 0.71, 0.58, 1.50, 0.14, 0.54, 0.07, 0.08, 0.10, 0);
  // Compact driver carbon binnacle hood
  mb.addBox(-0.32, 0.80, 0.48, 0.34, 0.08, 0.30, 0.05, 0.06, 0.08, 0);
  // Digital RPM shift strip on binnacle
  mb.addBox(-0.32, 0.845, 0.38, 0.22, 0.014, 0.02, 0.12, 0.92, 0.48, 3);
  // Center co-driver tripmeter / ECU console
  mb.addBox(0.14, 0.78, 0.50, 0.26, 0.12, 0.22, 0.10, 0.12, 0.15, 0);
  // Slim Left & Right FIA Steel Rollcage A-pillars
  mb.addBox(-0.76, 1.08, 0.44, 0.042, 0.64, 0.042, 0.20, 0.23, 0.28, 2);
  mb.addBox(0.76, 1.08, 0.44, 0.042, 0.64, 0.042, 0.20, 0.23, 0.28, 2);
  // Top rollcage sunstrip header
  mb.addBox(0, 1.40, 0.38, 1.52, 0.045, 0.15, 0.08, 0.09, 0.11, 0);
  // Sculpted front hood visible out through the windshield (nose apex reference)
  mb.addBox(0, 0.71, 1.38, 1.46, 0.06, 1.12, 0.93, 0.94, 0.96, 2);
  mb.addBox(-0.42, 0.745, 1.38, 0.22, 0.014, 1.05, 0.95, 0.60, 0.08, 2);
  mb.addBox(0.42, 0.745, 1.38, 0.22, 0.014, 1.05, 0.95, 0.60, 0.08, 2);
  return mb.getFloat32Array();
}

/**
 * Builds the dedicated 3D Bonnet & Quad Rally Lamp Pod mesh for Hood Camera view.
 */
export function buildHoodCameraMesh(): Float32Array {
  const mb = new DynamicMeshBuilder();
  mb.addBox(0, 0.72, 1.42, 1.56, 0.08, 1.25, 0.93, 0.94, 0.96, 2);
  mb.addBox(-0.44, 0.765, 1.42, 0.24, 0.015, 1.18, 0.95, 0.60, 0.08, 2);
  mb.addBox(0.44, 0.765, 1.42, 0.24, 0.015, 1.18, 0.95, 0.60, 0.08, 2);
  mb.addBox(-0.82, 0.74, 1.38, 0.18, 0.08, 0.85, 0.95, 0.60, 0.08, 2);
  mb.addBox(0.82, 0.74, 1.38, 0.18, 0.08, 0.85, 0.95, 0.60, 0.08, 2);
  mb.addBox(0, 0.78, 1.98, 1.08, 0.12, 0.18, 0.12, 0.13, 0.15, 0);
  return mb.getFloat32Array();
}

/**
 * Builds a sleek, low-occlusion 24-segment 3D Suede Steering Wheel + Yellow 12-o'clock Marker + Gloves.
 */
export function buildSteeringWheelAndHandsMesh(): Float32Array {
  const mb = new DynamicMeshBuilder();
  const outerR = 0.142;
  const innerR = 0.122;
  const segs = 24;

  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const midA = (a0 + a1) * 0.5;

    const x0Out = Math.cos(a0) * outerR;
    const y0Out = Math.sin(a0) * outerR;
    const x0In = Math.cos(a0) * innerR;
    const y0In = Math.sin(a0) * innerR;

    const x1Out = Math.cos(a1) * outerR;
    const y1Out = Math.sin(a1) * outerR;
    const x1In = Math.cos(a1) * innerR;
    const y1In = Math.sin(a1) * innerR;

    const isTopMarker = Math.abs(midA - Math.PI * 0.5) < 0.18;
    const r = isTopMarker ? 0.98 : 0.12;
    const g = isTopMarker ? 0.76 : 0.13;
    const b = isTopMarker ? 0.06 : 0.16;
    const mat = isTopMarker ? 3 : 0;

    mb.addQuad(x0In, y0In, -0.01, x0Out, y0Out, -0.01, x1Out, y1Out, -0.01, x1In, y1In, -0.01, r, g, b, mat);
    mb.addQuad(x0Out, y0Out, 0.01, x0In, y0In, 0.01, x1In, y1In, 0.01, x1Out, y1Out, 0.01, r * 0.8, g * 0.8, b * 0.8, mat);
  }

  mb.addBox(-0.065, 0, 0, 0.12, 0.020, 0.012, 0.28, 0.31, 0.36, 2);
  mb.addBox(0.065, 0, 0, 0.12, 0.020, 0.012, 0.28, 0.31, 0.36, 2);
  mb.addBox(0, -0.065, 0, 0.022, 0.12, 0.012, 0.28, 0.31, 0.36, 2);
  mb.addBox(0, 0, -0.005, 0.052, 0.052, 0.020, 0.14, 0.15, 0.18, 2);
  mb.addBox(0, 0, -0.016, 0.022, 0.022, 0.005, 0.95, 0.60, 0.08, 3);

  mb.addBox(-outerR + 0.01, 0.0, -0.012, 0.032, 0.048, 0.032, 0.92, 0.56, 0.08, 0);
  mb.addBox(outerR - 0.01, 0.0, -0.012, 0.032, 0.048, 0.032, 0.92, 0.56, 0.08, 0);

  return mb.getFloat32Array();
}
