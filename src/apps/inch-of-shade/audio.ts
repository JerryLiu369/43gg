import type { PhaseIndex } from './types.ts';

/** 五声音阶（宫商角徵羽），用于拨弦音 */
const PENTATONIC = [392.0, 440.0, 493.88, 587.33, 659.25, 783.99, 880.0, 987.77, 1174.66];

/**
 * 全部音效用 WebAudio 现场合成：猫步、推盆、风铃、拨弦与盛夏蝉鸣。
 * AudioContext 只在首次需要发声时创建，dispose() 时关闭。
 */
export class ShadeAudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted: boolean;
  private noiseBuffer: AudioBuffer | null = null;
  private pluckCache = new Map<number, AudioBuffer>();
  private cicada: {
    source: AudioBufferSourceNode;
    lfo: OscillatorNode;
    swell: OscillatorNode;
    out: GainNode;
  } | null = null;
  private ambiencePhase: PhaseIndex | null = null;

  public constructor(muted: boolean) {
    this.muted = muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.stopAmbience();
    } else if (this.ambiencePhase !== null) {
      this.setAmbience(this.ambiencePhase);
    }
  }

  private ensure(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      try {
        this.ctx = new Ctor();
      } catch {
        return null;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  private noise(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuffer) {
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let seed = 1234567;
      for (let i = 0; i < len; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        data[i] = (seed / 0x7fffffff) * 2 - 1;
      }
      this.noiseBuffer = buf;
    }
    return this.noiseBuffer;
  }

  /** Karplus-Strong 拨弦，结果缓存 */
  private pluckBuffer(ctx: AudioContext, freq: number): AudioBuffer {
    const cached = this.pluckCache.get(freq);
    if (cached) return cached;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 1.6);
    const buf = ctx.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);
    const period = Math.max(2, Math.round(sr / freq));
    const ring = new Float32Array(period);
    let seed = Math.floor(freq * 97);
    for (let i = 0; i < period; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      ring[i] = (seed / 0x7fffffff) * 2 - 1;
    }
    let idx = 0;
    for (let i = 0; i < len; i++) {
      const next = (idx + 1) % period;
      const v = 0.4985 * (ring[idx] + ring[next]);
      out[i] = ring[idx];
      ring[idx] = v;
      idx = next;
    }
    this.pluckCache.set(freq, buf);
    return buf;
  }

  private pluck(freq: number, delay = 0, gain = 0.22): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.pluckBuffer(ctx, freq);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    src.connect(lp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 1.6);
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    peak: number,
    delay = 0,
    slideTo?: number,
  ): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noiseBurst(dur: number, freq: number, q: number, peak: number, delay = 0, type: BiquadFilterType = 'bandpass'): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    const offset = Math.random() * 1.5;
    src.start(t, offset);
    src.stop(t + dur + 0.05);
  }

  /** 肉垫踩在砖上的轻响 */
  public step(index = 0): void {
    this.noiseBurst(0.05, 900 + (index % 2) * 220, 1.4, 0.07);
  }

  /** 推动陶盆/水缸：低沉摩擦 + 一声闷响 */
  public push(heavy: boolean): void {
    this.noiseBurst(heavy ? 0.24 : 0.16, heavy ? 260 : 420, 0.9, heavy ? 0.16 : 0.11);
    this.tone(heavy ? 92 : 140, heavy ? 0.22 : 0.14, 'triangle', heavy ? 0.16 : 0.1, 0.05, heavy ? 70 : 110);
  }

  /** 时辰推进：一串风铃 */
  public chime(phase: PhaseIndex): void {
    const base = [1318.5, 1174.66, 1046.5, 987.77, 880][phase] ?? 1046.5;
    const partials = [1, 1.5, 2.0, 2.76];
    partials.forEach((ratio, i) => {
      this.tone(base * ratio * 0.5, 1.6 - i * 0.25, 'sine', 0.05 / (i + 1), i * 0.07);
    });
    this.pluck(PENTATONIC[(phase + 2) % PENTATONIC.length], 0.02, 0.12);
  }

  /** 猫拒绝走进阳光：一声短促的「喵？」 */
  public refuse(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(620, t);
    osc.frequency.linearRampToValueAtTime(820, t + 0.08);
    osc.frequency.exponentialRampToValueAtTime(520, t + 0.26);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1100, t);
    bp.frequency.linearRampToValueAtTime(1600, t + 0.1);
    bp.frequency.linearRampToValueAtTime(900, t + 0.26);
    bp.Q.value = 3.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(bp).connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.32);
  }

  /** 踏进阳光：滋啦一声 */
  public sizzle(): void {
    this.noiseBurst(0.32, 5200, 0.7, 0.07, 0, 'highpass');
  }

  public bump(): void {
    this.tone(180, 0.08, 'triangle', 0.06, 0, 140);
  }

  public hint(): void {
    this.pluck(PENTATONIC[4], 0, 0.14);
    this.pluck(PENTATONIC[6], 0.09, 0.12);
  }

  public undo(): void {
    this.tone(660, 0.09, 'sine', 0.05, 0, 520);
  }

  public ui(): void {
    this.tone(880, 0.05, 'triangle', 0.035);
  }

  /** 叼到鱼干：五声音阶上行琶音 */
  public win(): void {
    [0, 2, 3, 5, 7].forEach((n, i) => this.pluck(PENTATONIC[n], i * 0.09, 0.2));
    this.pluck(PENTATONIC[8], 0.55, 0.16);
  }

  /** 盛夏蝉鸣：正午最响，早晚最轻 */
  public setAmbience(phase: PhaseIndex): void {
    this.ambiencePhase = phase;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const level = [0.006, 0.011, 0.017, 0.012, 0.007][phase] ?? 0.008;
    if (!this.cicada) {
      const source = ctx.createBufferSource();
      source.buffer = this.noise(ctx);
      source.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 4600;
      bp.Q.value = 6;
      const am = ctx.createGain();
      am.gain.value = 0.5;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 38;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.5;
      lfo.connect(lfoGain).connect(am.gain);
      const swellGain = ctx.createGain();
      swellGain.gain.value = 0.6;
      const swell = ctx.createOscillator();
      swell.frequency.value = 0.09;
      const swellDepth = ctx.createGain();
      swellDepth.gain.value = 0.4;
      swell.connect(swellDepth).connect(swellGain.gain);
      const out = ctx.createGain();
      out.gain.value = 0;
      source.connect(bp).connect(am).connect(swellGain).connect(out).connect(this.master);
      source.start();
      lfo.start();
      swell.start();
      this.cicada = { source, lfo, swell, out };
    }
    const t = ctx.currentTime;
    this.cicada.out.gain.cancelScheduledValues(t);
    this.cicada.out.gain.setValueAtTime(this.cicada.out.gain.value, t);
    this.cicada.out.gain.linearRampToValueAtTime(level, t + 1.2);
  }

  public stopAmbience(): void {
    if (!this.cicada) return;
    const { source, lfo, swell, out } = this.cicada;
    this.cicada = null;
    try {
      const ctx = this.ctx;
      if (ctx) {
        const t = ctx.currentTime;
        out.gain.cancelScheduledValues(t);
        out.gain.setValueAtTime(out.gain.value, t);
        out.gain.linearRampToValueAtTime(0, t + 0.3);
        source.stop(t + 0.35);
        lfo.stop(t + 0.35);
        swell.stop(t + 0.35);
      } else {
        source.stop();
        lfo.stop();
        swell.stop();
      }
    } catch {
      // 已停止
    }
  }

  public dispose(): void {
    this.stopAmbience();
    this.ambiencePhase = null;
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.pluckCache.clear();
    this.noiseBuffer = null;
    if (ctx) void ctx.close().catch(() => {});
  }
}
