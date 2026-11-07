// Stage 47 (ADR 0132): the chronicle as a book (`chronicleBook`; the
// rolled `buildChronicle` it replaced is gone, wave 3), and Credits' book positions
// (`spreadOf`, `posAt`). The frame itself: credits-frame.test.tsx.
import { describe, expect, it } from 'vitest';
import type { RunMeta } from '../../src/capture/store';
import type { RunEvent } from '../../src/runs/events';
import {
  CHAPTER_HEADERS,
  CHRONICLE_END,
  CHRONICLE_OPENING,
  type ChronicleBook,
  type ChronicleRun,
  chronicleBook,
  datePhrase,
  eventSentence,
  stableHash,
} from '../../src/share/chronicle';
import { type BookLayout, posAt, posOfChapter, spreadCount, spreadOf } from '../../src/chrome/frames/credits';
import { OPEN_FILTERS } from '../../src/share/spotlights';
import type { SpotlightSettings } from '../../src/settings';

const DAY = 86_400_000_000;
const T0 = new Date(2026, 8, 20, 21, 0).getTime() * 1000;

function run(character: string, runId: string, events: RunEvent[]): ChronicleRun {
  const meta: RunMeta = { runId, character, startedUs: events[0]?.us ?? T0, endedUs: null, sealed: true, bytes: 0, lines: 0 };
  return { meta, events };
}

const gittan = run('Gittan', 'g1', [
  { type: 'run_start', us: T0, character: 'Gittan', schema: 1, level: 14 },
  { type: 'achievement', us: T0 + 10e6, name: 'Put a barrow-wight to rest.' },
  { type: 'level_up', us: T0 + DAY, level: 15 },
  { type: 'char_death', us: T0 + 2 * DAY, logUs: T0 + 2 * DAY },
]);
const rasta = run('Rasta', 'r1', [
  { type: 'run_start', us: T0 - DAY, character: 'Rasta', schema: 1, level: 41 },
  { type: 'level_up', us: T0 - DAY + 5e6, level: 42 },
  { type: 'pkill', us: T0 + 3 * DAY, logUs: T0 + 3 * DAY, name: 'Ibuki', race: 'the Half-Elf', xpDelta: 10 },
  { type: 'kill', us: T0 + 3 * DAY + 1, logUs: T0, mobName: 'A rat', xpDelta: 1 },
  { type: 'char_death', us: T0 + 4 * DAY, logUs: T0 + 4 * DAY, level: 42 },
]);
const all = (): SpotlightSettings => ({ ...OPEN_FILTERS, characters: [] });

/** A name whose header is template `i`. */
function nameFor(i: number): string {
  for (let k = 0; ; k++) {
    const n = `Hero${k}`;
    if (stableHash(n) % CHAPTER_HEADERS.length === i) return n;
  }
}

describe('chronicleBook', () => {
  it('tells a chapter per character (oldest first deed first), each deed its event\'s sentence in time order', () => {
    const book = chronicleBook([gittan, rasta], all(), { nowUs: T0 + 10 * DAY })!;
    expect(book.opening).toBe(CHRONICLE_OPENING);
    expect(book.end).toBe(CHRONICLE_END);
    expect(book.chapters.map((c) => c.name)).toEqual(['Rasta', 'Gittan']); // oldest first deed first
    const told = (b: ChronicleBook) => b.chapters.map((c) => c.deeds.map((d) => d.date + d.rest));
    const said = (r: ChronicleRun, i: number, level: number) => eventSentence(r.meta.character, r.meta.runId, r.events[i]!, level);
    expect(told(book)).toEqual([
      [said(rasta, 1, 42), said(rasta, 2, 42), said(rasta, 4, 42)],
      [said(gittan, 1, 14), said(gittan, 2, 15), said(gittan, 3, 15)],
    ]);
    // A filter: only the kinds it lets through.
    const pvp: SpotlightSettings = { ...all(), achievements: false, deaths: false, levelUps: false };
    const onlyPvp = chronicleBook([gittan, rasta], pvp, { nowUs: T0 + 10 * DAY })!;
    expect(onlyPvp.chapters.map((c) => c.name)).toEqual(['Rasta']);
    expect(onlyPvp.chapters[0]!.deeds.map((d) => d.kind)).toEqual(['pkill']);
    expect(told(onlyPvp)).toEqual([[said(rasta, 2, 42)]]);
  });

  it('splits each deed into its date phrase and the rest, keeping the kind', () => {
    const book = chronicleBook([gittan, rasta], all(), { nowUs: T0 + 10 * DAY })!;
    const deeds = book.chapters.flatMap((c) => c.deeds);
    expect(deeds).toHaveLength(6);
    for (const d of deeds) {
      expect(d.date).toBe(datePhrase(d.us));
      expect(d.rest.startsWith(' ')).toBe(true);
    }
    const rastas = book.chapters[0]!.deeds;
    expect(rastas.map((d) => d.kind)).toEqual(['level', 'pkill', 'death']);
    expect(rastas[1]!.rest).toContain('*Ibuki the Half-Elf*');
    expect(rastas[2]!.rest).toContain(' at level 42');
    // Gittan's death: the level from the last level-up.
    expect(book.chapters[1]!.deeds[2]!.rest).toContain(' at level 15');
  });

  it('splits every header around the name (pre / name / post)', () => {
    CHAPTER_HEADERS.forEach((tpl, i) => {
      const name = nameFor(i);
      const ch = chronicleBook([run(name, 'x', [{ type: 'level_up', us: T0, level: 2 }])], all(), { nowUs: T0 })!.chapters[0]!;
      expect(ch.header).toBe(tpl.replaceAll('{name}', name));
      const [pre, post] = tpl.split('{name}') as [string, string];
      expect(ch.pre).toBe(pre.trim());
      expect(ch.post).toBe(post.trim());
      const joined = [ch.pre, ch.name].filter(Boolean).join(' ') + (ch.post ? (ch.post.startsWith(',') ? ch.post : ' ' + ch.post) : '');
      expect(joined).toBe(ch.header);
    });
    // A name that is a word of its template splits at the name, not at the word.
    const tale = chronicleBook([run('Tale', 't', [{ type: 'level_up', us: T0, level: 2 }])], all(), { nowUs: T0 })!.chapters[0]!;
    expect([tale.pre, tale.name, tale.post].join(' ').replace(' ,', ',').trim().replace(/\s+/g, ' ')).toBe(tale.header);
  });

  it('is null when nothing passes, and deterministic', () => {
    expect(chronicleBook([], all())).toBeNull();
    const none: SpotlightSettings = { ...all(), achievements: false, deaths: false, levelUps: false, pvp: false };
    expect(chronicleBook([gittan, rasta], none)).toBeNull();
    expect(chronicleBook([gittan, rasta], { ...all(), period: 'week' }, { nowUs: T0 + 60 * DAY })).toBeNull();
    const a = chronicleBook([gittan, rasta], all(), { nowUs: T0 + 10 * DAY });
    expect(chronicleBook([rasta, gittan], all(), { nowUs: T0 + 10 * DAY })).toEqual(a);
    expect(chronicleBook([gittan, rasta], all(), { nowUs: T0 + 10 * DAY })).toEqual(a);
  });
});

describe('the book positions', () => {
  // Two pages per spread; chapters start on pages 0, 1, 2 and 5; 7 pages.
  const L: BookLayout = { per: 2, pages: 7, starts: [0, 1, 2, 5] };

  it('counts spreads and finds the spread of a position', () => {
    expect(spreadCount(L)).toBe(4);
    expect(spreadCount({ per: 1, pages: 7, starts: [0] })).toBe(7);
    expect(spreadOf(L, posOfChapter(2))).toBe(1);
    expect(spreadOf(L, { ch: 2, off: 2, lit: 2 })).toBe(2);
    expect(spreadOf(L, { ch: 2, off: 9, lit: 2 })).toBe(2); // kept inside the chapter (pages 2–4)
    expect(spreadOf(L, posOfChapter(3))).toBe(2);
    expect(spreadOf(L, { ch: 3, off: 1, lit: 3 })).toBe(3);
  });

  it('lights the last chapter that starts on the spread, else the chapter of its first page', () => {
    expect(posAt(L, 0)).toEqual({ ch: 0, off: 0, lit: 1 });
    expect(posAt(L, 1)).toEqual({ ch: 2, off: 0, lit: 2 });
    expect(posAt(L, 2)).toEqual({ ch: 2, off: 2, lit: 3 });
    expect(posAt(L, 3)).toEqual({ ch: 3, off: 1, lit: 3 });
    expect(posAt(L, 9)).toEqual(posAt(L, 3));
  });

  it('keeps the chapter and its page across a change of layout', () => {
    const pos = posAt(L, 2); // chapter 2, its third page
    const one: BookLayout = { per: 1, pages: 9, starts: [0, 1, 3, 7] };
    expect(spreadOf(one, pos)).toBe(5);
  });
});
