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
// - The stones (character-stones.ts, F2a): the list is rebuilt only after
//   a Timers or a group change (or the stone switches), when read; nothing
//   draws it yet (F2b), so no render and no tick follow from it.

import './character.css';
import { type VitalKind, VITAL_KINDS } from '../gmcp/bands';
import type { CharView } from '../gmcp/char';
import type { InfoAnswer } from '../gmcp/info-answer';
import { type CardBox, type CardLayout, cardLayout, crossDepth } from './character-layout';
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
  statsView,
  statusView,
  vitalDigits,
  vitalView,
  wimpyAt,
} from './character-model';
import { CardDom } from './character-dom';
import { type StoneView, stoneView } from './character-stones';
import type { PaneContext } from './context';
import { groupVitals } from './group-model';
import { signalColors } from './palette';
import { type PaneCell, type PanePlacement, PaneShell } from './pane';
import { type PaneTooltip, installPaneTooltip } from './pane-tooltip';
import { PORTRAIT_SEX, portraitOf } from './portrait';
import { paneShade } from './shade';
import { onTitleFont, titleWidth } from './title-font';

/** What the `↓ more` beside the data's age takes, and its arrow alone. */
const MORE_CHARS = 7;
const MORE_ARROW_CHARS = 2;

/** After the moment a timer waits for. */
const WAKE_LAG_MS = 5;

/** The parts that are written one by one. */
type Part = 'layout' | 'theme' | 'fight' | 'name' | 'portrait' | 'ring' | 'icons' | 'status' | 'tab' | 'more' | 'hp' | `bar-${VitalKind}`;

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

  constructor(ctx: PaneContext) {
    super(ctx, 'character');
    this.card = new CardDom(ctx.doc, { click: (id) => this.click(id), tab: (id) => this.selectTab(id) });
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
        } else if (part === 'timers') this.stonesStale = true;
        else if (part === 'info' && this.tabs.shown !== 'status') this.markDirty();
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
    });
  }

  override place(p: PanePlacement | null, cell: PaneCell): void {
    super.place(p, cell);
    if (!this.visible) this.stopTimer();
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
    }
    this.syncInfo();
  }

  protected override blank(): void {
    this.stopTimer();
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
        show: ctx.settings.get().character.stones,
        player: ctx.player === true,
      });
      this.stonesStale = false;
    }
    return this.stoneList;
  }

  private followFight(): void {
    if (!this.tabs.setFight(this.ctx.game.fighting())) return;
    this.syncInfo();
    this.markDirty();
  }

  private selectTab(tab: CardTab): void {
    this.tabs.select(tab);
    this.syncInfo();
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

    const box = this.box(name, vitalDigits(v.vitals), s.character.height);
    if (this.changed('layout', `${box.w}|${box.h}|${box.px}|${box.adv}|${box.lock}|${box.nameEm}|${box.digits}|${box.phone}|${box.cross}`)) {
      this.layout = cardLayout(box);
      card.setLayout(this.layout);
    }
    const layout = this.layout!;
    if (this.changed('theme', `${ramp.vtext}${ramp.label}${ramp.track}${light}${box.adv}`)) {
      const sig = signalColors(light);
      card.setTheme(ramp, light, box.adv, { low: sig.vitalLow, critical: sig.vitalCritical });
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
    if (this.changed('status', `${clickKey}|${chars}|${v.mood}|${v.spellEffort}|${v.alertness}|${v.carrying?.word}`)) {
      card.status.set(statusView(v, env, chars));
    }

    this.renderVitals(v, layout, groupVitals(s, light), light);
    const changesAt = this.renderTab(v, now, s.character.fetchInfo);

    if (this.wrote) this.tip.refresh();
    const pendingEnd = this.pending.nextAt();
    const wake = pendingEnd === null ? changesAt : changesAt === null ? pendingEnd : Math.min(pendingEnd, changesAt);
    if (wake === null) this.stopTimer();
    else this.armTimer(wake, now);
  }

  private box(name: string, digits: number, lock: CardBox['lock']): CardBox {
    const { doc } = this.ctx;
    const cell = this.ctx.cells.get();
    // A plain source (tests) says no font size.
    const px = cell.px ?? cell.h * 0.85;
    if (this.nameEm.name !== name) this.nameEm = { name, em: Math.ceil((titleWidth(doc, name, 100) / 100 + 0.15) * 100) / 100 };
    return { w: this.cols * cell.w, h: this.rows * cell.h, px, adv: cell.w / px, lock, nameEm: this.nameEm.em, digits, phone: this.phone, cross: crossDepth({ phone: this.phone !== undefined, framed: this.framed, rowH: cell.h }) };
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
    // The layout too: what fits is another then.
    if (this.changed('more', `${tab}|${this.infoWrites}|${quiet}|${age === ''}|${this.drawn.get('layout')}`)) card.markMore();
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
