// The browser state the balloon film's takes start from
// (video/manuscript-balloons.md, stage 76), and how they play a run.
//
//   - a fresh profile: Weather effects on with Balloons on; no pane but the
//     map, floating small in the upper right (BALLOON_MAP: above the sky
//     lane's readable spot, which is low, right of the game text);
//   - MUME's clock pinned for the take (the page's `wc.clock`, as
//     film-state.ts does: only the film's own write gets through) and the
//     sky pinned to that light (`__weather.jump` of the sky's keys only:
//     the room's weather, fog and light stay the game's, so a cave stays a
//     cave);
//   - a mocked MUME WebSocket (nothing reaches mume.org), Enter MUME, the
//     map read; the run's GMCP before the take (`prime`: Char.StatusVars
//     carries the race, so the right passenger flies);
//   - for Gittan, the session's earlier run restored (`restorePrev`), its
//     times moved to just before now, so the live run chains to it and the
//     kill rating has its history (src/runs/live.ts `chainEvents`,
//     src/weather/balloons/notices.ts), as it had that evening.
//
// `playLegs` plays a take's legs (feeds/balloons.ts).
import { readFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { Page, WebSocketRoute } from '@playwright/test';
import { type DevWindow, GMCP, IAC, type Step, WILL, gmcpBytes, play, sleep, startMenu } from '../../../scripts/lib/mume-feed.ts';
import type { BalloonTake, Leg, Piece } from '../../feeds/balloons.ts';
import { freshStart } from './film-state.ts';
import { type Run, excerptFeed } from './run-feed.ts';
import type { Marks } from './timeline.ts';

const YEAR_S = 518_400;
const MONTH_S = 43_200;
const DAY_S = 1440;
/** The 16th of Wedmath, T.A. 3039 (film-state's date), at `h`:`m`. */
const wedmath = (h: number, m = 0): number => 3039 * YEAR_S + 7 * MONTH_S + 15 * DAY_S + h * 60 + m;

/** The takes' light (owner, 2026-11-21): day (Gittan), dusk (Rasta), night (the parade). */
export type Light = 'day' | 'dusk' | 'night';

/** MUME's clock per light (Wedmath: dawn at 5, dusk at 21, night from 22; clock.ts DAWN/DUSK). */
export const MOMENT: Record<Light, number> = { day: wedmath(13, 30), dusk: wedmath(21, 20), night: wedmath(0, 5) };

/**
 * The sky's keys pinned per light (`__weather.jump`; src/weather/protocol.ts
 * WeatherState). The clock above is `unset` precision, as on a new install,
 * so the almanac gives the sky nothing: the pin is what sets it. `sunU`
 * 0.47 is early afternoon; 0.95 is the day's last tenth, the balloons'
 * `dusk` (controller.ts `skyModeOf`). No turn is timed (`dayAt`, `nightAt`
 * -1), no moon.
 */
export const SKY: Record<Light, Record<string, unknown>> = {
  day: { clock: 'day', sunU: 0.47, moonUp: false, moonU: -1, dayAt: -1, nightAt: -1, moonRiseAt: -1, moonSetAt: -1 },
  dusk: { clock: 'day', sunU: 0.95, moonUp: false, moonU: -1, dayAt: -1, nightAt: -1, moonRiseAt: -1, moonSetAt: -1 },
  night: { clock: 'night', sunU: -1, moonUp: false, moonU: -1, dayAt: -1, nightAt: -1, moonRiseAt: -1, moonSetAt: -1 },
};

/**
 * Where the map floats (cells; the cockpit is 160 × 49 at 1600 × 900 CSS
 * px): the upper right corner, 30 × 13. The balloons' sky lane is right of
 * the game text (from about cell 83), and their readable spot is low in it,
 * just above the prompt; the map keeps to the lane's top right, where only
 * the drifting balloons pass (behind it: every pane covers them).
 */
export const BALLOON_MAP = { x: 129, y: 1, w: 30, h: 13 } as const;

/** The film's page options: `Math.random` seeded (the start page's quote, the flights' seeds). */
export const balloonPage = (light: Light) => ({ moment: MOMENT[light], seed: 7 });

/** Where the page fetches the earlier run from (served by a route). */
const PREV_URL = '/__film/balloon-prev.jsonl.gz';

interface WcWindow {
  __wc?: {
    settings: { update(fn: (d: Record<string, unknown>) => void): void };
    runs(): Promise<{ restore(b: Blob): Promise<unknown> }>;
    app: { weather: { controller: { balloons(force?: boolean): Promise<BalloonsApi | null> } | null } | null };
  };
}
interface BalloonsApi {
  show(n: unknown, o?: { passenger?: string }): void;
  list(): { phase: string; kind: string; count: number; face: string; passenger: string }[];
}

/**
 * One run of a backup file as a backup of its own, its µs times moved so
 * that its last event is `endUs`: meta, summary and events (the rating
 * reads the kills' XP); no text (nothing replays it).
 */
export function shiftedRun(file: string, runId: string, endUs: number): Buffer {
  const lines = gunzipSync(readFileSync(file)).toString('utf8').split('\n');
  const runLine = lines.find((l) => l.startsWith('{"type":"run"') && l.includes(`"runId":${JSON.stringify(runId)}`));
  if (!runLine) throw new Error(`no run ${runId} in ${file}`);
  const run = (JSON.parse(runLine) as { run: { startedUs: number; endedUs?: number; summary?: Record<string, number | string> } }).run;
  const last = Number(run.summary?.lastEventUs ?? run.endedUs ?? run.startedUs);
  const d = endUs - last;
  const sh = (o: Record<string, unknown>, keys: string[]): void => {
    for (const k of keys) if (typeof o[k] === 'number') o[k] = (o[k] as number) + d;
  };
  sh(run as unknown as Record<string, unknown>, ['startedUs', 'endedUs']);
  if (run.summary) sh(run.summary, ['startUs', 'lastEventUs', 'endUs', 'firstUs', 'lastUs']);
  const out = [JSON.stringify({ type: 'webcockpit-runs', schema: 1, exportedUs: endUs }), JSON.stringify({ type: 'run', run })];
  for (const l of lines) {
    if (!l.startsWith('{"type":"event"') || !l.includes(`"runId":${JSON.stringify(runId)}`)) continue;
    const e = JSON.parse(l) as { event: Record<string, unknown> };
    sh(e.event, ['us', 'logUs']);
    out.push(JSON.stringify(e));
  }
  return gzipSync(Buffer.from(`${out.join('\n')}\n`, 'utf8'));
}

export interface BalloonSession {
  server: WebSocketRoute;
}

/**
 * Prepares the page (see the top) and enters the game: the cockpit with the
 * map read, the weather on with its sky pinned to `light`, the balloons
 * loaded. `prev`: a backup to restore first (`shiftedRun`).
 */
export async function enterBalloons(page: Page, light: Light, prev?: () => Buffer): Promise<BalloonSession> {
  // MUME's clock stays the film's (film-state.ts `prepareFilm`)
  await page.context().addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
      if (k === 'wc.clock' && !(window as unknown as { __filmClockOk?: boolean }).__filmClockOk) return;
      set.call(this, k, v);
    };
  });
  let server: WebSocketRoute | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.onMessage((m) => {
      if (Buffer.from(m).includes('Core.Ping')) ws.send(gmcpBytes('Core.Ping'));
    });
    ws.send(Buffer.from([IAC, WILL, GMCP]));
    // MUME's UTF-8 (CHARSET, RFC 2066: a request the client accepts), so the logs' names (Voïx,
    // Númenórean) come out as they were; without it the text is Latin-1
    ws.send(Buffer.concat([Buffer.from([IAC, 250, 42, 1]), Buffer.from(';UTF-8', 'latin1'), Buffer.from([IAC, 240])]));
  });
  if (prev) await page.route(`**${PREV_URL}`, (r) => r.fulfill({ body: prev(), contentType: 'application/gzip' }));
  await page.goto('/');
  await startMenu(page);
  await page.waitForFunction(() => (window as unknown as WcWindow).__wc !== undefined);
  await page.evaluate(
    async ({ map, url }) => {
      const wc = (window as unknown as WcWindow).__wc!;
      type L = { docks: Record<string, { lanes: { panes: { id: string }[] }[]; head: { id: string }[]; tail: { id: string }[] }>; floating: { id: string }[] };
      wc.settings.update((d) => {
        const w = d.weather as Record<string, boolean>;
        w.enabled = true;
        w.balloons = true;
        for (const p of Object.values(d.panes as Record<string, { on: boolean }>)) if (p) p.on = false;
        (d.panes as Record<string, { on: boolean }>).map!.on = true;
        d.profile = 'default';
        const lay = d.layout as L;
        for (const dock of Object.values(lay.docks)) {
          dock.head = dock.head.filter((p) => p.id !== 'map');
          dock.tail = dock.tail.filter((p) => p.id !== 'map');
          for (const l of dock.lanes) l.panes = l.panes.filter((p) => p.id !== 'map');
        }
        lay.floating = [...lay.floating.filter((f) => f.id !== 'map'), { id: 'map', ...map }];
      });
      if (url) await (await wc.runs()).restore(await (await fetch(url)).blob());
    },
    { map: BALLOON_MAP, url: prev ? PREV_URL : null },
  );
  // the settings are written to IndexedDB after a short debounce
  await sleep(600);
  await freshStart(page, MOMENT[light]);
  // (Enter MUME before the start surface has booted prints "Offline replay mode.": ADR 0133)
  await sleep(1500);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /^login/.test(document.querySelector('.wc-app')?.getAttribute('data-status') ?? ''));
  await page.locator('.wc-pane-map .wc-pane-content[data-map-state="loaded"]').waitFor({ timeout: 15000 });
  await page.evaluate(async (pin) => {
    const w = window as unknown as DevWindow & WcWindow;
    await w.__wc!.weather();
    w.__weather!.jump(pin);
    const b = await w.__wc!.app.weather!.controller!.balloons();
    if (!b) throw new Error('the balloons did not load');
  }, SKY[light]);
  if (!server) throw new Error('the game socket did not open');
  return { server };
}

/** Balloons on or off (Settings → Weather effects → Balloons); on: waits until they are loaded again. */
export async function setBalloons(page: Page, on: boolean): Promise<void> {
  await page.evaluate(async (v) => {
    const wc = (window as unknown as WcWindow).__wc!;
    wc.settings.update((d) => {
      (d.weather as Record<string, boolean>).balloons = v;
    });
    if (v) {
      await new Promise((r) => setTimeout(r, 100));
      await wc.app.weather!.controller!.balloons();
    }
  }, on);
}

/** The balloons up now (tests' and dev's `list`). */
export async function balloonList(page: Page): Promise<ReturnType<BalloonsApi['list']>> {
  return page.evaluate(async () => {
    const b = await (window as unknown as WcWindow).__wc!.app.weather!.controller!.balloons();
    return b ? b.list() : [];
  });
}

/** A balloon for a notice (balloons.ts `show`): the parade's, sent from the scene off camera. */
export async function showBalloon(page: Page, notice: unknown, passenger: string): Promise<void> {
  await page.evaluate(
    async ({ n, p }) => {
      const b = await (window as unknown as WcWindow).__wc!.app.weather!.controller!.balloons();
      b!.show(n, { passenger: p });
    },
    { n: notice, p: passenger },
  );
}

/** A death line: a kill's fold starts on it (src/runs/events.ts). */
const DEATH = /R\.I\.P\.|disappears into nothing|You are dead!/;
/** Two death lines at least this far apart in a fast leg: each kill folds alone, as in the game (the fold is 500 ms). */
const FOLD_GAP_MS = 750;

/** A fast leg: every gap to at most `gapMs`, each death line FOLD_GAP_MS after the one before. */
function fastTimes(steps: Step[], gapMs = 8): Step[] {
  const out: Step[] = [];
  let at = 0;
  let prevAt: number | null = null;
  let lastDeath = -Infinity;
  for (const s of steps) {
    const a = s.at ?? 0;
    at += prevAt === null ? 0 : Math.min(gapMs, a - prevAt);
    prevAt = a;
    if ('out' in s && DEATH.test(s.out.toString('utf8'))) {
      if (at - lastDeath < FOLD_GAP_MS) at = lastDeath + FOLD_GAP_MS;
      lastDeath = at;
    }
    out.push({ ...s, at });
  }
  return out;
}

export interface LegPlan {
  leg: Leg;
  steps: Step[];
  prime: Step[];
  durationMs: number;
  timeOf: (runS: number) => number;
}

/** A take's legs as steps (each leg's prime is the GMCP since the leg before; the first one's is everything before it). */
export function planLegs(runs: Map<string, Run>, take: BalloonTake): LegPlan[] {
  let prevTo: number | undefined;
  return take.legs.map((leg) => {
    const speed = leg.kind === 'real' ? 1 : leg.kind === 'quick' ? (leg.speed ?? 4) : 1;
    const f = excerptFeed(runs, { run: take.run, from: leg.from, to: leg.to, speed, ...(leg.kind === 'quick' ? { maxGap: 0.5 } : {}), ...(prevTo !== undefined ? { primeFrom: prevTo } : {}) });
    prevTo = leg.to;
    const steps = leg.kind === 'fast' ? fastTimes(f.steps) : f.steps;
    const durationMs = leg.kind === 'fast' ? (steps.at(-1)?.at ?? 0) + 50 : f.durationMs;
    return { leg, steps, prime: f.prime, durationMs, timeOf: f.timeOf };
  });
}

const plain = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');
/** The lines of a step worth a marker: deaths, a level, an achievement. */
const NOTABLE = /R\.I\.P\.|You gain a level!|You achieved something new!|Event\.Achieved/;

/**
 * Plays one leg. A `fast` leg as fast as the page takes it (play()). A
 * `real` or `quick` leg on two lanes: the server's bytes on time, and the
 * commands typed beside them so that each Enter lands when the player sent
 * it. A typed command never holds the server's bytes up (a kill's XP must
 * arrive inside its 500 ms fold). A command sent in the same instant as the
 * line or command before it (a trigger, an alias, typed ahead) is put in
 * whole. Marks the leg's start, every death / level / achievement line as
 * it is sent, and each piece's in and out when its run second is reached.
 */
export async function playLeg(page: Page, server: WebSocketRoute, lp: LegPlan, marks: Marks, pieces: readonly Piece[] = []): Promise<void> {
  const { leg } = lp;
  for (const s of lp.prime) server.send((s as { out: Buffer }).out);
  if (leg.kind === 'fast') {
    await play(page, server, lp.steps, { typeDelay: 0 });
    return;
  }
  const t0 = Date.now();
  marks.markAt(t0, 'leg', leg.name ?? `${leg.kind} ${leg.from}`);
  const due = pieces
    .filter((p) => p.from >= leg.from && p.to <= leg.to)
    .flatMap((p) => [
      // a real leg runs at the game's pace, gaps and all: a run second is its offset from the leg's start
      { ms: leg.kind === 'real' ? (p.from - leg.from) * 1000 : lp.timeOf(p.from), kind: 'piece-in', label: p.name },
      { ms: leg.kind === 'real' ? (p.to - leg.from) * 1000 : lp.timeOf(p.to), kind: 'piece-out', label: p.name },
    ]);
  for (const d of due) marks.markAt(t0 + d.ms, d.kind, d.label);
  const until = async (ms: number): Promise<void> => {
    const w = t0 + ms - Date.now();
    if (w > 0) await sleep(w);
  };
  const TYPE_MS = 28;
  const cmds: { cmd: string; at: number; whole: boolean }[] = [];
  let prevAt = -1;
  for (const s of lp.steps) {
    const at = s.at ?? 0;
    if ('cmd' in s) cmds.push({ cmd: s.cmd, at, whole: at === prevAt });
    prevAt = at;
  }
  const input = page.locator('.wc-input-field');
  const typist = (async () => {
    for (const c of cmds) {
      await until(c.at - (c.whole ? 0 : c.cmd.length * TYPE_MS + 40));
      await input.focus();
      if (c.whole) await page.keyboard.insertText(c.cmd);
      else await page.keyboard.type(c.cmd, { delay: TYPE_MS });
      await page.keyboard.press('Enter');
    }
  })();
  for (const s of lp.steps) {
    if (!('out' in s)) continue;
    await until(s.at ?? 0);
    server.send(s.out);
    const text = s.out.toString('utf8');
    if (NOTABLE.test(text)) {
      for (const line of plain(text).split(/\r?\n/)) if (NOTABLE.test(line)) marks.mark('moment', line.replace(/[^\x20-\x7e\u00c0-\u024f]/g, '').trim().slice(0, 90));
    }
  }
  await typist;
  await until(lp.durationMs);
}
