// Timers across a cut (ADR 0033): the export replays each run's full text
// to the cut's end and writes the timers state into the edited text as a
// `WebCockpit.Timers` GMCP record; a replay hub replaces its state with it.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import { ReplayClock } from '../../src/player/clock';
import { defaultSettings } from '../../src/settings';
import { captureEntries } from '../../src/share/capture';
import { defaultExportDoc } from '../../src/share/edits';
import { buildReplayPayload } from '../../src/share/payload';
import { TIMERS_GMCP, timersStatesAt } from '../../src/share/timers-state';
import { TimersHub } from '../../src/timers/hub';
import { meta } from './player-helpers';

const text = readFileSync(new URL('../fixtures/timers-demo.log', import.meta.url), 'utf8');
const T0 = 1_790_452_800_000_000;
/** After sanctuary landed (`You start glowing.` at +12.1 s). */
const CUT_END = T0 + 13_000_000;

/** A replay hub on a replay clock at `us`. */
function replayHub(us: number) {
  const clock = new ReplayClock(us);
  const bus = new Bus();
  const hub = new TimersHub({ now: () => clock.now(), scheduler: clock }).attach(bus);
  const names = () => Object.values(hub.view().cells).flat().map((c) => c.name).sort();
  return { clock, bus, hub, names };
}

describe('timersStatesAt', () => {
  it('gives the state before each point', () => {
    const [early, late] = timersStatesAt(text, [T0 + 1_000_000, CUT_END]);
    const r = replayHub(CUT_END);
    r.hub.replaceState(early);
    expect(r.names()).toEqual([]);
    r.hub.replaceState(late);
    expect(r.names()).toEqual(expect.arrayContaining(['armour', 'bless', 'sanctuary', 'shield']));
  });
});

describe('the replay payload', () => {
  const chain = [{ meta: meta('Ithilwen/a', T0), text }];
  const doc = { ...defaultExportDoc('Ithilwen/a'), excludes: [[T0, CUT_END] as [number, number]] };
  const p = buildReplayPayload(chain, [], doc, defaultSettings());
  const out = p.runs[0]!.text;

  it('carries the timers across a cut without the removed lines', () => {
    expect(out).not.toContain('You start glowing.');
    const es = [...captureEntries(out)];
    const i = es.findIndex((e) => e.pkg === TIMERS_GMCP);
    expect(i).toBeGreaterThanOrEqual(0);
    // Right before the first entry after the cut, stamped with its time.
    expect(es[i + 1]!.ts).toBeGreaterThanOrEqual(CUT_END);
    expect(es[i]!.ts).toBe(es[i + 1]!.ts);
    expect(es.slice(0, i).every((e) => e.ts < CUT_END)).toBe(true);
  });

  it('a replay hub takes the record; a live one ignores it', () => {
    const rec = [...captureEntries(out)].find((e) => e.pkg === TIMERS_GMCP)!;
    const data = JSON.parse(rec.body.slice(rec.body.indexOf(' ') + 1)) as unknown;
    for (const replay of [true, false]) {
      const r = replayHub(rec.ts);
      r.bus.emit('conn.state', { state: 'connecting', prev: 'idle', ...(replay ? { replay: true as const } : {}) });
      r.bus.emit('gmcp', { pkg: TIMERS_GMCP, data });
      if (replay) expect(r.names()).toEqual(expect.arrayContaining(['armour', 'bless', 'sanctuary', 'shield']));
      else expect(r.names()).toEqual([]);
      r.hub.dispose();
    }
  });

  it('adds nothing without cuts', () => {
    const q = buildReplayPayload(chain, [], defaultExportDoc('Ithilwen/a'), defaultSettings());
    expect(q.runs[0]!.text).toBe(text);
  });
});
