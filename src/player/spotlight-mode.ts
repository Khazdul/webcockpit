// The Spotlights reel in the in-app player (ADR 0019 "Spotlights", Inv
// §7.6): a PlayerHost playing one timeline over every spotlight (each its
// window with a blank transition), with the markers of the moments.
//
// Stripped down (owner feedback 2026-09-29, ADR 0032): a spotlight is a
// short snapshot, so the reel shows the game text only — every pane is
// off, script panes included (a viewer override, so later VIEW records
// cannot switch one on).
//
// The bare reel (stage 46, B "Galleriet"; ADR 0131): `openSpotlightReel(
// host, reel, { bare: true, start, onEsc, keys, onEnd })` plays the reel
// on an embedded host (`services.embedPlayer`) inside the Spotlights page's
// viewer (src/chrome/frames/spotlights-viewer.tsx), which draws its own
// head, countdown, track and controls. The view is bare (no header, rail,
// control box, card or auto-hide) with `hours`; it starts at spotlight
// `start` and plays on through the rest; plain ← → go to the previous or
// next spotlight (after the page's own `keys`; Shift+← → are the view's
// ±10 s, Home its To the start); the engine parks at the end and `onEnd`
// tells the page (its end card). No settings subscription and no empty
// stage: the filter lives on the page's wall, which hands a new reel to
// `open(reel, start)` on the same host. The brighter red (ANSI 1,
// `SPOTLIGHT_RED`) is the host's palette tweak, drawn only while the
// Display colours are Default (the host's rule).
//
// The full-page reel with the Spotlights card (stage 32c, ADR 0114) and
// the shell's `openSpotlights` that opened it are gone (stage 46 wave 3).

import type { PlayerHost } from '../app/player-host';
import type { SettingsStore } from '../settings';
import type { HeaderHint, PlacedMark } from './strip';
import type { PlayerHeaderModel } from './view';
import { type Reel, countdownLeft, fmtDate, navTarget, reelMarks, spotAt, spotMoments, spotStarts } from './spotlight-reel';
import { BLANK_LINES } from './timeline';
import { SPEEDS } from './engine';
import { PANE_IDS, type PaneId } from '../layout/types';
import { OWN_KEYS_ATTR } from '../ui/input-pane';
import { SPOTLIGHT_PALETTE_TWEAK, SPOTLIGHT_RED } from '../share/spotlights';


/** ANSI normal red as Spotlights draws it (one source with the wall's stills: share/spotlights.ts). */
export { SPOTLIGHT_RED };

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

/** Opens `reel` on `host` (bare, in the Spotlights viewer) and starts playing. */
export function openSpotlightReel(host: PlayerHost, reel: Reel, opts: BareReelOptions): BareReel {
  return openBareReel(host, reel, opts);
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
    host.setPaletteTweak(SPOTLIGHT_PALETTE_TWEAK);
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
