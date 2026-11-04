// Timers pane (ADR 0122 "Timers pane"; Inv §2.6 for the data, ADR 0017):
// what is on the character, on others you cast at, and how long it lasts,
// in the modern look of mockup 3c.
//
//   ✦ SANCTUARY ──────────────────────────     <- header (icon, name, rule)
//   (You        4m) (Gibur      ~3m)           <- bars: pills whose fill drains right → left
//   ✧ SPELLS ─────────────────────────────
//   (Breath of briskness 8s) (Shield 52s) …
//   ❦ HERBLORES + ─────────────────────────     <- always shown while enabled; + opens the menu
//   (Haste (recovery)  17m)                    <- hover: × stops the herblore
//   ◉ BLINDS ─────────────────────────────
//   ◔ huge black…warg  4s   ◔ warg  11s        <- circles: an 18 px ring, name and time beside
//   ♡ CHARMIES ───────────────────────────
//   (Huge stone troll        21m  ×)           <- × forgets the charmie
//   ↓ 3 more timers                            <- indicator row on overflow
//
// - DOM, not cell rows: the pane's own font, sizes in em of it (timers.css,
//   `.wc-tm`). The model (timers-model.ts) decides what is drawn; this file
//   keeps one element per group and per item, keyed by id, and changes only
//   what changed, so the 1 Hz tick touches only the times and fills (and
//   a pulse keeps running).
// - Layout reads: the character width and the list's width are measured
//   only when the pane's size or the font changes; the indicator row
//   reads the scroll position only when the items or their texts changed,
//   and on a scroll (once a frame).
// - Colours: each group's setting on the pane's side (Auto → the dark or
//   light default, palette.ts); text and lines from the pane shade ramp;
//   the ending-soon time in the side's signal red.
// - Tooltips (pane-tooltip.ts): every item says its name in full, the time
//   left exactly, what it is ("about" for another's sanctuary you cast).
// - Herblore (ADR 0122 addendum, owner round 1): the group's header shows
//   whenever the group is enabled, also empty and with headers off. The `+`
//   beside its name opens a small menu of the herblore catalogue (fixed, in
//   the menu surface colours); a pick starts that herblore and closes the
//   menu, as do Esc and a press outside it. A running herblore shows an ×
//   on hover (in place of its time) that stops it. In a log player
//   (`ctx.player`, ADR 0021) the pane is read-only: no `+`, no herb ×, no
//   charm ×.
// - The list scrolls natively by pixels (wheel, touchpad; ADR 0052). When it
//   overflows, the last pane row is an indicator: `↑ N timers above` once
//   scrolled at all (timers partly above count; click → top), else
//   `↓ N more timers`.
// - Redraw at 1 Hz on wall-clock seconds while something counts; blank
//   while inactive; a disconnect resets the view.

import './timers.css';
import type { TimersSettings } from '../settings/types';
import type { HerbEntry } from '../timers/entry';
import { forwardWheel } from './anchored-list';
import type { PaneContext } from './context';
import { SecondTick, setAttr, setClass, setHidden, setProp, setText } from './dom';
import { iconSvg, ringDash, ringSvg, setIconSvg } from './icons';
import { signalColors } from './palette';
import { PaneShell } from './pane';
import { installPaneTooltip, type PaneTooltip, setTip } from './pane-tooltip';
import { paneShade } from './shade';
import { type TimerGroupView, type TimerItem, timersModel, timersTimed } from './timers-model';

/** The indicator text for `below` items under the view and `above` over it, or null. */
export function timersIndicator(above: number, below: number): { text: string; up: boolean } | null {
  if (above > 0) return { text: `↑ ${above} ${above === 1 ? 'timer' : 'timers'} above`, up: true };
  if (below > 0) return { text: `↓ ${below} more ${below === 1 ? 'timer' : 'timers'}`, up: false };
  return null;
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
    readonly remove: TimerItem['remove'],
  ) {
    this.el = doc.createElement('div');
    this.el.dataset.id = id;
    if (style === 'bars') {
      const clip = doc.createElement('span');
      clip.className = 'wc-tm-clip';
      this.fill = doc.createElement('span');
      this.fill.className = 'wc-tm-fill';
      clip.append(this.fill);
      this.icon = iconSvg(doc, 'spell', 'wc-tm-ic');
      this.el.append(clip, this.icon);
    } else {
      const rw = doc.createElement('span');
      rw.className = 'wc-tm-rw';
      const { svg, arc } = ringSvg(doc, 'wc-tm-ring');
      this.ring = arc;
      this.icon = iconSvg(doc, 'spell', 'wc-tm-ii');
      rw.append(svg, this.icon);
      this.el.append(rw);
    }
    this.nameEl = doc.createElement('span');
    this.nameEl.className = 'wc-tm-n';
    this.timeEl = doc.createElement('span');
    this.timeEl.className = 'wc-tm-t';
    this.el.append(this.nameEl, this.timeEl);
    if (remove) {
      this.xEl = doc.createElement('button');
      this.xEl.type = 'button';
      this.xEl.tabIndex = -1;
      this.xEl.className = remove === 'herb' ? 'wc-tm-x is-herb' : 'wc-tm-x';
      this.xEl.dataset.act = remove === 'herb' ? 'herbx' : 'charm';
      this.xEl.dataset.id = id;
      this.xEl.setAttribute('aria-label', remove === 'herb' ? 'Stop this herblore' : 'Forget this charmie');
      this.xEl.append(iconSvg(doc, 'close', ''));
      this.el.append(this.xEl);
    }
  }

  update(t: TimerItem): void {
    const base = this.style === 'bars' ? 'wc-tm-chip' : 'wc-tm-rc';
    setClass(this.el, `${base} is-${t.kind}${t.ending ? ` is-${t.ending}` : ''}${this.remove === 'herb' ? ' has-herbx' : ''}`);
    if (this.xEl && t.herbKey) setAttr(this.xEl, 'data-key', t.herbKey);
    setIconSvg(this.icon, t.icon);
    if (this.fill) {
      setProp(this.icon, 'display', t.chipIcon ? '' : 'none');
      setProp(this.fill, 'width', `${(t.pct * 100).toFixed(1)}%`);
    }
    if (this.ring) {
      setAttr(this.ring, 'class', t.kind === 'untimed' ? 'wc-ring-arc is-unknown' : 'wc-ring-arc');
      // Only a countdown drains; still, untimed (dashed) and charm rings are full.
      setAttr(this.ring, 'stroke-dasharray', ringDash(t.kind === 'timed' ? t.pct : 1));
    }
    setText(this.nameEl, t.name);
    setText(this.timeEl, t.time ?? '');
    setHidden(this.timeEl, t.time === null);
    setTip(this.el, t.tip, t.full, `tm:${t.id}`);
  }
}

/** One group's element: header and items, kept across renders. */
class GroupEl {
  readonly el: HTMLDivElement;
  private readonly head: HTMLDivElement;
  private readonly headIcon: SVGSVGElement;
  /** Herblore's `+` (the menu), beside the name; null on the other groups. */
  private readonly addEl: HTMLButtonElement | null = null;
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
    this.headIcon = iconSvg(doc, 'spell', 'wc-tm-hi');
    const label = doc.createElement('span');
    label.className = 'wc-tm-hl';
    const line = doc.createElement('span');
    line.className = 'wc-tm-hln';
    this.head.append(this.headIcon, label);
    if (group === 'herb') {
      const add = doc.createElement('button');
      add.type = 'button';
      add.tabIndex = -1;
      add.className = 'wc-tm-add';
      add.dataset.act = 'herbadd';
      add.textContent = '+';
      add.setAttribute('aria-label', 'Start a herblore');
      add.setAttribute('aria-haspopup', 'menu');
      add.hidden = true;
      this.addEl = add;
      this.head.append(add);
    }
    this.head.append(line);
    this.itemsEl = doc.createElement('div');
    this.el.append(this.head, this.itemsEl);
  }

  /** All item elements in order (the indicator counts them). */
  itemEls(): HTMLElement[] {
    return [...this.itemsEl.children] as HTMLElement[];
  }

  /** The herblore `+` (the menu's anchor), or null. */
  get addButton(): HTMLButtonElement | null {
    return this.addEl;
  }

  update(g: TimerGroupView, s: TimersSettings, first: boolean, readOnly: boolean, menuOpen: boolean): void {
    setClass(this.el, `wc-tm-g${first ? ' is-first' : ''}`);
    setProp(this.el, '--c', g.color);
    setHidden(this.head, !s.headers && !g.pinnedHeader);
    setIconSvg(this.headIcon, g.icon);
    setText(this.head.children[1]!, g.label);
    if (this.addEl) {
      setHidden(this.addEl, !g.addHerb || readOnly);
      setAttr(this.addEl, 'aria-expanded', g.addHerb && menuOpen ? 'true' : null);
    }
    setClass(this.itemsEl, `wc-tm-items is-${g.layout}`);
    setProp(this.itemsEl, 'grid-template-columns', g.layout === 'grid' ? `repeat(${g.cols}, minmax(0, 1fr))` : '');
    const seen = new Set<string>();
    g.items.forEach((t, i) => {
      seen.add(t.id);
      const remove = readOnly ? null : t.remove;
      let it = this.items.get(t.id);
      if (it && (it.style !== s.style || it.remove !== remove)) {
        it.el.remove();
        it = undefined;
      }
      if (!it) {
        it = new ItemEl(this.doc, s.style, t.id, remove);
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

// ------------------------------------------------------------ herb menu

/**
 * The Herblore `+` menu: a small card under the `+`, in the menu surface
 * colours (fixed, so a short pane does not clip it), one row per herb in
 * the catalogue; a running one is checked and cannot be picked again. A
 * pick, Esc or a press outside closes it. Pressing a row keeps the focus
 * in the game input (mousedown is prevented).
 */
export class HerbMenu {
  readonly el: HTMLDivElement;
  private anchor: HTMLElement | null = null;

  constructor(
    private readonly doc: Document,
    private readonly onPick: (key: string) => void,
    private readonly onClose: () => void,
  ) {
    this.el = doc.createElement('div');
    this.el.className = 'wc-tm-menu';
    this.el.setAttribute('role', 'menu');
    this.el.setAttribute('aria-label', 'Herblores');
    this.el.hidden = true;
    this.el.addEventListener('mousedown', this.onMenuDown);
  }

  get open(): boolean {
    return !this.el.hidden && this.el.isConnected;
  }

  /** Opens under `anchor` with `herbs`, or refreshes the rows when open. */
  show(anchor: HTMLElement, herbs: readonly HerbEntry[]): void {
    this.anchor = anchor;
    this.fill(herbs);
    if (!this.el.isConnected) this.doc.body.append(this.el);
    if (this.el.hidden) {
      this.el.hidden = false;
      this.doc.addEventListener('keydown', this.onKey, true);
      this.doc.addEventListener('pointerdown', this.onOutside, true);
    }
    this.place();
  }

  /** New rows while open (a herblore started or ended meanwhile). */
  update(herbs: readonly HerbEntry[]): void {
    if (this.open) this.fill(herbs);
  }

  hide(): void {
    if (this.el.hidden && !this.el.isConnected) return;
    this.el.hidden = true;
    this.el.remove();
    this.anchor = null;
    this.doc.removeEventListener('keydown', this.onKey, true);
    this.doc.removeEventListener('pointerdown', this.onOutside, true);
    this.onClose();
  }

  dispose(): void {
    this.hide();
    this.el.removeEventListener('mousedown', this.onMenuDown);
  }

  private fill(herbs: readonly HerbEntry[]): void {
    const key = JSON.stringify(herbs);
    if (this.el.dataset.rows === key) return;
    this.el.dataset.rows = key;
    const doc = this.doc;
    this.el.replaceChildren(
      ...herbs.map((h) => {
        const b = doc.createElement('button');
        b.type = 'button';
        b.tabIndex = -1;
        b.className = `wc-tm-mi${h.active ? ' is-on' : ''}`;
        b.setAttribute('role', 'menuitem');
        b.dataset.key = h.key;
        b.disabled = h.active;
        const mark = doc.createElement('span');
        mark.className = 'wc-tm-mm';
        mark.textContent = h.active ? '✓' : '+';
        const name = doc.createElement('span');
        name.className = 'wc-tm-mn';
        name.textContent = h.name;
        b.append(mark, name);
        b.setAttribute('aria-label', h.active ? `${h.name} (running)` : `Start ${h.name}`);
        return b;
      }),
    );
  }

  private place(): void {
    const a = this.anchor;
    const win = this.doc.defaultView;
    if (!a || !win) return;
    const r = a.getBoundingClientRect();
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    const vw = win.innerWidth;
    const vh = win.innerHeight;
    let left = Math.min(r.left, vw - w - 4);
    left = Math.max(4, left);
    let top = r.bottom + 2;
    if (top + h > vh - 4 && r.top - h - 2 >= 4) top = r.top - h - 2;
    this.el.style.left = `${Math.round(left)}px`;
    this.el.style.top = `${Math.round(Math.max(4, top))}px`;
  }

  private readonly onMenuDown = (e: MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    if (e.button !== 0) return;
    const b = (e.target as HTMLElement | null)?.closest?.<HTMLButtonElement>('.wc-tm-mi') ?? null;
    if (!b || b.disabled) return;
    const key = b.dataset.key!;
    this.hide();
    this.onPick(key);
  };

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    this.hide();
  };

  private readonly onOutside = (e: PointerEvent): void => {
    const t = e.target as Node | null;
    if (t && (this.el.contains(t) || this.anchor?.contains(t))) return;
    this.hide();
  };
}

// ------------------------------------------------------------------ pane

export class TimersPane extends PaneShell {
  private readonly tick: SecondTick;
  private readonly root: HTMLDivElement;
  /** The native scroller, above the indicator row. */
  private readonly scroller: HTMLDivElement;
  private readonly listEl: HTMLDivElement;
  private readonly moreEl: HTMLDivElement;
  /** Ten characters in the items' font: the measured character width. */
  private readonly probe: HTMLSpanElement;
  private readonly groups = new Map<string, GroupEl>();
  private readonly tip: PaneTooltip;
  private readonly menu: HerbMenu;
  /** Scroll to the top at the next render (a reset). */
  private toTop = false;
  /** The measured character and list widths, and what they were measured for. */
  private metrics = { key: '', charW: 0, inner: 0 };
  /** What the items were at the last indicator update (ids and texts). */
  private moreKey = '';
  /** A scroll's indicator update, once a frame. */
  private scrollFrame: number | null = null;

  constructor(ctx: PaneContext) {
    super(ctx, 'timers');
    const doc = ctx.doc;
    this.tick = new SecondTick(doc, () => this.markDirty());
    this.tip = installPaneTooltip(doc);
    this.own(this.tip.attach(this.content));
    this.root = doc.createElement('div');
    this.root.className = 'wc-tm';
    this.scroller = doc.createElement('div');
    this.scroller.className = 'wc-tm-scroll';
    this.listEl = doc.createElement('div');
    this.listEl.className = 'wc-tm-list';
    this.scroller.append(this.listEl);
    this.moreEl = doc.createElement('div');
    this.moreEl.className = 'wc-tm-more';
    this.moreEl.hidden = true;
    this.probe = doc.createElement('span');
    this.probe.className = 'wc-tm-probe';
    this.probe.setAttribute('aria-hidden', 'true');
    this.probe.textContent = '0000000000';
    this.root.append(this.scroller, this.moreEl, this.probe);
    this.menu = new HerbMenu(
      doc,
      (key) => {
        this.ctx.game.timers.addHerb(key);
        this.markDirty();
      },
      () => this.markDirty(),
    );
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
      this.tick.stop();
      if (this.scrollFrame !== null) doc.defaultView?.cancelAnimationFrame(this.scrollFrame);
      this.menu.dispose();
    });
  }

  /** True while the Herblore `+` menu is open (tests). */
  get herbMenuOpen(): boolean {
    return this.menu.open;
  }

  /** The Herblore menu's element (tests). */
  get herbMenuEl(): HTMLDivElement {
    return this.menu.el;
  }

  /** The scroller (tests). */
  get scrollEl(): HTMLDivElement {
    return this.scroller;
  }

  protected override onActiveChange(active: boolean): void {
    if (active) return;
    this.menu.hide();
    this.toTop = true;
    this.tick.stop();
  }

  protected override blank(): void {
    this.menu.hide();
    this.content.replaceChildren();
    this.listEl.replaceChildren();
    this.groups.clear();
    this.moreKey = '';
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

    // The room for names: the list's width and the character width,
    // measured only when the size or the font changed (estimated from the
    // cell metrics where nothing is laid out).
    const cellW = cells.w || 8;
    const { charW, inner } = this.measure(`${this.cols}x${this.rows}|${cells.w}x${cells.h}|${s.appearance.font}|${s.appearance.size}`, cellW);
    const pad = cellW * 0.6;
    const groups = timersModel({
      view,
      settings: s.timers,
      now,
      light: shade.light,
      width: Math.max(0, (inner > 0 ? inner : this.cols * cellW) - pad),
      charW,
    });
    const timed = timersTimed(groups);
    this.renderGroups(groups, s.timers, ro);
    // The menu goes with its `+` (Herblore off, a player) and follows the catalogue.
    const herbGroup = this.groups.get('herb');
    if (this.menu.open && (ro || !herbGroup?.addButton || herbGroup.addButton.hidden)) this.menu.hide();
    else this.menu.update(view.herbs);
    let moreKey = `${this.cols}x${this.rows}|${s.timers.style}|${s.timers.headers}`;
    for (const g of groups) moreKey += `|${g.group}:${g.layout}:${g.cols}:${g.items.map((t) => `${t.id}:${t.name}:${t.time ?? ''}`).join(',')}`;
    if (this.toTop) {
      this.toTop = false;
      this.scroller.scrollTop = 0;
      this.moreKey = '';
    }
    // The indicator reads the layout: only when what is listed (or a text's
    // width) changed, not on every tick.
    if (moreKey !== this.moreKey) {
      this.moreKey = moreKey;
      this.updateMore();
    }
    this.tip.refresh();
    if (timed) this.tick.arm(now);
    else this.tick.stop();
  }

  /** The character and list widths for `key` (size and font), measured on a change. */
  private measure(key: string, cellW: number): { charW: number; inner: number } {
    const m = this.metrics;
    if (m.key !== key || m.inner <= 0) {
      m.key = key;
      m.charW = this.probe.getBoundingClientRect().width / 10 || cellW * 0.85;
      m.inner = this.listEl.clientWidth;
    }
    return m;
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
      ge.update(g, s, i === 0, ro, this.menu.open);
      if (this.listEl.children[i] !== ge.el) this.listEl.insertBefore(ge.el, this.listEl.children[i] ?? null);
    });
    for (const [k, ge] of this.groups) {
      if (seen.has(k)) continue;
      ge.el.remove();
      this.groups.delete(k);
    }
  }

  /** The indicator row from the scroll position. */
  private updateMore(): void {
    const sc = this.scroller;
    const over = sc.scrollHeight > sc.clientHeight + 1;
    let ind: { text: string; up: boolean } | null = null;
    if (over) {
      const top = sc.scrollTop;
      const bottom = top + sc.clientHeight;
      const els = [...this.groups.values()].flatMap((g) => g.itemEls());
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

  /** A scroll updates the indicator once a frame. */
  private readonly onScroll = (): void => {
    const win = this.ctx.doc.defaultView;
    if (!win) return this.updateMore();
    if (this.scrollFrame !== null) return;
    this.scrollFrame = win.requestAnimationFrame(() => {
      this.scrollFrame = null;
      this.updateMore();
    });
  };

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
      case 'herbx':
        if (z.dataset.key) timers.removeHerb(z.dataset.key);
        break;
      case 'herbadd':
        if (this.menu.open) this.menu.hide();
        else {
          this.tip.hide();
          this.menu.show(z, this.ctx.game.timers.view(this.ctx.now()).herbs);
        }
        break;
    }
    this.markDirty();
  };
}
