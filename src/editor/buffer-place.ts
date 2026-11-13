// Where a CodeMirror buffer was left (stage 57, ADR 0143): its selection
// and its scroll, kept in memory per key while the page lives, for the
// profile editor's Editor view (`profile:<name>`) and the script editor
// (`script:<name>`). Both make a new buffer at every open (the profile
// editor at every flip to Editor), and a `BufferKeeper` on it puts the
// place back and then follows the buffer.
//
// The scroll is kept as a text position, not as pixels from the top: the
// start of the line at the scroller's top and the px scrolled past the top
// of that line's text. CodeMirror estimates the heights of the lines it has
// not drawn, so a pixel offset is another place in a new buffer. Put back
// with `scrollIntoView(top, { y: 'start', yMargin: -off })`, which places
// that same text edge, so the round trip is exact.
//
// A place is clamped to the text it is put back into: a selection beyond
// the end is the end; a top line beyond the end is the end, unscrolled. A
// key that is gone (a script renamed or deleted) simply has no place.

import { EditorView } from '@codemirror/view';

/** A buffer's place: offsets into its text. */
export interface BufferPlace {
  /** The selection (a cursor when equal). */
  anchor: number;
  head: number;
  /** The start of the line at the top of the scroller. */
  top: number;
  /** The px scrolled past the top of that line's text (a few px negative inside the line's own padding). */
  off: number;
}

const buffers = new Map<string, BufferPlace>();

/** Remembers the place of the buffer `key`; `part` changes only what it names. */
export function keepBuffer(key: string, part: Partial<BufferPlace>): void {
  buffers.set(key, { anchor: 0, head: 0, top: 0, off: 0, ...buffers.get(key), ...part });
}

/** The place of the buffer `key`, fitted to a text of `length`; null when none is remembered. */
export function bufferOf(key: string, length: number): BufferPlace | null {
  const b = buffers.get(key);
  return b ? clampBuffer(b, length) : null;
}

/** Forgets every buffer's place (tests). */
export function forgetBuffers(): void {
  buffers.clear();
}

/** `b` inside a text of `length`: offsets clamped; a top beyond the end is the end, unscrolled. */
export function clampBuffer(b: BufferPlace, length: number): BufferPlace {
  const len = Math.max(0, length);
  const at = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.min(len, Math.trunc(n))) : 0);
  const beyond = !(b.top <= len);
  return {
    anchor: at(b.anchor),
    head: at(b.head),
    top: at(b.top),
    off: beyond || !Number.isFinite(b.off) ? 0 : Math.round(b.off),
  };
}

/**
 * Puts the remembered place back into a new buffer and follows it. Made
 * right after the view: the selection is set at once; the scroll waits for
 * `settle()` (the buffer needs a size), and nothing is kept before that, so
 * a new buffer's own first scroll reports never overwrite the place.
 */
export class BufferKeeper {
  /** The place still to put back; null: none was remembered; undefined: done. */
  private back: BufferPlace | null | undefined;

  /** `key`: read at every write (a script's name can change while its editor is open). */
  constructor(
    private readonly view: EditorView,
    private readonly key: () => string,
  ) {
    const was = bufferOf(key(), view.state.doc.length);
    this.back = was;
    if (was) view.dispatch({ selection: { anchor: was.anchor, head: was.head } });
    // Gone with the view's DOM.
    view.scrollDOM.addEventListener('scroll', () => this.scrolled(), { passive: true });
  }

  /** Call when the buffer may be shown with a size (after a render): puts the scroll back, once. */
  settle(): void {
    const b = this.back;
    if (b === undefined || this.view.scrollDOM.clientHeight === 0) return;
    this.back = undefined;
    if (b && (b.top > 0 || b.off > 0))
      this.view.dispatch({ effects: EditorView.scrollIntoView(b.top, { y: 'start', yMargin: -b.off }) });
  }

  /** The selection changed (the host's status callback). */
  selected(): void {
    if (this.back !== undefined) return;
    const sel = this.view.state.selection.main;
    keepBuffer(this.key(), { anchor: sel.anchor, head: sel.head });
  }

  private scrolled(): void {
    const v = this.view;
    const sc = v.scrollDOM;
    if (this.back !== undefined || sc.clientHeight === 0) return;
    const top = sc.getBoundingClientRect().top;
    const line = v.lineBlockAtHeight(Math.max(0, top - v.documentTop));
    const at = v.coordsAtPos(line.from);
    if (!at) return;
    const sel = v.state.selection.main;
    keepBuffer(this.key(), { anchor: sel.anchor, head: sel.head, top: line.from, off: Math.round(top - at.top) });
  }
}
