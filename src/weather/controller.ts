// The running weather effects (stage 28 C/D, ADR 0091): the engine
// (index.ts) plus the signal bridge (signals.ts), wired to the app. Loaded
// lazily by hook.ts only while Options → Weather effects is on; `destroy`
// undoes everything (worker terminated, canvases and listeners gone).
//
// Hot path: the bus handlers only forward. `gmcp` looks at the first
// character of the package before anything else; `text.line` costs a scan
// of the line's XML spans and, without a weather span, one char compare.
// Char.Vitals are read from the character model on its change event (it
// has already merged the delta).

import type { WeatherHookDeps } from './hook';
import { createWeather, type Weather } from './index';
import type { Categories, WeatherState } from './protocol';
import { ALMANAC_MS, WeatherSignals, vitalsState } from './signals';
import type { Settings } from '../settings';
import { gmcpKey } from '../core/types';

export interface WeatherController {
  readonly engine: Weather;
  /** Bench / dev: values that win over the game's (applied at once); null releases. */
  pin(p: Partial<WeatherState> | null): void;
  /** The state the bridge last derived (pins included). */
  state(): WeatherState;
  destroy(): void;
}

export function categoriesOf(s: Readonly<Settings>): Categories {
  const w = s.weather;
  return { sky: w.sky, precipitation: w.precipitation, lightning: w.lightning, fog: w.fog, darkness: w.darkness, body: w.body };
}

/** Settings are cloned on every change: compare the (small) sections by value. */
const sameJson = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b);

/** Starts the effects; null where the browser cannot run them. */
export function startWeather(d: WeatherHookDeps, onError?: (message: string) => void): WeatherController | null {
  const { bus, game, cockpit, settings } = d;
  const now = d.now ?? Date.now;
  let engine: Weather | null = null;
  const sink = {
    setState: (p: Partial<WeatherState>, o?: { instant?: boolean }) => engine?.setState(p, o),
    emit: (e: Parameters<Weather['emit']>[0]) => engine?.emit(e),
  };
  const charVitals = game.char.vitals;
  const signals = new WeatherSignals(sink, vitalsState((k) => charVitals.get(k)), game.clock.state, now());
  const unsubs: Array<() => void> = [];
  let destroyed = false;
  engine = createWeather(
    { root: cockpit.el, game: cockpit.gameEl, onLayout: (fn) => cockpit.onLayout(fn) },
    {
      state: signals.state(),
      categories: categoriesOf(settings.get()),
      onError: (m) => {
        api.destroy();
        onError?.(m);
      },
    },
  );
  if (!engine) return null;
  const w = engine;

  unsubs.push(
    bus.on('gmcp', (m) => {
      // Event.* only (Char.Vitals come through the character model below).
      if (m.pkg.charCodeAt(0) !== 69 && m.pkg.charCodeAt(0) !== 101) return;
      signals.gmcp(gmcpKey(m), m.data);
    }),
    bus.on('text.line', (line) => signals.line(line)),
    game.subscribe((part) => {
      if (part === 'char') signals.vitals(vitalsState((k) => charVitals.get(k)));
      else if (part === 'clock') signals.almanac(game.clock.state, now(), true);
    }),
    settings.subscribe((next, prev) => {
      if (!sameJson(next.weather, prev.weather)) w.setCategories(categoriesOf(next));
      if (!sameJson(next.appearance, prev.appearance) || !sameJson(next.panes, prev.panes)) w.refresh();
    }),
  );
  const almanacTimer = setInterval(() => signals.almanac(game.clock.state, now()), ALMANAC_MS);
  unsubs.push(() => clearInterval(almanacTimer));

  const api: WeatherController = {
    engine: w,
    pin: (p) => signals.pin(p),
    state: () => signals.state(),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const u of unsubs.splice(0)) u();
      w.destroy();
    },
  };
  return api;
}
