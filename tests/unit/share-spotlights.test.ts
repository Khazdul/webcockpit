// Spotlight selection and the Credits chronicle (ADR 0019, Inv §7.6).
import { describe, expect, it } from 'vitest';
import type { RunEvent } from '../../src/runs/events';
import { defaultSettings } from '../../src/settings';
import {
  CHRONICLE_END,
  CHRONICLE_OPENING,
  type ChronicleRun,
  TEMPLATES,
  chronicleBook,
  datePhrase,
  eventSentence,
  stableHash,
} from '../../src/share/chronicle';
import {
  OPEN_FILTERS,
  STATE_PREFIX_US,
  chipPatch,
  chipsOn,
  emptyState,
  filtersOpen,
  hasVisibleEntry,
  periodStartUs,
  selectSpotlights,
  spotlightFilter,
  spotlightLabel,
} from '../../src/share/spotlights';
import { BASE_US, makeLog, meta } from './player-helpers';

const S = 1e6;
const all = () => defaultSettings().spotlights;

/** The book as one text: the opening, each chapter's header and deeds, the end; '' when nothing passes. */
function told(runs: readonly ChronicleRun[], f: Parameters<typeof chronicleBook>[1], nowUs?: number): string {
  const b = chronicleBook(runs, f, nowUs === undefined ? {} : { nowUs });
  if (!b) return '';
  return [b.opening, ...b.chapters.flatMap((c) => [c.header, ...c.deeds.map((d) => d.date + d.rest)]), b.end].join(' ');
}

function run(id: string, startUs: number, events: RunEvent[], extra = {}) {
  return { meta: meta(id, startUs, { bytes: 100, ...extra }), events };
}

const rasta = run('Rasta/1', BASE_US, [
  { type: 'run_start', us: BASE_US, character: 'Rasta', level: 41, schema: 1 },
  { type: 'kill', us: BASE_US + 5 * S, logUs: BASE_US + 5 * S, mobName: 'an orc', xpDelta: 10 },
  { type: 'level_up', us: BASE_US + 10 * S, level: 42 },
  { type: 'pkill', us: BASE_US + 20.4 * S, logUs: BASE_US + 20 * S, name: 'Ibuki', race: 'the Half-Elf', xpDelta: 5 },
  { type: 'char_death', us: BASE_US + 30.2 * S, logUs: BASE_US + 30 * S },
]);
const gittan = run('Gittan/1', BASE_US + 100 * S, [
  { type: 'run_start', us: BASE_US + 100 * S, character: 'Gittan', schema: 1 },
  { type: 'achievement', us: BASE_US + 110 * S, name: 'Slayer of Rats' },
  { type: 'achievement', us: BASE_US + 120 * S, name: 'Explorer.' },
]);

describe('selectSpotlights', () => {
  it('makes one spotlight per event with its window, label and level', () => {
    const s = selectSpotlights([rasta], all());
    expect(s.map((x) => [x.kind, x.label, x.level])).toEqual([
      ['death', 'Death (level 42)', 42],
      ['pkill', '*Ibuki the Half-Elf*', 42],
      ['level', 'Reached level 42', 42],
    ]);
    const p = s[1]!;
    expect(p).toMatchObject({
      runId: 'Rasta/1',
      character: 'Rasta',
      atUs: BASE_US + 20 * S,
      fromUs: BASE_US + 10 * S,
      toUs: BASE_US + 25 * S,
      prefixFromUs: BASE_US + 10 * S - STATE_PREFIX_US,
      runStartUs: BASE_US,
      id: 'Rasta/1#3',
    });
    expect(spotlightLabel({ type: 'achievement', us: 1, name: 'X' })).toBe('Achievement: X');
    expect(spotlightLabel({ type: 'char_death', us: 1, logUs: 1 })).toBe('Death');
  });

  it('rotates newest first without the same character twice while another remains', () => {
    const s = selectSpotlights([rasta, gittan], all());
    expect(s.map((x) => `${x.character}:${x.kind}`)).toEqual([
      'Gittan:achievement',
      'Rasta:death',
      'Gittan:achievement',
      'Rasta:pkill',
      'Rasta:level',
    ]);
  });

  it('filters by kind and skips runs without a log or not sealed', () => {
    const f = { ...all(), deaths: false, achievements: false };
    expect(selectSpotlights([rasta, gittan], f).map((x) => x.kind)).toEqual(['pkill', 'level']);
    expect(selectSpotlights([run('X/1', BASE_US, rasta.events, { bytes: 0 })], all())).toEqual([]);
    expect(selectSpotlights([run('X/1', BASE_US, rasta.events, { sealed: false })], all())).toEqual([]);
    expect(emptyState(all())).toBe('no_data');
    expect(emptyState(f)).toBe('filtered');
  });

  it('checks a window for a visible entry', () => {
    const text = makeLog(BASE_US, [
      { at: 1, in: 'Before.' },
      { at: 5, gmcp: 'Char.Vitals', json: {} },
      { at: 6, in: '   ' },
      { at: 7, out: 'change width all 500' },
      { at: 20, in: 'After.' },
    ]);
    expect(hasVisibleEntry(text, BASE_US + 2 * S, BASE_US + 15 * S)).toBe(false);
    expect(hasVisibleEntry(text, BASE_US + 2 * S, BASE_US + 20 * S)).toBe(true);
    expect(hasVisibleEntry(text, BASE_US, BASE_US + 2 * S)).toBe(true);
  });
});

describe('the chronicle', () => {
  it('tells an opening, a chapter per character (oldest first) and The End.', () => {
    const text = told([gittan, rasta], all());
    expect(text.startsWith(CHRONICLE_OPENING)).toBe(true);
    expect(text.endsWith(CHRONICLE_END)).toBe(true);
    expect(text.indexOf('Rasta')).toBeLessThan(text.indexOf('Gittan'));
    expect(text).toContain('*Ibuki the Half-Elf*');
    expect(text).toContain('level 42');
    expect(text).toContain('Slayer of Rats');
    expect(text).toContain('Explorer.');
    expect(text).not.toContain('Explorer..');
    expect(text).not.toContain('an orc');
    // Deterministic, whatever the order of the runs.
    expect(told([rasta, gittan], all())).toBe(text);
  });

  it('keeps the same sentence for the same event and filters kinds', () => {
    const e: RunEvent = { type: 'level_up', us: BASE_US, level: 7 };
    const a = eventSentence('Rasta', 'Rasta/1', e)!;
    expect(eventSentence('Rasta', 'Rasta/1', e)).toBe(a);
    expect(a.startsWith(datePhrase(BASE_US))).toBe(true);
    expect(TEMPLATES.level.map((t) => t.replace('{date}', datePhrase(BASE_US)).replace('{level}', '7'))).toContain(a);
    expect(stableHash('abc')).toBe(0x1a47e90b);
    const onlyPvp = { ...all(), achievements: false, deaths: false, levelUps: false, pvp: true };
    const text = told([rasta, gittan], onlyPvp);
    expect(text).toContain('Ibuki');
    expect(text).not.toContain('Gittan');
    expect(told([gittan], { ...onlyPvp, pvp: false })).toBe('');
  });

  it('writes dates in words', () => {
    expect(datePhrase(new Date(2026, 4, 1, 12).getTime() * 1000)).toBe('On the first of May, 2026');
    expect(datePhrase(new Date(2026, 11, 31, 12).getTime() * 1000)).toBe('On the thirty-first of December, 2026');
  });
});

describe('Spotlights filter (ADR 0110)', () => {
  const DAY = 86_400 * S;
  const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime() * 1000;
  // A fixed clock: 2026-10-31 12:00 local.
  const NOW = at(2026, 9, 31);

  it('counts each period back from now in calendar terms', () => {
    expect(periodStartUs('all', NOW)).toBe(-Infinity);
    expect(periodStartUs('week', NOW)).toBe(at(2026, 9, 24));
    expect(periodStartUs('month', NOW)).toBe(at(2026, 8, 30)); // 31 Oct → 30 Sep (clamped)
    expect(periodStartUs('3months', NOW)).toBe(at(2026, 6, 31));
    expect(periodStartUs('year', NOW)).toBe(at(2025, 9, 31));
    expect(periodStartUs('month', at(2026, 2, 31))).toBe(at(2026, 1, 28));
  });

  it('crosses kinds, characters and the period', () => {
    const f = spotlightFilter({ ...all(), deaths: false, allCharacters: false, characters: ['Rasta'], period: 'week' }, NOW);
    expect(f('pkill', 'Rasta', NOW - DAY)).toBe(true);
    expect(f('death', 'Rasta', NOW - DAY)).toBe(false); // kind off
    expect(f('pkill', 'Gittan', NOW - DAY)).toBe(false); // not checked
    expect(f('pkill', 'Newbie', NOW - DAY)).toBe(false); // a new character, All off
    expect(f('pkill', 'Rasta', NOW - 8 * DAY)).toBe(false); // too old
    expect(f('pkill', 'Rasta', at(2026, 9, 24))).toBe(true); // the window's first moment
    // All on: the remembered subset does not matter, new characters count.
    const g = spotlightFilter({ ...all(), allCharacters: true, characters: ['Rasta'] }, NOW);
    expect(g('achievement', 'Newbie', 0)).toBe(true);
  });

  it('selects by character and period, and tells filtered from no data', () => {
    const now = BASE_US + 200 * S;
    const onlyGittan = { ...all(), allCharacters: false, characters: ['Gittan'] };
    expect(selectSpotlights([rasta, gittan], onlyGittan, now).map((x) => x.character)).toEqual(['Gittan', 'Gittan']);
    expect(selectSpotlights([rasta, gittan], { ...all(), allCharacters: false, characters: [] }, now)).toEqual([]);
    // A week back from 30 days later: nothing.
    expect(selectSpotlights([rasta, gittan], { ...all(), period: 'week' }, now + 30 * DAY)).toEqual([]);
    expect(selectSpotlights([rasta, gittan], { ...all(), period: 'month' }, now + 20 * DAY)).toHaveLength(5);
    expect(filtersOpen(all())).toBe(true);
    expect(filtersOpen(OPEN_FILTERS)).toBe(true);
    expect(filtersOpen(onlyGittan)).toBe(false);
    expect(filtersOpen({ ...all(), period: 'year' })).toBe(false);
    expect(emptyState(onlyGittan, true)).toBe('filtered');
    expect(emptyState(onlyGittan, false)).toBe('no_data');
    expect(emptyState(all(), true)).toBe('no_data');
  });

  it('filters the chronicle the same way', () => {
    const now = BASE_US + 200 * S;
    const text = told([rasta, gittan], { ...all(), allCharacters: false, characters: ['Rasta'] }, now);
    expect(text).toContain('Ibuki');
    expect(text).not.toContain('Gittan');
    expect(told([rasta, gittan], { ...all(), period: 'week' }, now + 30 * DAY)).toBe('');
    expect(told([rasta, gittan], { ...all(), period: 'week' }, now + 3 * DAY)).toContain('Gittan');
  });
});

// Stage 46 (B "Galleriet"): the Spotlights page's character chips.
describe('character chips (chipPatch)', () => {
  const f = (p: Partial<ReturnType<typeof all>> = {}) => ({ ...all(), ...p });
  const names = ['Gittan', 'Rasta', 'Taube'];

  it('a name while All is on shows only that name', () => {
    expect(chipPatch(f(), 'Rasta', names)).toEqual({ allCharacters: false, characters: ['Rasta'] });
    expect(chipPatch(f({ characters: ['Gittan', 'Taube'] }), 'Rasta', names)).toEqual({ allCharacters: false, characters: ['Rasta'] });
  });

  it('with All off a name toggles, in list order; the last name off turns All back on', () => {
    expect(chipPatch(f({ allCharacters: false, characters: ['Taube'] }), 'Gittan', names)).toEqual({ characters: ['Gittan', 'Taube'] });
    expect(chipPatch(f({ allCharacters: false, characters: ['Gittan', 'Taube'] }), 'Taube', names)).toEqual({ characters: ['Gittan'] });
    // The last one: All on, and the remembered set stays for the next All off.
    expect(chipPatch(f({ allCharacters: false, characters: ['Gittan'] }), 'Gittan', names)).toEqual({ allCharacters: true });
  });

  it('All off brings back the remembered set (or every listed name); All on keeps it', () => {
    expect(chipPatch(f({ characters: ['Rasta', 'Gone'] }), null, names)).toEqual({ allCharacters: false, characters: ['Rasta'] });
    expect(chipPatch(f({ characters: ['Gone'] }), null, names)).toEqual({ allCharacters: false, characters: names });
    expect(chipPatch(f({ allCharacters: false, characters: ['Rasta'] }), null, names)).toEqual({ allCharacters: true });
    // No listed name: All stays on.
    expect(chipPatch(f(), null, [])).toEqual({});
  });

  it('lights All, or the remembered names that are listed', () => {
    expect(chipsOn(f({ characters: ['Rasta'] }), names)).toEqual([]);
    expect(chipsOn(f({ allCharacters: false, characters: ['Taube', 'Gone', 'Gittan'] }), names)).toEqual(['Gittan', 'Taube']);
  });
});
