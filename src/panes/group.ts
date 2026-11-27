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
//   ☺ Gibur                         ⛉ ✺3:12 │ ♞      two lines per member (one or three by height):
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
// - The rows follow the pane's height (stage 80 §8, `groupRows`): every
//   member row has the same height (`--gp-h` on the content), one line,
//   two lines (the bars side by side, `--gp-bar` thick) or three (HP, mana
//   and moves as full lines with `value/max` or the band word in a fixed
//   column). A row's height changes with the member count or the pane's
//   size only, never with a vitals update (the layout's key is in the
//   rows' signatures; values are set in place).
// - Tokens (`group.tokens`, where looks are drawn: `ctx.looks`, not the log
//   player): the member's look (src/looks/resolve.ts) round with the R3
//   ring in its hue (`GameState.groupTable`) takes the marker icon's place,
//   the HP arc outside it below full HP. With `ctx.openLook` it is a button
//   that opens the look picker for the member; nothing else in a row is
//   clickable. Engraved drawings are baked once per (portrait, sex).
// - One-line rows are marker (or token), name, up to three icons and `+n`,
//   then the three mini bars at the right edge, so the bars line up in
//   every row.
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
import { libraryNow, loadLibrary, onLibrary, tokenUrl } from '../looks/library';
import type { Look } from '../looks/resolve';
import {
  COMPACT_ICONS,
  TOKEN_MAX,
  type BarView,
  type FightView,
  type GroupRows,
  type IconView,
  type MemberEnv,
  type MemberView,
  type TokenView,
  arcShown,
  fightSig,
  fightView,
  groupRows,
  groupVitals,
  lookKey,
  memberSig,
  memberView,
  tankIcon,
  tokenSig,
  tokenView,
} from './group-model';
import { SVG_NS, ringDash, iconSvg, ringSvg } from './icons';
import { bucketPx, portraitArt } from './portraits';
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

/** A bar: its track and fill (`--p`, transform: no layout), its tooltip set by `upd`; `num`: its numbers after it (three lines). */
function barEl<V>(doc: Document, cls: string, key: string, kind: string, upd: Upd<V>, get: (v: V) => BarView | null, num = false): HTMLElement {
  const w = el(doc, 'span', cls);
  const trk = el(doc, 'span', 'wc-gp-trk');
  const fill = el(doc, 'span', 'wc-gp-fill');
  trk.append(fill);
  w.append(trk);
  const n = num ? el(doc, 'span', 'wc-gp-num') : null;
  if (n) w.append(n);
  w.dataset.kind = kind;
  upd.push((v) => {
    const b = get(v);
    if (!b) return;
    setProp(fill, '--p', String(b.pct));
    setProp(fill, 'background-color', b.color);
    if (n) setText(n, b.num);
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

/** A member's bars (into `box`), their values set by `upd`; `num`: with their numbers (three lines). */
function memberBars(doc: Document, box: HTMLElement, v: MemberView, upd: Upd<MemberView>, num = false): void {
  // Two (no mana, a troll): HP and moves take the width (stage 77 H9).
  if (v.bars.length !== 3) box.dataset.bars = String(v.bars.length);
  for (const b of v.bars) {
    const kind = b.kind;
    box.append(barEl(doc, 'wc-gp-bar', `${v.key}:${kind}`, kind, upd, (mv) => mv.bars.find((x) => x.kind === kind) ?? null, num));
  }
}

// ------------------------------------------------------------------ tokens

/**
 * The engraved drawings baked for tokens, by (portrait, sex): once per
 * page at the largest token's size (src/panes/portraits; a bake runs SVG
 * filters, so never per row or per update).
 */
const tokenArt = new Map<string, Promise<string | null>>();

function drawnSrc(doc: Document, l: Extract<Look, { kind: 'drawn' }>): Promise<string | null> {
  const px = bucketPx(Math.ceil(TOKEN_MAX * (doc.defaultView?.devicePixelRatio || 1)));
  const key = `${l.portrait}|${l.portrait === 'neutral' ? '-' : l.sex}|${px}`;
  let p = tokenArt.get(key);
  if (!p) {
    p = portraitArt(doc, l.portrait, l.sex, 'medium', px).catch(() => null);
    tokenArt.set(key, p);
  }
  return p;
}

/** Paints `look` into the token's disc; a picture that cannot load falls to `alt` (then the type icon). */
function paintToken(doc: Document, disc: HTMLElement, look: Look, alt: Look | null, icon: IconView, ownSrc: string | null = null): void {
  disc.replaceChildren();
  disc.className = 'wc-gp-tkd';
  disc.dataset.look = lookKey(look);
  const fail = (): void => {
    if (disc.dataset.look !== lookKey(look)) return;
    paintToken(doc, disc, alt && lookKey(alt) !== lookKey(look) ? alt : { kind: 'icon', from: 'icon' }, null, icon);
  };
  if (look.kind === 'lib') {
    disc.classList.add('is-lib');
    const img = el(doc, 'img', '');
    img.alt = '';
    img.draggable = false;
    img.addEventListener('error', fail, { once: true });
    img.src = tokenUrl(look.id, 't');
    disc.append(img);
    return;
  }
  if (look.kind === 'drawn') {
    disc.classList.add('is-por');
    void drawnSrc(doc, look).then((src) => {
      if (disc.dataset.look !== lookKey(look)) return;
      if (!src) return fail();
      const img = el(doc, 'img', '');
      img.alt = '';
      img.draggable = false;
      img.src = src;
      disc.append(img);
    });
    return;
  }
  if (look.kind === 'own') {
    // An own image (part D): its `data:` URL, the whole square cut round.
    if (!ownSrc) return fail();
    disc.classList.add('is-own');
    const img = el(doc, 'img', '');
    img.alt = '';
    img.draggable = false;
    img.addEventListener('error', fail, { once: true });
    img.src = ownSrc;
    disc.append(img);
    return;
  }
  // The type icon (an NPC no picture matches).
  disc.classList.add('is-icon');
  disc.style.color = icon.color;
  disc.append(iconSvg(doc, icon.icon, 'wc-gp-i'));
}

/** The HP arc's width for a token of `d` px (the map's: 3.5 % of the picture, at least 1 px). */
const arcWidth = (d: number): number => Math.max(1, Math.round(d * 0.035 * 2) / 2);

/**
 * A member's token (stage 80 §8): the look in a round disc with the R3
 * ring (1 px of the member's hue, muted, and a dark outline), and the HP
 * arc outside it below full HP. With `pick` it is a button that opens the
 * look picker for the member; its tooltip is the marker's.
 */
function tokenEl(doc: Document, v: MemberView, t: TokenView, d: number, upd: Upd<MemberView>, pick: ((name: string) => void) | null, name: string): HTMLElement {
  const tk = pick ? el(doc, 'button', 'wc-gp-tk') : el(doc, 'span', 'wc-gp-tk');
  if (pick) {
    const b = tk as HTMLButtonElement;
    b.type = 'button';
    b.setAttribute('aria-label', t.label);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      pick(name);
    });
  }
  tk.style.setProperty('--d', `${d}px`);
  tk.style.setProperty('--c', t.ring);
  const disc = el(doc, 'span', 'wc-gp-tkd');
  paintToken(doc, disc, t.look, t.alt, v.marker, t.src ?? null);
  tk.append(disc);
  // The arc: a dark track and the HP from 12 o'clock, clockwise, outside the ring and its outline.
  const aw = arcWidth(d);
  const r = d / 2 + 2.5 + aw / 2;
  const size = Math.ceil(2 * (r + aw / 2 + 1));
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'wc-gp-arc');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', `${-size / 2} ${-size / 2} ${size} ${size}`);
  const track = doc.createElementNS(SVG_NS, 'circle');
  const arc = doc.createElementNS(SVG_NS, 'circle');
  for (const c of [track, arc]) {
    c.setAttribute('r', String(r));
    c.setAttribute('fill', 'none');
  }
  track.setAttribute('class', 'wc-gp-arct');
  track.setAttribute('stroke-width', String(aw + 1));
  arc.setAttribute('stroke-width', String(aw));
  arc.setAttribute('transform', 'rotate(-90)');
  const len = 2 * Math.PI * r;
  svg.append(track, arc);
  svg.style.display = 'none';
  tk.append(svg);
  upd.push((mv) => {
    const on = arcShown(mv.hp);
    setProp(svg, 'display', on ? '' : 'none');
    setAttr(tk, 'data-arc', on ? '' : null);
    if (!on) return;
    setAttr(arc, 'stroke-dasharray', `${(len * mv.hp!).toFixed(2)} ${len.toFixed(2)}`);
    setAttr(arc, 'stroke', mv.arc);
  });
  setTip(tk, pick ? `${v.marker.tip} Click to choose a look.` : v.marker.tip, v.marker.title, `${v.key}:mk`);
  return tk;
}

/** How a member row is built: the layout, the token (null: the marker icon) and the click. */
interface RowOpts {
  gold: string;
  rows: GroupRows;
  token: TokenView | null;
  pick: ((name: string) => void) | null;
  /** The member's name as the looks key it (`Member.name`). */
  lookName: string;
}

/** The statuses and the position of a name line (two lines and more). */
function nameLine(doc: Document, v: MemberView, o: RowOpts, upd: Upd<MemberView>): HTMLElement {
  const l1 = el(doc, 'div', 'wc-gp-l1');
  if (!o.token) l1.append(markerEl(doc, v));
  l1.append(nameEl(doc, v));
  if (v.tag) l1.append(el(doc, 'span', 'wc-gp-tag', v.tag));
  if (v.room) {
    const where = el(doc, 'span', 'wc-gp-where');
    where.append(iconSvg(doc, 'pin', 'wc-gp-i'), doc.createTextNode(v.room));
    setTip(where, `At ${v.room}.`, 'Not in your room', `${v.key}:room`);
    l1.append(where);
  }
  const sts = el(doc, 'span', 'wc-gp-sts');
  if (v.tank) sts.append(iconEl(doc, tankIcon(o.gold, true), `${v.key}:tank`));
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
  return l1;
}

/**
 * A member row of two lines (the name line, the bars side by side) or
 * three (the name line, then HP, mana and moves as full lines with their
 * numbers). With a token it stands at the start, the lines beside it.
 */
export function memberRowN(doc: Document, v: MemberView, o: RowOpts, upd: Upd<MemberView>): HTMLElement {
  const three = o.rows.lines === 3;
  const row = rowEl(doc, v, three ? 'wc-gp-m3' : 'wc-gp-m2');
  if (o.token) {
    const lead = el(doc, 'span', 'wc-gp-lead');
    lead.style.width = `${o.rows.token + 4}px`;
    lead.append(tokenEl(doc, v, o.token, o.rows.token, upd, o.pick, o.lookName));
    row.append(lead);
    row.classList.add('has-tk');
  }
  const body = el(doc, 'div', 'wc-gp-body');
  const bars = el(doc, 'div', three ? 'wc-gp-bars wc-gp-stack' : 'wc-gp-bars');
  memberBars(doc, bars, v, upd, three);
  body.append(nameLine(doc, v, o, upd), bars);
  row.append(body);
  return row;
}

/** A one-line member row: icons left of the bars, which keep one column at the right edge. */
export function memberRow1(doc: Document, v: MemberView, o: RowOpts, upd: Upd<MemberView>): HTMLElement {
  const row = rowEl(doc, v, 'wc-gp-m1');
  const mini = el(doc, 'span', 'wc-gp-mini');
  memberBars(doc, mini, v, upd);
  const sts = el(doc, 'span', 'wc-gp-sts');
  const icons: IconView[] = v.tank ? [tankIcon(o.gold, false), ...v.statuses] : v.statuses;
  for (const s of icons.slice(0, COMPACT_ICONS)) sts.append(iconEl(doc, s, `${v.key}:${s.icon}`, upd));
  if (icons.length > COMPACT_ICONS) {
    const more = el(doc, 'span', 'wc-gp-more', `+${icons.length - COMPACT_ICONS}`);
    setTip(more, icons.slice(COMPACT_ICONS).map((s) => s.title).join(', '), 'Also', `${v.key}:more`);
    sts.append(more);
  }
  let lead: HTMLElement;
  if (o.token) {
    lead = el(doc, 'span', 'wc-gp-mk has-tk');
    lead.style.width = `${o.rows.token + 4}px`;
    lead.append(tokenEl(doc, v, o.token, o.rows.token, upd, o.pick, o.lookName));
    row.classList.add('has-tk');
  } else lead = markerEl(doc, v);
  row.append(lead, nameEl(doc, v), sts, mini);
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
  /** The row sizes last set on the content (`sizes`). */
  private sizeKey = '';
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
    // A cell of another height moves the steps (the pane may keep its rows).
    this.own(ctx.cells.subscribe(() => this.markDirty()));
    // The looks: a choice (or the picker's preview) and the manifest's load (NPCs match by name).
    if (ctx.looks) this.own(ctx.looks.subscribe(() => this.markDirty()));
    this.own(onLibrary(() => this.markDirty()));
  }

  /** The rows' sizes as the content's custom properties (every row the same; set on a change only). */
  private sizes(l: GroupRows): void {
    const key = `${l.step}|${l.h}|${l.bar}`;
    if (key === this.sizeKey) return;
    this.sizeKey = key;
    const st = this.content.style;
    st.setProperty('--gp-h', `${l.h}px`);
    st.setProperty('--gp-bar', `${l.bar}px`);
    this.content.dataset.step = l.step;
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
    const cellH = this.ctx.cells.get().h;
    const layout = groupRows(members.length, fv !== null, this.rows * cellH, cellH);
    this.sizes(layout);
    const shown = members.slice(0, layout.shown);
    const views = shown.map((m) => memberView(m, env));
    // Tokens (stage 80 §8): with the switch on, where looks are drawn (the live app; not the log player or a test).
    const looks = this.ctx.looks && !this.ctx.player && s.group.tokens ? this.ctx.looks : null;
    const library = libraryNow();
    if (looks && !library && shown.some((m) => m.type === 'npc')) void loadLibrary();
    const openLook = this.ctx.openLook;
    const pick = looks && openLook ? (name: string) => openLook({ name, self: false }) : null;
    const tokenEnv = { looks, library, hue: (id: number) => game.groupTable.colorOf(id) };
    const lkey = `${layout.lines}|${layout.h}|${looks ? layout.token : '-'}|${pick ? 'p' : ''}`;

    const rows: WantRow[] = [];
    if (fv && layout.fight === 'card') rows.push(want('fight', fightSig(fv, 2, light), fv, (upd) => fightZone(doc, fv, colors, upd)));
    else if (fv && layout.fight === 'strip') rows.push(want('fight', fightSig(fv, 1, light), fv, (upd) => fightStrip(doc, fv, colors, upd)));
    let ticking = false;
    views.forEach((v, i) => {
      const m = shown[i]!;
      const token = looks ? tokenView(m, tokenEnv) : null;
      const o: RowOpts = { gold: colors.gold, rows: layout, token, pick, lookName: m.name };
      const build = layout.lines === 1 ? memberRow1 : memberRowN;
      if (v.statuses.some((st) => st.ring !== undefined && st.ring.frac !== null)) ticking = true;
      const sig = memberSig(v, lkey, colors.gold) + (token ? `|${tokenSig(token)}` : '');
      rows.push(want(v.key, sig, v, (upd) => build(doc, v, o, upd)));
    });
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
    this.sizeKey = '';
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
