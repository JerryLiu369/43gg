/**
 * Procedural Web Audio synthesizer for Astral Orrery.
 * Tuned to a warm D-Lydian / Pentatonic celesta, brass escapement & celestial sub-harmonic register
 * with strict grain rate-limiting so 4x/8x Overdrive produces a lush arpeggio.
 */
const RING_FREQUENCIES = [587.33, 440.0, 369.99, 293.66, 220.0]; // D5, A4, F#4, D4, A3
const SYZYGY_CHORD = [293.66, 440.0, 587.33, 739.99, 880.0, 1174.66];

export class OrreryAudioEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean;
  private lastChimeMs = 0;
  private lastClickMs = 0;

  constructor(initialMuted = false) {
    this.muted = initialMuted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playEscapementTick(isPerfect = false): void {
    const nowMs = performance.now();
    if (nowMs - this.lastClickMs < 45) return;
    this.lastClickMs = nowMs;

    const ctx = this.ensureContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = isPerfect ? 'triangle' : 'sine';
    const baseFreq = isPerfect ? 784 : 520 + (Math.random() - 0.5) * 35;
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(
      isPerfect ? 1174.66 : baseFreq * 0.65,
      t + (isPerfect ? 0.14 : 0.055),
    );

    gain.gain.setValueAtTime(isPerfect ? 0.11 : 0.055, t);
    gain.gain.exponentialRampToValueAtTime(
      0.0008,
      t + (isPerfect ? 0.18 : 0.06),
    );

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + (isPerfect ? 0.19 : 0.065));
  }

  public playMeridianStrike(ringIndex: number): void {
    const nowMs = performance.now();
    if (nowMs - this.lastChimeMs < 75) return;
    this.lastChimeMs = nowMs;

    const ctx = this.ensureContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const freq =
      RING_FREQUENCIES[
        Math.min(RING_FREQUENCIES.length - 1, Math.max(0, ringIndex))
      ] *
      (1 + (Math.random() - 0.5) * 0.008);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.05, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.24);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  public playSyzygyChord(bodyCount: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const notesCount = Math.min(SYZYGY_CHORD.length, bodyCount + 1);

    for (let i = 0; i < notesCount; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = t + i * 0.032;
      const dur = 0.42 + bodyCount * 0.08;

      osc.type = i % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(SYZYGY_CHORD[i], start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(
        0.065 / Math.sqrt(notesCount),
        start + 0.015,
      );
      gain.gain.exponentialRampToValueAtTime(0.0008, start + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    }
  }

  public playSupernovaBoom(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    // Deep gravitational implosion sub-bass sweep
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(146.83, t);
    sub.frequency.exponentialRampToValueAtTime(55.0, t + 0.55);
    subGain.gain.setValueAtTime(0.14, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    sub.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(t);
    sub.stop(t + 0.62);

    // Shimmering D-Lydian harmonic overtone cascade
    [440.0, 587.33, 739.99, 1174.66].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const s = t + 0.05 + idx * 0.04;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, s);
      gain.gain.setValueAtTime(0.001, s);
      gain.gain.linearRampToValueAtTime(0.05, s + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0008, s + 0.65);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(s);
      osc.stop(s + 0.68);
    });
  }

  public playBrassRatchet(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(330, t);
    osc.frequency.exponentialRampToValueAtTime(660, t + 0.065);

    gain.gain.setValueAtTime(0.065, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.085);
  }

  public playAscensionFanfare(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const arp = [293.66, 369.99, 440.0, 587.33, 739.99, 880.0, 1174.66];
    arp.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const s = t + idx * 0.055;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, s);
      gain.gain.setValueAtTime(0.001, s);
      gain.gain.linearRampToValueAtTime(0.06, s + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0008, s + 0.75);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(s);
      osc.stop(s + 0.78);
    });
  }

  public dispose(): void {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
