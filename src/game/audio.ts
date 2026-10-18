import { CarPhysicsState, PacenoteItem } from './types.ts';

export class RallyAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isMuted = false;
  private isPaused = false;

  // Engine oscillators
  private engOsc1: OscillatorNode | null = null;
  private engOsc2: OscillatorNode | null = null;
  private engOsc3: OscillatorNode | null = null;
  private engFilter: BiquadFilterNode | null = null;
  private engGain: GainNode | null = null;

  // Turbo whistle oscillator
  private turboOsc: OscillatorNode | null = null;
  private turboGain: GainNode | null = null;

  // Noise buffer for tire scrub, gravel pinging, wind, BOV, and backfire
  private noiseBuffer: AudioBuffer | null = null;

  // Continuous surface / tire loop
  private tireNoiseSource: AudioBufferSourceNode | null = null;
  private tireFilter: BiquadFilterNode | null = null;
  private tireGain: GainNode | null = null;

  // Tarmac tire squeal oscillator (peaks right around combinedSlip 0.85..1.6)
  private squealOsc: OscillatorNode | null = null;
  private squealGain: GainNode | null = null;

  // Wind noise loop
  private windSource: AudioBufferSourceNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;

  // Cooldowns for one-shot procedural impacts
  private lastGear = 1;
  private lastBovTime = 0;
  private lastBackfireTime = 0;
  private lastBumpTime = 0;
  private lastGravelPingTime = 0;

  public init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = this.isMuted ? 0 : 0.42;
      master.connect(ctx.destination);
      this.masterGain = master;

      // Create 2-second white/pink noise buffer
      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buffer;

      // 1. Multi-harmonic 4-cylinder rally engine rig
      const engFilter = ctx.createBiquadFilter();
      engFilter.type = 'lowpass';
      engFilter.frequency.value = 320;
      engFilter.Q.value = 2.4;

      const engGain = ctx.createGain();
      engGain.gain.value = 0.0;
      engFilter.connect(engGain);
      engGain.connect(master);

      const osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      const osc2 = ctx.createOscillator();
      osc2.type = 'triangle';
      const osc3 = ctx.createOscillator();
      osc3.type = 'square';

      const g1 = ctx.createGain();
      g1.gain.value = 0.55;
      const g2 = ctx.createGain();
      g2.gain.value = 0.35;
      const g3 = ctx.createGain();
      g3.gain.value = 0.18;

      osc1.connect(g1);
      osc2.connect(g2);
      osc3.connect(g3);
      g1.connect(engFilter);
      g2.connect(engFilter);
      g3.connect(engFilter);

      osc1.start();
      osc2.start();
      osc3.start();

      this.engOsc1 = osc1;
      this.engOsc2 = osc2;
      this.engOsc3 = osc3;
      this.engFilter = engFilter;
      this.engGain = engGain;

      // 2. Turbocharger whine
      const turboOsc = ctx.createOscillator();
      turboOsc.type = 'sine';
      const turboGain = ctx.createGain();
      turboGain.gain.value = 0;
      turboOsc.connect(turboGain);
      turboGain.connect(master);
      turboOsc.start();
      this.turboOsc = turboOsc;
      this.turboGain = turboGain;

      // 3. Tire / Surface broadband scrub loop
      const tireSource = ctx.createBufferSource();
      tireSource.buffer = buffer;
      tireSource.loop = true;
      const tireFilter = ctx.createBiquadFilter();
      tireFilter.type = 'bandpass';
      tireFilter.frequency.value = 800;
      tireFilter.Q.value = 1.8;
      const tireGain = ctx.createGain();
      tireGain.gain.value = 0;
      tireSource.connect(tireFilter);
      tireFilter.connect(tireGain);
      tireGain.connect(master);
      tireSource.start();
      this.tireNoiseSource = tireSource;
      this.tireFilter = tireFilter;
      this.tireGain = tireGain;

      // 4. Tarmac tire limit squeal
      const squealOsc = ctx.createOscillator();
      squealOsc.type = 'triangle';
      squealOsc.frequency.value = 1350;
      const squealGain = ctx.createGain();
      squealGain.gain.value = 0;
      squealOsc.connect(squealGain);
      squealGain.connect(master);
      squealOsc.start();
      this.squealOsc = squealOsc;
      this.squealGain = squealGain;

      // 5. Aerodynamic wind loop
      const windSource = ctx.createBufferSource();
      windSource.buffer = buffer;
      windSource.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 260;
      windFilter.Q.value = 1.2;
      const windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      windSource.start();
      this.windSource = windSource;
      this.windFilter = windFilter;
      this.windGain = windGain;
    } catch {
      // Web Audio blocked or unavailable
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted || this.isPaused ? 0 : 0.42, this.ctx.currentTime, 0.04);
    }
    if (muted && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setPaused(paused: boolean): void {
    this.isPaused = paused;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(paused || this.isMuted ? 0 : 0.42, this.ctx.currentTime, 0.04);
    }
  }

  public update(state: CarPhysicsState): void {
    if (!this.ctx || !this.masterGain || this.isMuted || this.isPaused) return;
    if (this.ctx.state === 'suspended') return;

    const now = this.ctx.currentTime;

    // 1. Engine pitch & load modulation
    if (this.engOsc1 && this.engOsc2 && this.engOsc3 && this.engFilter && this.engGain) {
      if (state.stalled) {
        this.engGain.gain.setTargetAtTime(state.starterCranking > 0 ? 0.12 : 0.0, now, 0.03);
        this.engOsc1.frequency.setTargetAtTime(42, now, 0.03);
      } else {
        // 4-cylinder firing frequency: (RPM / 60) * 2
        const f0 = Math.max(26, (state.rpm / 60) * 2.0);
        this.engOsc1.frequency.setTargetAtTime(f0, now, 0.02);
        this.engOsc2.frequency.setTargetAtTime(f0 * 0.5, now, 0.02);
        this.engOsc3.frequency.setTargetAtTime(f0 * 2.0, now, 0.02);

        // Open intake filter under throttle load and high RPM
        const filterCutoff = 190 + (state.rpm / 8000) * 1450 + state.throttle * 820;
        this.engFilter.frequency.setTargetAtTime(filterCutoff, now, 0.03);

        // Rev-limiter flutter at > 7680 RPM
        const limiterMod = state.rpm > 7680 ? ((Math.floor(now * 35) % 2) * 0.14) : 0;
        const baseVol = 0.18 + state.throttle * 0.14 + (state.rpm / 8000) * 0.1 - limiterMod;
        this.engGain.gain.setTargetAtTime(Math.max(0.05, baseVol), now, 0.03);
      }
    }

    // 2. Turbo whistle
    if (this.turboOsc && this.turboGain) {
      const boost = Math.max(0, state.turboBoostBar);
      this.turboOsc.frequency.setTargetAtTime(1600 + boost * 1950 + state.rpm * 0.12, now, 0.04);
      this.turboGain.gain.setTargetAtTime(boost * 0.045, now, 0.04);
    }

    // 3. Gear shift mechanical clunk & BOV flutter & exhaust backfire
    if (state.gear !== this.lastGear) {
      this.lastGear = state.gear;
      this.playGearShiftClunk(state.missedShiftCrunch > 0);
    }

    if (state.bovVentTrigger > 0.25 && now - this.lastBovTime > 0.28) {
      this.lastBovTime = now;
      this.playTurboBovFlutter();
    }

    if (state.backfireTrigger > 0.15 && now - this.lastBackfireTime > 0.18) {
      this.lastBackfireTime = now;
      this.playExhaustBackfirePop();
    }

    // 4. Tire slip & surface acoustics
    const maxCombinedSlip = Math.max(
      state.wheels[0].combinedSlip,
      state.wheels[1].combinedSlip,
      state.wheels[2].combinedSlip,
      state.wheels[3].combinedSlip
    );
    const speedNorm = Math.min(1, Math.abs(state.forwardSpeedMs) / 28);
    const anyGrounded =
      state.wheels[0].isGrounded ||
      state.wheels[1].isGrounded ||
      state.wheels[2].isGrounded ||
      state.wheels[3].isGrounded;

    if (this.tireFilter && this.tireGain && this.squealOsc && this.squealGain) {
      if (!anyGrounded || speedNorm < 0.03) {
        this.tireGain.gain.setTargetAtTime(0, now, 0.04);
        this.squealGain.gain.setTargetAtTime(0, now, 0.04);
      } else {
        const slipIntensity = Math.min(1.5, Math.max(0, maxCombinedSlip - 0.35));
        let filterFreq = 750;
        let noiseVol = speedNorm * 0.06 + slipIntensity * 0.16;

        if (state.currentSurface === 'gravel' || state.currentSurface === 'tarmac_dirty') {
          filterFreq = 950 + slipIntensity * 450;
          noiseVol = speedNorm * 0.11 + slipIntensity * 0.22;
        } else if (state.currentSurface === 'snow') {
          filterFreq = 1400;
          noiseVol = speedNorm * 0.08 + slipIntensity * 0.15;
        } else if (state.currentSurface === 'water_puddle') {
          filterFreq = 1850;
          noiseVol = speedNorm * 0.24;
        }

        this.tireFilter.frequency.setTargetAtTime(filterFreq, now, 0.04);
        this.tireGain.gain.setTargetAtTime(Math.min(0.32, noiseVol), now, 0.04);

        // Tarmac tire squeal right around the grip peak & transition zone (0.75 < slip < 2.2)
        if (
          (state.currentSurface === 'tarmac' || state.currentSurface === 'tarmac_dirty') &&
          maxCombinedSlip > 0.72
        ) {
          const squealLevel = Math.min(1, (maxCombinedSlip - 0.72) * 1.4) * speedNorm;
          this.squealOsc.frequency.setTargetAtTime(1180 + Math.min(400, maxCombinedSlip * 140), now, 0.03);
          this.squealGain.gain.setTargetAtTime(squealLevel * 0.065, now, 0.03);
        } else {
          this.squealGain.gain.setTargetAtTime(0, now, 0.03);
        }
      }
    }

    // 5. Gravel stones pinging against chassis skidplate
    if (
      anyGrounded &&
      (state.currentSurface === 'gravel' || state.currentSurface === 'tarmac_dirty') &&
      speedNorm > 0.25 &&
      now - this.lastGravelPingTime > 0.09 - speedNorm * 0.05 &&
      Math.random() < 0.45
    ) {
      this.lastGravelPingTime = now;
      this.playGravelSkidplatePing();
    }

    // 6. Suspension bottoming-out / jump landing thud
    const maxBottomOut = Math.max(
      state.wheels[0].bottomedOutImpact,
      state.wheels[1].bottomedOutImpact,
      state.wheels[2].bottomedOutImpact,
      state.wheels[3].bottomedOutImpact
    );
    if (maxBottomOut > 0.55 && now - this.lastBumpTime > 0.25) {
      this.lastBumpTime = now;
      this.playSuspensionThud(maxBottomOut);
    }

    // 7. Wind rush noise at high speed
    if (this.windFilter && this.windGain) {
      this.windFilter.frequency.setTargetAtTime(200 + speedNorm * 520, now, 0.05);
      this.windGain.gain.setTargetAtTime(speedNorm * speedNorm * 0.14, now, 0.05);
    }
  }

  private playGearShiftClunk(isMissedShift: boolean): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isMissedShift ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(isMissedShift ? 240 : 125, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + (isMissedShift ? 0.22 : 0.075));

    gain.gain.setValueAtTime(isMissedShift ? 0.25 : 0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isMissedShift ? 0.22 : 0.08));

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + (isMissedShift ? 0.23 : 0.085));
  }

  private playTurboBovFlutter(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2900, now);
    filter.frequency.exponentialRampToValueAtTime(1600, now + 0.22);
    filter.Q.value = 4.5;

    const gain = this.ctx.createGain();
    // Characteristic rally turbo "stu-tu-tu" flutter envelope
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.setValueAtTime(0.04, now + 0.05);
    gain.gain.setValueAtTime(0.11, now + 0.09);
    gain.gain.setValueAtTime(0.03, now + 0.14);
    gain.gain.setValueAtTime(0.07, now + 0.17);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.25);
  }

  private playExhaustBackfirePop(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(480, now);
    filter.frequency.exponentialRampToValueAtTime(95, now + 0.11);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.13);
  }

  private playGravelSkidplatePing(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    const freq = 2600 + Math.random() * 2400;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.65, now + 0.025);

    gain.gain.setValueAtTime(0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.028);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.03);
  }

  private playSuspensionThud(intensity: number): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.14);

    gain.gain.setValueAtTime(Math.min(0.3, intensity * 0.22), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  /**
   * Co-driver pacenote voice callout via Web Speech API + procedural intercom radio beep.
   */
  public speakPacenote(note: PacenoteItem, enabled: boolean): void {
    if (!enabled || this.isMuted || this.isPaused) return;

    // Play crisp rally intercom radio beep
    if (this.ctx && this.masterGain && this.ctx.state === 'running') {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.severity <= 2 && note.severity > 0 ? 1040 : 780, now);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.065);
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(note.calloutSpeechZh);
        utter.lang = 'zh-CN';
        utter.rate = 1.25; // Urgent, crisp rally co-driver cadence
        utter.pitch = 1.02;
        utter.volume = 0.9;
        window.speechSynthesis.speak(utter);
      } catch {
        // Ignore speech synthesis errors in headless environments
      }
    }
  }
}
