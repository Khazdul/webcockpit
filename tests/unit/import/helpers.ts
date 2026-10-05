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
export async function buildZip(entries: Array<{ name: string; text: string; deflate: boolean }>, comment = ''): Promise<Uint8Array> {
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
