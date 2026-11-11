/* mesh.js — 程序化几何构建器（顶点格式 pos3 nrm3 col3 mat4） */
(function (root) {
  'use strict';
  var RG = root.RG = root.RG || {};
  var M = RG.M;

  function hex(h) {
    return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
  }
  RG.hex = hex;
  RG.mixc = function (a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  };

  function Mesh() {
    this.p = []; this.n = []; this.c = []; this.m = [];
    this.idx = [];
    this.count = 0;
  }
  Mesh.prototype.vert = function (x, y, z, nx, ny, nz, col, mat) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz);
    this.c.push(col[0], col[1], col[2]);
    this.m.push(mat ? mat[0] : 0, mat ? mat[1] : 0, mat ? mat[2] : 0, mat ? mat[3] : 0);
    return this.count++;
  };
  Mesh.prototype.tri = function (a, b, c, col, mat) {
    var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    var vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    var l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    var i0 = this.vert(a[0], a[1], a[2], nx, ny, nz, col, mat);
    var i1 = this.vert(b[0], b[1], b[2], nx, ny, nz, col, mat);
    var i2 = this.vert(c[0], c[1], c[2], nx, ny, nz, col, mat);
    this.idx.push(i0, i1, i2);
  };
  // 四点面（自动选择绕序使法线朝上/朝外由调用者保证）
  Mesh.prototype.quad = function (a, b, c, d, col, mat) {
    this.tri(a, b, c, col, mat);
    this.tri(a, c, d, col, mat);
  };
  // 带指定法线的四边形（用于地面）
  Mesh.prototype.quadN = function (a, b, c, d, nrm, col, mat) {
    var i0 = this.vert(a[0], a[1], a[2], nrm[0], nrm[1], nrm[2], col, mat);
    var i1 = this.vert(b[0], b[1], b[2], nrm[0], nrm[1], nrm[2], col, mat);
    var i2 = this.vert(c[0], c[1], c[2], nrm[0], nrm[1], nrm[2], col, mat);
    var i3 = this.vert(d[0], d[1], d[2], nrm[0], nrm[1], nrm[2], col, mat);
    this.idx.push(i0, i1, i2, i0, i2, i3);
  };

  Mesh.prototype.box = function (cx, cy, cz, hx, hy, hz, col, mat, rotY) {
    var cs = Math.cos(rotY || 0), sn = Math.sin(rotY || 0);
    function P(x, y, z) {
      return [cx + x * cs + z * sn, cy + y, cz - x * sn + z * cs];
    }
    var v = [
      P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz),
      P(-hx, hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), P(-hx, hy, hz)
    ];
    this.quad(v[4], v[5], v[6], v[7], col, mat);       // top
    this.quad(v[3], v[2], v[1], v[0], col, mat);       // bottom
    this.quad(v[7], v[6], v[2], v[3], col, mat);       // front(+z)
    this.quad(v[0], v[1], v[5], v[4], col, mat);       // back
    this.quad(v[1], v[2], v[6], v[5], col, mat);       // right
    this.quad(v[3], v[0], v[4], v[7], col, mat);       // left
  };

  // 圆台/圆柱（Y 轴）
  Mesh.prototype.cylinder = function (cx, cy, cz, rBottom, rTop, h, seg, col, mat, capTop, capBot) {
    var i, a0, a1;
    for (i = 0; i < seg; i++) {
      a0 = i / seg * Math.PI * 2; a1 = (i + 1) / seg * Math.PI * 2;
      var x0 = Math.cos(a0), z0 = Math.sin(a0), x1 = Math.cos(a1), z1 = Math.sin(a1);
      var p0 = [cx + x0 * rBottom, cy, cz + z0 * rBottom];
      var p1 = [cx + x1 * rBottom, cy, cz + z1 * rBottom];
      var p2 = [cx + x1 * rTop, cy + h, cz + z1 * rTop];
      var p3 = [cx + x0 * rTop, cy + h, cz + z0 * rTop];
      this.quad(p1, p0, p3, p2, col, mat);
      if (capTop && rTop > 0.001) this.tri([cx, cy + h, cz], p2, p3, col, mat);
      if (capBot && rBottom > 0.001) this.tri([cx, cy, cz], p0, p1, col, mat);
    }
  };

  Mesh.prototype.cone = function (cx, cy, cz, r, h, seg, col, mat) {
    for (var i = 0; i < seg; i++) {
      var a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      var p0 = [cx + Math.cos(a0) * r, cy, cz + Math.sin(a0) * r];
      var p1 = [cx + Math.cos(a1) * r, cy, cz + Math.sin(a1) * r];
      this.tri(p1, p0, [cx, cy + h, cz], col, mat);
    }
  };

  // 沿 Z 轴放样：sections = [{z, hw, y0, y1}]
  Mesh.prototype.loft = function (sections, col, mat, colTop) {
    var i;
    for (i = 0; i < sections.length - 1; i++) {
      var a = sections[i], b = sections[i + 1];
      var p0 = [-a.hw, a.y0, a.z], p1 = [a.hw, a.y0, a.z], p2 = [b.hw, b.y0, b.z], p3 = [-b.hw, b.y0, b.z];
      this.quad(p0, p1, p2, p3, col, mat);   // bottom
      var t0 = [-a.hw, a.y1, a.z], t1 = [a.hw, a.y1, a.z], t2 = [b.hw, b.y1, b.z], t3 = [-b.hw, b.y1, b.z];
      this.quad(t3, t2, t1, t0, colTop || col, mat); // top
      this.quad(t1, t2, p2, p1, col, mat);  // right
      this.quad(p0, p3, t3, t0, col, mat);  // left
    }
    // 前后封口
    var f = sections[0], l = sections[sections.length - 1];
    this.quad([-f.hw, f.y0, f.z], [-f.hw, f.y1, f.z], [f.hw, f.y1, f.z], [f.hw, f.y0, f.z], col, mat);
    this.quad([l.hw, l.y0, l.z], [l.hw, l.y1, l.z], [-l.hw, l.y1, l.z], [-l.hw, l.y0, l.z], col, mat);
  };

  Mesh.prototype.addMesh = function (other, mat4) {
    var base = this.count;
    var R = mat4;
    for (var i = 0; i < other.count; i++) {
      var x = other.p[i * 3], y = other.p[i * 3 + 1], z = other.p[i * 3 + 2];
      var nx = other.n[i * 3], ny = other.n[i * 3 + 1], nz = other.n[i * 3 + 2];
      var wx = R[0] * x + R[4] * y + R[8] * z + R[12];
      var wy = R[1] * x + R[5] * y + R[9] * z + R[13];
      var wz = R[2] * x + R[6] * y + R[10] * z + R[14];
      var wnx = R[0] * nx + R[4] * ny + R[8] * nz;
      var wny = R[1] * nx + R[5] * ny + R[9] * nz;
      var wnz = R[2] * nx + R[6] * ny + R[10] * nz;
      var l = Math.hypot(wnx, wny, wnz) || 1;
      this.p.push(wx, wy, wz);
      this.n.push(wnx / l, wny / l, wnz / l);
      this.c.push(other.c[i * 3], other.c[i * 3 + 1], other.c[i * 3 + 2]);
      this.m.push(other.m[i * 4], other.m[i * 4 + 1], other.m[i * 4 + 2], other.m[i * 4 + 3]);
      this.count++;
    }
    for (var j = 0; j < other.idx.length; j++) this.idx.push(other.idx[j] + base);
    return this;
  };

  Mesh.prototype.toArrays = function () {
    return {
      pos: new Float32Array(this.p),
      nrm: new Float32Array(this.n),
      col: new Float32Array(this.c),
      mat: new Float32Array(this.m),
      idx: this.count > 65000 ? new Uint32Array(this.idx) : new Uint16Array(this.idx),
      count: this.idx.length, verts: this.count
    };
  };

  RG.Mesh = Mesh;
})(typeof window !== 'undefined' ? window : globalThis);
