// Stage 20 B1: the import UI unpacks Mudlet archives (`.mpackage`/`.zip`)
// before `importFiles` (ADR 0076 "Input").
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadImportFiles, unpackArchives } from '../../../src/chrome/frames/import-load';
import * as zip from '../../../src/import/zip';
import { NOW, buildZip, file } from './helpers';

const PACKAGE_XML = readFileSync(new URL('../../fixtures/import/mudlet/package.xml', import.meta.url), 'utf-8');
const PROFILE_XML = readFileSync(new URL('../../fixtures/import/mudlet/profile.xml', import.meta.url), 'utf-8');

const mpackage = (xmls: Array<[string, string]>): Promise<Uint8Array> =>
  buildZip([
    { name: 'config.lua', text: 'mpackage = [[demo]]\n', deflate: false },
    ...xmls.map(([name, text]) => ({ name, text, deflate: true })),
  ]);

describe('unpackArchives', () => {
  it('passes plain files through and names a single XML entry after the archive', async () => {
    const plain = file('mychar.set', '#alias {k} {kill %1}');
    const { files, warnings } = await unpackArchives([plain, { name: 'My Demo.mpackage', bytes: await mpackage([['demo.xml', PACKAGE_XML]]) }], zip);
    expect(warnings).toEqual([]);
    expect(files.map((f) => f.name)).toEqual(['mychar.set', 'My Demo.xml']);
    expect(files[0]).toBe(plain);
    expect(new TextDecoder().decode(files[1]!.bytes)).toBe(PACKAGE_XML);
  });

  it('names several XML entries <archive>_<entry> and ignores macOS forks', async () => {
    const bytes = await mpackage([
      ['a/one.xml', PACKAGE_XML],
      ['__MACOSX/a/._one.xml', 'junk'],
      ['two.XML', PACKAGE_XML],
    ]);
    const { files } = await unpackArchives([{ name: 'pack.zip', bytes }], zip);
    expect(files.map((f) => f.name)).toEqual(['pack_one.xml', 'pack_two.xml']);
  });

  it('warns about an archive without XML and a broken archive', async () => {
    const noXml = await buildZip([{ name: 'config.lua', text: 'x', deflate: false }]);
    const broken = new TextEncoder().encode('PK\x03\x04 and then nothing');
    const { files, warnings } = await unpackArchives(
      [
        { name: 'empty.mpackage', bytes: noXml },
        { name: 'bad.mpackage', bytes: broken },
      ],
      zip,
    );
    expect(files).toEqual([]);
    expect(warnings[0]).toBe('empty.mpackage holds no XML file; it was not imported.');
    expect(warnings[1]).toMatch(/^bad\.mpackage could not be unpacked \(.+\); it was not imported\.$/);
  });
});

describe('loadImportFiles', () => {
  it('imports an .mpackage as Mudlet, named after the archive', async () => {
    const importFiles = await loadImportFiles();
    const r = await importFiles([{ name: 'highlights.mpackage', bytes: await mpackage([['Highlights.xml', PACKAGE_XML]]) }], NOW);
    expect(r.format).toBe('mudlet');
    expect(r.entry).toBe('highlights.xml');
    expect(r.counts.translated).toBeGreaterThan(0);
    expect(r.profileText).toContain('#alias {^hl$}');
  });

  it('adds archive warnings to the report when other files remain', async () => {
    const importFiles = await loadImportFiles();
    const noXml = await buildZip([{ name: 'config.lua', text: 'x', deflate: false }]);
    const r = await importFiles([file('profile.xml', PROFILE_XML), { name: 'empty.mpackage', bytes: noXml }], NOW);
    expect(r.format).toBe('mudlet');
    expect(r.fileWarnings[0]).toBe('empty.mpackage holds no XML file; it was not imported.');
    const items = r.items.filter((i) => i.warning).length;
    expect(r.counts.warnings).toBe(items + r.fileWarnings.length);
  });

  it('fails with the archive message when nothing is left', async () => {
    const importFiles = await loadImportFiles();
    const noXml = await buildZip([{ name: 'config.lua', text: 'x', deflate: false }]);
    await expect(importFiles([{ name: 'empty.mpackage', bytes: noXml }])).rejects.toThrow('empty.mpackage holds no XML file');
  });
});
