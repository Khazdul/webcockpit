// Group pane (ADR 0122; Inv §2.3 for the data, its drawing rules are
// replaced by the ADR; mockup 3c,
// notes/research/group-timers-mockups/r2-P3c-revised.dc.html). DOM in the
// terminal font, sized on the cell grid:
//
//   ┌ fight card (while you fight, 3 rows and a gap) ─────────────┐
//   │ ⛉ Gibur                    vs        a black-robed orc  ⫽    │  names
//   │ ██████████████░░░░                   ░░░░░░░░████████████    │  HP bars facing
//   │ 132/160                                              bad     │
//   └──────────────────────────────────────────────────────────────┘
//   ☺ Gibur                         ⛉ ✺3:12 │ ♞      two lines per member:
//   ━━━━━━━━━━  ━━━━━━  ━━━━━━━━                     marker, name, statuses,
//   ◇ a citizen mercenary [MERC]      ✸ ▭  │ ☺      position; HP, mana, moves
//   ━━━━━━━━━━  ━━━━━━  ━━━━━━━
//
// - What is drawn is group-model.ts (pure); this file builds the DOM and
//   keeps it. One element per row (the fight card, each member, the
//   overflow row), keyed: a row is rebuilt only when its structure
//   (`memberSig`, `fightSig`) changed, and moved or inserted only where
//   the order changed. Its values are set in place by the row's setters
//   (`Upd`) on every render: bar fills (a transform, no layout) and their
//   tooltips, a timed sanctuary's ring, time and tooltip (the 1 Hz tick),
//   the fight card's numbers and word. Each setter writes only a change.
// - One-line rows are marker, name, up to three icons and `+n`, then the
//   three mini bars at the right edge, so the bars line up in every row.
// - The `group.fight` setting turns the fight card off (the tank's shield
//   in the list stays). No divider between the card and the members.
// - Every bar, icon, name, room and the opponent carry a tooltip
//   (pane-tooltip.ts). No browser `title`.
// - Redraws on a group change, on a Sanctuary timer change while a shown
//   member glows, on your name changing (whether you tank), and once a
//   second while a timed sanctuary is shown.
// - Display options (`group` settings) filter what is drawn only; the model
//   keeps the canonical set.

import './group.css';
import type { GroupDisplay } from '../gmcp/group';
import type { TimerCell } from '../timers/entry';
import type { PaneContext } from './context';
import { SecondTick, el, setAttr, setProp, setText } from './dom';
import {
  COMPACT_ICONS,
  type BarView,
  type FightView,
  type IconView,
  type MemberEnv,
  type MemberView,
  fightSig,
  fightView,
  groupLayout,
  groupVitals,
  memberSig,
  memberView,
  tankIcon,
} from './group-model';
import { ringDash, iconSvg, ringSvg } from './icons';
import { type GroupColors, groupColors, resolveColor } from './palette';
import { PaneShell } from './pane';
import { type PaneTooltip, installPaneTooltip, setTip } from './pane-tooltip';
import { paneShade } from './shade';

// ------------------------------------------------------------------ DOM

/**
 * The value setters of a built row: what a render sets in place on a row
 * whose structure did not change (bar fills and tooltips, a timed
 * sanctuary's ring and time, the fight card's numbers and word). They run
 * once after the row is built and on every render after that; each writes
 * only what changed.
 */
type Upd<V> = Array<(v: V) => void>;

/** A bar: its track and fill (`--p`, transform: no layout), its tooltip set by `upd`. */
function barEl<V>(doc: Document, cls: string, key: string, kind: string, upd: Upd<V>, get: (v: V) => BarView | null): HTMLElement {
  const w = el(doc, 'span', cls);
  const trk = el(doc, 'span', 'wc-gp-trk');
  const fill = el(doc, 'span', 'wc-gp-fill');
  trk.append(fill);
  w.append(trk);
  w.dataset.kind = kind;
  upd.push((v) => {
    const b = get(v);
    if (!b) return;
    setProp(fill, '--p', String(b.pct));
    setProp(fill, 'background-color', b.color);
    setTip(w, b.tip, b.title, key);
  });
  return w;
}

/**
 * A status or position icon. A timed sanctuary (a ring with a fraction)
 * gets a setter for its ring, time (`timeEl`) and tooltip.
 */
function iconEl(doc: Document, v: IconView, key: string, upd?: Upd<MemberView>, timeEl?: HTMLElement | null): HTMLElement {
  const box = el(doc, 'span', 'wc-gp-ic');
  box.style.color = v.color;
  if (v.ring) {
    const { svg, arc } = ringSvg(doc, 'wc-gp-ring');
    if (v.ring.frac === null) arc.classList.add('is-unknown');
    arc.setAttribute('stroke-dasharray', ringDash(v.ring.frac ?? 1));
    box.append(svg);
    box.classList.add('has-ring');
    if (v.ring.frac !== null && upd) {
      upd.push((mv) => {
        const s = mv.statuses.find((st) => st.icon === v.icon && st.ring?.frac != null);
        if (!s) return;
        setAttr(arc, 'stroke-dasharray', ringDash(s.ring!.frac!));
        if (timeEl && s.time !== undefined) setText(timeEl, s.time);
        setTip(box, s.tip, s.title, key);
      });
    }
  }
  box.append(iconSvg(doc, v.icon, 'wc-gp-i'));
  setTip(box, v.tip, v.title, key);
  return box;
}

function markerEl(doc: Document, v: MemberView): HTMLElement {
  const mk = el(doc, 'span', 'wc-gp-mk');
  mk.style.color = v.marker.color;
  mk.append(iconSvg(doc, v.marker.icon, 'wc-gp-i'));
  setTip(mk, v.marker.tip, v.marker.title, `${v.key}:mk`);
  return mk;
}

function nameEl(doc: Document, v: MemberView): HTMLElement {
  const n = el(doc, 'span', v.player ? 'wc-gp-name is-player' : 'wc-gp-name', v.name);
  setTip(n, v.nameTip, v.title, `${v.key}:name`);
  return n;
}

function rowEl(doc: Document, v: MemberView, cls: string): HTMLElement {
  const row = el(doc, 'div', `wc-gp-row ${cls}`);
  row.dataset.key = v.key;
  row.dataset.name = v.title;
  if (v.dim) row.classList.add('is-away');
  return row;
}

/** A member's three bars (into `box`), their values set by `upd`. */
function memberBars(doc: Document, box: HTMLElement, v: MemberView, upd: Upd<MemberView>): void {
  for (const b of v.bars) {
    const kind = b.kind;
    box.append(barEl(doc, 'wc-gp-bar', `${v.key}:${kind}`, kind, upd, (mv) => mv.bars.find((x) => x.kind === kind) ?? null));
  }
}

/** A two-line member row. */
export function memberRow2(doc: Document, v: MemberView, gold: string, upd: Upd<MemberView>): HTMLElement {
  const row = rowEl(doc, v, 'wc-gp-m2');
  const l1 = el(doc, 'div', 'wc-gp-l1');
  l1.append(markerEl(doc, v), nameEl(doc, v));
  if (v.tag) l1.append(el(doc, 'span', 'wc-gp-tag', v.tag));
  if (v.room) {
    const where = el(doc, 'span', 'wc-gp-where');
    where.append(iconSvg(doc, 'pin', 'wc-gp-i'), doc.createTextNode(v.room));
    setTip(where, `At ${v.room}.`, 'Not in your room', `${v.key}:room`);
    l1.append(where);
  }
  const sts = el(doc, 'span', 'wc-gp-sts');
  if (v.tank) sts.append(iconEl(doc, tankIcon(gold, true), `${v.key}:tank`));
  for (const s of v.statuses) {
    const t = s.time !== undefined ? el(doc, 'span', 'wc-gp-stime', s.time) : null;
    if (t) t.style.color = s.color;
    sts.append(iconEl(doc, s, `${v.key}:${s.icon}`, upd, t));
    if (t) sts.append(t);
  }
  if (v.position) {
    if (sts.childElementCount > 0) sts.append(el(doc, 'span', 'wc-gp-vr'));
    sts.append(iconEl(doc, v.position, `${v.key}:pos`));
  }
  l1.append(sts);
  const bars = el(doc, 'div', 'wc-gp-bars');
  memberBars(doc, bars, v, upd);
  row.append(l1, bars);
  return row;
}

/** A one-line member row: icons left of the bars, which keep one column at the right edge. */
export function memberRow1(doc: Document, v: MemberView, gold: string, upd: Upd<MemberView>): HTMLElement {
  const row = rowEl(doc, v, 'wc-gp-m1');
  const mini = el(doc, 'span', 'wc-gp-mini');
  memberBars(doc, mini, v, upd);
  const sts = el(doc, 'span', 'wc-gp-sts');
  const icons: IconView[] = v.tank ? [tankIcon(gold, false), ...v.statuses] : v.statuses;
  for (const s of icons.slice(0, COMPACT_ICONS)) sts.append(iconEl(doc, s, `${v.key}:${s.icon}`, upd));
  if (icons.length > COMPACT_ICONS) {
    const more = el(doc, 'span', 'wc-gp-more', `+${icons.length - COMPACT_ICONS}`);
    setTip(more, icons.slice(COMPACT_ICONS).map((s) => s.title).join(', '), 'Also', `${v.key}:more`);
    sts.append(more);
  }
  row.append(markerEl(doc, v), nameEl(doc, v), sts, mini);
  return row;
}

function foeIcon(doc: Document, c: Readonly<GroupColors>, tip: string, title: string, key: string): HTMLElement {
  const ic = el(doc, 'span', 'wc-gp-ic');
  ic.style.color = c.foe;
  ic.append(iconSvg(doc, 'foe', 'wc-gp-i'));
  setTip(ic, tip, title, key);
  return ic;
}

function tankShield(doc: Document, c: Readonly<GroupColors>, tip: string, title: string): HTMLElement {
  const shield = el(doc, 'span', 'wc-gp-ic');
  shield.style.color = c.gold;
  shield.append(iconSvg(doc, 'tank', 'wc-gp-i'));
  setTip(shield, tip, title, 'fight:tankic');
  return shield;
}

const foeBar = (f: FightView): BarView => f.foe.bar;
const tankBar = (f: FightView): BarView | null => f.tank?.bar ?? null;

function fightZone(doc: Document, f: FightView, c: Readonly<GroupColors>, upd: Upd<FightView>): HTMLElement {
  const zone = el(doc, 'div', 'wc-gp-row wc-gp-fight');
  zone.dataset.key = 'fight';
  // The opponent's side.
  const b = el(doc, 'div', f.tank ? 'wc-gp-fs is-foe' : 'wc-gp-fs is-foe is-solo');
  const bt = el(doc, 'div', 'wc-gp-ft');
  const fn = el(doc, 'span', 'wc-gp-fn is-foe', f.foe.name);
  setTip(fn, f.tank ? 'Your opponent: not a group member (Char.Vitals).' : 'Your opponent. You take the hits yourself.', f.foe.name, 'fight:foe');
  const foe = foeIcon(doc, c, 'Whom you fight.', 'Your opponent', 'fight:foeic');
  if (f.tank) bt.append(fn, foe);
  else bt.append(foe, fn);
  b.append(bt, barEl(doc, f.tank ? 'wc-gp-fbar is-foe' : 'wc-gp-fbar', 'fight:foehp', 'hp', upd, foeBar));
  const word = el(doc, 'span', 'wc-gp-fsub is-foe');
  upd.push((v) => {
    setText(word, v.foe.word ?? '');
    setTip(word, v.foe.word ? v.foe.bar.tip : null, v.foe.bar.title, 'fight:word');
  });
  b.append(word);
  if (!f.tank) {
    zone.classList.add('is-solo');
    zone.append(b);
    return zone;
  }
  // The tank's side.
  const a = el(doc, 'div', 'wc-gp-fs');
  const at = el(doc, 'div', 'wc-gp-ft');
  const tn = el(doc, 'span', 'wc-gp-fn', f.tank.name);
  setTip(tn, 'Tanking (Char.Vitals buffer).', f.tank.name, 'fight:tank');
  at.append(tankShield(doc, c, 'Takes the hits: your fight buffer.', 'Tanking'), tn);
  a.append(at);
  if (f.tank.bar) a.append(barEl(doc, 'wc-gp-fbar', 'fight:tankhp', 'hp', upd, tankBar));
  else a.append(el(doc, 'span', 'wc-gp-fbar is-empty'));
  const numbers = el(doc, 'span', 'wc-gp-fsub');
  upd.push((v) => setText(numbers, v.tank?.numbers ?? ''));
  a.append(numbers);
  const vs = el(doc, 'div', 'wc-gp-vs');
  vs.append(el(doc, 'span', 'wc-gp-vsm', 'vs'));
  zone.append(a, vs, b);
  return zone;
}

function fightStrip(doc: Document, f: FightView, c: Readonly<GroupColors>, upd: Upd<FightView>): HTMLElement {
  const row = el(doc, 'div', 'wc-gp-row wc-gp-fstrip');
  row.dataset.key = 'fight';
  if (!f.tank) {
    // You tank: the opponent alone, its name and a full-width bar.
    row.classList.add('is-solo');
    const name = el(doc, 'span', 'wc-gp-fn is-foe', f.foe.name);
    upd.push((v) => setTip(name, v.foe.word ?? 'Your opponent.', v.foe.name, 'fight:foe'));
    row.append(foeIcon(doc, c, 'Whom you fight.', 'Your opponent', 'fight:foeic'), name, barEl(doc, 'wc-gp-sbar', 'fight:foehp', 'hp', upd, foeBar));
    return row;
  }
  const shield = tankShield(doc, c, 'Your fight buffer.', `${f.tank.name} tanks`);
  upd.push((v) => setTip(shield, v.tank?.bar?.title ?? 'Your fight buffer.', `${f.tank!.name} tanks`, 'fight:tankic'));
  const tb = f.tank.bar ? barEl(doc, 'wc-gp-sbar', 'fight:tankhp', 'hp', upd, tankBar) : el(doc, 'span', 'wc-gp-sbar is-empty');
  const vs = el(doc, 'span', 'wc-gp-svs', 'vs');
  const fb = barEl(doc, 'wc-gp-sbar is-foe', 'fight:foehp', 'hp', upd, foeBar);
  const foe = foeIcon(doc, c, 'Your opponent.', f.foe.name, 'fight:foe');
  upd.push((v) => setTip(foe, v.foe.word ?? 'Your opponent.', v.foe.name, 'fight:foe'));
  row.append(shield, tb, vs, fb, foe);
  return row;
}

function overflowRow(doc: Document, more: number): HTMLElement {
  const row = el(doc, 'div', 'wc-gp-row wc-gp-over', `↓ ${more} more member${more === 1 ? '' : 's'}`);
  row.dataset.key = 'more';
  return row;
}

// ------------------------------------------------------------------ pane

/** A built row: the signature it was built from, and its value setters. */
interface BuiltRow {
  sig: string;
  el: HTMLElement;
  patch: (view: unknown) => void;
}

/** A row the render wants: its key, signature and view, and how to build it. */
interface WantRow {
  key: string;
  sig: string;
  view: unknown;
  build: () => BuiltRow;
}

/** A wanted row of view type `V` (each key keeps its view type). */
function want<V>(key: string, sig: string, view: V, build: (upd: Upd<V>) => HTMLElement): WantRow {
  return {
    key,
    sig,
    view,
    build: () => {
      const upd: Upd<V> = [];
      const e = build(upd);
      return {
        sig,
        el: e,
        patch: (x) => {
          for (const f of upd) f(x as V);
        },
      };
    },
  };
}

export class GroupPane extends PaneShell {
  private readonly tip: PaneTooltip;
  private readonly tick: SecondTick;
  private built = new Map<string, BuiltRow>();
  /** The shade colours last set on the content (`theme`). */
  private shadeKey = '';
  /** A shown member glows (a Sanctuary timer change may change a ring). */
  private watchSanct = false;
  /** Your name at the last render (a change decides whether you tank). */
  private selfName: string | null = null;

  constructor(ctx: PaneContext) {
    super(ctx, 'group');
    this.content.classList.add('wc-gp');
    this.tip = installPaneTooltip(ctx.doc);
    this.tick = new SecondTick(ctx.doc, () => this.markDirty());
    this.own(this.tip.attach(this.content));
    this.own(
      ctx.game.subscribe((part) => {
        if (part === 'group' || (part === 'timers' && this.watchSanct) || (part === 'char' && ctx.game.char.name !== this.selfName)) this.markDirty();
      }),
    );
    this.own(
      ctx.settings.subscribe((next, prev) => {
        if (next.group !== prev.group || next.timers.groups.sanct !== prev.timers.groups.sanct) this.markDirty();
      }),
    );
    this.own(() => this.tick.stop());
  }

  protected override render(): void {
    const s = this.ctx.settings.get();
    const doc = this.ctx.doc;
    const shade = paneShade(s, 'group');
    const light = shade.light;
    const colors = groupColors(light);
    this.theme(shade.ramp, light);
    const game = this.ctx.game;
    const now = this.ctx.now();
    const display: GroupDisplay = { showPlayers: s.group.showPlayers, npcMode: s.group.npcMode };
    const members = game.group.displayed(display);
    const fight = game.group.fight();
    // The Sanctuary cells only while a shown member glows.
    this.watchSanct = members.some((m) => m.flags.sanctuary);
    const sanctCells: readonly TimerCell[] = this.watchSanct ? game.timers.cellsIn('sanct', now) : [];
    const env: MemberEnv = {
      light,
      colors,
      vitals: groupVitals(s, light),
      sanct: resolveColor(s.timers.groups.sanct.color, 'sanct', light),
      away: s.group.away,
      isAway: (m) => game.group.isAway(m),
      tankId: fight.tankId,
      sanctCell: (id) => sanctCells.find((c) => c.id === `sanct:${id}`),
      now,
    };
    this.selfName = game.char.name;
    const tankMember = fight.tankId === null ? null : (game.group.get(fight.tankId) ?? null);
    const fv = s.group.fight ? fightView(fight, tankMember, this.selfName, env) : null;
    const layout = groupLayout(members.length, fv !== null, this.rows);
    const views = members.slice(0, layout.shown).map((m) => memberView(m, env));

    const rows: WantRow[] = [];
    if (fv && layout.fightRows > 1) rows.push(want('fight', fightSig(fv, 2, light), fv, (upd) => fightZone(doc, fv, colors, upd)));
    else if (fv && layout.fightRows === 1) rows.push(want('fight', fightSig(fv, 1, light), fv, (upd) => fightStrip(doc, fv, colors, upd)));
    let ticking = false;
    for (const v of views) {
      const build = layout.lines === 2 ? memberRow2 : memberRow1;
      if (v.statuses.some((st) => st.ring !== undefined && st.ring.frac !== null)) ticking = true;
      rows.push(want(v.key, memberSig(v, layout.lines, colors.gold), v, (upd) => build(doc, v, colors.gold, upd)));
    }
    if (layout.more > 0) rows.push(want('more', String(layout.more), null, () => overflowRow(doc, layout.more)));
    this.reconcile(rows);
    this.tip.refresh();
    // A timed sanctuary counts down: once a second while one is shown.
    if (ticking) this.tick.arm(now);
    else this.tick.stop();
  }

  protected override blank(): void {
    this.tick.stop();
    this.built.clear();
    this.shadeKey = '';
    this.watchSanct = false;
    super.blank();
  }

  private theme(ramp: Record<string, string>, light: boolean): void {
    const key = `${ramp.vtext}${ramp.label}${ramp.mid}${ramp.dim}${ramp.track}${light}`;
    if (key === this.shadeKey) return;
    this.shadeKey = key;
    const st = this.content.style;
    st.setProperty('--gp-text', ramp.vtext!);
    st.setProperty('--gp-label', ramp.label!);
    st.setProperty('--gp-mid', ramp.mid!);
    st.setProperty('--gp-line', ramp.dim!);
    st.setProperty('--gp-track', ramp.track!);
    this.content.toggleAttribute('data-light', light);
  }

  /**
   * Keeps rows whose structure did not change and sets their values in
   * place; rebuilds the others; moves only what is out of place.
   */
  private reconcile(want: readonly WantRow[]): void {
    const next = new Map<string, BuiltRow>();
    want.forEach((w, i) => {
      let row = this.built.get(w.key);
      if (!row || row.sig !== w.sig) {
        const built = w.build();
        if (row) row.el.replaceWith(built.el);
        row = built;
      }
      row.patch(w.view);
      next.set(w.key, row);
      if (this.content.children[i] !== row.el) this.content.insertBefore(row.el, this.content.children[i] ?? null);
    });
    for (const [k, row] of this.built) if (!next.has(k)) row.el.remove();
    this.built = next;
  }
}
