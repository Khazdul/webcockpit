// The weather demo's script (owner feedback 33, ADR 0091 "Demo"): every
// effect in one sequence, night → sunrise → day → indoors → body → sunset →
// night, then back to the game. Pure data and timing: no DOM, no engine;
// demo.ts plays it and tests/unit/weather-demo.test.ts checks it.
//
// Each step drives the engine with the same inputs the game does: pinned
// state (`WeatherState`, settled at once but eased as usual) and events.
// Times are seconds at the demo's default pace, where the sun moments, the
// day ↔ night change, cloud cover, fog, the rain's and snow's build-up and
// the blood's drying run DEMO_SPEED times faster than in the game (the
// engine's `setSpeed`).
// `slow` is a step's length at the game's own pace (`#weather demo slow`);
// its actions keep their place relative to the step.

import type { WeatherEvent, WeatherState } from './protocol';

/** The engine's time scale during the demo (1 in `#weather demo slow`). */
export const DEMO_SPEED = 3;

export type DemoAction =
  /** Pins these values (merged with the earlier pins); `instant` jumps without easing (the start only). */
  | { pin: Partial<WeatherState>; instant?: true }
  /** `data`: as the engine takes it (`sun.rise` `{ from }`: where the sunrise starts, s before the day). */
  | { emit: WeatherEvent; data?: unknown }
  /** Unpins everything: the game's values again, with the normal transitions. */
  | { release: true };

export interface DemoStep {
  /** The caption's step line, e.g. "Day · heavy rain". */
  title: string;
  /** What to look at, one short line. */
  look: string;
  /** The signal that drives it in the real game ('' for none). */
  signal: string;
  /** Seconds at the demo's pace. */
  dur: number;
  /** Seconds at the game's pace (`slow`); default `dur`. */
  slow?: number;
  /** [seconds into the step at the demo's pace, action]. */
  acts: ReadonlyArray<readonly [number, DemoAction]>;
}

const pin = (p: Partial<WeatherState>): DemoAction => ({ pin: p });
const emit = (e: WeatherEvent, data?: unknown): DemoAction => (data === undefined ? { emit: e } : { emit: e, data });
/** Where the demo's sunrise and sunset start, s before the day or night begins: their last half minute (the game's first 30 s are only just perceptible; ADR 0093). */
export const DEMO_TURN_FROM = -30;

export const DEMO_STEPS: readonly DemoStep[] = [
  {
    title: 'Night · moon and stars',
    look: 'a big moon in its phase, the starry sky, a shooting star that makes the frame lines it passes glint',
    signal: 'Event.Sun set · Event.Moon rise · the almanac',
    dur: 4.5,
    acts: [
      [0, { pin: { weather: ' ', fog: '', light: '', position: 'standing', clock: 'night', moonUp: true, moonPhase: 0.8, moonU: 0.42, dayAt: -1, nightAt: -1 }, instant: true }],
      [1.4, emit('shoot')],
    ],
  },
  {
    title: 'Sunrise',
    look: 'the last half minute of the night: a warm hint grows, beams sweep across the screen and frame lines glint where they cross; the day sky comes as the beams fade',
    signal: 'the clock: the last game hour of the night (Event.Sun rise when it is not synced)',
    dur: -DEMO_TURN_FROM / DEMO_SPEED,
    slow: -DEMO_TURN_FROM,
    acts: [[0, emit('sun.rise', { from: DEMO_TURN_FROM })]],
  },
  {
    title: 'Day · clear sky',
    look: 'the blue sky with a soft sun glow at the top right, the pale moon, birds, a sun glimpse, an insect',
    signal: "Char.Vitals weather = ' '",
    dur: 5,
    acts: [
      // the day begins (Event.Sun light); the day sky completes in the next 14 game seconds
      [0, pin({ clock: 'day', sunU: 0.5 })],
      [0, emit('birds')],
      [0, emit('glimpse')],
      [2.5, emit('insect')],
    ],
  },
  {
    title: 'Day · clouds roll in',
    look: 'the clouds come one by one from the right, where the wind brings them',
    signal: "Char.Vitals weather = '~'",
    dur: 4,
    slow: 12,
    acts: [[0, pin({ weather: '~', moonUp: false, moonU: -1 })]],
  },
  {
    title: 'Day · light rain',
    look: 'thin rain falls and the sky turns grey',
    signal: `Char.Vitals weather = "'"`,
    dur: 3,
    acts: [[0, pin({ weather: "'" })]],
  },
  {
    title: 'Day · heavy rain',
    look: 'denser rain; drips run along the pane edges',
    signal: `Char.Vitals weather = '"'`,
    dur: 3.5,
    acts: [[0, pin({ weather: '"' })]],
  },
  {
    title: 'Lightning',
    look: 'a bolt strikes and every frame line lights up',
    signal: 'a lightning line in the room text',
    dur: 4,
    acts: [
      [0.3, emit('strike')],
      [1.9, emit('strike')],
      [3.3, emit('strike')],
    ],
  },
  {
    title: 'Snow and a gust',
    look: 'snow falls in from above and builds up; a gust swirls it',
    signal: "Char.Vitals weather = '*' · a wind line",
    dur: 5.5,
    slow: 14,
    acts: [
      [0, pin({ weather: '*' })],
      [3.4, emit('gust')],
    ],
  },
  {
    title: 'Fog',
    look: 'light fog drifts low over the screen, then it thickens',
    signal: "Char.Vitals fog = '-', then '='",
    dur: 7.5,
    slow: 24,
    acts: [
      [0, pin({ weather: ' ', fog: '-' })],
      [4, pin({ fog: '=' })],
    ],
  },
  {
    title: 'Indoors',
    look: 'the whole sky fades out evenly; the fog thins away',
    signal: 'Char.Vitals weather = null (indoors)',
    dur: 4.5,
    acts: [[0, pin({ weather: null, fog: '' })]],
  },
  {
    title: 'Outdoors again',
    look: 'the sky fades back in as it was',
    signal: "Char.Vitals weather = ' '",
    dur: 3.5,
    acts: [[0, pin({ weather: ' ' })]],
  },
  {
    title: 'Sleeping',
    look: 'z z Z floats up',
    signal: 'Char.Vitals position = sleeping',
    dur: 3.5,
    acts: [[0, pin({ position: 'sleeping' })]],
  },
  {
    title: 'Stunned',
    look: 'the screen jolts',
    signal: 'Char.Vitals position = stunned',
    dur: 2.5,
    acts: [[0, pin({ position: 'stunned' })]],
  },
  {
    title: 'Incapacitated, then dying',
    look: 'blood at the edges and a red heartbeat wash',
    signal: 'Char.Vitals position = incapacitated, dying',
    dur: 4,
    acts: [
      [0, pin({ position: 'incapacitated' })],
      [2, pin({ position: 'dying' })],
    ],
  },
  {
    title: 'On your feet again',
    look: 'the blood darkens, dries and fades',
    signal: 'Char.Vitals position = standing',
    dur: 4,
    slow: 11,
    acts: [[0, pin({ position: 'standing' })]],
  },
  {
    title: 'Sunset',
    look: 'the last half minute of the day: a warm glow grows, beams and glints again from the left; the blue sky turns into the starry night as they fade; a shooting star',
    signal: 'the clock: the last game hour of the day (Event.Sun set when it is not synced)',
    dur: -DEMO_TURN_FROM / DEMO_SPEED,
    slow: -DEMO_TURN_FROM,
    acts: [
      [0, emit('sun.set', { from: DEMO_TURN_FROM })],
      [9.4, emit('shoot')],
    ],
  },
  {
    title: 'Night · rain and lightning',
    look: 'rain in the dark, and the bolt lights the night sky',
    signal: `Char.Vitals weather = '"' · a lightning line`,
    dur: 5,
    acts: [
      // the night begins (Event.Sun dark); the night sky completes in the next 14 game seconds
      [0, pin({ clock: 'night', weather: '"' })],
      [1.6, emit('strike')],
      [3.6, emit('strike')],
    ],
  },
  {
    title: 'Night · fog',
    look: 'fog drifting in the dark',
    signal: "Char.Vitals fog = '-'",
    dur: 4,
    slow: 12,
    acts: [[0, pin({ weather: ' ', fog: '-' })]],
  },
  {
    title: 'Darkness spreads',
    look: 'a short red bleed from the top and the corners',
    signal: 'Event.Darkness start',
    dur: 4,
    acts: [
      [0, pin({ fog: '' })],
      [0.2, emit('darkness.start')],
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

/** One timed entry of a played demo, `t` in ms from its start. */
export type DemoEvent =
  | { t: number; step: number }
  | { t: number; act: DemoAction }
  | { t: number; end: true };

export interface DemoPlan {
  /** The engine's time scale. */
  speed: number;
  /** Every step's start, action and the end, in time order (a step's start before its actions). */
  events: DemoEvent[];
  /** Each step's start and length, ms. */
  steps: Array<{ t: number; ms: number }>;
  /** Total length, ms. */
  total: number;
}

/**
 * The timeline: at the demo's pace (`slow` false) or the game's (`slow`).
 * `pace` compresses the wall clock only (tests; the engine is not told).
 */
export function demoPlan(opts: { slow?: boolean; pace?: number } = {}, steps: readonly DemoStep[] = DEMO_STEPS): DemoPlan {
  const pace = opts.pace && opts.pace > 0 ? opts.pace : 1;
  const events: DemoEvent[] = [];
  const spans: Array<{ t: number; ms: number }> = [];
  let t = 0;
  steps.forEach((s, i) => {
    const len = opts.slow ? (s.slow ?? s.dur) : s.dur;
    const k = len / s.dur;
    const ms = (len * 1000) / pace;
    events.push({ t, step: i });
    spans.push({ t, ms });
    for (const [at, act] of s.acts) events.push({ t: t + (at * k * 1000) / pace, act });
    t += ms;
  });
  events.push({ t, end: true });
  // stable: a step's start stays before its own actions at the same time
  events.sort((a, b) => a.t - b.t);
  return { speed: opts.slow ? 1 : DEMO_SPEED, events, steps: spans, total: t };
}

/** `#weather …` arguments. */
export type WeatherCommand = { kind: 'demo'; slow: boolean; pace: number } | { kind: 'stop' } | { kind: 'usage' };

/**
 * `#weather demo [slow]`, `#weather stop`, `#weather demo stop`; anything
 * else is 'usage'. A hidden `xN` after `demo` runs the wall clock N times
 * faster (tests).
 */
export function parseWeatherCommand(args: string): WeatherCommand {
  const w = args.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (w.length === 1 && w[0] === 'stop') return { kind: 'stop' };
  if (w[0] !== 'demo') return { kind: 'usage' };
  if (w.length === 2 && w[1] === 'stop') return { kind: 'stop' };
  let slow = false;
  let pace = 1;
  for (const a of w.slice(1)) {
    const x = /^x(\d+(?:\.\d+)?)$/.exec(a);
    if (a === 'slow' && !slow) slow = true;
    else if (x && Number(x[1]) > 0) pace = Number(x[1]);
    else return { kind: 'usage' };
  }
  return { kind: 'demo', slow, pace };
}

export const WEATHER_USAGE = '#weather demo plays every weather effect in about a minute and a half (#weather demo slow at the game\'s pace); #weather stop ends it.';

/** "1:35". */
export function clockText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
