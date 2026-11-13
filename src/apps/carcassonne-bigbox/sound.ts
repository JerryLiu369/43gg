export const CARC_AUDIO_KEY = '43gg.carcassonne_bigbox.audio.v1';

export type SoundName = 'click' | 'snap' | 'thud' | 'fanfare' | 'error' | 'toggle';

export interface AudioSettings {
  muted: boolean;
  volume: number;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { muted: false, volume: 0.6 };

interface Graph {
  ctx: AudioContext;
  out: AudioNode;
  noise: AudioBuffer;
}

interface ToneSpec {
  type: OscillatorType;
  freq: number;
  to?: number;
  start?: number;
  dur: number;
  gain: number;
  attack?: number;
  lowpass?: number;
}

interface NoiseSpec {
  filter: BiquadFilterType;
  freq: number;
  q?: number;
  start?: number;
  dur: number;
  gain: number;
}

function envelope(g: Graph, t0: number, attack: number, dur: number, peak: number): GainNode {
  const gain = g.ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  gain.connect(g.out);
  return gain;
}

function tone(g: Graph, s: ToneSpec): void {
  const t0 = g.ctx.currentTime + (s.start ?? 0);
  const osc = g.ctx.createOscillator();
  osc.type = s.type;
  osc.frequency.setValueAtTime(s.freq, t0);
  if (s.to) osc.frequency.exponentialRampToValueAtTime(s.to, t0 + s.dur);
  const amp = envelope(g, t0, s.attack ?? 0.005, s.dur, s.gain);
  if (s.lowpass) {
    const filter = g.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = s.lowpass;
    osc.connect(filter).connect(amp);
  } else {
    osc.connect(amp);
  }
  osc.start(t0);
  osc.stop(t0 + s.dur + 0.03);
}

function noise(g: Graph, s: NoiseSpec): void {
  const t0 = g.ctx.currentTime + (s.start ?? 0);
  const src = g.ctx.createBufferSource();
  src.buffer = g.noise;
  const filter = g.ctx.createBiquadFilter();
  filter.type = s.filter;
  filter.frequency.value = s.freq;
  filter.Q.value = s.q ?? 1;
  src.connect(filter).connect(envelope(g, t0, 0.002, s.dur, s.gain));
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + s.dur + 0.03);
}

const RECIPES: Record<SoundName, (g: Graph) => void> = {
  click(g) {
    tone(g, { type: 'triangle', freq: 1400, to: 700, dur: 0.05, gain: 0.22 });
    noise(g, { filter: 'highpass', freq: 3000, dur: 0.02, gain: 0.06 });
  },
  toggle(g) {
    tone(g, { type: 'sine', freq: 620, dur: 0.07, gain: 0.18 });
    tone(g, { type: 'sine', freq: 930, start: 0.06, dur: 0.09, gain: 0.18 });
  },
  snap(g) {
    noise(g, { filter: 'bandpass', freq: 1800, q: 1.2, dur: 0.07, gain: 0.55 });
    tone(g, { type: 'triangle', freq: 220, to: 110, dur: 0.09, gain: 0.32 });
    noise(g, { filter: 'bandpass', freq: 900, q: 1.5, start: 0.035, dur: 0.05, gain: 0.22 });
  },
  thud(g) {
    tone(g, { type: 'sine', freq: 150, to: 55, dur: 0.22, gain: 0.7 });
    noise(g, { filter: 'lowpass', freq: 420, dur: 0.12, gain: 0.45 });
    tone(g, { type: 'triangle', freq: 480, to: 300, dur: 0.04, gain: 0.08 });
  },
  fanfare(g) {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const last = i === notes.length - 1;
      const dur = last ? 0.65 : 0.17;
      tone(g, { type: 'triangle', freq, start: i * 0.11, dur, gain: 0.2 });
      tone(g, { type: 'square', freq, start: i * 0.11, dur, gain: 0.05, lowpass: 1800 });
    });
    tone(g, { type: 'triangle', freq: 659.25, start: 0.33, dur: 0.65, gain: 0.08 });
    tone(g, { type: 'triangle', freq: 783.99, start: 0.33, dur: 0.65, gain: 0.08 });
  },
  error(g) {
    tone(g, { type: 'square', freq: 240, to: 200, dur: 0.12, gain: 0.1, lowpass: 1200 });
    tone(g, { type: 'square', freq: 196, to: 160, start: 0.14, dur: 0.18, gain: 0.1, lowpass: 1200 });
  },
};

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private settings: AudioSettings = DEFAULT_AUDIO_SETTINGS;
  private loaded = false;
  private listeners = new Set<() => void>();

  getSettings = (): AudioSettings => {
    this.load();
    return this.settings;
  };

  getServerSettings = (): AudioSettings => DEFAULT_AUDIO_SETTINGS;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  setMuted(muted: boolean): void {
    this.update({ muted });
  }

  toggleMuted(): void {
    this.update({ muted: !this.getSettings().muted });
  }

  setVolume(volume: number): void {
    const v = Math.min(1, Math.max(0, volume));
    this.update({ volume: v, muted: v === 0 ? this.settings.muted : false });
  }

  play(name: SoundName): void {
    const { muted, volume } = this.getSettings();
    if (muted || volume <= 0) return;
    const graph = this.graph();
    if (!graph) return;
    try {
      RECIPES[name](graph);
    } catch {
      // ignore decorative audio errors
    }
  }

  dispose(): void {
    if (this.ctx) {
      const ctx = this.ctx;
      this.ctx = null;
      this.master = null;
      this.noiseBuffer = null;
      void ctx.close().catch(() => undefined);
    }
  }

  private update(patch: Partial<AudioSettings>): void {
    this.load();
    this.settings = { ...this.settings, ...patch };
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.settings.muted ? 0 : this.settings.volume, this.ctx.currentTime, 0.02);
    }
    try {
      window.localStorage.setItem(CARC_AUDIO_KEY, JSON.stringify(this.settings));
    } catch {
      // ignore storage errors
    }
    for (const l of this.listeners) l();
  }

  private load(): void {
    if (this.loaded || typeof window === 'undefined') return;
    this.loaded = true;
    try {
      const raw = JSON.parse(window.localStorage.getItem(CARC_AUDIO_KEY) ?? 'null') as Partial<AudioSettings> | null;
      if (raw) {
        this.settings = {
          muted: typeof raw.muted === 'boolean' ? raw.muted : DEFAULT_AUDIO_SETTINGS.muted,
          volume: typeof raw.volume === 'number' ? Math.min(1, Math.max(0, raw.volume)) : DEFAULT_AUDIO_SETTINGS.volume,
        };
      }
    } catch {
      // ignore
    }
  }

  private graph(): Graph | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = this.settings.muted ? 0 : this.settings.volume;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      master.connect(limiter).connect(ctx.destination);
      const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.ctx = ctx;
      this.master = master;
      this.noiseBuffer = buffer;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return { ctx: this.ctx, out: this.master!, noise: this.noiseBuffer! };
  }
}

export const sound = new SoundEngine();
