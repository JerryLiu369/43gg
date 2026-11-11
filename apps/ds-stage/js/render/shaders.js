/* shaders.js — 全部程序化着色器（GLSL ES 1.0） */
(function (root) {
  'use strict';
  var RG = root.RG = root.RG || {};
  var S = RG.Shaders = {};

  var COMMON_NOISE = [
    'float hash21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }',
    'float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);',
    '  float a=hash21(i), b=hash21(i+vec2(1.0,0.0)), c=hash21(i+vec2(0.0,1.0)), d=hash21(i+vec2(1.0,1.0));',
    '  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }',
    'float fbm(vec2 p){ return vnoise(p)*0.6 + vnoise(p*2.3+11.0)*0.28 + vnoise(p*5.1+37.0)*0.12; }'
  ].join('\n');

  S.mainVS = [
    'precision highp float;',
    'attribute vec3 aPos; attribute vec3 aNrm; attribute vec3 aCol; attribute vec4 aMat;',
    'uniform mat4 uVP; uniform mat4 uModel;',
    'varying vec3 vWorld; varying vec3 vNrm; varying vec3 vCol; varying vec4 vMat;',
    'void main(){',
    '  vec4 wp = uModel * vec4(aPos,1.0);',
    '  vWorld = wp.xyz;',
    '  vNrm = mat3(uModel) * aNrm;',
    '  vCol = aCol; vMat = aMat;',
    '  gl_Position = uVP * wp;',
    '}'
  ].join('\n');

  S.mainFS = [
    'precision highp float;',
    'varying vec3 vWorld; varying vec3 vNrm; varying vec3 vCol; varying vec4 vMat;',
    'uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uAmb;',
    'uniform vec3 uFogColor; uniform float uFogD; uniform vec3 uCam;',
    'uniform vec3 uHLPos1; uniform vec3 uHLDir1; uniform vec3 uHLPos2; uniform vec3 uHLDir2;',
    'uniform float uHLOn; uniform float uTime; uniform float uWet; uniform float uSnow;',
    'uniform float uMirror; uniform float uGhost;',
    COMMON_NOISE,
    'void main(){',
    '  vec3 n = normalize(vNrm);',
    '  vec3 base = vCol;',
    '  vec2 wp = vWorld.xz;',
    '  float detail = fbm(wp*1.7);',
    '  float fine = vnoise(wp*9.0);',
    '  // 砂石颗粒感',
    '  base *= 0.88 + 0.24*detail;',
    '  base += (fine-0.5)*0.045;',
    '  // 车辙/脏污',
    '  base *= 1.0 - vMat.x*0.35*(0.6+0.4*detail);',
    '  float ndl = max(dot(n, uSunDir), 0.0);',
    '  vec3 lit = uSunColor * ndl;',
    '  vec3 amb = uAmb * (0.62 + 0.38*n.y);',
    '  vec3 col = base * (lit + amb);',
    '  // 车灯（两个聚光）',
    '  if (uHLOn > 0.5) {',
    '    vec3 d1 = vWorld - uHLPos1; float dist1 = length(d1);',
    '    float cone1 = dot(normalize(d1), uHLDir1);',
    '    float f1 = smoothstep(0.80, 0.95, cone1) * (1.0/(1.0+dist1*dist1*0.0045)) * smoothstep(0.0,4.0,dist1);',
    '    vec3 d2 = vWorld - uHLPos2; float dist2 = length(d2);',
    '    float cone2 = dot(normalize(d2), uHLDir2);',
    '    float f2 = smoothstep(0.80, 0.95, cone2) * (1.0/(1.0+dist2*dist2*0.0045)) * smoothstep(0.0,4.0,dist2);',
    '    col += base * vec3(1.0,0.96,0.86) * (f1+f2) * 1.9;',
    '  }',
    '  // 自发光（尾灯/反光标识）',
    '  col += base * vMat.y;',
    '  // 距离雾',
    '  float dist = length(vWorld - uCam);',
    '  float fog = 1.0 - exp(-pow(dist*uFogD, 1.55));',
    '  fog = clamp(fog, 0.0, 1.0);',
    '  col = mix(col, uFogColor, fog);',
    '  if (uGhost > 0.5) { col = mix(col, vec3(0.35,0.75,1.0), 0.55); gl_FragColor = vec4(col, 0.34); return; }',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  // 天空：全屏四边形 + 射线方向
  S.skyVS = [
    'precision highp float;',
    'attribute vec2 aPos;',
    'uniform mat4 uInvVP; uniform vec3 uCam;',
    'varying vec3 vDir;',
    'void main(){',
    '  vec4 p = uInvVP * vec4(aPos, 1.0, 1.0);',
    '  vDir = p.xyz/p.w - uCam;',
    '  gl_Position = vec4(aPos, 0.999, 1.0);',
    '}'
  ].join('\n');

  S.skyFS = [
    'precision highp float;',
    'varying vec3 vDir;',
    'uniform vec3 uSunDir; uniform vec3 uSkyTop; uniform vec3 uSkyBot; uniform vec3 uSunColor;',
    'uniform vec3 uFogColor; uniform float uNight; uniform float uTime;',
    COMMON_NOISE,
    'void main(){',
    '  vec3 d = normalize(vDir);',
    '  float h = clamp(d.y*0.5+0.5, 0.0, 1.0);',
    '  vec3 col = mix(uSkyBot, uSkyTop, pow(clamp(d.y,0.0,1.0), 0.55));',
    '  // 地平线雾带',
    '  col = mix(col, uFogColor, smoothstep(0.10, -0.02, d.y)*0.85);',
    '  // 太阳',
    '  float sd = max(dot(d, uSunDir), 0.0);',
    '  col += uSunColor * pow(sd, 900.0) * 6.0;',
    '  col += uSunColor * pow(sd, 12.0) * 0.22;',
    '  // 星空',
    '  if (uNight > 0.3) {',
    '    vec2 sp = d.xz/(abs(d.y)+0.35)*24.0;',
    '    float st = step(0.995, hash21(floor(sp*3.0)));',
    '    col += vec3(st) * uNight * smoothstep(0.05, 0.35, d.y) * 0.7;',
    '  }',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  // 粒子：点精灵
  S.partVS = [
    'precision highp float;',
    'attribute vec3 aPos; attribute vec4 aCol; attribute float aSize;',
    'uniform mat4 uVP; uniform vec3 uCam;',
    'varying vec4 vCol;',
    'void main(){',
    '  vec4 cp = uVP * vec4(aPos,1.0);',
    '  gl_Position = cp;',
    '  float d = length(aPos-uCam);',
    '  gl_PointSize = clamp(aSize * 300.0 / max(d,1.0), 1.0, 220.0);',
    '  vCol = aCol;',
    '  vCol.a *= clamp(1.0 - d/90.0, 0.0, 1.0);',
    '}'
  ].join('\n');

  S.partFS = [
    'precision mediump float;',
    'varying vec4 vCol;',
    'void main(){',
    '  vec2 p = gl_PointCoord*2.0-1.0;',
    '  float r = dot(p,p);',
    '  if (r>1.0) discard;',
    '  float a = vCol.a * (1.0-r)*(1.0-r);',
    '  gl_FragColor = vec4(vCol.rgb, a);',
    '}'
  ].join('\n');

  // 后视镜/贴图四边形
  S.texVS = [
    'precision highp float;',
    'attribute vec3 aPos; attribute vec2 aUV;',
    'uniform mat4 uMVP;',
    'varying vec2 vUV;',
    'void main(){ vUV=aUV; gl_Position = uMVP*vec4(aPos,1.0); }'
  ].join('\n');
  S.texFS = [
    'precision mediump float;',
    'varying vec2 vUV; uniform sampler2D uTex; uniform float uMirrorFlip;',
    'void main(){ vec2 uv=vUV; if(uMirrorFlip>0.5) uv.x = 1.0-uv.x; gl_FragColor = texture2D(uTex, uv); }'
  ].join('\n');
})(typeof window !== 'undefined' ? window : globalThis);
