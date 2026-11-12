// Input pane: the one-row command line (Inv §1.2, §1.3, spec §2.2).
//
// Decisions (see the report for the stage file):
// - Native <input type="text">; the browser supplies caret, selection,
//   printable-key-replaces-selection, Backspace/Delete-clears-selection and
//   arrows-deselect. We add Enter, history, word keys and focus handling.
// - Password mode keeps type="text" (a type="password" field makes Firefox
//   and Chrome offer to save the password) and masks by making the text
//   transparent and drawing one bullet per character over it. Copy and cut
//   are blocked while masked. The bullets' element (`.wc-input-mask`) lies
//   on the field and clips to it; a line longer than the field scrolls the
//   bullets inside it (a text indent of −scrollLeft, as the suggestion's).
// - Paste: CRLF/CR become LF, trailing newlines are dropped, and remaining
//   newlines become single spaces. Nothing is ever sent by a paste.
// - Ctrl+W: handled (delete word back) where the browser lets the page see
//   it. Chrome and Firefox close the tab on Ctrl+W before the page gets the
//   key in a normal tab; it only works in an installed-app/popup window.
//   Alt+Backspace does the same and always works.
// - Custom caret (ADR 0010, ADR 0011): the native caret is transparent and
//   a `.wc-caret` element is drawn at column × cell width − scrollLeft, so
//   it can be a block, beam or underline (CSS reads <html data-cursor>).
//   Its position is updated in an animation frame after input, selection
//   and focus changes, never synchronously in a key handler, so the
//   Enter → send path does no extra work. It is hidden while a range is
//   selected (like the native caret) and hollow/hidden while blurred.
// - Caret blink (ADR 0044 rule 1): a 500 ms timer toggles `wc-caret-off`,
//   never a CSS animation (an infinite animation keeps the frame loop on
//   the vsync grid, +7–9 ms per received line). The timer runs only while
//   the caret shows, the input has the focus and <html data-cursor-blink>
//   is "on"; every caret update restarts it with the caret visible, and a
//   change of the setting restarts or stops it at once.
// - Send first (ADR 0044 rule 3): Enter sends before any UI work; the snap
//   to the live tail follows the send and only runs while scrolled back,
//   and not while the split shows the live tail (desktop, ADR 0117). A
//   macro runs before the refocus when focus is elsewhere.
// - Macros (stage 3, ADR 0015): before its own key handling the pane asks
//   `onMacroKey` with the key's canonical name (src/script/keys.ts); a
//   bound macro wins and the key is consumed. Not in password mode, not
//   while AltGr is down. The macro runs synchronously in the keydown.
//   Printable keys can be bound too (ADR 0026): a bound `a` or `Shift+1`
//   is consumed (preventDefault), so its character is never typed. Every
//   keydown also teaches the key labels (`learnKeyLabel`).
// - Dead keys (ADR 0026 "Dead keys"): a keydown with `key` = `Dead`
//   reaches the macro lookup even while a composition is open, so `´`
//   then `¨` both fire. Firefox sends the dead keydown twice (before and
//   after compositionstart); the repeat of a consumed dead key is dropped
//   until its keyup. preventDefault does not stop the composition, so a
//   consumed dead key snapshots the line, and every composition event that
//   follows ends the composition (blur + refocus) and restores the
//   snapshot. The guard ends at the next plain keydown outside a
//   composition, or at a compositionend once the key is released.
// - Auto-clear (ADR 0063, off by default): Enter leaves the line empty
//   instead of refilling it with the sent text, selected. History is
//   recorded the same way either way.
// - Autosuggest (ADR 0063, off by default): the newest history entry that
//   starts with the line (and is longer) is shown greyed after it, once
//   the line holds a space, while the caret is at the end with nothing
//   selected and history is not being browsed. Not in password mode.
//   The ghost (`.wc-input-ghost`) is drawn in the caret's animation frame,
//   never in a key handler. Right at the end, or End with the caret
//   already there, accepts it all; Tab accepts the next word (whitespace
//   run + word) while a suggestion is showing. Macros win first, as for
//   every key. The ghost is never sent.
// - Tab (ADR 0108): Tab and Shift+Tab in the line never move the focus.
//   A macro bound to them runs; autosuggest takes a word; otherwise
//   nothing happens. Tab with a stray focus (the page's body, or a
//   control in `scope` that is not a text field, a popup or a window)
//   gives the keys back to the line and does nothing else, so the focus
//   never wanders off to the browser's own controls.
// - Own keys (ADR 0099): an element marked `data-wc-own-keys` (the menu
//   bar's popups, the windows) keeps the keys typed and the clicks made
//   inside it, as another text field does: no refocus, no macro, no key
//   handling here.
// - Own keyboard (ADR 0138, stage 53): the phone's on-screen keyboard of
//   our own edits the line through `insertText`, `deleteBackward` (a whole
//   grapheme cluster) and `submitLine`, which use the same `edit` /
//   `afterEdit` path as the pane's own keys, and browses the history with
//   `historyStep` (the Up and Down keys' `historyUp` / `historyDown`;
//   nothing in password mode). No keyboard event is made up for it.
//   `setOwnKeyboard` marks the fields (`inputmode="none"`, `virtualkeyboardpolicy="manual"`)
//   so the device's keyboard stays down. While they are marked the phone
//   masks a password as the desktop does (the textarea with the bullets
//   over it), not with the swapped-in `type="password"` field: that swap
//   was made for the device keyboard's behaviour, and a password field
//   brings the browser's password manager and the device's secure input
//   with it. A range selected in the masked line is collapsed at once, so
//   a phone's selection toolbar (share, translate, search) is never
//   offered the password; the caret and paste stay.
// - Kept line (stage 53, round 53j; a phone with our own keyboard only):
//   the sent line that stays to be sent again or replaced is a native
//   selection of the whole line only while the field has the focus. When
//   the field loses it (the keyboard folds) the selection is collapsed and
//   the state is remembered instead (`kept`, the field marked
//   `wc-input-kept`: the owner's CSS dims it): a field tapped while it holds
//   a range makes Android show its selection pop-up (cut, copy, ...). Kept,
//   Enter sends the line again, an inserted character or a paste replaces
//   it, Backspace or Delete clears it; a caret key, a tap in the focused
//   field or a selection the user makes (a long press) turns it into
//   ordinary text. The line's own keys (a hardware keyboard) treat it as
//   the desktop treats the selected sent line: Ctrl+A selects it natively,
//   Ctrl+E, Alt+B and Alt+F place the caret (from the line's end) and
//   leave ordinary text, Alt+Backspace and Ctrl+W delete it whole. The tap that brings the focus back leaves it kept, with
//   the caret at the end. Never at a password prompt. Desktop and tablet
//   keep the native selection as ever.
// - Own font (stage 53, round 53j): `setOwnFont` gives the line a text
//   size of its own (the phone's game layout: a fixed size in a field of
//   fixed height). The caret, the suggestion and the bullets then use the
//   cell width measured in that font, not the cockpit's.

import { device, touchInteraction } from '../core/device';
import type { Bus } from '../core/bus';
import type { Sender } from '../core/types';
import { isOwnKey } from '../core/own-keyboard';
import { keyNameFromEvent, learnKeyLabel } from '../script/keys';

/** What the input pane needs from the output pane. */
export interface ScrollTarget {
  pageUp(): void;
  pageDown(): void;
  toTail(): void;
  isScrolled(): boolean;
  /** True while a split shows the live tail (ADR 0117): a send keeps the view. */
  isSplit?(): boolean;
}

export interface InputPaneOptions {
  sender: Sender;
  /** Output pane for PageUp/PageDown/ESC and snap-to-tail on send. */
  output?: ScrollTarget;
  /** Built-in command hook; return true when the text was handled. */
  onCommand?: (text: string) => boolean;
  /**
   * Macro hook (ADR 0015): called with the canonical key name of every
   * keydown the input line sees (not in password mode, not with AltGr);
   * returns true when a macro ran. A bound macro wins over the input
   * line's own use of the key.
   */
  onMacroKey?: (key: string) => boolean;
  /** ESC when the output is not scrolled (the menu, stage 2). */
  onEscape?: () => void;
  /** Cell width in px for the caret (default: measured from the pane). */
  cellWidth?: () => number;
  /** Frame scheduler for caret updates (default requestAnimationFrame). */
  requestFrame?: (cb: () => void) => void;
  /** Phone command line (a one-row <textarea>); default: the device flag. */
  phone?: boolean;
  /**
   * Where a stray focus is given back to the line by Tab (ADR 0108): the
   * App's element while it is shown (the page's body counts then too),
   * null while it is hidden. Default: the whole page.
   */
  scope?: () => Element | null;
}

/** The command line element: an <input>, or a <textarea> on a phone. */
export type CommandField = HTMLInputElement | HTMLTextAreaElement;

const BULLET = '•';

/** Marks an element that keeps its own keys and clicks (the menu bar popups, ADR 0099). */
export const OWN_KEYS_ATTR = 'data-wc-own-keys';

/**
 * Marks a control whose press keeps a focused window's focus (the bar's
 * Profile and Scripts, so their toggle sees the window focused; ADR 0103).
 */
export const WINDOW_BTN_ATTR = 'data-wc-window-btn';

/**
 * The autosuggestion for `text` (ADR 0063): the rest of the newest entry
 * in `history` (oldest first) that starts with `text` and is longer, or
 * '' when there is none or `text` holds no space yet.
 */
export function suggestFrom(history: readonly string[], text: string): string {
  if (!text.includes(' ')) return '';
  for (let k = history.length - 1; k >= 0; k--) {
    const h = history[k]!;
    if (h.length > text.length && h.startsWith(text)) return h.slice(text.length);
  }
  return '';
}

/** The next word of a suggestion: its leading whitespace run and the word after it. */
export function nextSuggestedWord(rest: string): string {
  return /^\s*\S*/.exec(rest)![0];
}

/** Input history depth (tt++'s default); the oldest entry is dropped. */
export const MAX_HISTORY = 1000;

/** Half a blink cycle: the caret is on 500 ms, off 500 ms. */
export const BLINK_MS = 500;
/**
 * The keys that turn a kept line into ordinary text (file header: "Kept
 * line"). The line's own caret keys do too (`handleKey`: Ctrl+A, Ctrl+E,
 * Alt+B, Alt+F, Shift+Up, Shift+Down).
 */
const KEPT_CARET_KEYS: ReadonlySet<string> = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End']);
/** Characters in the run `setOwnFont` measures the line's own cell width with. */
const OWN_FONT_RUN = 40;

/** Start of the alphanumeric word before `pos` (readline backward-word). */
export function wordStartBefore(s: string, pos: number): number {
  let i = pos;
  while (i > 0 && !isWordChar(s.charCodeAt(i - 1))) i--;
  while (i > 0 && isWordChar(s.charCodeAt(i - 1))) i--;
  return i;
}

/** End of the alphanumeric word after `pos` (readline forward-word). */
export function wordEndAfter(s: string, pos: number): number {
  let i = pos;
  while (i < s.length && !isWordChar(s.charCodeAt(i))) i++;
  while (i < s.length && isWordChar(s.charCodeAt(i))) i++;
  return i;
}

/** Start of the whitespace-delimited word before `pos` (unix-word-rubout). */
export function spaceWordStartBefore(s: string, pos: number): number {
  let i = pos;
  while (i > 0 && isSpace(s.charCodeAt(i - 1))) i--;
  while (i > 0 && !isSpace(s.charCodeAt(i - 1))) i--;
  return i;
}

function isSpace(c: number): boolean {
  return c === 32 || c === 9;
}

function isWordChar(c: number): boolean {
  return (
    (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c > 127
  );
}

/** Start of the code point before `pos` (a surrogate pair is one). */
export function codePointStartBefore(s: string, pos: number): number {
  if (pos <= 0) return 0;
  const lo = s.charCodeAt(pos - 1);
  const hi = pos >= 2 ? s.charCodeAt(pos - 2) : 0;
  return lo >= 0xdc00 && lo <= 0xdfff && hi >= 0xd800 && hi <= 0xdbff ? pos - 2 : pos - 1;
}

type GraphemeSegmenter = { segment(t: string): Iterable<{ segment: string; index: number }> };
type GraphemeSegmenterCtor = new (l?: string, o?: { granularity: 'grapheme' }) => GraphemeSegmenter;
/** The one grapheme segmenter, made at its first use (again only if `Intl.Segmenter` itself was replaced: tests). */
let graphemes: GraphemeSegmenter | null = null;
let graphemesCtor: GraphemeSegmenterCtor | null = null;

/**
 * Start of the character before `pos` as a reader counts it: a whole
 * grapheme cluster (a letter with its combining marks, a flag, an emoji
 * with its joiners) where `Intl.Segmenter` exists, else a code point.
 */
export function graphemeStartBefore(s: string, pos: number): number {
  if (pos <= 0) return 0;
  const before = pos >= s.length ? s : s.slice(0, pos);
  // The common case, a plain ASCII character, needs no segmenter.
  const last = before.charCodeAt(before.length - 1);
  if (last >= 0x20 && last < 0x7f) return pos - 1;
  const Seg = (Intl as { Segmenter?: GraphemeSegmenterCtor }).Segmenter;
  if (!Seg) return codePointStartBefore(s, pos);
  if (graphemes === null || graphemesCtor !== Seg) {
    graphemesCtor = Seg;
    graphemes = new Seg(undefined, { granularity: 'grapheme' });
  }
  let start = 0;
  for (const g of graphemes.segment(before)) start = g.index;
  return start;
}

/** Cells before `pos`: code points, so a surrogate pair is one cell. */
function cellsBefore(s: string, pos: number): number {
  let col = pos;
  for (let k = 0; k < pos; k++) {
    const cc = s.charCodeAt(k);
    if (cc >= 0xd800 && cc <= 0xdbff) col--;
  }
  return col;
}

/** Marks (or unmarks) a field as typed in from our own keyboard: the device's stays down. */
function markOwnKeyboard(f: HTMLElement, on: boolean): void {
  if (on) {
    f.setAttribute('inputmode', 'none');
    f.setAttribute('virtualkeyboardpolicy', 'manual');
  } else {
    f.removeAttribute('inputmode');
    f.removeAttribute('virtualkeyboardpolicy');
  }
}

/** Paste normalisation: one line, newlines become spaces. */
export function normalizePaste(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\n+$/, '')
    .replace(/\n+/g, ' ');
}

export class InputPane {
  readonly el: HTMLDivElement;
  /**
   * The field in use. Desktop: always the one <input type="text">. Phone
   * (ADR 0075 §3.2): a one-row <textarea>, because Chrome on Android shows
   * its autofill bar over the keyboard for every <input>; while masked an
   * <input type="password"> takes its place, so the on-screen keyboard
   * treats the text as a password (no suggestions, no learning).
   */
  private field: CommandField;
  /** Phone: the textarea and the lazily made password field. */
  private readonly phone: boolean;
  private textField: CommandField | null = null;
  private passField: HTMLInputElement | null = null;
  /** Phone: a keydown Enter was seen, so its line break must not send again. */
  private enterDown = false;
  private readonly mask: HTMLSpanElement;
  /** The greyed autosuggestion after the line (ADR 0063). */
  readonly ghostEl: HTMLSpanElement;
  private ghostText = '';
  private ghostX = NaN;
  /** The field's scroll the bullets were last drawn at (`updateCaret`). */
  private maskScroll = 0;
  /** The custom caret element. */
  readonly caretEl: HTMLSpanElement;
  /**
   * The clock strip at the right end (8 cells; src/ui/clock-strip.ts draws
   * it). On desktop and tablet the menu bar takes its place in the row and
   * holds it (src/menubar/menubar.ts).
   */
  readonly clockEl: HTMLSpanElement;
  private readonly doc: Document;
  private readonly requestFrame: (cb: () => void) => void;
  private caretScheduled = false;
  private caretX = NaN;
  private caretText = '';
  /** The blink timer, or null while the caret does not blink. */
  private blinkTimer: ReturnType<typeof setInterval> | null = null;
  /** Watches <html data-cursor-blink> so a setting change applies at once. */
  private readonly blinkObserver: MutationObserver | null;
  private measurer: HTMLSpanElement | null = null;
  /** The line has a text size of its own (`setOwnFont`): its measured cell width (0: not yet), and what follows its font. */
  private ownFont = false;
  private ownCellW = 0;
  private ownFontProbe: HTMLSpanElement | null = null;
  private ownFontWatch: ResizeObserver | null = null;
  private readonly opts: InputPaneOptions;

  /** History, oldest first. In memory only (Inv §1.2). */
  private readonly history: string[] = [];
  /** Index into history while browsing, or -1. */
  private browseIndex = -1;
  /** Draft saved when browsing started. */
  private draft = '';
  /** True right after Down restored the draft: one more Down clears. */
  private draftRestored = false;

  private password = false;
  /** The fields are marked for a keyboard of our own (`setOwnKeyboard`). */
  private ownKeyboard = false;
  /** The whole line is kept to be sent again or replaced, with no native selection (see the header: "Kept line"). */
  private kept = false;
  /** An edit through the editing API: the next caret update scrolls the caret into view first. */
  private revealCaret = false;
  /** Options → Auto-clear input (ADR 0063). */
  private autoClear = false;
  /** Options → Input autosuggest (ADR 0063). */
  private autosuggest = false;
  private leaveGuard = false;
  /** Line before the dead key a macro consumed; its composition is undone. */
  private deadSnap: { value: string; start: number; end: number; dir: 'forward' | 'backward' | 'none' } | null =
    null;
  /** Code of a consumed dead key until its keyup (Firefox repeats the keydown). */
  private deadEcho: string | null = null;
  /** True while the pane itself blurs and refocuses to end a composition. */
  private cancellingComposition = false;
  private readonly unsubs: Array<() => void> = [];

  constructor(bus: Bus, root: HTMLElement, opts: InputPaneOptions) {
    this.opts = opts;
    this.doc = root.ownerDocument;
    this.requestFrame =
      opts.requestFrame ??
      ((cb) => {
        const win = this.doc.defaultView;
        if (win?.requestAnimationFrame) win.requestAnimationFrame(() => cb());
        else setTimeout(cb, 16);
      });
    const doc = this.doc;

    this.el = doc.createElement('div');
    this.el.className = 'wc-input';
    const prompt = doc.createElement('span');
    prompt.className = 'wc-input-prompt';
    prompt.textContent = '> ';
    const wrap = doc.createElement('span');
    wrap.className = 'wc-input-wrap';
    this.phone = opts.phone ?? device().phone;
    this.field = this.makeField(this.phone ? 'textarea' : 'text');
    this.textField = this.field;
    this.mask = doc.createElement('span');
    this.mask.className = 'wc-input-mask';
    this.mask.hidden = true;
    this.ghostEl = doc.createElement('span');
    this.ghostEl.className = 'wc-input-ghost';
    this.ghostEl.setAttribute('aria-hidden', 'true');
    this.ghostEl.hidden = true;
    this.caretEl = doc.createElement('span');
    this.caretEl.className = 'wc-caret';
    this.caretEl.setAttribute('aria-hidden', 'true');
    this.caretEl.hidden = true;
    wrap.append(this.input, this.mask, this.ghostEl, this.caretEl);
    const clock = doc.createElement('span');
    clock.className = 'wc-input-clock';
    this.clockEl = clock;
    this.el.append(prompt, wrap, clock);
    root.appendChild(this.el);

    doc.addEventListener('selectionchange', this.onSelectionChange);
    doc.addEventListener('keydown', this.onKeyDown, true);
    doc.addEventListener('keyup', this.onKeyUp, true);
    doc.addEventListener('mouseup', this.onDocMouseUp);
    doc.defaultView?.addEventListener('focus', this.onWindowFocus);

    this.unsubs.push(bus.on('telnet.echo', (e) => this.setPasswordMode(e.serverEchoes)));

    const MO = doc.defaultView?.MutationObserver;
    this.blinkObserver = MO ? new MO(() => this.restartBlink()) : null;
    this.blinkObserver?.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-cursor-blink'] });
  }

  /** Makes a command field and wires its events. */
  private makeField(kind: 'text' | 'textarea' | 'password'): CommandField {
    const doc = this.doc;
    let f: CommandField;
    if (kind === 'textarea') {
      const ta = doc.createElement('textarea');
      ta.setAttribute('rows', '1');
      ta.setAttribute('wrap', 'off');
      ta.setAttribute('enterkeyhint', 'send');
      ta.addEventListener('beforeinput', this.onBeforeInput);
      f = ta;
    } else {
      const inp = doc.createElement('input');
      inp.type = kind;
      if (this.phone) inp.setAttribute('enterkeyhint', 'send');
      f = inp;
    }
    f.className = 'wc-input-field';
    f.autocomplete = 'off';
    f.spellcheck = false;
    f.setAttribute('autocapitalize', 'off');
    f.setAttribute('autocorrect', 'off');
    f.setAttribute('aria-label', kind === 'password' ? 'Password' : 'Command');
    // A random name keeps form-history/autofill heuristics from matching.
    f.name = 'wc-cmd-' + Math.random().toString(36).slice(2);
    if (this.ownKeyboard) markOwnKeyboard(f, true);
    const ev: HTMLElement = f;
    ev.addEventListener('input', this.onInput);
    ev.addEventListener('compositionstart', this.onComposition);
    ev.addEventListener('compositionupdate', this.onComposition);
    ev.addEventListener('compositionend', this.onCompositionEnd);
    ev.addEventListener('paste', this.onPaste);
    ev.addEventListener('copy', this.onCopyCut);
    ev.addEventListener('cut', this.onCopyCut);
    ev.addEventListener('focus', this.scheduleCaret);
    ev.addEventListener('blur', this.keepOnBlur);
    ev.addEventListener('pointerdown', this.onFieldPointerDown);
    ev.addEventListener('click', this.onFieldClick);
    ev.addEventListener('select', this.onFieldSelect);
    ev.addEventListener('blur', this.scheduleCaret);
    ev.addEventListener('scroll', this.scheduleCaret);
    ev.addEventListener('select', this.collapseMasked);
    ev.addEventListener('select', this.scheduleCaret);
    return f;
  }

  /** Phone: puts `next` in the current field's place, keeping the focus. */
  private swapField(next: CommandField): void {
    const cur = this.field;
    if (next === cur) return;
    const focused = this.doc.activeElement === cur;
    next.value = '';
    cur.replaceWith(next);
    cur.value = '';
    this.field = next;
    if (focused) next.focus({ preventScroll: true });
  }

  // ----------------------------------------------------------------- public

  /** The command line element (see `field`). */
  get input(): CommandField {
    return this.field;
  }

  /**
   * Focuses the input (call after overlays close). Not after a tap on a
   * touch device (ADR 0075): focus would open the on-screen keyboard; the
   * input gets it there only when it is tapped itself. Typed keys still
   * move the focus here (onKeyDown).
   */
  focus(): void {
    if (touchInteraction()) return;
    if (this.doc.activeElement !== this.input) this.input.focus({ preventScroll: true });
  }

  /** Current buffer text. */
  get value(): string {
    return this.input.value;
  }

  /** A copy of the history, oldest first. */
  getHistory(): string[] {
    return this.history.slice();
  }

  /** True while the whole non-empty buffer is selected (recall state), or kept as such without a selection (`isKept`). */
  isRecallState(): boolean {
    const i = this.input;
    return i.value.length > 0 && (this.kept || (i.selectionStart === 0 && i.selectionEnd === i.value.length));
  }

  /** True while the line is kept without a native selection (a phone with our own keyboard; see the header). */
  isKept(): boolean {
    return this.kept;
  }

  /** Marks the line kept, or ordinary text again. */
  private setKept(on: boolean): void {
    if (on === this.kept) return;
    this.kept = on;
    this.input.classList.toggle('wc-input-kept', on);
    this.scheduleCaret();
  }

  /**
   * The kept line is about to be edited: it is selected whole (natively,
   * for the edit that follows at once), so the edit replaces it. Returns
   * true when it was kept.
   */
  private takeKept(): boolean {
    if (!this.kept) return false;
    this.setKept(false);
    this.input.setSelectionRange(0, this.input.value.length);
    return true;
  }

  /** The recall state without a native selection, where the field has no focus (a phone with our own keyboard). */
  private keepIfBlurred(): void {
    if (!this.phone || !this.ownKeyboard || this.password) return;
    const i = this.input;
    const n = i.value.length;
    if (n === 0 || this.doc.activeElement === i || i.selectionStart !== 0 || i.selectionEnd !== n) return;
    i.setSelectionRange(n, n);
    this.setKept(true);
  }

  /** The field lost the focus with the whole line selected: kept, the selection collapsed (after the blur: the active element is another by then). */
  private readonly keepOnBlur = (): void => {
    if (!this.cancellingComposition) this.keepIfBlurred();
  };

  /** A press in the focused field: the kept line is ordinary text from here (the caret goes where the tap puts it). */
  private readonly onFieldPointerDown = (e: Event): void => {
    if (this.kept && this.doc.activeElement === e.currentTarget) this.setKept(false);
  };

  /** The tap that brought the focus back to a kept line: the caret at its end. */
  private readonly onFieldClick = (): void => {
    if (!this.kept) return;
    const n = this.input.value.length;
    this.input.setSelectionRange(n, n);
  };

  /** A range selected in a kept line (a long press): the user's own selection, ordinary text. */
  private readonly onFieldSelect = (): void => {
    const i = this.input;
    if (this.kept && i.selectionStart !== i.selectionEnd) this.setKept(false);
  };

  /** Masks the input and sends without history (server echo = password). */
  setPasswordMode(on: boolean): void {
    if (on === this.password) return;
    this.password = on;
    this.setKept(false);
    if (this.phone && !this.ownKeyboard) {
      if (on) this.passField ??= this.makeField('password') as HTMLInputElement;
      this.swapField(on ? this.passField! : this.textField!);
    } else if (this.phone && !on) {
      // A keyboard of our own (no swapped field): as the swap does, a half-typed password
      // never stays in the line once it is shown again.
      this.input.value = '';
    }
    this.input.classList.toggle('wc-masked', on);
    this.mask.hidden = !on;
    if (on) {
      // Never let a recalled command sit in a password field.
      this.input.value = '';
      this.endBrowsing();
    }
    this.updateMask();
    this.scheduleCaret();
  }

  /** Enter empties the line instead of leaving the sent text selected. */
  setAutoClear(on: boolean): void {
    this.autoClear = on;
  }

  /** Shows the greyed history suggestion (applies at the next frame). */
  setAutosuggest(on: boolean): void {
    if (on === this.autosuggest) return;
    this.autosuggest = on;
    this.scheduleCaret();
  }

  /**
   * The suggestion's rest as it stands now ('' when none shows): option
   * on, not masked, not browsing, caret at the end with nothing selected.
   */
  suggestion(): string {
    if (!this.autosuggest || this.password || this.kept || this.browseIndex >= 0) return '';
    const i = this.input;
    const n = i.value.length;
    if (i.selectionStart !== n || i.selectionEnd !== n) return '';
    return suggestFrom(this.history, i.value);
  }

  isPasswordMode(): boolean {
    return this.password;
  }

  // ------------------------------------------- own keyboard (ADR 0138 §2, §3)

  /**
   * The line is typed in from an on-screen keyboard of our own: its fields
   * (the one in place, the phone's other one, and any made later) ask the
   * device for no keyboard. Caret, selection, paste and a physical
   * keyboard work as before.
   */
  setOwnKeyboard(on: boolean): void {
    if (on === this.ownKeyboard) return;
    this.ownKeyboard = on;
    if (!on) this.setKept(false);
    for (const f of new Set([this.field, this.textField, this.passField])) if (f) markOwnKeyboard(f, on);
    // At a password prompt already: the masked line is the textarea with our keyboard (see the
    // file header), the swapped-in password field without. What was typed so far goes along.
    if (this.phone && this.password && this.textField) {
      const typed = this.input.value;
      if (!on) this.passField ??= this.makeField('password') as HTMLInputElement;
      const next = on ? this.textField : this.passField!;
      if (next !== this.field) {
        this.input.classList.remove('wc-masked');
        this.swapField(next);
        next.value = typed;
        next.classList.add('wc-masked');
        this.updateMask();
        this.scheduleCaret();
      }
    }
  }

  /**
   * The line has a text size of its own, not the cockpit's (the phone's
   * game layout, stage 53 round 53j: the field is a fixed 44 px high, so its
   * text does not follow the font size setting). The pane is marked
   * `wc-input-own-font` (the owner's CSS sets the size on it), and the
   * caret, the suggestion and the password's bullets are placed with the
   * cell width measured in that font, published as `--cell-w` on the pane.
   * A hidden run of text in the pane is observed for its size, so a font
   * that loads late or a changed font family is followed without polling.
   */
  setOwnFont(on: boolean): void {
    if (on === this.ownFont) return;
    this.ownFont = on;
    this.el.classList.toggle('wc-input-own-font', on);
    this.ownFontWatch?.disconnect();
    this.ownFontWatch = null;
    this.ownFontProbe?.remove();
    this.ownFontProbe = null;
    this.ownCellW = 0;
    this.el.style.removeProperty('--cell-w');
    if (on) {
      const probe = this.doc.createElement('span');
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;white-space:pre;left:0;top:0';
      probe.textContent = 'M'.repeat(OWN_FONT_RUN);
      this.el.appendChild(probe);
      this.ownFontProbe = probe;
      const read = (): void => {
        const w = probe.getBoundingClientRect().width / OWN_FONT_RUN;
        // (No size while the row is not shown: the last one stands.)
        if (!(w > 0) || w === this.ownCellW) return;
        this.ownCellW = w;
        this.el.style.setProperty('--cell-w', `${w}px`);
        this.scheduleCaret();
      };
      const RO = this.doc.defaultView?.ResizeObserver;
      if (RO) {
        this.ownFontWatch = new RO(read);
        this.ownFontWatch.observe(probe);
      }
      read();
    }
    this.scheduleCaret();
  }

  /** Types `text` at the caret, over the selection if there is one (one line: as a paste). */
  insertText(text: string): void {
    const i = this.input;
    const n = i.value.length;
    this.revealCaret = true;
    this.takeKept();
    this.edit(i.selectionStart ?? n, i.selectionEnd ?? n, normalizePaste(text));
  }

  /** Backspace: deletes the selection, or the character before the caret (a whole grapheme cluster: `graphemeStartBefore`). */
  deleteBackward(): void {
    this.revealCaret = true;
    this.takeKept();
    this.deleteBack(graphemeStartBefore);
    this.scheduleCaret();
  }

  /**
   * Scrolls a long line so the caret is in view, as the browser does for a
   * typed key (it does not for `setRangeText`). In the caret's animation
   * frame, never in a key's handler; the caret is at `col` cells.
   */
  private scrollToCaret(col: number): void {
    const i = this.input;
    if (i.scrollWidth <= i.clientWidth) return;
    const cw = this.cellWidth();
    const x = col * cw;
    // A few cells of margin stand in for the field's padding.
    const lo = Math.max(0, x - cw);
    const hi = x + 3 * cw - i.clientWidth;
    if (i.selectionEnd === i.value.length) i.scrollLeft = i.scrollWidth;
    else if (i.scrollLeft > lo) i.scrollLeft = lo;
    else if (i.scrollLeft < hi) i.scrollLeft = hi;
  }

  /**
   * The history from the own keyboard's arrows: one entry older or newer,
   * as the Up and Down keys (`historyUp` / `historyDown`), and the caret
   * follows. Nothing in password mode: a password prompt has no history.
   */
  historyStep(dir: 'up' | 'down'): void {
    if (this.password) return;
    if (dir === 'up') this.historyUp();
    else this.historyDown();
    this.scheduleCaret();
  }

  /** Enter in the line: `submit`, and the caret follows (as after the key). */
  submitLine(): void {
    this.submit();
    this.scheduleCaret();
  }

  /** Asks "Leave page?" on unload while `on` (i.e. while connected). */
  setLeaveGuard(on: boolean): void {
    if (on === this.leaveGuard) return;
    this.leaveGuard = on;
    const win = this.doc.defaultView;
    if (!win) return;
    if (on) win.addEventListener('beforeunload', this.onBeforeUnload);
    else win.removeEventListener('beforeunload', this.onBeforeUnload);
  }

  dispose(): void {
    this.blinkObserver?.disconnect();
    this.ownFontWatch?.disconnect();
    this.stopBlink();
    for (const u of this.unsubs) u();
    this.setLeaveGuard(false);
    this.doc.removeEventListener('keydown', this.onKeyDown, true);
    this.doc.removeEventListener('keyup', this.onKeyUp, true);
    this.doc.removeEventListener('selectionchange', this.onSelectionChange);
    this.doc.removeEventListener('mouseup', this.onDocMouseUp);
    this.doc.defaultView?.removeEventListener('focus', this.onWindowFocus);
    this.el.remove();
  }

  // ------------------------------------------------------------------ enter

  /** Enter: sends the buffer (Inv §1.2 Enter semantics). */
  submit(): void {
    const text = this.input.value;
    this.setKept(false);

    if (this.password) {
      this.opts.sender.sendCommand(text, { secret: true });
      this.snapToTail();
      this.input.value = '';
      this.updateMask();
      this.endBrowsing();
      return;
    }

    const handled = this.opts.onCommand?.(text) ?? false;
    if (!handled) this.opts.sender.sendCommand(text);
    this.snapToTail();
    if (text !== '') {
      const h = this.history;
      if (h[h.length - 1] !== text) {
        h.push(text);
        // Browsing has not started yet (it ends on every Enter), so no
        // index needs to shift with the dropped entries.
        if (h.length > MAX_HISTORY) h.splice(0, h.length - MAX_HISTORY);
      }
      if (this.autoClear) {
        this.input.value = '';
      } else {
        this.input.value = text;
        this.input.setSelectionRange(0, text.length);
        this.keepIfBlurred();
      }
    }
    this.endBrowsing();
  }

  /**
   * Back to the live tail after a send. Not scrolled back, the output's
   * next flush keeps the tail anyway, so the layout read is skipped. While
   * the split shows the live tail (desktop, ADR 0117) the view stays: the
   * player reads old text and keeps playing; Esc, PgDn and scrolling down
   * return.
   */
  private snapToTail(): void {
    const out = this.opts.output;
    if (out?.isScrolled() && !out.isSplit?.()) out.toTail();
  }

  // ---------------------------------------------------------------- history

  private endBrowsing(): void {
    this.browseIndex = -1;
    this.draft = '';
    this.draftRestored = false;
  }

  private show(text: string): void {
    this.setKept(false);
    this.input.value = text;
    this.input.setSelectionRange(0, text.length);
    this.keepIfBlurred();
    this.scheduleCaret();
  }

  /** Up: one older history entry (Inv §1.2). */
  historyUp(): void {
    const h = this.history;
    if (h.length === 0 || this.password) return;
    if (this.browseIndex >= 0) {
      this.browseIndex = Math.max(0, this.browseIndex - 1);
      this.show(h[this.browseIndex]!);
      return;
    }
    const newest = h.length - 1;
    this.draftRestored = false;
    if (this.isRecallState() && this.input.value === h[newest]) {
      // Just sent: the newest entry is already on screen, go one further.
      this.draft = '';
      this.browseIndex = Math.max(0, newest - 1);
    } else {
      this.draft = this.input.value;
      this.browseIndex = newest;
    }
    this.show(h[this.browseIndex]!);
  }

  /** Down: one newer entry, then the draft, then an empty line. */
  historyDown(): void {
    if (this.password) return;
    // What Down writes is never the kept line (an entry goes through `show`; the empty line and
    // the draft are written here). Not browsing, Down does nothing and a kept line stays kept,
    // as the selected sent line stays selected.
    if (this.draftRestored) {
      this.setKept(false);
      this.input.value = '';
      this.endBrowsing();
      return;
    }
    if (this.browseIndex < 0) return;
    if (this.browseIndex < this.history.length - 1) {
      this.browseIndex++;
      this.show(this.history[this.browseIndex]!);
      return;
    }
    const draft = this.draft;
    this.endBrowsing();
    this.setKept(false);
    this.input.value = draft;
    this.input.setSelectionRange(draft.length, draft.length);
    this.draftRestored = true;
  }

  // ------------------------------------------------------------------- keys

  private isOtherInteractive(t: EventTarget | null): boolean {
    if (t === this.input || !t || !(t as Element).tagName) return false;
    const el = t as HTMLElement;
    const tag = el.tagName;
    return (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      tag === 'BUTTON' ||
      el.isContentEditable === true ||
      el.closest?.(`[${OWN_KEYS_ATTR}]`) != null
    );
  }

  /**
   * Tab (or Shift+Tab) with the focus on a stray spot (ADR 0108): the
   * page's body, or a control in `scope` that is not a text field and not
   * inside an element that owns its keys (a popup, a window).
   */
  private strayTab(e: KeyboardEvent): boolean {
    if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey) return false;
    const t = e.target as HTMLElement | null;
    if (!t || t === this.input || !t.tagName) return false;
    const doc = this.doc;
    // Without a scope the whole page; a hidden cockpit has none.
    const scope = this.opts.scope ? this.opts.scope() : doc.body;
    if (!scope) return false;
    if (t === doc.body || t === doc.documentElement) return true;
    const tag = t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable === true) return false;
    if (t.closest?.(`[${OWN_KEYS_ATTR}]`) != null) return false;
    return scope.contains(t);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    // A key our own keyboard sent to a field of a page (ADR 0139 §4): not the line's, and no physical Enter.
    if (isOwnKey(e)) return;
    if (e.key === 'Enter') this.enterDown = true;
    // A line taken off the page handles no keys.
    if (e.defaultPrevented || !this.input.isConnected) return;
    const dead = e.key === 'Dead';
    if (!dead) {
      // Real IME composition: the keys belong to the IME.
      if (e.isComposing) return;
      // A plain key outside a composition: any consumed dead key is over.
      this.deadSnap = null;
      this.deadEcho = null;
    }
    learnKeyLabel(e);
    if (this.strayTab(e)) {
      // A stray focus (ADR 0108): the keys go back to the line, nothing else.
      e.preventDefault();
      this.input.focus({ preventScroll: true });
      return;
    }
    if (this.isOtherInteractive(e.target)) return;
    const away = this.doc.activeElement !== this.input && !e.isComposing;
    if (!dead) {
      // A macro sends before the refocus (send first). It may move the
      // focus itself (an overlay); only take it back if it did not.
      const before = this.doc.activeElement;
      if (this.runMacro(e)) {
        e.preventDefault();
        if (away && this.doc.activeElement === before) this.input.focus({ preventScroll: true });
        return;
      }
    }
    if (away) {
      // Keystrokes typed while focus is elsewhere land in the input: moving
      // focus during keydown redirects the resulting character.
      this.input.focus({ preventScroll: true });
    }
    if (dead) {
      this.onDeadKey(e);
      return;
    }
    if (this.handleKey(e)) e.preventDefault();
    // After the key's work (and any send); the default action moves the
    // selection later and fires selectionchange, which schedules again.
    this.scheduleCaret();
  };

  /**
   * A dead keydown, composing or not. Firefox's second keydown for a
   * dead key a macro already consumed is dropped. A bound one runs its
   * macro and starts the guard that undoes the composition it opens. An
   * unbound one composes as usual (´ then e → é).
   */
  private onDeadKey(e: KeyboardEvent): void {
    if (this.deadEcho === e.code && !e.repeat) {
      e.preventDefault();
      return;
    }
    const snap = this.deadSnap ?? this.snapshot();
    if (this.runMacro(e)) {
      e.preventDefault();
      this.deadSnap = snap;
      this.deadEcho = e.code;
      // Already composing (an earlier dead key): end it now.
      if (e.isComposing) this.cancelComposition();
      return;
    }
    if (this.deadSnap && this.deadEcho === null) {
      // An unbound dead key after a consumed one was released: close what
      // is left of the old composition and let this one compose.
      if (e.isComposing) this.cancelComposition();
      this.deadSnap = null;
    }
  }

  private snapshot(): NonNullable<InputPane['deadSnap']> {
    const i = this.input;
    return {
      value: i.value,
      start: i.selectionStart ?? i.value.length,
      end: i.selectionEnd ?? i.value.length,
      dir: i.selectionDirection ?? 'none',
    };
  }

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (isOwnKey(e)) return;
    if (e.key === 'Enter') this.enterDown = false;
    if (e.code === this.deadEcho) this.deadEcho = null;
  };

  /**
   * Phone textarea: a line break never lands in the line. One that no
   * Enter keydown handled (an on-screen keyboard's Enter can come as a
   * bare `insertLineBreak`) sends, as Enter does; after a keydown Enter
   * (Shift+Enter on a hardware keyboard) it is just dropped, as an <input>
   * drops it.
   */
  private readonly onBeforeInput = (e: InputEvent): void => {
    // A kept line: what is typed or pasted replaces it, a deletion clears it (Enter sends it as it is).
    if (this.kept && e.inputType !== 'insertLineBreak' && e.inputType !== 'insertParagraph' && /^(insert|delete)/.test(e.inputType)) this.takeKept();
    if (e.inputType !== 'insertLineBreak' && e.inputType !== 'insertParagraph') return;
    e.preventDefault();
    if (this.enterDown) {
      this.enterDown = false;
      return;
    }
    this.submit();
    this.scheduleCaret();
  };

  /** compositionstart/update: a consumed dead key's accent must not land. */
  private readonly onComposition = (): void => {
    if (this.deadSnap) this.cancelComposition();
  };

  private readonly onCompositionEnd = (): void => {
    if (!this.deadSnap) return;
    this.restoreSnapshot();
    // Firefox may start another composition for the repeated keydown;
    // keep guarding until the key is released. Firefox sends the final
    // `input` after compositionend, so the guard ends a task later.
    if (this.deadEcho === null && !this.cancellingComposition) {
      const snap = this.deadSnap;
      setTimeout(() => {
        if (this.deadSnap === snap && this.deadEcho === null) this.deadSnap = null;
      }, 0);
    }
  };

  /**
   * Ends the open composition and puts the line back. Blurring the field
   * makes Firefox and Chrome end the composition; focus returns at once.
   */
  private cancelComposition(): void {
    if (this.cancellingComposition) return;
    this.cancellingComposition = true;
    try {
      if (this.doc.activeElement === this.input) {
        this.input.blur();
        this.input.focus({ preventScroll: true });
      }
    } finally {
      this.cancellingComposition = false;
    }
    this.restoreSnapshot();
  }

  private restoreSnapshot(): void {
    const s = this.deadSnap;
    if (!s) return;
    const i = this.input;
    if (i.value !== s.value) i.value = s.value;
    if (i.selectionStart !== s.start || i.selectionEnd !== s.end) i.setSelectionRange(s.start, s.end, s.dir);
    this.updateMask();
    this.scheduleCaret();
  }

  /** Runs the macro bound to the key, if any. */
  private runMacro(e: KeyboardEvent): boolean {
    const hook = this.opts.onMacroKey;
    if (!hook || this.password) return false;
    if (e.getModifierState?.('AltGraph')) return false;
    const name = keyNameFromEvent(e);
    return name !== null && hook(name);
  }

  /** Handles a key; returns true when it consumed it. */
  handleKey(e: KeyboardEvent): boolean {
    const ctrl = e.ctrlKey && !e.altKey && !e.metaKey;
    const alt = e.altKey && !e.ctrlKey && !e.metaKey;
    const plain = !e.ctrlKey && !e.altKey && !e.metaKey;
    const out = this.opts.output;
    // A caret key in a kept line (a physical keyboard): ordinary text from here.
    if (this.kept && KEPT_CARET_KEYS.has(e.key)) this.setKept(false);

    switch (e.key) {
      case 'Enter':
        if (plain && !e.shiftKey) {
          this.submit();
          return true;
        }
        return false;
      case 'Escape':
        if (!plain) return false;
        if (out?.isScrolled()) out.toTail();
        else this.opts.onEscape?.();
        return true;
      case 'PageUp':
        if (!plain) return false;
        out?.pageUp();
        return true;
      case 'PageDown':
        if (!plain) return false;
        out?.pageDown();
        return true;
      case 'ArrowUp':
        if (!plain) return false;
        if (e.shiftKey) {
          this.setKept(false);
          this.selectToStart();
        } else this.historyUp();
        return true;
      case 'ArrowDown':
        if (!plain) return false;
        if (e.shiftKey) {
          this.setKept(false);
          this.selectToEnd();
        } else this.historyDown();
        return true;
      case 'ArrowRight':
      case 'End':
        // At the end of the line: take the whole suggestion (not sent).
        if (plain && !e.shiftKey && this.autosuggest) {
          const rest = this.suggestion();
          if (rest === '') return false;
          const n = this.input.value.length;
          this.edit(n, n, rest);
          return true;
        }
        return false;
      case 'Tab': {
        // Never a focus move (ADR 0108): one word of the suggestion, or nothing.
        if (!plain) return false;
        const rest = e.shiftKey ? '' : this.suggestion();
        if (rest !== '') {
          const n = this.input.value.length;
          this.edit(n, n, nextSuggestedWord(rest));
        }
        return true;
      }
      case 'Backspace':
        if (alt) {
          // (A kept line goes whole, as the selected sent line does.)
          this.takeKept();
          this.deleteBack(wordStartBefore);
          return true;
        }
        return false;
    }

    if (ctrl && !e.shiftKey) {
      switch (e.code) {
        case 'KeyA':
          this.setKept(false);
          this.input.setSelectionRange(0, this.input.value.length);
          return true;
        case 'KeyE': {
          this.setKept(false);
          const n = this.input.value.length;
          this.input.setSelectionRange(n, n);
          return true;
        }
        case 'KeyW':
          this.takeKept();
          this.deleteBack(spaceWordStartBefore);
          return true;
        case 'KeyD':
          return true; // no-op, and keeps the bookmark dialog away
      }
      return false;
    }

    if (alt && !e.shiftKey) {
      const v = this.input.value;
      const caret = this.caret();
      switch (e.code) {
        case 'KeyB': {
          this.setKept(false);
          const p = wordStartBefore(v, caret);
          this.input.setSelectionRange(p, p);
          return true;
        }
        case 'KeyF': {
          this.setKept(false);
          const p = wordEndAfter(v, caret);
          this.input.setSelectionRange(p, p);
          return true;
        }
        case 'KeyD': {
          const p = wordEndAfter(v, caret);
          if (p > caret) this.edit(caret, p, '');
          return true;
        }
      }
    }
    return false;
  }

  private caret(): number {
    const i = this.input;
    return (i.selectionDirection === 'backward' ? i.selectionStart : i.selectionEnd) ?? 0;
  }

  private selectToStart(): void {
    this.input.setSelectionRange(0, this.caret(), 'backward');
  }

  private selectToEnd(): void {
    this.input.setSelectionRange(this.caret(), this.input.value.length, 'forward');
  }

  private deleteBack(find: (s: string, pos: number) => number): void {
    const i = this.input;
    const s = i.selectionStart ?? 0;
    const en = i.selectionEnd ?? 0;
    if (s !== en) {
      this.edit(s, en, '');
      return;
    }
    const p = find(i.value, s);
    if (p < s) this.edit(p, s, '');
  }

  /** Replaces [start, end) with `text`, caret after it; counts as an edit. */
  private edit(start: number, end: number, text: string): void {
    this.input.setRangeText(text, start, end, 'end');
    this.afterEdit();
  }

  private afterEdit(): void {
    this.endBrowsing();
    this.updateMask();
    this.scheduleCaret();
  }

  private readonly onInput = (e: Event): void => {
    if (this.deadSnap) {
      // The accent of a consumed dead key: undo it, and end the
      // composition if one is still open.
      if ((e as InputEvent).isComposing) this.cancelComposition();
      else this.restoreSnapshot();
      return;
    }
    // Phone textarea: whatever brought a newline in (an IME commit,
    // autofill) is made one line, as a paste is.
    const f = this.input;
    if (f.tagName === 'TEXTAREA' && /[\r\n]/.test(f.value)) {
      const pos = f.selectionStart ?? f.value.length;
      const head = normalizePaste(f.value.slice(0, pos));
      f.value = normalizePaste(f.value);
      const at = Math.min(head.length, f.value.length);
      f.setSelectionRange(at, at);
    }
    this.afterEdit();
  };

  private readonly onPaste = (e: ClipboardEvent): void => {
    const data = e.clipboardData?.getData('text/plain');
    if (data === undefined) return;
    e.preventDefault();
    const i = this.input;
    this.takeKept();
    this.edit(i.selectionStart ?? 0, i.selectionEnd ?? 0, normalizePaste(data));
  };

  private readonly onCopyCut = (e: ClipboardEvent): void => {
    if (this.password) e.preventDefault();
  };

  private updateMask(): void {
    if (!this.password) return;
    this.mask.textContent = BULLET.repeat(this.input.value.length);
  }

  // ------------------------------------------------------------------ focus

  private readonly onDocMouseUp = (e: MouseEvent): void => {
    if (this.isOtherInteractive(e.target)) return;
    // A script pane's text field a link just focused (links fire on pointerup, before this) keeps it.
    if ((this.doc.activeElement as HTMLElement | null)?.classList?.contains('wc-spane-field')) return;
    const sel = this.doc.getSelection();
    // A selection elsewhere is being copied; leave it until the pane that
    // owns it hands focus back.
    if (sel && !sel.isCollapsed && !this.el.contains(sel.anchorNode)) return;
    this.focus();
  };

  private readonly onWindowFocus = (): void => {
    // A script pane's text field that had the focus keeps it (ADR 0055).
    if (this.isOtherInteractive(this.doc.activeElement)) return;
    this.focus();
  };

  // ------------------------------------------------------------------ caret

  /** A password typed from our own keyboard on a phone: no range is ever selected (file header). */
  private readonly collapseMasked = (): void => {
    if (!this.password || !this.ownKeyboard || !this.phone) return;
    const i = this.input;
    const end = i.selectionEnd ?? i.value.length;
    if (i.selectionStart !== end) i.setSelectionRange(end, end);
  };

  private readonly onSelectionChange = (): void => {
    this.collapseMasked();
    if (this.doc.activeElement === this.input) this.scheduleCaret();
  };

  /** Updates the caret in the next animation frame (coalesced). */
  readonly scheduleCaret = (): void => {
    if (this.caretScheduled) return;
    this.caretScheduled = true;
    this.requestFrame(() => {
      this.caretScheduled = false;
      this.updateCaret();
    });
  };

  private cellWidth(): number {
    if (this.ownFont && this.ownCellW > 0) return this.ownCellW;
    const w = this.opts.cellWidth?.();
    if (w && w > 0) return w;
    // Fallback: measure the pane's own font once per call site.
    if (!this.measurer) {
      this.measurer = this.doc.createElement('span');
      this.measurer.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;left:0;top:0';
      this.measurer.textContent = 'MMMMMMMMMM';
      this.el.appendChild(this.measurer);
    }
    return this.measurer.getBoundingClientRect().width / 10;
  }

  /**
   * Positions the caret now: hidden while a range is selected, hollow
   * (block) or hidden (beam/underline) while the input is blurred.
   */
  updateCaret(): void {
    const i = this.input;
    const c = this.caretEl;
    const start = i.selectionStart ?? 0;
    const end = i.selectionEnd ?? 0;
    if (this.revealCaret) {
      this.revealCaret = false;
      if (start === end) this.scrollToCaret(cellsBefore(i.value, start));
    }
    const scroll = i.scrollLeft;
    // The bullets follow a long line's scroll inside the mask, which stays on the field and clips
    // them there, as the suggestion does (a mask moved as a whole took its clip along: the
    // bullets left the field at its start and the last ones were cut off at its end).
    if (this.password && scroll !== this.maskScroll) {
      this.maskScroll = scroll;
      this.mask.style.textIndent = scroll ? `${-scroll}px` : '';
    }
    // Nothing to do with the option off and no ghost left on screen.
    const ghost = this.autosuggest || this.ghostText !== '' ? this.updateGhost(scroll) : '';
    if (start !== end) {
      c.hidden = true;
      this.stopBlink();
      return;
    }
    const v = i.value;
    // Columns count code points, so a surrogate pair is one cell.
    const before = v.slice(0, start);
    let col = before.length;
    for (let k = 0; k < before.length; k++) {
      const cc = before.charCodeAt(k);
      if (cc >= 0xd800 && cc <= 0xdbff) col--;
    }
    const x = col * this.cellWidth() - scroll;
    // At the end the caret covers the suggestion's first character.
    const cp = v.codePointAt(start) ?? ghost.codePointAt(0);
    const ch = cp === undefined ? ' ' : this.password ? BULLET : String.fromCodePoint(cp);
    c.classList.toggle('wc-blurred', this.doc.activeElement !== i);
    if (x !== this.caretX) {
      this.caretX = x;
      c.style.transform = `translateX(${x}px)`;
    }
    if (ch !== this.caretText) {
      this.caretText = ch;
      c.textContent = ch;
    }
    c.hidden = false;
    // Visible right after every move or edit, then blinking again.
    this.restartBlink();
  }

  /** Draws (or hides) the suggestion after the line; returns its text. */
  private updateGhost(scroll: number): string {
    const g = this.ghostEl;
    const rest = this.suggestion();
    if (rest !== this.ghostText) {
      this.ghostText = rest;
      g.textContent = rest;
      g.hidden = rest === '';
    }
    if (rest === '') return '';
    const v = this.input.value;
    let col = v.length;
    for (let k = 0; k < v.length; k++) {
      const cc = v.charCodeAt(k);
      if (cc >= 0xd800 && cc <= 0xdbff) col--;
    }
    const x = col * this.cellWidth() - scroll;
    if (x !== this.ghostX) {
      this.ghostX = x;
      g.style.textIndent = `${x}px`;
    }
    return rest;
  }

  /** True while the caret should blink (see the header). */
  private blinks(): boolean {
    return (
      !this.caretEl.hidden &&
      this.doc.activeElement === this.input &&
      this.doc.documentElement.dataset.cursorBlink === 'on'
    );
  }

  /** Shows the caret and starts a new blink cycle, or stops it. */
  private restartBlink(): void {
    this.stopBlink();
    if (!this.blinks()) return;
    this.blinkTimer = setInterval(() => {
      // A safety net: blur, selection and setting changes stop it earlier.
      if (this.blinks()) this.caretEl.classList.toggle('wc-caret-off');
      else this.stopBlink();
    }, BLINK_MS);
  }

  private stopBlink(): void {
    if (this.blinkTimer !== null) {
      clearInterval(this.blinkTimer);
      this.blinkTimer = null;
    }
    // Only when set: a class write restyles the caret even if it changes nothing.
    const cl = this.caretEl.classList;
    if (cl.contains('wc-caret-off')) cl.remove('wc-caret-off');
  }

  private readonly onBeforeUnload = (e: BeforeUnloadEvent): void => {
    e.preventDefault();
    // Older Chrome needs returnValue set.
    e.returnValue = '';
  };
}
