import { THEMES, levelOrigin, type LevelDef, type LevelSpec, type ThemeDef } from './Levels';

/**
 * The "Spooky Night" campaign: ten kawaii-horror islands. Each one reuses a
 * classic island's twist (bouncy floor, ice, conveyor, wind, ghosts, strict
 * grip, magnet, low gravity) so the mechanics carry over unchanged.
 */
export const SPOOKY_THEMES = {
  pumpkin: {
    name: 'Pumpkin Patch',
    slab: 0x8a6bbf, tuft: 0xa58bd9, tuftDark: 0x6a4f9a,
    dirt: 0x5a3f6e, dirtDark: 0x3d2a4d,
    wood: 0x4a3550, woodLight: 0xff9a3c, leaf: 0x5fbf6a, leafLight: 0x9fe08a,
    flowers: [0xff9a3c, 0xffd23f], tuftDensity: 0.45,
    pond: 'goo', pondColor: 0x8ff0c0, pondEmissive: 0x3fbf8a, tree: 'jackolantern', floorFriction: 0.9,
    sky: 0x2a1840, light: 0.9, landmark: 'scarecrow', gantry: 'bone', fence: 'picket', decor: 'pumpkins',
  },
  graveyard: {
    name: 'Graveyard',
    slab: 0x6f8f88, tuft: 0x8fb3a6, tuftDark: 0x557068,
    dirt: 0x4a3f55, dirtDark: 0x30283a,
    wood: 0x3a2c3f, woodLight: 0x6b5a7a, leaf: 0x2a2230, leafLight: 0x4a3a55,
    flowers: [0xb48cff, 0x8ff0c0], tuftDensity: 0.3,
    pond: 'none', pondColor: 0x8ff0c0, pondEmissive: 0x3fbf8a, tree: 'tombstone', floorFriction: 0.9,
    sky: 0x1a1430, light: 0.8, landmark: 'chapel', gantry: 'bone', fence: 'iron', decor: 'tombstones',
  },
  trick: {
    name: 'Trick-or-Treat',
    slab: 0xffb07a, tuft: 0xb48cff, tuftDark: 0x8a6bbf,
    dirt: 0x6b3f2a, dirtDark: 0x4a2a1c,
    wood: 0x2a2230, woodLight: 0xff8a3c, leaf: 0xb48cff, leafLight: 0xfff0f6,
    flowers: [0xffffff, 0xb48cff, 0xff8a3c], tuftDensity: 0.2,
    pond: 'water', pondColor: 0xb48cff, tree: 'lollipop', floorFriction: 0.7, floorRestitution: 0.95,
    sky: 0x2e1a3e, light: 1.0, landmark: 'gingerbread', gantry: 'bone', fence: 'picket', decor: 'candles',
  },
  crypt: {
    name: 'Frozen Crypt',
    slab: 0xdfe6ff, tuft: 0xc9d2f5, tuftDark: 0xa5b0de,
    dirt: 0x5a5a80, dirtDark: 0x3c3c5e,
    wood: 0x4a4060, woodLight: 0x9fb4ff, leaf: 0x3d5a7a, leafLight: 0x9fe0ff,
    flowers: [0x9fe0ff], tuftDensity: 0.18,
    pond: 'ice', pondColor: 0xcfeaff, tree: 'pine', floorFriction: 0.12,
    sky: 0x161c38, light: 0.95, landmark: 'crypt', gantry: 'bone', fence: 'iron', decor: 'bones',
  },
  brewery: {
    name: "Witch's Brewery",
    slab: 0x6b5a8a, tuft: 0x8a75ad, tuftDark: 0x4f4170,
    dirt: 0x3d3352, dirtDark: 0x2a2238,
    wood: 0x2b2330, woodLight: 0x8ff0c0, leaf: 0xb48cff, leafLight: 0xd9b8ff,
    flowers: [0x8ff0c0, 0xb48cff], tuftDensity: 0.1,
    pond: 'none', pondColor: 0x8ff0c0, tree: 'mushroom', floorFriction: 0.8,
    sky: 0x1e1430, light: 0.88, landmark: 'cauldron', gantry: 'bone', fence: 'iron', decor: 'mushrooms',
  },
  tomb: {
    name: 'Mummy Tomb',
    slab: 0xd9b07a, tuft: 0xbf9660, tuftDark: 0x9a7646,
    dirt: 0xa8743f, dirtDark: 0x7a5230,
    wood: 0x7a5230, woodLight: 0xe0b26a, leaf: 0x6fbf8a, leafLight: 0xa8e6b8,
    flowers: [0xb48cff, 0xffd23f], tuftDensity: 0.12,
    pond: 'goo', pondColor: 0x8ff0c0, pondEmissive: 0x3fbf8a, tree: 'obelisk', floorFriction: 0.85,
    sky: 0x2e1d33, light: 0.95, landmark: 'pyramid', gantry: 'bone', fence: 'bone', decor: 'bones',
  },
  mansion: {
    ...THEMES.haunted,
    name: 'Haunted Mansion',
    slab: 0x5a6a4a, sky: 0x150e24, light: 0.7,
    gantry: 'bone', fence: 'iron', decor: 'candles',
  },
  vampire: {
    name: 'Vampire Castle',
    slab: 0x4a3a52, tuft: 0x6a4f6e, tuftDark: 0x3a2a40,
    dirt: 0x2e2433, dirtDark: 0x1e1824,
    wood: 0x2b2630, woodLight: 0xd9304f, leaf: 0x7a2e45, leafLight: 0xd9304f,
    flowers: [0xd9304f, 0xff7f9e], tuftDensity: 0.3,
    pond: 'lava', pondColor: 0xd9304f, pondEmissive: 0xb3123a, tree: 'spire', floorFriction: 0.6,
    sky: 0x2a0f1e, light: 0.85, landmark: 'vampcastle', gantry: 'bone', fence: 'iron', decor: 'candles',
  },
  lab: {
    name: 'Mad Scientist Lab',
    slab: 0xbfc8d9, tuft: 0x9fb3c8, tuftDark: 0x6f86a0,
    dirt: 0x4a4a70, dirtDark: 0x2f2f4a,
    wood: 0x3a3a5a, woodLight: 0x8ff0c0, leaf: 0x8ff0c0, leafLight: 0xb48cff,
    flowers: [0x8ff0c0, 0xb48cff], tuftDensity: 0.06,
    pond: 'goo', pondColor: 0x8ff0c0, pondEmissive: 0x3fbf8a, tree: 'pylon', floorFriction: 0.7,
    sky: 0x120e2a, light: 0.95, landmark: 'tower', gantry: 'bone', fence: 'bone', decor: 'bones',
  },
  sky: {
    name: "Witch's Sky",
    slab: 0xe6dcff, tuft: 0xd4c4ff, tuftDark: 0xb5a0e6,
    dirt: 0x9f8fd0, dirtDark: 0x7a6ab0,
    wood: 0xff9a3c, woodLight: 0xfff1c9, leaf: 0xffffff, leafLight: 0xd9b8ff,
    flowers: [0xff9a3c, 0xb48cff, 0x8ff0c0], tuftDensity: 0.3,
    pond: 'water', pondColor: 0xb48cff, tree: 'cloudpuff', floorFriction: 0.8,
    sky: 0x2e2456, light: 1.0, landmark: 'witchhut', gantry: 'bone', fence: 'picket', decor: 'candles',
  },
} satisfies Record<string, ThemeDef>;

const PATCH = ['pumpkin', 'candycorn', 'candle', 'acorn', 'mushroom', 'bat'];
const GRAVE = ['skull', 'tombstone', 'candle', 'bat', 'eyeball', 'coffin'];
const TRICK = ['candycorn', 'lollipop', 'wrappedcandy', 'cupcake', 'pumpkin', 'donut'];
const CRYPT = ['skull', 'coffin', 'candle', 'eyeball', 'bat', 'rock'];
const BREW = ['potion', 'cauldron', 'eyeball', 'slime', 'candle', 'bomb'];
const TOMB = ['scarab', 'vase', 'coin', 'skull', 'coffin', 'rupee'];
const MANSION = ['pumpkin', 'skull', 'bat', 'slime', 'candle', 'bomb'];
const VAMP = ['bat', 'coffin', 'candle', 'heart', 'skull', 'potion'];
const LAB = ['gear', 'bolt', 'battery', 'eyeball', 'potion', 'robot'];
const SKY = ['star', 'bat', 'feather', 'candycorn', 'potion', 'heart'];

const T = SPOOKY_THEMES;
const SPECS: LevelSpec[] = [
  {
    name: 'Pumpkin Patch', theme: T.pumpkin, pool: PATCH, targets: 3, decoys: 11, critter: 'chicken', critters: 3, guards: 1, critterSkin: 'pumpkin',
    gripScale: 1.0, button: { x: 2.4, z: 1.6 }, weight: { x: 0, z: 1.7 }, hint: 'The pumpkin chicks are guarded...',
  },
  {
    name: 'Graveyard', theme: T.graveyard, pool: GRAVE, targets: 3, decoys: 13, critter: 'crab', critters: 4, critterSkin: 'skeleton',
    gates: [{ kind: 'bells', x: 1.75, z: -2.05 }],
    gripScale: 1.0, button: { x: -2.6, z: -1.9 }, weight: { x: 2.2, z: 1.9 },
    lagoon: { x: -1.6, z: 1.3, rx: 1.15, rz: 0.85, kind: 'goo' }, special: 'diamondcrab', specialName: 'Spirit Crab',
    hint: 'A spirit crab haunts the open grave.',
  },
  {
    name: 'Trick-or-Treat', theme: T.trick, pool: TRICK, targets: 3, decoys: 12, critter: 'none', critters: 0,
    gates: [{ kind: 'scale', x: 2.3, z: -1.8 }],
    gripScale: 1.0, button: { x: 2.5, z: -1.8 }, weight: { x: -2.2, z: 1.8 }, hint: 'Sugar rush: everything bounces!',
  },
  {
    name: 'Frozen Crypt', theme: T.crypt, pool: CRYPT, targets: 4, decoys: 14, critter: 'chicken', critters: 4, guards: 1, critterSkin: 'skeleton',
    gates: [{ kind: 'key', x: 2.6, z: -1.8, key: { x: -2.4, z: 1.7 } }],
    gripScale: 1.0, button: { x: 2.6, z: -1.8 }, weight: { x: 0, z: 1.9 }, hint: 'The crypt floor is icy.',
  },
  {
    name: "Witch's Brewery", theme: T.brewery, pool: BREW, targets: 3, decoys: 4, critter: 'none', critters: 0, gates: [{ kind: 'cauldron', x: 2.6, z: -1.9 }],
    gripScale: 1.0,
    button: { x: 2.6, z: -1.9 }, weight: { x: -2.4, z: 1.9 },
    conveyor: { x0: -3.5, x1: -0.62, z: -0.5, width: 0.9, speed: 0.45, feedJunk: 9, interval: 2.4 },
    hint: 'The belt feeds the hatch.', collectHint: 'pull the junk off the belt before it falls in',
  },
  {
    name: 'Mummy Tomb', theme: T.tomb, pool: TOMB, targets: 3, decoys: 13, critter: 'none', critters: 0, gates: [{ kind: 'laser', x: 2.5, z: 1.9, emitter: { x: -3.7, z: -2.1, dir: 0 }, mirrors: 1 }],
    gripScale: 1.0,
    button: { x: -2.6, z: -1.8 }, weight: { x: 2.4, z: 1.9 }, wind: 0.9, hint: 'A cursed sandstorm pushes the crane.',
  },
  {
    name: 'Haunted Mansion', theme: T.mansion, pool: MANSION, targets: 3, decoys: 12, critter: 'ghost', critters: 4, special: 'crownghost',
    gates: [{ kind: 'weight', x: 2.6, z: 1.8 }, { kind: 'bells', x: 1.9, z: -2.05 }],
    gripScale: 1.0, button: { x: 2.6, z: 1.8 }, weight: { x: -2.4, z: -1.9 }, hint: 'Boo! Catch the Ghost King.',
  },
  {
    name: 'Vampire Castle', theme: T.vampire, pool: VAMP, targets: 4, decoys: 16, critter: 'chicken', critters: 5, guards: 2, critterSkin: 'skeleton',
    gates: [{ kind: 'key', x: -2.6, z: 1.8, key: { x: 2.4, z: -1.9 } }],
    gripScale: 0.85, button: { x: -2.6, z: 1.8 }, weight: { x: 2.4, z: -1.9 }, hint: 'The Count is watching: grab dead centre.',
  },
  {
    name: 'Mad Scientist Lab', theme: T.lab, pool: LAB, targets: 4, decoys: 10, critter: 'none', critters: 0, gates: [{ kind: 'laser', x: -2.4, z: 1.9, emitter: { x: -3.7, z: -2.1, dir: 0 }, mirrors: 2 }],
    gripScale: 1.0,
    button: { x: -2.6, z: 1.8 }, weight: { x: 2.4, z: 1.9 }, heavy: true, magnet: { x: -2.8, z: 0.3 }, hint: 'Everything here is too heavy... find the magnet!',
  },
  {
    name: "Witch's Sky", theme: T.sky, pool: SKY, targets: 4, decoys: 16, critter: 'chicken', critters: 3, guards: 1, critterSkin: 'pumpkin',
    gates: [{ kind: 'cauldron', x: 2.6, z: -1.8 }, { kind: 'scale', x: -2.2, z: 1.75 }],
    gripScale: 1.0, button: { x: 2.6, z: -1.8 }, weight: { x: -2.4, z: 1.9 }, gravityScale: 0.35, hint: 'Broomstick heights: things float down slowly.',
  },
];

export const SPOOKY_LEVELS: LevelDef[] = SPECS.map((spec, index) => ({ ...spec, index, origin: levelOrigin(index) }));
