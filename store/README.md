# Store assets

Everything the App Store and Google Play ask for, ready to upload. The copy
(promo text, descriptions, keywords) is in [`listing.md`](listing.md).

## App icon

| File | Size | Where it goes |
|---|---|---|
| `icon-1024.png` | 1024×1024, no transparency | App Store Connect → App Information (it is also built into the app) |
| `play-icon-512.png` | 512×512 | Play Console → Main store listing → App icon |

The icon is drawn in [`src/icon.html`](src/icon.html): the bone claw holding a
jack-o'-lantern over a little floating graveyard at night. The same art is used
inside the apps: `resources/` holds the sources for `@capacitor/assets`
(`icon-only`, the Android adaptive `icon-foreground` / `icon-background`, and
the splash screens), and the generated iOS and Android icons are committed.

## Screenshots

Eight captioned screenshots, the same story in every size:

1. Build a monster, one claw at a time (title)
2. Steer the claw. Grab it dead centre (Pumpkin Patch)
3. Every hatch has a lock (Graveyard bells)
4. Brew the right potion (Witch's Brewery)
5. Sneak the key past Frankenstein (Frozen Crypt)
6. Win a body part on every island (results)
7. It's alive! Name it, share it (finished monster)
8. Plus the 10 Classic islands (Classic Meadow)

| Folder | Size | Where it goes |
|---|---|---|
| `appstore/iphone-6.9/` | 1290×2796 | App Store Connect → iPhone 6.9" Display (Apple scales it down for smaller iPhones) |
| `appstore/ipad-13/` | 2064×2752 | App Store Connect → iPad 13" Display (required: the app runs on iPad) |
| `play/phone/` | 1080×1920 | Play Console → Phone screenshots |
| `play/tablet/` | 1600×2560 | Play Console → 7-inch and 10-inch tablet screenshots (the same files work for both) |

## Feature graphic

`play/feature-graphic.png`, 1024×500: Play Console → Main store listing →
Feature graphic.

## Regenerating

```sh
npx vite --port 5173                 # the game, for the captures
node store/src/render.mjs            # everything (captures take a few minutes)
node store/src/render.mjs --skip-captures   # re-frame existing captures only
npx @capacitor/assets generate --iconBackgroundColor '#2c1a47' --iconBackgroundColorDark '#2c1a47' --splashBackgroundColor '#1d1030' --splashBackgroundColorDark '#1d1030'
```

Headlines, colours and which scenes are captured live at the top of
[`src/render.mjs`](src/render.mjs); the frame layout is
[`src/frame.html`](src/frame.html) and the feature graphic is
[`src/feature.html`](src/feature.html).
