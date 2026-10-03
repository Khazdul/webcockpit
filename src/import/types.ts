// Foreign profile import: shared types (ADR 0073, spec §2.11).
// Pure data; the UI and the translators both depend on this file only.

export type ImportFormat = 'tintin' | 'jmc' | 'powwow';

/** What happened to one source item (a command, rule or line). */
export type ImportOutcome = 'translated' | 'kept' | 'skipped';

export interface ImportItem {
  /** Base name of the file the item came from. */
  file: string;
  /** 1-based line of the item's first line in that file. */
  line: number;
  /** The source text, as read (may span lines). */
  source: string;
  outcome: ImportOutcome;
  /** Why it was kept or skipped, or what was changed (short, English). */
  reason?: string;
  /** Set when a translated item may behave differently than before. */
  warning?: string;
}

export interface ImportCounts {
  translated: number;
  kept: number;
  skipped: number;
  /** Items with `warning`, plus file-wide warnings. */
  warnings: number;
}

export interface ImportFile {
  name: string;
  bytes: Uint8Array;
}

export interface ImportResult {
  format: ImportFormat;
  /** Up to three short human-readable signals that decided the format. */
  signals: string[];
  /** Name of the entry file (the one the profile is named after). */
  entry: string;
  /** The text to store as the new profile. */
  profileText: string;
  items: ImportItem[];
  counts: ImportCounts;
  /** Warnings that apply to the whole import (e.g. first-match semantics). */
  fileWarnings: string[];
  /** `#read` targets not among the chosen files. */
  missingFiles: string[];
  /** True for a native tt++/WebCockpit profile where nothing was changed. */
  unchanged: boolean;
}

/** Entry point implemented in `./index.ts`. */
export type ImportFiles = (files: ImportFile[], now?: Date) => ImportResult;
