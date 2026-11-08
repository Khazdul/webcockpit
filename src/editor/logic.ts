// Pure helpers for the profile editor (Inv §5.6, ADR 0128): list order and
// previews, the highlight colour model, hints, warnings, the views, the
// pending and held changes, the status texts, the text sections and the
// layout widths. No DOM, no Preact, no CodeMirror; unit tested. (The TUI
// editor's cell geometry, title row and Key cell are gone, stage 43 wave 3.)

import { resolveCommand } from '../script/commands';
import {
  type DocNode,
  type EntryKind,
  type EntryNode,
  type ProfileDoc,
  displayBody,
  listEntries,
  removeEntry,
  validateEntry,
} from '../script/doc';
import { compareKeys, displayKey, normalizeKey, shadowedInputKey } from '../script/keys';
import { scriptKeyOwner } from '../script/script-keys';

/** The five lite kinds as tabs (Inv §5.2), in their order. */
export type LiteKind = 'action' | 'alias' | 'highlight' | 'macro' | 'substitute';

export const KINDS: readonly LiteKind[] = ['action', 'alias', 'highlight', 'macro', 'substitute'];

const PLURAL: Readonly<Record<LiteKind, string>> = {
  action: 'actions',
  alias: 'aliases',
  highlight: 'highlights',
  macro: 'macros',
  substitute: 'substitutes',
};

/** What a new entry of the kind starts with (Inv §5.2). */
export const NEW_BODY: Readonly<Record<LiteKind, string>> = {
  action: '',
  alias: '',
  highlight: 'light yellow',
  macro: '',
  substitute: '',
};

/** The detail prompt when the `+ New entry` row is selected (Inv §5.6). */
export function sentinelPrompt(kind: LiteKind, count: number): string {
  return count === 0 ? `No ${PLURAL[kind]} yet. Press N to add one.` : `Press Enter to create a new ${kind}.`;
}

// ---------------------------------------------------------------------------
// Entry list
// ---------------------------------------------------------------------------

/**
 * The entries of `kind` in lite display order (Inv §5.6 "Sort"): by
 * pattern, case-sensitive (macros by key, `compareKeys`), with the entries
 * created in this lite session (`pinned`, in creation order) last. Display
 * only: the document order is never changed (ADR 0015).
 */
export function listRows(doc: ProfileDoc, kind: LiteKind, pinned: readonly number[] = []): EntryNode[] {
  const all = listEntries(doc, kind);
  const pin = new Set(pinned);
  const rest = all.filter((e) => !pin.has(e.id));
  const cmp =
    kind === 'macro'
      ? (a: EntryNode, b: EntryNode) => compareKeys(a.pattern, b.pattern)
      : (a: EntryNode, b: EntryNode) => (a.pattern < b.pattern ? -1 : a.pattern > b.pattern ? 1 : 0);
  // Array.prototype.sort is stable: equal patterns keep document order.
  rest.sort(cmp);
  const byId = new Map(all.map((e) => [e.id, e]));
  const tail = pinned.map((id) => byId.get(id)).filter((e): e is EntryNode => e !== undefined);
  return [...rest, ...tail];
}

/** `s` cut to `n` code points, with `…` when cut. */
export function ellipsis(s: string, n: number): string {
  if (n <= 0) return '';
  const cps = [...s];
  return cps.length <= n ? s : cps.slice(0, n - 1).join('') + '…';
}

// ---------------------------------------------------------------------------
// Highlight colours (Inv §5.6 "Highlight colour picker")
// ---------------------------------------------------------------------------

/** Swatch rows, dark column first. ANSI index = row + 1 (dark), row + 9 (bright). */
export const HL_COLORS = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'] as const;
export type HlColor = (typeof HL_COLORS)[number];

export const HL_STYLES = ['underscore', 'blink', 'reverse'] as const;
export type HlStyle = (typeof HL_STYLES)[number];

/** Labels of the style toggles (Cockpit abbreviates underscore). */
export const HL_STYLE_LABELS: Readonly<Record<HlStyle, string>> = {
  underscore: 'Undersc.',
  blink: 'Blink',
  reverse: 'Reverse',
};

/** A picked colour: the row in `HL_COLORS` and dark (0) / bright (1). */
export interface HlPick {
  row: number;
  bright: 0 | 1;
}

export interface HighlightSpec {
  styles: HlStyle[];
  fg: HlPick | null;
  bg: HlPick | null;
}

/** The terminal palette index for a pick (`--ansi-N`). */
export function ansiIndex(p: HlPick): number {
  return p.row + 1 + (p.bright ? 8 : 0);
}

/** One colour word: `red` (dark), `Red` or `light red` (bright). */
function colourOf(words: string[], i: number): { pick: HlPick; next: number } | null {
  let w = words[i];
  if (w === undefined) return null;
  let bright: 0 | 1 = 0;
  if (w.toLowerCase() === 'light') {
    bright = 1;
    w = words[i + 1];
    if (w === undefined) return null;
    i++;
  } else if (w.toLowerCase() === 'dark') {
    w = words[i + 1];
    if (w === undefined) return null;
    i++;
  }
  const row = (HL_COLORS as readonly string[]).indexOf(w.toLowerCase());
  if (row < 0) return null;
  if (w[0] !== w[0]!.toLowerCase()) bright = 1;
  return { pick: { row, bright }, next: i + 1 };
}

/**
 * Parses a highlight body into styles, text and background colours, or
 * null when it holds anything else (`bold`, RGB codes, …); such bodies are
 * kept verbatim until a swatch is touched (Inv §5.6). Words are separated
 * by spaces or commas; each style and each dimension at most once.
 */
export function parseHighlight(body: string): HighlightSpec | null {
  const words = body.trim().split(/[\s,]+/).filter(Boolean);
  const spec: HighlightSpec = { styles: [], fg: null, bg: null };
  let i = 0;
  while (i < words.length) {
    const w = words[i]!;
    const lw = w.toLowerCase();
    if ((HL_STYLES as readonly string[]).includes(lw)) {
      if (spec.styles.includes(lw as HlStyle)) return null;
      spec.styles.push(lw as HlStyle);
      i++;
      continue;
    }
    if (lw === 'b') {
      const c = colourOf(words, i + 1);
      if (!c || spec.bg) return null;
      spec.bg = c.pick;
      i = c.next;
      continue;
    }
    const c = colourOf(words, i);
    if (!c || spec.fg) return null;
    spec.fg = c.pick;
    i = c.next;
  }
  spec.styles.sort((a, b) => HL_STYLES.indexOf(a) - HL_STYLES.indexOf(b));
  return spec;
}

function colourWord(p: HlPick): string {
  const name = HL_COLORS[p.row]!;
  return p.bright ? name[0]!.toUpperCase() + name.slice(1) : name;
}

/**
 * The body for a spec (Inv §5.6): styles in the order underscore, blink,
 * reverse, then the text colour, then `b <bg>`. Bright colours are written
 * Capitalised (`Red`), as tt++ reads them.
 */
export function serializeHighlight(s: HighlightSpec): string {
  const parts: string[] = HL_STYLES.filter((st) => s.styles.includes(st));
  if (s.fg) parts.push(colourWord(s.fg));
  if (s.bg) parts.push('b ' + colourWord(s.bg));
  return parts.join(' ');
}

/** CSS for previewing a highlight body in the list (its own colours), or null. */
export function highlightStyle(body: string): { color?: string; background?: string; textDecoration?: string } | null {
  const s = parseHighlight(body);
  if (!s || (!s.fg && !s.bg && s.styles.length === 0)) return null;
  const out: { color?: string; background?: string; textDecoration?: string } = {};
  let fg = s.fg ? `var(--ansi-${ansiIndex(s.fg)})` : undefined;
  let bg = s.bg ? `var(--ansi-${ansiIndex(s.bg)})` : undefined;
  if (s.styles.includes('reverse')) [fg, bg] = [bg ?? 'var(--term-bg)', fg ?? 'var(--term-fg)'];
  if (fg) out.color = fg;
  if (bg) out.background = bg;
  if (s.styles.includes('underscore')) out.textDecoration = 'underline';
  return out;
}

// ---------------------------------------------------------------------------
// Warnings
// ---------------------------------------------------------------------------

/**
 * A warning for an entry that will not behave as the user expects, or
 * null: a macro on a key an enabled Lua script binds (the macro wins), a
 * macro that takes over an input-line key, an alias that can never run
 * because a client command wins.
 */
export function entryWarning(e: { kind: EntryKind; pattern: string }): string | null {
  if (e.kind === 'macro') {
    const c = normalizeKey(e.pattern);
    if (!c) return null;
    const script = scriptKeyOwner(c);
    if (script) return `${displayKey(c)} is also bound by script ${script}; this macro wins.`;
    const what = shadowedInputKey(c);
    return what ? `${displayKey(c)} overrides the input line (${what}).` : null;
  }
  if (e.kind === 'alias') {
    const first = e.pattern.trim().split(/\s+/)[0] ?? '';
    if (first.startsWith('#')) {
      const c = resolveCommand(first);
      if (c && c !== 'ambiguous' && c.kind === 'client') return `#${c.name} is a client command; this alias never runs.`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Views, pending changes
// ---------------------------------------------------------------------------

/** The editor's three views (Lite, Editor, Help; `VIEW_LABELS` for their labels and letters). */
export type EditorViewName = 'lite' | 'editor' | 'help';

/** The view ← / → moves to from `cur` (no wrap-around). */
export function stepView(cur: EditorViewName, dir: 1 | -1): EditorViewName {
  const i = VIEW_LABELS.findIndex((v) => v.view === cur);
  return VIEW_LABELS[Math.max(0, Math.min(VIEW_LABELS.length - 1, i + dir))]!.view;
}

/**
 * The lite view's document without its empty new entries: entries that are
 * not in `base` (created since the last apply) and whose pattern is still
 * empty are dropped ("saving is never blocked", Inv §5.6). Unapplied
 * changes are what this differs from `base` in (ADR 0105).
 */
export function pendingDoc(base: ProfileDoc, doc: ProfileDoc): ProfileDoc {
  const known = new Set(base.nodes.map((n) => n.id));
  let out = doc;
  for (const e of listEntries(doc)) if (!known.has(e.id) && e.pattern.trim() === '') out = removeEntry(out, e.id);
  return out;
}

/** A changed entry the lite view does not apply, and why (`validateEntry`). */
export interface HeldEntry {
  entry: EntryNode;
  reason: string;
}

/**
 * What the lite view applies (ADR 0105): `doc` with every changed entry
 * that does not validate held back. A held entry that is in `base` keeps
 * its base text there; a new one is left out. Empty new entries are left
 * out silently (`pendingDoc`); the others are listed in `held`.
 */
export function applicableDoc(base: ProfileDoc, doc: ProfileDoc): { doc: ProfileDoc; held: HeldEntry[] } {
  const was = new Map(base.nodes.map((n) => [n.id, n]));
  const held: HeldEntry[] = [];
  const nodes: DocNode[] = [];
  for (const n of doc.nodes) {
    const b = was.get(n.id);
    if ((b && b.text === n.text) || n.type !== 'entry') {
      nodes.push(n);
      continue;
    }
    const reason = validateEntry(n);
    if (reason === null) nodes.push(n);
    else {
      if (b) nodes.push(b);
      if (b || n.pattern.trim() !== '') held.push({ entry: n, reason });
    }
  }
  return { doc: { ...doc, nodes }, held };
}

/** `Unbalanced braces in Commands (alias gv)`: a held entry for a message. */
export function heldText(h: HeldEntry): string {
  const what = h.entry.pattern.trim() === '' ? h.entry.kind : `${h.entry.kind} ${ellipsis(h.entry.pattern.trim(), 24)}`;
  return `${h.reason} (${what})`;
}

// ---------------------------------------------------------------------------
// The new look (stage 43a, ADR 0128): direction B "Ryggen"
// ---------------------------------------------------------------------------

/** The kinds as the rail and the sheet's back button name them. */
export const KIND_LABELS: Readonly<Record<LiteKind, string>> = {
  action: 'Actions',
  alias: 'Aliases',
  highlight: 'Highlights',
  macro: 'Macros',
  substitute: 'Substitutes',
};

/** One entry of the kind, for `New alias` and the prompts. */
export const KIND_ONE: Readonly<Record<LiteKind, string>> = {
  action: 'action',
  alias: 'alias',
  highlight: 'highlight',
  macro: 'macro',
  substitute: 'substitute',
};

/** The kinds' shortcut letters (ADR 0128): Actions, alIases, hiGhlights, Macros, Substitutes. */
export const KIND_LETTERS: Readonly<Record<LiteKind, string>> = {
  action: 'a',
  alias: 'i',
  highlight: 'g',
  macro: 'm',
  substitute: 's',
};

/** The views' labels and shortcut letters (Lite, Editor, Help). */
export const VIEW_LABELS: readonly { view: EditorViewName; label: string; letter: string }[] = [
  { view: 'lite', label: 'Lite', letter: 'l' },
  { view: 'editor', label: 'Editor', letter: 'e' },
  { view: 'help', label: 'Help', letter: 'h' },
];

/** The highlight styles' labels in the new look (whole words). */
export const HL_STYLE_NAMES: Readonly<Record<HlStyle, string>> = {
  underscore: 'Underscore',
  blink: 'Blink',
  reverse: 'Reverse',
};

/**
 * The body line of a list row (two-line rows): the first non-blank line,
 * with ` …` when more non-blank lines follow. The row cuts it with CSS.
 */
export function previewLine(kind: EntryKind, raw: string): string {
  const lines = displayBody(kind, raw).replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length - 1 && lines[i]!.trim() === '') i++;
  const first = lines[i]!;
  return lines.slice(i + 1).some((l) => l.trim() !== '') ? `${first} …` : first;
}

/**
 * The macro's key as the Key cell and the list's key chip show it:
 * `F5`; `Press to bind…` when empty (`hint`); `Custom: \eOp` for a key
 * the client does not know (`hint`, `custom`).
 */
export function keyLabel(pattern: string): { text: string; hint: boolean; custom: boolean } {
  if (pattern === '') return { text: 'Press to bind…', hint: true, custom: false };
  const c = normalizeKey(pattern);
  if (!c) return { text: `Custom: ${pattern}`, hint: true, custom: true };
  return { text: displayKey(c), hint: false, custom: false };
}

/** What the editor's quiet status says about the lite edits (ADR 0128). */
export type SaveState = 'clean' | 'editing' | 'held';

/**
 * The status at the foot right: `All saved` (not live) or `All applied`
 * (live) when nothing is left, `Editing` while an edit is not applied yet,
 * `Not applied` while an apply held something back.
 */
export function statusText(state: SaveState, live: boolean): string {
  if (state === 'held') return 'Not applied';
  if (state === 'editing') return 'Editing';
  return live ? 'All applied' : 'All saved';
}

/** The head's line in the game (ADR 0128): the connection, not the profile. */
export function liveText(live: boolean): string {
  return live ? 'Connected · changes apply to the game' : 'Not connected · changes are saved';
}

/** The sample text of a highlight's "Shows as": its pattern without anchors, wildcards and arguments, or `text`. */
export function showsAs(pattern: string): string {
  const t = pattern
    .replace(/^\^/, '')
    .replace(/^\*+|\*+$/g, '')
    .replace(/%[!+]?\d+/g, '…')
    .trim();
  return t || 'text';
}

/** The editor's layout by its own width (ADR 0128): rail | list | detail, the rail as a row, one column. */
export type PeLayout = 'wide' | 'mid' | 'narrow';

/** Above this width the rail stands at the left (B's grid). */
export const PE_WIDE = 940;
/** At or under this width one column; the entry opens as a sheet. */
export const PE_NARROW = 640;

/** The layout for a width in CSS px (the same thresholds as profile.css's container queries). */
export function peLayout(width: number): PeLayout {
  return width > PE_WIDE ? 'wide' : width > PE_NARROW ? 'mid' : 'narrow';
}
