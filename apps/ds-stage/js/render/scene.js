/* scene.js — 把赛段烘焙成静态网格；车辆与座舱的程序化几何 */
(function (root) {
  'use strict';
  var RG = root.RG = root.RG || {};
  var M = RG.M, hex = RG.hex;

  var C = RG.COL = {
    gravel: hex(0x877b66),
    gravelDark: hex(0x655a49),
    tarmac: hex(0x46464a),
    tarmacWet: hex(0x35363a),
    snow: hex(0xe4eaee),
    snowShade: hex(0xc9d4da),
    grass: hex(0x4d5c35),
    grassDry: hex(0x615e3d),
    dirt: hex(0x6a5c48),
    rock: hex(0x726d64),
    trunk: hex(0x3a2c21),
    pine: hex(0x2b3d26),
    pine2: hex(0x35482b),
    leaf: hex(0x3f5a2e),
    rail: hex(0x9aa1a6),
    post: hex(0xd8d8d2),
    houseWall: hex(0xb6ac9b),
    houseRoof: hex(0x4b3a34),
    bridgeStone: hex(0x8d8a80),
    white: hex(0xffffff)
  };

  // 与物理一致的截面高度
  function pointAt(track, nd, lat) {
    var hw = nd.w, absLat = Math.abs(lat);
    var y, crown = -0.055 * Math.min(1, (absLat / hw) * (absLat / hw));
    var bankY = Math.tan(nd.bank) * lat;
    if (absLat <= hw) {
      y = nd.y + bankY + crown + track.roadRough(nd, lat);
      if (nd.rut) {
        var wl = Math.abs(absLat - hw * 0.55) / 0.55;
        y -= Math.min(1, Math.max(0, 1 - wl)) * nd.rut;
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
      drop = Math.min(drop, 34);
      y = nd.y + bankY + crown - drop;
      var amp = 0.11 + 0.30 * Math.min(1, far / 6);
      var px = nd.x + nd.rx * lat, pz = nd.z + nd.rz * lat;
      y += (M.fbm2(px * 0.09, pz * 0.09, 3) - 0.5) * amp * 2.2;
      y += (M.valueNoise2(px * 0.55, pz * 0.55) - 0.5) * amp * 0.6;
      var far2 = Math.max(0, far - 6);
      if (far2 > 0) {
        var px2 = nd.x + nd.rx * lat, pz2 = nd.z + nd.rz * lat;
        var big = M.fbm2(px2 * 0.0055, pz2 * 0.0055, 3) - 0.46;
        y += big * Math.min(1, far2 / 34) * 30;
      }
    }
    return y;
  }
  RG.pointAt = pointAt;

  function surfColor(nd) {
    var g = 1 - nd.tarmac - nd.snow;
    var c = [C.gravel[0] * g + C.tarmac[0] * nd.tarmac + C.snow[0] * nd.snow,
      C.gravel[1] * g + C.tarmac[1] * nd.tarmac + C.snow[1] * nd.snow,
      C.gravel[2] * g + C.tarmac[2] * nd.tarmac + C.snow[2] * nd.snow];
    if (nd.dirt > 0.02) {
      var d = Math.min(0.7, nd.dirt * 0.8);
      c = [c[0] * (1 - d) + C.dirt[0] * d * 0.9, c[1] * (1 - d) + C.dirt[1] * d * 0.9, c[2] * (1 - d) + C.dirt[2] * d * 0.9];
    }
    return c;
  }

  /* ---------------- 赛段网格 ---------------- */

  RG.Scene = {};

  RG.Scene.buildChunk = function (track, chunk) {
    var mesh = new RG.Mesh();
    var step = track.step;
    var i0 = chunk.i0, i1 = chunk.i1;
    var i, j;
    var latRoad = [-1, -0.55, 0, 0.55, 1];
    var latOut = [0.62, 1.08, 1.55, 2.6, 5.5, 14, 34, 90];  // 相对 w 的额外外扩
    var rows = [];

    for (i = i0; i <= i1; i++) {
      var nd = track.nodes[i];
      var w = nd.w;
      var row = [];
      // 左外侧（由远到近）
      for (j = latOut.length - 1; j >= 0; j--) {
        row.push([-w - latOut[j], latOut[j]]);
      }
      // 路面
      for (j = 0; j < latRoad.length; j++) row.push([latRoad[j] * w, 0]);
      // 右外侧
      for (j = 0; j < latOut.length; j++) row.push([w + latOut[j], latOut[j]]);

      var pts = [];
      for (j = 0; j < row.length; j++) {
        var lat = row[j][0];
        var yy = pointAt(track, nd, lat);
        pts.push([nd.x + nd.rx * lat, yy, nd.z + nd.rz * lat]);
      }
      rows.push({ pts: pts, nd: nd, out: row.map(function (r) { return r[1]; }) });
    }

    // 三角化：逐行
    for (i = 0; i < rows.length - 1; i++) {
      var A = rows[i], B = rows[i + 1];
      for (j = 0; j < A.pts.length - 1; j++) {
        var dOut = A.out[j];
        var col, mat;
        var midLat = (Math.abs(A.pts[j][0] - A.nd.x) + Math.abs(A.pts[j + 1][0] - A.nd.x)) * 0.5;
        var nd = A.nd;
        var isRoad = dOut === 0;
        if (isRoad) {
          col = surfColor(nd);
          mat = [Math.min(1, nd.dirt * 1.2), 0, nd.snow, 0];
        } else {
          // 路肩：土/草/雪
          var grassMix = Math.min(1, dOut / 4);
          var base = RG.mixc(C.dirt, nd.snow > 0.5 ? C.snowShade : C.grass, grassMix);
          col = RG.mixc(nd.snow > 0.5 ? C.snow : base, base, 0.35);
          if (nd.tarmac > 0.5 && dOut < 3) col = RG.mixc(col, C.gravelDark, 0.5);
          mat = [0, 0, nd.snow, 0];
        }
        var p0 = A.pts[j], p1 = A.pts[j + 1], p2 = B.pts[j + 1], p3 = B.pts[j];
        // 法线：用地形梯度近似
        var nx = (p0[1] - p3[1]) / step, nz2 = (p0[1] - p1[1]) / 0.8;
        var nrm = [-nx, 1, -nz2];
        var ln = Math.hypot(nrm[0], nrm[1], nrm[2]);
        nrm[0] /= ln; nrm[1] /= ln; nrm[2] /= ln;
        var b = 0.975 + M.hash2(i * 0.7, j * 1.3) * 0.05;
        var cc = [col[0] * b, col[1] * b, col[2] * b];
        mesh.quadN(p0, p3, p2, p1, nrm, cc, mat);
      }
    }

    // 道具
    for (var pi = 0; pi < chunk.props.length; pi++) {
      addProp(mesh, track, chunk.props[pi]);
    }
    return { mesh: mesh, arrays: mesh.toArrays() };
  };

  function addProp(mesh, track, p) {
    if (p.type === 'tree') {
      var th = p.h;
      var trunkH = th * 0.30;
      var seed = p.seed || 0.5;
      var base = [p.x, p.y, p.z];
      var tilt = (seed - 0.5) * 0.10;
      // 树干
      mesh.cylinder(p.x, p.y - 0.2, p.z, p.r * 1.15, p.r * 0.75, trunkH + 0.2, 4, C.trunk, null);
      if (p.pine) {
        var layers = 3;
        for (var l = 0; l < layers; l++) {
          var t0 = l / layers;
          var rr = p.r * (6.4 - t0 * 3.4) * (0.8 + seed * 0.4);
          var yy = p.y + trunkH * 0.6 + t0 * (th - trunkH) * 0.9;
          var hh = (th - trunkH) * (0.55 - t0 * 0.15);
          mesh.cone(p.x + tilt * l, yy, p.z, rr, hh, 7, l % 2 ? C.pine : C.pine2, null);
        }
      } else {
        // 阔叶：几团
        mesh.cone(p.x, p.y + trunkH * 0.7, p.z, p.r * 5.4, th * 0.75, 7, C.leaf, null);
        mesh.cone(p.x + p.r * 1.2, p.y + trunkH * 1.5, p.z, p.r * 3.6, th * 0.42, 6, C.pine2, null);
      }
    } else if (p.type === 'rock') {
      var s = p.seed || 0.5;
      mesh.box(p.x, p.y + p.r * 0.35, p.z, p.r, p.r * 0.75, p.r * 0.9, C.rock, null, s * 3.1);
      mesh.box(p.x + p.r * 0.5, p.y + p.r * 0.2, p.z + p.r * 0.4, p.r * 0.6, p.r * 0.5, p.r * 0.6, C.rock, null, s * 2.0);
    } else if (p.type === 'post') {
      mesh.box(p.x, p.y + 0.5, p.z, 0.06, 0.5, 0.06, C.post, [0, 0.12, 0, 0]);
      mesh.box(p.x, p.y + 0.82, p.z, 0.075, 0.09, 0.075, hex(0xd23b2f), [0, 0.9, 0, 0]);
    } else if (p.type === 'rail') {
      var yaw = Math.atan2(p.dx, p.dz);
      mesh.box(p.x, p.y + 0.62, p.z, 0.06, 0.14, p.len * 0.55, C.rail, null, yaw);
      mesh.box(p.x, p.y + 0.30, p.z, 0.05, 0.10, p.len * 0.55, C.rail, null, yaw);
      // 立柱
      if ((p.i % 2) === 0) mesh.box(p.x, p.y + 0.36, p.z, 0.07, 0.36, 0.07, hex(0x7c8286), null, yaw);
    } else if (p.type === 'parapet') {
      var yaw2 = Math.atan2(p.dx, p.dz);
      mesh.box(p.x, p.y + 0.55, p.z, 0.22, 0.55, p.len * 0.55, C.bridgeStone, null, yaw2);
    } else if (p.type === 'house') {
      var hw = p.w * 0.5, hd = p.d * 0.5;
      mesh.box(p.x, p.y + p.h * 0.5, p.z, hw, p.h * 0.5, hd, C.houseWall, null, p.yaw);
      // 屋顶（用两个斜箱近似）
      var seg = 3;
      for (var r = 0; r < seg; r++) {
        var t = (r + 0.5) / seg;
        var ww = hw * (1 - Math.abs(t - 0.5) * 0.6) * 0.55;
        var off = (t - 0.5) * p.d * 0.95;
        mesh.box(p.x + Math.sin(p.yaw) * off, p.y + p.h + 0.25, p.z + Math.cos(p.yaw) * off,
          hw * 0.98, 0.22, p.d * 0.19, C.houseRoof, null, p.yaw);
      }
      // 窗
      var fy = p.y + p.h * 0.62;
      for (var wi = -1; wi <= 1; wi += 2) {
        mesh.box(p.x + Math.cos(p.yaw) * (hw + 0.02) * wi * Math.sign(1), fy, p.z - Math.sin(p.yaw) * (hw + 0.02) * wi,
          0.04, 0.42, 0.5, hex(0x232a30), [0, 0.05, 0, 0], p.yaw);
      }
    } else if (p.type === 'gate') {
      var nd = track.nodes[Math.min(track.nodes.length - 1, p.i)];
      var side = nd.w + 1.2;
      var colr = p.kind === 'start' ? hex(0xd8bb2f) : hex(0xd23b2f);
      for (var s2 = -1; s2 <= 1; s2 += 2) {
        mesh.box(nd.x + nd.rx * s2 * side, nd.y + 1.6, nd.z + nd.rz * s2 * side, 0.09, 1.6, 0.09, hex(0x8b8f93), null, 0);
      }
      mesh.box(nd.x, nd.y + 3.1, nd.z, side, 0.22, 0.10, colr, [0, 0.25, 0, 0], Math.atan2(nd.dx, nd.dz));
    } else if (p.type === 'split') {
      var nd2 = track.nodes[Math.min(track.nodes.length - 1, p.i)];
      for (var s3 = -1; s3 <= 1; s3 += 2) {
        mesh.box(nd2.x + nd2.rx * s3 * (nd2.w + 1.0), nd2.y + 0.9, nd2.z + nd2.rz * s3 * (nd2.w + 1.0),
          0.06, 0.9, 0.06, hex(0x3fa7d6), [0, 0.6, 0, 0], 0);
      }
    }
  }

  /* ---------------- 车辆 ---------------- */

  RG.Scene.buildCar = function () {
    var m = new RG.Mesh();
    var body = hex(0xdfe2e2), dark = hex(0x1e2126), blue = hex(0x1b4f92), glass = hex(0x16222c);
    var red = hex(0xc0392b);
    // 主体
    m.loft([
      { z: -2.05, hw: 0.80, y0: 0.30, y1: 0.88 },
      { z: -1.75, hw: 0.84, y0: 0.28, y1: 0.96 },
      { z: -1.10, hw: 0.86, y0: 0.26, y1: 1.00 },
      { z: -0.30, hw: 0.87, y0: 0.26, y1: 0.98 },
      { z: 0.55, hw: 0.85, y0: 0.26, y1: 0.92 },
      { z: 1.35, hw: 0.83, y0: 0.28, y1: 0.84 },
      { z: 1.85, hw: 0.78, y0: 0.30, y1: 0.74 },
      { z: 2.02, hw: 0.66, y0: 0.34, y1: 0.66 }
    ], body, null, body);
    // 侧裙/下半身
    m.box(0, 0.30, 0, 0.86, 0.10, 2.0, dark, null, 0);
    // 座舱
    m.loft([
      { z: -1.15, hw: 0.80, y0: 0.96, y1: 1.30 },
      { z: -0.75, hw: 0.82, y0: 0.96, y1: 1.38 },
      { z: 0.10, hw: 0.80, y0: 0.96, y1: 1.38 },
      { z: 0.62, hw: 0.74, y0: 0.96, y1: 1.18 },
      { z: 0.95, hw: 0.66, y0: 0.96, y1: 1.02 }
    ], glass, null, body);
    // A/B 柱
    m.box(-0.74, 1.15, 0.72, 0.05, 0.22, 0.06, dark, null, 0);
    m.box(0.74, 1.15, 0.72, 0.05, 0.22, 0.06, dark, null, 0);
    m.box(-0.80, 1.14, -0.72, 0.05, 0.24, 0.05, dark, null, 0);
    m.box(0.80, 1.14, -0.72, 0.05, 0.24, 0.05, dark, null, 0);
    // 引擎盖条纹
    m.box(0, 0.99, 1.15, 0.22, 0.02, 0.55, blue, null, 0);
    m.box(0, 1.40, -0.4, 0.24, 0.02, 1.0, blue, null, 0);
    // 前后保险杠
    m.box(0, 0.50, 2.02, 0.70, 0.16, 0.10, dark, null, 0);
    m.box(0, 0.50, -2.05, 0.72, 0.16, 0.10, dark, null, 0);
    // 灯
    m.box(-0.52, 0.62, 2.03, 0.20, 0.12, 0.05, hex(0xfff3d0), [0, 1.4, 0, 0], 0);
    m.box(0.52, 0.62, 2.03, 0.20, 0.12, 0.05, hex(0xfff3d0), [0, 1.4, 0, 0], 0);
    m.box(-0.55, 0.62, -2.06, 0.22, 0.10, 0.04, red, [0, 0.9, 0, 0], 0);
    m.box(0.55, 0.62, -2.06, 0.22, 0.10, 0.04, red, [0, 0.9, 0, 0], 0);
    // 尾翼
    m.box(0, 1.16, -1.95, 0.76, 0.035, 0.20, dark, null, 0);
    m.box(-0.62, 1.05, -1.95, 0.04, 0.12, 0.06, dark, null, 0);
    m.box(0.62, 1.05, -1.95, 0.04, 0.12, 0.06, dark, null, 0);
    // 轮眉
    var wp = [[-0.86, 1.22], [0.86, 1.22], [-0.87, -1.32], [0.87, -1.32]];
    for (var i = 0; i < 4; i++) {
      m.box(wp[i][0], 0.74, wp[i][1], 0.115, 0.11, 0.50, dark, null, 0);
    }
    // 车顶进气口
    m.box(0, 1.42, -0.35, 0.28, 0.06, 0.22, dark, null, 0);
    return m;
  };

  RG.Scene.buildWheel = function () {
    var m = new RG.Mesh();
    var tyre = hex(0x1c1c1e), rim = hex(0x8e9296), hub = hex(0x5b6064);
    // 轮胎（沿 X 轴）
    var seg = 12;
    for (var i = 0; i < seg; i++) {
      var a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      var y0 = Math.cos(a0) * 0.335, z0 = Math.sin(a0) * 0.335;
      var y1 = Math.cos(a1) * 0.335, z1 = Math.sin(a1) * 0.335;
      var p0 = [-0.115, y0, z0], p1 = [-0.115, y1, z1], p2 = [0.115, y1, z1], p3 = [0.115, y0, z0];
      m.quad(p0, p1, p2, p3, tyre, null);
      // 侧面
      m.tri([-0.115, 0, 0], p0, p1, tyre, null);
      m.tri([0.115, 0, 0], p3, p2, tyre, null);
    }
    // 轮辋
    for (var j = 0; j < 6; j++) {
      var a = j / 6 * Math.PI * 2;
      m.box(Math.sign(1) * 0.10, Math.cos(a) * 0.16, Math.sin(a) * 0.16, 0.03, 0.05, 0.05, rim, null, a);
    }
    m.cylinder(0.09, -0.02, 0, 0.09, 0.09, 0.04, 8, hub, null, true, true);
    return m;
  };

  RG.Scene.buildCockpit = function () {
    var m = new RG.Mesh();
    var pad = hex(0x33383f), metal = hex(0x555b63), cage = hex(0xc6cad0);
    var seat = hex(0x454b53), door = hex(0x3a4047);
    // 仪表台（顶面 y=1.00，前沿 z=1.05）
    m.box(0, 0.84, 0.80, 0.86, 0.14, 0.26, pad, null, 0);
    m.box(0, 0.70, 0.80, 0.86, 0.10, 0.26, door, null, 0);
    // 中央通道
    m.box(0, 0.72, 0.30, 0.14, 0.14, 0.45, metal, null, 0);
    // 门板（左右）
    m.box(-0.92, 0.70, -0.12, 0.03, 0.18, 0.50, door, null, 0);
    m.box(0.92, 0.70, -0.12, 0.03, 0.18, 0.50, door, null, 0);
    // 顶棚（在眼睛后上方，不挡视野）
    m.box(0, 1.40, -0.55, 0.86, 0.03, 0.60, pad, null, 0);
    // 防滚架
    m.box(-0.80, 1.24, -0.30, 0.025, 0.025, 0.025, cage, null, 0);
    m.box(0.80, 1.24, -0.30, 0.025, 0.025, 0.025, cage, null, 0);
    m.box(-0.80, 1.24, 0.30, 0.025, 0.16, 0.025, cage, null, 0);
    m.box(0.80, 1.24, 0.30, 0.025, 0.16, 0.025, cage, null, 0);
    m.box(0, 1.40, 0.05, 0.80, 0.02, 0.02, cage, null, 0);
    // A 柱（细）
    m.box(-0.90, 1.18, 0.64, 0.022, 0.22, 0.022, pad, null, 0);
    m.box(0.90, 1.18, 0.64, 0.022, 0.22, 0.022, pad, null, 0);
    // 座椅靠背
    m.box(-0.36, 1.00, -0.52, 0.24, 0.28, 0.09, seat, null, 0);
    m.box(0.36, 1.00, -0.52, 0.24, 0.28, 0.09, seat, null, 0);
    // 后视镜外壳
    m.box(-0.28, 1.34, 0.515, 0.145, 0.038, 0.035, hex(0x121417), null, 0);
    return m;
  };
})(typeof window !== 'undefined' ? window : globalThis);
