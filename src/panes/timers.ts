// Timers pane (ADR 0122 "Timers pane"; Inv §2.6 for the data, ADR 0017):
// what is on the character, on others you cast at, and how long it lasts,
// in the modern look of mockup 3c.
//
//   ✦ SANCTUARY ───────────────────── 2  +     <- header (icon, name, count); corner + (gold)
//   (You        4m) (Gibur      ~3m)           <- bars: pills whose fill drains right → left
//   ✧ SPELLS ──────────────────────── 5
//   (Breath of briskness 8s) (Shield 52s) …
//   ◉ BLINDS ───────────────── 12 · next 4s
//   ◔ huge black…warg  4s   ◔ warg  11s        <- circles: an 18 px ring, name and time beside
//   ♡ CHARMIES ─────────────────────── 1
//   (Huge stone troll        21m  ×)           <- × forgets the charmie
//   ↓ 3 more timers                            <- indicator row on overflow
//
// - DOM, not cell rows: the pane's own font, sizes in em of it (panes.css,
//   `.wc-tm`). The model (timers-model.ts) decides what is drawn; this file
//   keeps one element per group and per item, keyed by id, and changes only
//   what changed, so the 1 Hz tick touches only the times and fills (and
//   a pulse keeps running).
// - Colours: each group's setting on the pane's side (Auto → the dark or
//   light default, palette.ts); text and lines from the pane shade ramp;
//   the ending-soon time in the side's signal red.
// - Tooltips (pane-tooltip.ts): every item says its name in full, the time
//   left exactly, what it is ("about" for another's sanctuary you cast).
// - Corner `+` (gold, top right) opens the herblore add-view (one row per
//   herb, `+` starts it, `−` stops it), where it becomes `×` (back). In a
//   log player (`ctx.player`, ADR 0021) the pane is read-only: no corner
//   and no charm `×`.
// - The list scrolls natively by pixels (wheel, touchpad; ADR 0052). When it
//   overflows, the last pane row is an indicator: `↑ N timers above` once
//   scrolled at all (timers partly above count; click → top), else
//   `↓ N more timers`.
// - Redraw at 1 Hz on wall-clock seconds while something counts; blank
//   while inactive; a disconnect resets the view.

import type { TimersSettings } from '../settings/types';
import { forwardWheel } from './anchored-list';
import type { PaneContext } from './context';
import { ICONS, ICON_VIEWBOX, type IconName } from './icons';
import { signalColors } from './palette';
import { PaneShell } from './pane';
import { installPaneTooltip, type PaneTooltip } from './pane-tooltip';
import { paneShade } from './shade';
import { type TimerGroupView, type TimerItem, timersModel, timersTimed } from './timers-model';

export { blindShort, stripArticle, timersModel } from './timers-model';

/** Corner and indicator gold (the old indicator's). */
export const CORNER_FG = '#d4a04e';
/** ms after a wall-clock second boundary at which the 1 Hz redraw runs. */
const TICK_LAG_MS = 5;
/** A ring's circumference (r = 10 in a 24-unit box). */
const RING_C = 2 * Math.PI * 10;
const SVG_NS = 'http://www.w3.org/2000/svg';

export type TimersMode = 'list' | 'add';

/** The ring's dash for a fill of `pct`. */
export function ringDash(pct: number): string {
  const p = Math.max(0, Math.min(1, Number.isFinite(pct) ? pct : 0));
  return `${(p * RING_C).toFixed(2)} ${RING_C.toFixed(2)}`;
}

/** The indicator text for `below` items under the view and `above` over it, or null. */
export function timersIndicator(above: number, below: number): { text: string; up: boolean } | null {
  if (above > 0) return { text: `↑ ${above} ${above === 1 ? 'timer' : 'timers'} above`, up: true };
  if (below > 0) return { text: `↓ ${below} more ${below === 1 ? 'timer' : 'timers'}`, up: false };
  return null;
}

// ------------------------------------------------------- DOM helpers

const setText = (el: Element, t: string): void => {
  if (el.textContent !== t) el.textContent = t;
};
const setClass = (el: Element, c: string): void => {
  if (el.getAttribute('class') !== c) el.setAttribute('class', c);
};
const setAttr = (el: Element, k: string, v: string | null): void => {
  if (v === null) {
    if (el.hasAttribute(k)) el.removeAttribute(k);
  } else if (el.getAttribute(k) !== v) el.setAttribute(k, v);
};
const setProp = (el: HTMLElement | SVGElement, k: string, v: string): void => {
  if (el.style.getPropertyValue(k) !== v) el.style.setProperty(k, v);
};
const setHidden = (el: HTMLElement, h: boolean): void => {
  if (el.hidden !== h) el.hidden = h;
};

function svgIcon(doc: Document, cls: string, name: IconName): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', cls);
  svg.setAttribute('viewBox', ICON_VIEWBOX);
  svg.setAttribute('aria-hidden', 'true');
  const p = doc.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', ICONS[name]);
  svg.append(p);
  return svg;
}

const setIcon = (svg: SVGSVGElement, name: IconName): void => setAttr(svg.firstElementChild!, 'd', ICONS[name]);

/** Sets the tooltip data only when it changed (a tick must not touch the DOM). */
function setTipIf(el: HTMLElement, text: string, title: string, key: string): void {
  if (el.dataset.tip !== text) el.dataset.tip = text;
  if (el.dataset.tipTitle !== title) el.dataset.tipTitle = title;
  if (el.dataset.tipKey !== key) el.dataset.tipKey = key;
}

/** One timer's element (a pill or a ring row), kept across renders. */
class ItemEl {
  readonly el: HTMLDivElement;
  private readonly fill: HTMLSpanElement | null = null;
  private readonly ring: SVGCircleElement | null = null;
  private readonly icon: SVGSVGElement;
  private readonly nameEl: HTMLSpanElement;
  private readonly timeEl: HTMLSpanElement;
  private readonly xEl: HTMLButtonElement | null = null;

  constructor(
    doc: Document,
    readonly style: TimersSettings['style'],
    readonly id: string,
    removable: boolean,
  ) {
    this.el = doc.createElement('div');
    this.el.dataset.id = id;
    if (style === 'bars') {
      const clip = doc.createElement('span');
      clip.className = 'wc-tm-clip';
      this.fill = doc.createElement('span');
      this.fill.className = 'wc-tm-fill';
      clip.append(this.fill);
      this.icon = svgIcon(doc, 'wc-tm-ic', 'spell');
      this.el.append(clip, this.icon);
    } else {
      const rw = doc.createElement('span');
      rw.className = 'wc-tm-rw';
      const svg = doc.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', 'wc-tm-ring');
      svg.setAttribute('viewBox', ICON_VIEWBOX);
      svg.setAttribute('aria-hidden', 'true');
      const track = doc.createElementNS(SVG_NS, 'circle');
      const arc = doc.createElementNS(SVG_NS, 'circle');
      for (const [c, cls] of [
        [track, 'wc-tm-rb'],
        [arc, 'wc-tm-ra'],
      ] as const) {
        c.setAttribute('class', cls);
        c.setAttribute('cx', '12');
        c.setAttribute('cy', '12');
        c.setAttribute('r', '10');
        svg.append(c);
      }
      this.ring = arc;
      this.icon = svgIcon(doc, 'wc-tm-ii', 'spell');
      rw.append(svg, this.icon);
      this.el.append(rw);
    }
    this.nameEl = doc.createElement('span');
    this.nameEl.className = 'wc-tm-n';
    this.timeEl = doc.createElement('span');
    this.timeEl.className = 'wc-tm-t';
    this.el.append(this.nameEl, this.timeEl);
    if (removable) {
      this.xEl = doc.createElement('button');
      this.xEl.type = 'button';
      this.xEl.tabIndex = -1;
      this.xEl.className = 'wc-tm-x';
      this.xEl.dataset.act = 'charm';
      this.xEl.dataset.id = id;
      this.xEl.setAttribute('aria-label', 'Forget this charmie');
      this.xEl.append(svgIcon(doc, '', 'close'));
      this.el.append(this.xEl);
    }
  }

  get removable(): boolean {
    return this.xEl !== null;
  }

  update(t: TimerItem): void {
    const base = this.style === 'bars' ? 'wc-tm-chip' : 'wc-tm-rc';
    setClass(this.el, `${base} is-${t.kind}${t.ending ? ` is-${t.ending}` : ''}`);
    setIcon(this.icon, t.icon);
    if (this.fill) {
      setProp(this.icon, 'display', t.chipIcon ? '' : 'none');
      setProp(this.fill, 'width', `${(t.pct * 100).toFixed(1)}%`);
    }
    if (this.ring) {
      setAttr(this.ring, 'class', t.kind === 'untimed' ? 'wc-tm-ra is-unk' : 'wc-tm-ra');
      setProp(this.ring, 'stroke-dasharray', ringDash(t.kind === 'untimed' || t.kind === 'still' ? 1 : t.kind === 'charm' ? 1 : t.pct));
    }
    setText(this.nameEl, t.name);
    setText(this.timeEl, t.time ?? '');
    setHidden(this.timeEl, t.time === null);
    setTipIf(this.el, t.tip, t.full, `tm:${t.id}`);
  }
}

/** One group's element: header and items, kept across renders. */
class GroupEl {
  readonly el: HTMLDivElement;
  private readonly head: HTMLDivElement;
  private readonly headIcon: SVGSVGElement;
  private readonly countEl: HTMLSpanElement;
  private readonly itemsEl: HTMLDivElement;
  private readonly items = new Map<string, ItemEl>();

  constructor(
    private readonly doc: Document,
    readonly group: string,
  ) {
    this.el = doc.createElement('div');
    this.el.dataset.group = group;
    this.head = doc.createElement('div');
    this.head.className = 'wc-tm-h';
    this.headIcon = svgIcon(doc, 'wc-tm-hi', 'spell');
    const label = doc.createElement('span');
    label.className = 'wc-tm-hl';
    const line = doc.createElement('span');
    line.className = 'wc-tm-hln';
    this.countEl = doc.createElement('span');
    this.countEl.className = 'wc-tm-hc';
    this.head.append(this.headIcon, label, line, this.countEl);
    this.itemsEl = doc.createElement('div');
    this.el.append(this.head, this.itemsEl);
  }

  /** All item elements in order (the indicator counts them). */
  itemEls(): HTMLElement[] {
    return [...this.itemsEl.children] as HTMLElement[];
  }

  update(g: TimerGroupView, s: TimersSettings, first: boolean, readOnly: boolean): void {
    setClass(this.el, `wc-tm-g${first ? ' is-first' : ''}`);
    setProp(this.el, '--c', g.color);
    setHidden(this.head, !s.headers);
    setIcon(this.headIcon, g.icon);
    setText(this.head.children[1]!, g.label);
    setText(this.countEl, g.count);
    setClass(this.itemsEl, `wc-tm-items is-${g.layout}`);
    setProp(this.itemsEl, 'grid-template-columns', g.layout === 'grid' ? `repeat(${g.cols}, minmax(0, 1fr))` : '');
    const seen = new Set<string>();
    g.items.forEach((t, i) => {
      seen.add(t.id);
      const removable = t.removable && !readOnly;
      let it = this.items.get(t.id);
      if (it && (it.style !== s.style || it.removable !== removable)) {
        it.el.remove();
        it = undefined;
      }
      if (!it) {
        it = new ItemEl(this.doc, s.style, t.id, removable);
        this.items.set(t.id, it);
      }
      it.update(t);
      if (this.itemsEl.children[i] !== it.el) this.itemsEl.insertBefore(it.el, this.itemsEl.children[i] ?? null);
    });
    for (const [id, it] of this.items) {
      if (seen.has(id)) continue;
      it.el.remove();
      this.items.delete(id);
    }
  }
}

// ------------------------------------------------------------------ pane

export class TimersPane extends PaneShell {
  private mode: TimersMode = 'list';
  private tickTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly root: HTMLDivElement;
  /** The native scroller, above the indicator row. */
  private readonly scroller: HTMLDivElement;
  private readonly listEl: HTMLDivElement;
  private readonly herbsEl: HTMLDivElement;
  private readonly moreEl: HTMLDivElement;
  private readonly corner: HTMLButtonElement;
  /** Ten characters in the items' font: the measured character width. */
  private readonly probe: HTMLSpanElement;
  private readonly groups = new Map<string, GroupEl>();
  private readonly tip: PaneTooltip;
  private herbsKey = '';
  /** Scroll to the top at the next render (a mode switch, a reset). */
  private toTop = false;

  constructor(ctx: PaneContext) {
    super(ctx, 'timers');
    const doc = ctx.doc;
    this.tip = installPaneTooltip(doc);
    this.own(this.tip.attach(this.content));
    this.root = doc.createElement('div');
    this.root.className = 'wc-tm';
    this.scroller = doc.createElement('div');
    this.scroller.className = 'wc-tm-scroll';
    this.listEl = doc.createElement('div');
    this.listEl.className = 'wc-tm-list';
    this.herbsEl = doc.createElement('div');
    this.herbsEl.className = 'wc-tm-herbs';
    this.scroller.append(this.listEl, this.herbsEl);
    this.moreEl = doc.createElement('div');
    this.moreEl.className = 'wc-tm-more';
    this.moreEl.hidden = true;
    this.corner = doc.createElement('button');
    this.corner.type = 'button';
    this.corner.tabIndex = -1;
    this.corner.className = 'wc-tm-corner';
    this.corner.dataset.act = 'corner';
    this.probe = doc.createElement('span');
    this.probe.className = 'wc-tm-probe';
    this.probe.setAttribute('aria-hidden', 'true');
    this.probe.textContent = '0000000000';
    this.root.append(this.scroller, this.moreEl, this.corner, this.probe);
    this.own(ctx.game.subscribe((part) => part === 'timers' && this.markDirty()));
    this.own(
      ctx.settings.subscribe(
        (next, prev) => (next.timers !== prev.timers || next.appearance !== prev.appearance || next.panes !== prev.panes) && this.markDirty(),
      ),
    );
    this.root.addEventListener('mousedown', this.onDown);
    this.scroller.addEventListener('scroll', this.onScroll, { passive: true });
    this.own(forwardWheel(this.el, () => this.scroller, () => ctx.cells.get().h));
    this.own(() => {
      this.root.removeEventListener('mousedown', this.onDown);
      this.scroller.removeEventListener('scroll', this.onScroll);
      this.clearTick();
    });
  }

  /** `list` or the herblore add-view (tests). */
  get viewMode(): TimersMode {
    return this.mode;
  }

  /** The scroller (tests). */
  get scrollEl(): HTMLDivElement {
    return this.scroller;
  }

  protected override onActiveChange(active: boolean): void {
    if (active) return;
    this.mode = 'list';
    this.toTop = true;
    this.clearTick();
  }

  protected override blank(): void {
    this.content.replaceChildren();
    this.listEl.replaceChildren();
    this.groups.clear();
    this.herbsKey = '';
  }

  protected override render(): void {
    if (this.root.parentNode !== this.content) this.content.replaceChildren(this.root);
    const s = this.ctx.settings.get();
    const shade = paneShade(s, 'timers');
    const now = this.ctx.now();
    const cells = this.ctx.cells.get();
    const ro = this.ctx.player === true;
    const view = this.ctx.game.timers.view(now);

    // Colours of this side.
    setAttr(this.root, 'data-light', shade.light ? '' : null);
    setAttr(this.root, 'data-style', s.timers.style);
    setProp(this.root, '--tm-fg', shade.ramp.vtext);
    setProp(this.root, '--tm-dim', shade.ramp.label);
    setProp(this.root, '--tm-faint', shade.ramp.mid);
    setProp(this.root, '--tm-line', shade.ramp.track);
    setProp(this.root, '--tm-ending', signalColors(shade.light).ending);

    // Corner: `+` in the list, `×` in the add-view; none in a player.
    setHidden(this.corner, ro);
    setText(this.corner, this.mode === 'add' ? '×' : '+');
    setAttr(this.corner, 'aria-label', this.mode === 'add' ? 'Close herblores' : 'Herblores');
    setAttr(this.root, 'data-corner', ro ? null : '');

    let timed = false;
    if (this.mode === 'add') {
      setHidden(this.listEl, true);
      setHidden(this.herbsEl, false);
      this.renderHerbs(view.herbs);
    } else {
      setHidden(this.listEl, false);
      setHidden(this.herbsEl, true);
      // The room for names: the list's measured width and character width
      // (estimated from the cell metrics where nothing is laid out).
      const cellW = cells.w || 8;
      const charW = this.probe.getBoundingClientRect().width / 10 || cellW * 0.85;
      const inner = this.listEl.clientWidth;
      const pad = cellW * 0.6;
      const groups = timersModel({
        view,
        settings: s.timers,
        now,
        light: shade.light,
        width: Math.max(0, (inner > 0 ? inner : this.cols * cellW) - pad),
        charW,
      });
      timed = timersTimed(groups);
      this.renderGroups(groups, s.timers, ro);
    }
    if (this.toTop) {
      this.toTop = false;
      this.scroller.scrollTop = 0;
    }
    this.updateMore();
    this.tip.refresh();
    this.armTick(timed, now);
  }

  private renderGroups(groups: TimerGroupView[], s: TimersSettings, ro: boolean): void {
    const seen = new Set<string>();
    groups.forEach((g, i) => {
      seen.add(g.group);
      let ge = this.groups.get(g.group);
      if (!ge) {
        ge = new GroupEl(this.ctx.doc, g.group);
        this.groups.set(g.group, ge);
      }
      ge.update(g, s, i === 0, ro);
      if (this.listEl.children[i] !== ge.el) this.listEl.insertBefore(ge.el, this.listEl.children[i] ?? null);
    });
    for (const [k, ge] of this.groups) {
      if (seen.has(k)) continue;
      ge.el.remove();
      this.groups.delete(k);
    }
  }

  private renderHerbs(herbs: Array<{ key: string; name: string; active: boolean }>): void {
    const key = JSON.stringify(herbs);
    if (key === this.herbsKey) return;
    this.herbsKey = key;
    const doc = this.ctx.doc;
    this.herbsEl.replaceChildren(
      ...herbs.map((h) => {
        const b = doc.createElement('button');
        b.type = 'button';
        b.tabIndex = -1;
        b.className = `wc-tm-herb${h.active ? ' is-on' : ''}`;
        b.dataset.act = 'herb';
        b.dataset.key = h.key;
        b.dataset.active = String(h.active);
        const sign = doc.createElement('span');
        sign.className = 'wc-tm-hs';
        sign.textContent = h.active ? '−' : '+';
        const name = doc.createElement('span');
        name.className = 'wc-tm-hn';
        name.textContent = h.name;
        b.append(sign, name);
        b.setAttribute('aria-label', `${h.active ? 'Stop' : 'Start'} ${h.name}`);
        return b;
      }),
    );
  }

  /** The indicator row from the scroll position. */
  private updateMore(): void {
    const sc = this.scroller;
    const over = sc.scrollHeight > sc.clientHeight + 1;
    let ind: { text: string; up: boolean } | null = null;
    if (over) {
      const top = sc.scrollTop;
      const bottom = top + sc.clientHeight;
      const els =
        this.mode === 'add'
          ? ([...this.herbsEl.children] as HTMLElement[])
          : [...this.groups.values()].flatMap((g) => g.itemEls());
      let above = 0;
      let below = 0;
      for (const el of els) {
        if (el.offsetTop < top) above++;
        else if (el.offsetTop + el.offsetHeight > bottom + 1) below++;
      }
      // Once scrolled at all, the indicator points up (rows partly above count).
      ind = timersIndicator(top > 0 ? Math.max(1, above) : 0, below);
    }
    setHidden(this.moreEl, ind === null);
    setText(this.moreEl, ind?.text ?? '');
    setAttr(this.moreEl, 'data-up', ind?.up ? '' : null);
  }

  private readonly onScroll = (): void => this.updateMore();

  /** The next redraw just after the coming wall-clock second, while anything counts. */
  private armTick(timed: boolean, now: number): void {
    if (!timed) return this.clearTick();
    if (this.tickTimer !== null) return;
    const win = this.ctx.doc.defaultView;
    const set = win ? win.setTimeout.bind(win) : setTimeout;
    this.tickTimer = set(() => {
      this.tickTimer = null;
      this.markDirty();
    }, 1000 - (now % 1000) + TICK_LAG_MS);
  }

  private clearTick(): void {
    if (this.tickTimer === null) return;
    const win = this.ctx.doc.defaultView;
    (win ? win.clearTimeout.bind(win) : clearTimeout)(this.tickTimer);
    this.tickTimer = null;
  }

  private readonly onDown = (e: MouseEvent): void => {
    if (e.button !== 0 || !this.active) return;
    // The `↑ N timers above` indicator scrolls to the top (also in a player).
    if (this.moreEl.hasAttribute('data-up') && this.moreEl.contains(e.target as Node)) {
      e.preventDefault();
      e.stopPropagation();
      this.scroller.scrollTop = 0;
      this.updateMore();
      return;
    }
    const z = (e.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-act]') ?? null;
    // Read-only in a player.
    if (this.ctx.player || !z || !this.root.contains(z)) return;
    e.preventDefault();
    e.stopPropagation();
    const timers = this.ctx.game.timers;
    switch (z.dataset.act) {
      case 'charm':
        timers.dropCharm(z.dataset.id!);
        break;
      case 'herb':
        if (z.dataset.active === 'true') timers.removeHerb(z.dataset.key!);
        else timers.addHerb(z.dataset.key!);
        break;
      case 'corner':
        this.mode = this.mode === 'list' ? 'add' : 'list';
        this.toTop = true;
        this.tip.hide();
        break;
    }
    this.markDirty();
  };
}
