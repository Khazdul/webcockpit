// Stage 7 P3: the Spotlights reel's loading and arithmetic, the info box
// text, and the Credits roll (ADR 0019, Inv §7.6).
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { creditsRoll, creditsWidth } from '../../src/chrome/frames/credits';
import type { RunEvent } from '../../src/runs/events';
import { RunLibrary } from '../../src/runs/library';
import { defaultSettings } from '../../src/settings';
import {
  BAR_HALF,
  BOX_W,
  RESTART_MS,
  boxFits,
  countdownHalf,
  countdownRow,
  fmtDate,
  labelLines,
  loadReel,
  navTarget,
  reelMarks,
  spotAt,
  spotMoments,
  spotStarts,
} from '../../src/player/spotlight-reel';
import { buildTimeline } from '../../src/player/timeline';
import { BASE_US, makeLog, meta } from './player-helpers';

const S = 1e6;
const us = (s: number, base = BASE_US): number => base + Math.round(s * S);

describe('reel positions', () => {
  const starts = [0, 12000, 30000];

  it('finds the spotlight at a playback time', () => {
    expect(spotAt(starts, 0)).toBe(0);
    expect(spotAt(starts, 11999)).toBe(0);
    expect(spotAt(starts, 12000)).toBe(1);
    expect(spotAt(starts, 99999)).toBe(2);
  });

  it('→ goes to the next start and does nothing on the last', () => {
    expect(navTarget(starts, 500, 1)).toBe(12000);
    expect(navTarget(starts, 13000, 1)).toBe(30000);
    expect(navTarget(starts, 31000, 1)).toBeNull();
    expect(navTarget([], 0, 1)).toBeNull();
  });

  it('← restarts the current one after 1.5 s, else goes back; the first restarts', () => {
    expect(navTarget(starts, 12000 + RESTART_MS + 1, -1)).toBe(12000);
    expect(navTarget(starts, 12000 + RESTART_MS, -1)).toBe(0);
    expect(navTarget(starts, 31000, -1)).toBe(12000);
    expect(navTarget(starts, 400, -1)).toBe(0);
    expect(navTarget(starts, 9000, -1)).toBe(0);
  });

  it('maps a reel timeline: starts, moments and markers per spotlight', () => {
    const later = us(3600);
    const a = makeLog(later, [
      { at: 1, gmcp: 'Char.Vitals', json: { hp: 5 } },
      { at: 8, in: 'Hit.' },
      { at: 12, in: 'Kill.' },
    ]);
    const b = makeLog(BASE_US, [
      { at: 15, in: 'B line.' },
      { at: 16, in: 'B two.' },
    ]);
    const tl = buildTimeline(
      [
        { meta: meta('A/1', later), text: a },
        { meta: meta('B/1', BASE_US), text: b },
      ],
      { windows: [{ fromUs: us(2, later), toUs: us(17, later) }, { fromUs: us(10), toUs: us(25) }] },
    );
    const spots = [
      {
        atUs: us(12, later),
        kind: 'pkill' as const,
        character: 'Ann',
        event: { type: 'pkill', us: 0, logUs: 0, name: 'Bo', race: 'the Orc', xpDelta: 0 },
      },
      { atUs: us(20), kind: 'death' as const, character: 'Cy', level: 30, event: { type: 'char_death', us: 0, logUs: 0 } },
    ] as unknown as Parameters<typeof spotMoments>[1];
    // A: Hit. at 0 (pre-roll trimmed), Kill. at 4 s, dwell to 17 s → 9 s; B starts there.
    expect(spotStarts(tl)).toEqual([0, 9000]);
    expect(spotMoments(tl, spots)).toEqual([4000, 14000]);
    expect(reelMarks(tl, spots)).toEqual([
      { letter: 'K', offset: 4000, tip: 'Ann: Killed *Bo the Orc*' },
      { letter: 'D', offset: 14000, tip: 'Cy: Died (level 30)' },
    ]);
  });
});

describe('info box', () => {
  it('drains the countdown symmetrically to the moment', () => {
    expect(countdownHalf(1000, 11000, 1000)).toBe(BAR_HALF);
    expect(countdownHalf(1000, 11000, 6000)).toBe(5);
    expect(countdownHalf(1000, 11000, 11000)).toBe(0);
    expect(countdownHalf(1000, 11000, 15000)).toBe(0);
    expect(countdownHalf(1000, 1000, 1000)).toBe(0); // the moment is the first line
    const full = countdownRow(BAR_HALF);
    expect(full).toHaveLength(BOX_W);
    expect(full).toBe('    ▐' + '█'.repeat(20) + '▌    ');
    expect(countdownRow(3)).toBe(' '.repeat(11) + '▐██████▌' + ' '.repeat(11));
    expect(countdownRow(0)).toBe(' '.repeat(BOX_W));
  });

  it('wraps the label to two lines, then …', () => {
    expect(labelLines('*Ibuki the Half-Elf*')).toEqual(['*Ibuki the Half-Elf*']);
    expect(labelLines('Achievement: Put a barrow-wight to rest.')).toEqual(['Achievement: Put a', 'barrow-wight to rest.']);
    const long = labelLines('Achievement: one two three four five six seven eight nine ten eleven twelve thirteen');
    expect(long).toHaveLength(2);
    expect([...long[1]!]).toHaveLength(28);
    expect(long[1]!.endsWith('…')).toBe(true);
    expect(labelLines('x'.repeat(40))).toEqual(['x'.repeat(27) + '…']);
  });

  it('hides when the player is too narrow', () => {
    expect(boxFits(36)).toBe(true);
    expect(boxFits(35)).toBe(false);
  });

  it('formats the header date', () => {
    expect(fmtDate(new Date(2026, 8, 26, 22, 30).getTime() * 1000)).toBe('2026-09-26');
  });
});

describe('loadReel', () => {
  async function library() {
    return RunLibrary.open(new IDBFactory(), { locks: null, storage: null });
  }

  it('reads each window, drops those without a visible entry, and reports empty states', async () => {
    const lib = await library();
    const text = makeLog(BASE_US, [
      { at: 1, gmcp: 'Char.Vitals', json: { hp: 5 } },
      { at: 100, in: 'You hit the orc.' },
      { at: 102, in: 'Ibuki is dead! R.I.P.' },
      { at: 500, in: 'Quiet.' },
    ]);
    const events: RunEvent[] = [
      { type: 'run_start', us: BASE_US, character: 'Rasta', level: 42, schema: 1 },
      { type: 'pkill', us: us(102), logUs: us(102), name: 'Ibuki', race: 'the Half-Elf', xpDelta: 5 },
      // Nothing visible in [290, 305] s: dropped.
      { type: 'achievement', us: us(300), name: 'Idle hands' },
    ];
    await lib.store.putWholeRun(
      meta('Rasta/1', BASE_US, { bytes: text.length }),
      events.map((event, seq) => ({ runId: 'Rasta/1', seq, event })),
      [{ runId: 'Rasta/1', seq: 0, firstUs: us(1), lastUs: us(500), text }],
    );
    const reel = await loadReel(lib, defaultSettings().spotlights);
    expect('spots' in reel).toBe(true);
    if (!('spots' in reel)) return;
    expect(reel.spots.map((s) => s.label)).toEqual(['*Ibuki the Half-Elf*']);
    expect(reel.chain[0]!.meta.runId).toBe('Rasta/1');
    expect(reel.chain[0]!.text).toContain('Ibuki is dead');

    const off = { ...defaultSettings().spotlights, pvp: false };
    expect(await loadReel(lib, off)).toEqual({ empty: 'filtered' });
    expect(await loadReel(await library(), defaultSettings().spotlights)).toEqual({ empty: 'no_data' });
  });

  it('reads the login stretch for its state when the prefix starts later', async () => {
    const lib = await library();
    const login = makeLog(BASE_US, [
      { at: 1, gmcp: 'Char.Name', json: { name: 'Rasta' } },
      { at: 2, gmcp: 'Char.Vitals', json: { hp: 120, maxhp: 120 } },
      { at: 3, in: 'Welcome back.' },
    ]);
    const late = makeLog(BASE_US, [
      { at: 3000, in: 'You hit the orc.' },
      { at: 3002, in: 'Ibuki is dead! R.I.P.' },
    ]);
    const events: RunEvent[] = [
      { type: 'run_start', us: us(2), character: 'Rasta', level: 42, schema: 1 },
      { type: 'pkill', us: us(3002), logUs: us(3002), name: 'Ibuki', race: 'the Half-Elf', xpDelta: 5 },
    ];
    await lib.store.putWholeRun(
      meta('Rasta/1', BASE_US, { bytes: login.length + late.length }),
      events.map((event, seq) => ({ runId: 'Rasta/1', seq, event })),
      [
        { runId: 'Rasta/1', seq: 0, firstUs: us(1), lastUs: us(3), text: login },
        { runId: 'Rasta/1', seq: 1, firstUs: us(3000), lastUs: us(3002), text: late },
      ],
    );
    const reel = await loadReel(lib, defaultSettings().spotlights);
    if (!('spots' in reel)) throw new Error('no reel');
    const text = reel.chain[0]!.text;
    expect(text).toContain('Char.Name');
    expect(text.indexOf('Char.Name')).toBeLessThan(text.indexOf('Ibuki is dead'));
  });
});

describe('Credits roll', () => {
  it('uses a column of min(60, max(40, cols − 8))', () => {
    expect(creditsWidth(200)).toBe(60);
    expect(creditsWidth(60)).toBe(52);
    expect(creditsWidth(44)).toBe(40);
  });

  it('rolls 1 row/s from the bottom row until The End. has left the top', () => {
    const lines = ['Opening.', '', 'A deed.', '', 'The End.', '', ''];
    const r = creditsRoll(lines, 20, 16);
    expect(r.fromY).toBe(19 * 16);
    expect(r.toY).toBe(-5 * 16);
    expect(r.ms).toBe(24_000);
  });
});
