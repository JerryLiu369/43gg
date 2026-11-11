/* mathx.js — 数学与噪声工具。无依赖，挂载到 window.RG.M */
(function (root) {
  'use strict';
  var RG = root.RG = root.RG || {};
  var M = RG.M = {};

  var PI = Math.PI, TAU = PI * 2;
  M.PI = PI; M.TAU = TAU;
  M.DEG = PI / 180; M.RAD = 180 / PI;
  M.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  M.lerp = function (a, b, t) { return a + (b - a) * t; };
  M.sign = function (v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); };
  M.smoothstep = function (t) { t = M.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  M.approach = function (cur, target, rate, dt) {
    var d = target - cur, m = rate * dt;
    return Math.abs(d) <= m ? target : cur + Math.sign(d) * m;
  };
  // 帧率无关的指数平滑
  M.damp = function (cur, target, lambda, dt) {
    return target + (cur - target) * Math.exp(-lambda * dt);
  };
  M.wrapAngle = function (a) {
    a = (a + PI) % TAU; if (a < 0) a += TAU; return a - PI;
  };

  /* ---------- vec3 (数组表示) ---------- */
  var V = M.V = {};
  V.create = function (x, y, z) { return [x || 0, y || 0, z || 0]; };
  V.set = function (o, x, y, z) { o[0] = x; o[1] = y; o[2] = z; return o; };
  V.copy = function (o, a) { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; return o; };
  V.clone = function (a) { return [a[0], a[1], a[2]]; };
  V.add = function (o, a, b) { o[0] = a[0] + b[0]; o[1] = a[1] + b[1]; o[2] = a[2] + b[2]; return o; };
  V.sub = function (o, a, b) { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; };
  V.scale = function (o, a, s) { o[0] = a[0] * s; o[1] = a[1] * s; o[2] = a[2] * s; return o; };
  V.addScaled = function (o, a, b, s) { o[0] = a[0] + b[0] * s; o[1] = a[1] + b[1] * s; o[2] = a[2] + b[2] * s; return o; };
  V.dot = function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; };
  V.cross = function (o, a, b) {
    var x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0];
    o[0] = x; o[1] = y; o[2] = z; return o;
  };
  V.len = function (a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); };
  V.len2 = function (a) { return a[0] * a[0] + a[1] * a[1] + a[2] * a[2]; };
  V.norm = function (o, a) {
    var l = V.len(a); if (l < 1e-9) { o[0] = 0; o[1] = 0; o[2] = 0; return o; }
    var s = 1 / l; o[0] = a[0] * s; o[1] = a[1] * s; o[2] = a[2] * s; return o;
  };
  V.lerp = function (o, a, b, t) {
    o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o;
  };
  V.negate = function (o, a) { o[0] = -a[0]; o[1] = -a[1]; o[2] = -a[2]; return o; };

  /* ---------- quaternion [x,y,z,w] ---------- */
  var Q = M.Q = {};
  Q.create = function () { return [0, 0, 0, 1]; };
  Q.copy = function (o, a) { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; o[3] = a[3]; return o; };
  Q.identity = function (o) { o[0] = 0; o[1] = 0; o[2] = 0; o[3] = 1; return o; };
  Q.fromAxis = function (o, axis, ang) {
    var h = ang * 0.5, s = Math.sin(h);
    o[0] = axis[0] * s; o[1] = axis[1] * s; o[2] = axis[2] * s; o[3] = Math.cos(h); return o;
  };
  Q.fromEuler = function (o, yaw, pitch, roll) { // YXZ order: yaw(Y), pitch(X), roll(Z)
    var cy = Math.cos(yaw * .5), sy = Math.sin(yaw * .5);
    var cp = Math.cos(pitch * .5), sp = Math.sin(pitch * .5);
    var cr = Math.cos(roll * .5), sr = Math.sin(roll * .5);
    var qy = [0, sy, 0, cy], qx = [sp, 0, 0, cp], qz = [0, 0, sr, cr];
    var t = [0, 0, 0, 1];
    Q.mul(t, qy, qx); Q.mul(o, t, qz); return o;
  };
  Q.mul = function (o, a, b) {
    var ax = a[0], ay = a[1], az = a[2], aw = a[3];
    var bx = b[0], by = b[1], bz = b[2], bw = b[3];
    o[0] = ax * bw + aw * bx + ay * bz - az * by;
    o[1] = ay * bw + aw * by + az * bx - ax * bz;
    o[2] = az * bw + aw * bz + ax * by - ay * bx;
    o[3] = aw * bw - ax * bx - ay * by - az * bz;
    return o;
  };
  Q.norm = function (o, a) {
    var l = Math.hypot(a[0], a[1], a[2], a[3]);
    if (l < 1e-9) { return Q.identity(o); }
    var s = 1 / l; o[0] = a[0] * s; o[1] = a[1] * s; o[2] = a[2] * s; o[3] = a[3] * s; return o;
  };
  Q.conj = function (o, a) { o[0] = -a[0]; o[1] = -a[1]; o[2] = -a[2]; o[3] = a[3]; return o; };
  Q.rotate = function (o, q, v) {
    var qx = q[0], qy = q[1], qz = q[2], qw = q[3];
    var vx = v[0], vy = v[1], vz = v[2];
    var tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);
    o[0] = vx + qw * tx + (qy * tz - qz * ty);
    o[1] = vy + qw * ty + (qz * tx - qx * tz);
    o[2] = vz + qw * tz + (qx * ty - qy * tx);
    return o;
  };
  Q.invRotate = function (o, q, v) {
    var c = [0, 0, 0, 0]; Q.conj(c, q); return Q.rotate(o, c, v);
  };
  // 以世界角速度积分姿态
  Q.integrate = function (o, q, w, dt) {
    var qx = q[0], qy = q[1], qz = q[2], qw = q[3];
    var hx = w[0] * dt * .5, hy = w[1] * dt * .5, hz = w[2] * dt * .5;
    var dx = hx * qw + hy * qz - hz * qy;
    var dy = hy * qw + hz * qx - hx * qz;
    var dz = hz * qw + hx * qy - hy * qx;
    var dw = -(hx * qx + hy * qy + hz * qz);
    o[0] = qx + dx; o[1] = qy + dy; o[2] = qz + dz; o[3] = qw + dw;
    return Q.norm(o, o);
  };
  Q.slerp = function (o, a, b, t) {
    var ax = a[0], ay = a[1], az = a[2], aw = a[3];
    var bx = b[0], by = b[1], bz = b[2], bw = b[3];
    var d = ax * bx + ay * by + az * bz + aw * bw;
    if (d < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; d = -d; }
    if (d > 0.9995) {
      o[0] = ax + (bx - ax) * t; o[1] = ay + (by - ay) * t;
      o[2] = az + (bz - az) * t; o[3] = aw + (bw - aw) * t;
      return Q.norm(o, o);
    }
    var th = Math.acos(d), sth = Math.sin(th);
    var wa = Math.sin((1 - t) * th) / sth, wb = Math.sin(t * th) / sth;
    o[0] = ax * wa + bx * wb; o[1] = ay * wa + by * wb;
    o[2] = az * wa + bz * wb; o[3] = aw * wa + bw * wb;
    return o;
  };
  Q.toBasis = function (m3, q) { // 返回 3x3（列主：右/上/前）
    var x = q[0], y = q[1], z = q[2], w = q[3];
    var xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
    m3[0] = 1 - 2 * (yy + zz); m3[1] = 2 * (xy + wz); m3[2] = 2 * (xz - wy);
    m3[3] = 2 * (xy - wz); m3[4] = 1 - 2 * (xx + zz); m3[5] = 2 * (yz + wx);
    m3[6] = 2 * (xz + wy); m3[7] = 2 * (yz - wx); m3[8] = 1 - 2 * (xx + yy);
    return m3;
  };

  /* ---------- mat4 (列主, 与 WebGL 一致) ---------- */
  var Mat4 = M.Mat4 = {};
  Mat4.create = function () {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  };
  Mat4.identity = function (o) {
    o[0] = 1; o[1] = 0; o[2] = 0; o[3] = 0;
    o[4] = 0; o[5] = 1; o[6] = 0; o[7] = 0;
    o[8] = 0; o[9] = 0; o[10] = 1; o[11] = 0;
    o[12] = 0; o[13] = 0; o[14] = 0; o[15] = 1; return o;
  };
  Mat4.mul = function (o, a, b) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
      a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
      a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
      a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    for (var i = 0; i < 4; i++) {
      var b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
      o[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      o[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      o[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      o[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    }
    return o;
  };
  Mat4.perspective = function (o, fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    o[0] = f / aspect; o[1] = 0; o[2] = 0; o[3] = 0;
    o[4] = 0; o[5] = f; o[6] = 0; o[7] = 0;
    o[8] = 0; o[9] = 0; o[10] = (far + near) * nf; o[11] = -1;
    o[12] = 0; o[13] = 0; o[14] = 2 * far * near * nf; o[15] = 0;
    return o;
  };
  Mat4.lookAt = function (o, eye, center, up) {
    var z0 = eye[0] - center[0], z1 = eye[1] - center[1], z2 = eye[2] - center[2];
    var l = Math.hypot(z0, z1, z2) || 1; z0 /= l; z1 /= l; z2 /= l;
    var x0 = up[1] * z2 - up[2] * z1, x1 = up[2] * z0 - up[0] * z2, x2 = up[0] * z1 - up[1] * z0;
    l = Math.hypot(x0, x1, x2);
    if (l < 1e-6) { x0 = 1; x1 = 0; x2 = 0; } else { x0 /= l; x1 /= l; x2 /= l; }
    var y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
    o[0] = x0; o[1] = y0; o[2] = z0; o[3] = 0;
    o[4] = x1; o[5] = y1; o[6] = z1; o[7] = 0;
    o[8] = x2; o[9] = y2; o[10] = z2; o[11] = 0;
    o[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
    o[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
    o[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
    o[15] = 1;
    return o;
  };
  // 模型矩阵：平移+旋转+缩放
  Mat4.compose = function (o, pos, quat, scale) {
    var m = Q.toBasis([0, 0, 0, 0, 0, 0, 0, 0, 0], quat);
    var sx = scale ? scale[0] : 1, sy = scale ? scale[1] : 1, sz = scale ? scale[2] : 1;
    o[0] = m[0] * sx; o[1] = m[1] * sx; o[2] = m[2] * sx; o[3] = 0;
    o[4] = m[3] * sy; o[5] = m[4] * sy; o[6] = m[5] * sy; o[7] = 0;
    o[8] = m[6] * sz; o[9] = m[7] * sz; o[10] = m[8] * sz; o[11] = 0;
    o[12] = pos[0]; o[13] = pos[1]; o[14] = pos[2]; o[15] = 1;
    return o;
  };
  Mat4.transformPoint = function (o, m, p) {
    var x = p[0], y = p[1], z = p[2];
    var w = m[3] * x + m[7] * y + m[11] * z + m[15]; if (!w) w = 1;
    o[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
    o[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
    o[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
    return o;
  };
  Mat4.invert = function (o, m) {
    var a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3],
      a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7],
      a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11],
      a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
    var b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10,
      b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11,
      b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12,
      b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30,
      b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31,
      b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    var det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return Mat4.identity(o);
    det = 1 / det;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return o;
  };
  // 从 viewProj 提取 6 个视锥平面 (法线朝内)
  Mat4.frustumPlanes = function (planes, m) {
    for (var i = 0; i < 6; i++) if (!planes[i]) planes[i] = [0, 0, 0, 0];
    var p = planes;
    function setPlane(dst, a, b, c, d) {
      var l = Math.hypot(a, b, c) || 1;
      dst[0] = a / l; dst[1] = b / l; dst[2] = c / l; dst[3] = d / l;
    }
    setPlane(p[0], m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]);  // left
    setPlane(p[1], m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]);  // right
    setPlane(p[2], m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]);  // bottom
    setPlane(p[3], m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]);  // top
    setPlane(p[4], m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]); // near
    setPlane(p[5], m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]); // far
    return p;
  };
  Mat4.aabbInFrustum = function (planes, minx, miny, minz, maxx, maxy, maxz) {
    for (var i = 0; i < 6; i++) {
      var p = planes[i];
      var x = p[0] > 0 ? maxx : minx, y = p[1] > 0 ? maxy : miny, z = p[2] > 0 ? maxz : minz;
      if (p[0] * x + p[1] * y + p[2] * z + p[3] < 0) return false;
    }
    return true;
  };

  /* ---------- 噪声 ---------- */
  function hash2(x, y) {
    var n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return n - Math.floor(n);
  }
  M.hash2 = hash2;
  M.hash1 = function (n) { var s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };

  M.valueNoise2 = function (x, y) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return M.lerp(M.lerp(a, b, u), M.lerp(c, d, u), v);
  };
  M.fbm2 = function (x, y, oct) {
    var s = 0, a = 0.5, f = 1;
    oct = oct || 4;
    for (var i = 0; i < oct; i++) { s += a * M.valueNoise2(x * f, y * f); f *= 2.03; a *= 0.5; }
    return s;
  };
  M.noise1 = function (x) {
    var xi = Math.floor(x), xf = x - xi;
    var u = xf * xf * (3 - 2 * xf);
    return M.lerp(M.hash1(xi), M.hash1(xi + 1), u);
  };

  // mulberry32 PRNG
  M.rng = function (seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  M.fmtTime = function (sec) {
    if (sec == null || !isFinite(sec)) return '--:--.-';
    var neg = sec < 0; sec = Math.abs(sec);
    var m = Math.floor(sec / 60);
    var s = sec - m * 60;
    var str = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
    return (neg ? '-' : '') + str;
  };
  M.fmtDelta = function (d) {
    if (d == null || !isFinite(d)) return '';
    var s = Math.abs(d).toFixed(2);
    return (d < 0 ? '−' : '+') + s;
  };
})(typeof window !== 'undefined' ? window : globalThis);
