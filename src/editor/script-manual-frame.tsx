// The script manual (stage 44c, ADR 0129; round 7 direction A "Boken"):
// the guide, the A–Z API reference and the Lua reference
// (script-reference.ts) in stage 42's lantern manual reader (`LookManual`,
// look-manual.tsx): the contents at the left (Guide open, the two
// references folded with their counts, the current section lit and
// following the scroll), the whole manual as one typeset text on the
// right, and the find always in the head. Under 700 px of the reader's
// width the contents hide behind a Contents button.
//
// Opened from the script editor (F1 at the name under the cursor:
// `manualSectionOf`) and from the Scripts page (Manual). Its places
// (stage 42): on the start page a large box (layout B) titled "Script
// Manual" with Back at the top left; in the in-game Scripts window the
// window's Lykta frame titled "Scripts" with the note "Manual", and a
// small Back (`InlineBack`) at the left of the head; on the phone's ESC
// menu a full-screen box. Esc goes back (after the reader's own Esc: a
// contents overlay, then a non-empty find), and the editor below keeps
// its buffer, cursor, undo history and search.
//
// Hooks: `.wc-sman` (the frame's root, the box), `.wc-sman-iback` (the
// head's Back in a window); the reader's are the kit's (`.wc-lk-manual`,
// `.wc-lk-mtoc li[data-i]`, `.wc-lk-mtext section[data-i]`,
// `.wc-lk-mfind input`, `.wc-search-count`).

import type { ComponentChildren, VNode } from 'preact';
import { useRef } from 'preact/hooks';
import { Box, InlineBack, lookFrame, useLookPlace, useWindowChrome } from '../chrome/kit/look';
import { type Nav, useKeys, useNav } from '../chrome/kit/stack';
import { type ManualCtl, LookManual, codeLine } from './look-manual';
import type { FindMemory } from './look-manual-find';
import { apiDoc } from './lua-api';
import { EMPTY_QUERY } from './manual-search';
import { SCRIPT_MANUAL_GROUPS, indexLinkOf, manualSectionOf, scriptManualSections } from './script-reference';
import './script-manual-frame.css';

/** The find's query (and its Case / Word / Regex), kept across opens of the manual. */
const memory: FindMemory = { query: EMPTY_QUERY };

/** API and library names are coloured in the examples. */
const luaKnown = (name: string): boolean => apiDoc(name) !== null;

/**
 * The examples' highlighted lines, made once per line for the page's life
 * (the manual's ~190 sections are drawn again on every open; the Lua
 * tokenising is not). Preact copies a vnode it has drawn before, so the
 * cached children can be drawn again.
 */
const lines = new Map<string, ComponentChildren>();
function example(line: string, lang: 'tt' | 'lua'): ComponentChildren {
  const key = lang + line;
  let out = lines.get(key);
  if (out === undefined) {
    out = codeLine(line, lang, luaKnown);
    lines.set(key, out);
  }
  return out;
}

/** A Lua index line's name that links to its entry (`- string.format: …`): the entry's section. */
const link = (name: string): number | null => indexLinkOf(`- ${name}:`)?.section ?? null;

/** The section `name` opens the manual at (F1): its entry, or a guide chapter; else Getting started (0). */
export function scriptManualSection(name?: string): number {
  const i = name ? manualSectionOf(name) : -1;
  return i >= 0 ? i : 0;
}

/** Pushes the manual, at the reference entry or section of `name` when there is one. */
export function openScriptManual(nav: Nav, name?: string): void {
  nav.push(<ScriptManual section={scriptManualSection(name)} />);
}

export const ScriptManual = lookFrame(function ScriptManual({ section = 0 }: { section?: number }): VNode {
  const nav = useNav();
  const place = useLookPlace();
  const ctl = useRef<ManualCtl | null>(null);
  useWindowChrome({ title: 'Scripts', note: 'Manual' });

  // The reader's keys first (its Esc: the contents overlay, then a
  // non-empty find); an Esc it leaves goes back.
  useKeys((e, nk) => ctl.current?.key(e, nk) ?? false);

  // A window's sub-page has its own small Back, first in the reader's head.
  const iback = place === 'window' && nav.depth() > 1;
  return (
    <Box size="large" title="Script Manual" onBack={() => nav.pop()} class="wc-sman">
      <LookManual
        before={
          iback ? (
            <span class="wc-sman-iback">
              <InlineBack />
            </span>
          ) : undefined
        }
        sections={scriptManualSections()}
        contents="own"
        find="head"
        groups={SCRIPT_MANUAL_GROUPS}
        initial={section}
        link={link}
        example={example}
        memory={memory}
        ctl={(c) => (ctl.current = c)}
      />
    </Box>
  );
});
