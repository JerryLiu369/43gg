/* game.js — 会话、固定步长循环、镜头、领航员、计时、幽灵、损伤 */
(function (root) {
  'use strict';
  var RG = root.RG = root.RG || {};
  var M = RG.M, Q = M.Q, Mat4 = M.Mat4, V = M.V;

  var FIXED = 1 / 240;

  function Game(opts) {
    this.canvas = opts.canvas;
    this.renderer = new RG.Renderer(opts.canvas);
    this.audio = new RG.Audio();
    this.input = new RG.Input(opts.canvas);
    this.hud = new RG.Hud();
    this.particles = new RG.Particles(700);
    this.ui = opts.ui;
    this.state = 'menu';
    this.acc = 0;
    this.lastT = 0;
    this.camMode = 0;             // 0 座舱 1 车头 2 追尾
    this.settings = {
      leadTime: 2.4,              // 路书提前量（秒）
      voice: true,
      noteStrip: true,
      mirror: true,
      volume: 0.85,
      showGhost: true
    };
    this.cam = { pos: [0, 0, 0], target: [0, 0, 0], up: [0, 1, 0], fov: 62 };
    this.head = { on: false, p1: [0, 0, 0], d1: [0, 0, 1], p2: [0, 0, 0], d2: [0, 0, 1] };
    this.camLag = { off: 0, offV: 0, roll: 0, pitch: 0, rv: 0, pv: 0 };
    this.chasePos = [0, 0, 0];
    this.tuning = Object.assign({}, RG.DEFAULT_TUNING);
    this.loadSave();
    this.bindGlobal();
    // ?auto=1 演示/截图模式：跳过倒计时并自动沿中心线驾驶
    try { this.autoDemo = /[?&]auto=1/.test(location.search); } catch (e) { this.autoDemo = false; }
  }
  RG.Game = Game;

  /* ---------------- 存档 ---------------- */
  Game.prototype.loadSave = function () {
    var raw = null;
    try { raw = localStorage.getItem('rally_time_v1'); } catch (e) { }
    this.save = raw ? JSON.parse(raw) : { best: {}, ghost: {}, tuning: {}, wear: {}, rally: null };
    if (!this.save.best) this.save.best = {};
    if (!this.save.ghost) this.save.ghost = {};
    if (!this.save.tuning) this.save.tuning = {};
    if (!this.save.wear) this.save.wear = {};
  };
  Game.prototype.persist = function () {
    try { localStorage.setItem('rally_time_v1', JSON.stringify(this.save)); } catch (e) { }
  };

  /* ---------------- 赛段加载 ---------------- */
  Game.prototype.loadStage = function (stageId, opts) {
    opts = opts || {};
    var spec = RG.stageById(stageId);
    this.spec = spec;
    this.tuning = Object.assign({}, RG.DEFAULT_TUNING, this.save.tuning[stageId] || {}, opts.tuning || {});
    var self = this;
    this.hud.setLoading(true, spec.name);
    setTimeout(function () {
      var t0 = performance.now();
      var track = new RG.Track(spec);
      track.importState(self.save.wear[stageId]);
      self.track = track;
      self.damage = opts.damage || RG.DEFAULT_DAMAGE();
      self.car = new RG.Car(track, self.tuning, self.damage);
      self.car.reset(6, 0);
      self.renderer.setStage(track, spec);
      self.particles.clear();
      self.time = 0; self.splitTimes = [null, null]; self.finished = false;
      self.mistakes = [];
      self.offTrackTime = 0; self.offTrackMark = false; self.penalty = 0;
      self.lastSplit = 0; self.splitIdx = 0;
      self.notes = track.notes.map(function (n) { return { n: n, spoken: false }; });
      self.noteIdx = 0;
      self.ghostRec = [];
      self.ghostRecT = 0;
      self.ghost = self.save.ghost[stageId] || null;
      self.ghostIdx = 0;
      self.stallTimer = 0;
      self.recoverTimer = 0;
      self.startCountdown = self.autoDemo ? 0.05 : 3.2;
      self.state = 'countdown';
      self.camReady = false;
      self.acc = 0;
      self.lastT = 0;
      self.loadMs = performance.now() - t0;
      self.hud.setLoading(false);
      self.hud.setStageInfo(spec);
      if (self.ui) self.ui.hideLoading();
      self.audio.stopSpeech();
    }, 30);
  };

  /* ---------------- 输入与全局事件 ---------------- */
  Game.prototype.bindGlobal = function () {
    var self = this;
    window.addEventListener('resize', function () { self.renderer.resize(); });
  };

  Game.prototype.handleEvents = function (inp) {
    var ev = inp.events || [];
    for (var i = 0; i < ev.length; i++) {
      if (ev[i] === 'camera') { this.camMode = (this.camMode + 1) % 3; this.hud.flash('视角: ' + ['座舱', '车头', '追尾'][this.camMode]); }
      if (ev[i] === 'pause' && (this.state === 'running' || this.state === 'countdown')) this.pause();
      if (ev[i] === 'restart') this.restart();
    }
  };

  Game.prototype.pause = function () {
    if (this.state === 'paused') { this.state = 'running'; this.ui.showPause(false); return; }
    if (this.state !== 'running' && this.state !== 'countdown') return;
    this.state = 'paused';
    this.ui.showPause(true);
  };

  Game.prototype.restart = function () {
    if (!this.spec) return;
    this.loadStage(this.spec.id, { damage: RG.DEFAULT_DAMAGE() });
    this.ui.showPause(false);
  };

  Game.prototype.startRun = function (stageId, opts) {
    this.audio.start();
    this.loadStage(stageId, opts || {});
  };

  /* ---------------- 主循环 ---------------- */
  Game.prototype.frame = function (now) {
    if (!this.lastT) this.lastT = now;
    var dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    this.fpsEst = this.fpsEst ? (this.fpsEst * 0.92 + (1 / Math.max(0.001, dt)) * 0.08) : 60;
    this.frameCount = (this.frameCount || 0) + 1;
    if (this.state === 'paused' || this.state === 'menu' || this.state === 'loading') {
      if (this.track) this.render(dt, 0);
      return;
    }
    if (this.state === 'countdown') {
      this.startCountdown -= dt;
      var cn = Math.ceil(this.startCountdown);
      if (cn !== this._lastCount && cn > 0) {
        this._lastCount = cn;
        this.hud.flash(String(cn));
        this.audio.shift();
      }
      if (this.startCountdown <= 0) {
        this.state = 'running';
        this.hud.flash('GO');
      }
      this.updateInputOnly(dt);
      this.render(dt, 0);
      return;
    }
    if (this.state === 'finished') {
      this.car.events.length = 0;
      this.render(dt, 0);
      return;
    }

    var inp = this.autoDemo ? this.demoInput(dt) : this.input.update(dt, this.car.speed, true);
    this.handleEvents(inp);
    if (this.state !== 'running') return;

    // 固定步长物理
    this.acc += dt;
    var steps = 0;
    var physIn = {
      throttle: inp.throttle, brake: inp.brake, steer: inp.steer,
      handbrake: inp.handbrake, clutch: inp.clutch,
      shiftUp: !!inp.shiftUp, shiftDown: !!inp.shiftDown, starter: inp.starter
    };
    while (this.acc >= FIXED && steps < 12) {
      this.physicsStep(FIXED, physIn);
      this.acc -= FIXED;
      steps++;
    }
    if (steps >= 12) this.acc = 0;

    this.updateParticles(dt);
    var alpha = this.acc / FIXED;
    this.render(dt, alpha);
    this.updateAudio(dt, inp);
  };

  // 简易纯追踪自动驾驶（仅 ?auto=1 时启用，用于演示与截图）
  Game.prototype.demoInput = function (dt) {
    var car = this.car, track = this.track;
    var v = car.speed;
    var Ld = 6 + v * 0.42;
    var at = track.at(car.distance + Ld);
    var fwd = [car._R[6], car._R[8]], right = [car._R[0], car._R[2]];
    var tx = at.x - car.pos[0], tz = at.z - car.pos[2];
    var fx = tx * fwd[0] + tz * fwd[1], fy = tx * right[0] + tz * right[1];
    var alpha = Math.atan2(fy, Math.max(1, fx));
    var steer = M.clamp(-alpha * 2.2, -1, 1);
    // 目标速度：看前方 110m 的曲率
    var vt = 44;
    for (var d = 10; d <= 110; d += 10) {
      var nd = track.at(car.distance + d).node;
      var R = Math.abs(nd.curv) > 1e-4 ? 1 / Math.abs(nd.curv) : 999;
      var vc = Math.sqrt(0.72 * 9.81 * Math.max(10, R)) * 0.88;
      vt = Math.min(vt, Math.sqrt(Math.max(1, vc * vc + 2 * 5.2 * d)));
    }
    var throttle = v < vt ? Math.min(0.85, 0.28 + (vt - v) * 0.22) : 0;
    var brake = v > vt + 1.5 ? Math.min(0.9, (v - vt) * 0.35) : 0;
    if (car.engine.rpm > 6500) car.requestShift(1);
    else if (car.engine.rpm < 2900 && car.gear > 1) car.requestShift(-1);
    // 卡住/翻车自救
    if (v < 1.2 && this.state === 'running') {
      this._demoStuck = (this._demoStuck || 0) + dt;
      if (this._demoStuck > 2.5) { this._demoStuck = 0; car.reset(Math.max(10, car.distance - 4), 0); }
    } else this._demoStuck = 0;
    return {
      throttle: throttle, brake: brake, steer: steer, handbrake: 0,
      clutch: car.engine.rpm < 1200 && v < 6 ? 0.8 : 0,
      shiftUp: false, shiftDown: false, starter: !car.engine.running, events: []
    };
  };

  Game.prototype.updateInputOnly = function (dt) {
    this.input.update(dt, 0, false);
  };

  Game.prototype.physicsStep = function (dt, inp) {
    var car = this.car;
    car.step(dt, inp);
    if (this.state === 'running') this.time += dt;

    // 事件
    var evs = car.events;
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (e === 'shift') this.audio.shift();
      else if (e === 'gearDrop') { this.audio.gearDrop(); this.hud.flash('变速箱脱挡!'); this.addMistake('脱挡'); }
      else if (e === 'stall') { this.audio.pop(); this.hud.flash('熄火'); this.addMistake('熄火'); }
      else if (e === 'crank') this.audio.starter();
      else if (e === 'scrape') { this.audio.scrape(); this.emitScrape(); }
      else if (e && e.type === 'impact') {
        this.audio.impact(e.speed, this.spec.snowBias > 0.5 ? 'snow' : 'gravel');
        this.hud.flash('碰撞 -' + (e.speed * 3.6).toFixed(0) + 'km/h');
        this.addMistake(e.tag === 'tree' ? '撞树' : (e.tag === 'rail' ? '撞护栏' : '撞击'));
        this.emitImpact(e.speed);
      } else if (e && e.type === 'damage') {
        this.hud.flash('损伤: ' + RG.PART_NAME[e.part]);
      }
    }
    car.events.length = 0;

    // 出界检测
    var g = car.wheels[2].ground;
    var outside = g && (g.lat !== undefined) && Math.abs(g.lat) > ((g.w || 3) + 0.35);
    if (outside) {
      this.offTrackTime += dt;
      if (this.offTrackTime > 0.6 && !this.offTrackMark) {
        this.offTrackMark = true;
        this.addMistake('冲出赛道');
        this.emitDust(true);
      }
    } else {
      if (this.offTrackMark && this.offTrackTime > 1.2) this.penalty += 2.0;
      this.offTrackTime = 0;
      this.offTrackMark = false;
    }
    // 打转检测
    if (Math.abs(car.w[1]) > 1.5 && car.speed > 4) this.spinTimer = (this.spinTimer || 0) + dt;
    else this.spinTimer = Math.max(0, (this.spinTimer || 0) - dt * 2);
    if (this.spinTimer > 0.7) { this.spinTimer = 0; this.addMistake('打转'); }

    // 分段
    if (this.splitIdx < 2 && car.distance >= this.track.splits[this.splitIdx]) {
      this.splitTimes[this.splitIdx] = this.time;
      var bestSplit = this.save.best[this.spec.id] && this.save.best[this.spec.id].splits;
      var delta = bestSplit && bestSplit[this.splitIdx] != null ? this.time - bestSplit[this.splitIdx] : null;
      this.hud.showSplit(this.splitIdx, this.time, delta);
      this.audio.speak(this.splitIdx === 0 ? '第一分段' : '第二分段');
      this.splitIdx++;
    }

    // 终点
    if (!this.finished && car.distance >= this.track.length - 12) this.finish();

    // 幽灵记录
    this.ghostRecT += dt;
    if (this.ghostRecT >= 0.1) {
      this.ghostRecT = 0;
      if (this.ghostRec.length < 9000) {
        this.ghostRec.push([+this.time.toFixed(2), +car.pos[0].toFixed(2), +car.pos[1].toFixed(2), +car.pos[2].toFixed(2), +Math.atan2(car._R[6], car._R[8]).toFixed(3)]);
      }
    }

    // 领航员
    this.updatePacenotes();

    // 卡住保护
    if (car.speed < 0.4 && this.state === 'running') {
      this.stallTimer += dt;
      if (this.stallTimer > 9) { this.stallTimer = 0; this.hud.flash('按 R 复位'); }
    } else this.stallTimer = 0;
  };

  Game.prototype.addMistake = function (tag) {
    if (this.mistakes.length > 40) return;
    var last = this.mistakes[this.mistakes.length - 1];
    if (last && last.tag === tag && Math.abs(last.s - this.car.distance) < 12) return;
    this.mistakes.push({ tag: tag, s: this.car.distance, t: this.time });
    this.hud.addMistake(tag);
  };

  /* ---------------- 领航员 ---------------- */
  Game.prototype.updatePacenotes = function () {
    var car = this.car, lead = this.settings.leadTime;
    var lookahead = 14 + Math.max(0, car.speed) * lead;
    // 每次只播报最近的一条，并用最小间隔自然排开，避免一口气念完
    for (var i = 0; i < this.notes.length; i++) {
      var item = this.notes[i];
      if (item.spoken) continue;
      var d = item.n.s - car.distance;
      if (d < lookahead) {
        if (this.time - (this._lastNoteT === undefined ? -99 : this._lastNoteT) < 0.55) break;
        item.spoken = true;
        this._lastNoteT = this.time;
        if (this.settings.voice) this.audio.speak(item.n.text + (item.n.sub ? item.n.sub : ''));
        this.hud.pushNote(item.n, car.distance);
      }
      break;
    }
    this.hud.setNextNote(this.nextNote(car.distance));
  };
  Game.prototype.nextNote = function (s) {
    for (var i = 0; i < this.notes.length; i++) {
      if (!this.notes[i].spoken || this.notes[i].n.s > s - 5) return this.notes[i].n;
    }
    return null;
  };
  Game.prototype.notesAhead = function (s, n) {
    var out = [];
    for (var i = 0; i < this.notes.length; i++) {
      if (this.notes[i].n.s >= s - 8) out.push(this.notes[i].n);
      if (out.length >= n) break;
    }
    return out;
  };

  /* ---------------- 粒子 ---------------- */
  Game.prototype.updateParticles = function (dt) {
    var car = this.car, P = this.particles;
    var pf = Math.min(2.2, dt * 60);
    var g = car.wheels[2].ground;
    var snowy = this.spec.snowBias > 0.5;
    var onRoad = g && g.onRoad;
    // 轮下扬尘
    for (var i = 0; i < 4; i++) {
      var w = car.wheels[i];
      if (!w.contact) continue;
      var spin = Math.abs(w.slipRatio);
      var latSlip = Math.abs(w.slipAngle);
      var inten = Math.min(1, (spin - 0.12) * 2.2 + (latSlip - 0.10) * 2.0);
      if (inten <= 0.02) continue;
      if (Math.random() > inten * 0.75 * pf) continue;
      var cw = w.contactW;
      var vx = car.vel[0] * 0.25, vz = car.vel[2] * 0.25;
      var puddle = w.ground && w.ground.puddle > 0.3;
      if (puddle) P.water(cw[0], cw[1] + 0.05, cw[2], vx, vz);
      else if (snowy || (w.ground && w.ground.snow > 0.5)) P.dust(cw[0], cw[1] + 0.05, cw[2], vx, vz, inten, true);
      else P.dust(cw[0], cw[1] + 0.05, cw[2], vx, vz, inten, false);
      if (!onRoad && Math.random() < inten * 0.5 * pf) P.gravel(cw[0], cw[1] + 0.05, cw[2], vx * 2, vz * 2);
    }
    // 排气管回火/损伤冒烟
    if (car.damage.engine > 0.45 && Math.random() < 0.08 * pf) {
      var R = car._R;
      P.smoke(car.pos[0] - R[6] * 2.1, car.pos[1] - 0.2, car.pos[2] - R[8] * 2.1, true);
    }
    P.update(dt);
  };
  Game.prototype.emitScrape = function () {
    var car = this.car, w = car.wheels;
    for (var i = 0; i < 3; i++) this.particles.spark(car.pos[0] + (Math.random() - 0.5), car.pos[1] - 0.4, car.pos[2] + (Math.random() - 0.5));
  };
  Game.prototype.emitImpact = function (speed) {
    var car = this.car, n = Math.min(14, 3 + speed | 0);
    for (var i = 0; i < n; i++) {
      this.particles.emit(car.pos[0] + (Math.random() - 0.5) * 1.4, car.pos[1] + (Math.random() - 0.3) * 0.8, car.pos[2] + (Math.random() - 0.5) * 1.4,
        (Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6,
        0.55, 0.5, 0.42, 0.8, 0.12, 0.5, -7, 0.9);
    }
  };
  Game.prototype.emitDust = function (big) {
    var car = this.car;
    for (var i = 0; i < (big ? 10 : 4); i++) {
      this.particles.dust(car.pos[0] + (Math.random() - 0.5) * 2, car.pos[1] - 0.4, car.pos[2] + (Math.random() - 0.5) * 2,
        car.vel[0] * 0.3, car.vel[2] * 0.3, 1, this.spec.snowBias > 0.5);
    }
  };

  /* ---------------- 完成 ---------------- */
  Game.prototype.finish = function () {
    this.finished = true;
    this.state = 'finished';
    var total = this.time + this.penalty;
    var key = this.spec.id;
    var prev = this.save.best[key];
    var isBest = !prev || total < prev.time;
    var res = {
      stage: this.spec,
      time: total,
      raw: this.time,
      penalty: this.penalty,
      splits: this.splitTimes.slice(),
      mistakes: this.mistakes.slice(),
      isBest: isBest,
      prevBest: prev ? prev.time : null,
      damage: this.damage
    };
    if (isBest) {
      this.save.best[key] = { time: total, splits: this.splitTimes.slice(), date: Date.now() };
      // 只保存最优幽灵（压缩）
      this.save.ghost[key] = this.compressGhost(this.ghostRec);
      this.persist();
    }
    // 保存磨损状态
    this.save.wear[key] = this.track.exportState();
    this.persist();
    this.audio.stopSpeech();
    this.audio.speak('到达终点');
    this.ui.showResult(res);
  };

  Game.prototype.compressGhost = function (rec) {
    // 转成通道数组，减小体积
    var out = { t: [], x: [], y: [], z: [], h: [] };
    for (var i = 0; i < rec.length; i++) {
      out.t.push(rec[i][0]); out.x.push(rec[i][1]); out.y.push(rec[i][2]); out.z.push(rec[i][3]); out.h.push(rec[i][4]);
    }
    return out;
  };
  Game.prototype.ghostAt = function (t) {
    var g = this.ghost;
    if (!g || !g.t || !g.t.length) return null;
    if (this.ghostIdx >= g.t.length) this.ghostIdx = 0;
    var i = this.ghostIdx;
    while (i < g.t.length - 1 && g.t[i + 1] < t) i++;
    while (i > 0 && g.t[i] > t) i--;
    this.ghostIdx = i;
    if (i >= g.t.length - 1) return { x: g.x[i], y: g.y[i], z: g.z[i], h: g.h[i] };
    var t0 = g.t[i], t1 = g.t[i + 1];
    var a = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
    return {
      x: M.lerp(g.x[i], g.x[i + 1], a), y: M.lerp(g.y[i], g.y[i + 1], a),
      z: M.lerp(g.z[i], g.z[i + 1], a), h: M.lerp(g.h[i], g.h[i + 1], a)
    };
  };

  /* ---------------- 渲染 ---------------- */
  Game.prototype.render = function (dt, alpha) {
    if (!this.track || !this.car) return;
    var car = this.car;
    // 插值车辆状态
    var rc = this.renderCar || (this.renderCar = { pos: [0, 0, 0], q: [0, 0, 0, 1], wheels: car.wheels, damage: car.damage, _R: new Float32Array(9) });
    rc.wheels = car.wheels; rc.damage = car.damage;
    if (alpha > 0 && this.state === 'running') {
      V.lerp(rc.pos, car.prevPos, car.pos, alpha);
      Q.slerp(rc.q, car.prevQ, car.q, alpha);
    } else {
      V.copy(rc.pos, car.pos);
      Q.copy(rc.q, car.q);
    }
    Q.toBasis(rc._R, rc.q);

    this.updateCamera(dt, rc);
    this.updateHeadlights(rc);
    var scene = {
      camera: this.cam,
      car: rc,
      head: this.head,
      cockpitOnly: this.camMode === 0,
      mirrorOn: this.settings.mirror && this.camMode === 0,
      particles: this.particles,
      telemetry: this.car.telemetry(),
      steerVis: this.input.steer
    };
    this.renderer.render(scene);
    if (this.settings.showGhost && this.ghost && this.state === 'running') this.drawGhostMarker(rc);
    this.hud.update(this);
  };

  Game.prototype.drawGhostMarker = function (rc) {
    var gp = this.ghostAt(this.time);
    if (!gp) return;
    var gl = this.renderer.gl;
    var q = Q.fromEuler(Q.create(), gp.h, 0, 0);
    var m = Mat4.compose(Mat4.create(), [gp.x, gp.y - 0.5, gp.z], q, null);
    var p = this.renderer.prog;
    gl.useProgram(p);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1f(p.u.uGhost, 1);
    this.renderer.drawModel(this.renderer.carVBO, m);
    gl.uniform1f(p.u.uGhost, 0);
    gl.disable(gl.BLEND);
  };

  Game.prototype.updateHeadlights = function (rc) {
    var R = rc._R, on = this.renderer.env.headlights || (this.spec && (this.spec.time === 'night' || this.spec.weather === 'fog'));
    var dmg = this.damage ? this.damage.lights : 0;
    this.head.on = on && dmg < 0.85;
    var up = [R[3], R[4], R[5]], fwd = [R[6], R[7], R[8]], right = [R[0], R[1], R[2]];
    for (var i = 0; i < 2; i++) {
      var s = i === 0 ? -0.55 : 0.55;
      var px = rc.pos[0] + right[0] * s + fwd[0] * 2.0 + up[0] * 0.15;
      var py = rc.pos[1] + right[1] * s + fwd[1] * 2.0 + up[1] * 0.15;
      var pz = rc.pos[2] + right[2] * s + fwd[2] * 2.0 + up[2] * 0.15;
      if (i === 0) { this.head.p1 = [px, py, pz]; this.head.d1 = [fwd[0] * 0.96 - up[0] * 0.22, fwd[1] * 0.96 - up[1] * 0.22, fwd[2] * 0.96 - up[2] * 0.22]; }
      else { this.head.p2 = [px, py, pz]; this.head.d2 = [fwd[0] * 0.96 - up[0] * 0.22, fwd[1] * 0.96 - up[1] * 0.22, fwd[2] * 0.96 - up[2] * 0.22]; }
    }
  };

  Game.prototype.updateCamera = function (dt, rc) {
    var R = rc._R, cam = this.cam;
    var up = [R[3], R[4], R[5]], fwd = [R[6], R[7], R[8]], right = [R[0], R[1], R[2]];
    var acc = this.car._acc;
    var aLat = acc[0] * right[0] + acc[2] * right[2];
    var aLong = acc[0] * fwd[0] + acc[2] * fwd[2];

    if (this.camMode === 0) {
      // 座舱：眼位 + 头颈惯性 + 路面震动
      var lag = this.camLag;
      var tgtP = -aLat * 0.0016, tgtR = -aLat * 0.010;
      lag.pv = M.damp(lag.pv, tgtP, 9, dt);
      lag.off += lag.pv * dt;
      lag.off = M.clamp(lag.off, -0.05, 0.05);
      lag.rv = M.damp(lag.rv, tgtR, 8, dt);
      lag.roll += lag.rv * dt;
      lag.roll = M.clamp(lag.roll, -0.05, 0.05);
      lag.pitch = M.damp(lag.pitch, -aLong * 0.004, 10, dt);
      var vib = (this.car.engine.rpm / 7000) * 0.0016 + Math.min(0.004, this.car.speed * 0.00008);
      var eye = [-0.36 + lag.off * right[0], 1.19 + Math.sin(performance.now() * 0.05) * vib, -0.05];
      var ex = rc.pos[0] + R[0] * eye[0] + R[3] * (eye[1] - 0.5) + R[6] * eye[2];
      var ey = rc.pos[1] + R[1] * eye[0] + R[4] * (eye[1] - 0.5) + R[7] * eye[2];
      var ez = rc.pos[2] + R[2] * eye[0] + R[5] * (eye[1] - 0.5) + R[8] * eye[2];
      cam.pos[0] = ex; cam.pos[1] = ey; cam.pos[2] = ez;
      // 视线：前视 + 头转（转向时看向弯心）
      var lookYaw = -this.input.steer * 0.10;
      var tx = ex + (fwd[0] * Math.cos(lookYaw) + right[0] * Math.sin(lookYaw)) * 20;
      var ty = ey + fwd[1] * 20 + lag.pitch * 20;
      var tz = ez + (fwd[2] * Math.cos(lookYaw) + right[2] * Math.sin(lookYaw)) * 20;
      cam.target[0] = tx; cam.target[1] = ty; cam.target[2] = tz;
      // 头部滚转
      var roll = lag.roll;
      cam.up[0] = up[0] + right[0] * roll * 1.1;
      cam.up[1] = up[1] + right[1] * roll * 1.1;
      cam.up[2] = up[2] + right[2] * roll * 1.1;
      var l = Math.hypot(cam.up[0], cam.up[1], cam.up[2]) || 1;
      cam.up[0] /= l; cam.up[1] /= l; cam.up[2] /= l;
      cam.fov = 62 + Math.min(7, this.car.speed * 0.22);
    } else if (this.camMode === 1) {
      var hx = rc.pos[0] + fwd[0] * 1.92 + up[0] * 0.56;
      var hy = rc.pos[1] + fwd[1] * 1.92 + up[1] * 0.56;
      var hz = rc.pos[2] + fwd[2] * 1.92 + up[2] * 0.56;
      cam.pos[0] = M.damp(cam.pos[0], hx, 30, dt);
      cam.pos[1] = M.damp(cam.pos[1], hy, 30, dt);
      cam.pos[2] = M.damp(cam.pos[2], hz, 30, dt);
      cam.target[0] = cam.pos[0] + fwd[0] * 20;
      cam.target[1] = cam.pos[1] + fwd[1] * 20 + 0.6;
      cam.target[2] = cam.pos[2] + fwd[2] * 20;
      cam.up = [up[0], up[1], up[2]];
      cam.fov = 66 + Math.min(8, this.car.speed * 0.26);
    } else {
      // 追尾：弹簧跟随 + 速度前视
      var behind = 6.2 + Math.min(2.4, this.car.speed * 0.06);
      var height = 2.1;
      var desired = [
        rc.pos[0] - fwd[0] * behind + up[0] * height,
        rc.pos[1] - fwd[1] * behind + up[1] * height,
        rc.pos[2] - fwd[2] * behind + up[2] * height
      ];
      if (!this.camReady) { V.copy(this.chasePos, desired); this.camReady = true; }
      for (var k = 0; k < 3; k++) this.chasePos[k] = M.damp(this.chasePos[k], desired[k], 4.2, dt);
      cam.pos[0] = this.chasePos[0]; cam.pos[1] = this.chasePos[1]; cam.pos[2] = this.chasePos[2];
      cam.target[0] = rc.pos[0] + fwd[0] * 8;
      cam.target[1] = rc.pos[1] + fwd[1] * 8 + 0.7;
      cam.target[2] = rc.pos[2] + fwd[2] * 8;
      cam.up = [0, 1, 0];
      cam.fov = 64 + Math.min(10, this.car.speed * 0.3);
    }
  };

  /* ---------------- 音频 ---------------- */
  Game.prototype.updateAudio = function (dt, inp) {
    var car = this.car, e = car.engine, A = this.audio;
    if (!A.ready) return;
    A.setEngine(e.rpm, inp.throttle, e.load, e.boost, e.running);
    var slip = Math.max(car.wheels[0].sat, car.wheels[2].sat, Math.abs(car.wheels[2].slipRatio) * 2);
    var hard = this.spec.tarmacBias > 0.5;
    A.setTire(slip, hard);
    var rough = this.spec.snowBias > 0.5 ? 0.5 : (1 - this.spec.tarmacBias);
    A.setRoad(car.speed, rough, this.spec.snowBias > 0.5);
    // 回火
    if (inp.throttle < 0.08 && e.rpm > 3400 && Math.random() < dt * 9 * (1 - this.spec.tarmacBias * 0.5)) A.pop(Math.random() < 0.3);
    if (this._lastBoost > 0.6 && e.boost < 0.2) A.wastegate();
    this._lastBoost = e.boost;
  };

  /* ---------------- 维修 ---------------- */
  Game.prototype.repairCost = function (part, dmg) {
    var base = { engine: 95, gearbox: 80, steering: 45, susp: 38, tire: 22, lights: 12, body: 18 };
    var k = part.replace(/FL|FR|RL|RR/, '');
    return Math.ceil((base[k] || 20) * Math.max(0.15, dmg));
  };
  Game.prototype.applyRepair = function (list, budget) {
    var cost = 0;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var d = this.damage[p];
      if (d > 0.001) { cost += this.repairCost(p, d); this.damage[p] = 0; }
    }
    return cost;
  };
})(typeof window !== 'undefined' ? window : globalThis);
