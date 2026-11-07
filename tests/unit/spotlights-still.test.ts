// Stage 46 (B "Galleriet"): what the Spotlights wall reads from a reel —
// each card's still (the last visible lines up to the moment, ANSI kept)
// and the playing length (the reel's timeline counts the same).
import { describe, expect, it } from 'vitest';
import { type Reel, reelLengthMs, seekLine, spotLengthMs, spotStill } from '../../src/player/spotlight-reel';
import { buildTimeline } from '../../src/player/timeline';
import type { RunEvent } from '../../src/runs/events';
import type { Spotlight } from '../../src/share/spotlights';
import { BASE_US, makeLog, meta } from './player-helpers';

const S = 1e6;
const us = (s: number): number => BASE_US + Math.round(s * S);
const ESC = '\x1b';

function spot(id: string, atS: number, event: RunEvent, kind: Spotlight['kind'] = 'death'): Spotlight {
  const at = us(atS);
  return {
    id,
    runId: id.split('#')[0]!,
    character: 'Rasta',
    level: 42,
    kind,
    atUs: at,
    fromUs: at - 10 * S,
    toUs: at + 5 * S,
    prefixFromUs: at - 610 * S,
    label: 'Death (level 42)',
    runStartUs: BASE_US,
    event,
  };
}

const deathLog = makeLog(BASE_US, [
  { at: 1, in: 'Long before the window.' },
  { at: 2, gmcp: 'Char.Vitals', json: { hp: 50 } },
  { at: 95, in: `${ESC}[31mA stone-troll crushes you very hard.${ESC}[0m` },
  { at: 96, in: '* HP:Dying>' },
  { at: 96.5, out: 'flee' },
  { at: 97, in: `${ESC}[1;31mA stone-troll crushes you extremely hard.${ESC}[0m` },
  { at: 98, in: `${ESC}[32mThe stone-troll` },
  { at: 98.2, in: `roars.${ESC}[0m` },
  { at: 99, in: '   ' },
  { at: 100, in: 'You are dead! Sorry...' },
  { at: 100, in: 'The Temple of Rivendell' },
  { at: 101, in: 'Exits: south.' },
  { at: 103, gmcp: 'Char.Vitals', json: { hp: 1 } },
  { at: 200, in: 'After the window.' },
]);

function deathReel(): Reel {
  return {
    spots: [spot('Rasta/1#3', 100, { type: 'char_death', us: us(100), logUs: us(100) })],
    chain: [{ meta: meta('Rasta/1', BASE_US), text: deathLog }],
  };
}

describe('seekLine', () => {
  it('finds the first line at or after a time by bisection', () => {
    const text = deathLog;
    expect(text.slice(seekLine(text, us(90)))).toMatch(/^\d{16} \x1b\[31mA stone-troll crushes you very hard/);
    expect(text.slice(seekLine(text, us(100)))).toMatch(/^\d{16} You are dead!/);
    expect(seekLine(text, 0)).toBe(0);
    expect(seekLine(text, us(1000))).toBe(text.length);
  });
});

describe('spotStill', () => {
  it('takes the last visible lines up to a death, ending on its own line', () => {
    const still = spotStill(deathReel(), 0);
    expect(still.map((l) => l.text)).toEqual(['A stone-troll crushes you extremely hard.', 'The stone-troll', 'roars.', 'You are dead! Sorry...']);
  });

  it('keeps ANSI styles as runs (carried across lines), and commands as echo lines', () => {
    const still = spotStill(deathReel(), 0, 6);
    expect(still.map((l) => l.text)).toEqual([
      'A stone-troll crushes you very hard.',
      'flee',
      'A stone-troll crushes you extremely hard.',
      'The stone-troll',
      'roars.',
      'You are dead! Sorry...',
    ]);
    expect(still[0]!.runs).toEqual([{ start: 0, end: 36, fg: 1 }]);
    expect(still[1]).toEqual({ text: 'flee', runs: [], cmd: true });
    expect(still[2]!.runs).toEqual([{ start: 0, end: 41, fg: 1, bold: true }]);
    // Green set on one line, reset on the next.
    expect(still[3]!.runs).toEqual([{ start: 0, end: 15, fg: 2 }]);
    expect(still[4]!.runs).toEqual([{ start: 0, end: 6, fg: 2 }]);
    expect(still[5]!.runs).toEqual([]);
    // Prompts, blank lines and lines before the window never show.
    expect(still.some((l) => l.text.includes('HP:') || l.text.trim() === '' || l.text.includes('Long before'))).toBe(false);
  });

  it('takes the text that came with a level-up or an achievement (their moment is the GMCP)', () => {
    const text = makeLog(BASE_US, [
      { at: 95, in: 'An orc is dead! R.I.P.' },
      { at: 99.9, gmcp: 'Char.Vitals', json: { xp: 1 } },
      { at: 100, in: 'You rise a level!' },
      { at: 100.1, in: 'Achievement unlocked: Quick.' },
      { at: 101, in: 'Later.' },
    ]);
    const reel: Reel = {
      spots: [spot('Rasta/1#1', 99.9, { type: 'level_up', us: us(99.9), level: 42 }, 'level')],
      chain: [{ meta: meta('Rasta/1', BASE_US), text }],
    };
    expect(spotStill(reel, 0).map((l) => l.text)).toEqual(['An orc is dead! R.I.P.', 'You rise a level!', 'Achievement unlocked: Quick.']);
    expect(spotStill(reel, 0, 1).map((l) => l.text)).toEqual(['Achievement unlocked: Quick.']);
    expect(spotStill(reel, 5)).toEqual([]);
    expect(spotStill(reel, 0, 0)).toEqual([]);
  });
});

describe('spotLengthMs / reelLengthMs', () => {
  it('counts what the reel timeline plays', () => {
    const later = makeLog(us(3600), [
      { at: 0, gmcp: 'Char.Vitals', json: { hp: 9 } },
      { at: 3, in: 'Second one.' },
      { at: 4, out: 'kill orc' },
      { at: 6, in: 'An orc is dead! R.I.P.' },
    ]);
    const reel: Reel = {
      spots: [
        spot('Rasta/1#3', 100, { type: 'char_death', us: us(100), logUs: us(100) }),
        { ...spot('Rasta/2#1', 3606, { type: 'pkill', us: 0, logUs: 0, name: 'O', race: '', xpDelta: 0 }, 'pkill'), runId: 'Rasta/2' },
      ],
      chain: [
        { meta: meta('Rasta/1', BASE_US), text: deathLog },
        { meta: meta('Rasta/2', us(3600)), text: later },
      ],
    };
    const tl = buildTimeline(reel.chain, { windows: reel.spots.map((s) => ({ fromUs: s.fromUs, toUs: s.toUs })) });
    // 95 → 103 (8 s of entries after the first visible one), dwell to 105; then 3 → 6 s, dwell to 11.
    expect(spotLengthMs(reel, 0)).toBe(10000);
    expect(spotLengthMs(reel, 1)).toBe(8000);
    expect(reelLengthMs(reel)).toBe(18000);
    expect(reelLengthMs(reel)).toBeCloseTo(tl.durationMs, 6);
    expect(spotLengthMs(reel, 2)).toBe(0);
  });
});
