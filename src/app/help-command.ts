// `#help` on the input line (ADR 0037): what to print in the game window,
// from the profile editor's manual (src/editor/help.ts). No DOM; unit tested.
//
// The manual is in the editor's lazy chunk, so App loads this module with a
// dynamic import when `#help` is typed. Nothing on the start-up path may
// import it.

import {
  CODE_INDENT,
  type HelpLine,
  type HelpSection,
  type HelpSeg,
  helpLayout,
  helpParagraph,
  helpSections,
} from '../editor/help';
import { resolveCommand } from '../script/commands';
import type { StyledRow } from '../ui/output-pane';

/** The widest `#help` sets its text, in cells; a wider pane leaves a margin. */
export const HELP_MAX_W = 100;
/** The width used when the pane has not been measured. */
export const HELP_DEFAULT_W = 80;

/** What `#help <word>` refers to. */
export type HelpTarget =
  | { kind: 'list' }
  | { kind: 'section'; section: HelpSection }
  /** No section: one line to show as a system message. */
  | { kind: 'message'; text: string };

/** The first word of the argument, without braces; lower case. */
function helpWord(arg: string): string {
  const w = arg.trim().replace(/^\{\s*(.*?)\s*\}$/, '$1').split(/\s+/)[0] ?? '';
  return w.toLowerCase();
}

/**
 * Resolves the argument of `#help`.
 *
 * - Nothing: the list.
 * - A topic word written in full (`patterns`), unless the word has a `#`.
 * - A command word, resolved as commands are (`al`, `#alias`, `unalias`
 *   → the `#alias` section).
 * - The start of a topic word, two letters or more (`col` → Colours).
 * - A tt++ command WebCockpit does not run, or a client command without a
 *   section: a one-line message. Anything else: a pointer to `#help`.
 */
export function resolveHelp(arg: string, sections: readonly HelpSection[] = helpSections()): HelpTarget {
  const word = helpWord(arg);
  if (word === '') return { kind: 'list' };
  const hash = word.startsWith('#');
  const w = hash ? word.slice(1) : word;
  const unknown: HelpTarget = { kind: 'message', text: `No help for "${word}". Type #help for the list.` };
  if (w === '') return unknown;

  if (!hash) {
    const exact = sections.find((s) => s.topics?.includes(w));
    if (exact) return { kind: 'section', section: exact };
  }
  const cmd = resolveCommand(w);
  const entry = cmd && cmd !== 'ambiguous' ? cmd : null;
  if (entry) {
    const section = sections.find((s) => s.covers?.includes(entry.name));
    if (section) return { kind: 'section', section };
  }
  if (!hash && w.length > 1) {
    const start = sections.find((s) => s.topics?.some((t) => t.startsWith(w)));
    if (start) return { kind: 'section', section: start };
  }
  if (!entry) return unknown;
  if (entry.tier === 'unsupported') return { kind: 'message', text: `#${entry.name}: ${entry.hint ?? 'Not supported.'}` };
  if (entry.inert) return { kind: 'message', text: `#${entry.name} is not supported. ${entry.hint ?? ''}`.trimEnd() };
  return { kind: 'message', text: `#${entry.name} has no help entry; it is handled from the menus.` };
}

/** The words `#help` lists: the command headings and the topic words, in manual order. */
export function helpIndex(sections: readonly HelpSection[] = helpSections()): { commands: string[]; topics: string[] } {
  return {
    commands: sections.filter((s) => s.group === 'commands').map((s) => s.heading),
    topics: sections.flatMap((s) => (s.topics?.length ? [s.topics[0]!] : [])),
  };
}

/** `words` in columns, as code rows (so they sit where examples do). */
function columns(words: readonly string[], width: number, cls?: HelpSeg['cls']): HelpLine[] {
  const colW = words.reduce((n, x) => Math.max(n, x.length), 0) + 2;
  const perRow = Math.max(1, Math.floor((width - CODE_INDENT + 2) / colW));
  const out: HelpLine[] = [];
  for (let i = 0; i < words.length; i += perRow) {
    const row = words.slice(i, i + perRow);
    const segs: HelpSeg[] = [];
    row.forEach((x, k) => {
      segs.push(cls ? { text: x, cls } : { text: x });
      if (k < row.length - 1) segs.push({ text: ' '.repeat(colW - x.length) });
    });
    out.push({ kind: 'code', indent: CODE_INDENT, segs });
  }
  return out;
}

const BLANK: HelpLine = { kind: 'blank', indent: 0, segs: [] };

/** The rows of `#help` alone: commands and topics in columns, then how to go on. */
export function helpList(width: number, sections: readonly HelpSection[] = helpSections()): HelpLine[] {
  const { commands, topics } = helpIndex(sections);
  const lines: HelpLine[] = [{ kind: 'heading', indent: 0, segs: [{ text: 'Commands' }] }, ...columns(commands, width, 'cmd')];
  if (topics.length > 0) {
    lines.push(BLANK, { kind: 'heading', indent: 0, segs: [{ text: 'Topics' }] }, ...columns(topics, width));
  }
  const eg = [commands[0], topics[0]].filter((x) => x !== undefined).map((x) => `#help ${x.replace(/^#/, '')}`);
  lines.push(
    BLANK,
    ...helpParagraph(
      `#help <command> or #help <topic> shows the details${eg.length ? `: ${eg.join(', ')}` : ''}. HELP in the profile editor has the whole manual.`,
      width,
    ),
    ...helpParagraph('While disconnected, Enter reconnects.', width),
  );
  return lines;
}

/** A manual row as an output pane row: the HELP view's classes (ui.css). */
function toRow(l: HelpLine): StyledRow {
  const segs: Array<{ text: string; cls?: string }> = [];
  if (l.indent > 0 && l.segs.length > 0) segs.push({ text: ' '.repeat(l.indent) });
  for (const s of l.segs) segs.push(s.cls ? { text: s.text, cls: `wc-syn-${s.cls}` } : { text: s.text });
  return { cls: `wc-help wc-help-${l.kind}`, segs };
}

/** The text width for a game pane `cols` cells wide. */
export function helpWidth(cols: number): number {
  if (!(cols > 0)) return HELP_DEFAULT_W;
  return Math.max(24, Math.min(HELP_MAX_W, cols - 1));
}

/**
 * What `#help <arg>` prints in a game pane `cols` cells wide: rows for the
 * output pane (a blank row first, to set them apart), or one line for a
 * system message.
 */
export function helpOutput(arg: string, cols: number, sections: readonly HelpSection[] = helpSections()): StyledRow[] | string {
  const target = resolveHelp(arg, sections);
  if (target.kind === 'message') return target.text;
  const width = helpWidth(cols);
  const lines = target.kind === 'list' ? helpList(width, sections) : helpLayout(width, [target.section], { groups: false }).lines;
  return [BLANK, ...lines].map(toRow);
}
