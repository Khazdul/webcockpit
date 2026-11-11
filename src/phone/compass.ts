// The phone's compass (ADR 0136 §7): a 3 × 3 grid of keys in the bottom
// right corner, from the bottom edge.
//
//   [ K ] [ N ] [ U ]
//   [ W ] [eye] [ E ]
//   [ F ] [ S ] [ D ]
//
// - Every key is always live: the room's exits never dim or disable one
//   (the player may want to spam a direction).
// - A key sends on the press (pointerdown), not on the click: a finger
//   that slides a little while spamming a direction never loses a tap.
//   The press is prevented from becoming a mouse press, so the focus
//   stays where it is: a tap never moves it to the command field and
//   never raises the keyboard. A click without a pointer (a screen
//   reader's or a keyboard's activation) sends too.
// - The cell left of N is the hot keys' K key (hotkeys.ts puts it there; it
//   has no command, so nothing here sends for it).
// - Hidden while the on-screen keyboard is up (phone.css, `html.wc-kbd`).

const SVG_NS = 'http://www.w3.org/2000/svg';
/** The eye (look): the mockups' icon, 24 × 24. */
const EYE = ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z'];

export interface CompassKey {
  /** The command the key sends. */
  cmd: string;
  /** The letter on it; null: the eye. */
  text: string | null;
  label: string;
  /** Grid place, 1-based. */
  col: number;
  row: number;
  flee?: boolean;
}

/** The keys at the mockup's grid positions. */
export const COMPASS_KEYS: readonly CompassKey[] = [
  { cmd: 'north', text: 'N', label: 'North', col: 2, row: 1 },
  { cmd: 'up', text: 'U', label: 'Up', col: 3, row: 1 },
  { cmd: 'west', text: 'W', label: 'West', col: 1, row: 2 },
  { cmd: 'look', text: null, label: 'Look', col: 2, row: 2 },
  { cmd: 'east', text: 'E', label: 'East', col: 3, row: 2 },
  { cmd: 'flee', text: 'F', label: 'Flee', col: 1, row: 3, flee: true },
  { cmd: 'south', text: 'S', label: 'South', col: 2, row: 3 },
  { cmd: 'down', text: 'D', label: 'Down', col: 3, row: 3 },
];

export class Compass {
  readonly el: HTMLDivElement;

  /** `send` gets the key's command (the App's typed-command path). */
  constructor(doc: Document, send: (cmd: string) => void) {
    this.el = doc.createElement('div');
    this.el.className = 'wc-ph-pad';
    this.el.setAttribute('role', 'group');
    this.el.setAttribute('aria-label', 'Movement');
    for (const k of COMPASS_KEYS) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = k.flee ? 'wc-ph-key is-flee' : 'wc-ph-key';
      b.dataset.cmd = k.cmd;
      b.setAttribute('aria-label', k.label);
      // Not in the Tab order (ADR 0108): Tab belongs to the command line.
      b.tabIndex = -1;
      b.style.gridColumn = String(k.col);
      b.style.gridRow = String(k.row);
      if (k.text !== null) b.textContent = k.text;
      else b.append(eye(doc));
      this.el.append(b);
    }
    const key = (e: Event): string | null => (e.target as Element | null)?.closest<HTMLElement>('.wc-ph-key')?.dataset.cmd ?? null;
    this.el.addEventListener('pointerdown', (e) => {
      const cmd = key(e);
      if (cmd === null || (e.pointerType === 'mouse' && e.button !== 0)) return;
      // No mouse press follows: the focus (and the keyboard) stays as it is.
      e.preventDefault();
      send(cmd);
    });
    // Browsers that still send the mouse press: it must not move the focus either.
    this.el.addEventListener('mousedown', (e) => e.preventDefault());
    this.el.addEventListener('click', (e) => {
      e.stopPropagation();
      // A pointer's click was sent on its press; `detail` 0 is an activation without one.
      if (e.detail !== 0) return;
      const cmd = key(e);
      if (cmd !== null) send(cmd);
    });
    // A long press on a key is not a text selection or a context menu.
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}

function eye(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'wc-ph-ico');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of EYE) {
    const p = doc.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  const c = doc.createElementNS(SVG_NS, 'circle');
  c.setAttribute('cx', '12');
  c.setAttribute('cy', '12');
  c.setAttribute('r', '3');
  svg.append(c);
  return svg;
}
