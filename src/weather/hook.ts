// The app's one hook into the weather effects (stage 28 D, ADR 0091). This
// file is in the main bundle and stays tiny: it follows Options → Weather
// effects (`settings.weather.enabled`) and, only while that is on,
// dynamically imports the controller (engine, bridge, worker, CSS), which
// is a separate chunk. Off destroys it: worker terminated, canvases and
// `data-weather` removed, every listener gone.

import type { Bus } from '../core/bus';
import type { GameState } from '../gmcp/state';
import type { Cockpit } from '../layout/cockpit';
import type { Settings, SettingsStore } from '../settings';
import type { WeatherController } from './controller';
import { weatherAvailable } from './support';

export { weatherAvailable };

export interface WeatherHookDeps {
  bus: Bus;
  game: GameState;
  cockpit: Cockpit;
  settings: SettingsStore;
  /** Wall clock in ms (tests). */
  now?: () => number;
  /** A one-line notice for the user (not supported, failed). */
  notify?: (text: string) => void;
}

export interface WeatherHook {
  /** The running effects, or null (off, loading, unsupported). */
  readonly controller: WeatherController | null;
  /** Resolves once the current on/off state has been applied (the chunk loaded). */
  settled(): Promise<WeatherController | null>;
  dispose(): void;
}

export function installWeather(d: WeatherHookDeps): WeatherHook {
  let ctl: WeatherController | null = null;
  let loading: Promise<void> | null = null;
  let disposed = false;
  /** Set after a failure, so a broken browser is not retried until the switch is flipped. */
  let failed = false;
  const wanted = (): boolean => !disposed && !failed && d.settings.get().weather.enabled;

  const apply = (): void => {
    if (!wanted()) {
      ctl?.destroy();
      ctl = null;
      return;
    }
    if (ctl || loading) return;
    if (!weatherAvailable()) {
      failed = true;
      d.notify?.('Weather effects need a browser that can draw in a worker (OffscreenCanvas); they stay off.');
      return;
    }
    loading = import('./controller')
      .then((m) => {
        loading = null;
        if (!wanted() || ctl) return;
        ctl = m.startWeather(d, (msg) => {
          ctl = null;
          failed = true;
          d.notify?.(`Weather effects stopped: ${msg}`);
        });
        if (!ctl) {
          failed = true;
          d.notify?.('Weather effects could not start in this browser.');
        }
      })
      .catch((err: unknown) => {
        loading = null;
        failed = true;
        console.warn('weather: the module could not be loaded', err);
      })
      .then(() => {
        // The switch may have flipped while loading.
        if (!wanted() && ctl) apply();
      });
  };

  const unsub = d.settings.subscribe((next: Readonly<Settings>, prev: Readonly<Settings>) => {
    if (next.weather.enabled === prev.weather.enabled) return;
    if (!next.weather.enabled) failed = false;
    apply();
  });
  apply();

  return {
    get controller() {
      return ctl;
    },
    async settled() {
      while (loading) await loading;
      return ctl;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsub();
      ctl?.destroy();
      ctl = null;
    },
  };
}
