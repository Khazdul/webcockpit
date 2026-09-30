// Pure helpers for the profile editor's lite view (Inv §5.6): list order
// and previews, the highlight colour model, hints, warnings, the macro Key
// cell, the title row and the view toggle. No DOM, no Preact, no CodeMirror; unit tested.

import { resolveCommand } from '../script/commands';
import {
  type EntryKind,
  type EntryNode,
  type ProfileDoc,
  displayBody,
  listEntries,
  removeEntry,
} from '../script/doc';
import { compareKeys, displayKey, normalizeKey, shadowedInputKey } from '../script/keys';

/** The five lite kinds as tabs (Inv §5.2), in their order. */
export type LiteKind = 'action' | 'alias' | 'highlight' | 'macro' | 'substitute';

export const KINDS: readonly LiteKind[] = ['action', 'alias', 'highlight', 'macro', 'substitute'];

export const KIND_TITLES: Readonly<Record<LiteKind, string>> = {
  action: 'ACTIONS',
  alias: 'ALIASES',
  highlight: 'HIGHLIGHTS',
  macro: 'MACROS',
  substitute: 'SUBSTITUTES',
};

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
  return count === 0 ? `No ${PLURAL[kind]} yet. Press n to add one.` : `Press Enter to create a new ${kind}.`;
}

// ---------------------------------------------------------------------------
// Entry list
// ---------------------------------------------------------------------------

/** Width of the pattern column in the entry list (Inv §5.6). */
export const PATTERN_COL = 8;

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

/** What the list and the Key cell show for a pattern: the key's display name for macros. */
export function patternLabel(kind: EntryKind, pattern: string): string {
  if (kind !== 'macro') return pattern;
  const c = normalizeKey(pattern);
  return c ? displayKey(c) : pattern;
}

/**
 * The body preview for the list (Inv §5.6): leading blank lines skipped,
 * the first line cut to `width` with `…`, and `…` also when more non-blank
 * lines follow.
 */
export function bodyPreview(kind: EntryKind, raw: string, width: number): string {
  const lines = displayBody(kind, raw).replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length - 1 && lines[i]!.trim() === '') i++;
  const first = lines[i]!;
  const more = lines.slice(i + 1).some((l) => l.trim() !== '');
  const cut = ellipsis(first, width);
  if (!more || cut !== first) return cut;
  const cps = [...first];
  return cps.length + 1 <= width ? first + '…' : cps.slice(0, Math.max(0, width - 1)).join('') + '…';
}

/** A list row's two columns, cut to their widths. */
export function rowText(e: EntryNode, width: number): { pattern: string; body: string } {
  const bodyW = Math.max(1, width - PATTERN_COL - 1);
  const pat = ellipsis(patternLabel(e.kind, e.pattern), PATTERN_COL);
  return { pattern: pat + ' '.repeat(PATTERN_COL - [...pat].length), body: bodyPreview(e.kind, e.body, bodyW) };
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
// Hints and warnings
// ---------------------------------------------------------------------------

/** The two hint lines under `─── Hint ───` (Inv §5.6). */
export const HINTS: Readonly<Record<LiteKind, readonly [string, string]>> = {
  alias: ['%1 %2 capture words · ; chains', 'gv %1  →  get %1;value %1'],
  action: ['%1 %2 match text · ^ anchors line', '^%1 raises %2 hand  →  group %1'],
  highlight: ['%1 matches text · ^ anchors line', '^%1 enters  colours whole line'],
  substitute: ['%1 %2 capture & reuse in New text', '%1 massacres %2 → %1 MASSACRES %2'],
  macro: ['Enter on Key cell to bind a key', '$var inserts variable · ; chains'],
};

/**
 * A warning for an entry that will not behave as the user expects, or
 * null: a macro that takes over an input-line key, an alias that can never
 * run because `_send` or a client command wins.
 */
export function entryWarning(e: { kind: EntryKind; pattern: string }): string | null {
  if (e.kind === 'macro') {
    const c = normalizeKey(e.pattern);
    const what = c ? shadowedInputKey(c) : null;
    return c && what ? `${displayKey(c)} overrides the input line (${what}).` : null;
  }
  if (e.kind === 'alias') {
    const first = e.pattern.trim().split(/\s+/)[0] ?? '';
    if (first === '_send') return '_send is built in; this alias never runs.';
    if (first.startsWith('#')) {
      const c = resolveCommand(first);
      if (c && c !== 'ambiguous' && c.kind === 'client') return `#${c.name} is a client command; this alias never runs.`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Macro Key cell (Inv §5.6)
// ---------------------------------------------------------------------------

export interface KeyCell {
  text: string;
  /** Shown in C_HINT (empty or unknown key). */
  hint: boolean;
}

export function keyCell(pattern: string): KeyCell {
  if (pattern === '') return { text: '[ Press to bind… ]', hint: true };
  const c = normalizeKey(pattern);
  if (!c) return { text: `[ Custom: ${pattern} ]`, hint: true };
  return { text: `[ ${displayKey(c)} ]`, hint: false };
}

// ---------------------------------------------------------------------------
// Title row, save text
// ---------------------------------------------------------------------------

/** The views of the toggle in the title row, in their order. */
export type EditorViewName = 'lite' | 'editor' | 'help';
export const VIEWS: readonly { view: EditorViewName; label: string; width: number }[] = [
  { view: 'lite', label: 'LITE', width: 6 },
  { view: 'editor', label: 'EDITOR', width: 8 },
  { view: 'help', label: 'HELP', width: 6 },
];

/** Width of the toggle: ` LITE ` + space + ` EDITOR ` + space + ` HELP `. */
export const TOGGLE_W = VIEWS.reduce((n, v) => n + v.width, 0) + VIEWS.length - 1;

/** The view ← / → moves to from `cur` in the toggle (no wrap-around). */
export function stepView(cur: EditorViewName, dir: 1 | -1): EditorViewName {
  const i = VIEWS.findIndex((v) => v.view === cur);
  return VIEWS[Math.max(0, Math.min(VIEWS.length - 1, i + dir))]!.view;
}

/** The title `─── Profile Editor: <name> ───` (Inv §5.3), cut to `width` cells. */
export function titleText(name: string, width: number): string {
  return ellipsis(`─── Profile Editor: ${name} ───`, width);
}

/**
 * The document to save from the lite view: entries created or edited in
 * the lite view (`touched`) whose pattern is still empty are dropped
 * ("saving is never blocked", Inv §5.6). Other entries are left alone.
 */
export function dropEmpty(doc: ProfileDoc, touched: ReadonlySet<number>): ProfileDoc {
  let out = doc;
  for (const e of listEntries(doc)) if (touched.has(e.id) && e.pattern.trim() === '') out = removeEntry(out, e.id);
  return out;
}
