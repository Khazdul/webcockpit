// The start page sky's colour and light model (stage 41, ADR 0124): a
// pure function of game time, shared by the sky engine (what it paints),
// the wordmark (where its glint and inlay light come from), the quote and
// almanac (dark or pale text) and the first paint (the gradient for the
// current hour, before the engine loads). No DOM, no canvas reads.
//
// The smooth part of the sky is a stack of CSS gradients (`skyLayers`,
// `skyCss`): the base gradient and the horizon glow behind the sun, moon,
// stars and clouds ("back"), and the afterglow, twilight belt, haze band,
// the veil round a low sun or bright moon, the plain surface below the
// horizon, fog and the vignette in front of them ("air"). The engine
// paints exactly these strings; `skyColorAt` evaluates the same layers at
// a point, so the text colours follow what is on screen.
//
// Geometry: positions are fractions of the viewport (`view`, CSS px).
// The horizon line sits at 0.6 of the height on wide screens and eases
// to 0.655 on tall ones (aspect w/h from 0.85 down to 0.65). The sun and
// the moon share one path: it starts at x = -0.08 (just off-screen left)
// on the horizon, lifts slowly (a shallow start), and ends mirrored at
// x = 1.08. x depends only on the time; y also on the aspect (through the
// horizon line); a moon nudged away from the sun depends on the radii in
// px, so on the view as well.

import { DAWN, DAY_S, DUSK, MONTH_S } from '../../gmcp/clock';
import { type DayPeriod, type MoonPhase, type Season, moonAt, moonUpFraction, periodOf, seasonOf } from '../../gmcp/gametime';
import { type Rgb, type Stop, clamp, hex, lerp, luma, mix, mod, mul, over, ramp, rgba, sstep, stopAt, toHex } from './color';
import { type SkyWeather, type SkyWeatherState, skyWeatherAt } from './weather';

export type { SkyWeather, SkyWeatherState } from './weather';

/** The viewport the look is computed for, in CSS px. */
export interface SkyView {
  w: number;
  h: number;
}
/** The reference view when none is given (the owner's laptop). */
export const DEFAULT_VIEW: SkyView = { w: 1440, h: 900 };

export interface SkyLight {
  /** The light the wordmark reflects: the sun by day, the moon at night, none when both are down. */
  kind: 'sun' | 'moon' | 'none';
  /**
   * Its drawn position as a fraction of the viewport (0..1; < 0 or > 1
   * just off-screen). x: -0.08 at rise … 1.08 at set, by time only. y:
   * from the horizon line (0.6 wide … 0.655 tall screens) up to about
   * 0.06 at a summer noon. For `none`, the sun's position.
   */
  x: number;
  y: number;
  /** 0 (no light) .. 1 (a low or high clear sun). The full moon on a clear night tops out at 0.85; clouds dim both. */
  strength: number;
  /** Its colour (CSS hex): warm white, orange when the sun is low, cool blue-white for the moon. */
  color: string;
}

export interface SkyBody {
  /** Viewport fractions (see SkyLight). */
  x: number;
  y: number;
  /** Radius in CSS px. */
  r: number;
  /** Painted at all (above the horizon, and for the moon: visible). */
  drawn: boolean;
}

export interface SkyMoonBody extends SkyBody {
  phase: MoonPhase;
  /** 0 new … 12 full. */
  level: number;
  waxing: boolean;
  /** Moved away from the sun so the two never overlap. */
  nudged: boolean;
}

export interface SkyLook {
  period: DayPeriod;
  season: Season;
  /** 0 = deep night .. 1 = full day, smooth through dawn and dusk (the inlay blends day → night metal by it). */
  dayness: number;
  /** Gradient stops (CSS hex): zenith, middle, at the horizon, and the plain surface below it. */
  top: string;
  mid: string;
  horizon: string;
  below: string;
  /**
   * Luma (Rec. 709 on the gamma-encoded colour, 0..1, what a pixel read
   * of the screen would give) of the sky behind the quote (centre, 80 %
   * down). > ~0.5 wants dark iron-brown text; use a hysteresis such as
   * dark above 0.54, pale below 0.46 (the approved mockup's values).
   * `textBack` has the quote and the almanac apart; `skyLumaAt` any point.
   */
  textBackLuminance: number;
  textBack: { quote: number; almanac: number };
  light: SkyLight;

  /** Game minute this look is for. */
  g: number;
  /** 0–11 and the hour as a fraction (13.5 = 1:30pm). */
  month: number;
  hour: number;
  /** Sun elevation: −1 deep night … 0 on the horizon … up to 1 at a summer noon. */
  elevation: number;
  /** The horizon line as a fraction of the viewport height. */
  horizonY: number;
  view: SkyView;
  weather: SkyWeather;
  sun: SkyBody;
  moon: SkyMoonBody;
}

/** What the engine needs beyond the public look (colours as numbers, blend factors). */
export interface SkyScene extends SkyLook {
  paint: ScenePaint;
}

export interface ScenePaint {
  top: Rgb;
  mid: Rgb;
  hor: Rgb;
  /** The plain surface below the horizon: its colour right at the line, and further down. */
  line: Rgb;
  body: Rgb;
  daylight: number;
  /** 0 by day … 1 at deep night (star visibility). */
  dark: number;
  /** Peaks around sunrise (fog, haze). */
  dawn: number;
  light: Rgb;
  lightI: number;
  sunI: number;
  moonI: number;
  /** The sun's colour and how low it is (0 high … 1 at the horizon). */
  sunColor: Rgb;
  sunLow: number;
  /** Horizon glow (back), afterglow (air), twilight belt. */
  glow: number;
  afterglow: number;
  belt: number;
  /** Haze band: colour and the alpha it reaches at the line. */
  haze: Rgb;
  hazeK: number;
}

export interface SkyLookOptions {
  /** The viewport (default DEFAULT_VIEW). */
  view?: SkyView;
  /** Pins the weather (dev, tests); default: the director. */
  weather?: SkyWeatherState | null;
}

// ------------------------------------------------------------------ model

const SKY_RAMP: readonly (readonly [number, readonly [Rgb, Rgb, Rgb]])[] = (
  [
    [-1.0, ['#020309', '#050816', '#0a1022']],
    [-0.5, ['#03050f', '#0a0f24', '#1a1c36']],
    [-0.2, ['#0b1130', '#2a2650', '#6b3a4a']],
    [-0.04, ['#1b2550', '#5a3e66', '#e0703c']],
    [0.06, ['#2b4579', '#8f6a83', '#ffaa5a']],
    [0.2, ['#3a64a0', '#8fa4c4', '#ffd2a0']],
    [0.42, ['#3a70b6', '#7eaad6', '#d6e4ec']],
    [1.0, ['#2a62ae', '#6a9fd6', '#bfd8ec']],
  ] as const
).map(([x, cs]) => [x, [hex(cs[0]), hex(cs[1]), hex(cs[2])]] as const);
const RAMPS = [0, 1, 2].map((k) => SKY_RAMP.map(([x, cs]) => [x, cs[k]!] as const));

const ARC_X0 = -0.08;
const ARC_X1 = 1.08;
const ARC_P = 1.35;
const arcX = (f: number): number => lerp(ARC_X0, ARC_X1, f);
const arcLift = (f: number): number => Math.sin(Math.PI * clamp(f)) ** ARC_P;

/** The horizon line (fraction of the height) for a view. */
export const horizonOf = (view: SkyView): number => 0.6 + 0.055 * sstep(0.85, 0.65, view.w / view.h);

const SUN_HI = hex('#fff1d6');
const SUN_LO = hex('#ff9a48');
const MOON_LIGHT = hex('#b9c8f2');
const WHITE: Rgb = [255, 255, 255];

/** The sky at game minute `g` (all of it: the engine paints from this object). */
export function skySceneAt(g: number, opts: SkyLookOptions = {}): SkyScene {
  const view = opts.view ?? DEFAULT_VIEW;
  const W = view.w;
  const H = view.h;
  const month = mod(Math.floor(g / MONTH_S), 12);
  const hour = mod(g, DAY_S) / 60;
  const season = seasonOf(month);
  const period = periodOf(month, Math.floor(hour));
  const rise = DAWN[month]!;
  const set = DUSK[month]! + 1;
  // --- sun elevation
  const tt = (hour - rise) / (set - rise);
  const summer = 1 - Math.abs(month - 6.5) / 6;
  const maxAlt = 0.5 + 0.5 * summer;
  let e: number;
  if (tt >= 0 && tt <= 1) e = Math.sin(Math.PI * tt) * maxAlt;
  else {
    const d = hour < rise ? Math.min(rise - hour, hour + 24 - set) : Math.min(hour - set, rise + 24 - hour);
    e = -Math.min(1, d / 2.4);
  }
  const daylight = sstep(-0.22, 0.2, e);
  const dark = 1 - sstep(-0.45, -0.05, e);
  const dawn = 1 - sstep(0.5, 1.8, Math.abs(hour - rise - 0.4));
  const wx = skyWeatherAt(g, opts.weather);
  // --- the path: horizon line, arcs scaled to the sky above it
  const hy = horizonOf(view);
  const span = hy - 0.05;
  const tc = clamp(tt, -0.08, 1.08);
  const minWH = Math.min(W, H);
  const sunUp = tt > -0.02 && tt < 1.02;
  const sun: SkyBody = {
    x: arcX(tc),
    y: hy - arcLift(tt) * (0.55 + 0.45 * maxAlt) * span + (tt < 0 || tt > 1 ? 0.08 : 0),
    r: Math.max(21, minWH * 0.04),
    drawn: sunUp && e > -0.08,
  };
  // --- the moon: gametime's model (phase, rise and set)
  const mm = moonAt(g);
  const frac = moonUpFraction(g);
  const up = frac >= 0;
  const visible = up && mm.level > 0 && (mm.level > 4 || e < -0.05);
  const moon: SkyMoonBody = {
    x: arcX(up ? frac : 0),
    y: hy - arcLift(up ? frac : 0) * span * 0.95,
    r: Math.max(9, minWH * 0.018),
    drawn: visible,
    phase: mm.phase,
    level: mm.level,
    waxing: mm.waxing,
    nudged: false,
  };
  // never in the same spot: nudge the moon's drawn position away from the sun (in px)
  if (sun.drawn && moon.drawn) {
    const minD = sun.r * 3.6 + moon.r * 2;
    let dx = (moon.x - sun.x) * W;
    let dy = (moon.y - sun.y) * H;
    let d = Math.hypot(dx, dy);
    if (d < minD) {
      if (d < 1e-3) {
        dx = frac < 0.5 ? -1 : 1;
        dy = -0.35;
        d = Math.hypot(dx, dy);
      }
      let mx = sun.x * W + (dx / d) * minD;
      let my = sun.y * H + (dy / d) * minD;
      const maxY = hy * H - moon.r * 3;
      if (my > maxY) {
        my = maxY;
        const ry = my - sun.y * H;
        mx = sun.x * W + (dx >= 0 ? 1 : -1) * Math.sqrt(Math.max(0, minD * minD - ry * ry));
      }
      moon.x = mx / W;
      moon.y = my / H;
      moon.nudged = true;
    }
  }
  // --- the dominant light
  const moonI = (visible ? 1 : 0) * (mm.level / 12) * (1 - sstep(-0.18, 0.02, e)) * (1 - 0.75 * wx.cloud);
  const sunI = sstep(-0.1, 0.04, e) * (1 - 0.8 * wx.cloud);
  const sunLow = 1 - sstep(0.05, 0.35, e);
  const sunColor = mix(hex('#fff2d8'), hex('#ff9440'), sunLow);
  let lightRgb: Rgb;
  let lightI: number;
  let kind: SkyLight['kind'];
  let lx = sun.x;
  let ly = sun.y;
  if (sunI >= moonI * 0.8) {
    lightI = sunI * (0.75 + 0.45 * sunLow);
    lightRgb = mix(SUN_HI, SUN_LO, sunLow);
    kind = 'sun';
  } else {
    lightI = moonI * 0.85;
    lightRgb = MOON_LIGHT;
    kind = 'moon';
    lx = moon.x;
    ly = moon.y;
  }
  if (lightI < 0.02) kind = 'none';
  // --- sky colours (weather greys them)
  let top = ramp(RAMPS[0]!, e);
  let mid = ramp(RAMPS[1]!, e);
  let hor = ramp(RAMPS[2]!, e);
  const grey = mix(hex('#07090d'), hex('#7c838c'), daylight);
  const greyH = mix(hex('#0d1016'), hex('#9ba3ab'), daylight);
  const cv = wx.cloud * 0.85 + wx.storm * 0.1;
  top = mix(top, mul(grey, 0.7 - 0.25 * wx.storm), cv * 0.9);
  mid = mix(mid, grey, cv * 0.85);
  hor = mix(hor, greyH, cv * 0.8);
  if (wx.fog > 0.3) {
    const f = (wx.fog - 0.3) * 0.6;
    mid = mix(mid, hor, f);
    top = mix(top, mid, f * 0.6);
  }
  // --- the air low in the sky
  const clear = 1 - wx.cloud * 0.7;
  const glow = (1 - sstep(0.05, 0.3, Math.abs(e))) * clear;
  const afterglow = (1 - sstep(0.02, 0.35, Math.abs(e + 0.03))) * clear;
  const belt = (1 - sstep(0, 0.16, Math.abs(e + 0.05))) * clear;
  const night = moonI * (1 - daylight);
  const hazeK = clamp(0.4 + 0.45 * wx.fog + 0.25 * dawn + 0.15 * wx.rain + 0.1 * wx.snow + 0.2 * night + 0.15 * afterglow);
  const haze = mix(mix(hor, mid, 0.35), mix(lightRgb, [30, 38, 62], 0.72), clamp(night * 1.2));
  // the sky's colour right at the line (base gradient, the belt's foot, the haze), then the plain surface
  let line = baseAt(top, mid, hor, hy / (hy + 0.1));
  line = mix(line, [70, 80, 130], 0.22 * belt);
  line = mix(line, haze, hazeK * 0.55);
  const body = mul(mix(top, mid, 0.45), lerp(0.6, 1, daylight));

  const scene: SkyScene = {
    period,
    season,
    dayness: daylight,
    top: toHex(top),
    mid: toHex(mid),
    horizon: toHex(hor),
    below: toHex(body),
    textBackLuminance: 0,
    textBack: { quote: 0, almanac: 0 },
    light: { kind, x: lx, y: ly, strength: clamp(lightI), color: toHex(lightRgb) },
    g,
    month,
    hour,
    elevation: e,
    horizonY: hy,
    view,
    weather: wx,
    sun,
    moon,
    paint: {
      top,
      mid,
      hor,
      line,
      body,
      daylight,
      dark,
      dawn,
      light: lightRgb,
      lightI,
      sunI,
      moonI,
      sunColor,
      sunLow,
      glow,
      afterglow,
      belt,
      haze,
      hazeK,
    },
  };
  const quote = skyLumaAt(scene, 0.5, 0.8);
  scene.textBack = { quote, almanac: skyLumaAt(scene, 0.9, 0.95) };
  scene.textBackLuminance = quote;
  return scene;
}

/** The sky at game minute `g` (the public view of `skySceneAt`). */
export function skyLookAt(g: number, opts: SkyLookOptions = {}): SkyLook {
  return skySceneAt(g, opts);
}

/** The base gradient (zenith → middle at 55 % → horizon colour) at fraction `f` of its length. */
function baseAt(top: Rgb, mid: Rgb, hor: Rgb, f: number): Rgb {
  return f <= 0.55 ? mix(top, mid, clamp(f / 0.55)) : mix(mid, hor, clamp((f - 0.55) / 0.45));
}

// ----------------------------------------------------------------- layers

/** One gradient of the smooth sky, in CSS px of the view. */
export type SkyLayer =
  /** Vertical, from y0 to y1; `band`: nothing below y1 (else the end colour continues). */
  | { kind: 'linear'; y0: number; y1: number; stops: Stop[]; band?: boolean }
  /** Circle (rx = ry) or ellipse round (cx, cy); stops over the radius. */
  | { kind: 'radial'; cx: number; cy: number; rx: number; ry: number; stops: Stop[] };

const st = (at: number, c: Rgb, a: number): Stop => ({ at, c, a: clamp(a) });
const BLACK: Rgb = [0, 0, 0];

/** The smooth layers, bottom first: `back` (under sun, moon, stars, clouds) and `air` (over them). */
export function skyLayers(s: SkyScene): { back: SkyLayer[]; air: SkyLayer[] } {
  const { w: W, h: H } = s.view;
  const p = s.paint;
  const hy = s.horizonY * H;
  const sunX = s.sun.x * W;
  const back: SkyLayer[] = [
    { kind: 'linear', y0: 0, y1: hy + H * 0.1, stops: [st(0, p.top, 1), st(0.55, p.mid, 1), st(1, p.hor, 1)] },
  ];
  if (p.glow > 0.01) {
    back.push({
      kind: 'radial', cx: sunX, cy: hy, rx: W * 0.55, ry: W * 0.55,
      stops: [st(0, [255, 150, 70], 0.5 * p.glow), st(0.4, [255, 110, 60], 0.16 * p.glow), st(1, [255, 110, 60], 0)],
    });
  }
  const air: SkyLayer[] = [];
  if (p.afterglow > 0.01) {
    const k = p.afterglow;
    air.push({
      kind: 'radial', cx: sunX, cy: hy, rx: W * 0.8, ry: W * 0.8,
      stops: [st(0, [255, 170, 110], 0.22 * k), st(0.35, [240, 140, 120], 0.1 * k), st(1, [200, 120, 140], 0)],
    });
  }
  if (p.belt > 0.01) {
    const k = p.belt;
    air.push({
      kind: 'linear', y0: hy - H * 0.2, y1: hy, band: true,
      stops: [st(0, [236, 150, 170], 0), st(0.45, [236, 160, 175], 0.2 * k), st(0.78, [150, 130, 170], 0.14 * k), st(1, [70, 80, 130], 0.22 * k)],
    });
  }
  air.push({
    kind: 'linear', y0: hy - H * 0.09, y1: hy, band: true,
    stops: [st(0, p.haze, 0), st(0.7, p.haze, p.hazeK * 0.32), st(1, p.haze, p.hazeK * 0.55)],
  });
  // the veil round a low sun or a bright moon
  const low = 1 - sstep(0.08, 0.45, s.elevation);
  const va = s.light.kind === 'sun' ? 0.2 * p.lightI * low : s.light.kind === 'moon' ? 0.1 * p.lightI : 0;
  if (va > 0.01) {
    const rad = Math.max(W, H) * 0.6;
    air.push({
      kind: 'radial', cx: s.light.x * W, cy: Math.min(s.light.y * H, hy), rx: rad, ry: rad,
      stops: [st(0, mix(p.light, WHITE, 0.3), va), st(0.4, p.light, va * 0.35), st(1, p.light, 0)],
    });
  }
  // below the line: the plain surface, faded in over a band straddling it (no seam)
  {
    const fade = H * 0.035;
    const y0 = hy - fade;
    const span = H - y0;
    const at = (y: number): number => clamp((y - y0) / span);
    const stops: Stop[] = [st(0, p.line, 0), st(at(hy - fade * 0.45), p.line, 0.6), st(at(hy + fade * 0.3), p.line, 1)];
    const ease = H - hy;
    for (let i = 1; i <= 4; i++) {
      const k = i / 4;
      stops.push(st(at(hy + fade * 0.3 + ease * 0.5 * k), mix(p.line, p.body, sstep(0, 1, k)), 1));
    }
    stops.push(st(1, mul(p.body, 0.92), 1));
    air.push({ kind: 'linear', y0, y1: H, stops });
  }
  if (s.weather.fog > 0.05) {
    const fc = mix(p.hor, p.mid, 0.3);
    const f = s.weather.fog;
    air.push({ kind: 'linear', y0: H * 0.4, y1: H, stops: [st(0, fc, 0), st(0.6, fc, f * 0.3), st(1, fc, f * 0.4)] });
  }
  // the vignette: darker corners, a little shade at the top
  air.push({ kind: 'radial', cx: W * 0.5, cy: H * 0.42, rx: W * 1.3, ry: H * 0.95, stops: [st(0.52, BLACK, 0), st(1, BLACK, 0.55)] });
  air.push({ kind: 'linear', y0: 0, y1: H * 0.18, stops: [st(0, BLACK, 0.22), st(1, BLACK, 0)] });
  return { back, air };
}

const px = (v: number): string => `${+v.toFixed(1)}px`;
const pct = (v: number): string => `${+(v * 100).toFixed(2)}%`;

function layerCss(l: SkyLayer): string {
  if (l.kind === 'linear') {
    const len = l.y1 - l.y0;
    const parts = l.stops.map((s) => `${rgba(s.c, s.a)} ${px(l.y0 + s.at * len)}`);
    if (l.band) {
      const last = l.stops[l.stops.length - 1]!;
      parts.push(`${rgba(last.c, 0)} ${px(l.y1)}`);
    }
    return `linear-gradient(180deg,${parts.join(',')})`;
  }
  const shape = l.rx === l.ry ? `circle ${px(l.rx)}` : `${px(l.rx)} ${px(l.ry)}`;
  return `radial-gradient(${shape} at ${px(l.cx)} ${px(l.cy)},${l.stops.map((s) => `${rgba(s.c, s.a)} ${pct(s.at)}`).join(',')})`;
}

/** A layer list as a CSS `background` value (the list is bottom first; CSS lists top first). */
export function layersCss(layers: readonly SkyLayer[]): string {
  return layers.map(layerCss).reverse().join(',');
}

/**
 * The smooth sky as CSS backgrounds for an element covering the view:
 * `back` and `air` as the engine paints them around its canvases, and
 * `all` (air over back) for the first paint, which has no canvases. Px
 * values are for `look.view`: compute the look with the real viewport.
 */
export function skyCss(look: SkyLook): { back: string; air: string; all: string } {
  const { back, air } = skyLayers(look as SkyScene);
  const b = layersCss(back);
  const a = layersCss(air);
  return { back: b, air: a, all: `${a},${b}` };
}

function layerAt(l: SkyLayer, x: number, y: number): { c: Rgb; a: number } | null {
  if (l.kind === 'linear') {
    if (l.band && y > l.y1) return null;
    return stopAt(l.stops, (y - l.y0) / (l.y1 - l.y0));
  }
  return stopAt(l.stops, Math.hypot((x - l.cx) / l.rx, (y - l.cy) / l.ry));
}

/**
 * The smooth sky's colour at (xf, yf) (viewport fractions): what is on
 * screen where no star, cloud, sun, moon or snow is. `backOnly`: the
 * back layers alone (what the sun and moon are painted over).
 */
export function skyColorAt(look: SkyLook, xf: number, yf: number, backOnly = false): Rgb {
  const { back, air } = skyLayers(look as SkyScene);
  const x = xf * look.view.w;
  const y = yf * look.view.h;
  let c: Rgb = BLACK;
  for (const l of backOnly ? back : [...back, ...air]) {
    const v = layerAt(l, x, y);
    if (v) c = over(c, v.c, v.a);
  }
  return c;
}

/** The luma (see `SkyLook.textBackLuminance`) of the sky at (xf, yf). */
export const skyLumaAt = (look: SkyLook, xf: number, yf: number): number => luma(skyColorAt(look, xf, yf));
