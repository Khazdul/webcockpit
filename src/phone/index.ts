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
import { type PhoneControls, type PhoneKit, phoneKit, setPhoneControls, setPhoneKit } from './kit';

export type { PhoneControls, PhoneKit } from './kit';
import type { AppStatusView } from '../app/status';
import type { SettingsStore } from '../settings';

export type { MenuFrame } from './menu-sheet';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The lens's place (the mockups): 16 px under the fight card or the top edge, 12 px from the right edge. */
const LENS_GAP_TOP = 16;
const LENS_GAP_RIGHT = 12;
/** What the compass takes from the bottom edge: three 40 px keys, two 3 px gaps and its 8 px margin. */
const COMPASS_HEIGHT = 134;
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
    });
    this.unsubs.push(kit.onFullscreenRefused(() => this.lens.dropFullscreen()));
    this.el.append(this.fight.el, this.lens.el, this.lens.rowEl, compass.el);
    cockpit.el.append(this.el);
    this.menu = new PhoneMenu({
      parent: cockpit.el,
      settings: deps.settings,
      status: deps.status,
      scriptsOn: () => deps.scriptsOn(),
      reconnect: () => deps.reconnect(),
      openFrame: (f) => deps.openFrame(f),
      onClose: () => deps.onMenuClose?.(),
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
      }),
    );
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
    if (keysLive(this.deps.playState())) this.deps.command(cmd);
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
    cockpit.setPhoneLens({ size, gapTop: LENS_GAP_TOP, gapRight: LENS_GAP_RIGHT, clearBottom: COMPASS_HEIGHT });
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
    const r = g.tooSmall ? null : g.lens;
    const size = this.lensSize;
    this.lens.place(
      r && size > 0 ? { left: (r.x + r.w / 2) * w - size / 2, top: (r.y + r.h / 2) * h - size / 2, size } : null,
      g.game.y * h + SATROW_GAP,
    );
  }

  dispose(): void {
    for (const u of this.unsubs.splice(0)) u();
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
