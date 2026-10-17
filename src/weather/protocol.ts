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
  /** The latest `Event.Sun`: 'day' after rise/light, 'night' after set/dark. */
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

/** A shown pane, in CSS px relative to the canvases. */
export interface PaneGeom extends Rect {
  /** `data-pane` (character, timers, group, comm, ui, map, script ids). */
  id: string;
  /** Frame line thickness in px (0 without a frame). The rect is the frame box: x/y/w/h is the outer edge of the line (the pane fill inside it, from the top line's inner edge down), or the whole pane unframed. The top line has a gap for the title (`gap`). */
  border: number;
  /** The pane label. */
  label: string;
  /** A floating pane: above the game text; the worker copies the weather into its own canvas (`float`). */
  floating: boolean;
  /** Stacking order of a floating pane (higher is in front); 0 for a docked one. */
  z: number;
  /** The pane's own background when it differs from the terminal's (painted under the back layer, in the rect below the top line). */
  bg: string | null;
  /** The rect of the whole pane element. */
  box: Rect;
  /**
   * The stretch of the top line left out for the title (absent without one):
   * `[x, x + w]` along the top, screen px. There is no line there; nothing
   * may light it (glints, rims), or a band shows through the title.
   */
  gap?: { x: number; w: number };
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
  /**
   * A floating pane's own canvas (its first child, the size of the pane):
   * the worker copies the back layer's pixels under the pane into it, so the
   * see-through pane shows the weather (ADR 0091 "Engine", owner feedback
   * 13, 18). `key` names it; `pane` is its `PaneGeom.id`.
   */
  | { t: 'float'; key: number; pane: string; canvas: OffscreenCanvas }
  | { t: 'floatGone'; key: number }
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
}

export type WorkerToMain =
  | { t: 'ready' }
  | { t: 'stats'; stats: FrameStats }
  | { t: 'error'; message: string };
