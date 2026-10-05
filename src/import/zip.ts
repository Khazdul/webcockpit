// A small zip reader for Mudlet `.mpackage` archives (ADR 0076 "Input").
// Reads the central directory, copies stored entries and inflates
// deflated ones with `DecompressionStream('deflate-raw')`, so it is async.
// No ZIP64, no encryption, no multi-disk archives; CRCs are not checked.

export interface ZipEntry {
  /** Path inside the archive (`/` separators). */
  name: string;
  bytes: Uint8Array;
}

export class ZipError extends Error {
  override name = 'ZipError';
}

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;

/** True when the bytes start with a zip local file header (`PK\3\4`). */
export function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The file entries of an archive (directories left out), in central directory order. */
export async function readZip(bytes: Uint8Array): Promise<ZipEntry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (o: number) => view.getUint16(o, true);
  const u32 = (o: number) => view.getUint32(o, true);
  // The end record sits in the last 22 + 65535 (comment) bytes.
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (u32(i) === SIG_END) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new ZipError('Not a zip archive (no end of central directory).');
  const count = u16(end + 10);
  let p = u32(end + 16);
  if (count === 0xffff || p === 0xffffffff) throw new ZipError('ZIP64 archives are not supported.');
  const utf8 = new TextDecoder('utf-8');
  const latin1 = new TextDecoder('windows-1252');
  const out: ZipEntry[] = [];
  for (let k = 0; k < count; k++) {
    if (p + 46 > bytes.length || u32(p) !== SIG_CENTRAL) throw new ZipError('Damaged zip central directory.');
    const flags = u16(p + 8);
    const method = u16(p + 10);
    const compSize = u32(p + 20);
    const nameLen = u16(p + 28);
    const extraLen = u16(p + 30);
    const commentLen = u16(p + 32);
    const local = u32(p + 42);
    const rawName = bytes.subarray(p + 46, p + 46 + nameLen);
    const name = (flags & 0x800 ? utf8 : latin1).decode(rawName);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    if (flags & 1) throw new ZipError(`${name} is encrypted.`);
    if (local + 30 > bytes.length || u32(local) !== SIG_LOCAL) throw new ZipError(`Damaged zip entry ${name}.`);
    const start = local + 30 + u16(local + 26) + u16(local + 28);
    const data = bytes.subarray(start, start + compSize);
    if (data.length !== compSize) throw new ZipError(`Truncated zip entry ${name}.`);
    if (method === 0) out.push({ name, bytes: data.slice() });
    else if (method === 8) out.push({ name, bytes: await inflateRaw(data) });
    else throw new ZipError(`${name} uses an unsupported compression method (${method}).`);
  }
  return out;
}
