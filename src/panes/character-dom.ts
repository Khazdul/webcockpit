// The Character card's elements (stage 77 part D): built once, and the
// setters that write a view into them. A value change never builds or
// removes an element. What is drawn is character-model.ts, the sizes are
// character-layout.ts, when is character.ts.

import { ABILITIES, AGE_NAMES } from '../gmcp/age';
import { type VitalKind, VITAL_KINDS } from '../gmcp/bands';
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
  type StatsView,
  type StatusFieldView,
  VITAL_LABEL,
  type VitalView,
} from './character-model';
import { el, setAttr, setHidden, setProp, setText } from './dom';
import { type IconName, SVG_NS, iconSvg, setIconSvg } from './icons';
import { setTip } from './pane-tooltip';
import { portraitImage } from './portrait';
import { type PortraitId, figureSvg } from './portrait-figures';

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
 * The round frame's content (decision 22, part E): the race's SVG
 * placeholder (portrait-figures.ts), or its raster file when there is one
 * (portrait.ts). Built only when the portrait changes. An image replaces
 * the placeholder once it has loaded; one that fails keeps it.
 */
function portraitEl(doc: Document, disc: HTMLElement) {
  let shown: PortraitId | null = null;
  const set = (id: PortraitId): void => {
    if (id === shown) return;
    shown = id;
    const svg = figureSvg(doc, id);
    disc.replaceChildren(svg);
    const src = portraitImage(id);
    if (src === null) return;
    const img = el(doc, 'img', 'wc-cc-photo');
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    img.hidden = true;
    img.addEventListener(
      'load',
      () => {
        if (shown !== id) return;
        img.hidden = false;
        svg.remove();
      },
      { once: true },
    );
    img.src = src;
    disc.append(img);
  };
  set('neutral');
  return set;
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
  const setPortrait = portraitEl(doc, disc);
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
  return { box, setName, setPortrait, setRing: ring.set, setIcons };
}

// ------------------------------------------------------------------- Status

function statusEl(doc: Document, click: (id: ClickId) => void) {
  const box = el(doc, 'div', 'wc-cc-panel wc-cc-status');
  const fields = (
    [
      ['mood', 'Mood'],
      ['casts', 'Casts'],
      ['alertness', 'Alertness'],
      ['weight', 'Weight'],
    ] as const
  ).map(([key, label]) => {
    const f = key === 'weight' ? el(doc, 'div', 'wc-cc-f') : button(doc, 'wc-cc-f');
    f.dataset.key = key;
    if (key !== 'weight') {
      f.dataset.click = key;
      f.addEventListener('click', () => click(key));
    }
    const small = el(doc, 'span', 'wc-cc-k');
    small.append(iconSvg(doc, key, 'wc-cc-i'), el(doc, 'span', 'wc-cc-kt', label));
    const line = el(doc, 'span', 'wc-cc-v');
    const value = el(doc, 'span', 'wc-cc-word');
    line.append(iconSvg(doc, key, 'wc-cc-i'), value);
    f.append(small, line);
    box.append(f);
    return { f, value };
  });

  const set = (views: readonly StatusFieldView[]): void => {
    views.forEach((v, i) => {
      const { f, value } = fields[i]!;
      setText(value, v.value);
      setAttr(f, 'data-signal', v.signal);
      if (v.click) setClick(f, v.click);
      else {
        // A div: named as a group so that the label is read with the word.
        setAttr(f, 'role', 'group');
        setAttr(f, 'aria-label', v.name);
      }
      setTip(f, v.tip, v.name, `cc:${v.key}`);
    });
  };
  return { box, set };
}

// -------------------------------------------------------------------- Stats

const SHIELD = 'M12 2l8 3.5v6c0 5.5-3.5 9-8 10.5-4.5-1.5-8-5-8-10.5v-6z';

function boxEl(doc: Document, label: string, cls = ''): { box: HTMLElement; value: HTMLElement } {
  const box = el(doc, 'div', cls ? `wc-cc-box ${cls}` : 'wc-cc-box');
  const value = el(doc, 'span', 'wc-cc-bv');
  box.append(el(doc, 'span', 'wc-cc-k', label), value);
  return { box, value };
}

function statsEl(doc: Document) {
  const box = el(doc, 'div', 'wc-cc-panel wc-cc-stats');

  const badges = el(doc, 'div', 'wc-cc-shields');
  const shields = SHIELDS.map(({ key, label, icon }) => {
    const s = el(doc, 'div', 'wc-cc-shield');
    s.dataset.key = key;
    const plate = el(doc, 'span', 'wc-cc-plate');
    const bg = svgEl(doc, 'svg', { class: 'wc-cc-plate-bg', viewBox: '0 0 24 24', 'aria-hidden': 'true' });
    bg.append(svgEl(doc, 'path', { d: SHIELD }));
    const value = el(doc, 'b', 'wc-cc-sv');
    plate.append(bg, iconSvg(doc, icon, 'wc-cc-i'), value);
    s.append(plate, el(doc, 'span', 'wc-cc-k', label));
    badges.append(s);
    return value;
  });

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
  box.append(badges, abs, row);

  const set = (v: StatsView): void => {
    v.shields.forEach((t, i) => {
      const s = shields[i]!;
      setText(s, t);
      setProp(s, '--n', String(Math.max(3, t.length)));
    });
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
  const fame = field('War fame', 'warFame');
  const fameWord = el(doc, 'span', 'wc-cc-fame');
  const famePoints = el(doc, 'span', 'wc-cc-points');
  fame.append(fameWord, famePoints);
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
    setText(fameWord, v.warFame);
    setText(famePoints, v.warPoints);
    setHidden(famePoints, v.warPoints === '');
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
}

export class CardDom {
  readonly root: HTMLDivElement;
  readonly left: ReturnType<typeof leftEl>;
  readonly status: ReturnType<typeof statusEl>;
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

  constructor(doc: Document, on: CardHandlers) {
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
    this.main.append(this.status.box, this.scroll, this.age);
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
    if (tab === this.tab) return;
    this.tab = tab;
    this.scroll.scrollTop = 0;
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
    place(this.left.box, l.left);
    place(this.main, l.main);
    place(this.tabs, l.tabs);
    place(this.vitals.box, l.foot);
    setHidden(this.left.box, l.left.form === 'none');
    setHidden(this.main, l.main.w < 8 || l.main.h < 6);
    setHidden(this.tabs, l.tabs.h < 6);
    setAttr(root, 'data-mode', l.mode);
    setAttr(root, 'data-portrait', l.left.disc > 0 ? '' : null);
    setAttr(this.left.box, 'data-form', l.left.form);
    setAttr(this.tabs, 'data-form', l.tabs.form);
    setAttr(this.status.box, 'data-form', l.status.form);
    setAttr(this.status.box, 'data-cols', String(l.status.cols));
    setAttr(this.status.box, 'data-tight', l.status.tight ? '' : null);
    setAttr(this.stats.box, 'data-dense', l.info.dense ? '' : null);
    setAttr(this.lore.box, 'data-dense', l.info.dense ? '' : null);
    setAttr(this.stats.box, 'data-side', l.info.side ? '' : null);
    setAttr(this.stats.box, 'data-narrow-age', l.info.narrowAge ? '' : null);
    setAttr(this.lore.box, 'data-cols', String(l.info.loreCols));
    setAttr(this.vitals.box, 'data-labels', l.foot.labels ? '' : null);
    setAttr(this.vitals.box, 'data-form', l.foot.form);
    const vars: Record<string, string> = {
      '--k': String(Math.round(l.scale * 1000) / 1000),
      '--name-px': px(l.left.namePx),
      '--name-w': px(l.left.nameW),
      '--disc': px(l.left.disc),
      '--ring': px(l.left.ring),
      '--ico': px(l.left.icon),
      '--ico-gap': px(l.left.iconGap),
      '--tab-px': px(l.tabs.px),
      '--st-cols': String(l.status.cols),
      '--st-label': px(l.status.labelPx),
      '--st-value': px(l.status.valuePx),
      '--shield-cols': String(l.info.shieldCols),
      '--shield': px(l.info.shield),
      '--ab-cols': String(l.info.abilityCols),
      '--sense-cols': String(l.info.senseCols),
      '--lore-cols': String(l.info.loreCols),
      '--info-value': px(l.info.valuePx),
      '--age-px': px(l.info.agePx),
      '--foot-pad': px(l.foot.pad),
      '--foot-gap': px(l.foot.gap),
      '--bar-inset': px(l.foot.inset),
      '--bar': px(l.foot.bar),
      '--bar-fight': px(l.foot.fightBar),
      '--arrow': px(l.foot.arrow),
      '--num-px': px(l.foot.numberPx),
      '--vk-px': px(l.foot.labelPx),
    };
    for (const [k, v] of Object.entries(vars)) setProp(root, k, v);
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

  setFight(on: boolean): void {
    setAttr(this.root, 'data-fight', on ? '' : null);
  }
}
