// The weather demo's script (owner feedback 33, ADR 0091 "Demo"): every
// effect in one sequence, night → sunrise → day → indoors → body → sunset →
// night, then back to the game. Pure data and timing: no DOM, no engine;
// demo.ts plays it and tests/unit/weather-demo.test.ts checks it.
//
// Each step drives the engine with the same inputs the game does: pinned
// state (`WeatherState`, settled at once but eased as usual) and events.
// Everything runs at the game's own pace (owner item 70: the old 3× demo
// felt fast-forwarded): the demo shows a part of each slow process (the last
// 30 s of a sunrise or sunset, enough of a build-up to read it) instead of
// speeding it up. Times are seconds; 3:00 in all.

import type { WeatherEvent, WeatherState } from './protocol';
import { TURN_FULL } from './sunturn';

export type DemoAction =
  /** Pins these values (merged with the earlier pins); `instant` jumps without easing (the start only). */
  | { pin: Partial<WeatherState>; instant?: true }
  /** `data`: as the engine takes it (`sun.rise` `{ from }`: where the sunrise starts, s before the day). */
  | { emit: WeatherEvent; data?: unknown }
  /** Unpins everything: the game's values again, with the normal transitions. */
  | { release: true }
  /**
   * A sunrise or sunset by the clock, as in the game (owner item 74): pins
   * `dayAt` / `nightAt` to `in` seconds from now (the runner's clock), so the
   * director runs it exactly as a live one; the caption counts to that second.
   */
  | { turn: 'rise' | 'set'; in: number };

export interface DemoStep {
  /** The caption's step line, e.g. "Day · heavy rain". */
  title: string;
  /** What to look at, one short line. */
  look: string;
  /** The signal that drives it in the real game ('' for none). */
  signal: string;
  /** Seconds. */
  dur: number;
  /** [seconds into the step, action]. */
  acts: ReadonlyArray<readonly [number, DemoAction]>;
}

const pin = (p: Partial<WeatherState>): DemoAction => ({ pin: p });
/** The first pin of a demo: outdoors, a clear sky, standing, no clock-driven turn or moon of the game's. */
const SCENE: Partial<WeatherState> = { weather: ' ', fog: '', light: '', position: 'standing', dayAt: -1, nightAt: -1, moonRiseAt: -1, moonSetAt: -1 };
const emit = (e: WeatherEvent, data?: unknown): DemoAction => (data === undefined ? { emit: e } : { emit: e, data });
/** Where the demo's sunrise and sunset start, s before the day or night begins: their last 30 s, the new sky coming as the rays fade (ADR 0093). */
export const DEMO_TURN_FROM = -30;

export const DEMO_STEPS: readonly DemoStep[] = [
  {
    title: 'Night · moon and stars',
    look: 'a big moon in its phase, the starry sky, a shooting star that makes the frame lines it passes glint',
    signal: 'Event.Sun dark · Event.Moon rise · the almanac',
    dur: 4,
    acts: [
      [0, { pin: { ...SCENE, clock: 'night', moonUp: true, moonPhase: 0.8, moonU: 0.42 }, instant: true }],
      [1.5, emit('shoot')],
    ],
  },
  {
    title: 'Sunrise',
    look: 'the last 30 seconds of the night: faint rays and beams from the sun low at the right, the frame lines glinting where they cross; the blue sky fades in as the rays fade, all gone when the day begins',
    signal: 'the clock: the last game hour of the night (Event.Sun rise when it is not synced)',
    dur: -DEMO_TURN_FROM,
    acts: [[0, emit('sun.rise', { from: DEMO_TURN_FROM })]],
  },
  {
    title: 'The day begins',
    look: 'the clear blue sky, complete at the day\'s first second; birds',
    signal: 'Event.Sun light',
    dur: 6,
    acts: [
      // the day begins (Event.Sun light); the day sky is complete then (TURN_FULL.rise)
      [0, pin({ clock: 'day', sunU: 0.15 })],
      [2, emit('birds')],
    ],
  },
  {
    title: 'Day · clear sky',
    look: 'a soft sun glow, the pale moon, the morning sun\'s rays pulsing very faintly, an insect',
    signal: "Char.Vitals weather = ' '",
    dur: 8,
    acts: [
      [0, emit('glimpse')],
      [3, emit('insect')],
    ],
  },
  {
    title: 'Day · clouds roll in',
    look: 'the clouds come one by one from the right, where the wind brings them',
    signal: "Char.Vitals weather = '~'",
    dur: 12,
    acts: [[0, pin({ weather: '~', moonUp: false, moonU: -1 })]],
  },
  {
    title: 'Day · light rain',
    look: 'thin rain sets in and the sky turns grey',
    signal: `Char.Vitals weather = "'"`,
    dur: 5,
    acts: [[0, pin({ weather: "'" })]],
  },
  {
    title: 'Day · heavy rain',
    look: 'denser rain; drips run along the pane edges',
    signal: `Char.Vitals weather = '"'`,
    dur: 4,
    acts: [[0, pin({ weather: '"' })]],
  },
  {
    title: 'Lightning',
    look: 'a bolt strikes and every frame line lights up',
    signal: 'a lightning line in the room text',
    dur: 4,
    acts: [
      [0.4, emit('strike')],
      [2, emit('strike')],
      [3.4, emit('strike')],
    ],
  },
  {
    title: 'Snow and a gust',
    look: 'snow falls in from above and slowly builds up; a gust swirls it',
    signal: "Char.Vitals weather = '*' · a wind line",
    dur: 12,
    acts: [
      [0, pin({ weather: '*' })],
      [8, emit('gust')],
    ],
  },
  {
    title: 'Fog',
    look: 'fog drifts in low over the screen and slowly thickens',
    signal: "Char.Vitals fog = '-', then '='",
    dur: 12,
    acts: [
      [0, pin({ weather: ' ', fog: '-' })],
      [6, pin({ fog: '=' })],
    ],
  },
  {
    title: 'Indoors',
    look: 'the whole sky fades out evenly; the fog thins away',
    signal: 'Char.Vitals weather = null (indoors)',
    dur: 6,
    acts: [[0, pin({ weather: null, fog: '' })]],
  },
  {
    title: 'Outdoors again',
    look: 'the sky fades back in as it was',
    signal: "Char.Vitals weather = ' '",
    dur: 4,
    acts: [[0, pin({ weather: ' ' })]],
  },
  {
    title: 'Sleeping',
    look: 'z z Z floats up',
    signal: 'Char.Vitals position = sleeping',
    dur: 4,
    acts: [[0, pin({ position: 'sleeping' })]],
  },
  {
    title: 'Stunned',
    look: 'the screen jolts',
    signal: 'Char.Vitals position = stunned',
    dur: 3,
    acts: [[0, pin({ position: 'stunned' })]],
  },
  {
    title: 'Incapacitated, then dying',
    look: 'blood at the edges and a red heartbeat wash',
    signal: 'Char.Vitals position = incapacitated, dying',
    dur: 5,
    acts: [
      [0, pin({ position: 'incapacitated' })],
      [2.5, pin({ position: 'dying' })],
    ],
  },
  {
    title: 'On your feet again',
    look: 'the blood darkens, dries and fades',
    signal: 'Char.Vitals position = standing',
    dur: 8,
    acts: [[0, pin({ position: 'standing', sunU: 0.9 })]],
  },
  {
    title: 'Sunset',
    look: 'the last 30 seconds of the day: the blue gone into a warm dusk, faint rays and beams from the sun sinking at the left, glints again; the sun, its last rays and their glints fade out as the night begins, the first stars just before',
    signal: 'the clock: the last game hour of the day (Event.Sun set when it is not synced)',
    dur: -DEMO_TURN_FROM,
    acts: [[0, emit('sun.set', { from: DEMO_TURN_FROM })]],
  },
  {
    title: 'Night · rain and lightning',
    look: 'the stars come out; rain in the dark, and the bolt lights the night sky',
    signal: `Event.Sun dark · Char.Vitals weather = '"' · a lightning line`,
    dur: 8,
    acts: [
      // the night begins (Event.Sun dark); its stars are complete TURN_FULL.set later
      [0, pin({ clock: 'night', weather: '"' })],
      [3.5, emit('strike')],
      [6.2, emit('strike')],
    ],
  },
  {
    title: 'Darkness spreads',
    look: 'a short red bleed from the top and the corners',
    signal: 'Event.Darkness start',
    dur: 5,
    acts: [
      [0, pin({ weather: ' ' })],
      [0.3, emit('darkness.start')],
    ],
  },
  {
    title: 'Darkness lifts',
    look: 'a brief lightening',
    signal: 'Event.Darkness end',
    dur: 3,
    acts: [[0, emit('darkness.end')]],
  },
  {
    title: 'Back to the game',
    look: "the effects follow the game's values again, with the normal transitions",
    signal: '',
    dur: 3,
    acts: [[0, { release: true }]],
  },
];

/** How long before the turn's second the clock is set in the one-turn demos: the night or day first, then the full minute. */
const TURN_LEAD = 5;

/**
 * `#weather demo sunrise` (owner item 74): a moonless starry night, then a
 * whole sunrise at the game's pace exactly as a live one (the clock's
 * minute before the day, complete at the day's first second), then the day
 * with its rays pulsing, then back to the game.
 */
export const SUNRISE_STEPS: readonly DemoStep[] = [
  {
    title: 'Night · before the sunrise',
    look: 'a clear starry night without a moon; the clock says the day begins in a minute and five seconds',
    signal: "Event.Sun dark · Char.Vitals weather = ' '",
    dur: TURN_LEAD,
    acts: [
      [0, { pin: { ...SCENE, clock: 'night', moonUp: false, moonU: -1, moonPhase: 0.5, sunU: -1 }, instant: true }],
      [0, { turn: 'rise', in: 60 + TURN_LEAD }],
    ],
  },
  {
    title: 'Sunrise · the first light',
    look: 'the sun\'s hazy light grows slowly at the right, its faint rays with it, from level to steeply down, the frame lines glinting more and more; the stars fade, half gone 10 seconds in, barely there after 30',
    signal: 'the clock: the last game hour of the night ("The light slowly increases in the east.")',
    dur: 30,
    acts: [],
  },
  {
    title: 'Sunrise · the blue sky',
    look: 'the blue sky fades in; the rays and the faint beams climb and fade softly, the frame lines glinting where they cross; at the day\'s first second the sky is blue and the sun gone',
    signal: 'the clock: the last game hour of the night',
    dur: 30,
    acts: [],
  },
  {
    title: 'The day begins',
    look: 'the clear blue sky; the morning sun\'s rays pulse very faintly, about every 20 seconds',
    signal: 'Event.Sun light ("The day has begun.")',
    dur: Math.max(TURN_FULL.rise, 12),
    acts: [
      [0, pin({ clock: 'day', sunU: 0 })],
      [0.5, emit('glimpse')],
    ],
  },
  {
    title: 'Back to the game',
    look: "the effects follow the game's values again, with the normal transitions",
    signal: '',
    dur: 3,
    acts: [[0, { release: true }]],
  },
];

/** `#weather demo sunset` (owner item 74): the mirror of SUNRISE_STEPS, from a clear day to the starry night. */
export const SUNSET_STEPS: readonly DemoStep[] = [
  {
    title: 'Day · before the sunset',
    look: 'a clear day sky late in the day; the clock says the night begins in a minute and five seconds',
    signal: "Event.Sun light · Char.Vitals weather = ' '",
    dur: TURN_LEAD,
    acts: [
      [0, { pin: { ...SCENE, clock: 'day', moonUp: false, moonU: -1, moonPhase: 0.5, sunU: 0.93 }, instant: true }],
      [0, { turn: 'set', in: 60 + TURN_LEAD }],
    ],
  },
  {
    title: 'Sunset · the first rays',
    look: 'a few faint rays from the sun 40° up at the left, then more, one by one, from level to nearly straight down; from 10 seconds in the blue sky fades slowly into a warm dusk',
    signal: 'the clock: the last game hour of the day ("The sun slowly disappears in the west.")',
    dur: 30,
    acts: [],
  },
  {
    title: 'Sunset · the dusk',
    look: 'the rays and the faint beams sink toward the horizon at the left, the frame lines glinting where they cross; from about 24 seconds before the night they fade, slowly at first, their glints with them, and the sun sets as the night begins; the first stars just show 5 seconds before it',
    signal: 'the clock: the last game hour of the day',
    dur: 30,
    acts: [],
  },
  {
    title: 'The night begins',
    look: 'the sun has set; the stars fill in over the first 5 seconds of the night',
    signal: 'Event.Sun dark ("The night has begun.")',
    dur: Math.max(TURN_FULL.set, 10),
    acts: [[0, pin({ clock: 'night', sunU: -1 })]],
  },
  {
    title: 'Night · stars',
    look: 'the starry night; a shooting star',
    signal: "Char.Vitals weather = ' '",
    dur: 8,
    acts: [[3, emit('shoot')]],
  },
  {
    title: 'Back to the game',
    look: "the effects follow the game's values again, with the normal transitions",
    signal: '',
    dur: 3,
    acts: [[0, { release: true }]],
  },
];

/** The demos: every effect, or one whole sunrise or sunset. */
export type DemoScene = 'all' | 'sunrise' | 'sunset';
export const DEMO_SCRIPTS: Readonly<Record<DemoScene, readonly DemoStep[]>> = { all: DEMO_STEPS, sunrise: SUNRISE_STEPS, sunset: SUNSET_STEPS };

/** One timed entry of a played demo, `t` in ms from its start. */
export type DemoEvent =
  | { t: number; step: number }
  | { t: number; act: DemoAction }
  | { t: number; end: true };

export interface DemoPlan {
  /** The script played. */
  script: readonly DemoStep[];
  /** The wall clock's compression (tests; 1 otherwise). */
  pace: number;
  /** Every step's start, action and the end, in time order (a step's start before its actions). */
  events: DemoEvent[];
  /** Each step's start and length, ms. */
  steps: Array<{ t: number; ms: number }>;
  /** Total length, ms. */
  total: number;
}

/** The timeline. `pace` compresses the wall clock only (tests; the engine is not told). */
export function demoPlan(opts: { pace?: number } = {}, steps: readonly DemoStep[] = DEMO_STEPS): DemoPlan {
  const pace = opts.pace && opts.pace > 0 ? opts.pace : 1;
  const events: DemoEvent[] = [];
  const spans: Array<{ t: number; ms: number }> = [];
  let t = 0;
  steps.forEach((s, i) => {
    const ms = (s.dur * 1000) / pace;
    events.push({ t, step: i });
    spans.push({ t, ms });
    for (const [at, act] of s.acts) events.push({ t: t + (at * 1000) / pace, act });
    t += ms;
  });
  events.push({ t, end: true });
  // stable: a step's start stays before its own actions at the same time
  events.sort((a, b) => a.t - b.t);
  return { script: steps, pace, events, steps: spans, total: t };
}

/** `#weather …` arguments. */
export type WeatherCommand = { kind: 'demo'; scene: DemoScene; pace: number } | { kind: 'stop' } | { kind: 'usage' };

/**
 * `#weather demo [sunrise|sunset]`, `#weather stop`, `#weather demo stop`; anything
 * else is 'usage'. A hidden `xN` after `demo` runs the wall clock N times
 * faster (tests).
 */
export function parseWeatherCommand(args: string): WeatherCommand {
  const w = args.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (w.length === 1 && w[0] === 'stop') return { kind: 'stop' };
  if (w[0] !== 'demo') return { kind: 'usage' };
  if (w.length === 2 && w[1] === 'stop') return { kind: 'stop' };
  let pace = 1;
  let scene: DemoScene = 'all';
  for (const a of w.slice(1)) {
    const x = /^x(\d+(?:\.\d+)?)$/.exec(a);
    if (x && Number(x[1]) > 0 && pace === 1) pace = Number(x[1]);
    else if ((a === 'sunrise' || a === 'sunset') && scene === 'all') scene = a;
    else return { kind: 'usage' };
  }
  return { kind: 'demo', scene, pace };
}

export const WEATHER_USAGE =
  '#weather demo plays every weather effect at the game\'s own pace in about three minutes; #weather demo sunrise and #weather demo sunset play one whole sunrise or sunset (about a minute and a half); #weather stop ends it.';

/** "1:35". */
export function clockText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
