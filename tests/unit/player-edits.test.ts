// Timeline edits and engine holds (ADR 0019 "Timeline edits", "Comments
// and holds"): comments with holds, cuts, spotlight windows with a state
// prefix, dwell and blanks, and the engine playing holds at 1×.
import { describe, expect, it } from 'vitest';
import { ReplayClock } from '../../src/player/clock';
import { PlayerEngine } from '../../src/player/engine';
import {
  CUT_MAX_MS,
  ENTRY_BLANK,
  ENTRY_COMMENT,
  ENTRY_GMCP,
  ENTRY_IN,
  ENTRY_VIEW,
  advancePlay,
  buildTimeline,
  entryText,
  logUsAt,
  playAtLogUs,
  wallBetween,
} from '../../src/player/timeline';
import { defaultExportDoc } from '../../src/share/edits';
import { editRunText } from '../../src/share/payload';
import { BASE_US, FakeWall, RecordingTarget, makeLog, meta, twoRunChain } from './player-helpers';

const us = (s: number, base = BASE_US) => base + Math.round(s * 1e6);
const plays = (tl: ReturnType<typeof buildTimeline>) => [...tl.play];

describe('buildTimeline edits', () => {
  it('is unchanged without edits', () => {
    const a = buildTimeline(twoRunChain());
    const b = buildTimeline(twoRunChain(), {});
    expect(b).toEqual(a);
    expect(a.hold.length).toBe(0);
    expect(a.holds).toEqual([]);
  });

  it('puts a comment before its anchor and holds the entries after it', () => {
    const plain = buildTimeline(twoRunChain());
    const tl = buildTimeline(twoRunChain(), {
      comments: [
        { beforeUs: us(3), text: 'Here.', holdMs: 5000 },
        { beforeUs: null, text: 'The end.', holdMs: 6000 },
      ],
    });
    expect(tl.n).toBe(plain.n + 2);
    const ci = [...tl.kind].indexOf(ENTRY_COMMENT);
    expect(entryText(tl, ci)).toBe('Here.');
    expect(entryText(tl, ci + 1)).toBe('A room.');
    expect(tl.ts[ci]).toBe(us(3));
    expect(tl.play[ci]).toBe(2000);
    expect(tl.play[ci + 1]).toBe(7000);
    expect(tl.holds).toEqual([
      { at: 2000, ms: 5000 },
      { at: plain.durationMs + 5000, ms: 6000 },
    ]);
    // The log clock stands still during the hold; markers land after it.
    expect(logUsAt(tl, 4000)).toBe(us(3));
    expect(playAtLogUs(tl, us(3))).toBe(7000);
    // The trailing comment is the last entry, in the last run; its hold ends the timeline.
    expect(tl.kind[tl.n - 1]).toBe(ENTRY_COMMENT);
    expect(tl.run[tl.n - 1]).toBe(1);
    expect(tl.runs[1]!.end).toBe(tl.n);
    expect(tl.durationMs).toBe(plain.durationMs + 11000);
    expect(logUsAt(tl, tl.durationMs)).toBe(tl.ts[tl.n - 2]);
  });

  it('plays a cut in at most 500 ms, kept state inside it in no time', () => {
    const text = makeLog(BASE_US, [
      { at: 1, in: 'One.' },
      { at: 2, in: 'Two.' },
      { at: 3, gmcp: 'Char.Vitals', json: { hp: 1 } },
      { at: 5, in: 'Excluded.' },
      { at: 6, in: 'Three.' },
      { at: 6.2, in: 'Four.' },
      { at: 8, gmcp: 'Char.Vitals', json: { hp: 2 } },
      { at: 9, in: 'Gone at the end.' },
    ]);
    const doc = { ...defaultExportDoc('X/1'), excludes: [[us(2.5), us(6)], [us(7), null]] as Array<[number, number | null]> };
    const chain = [{ meta: meta('X/1', BASE_US), text: editRunText(text, doc) }];
    const tl = buildTimeline(chain, { cuts: doc.excludes });
    // The state inside the middle cut stays; the excluded tail (its GMCP
    // at 8 s) is dropped, as nothing resumes after it.
    expect([...tl.kind]).toEqual([ENTRY_IN, ENTRY_IN, ENTRY_GMCP, ENTRY_IN, ENTRY_IN]);
    expect(plays(tl)).toEqual([0, 1000, 1000, 1000 + CUT_MAX_MS, 1700]);
    expect(tl.durationMs).toBe(1700);
    // A cut with nothing removed still shortens the stretch over it; a
    // short one keeps its real length.
    const t2 = buildTimeline(chain, { cuts: [[us(2.5), us(2.8)]] });
    expect(plays(t2).slice(0, 4)).toEqual([0, 1000, 1000 + CUT_MAX_MS, 4500]);
    const t3 = buildTimeline(chain, { cuts: [[us(6.1), us(6.15)]] });
    expect(plays(t3).slice(3, 5)).toEqual([5000, 5200]);
    // A cut over more than 10 s collapses like a gap.
    const long = makeLog(BASE_US, [
      { at: 1, in: 'A.' },
      { at: 30, in: 'B.' },
    ]);
    expect(plays(buildTimeline([{ meta: meta('X/1', BASE_US), text: long }], { cuts: [[us(2), us(29)]] }))).toEqual([0, 0]);
  });

  it('drops the excluded tail: no state after the last kept entry, end comments follow it', () => {
    // A clip from the middle of a two-run evening: a leading cut, a middle
    // cut and a trailing cut over the rest of run 1 and all of run 2.
    const r1 = makeLog(BASE_US, [
      { at: 0, view: { appearance: { size: 12 } } },
      { at: 1, in: 'Before.' },
      { at: 2, gmcp: 'Room.Info', json: { id: 1 } },
      { at: 3, in: 'Clip one.' },
      { at: 4, view: { appearance: { size: 13 } } },
      { at: 4.5, in: 'Cut in the middle.' },
      { at: 5, in: 'Clip two.' },
      { at: 6, gmcp: 'Char.Vitals', json: { hp: 1 } },
      { at: 7, view: { appearance: { size: 20 } } },
      { at: 8, in: 'After the clip.' },
    ]);
    const r2 = makeLog(us(3600), [
      { at: 0, view: { appearance: { size: 30 } } },
      { at: 1, gmcp: 'Room.Info', json: { id: 99 } },
      { at: 2, in: 'Late evening.' },
    ]);
    const cuts: Array<[number, number | null]> = [
      [us(0), us(3)],
      [us(4), us(5)],
      [us(5.5), null],
    ];
    const doc = { ...defaultExportDoc('X/1'), excludes: cuts };
    const chain = [
      { meta: meta('X/1', BASE_US), text: editRunText(r1, doc) },
      { meta: meta('X/2', us(3600)), text: editRunText(r2, doc) },
    ];
    const tl = buildTimeline(chain, {
      cuts,
      comments: [
        { beforeUs: us(3600 + 2), text: 'Anchored in the tail.', holdMs: 1000 },
        { beforeUs: null, text: 'The end.', holdMs: 1000 },
      ],
    });
    const texts = Array.from({ length: tl.n }, (_, i) => entryText(tl, i));
    // The leading and middle cuts keep their state; the tail's VIEW, GMCP
    // and text are gone, in both runs.
    expect([...tl.kind]).toEqual([ENTRY_VIEW, ENTRY_GMCP, ENTRY_IN, ENTRY_VIEW, ENTRY_IN, ENTRY_COMMENT, ENTRY_COMMENT]);
    expect(texts.slice(0, 5)).toEqual(['{"appearance":{"size":12}}', 'Room.Info {"id":1}', 'Clip one.', '{"appearance":{"size":13}}', 'Clip two.']);
    expect(texts.slice(5)).toEqual(['Anchored in the tail.', 'The end.']);
    // The comments stay in the last kept entry's run (no new connection).
    expect([...tl.run]).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(tl.ts[5]).toBe(us(5));
    expect(tl.runs[0]!.end).toBe(tl.n);
    expect(tl.runs[1]).toMatchObject({ first: tl.n, end: tl.n });
    expect(tl.durationMs).toBe(tl.play[4]! + 2000);
    // The same on raw texts: the tail goes, text and all.
    const raw = buildTimeline([
      { meta: meta('X/1', BASE_US), text: r1 },
      { meta: meta('X/2', us(3600)), text: r2 },
    ], { cuts });
    expect(raw.ts[raw.n - 1]).toBe(us(5));
    // A cut with an end but no kept entry after it is a tail too.
    const t2 = buildTimeline(chain, { cuts: [[us(5.5), us(3600 + 1.5)], [us(3600 + 1.8), us(3600 + 3)]] });
    expect([...t2.kind].filter((k) => k === ENTRY_VIEW).length).toBe(2);
    expect(t2.ts[t2.n - 1]).toBe(us(5));
    // Everything cut: nothing plays.
    expect(buildTimeline(chain, { cuts: [[0, null]] }).n).toBe(0);
  });

  it('builds spotlight windows: blank, state prefix, window, dwell, runs in any order', () => {
    const later = us(3600);
    const a = makeLog(later, [
      { at: 0, in: 'Old text.' },
      { at: 1, gmcp: 'Char.Vitals', json: { hp: 5 } },
      { at: 8, in: 'Hit.' },
      { at: 12, in: 'Kill.' },
      { at: 25, in: 'After.' },
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
      {
        windows: [
          { fromUs: us(5, later), toUs: us(20, later) },
          { fromUs: us(10), toUs: us(25) },
        ],
        blankLines: 100,
      },
    );
    expect([...tl.kind]).toEqual([ENTRY_BLANK, ENTRY_GMCP, ENTRY_IN, ENTRY_IN, ENTRY_BLANK, ENTRY_IN, ENTRY_IN]);
    expect(plays(tl)).toEqual([0, 0, 0, 4000, 12000, 12000, 13000]);
    expect(tl.durationMs).toBe(22000);
    expect(tl.blankLines).toBe(100);
    expect(entryText(tl, 4)).toBe('');
    expect(playAtLogUs(tl, us(12, later), 0)).toBe(4000);
    expect(playAtLogUs(tl, us(15), 1)).toBe(12000);
    expect(playAtLogUs(tl, us(1), 1)).toBe(12000);
    // The post-roll dwells with the log time moving.
    expect(logUsAt(tl, 8000)).toBe(us(16, later));
    expect(logUsAt(tl, 22000)).toBe(us(25));
  });

  it('maps wall time through holds at 1×', () => {
    const tl = buildTimeline(twoRunChain(), { comments: [{ beforeUs: us(3), text: 'x', holdMs: 5000 }] });
    // Before the hold at 4×, 500 ms of wall = 2000 ms of play; the hold then takes 5000 ms of wall.
    expect(advancePlay(tl, 0, 500, 4)).toBe(2000);
    expect(advancePlay(tl, 0, 3000, 4)).toBe(4500);
    expect(advancePlay(tl, 0, 5500, 4)).toBe(7000);
    expect(advancePlay(tl, 0, 5600, 4)).toBe(7400);
    expect(wallBetween(tl, 0, 7400, 4)).toBeCloseTo(5600, 6);
    expect(wallBetween(tl, 3000, 8000, 2)).toBe(4000 + 500);
    const plain = buildTimeline(twoRunChain());
    expect(advancePlay(plain, 10, 100, 2)).toBe(210);
    expect(wallBetween(plain, 10, 210, 2)).toBe(100);
  });
});

describe('PlayerEngine edits', () => {
  it('delivers a comment and holds for its time at 1×, whatever the speed', () => {
    const wall = new FakeWall();
    const target = new RecordingTarget();
    const tl = buildTimeline(twoRunChain(), { comments: [{ beforeUs: us(3), text: 'Wait for it.', holdMs: 5000 }] });
    const engine = new PlayerEngine({ timeline: tl, build: target.build, wall, speed: 4 });
    engine.play();
    wall.advance(501);
    expect(target.calls.find((c) => c.t === 'comment')).toEqual({ t: 'comment', text: 'Wait for it.', clockUs: us(3) });
    expect(target.text()).not.toContain('A room.');
    wall.advance(3000);
    expect(target.clocks[0]!.nowUs()).toBe(us(3));
    expect(engine.position).toBeCloseTo(5001, 0);
    wall.advance(1990);
    expect(target.text()).not.toContain('A room.');
    wall.advance(20);
    expect(target.text()).toContain('A room.');
    // Seeks treat the hold as playback time.
    engine.pause();
    engine.seek(3000);
    wall.flush();
    expect(engine.buildCount).toBe(2);
    expect(target.calls.filter((c) => c.t === 'comment')).toHaveLength(1);
    expect(target.text()).not.toContain('A room.');
  });

  it('sends blanks and rebases the clock for an older spotlight', () => {
    const wall = new FakeWall();
    const target = new RecordingTarget();
    const later = us(3600);
    const tl = buildTimeline(
      [
        { meta: meta('A/1', later), text: makeLog(later, [{ at: 8, in: 'Hit.' }]) },
        { meta: meta('B/1', BASE_US), text: makeLog(BASE_US, [{ at: 15, in: 'B line.' }]) },
      ],
      { windows: [{ fromUs: us(5, later), toUs: us(10, later) }, { fromUs: us(10), toUs: us(20) }], blankLines: 3 },
    );
    const engine = new PlayerEngine({ timeline: tl, build: target.build, wall });
    engine.play();
    wall.advance(1000);
    expect(target.calls.map((c) => c.t)).toEqual(['connect', 'blank', 'data']);
    expect(target.calls[1]).toEqual({ t: 'blank', lines: 3 });
    wall.advance(1500); // past the 2 s dwell: run 2 connects on its own (older) time
    expect(target.calls.map((c) => c.t)).toEqual(['connect', 'blank', 'data', 'close', 'connect', 'blank', 'data']);
    expect(target.calls.at(-1)).toMatchObject({ text: 'B line.\r\n', clockUs: us(15) });
    wall.advance(6000);
    expect(engine.atEnd).toBe(true);
  });

  it('ReplayClock.rebase moves back and keeps timer distances', () => {
    const c = new ReplayClock(1000);
    const fired: number[] = [];
    c.set(() => fired.push(c.nowUs()), 1); // due at 2000
    c.rebase(500);
    c.advanceTo(1400);
    expect(fired).toEqual([]);
    c.advanceTo(1500);
    expect(fired).toEqual([1500]);
  });
});
