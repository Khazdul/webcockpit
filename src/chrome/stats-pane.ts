// The Statistics pane's view (ADR 0134 "Statistics pane"; ADR 0109 for the
// mount), drawn by the chrome chunk into the pane's content element
// (src/panes/statistics.ts) on its first show:
//
//   const view = chrome.mountStatsPane(host, services, { runs, status });
//   view.resize(cols, rows);   // 0 × 0 while the pane is hidden
//
//   .wc-st                        [data-state=norun|run] [data-cal] [data-ended]
//     .wc-st-top                  name · L35 · run clock · stars … with allies
//     .wc-st-tiles                Avg / kill, Median, XP / h, TNL
//     .wc-st-sec                  "Kills" and the count
//     .wc-st-list
//       .wc-st-scroll > .wc-st-space
//         .wc-st-medline          the median line, one for the whole list
//         .wc-st-row …            every kill but the last (those in view)
//       .wc-st-more               `↓ N new` while scrolled up
//     .wc-st-card                 the last kill: name, +XP, rating, scale
//
// Before the first kill (and with no run at all) the layout is the same,
// empty: the header (the character from `Char.*`, `no run yet` in place
// of the clock), `—` in the tiles (TNL as soon as XP is known), `Kills 0`,
// and the card with its label only, at its usual height.
//
// Direct DOM, no Preact: the work per change is known exactly.
//
// - The list is virtual: rows have one height, the space is n rows tall and
//   only the rows in view (plus a margin) exist, so a run of thousands of
//   kills costs the same DOM as one of thirty. Bottom-anchored: at the
//   bottom it follows new kills (one scroll write per change); scrolled up
//   it stays (the list grows below the view) and `↓ N new` counts them. A
//   reversed-column scroller (no scroll write) was tried: no gain in
//   Chromium and slower frames after a kill in Firefox.
// - A new kill appends: the previous card's kill becomes the list's last row
//   (it slides up from the card), the card shows the new one. Bars are a
//   transform of `--xp / --st-scale` (scale = 3 × the median), so a new
//   median restyles the rows in view without laying anything out; their
//   rating words (`data-r`) are rewritten only where they change. The
//   median line is one element at a third of the bar column, never moved.
// - The 1 Hz tick (a live run only) writes the clock text; the rows' ages
//   once a minute. Nothing reads layout per tick: the
//   list's height comes from a ResizeObserver, the scroll position from the
//   scroll event.
// - No keys: a mousedown outside the list is prevented (the game keeps the
//   keys); in the list it is not, so rows can be selected and copied.

import type { AppStatusView } from '../app/status';
import { RATING_LABEL, RATING_ORDER, type Rated, ratingOf } from '../runs/kill-rating';
import type { LiveRuns } from '../runs/live';
import type { StatsChar } from '../panes/context';
import type { ChromeServices } from './kit/hooks';
import { type StatsFeedState, StatsFeed } from './stats-feed';
import { fmtK } from './frames/stats-layout';
import { type KillEntry, barScale, extendsKills, fmtAge, fmtRunClock, raterOf, scaleBands, scalePos, tilesOf } from './stats-pane-model';
import './stats-pane.css';

export interface StatsPaneOptions {
  runs: LiveRuns;
  status: AppStatusView;
}

export interface StatsPaneHandle {
  /** The pane's content size in cells; 0 × 0 while hidden. */
  resize(cols: number, rows: number): void;
  dispose(): void;
}

const NO_RUN = 'no run yet';
/** Rows kept beyond the view on each side. */
const OVERSCAN = 6;
/** Distance from the bottom (px) that still counts as following. */
const PIN_SLACK = 4;
/** Tick and the rows' age refresh (ms). */
const TICK_MS = 1000;
const AGE_EVERY = 60;
/** The bars' scale is rewritten when it moved more than this (a fraction). */
const SCALE_STEP = 0.03;

const prevent = (e: Event): void => e.preventDefault();

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function setText(e: HTMLElement, t: string): void {
  if (e.textContent !== t) e.textContent = t;
}

function setAttr(e: HTMLElement, name: string, v: string | null): void {
  if (v === null) {
    if (e.hasAttribute(name)) e.removeAttribute(name);
  } else if (e.getAttribute(name) !== v) e.setAttribute(name, v);
}

/**
 * Whether the user asked for reduced motion, read from a list kept current
 * by its change event: evaluating `matchMedia(…).matches` on every kill
 * forced a style and layout update.
 */
const motion = new WeakMap<Document, { reduce: boolean }>();
function reducedMotion(doc: Document): boolean {
  let m = motion.get(doc);
  if (!m) {
    const mql = doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)');
    const st = { reduce: mql?.matches ?? true };
    mql?.addEventListener?.('change', (e) => (st.reduce = e.matches));
    motion.set(doc, st);
    m = st;
  }
  return m.reduce;
}

export class StatsPaneView implements StatsPaneHandle {
  private readonly doc: Document;
  private readonly feed: StatsFeed;
  private readonly root: HTMLDivElement;
  private readonly topName: HTMLSpanElement;
  private readonly topLevel: HTMLSpanElement;
  private readonly clock: HTMLSpanElement;
  private readonly endedEl: HTMLSpanElement;
  private readonly stars: HTMLSpanElement;
  private readonly allies: HTMLSpanElement;
  private readonly tileV: HTMLSpanElement[];
  private readonly count: HTMLSpanElement;
  private readonly scroll: HTMLDivElement;
  private readonly space: HTMLDivElement;
  private readonly more: HTMLButtonElement;
  private readonly card: HTMLDivElement;
  private readonly probe: HTMLDivElement;
  private readonly ro: ResizeObserver | null;
  private readonly unsub: () => void;

  private st: StatsFeedState;
  private kills: KillEntry[] = [];
  private median: number | null = null;
  private scale = 1;
  /** Rows in the DOM by list index. */
  private readonly rows = new Map<number, HTMLDivElement>();
  private rowH = 0;
  private viewH = 0;
  /** Distance of the view from the list's bottom (px). */
  private fromBottom = 0;
  private pinned = true;
  private unseen = 0;
  private shown = false;
  private cols = 0;
  private rowsN = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticks = 0;
  private frame = 0;
  /** The kill on the card (its time and name). */
  private cardKey = '';
  private readonly cardMob: HTMLDivElement;
  private readonly cardXp: HTMLSpanElement;
  private readonly badge: HTMLSpanElement;
  private readonly badgeText: HTMLSpanElement;
  private readonly scaleBox: HTMLDivElement;
  private readonly scaleMk: HTMLSpanElement;
  private readonly bandEls: HTMLElement[] = [];
  private readonly lblEls: HTMLElement[] = [];
  /** The `--st-scale` written last (a new one is written only when it moved more than SCALE_STEP). */
  private shownScale = 0;
  private ageRef = 0;
  /** The character from `Char.*` (the shell's `setChar`). */
  private char: StatsChar = { name: null, level: null, tnl: null };

  constructor(host: HTMLElement, feed: StatsFeed) {
    const doc = host.ownerDocument;
    this.doc = doc;
    this.feed = feed;
    this.st = feed.state;

    const root = el(doc, 'div', 'wc-st');
    root.dataset['state'] = 'none';
    root.addEventListener('mousedown', this.onDown);

    const top = el(doc, 'div', 'wc-st-top');
    this.topName = el(doc, 'span', 'wc-st-hot');
    this.topLevel = el(doc, 'span', 'wc-st-dim');
    this.clock = el(doc, 'span', 'wc-st-clock');
    this.endedEl = el(doc, 'span', 'wc-st-dim wc-st-ended', 'ended');
    const norun = el(doc, 'span', 'wc-st-dim wc-st-norun', NO_RUN);
    this.stars = el(doc, 'span', 'wc-st-stars');
    this.allies = el(doc, 'span', 'wc-st-allies');
    top.append(this.topName, this.topLevel, el(doc, 'span', 'wc-st-dim', '·'), this.clock, norun, this.endedEl, this.stars, el(doc, 'span', 'wc-st-sp'), this.allies);

    const tiles = el(doc, 'div', 'wc-st-tiles');
    this.tileV = ['Avg / kill', 'Median', 'XP / h', 'TNL'].map((k) => {
      const t = el(doc, 'div', 'wc-st-tile');
      const v = el(doc, 'span', 'wc-st-v', '—');
      t.append(el(doc, 'span', 'wc-st-k', k), v);
      tiles.append(t);
      return v;
    });

    const sec = el(doc, 'div', 'wc-st-sec', 'Kills');
    this.count = el(doc, 'span', 'wc-st-dim wc-st-count');
    sec.append(this.count);

    const list = el(doc, 'div', 'wc-st-list');
    this.scroll = el(doc, 'div', 'wc-st-scroll');
    this.space = el(doc, 'div', 'wc-st-space');
    // The median line: one element over the whole list, laid out on the
    // rows' grid so it sits on the bars' median position in every width.
    const med = el(doc, 'div', 'wc-st-medline');
    med.setAttribute('aria-hidden', 'true');
    med.append(el(doc, 'i', ''));
    this.space.append(med);
    this.scroll.append(this.space);
    this.scroll.addEventListener('scroll', this.onScroll, { passive: true });
    this.more = el(doc, 'button', 'wc-st-more');
    this.more.type = 'button';
    this.more.hidden = true;
    this.more.tabIndex = -1;
    this.more.addEventListener('mousedown', this.onMore);
    list.append(this.scroll, this.more);

    this.card = el(doc, 'div', 'wc-st-card');
    this.card.hidden = true;
    const head = el(doc, 'div', 'wc-st-card-top');
    head.append(el(doc, 'span', 'wc-st-k', 'Last kill'));
    this.cardMob = el(doc, 'div', 'wc-st-mob');
    const big = el(doc, 'div', 'wc-st-big');
    this.cardXp = el(doc, 'span', 'wc-st-bigxp');
    this.badge = el(doc, 'span', 'wc-st-badge');
    const pips = el(doc, 'span', 'wc-st-pips');
    pips.setAttribute('aria-hidden', 'true');
    for (let j = 0; j < RATING_ORDER.length; j++) pips.append(el(doc, 'i', ''));
    this.badgeText = el(doc, 'span', '');
    this.badge.append(pips, this.badgeText);
    big.append(this.cardXp, el(doc, 'span', 'wc-st-dim', 'XP'), el(doc, 'span', 'wc-st-sp'), this.badge);
    this.scaleBox = el(doc, 'div', 'wc-st-scale');
    this.scaleMk = el(doc, 'span', 'wc-st-mk');
    const bands = el(doc, 'div', 'wc-st-bands');
    const lbl = el(doc, 'div', 'wc-st-lbl');
    for (const b of scaleBands()) {
      const i = el(doc, 'i', '');
      i.dataset['r'] = b.rating;
      i.style.flex = b.frac.toFixed(4);
      bands.append(i);
      this.bandEls.push(i);
      const t = el(doc, 'span', '', RATING_LABEL[b.rating]);
      t.style.flex = b.frac.toFixed(4);
      lbl.append(t);
      this.lblEls.push(t);
    }
    this.scaleBox.append(this.scaleMk, bands, lbl);
    this.card.append(head, this.cardMob, big, this.scaleBox);
    // A row that is never shown: its height is the list's row height.
    this.probe = el(doc, 'div', 'wc-st-row wc-st-probe');
    this.probe.append(el(doc, 'span', 'wc-st-age', '0m'));
    list.append(this.probe);

    root.append(top, tiles, sec, list, this.card);
    this.root = root;
    host.replaceChildren(root);

    const RO = doc.defaultView?.ResizeObserver;
    this.ro = RO
      ? new RO((entries) => {
          for (const e of entries) {
            const wasHidden = this.viewH <= 0;
            this.viewH = e.contentRect.height;
            if (this.pinned) this.toBottom(true);
            else if (wasHidden) this.holdView();
            this.renderWindow();
          }
        })
      : null;
    this.ro?.observe(this.scroll);
    this.unsub = feed.subscribe((s) => this.apply(s));
  }

  resize(c: number, r: number): void {
    const shown = c > 0 && r > 0;
    if (c === this.cols && r === this.rowsN && shown === this.shown) return;
    const sizeChanged = shown && (c !== this.cols || r !== this.rowsN);
    this.cols = shown ? c : 0;
    this.rowsN = shown ? r : 0;
    if (shown !== this.shown) {
      this.shown = shown;
      this.feed.setShown(shown);
      this.syncTimer();
    }
    if (sizeChanged) {
      // The row height follows the font: measured again after a size change.
      const old = this.rowH;
      this.rowH = 0;
      if (this.measureRow() && this.rowH !== old) {
        this.clearRows();
        this.layoutSpace();
        if (this.pinned) this.toBottom(true);
        this.renderWindow();
      } else if (this.rowH === 0) this.rowH = old;
    }
  }

  /** The row height from the probe, once it is laid out (a read on a size change only). */
  private measureRow(): boolean {
    if (this.rowH > 0) return true;
    if (!this.shown || this.root.dataset['state'] !== 'run') return false;
    this.rowH = this.probe.offsetHeight;
    return this.rowH > 0;
  }

  setChar(c: StatsChar): void {
    this.char = c;
    setText(this.tileV[3]!, c.tnl !== null ? fmtK(c.tnl) : '—');
    this.writeHeader();
  }

  dispose(): void {
    this.unsub();
    this.feed.dispose();
    this.stopTimer();
    this.ro?.disconnect();
    if (this.frame) this.doc.defaultView?.cancelAnimationFrame(this.frame);
    this.root.remove();
  }

  // ------------------------------------------------------------ state

  private apply(s: StatsFeedState): void {
    this.st = s;
    const m = s.model;
    if (s.noRun || !m) {
      // No run: the empty layout (see the file header).
      this.root.dataset['state'] = 'norun';
      setAttr(this.root, 'data-ended', null);
      setAttr(this.root, 'data-cal', '');
      this.kills = [];
      this.median = null;
      this.clearRows();
      this.layoutSpace();
      for (let i = 0; i < 3; i++) setText(this.tileV[i]!, '—');
      setText(this.count, '0');
      this.writeHeader();
      this.drawCard(false, () => null);
      this.syncTimer();
      return;
    }
    const first = this.root.dataset['state'] !== 'run';
    this.root.dataset['state'] = 'run';
    setAttr(this.root, 'data-ended', s.ended ? '' : null);

    // Header.
    this.ageRef = s.live ? this.feed.nowUs() : (m.endUs ?? 0);
    this.writeHeader();

    // Kills.
    const prev = this.kills;
    const next = s.kills;
    const appended = !first && extendsKills(prev, next);
    const added = appended ? next.length - prev.length : 0;
    this.kills = next;
    const rater = raterOf(next);
    this.median = rater.median;
    this.scale = barScale(this.median, next);
    // Every row's bar follows `--st-scale`: written only when it moved
    // enough to see, so most kills restyle and repaint no row.
    if (!(Math.abs(this.scale - this.shownScale) <= this.shownScale * SCALE_STEP)) {
      this.shownScale = this.scale;
      this.root.style.setProperty('--st-scale', String(this.scale));
    }
    setAttr(this.root, 'data-cal', this.median === null ? '' : null);

    const t = tilesOf(next, this.median, m, m.durationUs);
    setText(this.tileV[0]!, t.avg);
    setText(this.tileV[1]!, t.median);
    setText(this.tileV[2]!, t.xpPerHour);
    const n = this.listLen();
    setText(this.count, String(next.length));

    if (!appended) {
      this.clearRows();
      this.pinned = true;
      this.unseen = 0;
    }
    this.layoutSpace();
    if (!appended || this.pinned) this.toBottom(added > 0 || !appended);
    else if (added > 0) {
      // Scrolled up: the view stays (the list grew below it).
      this.fromBottom += added * this.rowH;
      this.unseen += added;
      this.showMore();
    }
    // Rows already shown: their rating against the new median, their age.
    for (const [i, row] of this.rows) this.updateRow(row, i);
    this.renderWindow();
    if (appended && added === 1 && this.pinned) this.slideIn(n - 1);

    this.drawCard(appended && added > 0, rater.rate.bind(rater));
    this.syncTimer();
  }

  /** Kills in the list (all but the card's). */
  private listLen(): number {
    return Math.max(0, this.kills.length - 1);
  }

  // ------------------------------------------------------------ list

  private layoutSpace(): void {
    this.measureRow();
    this.space.style.height = `${this.listLen() * this.rowH}px`;
  }

  private clearRows(): void {
    for (const row of this.rows.values()) row.remove();
    this.rows.clear();
    this.more.hidden = true;
  }

  /**
   * Scrolled up and shown again: puts the view back at `fromBottom`. A
   * hidden pane's scroller can lose its scrollTop (0), so without this a
   * pane shown again could sit at the top while the rows were made for the
   * old window (a blank list). Only on a show: an ordinary resize keeps the
   * browser's position (the scroll event then updates `fromBottom`).
   */
  private holdView(): void {
    if (this.viewH <= 0 || this.rowH <= 0) return;
    const h = this.listLen() * this.rowH;
    const want = Math.min(Math.max(0, h - this.viewH), Math.max(0, h - this.viewH - this.fromBottom));
    if (Math.abs(this.scroll.scrollTop - want) > 1) this.scroll.scrollTop = want;
    this.fromBottom = Math.max(0, h - this.viewH - want);
  }

  /** Back to the bottom; `write`: the list or the view changed, so the scroll position is written. */
  private toBottom(write: boolean): void {
    if (write || this.fromBottom !== 0) this.scroll.scrollTop = this.listLen() * this.rowH;
    this.fromBottom = 0;
    this.pinned = true;
    this.unseen = 0;
    this.more.hidden = true;
  }

  private showMore(): void {
    this.more.hidden = this.unseen === 0;
    if (this.unseen > 0) setText(this.more, `↓ ${this.unseen} new`);
  }

  /** Makes the rows in view (plus the margin) and drops the rest. */
  private renderWindow(): void {
    const n = this.listLen();
    if (n > 0 && this.rowH <= 0 && this.measureRow()) {
      this.layoutSpace();
      if (this.pinned) this.toBottom(true);
    }
    if (this.rowH <= 0 || n === 0 || !this.shown) {
      if (n === 0) this.clearRows();
      return;
    }
    const top = Math.max(0, n * this.rowH - this.viewH - this.fromBottom);
    const lo = Math.max(0, Math.floor(top / this.rowH) - OVERSCAN);
    const hi = Math.min(n, Math.ceil((top + this.viewH) / this.rowH) + OVERSCAN);
    for (const [i, row] of this.rows) {
      if (i < lo || i >= hi) {
        row.remove();
        this.rows.delete(i);
      }
    }
    for (let i = lo; i < hi; i++) {
      if (this.rows.has(i)) continue;
      const row = this.makeRow(i);
      this.rows.set(i, row);
      this.space.append(row);
    }
    const last = this.rows.get(n - 1);
    for (const [i, row] of this.rows) row.classList.toggle('is-newest', i === n - 1 && row === last);
  }

  private makeRow(i: number): HTMLDivElement {
    const k = this.kills[i]!;
    const d = this.doc;
    const row = el(d, 'div', 'wc-st-row');
    row.style.top = `${i * this.rowH}px`;
    row.style.setProperty('--xp', String(Math.max(0, k.xp)));
    if (k.pk) row.dataset['pk'] = '';
    // Alternate rows by index (the DOM order of a virtual list is not the list's).
    if (i % 2) row.classList.add('is-alt');
    const bar = el(d, 'span', 'wc-st-bar');
    bar.append(el(d, 'span', 'wc-st-fill'));
    const name = el(d, 'span', 'wc-st-name', k.name);
    name.title = k.name;
    row.append(el(d, 'span', 'wc-st-age'), name, bar, el(d, 'span', 'wc-st-xp', fmtK(k.xp)));
    this.updateRow(row, i);
    return row;
  }

  /** A row's rating word and age (only what changed is written). */
  private updateRow(row: HTMLDivElement, i: number): void {
    const k = this.kills[i];
    if (!k) return;
    const r = !k.pk && this.median !== null && this.median > 0 ? ratingOf(k.xp / this.median) : null;
    setAttr(row, 'data-r', r);
    setText(row.firstChild as HTMLElement, fmtAge(this.ageRef - k.us));
  }

  /** The row that was on the card slides up into the list. */
  private slideIn(i: number): void {
    const row = this.rows.get(i);
    if (!row || reducedMotion(this.doc) || typeof row.animate !== 'function') return;
    row.animate(
      [
        { transform: `translateY(${Math.round(this.rowH * 1.6)}px)`, opacity: 0.2 },
        { transform: 'translateY(0)', opacity: 1 },
      ],
      { duration: 200, easing: 'cubic-bezier(.2,.7,.2,1)' },
    );
  }

  private readonly onScroll = (): void => {
    // Hidden (no height): a reset scrollTop is not the user's position.
    if (this.viewH <= 0) return;
    this.fromBottom = Math.max(0, this.listLen() * this.rowH - this.viewH - this.scroll.scrollTop);
    this.pinned = this.fromBottom <= PIN_SLACK;
    if (this.pinned && this.unseen) {
      this.unseen = 0;
      this.more.hidden = true;
    }
    const win = this.doc.defaultView;
    if (!win || this.frame) return;
    this.frame = win.requestAnimationFrame(() => {
      this.frame = 0;
      this.renderWindow();
    });
  };

  private readonly onMore = (e: MouseEvent): void => {
    e.preventDefault();
    if (e.button !== 0) return;
    this.pinned = true;
    this.unseen = 0;
    this.more.hidden = true;
    this.scroll.scrollTo({ top: this.listLen() * this.rowH, behavior: reducedMotion(this.doc) ? 'auto' : 'smooth' });
  };

  private readonly onDown = (e: MouseEvent): void => {
    // Rows can be selected; everywhere else the game keeps the keys.
    if (this.scroll.contains(e.target as Node)) return;
    prevent(e);
  };

  // ------------------------------------------------------------ card

  /** The card in place: texts, the badge and the scale's marker (no elements made). */
  private drawCard(fresh: boolean, rate: (xp: number) => Rated | null): void {
    const k = this.kills[this.kills.length - 1];
    this.card.hidden = false;
    if (!k) {
      // No kill yet: the label alone, at the card's usual height.
      if (this.cardKey === 'empty') return;
      this.cardKey = 'empty';
      setAttr(this.card, 'data-empty', '');
      setAttr(this.card, 'data-r', null);
      setAttr(this.card, 'data-pk', null);
      setText(this.cardMob, '\u00a0');
      this.cardMob.title = '';
      setText(this.cardXp, '\u00a0');
      this.badge.hidden = true;
      this.scaleBox.hidden = false;
      setAttr(this.scaleBox, 'data-off', '');
      return;
    }
    setAttr(this.card, 'data-empty', null);
    const key = `${k.us}|${k.name}|${k.xp}|${this.median ?? ''}`;
    if (key === this.cardKey) return;
    const newKill = !this.cardKey.startsWith(`${k.us}|${k.name}|`);
    this.cardKey = key;
    const rated = k.pk ? null : rate(k.xp);
    setAttr(this.card, 'data-r', rated ? rated.rating : null);
    setAttr(this.card, 'data-pk', k.pk ? '' : null);
    setText(this.cardMob, k.name);
    this.cardMob.title = k.name;
    setText(this.cardXp, `+${fmtK(k.xp)}`);

    // The badge: PvP or the rating with its pips; none while calibrating
    // (the owner, 2026-11-10: no `calibrating…` on the card).
    const state = k.pk ? 'pk' : rated ? 'rated' : null;
    setAttr(this.badge, 'data-state', state);
    setAttr(this.badge, 'data-r', rated ? rated.rating : null);
    this.badge.hidden = !k.pk && !rated;
    setText(this.badgeText, k.pk ? '⚔ PvP' : rated ? RATING_LABEL[rated.rating] : '');
    const at = rated ? RATING_ORDER.indexOf(rated.rating) : -1;
    const pips = this.badge.firstChild!.childNodes;
    for (let j = 0; j < pips.length; j++) (pips[j] as HTMLElement).classList.toggle('on', j <= at);

    // The scale (rated mob kills only): the band and label of the rating,
    // the marker at its ratio.
    // Calibrating it keeps its room (the card does not jump when the
    // rating starts) but is not drawn; a pkill has none.
    this.scaleBox.hidden = k.pk;
    setAttr(this.scaleBox, 'data-off', rated ? null : '');
    for (let j = 0; j < this.bandEls.length; j++) {
      this.bandEls[j]!.classList.toggle('here', j === at);
      this.lblEls[j]!.classList.toggle('here', j === at);
    }
    if (rated) this.scaleMk.style.left = `${(scalePos(rated.ratio) * 100).toFixed(1)}%`;

    if (fresh && newKill && !reducedMotion(this.doc) && typeof this.card.animate === 'function') {
      this.card.animate(
        [
          { transform: 'translateY(10px)', opacity: 0 },
          { transform: 'translateY(0)', opacity: 1 },
        ],
        { duration: 200, easing: 'cubic-bezier(.2,.7,.2,1)' },
      );
    }
  }

  // ------------------------------------------------------------ the tick

  private syncTimer(): void {
    const want = this.shown && this.st.live && !this.st.noRun && this.st.model !== null;
    if (want && this.timer === null) {
      this.ticks = 0;
      this.timer = setInterval(this.onTick, TICK_MS);
    } else if (!want) this.stopTimer();
  }

  private stopTimer(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private readonly onTick = (): void => {
    this.ageRef = this.feed.nowUs();
    this.writeClock();
    if (++this.ticks % AGE_EVERY === 0) for (const [i, row] of this.rows) this.updateRow(row, i);
  };

  /** Name, level, stars and allies: the run's, else the character's. */
  private writeHeader(): void {
    const m = this.st.noRun ? null : this.st.model;
    const name = m?.character ?? this.char.name;
    const level = m?.level ?? this.char.level;
    setText(this.topName, name ?? '—');
    setText(this.topLevel, level !== null ? `L${level}` : '');
    setText(this.stars, m && this.st.rating > 0 ? '★'.repeat(this.st.rating) : '');
    setText(this.allies, m?.allies.length ? `with ${m.allies.join(', ')}` : '');
    this.writeClock();
  }

  private writeClock(): void {
    const m = this.st.model;
    if (!m || m.startUs === null) return setText(this.clock, '');
    const us = this.st.live ? Math.max(this.feed.nowUs(), m.endUs ?? 0) - m.startUs : m.durationUs;
    setText(this.clock, fmtRunClock(us));
  }
}

/** Mounts the Statistics pane's view into `host` (hidden until `resize` gives it cells). */
export function mountStatsPane(host: HTMLElement, _services: ChromeServices, opts: StatsPaneOptions): StatsPaneHandle {
  const feed = new StatsFeed({ runs: opts.runs, replay: () => opts.status.get().replay });
  return new StatsPaneView(host, feed);
}
