// The Editor view of the profile editor B (stage 43a, ADR 0128): the rail
// "In the text" (the first line of each kind of setting and the profile's
// own #nop headings, from the parsed text, recomputed after edits with a
// debounce) and the jumps a rail entry makes in the CodeMirror buffer
// (cm.ts with the lantern look; the buffer itself is the editor's).

import { EditorView } from '@codemirror/view';
import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { parseProfile } from '../../script/doc';
import { type TextSection, textSections } from '../logic';

const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ');

/** How long the text must rest before the rail's sections are read again (ms). */
export const SECTIONS_DEBOUNCE_MS = 250;

/**
 * The rail's sections of the buffer's text: read at once when `text()`
 * first gives one, then `SECTIONS_DEBOUNCE_MS` after the last `touch()`
 * (every buffer change calls it), and only when the text changed.
 */
export function useTextSections(text: () => string | null): { sections: TextSection[]; touch(): void; now(): void } {
  const [sections, setSections] = useState<TextSection[]>([]);
  const last = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const read = useRef(text);
  read.current = text;
  const now = (): void => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const t = read.current();
    if (t === null || t === last.current) return;
    last.current = t;
    setSections(textSections(parseProfile(t)));
  };
  const api = useRef({
    touch: (): void => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => api.now(), SECTIONS_DEBOUNCE_MS);
    },
    now,
  }).current;
  api.now = now;
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return { sections, touch: api.touch, now: api.now };
}

/** The section the buffer's cursor line is in (the last that starts at or above it), or -1. */
export function sectionAt(sections: readonly TextSection[], line: number): number {
  let at = -1;
  sections.forEach((s, i) => {
    if (s.line <= line) at = i;
  });
  return at;
}

/** Puts `line` (1-based) at the top of the buffer; with `cursor`, the cursor there too. */
export function showLine(view: EditorView, line: number, cursor: boolean): void {
  const doc = view.state.doc;
  const ln = doc.line(Math.max(1, Math.min(doc.lines, line)));
  view.dispatch({
    ...(cursor ? { selection: { anchor: ln.from } } : {}),
    effects: EditorView.scrollIntoView(ln.from, { y: 'start' }),
  });
}

/** The rail in Editor: "In the text" and the text's sections with their line numbers. */
export function TextRail(p: {
  sections: readonly TextSection[];
  /** The section the cursor is in (lit). */
  current: number;
  /** The keyboard's entry while the rail has the keys, else -1. */
  sel: number;
  onGo(line: number): void;
}): VNode {
  return (
    <>
      <div class="wc-pe-railh">In the text</div>
      {p.sections.length === 0 && <div class="wc-pe-rempty">Nothing yet</div>}
      {p.sections.map((s, i) => (
        <button
          type="button"
          key={`${s.line}-${s.label}`}
          class={cx('wc-pe-rit is-small', s.type === 'note' && 'is-note', i === p.current && 'is-on', i === p.sel && 'is-cur')}
          data-rail="text"
          data-line={s.line}
          tabIndex={-1}
          title={`Line ${s.line}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            p.onGo(s.line);
          }}
        >
          <span class="wc-pe-rlabel">{s.label}</span>
          <span class="wc-pe-rn">{s.line}</span>
        </button>
      ))}
    </>
  );
}
