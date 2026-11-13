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
//   strip.ts        the pane strip's page name and dots, and its swipe
//                   (strip-model.ts, swipe.ts); the pane is the cockpit's
//   comm-chrome.ts  the resize bands of the strip and of Comm, with the
//                   panes' names on them (no pane has a hood on a row of
//                   its own: round 53j); Comm is the cockpit's Comm pane,
//                   in its phone mode, and the Comm key's badge (unread.ts)
//   hotkeys.ts      the hot key column, the K key in the compass's free
//                   cell, and the box a held key opens (hotkey-model.ts)
//   keyboard.ts     a keyboard of our own for the game layout's text fields
//                   (ADR 0138; model: keyboard-model.ts; the fields other
//                   than the command line: keyboard-fields.ts), and its
//                   readout (keyboard-readout.ts)
//   haptics.ts      the keys' vibration (`phone.vibrate`)
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
import type { Cockpit, PhoneLensFit, PhoneLimit } from '../layout/cockpit';
import type { PhoneGameHide } from '../layout/phone-game';
import { Compass } from './compass';
import { FightCardView } from './fight-card';
import { type FightCard, type SelfVitals, fightCard, fightSig } from './fight-model';
import { type MenuFrame, PhoneMenu } from './menu-sheet';
import { type PlayState, keysLive } from './play-gate';
import { sizeFits } from './text-settings';
import { sectionChanged } from './changed';
import { LensView } from './lens';
import { type LensLevel, LENS_MIN_PX, lensFullPx, lensLevel, lensZoom } from './lens-zoom';
import { type LensRoom, type LensSpot, fitLens, lensIsSet, lensMax, lensRoom, lensWant, moveLens, resizeLens } from './lens-place';
import type { MapPane } from '../panes/map';
import type { CommPane } from '../panes/comm';
import type { PaneId } from '../layout/types';
import { ResizeBand } from './comm-chrome';
import { StripView, holdFling, watchSwipes } from './strip';
import { AutoLogin, type AutoLoginDeps } from './auto-login';
import type { AskRect } from './login-ask';
import { type StripPage, keepPage, stepPage, stripPages } from './strip-model';
import { type Unread, badgeText, commKeyLabel, unreadCount } from './unread';
import { HOT_TOP_MARGIN, KEY_GAP, KEY_PX_PORTRAIT, compassHeight, compassPx, hotBottom, hotStep, hotTop, hotWidth, keyRowRight, leftOfHot, sideClear, topLimit } from './compass-size';
import { phoneDefaultsAtStart } from './phone-defaults';
import { WakeLock, wakeWanted } from './wake-lock';
import { HotkeysView } from './hotkeys';
import { hotkeyPress, knownHp, withHotkey } from './hotkey-model';
import { type PhoneControls, type PhoneKit, phoneKit, setPhoneControls, setPhoneKit } from './kit';
import { type PhoneCommandLine, OwnKeyboard } from './keyboard';
import { type OkbLayout, OKB_PAD_Y, OKB_ROW_LEAST, okbBand, okbFromQuery, okbHeightPx, okbLayout, okbPortraitSide, okbPortraitWidth, okbRowCount, okbTabletSize } from './keyboard-model';
import { installKeyboardReadout } from './keyboard-readout';
import { type TextField, fieldTarget, fieldUsable, isMarked, isOwnableField, isTextField, markField } from './keyboard-fields';
import { pulse } from './haptics';
import type { OkbTarget } from './keyboard-model';
import type { ScriptPane } from '../panes/script-pane';

export type { PhoneControls, PhoneKit } from './kit';
export type { PhoneCommandLine } from './keyboard';
export { mountPageKeyboard } from './keyboard-pages';
export type { PageKeyboardDeps, PageKeyboardHandle } from './keyboard-pages';
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
/** Portrait: the least height the box is opened at, px (its name, its two fields and what they would send); with less room it does not open. */
const BOX_LEAST = 180;
/** After a pointer on the command field: how long a focus of the field is taken for that pointer's (a long press focuses late), ms. */
const OKB_POINTER_FOCUS_MS = 700;
/** A lens key's side, px (phone.css). */
const SAT_PX = 40;
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
  /** Exit session, confirmed (the shell's `exitSession`), and the live run for its rating. */
  exit(): void;
  runs?: Pick<LiveRuns, 'anchor' | 'chain' | 'saveChain'> | undefined;
  /** The menu closed back to the game. */
  onMenuClose?(): void;
  /**
   * Stage 53 (ADR 0138): the command line as the keyboard of our own
   * types in it. That keyboard is the layout's only one.
   */
  ownKeyboard: PhoneCommandLine;
  /**
   * Automatic login for the session (ADR 0141; auto-login.ts): the session
   * and the bus it follows. Absent: none (unit tests of the layer).
   */
  autoLogin?: AutoLoginDeps | undefined;
  /**
   * The device is a tablet (ADR 0140; `device().tablet`, handed in as the
   * rest of the app is): its stored settings are never given the phone's
   * one-time defaults. Absent: a phone.
   */
  tablet?: boolean;
}

/** A drag of the lens while the finger is down (`PhoneLayer.dragLens`). */
interface LensDragState {
  /** The lens's box when the drag began, and where it is shown now. */
  spot: LensSpot;
  now: LensSpot;
  /** A resize: the diameter the finger last asked for (null: none yet, or a move). */
  size: number | null;
  /** The room and the layer's size on the layout the drag began on, and the layer's place in the window. */
  room: LensRoom;
  W: number;
  H: number;
  x: number;
  y: number;
  /** The orientation whose wanted values the drop writes. */
  orient: 'portrait' | 'landscape';
  /**
   * The centre a resize keeps, as shares of the screen: the stored wanted
   * place, or (`placed` false: none is stored) the place the lens is shown
   * at, which the resize's drop then stores with the size.
   */
  placed: boolean;
  centre: { x: number; y: number };
  /** The map pane's shift at the start (`shiftMap`). */
  shift: { dx: number; dy: number };
}

/** A place as stored: a share of the screen, four decimals (under a tenth of a px). */
const lensShare = (v: number): number => Math.round(Math.max(0, Math.min(1, v)) * 10000) / 10000;

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
  /** Automatic login for the session (ADR 0141), where the shell gave the session for it. */
  private autoLogin: AutoLogin | null = null;
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
  /** The lens's box on screen as of the last layout (null: hidden). */
  private lensSpot: LensSpot | null = null;
  /** What the answer of `lensFit` depends on besides the layout, as last told to the cockpit ('': no one to ask). */
  private lensFitSig = '';
  /** What an open hot key box takes from the bottom edge, as of the last `askLens` (the lens's room ends above it). */
  private lensBoxClear = 0;
  /** The map pane's shift from its cells to the lens's centre, as last written (`shiftMap`). */
  private mapShift = '';
  /** A finger is dragging the lens (round 53k): where it started from and where the lens is shown meanwhile. */
  private lensDrag: LensDragState | null = null;
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
  /** Which open parts the last layout left out for the hot key box, as `strip|comm` (their keys stay lit). */
  private outSig = 'false|false';
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
  /** A key was pressed: the vibration, while it is on. */
  private readonly buzz: () => void;
  /** The fight card is wanted (`phone.fightCard`): off, nothing of the card is computed or shown. */
  private fightOn = true;
  /** The card on screen (null: no fight) and its signature. */
  private card: FightCard | null = null;
  private sig = '';
  /** The keyboard of our own (ADR 0138; null once disposed), whether it is open, and its readout's redraw. */
  private okb: OwnKeyboard | null = null;
  private okbOpen = false;
  private okbReadout: (() => void) | null = null;
  private okbLayout: OkbLayout = 'en';
  /** While it is open: what it takes from the bottom edge on screen, px (the compass and the hot keys stand on it in portrait). */
  private okbLift = 0;
  /** While it is open: the hot key columns have no room beside or above it, and (portrait) the compass stands above it. */
  private okbNoK = false;
  private okbPad = false;
  /** While it is open: its height on screen in either shape, px (the hot key box stands above it). */
  private okbBandLift = 0;
  /** The field it types in, other than the command line (Comm's reply or search, the hot key box, a script pane's); null: the command line. */
  private okbField: TextField | null = null;
  private okbFieldTarget: OkbTarget | null = null;
  /** The command line as a target without a history (a password prompt: the arrows are dimmed). */
  private okbLineBare: OkbTarget | null = null;
  /** While a field other than the command line is the target: the observer that tells when it goes away (`watchOkbField`). */
  private okbFieldWatch: MutationObserver | null = null;
  /** The layout named in `?kbd=sv|en` (it wins over the setting), or null. */
  private okbAsked: OkbLayout | null = null;
  /** Ends the wait of `swallowClick`, when one is on. */
  private swallowOff: (() => void) | null = null;
  /** The key size the limit of `setPhoneLimit` was last made for. */
  private limitPx = 0;
  /** How the layer's parts were last arranged for it (nothing is restyled for the same). */
  private okbSig = '';

  constructor(deps: PhoneLayerDeps) {
    this.deps = deps;
    const cockpit = deps.cockpit;
    const doc = cockpit.el.ownerDocument;
    this.el = doc.createElement('div');
    this.el.className = 'wc-ph-layer';
    this.fight = new FightCardView(doc);
    this.fightOn = deps.settings.get().phone.fightCard;
    // A press on a key (ADR 0138 §7): one short vibration while the setting is on. Called in the
    // pointer's own handler by the keys, and from the hold's timer by the lens (`arm`, while the
    // finger is still down).
    const buzz = (): void => {
      if (deps.settings.get().phone.vibrate) pulse(doc.defaultView?.navigator);
    };
    this.buzz = buzz;
    const compass = new Compass(doc, (cmd) => this.send(cmd), buzz);
    const kit = phoneKit();
    this.map = cockpit.pane('map') as unknown as MapPane;
    this.mapEl = cockpit.pane('map').el;
    this.lens = new LensView(doc, {
      onLevel: () => this.zoomLens(),
      drag: {
        // The resize is armed: one short vibration, while the setting is on.
        arm: buzz,
        drag: (kind, x0, y0, x, y) => this.dragLens(kind, x0, y0, x, y),
        drop: (kind, cancelled) => this.dropLens(kind, cancelled),
      },
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
      onPress: buzz,
      // A key of our keyboard is outside the box, and types in it.
      keepsBox: (t) => this.okb?.el.contains(t) ?? false,
      boxFits: () => this.boxFits(),
      onBox: (open, by) => {
        // Closed by a press on the key of a part the box has out (Comm's key, the panes' key): that
        // press only closes the box. The part comes back, still open; the key's own action (which
        // would close it for real) is passed over.
        if (!open) {
          const out = cockpit.phoneGameLayout?.hidden;
          const key = by?.target instanceof Element ? by.target.closest<HTMLElement>('.wc-ph-sat')?.dataset.sat : undefined;
          if (out && ((key === 'comm' && out.comm) || (key === 'panes' && out.strip))) this.swallowClick();
        }
        // What was taken out of the layout for the box comes back with its closing (`planBox`),
        // in the one layout that also folds the keyboard below.
        if (!open) cockpit.setPhoneHide(null);
        // A held key folds the keyboard (the box opens where the keys stood); a tap in one of the
        // box's fields then opens it again for that field, with the box staying.
        if (open && this.okbOpen) {
          this.closeOwnKeyboard();
          this.swallowClick();
        }
        if (open) this.markOwnFields();
        // The box closed (Save, Cancel, a press outside it) while the keyboard typed in it: the
        // keyboard closes with it, back to how the screen was before the box. Not when the press
        // that closed it is on another field of ours: that field takes the keyboard over.
        if (!open && this.okbOpen && this.okbField !== null && this.hot.ownsField(this.okbField)) {
          const on = by?.target instanceof Element ? by.target : null;
          if (on && this.ownTapTarget(on)) this.setOkbField(null);
          else this.closeOwnKeyboard();
        }
        this.syncBox();
        // Landscape: the lens's key row gives way to an open box (`place`), also when the lens was
        // hidden already and the cockpit has nothing new to lay out.
        if (this.landscape) this.place();
      },
    });
    // The K key takes the compass's free cell, left of N.
    compass.el.prepend(this.hot.kEl);
    this.el.append(this.strip.el, this.stripBand.el, this.fight.el, this.commBand.el, this.sideBand.el, this.lens.el, this.lens.rowEl, this.hot.el, this.hot.boxEl, compass.el);
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
        // Your HP comes with `char`, the fight and the members with `group`. With the card
        // switched off (`phone.fightCard`) nothing of it runs.
        if (!this.fightOn) return;
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
        if (next.phone.fightCard !== prev.phone.fightCard) {
          this.fightOn = next.phone.fightCard;
          this.syncFight();
        }
        if (next.phone.keyboard.digits !== prev.phone.keyboard.digits) this.syncOwnDigits();
        if (next.phone.keyboard.layout !== prev.phone.keyboard.layout) this.syncOwnLayout();
      }),
      // A script pane came, went or was renamed: the strip's pages follow.
      cockpit.onScriptPanes(() => {
        this.syncPages();
        this.markOwnFields();
      }),
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
    this.mountOwnKeyboard(doc, deps.ownKeyboard);
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
      // Never on a tablet (ADR 0140): what it has stored is kept as it is.
      const once = phoneDefaultsAtStart(deps.settings.get(), deps.settings.isSafe, deps.tablet === true);
      if (once) deps.settings.update(once);
    });
    this.syncPages();
    this.syncHotkeys();
    this.syncLens();
    this.syncFight();
    this.place();
    // Automatic login for the session (ADR 0141): the question's card is the layer's, the rest is
    // the controller's. LAST in the constructor: a layer whose mount throws (the shell then has no
    // layer to dispose) must not leave a listener on the session's login prompts or on the bus.
    if (deps.autoLogin && win) {
      const auto = new AutoLogin(deps.autoLogin, { el: this.el, notice: deps.notice, placed: () => this.placeLoginAsk(), win });
      this.autoLogin = auto;
      this.unsubs.push(() => auto.dispose());
    }
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

  // ---------------------------------------------- own keyboard (ADR 0138, 53a)

  /** True while the keyboard of our own is open (`html.wc-okb`). */
  get ownKeyboardOpen(): boolean {
    return this.okbOpen;
  }

  /**
   * The keyboard of our own for the game layout's text fields, the only one there.
   * The fields ask the device for no keyboard; a pointer on one opens ours
   * for it:
   *
   * - a tap, at its click (the last event of the tap: the field has the
   *   focus by then, and the relayout that moves the rows cannot change
   *   what the rest of the tap hits);
   * - a focus that comes while a pointer is down or just after (a long
   *   press focuses the field and offers paste, with no click; a key that
   *   focuses a field, as Comm's search key does).
   *
   * The fields are the command line (its own target, from the shell) and
   * every text field in a pane or in the hot key box (`ownField`: Comm's
   * reply and search, the box's Label and Command, a script pane's
   * fields), each through an adapter over its element (keyboard-fields.ts).
   * While the keyboard is open its target follows the focus among them.
   * A focus without a pointer (a physical keyboard's key) opens nothing.
   * A text field that is none of them taking the focus closes ours, so it
   * never stands together with the device's; no such field is in the game
   * layout itself (the menu's pages and frames are outside it and close
   * ours when they open).
   */
  private mountOwnKeyboard(doc: Document, line: PhoneCommandLine): void {
    const { cockpit, settings } = this.deps;
    const win = doc.defaultView;
    const asked = okbFromQuery(new URLSearchParams(win?.location?.search ?? '').get('kbd'));
    this.okbAsked = asked.layout;
    this.okbLayout = this.wantedLayout();
    this.okbLineBare = { insert: (t) => line.insert(t), deleteBack: () => line.deleteBack(), submit: () => line.submit(), focus: () => line.focus(), blur: () => line.blur() };
    const okb = new OwnKeyboard(
      doc,
      {
        target: () => this.okbTarget(),
        fold: () => this.closeOwnKeyboard(),
        toggleDigits: () => settings.update({ phone: { keyboard: { digits: !settings.get().phone.keyboard.digits } } }),
        onPress: this.buzz,
      },
      this.okbLayout,
      settings.get().phone.keyboard.digits,
    );
    this.okb = okb;
    this.el.append(okb.el);
    line.setOwnKeyboard(true);
    // The field is 44 px high whatever the font size setting: its text has a size of its own (phone.css).
    line.setOwnFont(true);
    this.markOwnFields();
    const wrap = cockpit.inputEl.querySelector<HTMLElement>('.wc-input-wrap');
    const clock = (): number => win?.performance.now() ?? Date.now();
    // A pointer on the command field, and one anywhere in the cockpit (the other fields: a key
    // may focus them), each with when it was last seen.
    let lineDown = false;
    let lineAt = -Infinity;
    let anyDown = false;
    let anyAt = -Infinity;
    const onTap = (): void => this.openOwnKeyboard();
    const onLineDown = (): void => {
      lineDown = true;
      lineAt = clock();
    };
    const onDown = (e: Event): void => {
      anyDown = true;
      anyAt = clock();
      // Before the focus the press brings: the field under it, and the fields of its pane (a
      // script pane's link may focus one of them), ask for no keyboard.
      const t = e.target instanceof Element ? e.target : null;
      const pane = t?.closest('.wc-pane');
      if (pane) for (const f of pane.querySelectorAll<HTMLElement>('input, textarea')) if (this.ownField(f)) markField(f);
    };
    const onUp = (): void => {
      const now = clock();
      if (lineDown) lineAt = now;
      if (anyDown) anyAt = now;
      lineDown = anyDown = false;
    };
    const onFocus = (e: FocusEvent): void => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (wrap?.contains(t)) {
        if (lineDown || clock() - lineAt < OKB_POINTER_FOCUS_MS) this.openOwnKeyboard();
        // Open for another field: the keys follow the focus to the line.
        else if (this.okbOpen) this.setOkbField(null);
        return;
      }
      const f = this.ownField(t);
      if (f) {
        markField(f);
        if (this.okbOpen) this.setOkbField(f);
        else if (anyDown || clock() - anyAt < OKB_POINTER_FOCUS_MS) this.openOwnKeyboard(f);
        return;
      }
      // Not ours (none is known in the game layout; a guard for a field added later without its
      // mark, which would get the device's keyboard): the field keeps its focus, ours gives way.
      if (this.okbOpen && isTextField(t) && !isMarked(t)) this.closeOwnKeyboard(false);
    };
    // A tap on a field of ours that has the focus already (in the capture phase: the box keeps its clicks).
    const onClick = (e: Event): void => {
      const f = e.target instanceof HTMLElement ? this.ownField(e.target) : null;
      if (f) this.openOwnKeyboard(f);
    };
    wrap?.addEventListener('click', onTap);
    wrap?.addEventListener('pointerdown', onLineDown);
    cockpit.el.addEventListener('pointerdown', onDown, true);
    cockpit.el.addEventListener('click', onClick, true);
    doc.addEventListener('pointerup', onUp, true);
    doc.addEventListener('pointercancel', onUp, true);
    doc.addEventListener('focusin', onFocus);
    // The password prompt came or went: the arrows are dimmed there.
    const offMode = line.onChange(() => this.okb?.sync());
    // The readout is a diagnostic: only with `?kbd=1` or `?kbd=debug`.
    const readout = win && asked.readout ? installKeyboardReadout(win, () => this.okbOpen) : null;
    this.okbReadout = readout?.draw ?? null;
    this.unsubs.push(() => {
      wrap?.removeEventListener('click', onTap);
      wrap?.removeEventListener('pointerdown', onLineDown);
      cockpit.el.removeEventListener('pointerdown', onDown, true);
      cockpit.el.removeEventListener('click', onClick, true);
      doc.removeEventListener('pointerup', onUp, true);
      doc.removeEventListener('pointercancel', onUp, true);
      doc.removeEventListener('focusin', onFocus);
      offMode();
      this.okbFieldWatch?.disconnect();
      this.okbFieldWatch = null;
      this.swallowOff?.();
      this.closeOwnKeyboard(false);
      line.setOwnKeyboard(false);
      line.setOwnFont(false);
      for (const f of cockpit.el.querySelectorAll<HTMLElement>('.wc-pane [inputmode="none"], .wc-ph-rb [inputmode="none"]')) {
        f.removeAttribute('inputmode');
        f.removeAttribute('virtualkeyboardpolicy');
      }
      readout?.dispose();
      okb.dispose();
      this.okb = null;
    });
  }

  /** Closes the game layout's keyboard (the shell: the pages' keyboard came up over the game, ADR 0139 §2). */
  foldOwnKeyboard(): void {
    this.closeOwnKeyboard(false);
  }

  /** The layout now: the one named in `?kbd=`, else the setting, where `auto` is the browser's language. */
  private wantedLayout(): OkbLayout {
    const nav = this.el.ownerDocument.defaultView?.navigator;
    const set = this.deps.settings.get().phone.keyboard.layout;
    return okbLayout(this.okbAsked ?? (set === 'auto' ? null : set), nav?.languages?.length ? nav.languages : nav?.language);
  }

  /** The layout's setting changed: the keys, and their place (Swedish has a key more per row). */
  private syncOwnLayout(): void {
    if (!this.okb) return;
    const next = this.wantedLayout();
    if (next === this.okbLayout) return;
    this.okbLayout = next;
    this.okb.setLayout(next);
    if (this.okbOpen) this.place();
  }

  /**
   * `el` as a field of the game layout our keyboard types in, or null: a
   * plain text field in a pane (Comm, a script pane) or in the hot key box.
   * Not the command line (it has its own target), and nothing of the menu's
   * sheet and pages.
   */
  private ownField(el: Element): TextField | null {
    if (!this.okb || !isOwnableField(el)) return null;
    if (!this.deps.cockpit.el.contains(el) || this.deps.cockpit.inputEl.contains(el)) return null;
    return el.closest('.wc-pane, .wc-ph-rb') ? el : null;
  }

  /** Whether a press on `el` is one that gives the keyboard a target of ours (the command field, or a field of `ownField`). */
  private ownTapTarget(el: Element): boolean {
    return this.deps.cockpit.inputEl.querySelector('.wc-input-wrap')?.contains(el) === true || this.ownField(el) !== null;
  }

  /** Marks the fields of `ownField` there are now (at mount, when the box opens, when a script pane comes): they ask the device for no keyboard. */
  private markOwnFields(): void {
    if (!this.okb) return;
    for (const f of this.deps.cockpit.el.querySelectorAll<HTMLElement>('.wc-pane input, .wc-pane textarea, .wc-ph-rb input')) if (this.ownField(f)) markField(f);
  }

  /** What the keys type into now: the field it was opened for while that is still on screen, else the command line (without a history at a password prompt). */
  private okbTarget(): OkbTarget | null {
    const line = this.deps.ownKeyboard;
    if (this.okbField !== null) this.dropGoneField();
    if (this.okbFieldTarget) return this.okbFieldTarget;
    return line.hasHistory() ? line : this.okbLineBare;
  }

  /** Points the keys at `field` (null: the command line). Comm keeps its rows while one of its fields is typed in. */
  private setOkbField(field: TextField | null): void {
    if (field === this.okbField) return;
    this.okbField = field;
    this.watchOkbField(field);
    this.okbFieldTarget = field ? fieldTarget(field, this.fieldSubmit(field)) : null;
    this.deps.cockpit.setPhoneCommKeep(field !== null && this.deps.cockpit.pane('comm').el.contains(field));
    this.okb?.sync();
    this.okbReadout?.();
  }

  /**
   * Follows the field the keys type in, so one that goes away is dropped at
   * once (`dropGoneField`), not at the next key press: Comm or its search
   * closed, Comm left with no rows on a short screen, the strip's page
   * changed, a script pane's field taken away. (`okbTarget` asks too,
   * whenever the keys are drawn or pressed; a field hidden with no layout
   * and no key, as Comm's search is, is told only here.)
   * One observer while such a field is the target, on its ancestors up to
   * the cockpit: their own attributes (`hidden`, a pane's placing, Comm's
   * `data-search`) and their own children (the field, or the part it is
   * in, taken out). Those change when a surface opens, closes or is laid
   * out; the game text is no ancestor of such a field, so nothing of it
   * runs per line or per frame, and nothing at all while the command line
   * is the target.
   */
  private watchOkbField(field: TextField | null): void {
    this.okbFieldWatch?.disconnect();
    this.okbFieldWatch = null;
    const MO = this.el.ownerDocument.defaultView?.MutationObserver;
    if (!field || !MO) return;
    const mo = new MO(() => this.dropGoneField());
    const top = this.deps.cockpit.el;
    mo.observe(field, { attributes: true, attributeFilter: ['hidden', 'disabled', 'readonly', 'style', 'class'] });
    // (One `observe` per node: a second one on the same node would replace the first's options.)
    for (let el = field.parentElement; el && el !== top; el = el.parentElement) mo.observe(el, { attributes: true, childList: true });
    // A pane taken out of the cockpit whole (a script switched off).
    mo.observe(top, { childList: true });
    this.okbFieldWatch = mo;
  }

  /**
   * The field the keys type in is no longer on screen: the keys go back to
   * the command line at once (the arrows are lit again, Comm no longer
   * keeps its rows), and so does the focus when no other field took it.
   */
  private dropGoneField(): void {
    const field = this.okbField;
    if (field === null || fieldUsable(field)) return;
    this.setOkbField(null);
    if (!this.okbOpen) return;
    // The caret goes with the keys (a key press would bring it there anyway), unless another
    // field of ours has the focus: the keys then follow that one (`onFocus`).
    const active = this.el.ownerDocument.activeElement;
    if (active && active !== field && this.ownField(active) !== null && fieldUsable(active as TextField)) return;
    this.deps.ownKeyboard.focus();
  }

  /**
   * Enter in a field, as its owner has it: Comm's reply line sends; the hot
   * key box saves; a script pane's field is submitted to its script, and
   * the keys go back to the command line (as the focus does on a computer).
   * Comm's search has no Enter action, nor has a field we do not know.
   */
  private fieldSubmit(field: TextField): { submit?: () => void } {
    if (field.classList.contains('wc-cm-rinput')) return { submit: () => this.comm.submitReply() };
    if (this.hot.ownsField(field)) {
      return {
        submit: () => {
          // Enter acts on the press: a saved box closes, and the keyboard with it, under a finger
          // that is still down. Its release must not end as a tap on what then lies there (in
          // landscape the command field, which would open the keyboard again).
          const held = this.okb?.held ?? false;
          this.hot.saveBox();
          if (held && !this.okbOpen) this.swallowClick();
        },
      };
    }
    if (field.classList.contains('wc-spane-field')) {
      return {
        submit: () => {
          for (const p of this.deps.cockpit.scriptPanes()) {
            const pane = this.deps.cockpit.pane(p.id as PaneId) as unknown as ScriptPane;
            if (pane.el.contains(field) && pane.submitField(field)) break;
          }
          if (this.okbField !== field) return;
          this.setOkbField(null);
          this.deps.ownKeyboard.focus();
        },
      };
    }
    return {};
  }

  /**
   * Opens the keyboard of our own for `field` (null: the command line; a
   * pointer on the field) and leaves the field focused, so its caret shows.
   * It takes fixed rows at the bottom from the cockpit's allocator: the
   * page keeps its size, the command row moves up to stand on the keyboard,
   * and MUME gets one new window size. The band and what stands beside or
   * above it are placed once the cockpit has laid its rows out
   * (`placeOwnKeyboard`). Open already, only the target changes.
   */
  private openOwnKeyboard(field: TextField | null = null): void {
    const line = this.deps.ownKeyboard;
    if (!this.okb || this.deps.cockpit.phoneGameLayout?.tooSmall) return;
    // A screen too low for it (a split screen, a window made lower): the tap opens nothing. The
    // same sum the layout would close it by (`placeOwnKeyboard`), asked before anything moves.
    if (!this.okbOpen && !this.ownKeyboardFits()) {
      // (As when a layout closes it: the field does not stay focused with no keyboard to type with.)
      (field ?? line).blur();
      return;
    }
    // One of the box's fields on a screen where the box has no room above our keyboard whatever is
    // taken out (below the target sizes: 320 × 480 in a fight, where the card and the game text
    // stay): the box stays as it is and the keyboard is refused, with nothing laid out. (Opening it
    // would close the box in the next layout and the keyboard with it: two window sizes for nothing.)
    if (!this.okbOpen && field !== null && this.hot.ownsField(field) && this.hot.boxOpen && this.boxPlan(true) === null) {
      // (`boxPlan` laid the box out where it tried: back to where it stands.)
      this.syncBox();
      field.blur();
      return;
    }
    this.setOkbField(field);
    // The hot key box stays while one of its fields is typed in; for any other field it gives
    // way, unsaved. (After the target: its closing then asks nothing of the keyboard.)
    if (field === null || !this.hot.ownsField(field)) this.hot.closeBox();
    (this.okbFieldTarget ?? line).focus();
    if (this.okbOpen) return;
    // One of the box's fields: what is above the game text and would lie under the box, once the
    // keyboard has lifted it, is taken out in the same layout that opens the keyboard (`planBox`).
    if (field !== null && this.hot.ownsField(field) && this.hot.boxOpen) this.planBox(true);
    this.okbOpen = true;
    this.el.ownerDocument.documentElement.classList.add('wc-okb');
    this.reserveOwnKeyboard();
    this.okbReadout?.();
  }

  /**
   * The keyboard's height for a shape and a height of the cockpit, as the
   * cockpit asks for it: at a tablet's sizes on a tablet-size window
   * (ADR 0140; the cockpit's width as it is now is the other side).
   */
  private okbHeight(digits: boolean): (landscape: boolean, height: number) => number {
    return (landscape, height) => okbHeightPx(landscape, height, digits, false, okbTabletSize(this.deps.cockpit.el.clientWidth, height));
  }

  /** Whether the screen as it is now has the rows for the keyboard: each of its rows at least `OKB_ROW_LEAST` high. */
  private ownKeyboardFits(): boolean {
    const digits = this.deps.settings.get().phone.keyboard.digits;
    const lift = this.deps.cockpit.phoneBottomLift(this.okbHeight(digits));
    return lift > 0 && (lift - 2 * OKB_PAD_Y) / okbRowCount(digits) >= OKB_ROW_LEAST;
  }

  /** What the keyboard asks of the cockpit as it stands now: its height for a shape, and whether the px it is given are enough. */
  private okbAsk(): { bottom: (landscape: boolean, height: number) => number; fits: (lift: number) => boolean } {
    const digits = this.deps.settings.get().phone.keyboard.digits;
    return {
      bottom: this.okbHeight(digits),
      // (The same sum as `ownKeyboardFits`: the cockpit leaves the rows out in the layout that finds them too low.)
      fits: (lift) => (lift - 2 * OKB_PAD_Y) / okbRowCount(digits) >= OKB_ROW_LEAST,
    };
  }

  /** Asks the cockpit for the keyboard's rows as it stands now (a new function is a new height: one layout). */
  private reserveOwnKeyboard(): void {
    const ask = this.okbAsk();
    this.deps.cockpit.setPhoneBottom(ask.bottom, ask.fits);
  }

  /** The digit row was folded up or down (its key; the stored setting): the keys, and one new height for the cockpit. */
  private syncOwnDigits(): void {
    if (!this.okb) return;
    this.okb.setDigits(this.deps.settings.get().phone.keyboard.digits);
    if (this.okbOpen) this.reserveOwnKeyboard();
  }

  /** Closes it (the fold key, the menu, the hot key box, a field that is not ours, a screen too small) and, as a rule, blurs the field it typed in. One new window size for MUME. */
  private closeOwnKeyboard(blur = true): void {
    if (!this.okbOpen) return;
    this.okbOpen = false;
    this.el.ownerDocument.documentElement.classList.remove('wc-okb');
    this.okb?.place(null);
    this.arrangeOwnKeyboard(null);
    this.deps.cockpit.setPhoneBottom(null);
    const typed = this.okbFieldTarget ?? this.deps.ownKeyboard;
    // The next opening starts from the field that is tapped then.
    this.setOkbField(null);
    if (blur) typed?.blur();
    // An open box stands beside the keys again, and what was taken out for it with the keyboard
    // up comes back where the box leaves it room (in this same layout).
    if (this.hot.boxOpen) {
      this.planBox(false);
      this.syncBox();
    }
    this.okbReadout?.();
  }

  /**
   * Places the open keyboard after a layout: the band on the rows the
   * allocator kept, from under the command row to the bottom edge, and the
   * block in it.
   *
   * - Portrait: the block over the full width (capped per key; on a
   *   tablet-size window with a margin at each side). The compass
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
    // The columns the K key shows (hidden: none, and no width for them).
    const kOn = !this.hot.el.hidden;
    // A tablet-size window (ADR 0140): the block uses the width, with larger keys.
    const tablet = okbTabletSize(W, H);
    if (g.landscape) {
      // A band lower than three large keys and their gaps (a screen 300 to some 312 px high): the
      // small keys in it, so the compass does not stand out over the band's top edge.
      const px = lift < 3 * this.keyPx + 2 * KEY_GAP ? Math.min(this.keyPx, KEY_PX_PORTRAIT) : this.keyPx;
      const band = okbBand({ width: W, layout: this.okbLayout, keyPx: px, keyGap: KEY_GAP, kLeft: kOn ? this.hot.rowsIn(0) : 0, kRight: kOn ? this.hot.rowsIn(1) : 0, tablet });
      okb.place({ top, left: band.x, width: band.w, tablet });
      this.arrangeOwnKeyboard({ lift, band: true, pad: band.pad, k: !band.droppedK, kLeftX: band.kLeftX, kRightX: band.kRightX, ck: px === this.keyPx ? null : px });
    } else {
      const px = this.keyPx;
      const width = okbPortraitWidth(W, this.okbLayout, tablet);
      okb.place({ top, left: (W - width) / 2, width, tablet });
      // (The same sum as the limit the cockpit laid these rows out with: `limitFor`.)
      const side = okbPortraitSide(top, compassHeight(px), hotTop(px, 3));
      // Comm typed in on a short screen reaches under the columns' place (`overLimit`): they give way.
      this.arrangeOwnKeyboard({ lift, band: false, pad: side.pad, k: side.k && !g.overLimit, kLeftX: null, kRightX: null, ck: null });
    }
  }

  /**
   * The limit the strip, the fight card and Comm stay above, for keys of
   * `px` (`Cockpit.setPhoneLimit`): the top of the place of three hot keys,
   * counted from the keyboard's top edge while it is open. The cockpit asks
   * at each layout with the keyboard's lift, so whether the columns have
   * room above the keyboard (`okbPortraitSide`: none on a low screen, and
   * then no limit) is settled before the rows are laid out: the keyboard's
   * opening, and its digit row, are one layout and one window size.
   */
  private limitFor(px: number): PhoneLimit {
    return (lift, height) => (lift > 0 && !okbPortraitSide(height - lift, compassHeight(px), hotTop(px, 3)).k ? null : topLimit(px));
  }

  /**
   * The layer's parts for the open keyboard (phone.css reads these), or as
   * without it (null): `--okb-lift` (the keyboard's height on screen),
   * `data-okb` (`up`: portrait, the keys lifted; `band`: landscape, the keys
   * beside the block at `--okb-k1-x` / `--okb-k4-x`), `data-okb-nopad` and
   * `data-okb-nok` (no room), `html.wc-okb-wide` while the compass is
   * not at the command row's end (the field then takes the full width),
   * `--ph-ck` on the layer for a low band's small keys, and `--wc-okb-h` on
   * the page for the ground under the safe area. Restyled only on a change;
   * nothing here asks the cockpit for a layout.
   */
  private arrangeOwnKeyboard(a: { lift: number; band: boolean; pad: boolean; k: boolean; kLeftX: number | null; kRightX: number | null; ck: number | null } | null): void {
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
    // The keys' size in a low band (on the layer: only its own parts follow; the cockpit's stays).
    set('--ph-ck', a ? px(a.ck) : '');
    // The keyboard's ground reaches out into the screen's safe area (phone.css, on `#app`).
    const root = el.ownerDocument.documentElement;
    if (a) root.style.setProperty('--wc-okb-h', px(a.lift));
    else root.style.removeProperty('--wc-okb-h');
    if (a) el.dataset.okb = a.band ? 'band' : 'up';
    else delete el.dataset.okb;
    el.toggleAttribute('data-okb-nopad', a !== null && !a.pad);
    el.toggleAttribute('data-okb-nok', a !== null && !a.k);
    el.ownerDocument.documentElement.classList.toggle('wc-okb-wide', a !== null && (a.band || !a.pad));
    this.okbLift = a && !a.band ? a.lift : 0;
    this.okbBandLift = a ? a.lift : 0;
    this.okbNoK = a !== null && !a.k;
    this.okbPad = a !== null && a.pad;
  }

  /**
   * The keyboard closed under a finger that is still down (a held hot key):
   * the rows moved, and the finger's release must not end as a tap on what
   * now lies under it (the command field, which would open the keyboard
   * again; the menu key). The click that follows is dropped; the next press
   * ends the wait, so no later tap is lost.
   */
  private swallowClick(): void {
    // (One wait at a time; the layer's end takes the one that is on: `swallowOff`.)
    this.swallowOff?.();
    const doc = this.el.ownerDocument;
    const stop = (e: Event): void => {
      e.stopPropagation();
      e.preventDefault();
      done();
    };
    const done = (): void => {
      doc.removeEventListener('click', stop, true);
      doc.removeEventListener('pointerdown', done, true);
      if (this.swallowOff === done) this.swallowOff = null;
    };
    doc.addEventListener('click', stop, true);
    doc.addEventListener('pointerdown', done, true);
    this.swallowOff = done;
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
      height: el.clientHeight,
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
      clearAlways: (this.lensBoxClear = this.boxClear()),
    });
    // A lens the user moved or resized is placed by `lensFit`: the cockpit asks it at every layout,
    // and is told (one layout) when something else its answer depends on changed.
    const l = this.deps.settings.get().phone.lens;
    const sig = lensIsSet(l.portrait) || lensIsSet(l.landscape) ? JSON.stringify([l.portrait, l.landscape, this.lensFull, this.keyPx, this.hot.cols, this.hot.rows, this.deps.settings.get().phone.hotkeysOpen, this.lensBoxClear]) : '';
    if (sig === this.lensFitSig) return;
    this.lensFitSig = sig;
    this.deps.cockpit.setPhoneLensFit(sig ? this.lensFit : null);
  }

  /**
   * The room of a moved or resized lens on the layout `g` (lens-place.ts
   * `lensRoom`): under what is above the game text, right of the landscape
   * column, above the command row and an open hot key box, clear of the
   * compass and the hot key columns where they stand now (lifted by our
   * keyboard in portrait, or gone where they have no room above it: the
   * same sum as `placeOwnKeyboard`).
   */
  private roomOn(g: NonNullable<Cockpit['phoneGameLayout']>, cell: { w: number; h: number }, W: number, H: number): LensRoom {
    const px = this.keyPx;
    const foot = (g.input.y + g.input.h) * cell.h;
    const lift = g.bottom > 0 ? H - foot : 0;
    const side = lift > 0 && !g.landscape ? okbPortraitSide(foot, compassHeight(px), hotTop(px, 3)) : { pad: true, k: true };
    return lensRoom({
      W,
      H,
      landscape: g.landscape,
      gameTop: g.game.y * cell.h,
      gameLeft: g.game.x * cell.w,
      inputTop: g.input.y * cell.h,
      lift,
      keyPx: px,
      hotCols: this.hot.cols,
      hotRows: this.deps.settings.get().phone.hotkeysOpen ? this.hot.rows : 0,
      pad: side.pad,
      k: side.k && !g.overLimit,
      boxClear: this.lensBoxClear,
    });
  }

  /**
   * The cockpit's question at every layout (`Cockpit.setPhoneLensFit`):
   * where a lens the user moved or resized in this orientation is shown.
   * Derived from the stored wanted place and size and the room on this
   * layout, never written back: pushed by the panes it moves and shrinks,
   * with no room it hides, and with the room back it is where it was
   * dropped at the size it was given. Undefined: never moved or resized
   * here, the allocator's place stands.
   */
  private readonly lensFit: PhoneLensFit = (g, cell, W, H) => {
    const st = this.deps.settings.get().phone.lens[g.landscape ? 'landscape' : 'portrait'];
    if (!lensIsSet(st) || this.lensFull === 0) return undefined;
    const room = this.roomOn(g, cell, W, H);
    return fitLens(lensWant(st, this.lensFull, room, W, H), room, LENS_MIN_PX);
  };

  /**
   * The finger drags the lens (lens.ts `LensDrag`; once per frame). Nothing
   * here asks the cockpit for a layout, and no window size goes out: the
   * lens's dressing and the map pane follow by `translate` (a move) and the
   * map pane by `scale` (a resize: the map's picture is scaled, and drawn
   * anew at the new size once, after the drop). The room is the one of the
   * layout the drag began on.
   *
   * - A move carries the box with the finger, inside the room's rectangle.
   * - A resize keeps the wanted centre (of a lens never moved: the centre
   *   it is shown at, so it does not jump as the resize begins) and changes
   *   the diameter by twice what the finger moved away from (or towards)
   *   the lens's centre; the box is fitted as the layout will fit it, so
   *   what shows while the finger is down is what the drop gives. More
   *   than fits there gives the largest size that does.
   */
  private dragLens(kind: 'move' | 'size', x0: number, y0: number, x: number, y: number): void {
    const d = this.lensDrag ?? this.grabLens();
    if (!d) return;
    let to: LensSpot | null;
    if (kind === 'move') to = moveLens(d.spot, x - x0, y - y0, d.room);
    else {
      const cx = d.x + d.spot.left + d.spot.size / 2;
      const cy = d.y + d.spot.top + d.spot.size / 2;
      const size = resizeLens(d.spot.size, Math.hypot(x0 - cx, y0 - cy), Math.hypot(x - cx, y - cy), LENS_MIN_PX, lensMax(d.room));
      to = fitLens({ cx: d.centre.x * d.W, cy: d.centre.y * d.H, size }, d.room, LENS_MIN_PX);
      // Asked for more than fits there: the largest that does is what is shown, and what is stored.
      if (to) d.size = to.size;
    }
    if (!to) return;
    d.now = to;
    const dx = to.left + to.size / 2 - (d.spot.left + d.spot.size / 2);
    const dy = to.top + to.size / 2 - (d.spot.top + d.spot.size / 2);
    if (kind === 'move') this.lens.el.style.translate = `${dx}px ${dy}px`;
    else {
      // The dressing at its real size (a small box of its own); the map's picture scaled under it.
      this.lens.place(to, null);
      this.lens.el.style.setProperty('--ph-lens-size', `${to.size}px`);
      this.mapEl.style.scale = `${to.size / d.spot.size}`;
    }
    this.mapEl.style.translate = `${d.shift.dx + dx}px ${d.shift.dy + dy}px`;
  }

  /** The drag's start: the lens's box and room on the layout on screen, and the layer's place in the window. Null: no lens to drag. */
  private grabLens(): LensDragState | null {
    const g = this.deps.cockpit.phoneGameLayout;
    const spot = this.lensSpot;
    if (!g || !spot || g.tooSmall || !g.lens) return null;
    const cell = this.deps.cells.get();
    const box = this.el.getBoundingClientRect();
    const W = this.el.clientWidth;
    const H = this.el.clientHeight;
    const orient = g.landscape ? 'landscape' : 'portrait';
    const stored = this.deps.settings.get().phone.lens[orient];
    const placed = stored.x !== null && stored.y !== null;
    this.lensDrag = {
      placed,
      centre: placed ? { x: stored.x!, y: stored.y! } : { x: lensShare((spot.left + spot.size / 2) / W), y: lensShare((spot.top + spot.size / 2) / H) },
      spot,
      now: spot,
      size: null,
      room: this.roomOn(g, cell, W, H),
      W,
      H,
      x: box.left,
      y: box.top,
      orient,
      shift: { dx: spot.left + spot.size / 2 - (g.lens.x + g.lens.w / 2) * cell.w, dy: spot.top + spot.size / 2 - (g.lens.y + g.lens.h / 2) * cell.h },
    };
    return this.lensDrag;
  }

  /**
   * The finger lifted: the place it dropped the lens at (a move: the
   * centre, as shares of the screen) or the size it gave it (a resize) is
   * stored for this orientation, and the cockpit lays out once, which puts
   * the lens and the map pane there for real and draws the map at its new
   * size. A move leaves the wanted size alone and a resize the wanted
   * place, also when the lens was shown pushed or shrunk; only the resize
   * of a lens with no wanted place stores the place it was shown at with
   * the size (the allocator's whole cells are not the room's corner, and
   * the lens would jump there at the drop). Cancelled, or an
   * armed hold released in place: nothing is stored.
   */
  private dropLens(kind: 'move' | 'size' | null, cancelled: boolean): void {
    const d = this.lensDrag;
    if (!d) return;
    this.lensDrag = null;
    if (cancelled || kind === null) {
      this.undragLens(d);
      this.place();
      return;
    }
    const want =
      kind === 'move'
        ? { x: lensShare((d.now.left + d.now.size / 2) / d.W), y: lensShare((d.now.top + d.now.size / 2) / d.H) }
        : d.size === null
          ? null
          : d.placed
            ? { size: d.size }
            : { ...d.centre, size: d.size };
    if (want) this.deps.settings.update({ phone: { lens: { [d.orient]: want } } });
    // One layout in any case (also where the stored values did not change): `place` then takes
    // the drag's transforms off. The map pane's shift is written anew whatever it comes to: the
    // drag wrote its own over it, and a lens pushed back to where it stood has the same shift
    // as before the drag.
    this.mapShift = '-';
    this.lensFitSig = '-';
    this.askLens();
  }

  /** Takes a drag's styles off the lens and the map pane (the layout's own are written by `place`). */
  private undragLens(d: LensDragState): void {
    this.lens.el.style.translate = '';
    this.mapEl.style.scale = '';
    this.lens.el.style.setProperty('--ph-lens-size', `${d.spot.size}px`);
    this.lens.place(d.spot, null);
    this.mapShift = '-';
  }

  /** Shifts the map pane from the middle of its cells to the lens's centre (a moved lens; '' for the default place). Written on a change only. */
  private shiftMap(dx: number, dy: number): void {
    const v = Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01 ? '' : `${Math.round(dx * 100) / 100}px ${Math.round(dy * 100) / 100}px`;
    if (v === this.mapShift) return;
    this.mapShift = v;
    this.mapEl.style.translate = v;
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
    // (With our keyboard open: from its top edge, and not where the columns have no room: `limitFor`.)
    if (px !== this.limitPx) {
      this.limitPx = px;
      this.deps.cockpit.setPhoneLimit(this.limitFor(px));
    }
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
   * strip's band in portrait; landscape has no such band, and they sit on
   * the column's band, where the strip's stretch of it begins
   * (`placePlates`). A low landscape screen keeps the small keys
   * (compass-size.ts).
   */
  private setShape(landscape: boolean, height: number): void {
    const first = this.keyPx === 0;
    if (!first && landscape === this.landscape && compassPx(landscape, height) === this.keyPx) return;
    this.landH = height;
    if (first || landscape !== this.landscape) {
      this.landscape = landscape;
      this.el.toggleAttribute('data-land', landscape);
      if (!landscape) this.stripBand.el.append(this.strip.dots);
    }
    if (!first) this.syncHotkeys();
  }

  /**
   * The box's foot above the layer's bottom edge: beside the column. With
   * our own keyboard open (one of the box's fields is typed in): portrait, beside
   * the column as ever, which stands lifted by the keyboard (over the
   * command row where the compass has no room); landscape, on the
   * keyboard's band, over the command row's end (the keys are in the band).
   */
  private boxBottom(): number {
    const g = this.deps.cockpit.phoneGameLayout;
    if (g && this.okbOpen && this.okbBandLift > 0) {
      if (g.landscape) return this.okbBandLift + BOX_GAP;
      return this.okbLift + (this.okbPad ? hotBottom(this.keyPx) : g.input.h * this.deps.cells.get().h + BOX_GAP);
    }
    return hotBottom(this.keyPx);
  }

  /**
   * The box's foot above the layer's bottom edge on the layout `g`, which
   * is not the one on screen (`boxPlan`): beside the column, or with our
   * keyboard open (`kbd`) where `boxBottom` has it once that layout is
   * placed (the same sums as `placeOwnKeyboard`).
   */
  private boxBottomOn(g: NonNullable<Cockpit['phoneGameLayout']>, kbd: boolean): number {
    const px = this.keyPx;
    if (!kbd || g.bottom === 0) return hotBottom(px);
    const cellH = this.deps.cells.get().h;
    const top = (g.input.y + g.input.h) * cellH;
    const lift = this.el.clientHeight - top;
    if (g.landscape) return lift + BOX_GAP;
    return lift + (okbPortraitSide(top, compassHeight(px), hotTop(px, 3)).pad ? hotBottom(px) : g.input.h * cellH + BOX_GAP);
  }

  /**
   * What must be taken out of the layout for the box to have room (round
   * 53j), with our keyboard open for one of its fields (`kbd`) or closed:
   * nothing, Comm, or Comm and the strip's pane; null when it has no room
   * even then (the fight card and the game text always stay). Portrait
   * only: in landscape the box stands right of the column whatever its
   * width (phone.css), and nothing is taken out for it.
   *
   * The order, Comm first: it is the one that tells of itself while it is
   * out (its key's badge counts what comes in), and the strip's pane (the
   * group's health, the timers) is what one glances at; Comm is also the
   * taller, so it alone is often enough.
   *
   * Asked of the cockpit as layouts that would be (`phoneGameLayoutIf`),
   * so the parts go in the very layout that opens the keyboard, and one
   * window size is sent. Lays the box out at each place it tries (the last
   * one is where it then stands).
   */
  private boxPlan(kbd: boolean): PhoneGameHide | null {
    const { cockpit } = this.deps;
    const now = cockpit.phoneGameLayout;
    const none: PhoneGameHide = { strip: false, comm: false };
    if (!now || now.landscape) return none;
    const tries: PhoneGameHide[] = [none];
    if (this.commOpen) tries.push({ strip: false, comm: true });
    if (this.stripOpen) tries.push({ strip: true, comm: this.commOpen });
    const ask = kbd ? this.okbAsk() : { bottom: null };
    for (const hide of tries) {
      const g = cockpit.phoneGameLayoutIf({ ...ask, hide });
      if (!g || g.tooSmall) return null;
      if (this.boxFitsAt(g, this.boxBottomOn(g, kbd))) return hide;
    }
    return null;
  }

  /**
   * Takes out of the layout what the box needs gone (`boxPlan`), and brings
   * back what it no longer needs gone. False when the box has no room
   * whatever is taken out: nothing is then hidden.
   */
  private planBox(kbd: boolean): boolean {
    const plan = this.boxPlan(kbd);
    this.deps.cockpit.setPhoneHide(plan);
    return plan !== null;
  }

  /** The open box lost its room on the layout `g`: takes out what `boxPlan` now finds; false when that is what is out already, or nothing helps. */
  private replanBox(g: NonNullable<Cockpit['phoneGameLayout']>): boolean {
    const plan = this.boxPlan(this.okbOpen && g.bottom > 0);
    if (plan === null || (plan.strip === g.hidden.strip && plan.comm === g.hidden.comm)) return false;
    this.deps.cockpit.setPhoneHide(plan);
    return true;
  }

  /** What an open box takes from the bottom edge (0: closed): the lens hides while it would collide. */
  private boxClear(): number {
    return this.hot.boxOpen ? this.boxBottom() + this.hot.boxEl.offsetHeight + LENS_CLEAR : 0;
  }

  /** The box opened, closed or moved: its place, then the lens's room (one layout read, on those events only). */
  private syncBox(): void {
    const g = this.deps.cockpit.phoneGameLayout;
    if (this.hot.boxOpen && g) this.placeBoxOn(g, this.boxBottom());
    this.askLens();
  }

  /**
   * Places the box with its foot at `bottom` on the layout `g`: as tall as
   * it is, or as the room up to the fight card (portrait; the card always
   * stays) or the top edge allows; its content scrolls in a lower one.
   */
  private placeBoxOn(g: NonNullable<Cockpit['phoneGameLayout']>, bottom: number): void {
    const fight = g.landscape ? 0 : g.fight.h * this.deps.cells.get().h;
    this.hot.placeBox(bottom, this.el.clientHeight - bottom - BOX_GAP - fight);
  }

  /**
   * Whether the box, laid out with its foot `bottom` px above the layer's
   * bottom edge, is clear of what is above the game text (portrait: the
   * strip, the fight card, Comm) or beside it (landscape: the left column).
   * Reads the box's laid-out size.
   */
  private boxHasRoom(g: NonNullable<Cockpit['phoneGameLayout']>, bottom: number): boolean {
    const { w, h } = this.deps.cells.get();
    if (g.landscape) return g.side.w * w <= this.hot.boxEl.offsetLeft;
    // (Portrait: it ends under the fight card, `placeBoxOn`; a box lower than its fields is none.)
    const room = this.el.clientHeight - bottom - BOX_GAP - g.fight.h * h;
    return room >= BOX_LEAST && g.game.y * h <= this.el.clientHeight - bottom - this.hot.boxEl.offsetHeight;
  }

  /** Places the box (laid out, shown or not) with its foot at `bottom` and says whether it has room there. */
  private boxFitsAt(g: NonNullable<Cockpit['phoneGameLayout']>, bottom: number): boolean {
    this.placeBoxOn(g, bottom);
    return this.boxHasRoom(g, bottom);
  }

  /**
   * A held key asks before its box opens (`HotkeysDeps.boxFits`; the box is
   * laid out, not visible): no room, no box, and nothing is asked to give
   * way for it (the lens, our keyboard). One layout read, on a hold only.
   *
   * Portrait: the room is judged on the layout as it would be with our
   * keyboard closed (the box folds it and stands beside the columns), and
   * with Comm, or Comm and the strip's pane, taken out where the box would
   * else have none (`boxPlan`, round 53j: they come back when the box
   * closes). Only a screen with no room even then refuses the hold, and a
   * refused hold changes nothing: an open keyboard stays up.
   *
   * Landscape: the keyboard folds, as it does for the box, and the room is
   * judged on the new layout (at once, not in the next frame: the box must
   * not show first).
   */
  private boxFits(): boolean {
    const { cockpit } = this.deps;
    let g = cockpit.phoneGameLayout;
    if (!g) return true;
    if (g.tooSmall) return false;
    if (!g.landscape) {
      const plan = this.boxPlan(false);
      if (plan === null) return false;
      const moved = this.okbOpen || plan.strip || plan.comm;
      cockpit.setPhoneHide(plan);
      if (this.okbOpen) {
        this.closeOwnKeyboard();
        this.swallowClick();
      }
      // (At once: the box shows on the layout it was judged on.)
      if (moved) cockpit.relayoutNow();
      g = cockpit.phoneGameLayout;
      if (!g) return true;
      if (g.tooSmall || !this.boxFitsAt(g, this.boxBottom())) {
        cockpit.setPhoneHide(null);
        return false;
      }
      return true;
    }
    if (this.okbOpen) {
      this.closeOwnKeyboard();
      this.swallowClick();
      cockpit.relayoutNow();
      g = cockpit.phoneGameLayout;
      if (!g) return true;
      if (g.tooSmall) return false;
    }
    return this.boxFitsAt(g, this.boxBottom());
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
    // (A script pane renamed: the name on the band follows without a layout.)
    this.placePlates();
  }

  /**
   * The panes' names on their bands (round 53j; comm-chrome.ts `plates`):
   * the strip's open page and COMM. Portrait: each on its own band.
   * Landscape: both on the column's band, each centred on its pane's
   * stretch of it, the strip's dots where its stretch begins. Written only
   * when something changed.
   */
  private placePlates(): void {
    const g = this.deps.cockpit.phoneGameLayout;
    if (!g) return;
    const h = this.deps.cells.get().h;
    const strip = this.stripShown ? { id: 'strip', text: this.strip.label } : null;
    const comm = this.commShown ? { id: 'comm', text: 'Comm' } : null;
    if (!g.landscape) {
      this.stripBand.plates(strip ? [strip] : []);
      this.commBand.plates(comm ? [comm] : []);
      this.sideBand.plates([]);
      return;
    }
    this.stripBand.plates([]);
    this.commBand.plates([]);
    this.sideBand.plates([
      ...(strip ? [{ ...strip, from: g.strip.y * h, size: g.strip.h * h, extra: this.strip.dots }] : []),
      ...(comm ? [{ ...comm, from: g.comm.y * h, size: g.comm.h * h }] : []),
    ]);
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

  /** The Comm key: opens Comm (under the strip, above the fight card) at its stored height, or closes it. */
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
    // A part the hot key box has out for now is still open, and its key stays lit (round 53k).
    const out = this.deps.cockpit.phoneGameLayout?.hidden;
    this.lens.setKeys({
      panes: this.pages.length > 0,
      stripOpen: this.stripShown || (this.stripOpen && out?.strip === true),
      commOpen: this.commShown || (this.commOpen && out?.comm === true),
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

  /**
   * Recomputes the fight card; the DOM and the cockpit hear of it only on a
   * change. Switched off (`phone.fightCard`): no card, as with no fight
   * (called then only for the switch itself).
   */
  private syncFight(): void {
    const { game, cockpit } = this.deps;
    const f = this.fightOn ? game.group.fight() : null;
    let next: FightCard | null = null;
    if (f && f.opponent !== null) {
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
    // again and places.
    const H = this.el.clientHeight;
    if (this.keyPx !== 0 && (g.landscape !== this.landscape || compassPx(g.landscape, H) !== this.keyPx)) {
      this.setShape(g.landscape, H);
      return;
    }
    const { w, h } = this.deps.cells.get();
    const land = g.landscape;
    // Our own keyboard stands on the rows the allocator kept for it (not laid out yet right after
    // it opened: `bottom` is 0 until the cockpit's next layout).
    if (this.okb && this.okbOpen && (g.bottom > 0 || g.tooSmall || this.deps.cockpit.phoneBottomRefused)) this.placeOwnKeyboard(g, h);
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
    this.comm.setPhoneOpen(commShown, { keep: g.hidden.comm });
    const out = `${g.hidden.strip}|${g.hidden.comm}`;
    if (stripShown !== this.stripShown || commShown !== this.commShown || out !== this.outSig) {
      this.stripShown = stripShown;
      this.commShown = commShown;
      this.outSig = out;
      this.syncKeys();
    }
    this.commBand.place(
      commShown && g.commRange && !land
        ? { bandTop: (g.comm.y + g.comm.h - 1) * h, rowH: h, rows: g.comm.h, min: g.commRange.min, max: g.commRange.max }
        : null,
    );
    // Landscape: the one band, the column's last columns, from top to bottom.
    this.sideBand.place(
      land && (stripShown || commShown) && g.sideRange
        ? { bandTop: (g.side.w - g.sideBand) * w, rowH: w, thick: g.sideBand * w, rows: g.side.w, min: g.sideRange.min, max: g.sideRange.max }
        : null,
    );
    this.placePlates();
    if (this.hot.boxOpen) {
      // The strip or Comm opened into the box's place, or the screen is too small for the
      // layout: the box gives way, unsaved. Else it follows the keyboard (over the command
      // row, or back beside the column).
      if (g.tooSmall) this.hot.closeBox();
      else {
        // Placed first: its height on this screen is known only then.
        this.syncBox();
        // (Landscape: the column grew into it sideways; the fight card is all there is above the
        // game. Nothing is kept out of the layout for the box there: a rotation brings it back.)
        if (land && (g.hidden.strip || g.hidden.comm)) this.deps.cockpit.setPhoneHide(null);
        // No room any more (a fight began, the screen changed): what can give way for it does, in
        // one more layout; only where that changes nothing the box closes.
        else if (!this.boxHasRoom(g, this.boxBottom()) && !this.replanBox(g)) this.hot.closeBox();
      }
    }
    const r = g.tooSmall ? null : g.lens;
    const size = r ? g.lensPx : 0;
    // A layout under a finger that drags the lens: the drag ends, with nothing stored.
    if (this.lensDrag) {
      const d = this.lensDrag;
      this.lensDrag = null;
      this.lens.cancelDrag();
      this.undragLens(d);
    }
    // (After a drop: the drag's transforms go as the layout's own place is written.)
    if (this.lens.el.style.translate) this.lens.el.style.translate = '';
    if (this.mapEl.style.scale) {
      this.mapEl.style.scale = '';
      this.mapShift = '-';
    }
    this.sizeLens(size);
    // The keys' row stands in for a lens that is off or has no room; not for one the cockpit has
    // not laid out yet (asked for, the relayout pending).
    const pending = this.lensFull > 0 && !g.tooSmall && g.lens === null && !g.lensHidden;
    const rowTop = g.game.y * h + SATROW_GAP;
    // The keys' row is at the right edge, where the hot key column is: on a low screen (landscape
    // with the strip or a fight card) the row would reach into a column, and then stands left of it.
    // (Above our own keyboard the columns stand lifted by its height, or not at all on a low screen.)
    const cols = this.deps.settings.get().phone.hotkeysOpen && !(this.okbOpen && this.okbNoK);
    // Landscape: the row takes the lens's place, left of the columns there are, shown or not. Not
    // while the box is open: the box reaches up to the top there, and the row would lie on it.
    const rowRight = land
      ? leftOfHot(this.keyPx, this.hot.cols, SATROW_GAP)
      : keyRowRight(rowTop + SAT_PX + SATROW_GAP, this.el.clientHeight - this.okbLift, this.keyPx, cols ? [this.hot.rowsIn(0), this.hot.rowsIn(1)] : [0, 0], SATROW_GAP);
    // The lens's circle: centred on the map pane's whole cells (the default place), or where a
    // moved or resized lens is shown (`lensAt`), the map pane shifted by the part of a cell between.
    const spot: LensSpot | null =
      r && size > 0 ? { left: g.lensAt ? g.lensAt.left : (r.x + r.w / 2) * w - size / 2, top: g.lensAt ? g.lensAt.top : (r.y + r.h / 2) * h - size / 2, size } : null;
    this.lensSpot = spot;
    if (spot && r) this.shiftMap(spot.left + size / 2 - (r.x + r.w / 2) * w, spot.top + size / 2 - (r.y + r.h / 2) * h);
    this.lens.place(spot, pending || g.tooSmall || (land && this.hot.boxOpen) ? null : rowTop, rowRight);
    this.placeLoginAsk();
  }

  /** The session is armed for automatic login (ADR 0141): the shell then reconnects a dead link found on resume. */
  get loginArmed(): boolean {
    return this.autoLogin?.armed === true;
  }

  /** Whether it is still armed once the connection ending with `reason` is gone (a session that ended on purpose is not). */
  loginArmedAfter(reason: string): boolean {
    return this.autoLogin?.armedAfter(reason) === true;
  }

  /**
   * A login kept for the session is forgotten (ADR 0141): at Exit session,
   * and (`answers`: with the answers given this page load) when the page
   * came back from the back/forward cache.
   */
  forgetLogin(answers = false): void {
    this.autoLogin?.forget(answers);
  }

  /**
   * The automatic login's question (login-ask.ts), while it is up: in the
   * game text's rectangle, clear of the lens and its keys (or the keys' row
   * that stands in for a lens) where there is room.
   */
  private placeLoginAsk(): void {
    const auto = this.autoLogin;
    const g = this.deps.cockpit.phoneGameLayout;
    if (!auto || !auto.ask.shown || !g) return;
    const { w, h } = this.deps.cells.get();
    const base = this.el.getBoundingClientRect();
    const room: AskRect = { left: g.game.x * w, top: g.game.y * h, right: (g.game.x + g.game.w) * w, bottom: g.input.y * h };
    let lens: AskRect | null = null;
    for (const el of [this.lens.el, this.lens.rowEl]) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const b: AskRect = { left: r.left - base.left, top: r.top - base.top, right: r.right - base.left, bottom: r.bottom - base.top };
      lens = lens ? { left: Math.min(lens.left, b.left), top: Math.min(lens.top, b.top), right: Math.max(lens.right, b.right), bottom: Math.max(lens.bottom, b.bottom) } : b;
    }
    auto.place(room, lens);
  }

  dispose(): void {
    this.disposed = true;
    this.lens.cancelDrag();
    this.mapEl.style.translate = '';
    this.mapEl.style.scale = '';
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
