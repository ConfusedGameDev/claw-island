# Claw Island

A browser-based 3D physics claw machine (UFO catcher) with a toy-diorama look
inspired by *The Legend of Zelda: Link's Awakening* (Switch).

## Campaigns

The title screen has two campaigns. The last one picked is remembered, and
`?campaign=halloween` or `?campaign=classic` in the URL overrides it.
`DEFAULT_CAMPAIGN` in `src/game/Campaign.ts` sets which one new players see.
Switch it back to `'classic'` after the season.

### Spooky Night (Halloween)

A kawaii-horror take on the same ten-island run:

- The crane is made of bones. The posts are bones topped with little skulls,
  the rails are spines, the carriage is a skull with glowing eyes, and the
  claw has three skeletal fingers.
- Every island keeps a classic island's twist under a horror theme:

| # | Island | Twist (from) |
|---|---|---|
| 1 | Pumpkin Patch | pumpkin-hatted cuccos and a guard (Meadow) |
| 2 | Graveyard | skeleton crabs; a Spirit Crab haunts the open grave (Beach) |
| 3 | Trick-or-Treat | everything bounces (Candy Land) |
| 4 | Frozen Crypt | icy floor, skeleton cuccos (Snowfield) |
| 5 | Witch's Brewery | a belt of potions feeds the hatch (Factory) |
| 6 | Mummy Tomb | cursed sandstorm (Desert) |
| 7 | Haunted Mansion | ghosts and the Ghost King (Haunted House) |
| 8 | Vampire Castle | stricter grip (Volcano) |
| 9 | Mad Scientist Lab | everything is too heavy; find the magnet (Future Lab) |
| 10 | Witch's Sky | low gravity (Cloud Kingdom) |

**Opening the hatch.** Each island guards its hatch in its own way; a few
later ones combine two. Working it out is part of the puzzle: the
instruction and the "Open the hatch" checklist only appear if the hatch is
still shut after 30 seconds of play. The cauldron is the exception: its recipe
floats over the pot and is listed from the start.

| Gate | How it opens | Islands |
|---|---|---|
| Weight | rest the heavy weight on the big button | Pumpkin Patch, Mummy Tomb, Haunted Mansion |
| Bells | four tombstones chime a pattern; touch down on their bells in the same order | Graveyard, Haunted Mansion |
| Scale | put two carved pumpkins (1–3 pips each) on the pan to match the counterweight; the scale then vanishes in a puff of smoke | Trick-or-Treat, Witch's Sky |
| Key | carry the key to the padlock while Frankenstein stomps after the claw and swipes it loose | Frozen Crypt, Vampire Castle |
| Cauldron | drop the recipe's ingredients in; anything else is spat back out | Witch's Brewery, Witch's Sky |
| Laser | turn the claw to aim standing mirrors (the beam previews off a held mirror) and bounce the beam into the crystal | Mad Scientist Lab |

**Always winnable.** Any treasure that ends up in the open hatch counts,
however it got there (dropped, shoved by a bat, tumbling off the trapdoor).
Prizes stranded out of reach hop back in, and if a treasure, a cauldron
ingredient or a special critter goes missing, a new one drops in.

**Booster packs.** After each island you tear open a booster pack with one
random power-up for the next island:
- **Double points:** that island's score counts twice.
- **Double speed:** the crane moves, drops and lifts twice as fast.
- **Instant catch:** your next 3 drops snap onto the nearest thing and grab
  it dead centre.

**Build a Frankenstein.**
- Clearing an island awards the next body piece, in this order: head, body,
  arms, legs, eyes, mouth, hair, extra.
- Each piece comes from a random monster: vampire, werewolf, mummy, zombie,
  ghost, witch, skeleton, pumpkin, cyclops or slime. A run never repeats a
  monster, so every Frankenstein mixes ten different creatures, and each one
  gets its own proportions and colour tints.
- Pieces are saved with your progress, so a resumed run keeps its monster.

**Music.** Spooky Night has its own soundtrack, the "Monster Waltz": a little
3/4 waltz in D minor, synthesized live with WebAudio (no audio files).
- Each island gets its own arrangement: music box, harpsichord, plucked bass,
  theremin, organ, bone xylophone, at different tempos and keys.
- There are short cues when you clear an island and when your monster comes
  alive.
- The music ducks while the game is paused, and it can be switched off from
  the pause menu.

**Look at it.** Tap your monster in the pause menu, on an island's results or
on the final screen to open a 3D viewer: drag to turn it, pinch (or scroll) to
zoom.

**Share it.** After the tenth island you can name your monster and share it
as a picture with a link to the game:
- In the apps, sharing uses the native share sheet (`@capacitor/share`).
- On the web, it uses the Web Share API.
- Otherwise the PNG downloads and the text with the link is copied to the
  clipboard.

**Post on Facebook or X.** The final screen and every island's results card
have Facebook and X buttons that open a pre-filled post (X gets a line about
your monster or island score; Facebook shares the link). They can't attach the
picture; use Share for that.

The link everywhere is `PUBLIC_GAME_URL` in `src/game/Campaign.ts`, currently
the web build at https://claw-island.vercel.app/. Swap it for the store pages
once the apps are approved.

### Classic

The original islands, unchanged. Classic progress and best score keep their
old save keys.

Classic has its own tune, "Island Hop": a bright C-major melody in 4/4, also
synthesized live. Each island gets an arrangement to match its theme (flute on
the Meadow, steel drums on the Beach, chiptune in the Future Lab...).

The pause menu of each campaign has a button that jumps to the other one
(Play Spooky Night / Play Classic islands); each keeps its own progress.

## Title screen and website

The game opens on a title screen (tap to start), then a mode select with one
card per campaign showing its saved progress. Picking the other campaign
reloads straight onto its card. Esc or Back on the card returns to the modes.

The Vercel site also serves a few static pages from `public/`, which Vite
copies into the build untouched:

| Page | What it is |
|---|---|
| `/about/` | landing page: pitch, features, screenshots |
| `/support/` | how to play, FAQ, contact |
| `/privacy/` | privacy policy (the stores ask for this URL) |
| `/press/` | press kit: fact sheet, descriptions, logo and screenshots |

They share `public/site/site.css`, the Fredoka fonts and the screenshots in
`public/site/img/`. The title screen links to Support and Privacy.

## How to play

Ten islands float in a line. Clear one and the crane's rails extend across the
gap so the crossbar can ride to the next island. Each has its own twist:

| # | Island | Twist |
|---|---|---|
| 1 | Meadow | cuccos, and a black cucco that defends them |
| 2 | Beach | crabs; a diamond crab lives in the carved lagoon |
| 3 | Candy Land | everything bounces |
| 4 | Snowfield | icy floor, things slide |
| 5 | Factory | a conveyor feeds the hatch: pull the junk off before it falls in |
| 6 | Desert Ruins | sandstorm gusts push the crane |
| 7 | Haunted House | ghosts drift around; catch the Ghost King |
| 8 | Volcano | stricter grip |
| 9 | Future Lab | everything is steel and too heavy for the claw: find the magnet |
| 10 | Cloud Kingdom | low gravity |

Each island:

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
| `Esc`, or the on-screen pause button | Pause: resume, restart the island, jump to any unlocked island, and (Spooky Night) see the monster so far |
| `P` | Toggle physics collider wireframes |

Leaving the app (switching apps, locking the phone, hiding the tab) pauses the
game and silences the music.
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

## Mobile apps (iOS and Android)

The game ships as native apps through [Capacitor](https://capacitorjs.com):
`android/` and `ios/` are ordinary source folders on `main` and only ever
receive the built web assets. The **Mobile builds** GitHub Actions workflow
(`.github/workflows/mobile.yml`) runs on every push to `main`:

- builds the web app,
- syncs it into both native projects,
- builds a signed Android release `.apk` + `.aab` (keystore in repo secrets),
- archives and exports a signed iOS `.ipa` and uploads it to TestFlight
  (certificate, profile and App Store Connect key in repo secrets),
- publishes a GitHub Release with all files when a `v*` tag is pushed.

Artifacts of every run are downloadable from the Actions tab
(`gh run download <run-id>`). Without the signing secrets the workflow still
succeeds with a debug `.apk` and an unsigned `.ipa`.

Locally: `npm run build && npx cap sync`, then `npx cap open ios` / `android`.
Replace `resources/logo.png` and rerun
`npx capacitor-assets generate --ios --android --iconBackgroundColor '#1b2140' --iconBackgroundColorDark '#1b2140' --splashBackgroundColor '#1b2140' --splashBackgroundColorDark '#1b2140'`
to change the icon.

## Project layout

```
src/
  main.ts                 bootstraps Rapier, creates the Game, runs the frame loop
  game/Game.ts            owns renderer, scene, physics, entities; phase state machine
  game/Input.ts           keyboard + touch -> crane axes and drop button
  game/Scoring.ts         score formula
  game/Layout.ts          island-local coordinates (platform, hole, gantry bounds)
  game/Levels.ts          classic island definitions, theme/level/gate types
  game/Gates.ts           hatch gates: weight, laser & mirrors, key & Frankenstein, cauldron, scale, bells
  game/LevelsHalloween.ts the Spooky Night islands and themes
  game/Campaign.ts        campaign list, picker persistence, public game URL
  game/Monster.ts         Frankenstein body pieces, procedural monster builder, portrait renderer
  scene/Bones.ts          bone, spine and kawaii skull geometry (bone crane, fences, decor)
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
  entities/Chicken.ts     cucco visuals and animation (white and black)
  entities/Ghost.ts       haunted island ghosts and the Ghost King
  entities/Frankenstein.ts the key gate's guard
  entities/KindsExtra.ts  pickups for the later islands and the magnet tool
  entities/KindsHalloween.ts spooky pickups (candy corn, tombstone, eyeball, coffin, potion, cauldron)
  entities/Crab.ts        crab visuals and animation, plus the diamond variant
  scene/Water.ts          stylised water shader (caustic web, swell, foam rim)
  entities/Grabbable.ts   interface shared by collectibles and chickens
  ui/Hud.ts               DOM overlay: timer, attempts, target cards, intro/results, monster screen
  ui/Share.ts             share card composition and native/web sharing
  audio/Sfx.ts            WebAudio synth cues
  audio/Music.ts          soundtracks (Monster Waltz, Island Hop): lookahead sequencer, scores and per-island arrangements
  ui/Icons.ts             drawn SVG icons used across the HUD (the UI uses no emoji)
```
