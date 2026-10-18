/**
 * Zero-GC 3D Matrix & Vector utilities for the native WebGL rally renderer.
 */
export type Mat4 = Float32Array;

export function createMat4(): Mat4 {
  const m = new Float32Array(16);
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[15] = 1;
  return m;
}

export function identityMat4(out: Mat4): Mat4 {
  out.fill(0);
  out[0] = 1;
  out[5] = 1;
  out[10] = 1;
  out[15] = 1;
  return out;
}

export function perspectiveMat4(
  out: Mat4,
  fovYRad: number,
  aspect: number,
  near: number,
  far: number
): Mat4 {
  const f = 1.0 / Math.tan(fovYRad * 0.5);
  const nf = 1.0 / (near - far);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

export function lookAtMat4(
  out: Mat4,
  eyeX: number,
  eyeY: number,
  eyeZ: number,
  centerX: number,
  centerY: number,
  centerZ: number,
  upX: number,
  upY: number,
  upZ: number
): Mat4 {
  let zx = eyeX - centerX;
  let zy = eyeY - centerY;
  let zz = eyeZ - centerZ;
  let len = Math.hypot(zx, zy, zz);
  if (len < 1e-6) {
    zz = 1;
  } else {
    zx /= len;
    zy /= len;
    zz /= len;
  }

  let xx = upY * zz - upZ * zy;
  let xy = upZ * zx - upX * zz;
  let xz = upX * zy - upY * zx;
  len = Math.hypot(xx, xy, xz);
  if (len < 1e-6) {
    xx = 1;
  } else {
    xx /= len;
    xy /= len;
    xz /= len;
  }

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  out[0] = xx;
  out[1] = yx;
  out[2] = zx;
  out[3] = 0;
  out[4] = xy;
  out[5] = yy;
  out[6] = zy;
  out[7] = 0;
  out[8] = xz;
  out[9] = yz;
  out[10] = zz;
  out[11] = 0;
  out[12] = -(xx * eyeX + xy * eyeY + xz * eyeZ);
  out[13] = -(yx * eyeX + yy * eyeY + yz * eyeZ);
  out[14] = -(zx * eyeX + zy * eyeY + zz * eyeZ);
  out[15] = 1;
  return out;
}

export function multiplyMat4(out: Mat4, a: Mat4, b: Mat4): Mat4 {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

  let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
  out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
  out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
  out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
  out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  return out;
}

/**
 * Builds a transformation matrix from translation (x,y,z), yaw/pitch/roll (rad), and scale (sx,sy,sz).
 */
export function composeTransformMat4(
  out: Mat4,
  x: number,
  y: number,
  z: number,
  yaw: number,
  pitch: number,
  roll: number,
  sx: number = 1,
  sy: number = 1,
  sz: number = 1
): Mat4 {
  const cy = Math.cos(yaw);
  const syaw = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);

  // YXZ rotation order (Yaw around Y, Pitch around X, Roll around Z)
  out[0] = (cy * cr + syaw * sp * sr) * sx;
  out[1] = (cp * sr) * sx;
  out[2] = (-syaw * cr + cy * sp * sr) * sx;
  out[3] = 0;

  out[4] = (-cy * sr + syaw * sp * cr) * sy;
  out[5] = (cp * cr) * sy;
  out[6] = (syaw * sr + cy * sp * cr) * sy;
  out[7] = 0;

  out[8] = (syaw * cp) * sz;
  out[9] = (-sp) * sz;
  out[10] = (cy * cp) * sz;
  out[11] = 0;

  out[12] = x;
  out[13] = y;
  out[14] = z;
  out[15] = 1;
  return out;
}
