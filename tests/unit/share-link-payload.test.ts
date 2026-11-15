// Stage 64 C1 (ADR 0154 "What is uploaded"): the bytes a share link
// uploads are the gzip JSON of the export's payload, built as the HTML
// export builds it, validated, and with only the whitelisted settings: no
// export doc, no run's own fields, nothing from a setting the replay does
// not read. With the POST's framing (src/cloud/pub/api.ts), the whole body.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { pubBody, splitPubBody } from '../../src/cloud/pub/api';
import { validatePayload } from '../../src/replay/validate';
import { defaultSettings } from '../../src/settings';
import { defaultExportDoc } from '../../src/share/edits';
import { linkMeta } from '../../src/share/link';
import { type PreparedLink, prepareLinkPayload, playedSeconds } from '../../src/share/link-payload';
import { sealLinkPayload } from '../../src/share/link-seal';

const buildLinkPayload = async (...a: Parameters<typeof prepareLinkPayload>) => sealLinkPayload((await prepareLinkPayload(...a)) as PreparedLink);
import { REPLAY_SETTINGS_KEYS, buildReplayPayload } from '../../src/share/payload';
import type { ChainRun } from '../../src/player/timeline';

const FIXTURES = join(import.meta.dirname, '../fixtures');

function chainOf(name: string): ChainRun[] {
  const text = readFileSync(join(FIXTURES, name), 'utf8');
  const us = Number(/^(\d{16}) /.exec(text)?.[1] ?? 1_790_000_000_000_000);
  return [{ meta: { runId: `Rasta/${name}`, character: 'Rasta', startedUs: us, endedUs: null, sealed: true, bytes: text.length, lines: 0 }, text }];
}

describe('prepareLinkPayload and sealLinkPayload', () => {
  it('is the export payload, gzip JSON, validated, settings whitelisted; the POST body is only the meta and it', async () => {
    const chain = chainOf('gmcp-demo.log');
    const s = defaultSettings() as unknown as Record<string, any>;
    s.profile = 'MyPrivateProfile';
    s.login = { name: 'Rasta', password: 'hunter2' };
    s.cloud = { dataKey: 'dk-secret' };
    s.spotlights.characters = ['MyAlt'];
    s.appearance.password = 'hunter2';
    const first = chain[0]!.meta.startedUs;
    const doc = { ...defaultExportDoc('Rasta/x'), excludes: [[first + 10e6, first + 20e6]] as [number, number][], comments: [{ beforeUs: null, text: 'the end' }] };
    const made = await buildLinkPayload(chain, [], doc, s as never, null);

    // The bytes are gzip of exactly the export's payload (no map: none passed).
    const json = gunzipSync(made.bytes).toString('utf8');
    expect(JSON.parse(json)).toEqual(JSON.parse(JSON.stringify(buildReplayPayload(chain, [], doc, s as never))));
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(Object.keys(parsed.settings as object).sort()).toEqual([...REPLAY_SETTINGS_KEYS].sort());
    expect(() => validatePayload(parsed)).not.toThrow();
    // Nothing of the doc's own shape, the run's own fields or a private setting.
    expect(json).not.toMatch(/hunter2|MyPrivateProfile|MyAlt|dk-secret|sessionId|"excludes"|runId|"sealed"|"bytes"/);
    expect(made.lengthS).toBe(playedSeconds(made.payload));
    expect(made.lengthS).toBeGreaterThan(0);

    // The POST's body: the meta's length, the meta, these bytes; nothing else.
    const meta = linkMeta({ title: 'A fight', description: '', character: made.payload.character, level: made.payload.level, lengthS: made.lengthS });
    const body = pubBody(meta, made.bytes);
    const parts = splitPubBody(body)!;
    expect(parts.meta).toEqual(meta);
    expect(Object.keys(parts.meta as object).sort()).toEqual(Object.keys(meta).sort());
    expect(Buffer.from(parts.payload).equals(Buffer.from(made.bytes))).toBe(true);
  });

  it('refuses a payload the watch page would refuse', async () => {
    const chain = chainOf('gmcp-demo.log');
    // A comment longer than the validator takes (the editor caps at 600; a damaged doc might not).
    const doc = { ...defaultExportDoc('Rasta/x'), comments: [{ beforeUs: null, text: 'x'.repeat(5000) }] };
    await expect(buildLinkPayload(chain, [], doc, defaultSettings(), null)).rejects.toThrow();
  });
});
