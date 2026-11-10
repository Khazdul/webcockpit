// The phone layer (ADR 0136 §2): the chrome of the phone's layout in the
// live game, plain DOM over the cockpit, laid out in pixels. The cockpit
// keeps owning and placing the game text, the command row and every pane
// (`allocatePhoneGame`, the `phoneGame` option); this layer reads its
// rectangles after each layout and never re-parents a pane.
//
// Loaded only on a phone: the shell imports this module (and phone.css)
// after it built the live game's App with the phone flag on. Every rule of
// phone.css is scoped under `html.wc-phone` and the cockpit's
// `data-phone-game`, so nothing here can match on a desktop or a tablet,
// nor in the run log player.
//
// Parts (one module each):
//   fight-card.ts   two names and two bars while fighting (model: fight-model.ts)
//   compass.ts      the 3 × 3 keys in the bottom right corner
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
import { type PlayState, keysLive } from './play-gate';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface PhoneLayerDeps {
  /** The live game's cockpit, built with `phoneGame`. */
  cockpit: Cockpit;
  game: GameState;
  /** The cell size in px (the cockpit's rectangles are in cells). */
  cells: { get(): { w: number; h: number } };
  /** A key's command, as if typed (`App.onCommand`: aliases, the echo). Called only in play (`send`). */
  command(text: string): void;
  /** Where the session is now: a key sends only in play (play-gate.ts). */
  playState(): PlayState;
  /** The menu key (the ESC menu until the sheet of stage 51b). */
  openMenu(): void;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export class PhoneLayer {
  /** The layer over the cockpit (fight card, compass). */
  readonly el: HTMLDivElement;
  /** The menu key, first in the command row. */
  readonly menuKey: HTMLButtonElement;
  private readonly deps: PhoneLayerDeps;
  private readonly fight: FightCardView;
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
    this.el.append(this.fight.el, compass.el);
    cockpit.el.append(this.el);

    this.menuKey = menuKey(doc, () => deps.openMenu());
    cockpit.inputEl.prepend(this.menuKey);
    this.placeholder();

    this.unsubs.push(
      deps.game.subscribe((part) => {
        // Your HP comes with `char`, the fight and the members with `group`.
        if (part === 'group' || (part === 'char' && this.card !== null)) this.syncFight();
      }),
      cockpit.onLayout(() => this.place()),
    );
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
    const h = this.deps.cells.get().h;
    this.fight.place(g.fight.y * h, g.fight.h * h, this.card !== null && !g.tooSmall);
  }

  dispose(): void {
    for (const u of this.unsubs.splice(0)) u();
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
  return new PhoneLayer(deps);
}
