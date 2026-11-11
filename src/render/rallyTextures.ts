import * as THREE from 'three';
import type { SurfaceType } from '../game/types.ts';

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function pseudoRand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export interface RoadTextureBundle {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
}

export function createStageRoadTextures(
  primarySurface: SurfaceType,
  maxAnisotropy: number,
): RoadTextureBundle {
  const size = 512;
  const [albedoCanvas, ctx] = makeCanvas(size, size);
  const [bumpCanvas, bCtx] = makeCanvas(size, size);

  if (primarySurface === 'tarmac' || primarySurface === 'tarmac_dirty') {
    // Rich weathered alpine asphalt with subtle aggregate, twin rubbered racing lines & white edge lines
    ctx.fillStyle = '#2d3138';
    ctx.fillRect(0, 0, size, size);
    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, size, size);

    // Asphalt aggregate grain
    for (let i = 0; i < 6500; i++) {
      const rx = pseudoRand(i * 1.13) * size;
      const ry = pseudoRand(i * 2.71) * size;
      const v = 34 + Math.floor(pseudoRand(i * 4.19) * 32);
      const r = 1 + pseudoRand(i * 5.3) * 1.8;
      ctx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
      ctx.fillRect(rx, ry, r, r);

      const bv = 105 + Math.floor(pseudoRand(i * 6.7) * 50);
      bCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
      bCtx.fillRect(rx, ry, r, r);
    }

    // Twin darker rubbered tire grooves along left/right wheel tracks
    for (const trackX of [size * 0.31, size * 0.69]) {
      const grad = ctx.createLinearGradient(trackX - 48, 0, trackX + 48, 0);
      grad.addColorStop(0, 'rgba(18,20,24,0)');
      grad.addColorStop(0.5, 'rgba(16,18,22,0.42)');
      grad.addColorStop(1, 'rgba(18,20,24,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(trackX - 48, 0, 96, size);
    }

    // Crisp painted white rally road edge lines + subtle dashed centerline
    ctx.fillStyle = 'rgba(236, 240, 245, 0.85)';
    ctx.fillRect(18, 0, 10, size);
    ctx.fillRect(size - 28, 0, 10, size);

    ctx.fillStyle = 'rgba(232, 185, 68, 0.52)';
    for (let y = 16; y < size; y += 128) {
      ctx.fillRect(size * 0.5 - 4, y, 8, 68);
    }
  } else if (primarySurface === 'snow' || primarySurface === 'ice') {
    // Packed Scandinavian snow road with glistening ice-blue wheel ruts & soft snow edges
    ctx.fillStyle = '#dce6f2';
    ctx.fillRect(0, 0, size, size);
    bCtx.fillStyle = '#888888';
    bCtx.fillRect(0, 0, size, size);

    for (let i = 0; i < 4800; i++) {
      const rx = pseudoRand(i * 1.7) * size;
      const ry = pseudoRand(i * 3.1) * size;
      const bright = 205 + Math.floor(pseudoRand(i * 5.9) * 48);
      ctx.fillStyle = `rgb(${bright - 8},${bright - 2},${Math.min(255, bright + 6)})`;
      ctx.fillRect(rx, ry, 2.5, 4);

      const bv = 110 + Math.floor(pseudoRand(i * 7.3) * 42);
      bCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
      bCtx.fillRect(rx, ry, 2.5, 4);
    }

    // Glazed ice wheel tracks
    for (const trackX of [size * 0.32, size * 0.68]) {
      const grad = ctx.createLinearGradient(trackX - 44, 0, trackX + 44, 0);
      grad.addColorStop(0, 'rgba(165,196,226,0)');
      grad.addColorStop(0.5, 'rgba(148,184,218,0.58)');
      grad.addColorStop(1, 'rgba(165,196,226,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(trackX - 44, 0, 88, size);
    }

    // Bright powdery snowbank edge feather
    const leftEdge = ctx.createLinearGradient(0, 0, 46, 0);
    leftEdge.addColorStop(0, 'rgba(250,253,255,0.95)');
    leftEdge.addColorStop(1, 'rgba(250,253,255,0)');
    ctx.fillStyle = leftEdge;
    ctx.fillRect(0, 0, 46, size);

    const rightEdge = ctx.createLinearGradient(size - 46, 0, size, 0);
    rightEdge.addColorStop(0, 'rgba(250,253,255,0)');
    rightEdge.addColorStop(1, 'rgba(250,253,255,0.95)');
    ctx.fillStyle = rightEdge;
    ctx.fillRect(size - 46, 0, 46, size);
  } else {
    // Warm compacted WRC Finland / Acropolis gravel with twin swept racing ruts & loose outer stones
    ctx.fillStyle = '#9c7e5e';
    ctx.fillRect(0, 0, size, size);
    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, size, size);

    // Loose outer gravel bands
    const edgeL = ctx.createLinearGradient(0, 0, 72, 0);
    edgeL.addColorStop(0, 'rgba(116,92,66,0.65)');
    edgeL.addColorStop(1, 'rgba(116,92,66,0)');
    ctx.fillStyle = edgeL;
    ctx.fillRect(0, 0, 72, size);

    const edgeR = ctx.createLinearGradient(size - 72, 0, size, 0);
    edgeR.addColorStop(0, 'rgba(116,92,66,0)');
    edgeR.addColorStop(1, 'rgba(116,92,66,0.65)');
    ctx.fillStyle = edgeR;
    ctx.fillRect(size - 72, 0, 72, size);

    // Swept darker compacted wheel ruts
    for (const trackX of [size * 0.31, size * 0.69]) {
      const grad = ctx.createLinearGradient(trackX - 46, 0, trackX + 46, 0);
      grad.addColorStop(0, 'rgba(78,58,38,0)');
      grad.addColorStop(0.5, 'rgba(74,54,36,0.52)');
      grad.addColorStop(1, 'rgba(78,58,38,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(trackX - 46, 0, 92, size);
    }

    // Fine pebble & grit speckles
    for (let i = 0; i < 7200; i++) {
      const rx = pseudoRand(i * 1.37) * size;
      const ry = pseudoRand(i * 2.93) * size;
      const tone = 112 + Math.floor(pseudoRand(i * 4.71) * 76);
      const sz = 1 + pseudoRand(i * 6.13) * 2.4;
      ctx.fillStyle = `rgb(${tone},${Math.floor(tone * 0.82)},${Math.floor(tone * 0.63)})`;
      ctx.fillRect(rx, ry, sz, sz);

      const bv = 95 + Math.floor(pseudoRand(i * 8.1) * 68);
      bCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
      bCtx.fillRect(rx, ry, sz, sz);
    }
  }

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.anisotropy = maxAnisotropy;

  return { map, bumpMap };
}

export function createTerrainDetailTexture(
  primarySurface: SurfaceType,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size, size);

  if (primarySurface === 'snow' || primarySurface === 'ice') {
    ctx.fillStyle = '#e4edf7';
  } else if (primarySurface === 'tarmac') {
    ctx.fillStyle = '#4e5d43';
  } else {
    ctx.fillStyle = '#55663e';
  }
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 3600; i++) {
    const rx = pseudoRand(i * 1.91) * size;
    const ry = pseudoRand(i * 3.47) * size;
    const delta = Math.floor((pseudoRand(i * 5.21) - 0.5) * 34);
    if (primarySurface === 'snow' || primarySurface === 'ice') {
      const c = Math.max(195, Math.min(254, 232 + delta));
      ctx.fillStyle = `rgb(${c - 6},${c},${Math.min(255, c + 6)})`;
    } else {
      const g = Math.max(58, Math.min(132, 96 + delta));
      ctx.fillStyle = `rgb(${Math.floor(g * 0.82)},${g},${Math.floor(g * 0.62)})`;
    }
    ctx.fillRect(rx, ry, 2.5, 2.5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(38, 38);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createCarLiveryTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 256);

  // Championship white door competition plate with crimson/gold WRC stripes
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 512, 256);

  ctx.fillStyle = '#b91c1c';
  ctx.fillRect(0, 0, 512, 42);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 214, 512, 42);

  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(0, 42, 512, 8);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CHRONO STAGE · RALLY1 HYBRID', 256, 29);

  ctx.fillStyle = '#0f172a';
  ctx.font = '900 124px "Barlow Condensed", sans-serif';
  ctx.fillText('01', 256, 174);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 22px "JetBrains Mono", monospace';
  ctx.fillText('FIA WORLD RALLY SPEC', 256, 241);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createTireTreadTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 256);
  ctx.fillStyle = '#1b1d21';
  ctx.fillRect(0, 0, 128, 256);

  ctx.fillStyle = '#101215';
  for (let y = 0; y < 256; y += 24) {
    ctx.fillRect(14, y, 42, 12);
    ctx.fillRect(72, y + 12, 42, 12);
  }
  ctx.fillStyle = '#282b30';
  ctx.fillRect(58, 0, 12, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 4);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createArchBannerTexture(
  title: string,
  subtitle: string,
  accentHex: string,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(1024, 192);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 1024, 192);

  ctx.fillStyle = accentHex;
  ctx.fillRect(0, 0, 1024, 20);
  ctx.fillRect(0, 172, 1024, 20);
  ctx.fillRect(0, 0, 56, 192);
  ctx.fillRect(968, 0, 56, 192);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '900 76px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, 512, 104);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'bold 30px "JetBrains Mono", monospace';
  ctx.fillText(subtitle, 512, 152);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createChevronSignTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 128);
  ctx.fillStyle = '#facc15';
  ctx.fillRect(0, 0, 256, 128);

  ctx.fillStyle = '#0f172a';
  for (let x = 20; x < 236; x += 72) {
    ctx.beginPath();
    ctx.moveTo(x, 14);
    ctx.lineTo(x + 36, 64);
    ctx.lineTo(x, 114);
    ctx.lineTo(x + 26, 114);
    ctx.lineTo(x + 62, 64);
    ctx.lineTo(x + 26, 14);
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createBrakeBoardTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 192);
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(0, 0, 128, 192);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, 112, 176);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(20, 42, 88, 22);
  ctx.fillRect(20, 84, 88, 22);
  ctx.font = '900 42px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BRAKE', 64, 158);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  const grad = ctx.createRadialGradient(128, 128, 18, 128, 128, 122);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.78)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.42)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}
