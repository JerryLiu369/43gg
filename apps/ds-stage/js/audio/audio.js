/* audio.js — 全程序化音频：引擎、涡轮、轮胎、砂石、风噪、领航员语音 */
(function (root) {
  'use strict';
  var RG = root.RG = root.RG || {};

  function Audio() {
    this.ready = false;
    this.enabled = true;
    this.voiceOn = true;
    this.volume = 0.85;
    this.lastPop = 0;
    this.lastStarter = 0;
    this.speechQueue = [];
    this.lastSpeak = 0;
  }
  RG.Audio = Audio;

  Audio.prototype.start = function () {
    if (this.ready) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    var ctx = this.ctx = new AC();
    var master = this.master = ctx.createGain();
    master.gain.value = this.volume;
    master.connect(ctx.destination);

    // 噪声源（2 秒白噪声，循环）
    var len = ctx.sampleRate * 2;
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    function noise() {
      var s = ctx.createBufferSource();
      s.buffer = buf; s.loop = true;
      s.start(0);
      return s;
    }

    // ---- 引擎 ----
    this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = ctx.createOscillator(); this.o2.type = 'sawtooth';
    this.o3 = ctx.createOscillator(); this.o3.type = 'square';
    this.g1 = ctx.createGain(); this.g1.gain.value = 0.5;
    this.g2 = ctx.createGain(); this.g2.gain.value = 0.22;
    this.g3 = ctx.createGain(); this.g3.gain.value = 0.08;
    this.o1.connect(this.g1); this.o2.connect(this.g2); this.o3.connect(this.g3);
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 900;
    this.engFilter.Q.value = 1.2;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0.06;
    this.g1.connect(this.engFilter); this.g2.connect(this.engFilter); this.g3.connect(this.engFilter);
    this.engFilter.connect(this.engGain);
    this.engGain.connect(master);
    this.o1.start(); this.o2.start(); this.o3.start();

    // 进气/排气噪声
    this.engNoise = noise();
    this.engNoiseFilter = ctx.createBiquadFilter();
    this.engNoiseFilter.type = 'bandpass';
    this.engNoiseFilter.frequency.value = 600;
    this.engNoiseFilter.Q.value = 0.9;
    this.engNoiseGain = ctx.createGain();
    this.engNoiseGain.gain.value = 0.02;
    this.engNoise.connect(this.engNoiseFilter);
    this.engNoiseFilter.connect(this.engNoiseGain);
    this.engNoiseGain.connect(master);

    // ---- 涡轮 ----
    this.turbo = ctx.createOscillator();
    this.turbo.type = 'sine';
    this.turbo.frequency.value = 2200;
    this.turboGain = ctx.createGain();
    this.turboGain.gain.value = 0;
    this.turbo.connect(this.turboGain); this.turboGain.connect(master);
    this.turbo.start();

    // ---- 轮胎尖叫 ----
    this.squealSrc = noise();
    this.squealF = ctx.createBiquadFilter();
    this.squealF.type = 'bandpass';
    this.squealF.frequency.value = 1400;
    this.squealF.Q.value = 5;
    this.squealGain = ctx.createGain();
    this.squealGain.gain.value = 0;
    this.squealSrc.connect(this.squealF); this.squealF.connect(this.squealGain);
    this.squealGain.connect(master);

    // ---- 路面噪声 ----
    this.roadSrc = noise();
    this.roadF = ctx.createBiquadFilter();
    this.roadF.type = 'lowpass';
    this.roadF.frequency.value = 420;
    this.roadGain = ctx.createGain();
    this.roadGain.gain.value = 0;
    this.roadSrc.connect(this.roadF); this.roadF.connect(this.roadGain);
    this.roadGain.connect(master);

    // ---- 风噪 ----
    this.windSrc = noise();
    this.windF = ctx.createBiquadFilter();
    this.windF.type = 'highpass';
    this.windF.frequency.value = 700;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.windSrc.connect(this.windF); this.windF.connect(this.windGain);
    this.windGain.connect(master);

    this.ready = true;
  };

  Audio.prototype.setVolume = function (v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  };

  Audio.prototype.setEngine = function (rpm, throttle, load, boost, running) {
    if (!this.ready) return;
    var ctx = this.ctx, t = ctx.currentTime;
    var f = Math.max(14, rpm / 30);
    var on = running ? 1 : 0;
    this.o1.frequency.setTargetAtTime(f, t, 0.03);
    this.o2.frequency.setTargetAtTime(f * 2.01, t, 0.03);
    this.o3.frequency.setTargetAtTime(f * 3.02, t, 0.03);
    this.engFilter.frequency.setTargetAtTime(280 + rpm * 0.34 + throttle * 900, t, 0.05);
    var g = on * (0.035 + load * 0.10 + Math.min(1, rpm / 7000) * 0.045);
    this.engGain.gain.setTargetAtTime(g, t, 0.05);
    this.engNoiseFilter.frequency.setTargetAtTime(f * 3.5 + 200, t, 0.05);
    this.engNoiseGain.gain.setTargetAtTime(on * (0.006 + load * 0.028), t, 0.06);
    this.turbo.frequency.setTargetAtTime(1400 + boost * 3600, t, 0.08);
    this.turboGain.gain.setTargetAtTime(on * boost * 0.016, t, 0.1);
  };

  Audio.prototype.setTire = function (slip, surfaceHard) {
    if (!this.ready) return;
    var t = this.ctx.currentTime;
    var g = Math.min(0.1, Math.max(0, (slip - 1.05) * 0.09)) * (surfaceHard ? 1.4 : 1);
    this.squealGain.gain.setTargetAtTime(g, t, 0.06);
    this.squealF.frequency.setTargetAtTime(1100 + slip * 260, t, 0.1);
  };

  Audio.prototype.setRoad = function (speed, roughness, snow) {
    if (!this.ready) return;
    var t = this.ctx.currentTime;
    var s = Math.min(1, speed / 45);
    var g = s * s * (0.05 + roughness * 0.075);
    this.roadGain.gain.setTargetAtTime(g, t, 0.08);
    this.roadF.frequency.setTargetAtTime(snow ? 900 : 300 + s * 520, t, 0.1);
    this.windGain.gain.setTargetAtTime(s * s * 0.028, t, 0.1);
    this.windF.frequency.setTargetAtTime(600 + s * 900, t, 0.15);
  };

  Audio.prototype.burst = function (freq, q, gain, dur, type) {
    if (!this.ready) return;
    var ctx = this.ctx, t = ctx.currentTime;
    var s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.6;
    var f = ctx.createBiquadFilter();
    f.type = type || 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    var g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random() * 1.2, dur + 0.05);
    s.onended = function () { try { s.disconnect(); g.disconnect(); f.disconnect(); } catch (e) { } };
  };

  Audio.prototype.impact = function (strength, surface) {
    if (!this.ready) return;
    var g = Math.min(0.55, 0.06 + strength * 0.06);
    this.burst(surface === 'snow' ? 900 : 260 + Math.random() * 300, 1.2, g, 0.10 + Math.min(0.25, strength * 0.02), 'lowpass');
    if (strength > 4) this.burst(1800, 2.4, g * 0.5, 0.16);
  };

  Audio.prototype.shift = function () {
    if (!this.ready) return;
    this.burst(2400, 3.0, 0.10, 0.06);
    this.burst(700, 1.2, 0.06, 0.09);
  };

  Audio.prototype.pop = function (strong) {
    if (!this.ready) return;
    var t = this.ctx.currentTime;
    if (t - this.lastPop < 0.05) return;
    this.lastPop = t;
    this.burst(180 + Math.random() * 120, 0.9, strong ? 0.34 : 0.18, 0.09, 'lowpass');
  };

  Audio.prototype.wastegate = function () {
    if (!this.ready) return;
    this.burst(2800, 0.8, 0.16, 0.30, 'highpass');
  };

  Audio.prototype.starter = function () {
    if (!this.ready) return;
    var t = this.ctx.currentTime;
    if (t - this.lastStarter < 0.35) return;
    this.lastStarter = t;
    this.burst(120, 0.8, 0.22, 0.25, 'lowpass');
  };

  Audio.prototype.scrape = function () {
    if (!this.ready) return;
    this.burst(900 + Math.random() * 600, 2.5, 0.07, 0.08);
  };

  Audio.prototype.gearDrop = function () {
    if (!this.ready) return;
    this.burst(320, 1.4, 0.2, 0.15, 'lowpass');
  };

  // ---- 领航员语音 ----
  Audio.prototype.speak = function (text, priority) {
    if (!this.voiceOn || !window.speechSynthesis) return;
    var now = performance.now();
    if (now - this.lastSpeak < 260 && !priority) return;
    this.lastSpeak = now;
    try {
      if (this.speechQueue.length > 2) {
        window.speechSynthesis.cancel();
        this.speechQueue.length = 0;
      }
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      u.rate = 1.45;
      u.pitch = 0.95;
      u.volume = 0.9 * this.volume;
      var self = this;
      u.onend = function () { self.speechQueue = self.speechQueue.filter(function (x) { return x !== u; }); };
      this.speechQueue.push(u);
      window.speechSynthesis.speak(u);
    } catch (e) { }
  };
  Audio.prototype.stopSpeech = function () {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    this.speechQueue.length = 0;
  };
})(typeof window !== 'undefined' ? window : globalThis);
