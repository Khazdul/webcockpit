// The Spotlights reel in the in-app player (ADR 0019 "Spotlights", Inv
// §7.6): a PlayerHost playing one timeline over every spotlight (each its
// window with a blank transition), with the spotlight header, the info box
// overlay, `←` / `→` and the markers of the moments. It starts playing with
// the chrome hidden (a pointer move or a key shows it; the info box stays)
// and parks paused at the end (the engine stops there). ESC closes the
// player (the shell shows the start page as it was).
//
// Stripped down (owner feedback 2026-09-29, ADR 0032): a spotlight is a
// short snapshot, so the reel shows the game text only — every pane is
// off, script panes included (a viewer override, so later VIEW records
// cannot switch one on) — and the control box has no viewer settings.
//
// Settings (stage 30 S9, ADR 0110): the control box's gear (`⚙`, where the
// viewer's gear sits in other modes) opens the Spotlights settings popup
// above the box. The popup is the chrome chunk's (`opts.popups` mounts the
// settings popups' layer beside the player element, not in it); it takes
// the keys while it has the focus, Esc closes it before the reel, and the
// chrome stays while it is open. Every change of the settings' `spotlights`
// rebuilds the reel at once (`opts.source` loads it, reading only windows
// not read yet): the current spotlight is kept at the same offset when it
// still passes, otherwise the reel starts from the first; paused stays
// paused, parked at the end plays again; the latest change wins. A change
// that leaves nothing stops the reel and shows an empty stage
// (`No spotlights match your settings.`, `Settings…`, `ESC Back`) until a
// change lets something through again.

import type { PlayerHost } from '../app/player-host';
import type { SettingsPopupsHandle, SettingsPopupsOptions } from '../chrome/popups/surface';
import type { SettingsStore } from '../settings';
import type { HeaderHint } from './strip';
import type { PlayerGear, PlayerHeaderModel } from './view';
import { BOX_W, type Reel, type ReelLoader, countdownHalf, fmtDate, navTarget, reelMarks, spotAt, spotMoments, spotStarts } from './spotlight-reel';
import { SpotlightBox } from './spotlight-box';
import { BLANK_LINES } from './timeline';
import { PANE_IDS, type PaneId } from '../layout/types';
import { noOverrides } from './viewer';
import { placeNear, placePopup } from '../menubar/popup';
import { OWN_KEYS_ATTR } from '../ui/input-pane';

/** The empty stage's text (the start page's "filtered" page says the same). */
export const REEL_NO_MATCH = 'No spotlights match your settings.';

/** What the reel needs beyond the host for its gear and rebuilds (ADR 0110); none = a fixed reel without a gear. */
export interface ReelOptions {
  /** Loads the reel for new settings. */
  source?: ReelLoader;
  /** The settings store: a change of `spotlights` rebuilds the reel. */
  settings?: SettingsStore;
  /** Mounts the settings popups' layer (chrome chunk) into `host`; the gear opens its `spotlights` popup. */
  popups?: (host: HTMLElement, opts: SettingsPopupsOptions) => Promise<SettingsPopupsHandle>;
  /** Now, µs (the period's clock; tests). */
  now?: () => number;
}

/** The open reel (tests, the dev hook). */
export interface ReelHandle {
  /** The reel playing, or null while the empty stage shows. */
  readonly reel: Reel | null;
  /** Opens or closes the settings popup (the gear). */
  toggleSettings(): Promise<void>;
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
    { text: 'ESC Back', drop: Infinity, cls: 'wc-player-back', onClick: onEsc },
    { text: '←→ Prev/next', drop: 2 },
    { text: '1–6 Speed', drop: 1 },
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

  // ------------------------------------------------------- settings popup

  let popups: SettingsPopupsHandle | null = null;
  let popupsP: Promise<SettingsPopupsHandle> | null = null;
  let popHost: HTMLDivElement | null = null;
  let popupOpen = false;
  let emptyEl: HTMLDivElement | null = null;
  let emptyBtn: HTMLElement | null = null;

  /** Above the control box, right edges aligned; on the empty stage next to its `Settings…`. */
  const place = (el: HTMLElement): void => {
    const v = host.playerView;
    const g = v?.gearElement;
    if (v && g && !emptyEl) placePopup(el, g, v.boxElement);
    else if (emptyBtn) placeNear(el, emptyBtn);
  };

  const ensurePopups = (): Promise<SettingsPopupsHandle> => {
    popupsP ??= (async () => {
      const el = doc.createElement('div');
      el.className = 'wc-popups-host';
      // Beside the player, not in it: its pointer and wheel handlers and its
      // recorded font size stay out of the popup.
      host.el.after(el);
      popHost = el;
      const p = await opts.popups!(el, {
        // Keys back to the reel: nothing in the player takes the focus.
        focusInput: () => (doc.activeElement as HTMLElement | null)?.blur?.(),
        onChange: (key) => {
          popupOpen = key !== null;
          host.playerView?.setGearOn(popupOpen);
        },
      });
      popups = p;
      if (host.isClosed) p.dispose();
      return p;
    })();
    return popupsP;
  };

  const toggleSettings = async (): Promise<void> => {
    if (!opts.popups || host.isClosed) return;
    const p = await ensurePopups();
    if (!host.isClosed) p.toggle('spotlights', place);
  };

  const gear: PlayerGear | null = opts.popups ? { title: 'Spotlights settings', onClick: () => void toggleSettings() } : null;

  /** Esc with the popup open (the keys elsewhere) closes it first (S2). */
  const escPopup = (): boolean => (popups?.isOpen ? popups.close() : false);

  // ---------------------------------------------------------------- reel

  const panes: Partial<Record<PaneId, boolean>> = {};
  for (const id of PANE_IDS) panes[id] = false;

  /** Plays `r` on the host: from spotlight `at.index`, `at.offset` ms in, when given. */
  const play = (r: Reel, at: { index: number; offset: number } | null, autoplay: boolean, hidden: boolean): void => {
    hideEmpty();
    cur = r;
    const { spots, chain } = r;
    const total = spots.length;
    const box = new SpotlightBox(doc, go);
    host.setViewer({ ...noOverrides(), panes });
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
          keys: (e) => {
            if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.metaKey && escPopup()) return true;
            if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return false;
            if (e.key === 'ArrowRight') go(1);
            else if (e.key === 'ArrowLeft') go(-1);
            else return false;
            return true;
          },
          overlay: { el: box.el, keepVisible: true },
          startHidden: hidden,
          ...(gear ? { gear } : {}),
        },
        viewerSettings: false,
        autoplay,
      },
    );
    // Script panes too (ADR 0053 P1): their ids are known once the timeline is.
    host.hideTempPanes();
    if (host.scriptPaneIds.length > 0) {
      for (const id of host.scriptPaneIds) panes[id] = false;
      host.setViewer({ ...noOverrides(), panes });
    }
    const eng = host.engine;
    if (eng && at) {
      const start = starts[at.index] ?? 0;
      const end = at.index + 1 < starts.length ? starts[at.index + 1]! : eng.duration;
      eng.seek(start + Math.max(0, Math.min(at.offset, end - start - 1)));
    }
    if (popupOpen) host.playerView?.setGearOn(true);

    // The box follows the engine (ticks at least every 250 ms while playing).
    let raf: number | null = null;
    const draw = (): void => {
      raf = null;
      const e = host.engine;
      if (!e || !box.el.isConnected) return;
      const p = e.position;
      const i = spotAt(starts, p);
      const cellW = box.el.offsetWidth / BOX_W;
      // Top-right of the game text, not of the player: the right dock's
      // panes (Character, Group) stay in view (owner review, stage 7).
      const out = host.el.querySelector<HTMLElement>('.wc-output');
      const hostBox = host.el.getBoundingClientRect();
      const outBox = out?.getBoundingClientRect();
      const width = outBox && outBox.width > 0 ? outBox.width : host.el.clientWidth;
      const inset = outBox && outBox.width > 0 ? Math.max(0, hostBox.right - outBox.right) : 0;
      box.el.style.right = `calc(${inset}px + var(--cell-w) * 4)`;
      box.update({
        index: i,
        total,
        spot: spots[i]!,
        half: countdownHalf(starts[i] ?? 0, moments[i] ?? 0, p),
        cols: cellW > 0 ? Math.floor(width / cellW + 1e-6) : Infinity,
      });
    };
    const schedule = (): void => {
      if (raf === null) raf = win.requestAnimationFrame(draw);
    };
    eng?.subscribe(schedule);
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => (box.el.isConnected ? schedule() : ro.disconnect()));
      ro.observe(host.el);
    }
    draw();
  };

  // --------------------------------------------------------- empty stage

  const onEmptyKey = (e: KeyboardEvent): void => {
    if (e.isComposing || (e.target as Element | null)?.closest?.(`[${OWN_KEYS_ATTR}]`)) return;
    // The player owns the keyboard, as its view does.
    e.stopPropagation();
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === 'Escape') {
      if (!escPopup()) host.close();
    } else if (e.key === 'Enter' || e.key === ' ') void toggleSettings();
    else return;
    e.preventDefault();
  };

  const line = (text: string, cls = ''): HTMLDivElement => {
    const d = doc.createElement('div');
    d.className = `wc-spot-empty-line${cls ? ' ' + cls : ''}`;
    d.textContent = text;
    return d;
  };

  const showEmpty = (): void => {
    cur = null;
    starts = [];
    moments = [];
    if (emptyEl) return;
    const el = doc.createElement('div');
    el.className = 'wc-spot-empty';
    const btn = line('Settings…', 'wc-spot-empty-btn');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      void toggleSettings();
    });
    const back = line('ESC Back', 'wc-spot-empty-back');
    back.addEventListener('click', (e) => {
      e.stopPropagation();
      onEsc();
    });
    el.append(line(REEL_NO_MATCH), line(''), ...(opts.popups ? [btn, line('')] : []), back);
    host.el.append(el);
    emptyEl = el;
    emptyBtn = btn;
    win.addEventListener('keydown', onEmptyKey, true);
    popups?.place();
  };

  function hideEmpty(): void {
    if (!emptyEl) return;
    emptyEl.remove();
    emptyEl = null;
    emptyBtn = null;
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
    popups?.place();
  };

  const unsub = opts.settings?.subscribe((next, prev) => {
    if (JSON.stringify(next.spotlights) !== JSON.stringify(prev.spotlights)) void rebuild();
  });
  host.onDispose(() => {
    seq++;
    unsub?.();
    hideEmpty();
    popups?.dispose();
    popHost?.remove();
  });

  play(reel, null, true, true);

  return {
    get reel() {
      return cur;
    },
    toggleSettings,
    rebuild,
  };
}
