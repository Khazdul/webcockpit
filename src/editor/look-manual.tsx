// The lantern manual reader (stage 42, ADR 0127): one DOM reader for the
// profile manual (`helpSections()`, the profile editor's Help, 43) and the
// script manual (`scriptManualSections()`, 44). Package 42e owns this file
// (and look-manual.css).
//
// `contents: 'own'` draws the grouped, folding contents list at the left
// (an overlay under 700 px); `'none'` leaves it to the host (the profile
// editor's rail uses `ManualContents`). `find: 'head'` keeps the find field
// in the head (the script manual A); `'bar'` opens it with Ctrl+F (the
// profile Help).
//
// Keys (both hosts): ↑↓ scroll (or the contents when it has the keys),
// PgUp / PgDn, Space / Enter a page, Home / End, n / p next / previous
// heading, Tab switches contents ↔ text, Ctrl+F find (Enter / F3 / Ctrl+G
// next, Shift previous, Alt+C/W/R toggles), Esc: the contents overlay, then
// a non-empty find, then the host.
//
// Hooks: `.wc-lk-manual`, `.wc-lk-mtoc li[data-i]` (`.is-on`),
// `.wc-lk-mtext section[data-i]`, `.wc-lk-mfind input`, `.wc-search-count`.
//
// 42-0 stub: the sections as plain text, `goto` and the contents list; no
// keys and no find yet.

import type { ComponentChildren, VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { NavKey } from '../chrome/kit/nav';
import type { HelpSection } from './help';
import type { FindMemory } from './look-manual-find';

export interface ManualCtl {
  goto(i: number): void;
  section(): number;
  /** Handles a key (true = consumed). */
  key(e: KeyboardEvent, nk: NavKey | null): boolean;
  openFind(): void;
  findOpen(): boolean;
  /** Closes a non-empty find (true) or does nothing (false). */
  closeFind(): boolean;
}

export interface LookManualProps {
  sections: readonly HelpSection[];
  /** own: the contents list at the left (an overlay under 700 px). */
  contents: 'own' | 'none';
  /** head: always in the head (script manual A); bar: opened by Ctrl+F (profile Help). */
  find: 'head' | 'bar';
  /** Group id → label ("API reference"). */
  groups?: Readonly<Record<string, string>>;
  initial?: number;
  onSection?(i: number): void;
  ctl?(c: ManualCtl | null): void;
  /** Highlighted example lines (tt++ or Lua). */
  example?(line: string): ComponentChildren;
  /** A text that links to a section (the Lua index). */
  link?(text: string): number | null;
  /** The find query kept across opens. */
  memory?: FindMemory;
}

export interface ManualContentsProps {
  sections: readonly HelpSection[];
  groups?: Readonly<Record<string, string>>;
  current: number;
  onGo(i: number): void;
  counts?: boolean;
}

/** The grouped, folding contents list with counts and the current section lit. 42-0 stub: a flat list. */
export function ManualContents(p: ManualContentsProps): VNode {
  return (
    <nav class="wc-lk-mtoc" aria-label="Contents">
      <ul>
        {p.sections.map((s, i) => (
          <li key={i} data-i={i} class={i === p.current ? 'is-on' : undefined} onClick={() => p.onGo(i)}>
            {s.heading}
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The manual reader. 42-0 stub. */
export function LookManual(p: LookManualProps): VNode {
  const [cur, setCur] = useState(p.initial ?? 0);
  const text = useRef<HTMLDivElement>(null);
  const curRef = useRef(cur);
  curRef.current = cur;
  const goto = (i: number): void => {
    const n = Math.max(0, Math.min(p.sections.length - 1, i));
    setCur(n);
    p.onSection?.(n);
    text.current?.querySelector(`section[data-i="${n}"]`)?.scrollIntoView?.({ block: 'start' });
  };
  useEffect(() => {
    p.ctl?.({
      goto,
      section: () => curRef.current,
      key: () => false,
      openFind: () => {},
      findOpen: () => false,
      closeFind: () => false,
    });
    return () => p.ctl?.(null);
  }, []);
  return (
    <div class="wc-lk-manual">
      {p.contents === 'own' && <ManualContents sections={p.sections} groups={p.groups} current={cur} onGo={goto} />}
      <div class="wc-lk-mtext" ref={text}>
        {p.sections.map((s, i) => (
          <section key={i} data-i={i}>
            <h3>{s.heading}</h3>
            {s.syntax?.map((l, k) => (
              <pre key={'s' + k} class="wc-lk-mono">
                {l}
              </pre>
            ))}
            {s.text.map((t, k) => (
              <p key={'t' + k}>{t}</p>
            ))}
            {s.examples?.map((x, k) => (
              <pre key={'x' + k} class="wc-lk-mono">
                {p.example ? p.example(x.code) : x.code}
              </pre>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
