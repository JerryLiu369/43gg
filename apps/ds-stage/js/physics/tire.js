/* tire.js — 轮胎：滑移率 × 侧偏角 联合滑移曲线
   特点：有明确峰值，峰值后平缓下降（可救回），不同路面峰值位置与下降斜率不同。
   k = 归一化滑移量，f(k) 为摩擦利用系数：
     k<=1 : 1-(1-k)^2         （抛物线上升，峰值斜率 0）
     k>1  : 1 - a*u^1.4/(1+u^1.4), u=k-1  （平缓下降，a 决定"宽容度"）
   峰值后只掉到峰值的 62%~72%，配合反打方向可以稳定住滑移。 */
(function (root) {
  'use strict';
  var RG = root.RG = root.RG || {};

  // 各路面轮胎特性：峰值滑移率、峰值侧偏角(rad)、下降系数、松弛长度(m)
  RG.TIRE_CHAR = {
    GRAVEL: { peakSR: 0.19, peakSA: 0.170, falloff: 0.20, relax: 0.62, camberGain: 0.6 },
    TARMAC: { peakSR: 0.115, peakSA: 0.140, falloff: 0.24, relax: 0.30, camberGain: 1.0 },
    SNOW: { peakSR: 0.26, peakSA: 0.220, falloff: 0.16, relax: 1.05, camberGain: 0.35 },
    GRASS: { peakSR: 0.22, peakSA: 0.19, falloff: 0.22, relax: 0.85, camberGain: 0.3 },
    ROCK: { peakSR: 0.20, peakSA: 0.18, falloff: 0.22, relax: 0.7, camberGain: 0.3 }
  };

  var Tire = RG.Tire = {};

  // 摩擦利用系数
  Tire.shape = function (k, a) {
    if (k <= 0) return 0;
    if (k <= 1) { var d = 1 - k; return 1 - d * d; }
    var u = k - 1;
    var up = Math.pow(u, 1.4);
    return 1 - a * up / (1 + up);
  };

  // 联合滑移求力；返回 {fx, fy, k, sat}
  // 坐标：x 沿轮胎前进方向，y 沿轮胎侧向（右侧为正）。力方向与滑移相反。
  Tire.eval = function (slipRatio, slipAngle, Fz, mu, ch, out) {
    out = out || {};
    var sx = slipRatio / ch.peakSR;
    var sy = Math.tan(slipAngle) / Math.tan(ch.peakSA);
    var k = Math.hypot(sx, sy);
    var fmax = mu * Fz;
    var f = Tire.shape(k, ch.falloff);
    var mag = fmax * f;
    if (k > 1e-5) {
      out.fx = mag * (sx / k);
      out.fy = -mag * (sy / k);
    } else { out.fx = 0; out.fy = 0; }
    out.k = k;
    out.fmax = fmax;
    out.sat = M0(k);
    return out;
  };
  function M0(k) { return k < 0.001 ? 0 : k; }

  // 插值路面特性
  Tire.blendChar = function (w, out) {
    out = out || {};
    var C = RG.TIRE_CHAR;
    var a = C.GRAVEL, b = C.TARMAC, c = C.SNOW, d = C.GRASS, e = C.ROCK;
    var wg = w.gravel, wt = w.tarmac, ws = w.snow, wgr = w.grass || 0, wr = w.rock || 0;
    var tot = wg + wt + ws + wgr + wr;
    if (tot < 1e-6) { tot = 1; wg = 1; }
    var iw = 1 / tot;
    wg *= iw; wt *= iw; ws *= iw; wgr *= iw; wr *= iw;
    out.peakSR = a.peakSR * wg + b.peakSR * wt + c.peakSR * ws + d.peakSR * wgr + e.peakSR * wr;
    out.peakSA = a.peakSA * wg + b.peakSA * wt + c.peakSA * ws + d.peakSA * wgr + e.peakSA * wr;
    out.falloff = a.falloff * wg + b.falloff * wt + c.falloff * ws + d.falloff * wgr + e.falloff * wr;
    out.relax = a.relax * wg + b.relax * wt + c.relax * ws + d.relax * wgr + e.relax * wr;
    out.camberGain = a.camberGain * wg + b.camberGain * wt + c.camberGain * ws + d.camberGain * wgr + e.camberGain * wr;
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
