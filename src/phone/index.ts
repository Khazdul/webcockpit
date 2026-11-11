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
//   comm-chrome.ts  the resize bands of the strip and of Comm; Comm is the
//                   cockpit's Comm pane, in its phone mode, and the Comm
//                   key's badge (unread.ts)
//   hotkeys.ts      the hot key column, the K key in the compass's free
//                   cell, and the box a held key opens (hotkey-model.ts)
//   keyboard.ts     a keyboard of our own for the command field (ADR 0138;
//                   only with `?kbd=` until the stage is released; model:
//                   keyboard-model.ts), and its readout (keyboard-readout.ts)
//   here            the menu key in the command row, and the wiring
//
// Cost (stage 51 rule 4): nothing runs per frame or per incoming line. The
// fight card follows the game state's change notifications (GMCP `Char.*`
// and `Group.*` that changed something) and redraws only when its
// signature changes; the geometry follows the cockpit's layouts. A band's
// drag lays out when the finger reaches another row (the cockpit at most
// once per frame), and MUME gets one window size for it, on the release.
//
// Landscape (stage 52c; the cockpit's layout says which, `landscape`): the
// strip and Comm are one column from the left with one band along its
// right edge, dragged sideways; the fight card, the game text and the
// command row are what is right of it; the lens and its key row stand left
// of the hot key columns. The keys are 36 px in portrait and 44 px in
// landscape (compass-size.ts).

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
import { type LensLevel, LENS_MIN_PX, lensFullPx, lensLevel, lensZoom } from './lens-zoom';
import type { MapPane } from '../panes/map';
import type { CommPane } from '../panes/comm';
import type { PaneId } from '../layout/types';
import { CommHead, ResizeBand } from './comm-chrome';
import { StripView, holdFling, watchSwipes } from './strip';
import { type StripPage, keepPage, stepPage, stripPages } from './strip-model';
import { type Unread, badgeText, commKeyLabel, unreadCount } from './unread';
import { HOT_TOP_MARGIN, KEY_GAP, compassHeight, compassPx, hotBottom, hotStep, hotTop, hotWidth, keyRowRight, leftOfHot, sideClear, topLimit } from './compass-size';
import { phoneDefaultsAtStart } from './phone-defaults';
import { WakeLock, wakeWanted } from './wake-lock';
import { HotkeysView } from './hotkeys';
import { hotkeyPress, knownHp, withHotkey } from './hotkey-model';
import { type PhoneControls, type PhoneKit, phoneKit, setPhoneControls, setPhoneKit } from './kit';
import { type PhoneCommandLine, OwnKeyboard } from './keyboard';
import { type OkbLayout, OKB_PAD_Y, OKB_ROW_LEAST, okbBand, okbBlockWidth, okbFromQuery, okbHeightPx, okbLayout, okbPortraitSide, okbRowCount } from './keyboard-model';
import { installKeyboardReadout } from './keyboard-readout';

export type { PhoneControls, PhoneKit } from './kit';
export type { PhoneCommandLine } from './keyboard';
import type { AppStatusView } from '../app/status';
import type { SettingsStore } from '../settings';
import type { LiveRuns } from '../runs/live';

export type { MenuFrame } from './menu-sheet';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The lens's place (the mockups): 16 px under the fight card or the top edge, 12 px from the right edge. */
const LENS_GAP_TOP = 16;
const LENS_GAP_RIGHT = 12;
/** Landscape: the lens's air to the left column: its corner key's overhang and the band's grip. */
const LENS_GAP_LEFT = 20;
/** A lens key's overhang over the lens's box (phone.css), and the key row's width: three keys and two gaps. */
const SAT_OVER = 10;
const SATROW_W = 3 * 40 + 2 * 6;
/** What the lens keeps clear above the column or the box: its ring and shadow, and a little air. */
const LENS_CLEAR = 16;
/**
 * Landscape: the same two, tighter (the corner keys' 10 px overhang and a little air). A phone
 * outside fullscreen has some 270 to 280 px of height there, and at 16 px the whole rows left
 * for the lens came out under its least size.
 */
const LENS_GAP_TOP_LAND = 12;
const LENS_CLEAR_LAND = 12;
/** The box's air to the command row (the keyboard up) and to the top edge. */
const BOX_GAP = 8;
/** After a pointer on the command field: how long a focus of the field is taken for that pointer's (a long press focuses late), ms. */
const OKB_POINTER_FOCUS_MS = 700;
/** A lens key's side, px (phone.css). */
const SAT_PX = 40;
/** The key row's air under what is above it (the lens hidden). */
const SATROW_GAP = 8;
/** After a rotation or a fullscreen change: how long a drop of `wc-kbd` is taken for the change's own (phone-viewport.ts settles within 500 ms). */
const SHAPE_SETTLE_MS = 800;
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
  /** Exit session, confirmed (the shell's `exitSession`), and the live run for its rating. */
  exit(): void;
  runs?: Pick<LiveRuns, 'anchor' | 'chain' | 'saveChain'> | undefined;
  /** The menu closed back to the game. */
  onMenuClose?(): void;
  /**
   * Stage 53 (ADR 0138): the command line as a keyboard of our own types
   * in it. The shell passes it only with `?kbd=1`, `?kbd=sv` or `?kbd=en`;
   * absent, there is no such keyboard and nothing of it runs.
   */
  ownKeyboard?: PhoneCommandLine | undefined;
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
  /** The lens's full diameter as asked of the cockpit (0: not shown) and the "Opens at" it started from. */
  private lensFull = 0;
  private lensOpensAt: LensLevel | null = null;
  /** The lens's diameter on screen now, from the last layout (0: hidden): the clip, the dressing and the zoom follow it. */
  private lensSize = 0;
  /** The map pane's own element (the clip's diameter is set on it, not on the cockpit: nothing else restyles). */
  private readonly mapEl: HTMLElement;
  /** The zoom last sent to the map, as `size:level` (nothing is sent again for the same). */
  private lensZoomKey = '';
  private readonly strip: StripView;
  private readonly stripBand: ResizeBand;
  /** The strip's pages now, whether it is open, and its page (kept in memory while it is closed). */
  private pages: StripPage[] = [];
  private stripOpen = false;
  private stripPage: string | null = null;
  /** The pane the fling guard is on (the strip's shown pane), and its uninstaller. */
  private flingOn: string | null = null;
  private flingOff: (() => void) | null = null;
  /** The cockpit's Comm pane, in its phone mode. */
  private readonly comm: CommPane;
  private readonly commBand: ResizeBand;
  /** Landscape: Comm's hood in the left column, under a divider when the strip is above it. */
  private readonly commHead: CommHead;
  /** The cockpit's height the landscape key size was last judged at (not taken while the keyboard is up). */
  private landH = Infinity;
  /** Landscape: the band along the left column's right edge. */
  private readonly sideBand: ResizeBand;
  /** The landscape arrangement, as of the cockpit's last layout (the keys' size and the lens's place follow it). */
  private landscape = false;
  /** `--ph-side-w` as last set on the layer: the left column's width (the hot key box stays right of it). */
  private sideW = '';
  /** Comm is wanted open (the key); it shows when the screen has the rows. */
  private commOpen = false;
  /** What the last layout really gave the strip and Comm rows for (the keys are lit by these). */
  private stripShown = false;
  private commShown = false;
  private readonly hot: HotkeysView;
  /** What the lens must stay out of from the bottom edge, as last asked of the cockpit. */
  private lensClear = 0;
  /** A compass key's side in px (portrait or landscape); the hot keys follow it. */
  private keyPx = 0;
  /** `--ph-hot-w` as last set: the hot key columns' width. */
  private hotW = '';
  private disposed = false;
  private readonly wake: WakeLock;
  /** Connected to MUME, as the wake lock last saw it. */
  private wakeConn = false;
  private unread: Unread = { private: 0, group: 0, public: 0, all: 0 };
  private readonly unsubs: Array<() => void> = [];
  /** The card on screen (null: no fight) and its signature. */
  private card: FightCard | null = null;
  private sig = '';
  /** The keyboard of our own (ADR 0138; null without `?kbd=1`), whether it is open, and its readout's redraw. */
  private okb: OwnKeyboard | null = null;
  private okbOpen = false;
  private okbReadout: (() => void) | null = null;
  private okbLayout: OkbLayout = 'en';
  /** While it is open: what it takes from the bottom edge on screen, px (the compass and the hot keys stand on it in portrait). */
  private okbLift = 0;
  /** While it is open: the hot key columns, and the compass, have no room beside or above it. */
  private okbNoK = false;
  private okbNoPad = false;
  /** How the layer's parts were last arranged for it (nothing is restyled for the same). */
  private okbSig = '';

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
    this.mapEl = cockpit.pane('map').el;
    this.lens = new LensView(doc, {
      onLevel: () => this.zoomLens(),
      fullscreen: kit.canFullscreen(doc) ? () => kit.toggleFullscreen(doc) : null,
      panes: () => this.toggleStrip(),
      comm: () => this.toggleComm(),
    });
    this.unsubs.push(kit.onFullscreenRefused(() => this.lens.dropFullscreen()));
    this.strip = new StripView(doc);
    // A band's drag (comm-chrome.ts): the cockpit lays out at each new row and keeps the window
    // size for MUME back until the release; the height is stored once, on the release.
    // After it (released, or cancelled) the cockpit has the stored heights again, not the drag's.
    // While one band is dragged the other part keeps the height it shows now, whatever is
    // stored for it: a part squeezed by the fight card would else grow back as the dragged one
    // gives it room, and take that room from the finger's way back.
    const hold = (on: boolean, band?: 'strip' | 'comm'): void => {
      cockpit.holdPhoneSize(on);
      const g = cockpit.phoneGameLayout;
      if (on) {
        if (!g || g.landscape) return;
        if (band === 'strip' && this.commOpen && g.comm.h > 0) cockpit.setPhoneComm({ rows: g.comm.h });
        if (band === 'comm' && g.strip.h > 0) cockpit.setPhoneStripRows(g.strip.h);
        return;
      }
      const p = deps.settings.get().phone;
      cockpit.setPhoneStripRows(p.stripRows);
      cockpit.setPhoneSideCols(p.sideCols);
      if (this.commOpen) cockpit.setPhoneComm({ rows: p.commRows });
    };
    this.stripBand = new ResizeBand(doc, {
      className: 'wc-ph-rband wc-ph-strip-band',
      gripClass: 'wc-ph-rgrip wc-ph-strip-grip',
      label: 'Drag to resize the panes',
      onDrag: (on) => hold(on, 'strip'),
      onLive: (rows) => cockpit.setPhoneStripRows(rows),
      onRows: (rows) => deps.settings.update({ phone: { stripRows: rows } }),
    });
    this.stripBand.el.append(this.strip.dots);
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
    this.commBand = new ResizeBand(doc, {
      className: 'wc-ph-rband wc-ph-comm-band',
      gripClass: 'wc-ph-rgrip wc-ph-comm-grip',
      label: 'Drag to resize Comm',
      onDrag: (on) => hold(on, 'comm'),
      onLive: (rows) => {
        if (this.commOpen) cockpit.setPhoneComm({ rows });
      },
      onRows: (rows) => deps.settings.update({ phone: { commRows: rows } }),
    });
    this.commHead = new CommHead(doc);
    this.sideBand = new ResizeBand(doc, {
      className: 'wc-ph-rband wc-ph-side-band',
      gripClass: 'wc-ph-rgrip wc-ph-side-grip',
      label: 'Drag to resize the panes and Comm',
      axis: 'x',
      onDrag: (on) => hold(on),
      onLive: (cols) => cockpit.setPhoneSideCols(cols),
      onRows: (cols) => deps.settings.update({ phone: { sideCols: cols } }),
    });
    this.hot = new HotkeysView(doc, {
      press: (i) => this.pressHotkey(i),
      save: (i, key) => deps.settings.update({ phone: { hotkeys: withHotkey(deps.settings.get().phone.hotkeys, i, key) } }),
      toggle: () => deps.settings.update({ phone: { hotkeysOpen: !deps.settings.get().phone.hotkeysOpen } }),
      hp: () => knownHp(deps.game.char.vitals.get('hp')),
      onBox: (open) => {
        // The box and our keyboard never stand together (the box's fields are not typed in from
        // ours until round 53d, and its place is the keyboard's): a held key folds the keyboard.
        if (open) this.closeOwnKeyboard();
        this.syncBox();
        // Landscape: the lens's key row gives way to an open box (`place`), also when the lens was
        // hidden already and the cockpit has nothing new to lay out.
        if (this.landscape) this.place();
      },
    });
    // The K key takes the compass's free cell, left of N.
    compass.el.prepend(this.hot.kEl);
    this.el.append(this.strip.el, this.stripBand.el, this.fight.el, this.commBand.el, this.commHead.el, this.sideBand.el, this.lens.el, this.lens.rowEl, this.hot.el, this.hot.boxEl, compass.el);
    cockpit.el.append(this.el);
    this.menu = new PhoneMenu({
      parent: cockpit.el,
      settings: deps.settings,
      status: deps.status,
      scriptsOn: () => deps.scriptsOn(),
      reconnect: () => deps.reconnect(),
      openFrame: (f) => deps.openFrame(f),
      exit: () => deps.exit(),
      runs: deps.runs,
      onClose: () => deps.onMenuClose?.(),
      // The menu lies over the box (also when a dropped link opens it): the box gives way, unsaved.
      // So does a keyboard of our own (the sheet would lie over it).
      onOpen: () => {
        this.hot.closeBox();
        this.closeOwnKeyboard();
      },
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
        if (next.phone.stripRows !== prev.phone.stripRows) cockpit.setPhoneStripRows(next.phone.stripRows);
        if (next.phone.sideCols !== prev.phone.sideCols) cockpit.setPhoneSideCols(next.phone.sideCols);
        if (next.phone.unread !== prev.phone.unread) this.syncKeys();
        if (
          sectionChanged(next.phone.hotkeys, prev.phone.hotkeys) ||
          next.phone.hotkeyCount !== prev.phone.hotkeyCount ||
          next.phone.hotkeysOpen !== prev.phone.hotkeysOpen
        )
          this.syncHotkeys();
        if (next.phone.wakeLock !== prev.phone.wakeLock) this.wake.sync();
        if (next.phone.keyboard.digits !== prev.phone.keyboard.digits) this.syncOwnDigits();
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
    this.watchKeyboard(doc);
    if (deps.ownKeyboard) this.mountOwnKeyboard(doc, deps.ownKeyboard);
    // The lens's full size follows the screen's short side: a rotation (or a resized window) asks again.
    const onResize = (): void => this.syncLens();
    win?.addEventListener('resize', onResize);
    this.unsubs.push(() => win?.removeEventListener('resize', onResize));
    cockpit.setPhoneStripRows(deps.settings.get().phone.stripRows);
    cockpit.setPhoneSideCols(deps.settings.get().phone.sideCols);
    // Before the cockpit's first layout: the window's shape (the cockpit judges the same way).
    this.setShape(cockpit.phoneGameLayout?.landscape ?? cockpit.el.clientWidth > cockpit.el.clientHeight, cockpit.el.clientHeight);
    // The one-time phone defaults (phone-defaults.ts): once per device, judged on the STORED
    // settings (before the load the store holds a new phone's defaults, which carry the mark).
    // `load()` is the store's one load, long done here as a rule. The subscriber above follows
    // the change like any other.
    void deps.settings.load().then(() => {
      if (this.disposed) return;
      // Never in safe mode (`?safe`): this automatic write would save the default appearance.
      const once = phoneDefaultsAtStart(deps.settings.get(), deps.settings.isSafe);
      if (once) deps.settings.update(once);
    });
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
  }

  /**
   * The on-screen keyboard went down while a field still had the focus:
   * the field lets go (stage 52).
   *
   * Android does not blur a field when its keyboard is folded away with
   * the back key: the command field stays focused and looks selected, and
   * the owner saw a hot key tap bring the keyboard back. Nothing in the
   * phone layer or on a key's path calls `focus()` (the input pane's own
   * `focus()` returns at once after a touch, and does nothing for a field
   * that has the focus already). The likely cause, NOT VERIFIED ON A
   * DEVICE: Chrome on Android shows the keyboard again for a tap the page
   * does not cancel while an editable element has the focus. Either way
   * the remedy is here: with no focused field no tap can raise it.
   *
   * The keyboard's state is `html.wc-kbd` (src/layout/phone-viewport.ts
   * sets it once the viewport has been quiet, so never in the middle of
   * the keyboard's opening). Only the settled change from up to down
   * blurs, and only a text field of the cockpit (the command field,
   * Comm's reply, a field of the hot key box). A change that comes with a
   * rotation or a fullscreen change is not the keyboard folding: no blur. The observer runs on a
   * change of `<html>`'s class only: nothing per frame or per line.
   */
  private watchKeyboard(doc: Document): void {
    const root = doc.documentElement;
    const MO = doc.defaultView?.MutationObserver;
    if (!MO) return;
    // A rotation or a fullscreen change with the keyboard up makes the viewport module start its
    // baseline again, and `wc-kbd` drops although the keyboard is still there: a blur would then
    // fold it. So the blur needs the same width and fullscreen state as when it was last seen up.
    //
    // The shape can also change while `wc-kbd` stays set (fullscreen entered or left with the
    // keyboard up): it is then taken anew, with the time. A drop within the viewport module's
    // settling after that change (its last measurement comes 500 ms after a fullscreen change)
    // belongs to the change; a later one is the keyboard folding, and blurs. Without this the
    // shape from before the fullscreen change stayed, and no fold after it ever blurred.
    const win = doc.defaultView;
    const shape = (): string => `${win?.innerWidth ?? 0}|${doc.fullscreenElement !== null}`;
    const clock = (): number => win?.performance.now() ?? Date.now();
    let up = root.classList.contains('wc-kbd');
    let upShape = shape();
    let shapeAt = -Infinity;
    const onShape = (): void => {
      const now = shape();
      if (now === upShape) return;
      upShape = now;
      shapeAt = clock();
    };
    doc.addEventListener('fullscreenchange', onShape);
    doc.addEventListener('webkitfullscreenchange', onShape);
    win?.addEventListener('resize', onShape);
    this.unsubs.push(() => {
      doc.removeEventListener('fullscreenchange', onShape);
      doc.removeEventListener('webkitfullscreenchange', onShape);
      win?.removeEventListener('resize', onShape);
    });
    const mo = new MO(() => {
      const now = root.classList.contains('wc-kbd');
      if (now === up) return;
      up = now;
      if (now) {
        // Up anew: this is the shape it is up in, whatever changed before it came.
        upShape = shape();
        shapeAt = -Infinity;
        return;
      }
      // (The shape's own event may not have come yet: compared here too.)
      if (shape() !== upShape || clock() - shapeAt < SHAPE_SETTLE_MS) return;
      const active = doc.activeElement as HTMLElement | null;
      if (!active || !this.deps.cockpit.el.contains(active)) return;
      // A field typed in from our own keyboard (ADR 0138) never had the device's: it keeps the focus.
      if (active.getAttribute('inputmode') === 'none') return;
      if (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT') active.blur();
    });
    mo.observe(root, { attributes: true, attributeFilter: ['class'] });
    this.unsubs.push(() => mo.disconnect());
  }

  // ---------------------------------------------- own keyboard (ADR 0138, 53a)

  /** True while the keyboard of our own is open (`html.wc-okb`); never `html.wc-kbd`, which is the device's. */
  get ownKeyboardOpen(): boolean {
    return this.okbOpen;
  }

  /**
   * The keyboard of our own for the command field (`?kbd=`). The field
   * asks the device for no keyboard; a pointer on it opens ours:
   *
   * - a tap, at its click (the last event of the tap: the field has the
   *   focus by then, and the relayout that moves the row cannot change what
   *   the rest of the tap hits);
   * - a focus that comes while a pointer is on the field or just after (a
   *   long press focuses the field and offers paste, with no click).
   *
   * A focus without a pointer (a physical keyboard's key) opens nothing.
   * A text field that is not ours taking the focus (Comm's reply or search,
   * the hot key box, a script pane's field: until round 53d those have the
   * device's keyboard) closes ours, so the two never stand together.
   */
  private mountOwnKeyboard(doc: Document, line: PhoneCommandLine): void {
    const { cockpit, settings } = this.deps;
    const win = doc.defaultView;
    const asked = okbFromQuery(new URLSearchParams(win?.location?.search ?? '').get('kbd'));
    this.okbLayout = okbLayout(asked?.layout, win?.navigator?.languages?.length ? win.navigator.languages : win?.navigator?.language);
    const okb = new OwnKeyboard(
      doc,
      {
        target: () => line,
        fold: () => this.closeOwnKeyboard(),
        toggleDigits: () => settings.update({ phone: { keyboard: { digits: !settings.get().phone.keyboard.digits } } }),
      },
      this.okbLayout,
      settings.get().phone.keyboard.digits,
    );
    this.okb = okb;
    this.el.append(okb.el);
    line.setOwnKeyboard(true);
    const wrap = cockpit.inputEl.querySelector<HTMLElement>('.wc-input-wrap');
    const clock = (): number => win?.performance.now() ?? Date.now();
    let pointerDown = false;
    let pointerAt = -Infinity;
    const onTap = (): void => this.openOwnKeyboard();
    const onDown = (): void => {
      pointerDown = true;
      pointerAt = clock();
    };
    const onUp = (): void => {
      if (!pointerDown) return;
      pointerDown = false;
      pointerAt = clock();
    };
    const onFocus = (e: FocusEvent): void => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (wrap?.contains(t)) {
        if (pointerDown || clock() - pointerAt < OKB_POINTER_FOCUS_MS) this.openOwnKeyboard();
        return;
      }
      // Not ours: the field keeps its focus (and gets the device's keyboard); ours gives way.
      if (this.okbOpen && isTextField(t) && t.getAttribute('inputmode') !== 'none') this.closeOwnKeyboard(false);
    };
    wrap?.addEventListener('click', onTap);
    wrap?.addEventListener('pointerdown', onDown);
    doc.addEventListener('pointerup', onUp, true);
    doc.addEventListener('pointercancel', onUp, true);
    doc.addEventListener('focusin', onFocus);
    const readout = win ? installKeyboardReadout(win, () => this.okbOpen) : null;
    this.okbReadout = readout?.draw ?? null;
    this.unsubs.push(() => {
      wrap?.removeEventListener('click', onTap);
      wrap?.removeEventListener('pointerdown', onDown);
      doc.removeEventListener('pointerup', onUp, true);
      doc.removeEventListener('pointercancel', onUp, true);
      doc.removeEventListener('focusin', onFocus);
      this.closeOwnKeyboard(false);
      line.setOwnKeyboard(false);
      readout?.dispose();
      okb.dispose();
      this.okb = null;
    });
  }

  /**
   * Opens the keyboard of our own (a pointer on the command field) and
   * leaves the field focused, so its caret shows. It takes fixed rows at
   * the bottom from the cockpit's allocator: the page keeps its size, the
   * command row moves up to stand on the keyboard, and MUME gets one new
   * window size. The band and what stands beside or above it are placed
   * once the cockpit has laid its rows out (`placeOwnKeyboard`).
   */
  private openOwnKeyboard(): void {
    const line = this.deps.ownKeyboard;
    if (!this.okb || !line || this.deps.cockpit.phoneGameLayout?.tooSmall) return;
    // The box's place is the keyboard's: it gives way, unsaved. (Before `okbOpen`: its closing asks nothing of the keyboard.)
    this.hot.closeBox();
    line.focus();
    if (this.okbOpen) return;
    this.okbOpen = true;
    this.el.ownerDocument.documentElement.classList.add('wc-okb');
    this.reserveOwnKeyboard();
    this.okbReadout?.();
  }

  /** Asks the cockpit for the keyboard's rows as it stands now (a new function is a new height: one layout). */
  private reserveOwnKeyboard(): void {
    const digits = this.deps.settings.get().phone.keyboard.digits;
    this.deps.cockpit.setPhoneBottom((landscape, height) => okbHeightPx(landscape, height, digits));
  }

  /** The digit row was folded up or down (its key; the stored setting): the keys, and one new height for the cockpit. */
  private syncOwnDigits(): void {
    if (!this.okb) return;
    this.okb.setDigits(this.deps.settings.get().phone.keyboard.digits);
    if (this.okbOpen) this.reserveOwnKeyboard();
  }

  /** Closes it (the fold key, the menu, the hot key box, a field that is not ours, a screen too small) and, as a rule, blurs the field. One new window size for MUME. */
  private closeOwnKeyboard(blur = true): void {
    if (!this.okbOpen) return;
    this.okbOpen = false;
    this.el.ownerDocument.documentElement.classList.remove('wc-okb');
    this.okb?.place(null);
    this.arrangeOwnKeyboard(null);
    this.deps.cockpit.setPhoneBottom(null);
    if (blur) this.deps.ownKeyboard?.blur();
    this.okbReadout?.();
  }

  /**
   * Places the open keyboard after a layout: the band on the rows the
   * allocator kept, from under the command row to the bottom edge, and the
   * block in it.
   *
   * - Portrait: the block over the full width (capped per key). The compass
   *   and the hot key columns stand as with the keyboard down, lifted to the
   *   keyboard's top edge; on a screen too low the columns go first, then
   *   the compass (`okbPortraitSide`).
   * - Landscape: the block compressed towards the middle, K1 to K3 in a
   *   column left of it, K4 to K6 right of it, the compass at the far right,
   *   all in the band (`okbBand`, which also says what gives way on a narrow
   *   screen).
   *
   * On a screen with no room for the block it closes.
   */
  private placeOwnKeyboard(g: NonNullable<Cockpit['phoneGameLayout']>, cellH: number): void {
    const okb = this.okb;
    if (!okb) return;
    const H = this.el.clientHeight;
    const W = this.el.clientWidth;
    const top = (g.input.y + g.input.h) * cellH;
    const lift = H - top;
    const digits = this.deps.settings.get().phone.keyboard.digits;
    if (g.tooSmall || g.bottom === 0 || (lift - 2 * OKB_PAD_Y) / okbRowCount(digits) < OKB_ROW_LEAST) {
      this.closeOwnKeyboard();
      return;
    }
    const px = this.keyPx;
    // The columns the K key shows (hidden: none, and no width for them).
    const kOn = !this.hot.el.hidden;
    if (g.landscape) {
      const band = okbBand({ width: W, layout: this.okbLayout, keyPx: px, keyGap: KEY_GAP, kLeft: kOn ? this.hot.rowsIn(0) : 0, kRight: kOn ? this.hot.rowsIn(1) : 0 });
      okb.place({ top, left: band.x, width: band.w });
      this.arrangeOwnKeyboard({ lift, band: true, pad: band.pad, k: !band.droppedK, kLeftX: band.kLeftX, kRightX: band.kRightX });
    } else {
      const width = okbBlockWidth(W, this.okbLayout);
      okb.place({ top, left: (W - width) / 2, width });
      const side = okbPortraitSide(top, compassHeight(px), hotTop(px, 3));
      this.arrangeOwnKeyboard({ lift, band: false, pad: side.pad, k: side.k, kLeftX: null, kRightX: null });
    }
  }

  /**
   * The layer's parts for the open keyboard (phone.css reads these), or as
   * without it (null): `--okb-lift` (the keyboard's height on screen),
   * `data-okb` (`up`: portrait, the keys lifted; `band`: landscape, the keys
   * beside the block at `--okb-k1-x` / `--okb-k4-x`), `data-okb-nopad` and
   * `data-okb-nok` (no room), and `html.wc-okb-wide` while the compass is
   * not at the command row's end (the field then takes the full width).
   * Restyled only on a change.
   */
  private arrangeOwnKeyboard(a: { lift: number; band: boolean; pad: boolean; k: boolean; kLeftX: number | null; kRightX: number | null } | null): void {
    const sig = a ? JSON.stringify(a) : '';
    if (sig === this.okbSig) return;
    this.okbSig = sig;
    const el = this.el;
    const px = (n: number | null): string => (n === null ? '' : `${Math.round(n * 100) / 100}px`);
    const set = (name: string, v: string): void => {
      if (v) el.style.setProperty(name, v);
      else el.style.removeProperty(name);
    };
    set('--okb-lift', a ? px(a.lift) : '');
    set('--okb-k1-x', a ? px(a.kLeftX) : '');
    set('--okb-k4-x', a ? px(a.kRightX) : '');
    if (a) el.dataset.okb = a.band ? 'band' : 'up';
    else delete el.dataset.okb;
    el.toggleAttribute('data-okb-nopad', a !== null && !a.pad);
    el.toggleAttribute('data-okb-nok', a !== null && !a.k);
    el.ownerDocument.documentElement.classList.toggle('wc-okb-wide', a !== null && (a.band || !a.pad));
    this.okbLift = a && !a.band ? a.lift : 0;
    this.okbNoK = a !== null && !a.k;
    this.okbNoPad = a !== null && !a.pad;
    // Portrait: the strip, the fight card and Comm end above the place of three keys only while the columns are there.
    if (this.keyPx !== 0) this.deps.cockpit.setPhoneLimit(a && !a.band && !a.k ? null : topLimit(this.keyPx));
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
   * map pane for a lens (or not at all) and the pane draws the lens's
   * fixed look. The full size is a share of the screen's short side
   * (stage 52); the layout gives the size it has room for, and `place`
   * follows that with the clip, the dressing and the zoom. The level
   * starts at "Opens at" and is kept through a size change; a new "Opens
   * at" sets it. The stored Mapper settings are never written.
   */
  private syncLens(): void {
    const { cockpit, settings } = this.deps;
    const l = settings.get().phone.lens;
    // The layout viewport's short side: the on-screen keyboard shrinks the visual viewport (and
    // the cockpit with it), not this, so the lens keeps its size while typing.
    const win = cockpit.el.ownerDocument.defaultView;
    const size = l.show ? lensFullPx(Math.min(win?.innerWidth ?? 0, win?.innerHeight ?? 0)) : 0;
    const opensAt = lensLevel(l.opensAt);
    if (opensAt !== this.lensOpensAt) {
      this.lensOpensAt = opensAt;
      this.lens.setLevel(opensAt);
    }
    this.lensFull = size;
    if (size === 0) {
      this.lensSize = 0;
      cockpit.setPhoneLens(null);
      return;
    }
    this.map.setLens(LENS_LOOK);
    // A new level at the size on screen (a size not laid out yet is zoomed for in `sizeLens`).
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
    if (this.lensFull === 0) return;
    this.deps.cockpit.setPhoneLens({
      size: this.lensFull,
      min: LENS_MIN_PX,
      gapTop: this.landscape ? LENS_GAP_TOP_LAND : LENS_GAP_TOP,
      // Landscape: left of the hot key columns there are, shown or not (it does not jump when K is tapped).
      gapRight: this.landscape ? leftOfHot(this.keyPx, this.hot.cols, LENS_GAP_RIGHT) : LENS_GAP_RIGHT,
      ...(this.landscape ? { gapLeft: LENS_GAP_LEFT } : {}),
      clearBottom: this.lensClear,
      clearAlways: this.boxClear(),
    });
  }

  // --------------------------------------------------------------- hot keys

  /**
   * A tap on a hot key (ADR 0136 §8): its line as typed, through the keys'
   * gate (`send`); the engine splits a line of several commands as it does
   * a typed one. A special with nothing to send (the hit points unknown)
   * says so in the game text, also only in play.
   */
  private pressHotkey(index: number): void {
    const { settings, game } = this.deps;
    const ph = settings.get().phone;
    const key = ph.hotkeys[index];
    // A slot above the count is not in use (it has no key on screen either).
    if (!key || index >= ph.hotkeyCount) return;
    const p = hotkeyPress(key, knownHp(game.char.vitals.get('hp')));
    if (p.kind === 'send') this.send(p.command);
    else if (p.kind === 'notice' && keysLive(this.deps.playState())) this.deps.notice(p.text);
  }

  /** The column follows the settings; the lens keeps clear of it (ADR 0136 §4). */
  private syncHotkeys(): void {
    const p = this.deps.settings.get().phone;
    // The keys' size (small in portrait, large in landscape): phone.css lays the compass, the column,
    // the box and the command field out from it (compass-size.ts has the same sums).
    const px = compassPx(this.landscape, this.landH);
    if (px !== this.keyPx || !this.deps.cockpit.el.style.getPropertyValue('--ph-ck')) {
      this.keyPx = px;
      this.deps.cockpit.el.style.setProperty('--ph-ck', `${px}px`);
    }
    this.hot.set(p.hotkeys, p.hotkeyCount, p.hotkeysOpen, hotStep(px));
    // The box stands left of the columns there are (phone.css).
    const hotW = `${hotWidth(px, this.hot.cols)}px`;
    if (hotW !== this.hotW) {
      this.hotW = hotW;
      this.deps.cockpit.el.style.setProperty('--ph-hot-w', hotW);
    }
    // The lens is wider than both columns: it keeps clear of the taller one.
    const n = p.hotkeysOpen ? this.hot.rows : 0;
    // Landscape: the lens stands left of the columns and above the compass only.
    this.lensClear = this.landscape ? compassHeight(px) + LENS_CLEAR_LAND : n === 0 ? compassHeight(px) : hotTop(px, n) + LENS_CLEAR;
    // The strip, the fight card and Comm end above the place of three keys, shown or not (stage 52).
    // (Not while our keyboard stands where the columns have no room: `arrangeOwnKeyboard`.)
    this.deps.cockpit.setPhoneLimit(this.okbOpen && this.okbNoK && !this.landscape ? null : topLimit(px));
    // Landscape: the left column ends left of the lens's least place (or its key row) and the columns.
    this.deps.cockpit.setPhoneSideClear(sideClear(px, this.hot.cols, LENS_MIN_PX + SAT_OVER, SATROW_W, LENS_GAP_RIGHT));
    if (this.hot.boxOpen) this.syncBox();
    this.askLens();
    // The lens's key row stands clear of the column (`place`), also when the column came or went without a relayout.
    this.place();
  }

  /**
   * The screen's shape (the cockpit's layout says whether it is landscape;
   * `height` is the cockpit's with the keyboard down): the keys' size, the
   * lens's place and the strip's page dots follow. The dots sit on the
   * strip's band in portrait; landscape has no such band, and they sit at
   * the right end of the hood's row. A low landscape screen keeps the small
   * keys (compass-size.ts).
   */
  private setShape(landscape: boolean, height: number): void {
    const first = this.keyPx === 0;
    if (!first && landscape === this.landscape && compassPx(landscape, height) === this.keyPx) return;
    this.landH = height;
    if (first || landscape !== this.landscape) {
      this.landscape = landscape;
      this.el.toggleAttribute('data-land', landscape);
      (landscape ? this.strip.el : this.stripBand.el).append(this.strip.dots);
    }
    if (!first) this.syncHotkeys();
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

  /**
   * The lens's diameter on screen changed (the layout: full, shrunk, or 0
   * for hidden): the pane's clip and the ring's cut-out (phone.css read
   * `--ph-lens-size` on those two elements) and the zoom follow, so the
   * same rooms stay in view. Once per change of size, never per frame.
   */
  private sizeLens(px: number): void {
    if (px === this.lensSize) return;
    this.lensSize = px;
    if (px === 0) return;
    this.mapEl.style.setProperty('--ph-lens-size', `${px}px`);
    this.lens.el.style.setProperty('--ph-lens-size', `${px}px`);
    this.zoomLens();
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
    // The keys' size and the lens's room follow the screen's shape: `setShape` asks the cockpit
    // again and places. (The height with the keyboard up is not the screen's: the last one stays.)
    const H = phoneKit().keyboardUp() ? this.landH : this.el.clientHeight;
    if (this.keyPx !== 0 && (g.landscape !== this.landscape || compassPx(g.landscape, H) !== this.keyPx)) {
      this.setShape(g.landscape, H);
      return;
    }
    const { w, h } = this.deps.cells.get();
    const land = g.landscape;
    // Our own keyboard stands on the rows the allocator kept for it (not laid out yet right after
    // it opened: `bottom` is 0 until the cockpit's next layout).
    if (this.okb && this.okbOpen && (g.bottom > 0 || g.tooSmall)) this.placeOwnKeyboard(g, h);
    // The left column's width: the hot key box stays right of it (phone.css). On the layer, not
    // the cockpit: a drag changes it at every column, and nothing but the layer's parts reads it.
    const sideW = land && g.side.w > 0 ? `${g.side.w * w}px` : '';
    if (sideW !== this.sideW) {
      this.sideW = sideW;
      if (sideW) this.el.style.setProperty('--ph-side-w', sideW);
      else this.el.style.removeProperty('--ph-side-w');
    }
    // Landscape on a low screen: the hot key columns (shown or not) reach up into the fight
    // card's rows, and the card then ends left of them.
    const fightRight = land && g.fight.h > 0 && g.fight.h * h > H - hotTop(this.keyPx, 3) - HOT_TOP_MARGIN / 2 ? leftOfHot(this.keyPx, this.hot.cols, SATROW_GAP) : 0;
    this.fight.place(g.fight.y * h, g.fight.h * h, this.card !== null && !g.tooSmall, g.fight.x * w, fightRight);
    // The lens's circle is centred on the map pane's rectangle (whole cells, a little larger).
    // The strip's chrome over its rows; Comm's band on its last row. Comm is "open" for the
    // pane (its view read) only while it really has rows on this screen.
    const stripShown = this.stripOpen && !g.tooSmall && g.strip.h > 0;
    this.strip.place(g.strip.y * h, stripShown ? g.strip.h * h : 0, land ? (g.strip.w - g.sideBand) * w : undefined);
    this.stripBand.place(
      stripShown && g.stripRange && !land ? { bandTop: (g.strip.y + g.strip.h - 1) * h, rowH: h, rows: g.strip.h, min: g.stripRange.min, max: g.stripRange.max } : null,
    );
    const commShown = this.commOpen && !g.tooSmall && g.comm.h > 0;
    this.comm.setPhoneOpen(commShown);
    if (stripShown !== this.stripShown || commShown !== this.commShown) {
      this.stripShown = stripShown;
      this.commShown = commShown;
      this.syncKeys();
    }
    this.commBand.place(
      commShown && g.commRange && !land
        ? { bandTop: (g.comm.y + g.comm.h - 1) * h, rowH: h, rows: g.comm.h, min: g.commRange.min, max: g.commRange.max }
        : null,
    );
    this.commHead.place(land && commShown ? { top: g.comm.y * h, width: (g.comm.w - g.sideBand) * w, divided: g.strip.h > 0 } : null);
    // Landscape: the one band, the column's last columns, from top to bottom.
    this.sideBand.place(
      land && (stripShown || commShown) && g.sideRange
        ? { bandTop: (g.side.w - g.sideBand) * w, rowH: w, thick: g.sideBand * w, rows: g.side.w, min: g.sideRange.min, max: g.sideRange.max }
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
        // (Landscape: the column grew into it sideways; the fight card is all there is above the game.)
        if (land ? g.side.w * w > this.hot.boxEl.offsetLeft : g.game.y * h > boxTop) this.hot.closeBox();
      }
    }
    const r = g.tooSmall ? null : g.lens;
    const size = r ? g.lensPx : 0;
    this.sizeLens(size);
    // The keys' row stands in for a lens that is off or has no room; not for one the cockpit has
    // not laid out yet (asked for, the relayout pending).
    const pending = this.lensFull > 0 && !g.tooSmall && g.lens === null && !g.lensHidden;
    const rowTop = g.game.y * h + SATROW_GAP;
    // The keys' row is at the right edge, where the hot key column is: on a low screen (landscape
    // with the strip or a fight card) the row would reach into a column, and then stands left of it.
    // (Above our own keyboard the columns stand lifted by its height, or not at all on a low screen.)
    const cols = this.deps.settings.get().phone.hotkeysOpen && !phoneKit().keyboardUp() && !(this.okbOpen && this.okbNoK);
    // Landscape: the row takes the lens's place, left of the columns there are, shown or not. Not
    // while the box is open: the box reaches up to the top there, and the row would lie on it.
    const rowRight = land
      ? leftOfHot(this.keyPx, this.hot.cols, SATROW_GAP)
      : keyRowRight(rowTop + SAT_PX + SATROW_GAP, this.el.clientHeight - this.okbLift, this.keyPx, cols ? [this.hot.rowsIn(0), this.hot.rowsIn(1)] : [0, 0], SATROW_GAP);
    this.lens.place(
      r && size > 0 ? { left: (r.x + r.w / 2) * w - size / 2, top: (r.y + r.h / 2) * h - size / 2, size } : null,
      pending || g.tooSmall || (land && this.hot.boxOpen) ? null : rowTop,
      rowRight,
    );
  }

  dispose(): void {
    this.disposed = true;
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

/** A field text is typed in (not a checkbox, a button or the like). */
function isTextField(el: HTMLElement): boolean {
  if (el.tagName === 'TEXTAREA' || el.isContentEditable) return true;
  if (el.tagName !== 'INPUT') return false;
  return !['button', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset', 'image', 'hidden'].includes((el as HTMLInputElement).type);
}

/** Mounts the phone layer over `deps.cockpit` (the live game on a phone). */
export function mountPhoneLayer(deps: PhoneLayerDeps): PhoneLayer {
  setPhoneKit(deps.kit);
  setPhoneControls(deps.controls);
  return new PhoneLayer(deps);
}
