// Confirmations and listings as data (ADR 0039). The engine says what a
// typed command did, or what a listing form found, as a `Report`; turning
// it into rows is the caller's business (src/app/messages.ts). No DOM.
//
// `#message` switches the confirmations of a class of commands on or off.
// Class names resolve like command words: an exact name wins, else the
// first class in alphabetical order that starts with the word (`var`,
// `variable`, `al`, `sub`); a one-letter word that starts several names is
// not accepted. `all` must be written in full.

import type { RuleKind } from '../commands';
import type { HighlightStyle } from './color';

/** The message classes, alphabetical (the resolution order). */
export const MESSAGE_CLASSES = [
  'actions',
  'aliases',
  'classes',
  'delays',
  'events',
  'gags',
  'highlights',
  'macros',
  'substitutes',
  'tickers',
  'variables',
] as const;

export type MessageClass = (typeof MESSAGE_CLASSES)[number];

/** The message class of each command that confirms. */
export const CLASS_OF: Readonly<Record<RuleKind | 'class', MessageClass>> = {
  action: 'actions',
  alias: 'aliases',
  class: 'classes',
  delay: 'delays',
  event: 'events',
  gag: 'gags',
  highlight: 'highlights',
  macro: 'macros',
  substitute: 'substitutes',
  ticker: 'tickers',
  variable: 'variables',
};

/** Resolves a class word of `#message`; null when it names no class. */
export function resolveMessageClass(word: string): MessageClass | 'all' | null {
  const w = word.trim().toLowerCase();
  if (w === '') return null;
  if (w === 'all') return 'all';
  const starts = MESSAGE_CLASSES.filter((c) => c.startsWith(w));
  if (starts.length === 0 || (w.length === 1 && starts.length > 1)) return null;
  return starts[0]!;
}

/** One definition, as the engine holds it. */
export interface ReportItem {
  kind: RuleKind;
  /** Pattern, name, key or event name, as stored. A delay without a name: ''. */
  key: string;
  /** Commands, replacement, colour or value. Absent for a gag. */
  body?: string;
  /** Only when it is not the default. */
  priority?: number;
  /** Tickers and delays. */
  seconds?: number;
  /** Highlights: the parsed colour. */
  style?: HighlightStyle;
}

export type ReportState = 'removed' | 'not found' | 'none' | 'opened' | 'closed' | 'not open' | 'on' | 'off';

/** `#<word> {key} <state>`; `key` null: the command alone (`#alias none`). */
export interface ReportStateRow {
  word: RuleKind | 'class' | 'message';
  key: string | null;
  state: ReportState;
  /** How many were removed, when `key` stands for several. */
  count?: number;
}

export type Report =
  /** A definition was made or replaced. */
  | { type: 'set'; item: ReportItem }
  /** A listing form: what exists (never empty). */
  | { type: 'list'; items: ReportItem[] }
  /** Removed, not found, opened, closed, on, off … one row each. */
  | { type: 'state'; rows: ReportStateRow[] };
