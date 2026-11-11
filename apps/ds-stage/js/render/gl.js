/* gl.js — 极简 WebGL 封装（无外部依赖） */
(function (root) {
  'use strict';
  var RG = root.RG = root.RG || {};
  var G = RG.GL = {};

  G.init = function (canvas, opts) {
    var attrs = Object.assign({
      alpha: false, antialias: true, depth: true, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: false
    }, opts || {});
    var gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
    if (!gl) throw new Error('WebGL 不可用');
    gl.extUint = gl.getExtension('OES_element_index_uint');
    gl.extAniso = gl.getExtension('EXT_texture_filter_anisotropic');
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    return gl;
  };

  G.shader = function (gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(s);
      console.error('着色器编译失败:', log, src);
      throw new Error(log);
    }
    return s;
  };

  G.program = function (gl, vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, G.shader(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, G.shader(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(p));
    }
    // 缓存 uniform / attribute 位置
    p.u = {};
    p.a = {};
    var nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < nu; i++) {
      var info = gl.getActiveUniform(p, i);
      var name = info.name.replace(/\[0\]$/, '');
      p.u[name] = gl.getUniformLocation(p, info.name);
    }
    var na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (var j = 0; j < na; j++) {
      var ai = gl.getActiveAttrib(p, j);
      p.a[ai.name] = gl.getAttribLocation(p, ai.name);
    }
    return p;
  };

  G.buffer = function (gl, data, target) {
    var b = gl.createBuffer();
    target = target || gl.ARRAY_BUFFER;
    gl.bindBuffer(target, b);
    gl.bufferData(target, data, gl.STATIC_DRAW);
    return b;
  };

  G.texture = function (gl, opts) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, opts.wrap || gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, opts.wrap || gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, opts.min || gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, opts.mag || gl.LINEAR);
    if (opts.data) {
      gl.texImage2D(gl.TEXTURE_2D, 0, opts.format || gl.RGBA, opts.width, opts.height, 0,
        opts.format || gl.RGBA, opts.type || gl.UNSIGNED_BYTE, opts.data);
    }
    return t;
  };

  G.fbo = function (gl, w, h) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
    var f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo: f, tex: tex, w: w, h: h };
  };
})(typeof window !== 'undefined' ? window : globalThis);
