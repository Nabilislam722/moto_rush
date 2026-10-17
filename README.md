# Moto Rush

Moto Rush is a physics bike racing game in the style of Bike Race: 500 tracks across five worlds (Jungle, Desert, Glacier, Meadow, Crystal Cave), loop-the-loops, stairs, table jumps, flips and a garage of five bikes (four from a pixel-art sprite sheet, plus the #27 Venom OP bike).

## Play

Serve the folder and open `index.html`:

```
cd moto_rush
python3 -m http.server 8000   # then visit http://localhost:8000
```

To put it online, turn on GitHub Pages for this repo (Settings → Pages → Deploy from branch → `main`, folder `/`). It's then playable at https://nabilislam722.github.io/moto_rush/.

Opening `index.html` straight from disk also works. The physics engine loads from the jsDelivr CDN, and there's a copy in `vendor/` for offline play.

| Action | Keyboard | Touch |
| --- | --- | --- |
| Gas | ↑ / W / Space | GAS button |
| Brake / reverse | ↓ / S | BRAKE button |
| Lean back / forward (flips in the air) | ← / A, → / D | BACK / FRONT buttons |
| Restart | R | ↻ in the top bar |
| Pause | Esc / P | ❚❚ in the top bar |

On phones the buttons appear automatically. You can hold several at once and slide a thumb from one to the next without lifting. If a device is detected wrongly, use **Phone buttons: auto / on / off** on the main menu. The menu also has a fullscreen button where the browser allows it. Tilt steering isn't available, because published Claude artifacts can't read motion sensors.

Each landed flip takes 1 second off your time. Stars unlock the next three bikes at 5, 12 and 20 stars. Progress is saved in the browser.

**#27 Venom (OP bike, future NFT).** The fifth bike in the garage is the fastest and strongest, with its own turbo two-stroke sound. It will be an NFT; until ownership is connected everyone can ride it as a demo. The hook is `NFT` near the top of `js/game.js`: set `demo` to `false` and make `owns()` return the wallet check. The art is a vector redraw in `js/opbike.js`, so the wheels spin separately. Swap in the original PNG art there if you prefer.

## Files

- `js/levels.js`: the track builder, the 9 hand-built levels, and the seeded generator for levels 10–500. Generated levels cycle the five worlds every 5 levels and get longer and harder toward level 500. New obstacles are introduced with a banner: zigzag stairs (level 15), table jumps on posts (35), stairs up (60) and broken loops with a gap at the top (90), then turn up more often. `GEN_FIX` records which re-roll of each seed passed testing, and `GEN_TIMES` holds the starter bike's autopilot time, which sets the star targets.
- `tools/validate-levels.js` (`npm install && npm run validate`): rides generated levels with the autopilot on the slowest and fastest bike and reports the first re-roll that both finish. Re-run it if you change the generator, then update `GEN_FIX` and `GEN_TIMES`.
- `js/sim.js`: planck.js physics for the bike, rider, loop switching, flips, crashes and the autopilot.
- `js/render.js`: parallax backgrounds, track art, sprites, particles and popups. Scenery scrolls slowly (`BG_SPEED`), only forward, and without vertical movement, to avoid motion sickness.
- `js/game.js`: the main loop (fixed 120 Hz physics with interpolated rendering), camera, input, menus and HUD.
- `js/audio.js`: synthesized sound. Each bike has its own engine voice (`ENGINES`): Storm RR is a screaming inline-four, Tricolore a raspy inline-four, Rosso V4 a deep thumping V4 that crackles when you lift off, and Viper Z a growling naked four with intake howl. Engines shift through 5–6 gears with road speed and free-rev in the air. Tricolore, Rosso V4 and Viper Z are turbocharged: boost whistles up under full throttle and the blow-off valve vents ("sho") on every upshift and when you lift off. Rosso's flutters, Viper's is sharp and Tricolore's is a clean hiss. The starter Storm RR has no turbo. Tap REV (or the bike) in the garage to hear each one.
- `assets/`: bikes, wheels and rider cut out of the provided sprite sheet.
- `assets/bg/`: the Craftpix "Jungle 2D Game Backgrounds" and "Parallax 2D Game Backgrounds" layers, cropped and scaled to 75% for the web. Jungle levels rotate through the four jungle scenes; Desert uses the pyramids, Glacier the snowy night, Meadow the green hills and Crystal Cave the cave. Flat sky and fog layers are stored as 1px strips. Scene layout and parallax speeds are in `SCENES` in `js/render.js`.

Add `#autopilot` to the URL to have the built-in driver ride any level. All 500 levels are checked finishable on the starter bike, and the generated ones on the fastest bike too. The level picker shows 20 levels per page: use the arrows, ← →, the page strip, or swipe.

## Craftpix jungle UI pack

craftpix.net was blocked from the build environment, so the menus currently use a hand-built CSS jungle skin. Each skinnable piece is a single CSS class at the top of `index.html`: `.board` (window panels), `.ribbon` (title banners), `.btn` / `.ibtn` (buttons), `.tile` (level buttons), `.plaque` (HUD signs) and `.tbtn` (touch controls). To use the pack, drop its PNGs into `assets/ui/` and point those classes at them with `background` or `border-image`.
