// Character pane: the card (stage 77 part D, ADR 0166 addendum 6; mockup
// notes/research/character-pane-mockups/round9.html). It replaces Inv
// §2.2's board; the data rules for XP/TP and the toggles stay.
//
//   +-----------+------------------------------+---+
//   |   Rasta   | MOOD | CASTS | ALERTN | WEIGHT| S |  Status: GMCP only
//   | (portrait)|                              | T |  Stats, Lore: the
//   |   ( 73 )  |                              | L |    hidden info poll
//   | i i i i i |                              |   |
//   +-----------+------------------------------+---+
//   | HP   187 / 270 | MANA  93 / 111 | MOVES  98 / 122 |
//   +--------------------------------------------------+
//
// - character-model.ts says what is drawn, character-layout.ts how big
//   (both pure), character-dom.ts is the elements, this file is when.
// - Char.Vitals comes with every prompt: at most one render a frame, and
//   each part is written only when something it draws changed (`changed`).
//   Nothing is built or removed for a value.
// - The poll (`ctx.openInfo`) is held while the pane is visible and active,
//   whichever tab it shows (Status counts too, ADR 0166 addenda 16 and 18:
//   the shields will be there). In a fight the poll itself waits.
// - One timer at most, and only for what shows: a pending mark's end and
//   the next change of "info 12 s ago". None while hidden.
// - A click sends with `sendCommand` (no alias, echoed as typed) and
//   never takes the focus from the input.
// - The stones (character-stones.ts, F2a; drawn since F2b): the list is
//   rebuilt only after a Timers or a group change (or the stone switches).
//   Their number is in the layout's box (the rows and the shields follow
//   it); which stay beside a `+n` is read at each render, as ending soon
//   moves a stone up. While a shown stone counts down the card's one timer
//   wakes on the wall-clock second, and a tick writes only the bars.
// - The herblore `+` opens the Timers pane's menu, a herblore's × stops it,
//   the `+n` lists the rest (none in a log player: read-only). On touch
//   (the pointer's type) a first tap shows the ×, a tap on it stops; an
//   untapped × goes after `ARMED_MS`, woken by the same one timer.

import './character.css';
import { type VitalKind, VITAL_KINDS } from '../gmcp/bands';
import type { CharView } from '../gmcp/char';
import type { InfoAnswer } from '../gmcp/info-answer';
import { type CardBox, type CardLayout, cardLayout, crossDepth } from './character-layout';
import { type StoneRows, type StoneTone, purseFit, stoneRows } from './character-stones';
import {
  type CardEnv,
  type CardTab,
  type ClickId,
  Pending,
  TabState,
  clickCommand,
  dataAge,
  hpTip,
  iconsView,
  loreView,
  quietText,
  ringView,
  shieldsView,
  statsView,
  statusView,
  vitalDigits,
  vitalView,
  wimpyAt,
} from './character-model';
import { CardDom, StoneList } from './character-dom';
import { type StoneView, stoneView } from './character-stones';
import type { PaneContext } from './context';
import { ARMED_MS } from './dom';
import { groupVitals } from './group-model';
import { signalColors } from './palette';
import { type PaneCell, type PanePlacement, PaneShell } from './pane';
import { type PaneTooltip, installPaneTooltip } from './pane-tooltip';
import { PORTRAIT_SEX, portraitOf } from './portrait';
import { paneShade } from './shade';
import { HerbMenu } from './timers';
import { timerGroupColor } from './timers-model';
import { onTitleFont, titleWidth } from './title-font';

/** What the `↓ more` beside the data's age takes, and its arrow alone. */
const MORE_CHARS = 7;
const MORE_ARROW_CHARS = 2;

/** After the moment a timer waits for. */
const WAKE_LAG_MS = 5;

/** How long a tapped herblore stone's × stays, untapped (touch, ADR 0166 point 158; in dom.ts, shared with Timers). */
export { ARMED_MS };

/** The parts that are written one by one. */
type Part = 'layout' | 'theme' | 'tones' | 'fight' | 'name' | 'portrait' | 'ring' | 'icons' | 'status' | 'shields' | 'stones' | 'armed' | 'purse' | 'tab' | 'more' | 'hp' | `bar-${VitalKind}`;

const STONE_TONES: readonly StoneTone[] = ['buff', 'debuff', 'herb', 'sanct'];
/** No places: the compact card's icons with no stones beside them. */
const NO_ROWS: StoneRows = { entries: [], hidden: [], per: 2, rows: 0, rowsNeed: 0, stoneH: 0, height: 0, free: 0 };

export class CharacterPane extends PaneShell {
  private readonly tip: PaneTooltip;
  private readonly card: CardDom;
  private readonly tabs = new TabState();
  private readonly pending = new Pending();
  /** What each part was last written from. */
  private readonly drawn = new Map<Part, string>();
  private layout: CardLayout | null = null;
  private nameEm = { name: '', em: 0 };
  /** The answer Stats and Lore were last written from, and the race. */
  private statsFrom: { answer: InfoAnswer; race: string } | null = null;
  private loreFrom: { answer: InfoAnswer; race: string } | null = null;
  /** Bumped when Stats or Lore was written (what scrolls may have changed). */
  private infoWrites = 0;
  /** Something a tooltip may read was written by this render. */
  private wrote = false;
  /** The connection is, or last was, a replay. */
  private replay = false;
  private releaseInfo: (() => void) | null = null;
  private timer: number | null = null;
  private timerAt: number | null = null;
  private closed = false;
  /** Where the phone shows the pane (the cockpit's attributes, set before it places it). */
  private phone: CardBox['phone'];
  private framed = false;
  /** The stones, and whether a Timers or a group change has made them old. */
  private stoneList: StoneView | null = null;
  private stonesStale = true;
  /** The stones beside the `+n` at the last render (its list). */
  private hiddenStones: StoneView['stones'] = [];
  private stoneColors: Record<StoneTone, string> = { buff: '', debuff: '', herb: '', sanct: '' };
  /** On touch, the herblore stone whose × a tap has shown, and until when. */
  private armed: { id: string; until: number } | null = null;
  private readonly herbMenu: HerbMenu;
  private readonly stoneMenu: StoneList;

  constructor(ctx: PaneContext) {
    super(ctx, 'character');
    this.card = new CardDom(
      ctx.doc,
      {
        click: (id) => this.click(id),
        tab: (id) => this.selectTab(id),
        add: (anchor) => this.openHerbs(anchor),
        more: (anchor) => this.openMore(anchor),
        stop: (key) => this.stopHerb(key),
        arm: (id) => this.arm(id),
      },
      { now: () => ctx.now(), warnAt: () => ctx.settings.get().timers.warnAt },
    );
    this.herbMenu = new HerbMenu(
      ctx.doc,
      (key) => {
        if (!this.ctx.player) this.ctx.game.timers.addHerb(key);
      },
      () => {},
    );
    this.stoneMenu = new StoneList(ctx.doc, (key) => this.stopHerb(key), () => {});
    this.tip = installPaneTooltip(ctx.doc);
    // A press never takes the focus from the input (a phone's keyboard would go).
    this.content.addEventListener('mousedown', (e) => e.preventDefault());
    this.own(this.tip.attach(this.content));
    this.tabs.setFight(ctx.game.fighting());
    this.own(
      ctx.game.subscribe((part) => {
        if (part === 'char') {
          if (this.pending.size > 0) this.pending.settle(ctx.game.char.view());
          this.followFight();
          this.markDirty();
        } else if (part === 'group') {
          this.stonesStale = true;
          this.followFight();
          this.markDirty();
        } else if (part === 'timers') {
          this.stonesStale = true;
          this.markDirty();
        } else if (part === 'info') this.markDirty();
      }),
    );
    this.own(
      ctx.settings.subscribe((next, prev) => {
        if (next.character.stones !== prev.character.stones) this.stonesStale = true;
        if (next.character !== prev.character || next.group.colors !== prev.group.colors) this.markDirty();
      }),
    );
    this.own(
      ctx.bus.on('conn.state', (s) => {
        const replay = s.replay === true;
        if (replay === this.replay) return;
        this.replay = replay;
        this.markDirty();
      }),
    );
    // The content box is cells × this, and the values' room is counted in it.
    this.own(ctx.cells.subscribe(() => this.markDirty()));
    this.own(
      onTitleFont(() => {
        this.nameEm = { name: '', em: 0 };
        this.markDirty();
      }),
    );
    this.own(() => {
      this.closed = true;
      this.syncInfo();
      this.stopTimer();
      this.herbMenu.dispose();
      this.stoneMenu.dispose();
    });
  }

  override place(p: PanePlacement | null, cell: PaneCell): void {
    super.place(p, cell);
    if (!this.visible) {
      this.stopTimer();
      this.closeMenus();
    }
    const phone = this.el.hasAttribute('data-phone-side') ? 'side' : this.el.hasAttribute('data-phone-strip') ? 'strip' : undefined;
    const framed = p?.framed ?? false;
    if (phone !== this.phone || framed !== this.framed) {
      this.phone = phone;
      this.framed = framed;
      this.markDirty();
    }
    this.syncInfo();
  }

  protected override onActiveChange(active: boolean): void {
    if (!active) {
      this.pending.clear();
      this.stopTimer();
      this.closeMenus();
    }
    this.syncInfo();
  }

  protected override blank(): void {
    this.stopTimer();
    this.armed = null;
    this.closeMenus();
    this.drawn.clear();
    this.statsFrom = this.loreFrom = null;
    super.blank();
    this.tip.refresh();
  }

  // ------------------------------------------------------------------- state

  /**
   * The stones (buffs, debuffs, herblores, your flags and sanctuary), in
   * the display order: rebuilt only when the Timers, the group or the
   * stone switches changed since the last read. Their times are read at
   * the moment of drawing (`stoneTime`).
   */
  get stones(): StoneView {
    if (this.stonesStale || this.stoneList === null) {
      const { ctx } = this;
      this.stoneList = stoneView({
        view: ctx.game.timers.view(ctx.now()),
        flags: ctx.game.group.selfFlags,
        wounds: ctx.game.group.selfWounds,
        show: ctx.settings.get().character.stones,
        player: ctx.player === true,
      });
      this.stonesStale = false;
    }
    return this.stoneList;
  }

  /** A fight changes only the position icon (the swords). */
  private followFight(): void {
    if (this.tabs.setFight(this.ctx.game.fighting())) this.markDirty();
  }

  private selectTab(tab: CardTab): void {
    this.tabs.select(tab);
    this.closeMenus();
    this.syncInfo();
    this.markDirty();
  }

  // ------------------------------------------------------------------ stones

  private closeMenus(): void {
    this.herbMenu.hide();
    this.stoneMenu.hide();
  }

  /** The herblore `+`: the Timers pane's menu (none in a log player). */
  private openHerbs(anchor: HTMLElement): void {
    const { ctx } = this;
    if (ctx.player || !this.stones.canStartHerb) return;
    this.stoneMenu.hide();
    if (this.herbMenu.open) this.herbMenu.hide();
    else {
      this.tip.hide();
      this.herbMenu.show(anchor, ctx.game.timers.view(ctx.now()).herbs);
    }
  }

  /** The `+n`: the list of what has no room. */
  private openMore(anchor: HTMLElement): void {
    this.herbMenu.hide();
    if (this.stoneMenu.open) this.stoneMenu.hide();
    else {
      this.tip.hide();
      this.stoneMenu.show(anchor, this.hiddenStones, this.stoneColors, this.ctx.now(), this.ctx.settings.get().timers.warnAt);
    }
  }

  private stopHerb(key: string): void {
    this.armed = null;
    if (this.ctx.player) return;
    this.ctx.game.timers.removeHerb(key);
    this.markDirty();
  }

  /** A tap showed a herblore stone's × (`id`), or hid it (null). */
  private arm(id: string | null): void {
    if (this.ctx.player && id !== null) return;
    this.armed = id === null ? null : { id, until: this.ctx.now() + ARMED_MS };
    this.markDirty();
  }

  /** Holds the poll open exactly while it should be. */
  private syncInfo(): void {
    const want = !this.closed && this.visible && this.active;
    if (want === (this.releaseInfo !== null)) return;
    if (want) this.releaseInfo = this.ctx.openInfo?.() ?? null;
    else {
      const release = this.releaseInfo!;
      this.releaseInfo = null;
      release();
    }
  }

  /**
   * Clicks are drawn as such: not in a replay, the log player, without a
   * game to send to, or before its first vitals (nothing is known).
   */
  private get clicks(): boolean {
    const { ctx } = this;
    return !this.replay && !ctx.player && ctx.canCommand !== undefined && ctx.game.char.vitals.size > 0;
  }

  private click(id: ClickId): void {
    const { ctx } = this;
    const now = ctx.now();
    this.pending.expire(now);
    if (!this.clicks || this.pending.has(id)) return;
    const view = ctx.game.char.view();
    const command = clickCommand(id, view, this.tabs.fighting);
    // `canCommand`: MUME may read input of its own right now (point 35).
    if (command === null || !ctx.canCommand!()) return;
    this.pending.start(id, view, now);
    ctx.sender.sendCommand(command);
    this.markDirty();
  }

  // ------------------------------------------------------------------ render

  private changed(part: Part, key: string): boolean {
    if (this.drawn.get(part) === key) return false;
    this.drawn.set(part, key);
    this.wrote = true;
    return true;
  }

  protected override render(): void {
    const { ctx, card } = this;
    if (card.root.parentNode !== this.content) this.content.replaceChildren(card.root);
    this.wrote = false;
    const s = ctx.settings.get();
    const now = ctx.now();
    this.pending.expire(now);
    const v = ctx.game.char.view();
    const name = v.name ?? '—';
    const { ramp, light } = paneShade(s, 'character');
    const stones = this.stones;

    const box = this.box(name, vitalDigits(v.vitals), s.character.height, stones, v.mana);
    if (this.changed('layout', `${box.w}|${box.h}|${box.px}|${box.adv}|${box.lock}|${box.nameEm}|${box.digits}|${box.phone}|${box.cross}|${box.stones}|${box.add}|${box.mana}`)) {
      this.layout = cardLayout(box);
      card.setLayout(this.layout);
      // Too low for the tabs: Status shows, and the chosen tab when it is tall again (point 125).
      if (this.tabs.setLow(!this.layout.tabs.on)) this.closeMenus();
    }
    const layout = this.layout!;
    if (this.changed('theme', `${ramp.vtext}${ramp.label}${ramp.track}${light}${box.adv}`)) {
      const sig = signalColors(light);
      card.setTheme(ramp, light, box.adv, { low: sig.vitalLow, critical: sig.vitalCritical });
    }
    const groups = s.timers.groups;
    if (this.changed('tones', `${light}|${STONE_TONES.map((t) => groups[t].color).join('|')}`)) {
      for (const t of STONE_TONES) this.stoneColors[t] = timerGroupColor(groups[t].color, t, light);
      this.stoneColors = { ...this.stoneColors };
      card.setStoneColors(this.stoneColors);
    }

    const fighting = this.tabs.fighting;
    if (this.changed('fight', String(fighting))) card.setFight(fighting);
    if (this.changed('name', name)) card.left.setName(name);
    const sex = PORTRAIT_SEX ?? ctx.game.sex ?? 'male';
    if (this.changed('portrait', `${v.race}|${v.subrace}|${sex}`)) card.left.setPortrait(portraitOf(v.race, v.subrace), sex);
    if (this.changed('ring', `${v.level}|${v.xp?.baseline}|${v.xp?.progress}|${v.toNext}|${v.tp?.progress}`)) card.left.setRing(ringView(v));

    const env: CardEnv = { clicks: this.clicks, fighting, pending: this.pending };
    const clickKey = `${env.clicks}|${fighting}|${this.pending.version}`;
    const t = v.toggles;
    if (this.changed('icons', `${clickKey}|${t.sneak}${t.ride}${t.climb}${t.swim}|${v.position}`)) {
      card.left.setIcons(iconsView(v, env), fighting);
    }
    const chars = layout.status.chars;
    if (this.changed('status', `${clickKey}|${chars}|${v.mood}|${v.spellEffort}|${v.alertness}|${v.carrying?.word}|${v.carrying?.step}`)) {
      card.status.set(statusView(v, env, chars));
    }
    const answer = ctx.game.info.answer;
    if (this.changed('shields', answer ? `${answer.ob}|${answer.db}|${answer.pb}|${answer.abs}` : '-')) card.status.setShields(shieldsView(answer));

    this.renderVitals(v, layout, groupVitals(s, light), light);
    const changesAt = this.renderTab(v, now, s.character.fetchInfo);
    const tick = this.renderStones(stones, layout, now, s.timers.warnAt);

    if (this.wrote) this.tip.refresh();
    let wake: number | null = null;
    for (const at of [this.pending.nextAt(), changesAt, tick, this.armed?.until ?? null]) if (at !== null) wake = wake === null ? at : Math.min(wake, at);
    if (wake === null) this.stopTimer();
    else this.armTimer(wake, now);
  }

  /**
   * The stones and the purse on Status and Stats. Returns the next wall-clock
   * second while a shown stone counts down, else null.
   */
  private renderStones(view: StoneView, layout: CardLayout, now: number, warnAt: number): number | null {
    const { card } = this;
    const tab = this.tabs.shown;
    const st = layout.area.stones;
    // A tapped herblore's × goes after `ARMED_MS` (the card's one timer wakes for it).
    if (this.armed !== null && now >= this.armed.until) this.armed = null;
    if (tab === 'lore' || st.rows === 0) {
      this.hiddenStones = [];
      this.stoneMenu.hide();
      // The compact card's line 2 with no room for stones: its icons alone.
      if (st.rows === 0 && layout.area.line2 && card.stones.set(NO_ROWS, st.size, st.gap, st.bar, st.x)) {
        card.stones.setPurse(null, 0, 0);
        this.drawn.delete('purse');
        this.wrote = true;
      }
      return null;
    }
    const rows = stoneRows(view.stones, { width: st.w, size: st.size, gap: st.gap, bar: st.bar, rows: st.rows, add: view.canStartHerb }, now, warnAt);
    const placed = card.stones.set(rows, st.size, st.gap, st.bar, st.x);
    if (placed) this.wrote = true;
    // The armed ×: written only when it or the slots change; gone with its stone.
    const armed = this.armed?.id ?? null;
    const armedNew = this.changed('armed', armed ?? '-');
    if ((placed || armedNew) && !card.stones.setArmed(armed)) this.armed = null;
    this.hiddenStones = rows.hidden;
    if (rows.hidden.length === 0) this.stoneMenu.hide();
    else this.stoneMenu.update(rows.hidden, this.stoneColors, now, warnAt);
    if (!view.canStartHerb) this.herbMenu.hide();
    else if (this.herbMenu.open) this.herbMenu.update(this.ctx.game.timers.view(now).herbs);
    // The purse only on Status, in the room the last row leaves (point 121).
    const purse = tab === 'status' ? (this.ctx.game.info.answer?.purse ?? null) : null;
    const n = purseFit(rows.free, purse, layout.area.purse);
    const top = (rows.rows - 1) * (st.size + st.bar + st.gap) + Math.round((st.size - layout.area.purse.coin) / 2) - 1;
    if (this.changed('purse', purse ? `${purse.gold}|${purse.silver}|${purse.copper}|${n}|${top}` : '-')) card.stones.setPurse(purse, n, top);
    const timed = card.stones.tick(now, warnAt);
    return timed ? now - (now % 1000) + 1000 : null;
  }

  private box(name: string, digits: number, lock: CardBox['lock'], stones: StoneView, mana: boolean): CardBox {
    const { doc } = this.ctx;
    const cell = this.ctx.cells.get();
    // A plain source (tests) says no font size.
    const px = cell.px ?? cell.h * 0.85;
    if (this.nameEm.name !== name) this.nameEm = { name, em: Math.ceil((titleWidth(doc, name, 100) / 100 + 0.15) * 100) / 100 };
    return {
      w: this.cols * cell.w,
      h: this.rows * cell.h,
      px,
      adv: cell.w / px,
      lock,
      nameEm: this.nameEm.em,
      digits,
      phone: this.phone,
      cross: crossDepth({ phone: this.phone !== undefined, framed: this.framed, rowH: cell.h }),
      stones: stones.stones.length,
      add: stones.canStartHerb,
      mana,
    };
  }

  private renderVitals(v: CharView, layout: CardLayout, colors: Record<VitalKind, string>, light: boolean): void {
    const { vitals } = this.card;
    for (const kind of VITAL_KINDS) {
      const b = v.vitals[kind];
      // Only what is drawn: the number, or the word's band.
      const shown = b.exact ? `${b.value}/${b.max}` : `~${b.word}`;
      if (this.changed(`bar-${kind}`, `${shown}|${colors[kind]}|${light}|${layout.foot.form}`)) {
        vitals.bars[kind](vitalView(kind, b, colors[kind], light, layout.foot.form));
      }
    }
    const hp = v.vitals.hp;
    if (this.changed('hp', `${hp.exact ? hp.value : `~${hp.word}`}|${hp.max}|${v.wimpy}`)) {
      vitals.setWimpy(wimpyAt(v.wimpy, v.maxhp));
      vitals.setHpTip(hpTip(hp, v.wimpy));
    }
  }

  /** The tab and its data. Returns when the data's age line changes next. */
  private renderTab(v: CharView, now: number, fetch: boolean): number | null {
    const { card } = this;
    const tab = this.tabs.shown;
    const { answer, at } = this.ctx.game.info;
    let quiet: string | null = null;
    let age = '';
    let changesAt: number | null = null;
    if (tab !== 'status') {
      if (answer && at !== null) {
        const chars = this.layout!.info.ageChars;
        // Room is kept for the arrow of what is below.
        const d = dataAge(at, now, fetch, chars - MORE_ARROW_CHARS);
        age = d.text;
        if (age !== '') changesAt = d.changesAt;
        this.fillInfo(tab, v, answer);
      } else {
        quiet = quietText({ replay: this.replay || this.ctx.player === true, fetch });
      }
    }
    const moreWord = age.length + MORE_CHARS <= this.layout!.info.ageChars;
    if (this.changed('tab', `${tab}|${quiet}|${age}|${moreWord}`)) card.setTab(tab, quiet, age, moreWord);
    // The layout too: what fits is another then. Stats' stones' row first (point 168).
    if (this.changed('more', `${tab}|${this.infoWrites}|${quiet}|${age === ''}|${this.drawn.get('layout')}`)) card.fitStats();
    return changesAt;
  }

  private fillInfo(tab: 'stats' | 'lore', v: CharView, answer: InfoAnswer): void {
    const race = `${v.race}|${v.subrace}`;
    const last = tab === 'stats' ? this.statsFrom : this.loreFrom;
    if (last?.answer === answer && last.race === race) return;
    if (tab === 'stats') {
      this.statsFrom = { answer, race };
      this.card.stats.set(statsView(answer, v.race, v.subrace));
    } else {
      this.loreFrom = { answer, race };
      this.card.lore.set(loreView(answer, v.raceLine));
    }
    this.infoWrites++;
    this.wrote = true;
  }

  // ------------------------------------------------------------------- timer

  private armTimer(at: number, now: number): void {
    if (this.timerAt === at) return;
    this.stopTimer();
    const win = this.ctx.doc.defaultView;
    if (!win) return;
    this.timerAt = at;
    this.timer = win.setTimeout(() => {
      this.timer = this.timerAt = null;
      this.markDirty();
    }, Math.max(0, at - now) + WAKE_LAG_MS);
  }

  private stopTimer(): void {
    if (this.timer !== null) this.ctx.doc.defaultView?.clearTimeout(this.timer);
    this.timer = this.timerAt = null;
  }
}
