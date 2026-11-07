// The Spotlights reel in the in-app player (ADR 0019 "Spotlights", Inv
// §7.6): a PlayerHost playing one timeline over every spotlight (each its
// window with a blank transition), with the spotlight header, the
// Spotlights card, `←` / `→` and the markers of the moments. It starts
// playing with the chrome hidden (a pointer move or a key shows it; the
// card stays) and parks paused at the end (the engine stops there). ESC
// closes the player (the shell shows the start page as it was).
//
// Stripped down (owner feedback 2026-09-29, ADR 0032): a spotlight is a
// short snapshot, so the reel shows the game text only — every pane is
// off, script panes included (a viewer override, so later VIEW records
// cannot switch one on) — and the control box has Display (font size,
// colours; kept across rebuilds) but no Panes.
//
// The card (stage 32c, ADR 0114; src/player/spotlight-card.ts) is made once
// per open and lives on the player element across rebuilds: the current
// spotlight, `‹ ›`, the countdown, and the filter (kinds, characters,
// period) that replaced the gear popup of ADR 0110. Every change of the
// settings' `spotlights` rebuilds the reel at once (`opts.source` loads
// it, reading only windows not read yet): the current spotlight is kept
// at the same offset when it still passes, otherwise the reel starts from
// the first; paused stays paused, parked at the end plays again; the
// latest change wins. A change that leaves nothing stops the reel and
// shows the empty stage — the card with its filter and `No spotlights
// match your settings.`, and a top line with `ESC Back` — until a change
// lets something through again.
//
// Keys: plain ← → go to the previous or next spotlight (the view's keys
// hook); Shift+← → are the view's ±10 s, Home its To the start.
//
// The bare reel (stage 46, B "Galleriet"; ADR 0131): `openSpotlightReel(
// host, reel, { bare: true, start, onEsc, keys, onEnd })` plays the reel
// on an embedded host (`services.embedPlayer`) inside the Spotlights page's
// viewer (src/chrome/frames/spotlights-viewer.tsx), which draws its own
// head, countdown, track and controls. The view is bare (no header, rail,
// control box, card or auto-hide) with `hours`; it starts at spotlight
// `start` and plays on through the rest; ← → step spotlights as above
// (after the page's own `keys`); the engine parks at the end and `onEnd`
// tells the page (its end card). No settings subscription and no empty
// stage: the filter lives on the page's wall, which hands a new reel to
// `open(reel, start)` on the same host. The brighter red (ANSI 1,
// `SPOTLIGHT_RED`) is the host's palette tweak, drawn only while the
// Display colours are Default (the host's rule).
//
// The card and the full-page reel above stay for the shell's
// `openSpotlights` (and its dev hook) until wave 3 removes them; the
// Spotlights page no longer uses either.

import type { PlayerHost } from '../app/player-host';
import type { SettingsStore } from '../settings';
import type { HeaderHint, PlacedMark } from './strip';
import type { PlayerHeaderModel } from './view';
import { type Reel, type ReelLoader, fmtDate, navTarget, reelMarks, spotAt, spotMoments, spotStarts } from './spotlight-reel';
import { REEL_NO_MATCH, SpotlightCard, countdownLeft } from './spotlight-card';
import { BLANK_LINES } from './timeline';
import { SPEEDS } from './engine';
import { PANE_IDS, type PaneId } from '../layout/types';
import { OWN_KEYS_ATTR } from '../ui/input-pane';

export { REEL_NO_MATCH };

/** What the reel needs beyond the host for its filter and rebuilds (ADR 0110, 0114); none = a fixed reel without a filter. */
export interface ReelOptions {
  /** Loads the reel for new settings. */
  source?: ReelLoader;
  /** The settings store: the card's filter writes it, and a change of `spotlights` rebuilds the reel. */
  settings?: SettingsStore;
  /** The recorded characters (the card's Characters list). */
  characters?: () => Promise<string[]>;
  /** Now, µs (the period's clock; tests). */
  now?: () => number;
}

/** The open reel (tests, the dev hook). */
export interface ReelHandle {
  /** The reel playing, or null while the empty stage shows. */
  readonly reel: Reel | null;
  /** The Spotlights card. */
  readonly card: HTMLElement;
  /** Rebuilds for the current settings (a settings change does it by itself). */
  rebuild(): Promise<void>;
}

/**
 * ANSI normal red as Spotlights draws it on its dark wells (owner decision,
 * stage 46): the Default palette's `#800000` is too dark on near-black;
 * this reads at about 3.6:1 there. Only while the Display colours are
 * Default (the host's palette tweak); a chosen theme keeps its own red.
 */
export const SPOTLIGHT_RED = '#c43c3c';

/** The bare reel's options (the Spotlights page's viewer). */
export interface BareReelOptions {
  bare: true;
  /** The spotlight to start from (default 0). */
  start?: number;
  /** Start playing at once (default true). */
  autoplay?: boolean;
  /** The page's own keys, before ← →; true = handled. */
  keys?: (e: KeyboardEvent) => boolean;
  /** Esc (the view's): the page closes its popover, then leaves. */
  onEsc: () => void;
  /** The engine parked at the end of the reel. */
  onEnd?: () => void;
}

/** The open bare reel (the viewer drives it). */
export interface BareReel {
  /** The reel playing. */
  readonly reel: Reel;
  /** Playback time where each spotlight starts (its blank), ms. */
  readonly starts: readonly number[];
  /** Each spotlight's moment as a playback time, ms. */
  readonly moments: readonly number[];
  /** One marker per spotlight at its moment (the track's). */
  readonly marks: readonly PlacedMark[];
  /** The reel's playing length, ms. */
  readonly duration: number;
  /** The engine's speeds, slowest first (the speed arrows' ends). */
  readonly speeds: readonly number[];
  /** The spotlight playing now. */
  index(): number;
  /** What is left of the countdown to the current spotlight's moment: 1 at its start, 0 at the moment and after. */
  countdown(): number;
  /** ← (−1) / → (+1): `navTarget`'s rules; parked at the end, moving on plays again. */
  go(dir: -1 | 1): void;
  /** To the start of spotlight `i`; `play` (default true) plays from there. */
  goTo(i: number, play?: boolean): void;
  /** Plays `reel` on the same host from spotlight `start` (a rebuilt wall). */
  open(reel: Reel, start?: number): void;
  /** Hears every engine change (play, pause, seek, ticks), across `open`s. */
  subscribe(fn: () => void): () => void;
}

/** Opens `reel` on `host` and starts playing. */
export function openSpotlightReel(host: PlayerHost, reel: Reel, opts: BareReelOptions): BareReel;
export function openSpotlightReel(host: PlayerHost, reel: Reel, opts?: ReelOptions): ReelHandle;
export function openSpotlightReel(host: PlayerHost, reel: Reel, opts: ReelOptions | BareReelOptions = {}): ReelHandle | BareReel {
  if ('bare' in opts && opts.bare) return openBareReel(host, reel, opts);
  return openCardReel(host, reel, opts as ReelOptions);
}

/** The panes the reel hides: every one (ADR 0032). */
function hiddenPanes(): Partial<Record<PaneId, boolean>> {
  const panes: Partial<Record<PaneId, boolean>> = {};
  for (const id of PANE_IDS) panes[id] = false;
  return panes;
}

function openBareReel(host: PlayerHost, first: Reel, o: BareReelOptions): BareReel {
  let cur = first;
  let starts: number[] = [];
  let moments: number[] = [];
  let marks: PlacedMark[] = [];
  const subs = new Set<() => void>();
  let unsubEngine: (() => void) | null = null;
  let parked = false;
  const panes = hiddenPanes();

  const emit = (): void => {
    const eng = host.engine;
    const end = !!eng && eng.atEnd && !eng.playing;
    if (end && !parked) {
      parked = true;
      o.onEnd?.();
    } else if (!end) parked = false;
    for (const fn of [...subs]) fn();
  };

  const index = (): number => {
    const eng = host.engine;
    return eng ? spotAt(starts, eng.position) : 0;
  };

  const go = (dir: -1 | 1): void => {
    const eng = host.engine;
    if (!eng) return;
    const t = navTarget(starts, eng.position, dir);
    if (t === null) return;
    const atEnd = eng.atEnd;
    eng.seek(t);
    if (atEnd) eng.play();
  };

  const goTo = (i: number, play = true): void => {
    const eng = host.engine;
    if (!eng) return;
    const t = starts[Math.max(0, Math.min(starts.length - 1, i))] ?? 0;
    eng.seek(t);
    if (play && !eng.playing) eng.play();
  };

  const keys = (e: KeyboardEvent): boolean => {
    if (o.keys?.(e)) return true;
    if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return false;
    if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else return false;
    return true;
  };

  const open = (r: Reel, start = 0): void => {
    cur = r;
    unsubEngine?.();
    unsubEngine = null;
    parked = false;
    // The brighter red, Display's font and colours (kept across opens), every pane off.
    host.setPaletteTweak({ 1: SPOTLIGHT_RED });
    host.setViewer({ ...host.viewerOverrides, panes });
    host.openChain(
      r.chain,
      [],
      { character: r.spots[0]?.character ?? '' },
      {
        edits: { windows: r.spots.map((s) => ({ fromUs: s.fromUs, toUs: s.toUs })), blankLines: BLANK_LINES },
        marks: (tl) => {
          starts = spotStarts(tl);
          moments = spotMoments(tl, r.spots);
          marks = reelMarks(tl, r.spots);
          return marks;
        },
        view: { bare: true, hours: true, onEsc: o.onEsc, keys },
        viewerSettings: 'display',
        autoplay: false,
      },
    );
    // Script panes too (ADR 0053 P1): their ids are known once the timeline is.
    host.hideTempPanes();
    if (host.scriptPaneIds.length > 0) {
      for (const id of host.scriptPaneIds) panes[id] = false;
      host.setViewer({ ...host.viewerOverrides, panes });
    }
    const eng = host.engine;
    if (!eng) return;
    unsubEngine = eng.subscribe(emit);
    const t = starts[Math.max(0, Math.min(starts.length - 1, start))] ?? 0;
    if (t > 0) eng.seek(t);
    if (o.autoplay !== false) eng.play();
    emit();
  };

  host.onDispose(() => {
    unsubEngine?.();
    subs.clear();
  });

  open(first, o.start ?? 0);

  return {
    get reel() {
      return cur;
    },
    get starts() {
      return starts;
    },
    get moments() {
      return moments;
    },
    get marks() {
      return marks;
    },
    get duration() {
      return host.engine?.duration ?? 0;
    },
    speeds: SPEEDS,
    index,
    countdown() {
      const eng = host.engine;
      if (!eng) return 0;
      const i = spotAt(starts, eng.position);
      return countdownLeft(starts[i] ?? 0, moments[i] ?? 0, eng.position);
    },
    go,
    goTo,
    open,
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

/** The full-page reel with the card (the shell's `openSpotlights`). */
function openCardReel(host: PlayerHost, reel: Reel, opts: ReelOptions): ReelHandle {
  const doc = host.el.ownerDocument;
  const win = doc.defaultView!;
  const now = opts.now ?? (() => Date.now() * 1000);
  let cur: Reel | null = null;
  let starts: number[] = [];
  let moments: number[] = [];

  const go = (dir: -1 | 1): void => {
    const eng = host.engine;
    if (!eng) return;
    const t = navTarget(starts, eng.position, dir);
    if (t === null) return;
    // Parked at the end: moving on plays again.
    const parked = eng.atEnd;
    eng.seek(t);
    if (parked) eng.play();
  };

  const onEsc = (): void => host.close();
  const hints: HeaderHint[] = [
    { text: '← → Prev/next', drop: 3 },
    { text: 'Shift ← → 10 s', drop: 1 },
    { text: '1–6 Speed', drop: 2 },
    { text: 'ESC Back', drop: Infinity, cls: 'wc-player-back', onClick: onEsc },
  ];
  const header = (): PlayerHeaderModel => {
    const spots = cur?.spots ?? [];
    const eng = host.engine;
    const i = eng ? spotAt(starts, eng.position) : 0;
    const s = spots[i];
    if (!s) return { left: [], hints };
    return {
      left: [
        { text: s.character + (s.level !== undefined ? ` (L${s.level})` : ''), cls: 'wc-player-name' },
        { text: `SPOTLIGHT ${i + 1} / ${spots.length}` },
        { text: fmtDate(s.atUs) },
      ],
      hints,
    };
  };

  // ----------------------------------------------------------------- card

  const card = new SpotlightCard(doc, {
    onNav: go,
    ...(opts.settings ? { filter: { settings: opts.settings, characters: opts.characters ?? (async () => []) } } : {}),
  });
  host.el.append(card.el);
  let emptyEl: HTMLDivElement | null = null;

  // The card follows the engine (ticks at least every 250 ms while playing)
  // and the player's width.
  let raf: number | null = null;
  const draw = (): void => {
    raf = null;
    if (host.isClosed) return;
    card.place(host.el.clientWidth);
    const e = host.engine;
    const spots = cur?.spots;
    if (!e || !spots || spots.length === 0) return card.update(null);
    const p = e.position;
    const i = spotAt(starts, p);
    card.update({ index: i, total: spots.length, spot: spots[i]!, countdown: countdownLeft(starts[i] ?? 0, moments[i] ?? 0, p) });
  };
  const schedule = (): void => {
    if (raf === null) raf = win.requestAnimationFrame(draw);
  };
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(schedule);
    ro.observe(host.el);
    host.onDispose(() => ro.disconnect());
  }

  // ---------------------------------------------------------------- reel

  const panes: Partial<Record<PaneId, boolean>> = {};
  for (const id of PANE_IDS) panes[id] = false;

  /** Plays `r` on the host: from spotlight `at.index`, `at.offset` ms in, when given. */
  const play = (r: Reel, at: { index: number; offset: number } | null, autoplay: boolean, hidden: boolean): void => {
    hideEmpty();
    cur = r;
    const { spots, chain } = r;
    // Display's font and colours stay across rebuilds; the panes stay off.
    host.setViewer({ ...host.viewerOverrides, panes });
    host.openChain(
      chain,
      [],
      { character: spots[0]!.character },
      {
        edits: { windows: spots.map((s) => ({ fromUs: s.fromUs, toUs: s.toUs })), blankLines: BLANK_LINES },
        marks: (tl) => {
          starts = spotStarts(tl);
          moments = spotMoments(tl, spots);
          return reelMarks(tl, spots);
        },
        view: {
          header,
          onEsc,
          closeTitle: 'Back to the start page (Esc)',
          shiftSeek: true,
          keys: (e) => {
            if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return false;
            if (e.key === 'ArrowRight') go(1);
            else if (e.key === 'ArrowLeft') go(-1);
            else return false;
            return true;
          },
          startHidden: hidden,
        },
        viewerSettings: 'display',
        autoplay,
      },
    );
    // Script panes too (ADR 0053 P1): their ids are known once the timeline is.
    host.hideTempPanes();
    if (host.scriptPaneIds.length > 0) {
      for (const id of host.scriptPaneIds) panes[id] = false;
      host.setViewer({ ...host.viewerOverrides, panes });
    }
    const eng = host.engine;
    if (eng && at) {
      const start = starts[at.index] ?? 0;
      const end = at.index + 1 < starts.length ? starts[at.index + 1]! : eng.duration;
      eng.seek(start + Math.max(0, Math.min(at.offset, end - start - 1)));
    }
    eng?.subscribe(schedule);
    draw();
  };

  // --------------------------------------------------------- empty stage

  const onEmptyKey = (e: KeyboardEvent): void => {
    if (e.isComposing || (e.target as Element | null)?.closest?.(`[${OWN_KEYS_ATTR}]`)) return;
    // The player owns the keyboard, as its view does.
    e.stopPropagation();
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key !== 'Escape') return;
    e.preventDefault();
    host.close();
  };

  const showEmpty = (): void => {
    cur = null;
    starts = [];
    moments = [];
    draw();
    if (emptyEl) return;
    const el = doc.createElement('div');
    el.className = 'wc-spot-empty';
    const head = doc.createElement('div');
    head.className = 'wc-spot-empty-head';
    const chip = doc.createElement('span');
    const name = doc.createElement('b');
    name.textContent = 'Spotlights';
    const back = doc.createElement('span');
    back.className = 'wc-spot-empty-back';
    back.textContent = 'ESC Back';
    back.addEventListener('click', (e) => {
      e.stopPropagation();
      onEsc();
    });
    chip.append(name, ' · Nothing to play · ', back);
    head.append(chip);
    el.append(head);
    // Under the card (it stays with its filter).
    host.el.insertBefore(el, card.el);
    emptyEl = el;
    win.addEventListener('keydown', onEmptyKey, true);
  };

  function hideEmpty(): void {
    if (!emptyEl) return;
    emptyEl.remove();
    emptyEl = null;
    win.removeEventListener('keydown', onEmptyKey, true);
  }

  // ------------------------------------------------------------- rebuild

  let seq = 0;
  const rebuild = async (): Promise<void> => {
    if (!opts.source || !opts.settings || host.isClosed) return;
    const my = ++seq;
    const r = await opts.source.load(opts.settings.get().spotlights, now());
    if (my !== seq || host.isClosed) return;
    if ('empty' in r) {
      host.clearChain();
      showEmpty();
      return;
    }
    let at: { index: number; offset: number } | null = null;
    let autoplay = true;
    const eng = host.engine;
    if (eng && cur && !eng.atEnd) {
      const i = spotAt(starts, eng.position);
      const id = cur.spots[i]?.id;
      const j = r.spots.findIndex((s) => s.id === id);
      if (j >= 0) at = { index: j, offset: eng.position - (starts[i] ?? 0) };
      autoplay = eng.playing;
    }
    play(r, at, autoplay, false);
  };

  const unsub = opts.settings?.subscribe((next, prev) => {
    if (JSON.stringify(next.spotlights) !== JSON.stringify(prev.spotlights)) void rebuild();
  });
  host.onDispose(() => {
    seq++;
    unsub?.();
    hideEmpty();
    if (raf !== null) win.cancelAnimationFrame(raf);
    card.dispose();
  });

  play(reel, null, true, true);

  return {
    get reel() {
      return cur;
    },
    card: card.el,
    rebuild,
  };
}
