// Weather worker entry (stage 28, ADR 0091): wires the worker globals to
// WeatherEngine. Loaded as a module worker by src/weather/index.ts.

import type { MainToWorker, WorkerToMain } from '../protocol';
import { WeatherEngine } from './engine';

interface WorkerScope {
  postMessage(m: WorkerToMain): void;
  addEventListener(type: 'message', fn: (e: MessageEvent<MainToWorker>) => void): void;
  requestAnimationFrame?: (cb: (t: number) => void) => number;
}

const scope = self as unknown as WorkerScope;
const raf = typeof scope.requestAnimationFrame === 'function' ? scope.requestAnimationFrame.bind(scope) : null;

const engine = new WeatherEngine({
  post: (m) => scope.postMessage(m),
  requestFrame: (cb) => void (raf ? raf(cb) : setTimeout(() => cb(performance.now()), 1000 / 60)),
  setTimeout: (cb, ms) => void setTimeout(cb, ms),
  now: () => performance.now(),
});

scope.addEventListener('message', (e) => {
  try {
    engine.handle(e.data);
  } catch (err) {
    scope.postMessage({ t: 'error', message: err instanceof Error ? err.message : String(err) });
  }
});
