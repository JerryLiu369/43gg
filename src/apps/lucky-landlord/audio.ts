export class LedgerAudioEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  public constructor(initialMuted = false) {
    this.muted = initialMuted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private ensureCtx(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtor) return null;
      this.ctx = new AudioCtor();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    freq: number,
    durationSec: number,
    type: OscillatorType,
    gainPeak: number,
    delaySec = 0,
    slideToFreq?: number,
  ): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;

    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideToFreq) {
      osc.frequency.exponentialRampToValueAtTime(slideToFreq, now + durationSec);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  /** Crisp wooden abacus bead click as each reel column stops */
  public playReelStop(colIndex: number): void {
    const baseFreq = 320 + colIndex * 52;
    this.playTone(baseFreq, 0.065, 'triangle', 0.08, 0, baseFreq * 1.15);
  }

  /** Coin chime scaled by payout magnitude */
  public playCoinPayout(totalCoins: number): void {
    if (totalCoins <= 0) return;
    if (totalCoins >= 40) {
      this.playTone(587.33, 0.14, 'sine', 0.1, 0);
      this.playTone(783.99, 0.16, 'sine', 0.1, 0.055);
      this.playTone(1046.5, 0.24, 'triangle', 0.11, 0.11);
    } else {
      this.playTone(659.25, 0.11, 'sine', 0.08, 0);
      this.playTone(880, 0.16, 'triangle', 0.08, 0.05);
    }
  }

  /** Tactile seal stamp thud for lock, swap, draft, or room renovation */
  public playStamp(): void {
    this.playTone(190, 0.09, 'triangle', 0.11, 0, 115);
    this.playTone(520, 0.05, 'sine', 0.05, 0.015);
  }

  /** Bright ascending triad for 3-of-a-kind Golden Star Merge */
  public playStarMerge(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, idx) => {
      this.playTone(f, 0.18, 'triangle', 0.09, idx * 0.055);
    });
  }

  /** Ceremonial fanfare when rent is paid or game is won */
  public playRentSuccess(): void {
    const chord = [440, 554.37, 659.25, 880];
    chord.forEach((f, idx) => {
      this.playTone(f, 0.26, 'sine', 0.09, idx * 0.06);
    });
  }

  /** Gentle descending sting on bankruptcy */
  public playBankrupt(): void {
    this.playTone(330, 0.22, 'sawtooth', 0.06, 0, 246.94);
    this.playTone(246.94, 0.32, 'triangle', 0.07, 0.18, 164.81);
  }

  public dispose(): void {
    if (this.ctx && this.ctx.state !== 'closed') {
      void this.ctx.close().catch(() => {});
    }
    this.ctx = null;
  }
}
