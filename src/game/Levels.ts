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
  pond: 'water' | 'lava' | 'ice' | 'none';
  pondColor: number;
  pondEmissive?: number;
  tree: 'blob' | 'palm' | 'pine' | 'spire';
  floorFriction: number;
}

export interface LevelDef {
  index: number;
  name: string;
  theme: ThemeDef;
  /** World offset of the island center. */
  origin: { x: number; z: number };
  /** Number of target cards, including any special target. */
  targets: number;
  decoys: number;
  /** Which small creature roams the island, and how many. */
  critter: 'chicken' | 'crab';
  critters: number;
  /** A lagoon inside the fence (island-local). Home of the diamond crab. */
  lagoon?: { x: number; z: number; rx: number; rz: number };
  /** A guaranteed special target living in the lagoon. */
  special?: 'diamondcrab';
  /** Multiplies every object's grip tolerance (lower = stricter). */
  gripScale: number;
  /** Island-local positions. */
  button: { x: number; z: number };
  weight: { x: number; z: number };
}

export const THEMES: Record<'meadow' | 'beach' | 'snow' | 'volcano', ThemeDef> = {
  meadow: {
    name: 'Meadow',
    slab: PAL.grass, tuft: PAL.grassTuft, tuftDark: PAL.grassDark,
    dirt: PAL.dirt, dirtDark: PAL.dirtDark,
    wood: PAL.wood, woodLight: PAL.woodLight, leaf: PAL.leaf, leafLight: PAL.leafLight,
    flowers: [PAL.flowerPink, PAL.flowerYellow], tuftDensity: 0.5,
    pond: 'water', pondColor: PAL.water, tree: 'blob', floorFriction: 0.9,
  },
  beach: {
    name: 'Beach',
    slab: 0xf2d7a0, tuft: 0xd9e39a, tuftDark: 0xb9c47a,
    dirt: 0xd8b375, dirtDark: 0xa98453,
    wood: 0xa37848, woodLight: 0xe3b77a, leaf: 0x5ad07a, leafLight: 0x9ae88f,
    flowers: [0xff7f9e, 0xffffff], tuftDensity: 0.25,
    pond: 'none', pondColor: 0x3fb8ff, tree: 'palm', floorFriction: 0.9,
  },
  snow: {
    name: 'Snowfield',
    slab: 0xf4f7ff, tuft: 0xdfe8ff, tuftDark: 0xb9c7e6,
    dirt: 0x6b7490, dirtDark: 0x4a5270,
    wood: 0x6f4f36, woodLight: 0xb48a60, leaf: 0x2f8f6a, leafLight: 0x8fd9c0,
    flowers: [0xbfe4ff], tuftDensity: 0.18,
    pond: 'ice', pondColor: 0xcfeaff, tree: 'pine', floorFriction: 0.12,
  },
  volcano: {
    name: 'Volcano',
    slab: 0x4a4652, tuft: 0x6a6572, tuftDark: 0x3b3742,
    dirt: 0x332f3a, dirtDark: 0x221f28,
    wood: 0x2b2630, woodLight: 0x5a4d4d, leaf: 0x7c3a2e, leafLight: 0xb0523a,
    flowers: [0xff8c1a, 0xffd23f], tuftDensity: 0.3,
    pond: 'lava', pondColor: 0xff6a00, pondEmissive: 0xff4a00, tree: 'spire', floorFriction: 0.6,
  },
};

export const levelOrigin = (index: number): { x: number; z: number } => ({ x: 0, z: -index * LEVEL_SPACING });

export const LEVELS: LevelDef[] = [
  { index: 0, name: 'Meadow', theme: THEMES.meadow, origin: levelOrigin(0), targets: 3, decoys: 11, critter: 'chicken', critters: 3, gripScale: 1.0, button: { x: 2.4, z: 1.6 }, weight: { x: 0, z: 1.7 } },
  { index: 1, name: 'Beach', theme: THEMES.beach, origin: levelOrigin(1), targets: 3, decoys: 13, critter: 'crab', critters: 4, gripScale: 1.0, button: { x: -2.6, z: -1.9 }, weight: { x: 2.2, z: 1.9 }, lagoon: { x: -1.6, z: 1.3, rx: 1.15, rz: 0.85 }, special: 'diamondcrab' },
  { index: 2, name: 'Snowfield', theme: THEMES.snow, origin: levelOrigin(2), targets: 4, decoys: 14, critter: 'chicken', critters: 4, gripScale: 1.0, button: { x: 2.6, z: -1.8 }, weight: { x: 0, z: 1.9 } },
  { index: 3, name: 'Volcano', theme: THEMES.volcano, origin: levelOrigin(3), targets: 4, decoys: 16, critter: 'chicken', critters: 5, gripScale: 0.85, button: { x: -2.6, z: 1.8 }, weight: { x: 2.4, z: -1.9 } },
];
