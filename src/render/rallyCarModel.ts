import * as THREE from 'three';
import type { CarPhysicsState } from '../game/types.ts';
import {
  createCarLiveryTexture,
  createContactShadowTexture,
  createTireTreadTexture,
} from './rallyTextures.ts';

export interface WrcCarRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  cockpitGroup: THREE.Group;
  steeringWheelGroup: THREE.Group;
  wheelKnuckles: [THREE.Group, THREE.Group, THREE.Group, THREE.Group];
  wheelSpinners: [THREE.Group, THREE.Group, THREE.Group, THREE.Group];
  brakeLightMat: THREE.MeshStandardMaterial;
  headlightBeamLeft: THREE.SpotLight | null;
  headlightBeamRight: THREE.SpotLight | null;
  flameLeft: THREE.Mesh;
  flameRight: THREE.Mesh;
  contactShadow: THREE.Mesh;
  ghostRoot: THREE.Group;
  dispose: () => void;
}

// Reusable module-scope math objects (Zero GC in render loop!)
const _mat4 = new THREE.Matrix4();
const _back = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

/**
 * Extrudes a 2D side-elevation profile (z = longitudinal [-front..+rear], y = height)
 * centered symmetrically along the car X width axis!
 */
function buildExtrudedProfileGeometry(
  pointsZY: Array<[number, number]>,
  widthX: number,
  bevelSize = 0.045,
  bevelThickness = 0.05,
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(pointsZY[0][0], pointsZY[0][1]);
  for (let i = 1; i < pointsZY.length; i++) {
    shape.lineTo(pointsZY[i][0], pointsZY[i][1]);
  }
  shape.closePath();

  const depth = Math.max(0.1, widthX - bevelThickness * 2);
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevelSize > 0,
    bevelSegments: 3,
    steps: 1,
    bevelSize,
    bevelThickness,
    curveSegments: 8,
  });

  // Map shape.X -> +local Z (-front .. +rear), shape.Y -> +local Y, extrude.Z -> centered local X
  geom.translate(0, 0, -depth * 0.5);
  geom.rotateY(-Math.PI * 0.5);
  geom.computeVertexNormals();
  return geom;
}

export function createWrcRallyCarRig(
  maxAnisotropy: number,
  isSoftwareGl: boolean,
): WrcCarRig {
  const disposables: Array<{ dispose: () => void }> = [];
  const trackG = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };
  const trackM = <T extends THREE.Material>(m: T): T => {
    disposables.push(m);
    return m;
  };

  const liveryTex = createCarLiveryTexture(maxAnisotropy);
  const treadTex = createTireTreadTexture(maxAnisotropy);
  const shadowTex = createContactShadowTexture();
  disposables.push(liveryTex, treadTex, shadowTex);

  // Studio PBR Materials with deliberate roughness/metalness contrast (>= 0.25 delta between adjacent parts)
  const bodyPaintRed = trackM(
    new THREE.MeshPhysicalMaterial({
      color: 0xd92626,
      metalness: 0.38,
      roughness: 0.2,
      clearcoat: 1.0,
      clearcoatRoughness: 0.07,
    }),
  );

  const bodyPaintWhite = trackM(
    new THREE.MeshPhysicalMaterial({
      color: 0xf4f6fa,
      metalness: 0.18,
      roughness: 0.24,
      clearcoat: 0.9,
      clearcoatRoughness: 0.1,
    }),
  );

  const carbonMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0x16191f,
      metalness: 0.22,
      roughness: 0.52,
    }),
  );

  const matteRubberMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0x181a1e,
      metalness: 0.05,
      roughness: 0.85,
    }),
  );

  const mudflapRedMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0xb91c1c,
      metalness: 0.05,
      roughness: 0.78,
    }),
  );

  const goldRimMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0xd9a441,
      metalness: 0.86,
      roughness: 0.22,
    }),
  );

  const chromeMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.94,
      roughness: 0.14,
    }),
  );

  const glassMat = trackM(
    new THREE.MeshPhysicalMaterial({
      color: 0x0b1320,
      metalness: 0.15,
      roughness: 0.06,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      transparent: true,
      opacity: 0.88,
    }),
  );

  const liveryMat = trackM(
    new THREE.MeshStandardMaterial({
      map: liveryTex,
      metalness: 0.15,
      roughness: 0.3,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );

  const headlightLensMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xe0f2fe,
      emissiveIntensity: 2.2,
      roughness: 0.1,
    }),
  );

  const brakeLightMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0xff1e1e,
      emissive: 0xdc2626,
      emissiveIntensity: 0.85,
      roughness: 0.18,
    }),
  );

  const flameMat = trackM(
    new THREE.MeshBasicMaterial({
      color: 0xff9e2c,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  );

  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  // Local car coordinates:
  // -Z = Front bumper (-2.12m), +Z = Rear diffuser (+2.08m), +X = Right side, +Y = Up (0 = ground plane)

  // 1. Primary Sculpted Lower Monocoque Body (tapered central waist + high-clearance rear tail)
  const lowerHullGeom = trackG(
    buildExtrudedProfileGeometry(
      [
        [-2.06, 0.2],
        [-2.0, 0.56],
        [-1.38, 0.78],
        [-0.55, 0.86],
        [0.85, 0.88],
        [1.72, 0.85],
        [1.91, 0.62],
        [1.89, 0.42],
        [1.48, 0.36],
        [1.1, 0.22],
      ],
      1.6,
      0.035,
      0.04,
    ),
  );
  bodyGroup.add(new THREE.Mesh(lowerHullGeom, bodyPaintRed));

  // Championship White Upper Roof/Shoulder Accent Shell
  const upperCabinShellGeom = trackG(
    buildExtrudedProfileGeometry(
      [
        [-0.78, 0.82],
        [-0.22, 1.32],
        [0.8, 1.34],
        [1.62, 0.9],
        [1.52, 0.82],
      ],
      1.42,
      0.035,
      0.04,
    ),
  );
  bodyGroup.add(new THREE.Mesh(upperCabinShellGeom, bodyPaintWhite));

  // 2. Tinted Optical Greenhouse (Windshield, Side Windows, & Proud Rear Hatchback Glass)
  const cabinGlassGeom = trackG(
    buildExtrudedProfileGeometry(
      [
        [-0.84, 0.83],
        [-0.24, 1.29],
        [0.78, 1.3],
        [1.66, 0.91],
        [1.56, 0.84],
      ],
      1.46,
      0.02,
      0.025,
    ),
  );
  bodyGroup.add(new THREE.Mesh(cabinGlassGeom, glassMat));

  // Dedicated Flush Rear Hatchback Window Pane (clearly visible from chase camera)
  const rearWindowGeom = trackG(new THREE.BoxGeometry(1.24, 0.04, 0.76));
  const rearWindow = new THREE.Mesh(rearWindowGeom, glassMat);
  rearWindow.position.set(0, 1.11, 1.26);
  rearWindow.rotation.x = 0.48;
  bodyGroup.add(rearWindow);

  // 3. Four Widebody Box-Flared Rally Fender Arches + Side Aero Skirts
  const frontFlareGeom = trackG(
    buildExtrudedProfileGeometry(
      [
        [-1.74, 0.24],
        [-1.66, 0.74],
        [-0.96, 0.76],
        [-0.88, 0.24],
      ],
      1.96,
      0.035,
      0.035,
    ),
  );
  bodyGroup.add(new THREE.Mesh(frontFlareGeom, bodyPaintWhite));

  const rearFlareGeom = trackG(
    buildExtrudedProfileGeometry(
      [
        [0.84, 0.26],
        [0.92, 0.78],
        [1.62, 0.76],
        [1.68, 0.44],
      ],
      1.98,
      0.035,
      0.035,
    ),
  );
  bodyGroup.add(new THREE.Mesh(rearFlareGeom, bodyPaintRed));

  const sideSkirtGeom = trackG(new THREE.BoxGeometry(1.9, 0.1, 1.72));
  const sideSkirt = new THREE.Mesh(sideSkirtGeom, carbonMat);
  sideSkirt.position.set(0, 0.21, -0.02);
  bodyGroup.add(sideSkirt);

  // 4. Front Carbon Aero Chin Splitter, Dive Planes & Intercooler Grille
  const splitterGeom = trackG(new THREE.BoxGeometry(1.92, 0.06, 0.42));
  const splitter = new THREE.Mesh(splitterGeom, carbonMat);
  splitter.position.set(0, 0.17, -1.98);
  bodyGroup.add(splitter);

  const grilleGeom = trackG(new THREE.BoxGeometry(1.18, 0.26, 0.08));
  const grille = new THREE.Mesh(grilleGeom, carbonMat);
  grille.position.set(0, 0.38, -2.07);
  bodyGroup.add(grille);

  // 5. Roof Ram-Air Intake Scoop & Hood Cooling Louvers
  const scoopGeom = trackG(
    buildExtrudedProfileGeometry(
      [
        [-0.22, 1.32],
        [-0.18, 1.44],
        [0.28, 1.38],
        [0.3, 1.32],
      ],
      0.36,
      0.02,
      0.02,
    ),
  );
  bodyGroup.add(new THREE.Mesh(scoopGeom, bodyPaintRed));

  const hoodVentGeom = trackG(new THREE.BoxGeometry(0.86, 0.03, 0.36));
  const hoodVent = new THREE.Mesh(hoodVentGeom, carbonMat);
  hoodVent.position.set(0, 0.81, -1.28);
  hoodVent.rotation.x = 0.12;
  bodyGroup.add(hoodVent);

  // 6. Door & Roof Competition Number Decals ("01 CHRONO WRC")
  const doorPlateGeom = trackG(new THREE.PlaneGeometry(0.95, 0.44));
  const leftDoorPlate = new THREE.Mesh(doorPlateGeom, liveryMat);
  leftDoorPlate.position.set(-0.95, 0.56, -0.05);
  leftDoorPlate.rotation.y = -Math.PI * 0.5;
  bodyGroup.add(leftDoorPlate);

  const rightDoorPlate = new THREE.Mesh(doorPlateGeom, liveryMat);
  rightDoorPlate.position.set(0.95, 0.56, -0.05);
  rightDoorPlate.rotation.y = Math.PI * 0.5;
  bodyGroup.add(rightDoorPlate);

  const roofPlateGeom = trackG(new THREE.PlaneGeometry(0.82, 0.44));
  const roofPlate = new THREE.Mesh(roofPlateGeom, liveryMat);
  roofPlate.position.set(0, 1.375, 0.32);
  roofPlate.rotation.x = -Math.PI * 0.5;
  bodyGroup.add(roofPlate);

  // 7. Bi-Plane Carbon Fiber WRC Rear Wing (Endplates + Dual Airfoils + Pylons)
  const wingGroup = new THREE.Group();
  const mainChordGeom = trackG(new THREE.BoxGeometry(1.76, 0.045, 0.34));
  const mainChord = new THREE.Mesh(mainChordGeom, carbonMat);
  mainChord.position.set(0, 1.28, 1.82);
  mainChord.rotation.x = 0.14;
  wingGroup.add(mainChord);

  const upperFlapGeom = trackG(new THREE.BoxGeometry(1.74, 0.04, 0.22));
  const upperFlap = new THREE.Mesh(upperFlapGeom, bodyPaintRed);
  upperFlap.position.set(0, 1.41, 1.88);
  upperFlap.rotation.x = 0.22;
  wingGroup.add(upperFlap);

  const endplateGeom = trackG(new THREE.BoxGeometry(0.035, 0.34, 0.46));
  for (const sideX of [-0.88, 0.88]) {
    const ep = new THREE.Mesh(endplateGeom, bodyPaintWhite);
    ep.position.set(sideX, 1.31, 1.84);
    wingGroup.add(ep);
  }
  const pylonGeom = trackG(new THREE.BoxGeometry(0.04, 0.36, 0.28));
  for (const px of [-0.36, 0.36]) {
    const py = new THREE.Mesh(pylonGeom, carbonMat);
    py.position.set(px, 1.12, 1.72);
    py.rotation.x = -0.2;
    wingGroup.add(py);
  }
  bodyGroup.add(wingGroup);

  // 8. Sculpted Headlights + Quad Hood LED Rally Light Pod + Full-Width Rear Brake Bar
  const hlGeom = trackG(new THREE.BoxGeometry(0.32, 0.12, 0.12));
  for (const hx of [-0.66, 0.66]) {
    const hl = new THREE.Mesh(hlGeom, headlightLensMat);
    hl.position.set(hx, 0.58, -2.02);
    hl.rotation.y = hx < 0 ? 0.14 : -0.14;
    bodyGroup.add(hl);
  }

  // Quad auxiliary rally pod on nose
  const podHousingGeom = trackG(new THREE.CylinderGeometry(0.075, 0.085, 0.14, 12));
  podHousingGeom.rotateX(Math.PI * 0.5);
  const podLensGeom = trackG(new THREE.CircleGeometry(0.07, 12));
  for (const px of [-0.33, -0.11, 0.11, 0.33]) {
    const pod = new THREE.Mesh(podHousingGeom, carbonMat);
    pod.position.set(px, 0.66, -1.96);
    bodyGroup.add(pod);
    const lens = new THREE.Mesh(podLensGeom, headlightLensMat);
    lens.position.set(px, 0.66, -2.035);
    lens.rotation.y = Math.PI;
    bodyGroup.add(lens);
  }

  // Matte Carbon Rear Fascia Panel + Sculpted Dual LED Taillight Clusters + WRC Plate
  const rearFasciaGeom = trackG(new THREE.BoxGeometry(1.56, 0.24, 0.05));
  const rearFascia = new THREE.Mesh(rearFasciaGeom, carbonMat);
  rearFascia.position.set(0, 0.68, 1.945);
  bodyGroup.add(rearFascia);

  const tailBarGeom = trackG(new THREE.BoxGeometry(1.48, 0.045, 0.05));
  const tailBar = new THREE.Mesh(tailBarGeom, brakeLightMat);
  tailBar.position.set(0, 0.75, 1.975);
  bodyGroup.add(tailBar);

  const tailClusterGeom = trackG(new THREE.BoxGeometry(0.32, 0.11, 0.055));
  for (const tx of [-0.58, 0.58]) {
    const tc = new THREE.Mesh(tailClusterGeom, brakeLightMat);
    tc.position.set(tx, 0.7, 1.98);
    bodyGroup.add(tc);
  }

  const plateGeom = trackG(new THREE.BoxGeometry(0.42, 0.11, 0.03));
  const plate = new THREE.Mesh(plateGeom, bodyPaintWhite);
  plate.position.set(0, 0.55, 1.965);
  bodyGroup.add(plate);

  // 5-Strake Carbon Rear Diffuser + Red Rally Mudflaps + Twin Exhausts + Anti-Lag Flames
  const diffuserGeom = trackG(new THREE.BoxGeometry(1.54, 0.2, 0.22));
  const diffuser = new THREE.Mesh(diffuserGeom, carbonMat);
  diffuser.position.set(0, 0.29, 1.92);
  bodyGroup.add(diffuser);

  const strakeGeom = trackG(new THREE.BoxGeometry(0.025, 0.22, 0.26));
  for (const sx of [-0.58, -0.29, 0, 0.29, 0.58]) {
    const fin = new THREE.Mesh(strakeGeom, carbonMat);
    fin.position.set(sx, 0.28, 1.95);
    bodyGroup.add(fin);
  }

  const mudflapGeom = trackG(new THREE.BoxGeometry(0.3, 0.22, 0.025));
  for (const [mx, mz] of [
    [-0.86, -0.9],
    [0.86, -0.9],
    [-0.88, 1.62],
    [0.88, 1.62],
  ]) {
    const mf = new THREE.Mesh(mudflapGeom, mudflapRedMat);
    mf.position.set(mx, 0.19, mz);
    bodyGroup.add(mf);
  }

  const exhaustPipeGeom = trackG(new THREE.CylinderGeometry(0.052, 0.052, 0.22, 12));
  exhaustPipeGeom.rotateX(Math.PI * 0.5);
  const flameConeGeom = trackG(new THREE.ConeGeometry(0.09, 0.52, 10));
  flameConeGeom.rotateX(Math.PI * 0.5);

  const exL = new THREE.Mesh(exhaustPipeGeom, chromeMat);
  exL.position.set(-0.43, 0.28, 2.02);
  bodyGroup.add(exL);
  const exR = new THREE.Mesh(exhaustPipeGeom, chromeMat);
  exR.position.set(0.43, 0.28, 2.02);
  bodyGroup.add(exR);

  const flameLeft = new THREE.Mesh(flameConeGeom, flameMat);
  flameLeft.position.set(-0.43, 0.28, 2.3);
  flameLeft.visible = false;
  bodyGroup.add(flameLeft);

  const flameRight = new THREE.Mesh(flameConeGeom, flameMat);
  flameRight.position.set(0.43, 0.28, 2.3);
  flameRight.visible = false;
  bodyGroup.add(flameRight);

  // Real Headlight Spotlights (for Dusk & Night stages!)
  let headlightBeamLeft: THREE.SpotLight | null = null;
  let headlightBeamRight: THREE.SpotLight | null = null;
  if (!isSoftwareGl) {
    headlightBeamLeft = new THREE.SpotLight(0xfffbeb, 0, 85, Math.PI * 0.22, 0.45, 1.1);
    headlightBeamLeft.position.set(-0.55, 0.65, -2.0);
    headlightBeamLeft.target.position.set(-0.6, 0.1, -28);
    bodyGroup.add(headlightBeamLeft);
    bodyGroup.add(headlightBeamLeft.target);

    headlightBeamRight = new THREE.SpotLight(0xfffbeb, 0, 85, Math.PI * 0.22, 0.45, 1.1);
    headlightBeamRight.position.set(0.55, 0.65, -2.0);
    headlightBeamRight.target.position.set(0.6, 0.1, -28);
    bodyGroup.add(headlightBeamRight);
    bodyGroup.add(headlightBeamRight.target);
  }

  // 9. Four Multi-Part Independent Wheels (Wide Gravel Tire + 10-Spoke Gold Rim + Rotor + Caliper)
  const tireGeom = trackG(new THREE.CylinderGeometry(0.34, 0.34, 0.29, 22));
  tireGeom.rotateZ(Math.PI * 0.5);
  const tireMat = trackM(
    new THREE.MeshStandardMaterial({
      map: treadTex,
      color: 0x26292e,
      roughness: 0.82,
      metalness: 0.06,
    }),
  );

  const rimBarrelGeom = trackG(new THREE.CylinderGeometry(0.225, 0.225, 0.298, 18));
  rimBarrelGeom.rotateZ(Math.PI * 0.5);
  const spokeGeom = trackG(new THREE.BoxGeometry(0.302, 0.028, 0.41));
  const hubCapGeom = trackG(new THREE.CylinderGeometry(0.065, 0.065, 0.31, 12));
  hubCapGeom.rotateZ(Math.PI * 0.5);

  const rotorGeom = trackG(new THREE.CylinderGeometry(0.175, 0.175, 0.03, 16));
  rotorGeom.rotateZ(Math.PI * 0.5);
  const caliperGeom = trackG(new THREE.BoxGeometry(0.065, 0.12, 0.09));

  const wheelPositions: Array<[number, number, number]> = [
    [-0.87, 0.34, -1.32], // FL
    [0.87, 0.34, -1.32], // FR
    [-0.88, 0.34, 1.28], // RL
    [0.88, 0.34, 1.28], // RR
  ];

  const wheelKnuckles: [THREE.Group, THREE.Group, THREE.Group, THREE.Group] = [
    new THREE.Group(),
    new THREE.Group(),
    new THREE.Group(),
    new THREE.Group(),
  ];
  const wheelSpinners: [THREE.Group, THREE.Group, THREE.Group, THREE.Group] = [
    new THREE.Group(),
    new THREE.Group(),
    new THREE.Group(),
    new THREE.Group(),
  ];

  for (let i = 0; i < 4; i++) {
    const knuckle = wheelKnuckles[i];
    const spinner = wheelSpinners[i];
    const [wx, wy, wz] = wheelPositions[i];
    knuckle.position.set(wx, wy, wz);

    // Stationary brake rotor & red caliper mounted on suspension knuckle
    const rotor = new THREE.Mesh(rotorGeom, chromeMat);
    knuckle.add(rotor);
    const caliper = new THREE.Mesh(caliperGeom, bodyPaintRed);
    caliper.position.set(wx < 0 ? 0.03 : -0.03, 0.06, 0.1);
    knuckle.add(caliper);

    // Rotating tire & 10-spoke Championship Gold rim
    spinner.add(new THREE.Mesh(tireGeom, tireMat));
    spinner.add(new THREE.Mesh(rimBarrelGeom, carbonMat));
    for (let s = 0; s < 5; s++) {
      const sp = new THREE.Mesh(spokeGeom, goldRimMat);
      sp.rotation.x = (s * Math.PI) / 5;
      spinner.add(sp);
    }
    spinner.add(new THREE.Mesh(hubCapGeom, goldRimMat));

    knuckle.add(spinner);
    root.add(knuckle);
  }

  // 10. Detailed Rally1 Cockpit Interior (for `cockpit` camera view!)
  const cockpitGroup = new THREE.Group();
  cockpitGroup.visible = false;
  root.add(cockpitGroup);

  const dashGeom = trackG(new THREE.BoxGeometry(1.42, 0.28, 0.52));
  const dash = new THREE.Mesh(dashGeom, matteRubberMat);
  dash.position.set(0, 0.74, -0.58);
  cockpitGroup.add(dash);

  // Rollcage A-pillars & roof cross-bar
  const cageTubeGeom = trackG(new THREE.CylinderGeometry(0.022, 0.022, 0.82, 8));
  for (const cx of [-0.64, 0.64]) {
    const pillar = new THREE.Mesh(cageTubeGeom, chromeMat);
    pillar.position.set(cx, 1.08, -0.45);
    pillar.rotation.x = 0.56;
    cockpitGroup.add(pillar);
  }

  // Suede 3-Spoke Rally Steering Wheel + Yellow Top-Center Marker
  const steeringWheelGroup = new THREE.Group();
  steeringWheelGroup.position.set(-0.34, 0.86, -0.34);
  steeringWheelGroup.rotation.x = -0.22;

  const rimTorusGeom = trackG(new THREE.TorusGeometry(0.165, 0.022, 10, 28));
  steeringWheelGroup.add(new THREE.Mesh(rimTorusGeom, matteRubberMat));

  const centerBandGeom = trackG(new THREE.BoxGeometry(0.035, 0.048, 0.05));
  const yellowMat = trackM(new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 }));
  const centerBand = new THREE.Mesh(centerBandGeom, yellowMat);
  centerBand.position.set(0, 0.165, 0);
  steeringWheelGroup.add(centerBand);

  const swSpokeH = trackG(new THREE.BoxGeometry(0.3, 0.028, 0.018));
  steeringWheelGroup.add(new THREE.Mesh(swSpokeH, carbonMat));
  const swSpokeV = trackG(new THREE.BoxGeometry(0.032, 0.16, 0.018));
  const swBottom = new THREE.Mesh(swSpokeV, carbonMat);
  swBottom.position.set(0, -0.08, 0);
  steeringWheelGroup.add(swBottom);

  cockpitGroup.add(steeringWheelGroup);

  // 11. Grounded Soft Radial Contact Shadow Plane
  const shadowPlaneGeom = trackG(new THREE.PlaneGeometry(2.65, 4.95));
  shadowPlaneGeom.rotateX(-Math.PI * 0.5);
  const shadowMat = trackM(
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  const contactShadow = new THREE.Mesh(shadowPlaneGeom, shadowMat);
  contactShadow.renderOrder = 1;

  // 12. Translucent Holographic Personal-Best Ghost Car
  const ghostRoot = new THREE.Group();
  const ghostMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      roughness: 0.25,
    }),
  );
  ghostRoot.add(new THREE.Mesh(lowerHullGeom, ghostMat));
  ghostRoot.add(new THREE.Mesh(upperCabinShellGeom, ghostMat));
  ghostRoot.visible = false;

  return {
    root,
    bodyGroup,
    cockpitGroup,
    steeringWheelGroup,
    wheelKnuckles,
    wheelSpinners,
    brakeLightMat,
    headlightBeamLeft,
    headlightBeamRight,
    flameLeft,
    flameRight,
    contactShadow,
    ghostRoot,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}

/**
 * Computes exact right-handed 3D orientation matrix matching physics convention:
 * At yaw = 0, forward (-Z local) = (0, 0, -1), right (+X local) = (+1, 0, 0), up (+Y local) = (0, 1, 0).
 * Positive yaw rotates forward toward +X (Right on screen).
 */
export function applyCarPoseToObject(
  obj: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  yaw: number,
  pitch: number,
  roll: number,
): void {
  // Note: Three.js YXZ Euler with rotation.y = -yaw maps:
  // local (0,0,-1) -> (sin(yaw), 0, -cos(yaw)) = physics forward!
  // local (1,0,0)  -> (cos(yaw), 0,  sin(yaw)) = physics right!
  // pitch > 0 raises nose (-Z local), which is positive rotation around +X!
  // roll > 0 leans right (+X local down), which is negative rotation around +Z!
  _euler.set(pitch, -yaw, -roll, 'YXZ');
  obj.position.set(x, y, z);
  obj.quaternion.setFromEuler(_euler);
}

export function getCarBasisVectors(
  yaw: number,
  pitch: number,
  roll: number,
  outRight: THREE.Vector3,
  outUp: THREE.Vector3,
  outForward: THREE.Vector3,
): void {
  _euler.set(pitch, -yaw, -roll, 'YXZ');
  _mat4.makeRotationFromEuler(_euler);
  outRight.setFromMatrixColumn(_mat4, 0);
  outUp.setFromMatrixColumn(_mat4, 1);
  _back.setFromMatrixColumn(_mat4, 2);
  outForward.copy(_back).negate();
}

export function updateWrcCarRigFromState(
  rig: WrcCarRig,
  car: CarPhysicsState,
  groundY: number,
  isCockpitView: boolean,
  isNightOrDusk: boolean,
  dt: number,
): void {
  applyCarPoseToObject(rig.root, car.x, car.y, car.z, car.yaw, car.pitch, car.roll);

  rig.cockpitGroup.visible = isCockpitView;
  // Hide exterior roof/glass shell only in cockpit view so windshield view is crystal-clear
  rig.bodyGroup.visible = !isCockpitView;

  // Steering wheel rotation (steeringWheelDeg > 0 = turning right = clockwise rotation around local -Z)
  rig.steeringWheelGroup.rotation.z = -THREE.MathUtils.degToRad(car.steeringWheelDeg);

  // Update 4 wheels (suspension vertical travel + front steering + rolling spin)
  for (let i = 0; i < 4; i++) {
    const knuckle = rig.wheelKnuckles[i];
    const spinner = rig.wheelSpinners[i];
    const w = car.wheels[i];
    knuckle.visible = !isCockpitView;

    // Suspension compression lifts wheel slightly into fender arch
    const restY = 0.33;
    const compOffset = (w.compression - 0.08) * 0.45;
    knuckle.position.y = restY + compOffset;

    // Front wheels steer: steerAngleRad > 0 turns right => rotation.y = -steerAngleRad!
    if (i < 2) {
      knuckle.rotation.y = -car.steerAngleRad;
    }

    // Rolling forward (angularVel > 0) rotates top of wheel toward -Z => negative X rotation!
    spinner.rotation.x -= w.angularVel * dt;
  }

  // Dynamic Brake Light Strip
  const braking = car.brake > 0.08 || (car.gear === -1 && car.throttle > 0.1);
  rig.brakeLightMat.emissiveIntensity = braking ? 3.4 : isNightOrDusk ? 1.15 : 0.65;

  // Dynamic Exhaust Anti-Lag Backfire Cones
  const popActive = car.backfireTrigger > 0.03;
  rig.flameLeft.visible = popActive && !isCockpitView;
  rig.flameRight.visible = popActive && !isCockpitView;
  if (popActive) {
    const s = 0.7 + car.backfireTrigger * 1.8;
    rig.flameLeft.scale.set(1, 1, s);
    rig.flameRight.scale.set(0.85, 0.85, s * 0.9);
  }

  // Headlight beams in Dusk / Night
  if (rig.headlightBeamLeft && rig.headlightBeamRight) {
    const health = Math.max(0.25, 1 - car.damage.lights * 0.75);
    const beamPower = isNightOrDusk ? 185 * health : 0;
    rig.headlightBeamLeft.intensity = beamPower;
    rig.headlightBeamRight.intensity = beamPower;
  }

  // Grounded Contact Shadow right on the road surface underneath car
  const airGap = Math.max(0, car.y - groundY);
  rig.contactShadow.position.set(car.x, groundY + 0.025, car.z);
  rig.contactShadow.rotation.y = -car.yaw;
  const shadowScale = 1 + Math.min(0.45, airGap * 0.15);
  rig.contactShadow.scale.set(shadowScale, 1, shadowScale);
  (rig.contactShadow.material as THREE.MeshBasicMaterial).opacity = Math.max(
    0.1,
    0.64 - airGap * 0.22,
  );
  rig.contactShadow.visible = !isCockpitView;
}
