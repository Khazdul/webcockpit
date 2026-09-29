// Text export and replay payload (ADR 0019 "What an exclusion removes").
import { describe, expect, it } from 'vitest';
import type { RunEvent } from '../../src/runs/events';
import { defaultSettings } from '../../src/settings';
import { captureEntries, stripAnsi } from '../../src/share/capture';
import { type ExportDoc, defaultExportDoc } from '../../src/share/edits';
import { buildReplayPayload, editRunText, payloadEdits } from '../../src/share/payload';
import { ENTRY_COMMENT, buildTimeline } from '../../src/player/timeline';
import { buildTextExport } from '../../src/share/text';
import { BASE_US, makeLog, meta } from './player-helpers';

const us = (s: number) => BASE_US + Math.round(s * 1e6);

function chain() {
  const r1 = makeLog(BASE_US, [
    { at: 0, gmcp: 'Comm.Channel.List', json: [{ name: 'tells' }] },
    { at: 0.1, view: { appearance: { size: 14 } } },
    { at: 0.2, out: 'change width all 500' },
    { at: 1, in: '\x1b[32mA green room.\x1b[0m' },
    { at: 2, in: 'HP:Healthy>' },
    { at: 3, out: 'kill orc' },
    { at: 4, in: 'You hit the orc.' },
    { at: 5, gmcp: 'Char.Vitals', json: { hp: 90 } },
    { at: 6, gmcp: 'Comm.Channel.Text', json: { channel: 'tells', text: 'secret plans' } },
    { at: 7, in: 'Secret line.' },
    { at: 8, out: 'say secret' },
    { at: 9, in: 'HP:Hurt>' },
    { at: 9.5, out: '' },
    { at: 10, out: 'flee' },
    { at: 11, in: 'You flee.' },
  ]);
  const r2 = makeLog(us(3600), [
    { at: 0, gmcp: 'Char.Vitals', json: { hp: 100 } },
    { at: 1, in: 'Back again.' },
  ]);
  return [
    { meta: meta('Rasta/a', BASE_US, { summary: { startUs: BASE_US, lastEventUs: us(11), level: 41, kills: 0, pkills: 0, deaths: 0 } }), text: r1 },
    { meta: meta('Rasta/b', us(3600), { summary: { startUs: us(3600), lastEventUs: us(3601), level: 42, kills: 0, pkills: 0, deaths: 0 } }), text: r2 },
  ];
}

const doc = (over: Partial<ExportDoc> = {}): ExportDoc => ({ ...defaultExportDoc('Rasta/a'), ...over });

describe('capture reading', () => {
  it('reads entries with kinds, bodies and whole lines', () => {
    const es = [...captureEntries(chain()[0]!.text)];
    expect(es.map((e) => e.kind).slice(0, 6)).toEqual(['gmcp', 'view', 'out', 'in', 'in', 'out']);
    expect(es[0]!.pkg).toBe('Comm.Channel.List');
    expect(es.map((e) => e.line).join('')).toBe(chain()[0]!.text);
    expect([...captureEntries('garbage\n1790000000000000 no newline')].map((e) => e.line)).toEqual(['1790000000000000 no newline\n']);
    expect(stripAnsi('\x1b[1;31mred\x1b[0m')).toBe('red');
  });
});

describe('buildTextExport', () => {
  it('writes kept lines, echoed commands and a blank line between runs', () => {
    expect(buildTextExport(chain(), doc())).toBe(
      [
        'A green room.',
        'HP:Healthy> kill orc',
        'You hit the orc.',
        'Secret line.',
        'say secret',
        'HP:Hurt> flee',
        'You flee.',
        '',
        'Back again.',
        '',
      ].join('\n'),
    );
  });

  it('drops excluded lines and writes comments as ## lines before their anchor', () => {
    const d = doc({
      excludes: [[us(6), us(9)]],
      comments: [
        { beforeUs: us(4), text: 'Here it starts.' },
        { beforeUs: us(7), text: 'On an excluded line.' },
        { beforeUs: us(3601), text: 'Run two.' },
        { beforeUs: null, text: 'The end.' },
      ],
    });
    expect(buildTextExport(chain(), d)).toBe(
      [
        'A green room.',
        'HP:Healthy> kill orc',
        '## Here it starts.',
        'You hit the orc.',
        '## On an excluded line.',
        'HP:Hurt> flee',
        'You flee.',
        '',
        '## Run two.',
        'Back again.',
        '## The end.',
        '',
      ].join('\n'),
    );
  });
});

describe('buildReplayPayload', () => {
  const events: RunEvent[] = [
    { type: 'run_start', us: BASE_US, character: 'Rasta', schema: 1 },
    { type: 'pkill', us: us(4.5), logUs: us(4), name: 'Ibuki', race: 'the Half-Elf', xpDelta: 1 },
    { type: 'char_death', us: us(7.2), logUs: us(7) },
    { type: 'kill', us: us(8), logUs: us(8), mobName: 'an orc', xpDelta: 5 },
    { type: 'level_up', us: us(3600.5), level: 42 },
  ];

  it('removes excluded text, keeps state, computes cuts and filters markers', () => {
    const d = doc({ title: ' Fight ', excludes: [[us(6), us(9)]], comments: [{ beforeUs: us(7), text: 'x'.repeat(90) }] });
    const settings = defaultSettings();
    const p = buildReplayPayload(chain(), events, d, settings);
    expect(p).toMatchObject({ schema: 1, title: 'Fight', character: 'Rasta', level: 42, startUs: BASE_US });
    const all = p.runs.map((r) => r.text).join('');
    for (const gone of ['secret plans', 'Secret line.', 'say secret']) expect(all).not.toContain(gone);
    expect(all).toContain('Char.Vitals {"hp":90}');
    expect(all).toContain('Comm.Channel.List');
    expect(all).toContain('HP:Hurt>');
    expect(p.runs[1]!.text).toBe(chain()[1]!.text);
    expect(p.cuts).toEqual([[us(6), us(9)]]);
    expect(p.markers).toEqual([
      { us: us(4), kind: 'K' },
      { us: us(3600.5), kind: 'L' },
    ]);
    // The comment on a removed line moves to the next kept visible entry.
    expect(p.comments).toEqual([{ beforeUs: us(9), text: 'x'.repeat(90), holdMs: 4000 }]);
    expect(p.settings).toEqual(settings);
    expect(p.settings).not.toBe(settings);
    // It plays: the comment holds before `HP:Hurt>`, the cut is short.
    const tl = buildTimeline(p.runs, payloadEdits(p));
    const ci = [...tl.kind].indexOf(ENTRY_COMMENT);
    expect(tl.ts[ci]).toBe(us(9));
    expect(tl.play[ci + 1]! - tl.play[ci]!).toBe(4000);
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  });

  it('leaves texts as they are without exclusions; a trailing range moves comments to the end', () => {
    expect(editRunText(chain()[0]!.text, doc())).toBe(chain()[0]!.text);
    const p = buildReplayPayload(chain(), [], doc({ excludes: [[us(3600.9), null]], comments: [{ beforeUs: us(3601), text: 'bye' }] }), defaultSettings());
    expect(p.runs[1]!.text).not.toContain('Back again.');
    expect(p.comments[0]!.beforeUs).toBeNull();
    expect(p.title).toBe('');
  });
});
