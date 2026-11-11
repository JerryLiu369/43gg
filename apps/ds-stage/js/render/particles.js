/* particles.js — 尘土/雪雾/水花/石子/火花，CPU 模拟 + 点精灵绘制 */
(function (root) {
  'use strict';
  var RG = root.RG = root.RG || {};

  function Particles(cap) {
    this.cap = cap || 620;
    this.pos = new Float32Array(this.cap * 3);
    this.vel = new Float32Array(this.cap * 3);
    this.col = new Float32Array(this.cap * 4);
    this.size = new Float32Array(this.cap);
    this.life = new Float32Array(this.cap);
    this.maxLife = new Float32Array(this.cap);
    this.drag = new Float32Array(this.cap);
    this.grav = new Float32Array(this.cap);
    this.count = 0;
    this.head = 0;
  }
  RG.Particles = Particles;

  Particles.prototype.clear = function () { this.count = 0; this.head = 0; };

  Particles.prototype.emit = function (x, y, z, vx, vy, vz, r, g, b, a, size, life, grav, drag) {
    var i = this.head;
    this.head = (this.head + 1) % this.cap;
    if (this.count < this.cap) this.count++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
    this.size[i] = size;
    this.life[i] = life; this.maxLife[i] = life;
    this.grav[i] = grav === undefined ? -1.2 : grav;
    this.drag[i] = drag === undefined ? 1.4 : drag;
  };

  Particles.prototype.update = function (dt) {
    var n = this.count;
    for (var i = 0; i < n; i++) {
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; continue; }
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; continue; }
      var k = i * 3;
      this.vel[k + 1] += this.grav[i] * dt;
      var d = Math.exp(-this.drag[i] * dt);
      this.vel[k] *= d; this.vel[k + 1] *= d; this.vel[k + 2] *= d;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      var t = this.life[i] / this.maxLife[i];
      this.col[i * 4 + 3] = Math.min(1, t * 1.6) * 0.75;
      this.size[i] += dt * 1.1;
    }
  };

  // 常用发射器
  Particles.prototype.dust = function (x, y, z, vx, vz, inten, snowy) {
    if (snowy) {
      this.emit(x, y, z, vx * 0.5 + (Math.random() - 0.5) * 2.2, 0.9 + Math.random() * 1.6, vz * 0.5 + (Math.random() - 0.5) * 2.2,
        0.92, 0.95, 1.0, 0.55, 0.5 + Math.random() * 0.5, 0.7 + Math.random() * 0.6, 0.7, 1.8);
    } else {
      this.emit(x, y, z, vx * 0.45 + (Math.random() - 0.5) * 1.8, 0.7 + Math.random() * 1.4, vz * 0.45 + (Math.random() - 0.5) * 1.8,
        0.62, 0.55, 0.44, 0.42 * inten, 0.45 + Math.random() * 0.7, 0.9 + Math.random() * 0.9, 0.5, 1.5);
    }
  };
  Particles.prototype.gravel = function (x, y, z, vx, vz) {
    this.emit(x, y, z, vx + (Math.random() - 0.5) * 5, 1.6 + Math.random() * 3.2, vz + (Math.random() - 0.5) * 5,
      0.35, 0.31, 0.26, 0.85, 0.09 + Math.random() * 0.09, 0.9, -9.0, 0.6);
  };
  Particles.prototype.water = function (x, y, z, vx, vz) {
    this.emit(x, y, z, vx * 0.6 + (Math.random() - 0.5) * 3, 1.4 + Math.random() * 2.6, vz * 0.6 + (Math.random() - 0.5) * 3,
      0.72, 0.78, 0.82, 0.6, 0.16 + Math.random() * 0.2, 0.55, -8, 0.8);
  };
  Particles.prototype.spark = function (x, y, z) {
    this.emit(x, y, z, (Math.random() - 0.5) * 5, 2 + Math.random() * 3, (Math.random() - 0.5) * 5,
      1.0, 0.72, 0.25, 1.0, 0.06, 0.35, -12, 0.4);
  };
  Particles.prototype.smoke = function (x, y, z, dark) {
    this.emit(x, y, z, (Math.random() - 0.5) * 0.8, 1.0 + Math.random(), (Math.random() - 0.5) * 0.8,
      dark ? 0.12 : 0.55, dark ? 0.12 : 0.55, dark ? 0.13 : 0.56, 0.35, 0.7, 1.6, 0.9, 1.0);
  };
})(typeof window !== 'undefined' ? window : globalThis);
