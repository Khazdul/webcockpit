// @vitest-environment happy-dom
// The player's system lines in the exports (ADR 0019 amendment "System
// lines"): derived login lines, editor rows, text export, payload
// `hiddenSys`, comment placement before them, and PlayerHost muting them.
import { describe, expect, it } from 'vitest';
import { PlayerHost, type PlayerOpenOptions } from '../../src/app/player-host';
import { KIND_IN, KIND_OUT, KIND_SYS, buildEditorLog, entrySegments } from '../../src/chrome/frames/export-model';
import { ENTRY_COMMENT, ENTRY_GMCP, buildTimeline } from '../../src/player/timeline';
import { SettingsStore, defaultSettings } from '../../src/settings';
import { type ExportDoc, defaultExportDoc } from '../../src/share/edits';
import { buildReplayPayload, payloadEdits } from '../../src/share/payload';
import { systemLines } from '../../src/share/system-lines';
import { buildTextExport } from '../../src/share/text';
import { BASE_US, FakeWall, makeLog, meta } from './player-helpers';

const us = (s: number) => BASE_US + Math.round(s * 1e6);
const H = 3600;

function chain() {
  const r1 = makeLog(BASE_US, [
    { at: 0, gmcp: 'Comm.Channel.List', json: [{ name: 'tells' }] },
    { at: 1, gmcp: 'Char.Name', json: { name: 'Rasta', fullname: 'Rasta Fari' } },
    { at: 1.1, out: 'change width all 500' },
    { at: 2, in: 'Reconnecting.' },
    { at: 3, in: 'oO>' },
    { at: 4, out: 'look' },
    { at: 5, in: 'A room.' },
    // A second Char.Name in the same connection prints nothing.
    { at: 6, gmcp: 'Char.Name', json: { name: 'Rasta' } },
    { at: 7, in: 'Still here.' },
  ]);
  const r2 = makeLog(us(H), [
    // No name in this Char.Name: the earlier one is kept.
    { at: 1, gmcp: 'Char.Name', json: {} },
    { at: 2, in: 'Back again.' },
    { at: 3, gmcp: 'Core.Goodbye', json: 'bye' },
    { at: 4, in: 'Gone.' },
  ]);
  return [
    { meta: meta('Rasta/a', BASE_US), text: r1 },
    { meta: meta('Rasta/b', us(H)), text: r2 },
  ];
}

const doc = (over: Partial<ExportDoc> = {}): ExportDoc => ({ ...defaultExportDoc('Rasta/a'), ...over });

describe('systemLines', () => {
  it('derives one login line per connection, named from Char.Name', () => {
    expect(systemLines(chain())).toEqual([
      { kind: 'sys', run: 0, ts: us(1), body: 'Rasta logged in.' },
      { kind: 'sys', run: 1, ts: us(H + 1), body: 'Rasta logged in.' },
    ]);
  });

  it('falls back to Character without a name; nothing after Core.Goodbye', () => {
    const text = makeLog(BASE_US, [
      { at: 0, gmcp: 'Core.Goodbye' },
      { at: 1, gmcp: 'Char.Name', json: { name: 'Late' } },
    ]);
    expect(systemLines([{ text }])).toEqual([]);
    expect(systemLines([{ text: makeLog(BASE_US, [{ at: 0, gmcp: 'Char.Name', json: { name: '' } }]) }])).toEqual([
      { kind: 'sys', run: 0, ts: BASE_US, body: 'Character logged in.' },
    ]);
  });
});

describe('export editor log', () => {
  it('shows the login lines as rows where the player prints them', () => {
    const log = buildEditorLog(chain());
    expect([...log.kind].slice(0, 5)).toEqual([KIND_SYS, KIND_IN, KIND_IN, KIND_OUT, KIND_IN]);
    expect(log.ts[0]).toBe(us(1));
    expect(log.raw[0]).toBe('Rasta logged in.');
    expect(log.len[0]).toBe('[SYSTEM] Rasta logged in.'.length);
    expect(entrySegments(log, 0, 80)).toEqual([[{ text: '[SYSTEM] Rasta logged in.', cls: 'wc-exp-sys' }]]);
    const second = log.ts.indexOf(us(H + 1));
    expect(log.kind[second]).toBe(KIND_SYS);
  });
});

describe('text export', () => {
  it('writes the shown system lines and leaves out excluded ones', () => {
    expect(buildTextExport(chain(), doc({ comments: [{ beforeUs: us(1), text: 'Top.' }] }))).toBe(
      ['## Top.', '[SYSTEM] Rasta logged in.', 'Reconnecting.', 'oO> look', 'A room.', 'Still here.', '', '[SYSTEM] Rasta logged in.', 'Back again.', 'Gone.', ''].join(
        '\n',
      ),
    );
    const t = buildTextExport(chain(), doc({ excludes: [[us(1), us(2)]] }));
    expect(t.startsWith('Reconnecting.\n')).toBe(true);
    expect(t.match(/\[SYSTEM\]/g)!.length).toBe(1);
  });
});

describe('replay payload', () => {
  it('lists excluded login lines in hiddenSys and keeps their Char.Name', () => {
    const p = buildReplayPayload(chain(), [], doc({ excludes: [[us(H + 1), us(H + 2)]] }), defaultSettings());
    expect(p.hiddenSys).toEqual([1]);
    expect(p.runs[1]!.text).toContain('Char.Name');
    expect(buildReplayPayload(chain(), [], doc(), defaultSettings()).hiddenSys).toBeUndefined();
  });

  it('keeps a comment on a shown login line there; moves one off a hidden line', () => {
    const shown = buildReplayPayload(chain(), [], doc({ comments: [{ beforeUs: us(1), text: 'Top.' }] }), defaultSettings());
    expect(shown.comments[0]!.beforeUs).toBe(us(1));
    const hidden = buildReplayPayload(
      chain(),
      [],
      doc({ excludes: [[us(1), us(2)]], comments: [{ beforeUs: us(1), text: 'Top.' }] }),
      defaultSettings(),
    );
    expect(hidden.hiddenSys).toEqual([0]);
    expect(hidden.comments[0]!.beforeUs).toBe(us(2));
  });

  it('the timeline puts a comment on the login line before its Char.Name entry', () => {
    const p = buildReplayPayload(chain(), [], doc({ comments: [{ beforeUs: us(1), text: 'Top.' }] }), defaultSettings());
    const tl = buildTimeline(p.runs, payloadEdits(p));
    const c = [...tl.kind].indexOf(ENTRY_COMMENT);
    expect(tl.kind[c + 1]).toBe(ENTRY_GMCP);
    expect(tl.ts[c + 1]).toBe(us(1));
  });
});

describe('PlayerHost hiddenSys', () => {
  const frame = () => new Promise((r) => setTimeout(r, 40));
  async function rows(opts: PlayerOpenOptions): Promise<string[]> {
    const root = document.createElement('div');
    root.style.cssText = 'width:1200px;height:800px';
    document.body.appendChild(root);
    const wall = new FakeWall();
    const viewer = new SettingsStore({ factory: null, storage: null, win: null });
    void viewer.load();
    const host = new PlayerHost({ root, settings: viewer, wall, onClose: () => {} });
    host.openChain(chain(), [], { character: 'Rasta' }, opts);
    wall.advance(20_000);
    await frame();
    const out = [...host.app!.output.el.querySelectorAll<HTMLElement>('.wc-row')].map((r) => r.textContent ?? '');
    host.dispose();
    root.remove();
    return out;
  }

  it('prints every login line by default and mutes the listed runs', async () => {
    const all = await rows({});
    expect(all.filter((t) => t === '[SYSTEM] Rasta logged in.').length).toBe(2);
    expect(all[0]).toBe('[SYSTEM] Rasta logged in.');
    const muted = await rows({ hiddenSys: [0] });
    expect(muted.filter((t) => t === '[SYSTEM] Rasta logged in.').length).toBe(1);
    expect(muted[0]).toBe('Reconnecting.');
    expect(muted.indexOf('[SYSTEM] Rasta logged in.')).toBe(muted.indexOf('Back again.') - 1);
  });

  it('shows a top comment, below a blank row, before the login line', async () => {
    const p = buildReplayPayload(chain(), [], doc({ comments: [{ beforeUs: us(1), text: 'Top.' }] }), defaultSettings());
    const out = await rows({ edits: payloadEdits(p) });
    expect(out.slice(0, 4)).toEqual(['', '## Top.', '[SYSTEM] Rasta logged in.', 'Reconnecting.']);
  });
});
