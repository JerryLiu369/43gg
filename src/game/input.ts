import { RawControlsInput } from './physics.ts';

export class InputController {
  private keysDown = new Set<string>();
  private justPressed = new Set<string>();

  // Progressive keyboard analog emulation states
  private kbSteer = 0; // -1..1
  private kbThrottle = 0; // 0..1
  private kbBrake = 0; // 0..1
  private kbHandbrake = 0; // 0..1
  private kbClutch = 0; // 0..1

  // Touch input states (for mobile / tablet)
  public touchSteer = 0; // -1..1
  public touchThrottle = 0; // 0..1
  public touchBrake = 0; // 0..1
  public touchHandbrake = 0; // 0..1
  public touchClutch = 0; // 0..1

  // Gamepad previous button states for edge detection
  private prevGpButtons: boolean[] = [];

  // Callbacks for global shortcuts (Camera toggle, Pause, Reset)
  public onToggleCamera?: () => void;
  public onTogglePause?: () => void;

  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;
  private boundBlur: () => void;

  constructor() {
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundKeyUp = this.handleKeyUp.bind(this);
    this.boundBlur = this.clearAll.bind(this);

    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
    window.addEventListener('blur', this.boundBlur);
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
    window.removeEventListener('blur', this.boundBlur);
  }

  public clearAll(): void {
    this.keysDown.clear();
    this.justPressed.clear();
    this.kbSteer = 0;
    this.kbThrottle = 0;
    this.kbBrake = 0;
    this.kbHandbrake = 0;
    this.kbClutch = 0;
    this.touchSteer = 0;
    this.touchThrottle = 0;
    this.touchBrake = 0;
    this.touchHandbrake = 0;
    this.touchClutch = 0;
  }

  public triggerTouchAction(action: 'shiftUp' | 'shiftDown' | 'ignition'): void {
    if (action === 'shiftUp') this.justPressed.add('KeyE');
    if (action === 'shiftDown') this.justPressed.add('KeyQ');
    if (action === 'ignition') this.justPressed.add('KeyI');
  }

  private handleKeyDown(e: KeyboardEvent): void {
    // Ignore when typing in form inputs
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    const code = e.code;
    if (!this.keysDown.has(code)) {
      this.justPressed.add(code);
      if (code === 'KeyC') {
        this.onToggleCamera?.();
      } else if (code === 'Escape' || code === 'KeyP') {
        this.onTogglePause?.();
      }
    }
    this.keysDown.add(code);

    if (
      code === 'Space' ||
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight'
    ) {
      e.preventDefault();
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.keysDown.delete(e.code);
  }

  /**
   * Samples progressive keyboard, linear gamepad, and mobile touch controls.
   */
  public sample(dt: number): RawControlsInput {
    // 1. Progressive Keyboard Steering (supports quick feathering taps vs long holds)
    const leftHeld = this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft');
    const rightHeld = this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight');
    const upHeld = this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp');
    const downHeld = this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown');
    const hbHeld = this.keysDown.has('Space');
    const clutchHeld = this.keysDown.has('ShiftLeft') || this.keysDown.has('ShiftRight') || this.keysDown.has('KeyK');

    if (leftHeld && !rightHeld) {
      // Fast snap across center if counter-steering from right to left
      const rate = this.kbSteer > 0 ? 9.5 : 3.8;
      this.kbSteer = Math.max(-1, this.kbSteer - rate * dt);
    } else if (rightHeld && !leftHeld) {
      const rate = this.kbSteer < 0 ? 9.5 : 3.8;
      this.kbSteer = Math.min(1, this.kbSteer + rate * dt);
    } else {
      // Self-centering return
      const returnRate = 6.8;
      if (Math.abs(this.kbSteer) < returnRate * dt) {
        this.kbSteer = 0;
      } else {
        this.kbSteer -= Math.sign(this.kbSteer) * returnRate * dt;
      }
    }

    // Progressive Keyboard Throttle & Brake (allows feathering 40%-60% throttle by tapping)
    if (upHeld) {
      this.kbThrottle = Math.min(1, this.kbThrottle + 5.2 * dt);
    } else {
      this.kbThrottle = Math.max(0, this.kbThrottle - 7.5 * dt);
    }

    if (downHeld) {
      this.kbBrake = Math.min(1, this.kbBrake + 5.8 * dt);
    } else {
      this.kbBrake = Math.max(0, this.kbBrake - 8.5 * dt);
    }

    this.kbHandbrake = hbHeld
      ? Math.min(1, this.kbHandbrake + 12 * dt)
      : Math.max(0, this.kbHandbrake - 14 * dt);

    this.kbClutch = clutchHeld
      ? Math.min(1, this.kbClutch + 14 * dt)
      : Math.max(0, this.kbClutch - 10 * dt);

    let shiftUp =
      this.justPressed.has('KeyE') ||
      this.justPressed.has('Period') ||
      this.justPressed.has('KeyX');
    let shiftDown =
      this.justPressed.has('KeyQ') ||
      this.justPressed.has('Comma') ||
      this.justPressed.has('KeyZ');
    let ignition = this.justPressed.has('KeyI') || this.justPressed.has('Enter');

    // 2. Poll Standard Gamepad API (Linear Triggers L2/R2 + Analog Stick)
    let gpSteer = 0;
    let gpThrottle = 0;
    let gpBrake = 0;
    let gpHandbrake = 0;
    let gpClutch = 0;

    if (typeof navigator !== 'undefined' && navigator.getGamepads) {
      const pads = navigator.getGamepads();
      const gp = pads[0] || pads[1] || pads[2] || pads[3];
      if (gp && gp.connected) {
        gpSteer = gp.axes[0] || 0;
        // Linear analog triggers: R2 (button 7) = throttle, L2 (button 6) = brake
        gpThrottle = gp.buttons[7]?.value ?? 0;
        gpBrake = gp.buttons[6]?.value ?? 0;
        // Handbrake on Circle/B (button 1) or R1
        gpHandbrake = gp.buttons[1]?.value ?? 0;
        // Clutch on L1 (button 4) or right stick Y
        gpClutch = gp.buttons[4]?.value ?? 0;

        const bShiftUp = Boolean(gp.buttons[5]?.pressed || gp.buttons[0]?.pressed); // R1 or A/Cross
        const bShiftDown = Boolean(gp.buttons[2]?.pressed); // X/Square
        const bCam = Boolean(gp.buttons[3]?.pressed); // Y/Triangle
        const bPause = Boolean(gp.buttons[9]?.pressed); // Start/Options

        if (bShiftUp && !this.prevGpButtons[5]) shiftUp = true;
        if (bShiftDown && !this.prevGpButtons[2]) shiftDown = true;
        if (bCam && !this.prevGpButtons[3]) this.onToggleCamera?.();
        if (bPause && !this.prevGpButtons[9]) this.onTogglePause?.();

        this.prevGpButtons[5] = bShiftUp;
        this.prevGpButtons[2] = bShiftDown;
        this.prevGpButtons[3] = bCam;
        this.prevGpButtons[9] = bPause;
      }
    }

    this.justPressed.clear();

    // Combine Keyboard, Gamepad, and Touch (taking strongest active source)
    const steer =
      Math.abs(gpSteer) > 0.05
        ? gpSteer
        : Math.abs(this.touchSteer) > 0.01
          ? this.touchSteer
          : this.kbSteer;

    const throttle = Math.max(this.kbThrottle, gpThrottle, this.touchThrottle);
    const brake = Math.max(this.kbBrake, gpBrake, this.touchBrake);
    const handbrake = Math.max(this.kbHandbrake, gpHandbrake, this.touchHandbrake);
    const clutch = Math.max(this.kbClutch, gpClutch, this.touchClutch);

    return {
      steer,
      throttle,
      brake,
      handbrake,
      clutch,
      shiftUpJustPressed: shiftUp,
      shiftDownJustPressed: shiftDown,
      ignitionJustPressed: ignition,
    };
  }
}
