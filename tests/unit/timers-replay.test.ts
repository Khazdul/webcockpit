// Replays the owner's real Cockpit session logs (Inv §7.1 raw format) through
// the text pipeline (LineAssembler → ScriptEngine with the timers' system
// rules) and the trackers, on the log's own clock. Skips when the logs are
// absent ($WEBCOCKPIT_FIXTURES, default /home/ole/MUME/data/runs); nothing
// from them is copied into the repository. A log too short to say anything
// about timers is listed as a skipped test with its line count.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AFFECTS } from '../../src/timers/data/affects';
import { listFixtures } from '../e2e/fixtures';
import { replayLog } from './timers-helpers';

/** Fewer lines than this is too short a session to check the timers against. */
const MIN_LINES = 1000;

const lineCount = (path: string): number => readFileSync(path, 'utf8').split('\n').length - 1;
const logs = listFixtures()
  .filter((f) => f.size >= 100_000)
  .map((f) => ({ ...f, lines: lineCount(f.path) }));

describe.skipIf(logs.length === 0)('replaying real Cockpit logs', () => {
  for (const f of logs) {
    if (f.lines < MIN_LINES) {
      it.skip(`${f.rel}: skipped, ${f.lines} lines is under the ${MIN_LINES}-line minimum`, () => {});
      continue;
    }
    it(`${f.rel}: no errors, plausible timers`, () => {
      const { b, count } = replayLog(readFileSync(f.path, 'utf8'));
      expect(count).toBeGreaterThan(MIN_LINES);
      expect(b.errors).toEqual([]);
      const msgs = b.msgs;
      const byTag = new Map<string, number>();
      for (const m of msgs) {
        const tag = /^. (\w+)/.exec(m)?.[1] ?? '?';
        byTag.set(tag, (byTag.get(tag) ?? 0) + 1);
      }
      // Every learned sample of a timed affect is within reach of its table duration.
      const learned: Record<string, number[]> = {};
      for (const name of Object.keys(AFFECTS)) {
        const s = b.tr.affects.samples(name);
        if (s.length > 0) learned[name] = s;
        for (const secs of s) {
          expect(secs, name).toBeGreaterThan(AFFECTS[name]!.duration! * 0.3);
          expect(secs, name).toBeLessThan(AFFECTS[name]!.duration! * 2.5);
        }
      }
      const stored = b.tr.stored.samples('earthquake');
      for (const secs of stored) expect(secs).toBeGreaterThan(600);
      console.log(
        `[timers replay] ${f.rel}: ${count} lines, ${msgs.length} UI lines ${JSON.stringify(Object.fromEntries(byTag))}, ` +
          `learned ${JSON.stringify(learned)}, earthquake ${JSON.stringify(stored)}, ` +
          `at end ${b.cells().length} cells`,
      );
    }, 120_000);
  }
});

describe('the timers demo fixture', () => {
  it('exercises every group and ends in a plausible state', () => {
    const text = readFileSync(new URL('../fixtures/timers-demo.log', import.meta.url), 'utf8');
    const { b } = replayLog(text);
    expect(b.errors).toEqual([]);
    expect(b.msgs).toEqual([
      '◆ SPELL: armour up.',
      '◆ BUFF: second wind up.',
      '◆ SPELL: shield up.',
      '◆ BUFF: anger up.',
      '◆ SPELL: bless up.',
      '◆ SPELL: sanctuary up.',
      '◆ DEBUFF: tiredness up.',
      '◆ DEBUFF: hunger up.',
      '◆ STORE: fireball stored.',
      '◆ STORE: earthquake stored.',
      '◆ STORE: earthquake stored.',
      '◆ BLIND: 2.orc up.',
      '◆ CHARM: huge stone troll up.',
      '◆ CHARM: enslaved shadow up.',
      '◆ STORE: fireball recalled.',
      '◆ BUFF: anger down.',
      '◆ SPELL: shield refreshed.',
      '◆ DEBUFF: hunger down.',
      '◆ BUFF: second wind down.',
      '◆ DEBUFF: winded up.',
    ]);
    const by = (g: Parameters<typeof b.names>[0]) => b.names(g).sort();
    expect(by('spell')).toEqual(['armour', 'bless', 'detect magic', 'sanctuary', 'shield']);
    expect(b.cell('detect magic')!.tracked).toBe(false);
    expect(by('buff')).toEqual([]);
    expect(by('debuff')).toEqual(['tiredness', 'winded']);
    expect(by('stored')).toEqual(['earthquake', 'earthquake']);
    expect(by('blind')).toEqual(['2.orc']);
    expect(by('charm')).toEqual(['enslaved shadow', 'huge stone troll']);
  });
});
