// Input pane: the one-row command line (Inv §1.2, §1.3, spec §2.2).
//
// Decisions (see the report for the stage file):
// - Native <input type="text">; the browser supplies caret, selection,
//   printable-key-replaces-selection, Backspace/Delete-clears-selection and
//   arrows-deselect. We add Enter, history, word keys and focus handling.
// - Password mode keeps type="text" (a type="password" field makes Firefox
//   and Chrome offer to save the password) and masks by making the text
//   transparent and drawing one bullet per character over it. Copy and cut
//   are blocked while masked.
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
//   to the live tail follows the send and only runs while scrolled back. A
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

import type { Bus } from '../core/bus';
import type { Sender } from '../core/types';
import { keyNameFromEvent, learnKeyLabel } from '../script/keys';

/** What the input pane needs from the output pane. */
export interface ScrollTarget {
  pageUp(): void;
  pageDown(): void;
  toTail(): void;
  isScrolled(): boolean;
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
}

const BULLET = '•';

/** Half a blink cycle: the caret is on 500 ms, off 500 ms. */
export const BLINK_MS = 500;

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

/** Paste normalisation: one line, newlines become spaces. */
export function normalizePaste(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\n+$/, '')
    .replace(/\n+/g, ' ');
}

export class InputPane {
  readonly el: HTMLDivElement;
  readonly input: HTMLInputElement;
  private readonly mask: HTMLSpanElement;
  /** The custom caret element. */
  readonly caretEl: HTMLSpanElement;
  /** The clock strip at the right end (8 cells; src/ui/clock-strip.ts draws it). */
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
    this.input = doc.createElement('input');
    this.input.type = 'text';
    this.input.className = 'wc-input-field';
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    this.input.setAttribute('autocapitalize', 'off');
    this.input.setAttribute('autocorrect', 'off');
    this.input.setAttribute('aria-label', 'Command');
    // A random name keeps form-history/autofill heuristics from matching.
    this.input.name = 'wc-cmd-' + Math.random().toString(36).slice(2);
    this.mask = doc.createElement('span');
    this.mask.className = 'wc-input-mask';
    this.mask.hidden = true;
    this.caretEl = doc.createElement('span');
    this.caretEl.className = 'wc-caret';
    this.caretEl.setAttribute('aria-hidden', 'true');
    this.caretEl.hidden = true;
    wrap.append(this.input, this.mask, this.caretEl);
    const clock = doc.createElement('span');
    clock.className = 'wc-input-clock';
    this.clockEl = clock;
    this.el.append(prompt, wrap, clock);
    root.appendChild(this.el);

    this.input.addEventListener('input', this.onInput);
    this.input.addEventListener('compositionstart', this.onComposition);
    this.input.addEventListener('compositionupdate', this.onComposition);
    this.input.addEventListener('compositionend', this.onCompositionEnd);
    this.input.addEventListener('paste', this.onPaste);
    this.input.addEventListener('copy', this.onCopyCut);
    this.input.addEventListener('cut', this.onCopyCut);
    this.input.addEventListener('focus', this.scheduleCaret);
    this.input.addEventListener('blur', this.scheduleCaret);
    this.input.addEventListener('scroll', this.scheduleCaret);
    this.input.addEventListener('select', this.scheduleCaret);
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

  // ----------------------------------------------------------------- public

  /** Focuses the input (call after overlays close). */
  focus(): void {
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

  /** True while the whole non-empty buffer is selected (recall state). */
  isRecallState(): boolean {
    const i = this.input;
    return i.value.length > 0 && i.selectionStart === 0 && i.selectionEnd === i.value.length;
  }

  /** Masks the input and sends without history (server echo = password). */
  setPasswordMode(on: boolean): void {
    if (on === this.password) return;
    this.password = on;
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

  isPasswordMode(): boolean {
    return this.password;
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
      if (this.history[this.history.length - 1] !== text) this.history.push(text);
      this.input.value = text;
      this.input.setSelectionRange(0, text.length);
    }
    this.endBrowsing();
  }

  /**
   * Back to the live tail after a send. Not scrolled back, the output's
   * next flush keeps the tail anyway, so the layout read is skipped.
   */
  private snapToTail(): void {
    const out = this.opts.output;
    if (out?.isScrolled()) out.toTail();
  }

  // ---------------------------------------------------------------- history

  private endBrowsing(): void {
    this.browseIndex = -1;
    this.draft = '';
    this.draftRestored = false;
  }

  private show(text: string): void {
    this.input.value = text;
    this.input.setSelectionRange(0, text.length);
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
    if (this.draftRestored) {
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
      el.isContentEditable === true
    );
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.defaultPrevented) return;
    const dead = e.key === 'Dead';
    if (!dead) {
      // Real IME composition: the keys belong to the IME.
      if (e.isComposing) return;
      // A plain key outside a composition: any consumed dead key is over.
      this.deadSnap = null;
      this.deadEcho = null;
    }
    learnKeyLabel(e);
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
    if (e.code === this.deadEcho) this.deadEcho = null;
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
        if (e.shiftKey) this.selectToStart();
        else this.historyUp();
        return true;
      case 'ArrowDown':
        if (!plain) return false;
        if (e.shiftKey) this.selectToEnd();
        else this.historyDown();
        return true;
      case 'Backspace':
        if (alt) {
          this.deleteBack(wordStartBefore);
          return true;
        }
        return false;
    }

    if (ctrl && !e.shiftKey) {
      switch (e.code) {
        case 'KeyA':
          this.input.setSelectionRange(0, this.input.value.length);
          return true;
        case 'KeyE': {
          const n = this.input.value.length;
          this.input.setSelectionRange(n, n);
          return true;
        }
        case 'KeyW':
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
          const p = wordStartBefore(v, caret);
          this.input.setSelectionRange(p, p);
          return true;
        }
        case 'KeyF': {
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
    this.afterEdit();
  };

  private readonly onPaste = (e: ClipboardEvent): void => {
    const data = e.clipboardData?.getData('text/plain');
    if (data === undefined) return;
    e.preventDefault();
    const i = this.input;
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
    const sel = this.doc.getSelection();
    // A selection elsewhere is being copied; leave it until the pane that
    // owns it hands focus back.
    if (sel && !sel.isCollapsed && !this.el.contains(sel.anchorNode)) return;
    this.focus();
  };

  private readonly onWindowFocus = (): void => {
    this.focus();
  };

  // ------------------------------------------------------------------ caret

  private readonly onSelectionChange = (): void => {
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
    const scroll = i.scrollLeft;
    if (this.password) this.mask.style.transform = scroll ? `translateX(${-scroll}px)` : '';
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
    const cp = v.codePointAt(start);
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
