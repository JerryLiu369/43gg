/* renderer.js — 渲染管线：天空、地形、车辆、座舱、后视镜、粒子 */
(function (root) {
  'use strict';
  var RG = root.RG = root.RG || {};
  var M = RG.M, Q = M.Q, Mat4 = M.Mat4;

  function Renderer(canvas) {
    var gl = this.gl = RG.GL.init(canvas);
    this.canvas = canvas;
    this.prog = RG.GL.program(gl, RG.Shaders.mainVS, RG.Shaders.mainFS);
    this.skyProg = RG.GL.program(gl, RG.Shaders.skyVS, RG.Shaders.skyFS);
    this.partProg = RG.GL.program(gl, RG.Shaders.partVS, RG.Shaders.partFS);
    this.texProg = RG.GL.program(gl, RG.Shaders.texVS, RG.Shaders.texFS);

    this.vp = Mat4.create();
    this.view = Mat4.create();
    this.proj = Mat4.create();
    this.invVP = Mat4.create();
    this.model = Mat4.create();
    this.planes = [null, null, null, null, null, null];
    this.chunks = [];
    this.env = null;
    this.quality = 1;

    // 天穹四边形
    this.skyBuf = RG.GL.buffer(gl, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]));
    // 车辆
    var carMesh = RG.Scene.buildCar().toArrays();
    this.carVBO = this.uploadMesh(carMesh);
    var wheelMesh = RG.Scene.buildWheel().toArrays();
    this.wheelVBO = this.uploadMesh(wheelMesh);
    var cockpit = RG.Scene.buildCockpit().toArrays();
    this.cockpitVBO = this.uploadMesh(cockpit);

    // 粒子缓冲
    this.partCap = 900;
    this.partData = new Float32Array(this.partCap * 8);
    this.partPos = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.partPos);
    gl.bufferData(gl.ARRAY_BUFFER, this.partData.byteLength, gl.DYNAMIC_DRAW);

    // 后视镜 FBO
    this.mirror = RG.GL.fbo(gl, 220, 130);
    this.mirrorQuad = RG.GL.buffer(gl, new Float32Array([-1, -1, 0, 0, 1, -1, 1, 0, 1, 1, 1, 1, -1, -1, 0, 0, 1, 1, 1, 1, -1, 1, 0, 1]));

    // 仪表纹理
    this.dashCanvas = document.createElement('canvas');
    this.dashCanvas.width = 512; this.dashCanvas.height = 256;
    this.dashCtx = this.dashCanvas.getContext('2d');
    this.dashTex = RG.GL.texture(gl, { width: 512, height: 256, data: null, min: gl.LINEAR, mag: gl.LINEAR });
    this.dashDirty = true;
    this.dashTimer = 0;
    this.dashQuad = RG.GL.buffer(gl, new Float32Array([
      -0.15, 0, 0.075, 1, 0, 0.15, 0, 0.075, 0, 0,
      0.15, 0, -0.075, 0, 1, -0.15, 0, 0.075, 1, 0, 0.15, 0, -0.075, 0, 1, -0.15, 0, -0.075, 1, 1
    ]));

    this.resize();
  }
  RG.Renderer = Renderer;

  Renderer.prototype.uploadMesh = function (a) {
    var gl = this.gl;
    return {
      pos: RG.GL.buffer(gl, a.pos), nrm: RG.GL.buffer(gl, a.nrm),
      col: RG.GL.buffer(gl, a.col), mat: RG.GL.buffer(gl, a.mat),
      idx: RG.GL.buffer(gl, a.idx, gl.ELEMENT_ARRAY_BUFFER),
      count: a.count, type: a.idx instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
      verts: a.verts
    };
  };

  Renderer.prototype.setStage = function (track, spec) {
    var gl = this.gl;
    for (var i = 0; i < this.chunks.length; i++) {
      var c = this.chunks[i];
      gl.deleteBuffer(c.pos); gl.deleteBuffer(c.nrm); gl.deleteBuffer(c.col);
      gl.deleteBuffer(c.mat); gl.deleteBuffer(c.idx);
    }
    this.chunks = [];
    this.track = track;
    this.spec = spec;
    for (var k = 0; k < track.chunks.length; k++) {
      var ch = track.chunks[k];
      if (ch.i1 <= ch.i0) continue;
      var built = RG.Scene.buildChunk(track, ch);
      var vbo = this.uploadMesh(built.arrays);
      vbo.minx = ch.minx; vbo.maxx = ch.maxx; vbo.miny = ch.miny; vbo.maxy = ch.maxy;
      vbo.minz = ch.minz; vbo.maxz = ch.maxz;
      vbo.cx = ch.cx; vbo.cz = ch.cz; vbo.s0 = ch.s0;
      this.chunks.push(vbo);
    }
    this.env = RG.Environment(spec);
  };

  Renderer.prototype.resize = function () {
    var c = this.canvas;
    var dpr = Math.min(window.devicePixelRatio || 1, this.quality >= 1 ? 2 : 1);
    var w = Math.floor(c.clientWidth * dpr), h = Math.floor(c.clientHeight * dpr);
    if (c.width !== w || c.height !== h) {
      c.width = w; c.height = h;
    }
    this.gl.viewport(0, 0, c.width, c.height);
    this.aspect = c.width / Math.max(1, c.height);
  };

  /* ---------------- 环境 ---------------- */
  RG.Environment = function (spec) {
    var day = spec.time;
    var w = spec.weather;
    var e = {
      sunDir: [0.55, 0.72, 0.42],
      sunColor: [1.0, 0.95, 0.86],
      ambient: [0.40, 0.45, 0.55],
      fogColor: [0.72, 0.78, 0.85],
      fogD: 0.0016,
      skyTop: [0.22, 0.40, 0.68],
      skyBot: [0.70, 0.81, 0.92],
      night: 0,
      headlights: false,
      sunSize: 1
    };
    if (day === 'dusk') {
      e.sunDir = [0.95, 0.16, 0.28]; e.sunColor = [1.0, 0.55, 0.28];
      e.ambient = [0.26, 0.24, 0.34]; e.fogColor = [0.62, 0.46, 0.42];
      e.skyTop = [0.14, 0.18, 0.38]; e.skyBot = [0.92, 0.52, 0.34];
      e.headlights = true; e.fogD = 0.0022;
    } else if (day === 'night') {
      e.sunDir = [-0.35, 0.55, 0.4]; e.sunColor = [0.14, 0.18, 0.28];
      e.ambient = [0.055, 0.07, 0.11]; e.fogColor = [0.035, 0.045, 0.07];
      e.skyTop = [0.012, 0.02, 0.045]; e.skyBot = [0.04, 0.05, 0.08];
      e.night = 1; e.headlights = true; e.fogD = 0.0035;
    } else if (day === 'dawn') {
      e.sunDir = [-0.2, 0.22, 0.95]; e.sunColor = [1.0, 0.72, 0.55];
      e.ambient = [0.28, 0.30, 0.38]; e.fogColor = [0.66, 0.68, 0.72];
      e.skyTop = [0.24, 0.34, 0.52]; e.skyBot = [0.86, 0.76, 0.70];
      e.headlights = true; e.fogD = 0.0034;
    }
    if (w === 'rain') {
      e.sunColor = [0.42, 0.45, 0.50]; e.ambient = [0.34, 0.37, 0.43];
      e.fogColor = [0.40, 0.44, 0.48]; e.skyTop = [0.24, 0.27, 0.31]; e.skyBot = [0.46, 0.49, 0.53];
      e.fogD = Math.max(e.fogD, 0.0040);
      if (day === 'night') { e.fogColor = [0.02, 0.025, 0.035]; }
    } else if (w === 'fog') {
      e.fogD = Math.max(e.fogD, 0.0075);
      e.fogColor = day === 'night' ? [0.03, 0.035, 0.05] : [0.62, 0.65, 0.68];
    } else if (w === 'snow') {
      e.sunColor = [0.72, 0.75, 0.80]; e.ambient = [0.52, 0.55, 0.60];
      e.fogColor = [0.78, 0.81, 0.85]; e.skyTop = [0.45, 0.50, 0.56]; e.skyBot = [0.80, 0.83, 0.87];
      e.fogD = Math.max(e.fogD, 0.0050);
    }
    // 归一化太阳方向
    var l = Math.hypot(e.sunDir[0], e.sunDir[1], e.sunDir[2]);
    e.sunDir = [e.sunDir[0] / l, e.sunDir[1] / l, e.sunDir[2] / l];
    return e;
  };

  /* ---------------- 绘制 ---------------- */
  Renderer.prototype.bindMesh = function (prog, m) {
    var gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, m.pos); gl.enableVertexAttribArray(prog.a.aPos); gl.vertexAttribPointer(prog.a.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.nrm); gl.enableVertexAttribArray(prog.a.aNrm); gl.vertexAttribPointer(prog.a.aNrm, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.col); gl.enableVertexAttribArray(prog.a.aCol); gl.vertexAttribPointer(prog.a.aCol, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.mat); gl.enableVertexAttribArray(prog.a.aMat); gl.vertexAttribPointer(prog.a.aMat, 4, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx);
  };

  Renderer.prototype.drawSky = function (cam) {
    var gl = this.gl, p = this.skyProg, e = this.env;
    gl.useProgram(p);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.uniformMatrix4fv(p.u.uInvVP, false, this.invVP);
    gl.uniform3fv(p.u.uCam, cam.pos);
    gl.uniform3fv(p.u.uSunDir, e.sunDir);
    gl.uniform3fv(p.u.uSunColor, e.sunColor);
    gl.uniform3fv(p.u.uSkyTop, e.skyTop);
    gl.uniform3fv(p.u.uSkyBot, e.skyBot);
    gl.uniform3fv(p.u.uFogColor, e.fogColor);
    gl.uniform1f(p.u.uNight, e.night);
    gl.uniform1f(p.u.uTime, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
    gl.enableVertexAttribArray(p.a.aPos);
    gl.vertexAttribPointer(p.a.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
  };

  Renderer.prototype.beginMain = function (cam, head) {
    var gl = this.gl, p = this.prog, e = this.env;
    gl.useProgram(p);
    gl.uniformMatrix4fv(p.u.uVP, false, this.vp);
    gl.uniform3fv(p.u.uSunDir, e.sunDir);
    gl.uniform3fv(p.u.uSunColor, e.sunColor);
    gl.uniform3fv(p.u.uAmb, e.ambient);
    gl.uniform3fv(p.u.uFogColor, e.fogColor);
    gl.uniform1f(p.u.uFogD, e.fogD);
    gl.uniform3fv(p.u.uCam, cam.pos);
    gl.uniform1f(p.u.uHLOn, head && head.on ? 1 : 0);
    if (head) {
      gl.uniform3fv(p.u.uHLPos1, head.p1);
      gl.uniform3fv(p.u.uHLDir1, head.d1);
      gl.uniform3fv(p.u.uHLPos2, head.p2);
      gl.uniform3fv(p.u.uHLDir2, head.d2);
    }
    gl.uniform1f(p.u.uTime, 0);
    gl.uniform1f(p.u.uGhost, 0);
    gl.uniform1f(p.u.uWet, this.spec.wet ? 1 : 0);
    gl.uniform1f(p.u.uSnow, this.spec.snowBias || 0);
    Mat4.identity(this.model);
    gl.uniformMatrix4fv(p.u.uModel, false, this.model);
  };

  Renderer.prototype.drawChunk = function (m) {
    var gl = this.gl, p = this.prog;
    this.bindMesh(p, m);
    gl.drawElements(gl.TRIANGLES, m.count, m.type, 0);
  };

  Renderer.prototype.drawModel = function (m, mat) {
    var gl = this.gl, p = this.prog;
    gl.uniformMatrix4fv(p.u.uModel, false, mat);
    this.bindMesh(p, m);
    gl.drawElements(gl.TRIANGLES, m.count, m.type, 0);
  };

  // 主渲染
  Renderer.prototype.render = function (scene) {
    var gl = this.gl, cam = scene.camera, e = this.env;
    this.resize();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.clearColor(e.fogColor[0], e.fogColor[1], e.fogColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    Mat4.perspective(this.proj, cam.fov * M.DEG, this.aspect, 0.18, 1600);
    Mat4.lookAt(this.view, cam.pos, cam.target, cam.up);
    Mat4.mul(this.vp, this.proj, this.view);
    Mat4.invert(this.invVP, this.vp);
    Mat4.frustumPlanes(this.planes, this.vp);

    this._cam = cam;
    this._head = scene.head;
    this.drawSky(cam);
    this.beginMain(cam, scene.head);

    var i, m;
    var far = e.fogD > 0.004 ? 260 : 520;
    var drawn = 0;
    for (i = 0; i < this.chunks.length; i++) {
      m = this.chunks[i];
      var dx = m.cx - cam.pos[0], dz = m.cz - cam.pos[2];
      if (dx * dx + dz * dz > far * far) continue;
      if (!Mat4.aabbInFrustum(this.planes, m.minx, m.miny, m.minz, m.maxx, m.maxy, m.maxz)) continue;
      this.drawChunk(m);
      drawn++;
    }
    this.drawnChunks = drawn;

    // 车辆
    var car = scene.car;
    var bodyM = this.carMatrix(car);
    if (!scene.cockpitOnly) {
      this.drawModel(this.carVBO, bodyM);
      var wheels = this.wheelMatrices(car, bodyM);
      for (i = 0; i < 4; i++) this.drawModel(this.wheelVBO, wheels[i]);
    } else {
      // 座舱视角：仍画车轮（可见前轮）
      var wheels2 = this.wheelMatrices(car, bodyM);
      for (i = 0; i < 4; i++) this.drawModel(this.wheelVBO, wheels2[i]);
    }

    // 座舱
    if (scene.cockpitOnly) {
      this.drawModel(this.cockpitVBO, bodyM);
      // 仪表盘
      this.drawDash(bodyM, scene.telemetry);
      // 后视镜
      if (scene.mirrorOn) this.drawMirror(bodyM, scene);
      // 方向盘与手
      this.drawWheelRim(bodyM, car, scene.steerVis);
    }

    // 粒子
    if (scene.particles && scene.particles.count > 0) this.drawParticles(scene.particles, cam);
  };

  Renderer.prototype.carMatrix = function (car) {
    var m = Mat4.create();
    var tmp = Mat4.create();
    Mat4.compose(m, car.pos, car.q, null);
    Mat4.identity(tmp);
    tmp[13] = -0.50;
    return Mat4.mul(Mat4.create(), m, tmp);
  };

  Renderer.prototype.wheelMatrices = function (car, bodyM) {
    var out = [];
    var R = car._R;
    for (var i = 0; i < 4; i++) {
      var w = car.wheels[i];
      var dmg = car.damage['susp' + w.key] || 0;
      var down = w.maxLen * (1 - 0.18 * dmg) - w.susComp;
      // 车身坐标
      var bx = w.mx, by = w.my - down, bz = w.mz;
      var wx = car.pos[0] + R[0] * bx + R[3] * by + R[6] * bz;
      var wy = car.pos[1] + R[1] * bx + R[4] * by + R[7] * bz;
      var wz = car.pos[2] + R[2] * bx + R[5] * by + R[8] * bz;
      var q = Q.create();
      var qy = Q.create(), qx = Q.create();
      // 车身姿态 × 转向 × 滚动
      Q.copy(q, car.q);
      Q.fromAxis(qy, [0, 1, 0], w.steer);
      Q.mul(q, q, qy);
      Q.fromAxis(qx, [1, 0, 0], w.spin);
      Q.mul(q, q, qx);
      var mm = Mat4.compose(Mat4.create(), [wx, wy, wz], q, null);
      out.push(mm);
    }
    return out;
  };

  Renderer.prototype.drawWheelRim = function (bodyM, car, steer) {
    // 方向盘：一个环 + 三根辐条，随转向角旋转
    var m = this.wheelRimVBO;
    if (!m) {
      var mesh = new RG.Mesh();
      var seg = 14, R = 0.16;
      for (var i = 0; i < seg; i++) {
        var a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
        var p0 = [Math.cos(a0) * R, Math.sin(a0) * R, 0];
        var p1 = [Math.cos(a1) * R, Math.sin(a1) * R, 0];
        var q0 = [Math.cos(a0) * (R - 0.03), Math.sin(a0) * (R - 0.03), 0];
        var q1 = [Math.cos(a1) * (R - 0.03), Math.sin(a1) * (R - 0.03), 0];
        mesh.quad(p0, p1, q1, q0, RG.hex(0x3a3f46), null);
        mesh.quad(q0, q1, p1, p0, RG.hex(0x4a5058), null);
      }
      mesh.box(0, 0, 0, 0.02, R - 0.02, 0.012, RG.hex(0x5a6068), null, 0);
      mesh.box(0, 0, 0, R - 0.02, 0.018, 0.012, RG.hex(0x5a6068), null, 0);
      mesh.box(0, 0, 0, 0.05, 0.05, 0.03, RG.hex(0x55595e), null, 0);
      m = this.wheelRimVBO = this.uploadMesh(mesh.toArrays());
    }
    var local = Mat4.create();
    // 位置：驾驶侧，倾斜的转向柱
    var q = Q.create();
    Q.fromEuler(q, 0, 0.50, steer * 2.6);
    Mat4.compose(local, [-0.36, 0.92, 0.44], q, null);
    var mm = Mat4.mul(Mat4.create(), bodyM, local);
    this.drawModel(m, mm);
    // 手：不随方向盘转动（握在 9 点与 3 点）
    if (!this.handsVBO) {
      var h = new RG.Mesh();
      h.box(-0.155, 0.02, 0.045, 0.048, 0.042, 0.075, RG.hex(0x8a929c), null, 0);
      h.box(0.155, 0.02, 0.045, 0.048, 0.042, 0.075, RG.hex(0x8a929c), null, 0);
      h.box(-0.10, -0.13, 0.09, 0.055, 0.10, 0.07, RG.hex(0x6b7480), null, 0.2);
      h.box(0.10, -0.13, 0.09, 0.055, 0.10, 0.07, RG.hex(0x6b7480), null, -0.2);
      this.handsVBO = this.uploadMesh(h.toArrays());
    }
    var qh = Q.create();
    Q.fromEuler(qh, 0, 0.50, 0);
    var localH = Mat4.create();
    Mat4.compose(localH, [-0.36, 0.92, 0.44], qh, null);
    this.drawModel(this.handsVBO, Mat4.mul(Mat4.create(), bodyM, localH));
  };

  Renderer.prototype.drawDash = function (bodyM, tel) {
    var gl = this.gl;
    if (tel) this.updateDashCanvas(tel);
    var local = Mat4.create();
    var q = Q.create();
    Q.fromEuler(q, 0, -0.95, 0);
    Mat4.compose(local, [-0.24, 1.06, 0.50], q, null);
    var mm = Mat4.mul(Mat4.create(), bodyM, local);
    gl.useProgram(this.texProg);
    gl.uniformMatrix4fv(this.texProg.u.uMVP, false, Mat4.mul(Mat4.create(), this.vp, mm));
    gl.uniform1i(this.texProg.u.uTex, 0);
    gl.uniform1f(this.texProg.u.uMirrorFlip, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.dashTex);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dashQuad);
    gl.enableVertexAttribArray(this.texProg.a.aPos);
    gl.vertexAttribPointer(this.texProg.a.aPos, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(this.texProg.a.aUV);
    gl.vertexAttribPointer(this.texProg.a.aUV, 2, gl.FLOAT, false, 20, 12);
    gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.enable(gl.CULL_FACE);
    this.beginMainUniformsOnly();
  };

  Renderer.prototype.beginMainUniformsOnly = function () {
    this.beginMain(this._cam, this._head);
  };

  Renderer.prototype.updateDashCanvas = function (tel) {
    this.dashTimer++;
    if (this.dashTimer % 3 !== 0) return;
    var c = this.dashCtx, W = 512, H = 256;
    c.fillStyle = '#12161a';
    c.fillRect(0, 0, W, H);
    // 转速条
    var rpm = Math.max(0, Math.min(8200, tel.rpm));
    var segs = 40, lit = Math.floor(rpm / 8200 * segs);
    for (var i = 0; i < segs; i++) {
      var x = 14 + i * 12.1;
      var on = i < lit;
      c.fillStyle = on ? (i > 32 ? '#ff3b30' : (i > 26 ? '#ffb020' : '#22d3ee')) : '#1b2024';
      c.fillRect(x, 12, 9, 26);
    }
    // 速度
    c.fillStyle = '#e8f4f8';
    c.font = 'bold 96px "DIN Alternate", "Bahnschrift", monospace';
    c.textAlign = 'right';
    c.fillText(String(Math.round(tel.speed)).padStart(3, ' '), 330, 150);
    c.font = 'bold 26px monospace';
    c.fillStyle = '#7d8a93';
    c.fillText('km/h', 330, 186);
    // 挡位
    c.fillStyle = '#22d3ee';
    c.font = 'bold 110px "DIN Alternate", monospace';
    c.textAlign = 'center';
    c.fillText(tel.gear === 0 ? 'N' : (tel.gear < 0 ? 'R' : String(tel.gear)), 420, 152);
    // 小条：增压/油门
    c.fillStyle = '#1b2024';
    c.fillRect(14, 200, 210, 16);
    c.fillStyle = '#5eead4';
    c.fillRect(14, 200, 210 * Math.min(1, tel.throttle), 16);
    c.fillStyle = '#1b2024';
    c.fillRect(14, 224, 210, 12);
    c.fillStyle = '#f97316';
    c.fillRect(14, 224, 210 * Math.min(1, tel.boost / 1.4), 12);
    c.fillStyle = '#2a3136';
    c.fillRect(360, 196, 140, 44);
    c.fillStyle = tel.stalled ? '#ff453a' : '#7d8a93';
    c.font = 'bold 20px monospace';
    c.fillText(tel.stalled ? 'STALL' : 'READY', 430, 224);
    var gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.dashTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.dashCanvas);
  };

  Renderer.prototype.drawMirror = function (bodyM, scene) {
    var gl = this.gl;
    // 渲染到 FBO
    var cam = this._mirrorCam || (this._mirrorCam = { pos: [0, 0, 0], target: [0, 0, 0], up: [0, 1, 0], fov: 42 });
    var car = scene.car, R = car._R;
    var bx = 0, by = 0.80, bz = 0.55;
    var mx = car.pos[0] + R[0] * bx + R[3] * by + R[6] * bz;
    var my = car.pos[1] + R[1] * bx + R[4] * by + R[7] * bz;
    var mz = car.pos[2] + R[2] * bx + R[5] * by + R[8] * bz;
    cam.pos = [mx, my, mz];
    cam.target = [mx - R[6] * 18, my - 2.2, mz - R[8] * 18];
    cam.up = [R[3], R[4], R[5]];

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.mirror.fbo);
    gl.viewport(0, 0, this.mirror.w, this.mirror.h);
    gl.clearColor(this.env.fogColor[0], this.env.fogColor[1], this.env.fogColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    var vp2 = Mat4.create(), pr2 = Mat4.create();
    Mat4.perspective(pr2, cam.fov * M.DEG, this.mirror.w / this.mirror.h, 0.3, 260);
    Mat4.lookAt(this.view, cam.pos, cam.target, cam.up);
    Mat4.mul(vp2, pr2, this.view);
    var planes2 = [null, null, null, null, null, null];
    Mat4.frustumPlanes(planes2, vp2);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.prog.u.uVP, false, vp2);
    gl.uniform3fv(this.prog.u.uCam, cam.pos);
    Mat4.identity(this.model);
    gl.uniformMatrix4fv(this.prog.u.uModel, false, this.model);
    for (var i = 0; i < this.chunks.length; i++) {
      var m = this.chunks[i];
      var dx = m.cx - cam.pos[0], dz = m.cz - cam.pos[2];
      if (dx * dx + dz * dz > 160 * 160) continue;
      if (!Mat4.aabbInFrustum(planes2, m.minx, m.miny, m.minz, m.maxx, m.maxy, m.maxz)) continue;
      this.drawChunk(m);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    // 画回座舱
    var local = Mat4.create();
    Mat4.compose(local, [-0.28, 1.34, 0.49], [0, 0, 0, 1], null);
    var mm = Mat4.mul(Mat4.create(), bodyM, local);
    gl.useProgram(this.texProg);
    gl.uniformMatrix4fv(this.texProg.u.uMVP, false, Mat4.mul(Mat4.create(), this.vp, mm));
    gl.uniform1i(this.texProg.u.uTex, 0);
    gl.uniform1f(this.texProg.u.uMirrorFlip, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.mirror.tex);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.mirrorQuadBuf || (this.mirrorQuadBuf = RG.GL.buffer(gl, new Float32Array([
      -0.13, -0.031, 0, 0, 0, 0.13, -0.031, 0, 1, 0,
      0.13, 0.031, 0, 1, 1, -0.13, -0.031, 0, 0, 0, 0.13, 0.031, 0, 1, 1, -0.13, 0.031, 0, 0, 1
    ]))));
    gl.enableVertexAttribArray(this.texProg.a.aPos);
    gl.vertexAttribPointer(this.texProg.a.aPos, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(this.texProg.a.aUV);
    gl.vertexAttribPointer(this.texProg.a.aUV, 2, gl.FLOAT, false, 20, 12);
    gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.enable(gl.CULL_FACE);
    this.beginMainUniformsOnly();
  };

  Renderer.prototype.drawParticles = function (parts, cam) {
    var gl = this.gl, p = this.partProg;
    var n = Math.min(parts.count, this.partCap);
    var arr = this.partData;
    for (var i = 0; i < n; i++) {
      arr[i * 8] = parts.pos[i * 3];
      arr[i * 8 + 1] = parts.pos[i * 3 + 1];
      arr[i * 8 + 2] = parts.pos[i * 3 + 2];
      arr[i * 8 + 3] = parts.col[i * 4];
      arr[i * 8 + 4] = parts.col[i * 4 + 1];
      arr[i * 8 + 5] = parts.col[i * 4 + 2];
      arr[i * 8 + 6] = parts.col[i * 4 + 3];
      arr[i * 8 + 7] = parts.size[i];
    }
    gl.useProgram(p);
    gl.uniformMatrix4fv(p.u.uVP, false, this.vp);
    gl.uniform3fv(p.u.uCam, cam.pos);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.partPos);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, arr.subarray(0, n * 8));
    var stride = 32;
    gl.enableVertexAttribArray(p.a.aPos);
    gl.vertexAttribPointer(p.a.aPos, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(p.a.aCol);
    gl.vertexAttribPointer(p.a.aCol, 4, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(p.a.aSize);
    gl.vertexAttribPointer(p.a.aSize, 1, gl.FLOAT, false, stride, 28);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.drawArrays(gl.POINTS, 0, n);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  };
})(typeof window !== 'undefined' ? window : globalThis);
