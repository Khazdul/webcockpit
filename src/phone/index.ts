// The phone layer (ADR 0136 §2): the chrome of the phone's layout in the
// live game, plain DOM over the cockpit, laid out in pixels. The cockpit
// keeps owning and placing the game text, the command row and every pane
// (`allocatePhoneGame`, the `phoneGame` option); this layer reads its
// rectangles after each layout and never re-parents a pane.
//
// Loaded only on a phone: the shell imports this module (and phone.css)
// after it built the live game's App with the phone flag on. It imports
// nothing of the app but types; what it uses of the app comes in as the
// kit (kit.ts), so the desktop's start-up chunks stay as they were. Every rule of
// phone.css is scoped under `html.wc-phone` and the cockpit's
// `data-phone-game`, so nothing here can match on a desktop or a tablet,
// nor in the run log player.
//
// Parts (one module each):
//   fight-card.ts   two names and two bars while fighting (model: fight-model.ts)
//   compass.ts      the 3 × 3 keys in the bottom right corner
//   lens.ts         the map lens: ring, glass and pips over the cockpit's
//                   map pane, a tap steps the zoom (lens-zoom.ts), and the
//                   fullscreen key on its corner
//   menu-sheet.tsx  the menu: a bottom sheet, and the settings page
//                   (settings-page.tsx) it leads to
//   strip.ts        the pane strip's hood and dots, and its swipe
//                   (strip-model.ts, swipe.ts); the pane is the cockpit's
//   comm-chrome.ts  Comm's resize band; Comm is the cockpit's Comm pane,
//                   in its phone mode, and the Comm key's badge (unread.ts)
//   hotkeys.ts      the hot key column, the K key in the compass's free
//                   cell, and the box a held key opens (hotkey-model.ts)
//   here            the menu key in the command row, and the wiring
//
// Cost (stage 51 rule 4): nothing runs per frame or per incoming line. The
// fight card follows the game state's change notifications (GMCP `Char.*`
// and `Group.*` that changed something) and redraws only when its
// signature changes; the geometry follows the cockpit's layouts.

import './phone.css';
import type { GameState } from '../gmcp/state';
import type { Cockpit } from '../layout/cockpit';
import { Compass } from './compass';
import { FightCardView } from './fight-card';
import { type FightCard, type SelfVitals, fightCard, fightSig } from './fight-model';
import { type MenuFrame, PhoneMenu } from './menu-sheet';
import { type PlayState, keysLive } from './play-gate';
import { sizeFits } from './text-settings';
import { sectionChanged } from './changed';
import { LensView } from './lens';
import { type LensLevel, lensLevel, lensPx, lensZoom } from './lens-zoom';
import type { MapPane } from '../panes/map';
import type { CommPane } from '../panes/comm';
import type { PaneId } from '../layout/types';
import { CommBand } from './comm-chrome';
import { StripView, holdFling, watchSwipes } from './strip';
import { type StripPage, keepPage, stepPage, stripPages } from './strip-model';
import { type Unread, badgeText, commKeyLabel, unreadCount } from './unread';
import { compassHeight, compassPx, hotBottom, hotStep, hotTop } from './compass-size';
import { pulse } from './haptics';
import { WakeLock, wakeWanted } from './wake-lock';
import { HotkeysView } from './hotkeys';
import { hotkeyPress, knownHp, withHotkey } from './hotkey-model';
import { type PhoneControls, type PhoneKit, phoneKit, setPhoneControls, setPhoneKit } from './kit';

export type { PhoneControls, PhoneKit } from './kit';
import type { AppStatusView } from '../app/status';
import type { SettingsStore } from '../settings';

export type { MenuFrame } from './menu-sheet';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The lens's place (the mockups): 16 px under the fight card or the top edge, 12 px from the right edge. */
const LENS_GAP_TOP = 16;
const LENS_GAP_RIGHT = 12;
/** What the lens keeps clear above the column or the box: its ring and shadow, and a little air. */
const LENS_CLEAR = 16;
/** The box's air to the command row (the keyboard up) and to the top edge. */
const BOX_GAP = 8;
/** The key row's air under what is above it (the lens hidden). */
const SATROW_GAP = 8;
/** What the lens fixes on the map pane (ADR 0136 §4): Shimrod, alternating with MUME's season, on black. */
const LENS_LOOK = { tileset: 'shimrod', background: '#000000' } as const;

export interface PhoneLayerDeps {
  /** What the layer uses of the app, handed in so this chunk imports none of it (kit.ts). */
  kit: PhoneKit;
  /** The look kit's controls, from the chrome chunk (kit.ts). */
  controls: PhoneControls;
  /** The live game's cockpit, built with `phoneGame`. */
  cockpit: Cockpit;
  game: GameState;
  /** The cell size in px (the cockpit's rectangles are in cells). */
  cells: { get(): { w: number; h: number } };
  /** A key's command, as if typed (`App.onCommand`: aliases, the echo). Called only in play (`send`). */
  command(text: string): void;
  /** A client notice in the game text (`[SYSTEM] …`), as the app's own. */
  notice(text: string): void;
  /** Where the session is now: a key sends only in play (play-gate.ts). */
  playState(): PlayState;
  /** The menu key: the shell opens the menu (`PhoneLayer.menu`), as Esc and `#menu` do. */
  openMenu(): void;
  /** What the menu sheet shows and does (menu-sheet.tsx). */
  settings: SettingsStore;
  status: AppStatusView;
  scriptsOn(): number;
  reconnect(): void;
  openFrame(frame: MenuFrame): void;
  /** The menu closed back to the game. */
  onMenuClose?(): void;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export class PhoneLayer {
  /** The layer over the cockpit (fight card, compass). */
  readonly el: HTMLDivElement;
  /** The menu key, first in the command row. */
  readonly menuKey: HTMLButtonElement;
  /** The menu sheet and the settings page (closed until the shell opens it). */
  readonly menu: PhoneMenu;
  /** A second menu key, shown only over the too-small notice. */
  readonly rescueKey: HTMLButtonElement;
  private readonly deps: PhoneLayerDeps;
  private readonly fight: FightCardView;
  private readonly lens: LensView;
  /** The cockpit's map pane: the lens's map (the one worker and canvas). */
  private readonly map: MapPane;
  /** The lens as last applied: its diameter (0: not shown) and the "Opens at" it started from. */
  private lensSize = 0;
  private lensOpensAt: LensLevel | null = null;
  /** The zoom last sent to the map, as `size:level` (nothing is sent again for the same). */
  private lensZoomKey = '';
  private readonly strip: StripView;
  /** The strip's pages now, whether it is open, and its page (kept in memory while it is closed). */
  private pages: StripPage[] = [];
  private stripOpen = false;
  private stripPage: string | null = null;
  /** The pane the fling guard is on (the strip's shown pane), and its uninstaller. */
  private flingOn: string | null = null;
  private flingOff: (() => void) | null = null;
  /** The cockpit's Comm pane, in its phone mode. */
  private readonly comm: CommPane;
  private readonly commBand: CommBand;
  /** Comm is wanted open (the key); it shows when the screen has the rows. */
  private commOpen = false;
  /** What the last layout really gave the strip and Comm rows for (the keys are lit by these). */
  private stripShown = false;
  private commShown = false;
  private readonly hot: HotkeysView;
  /** What the lens must stay out of from the bottom edge, as last asked of the cockpit. */
  private lensClear = 0;
  /** A compass key's side in px (the setting); the hot keys follow it. */
  private keyPx = 40;
  private readonly wake: WakeLock;
  /** Connected to MUME, as the wake lock last saw it. */
  private wakeConn = false;
  private unread: Unread = { private: 0, group: 0, public: 0, all: 0 };
  private readonly unsubs: Array<() => void> = [];
  /** The card on screen (null: no fight) and its signature. */
  private card: FightCard | null = null;
  private sig = '';

  constructor(deps: PhoneLayerDeps) {
    this.deps = deps;
    const cockpit = deps.cockpit;
    const doc = cockpit.el.ownerDocument;
    this.el = doc.createElement('div');
    this.el.className = 'wc-ph-layer';
    this.fight = new FightCardView(doc);
    const compass = new Compass(doc, (cmd) => this.send(cmd));
    const kit = phoneKit();
    this.map = cockpit.pane('map') as unknown as MapPane;
    this.lens = new LensView(doc, {
      onLevel: () => this.zoomLens(),
      fullscreen: kit.canFullscreen(doc) ? () => kit.toggleFullscreen(doc) : null,
      panes: () => this.toggleStrip(),
      comm: () => this.toggleComm(),
    });
    this.unsubs.push(kit.onFullscreenRefused(() => this.lens.dropFullscreen()));
    this.strip = new StripView(doc);
    this.comm = cockpit.pane('comm') as unknown as CommPane;
    // The reply line sends only in play, as the keys do (play-gate.ts).
    this.comm.setPhoneMode(true, { live: () => keysLive(deps.playState()) });
    this.unread = this.comm.unreadCounts();
    // The model tells when a count changes; nothing is polled or counted per line.
    this.comm.onUnread((u) => {
      this.unread = u;
      this.syncKeys();
    });
    this.unsubs.push(() => this.comm.onUnread(null));
    this.commBand = new CommBand(doc, { onRows: (rows) => deps.settings.update({ phone: { commRows: rows } }) });
    this.hot = new HotkeysView(doc, {
      press: (i) => this.pressHotkey(i),
      save: (i, key) => deps.settings.update({ phone: { hotkeys: withHotkey(deps.settings.get().phone.hotkeys, i, key) } }),
      toggle: () => deps.settings.update({ phone: { hotkeysOpen: !deps.settings.get().phone.hotkeysOpen } }),
      hp: () => knownHp(deps.game.char.vitals.get('hp')),
      split: (text) => kit.splitCommands(text),
      onBox: () => this.syncBox(),
    });
    // The K key takes the compass's free cell, left of N.
    compass.el.prepend(this.hot.kEl);
    this.el.append(this.strip.el, this.fight.el, this.commBand.el, this.lens.el, this.lens.rowEl, this.hot.el, this.hot.boxEl, compass.el);
    cockpit.el.append(this.el);
    this.menu = new PhoneMenu({
      parent: cockpit.el,
      settings: deps.settings,
      status: deps.status,
      scriptsOn: () => deps.scriptsOn(),
      reconnect: () => deps.reconnect(),
      openFrame: (f) => deps.openFrame(f),
      onClose: () => deps.onMenuClose?.(),
      // The menu lies over the box (also when a dropped link opens it): the box gives way, unsaved.
      onOpen: () => this.hot.closeBox(),
      fits: (size) => this.sizeFits(size),
    });
    // The way to the menu while the cockpit shows "Window too small" (the
    // command row with the menu key is hidden and inert then): shown by
    // phone.css only in that state.
    this.rescueKey = menuKey(doc, () => deps.openMenu());
    this.rescueKey.className = 'wc-ph-menu-rescue';
    cockpit.el.append(this.rescueKey);

    this.menuKey = menuKey(doc, () => deps.openMenu());
    cockpit.inputEl.prepend(this.menuKey);
    this.placeholder();

    this.unsubs.push(
      deps.game.subscribe((part) => {
        // Your HP comes with `char`, the fight and the members with `group`.
        if (part === 'group' || (part === 'char' && this.card !== null)) this.syncFight();
      }),
      cockpit.onLayout(() => this.place()),
      deps.settings.subscribe((next, prev) => {
        // By value: the store hands out a fresh copy on every update (changed.ts).
        if (sectionChanged(next.phone.lens, prev.phone.lens)) this.syncLens();
        if (sectionChanged(next.phone.strip, prev.phone.strip)) this.syncPages();
        if (next.phone.commRows !== prev.phone.commRows && this.commOpen) cockpit.setPhoneComm({ rows: next.phone.commRows });
        if (next.phone.unread !== prev.phone.unread) this.syncKeys();
        if (sectionChanged(next.phone.hotkeys, prev.phone.hotkeys) || next.phone.hotkeysOpen !== prev.phone.hotkeysOpen || next.phone.compassSize !== prev.phone.compassSize) this.syncHotkeys();
        if (next.phone.wakeLock !== prev.phone.wakeLock) this.wake.sync();
      }),
      // A script pane came, went or was renamed: the strip's pages follow.
      cockpit.onScriptPanes(() => this.syncPages()),
      watchSwipes(
        cockpit.el,
        (t) => t.closest('.wc-pane[data-phone-strip], .wc-ph-strip') !== null,
        (step) => this.stepStrip(step),
      ),
    );
    // Ctrl/Alt+1…9 (a physical keyboard): the strip's page at that place, opening the strip for it.
    cockpit.setPhonePageKey((index) => {
      const page = this.pages[index];
      if (!page) return false;
      this.showStrip(page.id);
      return true;
    });
    this.unsubs.push(() => cockpit.setPhonePageKey(null));
    this.unsubs.push(() => this.hot.dispose());
    // Keep the screen on (ADR 0136 §10): while the setting is on, the session is connected and
    // the page is visible. Settled on a change of any of the three, never polled.
    const win = doc.defaultView;
    this.wake = new WakeLock(win?.navigator, () =>
      wakeWanted({ setting: deps.settings.get().phone.wakeLock, connected: this.connected(), visible: doc.visibilityState === 'visible' }),
    );
    const onVisible = (): void => this.wake.sync();
    doc.addEventListener('visibilitychange', onVisible);
    this.unsubs.push(
      () => doc.removeEventListener('visibilitychange', onVisible),
      // The status also changes with every link sample: only a change of "connected" reaches the lock.
      deps.status.subscribe(() => {
        const c = this.connected();
        if (c === this.wakeConn) return;
        this.wakeConn = c;
        this.wake.sync();
      }),
      () => this.wake.dispose(),
    );
    this.wakeConn = this.connected();
    this.wake.sync();
    this.syncPages();
    this.syncHotkeys();
    this.syncLens();
    this.syncFight();
    this.place();
  }

  /**
   * A key's command (the compass; the hot keys from stage 51e): sent only
   * in play (`keysLive`). Outside it the tap is dropped without a word: it
   * never types into a login or password prompt and never opens a
   * connection.
   */
  send(cmd: string): void {
    if (!keysLive(this.deps.playState())) return;
    this.deps.command(cmd);
    // Felt only when the tap did send (ADR 0136 §7).
    if (this.deps.settings.get().phone.vibrate) pulse(this.el.ownerDocument.defaultView?.navigator);
  }

  /** Connected to MUME (not a replay): what the wake lock and nothing else asks. */
  private connected(): boolean {
    const s = this.deps.playState();
    return !s.replay && (s.conn === 'login' || s.conn === 'playing');
  }

  /**
   * "Command" on the command line's textarea, never on the separate
   * password field the input pane swaps in while MUME asks for a password.
   * Should the password field be in place now, the textarea gets it when
   * it comes back (one observer on the field's wrapper, gone after that).
   */
  private placeholder(): void {
    const slot = this.deps.cockpit.inputEl;
    const set = (): boolean => {
      const ta = slot.querySelector<HTMLTextAreaElement>('textarea.wc-input-field');
      if (ta) ta.placeholder = 'Command';
      return ta !== null;
    };
    if (set()) return;
    const wrap = slot.querySelector('.wc-input-wrap');
    const MO = slot.ownerDocument.defaultView?.MutationObserver;
    if (!wrap || !MO) return;
    const mo = new MO(() => {
      if (set()) mo.disconnect();
    });
    mo.observe(wrap, { childList: true });
    this.unsubs.push(() => mo.disconnect());
  }

  /** Whether the game keeps its least columns and rows at text size `size` on this screen. */
  private sizeFits(size: number): boolean {
    const el = this.deps.cockpit.el;
    const cell = this.deps.cells.get();
    return sizeFits(size, {
      width: el.clientWidth,
      // The too-small guard is off while the keyboard is up (the rows are not judged then).
      height: phoneKit().keyboardUp() ? Infinity : el.clientHeight,
      cellW: cell.w,
      cellH: cell.h,
      size: this.deps.settings.get().appearance.size,
      minCols: phoneKit().minCols,
      minRows: phoneKit().minRows,
    });
  }

  /**
   * Applies the Map lens settings (ADR 0136 §4): the cockpit places the
   * map pane for a lens of that size (or not at all), the pane draws the
   * lens's fixed look, and the zoom is the level's for that size. The
   * level starts at "Opens at" and is kept through a size change; a new
   * "Opens at" sets it. The stored Mapper settings are never written.
   */
  private syncLens(): void {
    const { cockpit, settings } = this.deps;
    const l = settings.get().phone.lens;
    const size = l.show ? lensPx(l.size) : 0;
    const opensAt = lensLevel(l.opensAt);
    if (opensAt !== this.lensOpensAt) {
      this.lensOpensAt = opensAt;
      this.lens.setLevel(opensAt);
    }
    this.lensSize = size;
    if (size === 0) {
      cockpit.setPhoneLens(null);
      return;
    }
    // The pane's clip (phone.css) and the dressing share the diameter.
    cockpit.el.style.setProperty('--ph-lens-size', `${size}px`);
    this.map.setLens(LENS_LOOK);
    this.zoomLens();
    this.askLens();
  }

  /**
   * Asks the cockpit for the lens's place with what it must keep clear of
   * now: the compass and the hot key column (not with the keyboard up, when
   * they are hidden), and an open hot key box (always). The cockpit lays
   * out again only when something of it changed.
   */
  private askLens(): void {
    if (this.lensSize === 0) return;
    this.deps.cockpit.setPhoneLens({ size: this.lensSize, gapTop: LENS_GAP_TOP, gapRight: LENS_GAP_RIGHT, clearBottom: this.lensClear, clearAlways: this.boxClear() });
  }

  // --------------------------------------------------------------- hot keys

  /**
   * A tap on a hot key (ADR 0136 §8): its command as a typed line, through
   * the keys' gate (`send`). A key that has nothing to send (a special with
   * the hit points unknown; a stored line of several commands) says so in
   * the game text, also only in play.
   */
  private pressHotkey(index: number): void {
    const { settings, game } = this.deps;
    const key = settings.get().phone.hotkeys[index];
    if (!key) return;
    const p = hotkeyPress(key, knownHp(game.char.vitals.get('hp')), (text) => phoneKit().splitCommands(text));
    if (p.kind === 'send') this.send(p.command);
    else if (p.kind === 'notice' && keysLive(this.deps.playState())) this.deps.notice(p.text);
  }

  /** The column follows the settings; the lens keeps clear of it (ADR 0136 §4). */
  private syncHotkeys(): void {
    const p = this.deps.settings.get().phone;
    // The keys' size (the Compass setting): phone.css lays the compass, the column, the box and
    // the command field out from it (compass-size.ts has the same sums).
    const px = compassPx(p.compassSize);
    if (px !== this.keyPx || !this.deps.cockpit.el.style.getPropertyValue('--ph-ck')) {
      this.keyPx = px;
      this.deps.cockpit.el.style.setProperty('--ph-ck', `${px}px`);
    }
    this.hot.set(p.hotkeys, p.hotkeysOpen, hotStep(px));
    const n = p.hotkeysOpen ? this.hot.count : 0;
    this.lensClear = n === 0 ? compassHeight(px) : hotTop(px, n) + LENS_CLEAR;
    if (this.hot.boxOpen) this.syncBox();
    this.askLens();
  }

  /** The box's foot above the layer's bottom edge: beside the column, or over the command row with the keyboard up. */
  private boxBottom(): number {
    const g = this.deps.cockpit.phoneGameLayout;
    if (!g || !phoneKit().keyboardUp()) return hotBottom(this.keyPx);
    return this.el.clientHeight - g.input.y * this.deps.cells.get().h + BOX_GAP;
  }

  /** What an open box takes from the bottom edge (0: closed): the lens hides while it would collide. */
  private boxClear(): number {
    return this.hot.boxOpen ? this.boxBottom() + this.hot.boxEl.offsetHeight + LENS_CLEAR : 0;
  }

  /** The box opened, closed or moved: its place, then the lens's room (one layout read, on those events only). */
  private syncBox(): void {
    if (this.hot.boxOpen) {
      const bottom = this.boxBottom();
      this.hot.placeBox(bottom, this.el.clientHeight - bottom - BOX_GAP);
    }
    this.askLens();
  }

  // ------------------------------------------------------------------ strip

  /**
   * The strip's pages from the setting and the script panes present. An
   * open strip keeps its page while it is still there, takes its neighbour
   * when it went, and closes when no page is left.
   */
  private syncPages(): void {
    const { cockpit, settings } = this.deps;
    const was = this.pages;
    this.pages = stripPages(
      settings.get().phone.strip.panes,
      cockpit.scriptPanes().map((p) => ({ id: p.id, label: p.title })),
      (id) => cockpit.pane(id as PaneId).label,
    );
    if (this.stripPage !== null && !this.pages.some((p) => p.id === this.stripPage)) {
      this.stripPage = keepPage(this.pages, this.stripPage, was);
    }
    if (this.stripOpen) {
      if (this.stripPage === null) this.stripOpen = false;
      cockpit.setPhoneStrip(this.stripOpen ? (this.stripPage as PaneId) : null);
    }
    this.strip.set(this.pages, this.stripPage);
    this.guardStrip();
    this.syncKeys();
  }

  /** The fling guard follows the strip's shown pane (strip.ts `holdFling`); none while it is closed. */
  private guardStrip(): void {
    const id = this.stripOpen ? this.stripPage : null;
    if (id === this.flingOn) return;
    this.flingOff?.();
    this.flingOff = null;
    this.flingOn = id;
    if (id !== null) this.flingOff = holdFling(this.deps.cockpit.pane(id as PaneId).el);
  }

  /** Opens the strip on page `id`, or changes its page. */
  private showStrip(id: string): void {
    if (!this.pages.some((p) => p.id === id)) return;
    this.stripOpen = true;
    this.stripPage = id;
    this.deps.cockpit.setPhoneStrip(id as PaneId);
    this.strip.set(this.pages, id);
    this.guardStrip();
    this.syncKeys();
  }

  /** The panes key: opens the strip on the page it had (the first, the first time), or closes it. */
  private toggleStrip(): void {
    if (this.stripOpen) {
      this.stripOpen = false;
      this.deps.cockpit.setPhoneStrip(null);
      this.guardStrip();
      this.syncKeys();
      return;
    }
    const page = stepPage(this.pages, this.stripPage, 0);
    if (page !== null) this.showStrip(page);
  }

  /** A swipe: the next page, or the one before (the strip does not wrap). */
  private stepStrip(step: -1 | 1): void {
    if (!this.stripOpen) return;
    const page = stepPage(this.pages, this.stripPage, step);
    if (page !== null && page !== this.stripPage) this.showStrip(page);
  }

  // ------------------------------------------------------------------- Comm

  /** The Comm key: opens Comm under the fight card at its stored height, or closes it. */
  private toggleComm(): void {
    const { cockpit, settings } = this.deps;
    this.commOpen = !this.commOpen;
    cockpit.setPhoneComm(this.commOpen ? { rows: settings.get().phone.commRows } : null);
    // Closing reads nothing more at once; opening is told to the pane when its rows are laid out (`place`).
    if (!this.commOpen) this.comm.setPhoneOpen(false);
    this.syncKeys();
  }

  /** The lens's keys: lit while their feature is open, the Comm key's badge and name. */
  private syncKeys(): void {
    const n = unreadCount(this.unread, this.deps.settings.get().phone.unread);
    // Lit by what is on screen, not by what was asked for: on a screen too short for it the
    // allocator leaves Comm (or the strip) out, and then the key is not lit and the badge counts on.
    this.lens.setKeys({
      panes: this.pages.length > 0,
      stripOpen: this.stripShown,
      commOpen: this.commShown,
      // Shown, Comm has its own unread marks.
      badge: this.commShown ? '' : badgeText(n),
      commLabel: commKeyLabel(this.commShown, n),
    });
  }

  /** Sends the lens's zoom for its level and size to the map, when either changed. */
  private zoomLens(): void {
    const level = this.lens.zoomLevel;
    const key = `${this.lensSize}:${level}`;
    if (this.lensSize === 0 || key === this.lensZoomKey) return;
    this.lensZoomKey = key;
    this.map.zoomTo(lensZoom(level, this.lensSize));
  }

  /** Recomputes the fight card; the DOM and the cockpit hear of it only on a change. */
  private syncFight(): void {
    const { game, cockpit } = this.deps;
    const f = game.group.fight();
    let next: FightCard | null = null;
    if (f.opponent !== null) {
      const v = game.char.vitals;
      const hpWord = v.get('hp-string');
      const self: SelfVitals = {
        name: game.char.name,
        hp: num(v.get('hp')),
        maxhp: num(v.get('maxhp')),
        word: typeof hpWord === 'string' ? hpWord : null,
      };
      const tank = f.tankId === null ? null : (game.group.get(f.tankId) ?? null);
      // An unknown word keeps the last step, within one fight (a new opponent starts full).
      const prev = this.card;
      next = fightCard(f, tank, self, prev?.right.pct ?? null);
      if (next && prev && next.right.name !== prev.right.name) next = fightCard(f, tank, self, null);
    }
    const sig = fightSig(next);
    if (sig === this.sig) return;
    const was = this.card !== null;
    this.card = next;
    this.sig = sig;
    this.fight.set(next);
    if (was !== (next !== null)) {
      // The card's rows come and go with the fight; the card shows once the cockpit has laid them out.
      cockpit.setPhoneFight(next !== null);
      if (next === null) this.fight.place(0, 0, false);
    }
  }

  /** Follows the cockpit's layout: the fight card over its rows. */
  private place(): void {
    const g = this.deps.cockpit.phoneGameLayout;
    if (!g) return;
    const { w, h } = this.deps.cells.get();
    this.fight.place(g.fight.y * h, g.fight.h * h, this.card !== null && !g.tooSmall);
    // The lens's circle is centred on the map pane's rectangle (whole cells, a little larger).
    // The strip's chrome over its rows; Comm's band on its last row. Comm is "open" for the
    // pane (its view read) only while it really has rows on this screen.
    const stripShown = this.stripOpen && !g.tooSmall && g.strip.h > 0;
    this.strip.place(g.strip.y * h, stripShown ? g.strip.h * h : 0);
    const commShown = this.commOpen && !g.tooSmall && g.comm.h > 0;
    this.comm.setPhoneOpen(commShown);
    if (stripShown !== this.stripShown || commShown !== this.commShown) {
      this.stripShown = stripShown;
      this.commShown = commShown;
      this.syncKeys();
    }
    this.commBand.place(
      commShown && g.commRange
        ? { commTop: g.comm.y * h, bandTop: (g.comm.y + g.comm.h - 1) * h, rowH: h, rows: g.comm.h, min: g.commRange.min, max: g.commRange.max }
        : null,
    );
    if (this.hot.boxOpen) {
      // The strip or Comm opened into the box's place, or the screen is too small for the
      // layout: the box gives way, unsaved. Else it follows the keyboard (over the command
      // row, or back beside the column).
      if (g.tooSmall) this.hot.closeBox();
      else {
        // Placed first: its height on this screen is known only then.
        this.syncBox();
        const boxTop = this.el.clientHeight - this.boxBottom() - this.hot.boxEl.offsetHeight;
        if (g.game.y * h > boxTop) this.hot.closeBox();
      }
    }
    const r = g.tooSmall ? null : g.lens;
    const size = this.lensSize;
    // The keys' row stands in for a lens that is off or has no room; not for one the cockpit has
    // not laid out yet (asked for, the relayout pending).
    const pending = size > 0 && !g.tooSmall && g.lens === null && !g.lensHidden;
    this.lens.place(
      r && size > 0 ? { left: (r.x + r.w / 2) * w - size / 2, top: (r.y + r.h / 2) * h - size / 2, size } : null,
      pending || g.tooSmall ? null : g.game.y * h + SATROW_GAP,
    );
  }

  dispose(): void {
    for (const u of this.unsubs.splice(0)) u();
    this.flingOff?.();
    this.menu.dispose();
    this.rescueKey.remove();
    this.el.remove();
    this.menuKey.remove();
  }
}

/** The menu key: three bars, 44 px, at the far left of the command row. */
function menuKey(doc: Document, open: () => void): HTMLButtonElement {
  const b = doc.createElement('button');
  b.type = 'button';
  // `wc-menu-btn`: the phone's menu button, as the old `☰` was.
  b.className = 'wc-menu-btn wc-ph-menu';
  b.title = 'Menu';
  b.setAttribute('aria-label', 'Menu');
  // Not in the Tab order (ADR 0108).
  b.tabIndex = -1;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'wc-ph-ico');
  svg.setAttribute('aria-hidden', 'true');
  const p = doc.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', 'M4 7h16M4 12h16M4 17h16');
  svg.append(p);
  b.append(svg);
  // The press keeps the focus (and the keyboard) where it is.
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    open();
  });
  return b;
}

/** Mounts the phone layer over `deps.cockpit` (the live game on a phone). */
export function mountPhoneLayer(deps: PhoneLayerDeps): PhoneLayer {
  setPhoneKit(deps.kit);
  setPhoneControls(deps.controls);
  return new PhoneLayer(deps);
}
