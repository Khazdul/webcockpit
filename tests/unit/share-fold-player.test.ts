// @vitest-environment happy-dom
// Excluded state folding end to end (ADR 0019 addendum): a folded replay
// plays in a real PlayerHost like the unfolded one — the panes, the game
// window, the UI pane, the clocks and the settings are the same after
// every cut and at the end.
import { describe, expect, it } from 'vitest';
import { formatPaneRecord } from '../../src/capture/format';
import { defaultSettings } from '../../src/settings';
import { type ExcludeRange, defaultExportDoc } from '../../src/share/edits';
import { type FoldStats } from '../../src/share/fold';
import { buildReplayPayload } from '../../src/share/payload';
import { checkpoints, digestEnd, keptPlays, openPayload, prefixPayload } from './fold-helpers';
import { BASE_US, type LogItem, makeLog, meta } from './player-helpers';

const us = (s: number) => BASE_US + Math.round(s * 1e6);

const PANES = {
  character: { on: true, color: 'black', border: true },
  timers: { on: true, color: 'black', border: true },
  group: { on: true, color: 'black', border: true },
  comm: { on: true, color: 'black', border: true },
  ui: { on: true, color: 'black', border: true },
  map: { on: false, color: 'black', border: true },
};

/** A busy stretch of game traffic from `at` on: group, vitals, rooms, moves. */
function busy(at: number, n: number, seed: number): LogItem[] {
  const out: LogItem[] = [];
  let xp = 1_000_000 + seed * 1000;
  for (let i = 0; i < n; i++) {
    const t = at + i * 0.7;
    const id = 1 + ((i * 7 + seed) % 5);
    switch (i % 9) {
      case 0:
        out.push({ at: t, gmcp: 'Group.Add', json: { id, type: i % 2 ? 'npc' : 'ally', name: `N${id}`, label: i % 4 ? `L${id}` : 0, hp: 50, maxhp: 100, mapid: 1000 + id } });
        break;
      case 1:
        out.push({ at: t, gmcp: 'Group.Update', json: { id, 'hp-string': 'hurt', mana: 10 + i } });
        break;
      case 2:
        out.push({ at: t, gmcp: 'Char.Vitals', json: { hp: 100 - i, xp: (xp += i % 3 ? 300 : -200), buffer: `N${id}`, 'buffer-hits': 'wounded' } });
        break;
      case 3:
        out.push({ at: t, gmcp: 'Event.Moved', json: { dir: 'north' } });
        break;
      case 4:
        out.push({ at: t, gmcp: 'Room.Info', json: { id: 2000 + i, name: `Room ${i}`, desc: 'A room.' } });
        break;
      case 5:
        out.push({ at: t, gmcp: 'Room.Chars.Update', json: { id: 9, name: 'x' } });
        break;
      case 6:
        out.push({ at: t, gmcp: 'Group.Remove', json: id });
        break;
      case 7:
        out.push({ at: t, gmcp: 'Char.Vitals', json: { tp: 5000 + i, mood: i % 2 ? 'brave' : 'wimpy', opponent: `L${id}`, 'opponent-hits': 'awful' } });
        break;
      default:
        out.push({ at: t, gmcp: 'Comm.Channel.List', json: [{ name: 'tells' }, { name: `c${i}` }] });
    }
  }
  return out;
}

function chain() {
  const r1 = makeLog(BASE_US, [
    { at: 0, gmcp: 'Comm.Channel.List', json: [{ name: 'tells' }] },
    { at: 0.1, view: { appearance: { size: 14 }, panes: PANES } },
    { at: 0.2, gmcp: 'Char.Name', json: { name: 'Rasta', fullname: 'Rasta the Ranger' } },
    { at: 0.3, gmcp: 'Char.StatusVars', json: { race: 'Elf', level: 40 } },
    { at: 0.4, gmcp: 'Char.Vitals', json: { hp: 100, maxhp: 120, xp: 999_000, tp: 4000 } },
    ...busy(1, 30, 1),
    { at: 25, in: 'You see an orc.' },
    { at: 26, out: 'kill orc' },
    { at: 27.7, in: 'An orc is dead! R.I.P.' },
    // Inside the next range, within the kill fold's 500 ms: a guard.
    { at: 28.05, gmcp: 'Char.Vitals', json: { xp: 1_100_000 } },
    { at: 28.1, gmcp: 'Char.Vitals', json: { xp: 1_100_500 } },
    ...busy(30, 60, 2),
    { at: 40, gmcp: 'Event.Sun', json: { what: 'rise' } },
    { at: 50, view: { appearance: { size: 15 }, panes: PANES } },
    { at: 60, gmcp: 'Event.Achieved', json: { what: 'Explorer' } },
    { at: 75, out: 'north' },
    { at: 76, in: 'You go north.' },
    ...busy(80, 40, 3),
    { at: 200, in: 'Exits: north.' },
    { at: 201, in: 'Clip two.' },
  ]);
  const r2 = makeLog(us(400), [
    { at: 0, gmcp: 'Comm.Channel.List', json: [{ name: 'tales' }] },
    { at: 0.1, view: { appearance: { size: 16 }, panes: PANES } },
    { at: 0.2, gmcp: 'Char.Name', json: { name: 'Rasta' } },
    ...busy(1, 40, 4),
    { at: 50, in: 'All excluded.' },
  ]);
  const r3 = makeLog(us(600), [
    { at: 0, gmcp: 'Char.Name', json: { name: 'Rasta' } },
    { at: 0.1, gmcp: 'Char.Vitals', json: { hp: 90, xp: 1_200_000, tp: 4100 } },
    ...busy(1, 30, 5),
    { at: 30, in: 'Clip three.' },
    ...busy(31, 10, 6),
    { at: 40, in: 'The end.' },
  ]);
  const pane = formatPaneRecord(us(31), 's/a', '{"title":"A","lines":[],"links":[]}');
  return [
    { meta: meta('Rasta/a', BASE_US), text: r1 + pane },
    { meta: meta('Rasta/b', us(400)), text: r2 },
    { meta: meta('Rasta/c', us(600)), text: r3 },
    // In time order (the busy stretches overlap the other items).
  ].map((r) => ({ ...r, text: r.text.split('\n').filter(Boolean).sort().join('\n') + '\n' }));
}

const SETS: Record<string, ExcludeRange[]> = {
  middle: [[us(28), us(200)]],
  clips: [
    [0, us(24)],
    [us(28), us(76)],
    [us(77), us(200)],
    [us(202), us(629)],
    [us(631), us(639)],
  ],
};

describe('a folded replay in the player', () => {
  for (const [name, excludes] of Object.entries(SETS)) {
    it(`plays like the unfolded one (${name})`, () => {
      const doc = { ...defaultExportDoc('Rasta/a'), excludes };
      const stats: FoldStats = { segments: 0, fallbacks: 0, paces: 0 };
      const plain = buildReplayPayload(chain(), [], doc, defaultSettings(), { fold: false, dropRuns: false });
      const folded = buildReplayPayload(chain(), [], doc, defaultSettings(), { dropRuns: false, foldStats: stats });
      expect(stats.segments).toBeGreaterThan(0);
      expect(stats.fallbacks).toBe(0);
      const size = (p: typeof plain) => p.runs.reduce((n, r) => n + r.text.length, 0);
      expect(size(folded)).toBeLessThan(size(plain));
      const a = openPayload(plain);
      const b = openPayload(folded);
      expect(keptPlays(folded, b.tl)).toBe(keptPlays(plain, a.tl));
      expect(b.tl.durationMs).toBe(a.tl.durationMs);
      a.host.dispose();
      b.host.dispose();
      for (const at of [...checkpoints(plain), Infinity]) {
        const da = digestEnd(prefixPayload(plain, at));
        const db = digestEnd(prefixPayload(folded, at));
        expect(db, `at ${at}`).toEqual(da);
        // The kill folded on the vitals inside the range.
        if (at === Infinity) expect(da.ui).toContain('"101k"');
      }
    });
  }

  it('without the left-out runs, differs only in their connection lines', () => {
    const doc = { ...defaultExportDoc('Rasta/a'), excludes: SETS.clips! };
    const plain = buildReplayPayload(chain(), [], doc, defaultSettings(), { fold: false, dropRuns: false });
    const full = buildReplayPayload(chain(), [], doc, defaultSettings());
    expect(full.runs).toHaveLength(2);
    const da = digestEnd(plain);
    const db = digestEnd(full);
    const ui = (d: typeof da) => (JSON.parse(d.ui!) as Array<{ parts: unknown[] }>).map((m) => JSON.stringify(m.parts));
    const conn = (s: string) => /Replay|logged/.test(s);
    expect(ui(db).filter((s) => !conn(s))).toEqual(ui(da).filter((s) => !conn(s)));
    for (const k of Object.keys(da)) if (k !== 'ui') expect(db[k], k).toBe(da[k]);
  });
});
