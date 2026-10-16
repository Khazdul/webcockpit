// Dev-server hook for the weather engine (stage 28). Not wired to GMCP or
// Options yet: `window.__weather` drives it from the console or a test.
//
//   await __wc.weather()                    start (also: `?weather` in the URL)
//   __weather.set({ weather: '"' })        raw values (dwell 3 s)
//   __weather.jump({ weather: '*', clock: 'night', moonUp: true })   instant
//   __weather.emit('strike')               events
//   await __weather.stats()                worker frame times
//   __weather.stop()

import type { Cockpit } from '../layout/cockpit';
import { type Weather, type WeatherOptions, createWeather } from './index';
import type { WeatherState } from './protocol';

export interface DevWeather extends Weather {
  set(s: Partial<WeatherState>): void;
  jump(s: Partial<WeatherState>): void;
  stop(): void;
}

declare global {
  interface Window {
    /** Dev server only: the running weather engine (src/weather/dev.ts). */
    __weather?: DevWeather;
  }
}

/** Starts (or returns) the dev weather engine on the cockpit. */
export function devWeather(cockpit: Cockpit, opts: WeatherOptions = {}): DevWeather | null {
  if (window.__weather) return window.__weather;
  const w = createWeather({ root: cockpit.el, game: cockpit.gameEl, onLayout: (fn) => cockpit.onLayout(fn) }, opts);
  if (!w) {
    console.warn('weather: OffscreenCanvas in workers is not supported here');
    return null;
  }
  const dev: DevWeather = Object.assign(w, {
    set: (s: Partial<WeatherState>) => w.setState(s),
    jump: (s: Partial<WeatherState>) => w.setState(s, { instant: true }),
    stop: () => {
      w.destroy();
      delete window.__weather;
    },
  });
  window.__weather = dev;
  return dev;
}
