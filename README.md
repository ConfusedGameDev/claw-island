# Claw Island

A browser-based 3D physics claw machine (UFO catcher) with a toy-diorama look
inspired by *The Legend of Zelda: Link's Awakening* (Switch).

## How to play

Four islands float in a line: **Meadow**, **Beach**, **Snowfield** (icy floor,
things slide) and **Volcano** (stricter grip). Clear one and the crane's rails
extend across the gap so the crossbar can ride to the next island. Each island:

1. **Open the hatch.** Grab the heavy weight with the claw and let it go above the
   big red button. The hatch in the middle of the island swings open.
2. **Collect the treasures.** Three target objects are shown on screen. Find them
   among the decoys, grab them, and drop them into the hole.
3. **Score.** Fewer grab attempts and a faster time mean more points. Each
   island shows its own results; after the fourth you get a grand total. The
   highest island reached is remembered so you can continue later.

| Input | Action |
|---|---|
| `W A S D`, or the on-screen D-pad | Move the crane |
| `←` `→` (or `Q` `E`), or the on-screen ↺ ↻ buttons | Rotate the claw head |
| `Space` / `Enter`, or the DROP button | Drop the claw. While holding something: lower and release it |
| `P` | Toggle physics collider wireframes |
| `M` | Mute sound |

Add `?seed=123` to the URL to replay a specific layout. "Same layout" on the
results screen does that for you.

**Grip.** Slips are deterministic. Every object has a grip tolerance; a grab
further off centre than that will wobble, rattle, and then drop. A steady lift
is a safe lift.

**Critters.** Cuccos wander the grass islands and crabs scuttle over the
beach. They freeze when the claw comes down over them, so they can be picked
up, but they wriggle free after about two seconds and run off. The beach also
has a lagoon that is always home to one **diamond crab**: it is one of that
island's treasures, holds on to the claw long enough to be carried, and drops
through the open hatch like any other prize.

## Scoring

```
treasures        1000 per delivered target (3 on the first two islands, 4 after)
time bonus       1500 - 10 per second      (floor 0)
precision bonus  1000 - 100 per attempt beyond 4   (floor 0)
penalty          100 per non-target dropped in the hole
stars            3 at full haul + 1500, 2 at full haul, otherwise 1
```

## Development

```
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/
```

Stack: Vite, TypeScript, [three.js](https://threejs.org) for rendering and
[Rapier](https://rapier.rs) (`@dimforge/rapier3d-compat`) for physics. All
geometry is procedural; there are no model or texture files.

## Project layout

```
src/
  main.ts                 bootstraps Rapier, creates the Game, runs the frame loop
  game/Game.ts            owns renderer, scene, physics, entities; phase state machine
  game/Input.ts           keyboard + touch -> crane axes and drop button
  game/Scoring.ts         score formula
  game/Layout.ts          island-local coordinates (platform, hole, gantry bounds)
  game/Levels.ts          the four level definitions and themes
  scene/Environment.ts    lights and clouds shared by all islands
  scene/RailBridge.ts     rails that extend between islands for the crane to ride
  physics/PhysicsWorld.ts Rapier wrapper: fixed-step loop, body<->mesh interpolation
  scene/SceneBuilder.ts   one themed floating island (visuals + static colliders)
  scene/Materials.ts      palette and toy-plastic / toon materials
  scene/PostFX.ts         tilt-shift post-processing
  entities/Claw.ts        crane visuals, kinematic claw head, grab/lift/lower/release
  entities/Button.ts      the big red button and its pressure sensor
  entities/Hole.ts        trapdoor panels and the delivery sensor
  entities/Collectible.ts procedural object catalog, spawning, HUD icons
  entities/Critter.ts     base for small creatures: roaming regions, freeze, grab, escape, hole fall
  entities/Chicken.ts     cucco visuals and animation
  entities/Crab.ts        crab visuals and animation, plus the diamond variant
  scene/Water.ts          stylised water shader (caustic web, swell, foam rim)
  entities/Grabbable.ts   interface shared by collectibles and chickens
  ui/Hud.ts               DOM overlay: timer, attempts, target cards, intro/results
  audio/Sfx.ts            WebAudio synth cues
```
