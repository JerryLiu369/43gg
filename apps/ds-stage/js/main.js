/* main.js — 启动 */
(function (root) {
  'use strict';
  var RG = root.RG;

  // 错误收集（便于自动化测试与玩家反馈）
  window.__errors = [];
  window.addEventListener('error', function (e) {
    window.__errors.push((e.message || '') + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno);
    var d = document.getElementById('errlog');
    if (!d) { d = document.createElement('div'); d.id = 'errlog'; d.style.display = 'none'; document.body.appendChild(d); }
    d.textContent = window.__errors.join(' | ');
  });

  function boot() {
    var canvas = document.getElementById('gl');
    var game;
    try {
      game = new RG.Game({ canvas: canvas });
    } catch (e) {
      document.body.innerHTML = '<div style="color:#fff;font:14px monospace;padding:40px;line-height:2">' +
        '无法初始化 WebGL。<br>' + (e && e.message ? e.message : e) + '</div>';
      return;
    }
    var ui = new RG.UI(game);
    root.RG.game = game;
    root.RG.ui = ui;

    // 音频需要在用户手势后启动
    function unlock() {
      game.audio.start();
      game.audio.setVolume(game.settings.volume);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    }
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    var last = 0;
    function loop(t) {
      game.frame(t);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    // 触屏
    if ('ontouchstart' in window && Math.min(window.innerWidth, window.innerHeight) < 900) {
      ui.enableTouch();
    }
    // 调试/测试入口: ?stage=kettle&cam=0&t=0
    try {
      var qs = new URLSearchParams(location.search);
      var st = qs.get('stage');
      if (st) {
        var cam = parseInt(qs.get('cam') || '0', 10);
        game.camMode = isNaN(cam) ? 0 : cam;
        ui.show(null);
        game.hud.show(true);
        game.startRun(st);
      }
    } catch (e) { }

    // 页面隐藏时自动暂停
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && game.state === 'running') game.pause();
    });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
  else window.addEventListener('DOMContentLoaded', boot);
})(typeof window !== 'undefined' ? window : globalThis);
