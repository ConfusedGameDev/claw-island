import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';
import { damp } from '../util/math';

/**
 * Render -> horizontal tilt-shift -> vertical tilt-shift -> output.
 * The focus line follows a world-space point (the claw head).
 */
export class PostFX {
  readonly composer: EffectComposer;
  private hPass: ShaderPass;
  private vPass: ShaderPass;
  private focus = 0.45;
  strength: number;
  private tmp = new THREE.Vector3();

  constructor(
    private renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
  ) {
    this.strength = window.matchMedia('(pointer: coarse)').matches ? 1.4 : 2.2;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.hPass = new ShaderPass(HorizontalTiltShiftShader);
    this.vPass = new ShaderPass(VerticalTiltShiftShader);
    this.composer.addPass(this.hPass);
    this.composer.addPass(this.vPass);
    this.composer.addPass(new OutputPass());
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = this.renderer.getPixelRatio();
    this.composer.setSize(w, h);
    this.hPass.uniforms.h.value = this.strength / (w * dpr);
    this.vPass.uniforms.v.value = this.strength / (h * dpr);
  }

  /** Move the sharp band toward the screen-y of a world point. */
  track(point: THREE.Vector3, dt: number): void {
    this.tmp.copy(point).project(this.camera);
    const target = THREE.MathUtils.clamp((this.tmp.y + 1) / 2, 0.15, 0.85);
    this.focus = damp(this.focus, target, 6, dt);
    this.hPass.uniforms.r.value = this.focus;
    this.vPass.uniforms.r.value = this.focus;
  }

  render(): void {
    this.composer.render();
  }
}
