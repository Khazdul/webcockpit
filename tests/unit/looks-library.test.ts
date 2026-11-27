// The token library as committed (stage 80, ADR 0170): the manifest and its
// files. Reads the committed files only: no ImageMagick, no network.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { type LibraryManifest, LIBRARY_VERSION, TOKEN_ID_RE } from '../../src/looks/library-types';
import { libraryOf, manifestUrl, tokenUrl } from '../../src/looks/library';

const RACE_KINDS = ['numenorean', 'halfelf', 'elf', 'dwarf', 'hobbit', 'troll', 'beorning', 'orc', 'human'];

const DIR = fileURLToPath(new URL('../../public/tokens/', import.meta.url));
const raw = readFileSync(join(DIR, 'tokens.json'), 'utf8');
const manifest = JSON.parse(raw) as LibraryManifest;

/** WebP: `RIFF....WEBP`, and the VP8X / VP8 / VP8L canvas size. */
function webpSize(buf: Buffer): { w: number; h: number } {
  expect(buf.subarray(0, 4).toString('latin1')).toBe('RIFF');
  expect(buf.subarray(8, 12).toString('latin1')).toBe('WEBP');
  const chunk = buf.subarray(12, 16).toString('latin1');
  if (chunk === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  if (chunk === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
  }
  return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
}

describe('the token library (public/tokens)', () => {
  it('is the set by Sunnyl75, in this format', () => {
    expect(manifest.v).toBe(LIBRARY_VERSION);
    expect(manifest.creator).toBe('Sunnyl75');
    expect(manifest.source).toBe('https://github.com/Sunnyl75/Character-Tokens-v3.0');
    expect(manifest.tokens.length).toBe(125);
  });

  it('has unique, well-formed ids, each with both files at their sizes', () => {
    const ids = manifest.tokens.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of manifest.tokens) {
      expect(TOKEN_ID_RE.test(t.id), t.id).toBe(true);
      expect(t.label.length, t.id).toBeGreaterThan(0);
      expect(['character', 'other', 'mount', 'mob']).toContain(t.group);
      expect(t.race === null || RACE_KINDS.includes(t.race), t.id).toBe(true);
      expect([null, 'male', 'female']).toContain(t.sex);
      expect(Array.isArray(t.tags)).toBe(true);
      if (t.group === 'mount' || t.group === 'mob') expect(t.match?.length, t.id).toBeGreaterThan(0);
      else expect(t.match).toBeUndefined();
      if (t.group !== 'character') expect(t.race, t.id).toBeNull();
      expect(webpSize(readFileSync(join(DIR, 'p', `${t.id}.webp`))), `p/${t.id}`).toEqual({ w: 256, h: 256 });
      expect(webpSize(readFileSync(join(DIR, 't', `${t.id}.webp`))), `t/${t.id}`).toEqual({ w: 128, h: 128 });
    }
  });

  it('has no file the manifest does not name', () => {
    const ids = new Set(manifest.tokens.map((t) => `${t.id}.webp`));
    for (const d of ['p', 't']) for (const f of readdirSync(join(DIR, d))) expect(ids.has(f), `${d}/${f}`).toBe(true);
    expect(readdirSync(DIR).sort()).toEqual(['p', 't', 'tokens.json']);
  });

  it('keeps to the budgets: all under 4 MB, the manifest under 25 KB', () => {
    let bytes = statSync(join(DIR, 'tokens.json')).size;
    for (const d of ['p', 't']) for (const f of readdirSync(join(DIR, d))) bytes += statSync(join(DIR, d, f)).size;
    expect(bytes).toBeLessThan(4 * 1024 * 1024);
    expect(Buffer.byteLength(raw)).toBeLessThan(25 * 1024);
  });

  it('counts as the stage file does (2026-11-26)', () => {
    const by = (f: (t: LibraryManifest['tokens'][number]) => boolean): number => manifest.tokens.filter(f).length;
    expect(by((t) => t.group === 'mount')).toBe(15);
    expect(by((t) => t.group === 'mob')).toBe(22);
    expect(by((t) => t.race === 'human')).toBe(20);
    expect(by((t) => t.race === 'elf')).toBe(13);
    expect(by((t) => t.race === 'dwarf')).toBe(4);
    expect(by((t) => t.race === 'hobbit')).toBe(15);
    expect(by((t) => t.race === 'orc')).toBe(15);
    expect(by((t) => t.race === 'troll')).toBe(8);
    // The spec's example, a name with a space and one with underscores.
    const ids = manifest.tokens.map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining(['elf-f-noldor', 'hobbit-f-cleric-2', 'mob-cat-black-and-white', 'mount-trained-horse', 'bear-m', 'bear-f']));
  });

  it('gives URLs under the base, the manifest with the release in its query', () => {
    expect(tokenUrl('elf-f-noldor', 'p', '/')).toBe('/tokens/p/elf-f-noldor.webp');
    expect(tokenUrl('elf-f-noldor', 't', '/x/')).toBe('/x/tokens/t/elf-f-noldor.webp');
    expect(manifestUrl('/', '0.24.0')).toBe('/tokens/tokens.json?v=0.24.0');
    const lib = libraryOf(manifest);
    expect(lib.has('elf-f-noldor')).toBe(true);
    expect(lib.has('nope')).toBe(false);
    expect(libraryOf({ tokens: [...manifest.tokens, { ...manifest.tokens[0]!, id: 'Bad Id' }] }).tokens).toHaveLength(125);
  });

  it('is cached a year (ids never change) by public/_headers', () => {
    const headers = readFileSync(fileURLToPath(new URL('../../public/_headers', import.meta.url)), 'utf8');
    expect(headers).toMatch(/^\/tokens\/\*\n {2}! Cache-Control\n {2}Cache-Control: public, max-age=31536000, immutable$/m);
  });
});

describe('the Worker’s list of library ids (shared/cloud/look-tokens.ts, stage 80 part E)', () => {
  it('is the manifest’s ids, sorted', async () => {
    const { LOOK_TOKEN_IDS } = await import('../../shared/cloud/look-tokens');
    expect([...LOOK_TOKEN_IDS]).toEqual(manifest.tokens.map((t) => t.id).sort());
  });

  it('the directory’s kinds are race.ts’s', async () => {
    const { LOOK_RACES, LOOK_SUBRACES } = await import('../../shared/cloud/api');
    const { SUBRACE_RACE } = await import('../../src/gmcp/race');
    expect([...LOOK_RACES].sort()).toEqual([...RACE_KINDS].sort());
    expect(LOOK_SUBRACES).toEqual(SUBRACE_RACE);
  });
});
