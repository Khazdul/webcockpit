// The weather demo's script (owner feedback 33, ADR 0091 "Demo"): every
// effect in one sequence, night → sunrise → day → indoors → body → sunset →
// night, then back to the game. Pure data and timing: no DOM, no engine;
// demo.ts plays it and tests/unit/weather-demo.test.ts checks it.
//
// Each step drives the engine with the same inputs the game does: pinned
// state (`WeatherState`, settled at once but eased as usual) and events.
// Everything runs at the game's own pace (owner item 70: the old 3× demo
// felt fast-forwarded): the demo shows a part of each slow process (the last
// 25 s of a sunrise or sunset, enough of a build-up to read it) instead of
// speeding it up. Times are seconds; 3:00 in all.

import type { WeatherEvent, WeatherState } from './protocol';

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
  /** Seconds. */
  dur: number;
  /** [seconds into the step, action]. */
  acts: ReadonlyArray<readonly [number, DemoAction]>;
}

const pin = (p: Partial<WeatherState>): DemoAction => ({ pin: p });
const emit = (e: WeatherEvent, data?: unknown): DemoAction => (data === undefined ? { emit: e } : { emit: e, data });
/** Where the demo's sunrise and sunset start, s before the day or night begins: their last 25 s, the build-up and the turn (ADR 0093). */
export const DEMO_TURN_FROM = -25;

export const DEMO_STEPS: readonly DemoStep[] = [
  {
    title: 'Night · moon and stars',
    look: 'a big moon in its phase, the starry sky, a shooting star that makes the frame lines it passes glint',
    signal: 'Event.Sun dark · Event.Moon rise · the almanac',
    dur: 4,
    acts: [
      [0, { pin: { weather: ' ', fog: '', light: '', position: 'standing', clock: 'night', moonUp: true, moonPhase: 0.8, moonU: 0.42, dayAt: -1, nightAt: -1, moonRiseAt: -1, moonSetAt: -1 }, instant: true }],
      [1.5, emit('shoot')],
    ],
  },
  {
    title: 'Sunrise',
    look: 'the last 25 seconds of the night: rays from the horizon at the right, more and more of them, beams that climb and make the frame lines glint',
    signal: 'the clock: the last game hour of the night (Event.Sun rise when it is not synced)',
    dur: -DEMO_TURN_FROM,
    acts: [[0, emit('sun.rise', { from: DEMO_TURN_FROM })]],
  },
  {
    title: 'The day begins',
    look: 'the blue sky fills in and the rays fade slowly; they are gone when the sky is complete',
    signal: 'Event.Sun light',
    dur: 18,
    acts: [
      // the day begins (Event.Sun light); the day sky completes FULL_S (18 s) later
      [0, pin({ clock: 'day', sunU: 0.15 })],
      [9, emit('birds')],
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
    look: 'the last 25 seconds of the day: rays from the sun low at the left, more and more of them, beams that sink toward the bottom left, glints again; the night sky comes; a shooting star',
    signal: 'the clock: the last game hour of the day (Event.Sun set when it is not synced)',
    dur: -DEMO_TURN_FROM,
    acts: [
      [0, emit('sun.set', { from: DEMO_TURN_FROM })],
      [23.5, emit('shoot')],
    ],
  },
  {
    title: 'Night · rain and lightning',
    look: 'the night sky fills in as the last rays fade; rain in the dark, and the bolt lights the night sky',
    signal: `Event.Sun dark · Char.Vitals weather = '"' · a lightning line`,
    dur: 8,
    acts: [
      // the night begins (Event.Sun dark); the night sky completes FULL_S (18 s) later
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

/** One timed entry of a played demo, `t` in ms from its start. */
export type DemoEvent =
  | { t: number; step: number }
  | { t: number; act: DemoAction }
  | { t: number; end: true };

export interface DemoPlan {
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
  return { events, steps: spans, total: t };
}

/** `#weather …` arguments. */
export type WeatherCommand = { kind: 'demo'; pace: number } | { kind: 'stop' } | { kind: 'usage' };

/**
 * `#weather demo`, `#weather stop`, `#weather demo stop`; anything
 * else is 'usage'. A hidden `xN` after `demo` runs the wall clock N times
 * faster (tests).
 */
export function parseWeatherCommand(args: string): WeatherCommand {
  const w = args.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (w.length === 1 && w[0] === 'stop') return { kind: 'stop' };
  if (w[0] !== 'demo') return { kind: 'usage' };
  if (w.length === 2 && w[1] === 'stop') return { kind: 'stop' };
  let pace = 1;
  for (const a of w.slice(1)) {
    const x = /^x(\d+(?:\.\d+)?)$/.exec(a);
    if (x && Number(x[1]) > 0 && pace === 1) pace = Number(x[1]);
    else return { kind: 'usage' };
  }
  return { kind: 'demo', pace };
}

export const WEATHER_USAGE = '#weather demo plays every weather effect at the game\'s own pace in about three minutes; #weather stop ends it.';

/** "1:35". */
export function clockText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
