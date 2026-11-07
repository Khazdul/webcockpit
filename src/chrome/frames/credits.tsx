// Credits (ADR 0019 "Credits", Inv §7.6; stage 47, ADR 0132): the
// chronicle of every character's deeds as a book, round 7's B
// "Krönikeboken" in layout B's large box. The chronicle
// (src/share/chronicle.ts `chronicleBook`) is built once from every stored
// run's events (no log needed), filtered by the Spotlights settings
// (kinds × characters × period, ADR 0110) as they are when the page opens;
// the filter is set on the Spotlights page (no Settings… here).
//
// The book: two pages with a shaded gutter (one page when the book is
// narrower than 640 px), a folio at the foot of each page. Page 1 opens
// with the epigraph (the opening line), then the first chapter; every
// other chapter starts on a new page with its title page (the header's
// words in small caps around the name in Cinzel), an ornament rule and the
// deeds, the first with a drop cap in the wordmark's mithril inlay, each
// date phrase in small caps. `The End.` closes the last chapter.
//
// Pagination is CSS columns: the pages are columns of one element as high
// as the page, overflowing sideways, so the browser lays the book out at
// any size without script. A spread is one book width; turning moves the
// columns by whole spreads (`translateX`, in CSS units, so a resize needs
// no script to stay aligned). Script reads layout only to count the pages
// and find each chapter's first page: once the box has settled
// (`useBoxSettled`), when the fonts arrive, and on a resize (debounced
// 120 ms), keeping the current chapter and the page inside it. A turn is a
// short fade with a 14 px drift (170 ms out, 240 ms in; none with reduced
// motion).
//
// Keys: → / PgDn / Space the next spread, ← / PgUp the previous, ↓ / ↑ the
// next / previous chapter, Home / End, N / P; Esc and Back leave (there is
// no roll and no automatic return). Touch: a sideways swipe over 40 px
// turns. Loading, the storage error, no data and the filtered state are
// pages of the book with today's texts.

import './credits.css';
import type { VNode } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { RunLibrary } from '../../runs/library';
import { type ChronicleBook, type ChronicleRun, chronicleBook } from '../../share/chronicle';
import { OPEN_FILTERS, emptyState, filtersOpen } from '../../share/spotlights';
import { useServices, useSettings } from '../kit/hooks';
import {
  Box,
  BoxBody,
  BoxFoot,
  BoxHead,
  GlassButton,
  OrnRule,
  Seg,
  letterAction,
  lookFrame,
  useBoxSettled,
  useReducedMotion,
} from '../kit/look';
import { useKeys, useNav } from '../kit/stack';

/** Credits' own texts (the states as pages of the book). */
export const CREDITS_TEXT = {
  loading: 'Loading…',
  error: "The chronicle could not be read from this browser's storage.",
  no_data:
    'No chronicle yet. Your tale is written as you play: kills, deaths, level-ups and achievements each earn a line. Come back once you have made some history.',
  filtered: 'No chronicle entries match your settings.',
  filteredHint: 'The filter on the Spotlights page chooses what the chronicle tells.',
} as const;

/** A book narrower than this shows one page at a time (px). */
export const CREDITS_ONE_PAGE = 640;
/** A sideways swipe longer than this turns the page (px). */
export const CREDITS_SWIPE = 40;
/** The resize debounce (ms). */
const RELAYOUT_MS = 120;
/** The turn: fade out, then in (ms), and the drift (px). */
const TURN_OUT = 170;
const TURN_IN = 240;
const TURN_DRIFT = 14;

/** Every stored run with its events (the chronicle's input). */
async function chronicleRuns(lib: RunLibrary): Promise<ChronicleRun[]> {
  const metas = await lib.store.listRuns();
  return Promise.all(metas.map(async (meta) => ({ meta, events: await lib.events([meta.runId]) })));
}

/** What the page shows. */
export type CreditsState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'no_data' }
  | { kind: 'filtered' }
  | { kind: 'book'; book: ChronicleBook };

/** The book's measured pages: pages per spread, the page count, each chapter's first page. */
export interface BookLayout {
  per: 1 | 2;
  pages: number;
  starts: number[];
}

/** Where the reader is: a chapter, the page inside it, and the chapter whose pill is lit. */
export interface BookPos {
  ch: number;
  off: number;
  lit: number;
}

export const spreadCount = (l: BookLayout): number => Math.max(1, Math.ceil(l.pages / l.per));

/** The spread that shows `pos` (the chapter's page `off`, kept inside the chapter). */
export function spreadOf(l: BookLayout, pos: BookPos): number {
  const ch = Math.max(0, Math.min(l.starts.length - 1, pos.ch));
  const start = l.starts[ch] ?? 0;
  const len = Math.max(1, (l.starts[ch + 1] ?? l.pages) - start);
  const page = start + Math.max(0, Math.min(len - 1, pos.off));
  return Math.max(0, Math.min(spreadCount(l) - 1, Math.floor(page / l.per)));
}

/**
 * The position of spread `s`: the chapter of its first page and the page
 * inside it; the lit pill is the last chapter that starts on the spread,
 * else the chapter of its first page.
 */
export function posAt(l: BookLayout, s: number): BookPos {
  const first = Math.max(0, Math.min(spreadCount(l) - 1, s)) * l.per;
  let ch = 0;
  let lit = 0;
  l.starts.forEach((p, k) => {
    if (p <= first) ch = k;
    if (p <= first + l.per - 1) lit = k;
  });
  return { ch, off: first - (l.starts[ch] ?? 0), lit };
}

/** The position at chapter `k`'s first page. */
export const posOfChapter = (k: number): BookPos => ({ ch: k, off: 0, lit: k });

/**
 * Calls `turn(1)` for a swipe to the left and `turn(-1)` for one to the
 * right (longer than `CREDITS_SWIPE` and more sideways than up or down),
 * from touch events, or from pen and touch pointers where no touch events
 * come. Listeners, not JSX props: Preact binds `onTouchStart` only where
 * the element knows `ontouchstart` (not in a desktop browser).
 */
function useSwipe(ref: { current: HTMLElement | null }, turn: (dir: 1 | -1) => void): void {
  const latest = useRef(turn);
  latest.current = turn;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let at: { x: number; y: number; by: 'touch' | 'pointer' } | null = null;
    const end = (x: number, y: number, by: 'touch' | 'pointer'): void => {
      if (!at || at.by !== by) return;
      const dx = x - at.x;
      const dy = y - at.y;
      at = null;
      if (Math.abs(dx) > CREDITS_SWIPE && Math.abs(dx) > Math.abs(dy)) latest.current(dx < 0 ? 1 : -1);
    };
    const onTouchStart = (e: TouchEvent): void => {
      const t = e.touches[0];
      if (t && e.touches.length === 1) at = { x: t.clientX, y: t.clientY, by: 'touch' };
      else at = null;
    };
    const onTouchEnd = (e: TouchEvent): void => {
      const t = e.changedTouches[0];
      if (t) end(t.clientX, t.clientY, 'touch');
    };
    const onPointerDown = (e: PointerEvent): void => {
      if (e.pointerType !== 'mouse' && !at) at = { x: e.clientX, y: e.clientY, by: 'pointer' };
    };
    const onPointerUp = (e: PointerEvent): void => end(e.clientX, e.clientY, 'pointer');
    const cancel = (): void => {
      at = null;
    };
    const opts = { passive: true } as const;
    el.addEventListener('touchstart', onTouchStart, opts);
    el.addEventListener('touchend', onTouchEnd, opts);
    el.addEventListener('touchcancel', cancel, opts);
    el.addEventListener('pointerdown', onPointerDown, opts);
    el.addEventListener('pointerup', onPointerUp, opts);
    el.addEventListener('pointercancel', cancel, opts);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', cancel);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', cancel);
    };
  }, []);
}

/**
 * Measures the book: how many pages each chapter fills (the column of its
 * last line's tail mark; every chapter is its own column box, see the
 * header), so each chapter's first page follows the one before. One read
 * of layout for the whole book: a chapter's page count does not depend on
 * where it is placed.
 */
function measure(book: HTMLElement, pages: HTMLElement): BookLayout {
  const w = book.clientWidth;
  const per: 1 | 2 = w < CREDITS_ONE_PAGE ? 1 : 2;
  const pitch = w / per;
  const counts = [...pages.querySelectorAll<HTMLElement>('.wc-cred-ch')].map((ch) => {
    const tail = ch.querySelector('.wc-cred-tail');
    if (!tail || !(pitch > 0)) return 1;
    // Page k spans [k·pitch, k·pitch + page width) from the chapter's left edge.
    return Math.max(1, Math.floor((tail.getBoundingClientRect().left - ch.getBoundingClientRect().left + 0.5) / pitch) + 1);
  });
  const starts: number[] = [];
  let at = 0;
  for (const n of counts) {
    starts.push(at);
    at += n;
  }
  return { per, pages: Math.max(1, at), starts };
}

export const CreditsFrame = lookFrame(function CreditsFrame(): VNode {
  const { runs } = useServices();
  const settings = useSettings();
  const nav = useNav();
  // The filters and the period's clock as the page opened (see the header).
  const [view] = useState(() => ({ filters: settings.spotlights, nowUs: Date.now() * 1000 }));
  const [data, setData] = useState<ChronicleRun[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    runs()
      .then(chronicleRuns)
      .then((r) => live && setData(r))
      .catch((err: unknown) => {
        console.error('WebCockpit: Credits could not load the runs', err);
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [runs]);
  const state = useMemo((): CreditsState => {
    if (failed) return { kind: 'error' };
    if (!data) return { kind: 'loading' };
    const book = chronicleBook(data, view.filters, { nowUs: view.nowUs });
    if (book) return { kind: 'book', book };
    // `no_data` only when nothing would be told with open filters (ADR 0110).
    const any = !filtersOpen(view.filters) && chronicleBook(data, OPEN_FILTERS, { nowUs: view.nowUs }) !== null;
    return { kind: emptyState(view.filters, any) };
  }, [failed, data, view]);
  return (
    <Box title="Credits" size="large" onBack={() => nav.pop()} class="wc-cred" winClass="wc-cred-win">
      {state.kind === 'book' ? <Book book={state.book} /> : <NotePage state={state} />}
    </Box>
  );
});

/** A state of the page as one page of the book (loading, error, no data, filtered). */
function NotePage(p: { state: Exclude<CreditsState, { kind: 'book' }> }): VNode {
  const kind = p.state.kind;
  // Esc leaves (the stack); the nav keys do nothing.
  useKeys((_e, nk) => nk !== null && nk !== 'back');
  return (
    <>
      <BoxHead class="wc-cred-head" />
      <BoxBody scroll={false} class="wc-cred-body">
        <div class="wc-cred-book is-note" data-state={kind}>
          <i class="wc-cred-bg" />
          <div class="wc-cred-note">
            <p class={'wc-cred-none' + (kind === 'loading' ? ' is-faint' : kind === 'error' ? ' is-bad' : '')}>{CREDITS_TEXT[kind]}</p>
            {kind === 'filtered' && (
              <>
                <OrnRule />
                <p class="wc-cred-none is-hint">{CREDITS_TEXT.filteredHint}</p>
              </>
            )}
          </div>
        </div>
      </BoxBody>
      <BoxFoot class="wc-cred-foot">
        <TurnButtons atStart atEnd onPrev={() => {}} onNext={() => {}} />
      </BoxFoot>
    </>
  );
}

function TurnButtons(p: { atStart: boolean; atEnd: boolean; onPrev: () => void; onNext: () => void }): VNode {
  return (
    <>
      <GlassButton id="prev" label="Previous" letter="p" icon="prev" disabled={p.atStart} onClick={p.onPrev} />
      <GlassButton id="next" label="Next" letter="n" icon="next" iconAfter disabled={p.atEnd} onClick={p.onNext} />
    </>
  );
}

/** The chapter's title page: the header's words in small caps around the name. */
function ChapterTitle(p: { pre: string; name: string; post: string }): VNode {
  const comma = p.post.startsWith(',');
  const post = comma ? p.post.slice(1).trim() : p.post;
  return (
    <h2 class="wc-cred-title">
      {p.pre && <span class="wc-cred-role">{p.pre}</span>}
      <span class="wc-cred-name">
        {p.name}
        {comma ? ',' : ''}
      </span>
      {post && <span class="wc-cred-role">{post}</span>}
    </h2>
  );
}

function Book(p: { book: ChronicleBook }): VNode {
  const { book } = p;
  const settled = useBoxSettled();
  const reduced = useReducedMotion();
  const bookRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const spreadRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<BookLayout | null>(null);
  const [pos, setPos] = useState<BookPos>({ ch: 0, off: 0, lit: 0 });
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const posRef = useRef(pos);
  posRef.current = pos;
  // A turn in progress: where it goes, and the fade-in to run once it has landed.
  const target = useRef<BookPos | null>(null);
  const anim = useRef<Animation | null>(null);
  const fadeIn = useRef(0);

  /** Measures now (once the box has settled; on a resize; when the fonts arrive). */
  const relayout = (): BookLayout | null => {
    const b = bookRef.current;
    const pg = pagesRef.current;
    if (!b || !pg) return null;
    const l = measure(b, pg);
    const old = layoutRef.current;
    if (!old || old.per !== l.per || old.pages !== l.pages || old.starts.join() !== l.starts.join()) {
      layoutRef.current = l;
      setLayout(l);
      // Keep the chapter and the page inside it; the lit pill must be on the spread shown.
      setPos((p) => {
        if (!old) return posAt(l, 0);
        const s = spreadOf(l, p);
        const start = l.starts[p.lit];
        const onSpread = start !== undefined && Math.floor(start / l.per) === s;
        return onSpread || p.lit === p.ch ? p : { ...p, lit: posAt(l, s).lit };
      });
    }
    return l;
  };
  const ensure = (): BookLayout | null => layoutRef.current ?? relayout();

  // The box is laid out at its final size from its first frame (ADR 0127): measure at mount (no
  // frame with every chapter on page 1), again once it has settled, and when the book changes.
  useLayoutEffect(() => {
    relayout();
  }, [settled, book]);
  useEffect(() => {
    const b = bookRef.current;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastW = b?.clientWidth ?? 0;
    let lastH = b?.clientHeight ?? 0;
    const RO = globalThis.ResizeObserver;
    const ro =
      b && RO
        ? new RO(() => {
            if (b.clientWidth === lastW && b.clientHeight === lastH) return;
            lastW = b.clientWidth;
            lastH = b.clientHeight;
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
              timer = null;
              if (layoutRef.current) relayout();
            }, RELAYOUT_MS);
          })
        : null;
    if (b) ro?.observe(b);
    // The book's faces may arrive after the first measure: measure again then.
    let live = true;
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    const onFonts = (): void => {
      if (live && layoutRef.current) relayout();
    };
    if (fonts && fonts.status !== 'loaded') fonts.ready.then(onFonts, () => {});
    fonts?.addEventListener?.('loadingdone', onFonts);
    return () => {
      live = false;
      fonts?.removeEventListener?.('loadingdone', onFonts);
      ro?.disconnect();
      if (timer) clearTimeout(timer);
      anim.current?.cancel();
    };
  }, []);

  const spread = layout ? spreadOf(layout, pos) : 0;
  const count = layout ? spreadCount(layout) : 1;

  // The second half of a turn: fade the new spread in once it is drawn.
  useLayoutEffect(() => {
    const dir = fadeIn.current;
    if (!dir) return;
    fadeIn.current = 0;
    const el = spreadRef.current;
    if (!el || typeof el.animate !== 'function') return;
    anim.current = el.animate(
      [
        { opacity: 0, transform: `translateX(${TURN_DRIFT * dir}px)` },
        { opacity: 1, transform: 'none' },
      ],
      { duration: TURN_IN, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
  }, [pos]);

  /** Goes to `next` (a position): instant with reduced motion, else fade out, move, fade in. */
  const goTo = (next: BookPos): void => {
    const l = ensure();
    if (!l) return;
    const from = spreadOf(l, target.current ?? posRef.current);
    const to = spreadOf(l, next);
    const el = spreadRef.current;
    if (to === from || reduced || !el || typeof el.animate !== 'function') {
      if (target.current) target.current = next;
      else setPos(next);
      return;
    }
    const dir = to > from ? 1 : -1;
    if (target.current) {
      // Fading out already: land on the newest target.
      target.current = next;
      return;
    }
    anim.current?.cancel();
    target.current = next;
    const out = el.animate(
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: `translateX(${-TURN_DRIFT * dir}px)` },
      ],
      { duration: TURN_OUT, easing: 'ease-in', fill: 'forwards' },
    );
    anim.current = out;
    out.onfinish = () => {
      const t = target.current;
      target.current = null;
      if (!t) return;
      fadeIn.current = dir;
      setPos(t);
      // The out-fade holds its end (fill) until the in-fade replaces it.
      requestAnimationFrame(() => out.cancel());
    };
  };
  const goSpread = (s: number): void => {
    const l = ensure();
    if (l) goTo(posAt(l, Math.max(0, Math.min(spreadCount(l) - 1, s))));
  };
  const here = (): number => {
    const l = ensure();
    return l ? spreadOf(l, target.current ?? posRef.current) : 0;
  };
  const chapter = (d: 1 | -1): void => {
    const cur = (target.current ?? posRef.current).lit;
    const k = Math.max(0, Math.min(book.chapters.length - 1, cur + d));
    goTo(posOfChapter(k));
  };
  const next = (): void => goSpread(here() + 1);
  const prev = (): void => goSpread(here() - 1);

  useKeys((e, nk) => {
    if (e.key === ' ' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      next();
      return true;
    }
    switch (nk) {
      case 'right':
      case 'pgdn':
        next();
        return true;
      case 'left':
      case 'pgup':
        prev();
        return true;
      case 'down':
        chapter(1);
        return true;
      case 'up':
        chapter(-1);
        return true;
      case 'home':
        goSpread(0);
        return true;
      case 'end': {
        const l = ensure();
        goSpread(l ? spreadCount(l) - 1 : 0);
        return true;
      }
      case 'back':
        return false;
      default:
        break;
    }
    return letterAction(e, { n: next, p: prev }) || nk !== null;
  });

  // Touch: a sideways swipe over 40 px turns.
  useSwipe(bookRef, (d) => (d > 0 ? next() : prev()));

  const one = layout ? layout.per === 1 : false;
  const left = spread * (layout?.per ?? 2) + 1;
  const pages = layout?.pages ?? 1;
  return (
    <>
      <BoxHead class="wc-cred-head">
        <div
          class="wc-cred-pills"
          onClickCapture={(e) => {
            // A click on the lit pill goes back to its chapter's first page (Seg only reports changes).
            const opt = (e.target as Element).closest?.('.wc-lk-opt');
            if (opt?.getAttribute('aria-checked') === 'true') {
              const k = book.chapters.findIndex((c) => c.name === opt.getAttribute('data-opt'));
              if (k >= 0) goTo(posOfChapter(k));
            }
          }}
        >
          <Seg
            kind="pills"
            label="Chapters"
            options={book.chapters.map((c, i) => ({ value: String(i), label: c.name, id: c.name }))}
            value={String(pos.lit)}
            onChange={(v) => goTo(posOfChapter(Number(v)))}
          />
        </div>
      </BoxHead>
      <BoxBody scroll={false} class="wc-cred-body">
        <div
          ref={bookRef}
          class={'wc-cred-book' + (one ? ' is-one' : '')}
          data-spread={spread}
          data-spreads={count}
          data-ready={layout ? 'true' : undefined}
        >
          <i class="wc-cred-bg" />
          <div ref={spreadRef} class="wc-cred-spread">
            <div ref={pagesRef} class="wc-cred-pages" style={{ '--wc-cred-s': String(spread) }}>
              {book.chapters.map((ch, i) => {
                const last = i === book.chapters.length - 1;
                return (
                  <section
                    key={ch.name}
                    class="wc-cred-ch"
                    data-ch={ch.name}
                    aria-label={ch.header}
                    style={{ '--wc-cred-p': String(layout?.starts[i] ?? 0) }}
                  >
                    {i === 0 && (
                      <>
                        <p class="wc-cred-open">{book.opening}</p>
                        <OrnRule />
                      </>
                    )}
                    <ChapterTitle pre={ch.pre} name={ch.name} post={ch.post} />
                    <OrnRule />
                    {ch.deeds.map((d, j) => (
                      <p key={j} class={'wc-cred-p' + (j === 0 ? ' is-first' : '')}>
                        <span class="wc-cred-date">{d.date}</span>
                        {d.rest}
                        {!last && j === ch.deeds.length - 1 && <i class="wc-cred-tail" />}
                      </p>
                    ))}
                    {last && (
                      <p class="wc-cred-end">
                        {book.end}
                        <i class="wc-cred-tail" />
                      </p>
                    )}
                  </section>
                );
              })}
            </div>
            {layout && (
              <>
                <span class="wc-cred-folio is-l">{`— ${left} —`}</span>
                {!one && left + 1 <= pages && <span class="wc-cred-folio is-r">{`— ${left + 1} —`}</span>}
              </>
            )}
          </div>
        </div>
      </BoxBody>
      <BoxFoot class="wc-cred-foot">
        <TurnButtons atStart={spread === 0} atEnd={spread >= count - 1} onPrev={prev} onNext={next} />
      </BoxFoot>
    </>
  );
}
