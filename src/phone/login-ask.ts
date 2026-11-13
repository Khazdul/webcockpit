// Automatic login for the session (ADR 0141): the question's card.
//
// "Log in automatically as <Name> for the rest of this session?" with Yes
// and No, in the phone layer's own look (the iron hood, the frosted card).
//
// It must not get in the way of play: the player may be attacked the
// second they log in. So it is NOT a dialog:
// - no veil, and nothing outside the card is covered or stops taking taps;
// - it never takes the focus (a press on it keeps the focus where it was,
//   so our keyboard stays up and the command line keeps the typing) and it
//   listens to no key: every key goes to the game as before;
// - only a tap on Yes or No answers it. Unanswered it goes away by itself
//   (the rule's `ASK_MS`), which is not an answer.
//
// Where it stands (`placeAsk`, pure): in the game text's rectangle, clear
// of the map lens where there is room (under it, over it, or beside it),
// otherwise at the top of the text. The newest text, the command row, the
// compass and the hot keys are at the bottom and stay free.

/** A rectangle in CSS px relative to the phone layer. */
export interface AskRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface AskSpot {
  left: number;
  top: number;
  width: number;
}

/** The card's widest and narrowest width, the air round it, and the height asked for when judging a place. */
export const ASK_MAX_W = 420;
export const ASK_MIN_W = 250;
export const ASK_AIR = 8;

/**
 * The card's place in the game text's rectangle `room`, clear of `lens`
 * (null: no lens shown) when a place of the card's height `h` is free.
 */
export function placeAsk(room: AskRect, lens: AskRect | null, h: number): AskSpot {
  const full = Math.max(0, room.right - room.left - 2 * ASK_AIR);
  const width = Math.min(ASK_MAX_W, full);
  const centred = room.left + ASK_AIR + (full - width) / 2;
  const top = room.top + ASK_AIR;
  const atTop: AskSpot = { left: centred, top, width };
  if (!lens || lens.bottom <= room.top || lens.top >= room.bottom || lens.right <= room.left || lens.left >= room.right) return atTop;
  // Beside the lens, at the top: the oldest text.
  const leftW = Math.min(ASK_MAX_W, lens.left - ASK_AIR - (room.left + ASK_AIR));
  if (leftW >= ASK_MIN_W) return { left: room.left + ASK_AIR, top, width: leftW };
  const rightW = Math.min(ASK_MAX_W, room.right - ASK_AIR - (lens.right + ASK_AIR));
  if (rightW >= ASK_MIN_W) return { left: room.right - ASK_AIR - rightW, top, width: rightW };
  // Over it, or under it.
  if (lens.top - ASK_AIR - top >= h) return atTop;
  if (room.bottom - ASK_AIR - (lens.bottom + ASK_AIR) >= h) return { left: centred, top: lens.bottom + ASK_AIR, width };
  return atTop;
}

export class LoginAsk {
  readonly el: HTMLDivElement;
  private readonly nameEl: HTMLElement;
  private onAnswer: ((yes: boolean) => void) | null = null;

  constructor(doc: Document) {
    const el = doc.createElement('div');
    el.className = 'wc-ph-ask';
    el.hidden = true;
    // A group, not a dialog: nothing is modal here.
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', 'Automatic login');
    el.dataset.ask = 'auto-login';
    const hood = doc.createElement('span');
    hood.className = 'wc-ph-hood';
    hood.textContent = 'Automatic login';
    const q = doc.createElement('p');
    q.className = 'wc-ph-ask-q';
    this.nameEl = doc.createElement('b');
    q.append('Log in automatically as ', this.nameEl, ' for the rest of this session?');
    const note = doc.createElement('p');
    note.className = 'wc-ph-ask-n';
    note.textContent = "Your name and password are kept in this page's memory only. They are gone when the page is closed or reloaded.";
    const foot = doc.createElement('div');
    foot.className = 'wc-ph-ask-foot';
    foot.append(this.button(doc, 'No', false), this.button(doc, 'Yes', true));
    el.append(hood, q, note, foot);
    this.el = el;
  }

  private button(doc: Document, label: string, yes: boolean): HTMLButtonElement {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = yes ? 'wc-ph-ask-yes' : 'wc-ph-ask-no';
    b.dataset.act = yes ? 'yes' : 'no';
    b.tabIndex = -1;
    b.textContent = label;
    // The focus stays where it is (the command line, with our keyboard up).
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onAnswer?.(yes);
    });
    return b;
  }

  get shown(): boolean {
    return !this.el.hidden;
  }

  /** Shows the question for `name` (as text, never as markup). */
  show(name: string, onAnswer: (yes: boolean) => void): void {
    this.nameEl.textContent = name;
    this.onAnswer = onAnswer;
    this.el.hidden = false;
  }

  hide(): void {
    this.onAnswer = null;
    this.el.hidden = true;
    this.nameEl.textContent = '';
  }

  /** Places the shown card (`placeAsk`). */
  place(room: AskRect, lens: AskRect | null): void {
    if (this.el.hidden) return;
    // Its height at the widest it can be here (a narrower place only makes it taller).
    const s0 = placeAsk(room, null, 0);
    this.el.style.width = `${s0.width}px`;
    const spot = placeAsk(room, lens, this.el.offsetHeight);
    this.el.style.left = `${spot.left}px`;
    this.el.style.top = `${spot.top}px`;
    this.el.style.width = `${spot.width}px`;
    this.el.style.maxHeight = `${Math.max(0, room.bottom - spot.top - ASK_AIR)}px`;
  }
}
