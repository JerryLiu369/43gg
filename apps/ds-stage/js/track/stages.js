/* stages.js — 赛段表。所有赛段程序化生成，这里只给“配方” */
(function (root) {
  'use strict';
  var RG = root.RG = root.RG || {};

  RG.STAGES = [
    {
      id: 'kettle',
      name: '铁砧岭',
      en: 'KETTLE RIDGE',
      length: 6100,
      seed: 20240517,
      terrain: { forest: 0.75, village: 0.15, ridge: 0.6, open: 0.4 },
      tarmacBias: 0.02,
      snowBias: 0,
      treeDensity: 0.72,
      weather: 'clear',
      time: 'day',
      wet: false,
      surface: '砂石',
      desc: '经典砾石高速段。长跳坡与三档盲弯，右侧山脊无护栏。',
      note: '抓地力中等，跳坡落地要留出悬挂行程。'
    },
    {
      id: 'stonebridge',
      name: '石桥村',
      en: 'STONEBRIDGE',
      length: 5400,
      seed: 771203,
      terrain: { forest: 0.35, village: 1.0, ridge: 0.3, open: 0.6 },
      tarmacBias: 0.45,
      snowBias: 0,
      treeDensity: 0.45,
      weather: 'clear',
      time: 'dusk',
      wet: false,
      surface: '砂石 / 柏油',
      desc: '黄昏村道。石块院墙贴边，柏油与砾石反复切换，窄桥只容一车。',
      note: '砂石带上柏油后抓地骤降，注意“脏路”。'
    },
    {
      id: 'pineneedle',
      name: '松针夜路',
      en: 'PINE NEEDLE',
      length: 6400,
      seed: 31337,
      terrain: { forest: 1.0, village: 0.05, ridge: 0.5, open: 0.2 },
      tarmacBias: 0.05,
      snowBias: 0,
      treeDensity: 0.95,
      weather: 'fog',
      time: 'night',
      wet: true,
      surface: '砂石',
      desc: '深夜林道，车灯是唯一光源。树墙紧贴路面，雾让远光变成一堵白墙。',
      note: '只相信路书，不要相信眼睛。'
    },
    {
      id: 'glacier',
      name: '冰川隘口',
      en: 'GLACIER PASS',
      length: 6600,
      seed: 90210,
      terrain: { forest: 0.25, village: 0.1, ridge: 0.9, open: 0.8 },
      tarmacBias: 0.0,
      snowBias: 1.0,
      treeDensity: 0.30,
      weather: 'snow',
      time: 'day',
      wet: true,
      surface: '雪地',
      desc: '风雪隘口。雪墙与深沟之间只有一条压出来的车辙，刹车距离翻倍。',
      note: '雪地要提前两倍距离刹车，方向要“喂”进去。'
    },
    {
      id: 'rainvalley',
      name: '雨谷',
      en: 'RAIN VALLEY',
      length: 5800,
      seed: 555001,
      terrain: { forest: 0.5, village: 0.5, ridge: 0.4, open: 0.5 },
      tarmacBias: 0.9,
      snowBias: 0,
      treeDensity: 0.5,
      weather: 'rain',
      time: 'day',
      wet: true,
      surface: '柏油（湿）',
      desc: '暴雨中的山路柏油。积水成片，出弯给油就要和车尾谈判。',
      note: '湿柏油峰值高但很窄，压到积水会瞬间失去方向。'
    },
    {
      id: 'hoarfrost',
      name: '雾凇林',
      en: 'HOARFROST',
      length: 6000,
      seed: 8080808,
      terrain: { forest: 0.9, village: 0.2, ridge: 0.6, open: 0.3 },
      tarmacBias: 0.1,
      snowBias: 0.55,
      treeDensity: 0.85,
      weather: 'fog',
      time: 'dawn',
      wet: true,
      surface: '雪泥 / 砾石',
      desc: '黎明薄雾，半融的雪泥盖住砾石。路面在两种抓地之间来回跳。',
      note: '雪泥上重刹会推头，用重心转移代替方向。'
    }
  ];

  RG.stageById = function (id) {
    for (var i = 0; i < RG.STAGES.length; i++) if (RG.STAGES[i].id === id) return RG.STAGES[i];
    return RG.STAGES[0];
  };
})(typeof window !== 'undefined' ? window : globalThis);
