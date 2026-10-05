// Local smoke test on the owner's Mudlet profile (stage 20): runs only
// where the file exists; the file is never committed or modified.

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importFiles } from '../../../src/import';
import { load } from './helpers';

const SAMPLE = '/home/ole/Downloads/export (from save profile as).trigger';
const PRINT = process.env['MUDLET_SAMPLE_PRINT'] === '1';

describe.skipIf(!existsSync(SAMPLE))("owner's Mudlet profile", () => {
  it('imports, loads in the engine and translates most own items', () => {
    const r = importFiles([{ name: 'export (from save profile as).trigger', bytes: new Uint8Array(readFileSync(SAMPLE)) }]);
    expect(r.format).toBe('mudlet');
    expect(load(r.profileText)).toEqual({ ok: true, warnings: [] });
    expect(r.counts.translated).toBeGreaterThanOrEqual(190);
    if (PRINT) {
      const kept = r.items.filter((i) => i.outcome === 'kept').map((i) => `  ${i.line} ${i.source.split('  ')[0]}: ${i.reason}`);
      const skipped = r.items.filter((i) => i.outcome === 'skipped').map((i) => `  ${i.source}: ${i.reason}`);
      const lines = r.profileText.split('\n');
      const pick = (re: RegExp) => lines.find((l) => re.test(l)) ?? `(none for ${re})`;
      const samples = [
        /^#alias \{\^rook/,
        /^#alias \{\^silvery\$\}/,
        /^#alias \{\^z%/,
        /^#alias \{\^burn\$\}/,
        /^#alias \{\^sd%/,
        /^#alias \{\^c\$\}/,
        /^#macro \{F2\}/,
        /^#macro \{F4\}/,
        /PayMercenary|^#action \{%!\{\[\^/,
        /muteTells/,
        /^#action \{\^\(HIDEME\)/,
        /^#highlight \{\^- shield\}/,
        /^#alias \{\^char/,
        /^#alias \{\^s\{/,
        /^#alias \{\^ga\$\}/,
      ].map(pick);
      console.log(
        [`counts ${JSON.stringify(r.counts)}`, `file warnings ${JSON.stringify(r.fileWarnings)}`, 'kept:', ...kept, 'skipped:', ...skipped, 'samples:', ...samples].join('\n'),
      );
    }
  });
});
