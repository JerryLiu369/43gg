export class MoonMirrorAudio {
  private context: AudioContext | null = null;
  private muted: boolean;
  private disposed = false;
  private activeNodes = new Set<OscillatorNode>();

  constructor(muted = false) {
    this.muted = muted;
  }

  private stopActiveNodes(): void {
    for (const oscillator of this.activeNodes) {
      try {
        oscillator.stop();
      } catch {
        // The node may already have ended.
      }
    }
    this.activeNodes.clear();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.stopActiveNodes();
      if (this.context?.state === 'running') this.context.suspend().catch(() => {});
    }
  }

  private getContext(): AudioContext | null {
    if (this.disposed || this.muted || typeof window === 'undefined') return null;
    if (typeof navigator !== 'undefined' && navigator.webdriver) return null;
    if (!this.context) {
      const AudioCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return null;
      try {
        this.context = new AudioCtor();
      } catch {
        return null;
      }
    }
    if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    return this.context;
  }

  private tone(
    frequency: number,
    duration: number,
    volume: number,
    delay = 0,
    type: OscillatorType = 'sine',
  ): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    this.activeNodes.add(oscillator);
    oscillator.onended = () => {
      this.activeNodes.delete(oscillator);
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  playSelect(): void {
    this.tone(740, 0.1, 0.025);
  }

  playRotate(): void {
    this.tone(392, 0.18, 0.04, 0, 'triangle');
    this.tone(587.33, 0.24, 0.035, 0.055);
  }

  playMove(): void {
    this.tone(293.66, 0.13, 0.035, 0, 'triangle');
    this.tone(440, 0.18, 0.025, 0.045);
  }

  playFlower(): void {
    this.tone(880, 0.4, 0.04);
    this.tone(1318.51, 0.46, 0.022, 0.035);
  }

  playWin(): void {
    [440, 554.37, 659.25, 880, 1108.73].forEach((note, index) => {
      this.tone(note, 0.72, 0.042, index * 0.09, index % 2 ? 'sine' : 'triangle');
    });
  }

  playError(): void {
    this.tone(174.61, 0.18, 0.025, 0, 'triangle');
  }

  dispose(): void {
    this.disposed = true;
    this.stopActiveNodes();
    if (this.context) {
      this.context.close().catch(() => {});
      this.context = null;
    }
  }
}
