/* ui.js — 界面：赛段选择 / 调校 / 设置 / 暂停 / 结算 / 维修 */
(function (root) {
  'use strict';
  var RG = root.RG = root.RG || {};
  var M = RG.M;

  var TUNE_DEFS = [
    { key: 'final', label: '终传比', min: 3.4, max: 5.2, step: 0.02, dec: 2, desc: '大数值加速猛、极速低；小数值相反。' },
    { key: 'springF', label: '前弹簧硬度', min: 18000, max: 46000, step: 500, dec: 0, unit: 'N/m', desc: '更硬 → 转向响应快、路感颠、极限更突然。' },
    { key: 'springR', label: '后弹簧硬度', min: 16000, max: 42000, step: 500, dec: 0, unit: 'N/m', desc: '后弹簧偏硬会让车尾更活（容易甩尾）。' },
    { key: 'travelF', label: '前悬挂行程', min: 0.17, max: 0.30, step: 0.005, dec: 3, unit: 'm', desc: '行程长 → 落地更稳；太短会频繁触底。' },
    { key: 'travelR', label: '后悬挂行程', min: 0.17, max: 0.30, step: 0.005, dec: 3, unit: 'm' },
    { key: 'damperFR', label: '前回弹阻尼', min: 1600, max: 5200, step: 50, dec: 0, desc: '回弹太慢会让车身在连续颠簸里累积摇摆。' },
    { key: 'damperRR', label: '后回弹阻尼', min: 1400, max: 4800, step: 50, dec: 0 },
    { key: 'arbF', label: '前防倾杆', min: 0, max: 26000, step: 500, dec: 0, desc: '前杆硬 → 推头；后杆硬 → 甩尾。' },
    { key: 'arbR', label: '后防倾杆', min: 0, max: 24000, step: 500, dec: 0 },
    { key: 'drivetrainBias', label: '中央差速（前）', min: 0, max: 1, step: 0.01, dec: 2, desc: '0 = 纯后驱（给油就甩），1 = 纯前驱（推头），0.42 = 四驱。' },
    { key: 'centerCoupling', label: '中央耦合锁止', min: 0, max: 1, step: 0.01, dec: 2, desc: '越大越接近锁死，四轮互相拖拽，转向更迟钝但更稳。' },
    { key: 'lsdRear', label: '后桥限滑', min: 0, max: 26, step: 0.5, dec: 1, desc: '大 → 两后轮同步，甩尾更可控；小 → 内侧轮空转。' },
    { key: 'lsdFront', label: '前桥限滑', min: 0, max: 20, step: 0.5, dec: 1 },
    { key: 'brakeBias', label: '刹车前后比', min: 0.45, max: 0.82, step: 0.01, dec: 2, desc: '偏前稳定；偏后入弯更灵，也更容易锁后轮打转。' },
    { key: 'brakeMax', label: '刹车力矩', min: 3600, max: 7000, step: 100, dec: 0 },
    { key: 'tirePressure', label: '胎压', min: 1.6, max: 3.0, step: 0.05, dec: 2, unit: 'bar', desc: '过高/过低都掉抓地；砂石通常 2.0-2.2。' },
    { key: 'steeringLock', label: '转向锁角', min: 24, max: 40, step: 1, dec: 0, unit: '°', desc: '大角度更容易救车，也更容易打过头。' },
    { key: 'rideF', label: '前车身高度', min: -0.04, max: 0.04, step: 0.005, dec: 3, unit: 'm' },
    { key: 'rideR', label: '后车身高度', min: -0.04, max: 0.04, step: 0.005, dec: 3, unit: 'm' }
  ];

  function UI(game) {
    this.g = game;
    game.ui = this;
    this.screens = {};
    var self = this;
    ['title', 'stages', 'tuning', 'settings', 'pause', 'result', 'repair'].forEach(function (n) {
      self.screens[n] = document.getElementById('scr-' + n);
    });
    this.current = null;
    this.bind();
    this.buildStageList();
    this.buildTuning();
    this.buildSettings();
    this.show('title');
    game.hud.show(false);
    document.getElementById('touch').classList.add('hidden');
    if ('ontouchstart' in window && window.innerWidth < 1100) this.enableTouch();
  }
  RG.UI = UI;

  UI.prototype.show = function (name) {
    for (var k in this.screens) this.screens[k].classList.toggle('on', k === name);
    this.current = name;
    var inGame = (name === 'pause');
    this.g.hud.show(name === null || (name === 'pause'));
    if (name !== 'pause') this.g.hud.show(false);
  };

  UI.prototype.bind = function () {
    var self = this, g = this.g;
    document.getElementById('menus').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'rally') { self.startRally(); }
      else if (act === 'stages') self.show('stages');
      else if (act === 'tuning') { self.tuningFrom = self.current; self.show('tuning'); }
      else if (act === 'settings') { self.settingsFrom = self.current; self.show('settings'); }
      else if (act === 'back') {
        if (self.current === 'tuning' && self.tuningFrom === 'pause') self.show('pause');
        else if (self.current === 'settings' && self.settingsFrom === 'pause') self.show('pause');
        else self.show('title');
      }
      else if (act === 'resume') { g.state = 'running'; self.show(null); g.hud.show(true); }
      else if (act === 'restart') { self.show(null); g.restart(); }
      else if (act === 'quit') { self.quitToMenu(); }
      else if (act === 'retry') { self.show(null); g.loadStage(g.spec.id, { damage: RG.DEFAULT_DAMAGE() }); }
      else if (act === 'next') {
        if (self.g.rallyDone) { self.g.rally = null; self.g.rallyDone = false; self.show('title'); }
        else self.nextStage();
      }
      else if (act === 'tune-reset') { self.resetTuning(); }
      else if (act === 'tune-save') { self.saveTuning(); }
      else if (act === 'repair-done') { self.afterRepair(); }
    });
  };

  UI.prototype.showPause = function (on) {
    this.show(on ? 'pause' : null);
    this.g.hud.show(!on);
    if (on) this.syncSettings && this.syncSettings();
  };

  UI.prototype.hideLoading = function () {
    document.getElementById('loading').classList.add('hidden');
  };

  UI.prototype.quitToMenu = function () {
    this.g.state = 'menu';
    this.g.audio.stopSpeech();
    this.show('title');
    this.g.hud.show(false);
  };

  /* ---------------- 赛段 ---------------- */
  UI.prototype.buildStageList = function () {
    var el = document.getElementById('stage-list');
    var html = '';
    for (var i = 0; i < RG.STAGES.length; i++) {
      var s = RG.STAGES[i];
      var best = this.g.save.best[s.id];
      html += '<div class="stage-card" data-stage="' + s.id + '">' +
        '<div class="best">' + (best ? M.fmtTime(best.time) : '') + '</div>' +
        '<h3>' + s.name + '</h3><div class="en">' + s.en + '</div>' +
        '<div class="meta"><span class="badge">' + s.surface + '</span>' +
        '<span>' + weatherName(s.weather) + '</span><span>' + timeName(s.time) + '</span>' +
        '<span>' + (s.length / 1000).toFixed(1) + ' km</span></div>' +
        '<div class="desc">' + s.desc + '</div></div>';
    }
    el.innerHTML = html;
    var self = this;
    el.addEventListener('click', function (e) {
      var card = e.target.closest('[data-stage]');
      if (!card) return;
      self.g.rally = null; self.g.rallyDone = false;
      self.show(null);
      self.g.hud.show(true);
      self.g.startRun(card.getAttribute('data-stage'));
    });
  };
  function weatherName(w) { return { clear: '晴', rain: '雨', fog: '雾', snow: '雪' }[w] || w; }
  function timeName(t) { return { day: '白天', dusk: '黄昏', night: '夜间', dawn: '黎明' }[t] || t; }

  UI.prototype.startRally = function () {
    var g = this.g;
    g.rally = { order: RG.STAGES.map(function (s) { return s.id; }), idx: 0, budget: 300, spent: 0, total: 0, times: [] };
    this.show(null);
    g.hud.show(true);
    g.startRun(g.rally.order[0]);
  };

  UI.prototype.nextStage = function () {
    var g = this.g;
    if (!g.rally) { this.show('title'); return; }
    g.rally.idx++;
    g.rally.total += g.lastResultTime || 0;
    if (g.rally.idx >= g.rally.order.length) {
      this.showRallyEnd();
      return;
    }
    this.g.damage = g.damage;
    this.showRepair();
  };

  UI.prototype.showRallyEnd = function () {
    var g = this.g;
    var el = document.getElementById('res-title');
    el.textContent = '赛事完成';
    document.getElementById('res-time').textContent = M.fmtTime(g.rally.total);
    document.getElementById('res-sub').textContent = g.rally.order.length + ' 个赛段累计时间';
    var tbl = document.getElementById('res-table');
    var html = '';
    for (var i = 0; i < g.rally.times.length; i++) {
      html += '<tr><td>' + RG.stageById(g.rally.order[i]).name + '</td><td>' + M.fmtTime(g.rally.times[i]) + '</td></tr>';
    }
    tbl.innerHTML = html;
    document.getElementById('res-mistakes').innerHTML = '';
    this.show('result');
    document.querySelector('#scr-result [data-act="next"]').textContent = '返回主菜单';
    g.rallyDone = true;
  };

  /* ---------------- 结算 ---------------- */
  UI.prototype.showResult = function (res) {
    var g = this.g;
    g.lastResultTime = res.time;
    if (g.rally) { g.rally.times[g.rally.idx] = res.time; }
    document.getElementById('res-title').textContent = res.stage.name + ' · 完成';
    document.getElementById('res-time').textContent = M.fmtTime(res.time);
    var sub = '路面 ' + res.stage.surface + ' · ' + weatherName(res.stage.weather) + ' · ' + timeName(res.stage.time);
    if (res.penalty > 0.01) sub += ' · 罚时 +' + res.penalty.toFixed(1) + 's';
    if (res.prevBest != null) {
      var d = res.time - res.prevBest;
      sub += ' · ' + (res.isBest ? '个人最佳!' : '较最佳 ' + M.fmtDelta(d));
    } else sub += ' · 首个成绩';
    document.getElementById('res-sub').textContent = sub;
    var tbl = document.getElementById('res-table');
    var html = '<tr><td>分段 1</td><td>' + M.fmtTime(res.splits[0]) + '</td></tr>' +
      '<tr><td>分段 2</td><td>' + M.fmtTime(res.splits[1]) + '</td></tr>' +
      '<tr><td>终点</td><td>' + M.fmtTime(res.time) + '</td></tr>';
    var dmgCount = 0;
    for (var k in res.damage) if (res.damage[k] > 0.1) dmgCount++;
    html += '<tr><td>受损部位</td><td>' + dmgCount + '</td></tr>';
    tbl.innerHTML = html;
    var ul = document.getElementById('res-mistakes');
    if (!res.mistakes.length) ul.innerHTML = '<li>干净的一趟。</li>';
    else {
      ul.innerHTML = res.mistakes.map(function (m) {
        return '<li><span>' + m.tag + '</span><b>' + (m.s / 1000).toFixed(2) + ' km</b></li>';
      }).join('');
    }
    var nextBtn = document.querySelector('#scr-result [data-act="next"]');
    nextBtn.textContent = g.rally ? '继续' : '下一赛段';
    this.show('result');
  };

  /* ---------------- 维修 ---------------- */
  UI.prototype.showRepair = function () {
    var g = this.g;
    var grid = document.getElementById('repair-grid');
    var parts = ['engine', 'gearbox', 'steering', 'suspFL', 'suspFR', 'suspRL', 'suspRR', 'tireFL', 'tireFR', 'tireRL', 'tireRR', 'lights', 'body'];
    var html = '';
    var self = this;
    this._repairList = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], d = g.damage[p];
      if (d < 0.02) continue;
      var cost = g.repairCost(p, d);
      html += '<div class="repair-item"><div><div>' + RG.PART_NAME[p] + '</div>' +
        '<div class="bar"><i style="width:' + Math.round(d * 100) + '%"></i></div></div>' +
        '<button data-repair="' + p + '" data-cost="' + cost + '">修 ' + cost + 's</button></div>';
    }
    if (!html) html = '<div class="repair-item">车况良好，无需维修</div>';
    grid.innerHTML = html;
    document.getElementById('repair-budget').textContent = M.fmtTime(Math.max(0, g.rally.budget - g.rally.spent)).slice(0, 5);
    document.getElementById('repair-cost').textContent = '已用 ' + g.rally.spent + ' 秒';
    grid.onclick = function (e) {
      var b = e.target.closest('[data-repair]');
      if (!b) return;
      var p = b.getAttribute('data-repair');
      var cost = parseInt(b.getAttribute('data-cost'), 10);
      if (g.rally.spent + cost > g.rally.budget) return;
      g.damage[p] = 0;
      g.rally.spent += cost;
      self.showRepair();
    };
    this.show('repair');
  };

  UI.prototype.afterRepair = function () {
    var g = this.g;
    this.show(null);
    g.hud.show(true);
    g.startRun(g.rally.order[g.rally.idx], { damage: g.damage });
  };

  /* ---------------- 调校 ---------------- */
  UI.prototype.buildTuning = function () {
    var self = this, g = this.g;
    var grid = document.getElementById('tune-grid');
    var html = '';
    // 轮胎类型
    html += '<div class="tune-row"><label><span>轮胎类型</span></label>' +
      '<select id="tire-type"><option value="gravel">砂石胎</option><option value="tarmac">干地柏油胎</option><option value="snow">雪胎（带钉）</option></select>' +
      '<div class="desc">砂石胎全能；柏油胎在铺装路面抓地高，砂石上很差；雪胎只在雪地有效。</div></div>';
    for (var i = 0; i < TUNE_DEFS.length; i++) {
      var d = TUNE_DEFS[i];
      html += '<div class="tune-row"><label><span>' + d.label + '</span><b id="tv-' + d.key + '"></b></label>' +
        '<input type="range" id="tr-' + d.key + '" min="' + d.min + '" max="' + d.max + '" step="' + d.step + '">' +
        (d.desc ? '<div class="desc">' + d.desc + '</div>' : '') + '</div>';
    }
    grid.innerHTML = html;
    var sync = function () {
      for (var j = 0; j < TUNE_DEFS.length; j++) {
        var df = TUNE_DEFS[j];
        var v = g.tuning[df.key];
        document.getElementById('tr-' + df.key).value = v;
        document.getElementById('tv-' + df.key).textContent = (+v).toFixed(df.dec) + (df.unit || '');
      }
      document.getElementById('tire-type').value = g.tuning.tireType;
    };
    this.syncTuning = sync;
    grid.addEventListener('input', function (e) {
      var id = e.target.id;
      if (id === 'tire-type') { g.tuning.tireType = e.target.value; return; }
      if (id.indexOf('tr-') === 0) {
        var key = id.slice(3);
        var v = parseFloat(e.target.value);
        g.tuning[key] = v;
        for (var j = 0; j < TUNE_DEFS.length; j++) if (TUNE_DEFS[j].key === key) {
          document.getElementById('tv-' + key).textContent = v.toFixed(TUNE_DEFS[j].dec) + (TUNE_DEFS[j].unit || '');
        }
      }
    });
    sync();
  };

  UI.prototype.resetTuning = function () {
    this.g.tuning = Object.assign({}, RG.DEFAULT_TUNING);
    this.syncTuning();
  };
  UI.prototype.saveTuning = function () {
    var id = this.g.spec ? this.g.spec.id : RG.STAGES[0].id;
    this.g.save.tuning[id] = Object.assign({}, this.g.tuning);
    this.g.persist();
    this.g.hud.flash('调校已保存');
  };

  /* ---------------- 设置 ---------------- */
  UI.prototype.buildSettings = function () {
    var g = this.g, self = this;
    var grid = document.getElementById('set-grid');
    var items = [
      { k: 'leadTime', label: '路书提前量', min: 1.0, max: 4.0, step: 0.1, dec: 1, unit: 's', group: 'set', desc: '越大报得越早。太快会忘，太慢来不及。' },
      { k: 'volume', label: '音量', min: 0, max: 1, step: 0.02, dec: 2, group: 'set' },
      { k: 'steerSens', label: '转向灵敏度', min: 0.5, max: 1.6, step: 0.05, dec: 2, group: 'input' },
      { k: 'deadzone', label: '摇杆死区', min: 0, max: 0.3, step: 0.01, dec: 2, group: 'input' },
      { k: 'linearity', label: '输入线性度', min: 0.7, max: 2.5, step: 0.05, dec: 2, group: 'input', desc: '越大越线性（小动作更细腻）。' },
      { k: 'throttleCurve', label: '油门曲线', min: 0.6, max: 2.0, step: 0.05, dec: 2, group: 'input' },
      { k: 'brakeCurve', label: '刹车曲线', min: 0.6, max: 2.0, step: 0.05, dec: 2, group: 'input' }
    ];
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var d = items[i];
      html += '<div class="tune-row"><label><span>' + d.label + '</span><b id="sv-' + d.k + '"></b></label>' +
        '<input type="range" id="sr-' + d.k + '" min="' + d.min + '" max="' + d.max + '" step="' + d.step + '">' +
        (d.desc ? '<div class="desc">' + d.desc + '</div>' : '') + '</div>';
    }
    html += '<div class="tune-row"><label><span>语音播报</span></label><select id="sr-voice"><option value="1">开</option><option value="0">关</option></select></div>';
    html += '<div class="tune-row"><label><span>屏幕路书</span></label><select id="sr-notes"><option value="1">开</option><option value="0">关</option></select></div>';
    html += '<div class="tune-row"><label><span>后视镜（座舱视角）</span></label><select id="sr-mirror"><option value="1">开</option><option value="0">关</option></select></div>';
    html += '<div class="tune-row"><label><span>幽灵车</span></label><select id="sr-ghost"><option value="1">开</option><option value="0">关</option></select></div>';
    html += '<div class="tune-row"><label><span>画质</span></label><select id="sr-quality"><option value="1">高</option><option value="0.75">中</option><option value="0.6">低</option></select></div>';
    grid.innerHTML = html;
    var sync = function () {
      for (var j = 0; j < items.length; j++) {
        var df = items[j];
        var v = df.group === 'input' ? g.input.settings[df.k] : g.settings[df.k];
        document.getElementById('sr-' + df.k).value = v;
        document.getElementById('sv-' + df.k).textContent = (+v).toFixed(df.dec) + (df.unit || '');
      }
      document.getElementById('sr-voice').value = g.settings.voice ? '1' : '0';
      document.getElementById('sr-notes').value = g.settings.noteStrip ? '1' : '0';
      document.getElementById('sr-mirror').value = g.settings.mirror ? '1' : '0';
      document.getElementById('sr-ghost').value = g.settings.showGhost ? '1' : '0';
      document.getElementById('sr-quality').value = String(g.renderer.quality);
    };
    this.syncSettings = sync;
    grid.addEventListener('input', function (e) {
      var id = e.target.id;
      if (id === 'sr-voice') { g.settings.voice = e.target.value === '1'; g.audio.voiceOn = g.settings.voice; return; }
      if (id === 'sr-notes') { g.settings.noteStrip = e.target.value === '1'; return; }
      if (id === 'sr-mirror') { g.settings.mirror = e.target.value === '1'; return; }
      if (id === 'sr-ghost') { g.settings.showGhost = e.target.value === '1'; return; }
      if (id === 'sr-quality') { g.renderer.quality = parseFloat(e.target.value); g.renderer.resize(); return; }
      if (id.indexOf('sr-') === 0) {
        var key = id.slice(3);
        var v = parseFloat(e.target.value);
        var item = null;
        for (var j = 0; j < items.length; j++) if (items[j].k === key) item = items[j];
        if (!item) return;
        if (item.group === 'input') g.input.settings[key] = v; else g.settings[key] = v;
        document.getElementById('sv-' + key).textContent = v.toFixed(item.dec) + (item.unit || '');
        if (key === 'volume') g.audio.setVolume(v);
      }
    });
    sync();
  };

  /* ---------------- 触屏 ---------------- */
  UI.prototype.enableTouch = function () {
    var el = document.getElementById('touch');
    el.classList.remove('hidden');
    this.g.input.bindTouch({
      left: document.getElementById('t-left'), right: document.getElementById('t-right'),
      thr: document.getElementById('t-thr'), brk: document.getElementById('t-brk'),
      hb: document.getElementById('t-hb'), up: document.getElementById('t-up'), down: document.getElementById('t-down')
    });
    this.g.input.touch.active = true;
  };
})(typeof window !== 'undefined' ? window : globalThis);
