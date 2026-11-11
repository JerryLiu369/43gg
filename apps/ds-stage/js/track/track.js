/* track.js — 程序化赛段：曲率语法生成中心线、海拔、路面、道具、碰撞体、路书
   物理与渲染共用同一套采样函数，保证轮胎踩到的地面就是看到的几何。 */
(function (root) {
  'use strict';
  var RG = root.RG = root.RG || {};
  var M = RG.M, V = M.V;

  // 路面类型索引
  var SURF = RG.SURF = { GRAVEL: 0, TARMAC: 1, SNOW: 2, GRASS: 3, ROCK: 4 };
  // 各路面基础摩擦（峰值）与滚动阻力
  RG.SURFACE_DEF = {
    GRAVEL: { mu: 0.72, roll: 0.020, bump: 1.00, name: '砂石' },
    TARMAC: { mu: 1.05, roll: 0.011, bump: 0.28, name: '柏油' },
    SNOW: { mu: 0.38, roll: 0.030, bump: 0.55, name: '雪地' },
    GRASS: { mu: 0.52, roll: 0.055, bump: 1.30, name: '草地' },
    ROCK: { mu: 0.56, roll: 0.070, bump: 2.20, name: '岩石' }
  };

  function Track(spec) {
    this.spec = spec;
    this.nodes = [];
    this.length = 0;
    this.props = [];         // 渲染道具（按 chunk 分组在 build 后处理）
    this.colliders = [];     // {type:'circle'|'box', x,z,y,r|hw,hd,rot, tag}
    this.chunks = [];
    this.splits = [];
    this.notes = [];
    this.build();
  }
  RG.Track = Track;

  Track.prototype.build = function () {
    var spec = this.spec;
    var rnd = M.rng(spec.seed >>> 0);
    var nodes = this.nodes;
    var step = 2.0;
    var targetLen = spec.length;
    var i, n;

    // ---------- 1. 曲率/宽度/路面脚本 ----------
    var curv = [], width = [], surfT = [], surfS = [], flags = [];
    var s = 0;
    var segs = this.makeScript(rnd, targetLen);
    var si = 0, segStart = 0;
    var maxN = Math.ceil((targetLen + 200) / step) + 8;
    // 先铺平直缓冲，起步 80m 直道
    var sStraight = 80;
    while (s < sStraight) { curv.push(0); width.push(3.0); surfT.push(spec.tarmacBias); surfS.push(spec.snowBias); flags.push(0); s += step; }
    var cur = 0, curW = 3.0, curT = spec.tarmacBias, curS = spec.snowBias, curF = 0;
    for (var k = 0; k < segs.length && s < targetLen + 120; k++) {
      var sg = segs[k];
      var len = sg.len;
      var steps = Math.max(1, Math.round(len / step));
      for (var j = 0; j < steps; j++) {
        var t = j / steps;
        var c = sg.kind === 'corner' ? sg.curv : 0;
        if (sg.kind === 'corner') {
          // 收紧/变宽：曲率沿弧线线性变化
          if (sg.tighten) c *= 1 + 0.75 * t;
          else if (sg.open) c *= 1 - 0.55 * t;
          // 入弯出弯的缓和（clothoid）
          c *= Math.min(1, Math.min(t, 1 - t) * 3.2 + 0.12);
        }
        cur = c;
        curW = M.lerp(curW, sg.w, 0.22);
        curT = M.lerp(curT, sg.tarmac, 0.16);
        curS = M.lerp(curS, sg.snow, 0.16);
        curF = sg.flags || 0;
        curv.push(cur); width.push(curW); surfT.push(curT); surfS.push(curS); flags.push(curF);
        s += step;
      }
    }
    // 收尾直道
    for (var q = 0; q < 40; q++) { curv.push(0); width.push(2.9); surfT.push(spec.tarmacBias); surfS.push(spec.snowBias); flags.push(0); }
    n = curv.length;

    // 平滑曲率（避免曲率突变，形成缓和曲线）
    var sm = new Float32Array(n), tmp = new Float32Array(n);
    var kern = [0.06, 0.12, 0.19, 0.26, 0.19, 0.12, 0.06];
    for (i = 0; i < n; i++) {
      var acc = 0;
      for (var kk = -3; kk <= 3; kk++) {
        var ii = M.clamp(i + kk, 0, n - 1);
        acc += curv[ii] * kern[kk + 3];
      }
      sm[i] = acc;
    }
    // 宽度平滑
    for (i = 0; i < n; i++) {
      var wacc = 0, wc = 0;
      for (var k2 = -5; k2 <= 5; k2++) { var j2 = M.clamp(i + k2, 0, n - 1); wacc += width[j2]; wc++; }
      tmp[i] = wacc / wc;
    }
    width = Array.prototype.slice.call(tmp, 0, n);

    // ---------- 2. 积分中心线 ----------
    var x = 0, z = 0, h = 0;
    var minSep = 30;
    for (i = 0; i < n; i++) {
      var c = sm[i];
      // 防自交：前方 9m 探测点若靠近 80m 以前的旧路段，则额外偏转把路带走
      if (i > 34) {
        var px = x + Math.sin(h) * 9, pz = z + Math.cos(h) * 9;
        var bestD2 = 1e18, bj = -1;
        for (var b = 0; b < i - 26; b += 2) {
          var nd = nodes[b];
          var dx = px - nd.x, dz = pz - nd.z;
          var d2 = dx * dx + dz * dz;
          if (d2 < bestD2) { bestD2 = d2; bj = b; }
        }
        if (bj >= 0 && bestD2 < minSep * minSep) {
          var dd = Math.sqrt(bestD2);
          var ndb = nodes[bj];
          var tOx = ndb.x - px, tOz = ndb.z - pz;
          var crs = Math.sin(h) * tOz - Math.cos(h) * tOx;
          var amp = (minSep - dd) / minSep;
          var k = amp * 0.14;
          var away = (crs < 0 ? -1 : 1);
          c = c * (1 - amp * 0.8) + away * k;
          if (dd < 14) c = away * Math.max(0.085, Math.abs(c));
        }
      }
      if (i > 0) {
        h += c * step;
        x += Math.sin(h) * step;
        z += Math.cos(h) * step;
      }
      nodes.push({
        x: x, y: 0, z: z, h: h,
        dx: Math.sin(h), dz: Math.cos(h),
        rx: Math.cos(h), rz: -Math.sin(h),
        w: width[i], curv: c,
        tarmac: M.clamp(surfT[i], 0, 1), snow: M.clamp(surfS[i], 0, 1),
        flags: flags[i], s: i * step,
        bank: 0, rut: 0, dirt: 0
      });
    }
    this.length = (n - 1) * step;
    this.step = step;

    // ---------- 3. 海拔剖面 ----------
    this.buildElevation(rnd);

    // ---------- 4. 标志位转换：窄桥/山脊/村庄 ----------
    this.markFeatures(rnd);

    // ---------- 5. 分段时间点 ----------
    this.splits = [this.length / 3, this.length * 2 / 3];

    // ---------- 6. 道具与碰撞体 ----------
    this.buildProps(rnd);
    this.buildColliderGrid();

    // ---------- 7. 路书 ----------
    this.buildPacenotes();

    // ---------- 8. 分块（渲染） ----------
    this.buildChunks();

    return this;
  };

  // 特征脚本：由赛段地形标签组合
  Track.prototype.makeScript = function (rnd, len) {
    var spec = this.spec;
    var segs = [];
    var s = 0;
    var id = 0;
    var hEst = 0;   // 估计航向，避免随机游走绕回起点
    var terrain = spec.terrain; // {forest, village, ridge, open}
    function pickDir(ang) {
      var lim = 0.55;
      var d;
      if (hEst > lim) d = -1;
      else if (hEst < -lim) d = 1;
      else d = rnd() < 0.5 ? -1 : 1;
      hEst += d * ang;
      // 航向缓慢回归（真实赛道总体是往一个方向走的）
      hEst *= 0.985;
      return d;
    }
    function pick(a) { // a: {name:weight}
      var tot = 0, k;
      for (k in a) tot += a[k];
      var r = rnd() * tot;
      for (k in a) { r -= a[k]; if (r <= 0) return k; }
      return k;
    }
    while (s < len) {
      var key = pick({
        straight: 1.15,
        corner: 2.6,
        sBend: 1.15,
        hairpin: 0.42,
        jump: 0.55,
        narrow: 0.5,
        crest: 0.45,
        village: terrain.village * 0.18,
        ridge: terrain.ridge * 0.16,
        bridge: 0.12
      });
      var g;
      if (key === 'straight') {
        var L = 55 + rnd() * 90;
        g = { kind: 'straight', len: L, w: 3.0 + rnd() * 0.5, tarmac: spec.tarmacBias, snow: spec.snowBias, flags: 0 };
        if (rnd() < 0.5) g.flags |= 1; // 全油门直道
      } else if (key === 'corner') {
        var lvl = 1 + Math.floor(rnd() * 6);       // 1..6
        var R = [16, 22, 30, 42, 62, 105][lvl - 1] * (0.85 + rnd() * 0.3);
        var ang = (35 + rnd() * (lvl >= 4 ? 60 : 120)) * M.DEG;
        var dir = pickDir(ang);
        g = {
          kind: 'corner', len: R * ang, curv: dir / R, w: 2.9 + rnd() * 0.5,
          tarmac: spec.tarmacBias, snow: spec.snowBias,
          tighten: rnd() < 0.3, open: rnd() < 0.28,
          flags: (rnd() < 0.22 ? 2 : 0) | (rnd() < 0.18 ? 4 : 0), lvl: lvl, dir: dir, R: R
        };
      } else if (key === 'sBend') {
        var R2 = 26 + rnd() * 30, d2 = pickDir(0.5);
        var L2 = R2 * (0.7 + rnd() * 0.5);
        segs.push({ kind: 'corner', len: L2, curv: d2 / R2, w: 2.9, tarmac: spec.tarmacBias, snow: spec.snowBias, flags: 2, lvl: 3, dir: d2, R: R2 });
        segs.push({ kind: 'corner', len: L2, curv: -d2 / R2, w: 2.9, tarmac: spec.tarmacBias, snow: spec.snowBias, flags: 2, lvl: 3, dir: -d2, R: R2 });
        s += L2 * 2;
        // 中间留白由曲率平滑处理
        var g2 = { kind: 'straight', len: 12 + rnd() * 20, w: 2.9, tarmac: spec.tarmacBias, snow: spec.snowBias, flags: 0 };
        segs.push(g2); s += g2.len;
        continue;
      } else if (key === 'hairpin') {
        var Rh = 9.5 + rnd() * 4;
        var angH = (150 + rnd() * 30) * M.DEG;
        var dh = pickDir(2.6);
        g = { kind: 'corner', len: Rh * angH, curv: dh / Rh, w: 2.5 + rnd() * 0.4, tarmac: spec.tarmacBias, snow: spec.snowBias, tighten: false, open: false, flags: 8, lvl: 1, dir: dh, R: Rh };
      } else if (key === 'jump') {
        g = { kind: 'straight', len: 26 + rnd() * 22, w: 3.1, tarmac: spec.tarmacBias, snow: spec.snowBias, flags: 16 };
      } else if (key === 'narrow') {
        var Ln = 60 + rnd() * 70;
        g = { kind: 'straight', len: Ln, w: 2.05 + rnd() * 0.35, tarmac: spec.tarmacBias * 0.4, snow: spec.snowBias, flags: 32 };
      } else if (key === 'crest') {
        g = { kind: 'straight', len: 40 + rnd() * 40, w: 3.0, tarmac: spec.tarmacBias, snow: spec.snowBias, flags: 64 };
      } else if (key === 'village') {
        var Lv = 90 + rnd() * 80;
        g = { kind: 'straight', len: Lv, w: 2.6, tarmac: 1 - spec.snowBias, snow: spec.snowBias, flags: 128 };
      } else if (key === 'ridge') {
        var Lr = 110 + rnd() * 90;
        g = { kind: 'straight', len: Lr, w: 2.6 + rnd() * 0.3, tarmac: spec.tarmacBias, snow: spec.snowBias, flags: 256 };
      } else if (key === 'bridge') {
        g = { kind: 'straight', len: 34, w: 1.95, tarmac: 0.5, snow: spec.snowBias, flags: 512 };
      }
      segs.push(g);
      s += g.len;
      id++;
    }
    return segs;
  };

  Track.prototype.buildElevation = function (rnd) {
    var nodes = this.nodes, n = nodes.length, step = this.step;
    var baseA = 8 + rnd() * 10, baseB = 5 + rnd() * 6;
    var ph1 = rnd() * 6.28, ph2 = rnd() * 6.28, ph3 = rnd() * 6.28;
    var sMax = this.length;
    var y = 0;
    var seed = rnd() * 100;
    for (var i = 0; i < n; i++) {
      var s = i * step;
      // 长波起伏 + 中波
      var h = baseA * Math.sin(s / 420 + ph1) + baseB * Math.sin(s / 170 + ph2) +
        3.2 * Math.sin(s / 61 + ph3) + (M.fbm2(s * 0.004 + seed, 0.3, 3) - 0.5) * 9;
      nodes[i].y = h;
    }
    // 跳坡：局部凸起
    for (var k = 0; k < nodes.length; k++) {
      if (!(nodes[k].flags & 16)) continue;
      // 该段末尾做一个 8-16m 的坎
      var cIdx = Math.min(n - 1, k + 10);
      var amp = 0.55 + rnd() * 0.75;
      var widthM = 7 + rnd() * 7;
      for (var d = -14; d <= 16; d++) {
        var idx2 = cIdx + d;
        if (idx2 < 0 || idx2 >= n) continue;
        var t = (d * step) / widthM;
        if (Math.abs(t) > 3) continue;
        // 非对称：前坡缓，后坡陡（起跳）
        var shape = Math.exp(-t * t * (t > 0 ? 0.55 : 0.9));
        nodes[idx2].y += amp * shape;
      }
    }
    // 桥梁：两侧挖沟
    for (var b = 0; b < nodes.length; b++) {
      if (nodes[b].flags & 512) nodes[b].y += 1.5;
    }
    // 坡度限制（<=9%）并平滑
    var maxSlope = 0.085 * step;
    for (var pass = 0; pass < 2; pass++) {
      for (var j = 1; j < n; j++) {
        var dy = nodes[j].y - nodes[j - 1].y;
        if (dy > maxSlope) nodes[j].y = nodes[j - 1].y + maxSlope;
        else if (dy < -maxSlope) nodes[j].y = nodes[j - 1].y - maxSlope;
      }
      for (var j2 = n - 2; j2 >= 0; j2--) {
        var dy2 = nodes[j2].y - nodes[j2 + 1].y;
        if (dy2 > maxSlope) nodes[j2].y = nodes[j2 + 1].y + maxSlope;
        else if (dy2 < -maxSlope) nodes[j2].y = nodes[j2 + 1].y - maxSlope;
      }
    }
    // 起点归零，便于计算
    var y0 = nodes[0].y;
    for (var m = 0; m < n; m++) nodes[m].y -= y0;
    // 侧倾：弯道外高低（视觉与手感）
    for (var q = 1; q < n - 1; q++) {
      var bank = -nodes[q].curv * 26;
      nodes[q].bank = M.clamp(bank, -0.10, 0.10);
    }
    var bs = new Float32Array(n);
    for (var r = 0; r < n; r++) {
      var acc = 0, c = 0;
      for (var o = -6; o <= 6; o++) { var ii = M.clamp(r + o, 0, n - 1); acc += nodes[ii].bank; c++; }
      bs[r] = acc / c;
    }
    for (var t2 = 0; t2 < n; t2++) nodes[t2].bank = bs[t2];
    this.maxY = -1e9; this.minY = 1e9;
    for (var u = 0; u < n; u++) { this.maxY = Math.max(this.maxY, nodes[u].y); this.minY = Math.min(this.minY, nodes[u].y); }
  };

  Track.prototype.markFeatures = function (rnd) {
    var nodes = this.nodes;
    for (var i = 0; i < nodes.length; i++) {
      var f = nodes[i].flags;
      nodes[i].narrow = !!(f & 32);
      nodes[i].bridge = !!(f & 512);
      nodes[i].village = !!(f & 128);
      nodes[i].ridge = !!(f & 256);
      // 山脊哪一侧是崖：取随机但在一段内保持一致
      if (nodes[i].ridge) {
        if (i === 0 || !nodes[i - 1].ridge) this._ridgeSide = rnd() < 0.5 ? -1 : 1;
        nodes[i].cliffSide = this._ridgeSide;
        nodes[i].railSide = this._ridgeSide;
      } else if (nodes[i].bridge) {
        nodes[i].railSide = 0; // 双侧
      } else nodes[i].cliffSide = 0;
      // 颠簸强度：按路面
      nodes[i].rough = 1;
    }
  };

  /* ---------------- 采样 ---------------- */

  // 投影到中心线：返回 {i, lat, s, y(路面中心高)}
  // 采用“连续性偏好”窗口搜索：发夹弯上下两段在同一 XZ 附近时不会串段
  Track.prototype.project = function (x, z, hint) {
    var nodes = this.nodes, n = nodes.length;
    var hi = (hint && hint.i !== undefined) ? hint.i : 0;
    var bi = hi, bestScore = 1e18, i, i0, i1;
    for (var pass = 0; pass < 2; pass++) {
      var w = pass === 0 ? 14 : 70;
      i0 = Math.max(0, hi - w); i1 = Math.min(n - 1, hi + w);
      bestScore = 1e18;
      for (i = i0; i <= i1; i++) {
        var nd = nodes[i];
        var dx = x - nd.x, dz = z - nd.z;
        var ds = i - hi;
        var sc = dx * dx + dz * dz + ds * ds * 0.05;
        if (sc < bestScore) { bestScore = sc; bi = i; }
      }
      if (bi !== i0 && bi !== i1) break;
      if (w >= n) break;
    }
    if (hint) hint.i = bi;
    var nd3 = nodes[bi];
    var lx = x - nd3.x, lz = z - nd3.z;
    var lat = lx * nd3.rx + lz * nd3.rz;   // 右为正
    var along = lx * nd3.dx + lz * nd3.dz;
    return { i: bi, lat: lat, along: along, s: nd3.s + along, node: nd3 };
  };

  // 地面高度（含路肩/坡/噪声）。hint: {i}
  Track.prototype.heightAt = function (x, z, hint) {
    var pr = this.project(x, z, hint);
    return this.heightFromProjection(pr, x, z);
  };

  Track.prototype.heightFromProjection = function (pr, x, z) {
    var nd = pr.node, lat = pr.lat, hw = nd.w;
    var absLat = Math.abs(lat);
    var y;
    var crown = -0.055 * Math.min(1, (absLat / hw) * (absLat / hw));
    var bankY = Math.tan(nd.bank) * lat;
    if (absLat <= hw) {
      y = nd.y + bankY + crown;
      // 路面粗糙（低频，与网格一致）
      y += this.roadRough(nd, lat);
      // 车辙下陷
      var rut = nd.rut || 0;
      if (rut > 0) {
        var wl = Math.abs(absLat - hw * 0.55) / 0.55;
        y -= Math.min(1, Math.max(0, 1 - wl)) * rut;
      }
    } else {
      var d = absLat - hw;
      var verge = Math.min(d, 2.2);
      var slopeIn = 0.10 + (nd.ridge && nd.cliffSide === Math.sign(lat) ? 0.42 : 0);
      var drop = verge * slopeIn;
      var far = Math.max(0, d - 2.2);
      var cliff = (nd.ridge && nd.cliffSide === Math.sign(lat)) ? 1.0 : 0.0;
      var bridgeDrop = nd.bridge ? 1.0 : 0.0;
      var slopeOut = 0.13 + cliff * 0.55 + bridgeDrop * 2.5;
      drop += Math.pow(far, 1.22) * slopeOut * 0.35;
      drop = Math.min(drop, 9.5);
      y = nd.y + bankY + crown - drop;
      // 越野地形起伏
      var amp = 0.11 + 0.30 * Math.min(1, far / 6);
      y += (M.fbm2(x * 0.09, z * 0.09, 3) - 0.5) * amp * 2.2;
      y += (M.valueNoise2(x * 0.55, z * 0.55) - 0.5) * amp * 0.6;
      var far2 = Math.max(0, far - 6);
      if (far2 > 0) {
        var px2 = nd.x + nd.rx * lat, pz2 = nd.z + nd.rz * lat;
        var big = M.fbm2(px2 * 0.0055, pz2 * 0.0055, 3) - 0.46;
        y += big * Math.min(1, far2 / 34) * 30;
      }
    }
    return y;
  };

  // 路面粗糙度（与网格一致的低频项 + 物理用的高频项）
  Track.prototype.roadRough = function (nd, lat) {
    var s = nd.s;
    var g = 1 - nd.tarmac - nd.snow;
    var amp = 0.012 + 0.030 * g + 0.016 * nd.snow + 0.006 * nd.tarmac;
    var r = (M.noise1(s * 0.21 + lat * 0.05) - 0.5) * 2 * amp;
    r += (M.noise1(s * 0.73 + 13.7) - 0.5) * 2 * amp * 0.55;
    r += (M.noise1(s * 2.6 + 5.1) - 0.5) * 2 * amp * 0.25;  // 高频，只影响物理
    if (nd.flags & 16) r *= 1.0;
    return r;
  };

  // 完整地面信息（高度、法线、路面权重、脏污）
  Track.prototype.groundAt = function (x, z, hint, out) {
    out = out || {};
    var pr = this.project(x, z, hint);
    out.i = pr.i; out.lat = pr.lat; out.s = pr.s;
    var nd = pr.node;
    out.w = nd.w; out.node = nd;
    var y = this.heightFromProjection(pr, x, z);
    var e = 0.6;
    // 数值法线：用局部 hint 避免全局搜索
    var hA = { i: pr.i }, hB = { i: pr.i };
    var pa = this.project(x + e, z, hA), pb = this.project(x, z + e, hB);
    var hx = this.heightFromProjection(pa, x + e, z);
    var hz = this.heightFromProjection(pb, x, z + e);
    // 法线
    var nx = -(hx - y) / e, nz = -(hz - y) / e, ny = 1;
    var l = Math.hypot(nx, ny, nz);
    out.nx = nx / l; out.ny = ny / l; out.nz = nz / l;
    out.y = y;
    out.onRoad = Math.abs(pr.lat) <= nd.w + 0.25;
    out.edge = Math.abs(pr.lat) - nd.w;
    // 路面权重
    if (out.onRoad) {
      out.tarmac = nd.tarmac;
      out.snow = nd.snow;
      out.gravel = Math.max(0, 1 - nd.tarmac - nd.snow);
    } else {
      var gt = 1;
      // 村道旁是柏油/土
      out.tarmac = nd.village ? 0.35 : 0.0;
      out.snow = Math.max(nd.snow, this.spec.snowBias);
      out.gravel = Math.max(0, 1 - out.tarmac - out.snow);
    }
    // 脏污（砂石带上柏油）：全局 dirtLevel 逐段累积
    out.dirt = nd.dirt || 0;
    out.wet = this.spec.wet ? 1 : 0;
    // 冰面/积水：沿赛段的噪声斑块
    var pn = M.noise1(nd.s * 0.031 + 11.3);
    var pn2 = M.noise1(nd.s * 0.052 + 71.9);
    out.ice = this.spec.snowBias > 0.4 ? M.smoothstep(M.clamp((pn - 0.58) / 0.22, 0, 1)) : 0;
    out.puddle = (this.spec.wet && nd.tarmac > 0.35) ? M.smoothstep(M.clamp((pn2 - 0.63) / 0.2, 0, 1)) * 0.9 : 0;
    out.rut = nd.rut || 0;
    return out;
  };

  /* ---------------- 道具 ---------------- */

  Track.prototype.buildProps = function (rnd) {
    var nodes = this.nodes, n = nodes.length;
    var props = this.props, cols = this.colliders;
    var self = this;
    function addProp(p) { props.push(p); }

    // 起点/终点门
    addProp({ type: 'gate', i: 8, side: 0, kind: 'start' });
    addProp({ type: 'gate', i: n - 20, side: 0, kind: 'finish' });

    // 分段点标识
    for (var sp = 0; sp < 2; sp++) {
      var si = Math.round(this.splits[sp] / this.step);
      addProp({ type: 'split', i: si, side: 0 });
    }

    // 树木 / 岩石 / 反光桩 / 护栏
    var treeAcc = 0;
    for (var i = 4; i < n; i += 2) {
      var nd = nodes[i];
      var hw = nd.w;
      var s = nd.s;
      var hintN = { i: i };
      // 每 2 个节点（4m）尝试两侧
      for (var side = -1; side <= 1; side += 2) {
        var density = this.spec.treeDensity;
        if (nd.village) density *= 0.15;
        if (nd.bridge) density = 0;
        if (nd.ridge && side === nd.cliffSide) density *= 0.25;
        if (rnd() > density) continue;
        var dist = hw + 5.6 + rnd() * rnd() * 16;
        var off = (rnd() - 0.5) * 3;
        var px = nd.x + nd.rx * side * dist + nd.dx * off;
        var pz = nd.z + nd.rz * side * dist + nd.dz * off;
        var py = this.heightAt(px, pz, hintN);
        var kind = rnd() < 0.12 ? 'rock' : 'tree';
        var sc = 0.75 + rnd() * 0.8;
        if (kind === 'tree') {
          var hgt = (7 + rnd() * 9) * sc;
          addProp({ type: 'tree', x: px, y: py, z: pz, r: 0.34 * sc, h: hgt, seed: rnd(), pine: rnd() < 0.72, s: s });
          if (dist < hw + 8.0) cols.push({ type: 'circle', x: px, z: pz, r: 0.45 * sc, tag: 'tree' });
        } else {
          var rr = (0.5 + rnd() * 1.5) * sc;
          addProp({ type: 'rock', x: px, y: py, z: pz, r: rr, seed: rnd(), s: s });
          if (dist < hw + 8.5) cols.push({ type: 'circle', x: px, z: pz, r: rr * 0.9, tag: 'rock' });
        }
      }
      // 反光桩：沿路缘每 24m
      if (i % 12 === 0 && !nd.bridge) {
        for (var sd = -1; sd <= 1; sd += 2) {
          var ppx = nd.x + nd.rx * sd * (hw + 0.75);
          var ppz = nd.z + nd.rz * sd * (hw + 0.75);
          addProp({ type: 'post', x: ppx, y: this.heightAt(ppx, ppz, hintN), z: ppz, side: sd, i: i });
        }
      }
      // 护栏（山脊/桥梁）
      if ((nd.ridge && nd.cliffSide === sd) || nd.bridge) {
        // 在 ridge 段每节点加护栏段
      }
      if (nd.ridge && nd.cliffSide) {
        var sdC = nd.cliffSide;
        var rpx = nd.x + nd.rx * sdC * (hw + 1.15);
        var rpz = nd.z + nd.rz * sdC * (hw + 1.15);
        addProp({ type: 'rail', x: rpx, y: this.heightAt(rpx, rpz, hintN), z: rpz, dx: nd.dx, dz: nd.dz, len: this.step, i: i, s: s });
      }
      if (nd.bridge) {
        for (var sb = -1; sb <= 1; sb += 2) {
          var bpx = nd.x + nd.rx * sb * (hw + 0.35);
          var bpz = nd.z + nd.rz * sb * (hw + 0.35);
          addProp({ type: 'parapet', x: bpx, y: nd.y, z: bpz, dx: nd.dx, dz: nd.dz, len: this.step, side: sb, s: s });
        }
      }
      // 村庄房屋
      if (nd.village && i % 10 === 0) {
        for (var sv = -1; sv <= 1; sv += 2) {
          if (rnd() < 0.45) continue;
          var bx = nd.x + nd.rx * sv * (hw + 5.5 + rnd() * 2);
          var bz = nd.z + nd.rz * sv * (hw + 5.5 + rnd() * 2);
          var by = this.heightAt(bx, bz, hintN);
          var bw = 6 + rnd() * 5, bd = 5 + rnd() * 4, bh = 4.5 + rnd() * 3;
          addProp({ type: 'house', x: bx, y: by, z: bz, w: bw, d: bd, h: bh, yaw: nd.h + (rnd() - 0.5) * 0.3, seed: rnd(), s: s });
          cols.push({ type: 'box', x: bx, z: bz, hw: bw * 0.5, hd: bd * 0.5, rot: nd.h, tag: 'house' });
        }
      }
    }
    // 护栏 + 桥梁碰撞体（线段用细长方盒近似）
    for (var c = 0; c < props.length; c++) {
      var p = props[c];
      if (p.type === 'rail' || p.type === 'parapet') {
        cols.push({ type: 'box', x: p.x, z: p.z, hw: 0.12, hd: p.len * 0.55, rot: Math.atan2(p.dx, p.dz), tag: 'rail' });
      }
    }
  };

  /* ---------------- 路书 ---------------- */

  Track.prototype.buildPacenotes = function () {
    var nodes = this.nodes, n = nodes.length;
    var notes = [];
    var i = 6;
    var lvlName = ['', '1', '2', '3', '4', '5', '6'];
    while (i < n - 4) {
      var nd = nodes[i];
      var curv = nd.curv;
      var absC = Math.abs(curv);
      var isCorner = absC > 1 / 150;
      if (!isCorner) {
        // 直道：判断长度
        var j = i;
        while (j < n - 1 && Math.abs(nodes[j].curv) < 1 / 150) j++;
        var len = (j - i) * this.step;
        if (len > 95) {
          notes.push({ i: i, s: nd.s, text: '直道', sub: len > 180 ? '全油门' : '', kind: 'straight', dist: len });
        }
        i = j + 1;
        continue;
      }
      // 弯道：统计持续长度与总转角
      var j2 = i, ang = 0, maxC = absC, minR = 1 / absC;
      var dir = Math.sign(curv);
      while (j2 < n - 1 && Math.abs(nodes[j2].curv) > 1 / 200 && Math.sign(nodes[j2].curv) === dir) {
        ang += Math.abs(nodes[j2].curv) * this.step;
        if (Math.abs(nodes[j2].curv) > maxC) { maxC = Math.abs(nodes[j2].curv); minR = 1 / maxC; }
        j2++;
      }
      var R = 1 / maxC;
      var level;
      if (ang > 2.5 && R < 16) level = 1;         // 发夹
      else if (R < 14) level = 1;
      else if (R < 20) level = 2;
      else if (R < 28) level = 3;
      else if (R < 38) level = 4;
      else if (R < 55) level = 5;
      else level = 6;
      var tight = (nodes[Math.min(n - 1, i + 3)].curv * dir) > (curv * dir) * 1.18;
      var open = (nodes[Math.min(n - 1, Math.max(0, j2 - 4))].curv * dir) < (curv * dir) * 0.8;
      var sub = '';
      if (ang > 2.5 && R < 16) sub = '发夹';
      else if (tight) sub = '收紧';
      else if (open) sub = '变宽';
      if (nodes[i].flags & 4) sub = sub ? sub + ' 盲弯' : '盲弯';
      var text = (dir > 0 ? '左' : '右') + lvlName[level];
      notes.push({ i: i, s: nd.s, text: text, sub: sub, kind: 'corner', dir: dir, ang: ang, R: R, level: level });
      i = j2 + 1;
    }
    // 插入跳坡/窄路/桥/路面变化
    var extra = [];
    for (var k = 0; k < n; k++) {
      var f = nodes[k].flags;
      if (f & 16) extra.push({ i: k + 8, s: nodes[Math.min(n - 1, k + 8)].s, text: '跳坡', sub: '', kind: 'jump' });
      if (f & 512 && (!k || !(nodes[k - 1].flags & 512))) extra.push({ i: k, s: nodes[k].s, text: '窄桥', sub: '', kind: 'bridge' });
      if (f & 32 && (!k || !(nodes[k - 1].flags & 32))) extra.push({ i: k, s: nodes[k].s, text: '窄路', sub: '', kind: 'narrow' });
      if (f & 128 && (!k || !(nodes[k - 1].flags & 128))) extra.push({ i: k, s: nodes[k].s, text: '村庄', sub: '窄', kind: 'village' });
      // 路面变化（砂石->柏油）
      if (k > 2) {
        var dT = nodes[k].tarmac - nodes[k - 2].tarmac;
        if (dT > 0.25) extra.push({ i: k, s: nodes[k].s, text: '路面', sub: '柏油', kind: 'surface' });
        if (dT < -0.25) extra.push({ i: k, s: nodes[k].s, text: '路面', sub: '砂石', kind: 'surface' });
      }
    }
    // 合并并按 s 排序
    var all = notes.concat(extra);
    all.sort(function (a, b) { return a.s - b.s; });
    // 去重（15m 内保留更重要的）
    var out = [];
    for (var m = 0; m < all.length; m++) {
      if (out.length && all[m].s - out[out.length - 1].s < 18) {
        if (all[m].kind === 'jump' || all[m].kind === 'bridge') out[out.length - 1] = all[m];
        continue;
      }
      out.push(all[m]);
    }
    out.push({ s: this.length - 60, text: '终点', sub: '', kind: 'finish' });
    out.push({ s: this.length - 25, text: '收车', sub: '', kind: 'finish' });
    this.notes = out;
  };

  /* ---------------- 分块 ---------------- */

  Track.prototype.buildChunks = function () {
    var chunkLen = 96;
    var nChunks = Math.ceil(this.length / chunkLen) + 1;
    this.chunks = [];
    this.chunkLen = chunkLen;
    for (var c = 0; c < nChunks; c++) {
      this.chunks.push({ s0: c * chunkLen, s1: (c + 1) * chunkLen, props: [], minx: 1e9, maxx: -1e9, minz: 1e9, maxz: -1e9 });
    }
    // 道具归块
    for (var i = 0; i < this.props.length; i++) {
      var p = this.props[i];
      var s = p.s !== undefined ? p.s : (p.i !== undefined ? p.i * this.step : 0);
      var ci = M.clamp(Math.floor(s / chunkLen), 0, nChunks - 1);
      this.chunks[ci].props.push(p);
      var ch = this.chunks[ci];
      var rad = 10;
      if (p.x !== undefined) {
        ch.minx = Math.min(ch.minx, p.x - rad); ch.maxx = Math.max(ch.maxx, p.x + rad);
        ch.minz = Math.min(ch.minz, p.z - rad); ch.maxz = Math.max(ch.maxz, p.z + rad);
      }
    }
    // 每个 chunk 的节点范围 + 包围盒
    for (var c2 = 0; c2 < this.chunks.length; c2++) {
      var ch2 = this.chunks[c2];
      var i0 = M.clamp(Math.floor(ch2.s0 / this.step) - 1, 0, this.nodes.length - 1);
      var i1 = M.clamp(Math.ceil(ch2.s1 / this.step) + 1, 0, this.nodes.length - 1);
      ch2.i0 = i0; ch2.i1 = i1;
      var mn = [1e9, 1e9], mx = [-1e9, -1e9];
      for (var j = i0; j <= i1; j++) {
        var nd = this.nodes[j];
        mn[0] = Math.min(mn[0], nd.x); mx[0] = Math.max(mx[0], nd.x);
        mn[1] = Math.min(mn[1], nd.z); mx[1] = Math.max(mx[1], nd.z);
      }
      ch2.minx = Math.min(ch2.minx, mn[0] - 45); ch2.maxx = Math.max(ch2.maxx, mx[0] + 45);
      ch2.minz = Math.min(ch2.minz, mn[1] - 45); ch2.maxz = Math.max(ch2.maxz, mx[1] + 45);
      // 高度范围
      var ymin = 1e9, ymax = -1e9;
      for (var j2 = i0; j2 <= i1; j2++) { ymin = Math.min(ymin, this.nodes[j2].y); ymax = Math.max(ymax, this.nodes[j2].y); }
      ch2.miny = ymin - 12; ch2.maxy = ymax + 22;
      ch2.cx = (ch2.minx + ch2.maxx) * .5; ch2.cz = (ch2.minz + ch2.maxz) * .5;
    }
  };

  // 当前所在进度 0..1
  Track.prototype.progressAt = function (s) { return M.clamp(s / this.length, 0, 1); };

  /* ---------------- 碰撞体空间网格 ---------------- */

  Track.prototype.buildColliderGrid = function () {
    this.colCell = 12;
    this.colGrid = new Map();
    for (var i = 0; i < this.colliders.length; i++) {
      var c = this.colliders[i];
      var r = c.type === 'circle' ? c.r : Math.hypot(c.hw, c.hd);
      var x0 = Math.floor((c.x - r) / this.colCell), x1 = Math.floor((c.x + r) / this.colCell);
      var z0 = Math.floor((c.z - r) / this.colCell), z1 = Math.floor((c.z + r) / this.colCell);
      for (var gx = x0; gx <= x1; gx++) {
        for (var gz = z0; gz <= z1; gz++) {
          var key = gx * 73856093 ^ gz * 19349663;
          var arr = this.colGrid.get(key);
          if (!arr) { arr = []; this.colGrid.set(key, arr); }
          arr.push(c);
        }
      }
    }
    this._queryOut = [];
  };

  Track.prototype.queryColliders = function (x, z, radius) {
    var out = this._queryOut;
    out.length = 0;
    var cs = this.colCell;
    var x0 = Math.floor((x - radius) / cs), x1 = Math.floor((x + radius) / cs);
    var z0 = Math.floor((z - radius) / cs), z1 = Math.floor((z + radius) / cs);
    for (var gx = x0; gx <= x1; gx++) {
      for (var gz = z0; gz <= z1; gz++) {
        var arr = this.colGrid.get(gx * 73856093 ^ gz * 19349663);
        if (!arr) continue;
        for (var i = 0; i < arr.length; i++) if (out.indexOf(arr[i]) < 0) out.push(arr[i]);
      }
    }
    return out;
  };


  // 根据 s 取插值点
  Track.prototype.at = function (s) {
    var f = M.clamp(s / this.step, 0, this.nodes.length - 1.001);
    var i = Math.floor(f), t = f - i;
    var a = this.nodes[i], b = this.nodes[Math.min(this.nodes.length - 1, i + 1)];
    return {
      x: M.lerp(a.x, b.x, t), y: M.lerp(a.y, b.y, t), z: M.lerp(a.z, b.z, t),
      dx: M.lerp(a.dx, b.dx, t), dz: M.lerp(a.dz, b.dz, t),
      w: M.lerp(a.w, b.w, t), node: a, i: i
    };
  };

  // 局部持久化数据（车辙/脏污）序列化
  Track.prototype.exportState = function () {
    var nodes = this.nodes, n = nodes.length;
    var rut = new Float32Array(n), dirt = new Float32Array(n);
    for (var i = 0; i < n; i++) { rut[i] = nodes[i].rut || 0; dirt[i] = nodes[i].dirt || 0; }
    return { rut: Array.from(rut).map(function (v) { return Math.round(v * 1000) / 1000; }), dirt: Array.from(dirt).map(function (v) { return Math.round(v * 100) / 100; }) };
  };
  Track.prototype.importState = function (st) {
    if (!st) return;
    var n = this.nodes.length;
    if (st.rut && st.rut.length === n) for (var i = 0; i < n; i++) this.nodes[i].rut = st.rut[i];
    if (st.dirt && st.dirt.length === n) for (var j = 0; j < n; j++) this.nodes[j].dirt = st.dirt[j];
  };

  // 在车辆经过时更新车辙/脏污
  Track.prototype.accumulateWear = function (i, lat, dirty, isSnow) {
    var nd = this.nodes[i];
    if (!nd) return;
    var hw = nd.w;
    if (Math.abs(lat) < hw && !isSnow) {
      var rutTarget = Math.min(0.045, 0.006 + Math.abs(lat) * 0.001);
      nd.rut = M.approach(nd.rut || 0, rutTarget, 0.0006, 1);
    }
    if (nd.tarmac > 0.4 && dirty > 0.1) {
      nd.dirt = Math.min(0.85, (nd.dirt || 0) + 0.0009 * dirty);
    }
  };

  /* ---------------- 碰撞 ---------------- */

  // 返回碰撞信息；把车推出去
  Track.prototype.collide = function (wheelsWorld, bodyPos, radius, vel, outEvents) {
    return null;
  };

})(typeof window !== 'undefined' ? window : globalThis);
