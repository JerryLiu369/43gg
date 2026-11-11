import type {
  PacenoteItem,
  RoadsideProp,
  StageDefinition,
  StageSegment,
  SurfaceType,
  TimeOfDay,
  TireCompound,
  WeatherType,
} from './types.ts';

interface FeatureBlueprint {
  len: number;
  /**
   * Right-handed Three.js coordinate system:
   * At yaw = 0, forward = (0, 0, -1), right = (+1, 0, 0).
   * curvature > 0 => curves RIGHT on screen (yaw increases).
   * curvature < 0 => curves LEFT on screen (yaw decreases).
   */
  curvature: number;
  slope: number; // -0.11 .. +0.11
  surface?: SurfaceType;
  widthM?: number;
  camberRad?: number;
  roughness?: number;
  scenery?: StageSegment['sceneryType'];
  crest?: boolean;
  jump?: boolean;
  narrowBridge?: boolean;
  waterSplash?: boolean;
  dontCut?: boolean;
  caution?: boolean;
}

interface StageMetaSeed {
  id: string;
  code: string;
  nameZh: string;
  nameEn: string;
  country: string;
  primarySurface: SurfaceType;
  surfaceMixLabel: string;
  defaultWeather: WeatherType;
  defaultTimeOfDay: TimeOfDay;
  recommendedTire: TireCompound;
  descriptionZh: string;
  seedOffset: number;
}

function deterministicHash(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function classifyCornerSeverity(
  absCurvature: number,
  arcAngleRad: number,
): 1 | 2 | 3 | 4 | 5 | 6 | 0 {
  if (absCurvature < 0.0038 || arcAngleRad < 0.11) return 0;
  if (absCurvature >= 0.036 || (absCurvature >= 0.028 && arcAngleRad >= 1.75)) return 1;
  if (absCurvature >= 0.025) return 2;
  if (absCurvature >= 0.017) return 3;
  if (absCurvature >= 0.011) return 4;
  if (absCurvature >= 0.0068) return 5;
  return 6;
}

function tooCloseToEarlierRoad(
  xs: number[],
  zs: number[],
  cx: number,
  cz: number,
  skipRecentPoints: number,
  minClearanceM: number,
): boolean {
  const end = xs.length - skipRecentPoints;
  if (end <= 0) return false;
  const minSq = minClearanceM * minClearanceM;
  for (let i = 0; i < end; i += 2) {
    const dx = cx - xs[i];
    const dz = cz - zs[i];
    if (dx * dx + dz * dz < minSq) {
      return true;
    }
  }
  return false;
}

function resolveSafeFeatureCurvature(
  xs: number[],
  zs: number[],
  startX: number,
  startZ: number,
  startYaw: number,
  proposedCurvature: number,
  lenM: number,
  stepM: number,
): number {
  let curv = Math.max(-0.036, Math.min(0.036, proposedCurvature));
  const maxArcRad = 2.05; // <= 117 degrees per single turn
  if (Math.abs(curv * lenM) > maxArcRad) {
    curv = Math.sign(curv) * (maxArcRad / Math.max(lenM, 1));
  }

  // Keep stage strictly progressing down the valley (-Z, |yaw| <= 1.32 rad) so hairpins alternate cleanly without pinching
  const maxValleyYaw = 1.32;
  const projectedEndYaw = startYaw + curv * lenM;
  if (Math.abs(projectedEndYaw) > maxValleyYaw) {
    const flipped = -curv;
    if (Math.abs(startYaw + flipped * lenM) <= maxValleyYaw) {
      curv = flipped;
    } else {
      const targetYaw = -Math.sign(startYaw || 1) * Math.min(0.85, Math.abs(curv * lenM) * 0.65);
      curv = Math.max(-0.036, Math.min(0.036, (targetYaw - startYaw) / Math.max(lenM, 25)));
    }
  }

  const candidates = [curv, -curv, curv * 0.55, -curv * 0.55, -startYaw * 0.015];
  for (const cand of candidates) {
    let tx = startX;
    let tz = startZ;
    let tyaw = startYaw;
    const steps = Math.max(2, Math.round((lenM + 65) / stepM));
    let safe = true;
    for (let s = 0; s < steps; s++) {
      const k = s * stepM <= lenM ? cand : 0;
      const nextYaw = tyaw + k * stepM;
      if (Math.abs(nextYaw) > 1.38) {
        safe = false;
        break;
      }
      const midYaw = (tyaw + nextYaw) * 0.5;
      tx += Math.sin(midYaw) * stepM;
      tz += -Math.cos(midYaw) * stepM;
      tyaw = nextYaw;
      if (tooCloseToEarlierRoad(xs, zs, tx, tz, 24, 52)) {
        safe = false;
        break;
      }
    }
    if (safe) return cand;
  }

  return Math.max(-0.018, Math.min(0.018, -startYaw * 0.02));
}

function buildProceduralStage(
  meta: StageMetaSeed,
  features: FeatureBlueprint[],
): StageDefinition {
  const stepM = 5;
  const rawCurv: number[] = [];
  const rawSlope: number[] = [];
  const rawWidth: number[] = [];
  const rawCamber: number[] = [];
  const rawRough: number[] = [];
  const rawSurface: SurfaceType[] = [];
  const rawScenery: StageSegment['sceneryType'][] = [];
  const rawFlags: FeatureBlueprint[] = [];

  interface ResolvedFeature {
    startIdx: number;
    endIdx: number;
    startDistM: number;
    lenM: number;
    curvature: number;
    blueprint: FeatureBlueprint;
  }
  const resolvedFeatures: ResolvedFeature[] = [];

  const previewXs: number[] = [0];
  const previewZs: number[] = [0];
  let pX = 0;
  let pZ = 0;
  let pYaw = 0;
  let accumDistM = 0;

  // Ensure every stage spans >= 3.8 km (760+ segments) so lengthM and finish arch always have full 3D road + 100m run-out
  const expandedFeatures: FeatureBlueprint[] = [...features];
  let featureSumM = expandedFeatures.reduce((acc, f) => acc + f.len, 0);
  let srcIdx = 0;
  while (featureSumM < 3680 && features.length > 0) {
    const template = features[srcIdx % features.length];
    expandedFeatures.push({
      ...template,
      curvature: -template.curvature,
      slope: Math.max(-0.08, Math.min(0.08, -template.slope * 0.75)),
    });
    featureSumM += template.len;
    srcIdx++;
  }

  // 90m straight start grid + features + 105m straight flying finish run-out
  const fullFeatures: FeatureBlueprint[] = [
    {
      len: 90,
      curvature: 0,
      slope: 0.004,
      surface: meta.primarySurface,
      widthM: 9.0,
      roughness: 0.06,
      scenery: 'forest',
    },
    ...expandedFeatures,
    {
      len: 105,
      curvature: 0,
      slope: 0,
      surface: meta.primarySurface,
      widthM: 9.2,
      roughness: 0.06,
      scenery: 'forest',
    },
  ];

  for (let fIdx = 0; fIdx < fullFeatures.length; fIdx++) {
    const bp = fullFeatures[fIdx];
    const isTerminal = fIdx === 0 || fIdx === fullFeatures.length - 1;
    const safeCurv = isTerminal
      ? 0
      : resolveSafeFeatureCurvature(
          previewXs,
          previewZs,
          pX,
          pZ,
          pYaw,
          bp.curvature,
          bp.len,
          stepM,
        );

    const count = Math.max(2, Math.round(bp.len / stepM));
    const startIdx = rawCurv.length;
    const actualLenM = count * stepM;

    for (let i = 0; i < count; i++) {
      const midYaw = pYaw + safeCurv * stepM * 0.5;
      pX += Math.sin(midYaw) * stepM;
      pZ += -Math.cos(midYaw) * stepM;
      pYaw += safeCurv * stepM;
      previewXs.push(pX);
      previewZs.push(pZ);

      const defaultCamber =
        Math.abs(safeCurv) > 0.005
          ? Math.sign(safeCurv) * Math.min(0.08, Math.abs(safeCurv) * 2.0)
          : 0;

      rawCurv.push(safeCurv);
      rawSlope.push(bp.slope);
      rawWidth.push(bp.widthM ?? (bp.narrowBridge ? 6.2 : 8.6));
      rawCamber.push(bp.camberRad !== undefined ? bp.camberRad : defaultCamber);
      rawRough.push(bp.roughness ?? 0.14);
      rawSurface.push(bp.surface ?? meta.primarySurface);
      rawScenery.push(
        bp.narrowBridge
          ? 'bridge'
          : bp.jump || bp.crest
            ? 'crest'
            : bp.scenery ?? 'forest',
      );
      rawFlags.push(bp);
    }

    resolvedFeatures.push({
      startIdx,
      endIdx: rawCurv.length - 1,
      startDistM: accumDistM,
      lenM: actualLenM,
      curvature: safeCurv,
      blueprint: bp,
    });
    accumDistM += actualLenM;
  }

  const n = rawCurv.length;
  const smooth = (arr: number[], radius: number): number[] => {
    const out = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      let wSum = 0;
      for (let k = -radius; k <= radius; k++) {
        const idx = Math.max(0, Math.min(n - 1, i + k));
        const w = radius + 1 - Math.abs(k);
        sum += arr[idx] * w;
        wSum += w;
      }
      out[i] = sum / wSum;
    }
    return out;
  };

  const sCurv = smooth(rawCurv, 3);
  const sSlope = smooth(rawSlope, 4);
  const sWidth = smooth(rawWidth, 3);
  const sCamber = smooth(rawCamber, 3);

  const segments: StageSegment[] = [];
  let x = 0;
  let y = 24;
  let z = 0;
  let yaw = 0;
  let minY = y;
  let maxY = y;

  for (let i = 0; i < n; i++) {
    const k = i < 14 ? 0 : sCurv[i];
    const bp = rawFlags[i];
    let crestLift = 0;
    if (bp.jump || bp.crest) {
      const prevCrest = i > 0 && (rawFlags[i - 1].jump || rawFlags[i - 1].crest);
      const nextCrest = i < n - 1 && (rawFlags[i + 1].jump || rawFlags[i + 1].crest);
      if (prevCrest && nextCrest) {
        crestLift = bp.jump ? 0.032 : 0.016;
      }
    }
    const grade = Math.max(-0.12, Math.min(0.12, sSlope[i] + crestLift));

    // Right-handed forward & right vectors in 3D space
    const horiz = 1 / Math.hypot(1, grade);
    const tangentX = Math.sin(yaw) * horiz;
    const tangentY = grade * horiz;
    const tangentZ = -Math.cos(yaw) * horiz;
    const normalX = Math.cos(yaw);
    const normalZ = Math.sin(yaw);

    segments.push({
      index: i,
      distanceM: i * stepM,
      x,
      y,
      z,
      tangentX,
      tangentY,
      tangentZ,
      normalX,
      normalZ,
      camberRad: sCamber[i],
      widthM: sWidth[i],
      surface: rawSurface[i],
      curvature: k,
      slope: grade,
      roughness: rawRough[i],
      sceneryType: rawScenery[i],
    });

    const midYaw = yaw + k * stepM * 0.5;
    x += Math.sin(midYaw) * stepM;
    z += -Math.cos(midYaw) * stepM;
    y += grade * stepM;
    yaw += k * stepM;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const lengthM = (n - 20) * stepM;
  const finishSegIdx = Math.min(segments.length - 4, Math.floor(lengthM / stepM));
  const sectorSplitsM: [number, number, number] = [
    Math.round((lengthM / 3) / 10) * 10,
    Math.round(((lengthM * 2) / 3) / 10) * 10,
    lengthM,
  ];

  // Build Pacenotes matching exact Right/Left visual geometry!
  const pacenotes: PacenoteItem[] = [];
  let noteSeq = 1;
  for (let fIdx = 1; fIdx < resolvedFeatures.length - 1; fIdx++) {
    const rf = resolvedFeatures[fIdx];
    if (rf.startDistM >= lengthM - 45) break;

    const absK = Math.abs(rf.curvature);
    const arcRad = absK * rf.lenM;
    const sev = classifyCornerSeverity(absK, arcRad);
    const bp = rf.blueprint;

    if (sev === 0 && !bp.jump && !bp.crest && !bp.narrowBridge && !bp.waterSplash) {
      continue;
    }

    let direction: 'left' | 'right' | 'center' = 'center';
    let type: PacenoteItem['type'] = 'straight';
    let labelCore = '';
    let speechCore = '';

    if (sev >= 1) {
      const isRight = rf.curvature > 0;
      direction = isRight ? 'right' : 'left';
      const dirZh = isRight ? '右' : '左';
      if (sev === 1 && arcRad >= 1.75) {
        type = isRight ? 'hairpin_right' : 'hairpin_left';
        labelCore = `${dirZh}发卡弯`;
        speechCore = `${dirZh}发卡弯`;
      } else if (sev === 1 || (sev === 2 && rf.lenM <= 48 && arcRad >= 1.3)) {
        type = isRight ? 'square_right' : 'square_left';
        labelCore = `${dirZh}直角弯`;
        speechCore = `${dirZh}直角`;
      } else {
        type = `${direction}_${sev}` as PacenoteItem['type'];
        labelCore = `${dirZh} ${sev}`;
        speechCore = `${dirZh}${sev}`;
      }
    } else if (bp.jump) {
      type = 'jump';
      labelCore = '大飞跳';
      speechCore = '坡顶大飞跳';
    } else if (bp.narrowBridge) {
      type = 'narrow_bridge';
      labelCore = '窄桥通过';
      speechCore = '注意窄桥';
    } else if (bp.waterSplash) {
      type = 'water_splash';
      labelCore = '涉水浅滩';
      speechCore = '注意涉水';
    } else if (bp.crest) {
      type = 'crest';
      labelCore = '坡顶全油';
      speechCore = '坡顶全油';
    }

    const mods: string[] = [];
    if (bp.caution) mods.push('重刹注意');
    if (bp.dontCut) mods.push('切勿切弯');
    if (bp.narrowBridge && sev >= 1) mods.push('变窄过桥');
    if ((bp.jump || bp.crest) && sev >= 1) mods.push('过坡顶');
    if (rf.lenM >= 100 && sev >= 2) mods.push('长弯');

    let distanceLinkM: number | undefined;
    for (let look = fIdx + 1; look < resolvedFeatures.length - 1; look++) {
      const nxt = resolvedFeatures[look];
      const nxtSev = classifyCornerSeverity(
        Math.abs(nxt.curvature),
        Math.abs(nxt.curvature * nxt.lenM),
      );
      if (nxtSev >= 1 || nxt.blueprint.jump || nxt.blueprint.narrowBridge) {
        const gap = Math.round((nxt.startDistM - (rf.startDistM + rf.lenM)) / 10) * 10;
        if (gap >= 20 && gap <= 240) distanceLinkM = gap;
        break;
      }
    }

    const modifierStr = mods.length > 0 ? mods.join(' · ') : undefined;
    pacenotes.push({
      id: `${meta.id}_note_${noteSeq++}`,
      triggerDistanceM: Math.max(10, rf.startDistM - 115),
      cornerDistanceM: rf.startDistM,
      type,
      severity: sev,
      direction,
      modifier: modifierStr,
      calloutTextZh: modifierStr ? `${labelCore} · ${modifierStr}` : labelCore,
      calloutSpeechZh: modifierStr ? `${speechCore}，${mods[0]}` : speechCore,
      distanceLinkM,
    });
  }

  pacenotes.push({
    id: `${meta.id}_finish`,
    triggerDistanceM: lengthM - 150,
    cornerDistanceM: lengthM - 15,
    type: 'finish',
    severity: 0,
    direction: 'center',
    calloutTextZh: '冲刺终点龙门架！全油冲线',
    calloutSpeechZh: '前方终点冲线',
  });

  // Build Non-Overlapping Roadside Props
  const props: RoadsideProp[] = [];

  const isClearOfAllRoad = (wx: number, wz: number, marginM: number): boolean => {
    for (let j = 0; j < segments.length; j += 2) {
      const s = segments[j];
      const dx = wx - s.x;
      const dz = wz - s.z;
      const minR = s.widthM * 0.5 + marginM;
      if (dx * dx + dz * dz < minR * minR) return false;
    }
    return true;
  };

  const placeProp = (
    segIdx: number,
    sideSign: 1 | -1, // +1 = right, -1 = left
    edgeDistM: number,
    type: RoadsideProp['type'],
    scale = 1,
    yawOverride?: number,
  ) => {
    const seg = segments[Math.max(0, Math.min(segments.length - 1, segIdx))];
    const offset = sideSign * (seg.widthM * 0.5 + edgeDistM);
    const wx = seg.x + seg.normalX * offset;
    const wz = seg.z + seg.normalZ * offset;

    if (
      type !== 'start_arch' &&
      type !== 'split_arch' &&
      type !== 'finish_arch' &&
      !isClearOfAllRoad(wx, wz, Math.min(2.0, Math.max(0.6, edgeDistM - 0.4)))
    ) {
      return;
    }

    const vergeDrop = edgeDistM > 2.2 ? -0.16 : -0.03;
    const wy = seg.y - Math.sin(seg.camberRad) * offset + vergeDrop;
    const segYaw = Math.atan2(seg.tangentX, -seg.tangentZ);

    props.push({
      x: wx,
      y: wy,
      z: wz,
      yaw: yawOverride !== undefined ? yawOverride : segYaw,
      scale,
      type,
      collisionRadius: 0,
      hardness: 0.5,
      side: sideSign > 0 ? 'right' : 'left',
    });
  };

  // Start Arch (at 28m, ahead of spawn at 12m)
  const startSeg = segments[6];
  props.push({
    x: startSeg.x,
    y: startSeg.y,
    z: startSeg.z,
    yaw: Math.atan2(startSeg.tangentX, -startSeg.tangentZ),
    scale: 1,
    type: 'start_arch',
    collisionRadius: 0,
    hardness: 1,
    side: 'center' as 'left',
  });

  // 2 Sector Split Arches
  for (let s = 0; s < 2; s++) {
    const splitSegIdx = Math.min(segments.length - 6, Math.floor(sectorSplitsM[s] / stepM));
    const spSeg = segments[splitSegIdx];
    props.push({
      x: spSeg.x,
      y: spSeg.y,
      z: spSeg.z,
      yaw: Math.atan2(spSeg.tangentX, -spSeg.tangentZ),
      scale: 1,
      type: 'split_arch',
      collisionRadius: 0,
      hardness: 1,
      side: 'left',
    });
  }

  // Finish Arch
  const finSeg = segments[finishSegIdx];
  props.push({
    x: finSeg.x,
    y: finSeg.y,
    z: finSeg.z,
    yaw: Math.atan2(finSeg.tangentX, -finSeg.tangentZ),
    scale: 1,
    type: 'finish_arch',
    collisionRadius: 0,
    hardness: 1,
    side: 'left',
  });

  // Brake Boards, Guardrails, Bridge Parapets & Chevron Signs
  for (const rf of resolvedFeatures) {
    const absK = Math.abs(rf.curvature);
    const sev = classifyCornerSeverity(absK, absK * rf.lenM);
    const bp = rf.blueprint;

    if (bp.narrowBridge) {
      for (let i = rf.startIdx; i <= rf.endIdx; i += 2) {
        placeProp(i, 1, 0.85, 'bridge_parapet', 1);
        placeProp(i, -1, 0.85, 'bridge_parapet', 1);
      }
    }

    if (sev === 0 || sev > 4) continue;
    // Outside of a RIGHT turn (k > 0) is LEFT (-1); outside of a LEFT turn (k < 0) is RIGHT (+1)
    const outsideSign: 1 | -1 = rf.curvature > 0 ? -1 : 1;

    if (sev <= 3) {
      const idx100 = Math.max(8, rf.startIdx - 16);
      const idx50 = Math.max(8, rf.startIdx - 8);
      placeProp(idx100, outsideSign, 1.8, 'brake_board', 1);
      placeProp(idx50, outsideSign, 1.8, 'brake_board', 0.92);
    }

    for (let i = rf.startIdx - 2; i <= rf.endIdx + 2; i += 2) {
      if (i < 8 || i >= finishSegIdx - 4) continue;
      placeProp(i, outsideSign, 1.55, bp.scenery === 'cliff' ? 'stone_wall' : 'guardrail', 1);
      if (sev <= 3 && (i - rf.startIdx) % 4 === 0 && i >= rf.startIdx && i <= rf.endIdx) {
        placeProp(i, outsideSign, 2.25, 'chevron_sign', 1);
      }
    }
  }

  // Forests, Rocks, Village Huts & Spectator Tents
  const seed = meta.seedOffset;
  const preferPine =
    meta.primarySurface === 'snow' ||
    meta.id === 'finland_jumps' ||
    meta.id === 'turini_tarmac';

  for (let i = 7; i < segments.length - 8; i += 2) {
    const h1 = deterministicHash(seed * 997 + i * 3.17);
    const h2 = deterministicHash(seed * 997 + i * 7.31);
    const h3 = deterministicHash(seed * 997 + i * 13.73);
    const bp = rawFlags[i];

    if (bp.scenery === 'village' && i % 6 === 0) {
      const side: 1 | -1 = h1 > 0.5 ? 1 : -1;
      const segYaw = Math.atan2(segments[i].tangentX, -segments[i].tangentZ);
      placeProp(
        i,
        side,
        5.5 + h2 * 4.0,
        'marshal_hut',
        1.0 + h3 * 0.35,
        segYaw + (side > 0 ? -Math.PI * 0.5 : Math.PI * 0.5),
      );
      if (h3 > 0.45) {
        placeProp(i + 1, (side * -1) as 1 | -1, 4.2 + h1 * 3.0, 'spectator_tent', 1.0);
      }
      continue;
    }

    // Inner forest line (safe 3.8m .. 13.5m outside road edge)
    const sideA: 1 | -1 = h1 > 0.5 ? 1 : -1;
    placeProp(
      i,
      sideA,
      3.8 + h2 * 10.5,
      preferPine || h3 > 0.4 ? 'pine_tree' : 'birch_tree',
      0.85 + h3 * 0.65,
      h1 * Math.PI * 2,
    );

    if (h2 > 0.24) {
      placeProp(
        i,
        (sideA * -1) as 1 | -1,
        4.4 + h1 * 12.5,
        preferPine ? 'pine_tree' : h2 > 0.55 ? 'birch_tree' : 'pine_tree',
        0.8 + h1 * 0.7,
        h2 * Math.PI * 2,
      );
    }

    // Outer deep forest belt
    if (i % 4 === 0) {
      placeProp(
        i,
        h3 > 0.5 ? 1 : -1,
        15.5 + h1 * 18.0,
        preferPine ? 'pine_tree' : 'birch_tree',
        1.1 + h2 * 0.65,
        h3 * Math.PI * 2,
      );
    }

    // Rock outcrops
    if (bp.scenery === 'cliff' || bp.dontCut || h3 > 0.78) {
      const rockSide: 1 | -1 = bp.dontCut
        ? rawCurv[i] >= 0
          ? 1
          : -1
        : h2 > 0.5
          ? 1
          : -1;
      const rockDist = bp.dontCut ? 2.5 + h1 * 1.5 : 3.8 + h2 * 8.0;
      placeProp(i, rockSide, rockDist, 'rock_outcrop', 0.8 + h3 * 0.85, h1 * Math.PI * 2);
    }
  }

  // Target par time calibrated realistically (~38 m/s average pace => ~96–112s for 3.8km)
  const targetParTimeSec = Math.round(lengthM / 35.5);

  return {
    id: meta.id,
    code: meta.code,
    nameZh: meta.nameZh,
    nameEn: meta.nameEn,
    country: meta.country,
    lengthM,
    primarySurface: meta.primarySurface,
    surfaceMixLabel: meta.surfaceMixLabel,
    defaultWeather: meta.defaultWeather,
    defaultTimeOfDay: meta.defaultTimeOfDay,
    recommendedTire: meta.recommendedTire,
    elevationGainM: Math.max(28, Math.round(maxY - minY)),
    descriptionZh: meta.descriptionZh,
    targetParTimeSec,
    sectorSplitsM,
    segments,
    props,
    pacenotes,
  };
}

// ============================================================================
// 6 WORLD RALLY CHAMPIONSHIP SPECIAL STAGES (~3.8 - 4.1 km EACH)
// ============================================================================

const FINLAND_FEATURES: FeatureBlueprint[] = [
  { len: 145, curvature: 0.006, slope: 0.025, crest: true },
  { len: 120, curvature: -0.013, slope: -0.03 },
  { len: 155, curvature: 0.003, slope: 0.052, jump: true, caution: true },
  { len: 110, curvature: 0.019, slope: -0.02, camberRad: 0.06 },
  { len: 145, curvature: -0.008, slope: 0.03, crest: true },
  { len: 95, curvature: -0.026, slope: -0.015, dontCut: true },
  { len: 165, curvature: 0.004, slope: 0.045, jump: true },
  { len: 120, curvature: 0.015, slope: -0.035, scenery: 'lake' },
  { len: 75, curvature: -0.033, slope: 0.01, caution: true, scenery: 'village' },
  { len: 155, curvature: 0.009, slope: 0.035, crest: true },
  { len: 105, curvature: 0.022, slope: -0.025, narrowBridge: true },
  { len: 165, curvature: -0.005, slope: 0.048, jump: true, caution: true },
  { len: 110, curvature: -0.019, slope: -0.03, camberRad: -0.06 },
  { len: 135, curvature: 0.013, slope: 0.015, scenery: 'village' },
  { len: 62, curvature: 0.038, slope: 0.005, caution: true, dontCut: true },
  { len: 165, curvature: -0.007, slope: -0.04, crest: true },
  { len: 115, curvature: -0.023, slope: 0.02 },
  { len: 155, curvature: 0.011, slope: 0.038, jump: true },
  { len: 115, curvature: -0.016, slope: -0.025 },
  { len: 145, curvature: 0.008, slope: -0.01, crest: true },
  { len: 135, curvature: -0.014, slope: 0.02 },
  { len: 95, curvature: 0.024, slope: -0.015, caution: true },
  { len: 160, curvature: -0.006, slope: 0.03, jump: true },
  { len: 130, curvature: 0.012, slope: -0.02 },
  { len: 145, curvature: -0.009, slope: -0.01 },
  { len: 135, curvature: 0.007, slope: 0.005, crest: true },
];

const TURINI_FEATURES: FeatureBlueprint[] = [
  { len: 135, curvature: 0.011, slope: 0.052, surface: 'tarmac', scenery: 'cliff' },
  { len: 58, curvature: -0.041, slope: 0.04, surface: 'tarmac', caution: true, dontCut: true, scenery: 'cliff' },
  { len: 145, curvature: 0.008, slope: 0.058, surface: 'tarmac', narrowBridge: true },
  { len: 58, curvature: 0.041, slope: 0.035, surface: 'tarmac', caution: true, scenery: 'cliff' },
  { len: 135, curvature: -0.015, slope: 0.045, surface: 'tarmac', scenery: 'village' },
  { len: 120, curvature: 0.02, slope: 0.03, surface: 'tarmac_dirty', caution: true },
  { len: 60, curvature: -0.039, slope: 0.025, surface: 'tarmac_dirty', dontCut: true, scenery: 'cliff' },
  { len: 155, curvature: 0.009, slope: 0.048, surface: 'snow', crest: true },
  { len: 105, curvature: 0.025, slope: -0.035, surface: 'ice', caution: true },
  { len: 125, curvature: -0.021, slope: -0.042, surface: 'snow' },
  { len: 58, curvature: 0.041, slope: -0.03, surface: 'tarmac_dirty', caution: true },
  { len: 150, curvature: -0.013, slope: -0.048, surface: 'tarmac', scenery: 'cliff' },
  { len: 110, curvature: 0.024, slope: -0.035, surface: 'tarmac', dontCut: true },
  { len: 58, curvature: -0.04, slope: -0.02, surface: 'tarmac', scenery: 'village' },
  { len: 155, curvature: 0.012, slope: -0.038, surface: 'tarmac' },
  { len: 125, curvature: -0.019, slope: -0.015, surface: 'tarmac' },
  { len: 145, curvature: 0.014, slope: 0.015, surface: 'tarmac', crest: true },
  { len: 95, curvature: -0.026, slope: 0.025, surface: 'tarmac_dirty', caution: true },
  { len: 145, curvature: 0.011, slope: -0.02, surface: 'tarmac' },
  { len: 62, curvature: 0.037, slope: -0.015, surface: 'tarmac', caution: true },
  { len: 155, curvature: -0.014, slope: -0.025, surface: 'tarmac' },
  { len: 135, curvature: 0.016, slope: -0.01, surface: 'tarmac' },
  { len: 145, curvature: -0.01, slope: 0.005, surface: 'tarmac' },
  { len: 140, curvature: 0.008, slope: 0, surface: 'tarmac' },
];

const SWEDEN_FEATURES: FeatureBlueprint[] = [
  { len: 155, curvature: -0.009, slope: 0.02, surface: 'snow' },
  { len: 125, curvature: 0.017, slope: -0.015, surface: 'snow', camberRad: 0.07 },
  { len: 150, curvature: -0.014, slope: 0.03, surface: 'ice', crest: true },
  { len: 85, curvature: 0.03, slope: -0.02, surface: 'snow', caution: true },
  { len: 165, curvature: -0.007, slope: 0.042, surface: 'snow', jump: true, caution: true },
  { len: 115, curvature: -0.023, slope: -0.025, surface: 'ice', caution: true },
  { len: 140, curvature: 0.018, slope: 0.015, surface: 'snow', scenery: 'village' },
  { len: 62, curvature: -0.038, slope: 0.01, surface: 'snow', caution: true },
  { len: 165, curvature: 0.008, slope: -0.03, surface: 'ice', crest: true },
  { len: 110, curvature: 0.024, slope: 0.02, surface: 'snow', narrowBridge: true },
  { len: 140, curvature: -0.016, slope: -0.025, surface: 'snow' },
  { len: 65, curvature: 0.035, slope: 0.015, surface: 'ice', caution: true },
  { len: 165, curvature: -0.01, slope: 0.038, surface: 'snow', jump: true },
  { len: 125, curvature: 0.016, slope: -0.02, surface: 'snow' },
  { len: 145, curvature: -0.019, slope: 0.015, surface: 'snow' },
  { len: 155, curvature: 0.011, slope: -0.025, surface: 'ice', crest: true },
  { len: 95, curvature: -0.027, slope: 0.01, surface: 'snow', caution: true },
  { len: 160, curvature: 0.009, slope: 0.03, surface: 'snow', jump: true },
  { len: 140, curvature: -0.013, slope: -0.02, surface: 'snow' },
  { len: 150, curvature: 0.01, slope: -0.005, surface: 'snow' },
];

const ACROPOLIS_FEATURES: FeatureBlueprint[] = [
  { len: 135, curvature: -0.014, slope: 0.045, roughness: 0.28, dontCut: true, scenery: 'cliff' },
  { len: 60, curvature: 0.04, slope: 0.048, roughness: 0.32, caution: true, dontCut: true, scenery: 'cliff' },
  { len: 140, curvature: -0.017, slope: 0.038, roughness: 0.25, narrowBridge: true },
  { len: 58, curvature: -0.041, slope: 0.035, roughness: 0.3, caution: true, dontCut: true },
  { len: 150, curvature: 0.011, slope: 0.05, roughness: 0.26, crest: true, scenery: 'cliff' },
  { len: 95, curvature: 0.027, slope: -0.03, roughness: 0.34, dontCut: true },
  { len: 130, curvature: -0.02, slope: -0.042, roughness: 0.26, waterSplash: true, surface: 'water_puddle' },
  { len: 60, curvature: 0.039, slope: -0.025, roughness: 0.3, caution: true, scenery: 'village' },
  { len: 160, curvature: -0.01, slope: 0.032, roughness: 0.24, jump: true },
  { len: 105, curvature: -0.025, slope: -0.038, roughness: 0.32, dontCut: true, scenery: 'cliff' },
  { len: 135, curvature: 0.019, slope: -0.032, roughness: 0.26 },
  { len: 62, curvature: -0.037, slope: -0.02, roughness: 0.3, caution: true },
  { len: 150, curvature: 0.013, slope: 0.025, roughness: 0.24, crest: true },
  { len: 120, curvature: -0.021, slope: -0.025, roughness: 0.28, dontCut: true },
  { len: 145, curvature: 0.015, slope: 0.02, roughness: 0.25 },
  { len: 85, curvature: 0.031, slope: -0.015, roughness: 0.3, caution: true },
  { len: 155, curvature: -0.012, slope: -0.03, roughness: 0.24, jump: true },
  { len: 140, curvature: 0.016, slope: -0.015, roughness: 0.25 },
  { len: 150, curvature: -0.011, slope: -0.01, roughness: 0.22 },
  { len: 145, curvature: 0.009, slope: 0, roughness: 0.2 },
];

const WALES_FEATURES: FeatureBlueprint[] = [
  { len: 145, curvature: 0.012, slope: -0.02, surface: 'gravel', roughness: 0.2 },
  { len: 105, curvature: -0.024, slope: -0.035, surface: 'gravel', caution: true, dontCut: true },
  { len: 155, curvature: 0.009, slope: 0.03, surface: 'gravel', crest: true },
  { len: 95, curvature: 0.029, slope: -0.015, surface: 'tarmac_dirty', narrowBridge: true, scenery: 'village' },
  { len: 140, curvature: -0.017, slope: 0.038, surface: 'gravel', roughness: 0.24 },
  { len: 60, curvature: -0.039, slope: 0.01, surface: 'gravel', caution: true },
  { len: 165, curvature: 0.01, slope: -0.038, surface: 'water_puddle', waterSplash: true, caution: true },
  { len: 125, curvature: 0.022, slope: 0.02, surface: 'gravel' },
  { len: 100, curvature: -0.027, slope: -0.025, surface: 'gravel', dontCut: true },
  { len: 155, curvature: 0.014, slope: 0.028, surface: 'gravel', jump: true },
  { len: 65, curvature: -0.035, slope: -0.02, surface: 'tarmac_dirty', caution: true, scenery: 'village' },
  { len: 150, curvature: 0.013, slope: -0.025, surface: 'gravel' },
  { len: 125, curvature: -0.02, slope: 0.02, surface: 'gravel', crest: true },
  { len: 95, curvature: 0.028, slope: -0.015, surface: 'water_puddle', waterSplash: true },
  { len: 155, curvature: -0.012, slope: 0.03, surface: 'gravel', jump: true },
  { len: 135, curvature: 0.017, slope: -0.02, surface: 'gravel' },
  { len: 145, curvature: -0.014, slope: -0.01, surface: 'gravel' },
  { len: 150, curvature: 0.01, slope: 0, surface: 'gravel' },
  { len: 145, curvature: -0.008, slope: 0.005, surface: 'gravel' },
];

const CORSICA_FEATURES: FeatureBlueprint[] = [
  { len: 130, curvature: -0.019, slope: 0.032, surface: 'tarmac', scenery: 'cliff' },
  { len: 105, curvature: 0.027, slope: 0.038, surface: 'tarmac', dontCut: true, scenery: 'cliff' },
  { len: 125, curvature: -0.022, slope: 0.025, surface: 'tarmac' },
  { len: 58, curvature: 0.041, slope: 0.02, surface: 'tarmac', caution: true, scenery: 'village' },
  { len: 140, curvature: -0.017, slope: -0.028, surface: 'tarmac', scenery: 'cliff' },
  { len: 105, curvature: 0.025, slope: -0.035, surface: 'tarmac_dirty', narrowBridge: true, dontCut: true },
  { len: 60, curvature: -0.039, slope: -0.015, surface: 'tarmac', caution: true },
  { len: 150, curvature: 0.015, slope: 0.03, surface: 'tarmac', crest: true },
  { len: 115, curvature: -0.025, slope: 0.02, surface: 'tarmac', dontCut: true, scenery: 'cliff' },
  { len: 95, curvature: 0.03, slope: -0.025, surface: 'tarmac', caution: true, scenery: 'village' },
  { len: 135, curvature: -0.02, slope: -0.03, surface: 'tarmac' },
  { len: 62, curvature: 0.037, slope: -0.01, surface: 'tarmac', caution: true },
  { len: 150, curvature: -0.013, slope: 0.025, surface: 'tarmac', crest: true },
  { len: 115, curvature: 0.023, slope: -0.02, surface: 'tarmac_dirty', dontCut: true },
  { len: 140, curvature: -0.018, slope: 0.015, surface: 'tarmac' },
  { len: 90, curvature: 0.029, slope: -0.02, surface: 'tarmac', caution: true },
  { len: 150, curvature: -0.015, slope: -0.015, surface: 'tarmac' },
  { len: 135, curvature: 0.018, slope: 0.01, surface: 'tarmac' },
  { len: 145, curvature: -0.012, slope: -0.005, surface: 'tarmac' },
  { len: 145, curvature: 0.009, slope: 0, surface: 'tarmac' },
];

const BUILT_STAGES: StageDefinition[] = [
  buildProceduralStage(
    {
      id: 'finland_jumps',
      code: 'SS01 · FIN',
      nameZh: '奥宁波亚千湖飞跳',
      nameEn: 'Ouninpohja Flying Gravel',
      country: '芬兰 · 于韦斯屈莱',
      primarySurface: 'gravel',
      surfaceMixLabel: '96% 高速砂石 / 4% 木桥',
      defaultWeather: 'clear',
      defaultTimeOfDay: 'day',
      recommendedTire: 'gravel',
      descriptionZh: '标志性芬兰森林极速砂石赛段，连续坡顶盲跳与高倾角流畅弯道考验全油门胆识与落地姿态控制。',
      seedOffset: 11,
    },
    FINLAND_FEATURES,
  ),
  buildProceduralStage(
    {
      id: 'turini_tarmac',
      code: 'SS02 · MCO',
      nameZh: '图里尼山口混合冰雪',
      nameEn: 'Col de Turini Mixed Pass',
      country: '摩纳哥 · 阿尔卑斯',
      primarySurface: 'tarmac',
      surfaceMixLabel: '68% 山地柏油 / 32% 山顶冰雪暗冰',
      defaultWeather: 'clear',
      defaultTimeOfDay: 'dusk',
      recommendedTire: 'tarmac_dry',
      descriptionZh: '从干地峡谷柏油连续发卡弯一路爬升至阿尔卑斯山顶冰雪与镜面暗冰路段，极具轮胎策略挑战。',
      seedOffset: 23,
    },
    TURINI_FEATURES,
  ),
  buildProceduralStage(
    {
      id: 'sweden_snow',
      code: 'SS03 · SWE',
      nameZh: '韦姆兰科林坡顶雪道',
      nameEn: 'Vargåsen Colin Crest',
      country: '瑞典 · 韦姆兰',
      primarySurface: 'snow',
      surfaceMixLabel: '74% 压实雪道 / 26% 镜面冰面',
      defaultWeather: 'snow',
      defaultTimeOfDay: 'day',
      recommendedTire: 'snow',
      descriptionZh: '北欧纯白高速冰雪林道，换装钨钢钉胎后可在雪墙边缘借力完成华丽四轮全动力漂移。',
      seedOffset: 37,
    },
    SWEDEN_FEATURES,
  ),
  buildProceduralStage(
    {
      id: 'acropolis_rock',
      code: 'SS04 · GRC',
      nameZh: '雅典卫城乱石山脊',
      nameEn: 'Elatia Rocky Ridge',
      country: '希腊 · 拉米亚',
      primarySurface: 'gravel',
      surfaceMixLabel: '92% 粗砺碎石 / 8% 涉水浅滩',
      defaultWeather: 'clear',
      defaultTimeOfDay: 'day',
      recommendedTire: 'gravel',
      descriptionZh: '地中海烈日下的高落差碎石悬崖山脊，包含涉水浅滩与乱石内侧禁切发卡弯，极度考验悬挂调校。',
      seedOffset: 53,
    },
    ACROPOLIS_FEATURES,
  ),
  buildProceduralStage(
    {
      id: 'wales_mud',
      code: 'SS05 · GBR',
      nameZh: '威尔士哈弗伦浓雾泥林',
      nameEn: 'Sweet Lamb Hafren Mud',
      country: '英国 · 威尔士',
      primarySurface: 'gravel',
      surfaceMixLabel: '80% 湿滑泥泞砂石 / 20% 脏柏油与积水',
      defaultWeather: 'rain',
      defaultTimeOfDay: 'dusk',
      recommendedTire: 'gravel',
      descriptionZh: '阴雨浓雾笼罩的松林泥泞砂石道，穿插积水深坑与村镇湿滑柏油窄桥，抓地力瞬息万变。',
      seedOffset: 71,
    },
    WALES_FEATURES,
  ),
  buildProceduralStage(
    {
      id: 'corsica_cliff',
      code: 'SS06 · FRA',
      nameZh: '科西嘉万弯海岸悬崖',
      nameEn: 'Cap Corse 10,000 Corners',
      country: '法国 · 科西嘉岛',
      primarySurface: 'tarmac',
      surfaceMixLabel: '90% 海岸柏油 / 10% 碎石带脏柏油',
      defaultWeather: 'clear',
      defaultTimeOfDay: 'dusk',
      recommendedTire: 'tarmac_dry',
      descriptionZh: '零长直道喘息的海岸悬崖连续技术柏油弯道，精准循迹刹车与重心转移是刷出紫段的唯一秘诀。',
      seedOffset: 89,
    },
    CORSICA_FEATURES,
  ),
];

export function getAllStages(): StageDefinition[] {
  return BUILT_STAGES;
}

export function getStageById(id: string): StageDefinition {
  return BUILT_STAGES.find((s) => s.id === id) ?? BUILT_STAGES[0];
}

export interface StageWorldSample {
  segmentIndex: number;
  segment: StageSegment;
  distanceAlongStageM: number;
  /** Signed offset along road RIGHT normal (+ = right of centerline, - = left of centerline) */
  lateralOffsetM: number;
  roadY: number;
  roadYaw: number;
  roadPitch: number;
  roadBank: number;
  halfWidthM: number;
  surface: SurfaceType;
  roughness: number;
}

export function sampleStageAtWorldPos(
  stage: StageDefinition,
  wx: number,
  wz: number,
  hintSegmentIndex = 0,
): StageWorldSample {
  const segs = stage.segments;
  const total = segs.length;
  const windowRadius = 22;
  const lo = Math.max(0, hintSegmentIndex - windowRadius);
  const hi = Math.min(total - 2, hintSegmentIndex + windowRadius);

  let bestIdx = Math.max(0, Math.min(total - 2, hintSegmentIndex));
  let bestT = 0;
  let bestDistSq = Infinity;

  const scan = (start: number, end: number) => {
    for (let i = start; i <= end; i++) {
      const a = segs[i];
      const b = segs[i + 1];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const abLenSq = abx * abx + abz * abz || 1;
      const t = Math.max(0, Math.min(1, ((wx - a.x) * abx + (wz - a.z) * abz) / abLenSq));
      const cx = a.x + abx * t;
      const cz = a.z + abz * t;
      const dx = wx - cx;
      const dz = wz - cz;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = i;
        bestT = t;
      }
    }
  };

  scan(lo, hi);
  if (bestDistSq > 95 * 95) {
    scan(0, total - 2);
  }

  const a = segs[bestIdx];
  const b = segs[bestIdx + 1];
  const cx = a.x + (b.x - a.x) * bestT;
  const cy = a.y + (b.y - a.y) * bestT;
  const cz = a.z + (b.z - a.z) * bestT;

  let nx = a.normalX + (b.normalX - a.normalX) * bestT;
  let nz = a.normalZ + (b.normalZ - a.normalZ) * bestT;
  const nLen = Math.hypot(nx, nz) || 1;
  nx /= nLen;
  nz /= nLen;

  const tx = a.tangentX + (b.tangentX - a.tangentX) * bestT;
  const tz = a.tangentZ + (b.tangentZ - a.tangentZ) * bestT;
  const roadYaw = Math.atan2(tx, -tz);

  const slope = a.slope + (b.slope - a.slope) * bestT;
  const roadPitch = Math.atan(slope);
  const roadBank = a.camberRad + (b.camberRad - a.camberRad) * bestT;
  const widthM = a.widthM + (b.widthM - a.widthM) * bestT;
  const halfWidthM = widthM * 0.5;

  const lateralOffsetM = (wx - cx) * nx + (wz - cz) * nz;
  const clampedBankLat = Math.max(-halfWidthM * 1.4, Math.min(halfWidthM * 1.4, lateralOffsetM));
  const vergeExcess = Math.max(0, Math.abs(lateralOffsetM) - (halfWidthM + 1.4));
  const vergeDrop = -Math.min(0.22, vergeExcess * 0.05);
  const roadY = cy - Math.sin(roadBank) * clampedBankLat + vergeDrop;

  const absLat = Math.abs(lateralOffsetM);
  let surface: SurfaceType = a.surface;
  let roughness = a.roughness + (b.roughness - a.roughness) * bestT;

  if (absLat > halfWidthM + 1.6) {
    surface = 'offtrack';
    roughness = Math.max(roughness, 0.32);
  } else if (absLat > halfWidthM) {
    if (surface === 'tarmac') surface = 'tarmac_dirty';
    roughness = Math.max(roughness, 0.22);
  }

  return {
    segmentIndex: bestIdx,
    segment: a,
    distanceAlongStageM: a.distanceM + (b.distanceM - a.distanceM) * bestT,
    lateralOffsetM,
    roadY,
    roadYaw,
    roadPitch,
    roadBank,
    halfWidthM,
    surface,
    roughness,
  };
}
