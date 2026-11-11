/* input.js — 键盘渐进模拟 / 手柄线性 / 触屏 */
(function (root) {
  'use strict';
  var RG = root.RG = root.RG || {};
  var M = RG.M;

  var DEFAULT = {
    steerSens: 1.0,
    deadzone: 0.08,
    linearity: 1.35,
    throttleCurve: 1.0,
    brakeCurve: 1.0,
    invertSteer: false,
    keyboardSteerRate: 1.0
  };
  RG.INPUT_DEFAULT = DEFAULT;

  function Input(canvas) {
    this.settings = Object.assign({}, DEFAULT);
    this.keys = {};
    this.steer = 0;
    this.throttle = 0;
    this.brake = 0;
    this.clutch = 0;
    this.handbrake = 0;
    this.shiftUp = false; this.shiftDown = false;
    this.starter = false;
    this.gamepad = null;
    this.padIndex = -1;
    this.usingGamepad = false;
    this.touch = { active: false, left: false, right: false, thr: 0, brk: 0, hb: false, steerAxis: 0 };
    this.events = [];
    this.bind();
  }
  RG.Input = Input;

  Input.prototype.bind = function () {
    var self = this;
    window.addEventListener('keydown', function (e) {
      if (e.repeat) { e.preventDefault(); return; }
      self.keys[e.code] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
      if (e.code === 'KeyC') self.events.push('camera');
      if (e.code === 'Escape' || e.code === 'KeyP') self.events.push('pause');
      if (e.code === 'KeyR') self.events.push('restart');
      if (e.code === 'KeyH') self.events.push('hint');
      if (e.code === 'KeyE') self.shiftUp = true;
      if (e.code === 'KeyQ') self.shiftDown = true;
    }, { passive: false });
    window.addEventListener('keyup', function (e) {
      self.keys[e.code] = false;
      if (e.code === 'KeyE') self.shiftUp = false;
      if (e.code === 'KeyQ') self.shiftDown = false;
    });
    window.addEventListener('blur', function () { self.keys = {}; });
    window.addEventListener('gamepadconnected', function (e) {
      self.padIndex = e.gamepad.index;
      self.events.push('gamepad');
    });
    window.addEventListener('gamepaddisconnected', function () { self.padIndex = -1; });
  };

  Input.prototype.calibrate = function (v) {
    var s = this.settings;
    var a = Math.abs(v);
    if (a < s.deadzone) return 0;
    a = (a - s.deadzone) / (1 - s.deadzone);
    a = Math.pow(a, s.linearity);
    return v < 0 ? -a : a;
  };

  Input.prototype.pollGamepad = function () {
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (var i = 0; i < pads.length; i++) {
      var p = pads[i];
      if (!p || !p.connected) continue;
      this.gamepad = p;
      this.padIndex = i;
      return p;
    }
    this.gamepad = null;
    return null;
  };

  // 每帧调用；speed 用于键盘转向速率
  Input.prototype.update = function (dt, speed, enabled) {
    var s = this.settings;
    var k = this.keys;
    var out = this.out || (this.out = {});

    // ---- 键盘 ----
    var kThr = (k.KeyW || k.ArrowUp) ? 1 : 0;
    var kBrk = (k.KeyS || k.ArrowDown) ? 1 : 0;
    var kLeft = (k.KeyA || k.ArrowLeft) ? 1 : 0;
    var kRight = (k.KeyD || k.ArrowRight) ? 1 : 0;
    this.throttle = M.approach(this.throttle, kThr, kThr ? 3.4 : 8.0, dt);
    this.brake = M.approach(this.brake, kBrk, kBrk ? 4.2 : 9.0, dt);
    this.clutch = M.approach(this.clutch, (k.ShiftLeft || k.ShiftRight) ? 1 : 0, (k.ShiftLeft || k.ShiftRight) ? 6 : 3.2, dt);
    this.handbrake = M.approach(this.handbrake, k.Space ? 1 : 0, k.Space ? 8 : 10, dt);
    this.starter = !!(k.KeyK);

    var steerTarget = kRight - kLeft;
    var speedRate = M.lerp(3.6, 1.25, M.clamp((speed || 0) / 34, 0, 1)) * s.keyboardSteerRate;
    var rate = steerTarget === 0 ? 5.2 : speedRate * Math.max(0.35, 1 - Math.abs(this.steer) * 0.45);
    this.steer = M.approach(this.steer, steerTarget, rate, dt);

    out.throttle = this.throttle;
    out.brake = this.brake;
    out.steer = this.steer;
    out.clutch = this.clutch;
    out.handbrake = this.handbrake;
    out.starter = this.starter;

    // ---- 手柄 ----
    var pad = this.pollGamepad();
    if (pad) {
      var ax = pad.axes[0] || 0;
      var ay = pad.axes[1] || 0;
      var padSteer = this.calibrate(ax);
      var rt = pad.buttons[7] ? pad.buttons[7].value : 0;
      var lt = pad.buttons[6] ? pad.buttons[6].value : 0;
      var active = Math.abs(ax) > 0.18 || rt > 0.06 || lt > 0.06;
      if (active) this.usingGamepad = true;
      if (this.usingGamepad) {
        out.steer = M.clamp(padSteer * 1.0, -1, 1) * (s.invertSteer ? -1 : 1);
        out.throttle = Math.pow(rt, s.throttleCurve);
        out.brake = Math.pow(lt, s.brakeCurve);
        out.clutch = pad.buttons[2] && pad.buttons[2].pressed ? 1 : out.clutch;
        out.handbrake = pad.buttons[0] && pad.buttons[0].pressed ? 1 : 0;
        if (pad.buttons[5] && pad.buttons[5].pressed && !this._padUp) this.events.push('shiftUp');
        if (pad.buttons[4] && pad.buttons[4].pressed && !this._padDown) this.events.push('shiftDown');
        this._padUp = pad.buttons[5] && pad.buttons[5].pressed;
        this._padDown = pad.buttons[4] && pad.buttons[4].pressed;
        if (pad.buttons[3] && pad.buttons[3].pressed && !this._padCam) this.events.push('camera');
        this._padCam = pad.buttons[3] && pad.buttons[3].pressed;
        if (pad.buttons[9] && pad.buttons[9].pressed && !this._padStart) this.events.push('pause');
        this._padStart = pad.buttons[9] && pad.buttons[9].pressed;
        out.starter = !!(pad.buttons[1] && pad.buttons[1].pressed);
      }
    } else {
      this.usingGamepad = false;
    }

    // ---- 触屏 ----
    if (this.touch.active) {
      out.throttle = Math.max(out.throttle, this.touch.thr);
      out.brake = Math.max(out.brake, this.touch.brk);
      out.steer = M.clamp((this.touch.right ? 1 : 0) - (this.touch.left ? 1 : 0) + this.touch.steerAxis, -1, 1);
      out.handbrake = Math.max(out.handbrake, this.touch.hb ? 1 : 0);
    }

    // ---- 事件 ----
    if (this.shiftUp) { this.events.push('shiftUp'); this.shiftUp = false; }
    if (this.shiftDown) { this.events.push('shiftDown'); this.shiftDown = false; }

    var ev = this.events;
    this.events = [];
    out.events = ev;
    for (var i = 0; i < ev.length; i++) {
      if (ev[i] === 'shiftUp') out.shiftUp = true;
      if (ev[i] === 'shiftDown') out.shiftDown = true;
    }
    if (!enabled) {
      out.throttle = 0; out.brake = 0; out.steer = 0; out.handbrake = 0;
    }
    return out;
  };

  // 触屏绑定（由 UI 调用）
  Input.prototype.bindTouch = function (els) {
    var self = this;
    self.touch.active = true;
    function hold(el, on, off) {
      if (!el) return;
      el.addEventListener('pointerdown', function (e) { e.preventDefault(); el.setPointerCapture(e.pointerId); on(); });
      el.addEventListener('pointerup', function (e) { e.preventDefault(); off(); });
      el.addEventListener('pointercancel', function () { off(); });
      el.addEventListener('pointerleave', function () { off(); });
    }
    hold(els.left, function () { self.touch.left = true; }, function () { self.touch.left = false; });
    hold(els.right, function () { self.touch.right = true; }, function () { self.touch.right = false; });
    hold(els.thr, function () { self.touch.thr = 1; }, function () { self.touch.thr = 0; });
    hold(els.brk, function () { self.touch.brk = 1; }, function () { self.touch.brk = 0; });
    hold(els.hb, function () { self.touch.hb = true; }, function () { self.touch.hb = false; });
    hold(els.up, function () { self.events.push('shiftUp'); }, function () { });
    hold(els.down, function () { self.events.push('shiftDown'); }, function () { });
  };
})(typeof window !== 'undefined' ? window : globalThis);
