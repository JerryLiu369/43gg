export const TTR_AUDIO_KEY = '43gg.ticket_to_ride_europe.audio.v1';

export type SoundName =
  | 'click'
  | 'select'
  | 'cardDraw'
  | 'cardFlip'
  | 'claim'
  | 'station'
  | 'ticketDraw'
  | 'ticketKeep'
  | 'ticketComplete'
  | 'yourTurn'
  | 'tunnelReveal'
  | 'tunnelFail'
  | 'error'
  | 'lastRound'
  | 'victory'
  | 'defeat'
  | 'tick'
  | 'join'
  | 'leave'
  | 'gameStart'
  | 'notify';

export interface AudioSettings {
  muted: boolean;
  volume: number;
  ambient: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { muted: false, volume: 0.7, ambient: true };

const AMBIENT_LEVEL = 0.32;

interface ToneOptions {
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  endFreq?: number;
  vibrato?: number;
}

interface NoiseOptions {
  filter?: BiquadFilterType;
  freq?: number;
  endFreq?: number;
  q?: number;
  gain?: number;
  attack?: number;
}

function readSettings(): AudioSettings {
  if (typeof window === 'undefined') return DEFAULT_AUDIO_SETTINGS;
  try {
    const raw = window.localStorage.getItem(TTR_AUDIO_KEY);
    if (!raw) return DEFAULT_AUDIO_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      muted: typeof parsed.muted === 'boolean' ? parsed.muted : DEFAULT_AUDIO_SETTINGS.muted,
      volume:
        typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)
          ? Math.min(1, Math.max(0, parsed.volume))
          : DEFAULT_AUDIO_SETTINGS.volume,
      ambient: typeof parsed.ambient === 'boolean' ? parsed.ambient : DEFAULT_AUDIO_SETTINGS.ambient,
    };
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private amb: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private brown: AudioBuffer | null = null;
  private settings: AudioSettings | null = null;
  private listeners = new Set<() => void>();
  private lastPlayed = new Map<SoundName, number>();
  private ambientRequests = 0;
  private ambientSource: AudioBufferSourceNode | null = null;
  private ambientTimer: number | null = null;
  private stopTimer: number | null = null;
  private nextClack = 0;

  getSettings = (): AudioSettings => {
    this.settings ??= readSettings();
    return this.settings;
  };

  getServerSettings = (): AudioSettings => DEFAULT_AUDIO_SETTINGS;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  update(partial: Partial<AudioSettings>): void {
    this.settings = { ...this.getSettings(), ...partial };
    try {
      window.localStorage.setItem(TTR_AUDIO_KEY, JSON.stringify(this.settings));
    } catch {
      // ignore storage errors
    }
    this.applyGains();
    this.syncAmbient();
    this.listeners.forEach((listener) => listener());
  }

  unlock(): void {
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended') void ctx.resume().then(() => this.syncAmbient());
    else this.syncAmbient();
  }

  requestAmbient(): () => void {
    this.ambientRequests++;
    this.syncAmbient();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.ambientRequests = Math.max(0, this.ambientRequests - 1);
      this.syncAmbient();
    };
  }

  dispose(): void {
    this.ambientRequests = 0;
    if (this.ambientTimer !== null) {
      window.clearInterval(this.ambientTimer);
      this.ambientTimer = null;
    }
    if (this.stopTimer !== null) {
      window.clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    if (this.ambientSource) {
      try {
        this.ambientSource.stop();
      } catch {
        // ignore
      }
      this.ambientSource = null;
    }
    if (this.ctx) {
      const ctx = this.ctx;
      this.ctx = null;
      this.master = null;
      this.sfx = null;
      this.amb = null;
      this.noise = null;
      this.brown = null;
      void ctx.close().catch(() => undefined);
    }
  }

  play(name: SoundName, options: { length?: number } = {}): void {
    const settings = this.getSettings();
    if (settings.muted || settings.volume <= 0) return;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.sfx) return;
    const nowMs = performance.now();
    if (nowMs - (this.lastPlayed.get(name) ?? 0) < 70) return;
    this.lastPlayed.set(name, nowMs);
    const t = ctx.currentTime + 0.01;
    switch (name) {
      case 'click':
        this.tone(1500, t, 0.04, { type: 'triangle', gain: 0.07, endFreq: 1100 });
        break;
      case 'select':
        this.tone(660, t, 0.07, { type: 'sine', gain: 0.1 });
        this.tone(990, t + 0.05, 0.09, { type: 'sine', gain: 0.08 });
        break;
      case 'cardDraw':
        this.noiseBurst(t, 0.17, { filter: 'bandpass', freq: 1600, endFreq: 4200, q: 0.9, gain: 0.32 });
        this.tone(320, t, 0.05, { type: 'triangle', gain: 0.05, endFreq: 240 });
        break;
      case 'cardFlip':
        this.noiseBurst(t, 0.045, { filter: 'highpass', freq: 2600, gain: 0.22 });
        this.noiseBurst(t + 0.07, 0.05, { filter: 'highpass', freq: 2200, gain: 0.18 });
        break;
      case 'claim': {
        const chugs = Math.min(6, Math.max(2, options.length ?? 3));
        for (let i = 0; i < chugs; i++) {
          const at = t + i * 0.12;
          this.noiseBurst(at, 0.09, { filter: 'lowpass', freq: 700, endFreq: 300, gain: 0.42 });
          this.tone(95, at, 0.08, { type: 'sine', gain: 0.28, endFreq: 55 });
        }
        const whistle = t + chugs * 0.12 + 0.02;
        this.tone(587, whistle, 0.5, { type: 'triangle', gain: 0.09, vibrato: 6 });
        this.tone(740, whistle, 0.5, { type: 'triangle', gain: 0.07, vibrato: 6 });
        break;
      }
      case 'station':
        this.tone(170, t, 0.28, { type: 'sine', gain: 0.45, endFreq: 85 });
        this.noiseBurst(t, 0.035, { filter: 'lowpass', freq: 1400, gain: 0.3 });
        this.bell(1046, t + 0.12, 0.9, 0.08);
        break;
      case 'ticketDraw':
        this.noiseBurst(t, 0.2, { filter: 'bandpass', freq: 1100, endFreq: 2200, q: 0.6, gain: 0.22 });
        this.noiseBurst(t + 0.16, 0.22, { filter: 'bandpass', freq: 1500, endFreq: 900, q: 0.6, gain: 0.18 });
        break;
      case 'ticketKeep':
        this.tone(523, t, 0.12, { type: 'triangle', gain: 0.1 });
        this.tone(659, t + 0.08, 0.16, { type: 'triangle', gain: 0.1 });
        break;
      case 'ticketComplete':
        [523, 659, 784, 1047].forEach((freq, i) =>
          this.tone(freq, t + i * 0.1, 0.32, { type: 'triangle', gain: 0.12 }),
        );
        this.bell(2093, t + 0.42, 1.1, 0.06);
        break;
      case 'yourTurn':
        this.bell(1318, t, 1.3, 0.16);
        this.bell(988, t + 0.2, 1.5, 0.16);
        break;
      case 'tunnelReveal':
        for (let i = 0; i < 3; i++) {
          const at = t + i * 0.26;
          this.tone(150, at, 0.32, { type: 'sine', gain: 0.55, endFreq: 48 });
          this.noiseBurst(at, 0.12, { filter: 'lowpass', freq: 420, gain: 0.35 });
        }
        break;
      case 'tunnelFail':
        [392, 330, 262].forEach((freq, i) => this.tone(freq, t + i * 0.13, 0.2, { type: 'triangle', gain: 0.1 }));
        break;
      case 'error':
        this.tone(170, t, 0.11, { type: 'square', gain: 0.05 });
        this.tone(140, t + 0.12, 0.14, { type: 'square', gain: 0.05 });
        break;
      case 'lastRound':
        for (let i = 0; i < 3; i++) this.bell(880, t + i * 0.32, 0.8, 0.14);
        break;
      case 'victory':
        [392, 523, 659, 784].forEach((freq, i) =>
          this.tone(freq, t + i * 0.11, 0.24, { type: 'triangle', gain: 0.12 }),
        );
        [523, 659, 784, 1047].forEach((freq) =>
          this.tone(freq, t + 0.5, 1.4, { type: 'triangle', gain: 0.08, vibrato: 4 }),
        );
        this.bell(2093, t + 0.5, 1.6, 0.05);
        break;
      case 'defeat':
        [523, 466, 392].forEach((freq, i) =>
          this.tone(freq, t + i * 0.2, 0.3, { type: 'triangle', gain: 0.1 }),
        );
        this.tone(330, t + 0.62, 1.1, { type: 'triangle', gain: 0.09, vibrato: 3 });
        break;
      case 'tick':
        this.tone(1900, t, 0.03, { type: 'sine', gain: 0.07 });
        break;
      case 'join':
        this.tone(660, t, 0.14, { type: 'sine', gain: 0.1, endFreq: 880 });
        break;
      case 'leave':
        this.tone(660, t, 0.16, { type: 'sine', gain: 0.09, endFreq: 440 });
        break;
      case 'gameStart':
        for (let i = 0; i < 4; i++) {
          this.noiseBurst(t + i * 0.14, 0.1, { filter: 'lowpass', freq: 650, gain: 0.35 });
        }
        this.tone(587, t + 0.6, 0.9, { type: 'triangle', gain: 0.1, vibrato: 6 });
        this.tone(740, t + 0.6, 0.9, { type: 'triangle', gain: 0.08, vibrato: 6 });
        break;
      case 'notify':
        this.tone(880, t, 0.1, { type: 'sine', gain: 0.08 });
        break;
    }
  }

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (this.ctx) return this.ctx;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.amb = ctx.createGain();
    this.amb.gain.value = 0;
    this.amb.connect(this.master);
    this.noise = this.makeNoise(ctx, 1, false);
    this.brown = this.makeNoise(ctx, 3, true);
    this.applyGains();
    return ctx;
  }

  private applyGains(): void {
    if (!this.ctx || !this.master) return;
    const settings = this.getSettings();
    const target = settings.muted ? 0 : settings.volume;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.03);
  }

  private makeNoise(ctx: AudioContext, seconds: number, brownian: boolean): AudioBuffer {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      if (brownian) {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      } else {
        data[i] = white;
      }
    }
    return buffer;
  }

  private envelope(gain: GainNode, start: number, duration: number, peak: number, attack = 0.005): void {
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  }

  private tone(freq: number, start: number, duration: number, options: ToneOptions = {}, out?: AudioNode): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = options.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, start);
    if (options.endFreq) osc.frequency.exponentialRampToValueAtTime(options.endFreq, start + duration);
    if (options.vibrato) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = options.vibrato;
      depth.gain.value = freq * 0.012;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(start);
      lfo.stop(start + duration + 0.05);
    }
    this.envelope(gain, start, duration, options.gain ?? 0.1, options.attack ?? 0.006);
    osc.connect(gain).connect(out ?? this.sfx!);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  private bell(freq: number, start: number, duration: number, peak: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const carrier = ctx.createOscillator();
    const modulator = ctx.createOscillator();
    const modGain = ctx.createGain();
    const gain = ctx.createGain();
    carrier.frequency.value = freq;
    modulator.frequency.value = freq * 3.5;
    modGain.gain.setValueAtTime(freq * 1.4, start);
    modGain.gain.exponentialRampToValueAtTime(1, start + duration);
    modulator.connect(modGain).connect(carrier.frequency);
    this.envelope(gain, start, duration, peak, 0.004);
    carrier.connect(gain).connect(this.sfx!);
    carrier.start(start);
    modulator.start(start);
    carrier.stop(start + duration + 0.05);
    modulator.stop(start + duration + 0.05);
  }

  private noiseBurst(start: number, duration: number, options: NoiseOptions = {}, out?: AudioNode): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = options.filter ?? 'bandpass';
    filter.frequency.setValueAtTime(options.freq ?? 1000, start);
    if (options.endFreq) filter.frequency.exponentialRampToValueAtTime(options.endFreq, start + duration);
    filter.Q.value = options.q ?? 0.7;
    const gain = ctx.createGain();
    this.envelope(gain, start, duration, options.gain ?? 0.2, options.attack ?? 0.004);
    source.connect(filter).connect(gain).connect(out ?? this.sfx!);
    source.start(start, Math.random() * 0.5);
    source.stop(start + duration + 0.05);
  }

  private syncAmbient(): void {
    const ctx = this.ctx;
    if (!ctx || !this.amb) return;
    const settings = this.getSettings();
    const wanted = this.ambientRequests > 0 && settings.ambient && !settings.muted && ctx.state === 'running';
    if (wanted && !this.ambientSource) {
      if (this.stopTimer !== null) {
        window.clearTimeout(this.stopTimer);
        this.stopTimer = null;
      }
      const source = ctx.createBufferSource();
      source.buffer = this.brown;
      source.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 260;
      const level = ctx.createGain();
      level.gain.value = 0.22;
      source.connect(filter).connect(level).connect(this.amb);
      source.start();
      this.ambientSource = source;
      this.amb.gain.setTargetAtTime(AMBIENT_LEVEL, ctx.currentTime, 1.2);
      this.nextClack = ctx.currentTime + 0.4;
      this.ambientTimer = window.setInterval(() => this.scheduleClacks(), 400);
    } else if (!wanted && this.ambientSource) {
      const source = this.ambientSource;
      this.ambientSource = null;
      if (this.ambientTimer !== null) window.clearInterval(this.ambientTimer);
      this.ambientTimer = null;
      this.amb.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
      this.stopTimer = window.setTimeout(() => {
        this.stopTimer = null;
        try {
          source.stop();
        } catch {
          // already stopped
        }
      }, 1600);
    }
  }

  private scheduleClacks(): void {
    const ctx = this.ctx;
    if (!ctx || !this.amb) return;
    while (this.nextClack < ctx.currentTime + 0.8) {
      const at = this.nextClack;
      for (const offset of [0, 0.11]) {
        this.noiseBurst(at + offset, 0.04, { filter: 'bandpass', freq: 2400, q: 1.4, gain: 0.05 }, this.amb);
        this.tone(78, at + offset, 0.06, { type: 'sine', gain: 0.07, endFreq: 52 }, this.amb);
      }
      this.nextClack = at + 1.25 + Math.random() * 0.18;
    }
  }
}

export const sound = new SoundEngine();
