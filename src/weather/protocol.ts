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
  /** `Char.Vitals.light`: only 'o' (darkness) matters for the sky; '!' tints. */
  light: string;
  /** standing, resting, sleeping, stunned, incapacitated, dying, … */
  position: string;
  /** The latest `Event.Sun`: 'day' after rise/light, 'night' after set/dark. */
  clock: 'day' | 'night';
  /** The latest `Event.Moon`. */
  moonUp: boolean;
  /** Illuminated fraction of the moon, 0..1 (from the almanac). */
  moonPhase: number;
}

export const DEFAULT_STATE: Readonly<WeatherState> = {
  weather: null,
  fog: '',
  light: '',
  position: 'standing',
  clock: 'day',
  moonUp: false,
  moonPhase: 0.5,
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
  | 'gust';

/** Options → Weather effects categories. Off fades the category out. */
export interface Categories {
  /** Sky gradient, clouds, sun moments, moon, stars. */
  sky: boolean;
  /** Rain, drips, snow. */
  precipitation: boolean;
  /** The bolt on a 'strike' event. */
  lightning: boolean;
  fog: boolean;
  /** The darkness sky (light 'o') and Event.Darkness. */
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
  /** Frame line thickness in px (0 without a frame). The rect is the frame box (the pane fill), or the whole pane unframed. */
  border: number;
  /** The pane label (its width keeps snow off the title). */
  label: string;
  /** A floating pane: above the game text; the worker paints its fill on the mid layer. */
  floating: boolean;
  /** Stacking order of a floating pane (higher is in front); 0 for a docked one. */
  z: number;
  /** The pane's own background when it differs from the terminal's (painted under the back layer, in the rect). */
  bg: string | null;
  /** The rect of the whole pane element. */
  box: Rect;
  /** The label's gap in the top frame line, [x0, x1] (CSS px); null without a label. */
  tab: [number, number] | null;
}

export interface Geometry {
  /**
   * Layout sequence number (main thread): the worker answers `painted` with
   * it once a frame with this layout is on screen, and floating panes go
   * see-through only then (the mid layer covers the text under them).
   */
  seq: number;
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
      /** Under the floating panes, above the game text: their fill plus a copy of the back layer. */
      mid: OffscreenCanvas;
      front: OffscreenCanvas;
      geom: Geometry;
      theme: ThemeColors;
      cats: Categories;
      state: WeatherState;
      moonSpeed: number;
    }
  | { t: 'state'; s: Partial<WeatherState>; instant: boolean }
  | { t: 'event'; name: WeatherEvent; data?: unknown }
  | { t: 'geom'; g: Geometry }
  | { t: 'theme'; theme: ThemeColors }
  | { t: 'cats'; cats: Categories }
  | { t: 'visible'; on: boolean }
  /** The window has focus; without it the effects run at their slow rate. */
  | { t: 'focus'; on: boolean }
  | { t: 'moonSpeed'; speed: number }
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
  | { t: 'error'; message: string }
  /** A frame drawn with layout `seq` is on screen (the mid layer covers the floating panes). */
  | { t: 'painted'; seq: number };
