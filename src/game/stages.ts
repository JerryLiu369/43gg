import type {
  PacenoteItem,
  RoadsideProp,
  StageDefinition,
  StageSegment,
  SurfaceType,
  TimeOfDay,
  TireCompound,
  WeatherType,
} from './types.ts';

interface BlueprintFeature {
  startM: number;
  endM: number;
  curvature: number; // rad/m (+ right turn, - left turn)
  slope: number; // dy/ds
  widthM?: number;
  surface?: SurfaceType;
  camberRad?: number;
  scenery?: 'forest' | 'cliff' | 'village' | 'bridge' | 'lake' | 'crest';
  note?: {
    type: PacenoteItem['type'];
    severity: PacenoteItem['severity'];
    direction: PacenoteItem['direction'];
    modifier?: string;
    calloutTextZh: string;
    calloutSpeechZh: string;
  };
}

interface StageBlueprint {
  id: string;
  code: string;
  nameZh: string;
  nameEn: string;
  country: string;
  lengthM: number;
  primarySurface: SurfaceType;
  surfaceMixLabel: string;
  defaultWeather: WeatherType;
  defaultTimeOfDay: TimeOfDay;
  recommendedTire: TireCompound;
  elevationGainM: number;
  descriptionZh: string;
  targetParTimeSec: number;
  defaultWidthM: number;
  seed: number;
  features: BlueprintFeature[];
}

function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getSurfaceRoughness(surface: SurfaceType): number {
  switch (surface) {
    case 'gravel':
      return 0.036;
    case 'tarmac':
      return 0.008;
    case 'tarmac_dirty':
      return 0.022;
    case 'snow':
      return 0.028;
    case 'ice':
      return 0.012;
    case 'water_puddle':
      return 0.032;
    case 'offtrack':
      return 0.095;
  }
}

const STAGE_BLUEPRINTS: StageBlueprint[] = [
  {
    id: 'wales_gravel',
    code: 'SS01',
    nameZh: '哈弗伦林道 · 威尔士',
    nameEn: 'Hafren Forest Sweet Lamb',
    country: 'UK · Wales',
    lengthM: 3800,
    primarySurface: 'gravel',
    surfaceMixLabel: '78% 湿润砂石 · 14% 泥水坑 · 8% 窄木桥',
    defaultWeather: 'rain',
    defaultTimeOfDay: 'day',
    recommendedTire: 'gravel',
    elevationGainM: 148,
    descriptionZh:
      '经典英伦高抓地湿砂石林道。包含高速起伏盲坡、涉水低洼、连续 S 弯、林间窄木桥与山脊回头弯，极其考验重心转移与提前钟摆入弯。',
    targetParTimeSec: 235,
    defaultWidthM: 7.4,
    seed: 1042,
    features: [
      {
        startM: 110,
        endM: 250,
        curvature: 0.0065,
        slope: 0.03,
        camberRad: -0.04,
        note: {
          type: 'right_5',
          severity: 5,
          direction: 'right',
          calloutTextZh: '右 5 长弯 · 上坡全油',
          calloutSpeechZh: '右五长弯，上坡全油',
        },
      },
      {
        startM: 290,
        endM: 420,
        curvature: -0.011,
        slope: 0.055,
        note: {
          type: 'left_4',
          severity: 4,
          direction: 'left',
          modifier: '盲坡顶 (Crest)',
          calloutTextZh: '左 4 过盲坡顶 · 保持内线',
          calloutSpeechZh: '左四过盲坡顶，保持内线',
        },
      },
      {
        startM: 430,
        endM: 520,
        curvature: 0.0,
        slope: -0.075,
        scenery: 'crest',
        note: {
          type: 'jump',
          severity: 0,
          direction: 'center',
          modifier: '跳坡 (Big Jump)',
          calloutTextZh: '大跳坡下坠 · 摆正车身！',
          calloutSpeechZh: '注意，大跳坡下坠，摆正车身',
        },
      },
      {
        startM: 580,
        endM: 760,
        curvature: 0.0185,
        slope: -0.02,
        note: {
          type: 'right_3',
          severity: 3,
          direction: 'right',
          modifier: '收紧 (Tightens)',
          calloutTextZh: '右 3 收紧成右 2 · 勿切内侧岩石',
          calloutSpeechZh: '右三收紧成右二，勿切岩石',
        },
      },
      {
        startM: 810,
        endM: 940,
        curvature: 0.0,
        slope: -0.01,
        surface: 'water_puddle',
        note: {
          type: 'water_splash',
          severity: 0,
          direction: 'center',
          modifier: '涉水 (Water Splash)',
          calloutTextZh: '涉水坑积水 · 抓地骤降',
          calloutSpeechZh: '前方涉水坑，抓地下降',
        },
      },
      {
        startM: 980,
        endM: 1120,
        curvature: -0.032,
        slope: 0.04,
        widthM: 6.4,
        scenery: 'cliff',
        note: {
          type: 'hairpin_left',
          severity: 1,
          direction: 'left',
          modifier: '手刹 (Handbrake)',
          calloutTextZh: '左 1 发夹弯上坡 · 拉手刹甩尾',
          calloutSpeechZh: '左一发夹弯上坡，拉手刹',
        },
      },
      {
        startM: 1200,
        endM: 1360,
        curvature: 0.014,
        slope: 0.02,
        note: {
          type: 'right_4',
          severity: 4,
          direction: 'right',
          calloutTextZh: '右 4 接左 4 连续 S 弯',
          calloutSpeechZh: '右四接左四连续S弯',
        },
      },
      {
        startM: 1365,
        endM: 1520,
        curvature: -0.015,
        slope: -0.01,
        note: {
          type: 'left_4',
          severity: 4,
          direction: 'left',
          calloutTextZh: '左 4 变宽出弯 · 接长直道',
          calloutSpeechZh: '左四变宽，接长直道',
        },
      },
      {
        startM: 1620,
        endM: 1750,
        curvature: 0.0,
        slope: 0.0,
        widthM: 4.5,
        surface: 'tarmac_dirty',
        scenery: 'bridge',
        note: {
          type: 'narrow_bridge',
          severity: 2,
          direction: 'center',
          modifier: '窄木桥 (4.5m)',
          calloutTextZh: '警告！极窄木桥 · 严禁偏航',
          calloutSpeechZh: '小心，极窄木桥，对准桥面',
        },
      },
      {
        startM: 1840,
        endM: 2010,
        curvature: 0.024,
        slope: 0.05,
        scenery: 'cliff',
        note: {
          type: 'right_2',
          severity: 2,
          direction: 'right',
          modifier: '外侧悬崖',
          calloutTextZh: '右 2 急弯 · 外侧悬崖深沟',
          calloutSpeechZh: '右二急弯，外侧悬崖',
        },
      },
      {
        startM: 2120,
        endM: 2320,
        curvature: -0.008,
        slope: 0.06,
        scenery: 'crest',
        note: {
          type: 'left_5',
          severity: 5,
          direction: 'left',
          modifier: '双连跳坡',
          calloutTextZh: '左 5 盲弯接小跳坡 · 全油通过',
          calloutSpeechZh: '左五盲弯接小跳坡，全油',
        },
      },
      {
        startM: 2330,
        endM: 2430,
        curvature: 0.0,
        slope: -0.065,
        scenery: 'crest',
      },
      {
        startM: 2520,
        endM: 2710,
        curvature: -0.021,
        slope: -0.03,
        widthM: 5.8,
        note: {
          type: 'left_2',
          severity: 2,
          direction: 'left',
          modifier: '收紧 (Tightens)',
          calloutTextZh: '下坡左 2 收紧 · 提前重刹！',
          calloutSpeechZh: '下坡左二收紧，提前重刹',
        },
      },
      {
        startM: 2800,
        endM: 2960,
        curvature: 0.034,
        slope: 0.01,
        note: {
          type: 'hairpin_right',
          severity: 1,
          direction: 'right',
          calloutTextZh: '右 1 发夹弯 · 绕木桩',
          calloutSpeechZh: '右一发夹弯，绕木桩',
        },
      },
      {
        startM: 3060,
        endM: 3250,
        curvature: -0.013,
        slope: 0.02,
        surface: 'water_puddle',
        note: {
          type: 'left_4',
          severity: 4,
          direction: 'left',
          modifier: '泥水车辙',
          calloutTextZh: '左 4 泥水深车辙 · 稳住方向',
          calloutSpeechZh: '左四泥水车辙，稳住方向',
        },
      },
      {
        startM: 3350,
        endM: 3560,
        curvature: 0.009,
        slope: -0.02,
        note: {
          type: 'right_5',
          severity: 5,
          direction: 'right',
          calloutTextZh: '右 5 高速冲刺 · 终点前 200 米',
          calloutSpeechZh: '右五全油，准备冲线',
        },
      },
      {
        startM: 3650,
        endM: 3800,
        curvature: 0.0,
        slope: 0.0,
        note: {
          type: 'finish',
          severity: 0,
          direction: 'center',
          calloutTextZh: '全油冲过终点计时点 (Flying Finish)',
          calloutSpeechZh: '全油冲线，到达终点',
        },
      },
    ],
  },
  {
    id: 'turini_tarmac',
    code: 'SS02',
    nameZh: '图里尼山口 · 摩纳哥',
    nameEn: 'Col de Turini Dusk Ascent',
    country: 'Monaco · Alpes-Maritimes',
    lengthM: 4000,
    primarySurface: 'tarmac',
    surfaceMixLabel: '62% 山地柏油 · 26% 带脏砂石柏油 · 12% 山顶暗冰',
    defaultWeather: 'clear',
    defaultTimeOfDay: 'dusk',
    recommendedTire: 'tarmac_dry',
    elevationGainM: 225,
    descriptionZh:
      '黄昏低角度夕阳下的阿尔卑斯传奇山路。高抓地柏油路面夹杂前车切弯带出的脏砂石（抓地骤降），穿过狭窄石头村庄巷道、石拱桥与高海拔结冰发夹弯。',
    targetParTimeSec: 240,
    defaultWidthM: 6.8,
    seed: 2088,
    features: [
      {
        startM: 100,
        endM: 280,
        curvature: -0.009,
        slope: 0.045,
        note: {
          type: 'left_5',
          severity: 5,
          direction: 'left',
          calloutTextZh: '左 5 柏油上山 · 抓地良好',
          calloutSpeechZh: '左五柏油上山，全油',
        },
      },
      {
        startM: 340,
        endM: 510,
        curvature: 0.022,
        slope: 0.05,
        surface: 'tarmac_dirty',
        note: {
          type: 'right_2',
          severity: 2,
          direction: 'right',
          modifier: '脏路砂石 (Dirty Tarmac)',
          calloutTextZh: '右 2 路面带脏砂石 · 警惕推头！',
          calloutSpeechZh: '右二路面有砂石，小心推头',
        },
      },
      {
        startM: 580,
        endM: 760,
        curvature: -0.035,
        slope: 0.06,
        scenery: 'cliff',
        note: {
          type: 'hairpin_left',
          severity: 1,
          direction: 'left',
          modifier: '悬崖石墙',
          calloutTextZh: '左 1 上坡发夹弯 · 贴内侧石墙',
          calloutSpeechZh: '左一上坡发夹弯，贴内侧',
        },
      },
      {
        startM: 860,
        endM: 1120,
        curvature: 0.012,
        slope: 0.01,
        widthM: 4.6,
        scenery: 'village',
        note: {
          type: 'square_right',
          severity: 2,
          direction: 'right',
          modifier: '村庄窄巷 (4.6m)',
          calloutTextZh: '进入石头村庄窄巷 · 右直角弯',
          calloutSpeechZh: '进村庄窄巷，右直角弯，路极窄',
        },
      },
      {
        startM: 1130,
        endM: 1310,
        curvature: -0.016,
        slope: -0.02,
        widthM: 4.8,
        scenery: 'village',
        note: {
          type: 'left_3',
          severity: 3,
          direction: 'left',
          modifier: '贴房角',
          calloutTextZh: '左 3 穿出村庄 · 接石拱窄桥',
          calloutSpeechZh: '左三出村庄，接石拱窄桥',
        },
      },
      {
        startM: 1360,
        endM: 1490,
        curvature: 0.0,
        slope: 0.0,
        widthM: 4.4,
        scenery: 'bridge',
        note: {
          type: 'narrow_bridge',
          severity: 2,
          direction: 'center',
          modifier: '石拱桥',
          calloutTextZh: '古老石拱窄桥 · 两侧石护栏',
          calloutSpeechZh: '通过石拱窄桥，小心护栏',
        },
      },
      {
        startM: 1580,
        endM: 1820,
        curvature: 0.016,
        slope: 0.055,
        surface: 'tarmac_dirty',
        scenery: 'cliff',
        note: {
          type: 'right_3',
          severity: 3,
          direction: 'right',
          modifier: '脏柏油 (Dirty)',
          calloutTextZh: '右 3 长弯 · 满地砂石脏路',
          calloutSpeechZh: '右三长弯，路面很脏',
        },
      },
      {
        startM: 1920,
        endM: 2100,
        curvature: -0.018,
        slope: 0.06,
        note: {
          type: 'left_3',
          severity: 3,
          direction: 'left',
          calloutTextZh: '左 3 接右 1 连续山脊回头弯',
          calloutSpeechZh: '左三接右一发夹弯',
        },
      },
      {
        startM: 2150,
        endM: 2320,
        curvature: 0.036,
        slope: 0.065,
        scenery: 'cliff',
        note: {
          type: 'hairpin_right',
          severity: 1,
          direction: 'right',
          calloutTextZh: '右 1 陡坡发夹弯 · 半联动防熄火',
          calloutSpeechZh: '右一陡坡发夹弯，小心低转熄火',
        },
      },
      {
        startM: 2450,
        endM: 2720,
        curvature: -0.012,
        slope: 0.04,
        surface: 'ice',
        scenery: 'cliff',
        note: {
          type: 'surface_change',
          severity: 2,
          direction: 'left',
          modifier: '背阴暗冰 (Black Ice)',
          calloutTextZh: '警告！高海拔背阴暗冰 · 左 4 极滑',
          calloutSpeechZh: '注意暗冰！左四路面结冰极滑',
        },
      },
      {
        startM: 2800,
        endM: 3020,
        curvature: 0.025,
        slope: -0.04,
        surface: 'ice',
        note: {
          type: 'right_2',
          severity: 2,
          direction: 'right',
          modifier: '冰面下坡',
          calloutTextZh: '右 2 冰面下坡 · 轻点刹车切勿抱死',
          calloutSpeechZh: '右二冰面下坡，轻踩刹车',
        },
      },
      {
        startM: 3120,
        endM: 3420,
        curvature: -0.015,
        slope: -0.03,
        surface: 'tarmac_dirty',
        note: {
          type: 'left_3',
          severity: 3,
          direction: 'left',
          calloutTextZh: '回到柏油 · 左 3 接右 4 高速弯',
          calloutSpeechZh: '回到柏油，左三接右四',
        },
      },
      {
        startM: 3450,
        endM: 3720,
        curvature: 0.01,
        slope: -0.01,
        note: {
          type: 'right_4',
          severity: 4,
          direction: 'right',
          calloutTextZh: '右 4 变宽全油 · 冲向山口终点',
          calloutSpeechZh: '右四变宽全油，准备冲线',
        },
      },
      {
        startM: 3820,
        endM: 4000,
        curvature: 0.0,
        slope: 0.0,
        note: {
          type: 'finish',
          severity: 0,
          direction: 'center',
          calloutTextZh: '全油冲线 · 图里尼山口计时点',
          calloutSpeechZh: '冲过终点',
        },
      },
    ],
  },
  {
    id: 'sweden_snow',
    code: 'SS03',
    nameZh: '韦姆兰冰湖 · 瑞典',
    nameEn: 'Vargasen & Colin’s Crest',
    country: 'Sweden · Värmland',
    lengthM: 3900,
    primarySurface: 'snow',
    surfaceMixLabel: '68% 压实雪道 · 32% 冰湖镜面冰层',
    defaultWeather: 'snow',
    defaultTimeOfDay: 'day',
    recommendedTire: 'snow',
    elevationGainM: 115,
    descriptionZh:
      '漫天风雪中的北欧高速冰雪赛段。包含著名的“科林飞跳（Colin’s Crest）”长距离飞跃、白桦林连续高速 S 弯与冰湖镜面纯冰区，必须提前利用丹麦钟摆建立滑移角。',
    targetParTimeSec: 228,
    defaultWidthM: 7.6,
    seed: 3099,
    features: [
      {
        startM: 100,
        endM: 300,
        curvature: 0.011,
        slope: 0.02,
        note: {
          type: 'right_4',
          severity: 4,
          direction: 'right',
          calloutTextZh: '右 4 雪道 · 顺雪墙滑移入弯',
          calloutSpeechZh: '右四雪道，保持节奏',
        },
      },
      {
        startM: 320,
        endM: 520,
        curvature: -0.012,
        slope: 0.03,
        note: {
          type: 'left_4',
          severity: 4,
          direction: 'left',
          calloutTextZh: '左 4 接右 5 连续白桦林节奏弯',
          calloutSpeechZh: '左四接右五连续弯',
        },
      },
      {
        startM: 560,
        endM: 720,
        curvature: 0.0,
        slope: 0.075,
        scenery: 'crest',
        note: {
          type: 'jump',
          severity: 0,
          direction: 'center',
          modifier: '科林飞跳 (Colin’s Crest)',
          calloutTextZh: '盲坡顶全油长飞跳 (Colin’s Crest)！',
          calloutSpeechZh: '前方科林飞跳，对准正中全油起跳',
        },
      },
      {
        startM: 725,
        endM: 880,
        curvature: 0.0,
        slope: -0.08,
        scenery: 'crest',
      },
      {
        startM: 940,
        endM: 1160,
        curvature: -0.022,
        slope: -0.01,
        note: {
          type: 'left_2',
          severity: 2,
          direction: 'left',
          calloutTextZh: '落地即刹！左 2 急弯雪墙',
          calloutSpeechZh: '落地重刹，左二急弯',
        },
      },
      {
        startM: 1260,
        endM: 1620,
        curvature: 0.015,
        slope: 0.0,
        surface: 'ice',
        scenery: 'lake',
        note: {
          type: 'surface_change',
          severity: 3,
          direction: 'right',
          modifier: '冰湖镜面 (Pure Ice)',
          calloutTextZh: '驶入冰湖镜面纯冰区 · 右 3 长飘移',
          calloutSpeechZh: '进入冰湖纯冰面，右三长弯极滑',
        },
      },
      {
        startM: 1650,
        endM: 1920,
        curvature: -0.028,
        slope: 0.0,
        surface: 'ice',
        scenery: 'lake',
        note: {
          type: 'hairpin_left',
          severity: 1,
          direction: 'left',
          modifier: '冰湖回头弯',
          calloutTextZh: '左 1 冰面大回头 · 反打方向给油救车',
          calloutSpeechZh: '左一冰面发夹弯，反打方向维持滑移',
        },
      },
      {
        startM: 2020,
        endM: 2160,
        curvature: 0.0,
        slope: 0.02,
        widthM: 4.8,
        scenery: 'bridge',
        note: {
          type: 'narrow_bridge',
          severity: 2,
          direction: 'center',
          modifier: '冰河木桥',
          calloutTextZh: '窄桥跨越冰河 · 提前回正车头',
          calloutSpeechZh: '前方冰河窄桥，提前回正车头',
        },
      },
      {
        startM: 2260,
        endM: 2520,
        curvature: 0.018,
        slope: 0.04,
        note: {
          type: 'right_3',
          severity: 3,
          direction: 'right',
          calloutTextZh: '右 3 上坡深雪车辙 · 接左 3',
          calloutSpeechZh: '右三上坡深雪，接左三',
        },
      },
      {
        startM: 2540,
        endM: 2780,
        curvature: -0.018,
        slope: -0.03,
        note: {
          type: 'left_3',
          severity: 3,
          direction: 'left',
          calloutTextZh: '左 3 下坡接小跳坡',
          calloutSpeechZh: '左三下坡接小跳坡',
        },
      },
      {
        startM: 2860,
        endM: 3120,
        curvature: 0.032,
        slope: 0.01,
        note: {
          type: 'hairpin_right',
          severity: 1,
          direction: 'right',
          calloutTextZh: '右 1 森林发夹弯 · 勿撞外侧雪堆',
          calloutSpeechZh: '右一发夹弯，勿撞雪堆',
        },
      },
      {
        startM: 3220,
        endM: 3560,
        curvature: -0.008,
        slope: -0.02,
        note: {
          type: 'left_5',
          severity: 5,
          direction: 'left',
          calloutTextZh: '左 5 高速全油冲刺段',
          calloutSpeechZh: '左五全油冲刺',
        },
      },
      {
        startM: 3720,
        endM: 3900,
        curvature: 0.0,
        slope: 0.0,
        note: {
          type: 'finish',
          severity: 0,
          direction: 'center',
          calloutTextZh: '终点计时拱门 · 保持全油',
          calloutSpeechZh: '冲过终点',
        },
      },
    ],
  },
  {
    id: 'corsica_night_storm',
    code: 'SS04',
    nameZh: '维苏比暗夜暴雨 · 科西嘉',
    nameEn: 'Route de la Vésubie Night Storm',
    country: 'France · Corsica',
    lengthM: 3700,
    primarySurface: 'tarmac',
    surfaceMixLabel: '54% 暴雨湿柏油 · 30% 泥石流脏路 · 16% 积水坑',
    defaultWeather: 'rain',
    defaultTimeOfDay: 'night',
    recommendedTire: 'tarmac_wet',
    elevationGainM: 190,
    descriptionZh:
      '漆黑雨夜的万弯之岛魔鬼赛段。全靠车头拉力射灯与路边反光诱导标引路，一旦撞坏车灯将陷入极度危险的盲驾；路面遍布暴雨积水与山体滑坡带出的泥沙。',
    targetParTimeSec: 238,
    defaultWidthM: 6.4,
    seed: 4177,
    features: [
      {
        startM: 90,
        endM: 260,
        curvature: 0.014,
        slope: -0.02,
        note: {
          type: 'right_4',
          severity: 4,
          direction: 'right',
          calloutTextZh: '右 4 雨夜湿滑 · 盯紧反光路标',
          calloutSpeechZh: '右四雨夜湿滑，注意反光路标',
        },
      },
      {
        startM: 310,
        endM: 480,
        curvature: -0.024,
        slope: -0.04,
        surface: 'water_puddle',
        scenery: 'cliff',
        note: {
          type: 'left_2',
          severity: 2,
          direction: 'left',
          modifier: '暴雨积水',
          calloutTextZh: '左 2 弯心积水 · 谨防水滑失控',
          calloutSpeechZh: '左二弯心有积水，小心水滑',
        },
      },
      {
        startM: 550,
        endM: 740,
        curvature: 0.035,
        slope: -0.03,
        scenery: 'cliff',
        note: {
          type: 'hairpin_right',
          severity: 1,
          direction: 'right',
          modifier: '悬崖盲弯',
          calloutTextZh: '右 1 悬崖发夹弯 · 护栏外即深渊',
          calloutSpeechZh: '右一悬崖发夹弯，小心护栏',
        },
      },
      {
        startM: 820,
        endM: 1060,
        curvature: -0.017,
        slope: 0.03,
        surface: 'tarmac_dirty',
        note: {
          type: 'left_3',
          severity: 3,
          direction: 'left',
          modifier: '落石脏路',
          calloutTextZh: '左 3 泥沙落石区 · 抓地不均',
          calloutSpeechZh: '左三泥沙脏路，抓地下降',
        },
      },
      {
        startM: 1120,
        endM: 1320,
        curvature: 0.021,
        slope: 0.05,
        surface: 'tarmac_dirty',
        note: {
          type: 'right_2',
          severity: 2,
          direction: 'right',
          calloutTextZh: '右 2 上坡收紧 · 保护前车灯勿撞岩壁',
          calloutSpeechZh: '右二上坡收紧，保护车灯',
        },
      },
      {
        startM: 1400,
        endM: 1540,
        curvature: 0.0,
        slope: 0.0,
        widthM: 4.3,
        scenery: 'bridge',
        note: {
          type: 'narrow_bridge',
          severity: 2,
          direction: 'center',
          modifier: '暗夜窄桥 (4.3m)',
          calloutTextZh: '暗夜峡谷极窄石桥 · 车灯对准桥心',
          calloutSpeechZh: '前方极窄石桥，车灯对准桥心',
        },
      },
      {
        startM: 1620,
        endM: 1880,
        curvature: -0.014,
        slope: 0.04,
        scenery: 'village',
        widthM: 4.9,
        note: {
          type: 'left_3',
          severity: 3,
          direction: 'left',
          modifier: '古镇石巷',
          calloutTextZh: '左 3 穿过夜间古镇窄巷',
          calloutSpeechZh: '左三穿过夜间窄巷',
        },
      },
      {
        startM: 1960,
        endM: 2150,
        curvature: 0.0,
        slope: 0.07,
        scenery: 'crest',
        note: {
          type: 'crest',
          severity: 0,
          direction: 'center',
          modifier: '暗夜盲坡跳',
          calloutTextZh: '盲坡顶车灯照空 · 落地立刻接左 1',
          calloutSpeechZh: '盲坡顶跳坡，落地立刻接左一',
        },
      },
      {
        startM: 2160,
        endM: 2360,
        curvature: -0.036,
        slope: -0.05,
        scenery: 'cliff',
        note: {
          type: 'hairpin_left',
          severity: 1,
          direction: 'left',
          calloutTextZh: '左 1 下坡急发夹 · 重刹配合手刹',
          calloutSpeechZh: '左一下坡发夹弯，重刹拉手刹',
        },
      },
      {
        startM: 2460,
        endM: 2740,
        curvature: 0.015,
        slope: -0.02,
        surface: 'water_puddle',
        note: {
          type: 'right_3',
          severity: 3,
          direction: 'right',
          calloutTextZh: '右 3 连续积水洼地 · 接左 4',
          calloutSpeechZh: '右三积水洼地，接左四',
        },
      },
      {
        startM: 2780,
        endM: 3040,
        curvature: -0.012,
        slope: 0.01,
        note: {
          type: 'left_4',
          severity: 4,
          direction: 'left',
          calloutTextZh: '左 4 变宽 · 接右 2 最后回头弯',
          calloutSpeechZh: '左四变宽，接右二',
        },
      },
      {
        startM: 3120,
        endM: 3320,
        curvature: 0.026,
        slope: 0.02,
        surface: 'tarmac_dirty',
        note: {
          type: 'right_2',
          severity: 2,
          direction: 'right',
          calloutTextZh: '右 2 出弯全油 · 直奔终点',
          calloutSpeechZh: '右二出弯全油冲刺',
        },
      },
      {
        startM: 3520,
        endM: 3700,
        curvature: 0.0,
        slope: 0.0,
        note: {
          type: 'finish',
          severity: 0,
          direction: 'center',
          calloutTextZh: '全油冲过雨夜终点线',
          calloutSpeechZh: '冲过终点',
        },
      },
    ],
  },
];

function buildStageFromBlueprint(bp: StageBlueprint): StageDefinition {
  const stepM = 5; // 5 meters per spline segment for high-fidelity 3D road & collision
  const count = Math.floor(bp.lengthM / stepM) + 1;
  const segments: StageSegment[] = [];
  const props: RoadsideProp[] = [];
  const pacenotes: PacenoteItem[] = [];
  const rand = seededRandom(bp.seed);

  let x = 0;
  let y = 12;
  let z = 0;
  let yaw = 0;

  for (let i = 0; i < count; i++) {
    const d = i * stepM;
    // Find matching feature or blend smoothly
    let curvature = 0;
    let slope = 0;
    let widthM = bp.defaultWidthM;
    let surface: SurfaceType = bp.primarySurface;
    let camberRad = 0;
    let scenery: StageSegment['sceneryType'] = 'forest';

    // Gentle organic baseline weave so straights feel like real forest/mountain roads
    curvature += Math.sin(d * 0.009) * 0.0014 + Math.cos(d * 0.021) * 0.0008;
    slope += Math.sin(d * 0.007) * 0.012;

    for (const feat of bp.features) {
      const margin = 25;
      if (d >= feat.startM - margin && d <= feat.endM + margin) {
        // Smooth window envelope
        let w = 1.0;
        if (d < feat.startM) {
          w = (d - (feat.startM - margin)) / margin;
        } else if (d > feat.endM) {
          w = ((feat.endM + margin) - d) / margin;
        }
        w = Math.max(0, Math.min(1, w * w * (3 - 2 * w)));

        curvature += feat.curvature * w;
        slope = slope * (1 - w) + feat.slope * w;
        if (feat.widthM !== undefined) {
          widthM = widthM * (1 - w) + feat.widthM * w;
        }
        if (feat.camberRad !== undefined) {
          camberRad += feat.camberRad * w;
        }
        if (w > 0.45) {
          if (feat.surface) surface = feat.surface;
          if (feat.scenery) scenery = feat.scenery;
        }
      }
    }

    // Natural banking on corners if not explicitly set
    if (camberRad === 0) {
      camberRad = -curvature * 1.4;
    }

    const tangentX = Math.sin(yaw);
    const tangentZ = Math.cos(yaw);
    const tangentY = slope;
    const normalX = Math.cos(yaw);
    const normalZ = -Math.sin(yaw);

    segments.push({
      index: i,
      distanceM: d,
      x,
      y,
      z,
      tangentX,
      tangentY,
      tangentZ,
      normalX,
      normalZ,
      camberRad,
      widthM,
      surface,
      curvature,
      slope,
      roughness: getSurfaceRoughness(surface),
      sceneryType: scenery,
    });

    // Advance along spline
    yaw += curvature * stepM;
    x += Math.sin(yaw) * stepM;
    z += Math.cos(yaw) * stepM;
    y += slope * stepM;
  }

  // Generate Pacenotes from features
  for (let idx = 0; idx < bp.features.length; idx++) {
    const feat = bp.features[idx];
    if (!feat.note) continue;
    const nextFeat = bp.features[idx + 1];
    const distToNext = nextFeat ? Math.max(20, Math.round((nextFeat.startM - feat.endM) / 10) * 10) : undefined;
    pacenotes.push({
      id: `${bp.id}_note_${idx}`,
      triggerDistanceM: Math.max(10, feat.startM - 135),
      cornerDistanceM: feat.startM,
      type: feat.note.type,
      severity: feat.note.severity,
      direction: feat.note.direction,
      modifier: feat.note.modifier,
      calloutTextZh: feat.note.calloutTextZh,
      calloutSpeechZh: feat.note.calloutSpeechZh,
      distanceLinkM: distToNext,
    });
  }

  // Generate Roadside Obstacles & Landmarks along segments
  // Start marshal hut at d = 15m
  if (segments.length > 4) {
    const s0 = segments[3];
    props.push({
      x: s0.x - s0.normalX * (s0.widthM * 0.5 + 5.4),
      y: s0.y,
      z: s0.z - s0.normalZ * (s0.widthM * 0.5 + 5.4),
      yaw: Math.atan2(s0.tangentX, s0.tangentZ),
      scale: 1.0,
      type: 'marshal_hut',
      collisionRadius: 2.0,
      hardness: 0.9,
      side: 'left',
    });
  }

  for (let i = 4; i < segments.length - 4; i += 2) {
    const seg = segments[i];
    const halfW = seg.widthM * 0.5;
    const segYaw = Math.atan2(seg.tangentX, seg.tangentZ);

    // Bridge parapets on both sides
    if (seg.sceneryType === 'bridge') {
      for (const side of ['left', 'right'] as const) {
        const sign = side === 'right' ? 1 : -1;
        const offset = halfW + 0.45;
        props.push({
          x: seg.x + seg.normalX * sign * offset,
          y: seg.y,
          z: seg.z + seg.normalZ * sign * offset,
          yaw: segYaw,
          scale: 1.0,
          type: 'bridge_parapet',
          collisionRadius: 0.85,
          hardness: 1.0,
          side,
        });
      }
      continue;
    }

    // Village stone walls close to road edge
    if (seg.sceneryType === 'village' && i % 4 === 0) {
      for (const side of ['left', 'right'] as const) {
        const sign = side === 'right' ? 1 : -1;
        const offset = halfW + 0.9;
        props.push({
          x: seg.x + seg.normalX * sign * offset,
          y: seg.y,
          z: seg.z + seg.normalZ * sign * offset,
          yaw: segYaw,
          scale: 1.15,
          type: 'stone_wall',
          collisionRadius: 1.25,
          hardness: 1.0,
          side,
        });
      }
      continue;
    }

    // Cliffside guardrails & rock outcrops
    if (seg.sceneryType === 'cliff' && i % 4 === 0) {
      const outerSide: 'left' | 'right' = seg.curvature >= 0 ? 'left' : 'right';
      const innerSide: 'left' | 'right' = outerSide === 'left' ? 'right' : 'left';
      const outerSign = outerSide === 'right' ? 1 : -1;
      const innerSign = -outerSign;

      // Guardrail on cliff side
      props.push({
        x: seg.x + seg.normalX * outerSign * (halfW + 0.75),
        y: seg.y,
        z: seg.z + seg.normalZ * outerSign * (halfW + 0.75),
        yaw: segYaw,
        scale: 1.0,
        type: 'guardrail',
        collisionRadius: 0.85,
        hardness: 0.85,
        side: outerSide,
      });

      // Jagged rock on mountain inside wall
      if (rand() < 0.7) {
        const rockOffset = halfW + 1.6 + rand() * 1.8;
        props.push({
          x: seg.x + seg.normalX * innerSign * rockOffset,
          y: seg.y,
          z: seg.z + seg.normalZ * innerSign * rockOffset,
          yaw: segYaw + rand() * 3.14,
          scale: 0.9 + rand() * 0.7,
          type: 'rock_outcrop',
          collisionRadius: 1.3,
          hardness: 1.0,
          side: innerSide,
        });
      }
    }

    // Chevron reflective warning signs on tight corners (especially crucial at night!)
    if (Math.abs(seg.curvature) > 0.016 && i % 6 === 0) {
      const outerSide: 'left' | 'right' = seg.curvature > 0 ? 'left' : 'right';
      const sign = outerSide === 'right' ? 1 : -1;
      const offset = halfW + 1.35;
      props.push({
        x: seg.x + seg.normalX * sign * offset,
        y: seg.y,
        z: seg.z + seg.normalZ * sign * offset,
        yaw: segYaw + (outerSide === 'left' ? 0.35 : -0.35),
        scale: 1.0,
        type: 'chevron_sign',
        collisionRadius: 0.55,
        hardness: 0.4,
        side: outerSide,
      });
    }

    // Forest trees & boulders along the verges
    for (const side of ['left', 'right'] as const) {
      if (rand() < 0.52) {
        const sign = side === 'right' ? 1 : -1;
        const offset = halfW + 2.1 + rand() * 8.5;
        const treeType =
          bp.primarySurface === 'snow'
            ? rand() < 0.6
              ? 'birch_tree'
              : 'pine_tree'
            : rand() < 0.16
              ? 'rock_outcrop'
              : 'pine_tree';
        props.push({
          x: seg.x + seg.normalX * sign * offset,
          y: seg.y - (offset - halfW) * 0.04,
          z: seg.z + seg.normalZ * sign * offset,
          yaw: rand() * Math.PI * 2,
          scale: 0.85 + rand() * 0.65,
          type: treeType,
          collisionRadius: treeType === 'rock_outcrop' ? 1.2 : 0.75,
          hardness: 0.95,
          side,
        });
      }
    }
  }

  // Finish arch at the end of the stage
  const finishSeg = segments[segments.length - 6];
  if (finishSeg) {
    props.push({
      x: finishSeg.x,
      y: finishSeg.y,
      z: finishSeg.z,
      yaw: Math.atan2(finishSeg.tangentX, finishSeg.tangentZ),
      scale: 1.0,
      type: 'finish_arch',
      collisionRadius: 0, // Arch spans across the road
      hardness: 0,
      side: 'center' as 'left',
    });
  }

  const s1 = Math.round(bp.lengthM / 3);
  const s2 = Math.round((bp.lengthM * 2) / 3);

  return {
    id: bp.id,
    code: bp.code,
    nameZh: bp.nameZh,
    nameEn: bp.nameEn,
    country: bp.country,
    lengthM: bp.lengthM,
    primarySurface: bp.primarySurface,
    surfaceMixLabel: bp.surfaceMixLabel,
    defaultWeather: bp.defaultWeather,
    defaultTimeOfDay: bp.defaultTimeOfDay,
    recommendedTire: bp.recommendedTire,
    elevationGainM: bp.elevationGainM,
    descriptionZh: bp.descriptionZh,
    targetParTimeSec: bp.targetParTimeSec,
    sectorSplitsM: [s1, s2, bp.lengthM],
    segments,
    props,
    pacenotes,
  };
}

const STAGE_CACHE = new Map<string, StageDefinition>();

export function getAllStages(): StageDefinition[] {
  return STAGE_BLUEPRINTS.map((bp) => {
    let cached = STAGE_CACHE.get(bp.id);
    if (!cached) {
      cached = buildStageFromBlueprint(bp);
      STAGE_CACHE.set(bp.id, cached);
    }
    return cached;
  });
}

export function getStageById(id: string): StageDefinition {
  const stages = getAllStages();
  return stages.find((s) => s.id === id) || stages[0];
}

/**
 * Projects any world (x, z) position onto the closest road spline segment,
 * returning the interpolated road elevation, normal, surface, width, and lateral offset.
 */
export function sampleStageAtWorldPos(
  stage: StageDefinition,
  x: number,
  z: number,
  hintSegmentIndex: number
): {
  segmentIndex: number;
  distanceM: number;
  roadX: number;
  roadY: number;
  roadZ: number;
  lateralOffsetM: number;
  roadYaw: number;
  slope: number;
  camberRad: number;
  widthM: number;
  surface: SurfaceType;
  roughness: number;
} {
  const segs = stage.segments;
  const n = segs.length;
  const searchRadius = 35;
  const startIdx = Math.max(0, hintSegmentIndex - searchRadius);
  const endIdx = Math.min(n - 1, hintSegmentIndex + searchRadius);

  let bestIdx = hintSegmentIndex;
  let bestDistSq = Infinity;

  for (let i = startIdx; i <= endIdx; i++) {
    const dx = x - segs[i].x;
    const dz = z - segs[i].z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestDistSq) {
      bestDistSq = d2;
      bestIdx = i;
    }
  }

  // If far from hint window, fallback to full scan
  if (bestDistSq > 1600) {
    for (let i = 0; i < n; i++) {
      const dx = x - segs[i].x;
      const dz = z - segs[i].z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        bestIdx = i;
      }
    }
  }

  const seg = segs[bestIdx];
  const dx = x - seg.x;
  const dz = z - seg.z;
  const along = dx * seg.tangentX + dz * seg.tangentZ;
  const lateralOffsetM = dx * seg.normalX + dz * seg.normalZ;

  const distanceM = Math.max(0, Math.min(stage.lengthM, seg.distanceM + along));
  const halfW = seg.widthM * 0.5;
  const isOfftrack = Math.abs(lateralOffsetM) > halfW + 0.35;
  const effectiveSurface: SurfaceType = isOfftrack ? 'offtrack' : seg.surface;

  // Include camber banking and roadside ditch depression when off-track
  let roadY = seg.y + along * seg.slope + lateralOffsetM * Math.sin(seg.camberRad);
  if (isOfftrack) {
    const excess = Math.min(4.0, Math.abs(lateralOffsetM) - halfW);
    // Roadside drainage ditch dip then verge slope
    roadY += -Math.sin(Math.min(Math.PI, excess * 1.4)) * 0.24;
  }

  return {
    segmentIndex: bestIdx,
    distanceM,
    roadX: seg.x + seg.tangentX * along,
    roadY,
    roadZ: seg.z + seg.tangentZ * along,
    lateralOffsetM,
    roadYaw: Math.atan2(seg.tangentX, seg.tangentZ),
    slope: seg.slope,
    camberRad: seg.camberRad,
    widthM: seg.widthM,
    surface: effectiveSurface,
    roughness: isOfftrack ? 0.095 : seg.roughness,
  };
}
