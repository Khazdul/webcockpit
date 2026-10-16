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
//   __weather.unpin()                      back to the game's values
//   __weather.emit('strike')               events
//   await __weather.stats()                worker frame times
//   __weather.stop()                       turns the option off again

import type { App } from '../app/app';
import type { SettingsStore } from '../settings';
import type { Weather, WeatherOptions } from './index';
import type { WeatherState } from './protocol';

export interface DevWeather extends Weather {
  set(s: Partial<WeatherState>): void;
  jump(s: Partial<WeatherState>): void;
  unpin(): void;
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
    stop: () => {
      settings.update({ weather: { enabled: false } });
      delete window.__weather;
    },
  });
  window.__weather = dev;
  return dev;
}
