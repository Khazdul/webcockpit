// The Character card's elements (stage 77 part D; the round 12–15 look,
// F2b): built once, and the setters that write a view into them. A value
// change never builds or removes an element; the stones reuse a pool that
// only grows. What is drawn is character-model.ts and character-stones.ts,
// the sizes are character-layout.ts, when is character.ts.

import { ABILITIES, AGE_NAMES } from '../gmcp/age';
import { type VitalKind, VITAL_KINDS } from '../gmcp/bands';
import { countdownText } from '../timers/entry';
import type { CardLayout, Rect } from './character-layout';
import {
  CARD_TABS,
  CARD_TOGGLES,
  type CardTab,
  type ClickId,
  type ClickView,
  type IconButtonView,
  type LoreView,
  type RingView,
  SENSES,
  SHIELDS,
  type ShieldView,
  type StatsView,
  type StatusFieldView,
  VITAL_LABEL,
  type VitalView,
} from './character-model';
import { type Purse, type Stone, type StoneRows, type StoneTone, purseTip, stoneTime, stoneTip } from './character-stones';
import { el, setAttr, setHidden, setProp, setText } from './dom';
import { type IconName, SVG_NS, iconSvg, setIconSvg } from './icons';
import { setLiveTip, setTip } from './pane-tooltip';
import { PopupMenu } from './popup-menu';
import { portraitImage } from './portrait';
import { figureSvg } from './portrait-figures';
import { bucketPx, portraitArt, sizeFor } from './portraits';
import type { PortraitId, Sex } from './portraits/types';

function svgEl<K extends keyof SVGElementTagNameMap>(doc: Document, tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
  const e = doc.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function button(doc: Document, cls: string): HTMLButtonElement {
  const b = el(doc, 'button', cls);
  b.type = 'button';
  return b;
}

const px = (n: number): string => `${Math.round(n * 100) / 100}px`;

// ------------------------------------------------------------------ portrait

/**
 * The round frame's content (decision 22, part E; the portrait pass, ADR
 * 0166 addendum 12): the portrait's drawing baked into an image once
 * (portraits/index.ts), or its raster file when there is one (portrait.ts).
 * Until the first image is ready the neutral silhouette in the pane's
 * colours stands in (a chunk is loading); after that a new portrait
 * replaces the old one only once it has loaded, so nothing flashes. A
 * raster file that fails falls back to the drawing. It rebakes only when
 * the portrait, the drawing size or a larger pixel bucket is wanted, never
 * per render. Still images only.
 */
function portraitEl(doc: Document, disc: HTMLElement) {
  const wait = figureSvg(doc);
  disc.append(wait);
  let img: HTMLImageElement | null = null;
  let id: PortraitId = 'neutral';
  let sex: Sex = 'male';
  let css = 0;
  const failed = new Set<string>();
  /** What the image shows (or is loading): the key and the pixel bucket. */
  let shown = '';
  let shownPx = 0;
  let asked = '';
  let ticket = 0;
  const put = (src: string, key: string, px: number, art: 'drawn' | 'raster', t: number): void => {
    const next = el(doc, 'img', 'wc-cc-photo');
    next.alt = '';
    next.decoding = 'async';
    next.draggable = false;
    next.addEventListener(
      'load',
      () => {
        if (t !== ticket) return;
        if (img) img.replaceWith(next);
        else wait.replaceWith(next);
        img = next;
        shown = key;
        shownPx = px;
        setAttr(disc, 'data-art', art);
      },
      { once: true },
    );
    next.addEventListener(
      'error',
      () => {
        if (t !== ticket || art !== 'raster') return;
        failed.add(src);
        asked = '';
        refresh();
      },
      { once: true },
    );
    next.src = src;
  };
  const refresh = (): void => {
    if (css <= 0) return;
    const size = sizeFor(css);
    const raster = portraitImage(id, sex);
    const useRaster = raster !== null && !failed.has(raster);
    const key = `${id}|${sex}|${useRaster ? raster : size}`;
    const px = useRaster ? 0 : bucketPx(css * (doc.defaultView?.devicePixelRatio || 1));
    if (key === shown && px <= shownPx) return;
    const want = `${key}|${px}`;
    if (want === asked) return;
    asked = want;
    const t = ++ticket;
    if (useRaster) {
      put(raster, key, px, 'raster', t);
      return;
    }
    void portraitArt(doc, id, sex, size, px).then(
      (src) => {
        if (src !== null && t === ticket) put(src, key, px, 'drawn', t);
      },
      () => {},
    );
  };
  /** The portrait and the sex to show. */
  const set = (next: PortraitId, s: Sex = 'male'): void => {
    if (next === id && s === sex && shown !== '') return;
    id = next;
    sex = s;
    setAttr(disc, 'data-portrait', id);
    setAttr(disc, 'data-sex', id === 'neutral' ? null : sex);
    refresh();
  };
  /** The frame's size in CSS px (0: no frame, nothing is baked). */
  const size = (px: number): void => {
    if (px === css) return;
    css = px;
    refresh();
  };
  setAttr(disc, 'data-portrait', id);
  return { set, size };
}

// ---------------------------------------------------------------------- ring

const R_XP = 14.2;
const R_TP = 11;

function ringEl(doc: Document) {
  const box = el(doc, 'span', 'wc-cc-ring');
  const svg = svgEl(doc, 'svg', { viewBox: '0 0 32 32', 'aria-hidden': 'true' });
  const circle = (cls: string, r: number): SVGCircleElement => {
    const c = svgEl(doc, 'circle', { class: cls, cx: '16', cy: '16', r: String(r) });
    svg.append(c);
    return c;
  };
  circle('wc-cc-ring-track', R_XP);
  const base = circle('wc-cc-ring-base', R_XP);
  const gain = circle('wc-cc-ring-gain', R_XP);
  const tp = circle('wc-cc-ring-tp', R_TP);
  const level = el(doc, 'b', 'wc-cc-level');
  box.append(svg, level);

  const arc = (c: SVGCircleElement, r: number, from: number, part: number): void => {
    // A round cap draws a dot for an empty arc.
    const none = part < 0.002;
    setAttr(c, 'data-none', none ? '' : null);
    if (none) return;
    const round = 2 * Math.PI * r;
    setAttr(c, 'stroke-dasharray', `${(part * round).toFixed(2)} ${(round + 4).toFixed(2)}`);
    setAttr(c, 'stroke-dashoffset', from ? (-from * round).toFixed(2) : null);
  };
  const set = (v: RingView): void => {
    setText(level, v.level);
    arc(base, R_XP, 0, v.base);
    arc(gain, R_XP, v.base, v.gain);
    arc(tp, R_TP, 0, v.tp);
    setAttr(level, 'data-long', v.level.length > 2 ? '' : null);
    setTip(box, v.tip, v.title, 'cc:ring');
  };
  return { box, set };
}

// -------------------------------------------------------------- left column

function setClick(b: HTMLElement, v: ClickView): void {
  setAttr(b, 'aria-label', v.name);
  setAttr(b, 'aria-disabled', v.command === null || v.pending ? 'true' : null);
  setAttr(b, 'data-off', v.command === null ? '' : null);
  setAttr(b, 'data-pending', v.pending ? '' : null);
}

function leftEl(doc: Document, click: (id: ClickId) => void) {
  const box = el(doc, 'div', 'wc-cc-left');
  const name = el(doc, 'span', 'wc-cc-name');
  const medal = el(doc, 'div', 'wc-cc-medal');
  const disc = el(doc, 'div', 'wc-cc-disc');
  const portrait = portraitEl(doc, disc);
  const ring = ringEl(doc);
  medal.append(disc, ring.box);
  const row = el(doc, 'div', 'wc-cc-icons');
  const all: { id: ClickId; icon: IconName }[] = [...CARD_TOGGLES, { id: 'position', icon: 'standing' }];
  const icons = all.map(({ id, icon }) => {
    if (id === 'position') row.append(el(doc, 'span', 'wc-cc-sep'));
    const b = button(doc, 'wc-cc-ib');
    b.dataset.click = id;
    const svg = iconSvg(doc, icon, 'wc-cc-i');
    b.append(svg);
    b.addEventListener('click', () => click(id));
    row.append(b);
    return { b, svg };
  });
  box.append(name, medal, row);

  const setName = (text: string): void => setText(name, text);
  const setIcons = (views: readonly IconButtonView[], fighting: boolean): void => {
    views.forEach((v, i) => {
      const { b, svg } = icons[i]!;
      setIconSvg(svg, v.icon);
      setClick(b, v);
      setAttr(b, 'data-on', v.on ? '' : null);
      setAttr(b, 'data-fight', fighting && v.id === 'position' ? '' : null);
      setTip(b, v.tip, v.name, `cc:${v.id}`);
    });
  };
  return { box, setName, setPortrait: portrait.set, setDisc: portrait.size, setRing: ring.set, setIcons };
}

// ------------------------------------------------------------------- Status

/** The round 12 D&D shield (`round12.html` `SHAPES.dnd`), in a 40 × 48 box. */
const SHIELD_OUTER = 'M20 2L36 7V22C36 33 29 40 20 46C11 40 4 33 4 22V7Z';
const SHIELD_INNER = 'M20 5.2L33 9.3V22C33 31.4 27.2 37.2 20 42.4C12.8 37.2 7 31.4 7 22V9.3Z';
const SHIELD_GEM = 'M20 .8l1.8 1.8-1.8 1.8-1.8-1.8z';

const STATUS_LABELS = [
  ['mood', 'Mood', 'Mood'],
  ['casts', 'Casts', 'Casts'],
  ['alertness', 'Alertness', 'Alert.'],
  ['weight', 'Weight', 'Weight'],
] as const;

/**
 * Status: the four cells (Mood, Casts, Alertness, Weight; ADR 0166 point
 * 86), each with its step meter, and the four shields under them.
 */
function statusEl(doc: Document, click: (id: ClickId) => void) {
  const box = el(doc, 'div', 'wc-cc-panel wc-cc-status');
  const cells = el(doc, 'div', 'wc-cc-cells');
  const fields = STATUS_LABELS.map(([key, label, short]) => {
    const f = key === 'weight' ? el(doc, 'div', 'wc-cc-f') : button(doc, 'wc-cc-f');
    f.dataset.key = key;
    if (key !== 'weight') {
      f.dataset.click = key;
      f.addEventListener('click', () => click(key));
    }
    const small = el(doc, 'span', 'wc-cc-k');
    const text = el(doc, 'span', 'wc-cc-kt', label);
    small.append(iconSvg(doc, key, 'wc-cc-i'), text);
    const line = el(doc, 'span', 'wc-cc-v');
    const value = el(doc, 'span', 'wc-cc-word');
    line.append(iconSvg(doc, key, 'wc-cc-i'), value);
    const meter = el(doc, 'span', 'wc-cc-mt');
    f.append(small, line, meter);
    cells.append(f);
    return { f, value, text, label, short, meter, lamps: [] as HTMLElement[] };
  });

  const shieldBox = el(doc, 'div', 'wc-cc-shields');
  const shields = SHIELDS.map(({ key, label, icon }) => {
    const s = el(doc, 'div', 'wc-cc-shield');
    s.dataset.key = key;
    const plate = el(doc, 'span', 'wc-cc-sb');
    const shape = svgEl(doc, 'svg', { class: 'wc-cc-sp', viewBox: '0 0 40 48', 'aria-hidden': 'true' });
    shape.append(svgEl(doc, 'path', { class: 'wc-cc-so', d: SHIELD_OUTER }), svgEl(doc, 'path', { class: 'wc-cc-sn', d: SHIELD_INNER }), svgEl(doc, 'path', { class: 'wc-cc-sg', d: SHIELD_GEM }));
    const value = el(doc, 'b', 'wc-cc-sv');
    plate.append(shape, iconSvg(doc, icon, 'wc-cc-i'), value);
    s.append(plate, el(doc, 'span', 'wc-cc-sk', label));
    shieldBox.append(s);
    return { s, value };
  });
  box.append(cells, shieldBox);

  const set = (views: readonly StatusFieldView[]): void => {
    views.forEach((v, i) => {
      const { f, value, meter, lamps } = fields[i]!;
      setText(value, v.value);
      setAttr(f, 'data-signal', v.signal);
      if (v.click) setClick(f, v.click);
      else {
        // A div: named as a group so that the label is read with the word.
        setAttr(f, 'role', 'group');
        setAttr(f, 'aria-label', v.name);
      }
      setTip(f, v.tip, v.name, `cc:${v.key}`);
      // The lamps are built once: a field's steps never change.
      while (lamps.length < v.steps) {
        const lamp = el(doc, 'i', 'wc-cc-lamp');
        meter.append(lamp);
        lamps.push(lamp);
      }
      lamps.forEach((lamp, j) => setAttr(lamp, 'data-on', j === v.step ? '' : null));
    });
  };
  /** The short labels (`Alert.`) where the long do not fit. */
  const setShort = (short: boolean): void => {
    for (const f of fields) setText(f.text, short ? f.short : f.label);
  };
  const setShields = (views: readonly ShieldView[]): void => {
    views.forEach((v, i) => {
      const { s, value } = shields[i]!;
      setText(value, v.value);
      setProp(value, '--n', String(Math.max(3, v.value.length)));
      setTip(s, v.tip, v.title, `cc:${v.key}`);
    });
  };
  return { box, set, setShort, setShields };
}

// ------------------------------------------------------------------- stones

/** One place of the stones' rows: a stone, the herblore `+` or the `+n`. */
interface Slot {
  el: HTMLSpanElement;
  icon: SVGSVGElement;
  text: HTMLSpanElement;
  fill: HTMLElement;
  x: HTMLElement;
  /** The stone it shows (null: the `+`, the `+n` or unused). */
  stone: Stone | null;
}

export interface StoneClock {
  now(): number;
  /** `timers.warnAt`: ending soon, s. */
  warnAt(): number;
}

/** A fill fraction in half-percent steps, so a long stone's bar is not written every second. */
const fillOf = (f: number): string => (Math.round(Math.max(0, Math.min(1, f)) * 200) / 200).toFixed(3);

/** The `+n`'s and the list's time: the countdown, or `on`. */
export function stoneClock(s: Stone, now: number, warnAt: number): string {
  const t = stoneTime(s, now, warnAt);
  return t.text ?? 'on';
}

/**
 * The stones at the bottom of Status and Stats (ADR 0166 point 120), and
 * the purse in their last row (point 121). Positions follow `StoneRows`;
 * a tick (`tick`) writes only the bars and the ending-soon mark. The
 * tooltips are live: their times are read when shown.
 */
function stonesEl(doc: Document, clock: StoneClock) {
  const box = el(doc, 'div', 'wc-cc-stones');
  const purse = el(doc, 'div', 'wc-cc-purse');
  const coins = (['gold', 'silver', 'copper'] as const).map((metal) => {
    const c = el(doc, 'span', 'wc-cc-coin');
    c.dataset.metal = metal;
    purse.append(c);
    return c;
  });
  box.append(purse);
  const slots: Slot[] = [];
  let key = '';
  let used = 0;

  const slot = (i: number): Slot => {
    let s = slots[i];
    if (s) return s;
    const e = el(doc, 'span', 'wc-cc-st');
    const face = el(doc, 'span', 'wc-cc-sti');
    const icon = iconSvg(doc, 'buff', 'wc-cc-i');
    const text = el(doc, 'span', 'wc-cc-stt');
    face.append(icon, text);
    const track = el(doc, 'span', 'wc-cc-stb');
    const fill = el(doc, 'i', 'wc-cc-stf');
    track.append(fill);
    const x = el(doc, 'span', 'wc-cc-stx');
    x.dataset.act = 'herbx';
    x.setAttribute('role', 'button');
    x.setAttribute('aria-label', 'Stop this herblore');
    x.append(iconSvg(doc, 'close', 'wc-cc-i'));
    e.append(face, track, x);
    box.insertBefore(e, purse);
    s = { el: e, icon, text, fill, x, stone: null };
    slots[i] = s;
    return s;
  };

  /**
   * The rows' places; false when they are what was drawn. `size`, `gap`
   * and `bar` are the layout's (`area.stones`).
   */
  const set = (rows: StoneRows, size: number, gap: number, bar: number): boolean => {
    let k = `${rows.per}|${size}|${gap}|${bar}`;
    for (const e of rows.entries) k += e.k === 'stone' ? `|${e.stone.id}:${e.stone.icon}:${e.stone.tone}:${e.stone.herbKey ?? ''}:${e.stone.expiresAt}` : e.k === 'more' ? `|+${e.rest.length}` : '|+';
    if (k === key) return false;
    key = k;
    const warnAt = (): number => clock.warnAt();
    rows.entries.forEach((e, i) => {
      const s = slot(i);
      const x = (i % rows.per) * (size + gap);
      const y = Math.floor(i / rows.per) * (size + bar + gap);
      setProp(s.el, 'transform', `translate(${x}px, ${y}px)`);
      setHidden(s.el, false);
      setAttr(s.el, 'data-k', e.k);
      if (e.k === 'stone') {
        const st = e.stone;
        s.stone = st;
        setIconSvg(s.icon, st.icon);
        setAttr(s.icon, 'hidden', null);
        setText(s.text, '');
        setAttr(s.el, 'data-tone', st.tone);
        setAttr(s.el, 'data-state', st.expiresAt !== null ? 'timed' : st.tracked ? 'still' : 'untimed');
        setAttr(s.el, 'data-act', null);
        setAttr(s.el, 'data-id', st.id);
        setHidden(s.x, st.herbKey === null);
        setAttr(s.x, 'data-key', st.herbKey);
        setLiveTip(s.el, () => stoneTip(st, clock.now(), warnAt()).tip, st.label, `cc:st:${st.id}`);
      } else {
        s.stone = null;
        setAttr(s.icon, 'hidden', '');
        setHidden(s.x, true);
        setAttr(s.el, 'data-tone', e.k === 'add' ? 'herb' : null);
        setAttr(s.el, 'data-state', null);
        setAttr(s.el, 'data-id', null);
        setAttr(s.el, 'data-end', null);
        if (e.k === 'add') {
          setText(s.text, '+');
          setAttr(s.el, 'data-act', 'herbadd');
          setTip(s.el, 'Click: start a herblore.', 'Herblores', 'cc:st:add');
        } else {
          const rest = e.rest;
          setText(s.text, `+${rest.length}`);
          setAttr(s.el, 'data-act', 'more');
          setLiveTip(
            s.el,
            () => {
              const now = clock.now();
              return [`${rest.length} more (no room). Click for the list:`, ...rest.map((r) => `${r.label}  ${stoneClock(r, now, warnAt())}`)].join('\n');
            },
            `+${rest.length}`,
            'cc:st:more',
          );
        }
      }
    });
    for (let i = rows.entries.length; i < used; i++) {
      const s = slots[i]!;
      s.stone = null;
      setHidden(s.el, true);
      setTip(s.el, null);
    }
    used = rows.entries.length;
    return true;
  };

  /** The bars and the ending-soon marks at `now`. True: a stone counts down. */
  const tick = (now: number, warnAt: number): boolean => {
    let timed = false;
    for (let i = 0; i < used; i++) {
      const s = slots[i]!;
      if (!s.stone) continue;
      const t = stoneTime(s.stone, now, warnAt);
      if (t.state === 'timed') timed = true;
      setProp(s.fill, '--f', fillOf(t.fill));
      setAttr(s.el, 'data-end', t.ending ? '' : null);
    }
    return timed;
  };

  /** The purse's first `n` coins (gold, silver, copper), in the last of `rows` rows. */
  const setPurse = (p: Purse | null, n: number, top: number): void => {
    setHidden(purse, p === null || n === 0);
    if (p === null || n === 0) {
      setTip(purse, null);
      return;
    }
    const values = [p.gold, p.silver, p.copper];
    coins.forEach((c, i) => {
      setHidden(c, i >= n);
      setText(c, i < n ? String(values[i]) : '');
    });
    setProp(purse, 'top', `${top}px`);
    const t = purseTip(p, n);
    setTip(purse, t.tip, t.title, 'cc:purse');
  };

  return { box, set, tick, setPurse };
}

/**
 * The `+n`'s list (ADR 0166 point 120): the stones that have no room, one
 * row each with its icon, name and time; a herblore's × stops it. In the
 * menu surface colours, under the `+n`; Esc and a press outside close it.
 */
export class StoneList extends PopupMenu {
  private key = '';

  constructor(
    doc: Document,
    private readonly onStop: (herbKey: string) => void,
    onClose: () => void,
  ) {
    super(doc, 'wc-tm-menu wc-cc-list', 'More stones', onClose);
  }

  /** Opens under `anchor`, or refreshes the rows when open. */
  show(anchor: HTMLElement, rest: readonly Stone[], colors: Readonly<Record<StoneTone, string>>, now: number, warnAt: number): void {
    this.fill(rest, colors, now, warnAt);
    this.openAt(anchor);
  }

  /** New rows and times while open. */
  update(rest: readonly Stone[], colors: Readonly<Record<StoneTone, string>>, now: number, warnAt: number): void {
    if (this.open) this.fill(rest, colors, now, warnAt);
  }

  private fill(rest: readonly Stone[], colors: Readonly<Record<StoneTone, string>>, now: number, warnAt: number): void {
    const times = rest.map((s) => stoneClock(s, now, warnAt));
    const key = rest.map((s, i) => `${s.id}:${s.herbKey ?? ''}:${times[i]}:${colors[s.tone]}`).join('|');
    if (key === this.key) return;
    this.key = key;
    const doc = this.doc;
    const head = el(doc, 'div', 'wc-cc-lh', `${rest.length} more (no room)`);
    this.el.replaceChildren(
      head,
      ...rest.map((s, i) => {
        const row = el(doc, 'div', 'wc-cc-lr');
        row.setAttribute('role', 'menuitem');
        row.dataset.id = s.id;
        row.style.setProperty('--c', colors[s.tone]);
        row.append(iconSvg(doc, s.icon, 'wc-cc-i'), el(doc, 'span', 'wc-cc-ln', s.label), el(doc, 'span', 'wc-cc-lt', times[i]!));
        if (s.herbKey !== null) {
          const x = el(doc, 'button', 'wc-cc-lx', '×');
          x.type = 'button';
          x.tabIndex = -1;
          x.dataset.key = s.herbKey;
          x.setAttribute('aria-label', `Stop ${s.label}`);
          row.append(x);
        }
        return row;
      }),
    );
  }

  protected pressed(target: HTMLElement): void {
    const x = target.closest<HTMLElement>('.wc-cc-lx');
    if (!x?.dataset.key) return;
    this.hide();
    this.onStop(x.dataset.key);
  }
}

// -------------------------------------------------------------------- Stats

function boxEl(doc: Document, label: string, cls = ''): { box: HTMLElement; value: HTMLElement } {
  const box = el(doc, 'div', cls ? `wc-cc-box ${cls}` : 'wc-cc-box');
  const value = el(doc, 'span', 'wc-cc-bv');
  box.append(el(doc, 'span', 'wc-cc-k', label), value);
  return { box, value };
}

function statsEl(doc: Document) {
  const box = el(doc, 'div', 'wc-cc-panel wc-cc-stats');

  const abs = el(doc, 'div', 'wc-cc-abilities');
  const abilities = ABILITIES.map((key) => {
    const a = el(doc, 'div', 'wc-cc-box wc-cc-ab');
    a.dataset.key = key;
    const value = el(doc, 'b', 'wc-cc-bv');
    const delta = el(doc, 'span', 'wc-cc-delta');
    a.append(el(doc, 'span', 'wc-cc-k', key.toUpperCase()), value, delta);
    abs.append(a);
    return { a, value, delta };
  });

  const row = el(doc, 'div', 'wc-cc-srow');
  const age = el(doc, 'div', 'wc-cc-box wc-cc-age');
  // Two lines, one where it is dense (CSS).
  const ageTop = el(doc, 'div', 'wc-cc-age-top');
  const next = el(doc, 'span', 'wc-cc-next');
  const ageLine = el(doc, 'div', 'wc-cc-age-now');
  const years = el(doc, 'b', 'wc-cc-bv');
  const ageName = el(doc, 'span', 'wc-cc-age-name');
  ageLine.append(years, ageName);
  ageTop.append(el(doc, 'span', 'wc-cc-k', 'Age'), ageLine, next);
  const track = el(doc, 'div', 'wc-cc-track');
  const steps = AGE_NAMES.map(() => {
    const s = el(doc, 'span', 'wc-cc-step');
    track.append(s);
    return s;
  });
  const now = el(doc, 'span', 'wc-cc-now');
  track.append(now);
  const table = el(doc, 'div', 'wc-cc-mods');
  table.append(el(doc, 'span', 'wc-cc-k is-row', 'Modifiers'));
  for (const k of VITAL_KINDS) table.append(el(doc, 'span', 'wc-cc-k', VITAL_LABEL[k]));
  const cells = ['Points', 'Regen'].map((label) => {
    table.append(el(doc, 'span', 'wc-cc-k is-row', label));
    return VITAL_KINDS.map(() => {
      const b = el(doc, 'b', 'wc-cc-mod');
      table.append(b);
      return b;
    });
  });
  age.append(ageTop, track, table);

  const senseGrid = el(doc, 'div', 'wc-cc-senses');
  const senses = SENSES.map(({ label }) => {
    const b = boxEl(doc, label);
    senseGrid.append(b.box);
    return b.value;
  });
  row.append(age, senseGrid);
  box.append(abs, row);

  const set = (v: StatsView): void => {
    v.abilities.forEach((a, i) => {
      const e = abilities[i]!;
      setText(e.value, a.value);
      setText(e.delta, a.delta);
      setAttr(e.a, 'data-dir', a.dir);
      setTip(e.a, a.tip, a.title, `cc:${a.key}`);
    });
    setText(years, v.age.years);
    setText(ageName, v.age.name);
    setText(next, v.age.next);
    const t = v.age.track;
    setHidden(track, t === null);
    if (t) {
      steps.forEach((s, i) => setAttr(s, 'data-past', i <= t.index ? '' : null));
      setProp(now, '--p', String(t.at));
    }
    const mods = v.age.modifiers;
    setHidden(table, mods === null);
    mods?.forEach((r, i) =>
      r.forEach((m, j) => {
        const c = cells[i]![j]!;
        setText(c, m.text);
        setAttr(c, 'data-dir', m.dir);
      }),
    );
    v.senses.forEach((t2, i) => setText(senses[i]!, t2));
  };
  return { box, set };
}

// --------------------------------------------------------------------- Lore

function loreEl(doc: Document) {
  const box = el(doc, 'div', 'wc-cc-panel wc-cc-lore');
  const field = (label: string, key: string): HTMLElement => {
    const b = boxEl(doc, label);
    b.box.dataset.key = key;
    box.append(b.box);
    return b.value;
  };
  const race = field('Race', 'race');
  const alignment = field('Alignment', 'alignment');
  const citizen = field('Citizen', 'citizen');
  // ADR 0166 point 123: a box for the word and one for the number.
  const fame = field('War fame', 'warFame');
  const points = field('War points', 'warPoints');
  const purse = field('Purse', 'purse');
  const noPurse = el(doc, 'span', 'wc-cc-nopurse', '—');
  const coins = (['gold', 'silver', 'copper'] as const).map((metal) => {
    const c = el(doc, 'span', 'wc-cc-coin');
    c.dataset.metal = metal;
    purse.append(c);
    return c;
  });
  purse.append(noPurse);
  const height = field('Height', 'height');
  const weight = field('Weight', 'weight');
  const birthday = field('Birthday', 'birthday');

  const set = (v: LoreView): void => {
    setText(race, v.race);
    setText(alignment, v.alignment);
    setText(citizen, v.citizen);
    setText(fame, v.warFame);
    setText(points, v.warPoints || '—');
    coins.forEach((c, i) => {
      setHidden(c, v.purse === null);
      setText(c, v.purse?.[i] ?? '');
    });
    setHidden(noPurse, v.purse !== null);
    setText(height, v.height);
    setText(weight, v.weight);
    setText(birthday, v.birthday);
  };
  return { box, set };
}

// ------------------------------------------------------------------- vitals

function vitalsEl(doc: Document) {
  const box = el(doc, 'div', 'wc-cc-foot');
  const bars = {} as Record<VitalKind, (v: VitalView) => void>;
  let hpBox!: HTMLElement;
  let wimpy!: HTMLElement;
  for (const kind of VITAL_KINDS) {
    const vital = el(doc, 'div', 'wc-cc-vital');
    vital.dataset.kind = kind;
    const trk = el(doc, 'div', 'wc-cc-trk');
    const fill = el(doc, 'span', 'wc-cc-fill');
    // The span is a window from `lo`, what is inside it ends at `hi`: two transforms, the hatch is not stretched.
    const span = el(doc, 'span', 'wc-cc-span');
    const hatch = el(doc, 'span', 'wc-cc-hatch');
    span.append(hatch);
    span.hidden = true;
    const text = el(doc, 'span', 'wc-cc-vt');
    const num = el(doc, 'span', 'wc-cc-num');
    const value = el(doc, 'span', 'wc-cc-vn');
    const max = el(doc, 'span', 'wc-cc-vm');
    num.append(value, max);
    text.append(el(doc, 'span', 'wc-cc-vk', VITAL_LABEL[kind]), num);
    trk.append(fill, span, text);
    vital.append(trk);
    if (kind === 'hp') {
      hpBox = vital;
      wimpy = el(doc, 'span', 'wc-cc-wimpy');
      wimpy.hidden = true;
      vital.append(wimpy);
    }
    box.append(vital);
    bars[kind] = (v) => {
      setText(value, v.value);
      setText(max, v.max);
      setAttr(vital, 'data-num', v.value === '' ? null : '');
      setProp(fill, '--p', String(v.fill));
      setProp(trk, '--c', v.color);
      setHidden(span, v.span === null);
      if (v.span) {
        setProp(span, '--lo', String(v.span.lo));
        setProp(hatch, '--len', String(v.span.hi - v.span.lo));
      }
    };
  }
  const setWimpy = (at: number | null): void => {
    setHidden(wimpy, at === null);
    if (at !== null) setProp(wimpy, '--p', String(at));
  };
  const setHpTip = (t: { title: string; tip: string }): void => setTip(hpBox, t.tip, t.title, 'cc:hp');
  return { box, bars, setWimpy, setHpTip };
}

// ---------------------------------------------------------------------- card

export interface CardHandlers {
  click(id: ClickId): void;
  tab(id: CardTab): void;
  /** The herblore `+` (its element, the menu's anchor). */
  add(anchor: HTMLElement): void;
  /** The `+n` (its element, the list's anchor). */
  more(anchor: HTMLElement): void;
  /** A herblore stone's ×. */
  stop(herbKey: string): void;
}

export class CardDom {
  readonly root: HTMLDivElement;
  readonly left: ReturnType<typeof leftEl>;
  readonly status: ReturnType<typeof statusEl>;
  readonly stones: ReturnType<typeof stonesEl>;
  readonly stats: ReturnType<typeof statsEl>;
  readonly lore: ReturnType<typeof loreEl>;
  readonly vitals: ReturnType<typeof vitalsEl>;
  private readonly main: HTMLDivElement;
  private readonly scroll: HTMLDivElement;
  private readonly quiet: HTMLDivElement;
  private readonly age: HTMLDivElement;
  private readonly tabs: HTMLDivElement;
  private readonly tabEls: { id: CardTab; b: HTMLButtonElement }[];
  private tab: CardTab | null = null;
  private stoneRows = 0;

  constructor(doc: Document, on: CardHandlers, clock: StoneClock) {
    this.root = el(doc, 'div', 'wc-cc');
    this.left = leftEl(doc, on.click);
    this.main = el(doc, 'div', 'wc-cc-main');
    this.main.setAttribute('role', 'tabpanel');
    this.status = statusEl(doc, on.click);
    this.scroll = el(doc, 'div', 'wc-cc-scroll');
    this.stats = statsEl(doc);
    this.lore = loreEl(doc);
    this.quiet = el(doc, 'div', 'wc-cc-quiet');
    this.scroll.append(this.stats.box, this.lore.box, this.quiet);
    this.age = el(doc, 'div', 'wc-cc-data-age');
    this.stones = stonesEl(doc, clock);
    this.main.append(this.status.box, this.scroll, this.age, this.stones.box);
    this.stones.box.addEventListener('click', (e) => {
      const t = e.target as HTMLElement | null;
      const act = typeof t?.closest === 'function' ? t.closest<HTMLElement>('[data-act]') : null;
      if (!act || !this.stones.box.contains(act)) return;
      if (act.dataset.act === 'herbx') {
        e.stopPropagation();
        if (act.dataset.key) on.stop(act.dataset.key);
      } else if (act.dataset.act === 'herbadd') on.add(act);
      else if (act.dataset.act === 'more') on.more(act);
    });
    this.tabs = el(doc, 'div', 'wc-cc-tabs');
    this.tabs.setAttribute('role', 'tablist');
    this.tabs.setAttribute('aria-orientation', 'vertical');
    this.tabEls = CARD_TABS.map(({ id, label }) => {
      const b = button(doc, 'wc-cc-tab');
      b.dataset.tab = id;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-label', label.charAt(0) + label.slice(1).toLowerCase());
      b.append(el(doc, 'span', 'wc-cc-tab-t', label));
      b.addEventListener('click', () => on.tab(id));
      this.tabs.append(b);
      return { id, b };
    });
    this.vitals = vitalsEl(doc);
    this.root.append(this.left.box, this.main, this.tabs, this.vitals.box);
    this.scroll.addEventListener('scroll', this.markMore, { passive: true });
  }

  /** The selected tab and its content: the data, or `quiet`. */
  setTab(tab: CardTab, quiet: string | null, age: string, moreWord: boolean): void {
    for (const { id, b } of this.tabEls) setAttr(b, 'aria-selected', String(id === tab));
    setAttr(this.root, 'data-tab', tab);
    setAttr(this.main, 'aria-label', tab.charAt(0).toUpperCase() + tab.slice(1));
    setHidden(this.status.box, tab !== 'status');
    setHidden(this.scroll, tab === 'status');
    setHidden(this.stats.box, tab !== 'stats' || quiet !== null);
    setHidden(this.lore.box, tab !== 'lore' || quiet !== null);
    setHidden(this.quiet, quiet === null);
    setText(this.quiet, quiet ?? '');
    setHidden(this.age, tab === 'status' || age === '');
    setText(this.age, age);
    setAttr(this.age, 'data-word', moreWord ? '' : null);
    this.showStones(tab);
    if (tab === this.tab) return;
    this.tab = tab;
    this.scroll.scrollTop = 0;
  }

  /** The stones show on Status and Stats, in the rows the layout gives (ADR 0166 point 122). */
  private showStones(tab: CardTab | null): void {
    setHidden(this.stones.box, tab === 'lore' || tab === null || this.stoneRows === 0);
  }

  /** Whether Stats or Lore goes on below what shows (reads the layout: only after a change of either). */
  readonly markMore = (): void => {
    const s = this.scroll;
    setAttr(this.main, 'data-more', !s.hidden && s.scrollHeight - s.scrollTop - s.clientHeight > 2 ? '' : null);
  };

  setLayout(l: CardLayout): void {
    const place = (e: HTMLElement, r: Rect): void => {
      setProp(e, 'left', px(r.x));
      setProp(e, 'top', px(r.y));
      setProp(e, 'width', px(r.w));
      setProp(e, 'height', px(r.h));
    };
    const root = this.root;
    const { left, status, area } = l;
    place(this.left.box, left);
    place(this.main, l.main);
    place(this.tabs, l.tabs);
    place(this.vitals.box, l.foot);
    setHidden(this.left.box, left.form === 'none');
    setHidden(this.main, l.main.w < 8 || l.main.h < 6);
    setHidden(this.tabs, l.tabs.h < 6);
    setAttr(root, 'data-mode', l.mode);
    setAttr(root, 'data-portrait', left.form === 'portrait' ? '' : null);
    // The image inside the iron is what is baked.
    this.left.setDisc(left.disc > 0 ? Math.max(0, left.disc - 2 * left.frame) : 0);
    setAttr(this.left.box, 'data-form', left.form);
    setAttr(this.tabs, 'data-form', l.tabs.form);
    const sb = this.status.box;
    setAttr(sb, 'data-form', status.form);
    setAttr(sb, 'data-cols', String(status.cols));
    setAttr(sb, 'data-tight', status.tight ? '' : null);
    setAttr(sb, 'data-shields', area.shield > 0 ? String(area.shieldCols) : null);
    setAttr(sb, 'data-shield-icon', area.shield >= 30 ? '' : null);
    this.status.setShort(status.short);
    this.stoneRows = area.stones.rows;
    this.showStones(this.tab);
    setAttr(this.stats.box, 'data-dense', l.info.dense ? '' : null);
    setAttr(this.lore.box, 'data-dense', l.info.dense ? '' : null);
    setAttr(this.stats.box, 'data-side', l.info.side ? '' : null);
    setAttr(this.stats.box, 'data-narrow-age', l.info.narrowAge ? '' : null);
    setAttr(this.lore.box, 'data-cols', String(l.info.loreCols));
    setAttr(this.vitals.box, 'data-labels', l.foot.labels ? '' : null);
    setAttr(this.vitals.box, 'data-form', l.foot.form);
    const k = l.scale;
    const st = area.stones;
    const vars: Record<string, string> = {
      '--k': String(Math.round(k * 1000) / 1000),
      '--name-px': px(left.namePx),
      '--name-w': px(left.nameW),
      '--name-h': px(left.nameH),
      '--disc': px(left.disc),
      '--disc-x': px(left.discX),
      '--frame': px(left.frame),
      '--radius': px(left.radius),
      '--ring-x': px(left.ringX - left.discX),
      '--ring-y': px(left.ringY),
      '--icons-x': px(left.iconsX),
      '--icons-y': px(left.iconsY),
      '--ring': px(left.ring),
      '--ico': px(left.icon),
      '--ico-gap': px(left.iconGap),
      '--tab-px': px(l.tabs.px),
      '--st-cols': String(status.cols),
      '--st-label': px(status.labelPx),
      '--st-value': px(status.valuePx),
      '--cells-h': px(status.h),
      '--cell-gap': px(status.gap),
      '--gap-top': px(area.gapTop),
      '--gap-bottom': px(area.gapBottom),
      '--shield': px(area.shield),
      '--shield-cols': String(area.shieldCols),
      '--shield-label': px(area.shieldLabelPx),
      '--sv-px': px(Math.max(8, Math.min(area.shield * 0.25, 16 * Math.max(1, k)))),
      '--stone': px(st.size),
      '--stone-bar': px(st.bar),
      '--stones-h': px(st.height),
      '--coin': px(area.purse.coin),
      '--purse-px': px(area.purse.font),
      '--purse-gap': px(area.purse.gap),
      '--ab-cols': String(l.info.abilityCols),
      '--sense-cols': String(l.info.senseCols),
      '--lore-cols': String(l.info.loreCols),
      '--info-value': px(l.info.valuePx),
      '--age-px': px(l.info.agePx),
      '--foot-pad': px(l.foot.pad),
      '--foot-gap': px(l.foot.gap),
      '--bar-inset': px(l.foot.inset),
      '--bar': px(l.foot.bar),
      '--arrow': px(l.foot.arrow),
      '--num-px': px(l.foot.numberPx),
      '--vk-px': px(l.foot.labelPx),
    };
    for (const [key, v] of Object.entries(vars)) setProp(root, key, v);
  }

  setTheme(ramp: Readonly<Record<string, string>>, light: boolean, adv: number, signals: { low: string; critical: string }): void {
    const root = this.root;
    setProp(root, '--cc-ink', ramp.vtext!);
    setProp(root, '--cc-label', ramp.label!);
    setProp(root, '--cc-track', ramp.track!);
    setProp(root, '--cc-low', signals.low);
    setProp(root, '--cc-critical', signals.critical);
    setProp(root, '--adv', adv.toFixed(4));
    setAttr(root, 'data-light', light ? '' : null);
  }

  /** The stones' colours: the Timers groups' (ADR 0166 point 130). */
  setStoneColors(colors: Readonly<Record<StoneTone, string>>): void {
    for (const [tone, c] of Object.entries(colors)) setProp(this.root, `--st-${tone}`, c);
  }

  setFight(on: boolean): void {
    setAttr(this.root, 'data-fight', on ? '' : null);
  }
}
