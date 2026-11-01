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

import type { PlayerHost } from '../app/player-host';
import type { SettingsStore } from '../settings';
import type { HeaderHint } from './strip';
import type { PlayerHeaderModel } from './view';
import { type Reel, type ReelLoader, fmtDate, navTarget, reelMarks, spotAt, spotMoments, spotStarts } from './spotlight-reel';
import { REEL_NO_MATCH, SpotlightCard, countdownLeft } from './spotlight-card';
import { BLANK_LINES } from './timeline';
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

/** Opens `reel` on `host` and starts playing. */
export function openSpotlightReel(host: PlayerHost, reel: Reel, opts: ReelOptions = {}): ReelHandle {
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
