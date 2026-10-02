import * as THREE from 'three';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { Diorama } from '../scene/SceneBuilder';
import { Environment } from '../scene/Environment';
import { RailBridge } from '../scene/RailBridge';
import { PAL, plastic, setupEnvironment } from '../scene/Materials';
import { PostFX } from '../scene/PostFX';
import { Claw } from '../entities/Claw';
import { Button } from '../entities/Button';
import { Hole } from '../entities/Hole';
import { Chicken } from '../entities/Chicken';
import { Crab } from '../entities/Crab';
import { Ghost } from '../entities/Ghost';
import { type Critter, type Obstacle, RectRegion, EllipseRegion } from '../entities/Critter';
import { tickWater } from '../scene/Water';
import {
  COLLECTIBLE_KINDS, PICKUP_KINDS, Collectible, EMOJI_FALLBACK, KINDS, collectibleOf, pickSpawnPoints, renderIcons, type Kind,
} from '../entities/Collectible';
import { Hud, type PieceReward } from '../ui/Hud';
import { Input } from './Input';
import { Sfx } from '../audio/Sfx';
import { computeScore, type RunStats, type ScoreBreakdown } from './Scoring';
import { LAYOUT } from './Layout';
import { type LevelDef } from './Levels';
import { type Campaign, type CampaignId, gameUrl, switchCampaign } from './Campaign';
import { MONSTERS, MonsterPortrait, SLOTS, monsterName, pieceLabel, rollPiece, type MonsterBuild } from './Monster';
import { composeCard, downloadCard, shareCard } from '../ui/Share';
import { damp, easeInOutSine, easeOutCubic, lerp, mulberry32, shuffle, windValue } from '../util/math';

export type Phase = 'INTRO' | 'PHASE_WEIGHT' | 'HOLE_OPENING' | 'PHASE_COLLECT' | 'RESULTS' | 'TRAVEL' | 'FINAL';

interface Particle { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }

interface LevelRuntime {
  def: LevelDef;
  diorama: Diorama;
  button: Button;
  hole: Hole;
  collectibles: Collectible[];
  critters: Critter[];
  targets: string[];
  /** Factory: items still to be dropped onto the belt, and the countdown to the next one. */
  feed: string[];
  feedT: number;
}

const SPECIAL_NAMES: Record<string, string> = { diamondcrab: 'Diamond Crab', crownghost: 'Ghost King' };
const PIECES_SUFFIX = '.monster';

export interface LevelResult { level: LevelDef; breakdown: ScoreBreakdown; stats: RunStats }

const BRIDGE_TIME = 0.8;
const RIDE_TIME = 3.0;

export class Game {
  phase: Phase = 'INTRO';
  seed = 0;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly phys: PhysicsWorld;
  readonly env: Environment;
  readonly postfx: PostFX;
  readonly claw: Claw;
  readonly hud: Hud;
  readonly input: Input;
  readonly sfx = new Sfx();
  readonly levels: LevelRuntime[] = [];
  readonly bridges: RailBridge[] = [];

  currentLevel = 0;
  targets: string[] = [];
  stats: RunStats = { seconds: 0, attempts: 0, targetsDelivered: 0, decoysDropped: 0, slips: 0 };
  results: LevelResult[] = [];
  private timerRunning = false;
  private phaseT = 0;
  private time = 0;
  private lastNow = 0;
  private icons: Record<string, string> = {};
  private particles: Particle[] = [];
  private particleGeo = new THREE.SphereGeometry(0.05, 6, 5);
  private camBase = new THREE.Vector3(0, 10.2, 7.6);
  private camLook = new THREE.Vector3(0, 0.4, -0.6);
  /** Camera anchor: the active island's origin (tweened while travelling). */
  private viewOrigin = new THREE.Vector3();
  private camX = 0;
  private shake = 0;
  private travel = { from: 0, to: 0, t: 0, humT: 0, clanked: false };
  private debugLines: THREE.LineSegments | null = null;
  private debugOn = false;
  private rng: () => number = Math.random;
  /** Spooky campaign: body pieces won so far this run. */
  pieces: MonsterBuild = {};
  private portrait: MonsterPortrait | null = null;

  constructor(canvas: HTMLCanvasElement, readonly campaign: Campaign) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.matchMedia('(pointer: coarse)').matches ? 1.5 : 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene.background = new THREE.Color(PAL.navy);
    setupEnvironment(this.renderer, this.scene);

    this.camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.5, 80);
    this.applyCameraLayout();

    this.phys = new PhysicsWorld();
    this.env = new Environment(this.scene, campaign.look === 'bone');
    for (const def of this.levelDefs) {
      this.levels.push({
        def,
        diorama: new Diorama(this.scene, this.phys, def),
        button: new Button(this.scene, this.phys, def.origin, def.button),
        hole: new Hole(this.scene, this.phys, def.origin),
        collectibles: [],
        critters: [],
        targets: [],
        feed: [],
        feedT: 0,
      });
    }
    for (let i = 0; i < this.levelDefs.length - 1; i++) {
      this.bridges.push(new RailBridge(this.scene, this.levelDefs[i].origin, this.levelDefs[i + 1].origin, campaign.look));
    }
    this.claw = new Claw(this.scene, this.phys, campaign.look);
    this.postfx = new PostFX(this.renderer, this.scene, this.camera);
    this.input = new Input();
    this.hud = new Hud(this.input);
    this.input.onFirstGesture = () => this.sfx.unlock();
    this.icons = renderIcons([
      ...PICKUP_KINDS.map((k) => ({ key: k, build: () => KINDS[k].buildMesh() })),
      { key: 'diamondcrab', build: () => Crab.buildIconMesh('diamond', this.levelDefs.find((l) => l.special === 'diamondcrab')?.critterSkin) },
      { key: 'crownghost', build: () => Ghost.buildIconMesh('crown') },
    ]);

    this.claw.events = {
      onAttempt: () => {
        this.stats.attempts++;
        this.hud.setAttempts(this.stats.attempts);
        this.timerRunning = true;
        this.sfx.descend();
      },
      onGrab: (c) => {
        this.sfx.grab();
        // Lifting a white cucco provokes the black ones.
        if (c.kind === 'chicken') {
          for (const g of this.cur.critters) if (g.kind === 'blackchicken' && !g.removed) g.chargeAt(() => this.claw.pos, 2.6);
        }
      },
      onTell: () => this.sfx.rattle(),
      onMiss: () => this.sfx.miss(),
      onSlip: () => {
        this.stats.slips++;
        this.hud.toast('Slipped!', 'bad');
        this.sfx.slip();
      },
      onEscape: (c) => {
        this.hud.toast(`The ${c.name} got away!`, 'bad');
        this.sfx.squawk();
      },
      onRelease: () => this.sfx.release(),
      onTooHeavy: () => {
        this.hud.toast('Too heavy for the claw!', 'bad');
        this.sfx.wrong();
        this.shake = 0.12;
      },
      onToolPickup: (c) => {
        const col = this.cur.collectibles.find((x) => x === c);
        col?.dispose();
        this.hud.toast('Magnet attached! 🧲', 'good');
        this.sfx.deliver();
      },
    };
    for (const lv of this.levels) lv.button.onPressed = () => this.onButtonPressed(lv);

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'KeyP') this.toggleDebug();
      if (e.code === 'KeyM') this.sfx.muted = !this.sfx.muted;
    });

    const urlSeed = new URLSearchParams(location.search).get('seed');
    this.reset(urlSeed ? Number(urlSeed) >>> 0 : undefined);
  }

  get levelDefs(): LevelDef[] {
    return this.campaign.levels;
  }

  get cur(): LevelRuntime {
    return this.levels[this.currentLevel];
  }

  // ------------------------------------------------------------- lifecycle
  /** New run from level 1 (shows the intro, with a resume option if any). */
  reset(seed?: number): void {
    this.prepare(0, seed);
    this.setPhase('INTRO');
    const saved = this.loadProgress();
    this.pieces = this.loadPieces();
    this.hud.showIntro(
      this.campaign,
      () => this.startRun(),
      saved > 0 ? {
        level: this.levelDefs[saved],
        pieces: Object.keys(this.pieces).length,
        onResume: () => { this.prepare(saved, this.seed); this.startRun(); },
      } : undefined,
      (id: CampaignId) => switchCampaign(id),
    );
  }

  /** Clear every island, then set up `levelIndex` as the active one. */
  private prepare(levelIndex: number, seed?: number): void {
    this.seed = seed ?? (Math.floor(Math.random() * 0xffffffff) >>> 0);
    this.rng = mulberry32(this.seed);
    for (const lv of this.levels) {
      for (const c of lv.collectibles) c.dispose();
      for (const c of lv.critters) c.dispose();
      lv.collectibles = [];
      lv.critters = [];
      lv.targets = [];
      lv.feed = [];
      lv.diorama.conveyorRunning = false;
      lv.button.reset();
      lv.hole.reset();
    }
    for (const p of this.particles) this.scene.remove(p.mesh);
    this.particles = [];
    this.results = [];
    this.bridges.forEach((b, i) => b.setExtension(i < levelIndex ? 1 : 0));
    this.currentLevel = levelIndex;
    const def = this.cur.def;
    this.claw.reset(def.origin);
    this.applyLevelRules(def);
    this.viewOrigin.set(def.origin.x, 0, def.origin.z);
    this.camX = 0;
    this.env.focus(def.origin);
    this.env.mood(def.theme.sky, def.theme.light, 0, true);
    this.hud.setLevel(def);
    this.beginLevelStats();
    this.spawnLevel(this.cur);
  }

  /** Per-island claw rules. */
  private applyLevelRules(def: LevelDef): void {
    this.claw.gripScale = def.gripScale;
    this.claw.heavyAll = Boolean(def.heavy);
    this.claw.wind = 0;
  }

  private beginLevelStats(): void {
    this.stats = { seconds: 0, attempts: 0, targetsDelivered: 0, decoysDropped: 0, slips: 0 };
    this.timerRunning = false;
    this.hud.setTimer(0);
    this.hud.setAttempts(0);
    this.hud.showTargets(false);
  }

  private spawnLevel(lv: LevelRuntime): void {
    const { SPAWN, HOLE, WEIGHT } = LAYOUT;
    const def = lv.def;
    const o = def.origin;
    const gravity = def.gravityScale ?? 1;
    const bouncy = def.theme.floorRestitution ?? 0;
    const add = (c: Collectible) => {
      if (gravity !== 1) c.body.setGravityScale(gravity, true);
      // Candy: the toys themselves are springy too (the weight stays dead so the button works).
      if (bouncy && c.kind !== 'weight') c.collider.setRestitution(0.8);
      lv.collectibles.push(c);
      return c;
    };
    add(new Collectible('weight', { x: o.x + def.weight.x, y: WEIGHT.y, z: o.z + def.weight.z }, 0, this.phys, this.scene, false));
    if (def.magnet) add(new Collectible('magnet', { x: o.x + def.magnet.x, y: 0.5, z: o.z + def.magnet.z }, 0.4, this.phys, this.scene, false));

    const kinds = shuffle(def.pool ?? COLLECTIBLE_KINDS, this.rng);
    const kindTargets = def.special ? def.targets - 1 : def.targets;
    const targetKinds = kinds.slice(0, kindTargets);
    const targets: string[] = [...(def.special ? [def.special] : []), ...targetKinds];
    const decoyKinds = kinds.slice(kindTargets);
    const fill = (n: number): Kind[] => {
      const out: Kind[] = [];
      while (out.length < n) for (const k of decoyKinds) if (out.length < n) out.push(k);
      return shuffle(out, this.rng);
    };
    // Factory: targets arrive on the belt mixed with junk; only a little junk lies around.
    const C = def.conveyor;
    lv.feed = C ? shuffle([...targetKinds, ...fill(C.feedJunk)], this.rng) : [];
    lv.feedT = 0.6;
    const toSpawn = shuffle([...(C ? [] : targetKinds), ...fill(def.decoys)], this.rng);
    const exclusions = [
      { x: def.button.x, z: def.button.z, r: 1.0 },
      { x: def.weight.x, z: def.weight.z, r: 0.7 },
      { x: HOLE.x, z: HOLE.z, r: 1.0 },
      ...(def.magnet ? [{ x: def.magnet.x, z: def.magnet.z, r: 0.7 }] : []),
      ...(def.lagoon ? [{ x: def.lagoon.x, z: def.lagoon.z, r: Math.max(def.lagoon.rx, def.lagoon.rz) + 0.35 }] : []),
      ...(C ? Array.from({ length: Math.ceil((C.x1 - C.x0) / 0.5) + 1 }, (_, i) => ({ x: C.x0 + i * 0.5, z: C.z, r: 0.75 })) : []),
    ];
    const points = pickSpawnPoints(toSpawn.length, this.rng, SPAWN, exclusions, 0.55);
    toSpawn.forEach((kind, i) => {
      const p = points[i] ?? new THREE.Vector2(0, 0);
      const y = 1.2 + this.rng() * 1.0;
      add(new Collectible(kind, { x: o.x + p.x, y, z: o.z + p.y }, this.rng() * Math.PI * 2, this.phys, this.scene, targets.includes(kind)));
    });

    const { FENCE } = LAYOUT;
    const landAvoid = [
      { x: o.x + def.button.x, z: o.z + def.button.z, r: LAYOUT.BUTTON.radius + 0.35 },
      ...(def.lagoon ? [{ x: o.x + def.lagoon.x, z: o.z + def.lagoon.z, r: Math.max(def.lagoon.rx, def.lagoon.rz) + 0.3 }] : []),
    ];
    const land = new RectRegion(o.x, o.z, FENCE.hx - 0.4, FENCE.hz - 0.4, landAvoid);
    const critterPoints = pickSpawnPoints(def.critter === 'none' ? 0 : def.critters + (def.guards ?? 0), this.rng, { hx: FENCE.hx - 0.5, hz: FENCE.hz - 0.5 }, [
      ...exclusions, { x: def.button.x, z: def.button.z, r: 1.1 },
      ...points.map((p) => ({ x: p.x, z: p.y, r: 0.5 })),
    ], 0.8);
    critterPoints.forEach((p, i) => {
      const start = { x: o.x + p.x, z: o.z + p.y };
      const guard = i >= def.critters;
      const c: Critter = def.critter === 'crab'
        ? new Crab(this.scene, this.phys, start, this.rng, def, land, 'red')
        : def.critter === 'ghost'
          ? new Ghost(this.scene, this.phys, start, this.rng, def, land, 'plain')
          : new Chicken(this.scene, this.phys, start, this.rng, def, land, guard ? 'black' : 'white');
      c.onSquawk = () => this.sfx.squawk();
      c.onChatter = () => this.sfx.cluck();
      if (guard) c.onReach = () => this.onGuardReached(c);
      lv.critters.push(c);
    });
    if (def.special === 'diamondcrab' && def.lagoon) {
      const L = def.lagoon;
      const pond = new EllipseRegion(o.x + L.x, o.z + L.z, L.rx * 0.7, L.rz * 0.7);
      const dc = new Crab(this.scene, this.phys, { x: o.x + L.x, z: o.z + L.z }, this.rng, def, pond, 'diamond');
      dc.onSquawk = () => this.sfx.squawk();
      lv.critters.push(dc);
    }
    if (def.special === 'crownghost') {
      const [p] = pickSpawnPoints(1, this.rng, { hx: FENCE.hx - 0.8, hz: FENCE.hz - 0.8 }, exclusions, 0.5);
      const king = new Ghost(this.scene, this.phys, { x: o.x + (p?.x ?? 1), z: o.z + (p?.y ?? 1) }, this.rng, def, land, 'crown');
      king.onSquawk = () => this.sfx.squawk();
      lv.critters.push(king);
    }

    lv.targets = targets;
    if (lv === this.cur) this.applyTargets(targets);
  }

  private targetName(id: string): string {
    if (id === this.cur.def.special && this.cur.def.specialName) return this.cur.def.specialName;
    return SPECIAL_NAMES[id] ?? KINDS[id]?.name ?? id;
  }

  private applyTargets(targets: string[]): void {
    this.targets = targets;
    this.hud.setTargets(targets.map((k) => ({
      kind: k, name: this.targetName(k),
      icon: this.icons[k] ?? EMOJI_FALLBACK[k] ?? '❔',
      isImage: Boolean(this.icons[k]),
    })));
  }

  private startRun(): void {
    if (this.phase !== 'INTRO') return;
    this.hud.hideOverlay();
    this.input.consumeDrop();
    this.saveProgress(this.currentLevel);
    if (this.campaign.rewardsPieces) {
      // A new game starts a new monster; a resumed one keeps its pieces and
      // fills any slots it is missing for islands already cleared.
      if (this.currentLevel === 0) this.pieces = {};
      SLOTS.slice(0, this.currentLevel).forEach((slot) => { this.pieces[slot] ??= rollPiece(Math.random); });
      this.savePieces();
    }
    this.setPhase('PHASE_WEIGHT');
  }

  // ---------------------------------------------------------------- monster
  private loadPieces(): MonsterBuild {
    if (!this.campaign.rewardsPieces) return {};
    try {
      const raw = JSON.parse(localStorage.getItem(this.campaign.progressKey + PIECES_SUFFIX) ?? '{}') as Record<string, string>;
      const out: MonsterBuild = {};
      for (const slot of SLOTS) if (raw[slot] && raw[slot] in MONSTERS) out[slot] = raw[slot] as keyof typeof MONSTERS;
      return out;
    } catch { return {}; }
  }

  private savePieces(): void {
    try { localStorage.setItem(this.campaign.progressKey + PIECES_SUFFIX, JSON.stringify(this.pieces)); } catch { /* ignore */ }
  }

  /** Award this island's body piece; returns what the results card shows. */
  private awardPiece(): PieceReward | undefined {
    if (!this.campaign.rewardsPieces) return undefined;
    const slot = SLOTS[Math.min(this.currentLevel, SLOTS.length - 1)];
    const id = rollPiece(this.rng);
    this.pieces[slot] = id;
    this.savePieces();
    this.portrait ??= new MonsterPortrait();
    const img = this.portrait.render(this.pieces, 360);
    return {
      label: pieceLabel(slot, id),
      emoji: MONSTERS[id].emoji,
      image: img?.toDataURL('image/png') ?? null,
      filled: SLOTS.filter((s) => this.pieces[s]).length,
      total: SLOTS.length,
    };
  }

  private showMonsterFinal(total: number, stars: number, best: number): void {
    for (const slot of SLOTS) this.pieces[slot] ??= rollPiece(this.rng);
    this.savePieces();
    this.portrait ??= new MonsterPortrait();
    const big = this.portrait.render(this.pieces, 900, { placeholders: false });
    const parts = SLOTS.map((slot) => `${MONSTERS[this.pieces[slot]!].emoji} ${pieceLabel(slot, this.pieces[slot]!)}`);
    const url = gameUrl();
    const card = (name: string) => composeCard(big, { name, parts, total, stars, url });
    this.hud.showMonsterFinal(this.results, total, stars, best, {
      image: big?.toDataURL('image/png') ?? null,
      defaultName: monsterName(this.pieces),
      parts,
      onShare: async (name) => {
        const outcome = await shareCard(await card(name), name, url);
        return outcome === 'shared' ? 'Shared! 🎃' : outcome === 'downloaded' ? 'Picture saved, link copied! 🎃' : 'Maybe later 👻';
      },
      onDownload: async (name) => downloadCard(await card(name), name),
    }, () => this.reset(), () => this.sfx.star());
  }

  private loadProgress(): number {
    try {
      const v = Number(localStorage.getItem(this.campaign.progressKey) ?? 0);
      return Number.isFinite(v) ? Math.min(this.levelDefs.length - 1, Math.max(0, v)) : 0;
    } catch { return 0; }
  }

  private saveProgress(level: number): void {
    try {
      const prev = this.loadProgress();
      localStorage.setItem(this.campaign.progressKey, String(Math.max(prev, level)));
    } catch { /* ignore */ }
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseT = 0;
    switch (p) {
      case 'INTRO':
      case 'TRAVEL':
      case 'FINAL':
        this.hud.setBanner('');
        break;
      case 'PHASE_WEIGHT':
        this.hud.setBanner('The hatch is shut tight', this.cur.def.hint ?? 'explore the island with the claw');
        break;
      case 'HOLE_OPENING':
        this.hud.setBanner('The hatch opens!', '');
        break;
      case 'PHASE_COLLECT':
        this.hud.setBanner(`Find the ${this.targets.length} treasures`, this.cur.def.collectHint ?? 'drop them into the hole');
        if (this.cur.def.conveyor) this.cur.diorama.conveyorRunning = true;
        this.hud.showTargets(true);
        break;
      case 'RESULTS': {
        this.hud.setBanner('');
        const b = computeScore(this.stats, this.targets.length);
        this.results.push({ level: this.cur.def, breakdown: b, stats: this.stats });
        const isLast = this.currentLevel >= this.levelDefs.length - 1;
        this.sfx.fanfare();
        this.hud.showLevelResults(this.cur.def, b, this.stats, isLast, () => this.continueFromResults(), () => this.sfx.star(), this.awardPiece());
        break;
      }
    }
  }

  private continueFromResults(): void {
    if (this.phase !== 'RESULTS') return;
    if (this.currentLevel >= this.levelDefs.length - 1) this.showFinal();
    else this.startTravel(this.currentLevel + 1);
  }

  private showFinal(): void {
    this.hud.hideOverlay();
    this.setPhase('FINAL');
    const total = this.results.reduce((a, r) => a + r.breakdown.total, 0);
    const minStars = Math.min(...this.results.map((r) => r.breakdown.stars));
    const avg = this.results.reduce((a, r) => a + r.breakdown.stars, 0) / this.results.length;
    const stars = minStars === 3 ? 3 : avg >= 2 ? 2 : 1;
    let best = 0;
    try { best = Number(localStorage.getItem(this.campaign.bestKey) ?? 0); } catch { /* ignore */ }
    try { localStorage.setItem(this.campaign.bestKey, String(Math.max(best, total))); } catch { /* ignore */ }
    this.sfx.fanfare();
    if (this.campaign.rewardsPieces) {
      // The run is over: the next one starts from the first island with a new monster.
      try { localStorage.setItem(this.campaign.progressKey, '0'); } catch { /* ignore */ }
      this.showMonsterFinal(total, stars, best);
      return;
    }
    this.hud.showFinal(this.results, total, stars, best, () => this.reset(), () => this.sfx.star());
  }

  // ---------------------------------------------------------------- travel
  private startTravel(to: number): void {
    this.hud.hideOverlay();
    this.hud.showTargets(false);
    this.travel = { from: this.currentLevel, to, t: 0, humT: 0, clanked: false };
    this.claw.beginTravel();
    // Spawn the next island now so everything has settled by the time we arrive.
    this.spawnLevel(this.levels[to]);
    this.setPhase('TRAVEL');
  }

  private updateTravel(dt: number): void {
    const tr = this.travel;
    tr.t += dt;
    const bridge = this.bridges[tr.from];
    const fromDef = this.levelDefs[tr.from];
    const toDef = this.levelDefs[tr.to];
    if (tr.t < BRIDGE_TIME) {
      bridge.setExtension(easeOutCubic(tr.t / BRIDGE_TIME));
      return;
    }
    if (!tr.clanked) {
      tr.clanked = true;
      bridge.setExtension(1);
      this.sfx.clank();
      this.shake = 0.12;
    }
    const k = easeInOutSine(Math.min(1, (tr.t - BRIDGE_TIME) / RIDE_TIME));
    this.claw.pos.z = lerp(fromDef.origin.z, toDef.origin.z, k);
    this.claw.pos.x = damp(this.claw.pos.x, 0, 4, dt);
    this.claw.yaw = damp(this.claw.yaw, 0, 4, dt);
    this.viewOrigin.z = lerp(fromDef.origin.z, toDef.origin.z, k);
    this.env.focus(this.viewOrigin);
    tr.humT -= dt;
    if (tr.humT <= 0) { this.sfx.hum(); tr.humT = 0.3; }
    if (k >= 1) this.arrive(tr.to);
  }

  private arrive(to: number): void {
    this.currentLevel = to;
    const def = this.cur.def;
    this.claw.setOrigin(def.origin);
    this.claw.pos.set(def.origin.x, LAYOUT.GANTRY.restY, def.origin.z);
    this.claw.endTravel();
    this.applyLevelRules(def);
    this.viewOrigin.set(def.origin.x, 0, def.origin.z);
    this.env.focus(def.origin);
    this.hud.setLevel(def);
    this.beginLevelStats();
    this.applyTargets(this.cur.targets);
    this.saveProgress(to);
    this.sfx.arrive();
    this.shake = 0.1;
    this.setPhase('PHASE_WEIGHT');
  }

  /** A black cucco reached the claw: if it is still low with a cucco in its grip, the cucco gets knocked loose. */
  private onGuardReached(guard: Critter): void {
    const held = this.claw.held;
    if (held && held.kind === 'chicken' && this.claw.lowEnoughToReach) {
      this.claw.knockOff();
      this.hud.toast('The black cucco knocked it loose!', 'bad');
      this.sfx.squawk();
      this.sfx.slip();
    }
    guard.stopCharge();
  }

  /** Guards give up once the claw is out of reach or no cucco is held. */
  private updateGuards(): void {
    const held = this.claw.held;
    const threat = held !== null && held.kind === 'chicken' && this.claw.lowEnoughToReach;
    if (threat) return;
    for (const g of this.cur.critters) if (g.charging) g.stopCharge();
  }

  private onButtonPressed(lv: LevelRuntime): void {
    if (lv !== this.cur || this.phase !== 'PHASE_WEIGHT') return;
    this.sfx.buttonPress();
    this.shake = 0.15;
    this.setPhase('HOLE_OPENING');
    setTimeout(() => {
      lv.hole.open();
      this.sfx.trapdoor();
      this.shake = 0.2;
    }, 350);
  }

  // ------------------------------------------------------------------ loop
  frame(now: number): void {
    const dt = Math.min(0.1, (now - (this.lastNow || now)) / 1000);
    this.lastNow = now;
    this.time += dt;

    if (this.phase === 'INTRO' && this.input.consumeAny()) this.startRun();
    if (this.phase === 'RESULTS' && this.input.consumeDrop()) this.continueFromResults();
    if (this.phase === 'FINAL' && this.input.consumeDrop()) this.reset();

    const playing = this.phase === 'PHASE_WEIGHT' || this.phase === 'HOLE_OPENING' || this.phase === 'PHASE_COLLECT';
    if (playing && !this.timerRunning && this.input.moving) this.timerRunning = true;
    if (playing && this.timerRunning) {
      this.stats.seconds += dt;
      this.hud.setTimer(this.stats.seconds);
    }
    this.phaseT += dt;
    if (this.phase === 'HOLE_OPENING' && this.phaseT >= 1.2) this.setPhase('PHASE_COLLECT');
    if (this.phase === 'INTRO' || this.phase === 'TRAVEL') this.input.consumeDrop();
    if (this.phase === 'TRAVEL') this.updateTravel(dt);
    const wind = this.cur.def.wind && this.phase !== 'TRAVEL' ? windValue(this.time) * this.cur.def.wind : 0;
    this.claw.wind = wind;
    if (this.phase === 'PHASE_COLLECT') this.updateFeed(dt);

    this.phys.update(dt, (h) => this.preStep(h, playing), () => this.postStep());

    this.claw.updateVisuals(dt);
    tickWater(this.time);
    // Only the islands near the crane are drawn and animated.
    const near = this.phase === 'TRAVEL' ? [this.travel.from, this.travel.to] : [this.currentLevel];
    this.levels.forEach((lv, i) => {
      const visible = near.some((n) => i >= n - 1 && i <= n + 2);
      lv.diorama.root.visible = lv.button.group.visible = lv.hole.group.visible = visible;
      if (!visible) return;
      for (const ch of lv.critters) ch.animate(dt, this.time);
      lv.button.update();
      lv.hole.update(dt);
      lv.diorama.update(dt, this.time, lv === this.cur ? wind : 0);
    });
    const moodTheme = this.phase === 'TRAVEL' ? this.levelDefs[this.travel.to].theme : this.cur.def.theme;
    this.env.mood(moodTheme.sky, moodTheme.light, dt);
    this.env.update(dt, this.time);
    this.updateParticles(dt);
    this.updateCamera(dt);
    this.postfx.track(this.claw.headWorldPos, dt);
    if (this.debugOn) this.refreshDebug();
    this.postfx.render();
  }

  /** Factory: drop the next queued item onto the start of the belt. */
  private updateFeed(dt: number): void {
    const lv = this.cur;
    const C = lv.def.conveyor;
    if (!C || lv.feed.length === 0) return;
    lv.feedT -= dt;
    if (lv.feedT > 0) return;
    lv.feedT = C.interval;
    const kind = lv.feed.shift()!;
    const o = lv.def.origin;
    lv.collectibles.push(new Collectible(kind, { x: o.x + C.x0 + 0.35, y: 0.8, z: o.z + C.z }, this.rng() * Math.PI * 2, this.phys, this.scene, lv.targets.includes(kind)));
  }

  /** Factory: anything resting on the running belt is carried toward the hatch. */
  private pushConveyor(): void {
    const lv = this.cur;
    const C = lv.def.conveyor;
    if (!C || !lv.diorama.conveyorRunning) return;
    const o = lv.def.origin;
    for (const c of lv.collectibles) {
      if (c.removed || c.held) continue;
      const p = c.body.translation();
      const lx = p.x - o.x;
      const lz = p.z - o.z;
      if (lx < C.x0 - 0.1 || lx > C.x1 + 0.05 || Math.abs(lz - C.z) > C.width / 2 || p.y > 0.9 || p.y < 0.2) continue;
      const v = c.body.linvel();
      c.body.setLinvel({ x: C.speed, y: v.y, z: (C.z - lz) * 1.5 }, true);
    }
  }

  private preStep(dt: number, playing: boolean): void {
    this.claw.step(dt, this.input, playing);
    this.updateGuards();
    this.pushConveyor();
    const descending = this.claw.state === 'DESCENDING' || this.claw.state === 'CLOSING';
    for (const lv of this.levels) {
      lv.button.step(dt);
      if (lv.critters.length === 0) continue;
      const obstacles: Obstacle[] = [];
      for (const c of lv.collectibles) {
        if (c.removed || c.held) continue;
        const p = c.body.translation();
        if (p.y < 0.6) obstacles.push({ x: p.x, z: p.z, r: 0.45 });
      }
      const n = obstacles.length;
      for (const ch of lv.critters) {
        obstacles.length = n;
        for (const o of lv.critters) if (o !== ch && !o.removed && !o.held) obstacles.push({ x: o.position.x, z: o.position.z, r: 0.4 });
        ch.step(dt, obstacles, this.claw.pos, descending && lv === this.cur, lv.hole.isOpen);
      }
    }
  }

  private postStep(): void {
    const lv = this.cur;
    lv.button.poll(this.phys.DT);
    if (lv.hole.isOpen) {
      for (const b of lv.hole.poll()) {
        const c = collectibleOf(b);
        if (c && !c.removed) this.onEnteredHole(c);
      }
    }
    for (const c of lv.collectibles) {
      if (c.removed || c.held) continue;
      if (c.body.translation().y < LAYOUT.KILL_Y) this.onFellOff(c);
    }
    for (const c of lv.critters) {
      if (!c.removed && c.fellInHole) this.onCritterInHole(c);
    }
  }

  private onCritterInHole(c: Critter): void {
    const p = c.position.clone();
    if (c.isTarget && !c.delivered && this.targets.includes(c.kind) && this.phase === 'PHASE_COLLECT') {
      c.delivered = true;
      this.deliverTarget(c.kind, c.name, p);
    } else {
      this.stats.decoysDropped++;
      this.hud.toast(`Poor ${c.name}! -100`, 'bad');
      this.sfx.wrong();
      this.spawnParticles(p, PAL.rock, 6);
    }
    this.claw.forgetHeld(c);
    c.dispose();
  }

  private deliverTarget(kind: string, name: string, at: THREE.Vector3): void {
    this.stats.targetsDelivered++;
    this.hud.markDelivered(kind);
    this.hud.toast(`${name}! ✓`, 'good');
    this.sfx.deliver();
    this.spawnParticles(at, PAL.flowerYellow, 14);
    if (this.stats.targetsDelivered >= this.targets.length) {
      this.timerRunning = false;
      setTimeout(() => { if (this.phase === 'PHASE_COLLECT') this.setPhase('RESULTS'); }, 900);
    }
  }

  private onEnteredHole(c: Collectible): void {
    const p = c.position.clone();
    if (c.isTarget && !c.delivered && this.phase === 'PHASE_COLLECT') {
      c.delivered = true;
      this.deliverTarget(c.kind, c.def.name, p);
    } else {
      this.stats.decoysDropped++;
      this.hud.toast('Wrong one! -100', 'bad');
      this.sfx.wrong();
      this.spawnParticles(p, PAL.rock, 6);
    }
    this.claw.forgetHeld(c);
    c.dispose();
  }

  private onFellOff(c: Collectible): void {
    const def = this.cur.def;
    if ((c.isTarget && !c.delivered) || c.kind === 'weight' || c.kind === 'magnet') {
      const { SPAWN, HOLE } = LAYOUT;
      const [p] = pickSpawnPoints(1, this.rng, SPAWN, [
        { x: def.button.x, z: def.button.z, r: 1.0 }, { x: HOLE.x, z: HOLE.z, r: 1.0 },
      ]);
      c.teleport({ x: def.origin.x + (p?.x ?? 0), y: 3, z: def.origin.z + (p?.y ?? 0) });
      this.hud.toast(`${c.def.name} came back!`);
      this.sfx.returned();
    } else {
      this.claw.forgetHeld(c);
      c.dispose();
    }
  }

  // --------------------------------------------------------------- helpers
  private spawnParticles(at: THREE.Vector3, color: number, count: number): void {
    const mat = plastic(color, { emissive: color, emissiveIntensity: 0.6 });
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.particleGeo, mat);
      m.position.set(at.x, Math.max(at.y, 0.1), at.z);
      const s = 0.6 + Math.random() * 0.8;
      m.scale.setScalar(s);
      this.scene.add(m);
      this.particles.push({
        mesh: m,
        vel: new THREE.Vector3((Math.random() - 0.5) * 3, 2.5 + Math.random() * 2.5, (Math.random() - 0.5) * 3),
        life: 0.9,
      });
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vel.y -= 9.81 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.scale.multiplyScalar(1 - dt * 1.2);
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }
  }

  private applyCameraLayout(): void {
    const portrait = window.innerWidth < window.innerHeight;
    this.camera.fov = portrait ? 58 : 40;
    this.camBase.set(0, portrait ? 12.5 : 10.2, portrait ? 9.0 : 7.6);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  private updateCamera(dt: number): void {
    const followX = this.phase === 'TRAVEL' ? 0 : (this.claw.pos.x - this.viewOrigin.x) * 0.25;
    this.camX = damp(this.camX, followX, 4, dt);
    this.camera.position.set(
      this.camBase.x + this.viewOrigin.x + this.camX,
      this.camBase.y + this.viewOrigin.y,
      this.camBase.z + this.viewOrigin.z,
    );
    if (this.shake > 0) {
      this.shake -= dt;
      const k = this.shake * 0.5;
      this.camera.position.x += (Math.random() - 0.5) * k;
      this.camera.position.y += (Math.random() - 0.5) * k;
    }
    this.camera.lookAt(
      this.camLook.x + this.viewOrigin.x + this.camX * 0.6,
      this.camLook.y + this.viewOrigin.y,
      this.camLook.z + this.viewOrigin.z,
    );
  }

  resize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.applyCameraLayout();
    this.postfx.resize();
  }

  private toggleDebug(): void {
    this.debugOn = !this.debugOn;
    if (!this.debugOn && this.debugLines) {
      this.scene.remove(this.debugLines);
      this.debugLines.geometry.dispose();
      this.debugLines = null;
    }
  }

  private refreshDebug(): void {
    if (this.debugLines) {
      this.scene.remove(this.debugLines);
      this.debugLines.geometry.dispose();
    }
    this.debugLines = this.phys.debugLines();
    this.scene.add(this.debugLines);
  }
}
