// Dev-server hook for the weather effects (stage 28). `window.__weather`
// drives the running effects from the console or a test:
//
//   await __wc.weather()                    turns Options → Weather effects on
//                                           (also: `?weather` in the URL)
//   __weather.set({ weather: '"' })        raw values (dwell 3 s); the game's
//                                           next change of a key replaces it
//   __weather.jump({ weather: '*', clock: 'night', moonUp: true })
//                                           pinned at once: the game's values
//                                           for these keys are ignored
//   __weather.jump({ clock: 'night', dayAt: Date.now() + 65_000 })
//                                           a sunrise: the day begins in 65 s
//   __weather.jump({ clock: 'day', nightAt: Date.now() + 65_000 })
//                                           a sunset: the night begins in 65 s
//                                           (ADR 0093; unpin after either)
//   __weather.unpin()                      back to the game's values
//   __weather.emit('strike')               events
//   await __weather.stats()                worker frame times
//   __weather.demo()                       the demo (`#weather demo`; 'slow' too)
//   __weather.demoStop()                   ends it (`#weather stop`)
//   __weather.stop()                       turns the option off again
//
// `?weather` in the URL calls `__wc.weather()` once the cockpit exists (at
// once offline; after Enter MUME from the start page), see `weatherFromUrl`.

import type { App } from '../app/app';
import type { SettingsStore } from '../settings';
import type { Weather, WeatherOptions } from './index';
import type { WeatherState } from './protocol';

export interface DevWeather extends Weather {
  set(s: Partial<WeatherState>): void;
  jump(s: Partial<WeatherState>): void;
  unpin(): void;
  /** `#weather demo [args]`. */
  demo(args?: string): Promise<void>;
  /** `#weather stop`. */
  demoStop(): Promise<void>;
  stop(): void;
}

declare global {
  interface Window {
    /** Dev server only: the running weather effects (src/weather/dev.ts). */
    __weather?: DevWeather;
  }
}

/** Turns the effects on (the Options switch) and returns the dev handle; null when they cannot run. */
export async function devWeather(app: App, settings: SettingsStore, opts: WeatherOptions = {}): Promise<DevWeather | null> {
  const hook = app.weather;
  if (!hook) {
    console.warn('weather: this App has no weather hook');
    return null;
  }
  settings.update({ weather: { enabled: true } });
  const ctl = await hook.settled();
  if (!ctl) {
    console.warn('weather: the effects could not start here (OffscreenCanvas in workers?)');
    return null;
  }
  if (window.__weather && hook.controller?.engine === window.__weather) return window.__weather;
  const w = ctl.engine;
  if (opts.state) ctl.pin(opts.state);
  if (opts.moonSpeed !== undefined) w.setMoonSpeed(opts.moonSpeed);
  let pinned: Partial<WeatherState> = { ...opts.state };
  const dev: DevWeather = Object.assign(w, {
    set: (s: Partial<WeatherState>) => w.setState(s),
    jump: (s: Partial<WeatherState>) => {
      pinned = { ...pinned, ...s };
      ctl.pin(pinned);
    },
    unpin: () => {
      pinned = {};
      ctl.pin(null);
    },
    demo: (args = '') => hook.command(`demo ${args}`, (t) => console.info(t)),
    demoStop: () => hook.command('stop', (t) => console.info(t)),
    stop: () => {
      settings.update({ weather: { enabled: false } });
      delete window.__weather;
    },
  });
  window.__weather = dev;
  return dev;
}

/**
 * `?weather` (`?weather=<json>` pins a state too): `start` runs once the
 * cockpit exists. `onApp` calls back at once when it does already (offline
 * modes), or when the start page's Enter MUME builds it. False without the
 * parameter.
 */
export function weatherFromUrl(
  params: URLSearchParams,
  onApp: (fn: () => void) => void,
  start: (opts?: WeatherOptions) => void,
): boolean {
  if (!params.has('weather')) return false;
  let state: Partial<WeatherState> | undefined;
  try {
    state = params.get('weather') ? (JSON.parse(params.get('weather')!) as Partial<WeatherState>) : undefined;
  } catch {
    console.warn('weather: ?weather=<json> is not JSON');
  }
  onApp(() => start(state ? { state } : undefined));
  return true;
}
