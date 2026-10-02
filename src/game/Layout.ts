/** Island-local layout in meters. Y up, +Z toward the camera/player. Platform top surface is y = 0. */
export const LAYOUT = {
  FLOOR_Y: 0,
  SLAB: { hx: 4.8, hz: 3.8, corner: 0.6, depth: 0.35 },
  HOLE: { x: 0, z: -0.5, half: 0.6 },
  BUTTON: { radius: 0.62 },
  WEIGHT: { y: 0.45 },
  FENCE: { hx: 3.8, hz: 2.9, wallHeight: 1.6 },
  GANTRY: {
    minX: -3.2, maxX: 3.2, minZ: -2.4, maxZ: 2.4,
    railY: 4.2, restY: 3.3, postX: 3.9, postZ: 3.0,
  },
  SPAWN: { hx: 3.0, hz: 2.2 },
  WATER: { x: -4.1, z: 3.05, rx: 0.42, rz: 0.34 },
  KILL_Y: -4,
} as const;
