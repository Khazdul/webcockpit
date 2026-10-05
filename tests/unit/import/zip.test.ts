import { describe, expect, it } from 'vitest';
import { ZipError, isZip, readZip } from '../../../src/import/zip';

const enc = new TextEncoder();

function crc32(data: Uint8Array): number {
  let c = ~0;
  for (const b of data) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A zip archive built by hand: stored or deflated entries, a directory entry, an archive comment. */
async function buildZip(entries: Array<{ name: string; text: string; deflate: boolean }>, comment = ''): Promise<Uint8Array> {
  const locals: number[] = [];
  const central: number[] = [];
  const u16 = (a: number[], v: number) => a.push(v & 0xff, (v >>> 8) & 0xff);
  const u32 = (a: number[], v: number) => a.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  for (const e of entries) {
    const raw = enc.encode(e.text);
    const data = e.deflate ? await deflateRaw(raw) : raw;
    const name = enc.encode(e.name);
    const offset = locals.length;
    const head = (a: number[], sig: number) => {
      u32(a, sig);
      if (sig === 0x02014b50) u16(a, 20);
      u16(a, 20);
      u16(a, 0x800);
      u16(a, e.deflate ? 8 : 0);
      u32(a, 0);
      u32(a, crc32(raw));
      u32(a, data.length);
      u32(a, raw.length);
      u16(a, name.length);
      u16(a, 0);
    };
    head(locals, 0x04034b50);
    locals.push(...name, ...data);
    head(central, 0x02014b50);
    u16(central, 0);
    u16(central, 0);
    u16(central, 0);
    u32(central, 0);
    u32(central, offset);
    central.push(...name);
  }
  const end: number[] = [];
  u32(end, 0x06054b50);
  u16(end, 0);
  u16(end, 0);
  u16(end, entries.length);
  u16(end, entries.length);
  u32(end, central.length);
  u32(end, locals.length);
  const c = enc.encode(comment);
  u16(end, c.length);
  return Uint8Array.from([...locals, ...central, ...end, ...c]);
}

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
