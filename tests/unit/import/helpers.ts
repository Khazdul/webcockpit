import { readFileSync } from 'node:fs';
import { importFiles } from '../../../src/import';
import type { ImportFile, ImportResult } from '../../../src/import/types';
import { FakeScheduler, type LoadResult, ScriptEngine } from '../../../src/script/engine';

export const NOW = new Date(2026, 9, 4);

/** An in-memory file from text (UTF-8). */
export function file(name: string, text: string): ImportFile {
  return { name, bytes: new TextEncoder().encode(text) };
}

/** A corpus file from tests/fixtures/import/<dir>/<name>. */
export function fixture(dir: string, name: string): ImportFile {
  const url = new URL(`../../fixtures/import/${dir}/${name}`, import.meta.url);
  return { name, bytes: new Uint8Array(readFileSync(url)) };
}

export function run(...files: ImportFile[]): ImportResult {
  return importFiles(files, NOW);
}

/** Imports one text file. */
export function one(name: string, text: string): ImportResult {
  return run(file(name, text));
}

const KEPT_MARK = '#nop {--- Not translated ---}';

/** The profile's translated part: no header, no blank lines, no not-translated block. */
export function body(r: ImportResult): string[] {
  const lines = r.profileText.split('\n');
  const end = lines.indexOf(KEPT_MARK);
  return lines.slice(0, end < 0 ? undefined : end).filter((l, i) => l.trim() !== '' && !(i === 0 && l.startsWith('#nop {Imported from')));
}

/** The lines of the not-translated block. */
export function keptBlock(r: ImportResult): string[] {
  const lines = r.profileText.split('\n');
  const start = lines.indexOf(KEPT_MARK);
  return start < 0 ? [] : lines.slice(start + 1).filter((l) => l.trim() !== '');
}

/** Loads a profile into a fresh engine. */
export function load(text: string): LoadResult {
  const e = new ScriptEngine({ send: () => {}, message: () => {}, scheduler: new FakeScheduler() });
  return e.loadProfile(text);
}

/** Checks that counts agree with the items. */
export function countsMatch(r: ImportResult): boolean {
  const c = { translated: 0, kept: 0, skipped: 0, warnings: r.fileWarnings.length };
  for (const it of r.items) {
    c[it.outcome]++;
    if (it.warning) c.warnings++;
  }
  return JSON.stringify(c) === JSON.stringify(r.counts);
}
