// "N online" by the almanac (spec §7.6, ADR 0147): the number of devices
// with WebCockpit open, from `GET /api/stats/public`, while the almanac is
// shown. The cloud client's chunk is loaded on idle time after the first
// render, and asks the flags first: with the flag `stats` off, no API, a
// failed answer or an automated browser, the number stays null and the
// line is absent (src/cloud/online.ts). Refreshed every minute while the
// almanac runs (the server caches the answer for as long).

import { useEffect, useRef, useState } from 'preact/hooks';

/** The line is refreshed this often while shown (ms; the server caches 60 s). */
export const ONLINE_REFRESH_MS = 60_000;

export function useOnline(run: boolean): number | null {
  const [n, setN] = useState<number | null>(null);
  const last = useRef(-Infinity);
  useEffect(() => {
    if (!run) return;
    let live = true;
    const load = (): void => {
      last.current = Date.now();
      import('../cloud/online')
        .then((m) => m.onlineNow())
        .then(
          (v) => live && setN(v),
          () => undefined,
        );
    };
    let idle: number | null = null;
    let first: ReturnType<typeof setTimeout> | null = null;
    if (Date.now() - last.current >= ONLINE_REFRESH_MS) {
      if (typeof requestIdleCallback === 'function') idle = requestIdleCallback(load, { timeout: 3000 });
      else first = setTimeout(load, 1000);
    }
    const t = setInterval(load, ONLINE_REFRESH_MS);
    return () => {
      live = false;
      clearInterval(t);
      if (first !== null) clearTimeout(first);
      if (idle !== null && typeof cancelIdleCallback === 'function') cancelIdleCallback(idle);
    };
  }, [run]);
  return n;
}
