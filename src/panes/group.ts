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
//   overflow row), keyed: a row is rebuilt only when its signature
//   (`memberSig`, `fightSig`) changed, and moved or inserted only where
//   the order changed. A timed sanctuary's ring, time and tooltip are set
//   in place on the 1 Hz tick.
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
import { SecondTick, el, setText } from './dom';
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

/** The parts of a built row a tick updates in place: a timed sanctuary. */
interface SanctParts {
  box: HTMLElement;
  arc: SVGCircleElement;
  time: HTMLElement | null;
}

/** Collects the timed sanctuary's parts while a row is built. */
type SanctSink = (p: SanctParts) => void;

function iconEl(doc: Document, v: IconView, key: string, sink?: SanctSink, timeEl?: HTMLElement | null): HTMLElement {
  const box = el(doc, 'span', 'wc-gp-ic');
  box.style.color = v.color;
  if (v.ring) {
    const { svg, arc } = ringSvg(doc, 'wc-gp-ring');
    if (v.ring.frac === null) arc.classList.add('is-unknown');
    arc.setAttribute('stroke-dasharray', ringDash(v.ring.frac ?? 1));
    box.append(svg);
    box.classList.add('has-ring');
    if (v.ring.frac !== null) sink?.({ box, arc, time: timeEl ?? null });
  }
  box.append(iconSvg(doc, v.icon, 'wc-gp-i'));
  setTip(box, v.tip, v.title, key);
  return box;
}

function barEl(doc: Document, b: BarView, key: string, cls = 'wc-gp-bar'): HTMLElement {
  const w = el(doc, 'span', cls);
  const trk = el(doc, 'span', 'wc-gp-trk');
  const fill = el(doc, 'span', 'wc-gp-fill');
  fill.style.width = `${b.pct}%`;
  if (b.color) fill.style.backgroundColor = b.color;
  trk.append(fill);
  w.append(trk);
  setTip(w, b.tip, b.title, key);
  w.dataset.kind = b.kind;
  return w;
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

/** A two-line member row. */
export function memberRow2(doc: Document, v: MemberView, gold: string, sink?: SanctSink): HTMLElement {
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
    sts.append(iconEl(doc, s, `${v.key}:${s.icon}`, sink, t));
    if (t) sts.append(t);
  }
  if (v.position) {
    if (sts.childElementCount > 0) sts.append(el(doc, 'span', 'wc-gp-vr'));
    sts.append(iconEl(doc, v.position, `${v.key}:pos`));
  }
  l1.append(sts);
  const bars = el(doc, 'div', 'wc-gp-bars');
  for (const b of v.bars) bars.append(barEl(doc, b, `${v.key}:${b.kind}`));
  row.append(l1, bars);
  return row;
}

/** A one-line member row: icons left of the bars, which keep one column at the right edge. */
export function memberRow1(doc: Document, v: MemberView, gold: string, sink?: SanctSink): HTMLElement {
  const row = rowEl(doc, v, 'wc-gp-m1');
  const mini = el(doc, 'span', 'wc-gp-mini');
  for (const b of v.bars) mini.append(barEl(doc, b, `${v.key}:${b.kind}`));
  const sts = el(doc, 'span', 'wc-gp-sts');
  const icons: IconView[] = v.tank ? [tankIcon(gold, false), ...v.statuses] : v.statuses;
  for (const s of icons.slice(0, COMPACT_ICONS)) sts.append(iconEl(doc, s, `${v.key}:${s.icon}`, sink));
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

function fightZone(doc: Document, f: FightView, c: Readonly<GroupColors>): HTMLElement {
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
  b.append(bt, barEl(doc, f.foe.bar, 'fight:foehp', f.tank ? 'wc-gp-fbar is-foe' : 'wc-gp-fbar'));
  const word = el(doc, 'span', 'wc-gp-fsub is-foe', f.foe.word ?? '');
  if (f.foe.word) setTip(word, f.foe.bar.tip, f.foe.bar.title, 'fight:word');
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
  if (f.tank.bar) a.append(barEl(doc, f.tank.bar, 'fight:tankhp', 'wc-gp-fbar'));
  else a.append(el(doc, 'span', 'wc-gp-fbar is-empty'));
  a.append(el(doc, 'span', 'wc-gp-fsub', f.tank.numbers));
  const vs = el(doc, 'div', 'wc-gp-vs');
  vs.append(el(doc, 'span', 'wc-gp-vsm', 'vs'));
  zone.append(a, vs, b);
  return zone;
}

function fightStrip(doc: Document, f: FightView, c: Readonly<GroupColors>): HTMLElement {
  const row = el(doc, 'div', 'wc-gp-row wc-gp-fstrip');
  row.dataset.key = 'fight';
  if (!f.tank) {
    // You tank: the opponent alone, its name and a full-width bar.
    row.classList.add('is-solo');
    const name = el(doc, 'span', 'wc-gp-fn is-foe', f.foe.name);
    setTip(name, f.foe.word ?? 'Your opponent.', f.foe.name, 'fight:foe');
    row.append(foeIcon(doc, c, 'Whom you fight.', 'Your opponent', 'fight:foeic'), name, barEl(doc, f.foe.bar, 'fight:foehp', 'wc-gp-sbar'));
    return row;
  }
  const shield = tankShield(doc, c, f.tank.bar?.title ?? 'Your fight buffer.', `${f.tank.name} tanks`);
  const tb = f.tank.bar ? barEl(doc, f.tank.bar, 'fight:tankhp', 'wc-gp-sbar') : el(doc, 'span', 'wc-gp-sbar is-empty');
  const vs = el(doc, 'span', 'wc-gp-svs', 'vs');
  const fb = barEl(doc, f.foe.bar, 'fight:foehp', 'wc-gp-sbar is-foe');
  row.append(shield, tb, vs, fb, foeIcon(doc, c, f.foe.word ?? 'Your opponent.', f.foe.name, 'fight:foe'));
  return row;
}

function overflowRow(doc: Document, more: number): HTMLElement {
  const row = el(doc, 'div', 'wc-gp-row wc-gp-over', `↓ ${more} more member${more === 1 ? '' : 's'}`);
  row.dataset.key = 'more';
  return row;
}

// ------------------------------------------------------------------ pane

/** A built row: the signature it was built from and its timed sanctuary, if any. */
interface BuiltRow {
  sig: string;
  el: HTMLElement;
  sanct: SanctParts | null;
}

/** A row the render wants: its key, signature, builder, and its timed sanctuary view. */
interface WantRow {
  key: string;
  sig: string;
  build: (sink: SanctSink) => HTMLElement;
  sanct: IconView | null;
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

    const want: WantRow[] = [];
    if (fv && layout.fightRows > 1) want.push({ key: 'fight', sig: fightSig(fv, 2, light), build: () => fightZone(doc, fv, colors), sanct: null });
    else if (fv && layout.fightRows === 1) want.push({ key: 'fight', sig: fightSig(fv, 1, light), build: () => fightStrip(doc, fv, colors), sanct: null });
    let ticking = false;
    for (const v of views) {
      const build = layout.lines === 2 ? memberRow2 : memberRow1;
      const sanct = v.statuses.find((st) => st.ring !== undefined && st.ring.frac !== null) ?? null;
      if (sanct) ticking = true;
      want.push({ key: v.key, sig: memberSig(v, layout.lines, colors.gold), build: (sink) => build(doc, v, colors.gold, sink), sanct });
    }
    if (layout.more > 0) want.push({ key: 'more', sig: String(layout.more), build: () => overflowRow(doc, layout.more), sanct: null });
    this.reconcile(want);
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

  /** Keeps unchanged rows, rebuilds changed ones, moves only what is out of place. */
  private reconcile(want: readonly WantRow[]): void {
    const next = new Map<string, BuiltRow>();
    want.forEach((w, i) => {
      let row = this.built.get(w.key);
      if (!row || row.sig !== w.sig) {
        let sanct: SanctParts | null = null;
        const built = w.build((p) => (sanct = p));
        if (row) row.el.replaceWith(built);
        row = { sig: w.sig, el: built, sanct };
      } else if (row.sanct && w.sanct) {
        patchSanct(row.sanct, w.sanct);
      }
      next.set(w.key, row);
      if (this.content.children[i] !== row.el) this.content.insertBefore(row.el, this.content.children[i] ?? null);
    });
    for (const [k, row] of this.built) if (!next.has(k)) row.el.remove();
    this.built = next;
  }
}

/** A timed sanctuary's ring, time and tooltip, set in place (the 1 Hz tick). */
function patchSanct(p: SanctParts, v: IconView): void {
  const dash = ringDash(v.ring?.frac ?? 1);
  if (p.arc.getAttribute('stroke-dasharray') !== dash) p.arc.setAttribute('stroke-dasharray', dash);
  if (p.time && v.time !== undefined) setText(p.time, v.time);
  setTip(p.box, v.tip, v.title, p.box.dataset.tipKey ?? null);
}
