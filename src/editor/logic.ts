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
import { scriptKeyOwner } from '../script/script-keys';

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

/** Width of the pattern column in the entry list (Inv §5.6); the narrowest it gets (ADR 0104). */
export const PATTERN_COL = 8;

/**
 * The pattern column of an entry list `width` cells wide (ADR 0104): half
 * the row less the separating space, never under PATTERN_COL. The
 * Commands column takes the rest.
 */
export function patternColumn(width: number): number {
  return Math.max(PATTERN_COL, Math.floor((width - 1) / 2));
}

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

/** A list row's two columns (`patternColumn`), cut to their widths. */
export function rowText(e: EntryNode, width: number): { pattern: string; body: string } {
  const patW = patternColumn(width);
  const bodyW = Math.max(1, width - patW - 1);
  const pat = ellipsis(patternLabel(e.kind, e.pattern), patW);
  return { pattern: pat + ' '.repeat(patW - [...pat].length), body: bodyPreview(e.kind, e.body, bodyW) };
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

/**
 * Width of the centred column at full size in Inv §5.3 (title, kind row,
 * LITE body). Since ADR 0104 the column grows past it, and from here up
 * the list and the detail panel split it in halves.
 */
export const FULL_W = 77;

/** The widest LITE column (ADR 0104): a wider frame centres it. */
export const LITE_MAX_W = 160;

/** Sizes in cells (Inv §5.3). */
export const KIND_W = 13;
export const KIND_GAP = 3;
/** Between the list's scrollbar column and the detail panel. */
export const LIST_GAP = 3;

/** Where the LITE view's parts go on a frame `cols` cells wide (ADR 0104). */
export interface LiteGeometry {
  /** The column: `w` cells from cell `at` (title row, kind row, body). */
  at: number;
  w: number;
  /** The entry list's text width; its scrollbar takes one more cell. */
  list: number;
  /** The detail panel's width (Pattern and Commands boxes). */
  detail: number;
  /** The kind row: five buttons `kindW` wide, `kindGap` apart, from `kindAt`. */
  kindAt: number;
  kindW: number;
  kindGap: number;
}

/**
 * The LITE layout (ADR 0104). The column fills the frame less one cell on
 * each side, up to LITE_MAX_W, centred. From FULL_W up the list (with its
 * scrollbar cell) and the detail panel split the column less LIST_GAP in
 * halves, the odd cell to the detail panel; below FULL_W the detail panel
 * is 45 % (at least 24 cells) and the list the rest, as before. A desktop
 * frame keeps a 40-cell floor; a phone has none (ADR 0075 §3.2). The kind
 * row is centred over the column, its buttons full size from FULL_W up.
 */
export function liteGeometry(cols: number, phone: boolean): LiteGeometry {
  const w = Math.max(phone ? Math.min(40, cols - 2) : 40, Math.min(LITE_MAX_W, cols - 2));
  const at = Math.max(0, Math.floor((cols - w) / 2));
  const list = w >= FULL_W ? Math.floor((w - LIST_GAP) / 2) - 1 : w - Math.max(24, Math.floor(w * 0.45)) - 1 - LIST_GAP;
  const detail = w - list - 1 - LIST_GAP;
  const kindGap = 5 * KIND_W + 4 * KIND_GAP <= w ? KIND_GAP : 1;
  const kindW = kindGap === KIND_GAP ? KIND_W : Math.floor((w - 4) / 5);
  const kindAt = at + Math.max(0, Math.floor((w - (5 * kindW + 4 * kindGap)) / 2));
  return { at, w, list, detail, kindAt, kindW, kindGap };
}

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
