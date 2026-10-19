// The weather demo (owner feedback 33, ADR 0091 "Demo"): `#weather demo`
// plays every effect, a night to the next morning, in about four and a half
// minutes (its sunrises and sunsets whole, fast-forwarded; owner item 108), and
// `#weather demo sunrise` / `sunset` one whole sunrise or sunset as live
// (demo-script.ts; owner items 70, 74), with a
// small caption box at the top left saying what to look at, then hands the
// effects back to the game. A lazy chunk of its own: hook.ts imports it on
// the first `#weather` command.
//
// - Effects off: the demo turns Options → Weather effects on and back off at
//   the end. Every category shows during the demo (the engine's categories
//   only; the settings are not touched), and the user's come back after.
// - It drives the engine with the game's own inputs: pinned state, settled
//   at once but eased as usual (`pin(…, { smooth })`), and events, at the
//   game's own pace (owner item 70). A one-turn demo pins the clock's
//   `dayAt` / `nightAt`, so the director runs the turn as a live one; the
//   caption counts to and from its second, once a second.
// - The end, `#weather stop`, and the effects being switched off all end it;
//   the first two unpin everything, so the effects follow the game's values
//   again with the normal transitions.
// - Main thread cost: a timer per scripted action, and a few static DOM
//   writes per step for the caption (its fades and progress bar are CSS
//   transitions). Nothing runs per frame.

import './demo.css';
import { categoriesOf } from './controller';
import { DEMO_SCRIPTS, type DemoAction, type DemoPlan, WEATHER_USAGE, clockText, demoPlan, parseWeatherCommand } from './demo-script';
import type { WeatherHookDeps } from './hook';
import { ALL_CATEGORIES, type Categories, type WeatherEvent, type WeatherState } from './protocol';
import { weatherAvailable } from './support';

/** What the demo needs of the running effects (the controller). */
export interface DemoController {
  readonly engine: {
    emit(e: WeatherEvent, data?: unknown): void;
    /** At the end, 1: a clock-driven demo turn must not hold back the game's next one (director's guard). */
    setSpeed(speed: number): void;
    setCategories(c: Categories): void;
  };
  pin(p: Partial<WeatherState> | null, opts?: { smooth?: boolean }): void;
}

export interface DemoHost {
  readonly controller: DemoController | null;
  settled(): Promise<DemoController | null>;
  readonly disposed: boolean;
}

/** The demo running for a hook (one per app). */
const running = new WeakMap<object, Demo>();

/** `#weather …` (hook.ts `command`). */
export async function weatherCommand(
  hook: DemoHost,
  d: Pick<WeatherHookDeps, 'settings' | 'cockpit' | 'now'>,
  args: string,
  say: (text: string) => void,
): Promise<void> {
  const cmd = parseWeatherCommand(args);
  const cur = running.get(hook);
  if (cmd.kind === 'usage') {
    say(WEATHER_USAGE);
    return;
  }
  if (cmd.kind === 'stop') {
    if (cur) cur.stop('stopped');
    else say('No weather demo is running.');
    return;
  }
  if (cur) {
    say('The weather demo is already running; #weather stop ends it.');
    return;
  }
  if (!weatherAvailable()) {
    say('Weather effects need a browser that can draw in a worker (OffscreenCanvas); there is nothing to show here.');
    return;
  }
  const demo = new Demo(hook, d, demoPlan({ pace: cmd.pace }, DEMO_SCRIPTS[cmd.scene]), say, () => running.delete(hook));
  running.set(hook, demo);
  await demo.start();
}

/** The running demo for `hook` (tests, dev). */
export function demoOf(hook: object): Demo | undefined {
  return running.get(hook);
}

export type DemoEnd = 'done' | 'stopped' | 'off' | 'gone';

export class Demo {
  private ctl: DemoController | null = null;
  /** The effects were on before the demo. */
  private wasOn = true;
  private pinned: Partial<WeatherState> = {};
  private next = 0;
  private t0 = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private unsub: () => void = () => {};
  private caption: Caption | null = null;
  private released = false;
  /** A one-turn demo's turn: its kind and its second (the runner's clock, ms), and the caption's 1 s tick. */
  private turn: { kind: 'rise' | 'set'; at: number } | null = null;
  private tick: ReturnType<typeof setInterval> | null = null;
  /** The engine's pace was changed (a fast-forwarded turn): back to 1 at the end, however it ends. */
  private sped = false;
  ended: DemoEnd | null = null;
  /** The current step (-1 before the first). */
  step = -1;

  constructor(
    private readonly hook: DemoHost,
    private readonly d: Pick<WeatherHookDeps, 'settings' | 'cockpit' | 'now'>,
    readonly plan: DemoPlan,
    private readonly say: (text: string) => void,
    private readonly onEnd: () => void,
  ) {}

  private now(): number {
    return (this.d.now ?? Date.now)();
  }

  async start(): Promise<void> {
    const { settings } = this.d;
    this.wasOn = settings.get().weather.enabled;
    if (!this.wasOn) settings.update({ weather: { enabled: true } });
    const ctl = await this.hook.settled();
    if (this.ended) return;
    if (!ctl || this.hook.disposed) {
      this.say('The weather effects could not start here.');
      this.finish('gone');
      return;
    }
    this.ctl = ctl;
    ctl.engine.setCategories({ ...ALL_CATEGORIES });
    // Switching the effects off (Options) ends the demo.
    this.unsub = settings.subscribe((next) => {
      if (!next.weather.enabled) this.stop('off');
    });
    const c = this.d.cockpit;
    this.caption = new Caption(c.el, c.gameEl, this.plan.steps.length);
    this.say(`Weather demo: about ${clockText(this.plan.total)}. #weather stop ends it.`);
    this.t0 = this.now();
    this.run();
  }

  /** Plays every event that is due, then waits for the next. */
  private run(): void {
    this.timer = null;
    if (this.ended) return;
    if (this.hook.controller !== this.ctl || this.hook.disposed) {
      this.stop('gone');
      return;
    }
    const ev = this.plan.events;
    const t = this.now() - this.t0;
    while (this.next < ev.length && ev[this.next]!.t <= t) {
      const e = ev[this.next++]!;
      if ('step' in e) this.showStep(e.step);
      else if ('act' in e) this.act(e.act);
      else {
        this.stop('done');
        return;
      }
    }
    if (this.next < ev.length) this.timer = setTimeout(() => this.run(), Math.max(0, ev[this.next]!.t - (this.now() - this.t0)));
  }

  private showStep(i: number): void {
    this.step = i;
    const script = this.plan.script;
    const s = script[i]!, span = this.plan.steps[i]!, total = this.plan.total;
    let look = s.look;
    if (i === script.length - 1 && !this.wasOn) look = 'the effects go back off, as they were';
    this.caption?.show({
      n: i + 1,
      title: s.title,
      look,
      signal: s.signal,
      left: clockText(total - span.t),
      from: span.t / total,
      to: (span.t + span.ms) / total,
      ms: span.ms,
    });
  }

  private act(a: DemoAction): void {
    const ctl = this.ctl!;
    if ('pin' in a) {
      this.pinned = { ...this.pinned, ...a.pin };
      ctl.pin(this.pinned, { smooth: !a.instant });
    } else if ('emit' in a) {
      if (a.data === undefined) ctl.engine.emit(a.emit);
      else ctl.engine.emit(a.emit, a.data);
    } else if ('turn' in a) {
      // the clock's second of the turn: the director runs it as a live one
      const at = Date.now() + (a.in * 1000) / this.plan.pace;
      this.turn = { kind: a.turn, at: this.now() + (a.in * 1000) / this.plan.pace };
      this.pinned = { ...this.pinned, ...(a.turn === 'rise' ? { dayAt: at } : { nightAt: at }) };
      ctl.pin(this.pinned, { smooth: true });
      this.clock();
      this.tick = setInterval(() => this.clock(), 1000);
    } else if ('speed' in a) {
      this.sped = a.speed !== 1;
      ctl.engine.setSpeed(a.speed);
    } else if ('moon' in a) {
      // a moonrise by the clock: the moon comes in at the right edge and goes at its even pace (owner item 108)
      const rise = Date.now() + (a.moon.in * 1000) / this.plan.pace;
      this.pinned = { ...this.pinned, moonUp: true, moonPhase: a.moon.phase, moonRiseAt: rise, moonSetAt: rise + (a.moon.up * 1000) / this.plan.pace };
      ctl.pin(this.pinned, { smooth: true });
    } else this.release();
  }
  /** The engine's own pace again, if the demo changed it. */
  private unspeed(): void {
    const ctl = this.ctl;
    if (!this.sped || !ctl || this.hook.controller !== ctl) return;
    this.sped = false;
    ctl.engine.setSpeed(1);
  }

  /** The caption's count to and from the turn's second. */
  private clock(): void {
    const t = this.turn;
    if (!t || !this.caption) return;
    const ms = t.at - this.now(), what = t.kind === 'rise' ? 'the day' : 'the night';
    this.caption.setClock(ms > 0 ? `${what} begins in ${clockText(ms)}` : `${what} began ${clockText(-ms)} ago`);
  }

  /** The game's values again (smoothly) and the user's categories. */
  private release(): void {
    if (this.released) return;
    this.released = true;
    const ctl = this.ctl;
    if (!ctl || this.hook.controller !== ctl) return;
    // a clock-driven demo turn counted for the director's once-a-dawn guard: lift it
    if (this.turn) ctl.engine.setSpeed(1);
    this.unspeed();
    ctl.engine.setCategories(categoriesOf(this.d.settings.get()));
    ctl.pin(null, { smooth: true });
  }

  /** Ends the demo: `done` (played out), `stopped` (#weather stop), `off` (effects switched off), `gone` (the effects or the app went away). */
  stop(why: DemoEnd): void {
    if (this.ended) return;
    if (why === 'done' || why === 'stopped') this.release();
    this.finish(why);
    if (why === 'stopped') this.say('Weather demo stopped.');
    else if (why === 'done') this.say(this.wasOn ? 'Weather demo done; the effects follow the game again.' : 'Weather demo done; the effects are off again.');
  }

  private finish(why: DemoEnd): void {
    this.ended = why;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
    if (!this.hook.disposed) this.unspeed();
    this.unsub();
    this.caption?.close();
    this.caption = null;
    this.onEnd();
    const { settings } = this.d;
    // Back off as it was (not when the user just switched it off, or the app is gone).
    if (!this.wasOn && why !== 'off' && !this.hook.disposed && settings.get().weather.enabled) settings.update({ weather: { enabled: false } });
  }
}

interface CaptionStep {
  n: number;
  title: string;
  look: string;
  signal: string;
  /** Time left at the step's start, "1:02". */
  left: string;
  /** The progress bar's fill at the step's start and end (0..1), and the step's length. */
  from: number;
  to: number;
  ms: number;
}

/** The caption box: main-thread DOM, made on start and removed at the end. */
const FADE_MS = 220;

export class Caption {
  readonly el: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly fields: Record<'count' | 'step' | 'look' | 'signal' | 'left' | 'clock', HTMLElement>;
  private readonly fill: HTMLElement;
  private swap: ReturnType<typeof setTimeout> | null = null;
  private first = true;

  constructor(
    root: HTMLElement,
    game: HTMLElement,
    private readonly total: number,
  ) {
    const doc = root.ownerDocument;
    const mk = (cls: string, parent: HTMLElement, tag = 'div'): HTMLElement => {
      const e = doc.createElement(tag);
      e.className = cls;
      parent.append(e);
      return e;
    };
    const el = (this.el = doc.createElement('div'));
    el.className = 'wc-wdemo';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    mk('wc-wdemo-title', el, 'span').textContent = 'Weather demo';
    const count = mk('wc-wdemo-count', el, 'span');
    this.body = mk('wc-wdemo-body', el) as HTMLDivElement;
    const step = mk('wc-wdemo-step', this.body);
    const look = mk('wc-wdemo-look', this.body);
    const sig = mk('wc-wdemo-sig', this.body);
    mk('wc-wdemo-in', sig, 'span').textContent = 'in the game: ';
    const signal = mk('wc-wdemo-signal', sig, 'span');
    // a one-turn demo's count to and from the turn's second (owner item 74)
    const clock = mk('wc-wdemo-clock', this.body);
    clock.hidden = true;
    this.fill = mk('wc-wdemo-fill', mk('wc-wdemo-bar', el), 'i');
    const foot = mk('wc-wdemo-foot', el);
    const left = mk('wc-wdemo-left', foot, 'span');
    mk('wc-wdemo-hint', foot, 'span').textContent = '#weather stop to end';
    this.fields = { count, step, look, signal, left, clock };
    // Over the game pane's top left (placed once; the demo is short).
    el.style.left = `${game.offsetLeft}px`;
    el.style.top = `${game.offsetTop}px`;
    root.append(el);
    // In the next frame, so the box fades in.
    requestAnimationFrame(() => el.setAttribute('data-shown', ''));
  }

  show(s: CaptionStep): void {
    const put = (): void => {
      const f = this.fields;
      f.count.textContent = `${s.n}/${this.total}`;
      f.step.textContent = s.title;
      f.look.textContent = s.look;
      f.signal.textContent = s.signal;
      f.signal.parentElement!.hidden = !s.signal;
      f.left.textContent = `${s.left} left`;
      this.body.removeAttribute('data-fading');
    };
    if (this.swap) clearTimeout(this.swap);
    if (this.first) {
      this.first = false;
      put();
      this.fill.style.transform = `scaleX(${s.from})`;
    } else {
      this.body.setAttribute('data-fading', '');
      this.swap = setTimeout(put, FADE_MS);
    }
    // The bar runs to the step's end on the compositor (no per-frame script).
    requestAnimationFrame(() => {
      this.fill.style.transition = `transform ${s.ms}ms linear`;
      this.fill.style.transform = `scaleX(${s.to})`;
    });
  }

  /** The turn's count ("the day begins in 0:42"); shown from the first call on. */
  setClock(text: string): void {
    const c = this.fields.clock;
    c.hidden = false;
    if (c.textContent !== text) c.textContent = text;
  }

  close(): void {
    if (this.swap) clearTimeout(this.swap);
    const el = this.el;
    el.removeAttribute('data-shown');
    setTimeout(() => el.remove(), 400);
  }
}
