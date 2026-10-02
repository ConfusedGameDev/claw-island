import { PAL } from '../scene/Materials';

/** How deep a lagoon basin is carved below the sand. */
export const LAGOON_DEPTH = 0.32;
/** Water surface height inside a lagoon. */
export const LAGOON_WATER_Y = -0.12;

/**
 * Basin profile: height at a normalised radius (1 = rim). Flat floor, a
 * smooth wall, then a raised stone border between 1.0 and 1.3.
 */
export function lagoonProfile(rn: number, depth = LAGOON_DEPTH): number {
  const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  if (rn <= 1.0) return -depth * (1 - smooth(0.78, 1.0, rn));
  if (rn <= 1.3) return 0.12 * (smooth(1.0, 1.06, rn) - smooth(1.22, 1.3, rn));
  return 0;
}

/** Island centers are this far apart along -Z. */
export const LEVEL_SPACING = 11;

export interface ThemeDef {
  name: string;
  slab: number;
  tuft: number;
  tuftDark: number;
  dirt: number;
  dirtDark: number;
  wood: number;
  woodLight: number;
  leaf: number;
  leafLight: number;
  flowers: number[];
  /** 0..1 share of grass grid cells inside the fence that get a tuft. */
  tuftDensity: number;
  pond: 'water' | 'lava' | 'goo' | 'ice' | 'none';
  pondColor: number;
  pondEmissive?: number;
  tree: 'blob' | 'palm' | 'pine' | 'spire' | 'lollipop' | 'smokestack' | 'cactus' | 'deadtree' | 'pylon' | 'cloudpuff'
    | 'jackolantern' | 'tombstone' | 'mushroom' | 'obelisk';
  floorFriction: number;
  /** Bounciness of the floor (combined with objects using the max). */
  floorRestitution?: number;
  /** Background color while on this island. */
  sky: number;
  /** Multiplier on the lights while on this island. */
  light: number;
  /** A building on the big floating islet beside the island. */
  landmark?: 'house' | 'factory' | 'pyramid' | 'tower' | 'castle' | 'gingerbread'
    | 'scarecrow' | 'chapel' | 'crypt' | 'cauldron' | 'vampcastle' | 'witchhut';
  /** Gantry frame style (default plastic). */
  gantry?: 'plastic' | 'bone';
  /** Fence style around the play area (default wooden picket). */
  fence?: 'picket' | 'iron' | 'bone';
  /** Small props scattered on the slab rim and floating islets. */
  decor?: 'tombstones' | 'candles' | 'pumpkins' | 'mushrooms' | 'bones';
}

export interface ConveyorDef {
  /** Island-local start and end (end hangs over the hatch) along X, at depth z. */
  x0: number;
  x1: number;
  z: number;
  width: number;
  speed: number;
  /** Junk items fed between the targets once the hatch is open. */
  feedJunk: number;
  /** Seconds between items. */
  interval: number;
}

export interface LevelDef {
  index: number;
  name: string;
  theme: ThemeDef;
  /** World offset of the island center. */
  origin: { x: number; z: number };
  /** Number of target cards, including any special target. */
  targets: number;
  /** Non-target objects scattered on the floor. */
  decoys: number;
  /** Kinds this island's pickups are drawn from (defaults to the classic eight). */
  pool?: string[];
  /** Which small creature roams the island, and how many. */
  critter: 'chicken' | 'crab' | 'ghost' | 'none';
  critters: number;
  /** Black cuccos that charge the claw when a white one is lifted. */
  guards?: number;
  /** A lagoon inside the fence (island-local). Home of the diamond crab. */
  lagoon?: { x: number; z: number; rx: number; rz: number; kind?: 'water' | 'goo' };
  /** A guaranteed special target creature. */
  special?: 'diamondcrab' | 'crownghost';
  /** Display name override for the special target. */
  specialName?: string;
  /** Costume for the island's critters (spooky campaign). */
  critterSkin?: 'pumpkin' | 'skeleton';
  /** Multiplies every object's grip tolerance (lower = stricter). */
  gripScale: number;
  /** Island-local positions. */
  button: { x: number; z: number };
  weight: { x: number; z: number };
  /** Banner subtitle while the hatch is shut (flavor / hint). */
  hint?: string;
  /** Banner subtitle once the hatch is open. */
  collectHint?: string;
  /** Factory: a belt carries items into the hatch. */
  conveyor?: ConveyorDef;
  /** Desert: gust strength pushing the crane (m/s). */
  wind?: number;
  /** Future: everything is too heavy for the claw; a magnet tool lies here. */
  heavy?: boolean;
  magnet?: { x: number; z: number };
  /** Cloud: gravity multiplier for loose objects. */
  gravityScale?: number;
}

export const THEMES = {
  meadow: {
    name: 'Meadow',
    slab: PAL.grass, tuft: PAL.grassTuft, tuftDark: PAL.grassDark,
    dirt: PAL.dirt, dirtDark: PAL.dirtDark,
    wood: PAL.wood, woodLight: PAL.woodLight, leaf: PAL.leaf, leafLight: PAL.leafLight,
    flowers: [PAL.flowerPink, PAL.flowerYellow], tuftDensity: 0.5,
    pond: 'water', pondColor: PAL.water, tree: 'blob', floorFriction: 0.9, sky: PAL.navy, light: 1,
  },
  beach: {
    name: 'Beach',
    slab: 0xf2d7a0, tuft: 0xd9e39a, tuftDark: 0xb9c47a,
    dirt: 0xd8b375, dirtDark: 0xa98453,
    wood: 0xa37848, woodLight: 0xe3b77a, leaf: 0x5ad07a, leafLight: 0x9ae88f,
    flowers: [0xff7f9e, 0xffffff], tuftDensity: 0.25,
    pond: 'none', pondColor: 0x3fb8ff, tree: 'palm', floorFriction: 0.9, sky: 0x1b2a4a, light: 1.05,
  },
  candy: {
    name: 'Candy Land',
    slab: 0xffc4e1, tuft: 0xff8fc7, tuftDark: 0xd96aa6,
    dirt: 0xa0633c, dirtDark: 0x6e3f22,
    wood: 0xffffff, woodLight: 0xff5a7a, leaf: 0x9ff0c8, leafLight: 0xfff0f6,
    flowers: [0xffffff, 0x7fe3ff, 0xffe066], tuftDensity: 0.2,
    pond: 'water', pondColor: 0xc58bff, tree: 'lollipop', floorFriction: 0.7, floorRestitution: 0.95,
    sky: 0x3a1f4a, light: 1.05, landmark: 'gingerbread',
  },
  snow: {
    name: 'Snowfield',
    slab: 0xf4f7ff, tuft: 0xdfe8ff, tuftDark: 0xb9c7e6,
    dirt: 0x6b7490, dirtDark: 0x4a5270,
    wood: 0x6f4f36, woodLight: 0xb48a60, leaf: 0x2f8f6a, leafLight: 0x8fd9c0,
    flowers: [0xbfe4ff], tuftDensity: 0.18,
    pond: 'ice', pondColor: 0xcfeaff, tree: 'pine', floorFriction: 0.12, sky: 0x1c2a44, light: 1,
  },
  factory: {
    name: 'Factory',
    slab: 0x8f969e, tuft: 0x6b7178, tuftDark: 0x4a4f55,
    dirt: 0x55595f, dirtDark: 0x3a3d42,
    wood: 0x2b2d33, woodLight: 0xffc928, leaf: 0x5a5f66, leafLight: 0x9aa3ad,
    flowers: [0xffc928, 0xff8c1a], tuftDensity: 0.08,
    pond: 'none', pondColor: 0x2b2d42, tree: 'smokestack', floorFriction: 0.8, sky: 0x22252c, light: 0.92, landmark: 'factory',
  },
  desert: {
    name: 'Desert Ruins',
    slab: 0xe8c27a, tuft: 0xc9a65a, tuftDark: 0x9c8040,
    dirt: 0xc28a4e, dirtDark: 0x8f5f32,
    wood: 0x9c6b3c, woodLight: 0xe0b26a, leaf: 0x4fae5a, leafLight: 0x86d18a,
    flowers: [0xff5577, 0xffd23f], tuftDensity: 0.12,
    pond: 'water', pondColor: 0x3fd0c9, tree: 'cactus', floorFriction: 0.85, sky: 0x3a2a24, light: 1.05, landmark: 'pyramid',
  },
  haunted: {
    name: 'Haunted House',
    slab: 0x4e5a3f, tuft: 0x3b4630, tuftDark: 0x2a3122,
    dirt: 0x3a2f2a, dirtDark: 0x241d1a,
    wood: 0x3a2c3f, woodLight: 0x5d4766, leaf: 0x2a2230, leafLight: 0x4a3a55,
    flowers: [0xb36bff, 0x6fe36b], tuftDensity: 0.35,
    pond: 'goo', pondColor: 0x6fe36b, pondEmissive: 0x3fbf3a, tree: 'deadtree', floorFriction: 0.85,
    sky: 0x120c1e, light: 0.55, landmark: 'house',
  },
  volcano: {
    name: 'Volcano',
    slab: 0x4a4652, tuft: 0x6a6572, tuftDark: 0x3b3742,
    dirt: 0x332f3a, dirtDark: 0x221f28,
    wood: 0x2b2630, woodLight: 0x5a4d4d, leaf: 0x7c3a2e, leafLight: 0xb0523a,
    flowers: [0xff8c1a, 0xffd23f], tuftDensity: 0.3,
    pond: 'lava', pondColor: 0xff6a00, pondEmissive: 0xff4a00, tree: 'spire', floorFriction: 0.6, sky: 0x24141a, light: 0.85,
  },
  future: {
    name: 'Future Lab',
    slab: 0xd8e0ea, tuft: 0x9fb3c8, tuftDark: 0x6f86a0,
    dirt: 0x4a5a70, dirtDark: 0x2f3a4a,
    wood: 0x3a4a60, woodLight: 0x5fe1ff, leaf: 0x5fe1ff, leafLight: 0xb36bff,
    flowers: [0x5fe1ff, 0xb36bff], tuftDensity: 0.06,
    pond: 'goo', pondColor: 0x5fe1ff, pondEmissive: 0x2bb3ff, tree: 'pylon', floorFriction: 0.7, sky: 0x0a1630, light: 0.95, landmark: 'tower',
  },
  cloud: {
    name: 'Cloud Kingdom',
    slab: 0xf6f8ff, tuft: 0xe6ecff, tuftDark: 0xc6d2f0,
    dirt: 0xb9c7e6, dirtDark: 0x8fa3d0,
    wood: 0xe0b84a, woodLight: 0xfff1c9, leaf: 0xffffff, leafLight: 0xffe3f1,
    flowers: [0xffd23f, 0xff9fcf, 0x9fe0ff], tuftDensity: 0.3,
    pond: 'water', pondColor: 0x9fe0ff, tree: 'cloudpuff', floorFriction: 0.8, sky: 0x2a3f6e, light: 1.1, landmark: 'castle',
  },
} satisfies Record<string, ThemeDef>;

export const levelOrigin = (index: number): { x: number; z: number } => ({ x: 0, z: -index * LEVEL_SPACING });

const CANDY = ['lollipop', 'donut', 'cupcake', 'wrappedcandy', 'icecream', 'star'];
const FACTORY = ['crate', 'gear', 'bolt', 'battery', 'robot', 'bomb'];
const DESERT = ['vase', 'scarab', 'coin', 'rock', 'shell', 'rupee'];
const HAUNTED = ['pumpkin', 'skull', 'bat', 'slime', 'candle', 'bomb'];
const FUTURE = ['gear', 'bolt', 'battery', 'robot', 'crate', 'coin'];
const CLOUD = ['star', 'heart', 'rupee', 'feather', 'coin', 'shell'];

export type LevelSpec = Omit<LevelDef, 'index' | 'origin'>;
const SPECS: LevelSpec[] = [
  { name: 'Meadow', theme: THEMES.meadow, targets: 3, decoys: 11, critter: 'chicken', critters: 3, guards: 1, gripScale: 1.0, button: { x: 2.4, z: 1.6 }, weight: { x: 0, z: 1.7 } },
  { name: 'Beach', theme: THEMES.beach, targets: 3, decoys: 13, critter: 'crab', critters: 4, gripScale: 1.0, button: { x: -2.6, z: -1.9 }, weight: { x: 2.2, z: 1.9 }, lagoon: { x: -1.6, z: 1.3, rx: 1.15, rz: 0.85 }, special: 'diamondcrab' },
  { name: 'Candy Land', theme: THEMES.candy, pool: CANDY, targets: 3, decoys: 12, critter: 'none', critters: 0, gripScale: 1.0, button: { x: 2.5, z: -1.8 }, weight: { x: -2.2, z: 1.8 }, hint: 'Everything here is bouncy!' },
  { name: 'Snowfield', theme: THEMES.snow, targets: 4, decoys: 14, critter: 'chicken', critters: 4, guards: 1, gripScale: 1.0, button: { x: 2.6, z: -1.8 }, weight: { x: 0, z: 1.9 }, hint: 'The ice is slippery.' },
  {
    name: 'Factory', theme: THEMES.factory, pool: FACTORY, targets: 3, decoys: 4, critter: 'none', critters: 0, gripScale: 1.0,
    button: { x: 2.6, z: -1.9 }, weight: { x: -2.4, z: 1.9 },
    conveyor: { x0: -3.5, x1: -0.62, z: -0.5, width: 0.9, speed: 0.45, feedJunk: 9, interval: 2.4 },
    hint: 'The conveyor feeds the hatch.', collectHint: 'pull the junk off the belt before it falls in',
  },
  { name: 'Desert Ruins', theme: THEMES.desert, pool: DESERT, targets: 3, decoys: 13, critter: 'none', critters: 0, gripScale: 1.0, button: { x: -2.6, z: -1.8 }, weight: { x: 2.4, z: 1.9 }, wind: 0.9, hint: 'Sandstorm! Gusts push the crane.' },
  { name: 'Haunted House', theme: THEMES.haunted, pool: HAUNTED, targets: 3, decoys: 12, critter: 'ghost', critters: 4, special: 'crownghost', gripScale: 1.0, button: { x: 2.6, z: 1.8 }, weight: { x: -2.4, z: -1.9 }, hint: 'Something is floating around...' },
  { name: 'Volcano', theme: THEMES.volcano, targets: 4, decoys: 16, critter: 'chicken', critters: 5, guards: 2, gripScale: 0.85, button: { x: -2.6, z: 1.8 }, weight: { x: 2.4, z: -1.9 }, hint: 'It is hot here: grab dead centre.' },
  {
    name: 'Future Lab', theme: THEMES.future, pool: FUTURE, targets: 4, decoys: 10, critter: 'none', critters: 0, gripScale: 1.0,
    button: { x: -2.6, z: 1.8 }, weight: { x: 2.4, z: 1.9 }, heavy: true, magnet: { x: 2.5, z: -1.9 }, hint: 'Everything here is solid steel...',
  },
  { name: 'Cloud Kingdom', theme: THEMES.cloud, pool: CLOUD, targets: 4, decoys: 16, critter: 'chicken', critters: 3, guards: 1, gripScale: 1.0, button: { x: 2.6, z: -1.8 }, weight: { x: -2.4, z: 1.9 }, gravityScale: 0.35, hint: 'Low gravity: things float down slowly.' },
];

/** The original ten islands (the classic campaign). */
export const CLASSIC_LEVELS: LevelDef[] = SPECS.map((spec, index) => ({ ...spec, index, origin: levelOrigin(index) }));
export const LEVELS = CLASSIC_LEVELS;
