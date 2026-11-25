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
//   reads the scroll position only when the items or the length of a text
//   changed, and on a scroll (once a frame). A pill's fill is painted from
//   `--p` in half-percent steps.
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
// - Touch (ADR 0166 addendum 27, by the pointer's type; a pen is touch):
//   the herblore × and the charm × are not shown on a tap's :hover
//   (`data-touch` on the root); the first tap on such a row shows its ×
//   (`data-armed`) and removes nothing, a tap on the armed row removes, an
//   untapped × goes after `ARMED_MS` on the pane's own 1 Hz tick. The
//   removals stay on `mousedown` (a tap's emulated one), which reads the
//   pointer type recorded on the `pointerdown` before it. The mouse is
//   unchanged.
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
import { ARMED_MS, SecondTick, isSyntheticMouseOver, isTouchType, setAttr, setClass, setHidden, setProp, setText } from './dom';
import { iconSvg, ringDash, ringSvg, setIconSvg } from './icons';
import { signalColors } from './palette';
import { PaneShell } from './pane';
import { PopupMenu } from './popup-menu';
import { installPaneTooltip, type PaneTooltip, setLiveTip } from './pane-tooltip';
import { paneShade } from './shade';
import { type TimerGroupView, type TimerItem, timersModel, timersTimed } from './timers-model';

/** The indicator text for `below` items under the view and `above` over it, or null. */
export function timersIndicator(above: number, below: number): { text: string; up: boolean } | null {
  if (above > 0) return { text: `↑ ${above} ${above === 1 ? 'timer' : 'timers'} above`, up: true };
  if (below > 0) return { text: `↓ ${below} more ${below === 1 ? 'timer' : 'timers'}`, up: false };
  return null;
}

/**
 * A fill fraction in half-percent steps: under a pixel on a pill or ring,
 * so a long timer's fill changes every few seconds, not on every tick.
 */
export const fillStep = (pct: number): number => Math.round(Math.max(0, Math.min(1, pct)) * 200) / 200;

/** `--p` of a pill's fill (0–100) in half-percent steps. */
export const fillPct = (pct: number): string => (fillStep(pct) * 100).toFixed(1);

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
      // The fill: a childless element painted from its `--p` (timers.css).
      this.fill = doc.createElement('span');
      this.fill.className = 'wc-tm-fill';
      this.icon = iconSvg(doc, 'spell', 'wc-tm-ic');
      this.el.append(this.fill, this.icon);
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

  update(t: TimerItem, armed: string | null): void {
    // A tapped row shows its × (touch; never in a player: no × there).
    if (this.xEl) setAttr(this.el, 'data-armed', armed === this.id ? '' : null);
    const base = this.style === 'bars' ? 'wc-tm-chip' : 'wc-tm-rc';
    setClass(this.el, `${base} is-${t.kind}${t.ending ? ` is-${t.ending}` : ''}${this.remove === 'herb' ? ' has-herbx' : ''}`);
    if (this.xEl && t.herbKey) setAttr(this.xEl, 'data-key', t.herbKey);
    setIconSvg(this.icon, t.icon);
    if (this.fill) {
      setProp(this.icon, 'display', t.chipIcon ? '' : 'none');
      // The fill is painted from `--p` (timers.css): no layout on the tick.
      setProp(this.fill, '--p', fillPct(t.pct));
    }
    if (this.ring) {
      setAttr(this.ring, 'class', t.kind === 'untimed' ? 'wc-ring-arc is-unknown' : 'wc-ring-arc');
      // Only a countdown drains; still, untimed (dashed) and charm rings are full.
      setAttr(this.ring, 'stroke-dasharray', ringDash(t.kind === 'timed' ? fillStep(t.pct) : 1));
    }
    setText(this.nameEl, t.name);
    setText(this.timeEl, t.time ?? '');
    setHidden(this.timeEl, t.time === null);
    // The tooltip's exact time changes every second: read when shown.
    this.tipText = t.tip;
    setLiveTip(this.el, this.readTip, t.full, `tm:${t.id}`);
  }

  private tipText = '';
  private readonly readTip = (): string => this.tipText;
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

  /** Updates the group; true when the armed id (touch) is one of its rows with an ×. */
  update(g: TimerGroupView, s: TimersSettings, first: boolean, readOnly: boolean, menuOpen: boolean, armed: string | null): boolean {
    let armedHere = false;
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
      it.update(t, armed);
      if (remove && t.id === armed) armedHere = true;
      if (this.itemsEl.children[i] !== it.el) this.itemsEl.insertBefore(it.el, this.itemsEl.children[i] ?? null);
    });
    for (const [id, it] of this.items) {
      if (seen.has(id)) continue;
      it.el.remove();
      this.items.delete(id);
    }
    return armedHere;
  }
}

// ------------------------------------------------------------ herb menu

/**
 * The Herblore `+` menu: a small card under the `+`, in the menu surface
 * colours (fixed, so a short pane does not clip it), one row per herb in
 * the catalogue; a running one is checked and cannot be picked again. A
 * pick, Esc or a press outside closes it (popup-menu.ts). The Character
 * card's `+` opens one too.
 */
export class HerbMenu extends PopupMenu {
  constructor(
    doc: Document,
    private readonly onPick: (key: string) => void,
    onClose: () => void,
  ) {
    super(doc, 'wc-tm-menu', 'Herblores', onClose);
  }

  /** Opens under `anchor` with `herbs`, or refreshes the rows when open. */
  show(anchor: HTMLElement, herbs: readonly HerbEntry[]): void {
    this.fill(herbs);
    this.openAt(anchor);
  }

  /** New rows while open (a herblore started or ended meanwhile). */
  update(herbs: readonly HerbEntry[]): void {
    if (this.open) this.fill(herbs);
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

  protected pressed(target: HTMLElement): void {
    const b = target.closest<HTMLButtonElement>('.wc-tm-mi');
    if (!b || b.disabled) return;
    const key = b.dataset.key!;
    this.hide();
    this.onPick(key);
  }
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
  /** The row whose × a tap showed (touch), and when it goes by itself. */
  private armed: { id: string; until: number } | null = null;
  /** The pointer type of the press under way ('' without one: a script). */
  private down = '';

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
    // A device without hover (a phone) starts as touch, so the charm × is
    // not shown before the first tap; the pointer corrects it from then on.
    if (doc.defaultView?.matchMedia?.('(hover: none)').matches) this.root.setAttribute('data-touch', '');
    this.root.addEventListener('pointerover', this.onPointer);
    this.root.addEventListener('pointerdown', this.onPointer);
    this.root.addEventListener('mousedown', this.onDown);
    this.scroller.addEventListener('scroll', this.onScroll, { passive: true });
    this.own(forwardWheel(this.el, () => this.scroller, () => ctx.cells.get().h));
    this.own(() => {
      this.root.removeEventListener('pointerover', this.onPointer);
      this.root.removeEventListener('pointerdown', this.onPointer);
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

  /** The id of the row whose × a tap showed, or null (tests). */
  get armedId(): string | null {
    return this.armed?.id ?? null;
  }

  /** The scroller (tests). */
  get scrollEl(): HTMLDivElement {
    return this.scroller;
  }

  protected override onActiveChange(active: boolean): void {
    if (active) return;
    this.menu.hide();
    this.armed = null;
    this.toTop = true;
    this.tick.stop();
  }

  protected override blank(): void {
    this.menu.hide();
    this.armed = null;
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
    // A tapped row's × goes after `ARMED_MS`, on this tick (no timer of its own).
    if (this.armed && (ro || now >= this.armed.until)) this.armed = null;
    // A row that went (stopped, forgotten, its group off) takes the arming
    // with it (no row is marked for an id that has none).
    if (!this.renderGroups(groups, s.timers, ro)) this.armed = null;
    // The menu goes with its `+` (Herblore off, a player) and follows the catalogue.
    const herbGroup = this.groups.get('herb');
    if (this.menu.open && (ro || !herbGroup?.addButton || herbGroup.addButton.hidden)) this.menu.hide();
    else this.menu.update(view.herbs);
    // What moves items (a time's length can, its digits cannot): `59s` →
    // `58s` keeps the key, so the tick reads no layout.
    let moreKey = `${this.cols}x${this.rows}|${s.timers.style}|${s.timers.headers}`;
    for (const g of groups) moreKey += `|${g.group}:${g.layout}:${g.cols}:${g.items.map((t) => `${t.id}:${t.name}:${t.time?.length ?? -1}`).join(',')}`;
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
    if (timed || this.armed) this.tick.arm(now);
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

  /** Draws the groups; false when the armed id (touch) has no row with an × any more. */
  private renderGroups(groups: TimerGroupView[], s: TimersSettings, ro: boolean): boolean {
    const armed = this.armed?.id ?? null;
    let found = armed === null;
    const seen = new Set<string>();
    groups.forEach((g, i) => {
      seen.add(g.group);
      let ge = this.groups.get(g.group);
      if (!ge) {
        ge = new GroupEl(this.ctx.doc, g.group);
        this.groups.set(g.group, ge);
      }
      if (ge.update(g, s, i === 0, ro, this.menu.open, armed)) found = true;
      if (this.listEl.children[i] !== ge.el) this.listEl.insertBefore(ge.el, this.listEl.children[i] ?? null);
    });
    for (const [k, ge] of this.groups) {
      if (seen.has(k)) continue;
      ge.el.remove();
      this.groups.delete(k);
    }
    return found;
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

  /** Touch or mouse, by the pointer (ADR 0166 points 158, 163): `data-touch` turns the hover rules off. */
  private readonly onPointer = (e: PointerEvent): void => {
    if (isSyntheticMouseOver(e, this.root.ownerDocument.defaultView)) return;
    if (e.type === 'pointerdown') this.down = e.pointerType;
    setAttr(this.root, 'data-touch', isTouchType(e.pointerType) ? '' : null);
  };

  /** A tap shows row `id`'s × (touch), or hides the shown one (null). */
  private arm(id: string | null): void {
    this.armed = id === null ? null : { id, until: this.ctx.now() + ARMED_MS };
    this.markDirty();
  }

  private readonly onDown = (e: MouseEvent): void => {
    // The press's pointer type (a tap's emulated mousedown follows its pointerdown).
    const type = this.down;
    this.down = '';
    if (e.button !== 0 || !this.active) return;
    // The `↑ N timers above` indicator scrolls to the top (also in a player).
    if (this.moreEl.hasAttribute('data-up') && this.moreEl.contains(e.target as Node)) {
      e.preventDefault();
      e.stopPropagation();
      this.scroller.scrollTop = 0;
      this.updateMore();
      return;
    }
    const target = e.target as HTMLElement | null;
    // Read-only in a player.
    if (this.ctx.player) return;
    if (isTouchType(type)) {
      // Touch (ADR 0166 point 163): a tap anywhere on a row with an × (on
      // the × too, where a tap's :hover may have drawn it) shows the ×; a
      // tap on the shown row removes. A tap elsewhere hides it first.
      const row = target?.closest?.<HTMLElement>('.wc-tm-items > [data-id]') ?? null;
      const x = row?.querySelector<HTMLElement>(':scope > .wc-tm-x') ?? null;
      if (row && x && this.root.contains(row)) {
        e.preventDefault();
        e.stopPropagation();
        if (this.armed?.id === row.dataset.id) this.removeBy(x);
        else this.arm(row.dataset.id!);
        return;
      }
      if (this.armed) this.arm(null);
    }
    const z = target?.closest?.<HTMLElement>('[data-act]') ?? null;
    if (!z || !this.root.contains(z)) return;
    e.preventDefault();
    e.stopPropagation();
    switch (z.dataset.act) {
      case 'charm':
      case 'herbx':
        this.removeBy(z);
        return;
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

  /** A row's × (`x`): forgets the charmie or stops the herblore. */
  private removeBy(x: HTMLElement): void {
    this.armed = null;
    const timers = this.ctx.game.timers;
    if (x.dataset.act === 'charm') timers.dropCharm(x.dataset.id!);
    else if (x.dataset.act === 'herbx' && x.dataset.key) timers.removeHerb(x.dataset.key);
    this.markDirty();
  }
}
