# Ring Toss Tank

A pixel-art water ring toss for your phone, played on **Tide Pocket**, an original retro handheld.

Pump the jets to send rings swirling through a reef tank, tilt the phone to steer them as they sink, and land every ring on its peg. It is built with TypeScript, Vite and Canvas 2D, with no game engine and no image or sound files: the art, physics and music are all generated in code.

**Features**
- Custom 120 Hz water physics: jets, vortices, currents, ring threading and stacking
- Tilt and shake controls through the phone's motion sensors (with the iOS permission prompt), plus keyboard and on-screen buttons
- A 320×288 pixel-art reef with 32 colours: animated fish, coral, seaweed, light rays and caustics
- Three modes: Classic, Challenge (12 levels with stars) and Zen
- Synthesized Web Audio music and sound effects, plus vibration on Android
- The Tide Pocket handheld shell: a power switch, a CRT-style boot with a logo reveal, and five translucent finishes
- An installable offline PWA

- **Phase 1 (done):** physics, tilt and shake, the aquatic art, 12 challenge levels, menus, saves, procedural audio, haptics, offline PWA.
- **Phase 2 (done):** the handheld shell (`index.html`, `src/shell/`). The bare screen with the tuning panel lives on at `dev.html`.

## The handheld (phase 2)

| Shell control | Game action |
|---|---|
| D-pad | UP/DOWN/LEFT/RIGHT: menus and the level grid. Holding ◀ ▶ during play also tilts, for phones without motion sensors. |
| A | PUMP_A (left jet on twin-jet levels), confirm |
| B | PUMP_B (right jet; on single-jet levels it pumps too) |
| START / SELECT | pause / next item |
| LEVEL (small round button) | RECENTER: your current grip becomes level |

- **Power:** the first tap anywhere powers on (that gesture starts audio and asks iOS for motion permission). After that, the OFF/ON switch at the top left turns the device off (screen dark, game paused, music stopped) and back on.
- **Brand label:** tap it to cycle shell finishes: translucent ocean blue (default), clear acrylic, lagoon, coral, smoke. The translucent finishes show detailed moulded internals (`src/shell/internals.ts`), generated from the live control positions so every collar, boss and trace lines up at any screen size. Long-press it for the developer tuning panel.
- **Boot sequence** (`src/shell/boot.ts`, `wordmark.ts`, `bootSound.ts`): Tide Pocket's own logo reveal, played on the screen before the game. The CRT switches on with a tiny dot that stretches sideways into a line; the line fades and the logo begins. All fades step the palette darker (no dithered, dotted frames). "Tide" and "Pocket" are pixel lettering in a tight geometric bold, built from circles and bars in code, each paired with a block of five lines that draws out before the word wipes in and warms from red to yellow. Then "8-BIT REEF" types in. The logo score (compressor bus, generated stereo reverb, kick and snare, unison pad, FM bells) is locked to the same beats. It runs about 3.9 s on first power-on, followed by a 1.5 s circular loading spinner, and about 1.5 s after a power cycle (then the game resumes at its pause menu). The game's own music only starts once the game does. A, START or any key skips it, and the sound follows the sound setting.
- **Display look:** a faint LCD pixel grid (exactly aligned to game pixels, one device pixel thin), a slightly richer and warmer colour grade, and a soft backlight falloff toward the panel's edges.
- **Screen scaling:** the screen keeps whole-number pixel scaling (3× on a 390-px phone, 2× on a 360-px phone). On short phones the controls shrink, never the screen.
- **Design:** the shell is an original design. It has no third-party console branding.

## Deploy (GitHub + Vercel)

1. Create an empty repository on GitHub (for example `ring-toss-tank`), then upload the contents of this folder, or push it:
   ```bash
   git init && git add -A && git commit -m "Ring Toss Tank"
   git branch -M main
   git remote add origin https://github.com/<you>/ring-toss-tank.git
   git push -u origin main
   ```
2. On vercel.com choose **Add New → Project**, import the repository and keep the detected settings (framework Vite, build `npm run build`, output `dist`). `vercel.json` already sets these.
3. Deploy. Vercel serves the site over HTTPS, so tilt works when you open the link on your phone. Every push to `main` redeploys it.

## Run it

```bash
npm install
npm run dev          # desktop: http://localhost:5173
npm run dev:phone    # same, exposed on your LAN
npm run test:sim     # headless physics checks (threading, stacking, knock-off, stability, aiming bot)
npm run build        # typecheck + production build into dist/
npm run build:single # dist-single/index.html: one self-contained file (no offline support)
npm run icons        # regenerate public/icons from code
npm run sprites      # regenerate assets/sprite-sheet.png (review sheet)
```

### On your phone
Tilt needs **HTTPS** (browsers only expose motion sensors to secure pages) and a real top-level page. Embedded frames, such as the claude.ai preview, block sensors, so tilt can only be tested from a page you serve yourself. Either:
- `npx ngrok http 5173` (or `cloudflared tunnel --url http://localhost:5173`) and open the https URL, or
- `npm i -D @vitejs/plugin-basic-ssl`, add `basicSsl()` to `vite.config.ts`, run `npm run dev:phone`, and accept the self-signed certificate warning on the phone.
- or deploy `dist-single/index.html` to any static host (Vercel, Netlify, GitHub Pages).

Tap **TAP TO START** (on iOS this shows the motion permission prompt), hold the phone the way you like, and the game recentres on your grip. Press **RECENTER** any time. If you deny permission, the game falls back to straight-down gravity.

## Controls

| Action | On-screen button (`dev.html`) | Keyboard |
|---|---|---|
| PUMP_A | big PUMP button (hold = stronger) | Space / Z |
| PUMP_B | PUMP B (Twin Jets mode only) | X |
| START | START (pause) | Enter |
| SELECT | SELECT (menu cursor) | Shift / Backspace |
| RECENTER | RECENTER | R |
| Tilt | tilt the phone | Arrow keys, or M to toggle mouse-position tilt |
| Shake | shake the phone | K |

**DEBUG** toggles the overlay: flow vectors, vortices (pink/green crosses), ring collision circles (green = hole faces the peg, red = doesn't), threading windows (yellow), peg capsules and the gravity arrow.
**TUNE** opens live sliders for every physics constant. Changes are saved on the device, and the panel shows a JSON of what you changed, so you can paste your preferred feel back to me.

## Architecture

```
src/
  game.ts            createGame({ canvas, inputSource, audioContext }) → { start, pause, resume, destroy, onEvent, dev }
  shell/shell.ts     the Tide Pocket handheld page (index.html)
  dev-host.ts        bare screen + tuning panel (dev.html)
  dev/tuning.ts      live physics sliders
  core/              fixed-step loop (120 Hz, accumulator, interpolation), events/state types
  physics/           config.ts (every constant + slider ranges), fluid.ts (jet, vortices, curl noise), world.ts (rings, pegs, collisions, threading, stacking, win)
  shell/             handheld shell: boot.ts (logo reveal), wordmark.ts, bootSound.ts, internals.ts
  render/            framebuffer (indexed 320x288), screen (integer-scale blit), palette (32 colours), font (5x7), rings, particles, scene, ui, art/
  input/             abstract actions + ActionState latch, keyboard / pointer-button / d-pad / motion sensors, haptics
  levels/            mode and level data (Classic, Challenge, Zen)
  audio/             synthesized sound effects and music
scripts/             headless physics checks, single-file build, icon and sprite generators
```

The game touches only the canvas it's given and the InputSource interface. It never reads the DOM or the window; keyboard and buttons are host-side sources.

## Sensors (milestone 4): `src/input/sensors.ts`

- `DeviceMotionEvent.accelerationIncludingGravity` is the primary source, with `DeviceOrientationEvent` (beta/gamma) as a fallback. Readings are rotated for `screen.orientation`.
- iOS permission comes from the tap-to-start gesture. Denied or unsupported means null gravity, and the game uses straight down.
- The sign differs between iOS and Android. It's chosen by platform, then confirmed from the first readings.
- Low-pass filter, a 3° dead zone, a sensitivity multiplier, and clamping in both the source and the world (`tiltMaxInfluence`). Flat on a table, tilt fades out instead of jittering.
- Recenter stores your current hold angle as level.
- Shake is an acceleration spike above 13 m/s² with a 0.45 s cooldown. It jostles every ring.

## Art (milestone 5): `src/render/art/*`, `src/render/aquarium.ts`

Everything is generated in code from editable parameters. `npm run sprites` writes `assets/sprite-sheet.png` (4×) so you can review the fish frames and coral.

- **Layers, back to front:** water gradient → light rays → distant reef silhouette (fogged, shimmering) → dark kelp → coral bed (sea fans, branching coral, brain coral, tube sponges, rocks, anemones, starfish) → caustics → fish → bright seaweed → rings and pegs → tank glass. Parallax follows tilt.
- **Fish:** a round yellow tang-like fish, a striped angelfish-like fish, and a school of six small blue-green fish. Each has a 4-frame swim cycle (the rear of the body bends through a sine wave). They wander, turn at the glass, bolt sideways when a burst goes off or strong flow reaches them, and swirl around the tank when you clear it.
- **Seaweed** sways, and its tips bend with the real water flow, so bursts push it.
- **Caustics:** a tileable 64×64 pattern with 16 frames, a new frame roughly every 8 display frames, fading with depth through dithering.
- **Detail:** sparks and bubbles when a ring threads or lands, bubbles shed by fast rings, 1 px dark outlines on rings so they stay readable over the coral, and a clear-plastic floor ledge the reef shows through.

## Game (milestone 6)

- **Modes:** Classic (10 rings, timer, best time), Challenge (12 levels), Zen (endless; rings respawn when you clear them).
- **Challenge levels** are in `src/levels/index.ts`, ordered by measured difficulty. They vary ring count, peg positions and heights, one or two nozzles, current strength, and colour-matched pegs (marked by a coloured band near the tip and a tinted flange). Each level has star times, and clearing a level unlocks the next.
- **Menus**, all inside the pixel screen: title → main menu → level select / settings → play → pause (resume, restart, settings, quit) → results (next level, retry, menu). SELECT moves, PUMP or START confirms. On twin-jet levels PUMP B pumps; in menus it also moves.
- **Settings:** sound, music, vibration, tilt sensitivity (5 steps), recenter, debug overlay.
- **Save data:** one versioned key, `rtt.save`, holding settings, best times, stars and unlocks. Old prototype keys are migrated.

## Audio and haptics (milestone 7)

`src/audio/audio.ts`: everything is synthesized with Web Audio, with no sample files.
- **Pump:** a whoosh of filtered noise that opens up and gets louder with jet pressure, plus a backflow "gulp" on release.
- **Effects:** bubble pops at the surface, soft plastic ticks on collisions, a crisp clack when a ring lands, and a rising pentatonic chime when it threads (pitch climbs with your progress).
- **Music:** a win jingle, and a looping 8-bar reef tune played by a look-ahead scheduler, quieter when paused.
- **AudioContext** is created and resumed on the tap-to-start gesture (`game.setAudioContext`).

`src/input/haptics.ts`: `navigator.vibrate` on burst, landing, win and shake (Android). It silently does nothing where unsupported, including iOS.

## PWA and performance (milestone 8)

- `public/manifest.webmanifest` (standalone, portrait) and pixel-art icons generated by `scripts/make-icons.ts`.
- A build-time Vite plugin writes `sw.js` with the exact list of built files, versioned by content hash. After one visit the game works fully offline, and new deploys replace the old cache. It's skipped in dev, in frames, and on insecure origins.
- **Performance:** physics takes about 12 µs per 120 Hz step. Rendering is about 1.5 ms of script per frame on desktop, and holds 60 fps at 4× CPU throttle (roughly a mid-range phone).

### Real-device checklist (iOS Safari, Android Chrome)
1. Open the HTTPS URL. Tap to start. iOS asks for motion: allow it.
2. Tilt left and right: sinking rings drift that way, and the background shifts slightly for parallax.
3. RECENTER while holding the phone at your usual angle: that angle becomes level.
4. Shake: the rings jostle (and the phone buzzes on Android).
5. Hold PUMP: the whoosh rises with the gauge. Release: a gulp.
6. Land a ring: a clack and a chime (plus a buzz on Android).
7. Add to home screen, open it, turn on airplane mode, reopen: it still works.
8. Settings: sound, music and vibration toggles, and the tilt steps, take effect immediately and persist after a reload.

## Resolution

The screen is **320×288** (`DETAIL = 2` in `src/render/framebuffer.ts`): twice as fine as the original 160×144 spec, with the same aspect ratio for the phase-2 shell. The physics still works in 160×144 world units, so every tuning value keeps its meaning. The renderer multiplies by `DETAIL` and draws outlines, highlights, bubbles and text on the fine grid. Text uses a 5×7 font.

## Physics notes and judgement calls

- **Water** is an analytic velocity field, not a grid: a jet cone per nozzle (narrow core plus a broad lobe, plus floor-level entrainment that draws rings into the jet), short-lived shed vortices, and divergence-free curl-noise currents. Rings relax toward the local water velocity (`linearDrag`) under ~20% gravity, so the terminal sink speed is `gravity / linearDrag` (about 21 px/s, ~5 s to fall the tank).
- **Pump**: a press gives an instant pop (`jetTapPressure`). Holding builds pressure toward 1 (`jetBuildRate`) until the chamber "empties" (`jetMaxHold`). Release fires a short backflow pulse, then the flow decays (`jetDecay`). A pressure gauge under the nozzle shows it.
- **Floor**: slopes down into the nozzle (`floorSlope`), like the toy's ledge, so rings keep getting fed back into the jet. Without it, a burst only lifted the one ring directly over the nozzle.
- **Tilt and "face-on"**: a ring's `tilt` is a rotation about the screen's horizontal axis. 0 = a circle facing you; ±90° = lying flat, seen as a line. A ring slips over a vertical peg when its *hole faces the peg*, i.e. `|sin(tilt)| ≥ threadMinAlign`. I read the spec's "near face-on" as face-on *to the peg*. Rings on pegs then settle to `pegRestTilt` (~54°), so stacks read as squashed ellipses with the peg passing through them.
- **Threading** fires when the ring centre crosses the tip downward, inside the hole window, with the hole facing the peg. If the hole is aligned but the rim lands on the tip, the inner half of the rim funnels toward the hole and the outer half slides off. A face-on ring perched on a tip rolls off (`tipRollOff`).
- **On the peg**: the water grips threaded rings at `threadedFlowCoupling` (peg friction). Settled rings survive a full burst, but a ring that has just landed near the tip can be blasted off again. There's 2 px of hysteresis at the tip, so rings don't flicker on and off.
- **Win**: every ring threaded (on its colour peg, if the level sets one), resting and still, for `winSettleTime`.
