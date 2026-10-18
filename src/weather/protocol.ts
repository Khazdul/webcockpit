// Weather engine messages and shared types (stage 28, ADR 0091).
//
// The main thread (src/weather/index.ts) owns the DOM: it measures the
// layout and posts it here only when it changes. The worker
// (src/weather/worker/weather.worker.ts) owns both canvases and draws every
// frame. Nothing in this file touches the DOM, so both sides import it.

/** GMCP `Char.Vitals.weather`: ' ' clear, '~' clouds, "'" rain, '"' heavy rain, '*' snow, null indoors. */
export type WeatherSym = ' ' | '~' | "'" | '"' | '*' | null;
/** GMCP `Char.Vitals.fog`: '' none, '-' light, '=' dense. */
export type FogSym = '' | '-' | '=';

/** The game state the engine reacts to (the prototype's `env.raw`). */
export interface WeatherState {
  weather: WeatherSym;
  fog: FogSym;
  /** `Char.Vitals.light` ('*' sun, '!' lit, ')' moon, 'o' dark): informational; '!' tints. Every dark room is 'o'. */
  light: string;
  /** standing, resting, sleeping, stunned, incapacitated, dying, … */
  position: string;
  /** The latest `Event.Sun` or the almanac: 'day' after light, 'night' after dark (the dawn hour, `rise`, is still night; the dusk hour, `set`, still day). */
  clock: 'day' | 'night';
  /** The latest `Event.Moon`. */
  moonUp: boolean;
  /** Illuminated fraction of the moon, 0..1 (from the almanac). */
  moonPhase: number;
  /**
   * How far the moon is through its time up, 0 (rising) … 1 (setting),
   * from the almanac; -1 when it is down or the clock is not synced. Sent
   * at start and on a clock sync only: the sky advances it on its own.
   */
  moonU: number;
  /**
   * How far the sun is through the day, 0 when the day begins (the hour
   * after the dawn hour) … 1 at the dusk hour (clock.ts DAWN/DUSK, by
   * month; 1 when the night begins, the hour after it), from the almanac;
   * -1 at night or
   * when the clock is not synced. Steers the day's sun glimpses (most and
   * strongest at midday, owner feedback 52). Sent at start, on a clock sync
   * and when it has moved on by SUN_U_STEP.
   */
  sunU: number;
  /**
   * Unix ms of the second the current day began or (at night) the next
   * one begins (clock.ts `dayBeginsAt`); -1 below minute precision. Drives
   * the sunrise over the 60 s before it (sunturn.ts, ADR 0093). Sent at
   * start and when it changes (a clock sync, nightfall).
   */
  dayAt: number;
  /**
   * Unix ms of the second the current night began or (by day) the next one
   * begins (clock.ts `nightBeginsAt`); -1 below minute precision. Drives
   * the sunset over the 60 s before it. Sent like `dayAt` (a sync, daybreak).
   */
  nightAt: number;
  /**
   * Unix ms of the moon's next rise (gametime.ts `nextMoonEvent`; the
   * current minute when it rises now); -1 below minute precision. The sky
   * brings the moon in before it, so it is half inside the screen when the
   * game says it rises (owner item 63, ADR 0093). Sent at start, on a sync
   * and when it changes (after each rise).
   */
  moonRiseAt: number;
}

export const DEFAULT_STATE: Readonly<WeatherState> = {
  weather: null,
  fog: '',
  light: '',
  position: 'standing',
  clock: 'day',
  moonUp: false,
  moonPhase: 0.5,
  moonU: -1,
  sunU: -1,
  dayAt: -1,
  nightAt: -1,
  moonRiseAt: -1,
};

/** Momentary events (never dwelled). */
export type WeatherEvent =
  | 'sun.rise'
  | 'sun.light'
  | 'sun.set'
  | 'sun.dark'
  | 'moon.rise'
  | 'moon.set'
  | 'darkness.start'
  | 'darkness.grow'
  | 'darkness.shrink'
  | 'darkness.end-soon'
  | 'darkness.end'
  | 'strike'
  | 'gust'
  /** Dev / screenshots / the demo: a flock of birds, a sun glimpse, a shooting star, an insect now (the sky makes them on its own, rarely). */
  | 'birds'
  | 'glimpse'
  | 'shoot'
  | 'insect';

/** Options → Weather effects categories. Off fades the category out. */
export interface Categories {
  /** Sky gradient, clouds, sun moments, moon, stars. */
  sky: boolean;
  /** The blue day sky (part of `sky`); off: the page background by day, the night sky fades in from it (owner feedback 36). */
  daySky: boolean;
  /** Rain, drips, snow. */
  precipitation: boolean;
  /** The bolt on a 'strike' event. */
  lightning: boolean;
  fog: boolean;
  /** Event.Darkness: the red bleed when a darkness spell spreads, the lift when it fades. */
  darkness: boolean;
  /** Position effects (sleeping, stunned, incapacitated, dying). */
  body: boolean;
}

export const ALL_CATEGORIES: Readonly<Categories> = {
  sky: true,
  daySky: true,
  precipitation: true,
  lightning: true,
  fog: true,
  darkness: true,
  body: true,
};

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A pane's nameplate (ADR 0091 "Frames", addendum: glass rim and nameplate),
 * screen px: its body `[x, x + w]` from the rim's inner edge down to `y1`,
 * joined to the rim by fillets of radius `r` either side, its lower corners
 * rounded. The title lies on it and reaches up over the rim to `lip` px
 * below the frame box's top. It is the rim's glass: what lights the top rim
 * (glints, the sun's lift, lightning) lights the whole plate in its shape
 * (worker rimshape.ts; owner items 42, 49), only no sparkle over the title.
 */
export interface PanePlate {
  x: number;
  w: number;
  y1: number;
  lip: number;
  r: number;
}

/** A shown pane, in CSS px relative to the canvases. */
export interface PaneGeom extends Rect {
  /** `data-pane` (character, timers, group, comm, ui, map, script ids). */
  id: string;
  /** Frame rim thickness in px (0 without a frame). The rect is the frame box: x/y/w/h is the outer edge of the rim (the pane fill inside it, less the nameplate), or the whole pane unframed. A nameplate hangs from the top rim (`plate`). */
  border: number;
  /** The pane label. */
  label: string;
  /** A floating pane: above the game text, see-through to the back layer (what lies under it is clipped out, index.ts `floatHoles`). */
  floating: boolean;
  /** Stacking order of a floating pane (higher is in front); 0 for a docked one. */
  z: number;
  /** The pane's own background when it differs from the terminal's (painted under the back layer, inside the rim less the nameplate, less the floats above it). */
  bg: string | null;
  /** The rect of the whole pane element. */
  box: Rect;
  /** The nameplate hanging from the top rim (absent without a title). */
  plate?: PanePlate;
}

export interface Geometry {
  /** Canvas size in CSS px and the device pixel ratio used (≤ 2). */
  W: number;
  H: number;
  dpr: number;
  /** The game (output) pane. */
  out: Rect;
  panes: PaneGeom[];
  /** Masked area: solid from `solidTop` down, faded from `fadeTop`; the far left up to `left`. */
  protect: { solidTop: number; fadeTop: number; left: number };
  /** Cell width/height, font size and CSS font. */
  cell: { w: number; h: number; size: number; font: string };
}

export interface ThemeColors {
  /** Terminal background (hex). */
  bg: string;
  /** Terminal foreground (hex). */
  fg: string;
}

export type MainToWorker =
  | {
      t: 'init';
      back: OffscreenCanvas;
      front: OffscreenCanvas;
      geom: Geometry;
      theme: ThemeColors;
      cats: Categories;
      state: WeatherState;
      moonSpeed: number;
    }
  /** `instant`: settled and mixed at once (no dwell, no easing); `settle`: settled at once, eased as usual. */
  | { t: 'state'; s: Partial<WeatherState>; instant: boolean; settle?: boolean }
  | { t: 'event'; name: WeatherEvent; data?: unknown }
  | { t: 'geom'; g: Geometry }
  | { t: 'theme'; theme: ThemeColors }
  | { t: 'cats'; cats: Categories }
  | { t: 'visible'; on: boolean }
  /** The window has focus; without it the effects run at their slow rate. */
  | { t: 'focus'; on: boolean }
  | { t: 'moonSpeed'; speed: number }
  /** The demo's time scale (1 = the game's pace): see `Director.speed`. */
  | { t: 'speed'; speed: number }
  | { t: 'stats' };

export interface FrameStats {
  /** Frames measured (the last ≤ 600 drawn frames). */
  n: number;
  avg: number;
  p95: number;
  max: number;
  /** Average per module, ms. */
  mods: Record<string, number>;
  /** True while the loop idles (nothing to draw). */
  idle: boolean;
  /** Frames drawn since the engine started (fps = its change over time). */
  frames: number;
  /** The device pixel ratio the canvases are drawn at. */
  dpr: number;
  /**
   * Intervals between drawn frames since the previous `stats` call (ms): how
   * even the motion is (owner feedback 56). Idle ticks are not frames.
   */
  gaps: { n: number; p50: number; p95: number; max: number };
}

export type WorkerToMain =
  | { t: 'ready' }
  | { t: 'stats'; stats: FrameStats }
  | { t: 'error'; message: string };
