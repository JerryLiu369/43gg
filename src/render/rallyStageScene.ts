import * as THREE from 'three';
import type { RoadsideProp, StageDefinition, StageSegment } from '../game/types.ts';
import {
  createArchBannerTexture,
  createBrakeBoardTexture,
  createChevronSignTexture,
  createStageRoadTextures,
  createTerrainDetailTexture,
} from './rallyTextures.ts';

export interface BuiltStageScene {
  group: THREE.Group;
  dispose: () => void;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(1e-5, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function terrainFbm(x: number, z: number): number {
  const n1 = Math.sin(x * 0.0085 + 0.7) * Math.cos(z * 0.0078 - 0.4) * 22;
  const n2 = Math.sin((x + z) * 0.019 + 1.9) * Math.cos((x - z) * 0.017) * 9.5;
  const n3 = Math.sin(x * 0.048 - z * 0.041) * 3.2;
  return n1 + n2 + n3;
}

function mergeBufferGeometries(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let totalVerts = 0;
  let totalIndices = 0;

  for (const g of geoms) {
    totalVerts += g.attributes.position.count;
    totalIndices += g.index ? g.index.count : g.attributes.position.count;
  }

  const posOut = new Float32Array(totalVerts * 3);
  const normOut = new Float32Array(totalVerts * 3);
  const idxOut = new Uint32Array(totalIndices);

  let vOffset = 0;
  let iOffset = 0;

  for (const g of geoms) {
    const pos = g.attributes.position as THREE.BufferAttribute;
    if (!g.attributes.normal) g.computeVertexNormals();
    const norm = g.attributes.normal as THREE.BufferAttribute;

    posOut.set(pos.array as Float32Array, vOffset * 3);
    normOut.set(norm.array as Float32Array, vOffset * 3);

    if (g.index) {
      const idxArr = g.index.array;
      for (let k = 0; k < idxArr.length; k++) {
        idxOut[iOffset + k] = idxArr[k] + vOffset;
      }
      iOffset += idxArr.length;
    } else {
      for (let k = 0; k < pos.count; k++) {
        idxOut[iOffset + k] = vOffset + k;
      }
      iOffset += pos.count;
    }
    vOffset += pos.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(posOut, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normOut, 3));
  merged.setIndex(new THREE.BufferAttribute(idxOut, 1));
  return merged;
}

export function buildThreeStageScene(
  stage: StageDefinition,
  maxAnisotropy: number,
  isSoftwareGl: boolean,
): BuiltStageScene {
  const disposables: Array<{ dispose: () => void }> = [];
  const trackG = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };
  const trackM = <T extends THREE.Material>(m: T): T => {
    disposables.push(m);
    return m;
  };

  const group = new THREE.Group();
  const segs = stage.segments;
  const n = segs.length;

  const roadTex = createStageRoadTextures(stage.primarySurface, maxAnisotropy);
  const terrainTex = createTerrainDetailTexture(stage.primarySurface, maxAnisotropy);
  disposables.push(roadTex.map, roadTex.bumpMap, terrainTex);

  // ==========================================================================
  // 1. MITERED ROAD RIBBON + SHOULDER SKIRT + APEX FIA RUMBLE CURBS
  // ==========================================================================
  const roadPos = new Float32Array(n * 3 * 3);
  const roadUv = new Float32Array(n * 3 * 2);
  const roadCol = new Float32Array(n * 3 * 3);
  const roadIndices: number[] = [];

  const shPos = new Float32Array(n * 4 * 3);
  const shUv = new Float32Array(n * 4 * 2);
  const shIndices: number[] = [];

  const curbPos: number[] = [];
  const curbCol: number[] = [];
  const curbIdx: number[] = [];

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  const tmpColor = new THREE.Color();

  for (let i = 0; i < n; i++) {
    const s = segs[i];
    if (s.x < minX) minX = s.x;
    if (s.x > maxX) maxX = s.x;
    if (s.z < minZ) minZ = s.z;
    if (s.z > maxZ) maxZ = s.z;

    const hw = s.widthM * 0.5;
    const bankSin = Math.sin(s.camberRad);

    const lx = s.x - s.normalX * hw;
    const lz = s.z - s.normalZ * hw;
    const ly = s.y + bankSin * hw + 0.015;

    const cx = s.x;
    const cz = s.z;
    const cy = s.y + 0.04; // Subtle drainage crown at centerline

    const rx = s.x + s.normalX * hw;
    const rz = s.z + s.normalZ * hw;
    const ry = s.y - bankSin * hw + 0.015;

    const vBase = i * 3;
    roadPos.set([lx, ly, lz, cx, cy, cz, rx, ry, rz], vBase * 3);

    const vCoord = s.distanceM / 9.0;
    roadUv.set([0, vCoord, 0.5, vCoord, 1, vCoord], vBase * 2);

    // Subtle per-segment surface tint modulation (e.g., Monte Carlo tarmac -> snow -> ice transition!)
    if (s.surface === 'ice') tmpColor.setRGB(0.84, 0.94, 1.05);
    else if (s.surface === 'snow' && stage.primarySurface !== 'snow') tmpColor.setRGB(1.45, 1.5, 1.58);
    else if (s.surface === 'water_puddle') tmpColor.setRGB(0.62, 0.72, 0.82);
    else if (s.surface === 'tarmac_dirty') tmpColor.setRGB(0.95, 0.88, 0.78);
    else tmpColor.setRGB(1, 1, 1);

    for (let k = 0; k < 3; k++) {
      roadCol[(vBase + k) * 3] = tmpColor.r;
      roadCol[(vBase + k) * 3 + 1] = tmpColor.g;
      roadCol[(vBase + k) * 3 + 2] = tmpColor.b;
    }

    if (i < n - 1) {
      const a0 = i * 3;
      const b0 = (i + 1) * 3;
      // Left lane strip (CCW when viewed from +Y: a0 -> a1 -> b1, a0 -> b1 -> b0)
      roadIndices.push(a0, a0 + 1, b0 + 1, a0, b0 + 1, b0);
      // Right lane strip
      roadIndices.push(a0 + 1, a0 + 2, b0 + 2, a0 + 1, b0 + 2, b0 + 1);
    }

    // Shoulder & drainage verge skirt (left outer, left inner, right inner, right outer)
    const shOut = hw + 3.2;
    const slOutX = s.x - s.normalX * shOut;
    const slOutZ = s.z - s.normalZ * shOut;
    const slOutY = ly - 0.24;

    const srOutX = s.x + s.normalX * shOut;
    const srOutZ = s.z + s.normalZ * shOut;
    const srOutY = ry - 0.24;

    const sBase = i * 4;
    shPos.set(
      [slOutX, slOutY, slOutZ, lx, ly - 0.015, lz, rx, ry - 0.015, rz, srOutX, srOutY, srOutZ],
      sBase * 3,
    );
    const sv = s.distanceM / 12.0;
    shUv.set([0, sv, 0.25, sv, 0.75, sv, 1, sv], sBase * 2);

    if (i < n - 1) {
      const sa = i * 4;
      const sb = (i + 1) * 4;
      shIndices.push(sa, sa + 1, sb + 1, sa, sb + 1, sb);
      shIndices.push(sa + 2, sa + 3, sb + 3, sa + 2, sb + 3, sb + 2);
    }

    // FIA Apex Rumble Curbs along medium & tight corners
    if (i < n - 1 && Math.abs(s.curvature) >= 0.013) {
      const sNext = segs[i + 1];
      const insideRight = s.curvature > 0;
      const sign = insideRight ? 1 : -1;
      const hwNext = sNext.widthM * 0.5;
      const curbW = 0.58;

      const innerA = hw - 0.12;
      const outerA = hw + curbW;
      const innerB = hwNext - 0.12;
      const outerB = hwNext + curbW;

      const yA = (insideRight ? ry : ly) + 0.025;
      const yB =
        sNext.y - Math.sin(sNext.camberRad) * sign * hwNext + 0.04;

      const p0x = s.x + s.normalX * sign * innerA;
      const p0z = s.z + s.normalZ * sign * innerA;
      const p1x = s.x + s.normalX * sign * outerA;
      const p1z = s.z + s.normalZ * sign * outerA;
      const p2x = sNext.x + sNext.normalX * sign * innerB;
      const p2z = sNext.z + sNext.normalZ * sign * innerB;
      const p3x = sNext.x + sNext.normalX * sign * outerB;
      const p3z = sNext.z + sNext.normalZ * sign * outerB;

      const cVertStart = curbPos.length / 3;
      curbPos.push(p0x, yA, p0z, p1x, yA + 0.02, p1z, p2x, yB, p2z, p3x, yB + 0.02, p3z);

      const isRed = i % 2 === 0;
      const cr = isRed ? 0.86 : 0.96;
      const cg = isRed ? 0.16 : 0.97;
      const cb = isRed ? 0.16 : 0.98;
      for (let c = 0; c < 4; c++) {
        curbCol.push(cr, cg, cb);
      }

      if (insideRight) {
        curbIdx.push(cVertStart, cVertStart + 1, cVertStart + 3, cVertStart, cVertStart + 3, cVertStart + 2);
      } else {
        curbIdx.push(cVertStart + 1, cVertStart, cVertStart + 2, cVertStart + 1, cVertStart + 2, cVertStart + 3);
      }
    }
  }

  const roadGeom = trackG(new THREE.BufferGeometry());
  roadGeom.setAttribute('position', new THREE.BufferAttribute(roadPos, 3));
  roadGeom.setAttribute('uv', new THREE.BufferAttribute(roadUv, 2));
  roadGeom.setAttribute('color', new THREE.BufferAttribute(roadCol, 3));
  roadGeom.setIndex(roadIndices);
  roadGeom.computeVertexNormals();

  const isTarmac = stage.primarySurface === 'tarmac';
  const isSnow = stage.primarySurface === 'snow';
  const roadMat = trackM(
    new THREE.MeshStandardMaterial({
      map: roadTex.map,
      bumpMap: roadTex.bumpMap,
      bumpScale: isTarmac ? 0.025 : 0.055,
      vertexColors: true,
      roughness: isTarmac ? 0.58 : isSnow ? 0.48 : 0.84,
      metalness: isSnow ? 0.08 : 0.04,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  const roadMesh = new THREE.Mesh(roadGeom, roadMat);
  roadMesh.receiveShadow = !isSoftwareGl;
  group.add(roadMesh);

  const shGeom = trackG(new THREE.BufferGeometry());
  shGeom.setAttribute('position', new THREE.BufferAttribute(shPos, 3));
  shGeom.setAttribute('uv', new THREE.BufferAttribute(shUv, 2));
  shGeom.setIndex(shIndices);
  shGeom.computeVertexNormals();

  const shMat = trackM(
    new THREE.MeshStandardMaterial({
      map: terrainTex,
      roughness: 0.92,
      metalness: 0.02,
    }),
  );
  const shMesh = new THREE.Mesh(shGeom, shMat);
  shMesh.receiveShadow = !isSoftwareGl;
  group.add(shMesh);

  if (curbIdx.length > 0) {
    const curbGeom = trackG(new THREE.BufferGeometry());
    curbGeom.setAttribute('position', new THREE.Float32BufferAttribute(curbPos, 3));
    curbGeom.setAttribute('color', new THREE.Float32BufferAttribute(curbCol, 3));
    curbGeom.setIndex(curbIdx);
    curbGeom.computeVertexNormals();
    const curbMat = trackM(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.55,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    group.add(new THREE.Mesh(curbGeom, curbMat));
  }

  // ==========================================================================
  // 2. CONTINUOUS NON-INTERSECTING VALLEY / MOUNTAIN PANORAMA HEIGHTFIELD
  // ==========================================================================
  // Build fast 2D spatial hash (cellSize = 45m) over all stage segments
  const cellSize = 45;
  const spatialBuckets = new Map<string, StageSegment[]>();
  for (let i = 0; i < n; i++) {
    const s = segs[i];
    const gx = Math.floor(s.x / cellSize);
    const gz = Math.floor(s.z / cellSize);
    const key = `${gx},${gz}`;
    let list = spatialBuckets.get(key);
    if (!list) {
      list = [];
      spatialBuckets.set(key, list);
    }
    list.push(s);
  }

  const pad = 250;
  const spanX = Math.max(400, maxX - minX + pad * 2);
  const spanZ = Math.max(400, maxZ - minZ + pad * 2);
  const centerX = (minX + maxX) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;

  const gridRes = 112;
  const terrainGeom = trackG(new THREE.PlaneGeometry(spanX, spanZ, gridRes, gridRes));
  terrainGeom.rotateX(-Math.PI * 0.5);

  const tPos = terrainGeom.attributes.position as THREE.BufferAttribute;
  const tColors = new Float32Array(tPos.count * 3);

  const baseGrass = new THREE.Color(
    isSnow
      ? 0xdbe6f2
      : stage.id === 'acropolis_rock'
        ? 0x7c7252
        : stage.id === 'wales_mud'
          ? 0x3b4d34
          : 0x47613a,
  );
  const rockCliff = new THREE.Color(isSnow ? 0x6b7c90 : 0x5c5852);
  const peakSnow = new THREE.Color(0xf1f5f9);

  for (let v = 0; v < tPos.count; v++) {
    const wx = tPos.getX(v) + centerX;
    const wz = tPos.getZ(v) + centerZ;
    tPos.setX(v, wx);
    tPos.setZ(v, wz);

    const bx = Math.floor(wx / cellSize);
    const bz = Math.floor(wz / cellSize);

    let nearestDistSq = Infinity;
    let nearestSeg = segs[0];

    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const bucket = spatialBuckets.get(`${bx + dx},${bz + dz}`);
        if (!bucket) continue;
        for (let k = 0; k < bucket.length; k++) {
          const cand = bucket[k];
          const ddx = wx - cand.x;
          const ddz = wz - cand.z;
          const dSq = ddx * ddx + ddz * ddz;
          if (dSq < nearestDistSq) {
            nearestDistSq = dSq;
            nearestSeg = cand;
          }
        }
      }
    }

    // Fallback coarse scan if far out on panorama perimeter
    if (nearestDistSq === Infinity) {
      for (let k = 0; k < n; k += 8) {
        const cand = segs[k];
        const ddx = wx - cand.x;
        const ddz = wz - cand.z;
        const dSq = ddx * ddx + ddz * ddz;
        if (dSq < nearestDistSq) {
          nearestDistSq = dSq;
          nearestSeg = cand;
        }
      }
    }

    const dist = Math.sqrt(nearestDistSq);
    const safeClearance = nearestSeg.widthM * 0.5 + 2.8;

    let wy: number;
    let hillHeight = 0;
    if (dist <= safeClearance) {
      // Tucked strictly underneath road & shoulder skirt so terrain NEVER pokes through road!
      wy = nearestSeg.y - 0.42;
    } else {
      const blend = smoothstep(safeClearance, safeClearance + 42, dist);
      const farMount = smoothstep(safeClearance + 30, safeClearance + 190, dist);
      const noiseH = terrainFbm(wx, wz);
      hillHeight = blend * (noiseH * 0.45 + 1.2) + farMount * (Math.abs(noiseH) * 1.45 + 26);
      wy = nearestSeg.y - 0.24 + hillHeight;
    }

    tPos.setY(v, wy);

    // Natural biome elevation shading
    if (hillHeight > 28 && (isSnow || stage.id === 'turini_tarmac')) {
      tmpColor.copy(peakSnow);
    } else if (hillHeight > 14) {
      tmpColor.copy(baseGrass).lerp(rockCliff, Math.min(0.85, (hillHeight - 14) / 22));
    } else {
      const shade = 0.88 + 0.18 * Math.sin(wx * 0.03 + wz * 0.03);
      tmpColor.copy(baseGrass).multiplyScalar(shade);
    }
    tColors[v * 3] = tmpColor.r;
    tColors[v * 3 + 1] = tmpColor.g;
    tColors[v * 3 + 2] = tmpColor.b;
  }

  terrainGeom.setAttribute('color', new THREE.BufferAttribute(tColors, 3));
  terrainGeom.computeVertexNormals();

  const terrainMat = trackM(
    new THREE.MeshStandardMaterial({
      map: terrainTex,
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.02,
    }),
  );
  const terrainMesh = new THREE.Mesh(terrainGeom, terrainMat);
  terrainMesh.receiveShadow = !isSoftwareGl;
  group.add(terrainMesh);

  // ==========================================================================
  // 3. COMPOSITE MULTI-PART INSTANCED BIOME PROPS & WRC STAGE GANTRIES
  // ==========================================================================
  const dummy = new THREE.Object3D();
  const byType = new Map<RoadsideProp['type'], RoadsideProp[]>();
  for (const p of stage.props) {
    let arr = byType.get(p.type);
    if (!arr) {
      arr = [];
      byType.set(p.type, arr);
    }
    arr.push(p);
  }

  // 3A. Nordic Pine Trees (Trunk InstancedMesh + 3-Tiered Conical Canopy InstancedMesh)
  const pines = byType.get('pine_tree') ?? [];
  if (pines.length > 0) {
    const trunkGeom = trackG(new THREE.CylinderGeometry(0.14, 0.24, 2.2, 7));
    trunkGeom.translate(0, 1.1, 0);

    const c1 = new THREE.ConeGeometry(1.75, 3.2, 8);
    c1.translate(0, 3.1, 0);
    const c2 = new THREE.ConeGeometry(1.35, 2.8, 8);
    c2.translate(0, 4.9, 0);
    const c3 = new THREE.ConeGeometry(0.9, 2.4, 8);
    c3.translate(0, 6.5, 0);
    const canopyGeom = trackG(mergeBufferGeometries([c1, c2, c3]));
    c1.dispose();
    c2.dispose();
    c3.dispose();

    const trunkMat = trackM(new THREE.MeshStandardMaterial({ color: 0x4a3525, roughness: 0.92 }));
    const foliageMat = trackM(
      new THREE.MeshStandardMaterial({
        color: isSnow ? 0x5c7a72 : 0x264a2e,
        roughness: 0.84,
      }),
    );

    const trunkInst = new THREE.InstancedMesh(trunkGeom, trunkMat, pines.length);
    const canopyInst = new THREE.InstancedMesh(canopyGeom, foliageMat, pines.length);
    canopyInst.castShadow = !isSoftwareGl;

    pines.forEach((p, idx) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, -p.yaw, 0);
      dummy.scale.set(p.scale, p.scale * (0.92 + (idx % 5) * 0.05), p.scale);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(idx, dummy.matrix);
      canopyInst.setMatrixAt(idx, dummy.matrix);

      const tint = 0.85 + ((idx * 17) % 10) * 0.03;
      tmpColor.setRGB(tint * 0.92, tint, tint * (isSnow ? 1.05 : 0.9));
      canopyInst.setColorAt(idx, tmpColor);
    });

    trunkInst.instanceMatrix.needsUpdate = true;
    canopyInst.instanceMatrix.needsUpdate = true;
    if (canopyInst.instanceColor) canopyInst.instanceColor.needsUpdate = true;
    trunkInst.computeBoundingSphere();
    canopyInst.computeBoundingSphere();
    group.add(trunkInst, canopyInst);
  }

  // 3B. Birch / Broadleaf Trees (Silver Trunk + Multi-Lobe Foliage Crown)
  const birches = byType.get('birch_tree') ?? [];
  if (birches.length > 0) {
    const bTrunk = trackG(new THREE.CylinderGeometry(0.11, 0.18, 2.8, 7));
    bTrunk.translate(0, 1.4, 0);

    const s1 = new THREE.DodecahedronGeometry(1.45, 1);
    s1.translate(0, 3.8, 0);
    const s2 = new THREE.DodecahedronGeometry(1.1, 1);
    s2.translate(0.65, 4.6, 0.25);
    const s3 = new THREE.DodecahedronGeometry(1.05, 1);
    s3.translate(-0.55, 4.4, -0.3);
    const bCrown = trackG(mergeBufferGeometries([s1, s2, s3]));
    s1.dispose();
    s2.dispose();
    s3.dispose();

    const birchBarkMat = trackM(new THREE.MeshStandardMaterial({ color: 0xd6d3cd, roughness: 0.78 }));
    const birchLeafMat = trackM(
      new THREE.MeshStandardMaterial({
        color: stage.id === 'finland_jumps' ? 0x6b8e3d : 0x4d7c38,
        roughness: 0.8,
      }),
    );

    const bTrunkInst = new THREE.InstancedMesh(bTrunk, birchBarkMat, birches.length);
    const bCrownInst = new THREE.InstancedMesh(bCrown, birchLeafMat, birches.length);

    birches.forEach((p, idx) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, -p.yaw, 0);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      bTrunkInst.setMatrixAt(idx, dummy.matrix);
      bCrownInst.setMatrixAt(idx, dummy.matrix);

      // Subtle autumn gold vs emerald green variation
      if (idx % 5 === 0) tmpColor.setRGB(1.25, 1.05, 0.58);
      else tmpColor.setRGB(0.9 + (idx % 4) * 0.06, 1.0, 0.88);
      bCrownInst.setColorAt(idx, tmpColor);
    });

    bTrunkInst.instanceMatrix.needsUpdate = true;
    bCrownInst.instanceMatrix.needsUpdate = true;
    if (bCrownInst.instanceColor) bCrownInst.instanceColor.needsUpdate = true;
    bTrunkInst.computeBoundingSphere();
    bCrownInst.computeBoundingSphere();
    group.add(bTrunkInst, bCrownInst);
  }

  // 3C. Faceted Boulders & Rock Outcrops
  const rocks = byType.get('rock_outcrop') ?? [];
  if (rocks.length > 0) {
    const rMain = new THREE.DodecahedronGeometry(1.15, 1);
    rMain.scale(1.25, 0.82, 1.05);
    rMain.translate(0, 0.65, 0);
    const rSub = new THREE.DodecahedronGeometry(0.72, 0);
    rSub.translate(0.75, 0.42, 0.35);
    const rockGeom = trackG(mergeBufferGeometries([rMain, rSub]));
    rMain.dispose();
    rSub.dispose();

    const rockMat = trackM(
      new THREE.MeshStandardMaterial({
        color: isSnow ? 0x8896a6 : 0x736e66,
        roughness: 0.88,
        metalness: 0.06,
      }),
    );
    const rockInst = new THREE.InstancedMesh(rockGeom, rockMat, rocks.length);
    rocks.forEach((p, idx) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set((idx % 3) * 0.08, -p.yaw, 0);
      dummy.scale.set(p.scale * 1.1, p.scale * 0.88, p.scale);
      dummy.updateMatrix();
      rockInst.setMatrixAt(idx, dummy.matrix);
      const shade = 0.82 + (idx % 6) * 0.06;
      tmpColor.setRGB(shade, shade * 0.98, shade * 0.96);
      rockInst.setColorAt(idx, tmpColor);
    });
    rockInst.instanceMatrix.needsUpdate = true;
    if (rockInst.instanceColor) rockInst.instanceColor.needsUpdate = true;
    rockInst.computeBoundingSphere();
    group.add(rockInst);
  }

  // 3D. Steel W-Beam Guardrails, Stone Walls & Bridge Parapets
  const guardrails = byType.get('guardrail') ?? [];
  if (guardrails.length > 0) {
    const postA = new THREE.BoxGeometry(0.14, 0.82, 0.14);
    postA.translate(0, 0.41, -3.5);
    const postB = new THREE.BoxGeometry(0.14, 0.82, 0.14);
    postB.translate(0, 0.41, 3.5);
    const beam = new THREE.BoxGeometry(0.1, 0.32, 10.4);
    beam.translate(0, 0.62, 0);
    const railGeom = trackG(mergeBufferGeometries([postA, postB, beam]));
    postA.dispose();
    postB.dispose();
    beam.dispose();

    const railMat = trackM(
      new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        metalness: 0.68,
        roughness: 0.34,
      }),
    );
    const railInst = new THREE.InstancedMesh(railGeom, railMat, guardrails.length);
    guardrails.forEach((p, idx) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, -p.yaw, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      railInst.setMatrixAt(idx, dummy.matrix);
    });
    railInst.instanceMatrix.needsUpdate = true;
    railInst.computeBoundingSphere();
    group.add(railInst);
  }

  const walls = [...(byType.get('stone_wall') ?? []), ...(byType.get('bridge_parapet') ?? [])];
  if (walls.length > 0) {
    const wBase = new THREE.BoxGeometry(0.55, 0.95, 10.2);
    wBase.translate(0, 0.47, 0);
    const wCap = new THREE.BoxGeometry(0.68, 0.14, 10.3);
    wCap.translate(0, 0.98, 0);
    const wallGeom = trackG(mergeBufferGeometries([wBase, wCap]));
    wBase.dispose();
    wCap.dispose();

    const wallMat = trackM(
      new THREE.MeshStandardMaterial({
        color: 0x8a8378,
        roughness: 0.88,
      }),
    );
    const wallInst = new THREE.InstancedMesh(wallGeom, wallMat, walls.length);
    walls.forEach((p, idx) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, -p.yaw, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      wallInst.setMatrixAt(idx, dummy.matrix);
    });
    wallInst.instanceMatrix.needsUpdate = true;
    wallInst.computeBoundingSphere();
    group.add(wallInst);
  }

  // 3E. FIA Corner Chevron Signs & Red Brake Marker Boards
  const chevrons = byType.get('chevron_sign') ?? [];
  if (chevrons.length > 0) {
    const chevTex = createChevronSignTexture(maxAnisotropy);
    disposables.push(chevTex);
    const postGeom = trackG(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6));
    postGeom.translate(0, 0.75, 0);
    const boardGeom = trackG(new THREE.BoxGeometry(1.35, 0.68, 0.06));
    boardGeom.translate(0, 1.45, 0);

    const postMat = trackM(new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.6, roughness: 0.4 }));
    const boardMat = trackM(new THREE.MeshStandardMaterial({ map: chevTex, roughness: 0.35 }));

    const pInst = new THREE.InstancedMesh(postGeom, postMat, chevrons.length);
    const bInst = new THREE.InstancedMesh(boardGeom, boardMat, chevrons.length);
    chevrons.forEach((p, idx) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, -p.yaw, 0);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      pInst.setMatrixAt(idx, dummy.matrix);
      bInst.setMatrixAt(idx, dummy.matrix);
    });
    pInst.instanceMatrix.needsUpdate = true;
    bInst.instanceMatrix.needsUpdate = true;
    pInst.computeBoundingSphere();
    bInst.computeBoundingSphere();
    group.add(pInst, bInst);
  }

  const brakeBoards = byType.get('brake_board') ?? [];
  if (brakeBoards.length > 0) {
    const brkTex = createBrakeBoardTexture(maxAnisotropy);
    disposables.push(brkTex);
    const brkGeom = trackG(new THREE.BoxGeometry(0.9, 1.35, 0.08));
    brkGeom.translate(0, 0.95, 0);
    const brkMat = trackM(new THREE.MeshStandardMaterial({ map: brkTex, roughness: 0.4 }));
    const brkInst = new THREE.InstancedMesh(brkGeom, brkMat, brakeBoards.length);
    brakeBoards.forEach((p, idx) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, -p.yaw, 0);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      brkInst.setMatrixAt(idx, dummy.matrix);
    });
    brkInst.instanceMatrix.needsUpdate = true;
    brkInst.computeBoundingSphere();
    group.add(brkInst);
  }

  // 3F. Alpine Chalets & Spectator Canopies
  const huts = byType.get('marshal_hut') ?? [];
  if (huts.length > 0) {
    const wallsG = trackG(new THREE.BoxGeometry(5.2, 3.2, 4.2));
    wallsG.translate(0, 1.6, 0);
    const roofG = trackG(new THREE.ConeGeometry(4.1, 2.1, 4));
    roofG.rotateY(Math.PI * 0.25);
    roofG.translate(0, 4.25, 0);

    const wallMat = trackM(new THREE.MeshStandardMaterial({ color: 0xe7dfd3, roughness: 0.85 }));
    const roofMat = trackM(new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.72 }));

    const wInst = new THREE.InstancedMesh(wallsG, wallMat, huts.length);
    const rInst = new THREE.InstancedMesh(roofG, roofMat, huts.length);
    huts.forEach((p, idx) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, -p.yaw, 0);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      wInst.setMatrixAt(idx, dummy.matrix);
      rInst.setMatrixAt(idx, dummy.matrix);
    });
    wInst.instanceMatrix.needsUpdate = true;
    rInst.instanceMatrix.needsUpdate = true;
    wInst.computeBoundingSphere();
    rInst.computeBoundingSphere();
    group.add(wInst, rInst);
  }

  const tents = byType.get('spectator_tent') ?? [];
  if (tents.length > 0) {
    const canopyG = trackG(new THREE.ConeGeometry(2.3, 1.2, 4));
    canopyG.rotateY(Math.PI * 0.25);
    canopyG.translate(0, 2.5, 0);
    const legsG = trackG(new THREE.CylinderGeometry(0.06, 0.06, 2.0, 6));
    legsG.translate(0, 1.0, 0);
    const canopyMat = trackM(new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.6 }));
    const legMat = trackM(new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.6, roughness: 0.35 }));
    const cInst = new THREE.InstancedMesh(canopyG, canopyMat, tents.length);
    const lInst = new THREE.InstancedMesh(legsG, legMat, tents.length);
    tents.forEach((p, idx) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, -p.yaw, 0);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      cInst.setMatrixAt(idx, dummy.matrix);
      lInst.setMatrixAt(idx, dummy.matrix);
    });
    cInst.instanceMatrix.needsUpdate = true;
    lInst.instanceMatrix.needsUpdate = true;
    cInst.computeBoundingSphere();
    lInst.computeBoundingSphere();
    group.add(cInst, lInst);
  }

  // 3G. WRC Start, Sector Split & Flying Finish Truss Arches
  const buildGantryArch = (
    prop: RoadsideProp,
    title: string,
    sub: string,
    accentHex: string,
  ) => {
    const archGroup = new THREE.Group();
    archGroup.position.set(prop.x, prop.y, prop.z);
    archGroup.rotation.y = -prop.yaw;

    const spanHalf = 5.6;
    const height = 5.2;

    const pillarGeom = trackG(new THREE.BoxGeometry(0.48, height, 0.48));
    const pillarMat = trackM(
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.65, roughness: 0.32 }),
    );
    for (const sx of [-spanHalf, spanHalf]) {
      const pil = new THREE.Mesh(pillarGeom, pillarMat);
      pil.position.set(sx, height * 0.5, 0);
      archGroup.add(pil);
    }

    const bannerTex = createArchBannerTexture(title, sub, accentHex, maxAnisotropy);
    disposables.push(bannerTex);
    const beamGeom = trackG(new THREE.BoxGeometry(spanHalf * 2 + 0.8, 1.32, 0.52));
    const bannerMat = trackM(new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.3 }));
    const beam = new THREE.Mesh(beamGeom, bannerMat);
    beam.position.set(0, height + 0.42, 0);
    archGroup.add(beam);

    group.add(archGroup);
  };

  for (const p of byType.get('start_arch') ?? []) {
    buildGantryArch(p, `${stage.code} — STAGE START`, stage.nameEn.toUpperCase(), '#f59e0b');
  }
  (byType.get('split_arch') ?? []).forEach((p, i) => {
    buildGantryArch(p, `SECTOR ${i + 1} SPLIT`, 'FIA CHRONO TIMING', '#0284c7');
  });
  for (const p of byType.get('finish_arch') ?? []) {
    buildGantryArch(p, 'FLYING FINISH', 'STOP CONTROL AHEAD', '#dc2626');
  }

  return {
    group,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
