// The lantern kit's shortcut letters (stage 41, ADR 0125; split out of
// look.tsx in stage 42-0, ADR 0127). Package 42c owns this file: the
// rules for letters in and out of text fields (`letterAction`).
//
// A shortcut is the letter marked inside its label (`KeyLabel`: a fine lit
// underline), never a letter at the row's end or a key-hint row (the
// owner's rule, README "Baseline").

import { Fragment, type VNode, h } from 'preact';

/** The shortcut letter of a key press (a–z, lower case), or null (modifiers, other keys). */
export function letterOf(e: { key: string; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean }): string | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  return /^[a-z]$/i.test(e.key) ? e.key.toLowerCase() : null;
}

/** Index of the shortcut `letter` in `label` (its first occurrence, any case), or -1. */
export function letterAt(label: string, letter: string | undefined): number {
  return letter ? label.toLowerCase().indexOf(letter.toLowerCase()) : -1;
}

/** A label with its shortcut letter marked by a fine lit underline. */
export function KeyLabel(p: { text: string; letter?: string | undefined; class?: string | undefined }): VNode {
  const i = letterAt(p.text, p.letter);
  return h(
    'span',
    { class: p.class },
    i < 0
      ? p.text
      : h(Fragment, null, p.text.slice(0, i), h('u', { class: 'wc-sk' }, p.text[i]), p.text.slice(i + 1)),
  ) as VNode;
}

/** Whether `t` is a text field (input, textarea, select, contenteditable): a letter is text there. */
export function inTextField(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  const tag = el?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable === true;
}

/**
 * Runs the action of the key's shortcut letter in `map` and returns true;
 * false when the key is no letter of the map, carries Ctrl / Alt / Meta,
 * or was typed in a text field (the letter is text there; the page's own
 * Ctrl+S / Ctrl+F reach its handler as before). Shift is allowed (Caps
 * Lock, Shift+N = N). The map's keys are letters in either case.
 */
export function letterAction(e: KeyboardEvent, map: Readonly<Record<string, () => void>>): boolean {
  if (inTextField(e.target)) return false;
  const l = letterOf(e);
  const run = l ? (map[l] ?? map[l.toUpperCase()]) : undefined;
  if (!run) return false;
  run();
  return true;
}
