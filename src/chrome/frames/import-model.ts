// The import page and its receipt (stage 43c, ADR 0128, ADR 0073 addendum):
// the pure text of both, kept apart from the frames so the unit tests
// read it without a DOM. The frames are import-page.tsx (choose, drop,
// reading, error) and import-report.tsx (the receipt).

import type { ImportCounts, ImportFormat, ImportItem, ImportResult } from '../../import/types';

const FORMAT_NAMES: Record<ImportFormat, string> = { tintin: 'TinTin++', jmc: 'JMC', powwow: 'Powwow', mudlet: 'Mudlet' };

/** The format's name as the user knows it ("TinTin++", "JMC", …). */
export const formatName = (f: ImportFormat): string => FORMAT_NAMES[f];

/** `n word` or `n words`. */
export const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Lines in a profile text (trailing blank lines do not count). */
export function lineCount(text: string): number {
  const t = text.replace(/\n+$/, '');
  return t === '' ? 0 : t.split('\n').length;
}

/** The formats the import page lists under the drop zone. */
export const IMPORT_FORMATS: readonly { name: string; ext: string; note: string }[] = [
  { name: 'TinTin++', ext: '.tin .tt .txt', note: 'and WebCockpit profiles' },
  { name: 'JMC', ext: '.set', note: 'with the files it #reads' },
  { name: 'Powwow', ext: '.pow .txt', note: 'definitions file' },
  { name: 'Mudlet', ext: '.xml .mpackage .zip', note: 'profile saves, packages' },
];

/** The page's lead line. */
export const IMPORT_LEAD = 'Settings from another client become a new profile. Choose the main file together with the files it #reads.';

/** "Reading gibur.set, paths.set, spells.set…" */
export const readingText = (names: readonly string[]): string => `Reading ${names.join(', ')}…`;

/** A group of the receipt: the items worth a line, by outcome. */
export interface ImportGroup {
  id: 'kept' | 'skipped' | 'warned';
  title: string;
  items: ImportItem[];
}

/** The items worth a line, grouped: kept as #nop, skipped, then translated with a warning. Empty groups go. */
export function reportGroups(r: ImportResult): ImportGroup[] {
  const groups: ImportGroup[] = [
    { id: 'kept', title: 'Kept as #nop', items: r.items.filter((i) => i.outcome === 'kept') },
    { id: 'skipped', title: 'Skipped', items: r.items.filter((i) => i.outcome === 'skipped') },
    { id: 'warned', title: 'Translated with a warning', items: r.items.filter((i) => i.outcome === 'translated' && !!i.warning) },
  ];
  return groups.filter((g) => g.items.length > 0);
}

/** One part of the summary sentence: a number (drawn bold) and its words. */
export interface SummaryPart {
  n: number;
  text: string;
}

/**
 * The counts as a sentence's parts: translated always, then kept, skipped
 * and the warnings when there are any ("412 settings were translated", "9
 * kept as #nop", "6 skipped", "4 need a look").
 */
export function summaryParts(c: ImportCounts): SummaryPart[] {
  const out: SummaryPart[] = [{ n: c.translated, text: c.translated === 1 ? 'setting was translated' : 'settings were translated' }];
  if (c.kept > 0) out.push({ n: c.kept, text: 'kept as #nop' });
  if (c.skipped > 0) out.push({ n: c.skipped, text: 'skipped' });
  if (c.warnings > 0) out.push({ n: c.warnings, text: c.warnings === 1 ? 'needs a look' : 'need a look' });
  return out;
}

/** The joiner before part `i` of `count` parts: "", ", ", " and " (two parts) or ", and " (the last of three or more). */
export function summaryJoin(i: number, count: number): string {
  if (i === 0) return '';
  if (i < count - 1) return ', ';
  return count === 2 ? ' and ' : ', and ';
}

/** "412 settings were translated, 9 kept as #nop, 6 skipped, and 4 need a look." */
export function summaryText(c: ImportCounts): string {
  const parts = summaryParts(c);
  return parts.map((p, i) => `${summaryJoin(i, parts.length)}${p.n} ${p.text}`).join('') + '.';
}

/** How many chosen files besides the entry file ("and 2 more files"); 0 for one. */
export const moreFiles = (chosen: readonly string[]): number => Math.max(0, chosen.length - 1);

/** "a new profile from gibur.set and 2 more files" (plain text; the frame draws the file name in the mono face). */
export function fromText(entry: string, chosen: readonly string[]): string {
  const more = moreFiles(chosen);
  return `a new profile from ${entry}` + (more > 0 ? ` and ${plural(more, 'more file')}` : '');
}

/** The short form of a native profile that needed no change: "TinTin++, 214 lines, nothing changed." */
export const unchangedText = (r: ImportResult): string => `${formatName(r.format)}, ${plural(lineCount(r.profileText), 'line')}, nothing changed.`;

/** An item's place: `file:line`. */
export const itemAt = (it: ImportItem): string => `${it.file}:${it.line}`;

/** Why an item is listed: its reason, else its outcome (the warning is drawn after it). */
export const itemWhy = (it: ImportItem): string => it.reason || it.outcome;

/** The item's first non-blank source line, trimmed, with ` …` when the source has more lines. */
export function sourceLine(source: string): string {
  const first = source.split('\n').find((l) => l.trim() !== '') ?? '';
  return first.trim() + (source.trim().includes('\n') ? ' …' : '');
}
