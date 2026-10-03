export type TouchDir = 'up' | 'down' | 'left' | 'right' | 'rotl' | 'rotr';

/**
 * Merges keyboard and on-screen touch controls into gantry axes and an
 * edge-triggered drop button. Screen "up" moves the gantry toward -Z.
 */
export class Input {
  private keys = new Set<string>();
  private touch: Record<TouchDir, boolean> = { up: false, down: false, left: false, right: false, rotl: false, rotr: false };
  private dropQueued = false;
  private anyQueued = false;
  /** Fired on the very first user gesture (used to unlock audio). */
  onFirstGesture: (() => void) | null = null;
  /** Fired on every tap or key press (iOS needs a gesture to wake suspended audio). */
  onGesture: (() => void) | null = null;
  private gestured = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.gesture();
      // Typing in a text field (naming your monster) never drives the crane.
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code === 'Enter') {
        this.dropQueued = true;
        e.preventDefault();
      }
      this.anyQueued = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('pointerdown', () => this.gesture(), { passive: true });
    // iOS only treats touchend/click as the gesture that may start audio.
    window.addEventListener('touchend', () => this.gesture(), { passive: true });
    window.addEventListener('click', () => this.gesture(), { passive: true });
  }

  private gesture(): void {
    this.onGesture?.();
    if (this.gestured) return;
    this.gestured = true;
    this.onFirstGesture?.();
  }

  /** Forget held keys and touch buttons (the app lost focus mid-press). */
  releaseAll(): void {
    this.keys.clear();
    for (const k of Object.keys(this.touch) as TouchDir[]) this.touch[k] = false;
  }

  setTouch(dir: TouchDir, pressed: boolean): void {
    this.touch[dir] = pressed;
    if (pressed) this.anyQueued = true;
  }

  pressDrop(): void {
    this.dropQueued = true;
    this.anyQueued = true;
  }

  get axisX(): number {
    let x = 0;
    if (this.keys.has('KeyA') || this.touch.left) x -= 1;
    if (this.keys.has('KeyD') || this.touch.right) x += 1;
    return x;
  }

  /** -1 = turn left, +1 = turn right (arrow keys, Q/E, touch buttons). */
  get rotate(): number {
    let r = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyQ') || this.touch.rotl) r -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyE') || this.touch.rotr) r += 1;
    return r;
  }

  get axisZ(): number {
    let z = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp') || this.touch.up) z -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown') || this.touch.down) z += 1;
    return z;
  }

  get moving(): boolean {
    return this.axisX !== 0 || this.axisZ !== 0 || this.rotate !== 0;
  }

  /** Returns true once per drop press. */
  consumeDrop(): boolean {
    const d = this.dropQueued;
    this.dropQueued = false;
    return d;
  }

  /** Returns true once per any press (used to dismiss the intro). */
  consumeAny(): boolean {
    const a = this.anyQueued;
    this.anyQueued = false;
    return a;
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }
}
