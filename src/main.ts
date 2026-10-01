// Entry point. URL parameters:
//
//   (none)                  the start page; Enter MUME connects (src/app/shell.ts)
//   ?replay                 offline: no connection; use #replay to load a log
//   ?fixture=<rel>&speed=n  dev server only: replay a fixture log from
//                           $WEBCOCKPIT_FIXTURES (see vite.config.ts)
//   ?bench                  offline, exposes window.__wcBench (bench/)
//   ?player=<rel>[&session=<id>]
//                           dev server only: restore a runs backup fixture
//                           (e.g. runs-demo.jsonl.gz) into IndexedDB if its
//                           runs are missing, then open the log player on
//                           the session `id` (default: the newest session
//                           with more than one run, else the newest)
//   ?replayhtml=<rel>[&session=<id>]
//                           dev server only: the same, but builds the HTML
//                           replay of the session and opens the file
//                           (src/replay/dev.ts)
//   ?safe                   default appearance, not saved until changed
//                           (a way back from a setting that breaks the page)
//
// Start-up order: @font-face rules → settings from the localStorage mirror
// → theme and font preload → settings from IndexedDB and the look-up of
// installed local-only fonts (Lucida Console, ADR 0049; ≤ 1 s together) →
// theme again → Shell (start page, or the cockpit in the offline modes).
// The cell metrics are re-measured once the web font has loaded.
//
// Notices (ADR 0025): a newer version on the site (production builds only),
// a lazy chunk that is gone, a database upgraded by a newer tab. Not in
// `?bench`. The exported HTML replay and the log player are other entry
// points and have none.

import './ui/ui.css';
import type { App } from './app/app';
import type { BenchProbe } from './app/bench-hook';
import { Notices } from './app/notices';
import { installNotices } from './app/notices-wiring';
import { Shell } from './app/shell';
import { initKeyLabels } from './script/keys';
import { SettingsStore } from './settings';
import { appearanceChanged, applyTheme } from './theme/apply';
import { CellMetrics } from './theme/cells';
import { FONTS, detectLocalFonts, installFontFaces, preloadFont } from './theme/fonts';

const params = new URLSearchParams(location.search);
// Macro key labels follow the keyboard layout where the browser says (ADR 0026).
void initKeyLabels();

installFontFaces();
let localFontsKnown = false;
const localFonts = detectLocalFonts().then((found) => {
  localFontsKnown = true;
  return found;
});
const settings = new SettingsStore({ safe: params.has('safe') });
// A stored local-only font (Lucida Console) is preloaded and measured once
// it is known whether it is installed: measuring now would fetch DejaVu.
const earlyFont = !FONTS[settings.get().appearance.font].local;
if (earlyFont) preloadFont(settings.get().appearance.font);
applyTheme(settings.get());
const cells = new CellMetrics();
if (earlyFont) void cells.update(settings.get().appearance);
await Promise.race([Promise.all([settings.load(), localFonts]), new Promise((r) => setTimeout(r, 1000))]);
// A stored local-only font found after the wait: switch to it then.
if (!localFontsKnown) void localFonts.then((found) => {
  const a = settings.get().appearance;
  if (!found.includes(a.font)) return;
  applyTheme(settings.get());
  preloadFont(a.font);
  void cells.update(a);
});
settings.subscribe((next, prev) => {
  if (!appearanceChanged(next.appearance, prev.appearance)) return;
  applyTheme(next);
  if (next.appearance.font !== prev.appearance.font) preloadFont(next.appearance.font);
  void cells.update(next.appearance);
});
applyTheme(settings.get());
preloadFont(settings.get().appearance.font);
void cells.update(settings.get().appearance);

const fixture = import.meta.env.DEV ? params.get('fixture') : null;
const benchMode = params.has('bench');
const offline = benchMode || params.has('replay') || fixture !== null;

let probe: BenchProbe | null = null;
if (benchMode) {
  const { installBenchProbe } = await import('./app/bench-hook');
  probe = installBenchProbe(settings);
}

const notices = benchMode ? undefined : new Notices();
if (notices) installNotices(window, notices, { checkUpdates: !import.meta.env.DEV });

const root = document.getElementById('app') ?? document.body;
root.textContent = '';
const shell = new Shell({ root, settings, cells, offline, probe, ...(notices ? { notices } : {}) });
if (import.meta.env.DEV) {
  window.__wc = {
    // The cockpit is built on Enter MUME (at once in the offline modes).
    get app() {
      return shell.app!;
    },
    settings,
    cells,
    shell,
    runs: () => shell.runLibrary(),
    openPlayer: (id) => openPlayerSession(id),
    openPlayerLogs: (rels, character) => openPlayerLogs(rels, character),
    replayHtml: async (o) => (await import('./replay/dev')).devReplayHtml(shell, settings, o),
  };
}
await shell.boot();
const playerFixture = import.meta.env.DEV ? params.get('player') : null;
if (playerFixture !== null) void openPlayerFixture(playerFixture, params.get('session'));
const replayFixture = import.meta.env.DEV ? params.get('replayhtml') : null;
if (replayFixture !== null) {
  void import('./replay/dev').then((m) => m.openReplayFixture(shell, settings, replayFixture, params.get('session')));
}

const app = shell.app;
if (app) {
  probe?.attach(app);
  if (fixture !== null) {
    const speed = Number(params.get('speed') ?? '1');
    void loadFixture(app, fixture, Number.isFinite(speed) && speed >= 0 ? speed : 1);
  } else if (!benchMode) {
    app.bus.emit('sys.message', { text: 'Offline replay mode.' });
  }
}

async function loadFixture(app: App, rel: string, speed: number): Promise<void> {
  const path = rel.split('/').map(encodeURIComponent).join('/');
  try {
    const res = await fetch(`/__fixtures/${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    app.startReplay(await res.text(), rel, speed);
  } catch (err) {
    app.bus.emit('sys.message', {
      text: `Fixture ${rel} could not be loaded: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

/** Dev: opens the log player on the stored session `id` (or the default pick). */
async function openPlayerSession(id?: string | null): Promise<boolean> {
  const lib = await shell.runLibrary();
  const list = await lib.listSessions(Date.now() * 1000);
  const s = id ? list.find((x) => x.id === id) : (list.find((x) => x.runs.length > 1) ?? list[0]);
  if (!s) return false;
  await shell.openPlayer(s);
  return shell.playerHost !== null;
}

/** Dev (`?player=`): restores a backup fixture, then opens a session from it. */
async function openPlayerFixture(rel: string, id: string | null): Promise<void> {
  try {
    const res = await fetch(`/__fixtures/${rel.split('/').map(encodeURIComponent).join('/')}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await (await shell.runLibrary()).restore(await res.blob());
    if (!(await openPlayerSession(id))) console.warn(`WebCockpit: no session to play in ${rel}`);
  } catch (err) {
    console.error(`WebCockpit: player fixture ${rel} could not be opened`, err);
  }
}

/**
 * Dev: opens the player on raw `.log` fixtures (one run each, e.g. the
 * Cockpit logs under $WEBCOCKPIT_FIXTURES) without storing them. Returns
 * the load and parse time in ms.
 */
async function openPlayerLogs(rels: string[], character = 'Replay'): Promise<number> {
  const t0 = performance.now();
  const texts = await Promise.all(
    rels.map(async (rel) => {
      const res = await fetch(`/__fixtures/${rel.split('/').map(encodeURIComponent).join('/')}`);
      if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
      return res.text();
    }),
  );
  const chain = texts.map((text, i) => {
    const m = /^(\d{16}) /.exec(text);
    const us = m ? Number(m[1]) : Date.now() * 1000;
    return {
      meta: { runId: `${character}/${i}`, character, startedUs: us, endedUs: null, sealed: true, bytes: text.length, lines: 0 },
      text,
    };
  });
  await shell.openPlayerChain(chain, [], { character });
  return performance.now() - t0;
}

declare global {
  interface Window {
    /** Dev server only: handles for the browser tests and the console. */
    __wc?: {
      readonly app: App;
      settings: SettingsStore;
      cells: CellMetrics;
      shell: Shell;
      /** The run library (e2e: `restore` a backup such as the runs demo). */
      runs: () => Promise<import('./runs/library').RunLibrary>;
      /** Opens the log player on a stored session (default pick without `id`); true when open. */
      openPlayer: (id?: string | null) => Promise<boolean>;
      /** Opens the log player on raw `.log` fixtures (not stored); resolves to the load time, ms. */
      openPlayerLogs: (rels: string[], character?: string) => Promise<number>;
      /** Builds an HTML replay (src/replay/dev.ts); resolves to the file's text. */
      replayHtml: (o?: import('./replay/dev').DevReplayOptions) => Promise<string>;
    };
  }
}
