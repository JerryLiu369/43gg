/* vehicle.js — 车辆动力学
   6DOF 刚体 + 四轮射线悬挂 + 连续轮胎曲线 + 手动变速箱/离合/涡轮 + 分区损伤。
   固定步长由外部驱动，本文件不做任何帧率相关逻辑。 */
(function (root) {
  'use strict';
  var RG = root.RG = root.RG || {};
  var M = RG.M, Q = M.Q;

  var G = 9.81;

  RG.DEFAULT_TUNING = {
    drivetrainBias: 0.42,     // 中央差速前轴扭矩比例 0=后驱 1=前驱
    centerCoupling: 0.35,     // 中央差速黏性耦合 0..1
    gears: [3.20, 2.24, 1.68, 1.32, 1.08, 0.88],
    final: 4.30,
    springF: 32000, springR: 26000,
    damperFB: 2500, damperFR: 3400,
    damperRB: 2200, damperRR: 3000,
    arbF: 14000, arbR: 6500,
    rideF: 0, rideR: 0,          // 车身高度偏移 m
    travelF: 0.245, travelR: 0.255,
    lsdFront: 5, lsdRear: 11,
    brakeBias: 0.64,
    brakeMax: 5600,
    tirePressure: 2.2,          // bar
    tireType: 'gravel',         // gravel | tarmac | snow
    camberF: -1.2, camberR: -1.0,
    toeF: 0.10, toeR: 0.22,     // 度，内八为正
    steeringLock: 33,           // 度
    steerSpeed: 1.0             // 转向速率倍率
  };

  // 轮胎类型对各路面的抓地倍率
  var TIRE_TYPE_MU = {
    gravel: { gravel: 1.00, tarmac: 0.86, snow: 0.72, grass: 0.95, rock: 0.95 },
    tarmac: { gravel: 0.83, tarmac: 1.06, snow: 0.52, grass: 0.80, rock: 0.85 },
    snow: { gravel: 0.88, tarmac: 0.80, snow: 1.42, grass: 0.85, rock: 0.85 }
  };

  RG.DEFAULT_DAMAGE = function () {
    return {
      engine: 0, gearbox: 0, steering: 0,
      suspFL: 0, suspFR: 0, suspRL: 0, suspRR: 0,
      tireFL: 0, tireFR: 0, tireRL: 0, tireRR: 0,
      lights: 0, body: 0
    };
  };

  function Car(track, tuning, damage) {
    this.track = track;
    this.tuning = Object.assign({}, RG.DEFAULT_TUNING, tuning || {});
    this.damage = damage || RG.DEFAULT_DAMAGE();
    this.mass = 1230;
    this.inertia = [1820, 1950, 520]; // X 俯仰, Y 偏航, Z 侧倾 (车身坐标)
    this.cgH = 0.50;

    this.pos = [0, 0, 0];
    this.vel = [0, 0, 0];
    this.q = [0, 0, 0, 1];
    this.w = [0, 0, 0];
    this.prevPos = [0, 0, 0];
    this.prevQ = [0, 0, 0, 1];

    this.gear = 1;
    this.pendingGear = 1;
    this.shiftTimer = 0;
    this.shiftCut = false;
    this.gearDropTimer = 0;

    this.engine = { omega: 0, boost: 0, running: true, crank: 0, rpm: 0, torque: 0, clutchT: 0, load: 0, boostBar: 0 };
    this.clutchEngage = 1;
    this.autoClutchTimer = 0;

    var g = this.tuning;
    this.wheels = [];
    var defs = [
      { mx: -0.86, mz: 1.22, front: true, left: true, key: 'FL' },
      { mx: 0.86, mz: 1.22, front: true, left: false, key: 'FR' },
      { mx: -0.87, mz: -1.32, front: false, left: true, key: 'RL' },
      { mx: 0.87, mz: -1.32, front: false, left: false, key: 'RR' }
    ];
    for (var i = 0; i < 4; i++) {
      var d = defs[i];
      this.wheels.push({
        key: d.key, mx: d.mx, mz: d.mz, my: 0.02, front: d.front, left: d.left,
        R: 0.335, I: 1.8,
        maxLen: 0.30, travel: d.front ? g.travelF : g.travelR,
        k: d.front ? g.springF : g.springR,
        dampB: d.front ? g.damperFB : g.damperRB,
        dampR: d.front ? g.damperFR : g.damperRR,
        arb: d.front ? g.arbF : g.arbR,
        susComp: 0.11, susVel: 0, load: 0, contact: true,
        steer: 0, omega: 0, spin: 0, fx: 0, fy: 0,
        slipRatio: 0, slipAngle: 0, sat: 0, surfK: 0,
        driveT: 0, brakeT: 0, lock: 0,
        mountW: [0, 0, 0], contactW: [0, 0, 0], ground: {},
        hint: { i: 0 }, contactN: [0, 1, 0]
      });
    }
    this._R = new Float32Array(9);
    this._acc = [0, 0, 0];           // 用于镜头/仪表的车身加速度（世界坐标）
    this._prevVel = [0, 0, 0];
    this.events = [];                // 本帧事件：碰撞、触地
    this.speed = 0;
    this.slipAngleBody = 0;
    this.muFront = 0; this.muRear = 0;
    this.wheelSpinAll = 0;
    this.stalled = false;
    this.airborne = 0;
    this.odometer = 0;
    this.dirtOnTires = 0;
    this.recoverTimer = 0;
    this.distance = 0;
  }
  RG.Car = Car;

  Car.prototype.reset = function (s, lat) {
    var at = this.track.at(s || 0);
    var hintIdx = Math.floor((s || 0) / this.track.step);
    for (var hh = 0; hh < 4; hh++) this.wheels[hh].hint.i = hintIdx;
    if (!this._proj) this._proj = { i: hintIdx }; else this._proj.i = hintIdx;
    var y = this.track.heightAt(at.x, at.z, this.wheels[0].hint) + 0.55;
    this.pos[0] = at.x + at.dz * 0; this.pos[1] = y; this.pos[2] = at.z;
    var yaw = Math.atan2(at.dx, at.dz);
    Q.fromEuler(this.q, yaw, 0, 0);
    this.vel[0] = 0; this.vel[1] = 0; this.vel[2] = 0;
    this.w[0] = 0; this.w[1] = 0; this.w[2] = 0;
    this.prevPos[0] = this.pos[0]; this.prevPos[1] = this.pos[1]; this.prevPos[2] = this.pos[2];
    Q.copy(this.prevQ, this.q);
    this.gear = 1; this.pendingGear = 1; this.shiftTimer = 0;
    this.engine.running = true; this.engine.omega = 95; this.engine.boost = 0; this.engine.crank = 0;
    this.stalled = false;
    this.clutchEngage = 1;
    for (var i = 0; i < 4; i++) {
      var w = this.wheels[i];
      w.omega = 0; w.spin = 0; w.fx = 0; w.fy = 0; w.susComp = 0.11; w.susVel = 0;
      w.hint.i = Math.floor(s / this.track.step) || 0;
    }
    this.distance = s || 0;
    this.recoverTimer = 0;
  };

  /* ---------------- 引擎 ---------------- */
  function torqueCurve(rpm) {
    // 基础（自然吸气）扭矩
    var pts = [[600, 150], [1200, 215], [2000, 268], [3000, 305], [4000, 322], [5000, 328], [6000, 310], [6800, 285], [7400, 240], [7800, 180]];
    if (rpm <= pts[0][0]) return pts[0][1];
    for (var i = 1; i < pts.length; i++) {
      if (rpm <= pts[i][0]) {
        var t = (rpm - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]);
        return M.lerp(pts[i - 1][1], pts[i][1], t);
      }
    }
    return pts[pts.length - 1][1];
  }

  Car.prototype.updateDriveline = function (dt, inp) {
    var T = this.tuning, e = this.engine, w = this.wheels;

    // 换挡请求
    if (inp.shiftUp) this.requestShift(1);
    if (inp.shiftDown) this.requestShift(-1);
    if (this.shiftTimer > 0) {
      this.shiftTimer -= dt;
      if (this.shiftTimer <= 0) {
        this.gear = this.pendingGear;
        this.shiftTimer = 0;
        this.shiftCut = false;
      }
    }

    var gr = this.gear === 0 ? 0 : T.gears[Math.abs(this.gear) - 1] * T.final * (this.gear < 0 ? -1 : 1);
    // 驱动轮平均角速度
    var aw;
    if (T.drivetrainBias <= 0.001) aw = (w[2].omega + w[3].omega) * 0.5;
    else if (T.drivetrainBias >= 0.999) aw = (w[0].omega + w[1].omega) * 0.5;
    else aw = (w[0].omega + w[1].omega + w[2].omega + w[3].omega) * 0.25;
    var omegaIn = aw * gr;

    // 离合器接合：手动 + 静止自动分离（防止无意义熄火）
    var pedal = M.clamp(inp.clutch, 0, 1);
    var speed = Math.abs(this.vel[0] * 0 + this.forwardSpeed());
    if (speed < 0.6 && inp.throttle < 0.05 && inp.brake > 0.15) pedal = Math.max(pedal, 0.85);
    var target = 1 - pedal;
    var rate = target < this.clutchEngage ? 3.6 : 6.5;
    this.clutchEngage = M.approach(this.clutchEngage, target, rate, dt);

    var rpm = e.omega * 9.5493;
    var running = e.running;

    // 起动机
    if (!running && e.crank > 0) {
      e.crank -= dt;
      e.omega = M.damp(e.omega, 32, 6, dt);
      if (e.crank <= 0 && Math.abs(e.omega - 32) < 12) { e.running = true; running = true; e.omega = 110; }
    }
    if (!running && (inp.starter || (pedal > 0.6 && inp.throttle > 0.35))) {
      if (e.crank <= 0) { e.crank = 0.75; this.events.push('crank'); }
      e.omega = Math.max(e.omega, 28);
    }

    // 涡轮
    var bTarget = M.clamp((rpm - 1500) / 1700, 0, 1) * inp.throttle;
    if (e.running) {
      var tau = inp.throttle < 0.08 ? 0.055 : (rpm < 3000 ? 0.34 : 0.15);
      e.boost += (bTarget - e.boost) * (1 - Math.exp(-dt / tau));
    } else e.boost = M.damp(e.boost, 0, 4, dt);

    var Te = 0;
    if (e.running) {
      var fuel = (!this.shiftCut && this.gearDropTimer <= 0) ? inp.throttle : 0;
      Te = torqueCurve(rpm) * (1 + 0.55 * e.boost) * fuel;
      // 断油/限转
      if (rpm > 7420) Te = Math.min(Te, -25);
      // 摩擦与泵损（发动机制动）
      Te -= (14 + rpm * 0.0072) * (1 - fuel * 0.9);
      // 怠速调节
      if (fuel < 0.06 && rpm < 1000) Te += (1000 - rpm) * 0.22;
      if (this.damage.engine > 0.001) {
        Te *= (1 - 0.62 * this.damage.engine);
        if (this.damage.engine > 0.5 && Math.random() < this.damage.engine * 0.06) Te *= 0.2; // 失火
      }
    }
    e.torque = Te;

    // 离合传递：容量 + 单步不越过零滑差 + 发动机实际能给出的扭矩（含惯量储备）
    var cap = 1050 * this.clutchEngage * (1 - 0.35 * this.damage.gearbox);
    var Tc = 0;
    if (this.gear !== 0) {
      var slip = e.omega - omegaIn;
      var IwTotal = (this.wheels[0].I + this.wheels[1].I + this.wheels[2].I + this.wheels[3].I);
      var Ieff = 1 / (1 / 0.22 + gr * gr / IwTotal);
      var viscous = Math.abs(slip) * Ieff / dt * 1.35;
      var reservePos = Math.max(Te, 0) + Math.max(0, e.omega - 96) * 3.4 + 12;
      var reserveNeg = Math.max(-Te, 0) + Math.max(0, e.omega - 50) * 3.4 + 12;
      var raw = cap * Math.tanh(slip * 1.1);
      var tmax = Math.min(cap, reservePos);
      var tmin = -Math.min(cap, reserveNeg);
      Tc = M.clamp(raw, tmin, tmax);
      Tc = M.clamp(Tc, -viscous, viscous);
    }
    e.clutchT = Tc;

    // 发动机自由端积分
    var net = Te - Tc;
    if (this.gear === 0) net = Te;
    e.omega += net / 0.22 * dt;
    if (!e.running) e.omega += -e.omega * 2.2 * dt;
    e.omega = M.clamp(e.omega, 0, 800);
    rpm = e.omega * 9.5493;
    if (e.running && rpm < 330 && this.clutchEngage > 0.5) {
      e.running = false; e.omega = 0; this.events.push('stall');
    }
    if (!e.running) { e.omega = Math.max(0, e.omega - 30 * dt); rpm = e.omega * 9.5493; }
    // 空挡怠速
    if (this.gear === 0 && e.running) {
      if (e.omega < 92) e.omega += (92 - e.omega) * 4 * dt;
    }
    e.rpm = rpm; e.boostBar = e.boost * 1.15; e.load = inp.throttle;

    // 挡位脱挡（变速箱损伤）
    if (this.damage.gearbox > 0.35 && this.gear !== 0 && this.gearDropTimer <= 0) {
      var loadT = Math.abs(Tc) * Math.abs(gr);
      if (loadT > 2200 && Math.random() < dt * (this.damage.gearbox - 0.3) * 1.8) {
        this.gearDropTimer = 0.55;
        this.pendingGear = 0;
        this.shiftTimer = 0.12;
        this.events.push('gearDrop');
      }
    }
    if (this.gearDropTimer > 0) this.gearDropTimer -= dt;

    // 扭矩分配
    var eff = 0.92;
    var Td = Tc * gr * eff;
    var bias = T.drivetrainBias;
    var frontT = Td * bias, rearT = Td * (1 - bias);
    // 中央黏性耦合
    if (bias > 0.02 && bias < 0.98 && T.centerCoupling > 0.01) {
      var dOm = (w[0].omega + w[1].omega) * 0.5 - (w[2].omega + w[3].omega) * 0.5;
      var tcv = M.clamp(dOm * 30 * T.centerCoupling, -Math.abs(Td) * 0.6 - 300, Math.abs(Td) * 0.6 + 300);
      // 前轴转快 → 把扭矩送到后轴（黏性耦合）
      frontT -= tcv; rearT += tcv;
    }
    // 左右 LSD：把扭矩从转得快的轮子送到转得慢的轮子
    var lf = -T.lsdFront * (w[0].omega - w[1].omega);
    var lr = -T.lsdRear * (w[2].omega - w[3].omega);
    lf = M.clamp(lf, -900, 900); lr = M.clamp(lr, -1400, 1400);
    w[0].driveT = frontT * 0.5 + lf;
    w[1].driveT = frontT * 0.5 - lf;
    w[2].driveT = rearT * 0.5 + lr;
    w[3].driveT = rearT * 0.5 - lr;
    if (this.shiftTimer > 0) { for (var k = 0; k < 4; k++) w[k].driveT = 0; }

    // 制动
    var bm = T.brakeMax * inp.brake;
    var hb = inp.handbrake;
    w[0].brakeT = bm * T.brakeBias * 0.5;
    w[1].brakeT = bm * T.brakeBias * 0.5;
    w[2].brakeT = bm * (1 - T.brakeBias) * 0.5 + hb * 5200;
    w[3].brakeT = bm * (1 - T.brakeBias) * 0.5 + hb * 5200;
  };

  Car.prototype.requestShift = function (dir) {
    if (this.shiftTimer > 0) return;
    if (!this.engine.running) return;
    var g = this.gear + dir;
    if (g > 6) g = 6;
    if (g < -1) g = -1;
    if (g === this.gear) return;
    // 倒挡需要几乎停车
    if (g < 0 && Math.abs(this.forwardSpeed()) > 2.5) return;
    if (this.gear < 0 && dir > 0) g = 0;
    // 降挡保护：不允许挂进会把发动机打爆的挡位
    if (g > 0) {
      var aw = Math.max(
        (this.wheels[0].omega + this.wheels[1].omega + this.wheels[2].omega + this.wheels[3].omega) * 0.25,
        Math.abs(this.forwardSpeed()) / this.wheels[0].R);
      var rpmAfter = Math.abs(aw) * this.tuning.gears[g - 1] * this.tuning.final * 9.5493;
      if (rpmAfter > 7350) { this.events.push('shiftDeny'); return; }
    }
    this.shiftTimer = 0.10 + this.damage.gearbox * 0.25;
    this.pendingGear = g;
    this.shiftCut = true;
    this.events.push('shift');
  };

  Car.prototype.forwardSpeed = function () {
    var R = this._R;
    return this.vel[0] * R[6] + this.vel[1] * R[7] + this.vel[2] * R[8];
  };

  /* ---------------- 主步进 ---------------- */
  Car.prototype.step = function (dt, inp) {
    var T = this.tuning, w = this.wheels, R = this._R;
    Q.copy(this.prevQ, this.q);
    this.prevPos[0] = this.pos[0]; this.prevPos[1] = this.pos[1]; this.prevPos[2] = this.pos[2];
    Q.toBasis(R, this.q);
    var rgt = [R[0], R[1], R[2]], up = [R[3], R[4], R[5]], fwd = [R[6], R[7], R[8]];

    this.updateDriveline(dt, inp);

    // 转向
    var steerMax = T.steeringLock * M.DEG * (1 - 0.35 * this.damage.steering);
    var pull = this.damage.steering * 5.5 * M.DEG * this._pullSign();
    var steer = -inp.steer * steerMax + pull;
    for (var i = 0; i < 4; i++) {
      w[i].steer = w[i].front ? steer : 0;
    }

    var Fx = 0, Fy = -this.mass * G, Fz = 0;
    var Tx = 0, Ty = 0, Tz = 0;

    // ---- 悬挂 & 轮胎 ----
    var comps = [0, 0, 0, 0];
    for (var k = 0; k < 4; k++) {
      var wh = w[k];
      // 挂点世界坐标
      var mwx = this.pos[0] + R[0] * wh.mx + R[3] * wh.my + R[6] * wh.mz;
      var mwy = this.pos[1] + R[1] * wh.mx + R[4] * wh.my + R[7] * wh.mz;
      var mwz = this.pos[2] + R[2] * wh.mx + R[5] * wh.my + R[8] * wh.mz;
      wh.mountW[0] = mwx; wh.mountW[1] = mwy; wh.mountW[2] = mwz;

      var g = this.track.groundAt(mwx, mwz, wh.hint, wh.ground);
      var downDot = Math.max(0.35, R[4]);
      var dist = (mwy - g.y) / downDot;
      var free = dist - wh.R;
      // 悬挂损伤：弹簧变软 + 车身下沉
      var dmgSusp = this.damage['susp' + wh.key] || 0;
      var maxLen = wh.maxLen * (1 - 0.18 * dmgSusp);
      var comp = M.clamp(maxLen - free, 0, wh.travel);
      if (dmgSusp > 0.1) comp = Math.max(comp, dmgSusp * 0.055); // 塌陷
      comps[k] = comp;
      var contact = comp > 0.0008;

      // 挂点速度
      var rx = mwx - this.pos[0], ry = mwy - this.pos[1], rz = mwz - this.pos[2];
      var vx2 = this.vel[0] + this.w[1] * rz - this.w[2] * ry;
      var vy2 = this.vel[1] + this.w[2] * rx - this.w[0] * rz;
      var vz2 = this.vel[2] + this.w[0] * ry - this.w[1] * rx;
      var vUp = vx2 * up[0] + vy2 * up[1] + vz2 * up[2];
      var compVel = -vUp;

      var Fs = 0;
      if (contact) {
        var kk = wh.k * (1 - 0.42 * dmgSusp);
        Fs = kk * comp + (compVel > 0 ? wh.dampB : wh.dampR) * compVel;
        var over = comp - wh.travel * 0.86;
        if (over > 0) Fs += 780000 * over * over + 26000 * over;
        if (Fs < 0) Fs = 0;
      }
      wh.susComp = comp; wh.susVel = compVel; wh.contact = contact;
      wh.load = contact ? Fs : 0;

      // 防倾杆（左右差）
      // 在两侧都算完后统一应用 → 见下
      wh._Fs = Fs;
      wh.contactN[0] = g.nx; wh.contactN[1] = g.ny; wh.contactN[2] = g.nz;
      wh._g = g;
    }
    // 防倾杆
    for (var ax = 0; ax < 2; ax++) {
      var l = w[ax * 2], r = w[ax * 2 + 1];
      var diff = (l.susComp - r.susComp);
      var Fa = l.arb * diff;
      l._Fs += Fa; r._Fs -= Fa;
      if (l._Fs < 0) l._Fs = 0;
      if (r._Fs < 0) r._Fs = 0;
      l.load = l._Fs; r.load = r._Fs;
    }

    var muSum = 0;
    for (var m = 0; m < 4; m++) {
      var wm = w[m];
      var g2 = wm._g;
      var Fs2 = wm._Fs;
      var n = wm.contactN;

      // 悬挂力作用在挂点，沿车身上方向
      var sfx = up[0] * Fs2, sfy = up[1] * Fs2, sfz = up[2] * Fs2;
      Fx += sfx; Fy += sfy; Fz += sfz;
      var rmx = wm.mountW[0] - this.pos[0], rmy = wm.mountW[1] - this.pos[1], rmz = wm.mountW[2] - this.pos[2];
      Tx += rmy * sfz - rmz * sfy;
      Ty += rmz * sfx - rmx * sfz;
      Tz += rmx * sfy - rmy * sfx;

      if (!wm.contact) {
        // 空中：轮子自由旋转
        wm.omega += wm.driveT / wm.I * dt;
        wm.omega *= (1 - 0.6 * dt);
        wm.fx *= 0.9; wm.fy *= 0.9;
        wm.slipRatio = 0; wm.slipAngle = 0; wm.sat = 0;
        continue;
      }

      // 轮心与接地点
      var cwx = wm.mountW[0] - up[0] * (wm.maxLen * (1 - 0.18 * (this.damage['susp' + wm.key] || 0)) - wm.susComp);
      var cwy = wm.mountW[1] - up[1] * (wm.maxLen * (1 - 0.18 * (this.damage['susp' + wm.key] || 0)) - wm.susComp);
      var cwz = wm.mountW[2] - up[2] * (wm.maxLen * (1 - 0.18 * (this.damage['susp' + wm.key] || 0)) - wm.susComp);
      var cpx = cwx - n[0] * wm.R, cpy = cwy - n[1] * wm.R, cpz = cwz - n[2] * wm.R;
      wm.contactW[0] = cpx; wm.contactW[1] = cpy; wm.contactW[2] = cpz;

      // 接地点速度
      var rrX = cpx - this.pos[0], rrY = cpy - this.pos[1], rrZ = cpz - this.pos[2];
      var vX = this.vel[0] + this.w[1] * rrZ - this.w[2] * rrY;
      var vY = this.vel[1] + this.w[2] * rrX - this.w[0] * rrZ;
      var vZ = this.vel[2] + this.w[0] * rrY - this.w[1] * rrX;
      var vn = vX * n[0] + vY * n[1] + vZ * n[2];
      var vpx = vX - n[0] * vn, vpy = vY - n[1] * vn, vpz = vZ - n[2] * vn;

      // 轮胎坐标系（地面投影）
      var st = wm.steer;
      var cs = Math.cos(st), sn = Math.sin(st);
      var fwx = fwd[0] * cs + rgt[0] * sn, fwy = fwd[1] * cs + rgt[1] * sn, fwz = fwd[2] * cs + rgt[2] * sn;
      var fd = fwx * n[0] + fwy * n[1] + fwz * n[2];
      fwx -= n[0] * fd; fwy -= n[1] * fd; fwz -= n[2] * fd;
      var fl = Math.hypot(fwx, fwy, fwz) || 1;
      fwx /= fl; fwy /= fl; fwz /= fl;
      var lwx = n[1] * fwz - n[2] * fwy, lwy = n[2] * fwx - n[0] * fwz, lwz = n[0] * fwy - n[1] * fwx;

      var vLong = vpx * fwx + vpy * fwy + vpz * fwz;
      var vLat = vpx * lwx + vpy * lwy + vpz * lwz;

      // 滑移率与侧偏角
      var denom = Math.max(Math.abs(vLong), 2.6);
      var sr = (wm.omega * wm.R - vLong) / denom;
      sr = M.clamp(sr, -3, 3);
      var sa = Math.atan2(vLat, Math.max(Math.abs(vLong), 2.2));
      wm.slipRatio = sr; wm.slipAngle = sa;

      // 抓地
      var mu = this.gripAt(g2, wm);
      muSum += mu;
      var ch = this._ch || (this._ch = {});
      RG.Tire.blendChar(g2, ch);
      var tf = this._tf || (this._tf = {});
      var tireDmg = this.damage['tire' + wm.key] || 0;
      mu *= (1 - 0.45 * tireDmg);
      var FzLoad = Math.max(0, Fs2);
      // 载荷敏感性：重载时单位载荷抓地下降
      var loadSens = 1 - 0.085 * (FzLoad / 3400 - 1);
      loadSens = M.clamp(loadSens, 0.80, 1.16);
      RG.Tire.eval(sr, sa, FzLoad, mu * loadSens, ch, tf);

      // 松弛：力不能瞬间建立
      var rate = Math.max(14, Math.abs(vLong) / ch.relax);
      var al = 1 - Math.exp(-rate * dt);
      wm.fx += (tf.fx - wm.fx) * al;
      wm.fy += (tf.fy - wm.fy) * al;
      wm.sat = tf.k; wm.surfK = mu * loadSens;

      var fx = wm.fx;
      var fy = wm.fy;
      // 滚动阻力
      var roll = (g2.gravel * 0.020 + g2.tarmac * 0.010 + g2.snow * 0.030 + (g2.onRoad ? 0 : 0.052));
      var rr = -Math.sign(vLong) * roll * FzLoad;
      // 低速静摩擦（仅用于停稳，不能吃掉驱动力）
      if (Math.abs(vLong) < 0.35 && Math.abs(wm.driveT) < 20) {
        rr += -vLong * 1200 * M.clamp(1 - Math.abs(vLong) / 0.35, 0, 1);
      }
      fx += rr;

      // 转换为世界力
      var pfx = fwx * fx + lwx * fy;
      var pfy = fwy * fx + lwy * fy;
      var pfz = fwz * fx + lwz * fy;
      Fx += pfx; Fy += pfy; Fz += pfz;
      Tx += rrY * pfz - rrZ * pfy;
      Ty += rrZ * pfx - rrX * pfz;
      Tz += rrX * pfy - rrY * pfx;

      // 轮子自转：轮胎纵向刚度很大，用子步保证不越过峰值
      var nSub = 8, dts = dt / nSub;
      var om = wm.omega;
      var tf2 = this._tf2 || (this._tf2 = {});
      var muEff = mu * loadSens;
      for (var ss = 0; ss < nSub; ss++) {
        var sr2 = M.clamp((om * wm.R - vLong) / denom, -3.5, 3.5);
        RG.Tire.eval(sr2, sa, FzLoad, muEff, ch, tf2);
        var al2 = (wm.driveT - tf2.fx * wm.R) / wm.I;
        om += al2 * dts;
        if (wm.brakeT > 0.05) {
          var bw = wm.brakeT / wm.I * dts;
          if (Math.abs(om) <= bw) om = 0; else om -= Math.sign(om) * bw;
        }
      }
      wm.omega = M.clamp(om, -400, 400);
      wm.lock = (wm.brakeT > 0.05 && Math.abs(wm.omega) < 0.3) ? 1 : 0;
      wm.spin += wm.omega * dt;
    }
    this.muFront = (this.wheels[0].surfK + this.wheels[1].surfK) * 0.5;
    this.muRear = (this.wheels[2].surfK + this.wheels[3].surfK) * 0.5;

    // ---- 空气动力 ----
    var sp = Math.hypot(this.vel[0], this.vel[1], this.vel[2]);
    var q = 0.5 * 1.225 * sp * sp;
    var drag = q * 0.78;
    if (sp > 0.5) {
      Fx -= this.vel[0] / sp * drag; Fy -= this.vel[1] / sp * drag; Fz -= this.vel[2] / sp * drag;
    }
    var down = q * 0.42;
    Fy -= down * 0.5; // 施加在车身上（近似）
    Tx += -down * 0.5 * 0.9; // 后半部下压 → 抬头力矩

    this.lastF = [Fx, Fy, Fz];
    // ---- 积分 ----
    var ax = Fx / this.mass, ay = Fy / this.mass, az = Fz / this.mass;
    this.vel[0] += ax * dt; this.vel[1] += ay * dt; this.vel[2] += az * dt;
    this.pos[0] += this.vel[0] * dt; this.pos[1] += this.vel[1] * dt; this.pos[2] += this.vel[2] * dt;

    // 角速度（体坐标欧拉方程）
    var Tbx = Tx * R[0] + Ty * R[1] + Tz * R[2];
    var Tby = Tx * R[3] + Ty * R[4] + Tz * R[5];
    var Tbz = Tx * R[6] + Ty * R[7] + Tz * R[8];
    var wbx = this.w[0] * R[0] + this.w[1] * R[1] + this.w[2] * R[2];
    var wby = this.w[0] * R[3] + this.w[1] * R[4] + this.w[2] * R[5];
    var wbz = this.w[0] * R[6] + this.w[1] * R[7] + this.w[2] * R[8];
    var I = this.inertia;
    var dwx = (Tbx - (wby * I[2] * wbz - wbz * I[1] * wby)) / I[0];
    var dwy = (Tby - (wbz * I[0] * wbx - wbx * I[2] * wbz)) / I[1];
    var dwz = (Tbz - (wbx * I[1] * wby - wby * I[0] * wbx)) / I[2];
    wbx += dwx * dt; wby += dwy * dt; wbz += dwz * dt;
    // 小幅阻尼，抑制数值抖动（非稳定系统）
    wbx *= 1 - 0.15 * dt; wby *= 1 - 0.10 * dt; wbz *= 1 - 0.15 * dt;
    this.w[0] = R[0] * wbx + R[3] * wby + R[6] * wbz;
    this.w[1] = R[1] * wbx + R[4] * wby + R[7] * wbz;
    this.w[2] = R[2] * wbx + R[5] * wby + R[8] * wbz;
    Q.integrate(this.q, this.q, this.w, dt);

    // 记录加速度（世界坐标 → 用于镜头惯性）
    this._acc[0] = ax; this._acc[1] = ay; this._acc[2] = az;
    this.speed = Math.hypot(this.vel[0], this.vel[2]);
    this.distance += this.forwardSpeed() * dt;
    if (this.distance < 0) this.distance = 0;

    // 车体触地保护：防止翻车/托底时穿透地形（同时给出接地摩擦）
    var gy = this.track.heightAt(this.pos[0], this.pos[2], this._proj);
    var tilt = M.clamp((1 - up[1]) * 1.6, 0, 1);      // 0=正立 1=侧翻
    var floorY = gy + 0.28 + 0.55 * tilt;
    if (this.pos[1] < floorY) {
      var pen = floorY - this.pos[1];
      this.pos[1] = floorY;
      if (this.vel[1] < 0) this.vel[1] = -this.vel[1] * 0.10;
      if (tilt > 0.35) {
        var fr = Math.min(0.25, pen * 1.6);
        this.vel[0] *= (1 - fr); this.vel[2] *= (1 - fr);
        this.w[0] *= 0.84; this.w[1] *= 0.94; this.w[2] *= 0.84;
        if (pen > 0.04) this.events.push('scrape');
      }
    } else if (this.pos[1] < gy - 4) {
      // 安全网：极端情况下拉回地面
      this.pos[1] = gy + 0.6;
      this.vel[1] = 0;
    }

    this.collide(dt);

    // 轮胎脏污：离开路面会沾泥
    var gm = this.wheels[2]._g;
    if (gm) {
      if (!gm.onRoad && (gm.gravel > 0.4 || gm.snow > 0.3)) this.dirtOnTires = Math.min(1, this.dirtOnTires + dt * 1.4);
      else this.dirtOnTires = Math.max(0, this.dirtOnTires - dt * 0.35);
    }
    // 累积车辙与脏污
    if (this.wheels[2].hint && gm) {
      for (var wq = 0; wq < 4; wq++) {
        var ww = this.wheels[wq];
        this.track.accumulateWear(ww.hint.i, ww.ground.lat, this.dirtOnTires, gm.snow > 0.5);
      }
    }
    // 空中判定
    var air = 0;
    for (var a2 = 0; a2 < 4; a2++) if (!this.wheels[a2].contact) air++;
    this.airborne = air;
  };

  Car.prototype._pullSign = function () {
    if (this.__pullSign === undefined) this.__pullSign = Math.random() < 0.5 ? -1 : 1;
    return this.__pullSign;
  };

  Car.prototype.gripAt = function (g, wh) {
    var TT = TIRE_TYPE_MU[this.tuning.tireType] || TIRE_TYPE_MU.gravel;
    var muG = RG.SURFACE_DEF.GRAVEL.mu * TT.gravel;
    var muT = RG.SURFACE_DEF.TARMAC.mu * TT.tarmac;
    var muS = RG.SURFACE_DEF.SNOW.mu * TT.snow;
    // 脏路：柏油被砂石覆盖
    if (g.tarmac > 0.05 && g.dirt > 0.02) {
      muT = M.lerp(muT, RG.SURFACE_DEF.GRAVEL.mu * TT.gravel * 0.92, Math.min(1, g.dirt * 1.15));
    }
    var wg = g.gravel, wt = g.tarmac, ws = g.snow;
    if (!g.onRoad) {
      // 越野：草地/砾石混，抓地更低更颠
      wg = 0.55; wt = g.tarmac * 0.5; ws = g.snow;
      wg = Math.max(0, 1 - wt - ws);
      muG *= 0.86;
    }
    // 湿地
    if (this.track.spec.wet) {
      muT *= 0.66;
      muG *= 0.86;
      muS *= 0.90;
    }
    var mu = (muG * wg + muT * wt + muS * ws) / Math.max(0.001, (wg + wt + ws));
    // 积水：瞬时失去大部分抓地（可恢复）
    if (g.puddle > 0.02) mu = M.lerp(mu, mu * 0.42, Math.min(1, g.puddle));
    // 冰面
    if (g.ice > 0.02) mu = M.lerp(mu, 0.16, Math.min(1, g.ice));
    // 胎压：过高过低都掉抓地
    var p = this.tuning.tirePressure;
    mu *= 1 - Math.min(0.22, Math.abs(p - 2.2) * 0.10);
    // 轮胎温度/磨损可扩展
    return Math.max(0.05, mu);
  };

  /* ---------------- 碰撞 ---------------- */
  Car.prototype.collide = function (dt) {
    var track = this.track;
    var circles = [[0, 1.55], [0, 0.0], [0, -1.55]];
    var radius = 0.92;
    var R = this._R;
    for (var c = 0; c < circles.length; c++) {
      var cx = this.pos[0] + R[6] * circles[c][1];
      var cz = this.pos[2] + R[8] * circles[c][1];
      var list = track.queryColliders(cx, cz, radius + 1.2);
      for (var i = 0; i < list.length; i++) {
        var col = list[i];
        var nx, nz, pen;
        if (col.type === 'circle') {
          var dx = cx - col.x, dz = cz - col.z;
          var d = Math.hypot(dx, dz);
          if (d < 1e-4) { dx = 1; dz = 0; d = 1; }
          pen = (radius + col.r) - d;
          if (pen <= 0) continue;
          nx = dx / d; nz = dz / d;
        } else {
          // OBB
          var cs = Math.cos(col.rot), sn = Math.sin(col.rot);
          var lx = (cx - col.x) * cs - (cz - col.z) * sn;
          var lz = (cx - col.x) * sn + (cz - col.z) * cs;
          var qx = M.clamp(lx, -col.hw, col.hw), qz = M.clamp(lz, -col.hd, col.hd);
          var ddx = lx - qx, ddz = lz - qz;
          var dd = Math.hypot(ddx, ddz);
          if (dd > radius) continue;
          if (dd < 1e-4) {
            // 在盒内：沿最近面推出
            var ox = col.hw - Math.abs(lx), oz = col.hd - Math.abs(lz);
            if (ox < oz) { ddx = Math.sign(lx) || 1; ddz = 0; dd = 0; pen = radius + ox; }
            else { ddx = 0; ddz = Math.sign(lz) || 1; dd = 0; pen = radius + oz; }
            nx = ddx * cs + ddz * sn; nz = -ddx * sn + ddz * cs;
          } else {
            pen = radius - dd;
            var nlx = ddx / dd, nlz = ddz / dd;
            nx = nlx * cs + nlz * sn; nz = -nlx * sn + nlz * cs;
          }
        }
        // 位置修正
        this.pos[0] += nx * pen * 0.85;
        this.pos[2] += nz * pen * 0.85;
        cx += nx * pen * 0.85; cz += nz * pen * 0.85;
        // 冲量
        var vn = this.vel[0] * nx + this.vel[2] * nz;
        var impact = 0;
        if (vn < 0) {
          var j = -(1 + 0.18) * vn;
          this.vel[0] += nx * j; this.vel[2] += nz * j;
          // 切向摩擦
          var tvx = this.vel[0] - nx * (this.vel[0] * nx + this.vel[2] * nz);
          var tvz = this.vel[2] - nz * (this.vel[0] * nx + this.vel[2] * nz);
          this.vel[0] -= tvx * 0.22; this.vel[2] -= tvz * 0.22;
          impact = -vn;
          // 偏航冲击
          var arm = circles[c][1];
          this.w[1] += (nx * R[6] - nz * R[8]) * 0 + (-nx * R[8] + nz * R[6]) * arm * impact * 0.06;
        }
        if (impact > 1.2) this.onImpact(impact, col.tag);
        this.recoverTimer = 0;
      }
    }
    // 侧向软边界（山脊护栏内侧 / 极端越界）
    var pr = track.project(this.pos[0], this.pos[2], this._proj || (this._proj = { i: 0 }));
    var nd = pr.node;
    var limit = nd.w + 30;
    if (Math.abs(pr.lat) > limit && Math.abs(pr.lat) < 200) {
      var sgn = Math.sign(pr.lat);
      var over = Math.min(1.4, Math.abs(pr.lat) - limit);
      this.pos[0] -= nd.rx * sgn * over;
      this.pos[2] -= nd.rz * sgn * over;
      var vn2 = (this.vel[0] * nd.rx + this.vel[2] * nd.rz) * sgn;
      if (vn2 > 0) {
        this.vel[0] -= nd.rx * sgn * vn2 * 1.25;
        this.vel[2] -= nd.rz * sgn * vn2 * 1.25;
      }
      if (vn2 > 2) this.onImpact(vn2, 'off');
    }
  };

  Car.prototype.onImpact = function (speed, tag) {
    this.events.push({ type: 'impact', speed: speed, tag: tag });
    var e = speed * speed * 0.5 * this.mass / 1000;
    // 分区损伤映射
    if (tag === 'tree' || tag === 'rock') {
      this.addDamage('body', e * 0.0016);
      this.addDamage('suspFL', e * 0.0011); this.addDamage('suspFR', e * 0.0011);
      this.addDamage('steering', e * 0.0007);
      this.addDamage('engine', e * 0.0005);
      this.addDamage('lights', e * 0.0012);
      this.addDamage('tireFL', e * 0.0006); this.addDamage('tireFR', e * 0.0006);
    } else if (tag === 'rail') {
      this.addDamage('body', e * 0.0006);
      this.addDamage('suspRL', e * 0.0005); this.addDamage('suspRR', e * 0.0005);
    } else {
      this.addDamage('suspRL', e * 0.0008); this.addDamage('suspRR', e * 0.0008);
      this.addDamage('body', e * 0.0004);
    }
  };

  Car.prototype.addDamage = function (part, amount) {
    if (!(part in this.damage)) return;
    var old = this.damage[part];
    this.damage[part] = Math.min(1, old + amount);
    if (this.damage[part] > 0.75 && old <= 0.75) this.events.push({ type: 'damage', part: part, level: 0.75 });
  };

  // 用于 HUD / 音频
  Car.prototype.telemetry = function () {
    var e = this.engine;
    return {
      rpm: e.rpm, gear: this.gear, speed: this.speed * 3.6,
      throttle: e.load, boost: e.boostBar, clutch: this.clutchEngage,
      slipF: (this.wheels[0].sat + this.wheels[1].sat) * 0.5,
      slipR: (this.wheels[2].sat + this.wheels[3].sat) * 0.5,
      wheelspin: Math.max(0, (this.wheels[2].slipRatio + this.wheels[3].slipRatio) * 0.5),
      brakeLock: this.wheels[0].lock || this.wheels[1].lock,
      airborne: this.airborne, stalled: !e.running,
      muF: this.muFront, muR: this.muRear,
      lat: this.wheels[0].ground.lat, s: this.distance,
      susp: [this.wheels[0].susComp, this.wheels[1].susComp, this.wheels[2].susComp, this.wheels[3].susComp]
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
