import * as THREE from 'three';
import { addToyLights, buildMonster, buildPlinth, disposeFigure, type MonsterBuild } from '../game/Monster';
import { ICONS } from './Icons';

/**
 * A little turntable for the monster you are building: drag to spin it
 * around its vertical axis, pinch (or scroll) to zoom. Opens over whatever
 * screen it was launched from and swallows keys while open (Esc closes).
 */
export class MonsterViewer {
  private root: HTMLDivElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  private figure: THREE.Group | null = null;
  private raf = 0;
  private yaw = -0.35;
  private yawVel = 0;
  /** Camera distance as a multiple of the framing distance (smaller = closer). */
  private zoom = 1;
  private fit = { center: new THREE.Vector3(), dist: 6 };
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchStart = 0;
  private zoomStart = 1;
  private lastT = 0;
  private dragging = false;
  private onKey = (e: KeyboardEvent) => {
    // The viewer owns the keyboard while it is open.
    e.stopImmediatePropagation();
    if (e.code === 'Escape') { e.preventDefault(); this.close(); }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.yawVel = -2.5;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') this.yawVel = 2.5;
    if (e.code === 'Equal' || e.code === 'NumpadAdd') this.setZoom(this.zoom * 0.85);
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') this.setZoom(this.zoom / 0.85);
  };

  get isOpen(): boolean {
    return this.root !== null;
  }

  open(build: MonsterBuild, title = 'Your monster', placeholders = true): void {
    this.close();
    const root = document.createElement('div');
    root.className = 'viewer';
    root.innerHTML = `
      <div class="viewer-card panel">
        <button class="viewer-close" aria-label="Close">${ICONS.close}</button>
        <div class="viewer-title">${title}</div>
        <div class="viewer-stage"></div>
        <div class="hint"><span class="kbd-only">drag to turn · scroll to zoom · Esc to close</span><span class="touch-only">drag to turn · pinch to zoom</span></div>
      </div>`;
    document.body.append(root);
    this.root = root;
    const stage = root.querySelector<HTMLDivElement>('.viewer-stage')!;
    root.addEventListener('pointerdown', (e) => { if (e.target === root) this.close(); });
    root.querySelector('.viewer-close')!.addEventListener('click', () => this.close());
    window.addEventListener('keydown', this.onKey, true);

    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    } catch (err) {
      console.warn('Monster viewer unavailable', err);
      stage.innerHTML = `<div class="piece-fallback big">${ICONS.monster}</div>`;
      return;
    }
    if (this.scene.children.length === 0) addToyLights(this.scene);
    const canvas = this.renderer.domElement;
    canvas.className = 'viewer-canvas';
    stage.append(canvas);

    this.figure = new THREE.Group();
    this.figure.add(buildMonster(build, placeholders), buildPlinth());
    this.scene.add(this.figure);
    const box = new THREE.Box3().setFromObject(this.figure);
    const dims = box.getSize(new THREE.Vector3());
    this.fit.center = box.getCenter(new THREE.Vector3());
    this.fit.dist = (Math.max(dims.x, dims.y) / 2 * 1.1) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) + dims.z / 2;
    this.yaw = -0.35;
    this.yawVel = 0.6;
    this.zoom = 1;

    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.up);
    canvas.addEventListener('wheel', this.wheel, { passive: false });

    this.lastT = performance.now();
    const loop = (now: number) => {
      if (!this.root) return;
      this.frame(Math.min(0.05, (now - this.lastT) / 1000), stage);
      this.lastT = now;
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  close(): void {
    if (!this.root) return;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey, true);
    if (this.figure) {
      this.scene.remove(this.figure);
      disposeFigure(this.figure);
      this.figure = null;
    }
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer = null;
    }
    this.pointers.clear();
    this.root.remove();
    this.root = null;
  }

  private setZoom(z: number): void {
    this.zoom = THREE.MathUtils.clamp(z, 0.35, 1.6);
  }

  private frame(dt: number, stage: HTMLElement): void {
    if (!this.renderer || !this.figure) return;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x !== w || size.y !== h) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / Math.max(1, h);
      this.camera.updateProjectionMatrix();
    }
    // Spin with a little inertia after a flick; settle to a slow idle turn.
    if (!this.dragging) {
      this.yaw += this.yawVel * dt;
      this.yawVel += (0.25 - this.yawVel) * (1 - Math.exp(-dt * 1.5));
    }
    this.figure.rotation.y = this.yaw;
    const d = this.fit.dist * this.zoom;
    // Zooming in also aims a little higher, toward the face.
    const c = this.fit.center.clone();
    c.y += (1 - Math.min(1, this.zoom)) * 0.45;
    this.camera.position.set(c.x, c.y + d * 0.18, c.z + d);
    this.camera.lookAt(c);
    this.renderer.render(this.scene, this.camera);
  }

  private down = (e: PointerEvent) => {
    try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch { /* synthetic or already-lifted pointer */ }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.dragging = true;
    this.yawVel = 0;
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
      this.zoomStart = this.zoom;
    }
  };

  private move = (e: PointerEvent) => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    this.pointers.set(e.pointerId, cur);
    if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchStart > 0) this.setZoom(this.zoomStart * (this.pinchStart / dist));
      return;
    }
    const dx = cur.x - prev.x;
    const turn = dx * 0.012;
    this.yaw += turn;
    this.yawVel = turn / 0.016;
  };

  private up = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchStart = 0;
    if (this.pointers.size === 0) {
      this.dragging = false;
      this.yawVel = THREE.MathUtils.clamp(this.yawVel, -6, 6);
    }
  };

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.setZoom(this.zoom * Math.exp(e.deltaY * 0.0015));
  };
}
