import { RoadsideProp, StageDefinition, SurfaceType } from '../game/types.ts';

/**
 * Interleaved Vertex Format (10 floats per vertex = 40 bytes):
 * [x, y, z, nx, ny, nz, r, g, b, matType]
 * matType:
 *  0 = standard matte/terrain
 *  1 = road surface (procedural high-freq gravel/tarmac/snow shader)
 *  2 = glossy car body / metallic
 *  3 = emissive / lamp / shift LED / backfire
 *  4 = retro-reflective chevron sign (brightens intensely in headlight cone)
 *  5 = water / ice specular surface
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

    // Top (+Y)
    this.addQuad(...p010, ...p011, ...p111, ...p110, r, g, b, matType);
    // Bottom (-Y)
    this.addQuad(...p000, ...p100, ...p101, ...p001, r * 0.7, g * 0.7, b * 0.7, matType);
    // Front (+Z)
    this.addQuad(...p001, ...p101, ...p111, ...p011, r * 0.92, g * 0.92, b * 0.92, matType);
    // Back (-Z)
    this.addQuad(...p100, ...p000, ...p010, ...p110, r * 0.85, g * 0.85, b * 0.85, matType);
    // Right (+X)
    this.addQuad(...p101, ...p100, ...p110, ...p111, r * 0.88, g * 0.88, b * 0.88, matType);
    // Left (-X)
    this.addQuad(...p000, ...p001, ...p011, ...p010, r * 0.88, g * 0.88, b * 0.88, matType);
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

function getRoadSurfaceColor(surface: SurfaceType): [number, number, number, number] {
  switch (surface) {
    case 'gravel':
      return [0.46, 0.37, 0.28, 1];
    case 'tarmac':
      return [0.22, 0.24, 0.27, 1];
    case 'tarmac_dirty':
      return [0.35, 0.31, 0.26, 1];
    case 'snow':
      return [0.86, 0.90, 0.95, 1];
    case 'ice':
      return [0.62, 0.78, 0.92, 5];
    case 'water_puddle':
      return [0.20, 0.30, 0.38, 5];
    case 'offtrack':
      return [0.22, 0.31, 0.18, 0];
  }
}

function getVergeColor(primarySurface: SurfaceType): [number, number, number] {
  if (primarySurface === 'snow') return [0.90, 0.93, 0.98];
  if (primarySurface === 'tarmac') return [0.26, 0.32, 0.22];
  return [0.24, 0.33, 0.17];
}

/**
 * Builds the entire 3D stage road ribbon, wheel ruts, shoulders, ditches, cliffs, and all 3D roadside obstacles.
 */
export function buildStageStaticMesh(stage: StageDefinition): Float32Array {
  const mb = new DynamicMeshBuilder();
  const segs = stage.segments;
  const vergeBase = getVergeColor(stage.primarySurface);

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

    const [rr, rg, rb, rMat] = getRoadSurfaceColor(s0.surface);

    // Subdivide road across width into 3 strips so wheel ruts and crown are visible in 3D
    const il0x = s0.x - s0.normalX * (hw0 * 0.38);
    const il0y = s0.y - hw0 * 0.38 * cam0 - 0.02; // Slight tire rut depression
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
    // Center crown / rut strip (slightly darker from rubber/ruts)
    mb.addQuad(
      il0x, il0y, il0z,
      ir0x, ir0y, ir0z,
      ir1x, ir1y, ir1z,
      il1x, il1y, il1z,
      rr * 0.88,
      rg * 0.88,
      rb * 0.88,
      rMat
    );
    // Right outer lane
    mb.addQuad(ir0x, ir0y, ir0z, r0x, r0y, r0z, r1x, r1y, r1z, ir1x, ir1y, ir1z, rr, rg, rb, rMat);

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

    // Snowbanks on Sweden stage vs rough gravel/grass shoulder
    const shR = stage.primarySurface === 'snow' ? 0.92 : vergeBase[0] * 1.1;
    const shG = stage.primarySurface === 'snow' ? 0.95 : vergeBase[1] * 1.05;
    const shB = stage.primarySurface === 'snow' ? 0.99 : vergeBase[2] * 0.95;

    mb.addQuad(dl0x, dl0y, dl0z, l0x, l0y, l0z, l1x, l1y, l1z, dl1x, dl1y, dl1z, shR, shG, shB, 0);
    mb.addQuad(r0x, r0y, r0z, dr0x, dr0y, dr0z, dr1x, dr1y, dr1z, r1x, r1y, r1z, shR, shG, shB, 0);

    // Outer terrain slope / mountain embankment (extending 34m on each side)
    const outW = 34.0;
    const leftSlopeH0 =
      s0.sceneryType === 'cliff' ? (s0.curvature >= 0 ? -9.5 : 14.0) : 4.5 + Math.sin(i * 0.13) * 2.5;
    const rightSlopeH0 =
      s0.sceneryType === 'cliff' ? (s0.curvature >= 0 ? 14.0 : -9.5) : 4.5 + Math.cos(i * 0.11) * 2.5;
    const leftSlopeH1 =
      s1.sceneryType === 'cliff' ? (s1.curvature >= 0 ? -9.5 : 14.0) : 4.5 + Math.sin((i + 1) * 0.13) * 2.5;
    const rightSlopeH1 =
      s1.sceneryType === 'cliff' ? (s1.curvature >= 0 ? 14.0 : -9.5) : 4.5 + Math.cos((i + 1) * 0.11) * 2.5;

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
  for (const prop of stage.props) {
    appendPropMesh(mb, prop, stage.primarySurface === 'snow');
  }

  return mb.getFloat32Array();
}

function appendPropMesh(mb: DynamicMeshBuilder, p: RoadsideProp, isSnowStage: boolean): void {
  const s = p.scale;
  switch (p.type) {
    case 'pine_tree': {
      // Trunk + 3 layered conical foliage tiers
      mb.addBox(p.x, p.y + 1.1 * s, p.z, 0.36 * s, 2.2 * s, 0.36 * s, 0.34, 0.22, 0.14, 0, p.yaw);
      const gTint = isSnowStage ? 0.65 : 0.32;
      const bTint = isSnowStage ? 0.72 : 0.18;
      const rTint = isSnowStage ? 0.58 : 0.14;
      mb.addCone(p.x, p.y + 1.6 * s, p.z, 1.85 * s, 2.8 * s, 6, rTint, gTint, bTint, 0);
      mb.addCone(p.x, p.y + 3.2 * s, p.z, 1.45 * s, 2.5 * s, 6, rTint * 1.08, gTint * 1.08, bTint * 1.08, 0);
      mb.addCone(p.x, p.y + 4.7 * s, p.z, 0.98 * s, 2.2 * s, 6, rTint * 1.18, gTint * 1.18, bTint * 1.18, 0);
      break;
    }
    case 'birch_tree': {
      // White birch bark trunk + golden/snowy canopy
      mb.addBox(p.x, p.y + 1.6 * s, p.z, 0.26 * s, 3.2 * s, 0.26 * s, 0.85, 0.84, 0.80, 0, p.yaw);
      mb.addCone(p.x, p.y + 2.4 * s, p.z, 1.5 * s, 3.1 * s, 6, 0.72, 0.78, 0.84, 0);
      mb.addCone(p.x, p.y + 4.1 * s, p.z, 1.1 * s, 2.2 * s, 6, 0.82, 0.88, 0.94, 0);
      break;
    }
    case 'rock_outcrop': {
      // Composite 3-block jagged boulder
      mb.addBox(p.x, p.y + 0.65 * s, p.z, 1.8 * s, 1.3 * s, 1.5 * s, 0.38, 0.39, 0.42, 0, p.yaw);
      mb.addBox(
        p.x + 0.45 * s,
        p.y + 1.1 * s,
        p.z - 0.2 * s,
        1.1 * s,
        1.2 * s,
        1.1 * s,
        0.44,
        0.45,
        0.48,
        0,
        p.yaw + 0.6
      );
      break;
    }
    case 'guardrail': {
      // W-beam steel guardrail + support posts
      mb.addBox(p.x, p.y + 0.62, p.z, 0.18, 0.28, 8.8, 0.68, 0.71, 0.75, 2, p.yaw);
      mb.addBox(p.x, p.y + 0.35, p.z, 0.14, 0.7, 0.14, 0.42, 0.44, 0.47, 0, p.yaw);
      break;
    }
    case 'bridge_parapet': {
      // Solid timber/stone bridge parapet wall + hazard posts
      mb.addBox(p.x, p.y + 0.65, p.z, 0.42, 1.3, 9.6, 0.48, 0.43, 0.37, 0, p.yaw);
      mb.addBox(p.x, p.y + 1.35, p.z, 0.48, 0.16, 9.6, 0.85, 0.52, 0.12, 4, p.yaw);
      break;
    }
    case 'stone_wall': {
      // Alpine village masonry house/wall facade
      mb.addBox(p.x, p.y + 1.8 * s, p.z, 1.8 * s, 3.6 * s, 8.5, 0.56, 0.53, 0.48, 0, p.yaw);
      // Terracotta / slate pitched roof ledge
      mb.addBox(p.x, p.y + 3.75 * s, p.z, 2.1 * s, 0.35 * s, 8.7, 0.45, 0.25, 0.18, 0, p.yaw);
      break;
    }
    case 'chevron_sign': {
      // Post + Retro-reflective high-visibility yellow/red chevron board (matType = 4)
      mb.addBox(p.x, p.y + 0.65, p.z, 0.1, 1.3, 0.1, 0.5, 0.5, 0.55, 0, p.yaw);
      mb.addBox(p.x, p.y + 1.35, p.z, 0.14, 0.65, 1.15, 0.98, 0.76, 0.08, 4, p.yaw);
      mb.addBox(p.x, p.y + 1.35, p.z, 0.16, 0.32, 0.55, 0.92, 0.15, 0.12, 4, p.yaw);
      break;
    }
    case 'marshal_hut': {
      // Start timing booth & banner
      mb.addBox(p.x, p.y + 1.25, p.z, 2.4, 2.5, 3.2, 0.18, 0.22, 0.28, 0, p.yaw);
      mb.addBox(p.x, p.y + 2.6, p.z, 2.7, 0.25, 3.5, 0.92, 0.58, 0.08, 3, p.yaw);
      break;
    }
    case 'finish_arch': {
      // Spanning FIA Stage Finish Gantry Arch across the road
      const cosY = Math.cos(p.yaw);
      const sinY = Math.sin(p.yaw);
      const span = 4.6;
      mb.addBox(p.x - cosY * span, p.y + 2.4, p.z + sinY * span, 0.55, 4.8, 0.55, 0.9, 0.18, 0.15, 0, p.yaw);
      mb.addBox(p.x + cosY * span, p.y + 2.4, p.z - sinY * span, 0.55, 4.8, 0.55, 0.9, 0.18, 0.15, 0, p.yaw);
      mb.addBox(p.x, p.y + 4.5, p.z, 9.8, 0.75, 0.65, 0.96, 0.65, 0.08, 4, p.yaw);
      break;
    }
  }
}

/**
 * Builds the 10-part 3D Rally Car Chassis mesh (excluding the 4 independent wheels).
 */
export function buildRallyCarChassisMesh(isGhost: boolean = false): Float32Array {
  const mb = new DynamicMeshBuilder();
  if (isGhost) {
    // Semi-translucent cyan ghost silhouette
    mb.addBox(0, 0.56, 0, 1.76, 0.52, 4.12, 0.15, 0.82, 0.96, 3);
    mb.addBox(0, 1.02, -0.18, 1.44, 0.46, 2.05, 0.12, 0.65, 0.88, 3);
    mb.addBox(0, 1.18, -1.88, 1.62, 0.28, 0.42, 0.2, 0.9, 1.0, 3);
    return mb.getFloat32Array();
  }

  // 1. Main widebody lower tub (Motorsport Pearl White & Carbon trim)
  mb.addBox(0, 0.54, 0, 1.78, 0.48, 4.16, 0.93, 0.94, 0.96, 2);
  // 2. Front & Rear flared rally wheel arches
  mb.addBox(0, 0.58, 1.28, 1.88, 0.38, 0.95, 0.95, 0.60, 0.08, 2); // Amber livery front flare
  mb.addBox(0, 0.60, -1.28, 1.88, 0.40, 0.98, 0.16, 0.20, 0.26, 2); // Dark slate rear flare
  // 3. Carbon front splitter & bumper skirt
  mb.addBox(0, 0.28, 2.04, 1.82, 0.12, 0.28, 0.10, 0.11, 0.13, 0);
  // 4. Greenhouse cabin & dark tinted windows
  mb.addBox(0, 1.02, -0.16, 1.46, 0.48, 2.12, 0.12, 0.15, 0.20, 2);
  // 5. Roof panel & WRC roof snorkel intake scoop
  mb.addBox(0, 1.28, -0.16, 1.36, 0.06, 1.65, 0.94, 0.95, 0.97, 2);
  mb.addBox(0, 1.35, 0.32, 0.34, 0.10, 0.48, 0.95, 0.60, 0.08, 2);
  // 6. Quad Rally Lamp Pod on front hood (emissive lenses)
  mb.addBox(0, 0.82, 1.92, 1.12, 0.16, 0.22, 0.12, 0.12, 0.14, 0);
  mb.addBox(0, 0.82, 2.03, 1.04, 0.12, 0.04, 1.0, 0.96, 0.82, 3);
  // 7. Rear Bi-Plane WRC Downforce Wing
  mb.addBox(-0.68, 1.08, -1.92, 0.06, 0.42, 0.44, 0.12, 0.13, 0.15, 0);
  mb.addBox(0.68, 1.08, -1.92, 0.06, 0.42, 0.44, 0.12, 0.13, 0.15, 0);
  mb.addBox(0, 1.26, -1.94, 1.68, 0.06, 0.38, 0.95, 0.60, 0.08, 2);
  mb.addBox(0, 1.12, -1.92, 1.56, 0.05, 0.32, 0.14, 0.15, 0.18, 0);
  // 8. Rear LED Brake Light Strip
  mb.addBox(0, 0.72, -2.09, 1.52, 0.10, 0.04, 0.95, 0.12, 0.12, 3);
  // 9. Red Rally Mudflaps behind all 4 wheels
  mb.addBox(-0.82, 0.26, 0.82, 0.28, 0.26, 0.03, 0.85, 0.14, 0.12, 0);
  mb.addBox(0.82, 0.26, 0.82, 0.28, 0.26, 0.03, 0.85, 0.14, 0.12, 0);
  mb.addBox(-0.82, 0.26, -1.72, 0.28, 0.28, 0.03, 0.85, 0.14, 0.12, 0);
  mb.addBox(0.82, 0.26, -1.72, 0.28, 0.28, 0.03, 0.85, 0.14, 0.12, 0);
  // 10. Exhaust tailpipe
  mb.addBox(0.52, 0.26, -2.12, 0.14, 0.14, 0.18, 0.35, 0.36, 0.40, 2);

  return mb.getFloat32Array();
}

/**
 * Builds a single 3D Rally Wheel & Tarmac/Gravel Rim mesh.
 */
export function buildWheelMesh(): Float32Array {
  const mb = new DynamicMeshBuilder();
  // Tire rubber cylinder approximated by 12-sided prism + gold/white rally rim face
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

    // Tread band
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

    // Outer & inner rim discs (with spoke contrast so rotation is clearly visible)
    const spokeColor = i % 2 === 0 ? 0.88 : 0.55;
    mb.addTriangle(halfW, 0, 0, halfW, y1 * 0.72, z1 * 0.72, halfW, y0 * 0.72, z0 * 0.72, spokeColor, spokeColor * 0.9, 0.65, 2);
    mb.addTriangle(-halfW, 0, 0, -halfW, y0 * 0.72, z0 * 0.72, -halfW, y1 * 0.72, z1 * 0.72, spokeColor, spokeColor * 0.9, 0.65, 2);
  }
  return mb.getFloat32Array();
}

/**
 * Builds the 3D Cockpit Interior mesh (Alcantara dash, rollcage A-pillars, digital cluster housing).
 */
export function buildCockpitInteriorMesh(): Float32Array {
  const mb = new DynamicMeshBuilder();
  // Alcantara charcoal dashboard cowl (sits below windshield)
  mb.addBox(0, 0.77, 0.58, 1.48, 0.16, 0.55, 0.08, 0.09, 0.11, 0);
  // Driver instrument binnacle hood over steering column
  mb.addBox(-0.32, 0.87, 0.48, 0.36, 0.10, 0.32, 0.06, 0.07, 0.09, 0);
  // Digital RPM shift strip on binnacle
  mb.addBox(-0.32, 0.922, 0.38, 0.22, 0.015, 0.02, 0.10, 0.88, 0.45, 3);
  // Center co-driver tripmeter / ECU console
  mb.addBox(0.14, 0.84, 0.50, 0.28, 0.14, 0.24, 0.11, 0.13, 0.16, 0);
  // Left & Right FIA Steel Rollcage A-pillars
  mb.addBox(-0.72, 1.08, 0.44, 0.048, 0.62, 0.048, 0.22, 0.25, 0.30, 2);
  mb.addBox(0.72, 1.08, 0.44, 0.048, 0.62, 0.048, 0.22, 0.25, 0.30, 2);
  // Top rollcage crossbar & roof header
  mb.addBox(0, 1.38, 0.38, 1.48, 0.05, 0.16, 0.09, 0.10, 0.12, 0);
  // Front hood visible out through the windshield (gives driver clear nose reference!)
  mb.addBox(0, 0.74, 1.36, 1.46, 0.07, 1.12, 0.92, 0.93, 0.95, 2);
  // Amber rally livery stripes on hood
  mb.addBox(-0.42, 0.778, 1.36, 0.22, 0.015, 1.05, 0.95, 0.60, 0.08, 2);
  mb.addBox(0.42, 0.778, 1.36, 0.22, 0.015, 1.05, 0.95, 0.60, 0.08, 2);
  return mb.getFloat32Array();
}

/**
 * Builds the dedicated 3D Bonnet & Quad Rally Lamp Pod mesh for Hood Camera view (zero cabin occlusion).
 */
export function buildHoodCameraMesh(): Float32Array {
  const mb = new DynamicMeshBuilder();
  mb.addBox(0, 0.72, 1.42, 1.56, 0.08, 1.25, 0.93, 0.94, 0.96, 2);
  mb.addBox(-0.44, 0.765, 1.42, 0.24, 0.015, 1.18, 0.95, 0.60, 0.08, 2);
  mb.addBox(0.44, 0.765, 1.42, 0.24, 0.015, 1.18, 0.95, 0.60, 0.08, 2);
  // Front flared wheel arch tops visible on left & right of hood
  mb.addBox(-0.82, 0.74, 1.38, 0.18, 0.08, 0.85, 0.95, 0.60, 0.08, 2);
  mb.addBox(0.82, 0.74, 1.38, 0.18, 0.08, 0.85, 0.95, 0.60, 0.08, 2);
  // Quad Rally Lamp Pod bar at nose of hood
  mb.addBox(0, 0.78, 1.98, 1.08, 0.12, 0.18, 0.12, 0.13, 0.15, 0);
  return mb.getFloat32Array();
}

/**
 * Builds a sleek, continuous 24-segment 3D Suede Steering Wheel + Yellow Center Stripe + Compact Racing Gloves.
 */
export function buildSteeringWheelAndHandsMesh(): Float32Array {
  const mb = new DynamicMeshBuilder();
  const outerR = 0.155;
  const innerR = 0.132;
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

    // Top 12-o'clock marker (around PI/2) is bright rally yellow!
    const isTopMarker = Math.abs(midA - Math.PI * 0.5) < 0.18;
    const r = isTopMarker ? 0.98 : 0.12;
    const g = isTopMarker ? 0.76 : 0.13;
    const b = isTopMarker ? 0.06 : 0.16;
    const mat = isTopMarker ? 3 : 0;

    // Front face of rim
    mb.addQuad(x0In, y0In, -0.01, x0Out, y0Out, -0.01, x1Out, y1Out, -0.01, x1In, y1In, -0.01, r, g, b, mat);
    // Back face of rim
    mb.addQuad(x0Out, y0Out, 0.01, x0In, y0In, 0.01, x1In, y1In, 0.01, x1Out, y1Out, 0.01, r * 0.8, g * 0.8, b * 0.8, mat);
  }

  // 3 anodized aluminum spokes (left, right, bottom)
  mb.addBox(-0.07, 0, 0, 0.13, 0.022, 0.012, 0.28, 0.31, 0.36, 2);
  mb.addBox(0.07, 0, 0, 0.13, 0.022, 0.012, 0.28, 0.31, 0.36, 2);
  mb.addBox(0, -0.07, 0, 0.024, 0.13, 0.012, 0.28, 0.31, 0.36, 2);
  // Center hub boss with amber horn emblem
  mb.addBox(0, 0, -0.005, 0.058, 0.058, 0.022, 0.14, 0.15, 0.18, 2);
  mb.addBox(0, 0, -0.017, 0.024, 0.024, 0.005, 0.95, 0.60, 0.08, 3);

  // Compact Driver Racing Gloves gripping at 9 and 3 o'clock
  mb.addBox(-outerR + 0.01, 0.0, -0.012, 0.036, 0.052, 0.036, 0.92, 0.56, 0.08, 0);
  mb.addBox(outerR - 0.01, 0.0, -0.012, 0.036, 0.052, 0.036, 0.92, 0.56, 0.08, 0);

  return mb.getFloat32Array();
}
