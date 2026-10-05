import { describe, expect, it } from 'vitest';
import { ZipError, isZip, readZip } from '../../../src/import/zip';
import { buildZip } from './helpers';

const enc = new TextEncoder();

describe('readZip', () => {
  it('reads stored and deflated entries and skips directories', async () => {
    const xml = '<?xml version="1.0"?>\n<!DOCTYPE MudletPackage>\n<MudletPackage version="1.001"></MudletPackage>\n'.repeat(20);
    const zip = await buildZip(
      [
        { name: 'config.lua', text: 'mpackage = [[demo]]\n', deflate: false },
        { name: 'demo/', text: '', deflate: false },
        { name: 'demo/demo.xml', text: xml, deflate: true },
      ],
      'an archive comment',
    );
    expect(isZip(zip)).toBe(true);
    const entries = await readZip(zip);
    expect(entries.map((e) => e.name)).toEqual(['config.lua', 'demo/demo.xml']);
    expect(new TextDecoder().decode(entries[0]!.bytes)).toBe('mpackage = [[demo]]\n');
    expect(new TextDecoder().decode(entries[1]!.bytes)).toBe(xml);
  });

  it('rejects what is not a zip', async () => {
    expect(isZip(enc.encode('<?xml'))).toBe(false);
    await expect(readZip(enc.encode('PK\x03\x04 but no directory at all, just text'))).rejects.toThrow(ZipError);
  });
});
