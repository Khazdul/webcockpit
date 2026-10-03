// Foreign profile import: entry point (ADR 0073, spec §2.11). A lazy
// chunk: only the profile picker's IMPORT loads it.
//
// importFiles(files): decodes every file, detects one format for the set,
// picks the entry file (the one no other chosen file `#read`s; ties: the
// first chosen; JMC's global.set comes last), translates it with `#read`
// targets inlined from the chosen files, and appends chosen files nothing
// read (with a file warning), so nothing is dropped.

import { Out, Resolver, type SourceFile, baseName, isoDate, nopLine } from './common';
import { decodeBytes } from './decode';
import { detectFormat } from './detect';
import { translateJmc } from './jmc';
import { translatePowwow } from './powwow';
import { translateTintin } from './tintin';
import type { ImportFile, ImportFiles, ImportFormat, ImportResult } from './types';

export type * from './types';
export { decodeBytes } from './decode';
export { detectFormat } from './detect';

export const FORMAT_NAMES: Readonly<Record<ImportFormat, string>> = { tintin: 'TinTin++', jmc: 'JMC', powwow: 'Powwow' };

const READ_REFS = [/#rea?d?\s*\{([^}]*)\}/gi, /#rea?d?\s+([^\s;{}]+)/gi, /#cla\w*\s*\{[^}]*\}\s*\{\s*read\s*\}\s*\{([^}]*)\}/gi];

/** Base names (lower case) of the files a text `#read`s. */
export function readTargets(text: string): Set<string> {
  const out = new Set<string>();
  for (const re of READ_REFS) for (const m of text.matchAll(re)) if (m[1]?.trim()) out.add(baseName(m[1]).toLowerCase());
  return out;
}

function pickEntry(files: SourceFile[], format: ImportFormat): SourceFile {
  const candidates = format === 'jmc' && files.length > 1 ? files.filter((f) => f.name.toLowerCase() !== 'global.set') : files;
  const refs = files.map((f) => ({ f, targets: readTargets(f.text) }));
  const entry = candidates.find((c) => !refs.some((r) => r.f !== c && r.targets.has(c.name.toLowerCase())));
  return entry ?? candidates[0] ?? files[0]!;
}

export const importFiles: ImportFiles = (files: ImportFile[], now: Date = new Date()): ImportResult => {
  const decoded = files.map((f) => ({ name: baseName(f.name), ...decodeBytes(f.bytes) }));
  const sources: SourceFile[] = decoded.map((d) => ({ name: d.name, text: d.text }));
  if (sources.length === 0) sources.push({ name: 'empty.tin', text: '' });
  const det = detectFormat(sources);
  const entry = pickEntry(sources, det.format);
  const out = new Out();
  const res = new Resolver(sources);

  // Chosen files nothing read are appended, in the order chosen.
  const before = (f: SourceFile): void => {
    const jmcGlobal = det.format === 'jmc' && f.name.toLowerCase() === 'global.set';
    out.warnFile(jmcGlobal ? `${f.name} added at the end (JMC reads it after the profile).` : `${f.name} was not read by ${entry.name}; it was added at the end.`);
    out.setClass(null);
    out.raw('');
    out.raw(nopLine(`--- ${f.name} ---`));
    out.changed = true;
  };
  const rest = sources.filter((f) => f !== entry);
  switch (det.format) {
    case 'tintin':
      translateTintin(entry, res, out);
      for (const f of rest) {
        if (res.used.has(f.name)) continue;
        before(f);
        translateTintin(f, res, out);
      }
      break;
    case 'jmc':
      translateJmc(entry, res, out, rest, before);
      break;
    case 'powwow':
      for (const f of [entry, ...rest]) {
        if (f !== entry) before(f);
        res.within(f, () => translatePowwow(f, out));
      }
      break;
  }
  out.setClass(null);
  for (const d of decoded) if (d.encoding !== 'utf-8') out.warnFile(`${d.name} was read as ${d.encoding}.`);

  const unchanged = det.format === 'tintin' && !out.changed && sources.length === 1;
  let profileText: string;
  if (unchanged) profileText = entry.text;
  else {
    const header = nopLine(`Imported from ${FORMAT_NAMES[det.format]} file ${entry.name} on ${isoDate(now)}. See the import report.`);
    const parts = [header, '', ...out.lines];
    if (out.kept.length > 0) parts.push('', '#nop {--- Not translated ---}', ...out.kept);
    profileText = parts.join('\n').replace(/\n+$/, '') + '\n';
  }

  const counts = { translated: 0, kept: 0, skipped: 0, warnings: out.fileWarnings.length };
  for (const it of out.items) {
    counts[it.outcome]++;
    if (it.warning) counts.warnings++;
  }
  return {
    format: det.format,
    signals: det.signals,
    entry: entry.name,
    profileText,
    items: out.items,
    counts,
    fileWarnings: out.fileWarnings,
    missingFiles: res.missing,
    unchanged,
  };
};
