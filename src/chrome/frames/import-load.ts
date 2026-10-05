// Loads the foreign import core (src/import, ADR 0073) on demand: a lazy
// chunk that nothing on the start-up path imports. Its own module so the
// unit tests can replace it.
//
// Archives (Mudlet `.mpackage`/`.zip`, ADR 0076 "Input") are unpacked here,
// because reading a zip is async and `importFiles` is not: their `*.xml`
// entries go on as files. A single XML entry takes the archive's name (the
// profile is named after it); several are named `<archive>_<entry>.xml`. An
// archive without XML, or one that cannot be read, is a file warning; when
// nothing is left to import the whole import fails with that message.

import type { ImportFile, ImportResult } from '../../import/types';
import type { ZipEntry } from '../../import/zip';

/** `importFiles` with archives unpacked first. */
export type ImportFilesAsync = (files: ImportFile[], now?: Date) => Promise<ImportResult>;

/** The zip functions `unpackArchives` needs (passed in so the core stays lazy). */
export interface ZipReader {
  isZip(bytes: Uint8Array): boolean;
  readZip(bytes: Uint8Array): Promise<ZipEntry[]>;
}

const stem = (name: string): string => name.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '') || 'archive';

/** Replaces each zip among `files` by its XML entries; other files pass unchanged. */
export async function unpackArchives(files: ImportFile[], zip: ZipReader): Promise<{ files: ImportFile[]; warnings: string[] }> {
  const out: ImportFile[] = [];
  const warnings: string[] = [];
  for (const f of files) {
    if (!zip.isZip(f.bytes)) {
      out.push(f);
      continue;
    }
    let entries: ZipEntry[];
    try {
      entries = await zip.readZip(f.bytes);
    } catch (e) {
      warnings.push(`${f.name} could not be unpacked (${e instanceof Error ? e.message : String(e)}); it was not imported.`);
      continue;
    }
    // macOS adds `__MACOSX/._name.xml` resource forks; they are not XML.
    const xml = entries.filter((e) => /\.xml$/i.test(e.name) && !/(^|\/)(__MACOSX\/|\._)/.test(e.name));
    if (xml.length === 0) {
      warnings.push(`${f.name} holds no XML file; it was not imported.`);
      continue;
    }
    const base = stem(f.name);
    for (const e of xml) out.push({ name: xml.length === 1 ? `${base}.xml` : `${base}_${stem(e.name)}.xml`, bytes: e.bytes });
  }
  return { files: out, warnings };
}

export async function loadImportFiles(): Promise<ImportFilesAsync> {
  const core = await import('../../import');
  return async (files, now) => {
    const { files: unpacked, warnings } = await unpackArchives(files, core);
    if (unpacked.length === 0) throw new Error(warnings.join(' ') || 'No files chosen.');
    const r = core.importFiles(unpacked, now);
    if (warnings.length === 0) return r;
    return { ...r, fileWarnings: [...warnings, ...r.fileWarnings], counts: { ...r.counts, warnings: r.counts.warnings + warnings.length } };
  };
}
