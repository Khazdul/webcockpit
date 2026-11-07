// Stage 7 P3: the Spotlights reel's loading and arithmetic, and the card's
// countdown and width (stage 32c). The Credits book: credits-frame.test.tsx.
// Stage 46 (ADR 0131): what the wall reads from a loaded reel (each card's
// still and the reel's length) and the page's one `ReelSource` reading
// only windows not read yet; the still's rules: spotlights-still.test.ts.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { RunEvent } from '../../src/runs/events';
import { RunLibrary } from '../../src/runs/library';
import { defaultSettings } from '../../src/settings';
import { CARD_MIN_W, CARD_W, cardWidth, countdownLeft } from '../../src/player/spotlight-card';
import {
  RESTART_MS,
  ReelSource,
  fmtDate,
  loadReel,
  reelLengthMs,
  spotStill,
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

describe('Spotlights card', () => {
  it('drains the countdown symmetrically to the moment', () => {
    expect(countdownLeft(1000, 11000, 1000)).toBe(1);
    expect(countdownLeft(1000, 11000, 6000)).toBe(0.5);
    expect(countdownLeft(1000, 11000, 11000)).toBe(0);
    expect(countdownLeft(1000, 11000, 15000)).toBe(0);
    expect(countdownLeft(1000, 1000, 1000)).toBe(0); // the moment is the first line
  });

  it('is CARD_W wide, narrower on a narrow player, and hides when too narrow', () => {
    expect(cardWidth(1400)).toBe(CARD_W);
    expect(cardWidth(360)).toBe(360 - 12 - 28 - 8);
    expect(cardWidth(12 + 28 + 8 + CARD_MIN_W)).toBe(CARD_MIN_W);
    expect(cardWidth(12 + 28 + 8 + CARD_MIN_W - 1)).toBe(0);
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

describe('the wall\'s reads (stage 46)', () => {
  /** Rasta's run: a login stretch, then a PvP kill in red and a death; Gittan's: an achievement. */
  async function library() {
    const lib = await RunLibrary.open(new IDBFactory(), { locks: null, storage: null });
    const ESC = '\x1b';
    const login = makeLog(BASE_US, [
      { at: 1, gmcp: 'Char.Name', json: { name: 'Rasta' } },
      { at: 3, in: 'Welcome back.' },
    ]);
    const play = makeLog(BASE_US, [
      { at: 3000, in: `${ESC}[31mIbuki slashes you.${ESC}[0m` },
      { at: 3001, in: '* HP:Hurt>' },
      { at: 3002, in: 'Ibuki is dead! R.I.P.' },
      { at: 3100, in: `${ESC}[31mAn orc crushes you.${ESC}[0m` },
      { at: 3101, in: 'You are dead! Sorry...' },
    ]);
    const events: RunEvent[] = [
      { type: 'run_start', us: us(2), character: 'Rasta', level: 42, schema: 1 },
      { type: 'pkill', us: us(3002), logUs: us(3002), name: 'Ibuki', race: 'the Half-Elf', xpDelta: 5 },
      { type: 'char_death', us: us(3101), logUs: us(3101) },
    ];
    await lib.store.putWholeRun(
      meta('Rasta/1', BASE_US, { bytes: login.length + play.length }),
      events.map((event, seq) => ({ runId: 'Rasta/1', seq, event })),
      [
        { runId: 'Rasta/1', seq: 0, firstUs: us(1), lastUs: us(3), text: login },
        { runId: 'Rasta/1', seq: 1, firstUs: us(3000), lastUs: us(3101), text: play },
      ],
    );
    const g0 = us(0, BASE_US + 7200 * S);
    const gText = makeLog(g0, [
      { at: 10, in: 'A wight hits you.' },
      { at: 12, in: 'Achievement unlocked: Rest.' },
    ]);
    await lib.store.putWholeRun(
      meta('Gittan/1', g0, { bytes: gText.length }),
      [
        { type: 'run_start', us: g0, character: 'Gittan', level: 14, schema: 1 },
        { type: 'achievement', us: g0 + 12 * S, name: 'Rest' },
      ].map((event, seq) => ({ runId: 'Gittan/1', seq, event: event as RunEvent })),
      [{ runId: 'Gittan/1', seq: 0, firstUs: g0 + 10 * S, lastUs: g0 + 12 * S, text: gText }],
    );
    return lib;
  }

  it('gives each card its still (never the login stretch; ANSI kept) and the wall its length', async () => {
    const reel = await loadReel(await library(), defaultSettings().spotlights);
    if (!('spots' in reel)) throw new Error('no reel');
    expect(reel.spots.map((s) => `${s.character}:${s.kind}`)).toEqual(['Gittan:achievement', 'Rasta:death', 'Rasta:pkill']);
    const stills = reel.spots.map((_, i) => spotStill(reel, i));
    expect(stills[0]!.map((l) => l.text)).toEqual(['A wight hits you.', 'Achievement unlocked: Rest.']);
    expect(stills[1]!.map((l) => l.text)).toEqual(['An orc crushes you.', 'You are dead! Sorry...']);
    expect(stills[1]![0]!.runs).toEqual([{ start: 0, end: 19, fg: 1 }]);
    expect(stills[2]!.map((l) => l.text)).toEqual(['Ibuki slashes you.', 'Ibuki is dead! R.I.P.']);
    expect(stills.flat().some((l) => l.text.includes('Welcome back') || l.text.includes('HP:'))).toBe(false);
    const tl = buildTimeline(reel.chain, { windows: reel.spots.map((s) => ({ fromUs: s.fromUs, toUs: s.toUs })) });
    expect(reelLengthMs(reel)).toBeCloseTo(tl.durationMs, 6);
  });

  it('one ReelSource for the page: a rebuild for new filters reads only the windows not read yet', async () => {
    const lib = await library();
    const reads: string[] = [];
    const read = lib.chainLogRange.bind(lib);
    lib.chainLogRange = (id, from, to) => {
      reads.push(id);
      return read(id, from, to);
    };
    const src = new ReelSource(lib);
    const f = defaultSettings().spotlights;
    const all = await src.load(f, Date.now() * 1000);
    expect('spots' in all && all.spots.length).toBe(3);
    const first = reads.length;
    expect(first).toBeGreaterThanOrEqual(3);
    // Deaths off, then on again: every window is read already.
    const noDeaths = await src.load({ ...f, deaths: false }, Date.now() * 1000);
    expect('spots' in noDeaths && noDeaths.spots.map((s) => s.kind)).toEqual(['achievement', 'pkill']);
    await src.load(f, Date.now() * 1000);
    expect(reads.length).toBe(first);
    // Nothing passes: the wall's filtered state, still no read.
    expect(await src.load({ ...f, allCharacters: false, characters: [] }, Date.now() * 1000)).toEqual({ empty: 'filtered' });
    expect(reads.length).toBe(first);
  });
});
