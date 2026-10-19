// The weather demo's script (owner feedback 33, ADR 0091 "Demo"; rebuilt
// for owner item 108): one evening-to-morning story that builds up: a
// starry night, a whole sunrise, a day with birds turning to rain, a whole
// sunset, a moonrise, clouds, a downpour, a thunderstorm, snow, fog and a
// darkness spell, a second sunrise, then the remaining effects (indoors,
// the body's), and back to the game. Pure data and timing: no DOM, no
// engine; demo.ts plays it and tests/unit/weather-demo.test.ts checks it.
//
// Each step drives the engine with the same inputs the game does: pinned
// state (`WeatherState`, settled at once but eased as usual) and events.
// The sunrises and sunsets run whole, from their first second, at
// DEMO_TURN_SPEED (the engine's slow paces that much faster for the turn
// only); everything else at the game's own pace (owner item 70). The moon
// goes by a clock the demo pins (`moon`), at an even pace from the right
// edge, never placed by a jump. Times are seconds; about 4:30 in all.

import type { WeatherEvent, WeatherState } from './protocol';
import { TURN_FULL, TURN_S } from './sunturn';

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
  | { turn: 'rise' | 'set'; in: number }
  /** The engine's slow paces (sky, turns, fog, clouds, build-ups) this many times faster (1: the game's). */
  | { speed: number }
  /** A moonrise by the clock: pins the moon up, rising `in` s from now (the runner's clock) and setting `up` s after (owner item 108). */
  | { moon: { in: number; up: number; phase: number } };

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
/** The demo's sunrises and sunsets run whole, this many times the game's pace (owner item 108: 2.5×, so the demo stays near four and a half minutes). */
export const DEMO_TURN_SPEED = 2.5;
/** A whole sunrise or sunset at DEMO_TURN_SPEED, s; split over two caption steps. */
const TURN_DUR = TURN_S / DEMO_TURN_SPEED;
const HALF = TURN_DUR / 2;

/** A whole sunrise or sunset, fast-forwarded: two caption steps, the turn from its first second; the next step turns the clock and the pace back. */
function turnSteps(kind: 'rise' | 'set', first: Omit<DemoStep, 'dur'>, second: Omit<DemoStep, 'dur' | 'acts'>): DemoStep[] {
  return [
    { ...first, dur: HALF, acts: [...first.acts, [0, { speed: DEMO_TURN_SPEED }], [0, emit(kind === 'rise' ? 'sun.rise' : 'sun.set', { from: -TURN_S })]] },
    { ...second, dur: HALF, acts: [] },
  ];
}

export const DEMO_STEPS: readonly DemoStep[] = [
  {
    title: 'Night · stars',
    look: 'a clear, moonless night sky full of stars; a shooting star, the frame lines glinting where it passes',
    signal: 'Event.Sun dark · the almanac',
    dur: 12,
    acts: [
      [0, { pin: { ...SCENE, clock: 'night', moonUp: false, moonU: -1, moonPhase: 0.85, sunU: -1 }, instant: true }],
      [4, emit('shoot')],
      [9.5, emit('shoot')],
    ],
  },
  ...turnSteps(
    'rise',
    {
      title: 'Sunrise · the first light',
      look: 'the last game hour of the night at 2.5 times its pace: the sun\'s hazy light grows at the right, faint rays and beams with it, the frame lines glinting where they cross; the stars fade',
      signal: 'the clock: the last game hour of the night ("The light slowly increases in the east.")',
      acts: [],
    },
    {
      title: 'Sunrise · the blue sky',
      look: 'the blue sky fades in as the sun climbs and its rays fade; at the day\'s first second the sky is blue',
      signal: 'the clock: the last game hour of the night',
    },
  ),
  {
    title: 'Morning · the day begins',
    look: 'the clear blue sky; the morning sun\'s rays pulse very faintly',
    signal: 'Event.Sun light ("The day has begun.")',
    dur: Math.max(TURN_FULL.rise, 8),
    acts: [
      [0, pin({ clock: 'day', sunU: 0.15 })],
      [0, { speed: 1 }],
      [1, emit('glimpse')],
    ],
  },
  {
    title: 'Day · birds',
    look: 'a flock of birds crosses the sky, an insect buzzes by, small tufts of cloud drift',
    signal: "Char.Vitals weather = ' '",
    dur: 14,
    acts: [
      [0.5, emit('birds')],
      [6, emit('insect')],
      [9.5, emit('birds')],
    ],
  },
  {
    title: 'Day · clouds roll in',
    look: 'the clouds come one by one from the right, where the wind brings them; the sky greys a little',
    signal: "Char.Vitals weather = '~'",
    dur: 10,
    acts: [[0, pin({ weather: '~' })]],
  },
  {
    title: 'Day · rain',
    look: 'thin rain sets in and the sky turns grey; drips run along the pane edges',
    signal: `Char.Vitals weather = "'"`,
    dur: 12,
    acts: [[0, pin({ weather: "'" })]],
  },
  {
    title: 'Late afternoon · the rain passes',
    look: 'the rain stops, the clouds clear and the blue comes back; a ray of sun from the west',
    signal: "Char.Vitals weather = ' '",
    dur: 12,
    acts: [
      [0, pin({ weather: ' ', sunU: 0.88 })],
      [7, emit('glimpse')],
    ],
  },
  ...turnSteps(
    'set',
    {
      title: 'Sunset · the first rays',
      look: 'the last game hour of the day at 2.5 times its pace: faint rays from the sun at the left come in one at a time; the blue turns to a warm dusk, a red-orange glow round the sun',
      signal: 'the clock: the last game hour of the day ("The sun slowly disappears in the west.")',
      acts: [],
    },
    {
      title: 'Sunset · the dusk',
      look: 'the sun sinks and its fan of rays lifts, up-right over the screen; the light fades and the first stars come as the night begins',
      signal: 'the clock: the last game hour of the day',
    },
  ),
  {
    title: 'Night falls',
    look: 'the sun has set; the stars fill in',
    signal: 'Event.Sun dark ("The night has begun.")',
    dur: Math.max(TURN_FULL.set, 10),
    acts: [
      [0, pin({ clock: 'night', sunU: -1 })],
      [0, { speed: 1 }],
      [7, emit('shoot')],
    ],
  },
  {
    title: 'Night · the moon rises',
    look: 'the moon comes up at the right edge and climbs slowly',
    signal: 'Event.Moon rise · the almanac',
    dur: 14,
    acts: [[0, { moon: { in: 1, up: 200, phase: 0.85 } }]],
  },
  {
    title: 'Night · clouds',
    look: 'clouds roll in from the right and hide the stars and the moon',
    signal: "Char.Vitals weather = '~'",
    dur: 12,
    acts: [[0, pin({ weather: '~' })]],
  },
  {
    title: 'Night · downpour',
    look: 'heavy rain in the dark; drips and rivulets on the panes',
    signal: `Char.Vitals weather = '"'`,
    dur: 10,
    acts: [[0, pin({ weather: '"' })]],
  },
  {
    title: 'Thunderstorm',
    look: 'bolts strike and light the night sky; every frame line flashes',
    signal: 'a lightning line in the room text',
    dur: 14,
    acts: [
      [1, emit('strike')],
      [5, emit('strike')],
      [8, emit('strike')],
      [12, emit('strike')],
    ],
  },
  {
    title: 'Snow',
    look: 'the rain turns to snow, falling in from above and slowly building up; a gust swirls it',
    signal: "Char.Vitals weather = '*' · a wind line",
    dur: 16,
    acts: [
      [0, pin({ weather: '*' })],
      [10, emit('gust')],
    ],
  },
  {
    title: 'Fog',
    look: 'the snow eases; fog drifts in low over the screen and thickens',
    signal: "Char.Vitals fog = '-', then '='",
    dur: 12,
    acts: [
      [0, pin({ weather: '~', fog: '-' })],
      [6, pin({ fog: '=' })],
    ],
  },
  {
    title: 'Darkness spreads',
    look: 'a short red bleed from the top and the corners',
    signal: 'Event.Darkness start',
    dur: 5,
    acts: [[0.3, emit('darkness.start')]],
  },
  {
    title: 'Darkness lifts',
    look: 'a brief lightening',
    signal: 'Event.Darkness end',
    dur: 3,
    acts: [[0, emit('darkness.end')]],
  },
  ...turnSteps(
    'rise',
    {
      title: 'Dawn · the sky clears',
      look: 'the fog and the clouds clear as the next sunrise begins, again at 2.5 times its pace',
      signal: 'the clock: the last game hour of the night',
      acts: [[0, pin({ weather: ' ', fog: '' })]],
    },
    {
      title: 'Dawn · the sun',
      look: 'rays and beams from the sun at the right, the blue sky fading in; the moon pales',
      signal: 'the clock: the last game hour of the night',
    },
  ),
  {
    title: 'A new day',
    look: 'the clear blue sky, the pale moon',
    signal: 'Event.Sun light',
    dur: 6,
    acts: [
      [0, pin({ clock: 'day', sunU: 0.15 })],
      [0, { speed: 1 }],
    ],
  },
  {
    title: 'Indoors',
    look: 'the whole sky fades out evenly',
    signal: 'Char.Vitals weather = null (indoors)',
    dur: 6,
    acts: [[0, pin({ weather: null })]],
  },
  {
    title: 'Outdoors again',
    look: 'the sky fades back in as it was',
    signal: "Char.Vitals weather = ' '",
    dur: 5,
    acts: [[0, pin({ weather: ' ' })]],
  },
  {
    title: 'Sleeping',
    look: 'z z Z floats up',
    signal: 'Char.Vitals position = sleeping',
    dur: 5,
    acts: [[0, pin({ position: 'sleeping' })]],
  },
  {
    title: 'Stunned',
    look: 'the screen jolts',
    signal: 'Char.Vitals position = stunned',
    dur: 4,
    acts: [[0, pin({ position: 'stunned' })]],
  },
  {
    title: 'Incapacitated, then dying',
    look: 'blood at the edges and a red heartbeat wash',
    signal: 'Char.Vitals position = incapacitated, dying',
    dur: 6,
    acts: [
      [0, pin({ position: 'incapacitated' })],
      [3, pin({ position: 'dying' })],
    ],
  },
  {
    title: 'On your feet again',
    look: 'the blood darkens, dries and fades; birds again',
    signal: 'Char.Vitals position = standing',
    dur: 8,
    acts: [
      [0, pin({ position: 'standing' })],
      [4, emit('birds')],
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
    look: 'faint rays from the sun 40° up at the left come in softly, one at a time, from level to straight down into the lower corner; from 10 seconds in the blue sky fades slowly into a warm dusk',
    signal: 'the clock: the last game hour of the day ("The sun slowly disappears in the west.")',
    dur: 30,
    acts: [],
  },
  {
    title: 'Sunset · the dusk',
    look: 'the sun sinks toward the horizon at the left and its fan of rays lifts, the frame lines glinting where they cross; the blue still clear 10 seconds before the night, then fading; the last rays run right and up-right over the screen until the last 3 seconds, then fade and shrink as the sun sets at the night\'s second',
    signal: 'the clock: the last game hour of the day',
    dur: 30,
    acts: [],
  },
  {
    title: 'The night begins',
    look: 'the sun has set; the first stars are just perceptible, and fill in over the first 10 seconds of the night',
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
  '#weather demo plays every weather effect, from a night to the next morning, in about four and a half minutes; #weather demo sunrise and #weather demo sunset play one whole sunrise or sunset (about a minute and a half); #weather stop ends it.';

/** "1:35". */
export function clockText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
