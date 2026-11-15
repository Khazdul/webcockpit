// Stage 63 (ADR 0153, "The body"): a run's body in the cloud, round trip
// and refusals, in Node (the worker's code run inline).

import { describe, expect, it } from 'vitest';
import { RUN_BODY_TYPE } from '../../shared/cloud/api.ts';
import { deriveKeys, makeRoot, opaqueId } from '../../src/cloud/crypto';
import { encryptBody, openBody } from '../../src/cloud/crypto/segments';
import { type RunBodyErrorCode, decodeRunBody, encodeRunBody, isRunBodyError, runBodyHeader } from '../../src/cloud/runs/body';
import { inlineRunBodyCodec } from '../../src/cloud/runs/body-client';
import type { RunRows } from '../../src/runs/backup-format';
import { gunzip, gzip } from '../../src/cloud/sync/items';

const keys = await deriveKeys(makeRoot());
const sid = await opaqueId(keys.idKey, 'run', 'r1');

function rows(runId = 'r1', nChunks = 3, text = 'You hit the orc.\n'): RunRows {
  return {
    meta: {
      runId,
      character: 'Gandalf',
      startedUs: 1_000,
      endedUs: 9_000,
      sealed: true,
      bytes: nChunks * text.length,
      lines: nChunks,
      saved: true,
      rating: 4,
      savedUs: 9_500,
      summary: { startUs: 1_000, lastEventUs: 8_000, kills: 1, pkills: 0, deaths: 0, level: 3 },
    },
    events: [
      { runId, seq: 0, event: { type: 'run_start', us: 1_000, level: 3 } as never },
      { runId, seq: 1, event: { type: 'kill', us: 2_000, victim: 'an orc', xp: 10 } as never },
    ],
    chunks: Array.from({ length: nChunks }, (_, i) => ({ runId, seq: i, firstUs: 1_000 + i, lastUs: 1_000 + i, text: `${i}: ${text}` })),
  };
}

async function refusal(p: Promise<unknown>): Promise<RunBodyErrorCode> {
  try {
    await p;
  } catch (e) {
    if (isRunBodyError(e)) return e.code;
    throw e;
  }
  throw new Error('no refusal');
}

/** A body sealed from a plaintext of our own making (header and lines as given). */
async function sealPlain(lines: string[], id = sid, kind = 'run'): Promise<Blob> {
  const gz = await gzip(new TextEncoder().encode(lines.join('')) as Uint8Array<ArrayBuffer>);
  const parts: BlobPart[] = [];
  for await (const s of encryptBody(keys.dataKey, kind, id, [gz])) parts.push(s as Uint8Array<ArrayBuffer>);
  return new Blob(parts);
}

const line = (o: unknown): string => JSON.stringify(o) + '\n';

/** What a body gives back of `r`: all of it but the rating (the item's). */
const back = (r: RunRows): RunRows => {
  const { rating: _r, ...meta } = r.meta;
  return { ...r, meta };
};

describe('a run body', () => {
  it('round-trips a run: meta, events and chunks as restore writes them', async () => {
    const r = rows();
    const blob = await encodeRunBody(keys.dataKey, sid, r);
    expect(blob.size).toBeGreaterThan(0);
    expect(await decodeRunBody(keys.dataKey, sid, 'r1', blob)).toEqual(back(r));
    // From a stream too (the fetch's response).
    expect(await decodeRunBody(keys.dataKey, sid, 'r1', blob.stream())).toEqual(back(r));
    // Another rating, the same plaintext: the same size.
    expect((await encodeRunBody(keys.dataKey, sid, { ...r, meta: { ...r.meta, rating: 1 } })).size).toBe(blob.size);
  });

  it('is the header line and the backup lines, gzipped', async () => {
    const r = rows('r1', 1);
    const plain = await openBody(keys.dataKey, 'run', sid, new Uint8Array(await (await encodeRunBody(keys.dataKey, sid, r)).arrayBuffer()));
    const text = new TextDecoder().decode(await gunzip(plain));
    const ls = text.split('\n');
    expect(ls[0]).toBe(`{"type":"${RUN_BODY_TYPE}","v":1}`);
    expect(ls[0] + '\n').toBe(runBodyHeader());
    expect(JSON.parse(ls[1]!)).toEqual({ type: 'run', run: back(r).meta });
    expect(JSON.parse(ls[2]!)).toMatchObject({ type: 'event', runId: 'r1', seq: 0 });
    expect(JSON.parse(ls[4]!)).toMatchObject({ type: 'chunk', runId: 'r1', seq: 0 });
    expect(ls.at(-1)).toBe('');
  });

  it('round-trips a run larger than a segment, and an empty one', async () => {
    const big = rows('r1', 800);
    // Random-ish text so gzip leaves it over a segment.
    for (const c of big.chunks) c.text = Array.from({ length: 300 }, () => Math.random().toString(36).slice(2)).join(' ');
    const blob = await encodeRunBody(keys.dataKey, sid, big);
    expect(blob.size).toBeGreaterThan(1 << 20);
    expect(await decodeRunBody(keys.dataKey, sid, 'r1', blob)).toEqual(back(big));
    const empty = { ...rows('r1', 0), events: [] };
    expect(await decodeRunBody(keys.dataKey, sid, 'r1', await encodeRunBody(keys.dataKey, sid, empty))).toEqual(back(empty));
  });

  it('seals an unsealed meta as restore does', async () => {
    const r = rows();
    const blob = await sealPlain([runBodyHeader(), line({ type: 'run', run: { ...r.meta, sealed: false, endedUs: null } })]);
    expect((await decodeRunBody(keys.dataKey, sid, 'r1', blob)).meta).toMatchObject({ sealed: true, endedUs: 1_000 });
  });

  it('refuses a body of another id or kind, or another run inside', async () => {
    const blob = await encodeRunBody(keys.dataKey, sid, rows());
    const other = await opaqueId(keys.idKey, 'run', 'r2');
    expect(await refusal(decodeRunBody(keys.dataKey, other, 'r1', blob))).toBe('unreadable');
    expect(await refusal(decodeRunBody(keys.dataKey, sid, 'r1', await sealPlain([runBodyHeader(), line({ type: 'run', run: rows().meta })], sid, 'exportDoc')))).toBe(
      'unreadable',
    );
    // Sealed for r2's id but holding r1: the id opens, the run is not the one asked for.
    expect(await refusal(decodeRunBody(keys.dataKey, other, 'r2', await encodeRunBody(keys.dataKey, other, rows('r1'))))).toBe('wrong_run');
    const wrongKey = await deriveKeys(makeRoot());
    expect(await refusal(decodeRunBody(wrongKey.dataKey, sid, 'r1', blob))).toBe('unreadable');
  });

  it('refuses a newer header v, and a newer segment format, as newer', async () => {
    expect(await refusal(decodeRunBody(keys.dataKey, sid, 'r1', await sealPlain([line({ type: RUN_BODY_TYPE, v: 2 }), line({ type: 'run', run: rows().meta })]))))
      .toBe('newer');
    const blob = new Uint8Array(await (await encodeRunBody(keys.dataKey, sid, rows())).arrayBuffer());
    blob[0] = 2;
    expect(await refusal(decodeRunBody(keys.dataKey, sid, 'r1', new Blob([blob])))).toBe('newer');
  });

  it('refuses a truncated or changed body', async () => {
    const blob = new Uint8Array(await (await encodeRunBody(keys.dataKey, sid, rows())).arrayBuffer());
    for (const cut of [blob.length - 1, blob.length - 20, 30, 21, 3, 0]) {
      expect(await refusal(decodeRunBody(keys.dataKey, sid, 'r1', new Blob([blob.slice(0, cut)]))), `cut at ${cut}`).toBe('unreadable');
    }
    const changed = blob.slice();
    changed[40] = changed[40]! ^ 1;
    expect(await refusal(decodeRunBody(keys.dataKey, sid, 'r1', new Blob([changed])))).toBe('unreadable');
  });

  it('refuses what is not a run body: no header, export lines, a second run, a bad line', async () => {
    const m = rows().meta;
    const cases: string[][] = [
      [line({ type: 'run', run: m })],
      [line({ type: 'webcockpit-runs', schema: 1 }), line({ type: 'run', run: m })],
      [line({ type: RUN_BODY_TYPE }), line({ type: 'run', run: m })],
      [runBodyHeader()],
      [runBodyHeader(), line({ type: 'run', run: m }), line({ type: 'export', doc: { sessionId: 'r1' } })],
      [runBodyHeader(), line({ type: 'run', run: m }), line({ type: 'run', run: m })],
      [runBodyHeader(), line({ type: 'run', run: { ...m, bytes: 'x' } })],
      [runBodyHeader(), line({ type: 'run', run: m }), line({ type: 'chunk', runId: 'r9', seq: 0, firstUs: 0, lastUs: 0, text: '' })],
      [runBodyHeader(), line({ type: 'event', runId: 'r1', seq: 0, event: { type: 'x', us: 1 } })],
      [runBodyHeader(), '{not json\n'],
    ];
    for (const c of cases) expect(await refusal(decodeRunBody(keys.dataKey, sid, 'r1', await sealPlain(c))), c.join('')).toBe('unreadable');
    // Not gzip inside.
    const parts: BlobPart[] = [];
    for await (const s of encryptBody(keys.dataKey, 'run', sid, [new TextEncoder().encode(runBodyHeader())])) parts.push(s as Uint8Array<ArrayBuffer>);
    expect(await refusal(decodeRunBody(keys.dataKey, sid, 'r1', new Blob(parts)))).toBe('unreadable');
  });

  it('stops a gzip bomb at the cap', async () => {
    // 64 MB of one line that gzips to some 64 KB.
    const zeros = new Uint8Array(64 * 1024 * 1024).fill(0x61);
    const gz = await gzip(zeros);
    expect(gz.length).toBeLessThan(1 << 20);
    const parts: BlobPart[] = [];
    for await (const s of encryptBody(keys.dataKey, 'run', sid, [gz])) parts.push(s as Uint8Array<ArrayBuffer>);
    expect(await refusal(decodeRunBody(keys.dataKey, sid, 'r1', new Blob(parts), { maxPlainBytes: 8 * 1024 * 1024 }))).toBe('too_large');
    // A real body under a small cap is refused too; under the default it opens.
    const blob = await encodeRunBody(keys.dataKey, sid, rows('r1', 50));
    expect(await refusal(decodeRunBody(keys.dataKey, sid, 'r1', blob, { maxPlainBytes: 100 }))).toBe('too_large');
  });

  it('the client without workers runs the same code on this thread', async () => {
    const codec = inlineRunBodyCodec();
    const r = rows();
    const blob = await codec.encode(keys.dataKey, sid, r);
    expect(await codec.decode(keys.dataKey, sid, 'r1', blob)).toEqual(back(r));
    expect(await refusal(codec.decode(keys.dataKey, sid, 'r2', blob))).toBe('wrong_run');
  });
});
