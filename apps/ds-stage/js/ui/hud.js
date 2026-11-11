/* hud.js — 极简高密度 HUD */
(function (root) {
  'use strict';
  var RG = root.RG = root.RG || {};
  var M = RG.M;

  RG.PART_NAME = {
    engine: '发动机', gearbox: '变速箱', steering: '转向', lights: '灯光', body: '车身',
    suspFL: '左前悬挂', suspFR: '右前悬挂', suspRL: '左后悬挂', suspRR: '右后悬挂',
    tireFL: '左前轮胎', tireFR: '右前轮胎', tireRL: '左后轮胎', tireRR: '右后轮胎'
  };

  function Hud() {
    var $ = function (id) { return document.getElementById(id); };
    this.el = {
      hud: $('hud'), stageName: $('hud-stage-name'), sp1: $('sp1'), sp2: $('sp2'),
      clock: $('hud-clock'), delta: $('hud-delta'), noteNext: $('note-next'), noteList: $('note-list'),
      speed: $('dash-speed'), gear: $('dash-gear'), rpm: $('dash-rpm'), boost: $('dash-boost'),
      rpmbar: document.querySelector('#rpmbar i'), prog: $('prog-fill'),
      flash: $('hud-flash'), warn: $('hud-warn'), mistakes: $('hud-mistakes'),
      loading: $('loading'), loadTitle: $('load-title')
    };
    this.dmg = {
      engine: $('dmg-engine'), gearbox: $('dmg-gearbox'), steering: $('dmg-steering'),
      lights: $('dmg-lights'), FL: $('dmg-fl'), FR: $('dmg-fr'), RL: $('dmg-rl'), RR: $('dmg-rr')
    };
    this.tick = 0;
    this.flashTimer = 0;
    this.lastMistake = '';
  }
  RG.Hud = Hud;

  Hud.prototype.setLoading = function (on, name) {
    if (!this.el.loading) return;
    this.el.loading.classList.toggle('hidden', !on);
    if (on && name) this.el.loadTitle.textContent = '生成 ' + name + ' …';
  };

  Hud.prototype.setStageInfo = function (spec) {
    this.el.stageName.textContent = spec.name + ' · ' + spec.surface;
    this.el.sp1.textContent = '--:--.--';
    this.el.sp2.textContent = '--:--.--';
    this.el.mistakes.textContent = '';
  };

  Hud.prototype.show = function (on) {
    this.el.hud.classList.toggle('hidden', !on);
  };

  Hud.prototype.flash = function (text) {
    this.el.flash.textContent = text;
    this.el.flash.classList.add('show');
    this.flashTimer = 1.6;
  };

  Hud.prototype.showSplit = function (idx, time, delta) {
    var el = idx === 0 ? this.el.sp1 : this.el.sp2;
    el.textContent = M.fmtTime(time);
    if (delta != null) {
      this.el.delta.textContent = '分段 ' + M.fmtDelta(delta);
      this.el.delta.style.color = delta < 0 ? 'var(--green)' : 'var(--red)';
    }
  };

  Hud.prototype.pushNote = function (note) {
    var txt = note.text + (note.sub ? ' ' + note.sub : '');
    this.el.noteNext.textContent = txt;
  };

  Hud.prototype.setNextNote = function (note) {
    if (!note) return;
    var txt = note.text + (note.sub ? ' ' + note.sub : '');
    if (this.el.noteNext.textContent !== txt) this.el.noteNext.textContent = txt;
  };

  Hud.prototype.setNoteList = function (notes, s) {
    var html = '';
    for (var i = 0; i < notes.length; i++) {
      var d = Math.max(0, notes[i].s - s);
      html += '<span>' + (notes[i].text + (notes[i].sub ? ' ' + notes[i].sub : '')) + ' · ' + Math.round(d) + 'm</span>';
    }
    if (this._lastList !== html) { this.el.noteList.innerHTML = html; this._lastList = html; }
  };

  Hud.prototype.addMistake = function (tag) {
    this.lastMistake = tag;
    this.el.mistakes.textContent = '✕ ' + tag;
  };

  Hud.prototype.update = function (g) {
    if (g.state === 'menu') return;
    this.tick++;
    if (this.flashTimer > 0) {
      this.flashTimer -= 1 / 60;
      if (this.flashTimer <= 0) this.el.flash.classList.remove('show');
    }
    if (this.tick % 2) return;
    var car = g.car, tel = car.telemetry();
    this.el.clock.textContent = M.fmtTime(g.time + (g.penalty || 0));
    this.el.speed.textContent = Math.round(tel.speed);
    this.el.gear.textContent = tel.gear === 0 ? 'N' : (tel.gear < 0 ? 'R' : tel.gear);
    this.el.rpm.textContent = Math.round(tel.rpm);
    this.el.boost.textContent = tel.boost.toFixed(1);
    this.el.rpmbar.style.width = Math.min(100, tel.rpm / 7600 * 100) + '%';
    this.el.rpmbar.style.background = tel.rpm > 6900 ? 'var(--red)' : (tel.rpm > 6000 ? 'var(--amber)' : 'var(--cyan)');
    this.el.prog.style.width = (car.distance / g.track.length * 100) + '%';
    // 损伤
    var d = g.damage;
    function col(v) {
      if (v > 0.66) return 'rgba(255,69,58,.85)';
      if (v > 0.25) return 'rgba(255,176,32,.8)';
      if (v > 0.05) return 'rgba(255,176,32,.35)';
      return 'rgba(52,211,153,.18)';
    }
    this.dmg.engine.style.fill = col(d.engine);
    this.dmg.gearbox.style.fill = col(d.gearbox);
    this.dmg.steering.style.fill = col(d.steering);
    this.dmg.lights.style.fill = col(d.lights);
    this.dmg.FL.style.fill = col(Math.max(d.suspFL, d.tireFL));
    this.dmg.FR.style.fill = col(Math.max(d.suspFR, d.tireFR));
    this.dmg.RL.style.fill = col(Math.max(d.suspRL, d.tireRL));
    this.dmg.RR.style.fill = col(Math.max(d.suspRR, d.tireRR));
    // 提示
    var warn = '';
    if (tel.stalled) warn = '熄火 · 按 K 重启（踩离合+油门也会重启）';
    else if (!car.wheels[2].contact) warn = '腾空';
    this.el.warn.textContent = warn;
    this.el.warn.style.opacity = warn ? 0.9 : 0;
    // 路书列表
    if (g.settings.noteStrip) {
      this.setNoteList(g.notesAhead(car.distance, 3), car.distance);
    } else {
      this.el.noteList.innerHTML = '';
    }
    this.el.noteNext.style.opacity = g.settings.noteStrip ? 1 : 0;
  };
})(typeof window !== 'undefined' ? window : globalThis);
