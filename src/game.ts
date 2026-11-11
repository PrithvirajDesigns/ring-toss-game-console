import { FixedLoop } from './core/loop';
import type { GameEvent, GameEventListener, GameState } from './core/events';
import { loadSave, writeSave, type SaveData, type Settings, TILT_STEPS } from './core/save';
import { ActionState, type Action, type InputSource } from './input/actions';
import { World } from './physics/world';
import { DEFAULT_PHYSICS, type PhysicsConfig } from './physics/config';
import { Rng } from './physics/rng';
import { Screen } from './render/screen';
import { Bubbles, Sparks } from './render/particles';
import { Aquarium } from './render/aquarium';
import { drawPlayfield, drawTankFrame, drawHud, drawDebug, fmtTime } from './render/scene';
import { DETAIL, SCREEN_W } from './render/framebuffer';
import { dim, menu, panel, star, titleLogo, footerHint, levelGrid } from './render/ui';
import { drawTextCentered } from './render/font';
import { P } from './render/palette';
import { CLASSIC, ZEN, CHALLENGE } from './levels/index';
import type { LevelDef } from './levels/types';
import { GameAudio } from './audio/audio';

export interface GameOptions {
  canvas: HTMLCanvasElement;
  inputSource: InputSource;
  /** The host creates it and resumes it on a user gesture. Optional: no context = silent. */
  audioContext?: AudioContext;
  /** Physics overrides (merged into the defaults). */
  physics?: Partial<PhysicsConfig>;
  /** Persist progress and settings in localStorage. Default true. */
  persist?: boolean;
  seed?: number;
}

export interface Game {
  start(): void;
  /** Suspend everything (e.g. tab hidden). If playing, the in-game pause menu shows on resume. */
  pause(): void;
  resume(): void;
  destroy(): void;
  onEvent(cb: GameEventListener): () => void;
  /** Current player settings (the host reads tilt sensitivity and vibration from here). */
  readonly settings: Readonly<Settings>;
  /** Attach audio later (e.g. the context is created on the first tap). */
  setAudioContext(ctx: AudioContext): void;
  /** Dev hooks for the tuning panel; not needed by a shell. */
  readonly dev: {
    readonly config: PhysicsConfig;
    resetConfig(): void;
    overlay: boolean;
    readonly state: GameState;
    readonly world: World;
    readonly save: SaveData;
  };
}

const HZ = 120;

type Mode = { kind: 'classic' } | { kind: 'zen' } | { kind: 'challenge'; index: number };

const levelOf = (m: Mode): LevelDef => (m.kind === 'classic' ? CLASSIC : m.kind === 'zen' ? ZEN : CHALLENGE[m.index]);

const MAIN_ITEMS = ['CLASSIC', 'CHALLENGE', 'ZEN', 'SETTINGS'] as const;

export function createGame(opts: GameOptions): Game {
  const persist = opts.persist !== false;
  const config: PhysicsConfig = { ...DEFAULT_PHYSICS, ...opts.physics };
  const save = loadSave(persist);
  const commit = () => writeSave(persist, save);
  const screen = new Screen(opts.canvas);
  const fb = screen.fb;
  const input = opts.inputSource;
  const actions = new ActionState();
  const unsubInput = input.subscribe(actions.handle);
  const listeners = new Set<GameEventListener>();
  const emit = (e: GameEvent) => { for (const l of listeners) { try { l(e); } catch (err) { console.error(err); } } };
  const rng = new Rng(opts.seed ?? (Date.now() & 0xffff));
  let audio: GameAudio | null = opts.audioContext ? new GameAudio(opts.audioContext) : null;

  let state: GameState = 'boot';
  let stateTime = 0;
  let mode: Mode = { kind: 'classic' };
  let world = new World(config, CLASSIC, rng.next() * 1e9);
  let demo = new World(config, CLASSIC, 7);
  let bubbles = new Bubbles(rng);
  const demoBubbles = new Bubbles(rng);
  let sparks = new Sparks(rng);
  let aquarium = new Aquarium(world, 5);
  let demoAquarium = new Aquarium(demo, 9);
  let playTime = 0, bursts = 0, celebrate = -1;
  let mainCursor = 0, levelCursor = 0, settingsCursor = 0, pauseCursor = 0, resultsCursor = 0;
  let settingsReturn: GameState = 'menu';
  let results = { time: 0, bursts: 0, stars: 0, best: null as number | null, newBest: false, unlockedNext: false };
  let demoNext = 1, demoRelease = -1;
  const held = [0, 0];
  const bubbleAcc = [0, 0];

  const applyAudioSettings = () => audio?.setEnabled(save.settings.sound, save.settings.music);
  applyAudioSettings();
  const settingsChanged = () => { commit(); applyAudioSettings(); emit({ type: 'settings', settings: { ...save.settings } }); };

  const setState = (s: GameState) => {
    if (s === state) return;
    const prev = state;
    state = s;
    stateTime = 0;
    audio?.setDuck(s === 'play' ? 1 : s === 'pause' || s === 'results' ? 0.45 : 0.8);
    if (s !== 'boot') audio?.startMusic();
    emit({ type: 'state', state: s, prev });
  };

  const startLevel = (m: Mode) => {
    mode = m;
    world = new World(config, levelOf(m), rng.next() * 1e9);
    bubbles = new Bubbles(rng);
    sparks = new Sparks(rng);
    aquarium = new Aquarium(world, 5);
    playTime = 0; bursts = 0; celebrate = -1;
    for (let i = 0; i < held.length; i++) { if (held[i]) audio?.stopPump(i, 0); held[i] = 0; }
    setState('play');
  };

  const nozzleFor = (a: Action, w: World): number => {
    if (a === 'PUMP_A') return 0;
    if (a === 'PUMP_B') return w.fluid.nozzles.length > 1 ? 1 : 0;
    return -1;
  };

  const pumpDown = (w: World, a: Action, count: boolean) => {
    const n = nozzleFor(a, w);
    if (n < 0) return;
    if (held[n]++ === 0) {
      w.press(n);
      aquarium.onBurst(w.fluid.nozzles[n].x);
      audio?.startPump(n);
      if (count) { bursts++; emit({ type: 'burst', nozzle: n }); }
    }
  };
  const pumpUp = (w: World, a: Action) => {
    const n = nozzleFor(a, w);
    if (n < 0 || held[n] === 0) return;
    if (--held[n] === 0) {
      const pressure = w.fluid.nozzles[n]?.pressure ?? 0;
      w.release(n);
      audio?.stopPump(n, pressure);
      emit({ type: 'release', nozzle: n, pressure });
    }
  };

  const forwardWorldEvents = (w: World) => {
    for (const e of w.events) {
      if (e.type === 'thread') {
        emit({ type: 'thread', peg: e.peg, color: e.ring.color });
        sparks.burst(w.pegs[e.peg].x, w.pegs[e.peg].tipY, 5, 18);
        audio?.chime(w.threadedCount);
      } else if (e.type === 'unthread') emit({ type: 'unthread', peg: e.peg, color: e.ring.color });
      else if (e.type === 'land') {
        emit({ type: 'land', peg: e.peg, color: e.ring.color, speed: e.speed });
        for (let i = 0; i < 5; i++) bubbles.spawn(e.ring.x + rng.range(-5, 5), e.ring.y - 1, 1 + ((rng.next() * 2) | 0));
        sparks.burst(e.ring.x, e.ring.y, 8 + Math.min(8, e.speed / 4), 22 + e.speed * 0.4);
        audio?.clack(e.speed);
      } else if (e.type === 'hit') {
        emit({ type: 'hit', kind: e.kind, speed: e.speed });
        audio?.tick(e.speed);
      }
    }
    w.events.length = 0;
  };

  const spawnBubbles = (w: World, b: Bubbles, dt: number) => {
    w.fluid.nozzles.forEach((n, i) => {
      if (n.output <= 0.05) return;
      bubbleAcc[i] += 80 * n.output * dt;
      while (bubbleAcc[i] >= 1) {
        bubbleAcc[i] -= 1;
        const s = rng.next();
        b.spawn(n.x + rng.range(-3, 3), n.y - 2 - rng.range(0, 3), s < 0.6 ? 1 : s < 0.85 ? 2 : s < 0.96 ? 3 : 4);
      }
    });
    for (const r of w.rings) {
      if (r.state === 'free' && Math.hypot(r.vx, r.vy) > config.bubbleShedSpeed && rng.next() < 0.12) b.spawn(r.x + rng.range(-3, 3), r.y + rng.range(-2, 2), 1);
    }
  };

  const stepDemo = (dt: number) => {
    // Attract mode: the toy plays itself behind the title and menus.
    const t = demo.time;
    if (t >= demoNext) { demo.press(0); demoAquarium.onBurst(demo.fluid.nozzles[0].x); demoRelease = t + rng.range(0.05, 0.6); demoNext = t + rng.range(1.5, 4); }
    if (demoRelease > 0 && t >= demoRelease) { demo.release(0); demoRelease = -1; }
    demo.setGravity(input.getGravity());
    demo.step(dt);
    demo.events.length = 0;
    spawnBubbles(demo, demoBubbles, dt);
    demoBubbles.update(dt, demo.fluid, demo.tank.top, demo.tank.left, demo.tank.right);
    demoAquarium.update(dt);
    if (t > 90) { demo = new World(config, CLASSIC, rng.next() * 1e9); demoAquarium = new Aquarium(demo, 9); demoBubbles.clear(); demoNext = 1; }
  };

  const finishRound = () => {
    const lvl = levelOf(mode);
    const [s3, s2] = lvl.starTimes ?? [90, 180];
    const stars = 1 + (playTime <= s2 ? 1 : 0) + (playTime <= s3 ? 1 : 0);
    const prevBest = save.best[lvl.id] ?? null;
    const newBest = prevBest === null || playTime < prevBest;
    if (newBest) save.best[lvl.id] = +playTime.toFixed(2);
    save.stars[lvl.id] = Math.max(save.stars[lvl.id] ?? 0, stars);
    let unlockedNext = false;
    if (mode.kind === 'challenge' && mode.index + 1 >= save.unlocked && mode.index + 1 < CHALLENGE.length) { save.unlocked = mode.index + 2; unlockedNext = true; }
    commit();
    results = { time: playTime, bursts, stars, best: save.best[lvl.id], newBest, unlockedNext };
    resultsCursor = 0;
    emit({ type: 'win', mode: mode.kind, level: lvl.id, time: playTime, bursts, stars, best: results.best });
  };

  const resultItems = () => (mode.kind === 'challenge' && mode.index + 1 < CHALLENGE.length ? ['NEXT LEVEL', 'RETRY', 'MENU'] : ['RETRY', 'MENU']);

  const settingsItems = (): string[] => {
    const s = save.settings, on = (b: boolean) => (b ? 'ON' : 'OFF');
    return [`SOUND     ${on(s.sound)}`, `MUSIC     ${on(s.music)}`, `VIBRATION ${on(s.vibration)}`, `TILT      ${'*'.repeat(s.tilt)}${'-'.repeat(5 - s.tilt)}`, 'RECENTER', `DEBUG     ${on(s.debug)}`, 'BACK'];
  };

  /** Menu navigation: DOWN / SELECT / PUMP_B = next, UP = previous, PUMP_A / START = confirm. */
  const nav = (pressed: Action[], cursor: number, count: number): { cursor: number; go: boolean } => {
    for (const a of pressed) {
      if (a === 'DOWN' || a === 'SELECT' || a === 'PUMP_B') cursor = (cursor + 1) % count;
      else if (a === 'UP') cursor = (cursor - 1 + count) % count;
    }
    return { cursor, go: stateTime > 0.12 && (pressed.includes('PUMP_A') || pressed.includes('START')) };
  };

  const step = (dt: number) => {
    stateTime += dt;
    const { pressed, released, shakes } = actions.drain();
    if (pressed.includes('RECENTER')) { input.recenter?.(); emit({ type: 'recenter' }); }

    switch (state) {
      case 'boot':
        setState('title');
        break;

      case 'title':
        stepDemo(dt);
        if (pressed.includes('START') || pressed.includes('PUMP_A') || pressed.includes('PUMP_B')) setState('menu');
        break;

      case 'menu': {
        stepDemo(dt);
        const r = nav(pressed, mainCursor, MAIN_ITEMS.length);
        mainCursor = r.cursor;
        if (r.go) {
          const it = MAIN_ITEMS[mainCursor];
          if (it === 'CLASSIC') startLevel({ kind: 'classic' });
          else if (it === 'ZEN') startLevel({ kind: 'zen' });
          else if (it === 'CHALLENGE') { levelCursor = Math.min(save.unlocked - 1, CHALLENGE.length - 1); setState('levels'); }
          else { settingsReturn = 'menu'; settingsCursor = 0; setState('settings'); }
        }
        break;
      }

      case 'levels': {
        stepDemo(dt);
        // grid navigation: LEFT/RIGHT ±1, UP/DOWN ±4 (one row); SELECT / PUMP_B step forward
        const count = CHALLENGE.length + 1;
        let lc = levelCursor;
        for (const a of pressed) {
          if (a === 'RIGHT' || a === 'SELECT' || a === 'PUMP_B') lc = (lc + 1) % count;
          else if (a === 'LEFT') lc = (lc - 1 + count) % count;
          else if (a === 'DOWN') lc = lc === CHALLENGE.length ? lc % 4 : Math.min(CHALLENGE.length, lc + 4);
          else if (a === 'UP') lc = lc === CHALLENGE.length ? CHALLENGE.length - 4 : lc < 4 ? CHALLENGE.length : lc - 4;
        }
        const r = { cursor: lc, go: stateTime > 0.12 && (pressed.includes('PUMP_A') || pressed.includes('START')) };
        levelCursor = r.cursor;
        if (r.go) {
          if (levelCursor === CHALLENGE.length) setState('menu');
          else if (levelCursor < save.unlocked) startLevel({ kind: 'challenge', index: levelCursor });
        }
        break;
      }

      case 'settings': {
        if (settingsReturn === 'menu') stepDemo(dt);
        const items = settingsItems();
        const r = nav(pressed, settingsCursor, items.length);
        settingsCursor = r.cursor;
        if (r.go) {
          const s = save.settings;
          switch (settingsCursor) {
            case 0: s.sound = !s.sound; break;
            case 1: s.music = !s.music; break;
            case 2: s.vibration = !s.vibration; break;
            case 3: s.tilt = (s.tilt % 5) + 1; break;
            case 4: input.recenter?.(); emit({ type: 'recenter' }); break;
            case 5: s.debug = !s.debug; break;
            case 6: setState(settingsReturn); break;
          }
          if (settingsCursor !== 6 && settingsCursor !== 4) settingsChanged();
        }
        break;
      }

      case 'play': {
        for (const a of pressed) if (a === 'PUMP_A' || a === 'PUMP_B') pumpDown(world, a, celebrate < 0);
        for (const a of released) if (a === 'PUMP_A' || a === 'PUMP_B') pumpUp(world, a);
        if (pressed.includes('START')) { pauseCursor = 0; setState('pause'); break; }
        if (shakes.length) { world.shake(Math.min(2, Math.max(...shakes))); emit({ type: 'shake' }); audio?.tick(120); }

        world.setGravity(input.getGravity());
        world.step(dt);
        forwardWorldEvents(world);
        spawnBubbles(world, bubbles, dt);
        const pops = bubbles.update(dt, world.fluid, world.tank.top, world.tank.left, world.tank.right);
        if (pops && rng.next() < 0.35) audio?.bubble(0.7);
        sparks.update(dt);
        aquarium.update(dt);

        if (celebrate < 0) {
          playTime += dt;
          if (world.isWon) {
            celebrate = 0;
            aquarium.celebrate();
            audio?.jingle();
            for (const peg of world.pegs) for (let i = 0; i < 24; i++) bubbles.spawn(peg.x + rng.range(-8, 8), peg.baseY - rng.range(0, 30), 1 + ((rng.next() * 4) | 0));
            if (mode.kind !== 'zen') finishRound();
          }
        } else {
          celebrate += dt;
          if (celebrate > 2.4) {
            if (mode.kind === 'zen') {
              // Zen: endless. Dump the rings back to the floor and keep going.
              world.spawnRings();
              for (const n of world.fluid.nozzles) n.pressure = Math.max(n.pressure, 0.5);
              celebrate = -1;
            } else setState('results');
          }
        }
        break;
      }

      case 'pause': {
        for (const a of released) if (a === 'PUMP_A' || a === 'PUMP_B') pumpUp(world, a);
        const items = ['RESUME', 'RESTART', 'SETTINGS', 'QUIT'];
        const r = nav(pressed, pauseCursor, items.length);
        pauseCursor = r.cursor;
        if (r.go) {
          if (pauseCursor === 0) setState('play');
          else if (pauseCursor === 1) startLevel(mode);
          else if (pauseCursor === 2) { settingsReturn = 'pause'; settingsCursor = 0; setState('settings'); }
          else setState(mode.kind === 'challenge' ? 'levels' : 'menu');
        }
        break;
      }

      case 'results': {
        world.step(dt);
        world.events.length = 0;
        bubbles.update(dt, world.fluid, world.tank.top, world.tank.left, world.tank.right);
        sparks.update(dt);
        aquarium.update(dt);
        if (stateTime < 0.6) break;
        const items = resultItems();
        const r = nav(pressed, resultsCursor, items.length);
        resultsCursor = r.cursor;
        if (r.go) {
          const it = items[resultsCursor];
          if (it === 'NEXT LEVEL' && mode.kind === 'challenge') { levelCursor = mode.index + 1; startLevel({ kind: 'challenge', index: mode.index + 1 }); }
          else if (it === 'RETRY') startLevel(mode);
          else setState(mode.kind === 'challenge' ? 'levels' : 'menu');
        }
        break;
      }
    }
    audio?.updatePumps(state === 'play' ? world.fluid.nozzles.map((n) => n.output) : [0, 0]);
  };

  const drawWorld = (w: World, b: Bubbles, alpha: number) => {
    (w === world ? aquarium : demoAquarium).drawBack(fb);
    drawPlayfield(fb, w, b, alpha);
    if (w === world) sparks.draw(fb, DETAIL);
    drawTankFrame(fb, w, w.fluid.nozzles.map((n) => n.output));
  };

  const hudLabel = () => (mode.kind === 'challenge' ? `L${mode.index + 1}` : mode.kind === 'zen' ? 'ZEN' : '');

  const render = (alpha: number) => {
    const blink = Math.floor(stateTime * 2.5) % 2 === 0;
    const overlay = save.settings.debug;
    switch (state) {
      case 'boot':
        fb.clear(P.ABYSS);
        break;
      case 'title':
        drawWorld(demo, demoBubbles, alpha);
        titleLogo(fb, stateTime);
        footerHint(fb, 'PRESS A', blink);
        break;
      case 'menu': {
        drawWorld(demo, demoBubbles, alpha);
        dim(fb);
        menu(fb, 'RING TOSS TANK', [...MAIN_ITEMS], mainCursor, 56, blink, 'MOVE: D-PAD   GO: A');
        const best = save.best.classic;
        const total = CHALLENGE.reduce((a, l) => a + (save.stars[l.id] ?? 0), 0);
        drawTextCentered(fb, `${best ? `CLASSIC BEST ${fmtTime(best)}   ` : ''}STARS ${total}/${CHALLENGE.length * 3}`, SCREEN_W / 2, 270, P.LIGHT, P.INK);
        break;
      }
      case 'levels': {
        drawWorld(demo, demoBubbles, alpha);
        dim(fb, 2);
        const tiles = CHALLENGE.map((l, i) => ({ n: i + 1, stars: save.stars[l.id] ?? 0, locked: i >= save.unlocked }));
        const sel = CHALLENGE[levelCursor];
        const name = sel ? (levelCursor < save.unlocked ? sel.name : 'LOCKED') : 'BACK TO MENU';
        const info = sel && levelCursor < save.unlocked
          ? `${sel.rings.length} RINGS  ${sel.pegs.length} PEG${sel.pegs.length > 1 ? 'S' : ''}${sel.nozzles.length > 1 ? '  2 JETS' : ''}${sel.pegs.some((p) => p.color) ? '  COLOURS' : ''}${save.best[sel.id] ? `  BEST ${fmtTime(save.best[sel.id])}` : ''}`
          : sel ? 'CLEAR THE LEVEL BEFORE' : '';
        levelGrid(fb, tiles, levelCursor, blink, name, info);
        break;
      }
      case 'settings': {
        if (settingsReturn === 'menu') drawWorld(demo, demoBubbles, alpha);
        else { drawWorld(world, bubbles, 1); drawHud(fb, world, mode.kind === 'zen' ? null : playTime, hudLabel()); }
        dim(fb, 2);
        menu(fb, 'SETTINGS', settingsItems(), settingsCursor, 36, blink, 'MOVE: D-PAD   CHANGE: A');
        break;
      }
      case 'play':
      case 'pause':
      case 'results': {
        drawWorld(world, bubbles, state === 'pause' ? 1 : alpha);
        drawHud(fb, world, mode.kind === 'zen' ? null : playTime, hudLabel());
        if (overlay) drawDebug(fb, world, loop.fps);
        if (state === 'play' && celebrate >= 0) {
          if (mode.kind === 'zen') drawTextCentered(fb, 'LOVELY', SCREEN_W / 2, 76, P.LGREEN, P.INK, 3);
          else if (Math.floor(celebrate * 6) % 2 === 0) drawTextCentered(fb, 'CLEAR!', SCREEN_W / 2, 76, P.YELLOW, P.INK, 3);
        }
        if (state === 'play' && stateTime < 2 && mode.kind === 'challenge') {
          const lvl = levelOf(mode);
          drawTextCentered(fb, `LEVEL ${mode.index + 1}`, SCREEN_W / 2, 60, P.WHITE, P.INK, 2);
          drawTextCentered(fb, lvl.name, SCREEN_W / 2, 84, P.YELLOW, P.INK);
          if (lvl.pegs.some((p) => p.color)) drawTextCentered(fb, 'MATCH RING TO PEG COLOUR', SCREEN_W / 2, 98, P.LIGHT, P.INK);
        }
        if (state === 'pause') {
          dim(fb);
          menu(fb, 'PAUSED', ['RESUME', 'RESTART', 'SETTINGS', 'QUIT'], pauseCursor, 70, blink, 'MOVE: D-PAD   GO: A');
        }
        if (state === 'results') {
          dim(fb);
          const items = resultItems();
          panel(fb, 50, 40, 220, 196);
          drawTextCentered(fb, 'CLEAR!', SCREEN_W / 2, 52, P.YELLOW, P.INK, 3);
          if (mode.kind === 'challenge') drawTextCentered(fb, `LEVEL ${mode.index + 1}  ${levelOf(mode).name}`, SCREEN_W / 2, 80, P.LIGHT);
          drawTextCentered(fb, `TIME   ${fmtTime(results.time)}`, SCREEN_W / 2, 96, P.WHITE);
          drawTextCentered(fb, `BURSTS ${String(results.bursts).padStart(5)}`, SCREEN_W / 2, 108, P.WHITE);
          if (results.best !== null) drawTextCentered(fb, `${results.newBest ? 'NEW BEST' : 'BEST'} ${fmtTime(results.best)}`, SCREEN_W / 2, 120, results.newBest && blink ? P.ORANGE : P.LIGHT);
          for (let i = 0; i < 3; i++) star(fb, SCREEN_W / 2 - 25 + i * 18, 136, i < results.stars);
          if (results.unlockedNext) drawTextCentered(fb, 'NEXT LEVEL UNLOCKED', SCREEN_W / 2, 152, P.LGREEN);
          items.forEach((it, i) => {
            const y = 170 + i * 14, sel = i === resultsCursor;
            if (sel) panelRow(y);
            drawTextCentered(fb, (sel && blink ? '> ' : '  ') + it + '  ', SCREEN_W / 2, y, sel ? P.WHITE : P.PLASTIC);
          });
        }
        break;
      }
    }
    screen.present();
  };
  const panelRow = (y: number) => fb.rect(90, y - 3, 140, 13, P.DEEP);

  const loop = new FixedLoop(HZ, step, render);

  return {
    start() { loop.start(); emit({ type: 'settings', settings: { ...save.settings } }); },
    pause() {
      if (!loop.isRunning) return;
      actions.releaseAll();
      for (let n = 0; n < held.length; n++) if (held[n] > 0) { held[n] = 0; world.release(n); audio?.stopPump(n, 0); }
      if (state === 'play') { pauseCursor = 0; setState('pause'); }
      audio?.stopMusic();
      render(1);
      loop.stop();
    },
    resume() { loop.start(); audio?.startMusic(); },
    destroy() {
      loop.stop();
      unsubInput();
      audio?.destroy();
      listeners.clear();
    },
    onEvent(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    get settings() { return save.settings; },
    setAudioContext(ctx: AudioContext) {
      if (audio) return;
      audio = new GameAudio(ctx);
      applyAudioSettings();
      // only start the tune if the game is already running; otherwise it starts with the title
      if (loop.isRunning) audio.startMusic();
    },
    dev: {
      config,
      resetConfig() { Object.assign(config, DEFAULT_PHYSICS); },
      get overlay() { return save.settings.debug; },
      set overlay(v: boolean) { save.settings.debug = v; commit(); },
      get state() { return state; },
      get world() { return world; },
      get save() { return save; },
    },
  };
}

export { TILT_STEPS };
