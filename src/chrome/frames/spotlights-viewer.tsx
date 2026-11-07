// The Spotlights viewer (stage 46, B "Galleriet"; ADR 0019, 0032, 0131):
// the reel in the Spotlights page's big box, grown out of the card it
// starts from, playing on through the rest. The wall
// (spotlights-wall.tsx) mounts it over its box's window while a card plays
// and unmounts it on `onLeave(current)`.
//
//   [Back]                       ( Spotlights )
//      ☠ DEATH                                          ‹  3 / 12  ›
//      Death (level 42)
//      RASTA · level 42 · Wednesday 26 September 2026
//      ─────────────────────────────────────────────────────────── countdown
//      ┌────────────────────────────────────────────────────────┐
//      │ the game text (the embedded, bare player)               │
//      │                                   [End of the reel …]   │
//      └────────────────────────────────────────────────────────┘
//        ☠        »            ⚔        ☆          markers at the moments
//      ━━━━━━━━━━●──┼────────────┼──────────┼────── track (ticks between spotlights)
//      |◀  ↺10  (❚❚)  ↻10   ‹ 1× ›   00:40 / 02:39          [Display] [⛶]
//
// The game well is a `PlayerHost` from `services.embedPlayer` (the shell's
// `playerHost` while it lives) playing the reel bare (spotlight-mode.ts
// `openSpotlightReel(…, { bare: true })`): the view keeps its keys, the
// pause cursor line, the wheel and clicks on lines; the head, countdown,
// track and control row here drive the engine and the view's `press`.
//
// Grow and shrink. The viewer is laid out at its full size at once; its
// `clip-path` (and opacity) animate from the card's rectangle to the whole
// window (480 ms) and back into the current spotlight's card on leaving
// (380 ms; `onLeave` after it), so nothing reflows while it moves. Reduced
// motion: no animation.
//
// Keys (the view owns the keyboard while it shows; `keys` comes first):
// ← → previous / next spotlight (spotlight-mode), D the Display popover
// (while it is open ↑ ↓ choose the row, ← → the value, D or Esc close it),
// P Play again on the end card, Esc closes the popover, then leaves. Every
// other key is the view's (Shift+← → ±10 s, Home, Space, 1–6, ↑ ↓ PgUp PgDn
// End). The stack's key listener runs first: a key layer on the frame
// swallows every key there (and takes Esc itself before the host is ready).
//
// The host stays alive while the page is open (ADR 0131): on leaving, the
// slot with the paused host is taken out of the document (the view's keys
// then pass, its root not shown) and kept here; the next card puts it back
// and seeks (or opens the wall's new reel), so the player chunk and the
// host are made once. It is disposed when the page's frame leaves the
// document (a MutationObserver on the direct children of its ancestors,
// which change only on a push, a pop or a page swap), or at once when
// there is no page frame.
//
// The brighter red (ANSI 1 on the dark wells, Default colours only) is the
// host's palette tweak, set by spotlight-mode.ts. The start sky pauses
// while the viewer shows (`useSkyPause`).

import type { VNode } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { PlayerHost } from '../../app/player-host';
import type { BareReel } from '../../player/spotlight-mode';
import type { Reel } from '../../player/spotlight-reel';
import type { PlacedMark } from '../../player/strip';
import type { ViewerControls } from '../../player/view';
import type { ViewerFont, ViewerTheme } from '../../player/viewer';
import { canFullscreen, isFullscreen, onFullscreenChange, toggleFullscreen } from '../../core/fullscreen';
import { device } from '../../core/device';
import { type KindIcon, KIND_COLOR, KIND_PATH, LETTER_KIND } from '../../player/icons';
import { fmtClock } from '../../player/strip';
import { KIND_LABEL } from '../../share/spotlights';
import { useServices } from '../kit/hooks';
import { GlassButton, Icon, type IconDraw, type IconName, Popover, Seg, letterAction, useReducedMotion } from '../kit/look';
import { useKeyLayer, useNav } from '../kit/stack';
import { useSkyPause } from '../start-surface';
import './spotlights-viewer.css';

export interface SpotlightsViewerProps {
  /** The wall's current reel. */
  reel: Reel;
  /** The card index to play from. */
  start: number;
  /** Card `i`'s rectangle (the wall scrolls it into view first); without `i`, the chosen card's. */
  cardRect: (i?: number) => DOMRect | null;
  /** Back on the wall with spotlight `current`'s card chosen (after the shrink). */
  onLeave: (current: number) => void;
}

// ------------------------------------------------------------ timings and texts

/** The grow out of the card, and the shrink back into one, ms (stage 46). */
export const GROW_MS = 480;
export const SHRINK_MS = 380;
const GROW_EASE = 'cubic-bezier(.3,.8,.2,1)';
const SHRINK_EASE = 'cubic-bezier(.5,0,.3,1)';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** `Wednesday 26 September 2026`, local time, English names whatever the locale. */
export function longDate(us: number): string {
  const d = new Date(us / 1000);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const FONTS: ReadonlyArray<{ value: ViewerFont; label: string }> = [
  { value: 'default', label: 'Default' },
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
];
const THEMES: ReadonlyArray<{ value: ViewerTheme; label: string }> = [
  { value: 'default', label: 'Default' },
  { value: 'dark', label: 'Dark' },
  { value: 'teal', label: 'Teal' },
  { value: 'paper', label: 'Paper' },
  { value: 'sepia', label: 'Sepia' },
  { value: 'slate', label: 'Slate' },
];

/** A kind's icon for the kit (the player's drawing, 24 units): the wall's cards and chips, the viewer's head. */
export const KIND_ICON: Readonly<Record<KindIcon, IconDraw>> = {
  death: { draw: <path d={KIND_PATH.death} />, box: 24 },
  pkill: { draw: <path d={KIND_PATH.pkill} />, box: 24 },
  level: { draw: <path d={KIND_PATH.level} />, box: 24 },
  achievement: { draw: <path d={KIND_PATH.achievement} />, box: 24 },
};

/** The clip-path that shows only `card` of `box` (both client rectangles); clamped to the box. */
export function cardInset(card: DOMRect | null, box: DOMRect): string {
  if (!card || !(card.width > 0) || !(card.height > 0)) return 'inset(30% 30% 30% 30% round 6px)';
  const c = (n: number): string => `${Math.max(0, Math.round(n))}px`;
  return `inset(${c(card.top - box.top)} ${c(box.right - card.right)} ${c(box.bottom - card.bottom)} ${c(card.left - box.left)} round 6px)`;
}
const FULL = 'inset(0px 0px 0px 0px round 0px)';

/** Markers closer than this (px) share one on the track. */
const MARK_NEAR = 20;

/** The track's markers grouped: near ones share one (the first's offset, every tip). */
export function groupMarks(marks: readonly PlacedMark[], duration: number, width: number): Array<{ offset: number; marks: PlacedMark[] }> {
  const out: Array<{ offset: number; marks: PlacedMark[]; x: number }> = [];
  if (!(duration > 0)) return out;
  const sorted = [...marks].sort((a, b) => a.offset - b.offset);
  for (const m of sorted) {
    const x = (m.offset / duration) * Math.max(1, width);
    const last = out[out.length - 1];
    if (last && x - last.x < MARK_NEAR) last.marks.push(m);
    else out.push({ offset: m.offset, marks: [m], x });
  }
  return out.map(({ offset, marks: ms }) => ({ offset, marks: ms }));
}

// ------------------------------------------------------------ the kept host

/** The mounted viewer's handlers (the reel's callbacks reach whichever viewer shows it). */
interface Bind {
  keys(e: KeyboardEvent): boolean;
  onEsc(): void;
  onEnd(): void;
}

interface Kept {
  host: PlayerHost;
  slot: HTMLDivElement;
  reel: BareReel;
  bind: { current: Bind };
  /** Watches the page's frame while parked. */
  watch: MutationObserver | null;
}

/** The parked host of the open Spotlights page (one at a time: the shell refuses a second player). */
let kept: Kept | null = null;

/**
 * The host being made (the embed and the chunk load), settled once it is
 * `kept` (or failed). A viewer opened meanwhile (the first one left before
 * its host was ready) waits for it and adopts it instead of asking the
 * shell for a second player, which it would refuse.
 */
let creating: Promise<void> | null = null;

function disposeKept(): void {
  const k = kept;
  kept = null;
  if (!k) return;
  k.watch?.disconnect();
  k.host.dispose();
  k.slot.remove();
}

/** The parked host (tests, the dev hook). */
export function keptSpotlightsHost(): PlayerHost | null {
  return kept && !kept.host.isClosed ? kept.host : null;
}

/**
 * Parks `k` (paused, out of the document) until the page's `frame` leaves
 * the document: popped from its stack, or the whole start page unmounted.
 * One MutationObserver watches the direct children of each of the frame's
 * ancestors (they change only on a push, a pop or a page swap); a check
 * after the current task covers an unmount that was under way.
 */
function park(k: Kept, frame: HTMLElement | null): void {
  const eng = k.host.engine;
  if (eng?.playing) eng.pause();
  k.slot.remove();
  if (!frame || !frame.isConnected || typeof MutationObserver !== 'function') return disposeKept();
  k.watch?.disconnect();
  const check = (): void => {
    if (kept === k && !k.slot.isConnected && !frame.isConnected) disposeKept();
  };
  const watch = new MutationObserver(check);
  for (let el = frame.parentElement; el; el = el.parentElement) watch.observe(el, { childList: true });
  k.watch = watch;
  setTimeout(check, 0);
}

// ------------------------------------------------------------ the viewer

export function SpotlightsViewer(p: SpotlightsViewerProps): VNode {
  const services = useServices();
  const nav = useNav();
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const wellRef = useRef<HTMLDivElement>(null);
  const cdRef = useRef<HTMLElement>(null);
  const wellBox = useRef<HTMLDivElement>(null);
  const props = useRef(p);
  props.current = p;
  useSkyPause(true);

  const [k, setK] = useState<Kept | null>(null);
  const kRef = useRef<Kept | null>(null);
  kRef.current = k;
  const [display, setDisplayState] = useState<{ row: number | null } | null>(null);
  const displayRef = useRef(display);
  /** The popover's state, current at once for the next key of the same task. */
  const setDisplay = (d: { row: number | null } | null): void => {
    displayRef.current = d;
    setDisplayState(d);
  };
  const leaving = useRef(false);
  /** The popover was closed by the frame's Esc (its key layer) in the current task: the view's Esc that follows is the same key. */
  const escClosed = useRef(false);
  const [, setTick] = useState(0);
  const sig = useRef('');
  const drawRef = useRef<() => void>(() => {});
  const trackDraw = useRef<() => void>(() => {});

  /** The well takes the player's background (the recorded one or Display's theme), so the inset game text sits on one colour. */
  const syncBg = (): void => {
    const el = wellBox.current;
    const bg = kRef.current?.host.el.style.getPropertyValue('--term-bg').trim();
    if (el && bg && el.style.backgroundColor !== bg) el.style.backgroundColor = bg;
  };

  // ---------------------------------------------------------------- leave

  const leave = (): void => {
    if (leaving.current) return;
    leaving.current = true;
    setDisplay(null);
    const kk = kRef.current;
    const eng = kk?.host.engine;
    if (eng?.playing) eng.pause();
    const i = kk ? kk.reel.index() : props.current.start;
    const root = rootRef.current;
    const done = (): void => props.current.onLeave(i);
    if (reduced || !root || typeof root.animate !== 'function') return done();
    const box = root.getBoundingClientRect();
    const to = cardInset(props.current.cardRect(i), box);
    const a = root.animate([{ clipPath: FULL, opacity: 1 }, { clipPath: to, opacity: 0.4 }], { duration: SHRINK_MS, easing: SHRINK_EASE, fill: 'forwards' });
    a.finished.then(done, done);
  };

  const toggleDisplay = (row: number | null): void => setDisplay(displayRef.current ? null : { row });

  const playAgain = (): void => {
    const eng = kRef.current?.host.engine;
    if (!eng) return;
    eng.seek(0);
    if (!eng.playing) eng.play();
  };

  /** The Display popover's keys (it is open): ↑ ↓ the row, ← → the value, D or Esc close. */
  const displayKey = (e: KeyboardEvent): boolean => {
    const d = displayRef.current;
    const vc = kRef.current?.host.viewerControls(true);
    if (!d || !vc) return false;
    const row = d.row ?? 0;
    const step = (dir: number): void => {
      if (row === 0) {
        const i = FONTS.findIndex((f) => f.value === vc.font());
        vc.setFont(FONTS[Math.max(0, Math.min(FONTS.length - 1, i + dir))]!.value);
      } else {
        const i = THEMES.findIndex((t) => t.value === vc.theme());
        vc.setTheme(THEMES[Math.max(0, Math.min(THEMES.length - 1, i + dir))]!.value);
      }
      syncBg();
      setDisplay({ row });
    };
    switch (e.key) {
      case 'Escape':
        setDisplay(null);
        return true;
      case 'ArrowUp':
      case 'ArrowDown':
        setDisplay({ row: d.row === null ? 0 : e.key === 'ArrowUp' ? 0 : 1 });
        return true;
      case 'ArrowLeft':
        step(-1);
        return true;
      case 'ArrowRight':
        step(1);
        return true;
    }
    return false;
  };

  const bind: Bind = {
    keys: (e) => {
      if (leaving.current) return true;
      if (e.key === 'Escape' && escClosed.current) {
        escClosed.current = false;
        return true;
      }
      if (e.ctrlKey || e.altKey || e.metaKey) return false;
      if (displayRef.current) {
        if (displayKey(e)) return true;
        if (letterAction(e, { d: () => setDisplay(null) })) return true;
      } else if (letterAction(e, { d: () => toggleDisplay(0) })) return true;
      const eng = kRef.current?.host.engine;
      if (eng?.atEnd && !eng.playing && letterAction(e, { p: playAgain })) return true;
      return false;
    },
    onEsc: () => {
      if (displayRef.current) return setDisplay(null);
      leave();
    },
    onEnd: () => drawRef.current(),
  };
  if (k) k.bind.current = bind;

  // The frame's keys while the viewer shows: the stack's listener runs before
  // the view's, so a layer over the page swallows every key there (the
  // view handles them); before the host is ready it takes Esc itself.
  useKeyLayer((_e, nk) => {
    if (nk === 'back' && !kRef.current) leave();
    return true;
  });

  // ---------------------------------------------------------------- grow

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || reduced || typeof root.animate !== 'function') return;
    const from = cardInset(props.current.cardRect(props.current.start), root.getBoundingClientRect());
    root.animate([{ clipPath: from, opacity: 0.6 }, { clipPath: FULL, opacity: 1 }], { duration: GROW_MS, easing: GROW_EASE });
  }, []);

  // ---------------------------------------------------------------- the host

  useEffect(() => {
    let dead = false;
    const frame = rootRef.current?.closest<HTMLElement>('.wc-frame') ?? null;
    const shared = { current: bind };
    const mine = (kk: Kept): void => {
      kk.bind.current = bind;
      setK(kk);
    };
    void (async () => {
      while (creating) {
        await creating;
        if (dead) return;
      }
      const well = wellRef.current;
      if (!well) return;
      const { reel, start } = props.current;
      const old = kept;
      if (old && !old.host.isClosed) {
        old.watch?.disconnect();
        old.watch = null;
        old.bind.current = bind;
        well.append(old.slot);
        if (old.reel.reel === reel) old.reel.goTo(start, true);
        else old.reel.open(reel, start);
        if (dead) return park(old, frame);
        return mine(old);
      }
      disposeKept();
      const slot = well.ownerDocument.createElement('div');
      slot.className = 'wc-spv-slot';
      well.append(slot);
      let host: PlayerHost | null = null;
      let made!: () => void;
      const making = new Promise<void>((r) => (made = r));
      creating = making;
      try {
        const [h, mod] = await Promise.all([
          services.embedPlayer ? services.embedPlayer(slot) : Promise.resolve(null),
          import('../../player/spotlight-mode'),
        ]);
        host = h;
        if (!host) throw new Error('no player');
        const handle = mod.openSpotlightReel(host, reel, {
          bare: true,
          start,
          keys: (e) => shared.current.keys(e),
          onEsc: () => shared.current.onEsc(),
          onEnd: () => shared.current.onEnd(),
        });
        const kk: Kept = { host, slot, reel: handle, bind: shared, watch: null };
        kept = kk;
        host.onDispose(() => {
          if (kept === kk) kept = null;
        });
        if (dead) return park(kk, frame);
        mine(kk);
      } catch (err) {
        console.error('WebCockpit: the Spotlights viewer could not open', err);
        host?.dispose();
        slot.remove();
        if (dead) return;
        nav.flash('The spotlight could not be played.', 'fail');
        props.current.onLeave(start);
      } finally {
        if (creating === making) creating = null;
        made();
      }
    })();
    return () => {
      dead = true;
      const kk = kRef.current;
      if (kk && kept === kk) park(kk, frame);
    };
  }, []);

  // ---------------------------------------------------------------- following the engine

  useEffect(() => {
    if (!k) return;
    const win = rootRef.current?.ownerDocument.defaultView ?? window;
    let raf: number | null = null;
    const draw = (): void => {
      raf = null;
      if (k.host.isClosed) return;
      const eng = k.host.engine;
      if (!eng) return;
      // The countdown: drains from both sides to the moment (gone after
      // it). A scale on its own layer: no layout or paint per frame.
      const left = k.reel.countdown();
      const cd = cdRef.current;
      if (cd) {
        const off = !(left > 0);
        if (cd.hidden !== off) cd.hidden = off;
        const t = `scaleX(${Math.max(0, Math.min(1, left)).toFixed(3)})`;
        if (!off && cd.style.transform !== t) cd.style.transform = t;
      }
      trackDraw.current();
      syncBg();
      const s = `${k.reel.index()}|${eng.playing}|${eng.speed}|${Math.floor(eng.position / 1000)}|${Math.floor(eng.duration / 1000)}|${eng.atEnd}|${k.reel.reel.spots.length}`;
      if (s !== sig.current) {
        sig.current = s;
        setTick((n) => n + 1);
      }
      if (eng.playing) raf = win.requestAnimationFrame(draw);
    };
    const schedule = (): void => {
      if (raf === null) raf = win.requestAnimationFrame(draw);
    };
    drawRef.current = schedule;
    const off = k.reel.subscribe(schedule);
    schedule();
    return () => {
      off();
      if (raf !== null) win.cancelAnimationFrame(raf);
    };
  }, [k]);

  // ---------------------------------------------------------------- render

  const reel = k?.reel ?? null;
  const eng = k?.host.engine ?? null;
  const spots = reel?.reel.spots ?? p.reel.spots;
  const n = spots.length;
  const i = reel ? reel.index() : Math.max(0, Math.min(n - 1, p.start));
  const s = spots[i];
  const kind = (s?.kind ?? 'death') as KindIcon;
  const ended = !!eng && eng.atEnd && !eng.playing;
  const vc = k?.host.viewerControls(true) ?? null;

  return (
    <div class="wc-spv" ref={rootRef} role="region" aria-label="Spotlight" data-ended={ended ? '' : undefined}>
      <div class="wc-spv-head">
        <div class="wc-spv-title" aria-live="polite">
          {s && (
            <>
              <div class="wc-spv-kind" style={{ '--k': KIND_COLOR[kind] }} data-kind={kind}>
                <Icon {...KIND_ICON[kind]} />
                {KIND_LABEL[s.kind]}
              </div>
              <h2 class="wc-spv-label" title={s.label}>
                {s.label}
              </h2>
              <div class="wc-spv-meta">
                <b>{s.character}</b>
                {s.level !== undefined ? ` · level ${s.level}` : ''} · {longDate(s.atUs)}
              </div>
            </>
          )}
        </div>
        <div class="wc-spv-nav">
          <GlassButton id="prev" icon="prev" title="Previous spotlight (←)" small keepIcon disabled={!reel || i <= 0} onClick={() => reel?.go(-1)} />
          <span class="wc-spv-count">{n > 0 ? `${i + 1} / ${n}` : ''}</span>
          <GlassButton id="next" icon="next" title="Next spotlight (→)" small keepIcon disabled={!reel || i + 1 >= n} onClick={() => reel?.go(1)} />
        </div>
      </div>
      <div class="wc-spv-cd" aria-hidden="true">
        <i ref={cdRef} hidden />
      </div>
      <div class="wc-spv-well" ref={wellBox}>
        {/* The host's slot goes in here (never rendered into by Preact). */}
        <div class="wc-spv-slots" ref={wellRef} />
        {ended && (
          <div class="wc-spv-end" role="status">
            <div class="wc-spv-end-in">
              <div class="wc-spv-end-t">End of the reel</div>
              <div class="wc-spv-end-n">
                {n} of {n}
              </div>
              <div class="wc-spv-end-btns">
                <GlassButton id="again" label="Play again" letter="p" icon="play" keepIcon primary onClick={playAgain} />
                <GlassButton id="wall" label="Back to the wall" icon="back" keepIcon title="Back to the wall (Esc)" onClick={leave} />
              </div>
            </div>
          </div>
        )}
      </div>
      <Track k={k} draw={trackDraw} />
      <Controls k={k} display={display !== null} onDisplay={() => toggleDisplay(null)} />
      {display && vc && (
        <Popover
          label="Display"
          anchor={() => rootRef.current?.querySelector<HTMLElement>('.wc-spv-ctl [data-btn="display"]') ?? null}
          onClose={() => {
            // The stack's key listener runs before the view's: an Esc that closed it here must not leave too.
            escClosed.current = true;
            setTimeout(() => (escClosed.current = false), 0);
            setDisplay(null);
          }}
        >
          <DisplayPanel vc={vc} row={display.row} onChange={syncBg} onClose={() => setDisplay(null)} />
        </Popover>
      )}
    </div>
  );
}

// ------------------------------------------------------------ the track

function Track(p: { k: Kept | null; draw: { current: () => void } }): VNode {
  const el = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLDivElement>(null);
  const done = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [hint, setHint] = useState<{ x: number; text: string } | null>(null);
  const [tip, setTip] = useState<{ x: number; marks: PlacedMark[] } | null>(null);
  const drag = useRef<{ id: number; ms: number } | null>(null);
  const reel = p.k?.reel ?? null;
  const eng = p.k?.host.engine ?? null;
  const duration = eng?.duration ?? 0;

  useEffect(() => {
    const t = el.current;
    if (!t) return;
    setW(t.clientWidth);
    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(() => setW(t.clientWidth));
    ro.observe(t);
    return () => ro.disconnect();
  }, []);

  // The played part and the playhead follow the engine (or the drag)
  // without a render: transforms on their own layers (a scale and a
  // move, so no layout or paint per frame), written only when the
  // playhead moves by a device pixel.
  const last = useRef({ px: -1, w: -1 });
  p.draw.current = () => {
    const e = p.k?.host.engine;
    if (!e || !done.current || !head.current) return;
    const pos = drag.current ? drag.current.ms : e.position;
    const f = e.duration > 0 ? Math.max(0, Math.min(1, pos / e.duration)) : 0;
    const dpr = el.current?.ownerDocument.defaultView?.devicePixelRatio || 1;
    const px = Math.round(f * w * dpr) / dpr;
    if (px === last.current.px && w === last.current.w) return;
    last.current = { px, w };
    done.current.style.transform = `scaleX(${w > 0 ? (px / w).toFixed(5) : 0})`;
    head.current.style.transform = `translateX(${px}px)`;
  };
  // A new width (and the first one): draw again, also while paused.
  useLayoutEffect(() => {
    p.draw.current();
  }, [w]);

  const at = (clientX: number): number => {
    const r = line.current?.getBoundingClientRect();
    if (!r || !(r.width > 0)) return 0;
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration;
  };
  const showHint = (clientX: number, ms: number): void => {
    const r = el.current?.getBoundingClientRect();
    if (!r) return;
    setHint({ x: Math.round(clientX - r.left), text: fmtClock(ms, true) });
  };

  const onDown = (e: PointerEvent): void => {
    if (e.button !== 0 || !eng || !(duration > 0)) return;
    if ((e.target as Element | null)?.closest?.('.wc-spv-mk')) return;
    e.preventDefault();
    try {
      el.current?.setPointerCapture(e.pointerId);
    } catch {
      // A synthetic pointer.
    }
    drag.current = { id: e.pointerId, ms: at(e.clientX) };
    showHint(e.clientX, drag.current.ms);
    p.draw.current();
  };
  const onMove = (e: PointerEvent): void => {
    const d = drag.current;
    if (!d) {
      if (e.pointerType === 'mouse' && !(e.target as Element | null)?.closest?.('.wc-spv-mk')) showHint(e.clientX, at(e.clientX));
      return;
    }
    if (e.pointerId !== d.id) return;
    d.ms = at(e.clientX);
    showHint(e.clientX, d.ms);
    p.draw.current();
  };
  const onUp = (e: PointerEvent): void => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    setHint(null);
    eng?.seek(at(e.clientX));
  };
  const onCancel = (): void => {
    drag.current = null;
    setHint(null);
    p.draw.current();
  };

  const groups = reel ? groupMarks(reel.marks, duration, w) : [];
  const pos = eng?.position ?? 0;
  const cur = reel ? reel.index() : -1;
  const curMoment = reel?.moments[cur];
  const frac = (ms: number): string => `${(duration > 0 ? (ms / duration) * 100 : 0).toFixed(3)}%`;

  return (
    <div
      class="wc-spv-trk"
      ref={el}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onCancel}
      onPointerLeave={() => {
        if (!drag.current) setHint(null);
      }}
    >
      <div class="wc-spv-trk-line" ref={line}>
        <div class="wc-spv-trk-done" ref={done} />
        <div class="wc-spv-trk-ticks">
          {(reel?.starts ?? []).slice(1).map((t) => (
            <i key={t} style={{ left: frac(t) }} />
          ))}
        </div>
      </div>
      <div class="wc-spv-trk-head" ref={head} />
      <div class="wc-spv-trk-marks">
        {groups.map((g) => {
          const k = LETTER_KIND[g.marks[0]!.letter];
          const isCur = curMoment !== undefined && g.marks.some((m) => m.offset === curMoment);
          return (
            <button
              key={g.offset}
              type="button"
              tabIndex={-1}
              class={'wc-spv-mk' + (pos >= g.offset ? ' is-past' : '') + (isCur ? ' is-cur' : '')}
              style={{ left: frac(g.offset), '--k': KIND_COLOR[k] }}
              data-kind={k}
              aria-label={g.marks.map((m) => m.tip ?? '').join('; ')}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                eng?.seek(g.offset);
              }}
              onPointerEnter={() => setTip({ x: (duration > 0 ? g.offset / duration : 0) * w, marks: g.marks })}
              onPointerLeave={() => setTip(null)}
            >
              <Icon {...KIND_ICON[k]} />
            </button>
          );
        })}
      </div>
      {hint && (
        <div class="wc-spv-trk-hint" style={{ left: `${hint.x}px` }}>
          {hint.text}
        </div>
      )}
      {tip && (
        <div class="wc-spv-trk-tip" style={{ left: `${Math.round(Math.max(80, Math.min(w - 80, tip.x)))}px` }}>
          {tip.marks.map((m, j) => {
            const kk = LETTER_KIND[m.letter];
            const t = m.tip ?? '';
            const c = t.indexOf(': ');
            return (
              <div key={j} class="wc-spv-trk-tl" style={{ '--k': KIND_COLOR[kk] }}>
                <Icon {...KIND_ICON[kk]} />
                <span>
                  {c > 0 ? <b>{t.slice(0, c + 1)}</b> : null}
                  {c > 0 ? t.slice(c + 1) : t}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ the control row

function CtlButton(p: { act: string; title: string; icon: IconName; disabled?: boolean; class?: string; onClick: () => void }): VNode {
  return (
    <button
      type="button"
      class={'wc-spv-cb' + (p.class ? ' ' + p.class : '')}
      data-act={p.act}
      tabIndex={-1}
      title={p.title}
      aria-label={p.title}
      disabled={p.disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        if (!p.disabled) p.onClick();
      }}
    >
      <Icon name={p.icon} />
    </button>
  );
}

function Controls(p: { k: Kept | null; display: boolean; onDisplay: () => void }): VNode {
  const host = p.k?.host ?? null;
  const eng = host?.engine ?? null;
  const reel = p.k?.reel ?? null;
  const press = (a: 'start' | 'back' | 'play' | 'fwd' | 'slower' | 'faster'): void => host?.playerView?.press(a);
  const doc = typeof document === 'undefined' ? null : document;
  const [fs, setFs] = useState(() => !!doc && isFullscreen(doc));
  const canFs = !!doc && canFullscreen(doc) && !device().phone;
  useEffect(() => (doc ? onFullscreenChange(() => setFs(isFullscreen(doc)), doc) : undefined), []);
  const speeds = reel?.speeds ?? [];
  const speed = eng?.speed ?? 1;
  const playing = !!eng?.playing;
  const off = !eng;
  return (
    <div class="wc-spv-ctl">
      <CtlButton act="start" title="To the start (Home)" icon="start" disabled={off} onClick={() => press('start')} />
      <CtlButton act="back" title="Back 10 s (Shift+←)" icon="back10" class="is-ten" disabled={off} onClick={() => press('back')} />
      <button
        type="button"
        class="wc-spv-play"
        data-act="play"
        tabIndex={-1}
        title="Play / pause (Space)"
        aria-label={playing ? 'Pause' : 'Play'}
        disabled={off}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          press('play');
        }}
      >
        <Icon name={playing ? 'pause' : 'play'} />
      </button>
      <CtlButton act="fwd" title="Forward 10 s (Shift+→)" icon="fwd10" class="is-ten" disabled={off} onClick={() => press('fwd')} />
      <span class="wc-spv-spd" title="Speed (1–6)">
        <CtlButton act="slower" title="Slower (1–6)" icon="prev" class="is-sm" disabled={off || speed <= (speeds[0] ?? 0)} onClick={() => press('slower')} />
        <span class="wc-spv-spd-v">{`${speed}×`}</span>
        <CtlButton
          act="faster"
          title="Faster (1–6)"
          icon="next"
          class="is-sm"
          disabled={off || speed >= (speeds[speeds.length - 1] ?? Infinity)}
          onClick={() => press('faster')}
        />
      </span>
      <span class="wc-spv-clock">
        <b>{fmtClock(eng?.position ?? 0, true)}</b> / <span>{fmtClock(eng?.duration ?? 0, true)}</span>
      </span>
      <span class="wc-spv-grow" />
      <GlassButton
        id="display"
        label="Display"
        letter="d"
        icon="display"
        keepIcon
        small
        selected={p.display}
        title="Display: font size and colours (D)"
        disabled={off}
        onClick={p.onDisplay}
      />
      {canFs && (
        <CtlButton act="fullscreen" title={fs ? 'Exit fullscreen' : 'Fullscreen'} icon="fullscreen" class="is-fs" onClick={() => doc && void toggleFullscreen(doc)} />
      )}
    </div>
  );
}

// ------------------------------------------------------------ Display

function DisplayPanel(p: { vc: ViewerControls; row: number | null; onChange: () => void; onClose: () => void }): VNode {
  const [, setN] = useState(0);
  const font = p.vc.font();
  const theme = p.vc.theme();
  const set = (fn: () => void): void => {
    fn();
    p.onChange();
    setN((x) => x + 1);
  };
  return (
    <div class="wc-spv-dp">
      <div class="wc-spv-dp-t">
        <span>Display</span>
        <GlassButton id="close" icon="close" title="Close (Esc)" small onClick={p.onClose} />
      </div>
      <div class={'wc-spv-dp-sec' + (p.row === 0 ? ' is-cur' : '')}>Font size</div>
      <Seg
        label="Font size"
        options={FONTS.map((f) => ({ value: f.value, label: f.label }))}
        value={font}
        selected={p.row === 0 ? FONTS.findIndex((f) => f.value === font) : undefined}
        onChange={(v) => set(() => p.vc.setFont(v as ViewerFont))}
      />
      <div class={'wc-spv-dp-sec' + (p.row === 1 ? ' is-cur' : '')}>Colours</div>
      <div class="wc-spv-sws" role="radiogroup" aria-label="Colours">
        {THEMES.map((t) => (
          <button
            key={t.value}
            type="button"
            tabIndex={-1}
            role="radio"
            aria-checked={theme === t.value ? 'true' : 'false'}
            class={'wc-spv-sw' + (theme === t.value ? ' is-on' : '') + (p.row === 1 && theme === t.value ? ' is-sel' : '')}
            data-theme={t.value}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              set(() => p.vc.setTheme(t.value));
            }}
          >
            <i style={{ background: p.vc.swatch(t.value) }} />
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
