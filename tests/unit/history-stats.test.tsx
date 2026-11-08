// @vitest-environment happy-dom
// Stage 45 WP 45-B (ADR 0130): History → Stats in the new look. The pure
// helpers (long date, the head's line, the sparkline paths, the ruler's
// geometry) and the frame: loading, the sections, empty tables, no XP
// data, a read error, Tab focus, sorting by a head, the scroll keys and
// Back.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import {
  HS_PATH,
  HistoryStatsFrame,
  RULER_LABEL_MIN,
  SPARK_H,
  rulerView,
  sparkPaths,
  statsWhen,
} from '../../src/chrome/frames/history-stats';
import { fmtLongDate } from '../../src/chrome/frames/history-model';
import { type ChromeServices, ServicesCtx } from '../../src/chrome/kit/hooks';
import { FrameStack } from '../../src/chrome/kit/stack';
import { xpForLevel } from '../../src/gmcp/levels';
import { KIND_PATH } from '../../src/player/icons';
import type { RunEvent } from '../../src/runs/events';
import { xpRuler } from '../../src/runs/stats';
import type { Session } from '../../src/runs/stitch';

const MIN = 60e6;
const T0 = new Date(2026, 10, 6, 21, 12).getTime() * 1000;

function session(p: Partial<Session> = {}): Session {
  return {
    id: 'r1',
    character: 'Gibur',
    runs: [
      { runId: 'r1', character: 'Gibur', startedUs: T0, endedUs: null, sealed: true, bytes: 0, lines: 0 },
      { runId: 'r2', character: 'Gibur', startedUs: T0 + 90 * MIN, endedUs: null, sealed: true, bytes: 0, lines: 0 },
    ],
    startUs: T0,
    endUs: T0 + 221 * MIN,
    saved: true,
    rating: 4,
    hasLog: true,
    expiresDays: null,
    level: 41,
    ...p,
  };
}

const XP0 = xpForLevel(40) + 1000;

const EVENTS: RunEvent[] = [
  { type: 'run_start', us: T0, character: 'Gibur', level: 40, xp: XP0, tp: 100, schema: 1 },
  { type: 'group_changed', us: T0 + MIN, members: ['Gibur', 'Lindir', 'Arwen'] },
  { type: 'kill', us: T0 + 10 * MIN, logUs: 0, mobName: 'a stone troll', xpDelta: 2600 },
  { type: 'kill', us: T0 + 20 * MIN, logUs: 0, mobName: 'a stone troll', xpDelta: 2600 },
  { type: 'kill', us: T0 + 30 * MIN, logUs: 0, mobName: 'an orc scout', xpDelta: 425 },
  { type: 'kill', us: T0 + 31 * MIN, logUs: 0, mobName: 'a huge black spider', xpDelta: 639 },
  { type: 'pkill', us: T0 + 40 * MIN, logUs: 0, name: 'Ugluk', race: 'the Orc', xpDelta: 15000 },
  { type: 'tp_gained', us: T0 + 41 * MIN, tpDelta: 30 },
  { type: 'achievement', us: T0 + 88 * MIN + 8e6, name: 'Crossed the Misty Mountains' },
  { type: 'level_up', us: T0 + 71 * MIN + 10e6, level: 41 },
  { type: 'run_end', us: T0 + 221 * MIN },
];

afterEach(() => {
  render(null, document.body);
});

function services(events: () => Promise<RunEvent[]>): ChromeServices {
  return { runs: async () => ({ events: async () => events() }) } as unknown as ChromeServices;
}

let popped = 0;

/** Mounts Stats over a stand-in History frame (a pop returns to it). */
async function mount(s: Session, events: () => Promise<RunEvent[]>): Promise<void> {
  popped = 0;
  await act(async () => {
    render(
      <ServicesCtx.Provider value={services(events)}>
        <FrameStack root={<HistoryStatsFrame session={s} />} active onRootBack={() => popped++} />
      </ServicesCtx.Provider>,
      document.body,
    );
  });
  for (let i = 0; i < 5; i++) await act(async () => await Promise.resolve());
}

const key = async (k: string, shift = false): Promise<void> => {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey: shift, bubbles: true, cancelable: true }));
  });
};
const q = (sel: string) => document.querySelector<HTMLElement>(sel);
const qa = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const focused = () => q('.wc-hs-sec.is-focus')?.dataset.sec;
const killNames = () => qa('[data-tbl="kills"] .wc-lk-tbody .wc-lk-tr > .wc-lk-td:first-child').map((c) => c.textContent);

describe('History stats: helpers', () => {
  it('writes the long date and the head line', () => {
    expect(fmtLongDate(T0)).toBe('Friday, 6 November 2026');
    expect(statsWhen(session())).toBe('Session details · Friday, 6 November 2026 · 21:12 · 3h41m · 2 runs');
    expect(statsWhen(session({ runs: session().runs.slice(0, 1), endUs: T0 + 48 * MIN }))).toBe(
      'Session details · Friday, 6 November 2026 · 21:12 · 48m · 1 run',
    );
  });

  it('draws a sparkline as one line and one closed area, scaled to its maximum', () => {
    const s = sparkPaths([0, 50, 100, 25]);
    expect(s.max).toBe(100);
    expect(s.w).toBe(3);
    expect(s.line).toBe(`M0 ${SPARK_H - 1} L1 ${SPARK_H - 1 - (SPARK_H - 6) / 2} L2 5 L3 ${SPARK_H - 1 - (SPARK_H - 6) / 4}`);
    expect(s.area.startsWith(`M0 ${SPARK_H} L0 `)).toBe(true);
    expect(s.area.endsWith(` L3 ${SPARK_H} Z`)).toBe(true);
    // Empty and all-zero series: a flat line on the floor, max 0.
    expect(sparkPaths([]).max).toBe(0);
    expect(sparkPaths([0, 0, 0]).line).toBe(`M0 ${SPARK_H - 1} L1 ${SPARK_H - 1} L2 ${SPARK_H - 1}`);
    expect(sparkPaths([7]).w).toBe(1);
  });

  it('places the ruler band, its label and the level marks', () => {
    const r = xpRuler(xpForLevel(40), xpForLevel(41));
    const v = rulerView(r);
    expect(v.loss).toBe(false);
    expect(v.a).toBe(0);
    expect(v.b).toBeGreaterThan(0);
    expect(v.b).toBeLessThan(100);
    expect(v.marks.map((m) => m.level)).toEqual([40, 41, 42]);
    expect(v.marks[0]!.at).toBe(0);
    expect(v.marks[2]!.at).toBe(100);
    expect(v.marks[1]!.at).toBeCloseTo(v.b);
    expect(v.label).toMatch(/^[\d.]+[kM]? XP$/);
    const loss = rulerView(xpRuler(xpForLevel(41) + 5000, xpForLevel(41)));
    expect(loss.loss).toBe(true);
    expect(loss.label).toBe('−5.0k XP');
    expect(RULER_LABEL_MIN).toBeGreaterThan(0);
  });

  it('keeps its kind drawings equal to the player’s', () => {
    expect(HS_PATH.pkill).toBe(KIND_PATH.pkill);
    expect(HS_PATH.achievement).toBe(KIND_PATH.achievement);
    expect(HS_PATH.level).toBe(KIND_PATH.level);
  });
});

describe('History stats: the frame', () => {
  it('shows Loading… in the large box, then every section', async () => {
    let release!: (e: RunEvent[]) => void;
    const pending = new Promise<RunEvent[]>((r) => (release = r));
    await mount(session(), () => pending);
    const box = q('.wc-lk-box.wc-lk-box-large');
    expect(box?.getAttribute('aria-label')).toBe('Statistics');
    expect(box?.style.getPropertyValue('--lk-box-maxw')).toBe('1180px');
    expect(q('.wc-lk-back')).not.toBeNull();
    expect(q('.wc-hs-name')?.textContent).toBe('Gibur');
    expect(q('.wc-hs-lvl')?.textContent).toBe('Level 41');
    expect(q('.wc-hs-when')?.textContent).toContain('Session details · Friday, 6 November 2026 · 21:12 · 3h41m · 2 runs');
    expect(q('.wc-hs-when .wc-lk-stars')?.getAttribute('aria-label')).toBe('4 of 5');
    expect(q('.wc-hs-note')?.textContent).toBe('Loading…');

    await act(async () => release(EVENTS));
    for (let i = 0; i < 3; i++) await act(async () => await Promise.resolve());
    expect(q('.wc-hs-note')).toBeNull();
    expect(qa('.wc-hs-ally').map((a) => a.textContent)).toEqual(['♦Arwen', '♦Lindir']);
    // Milestones in time order, the time into the session (h:mm:ss from one hour).
    expect(qa('.wc-hs-mile').map((m) => [m.dataset.kind, m.querySelector('.wc-hs-mtext')?.textContent, m.querySelector('.wc-hs-at')?.textContent])).toEqual([
      ['level', 'Reached level 41', '1:11:10'],
      ['achievement', 'Crossed the Misty Mountains', '1:28:08'],
    ]);
    // Kills: XP tot ▾ by default; numbers in k.
    expect(killNames()).toEqual(['a stone troll', 'a huge black spider', 'an orc scout']);
    const troll = qa('[data-tbl="kills"] .wc-lk-tbody .wc-lk-tr')[0]!;
    expect([...troll.children].map((c) => c.textContent)).toEqual(['a stone troll', '2', '2.6k', '5.2k']);
    expect(q('[data-tbl="kills"] .wc-lk-th[data-key="xpTotal"]')?.dataset.dir).toBe('-1');
    expect(q('[data-tbl="kills"] .wc-hs-total')?.textContent).toBe('Total46.3k');
    // PvPs with the crossed swords.
    const pk = q('[data-tbl="pvps"] .wc-lk-tbody .wc-lk-tr')!;
    expect(pk.querySelector('.wc-hs-pk')?.textContent).toBe('*Ugluk the Orc*');
    expect(pk.querySelector('.wc-hs-pk svg')).not.toBeNull();
    expect(q('[data-tbl="pvps"] .wc-hs-total')?.textContent).toBe('Total115.0k');
    // Sparklines: y labels max / half / 0, x 00:00 → the duration.
    const xp = q('.wc-hs-spark[data-chart="xp"]')!;
    expect(xp.querySelectorAll('path')).toHaveLength(2);
    expect([...xp.querySelectorAll('.wc-hs-y span')].at(-1)?.textContent).toBe('0');
    expect([...xp.querySelectorAll('.wc-hs-x span')].map((s) => s.textContent)).toEqual(['00:00', '3:41:00']);
    expect(q('.wc-hs-spark[data-chart="tp"]')).not.toBeNull();
    // The ruler: 40 → 41 (still in level 40), a gain.
    expect(q('.wc-hs-ruler')?.classList.contains('is-loss')).toBe(false);
    expect(qa('.wc-hs-rmarks span').map((s) => s.textContent)).toEqual(['40', '41']);
    expect(q('.wc-hs-rmarks span:last-child')?.classList.contains('is-end')).toBe(true);
    expect(q('.wc-hs-rlabel span')?.textContent).toBe('21.3k XP');
    // The Kills table has the focus.
    expect(focused()).toBe('kills');
  });

  it('says so when a table is empty and when there is no XP data', async () => {
    await mount(session({ saved: false, rating: 0, level: undefined }), async () => [
      { type: 'run_start', us: T0, character: 'Gibur', schema: 1 },
    ]);
    expect(q('.wc-hs-lvl')).toBeNull();
    expect(q('.wc-hs-when .wc-lk-stars')).toBeNull();
    expect(q('.wc-hs-allies')?.textContent).toBe('Played alone.');
    expect(q('.wc-hs-ach')?.textContent).toBe('None this session.');
    expect(q('[data-tbl="kills"] .wc-lk-tbody')?.textContent).toBe('No kills.');
    expect(q('[data-tbl="pvps"] .wc-lk-tbody')?.textContent).toBe('No PvP this session.');
    expect(q('[data-tbl="kills"] .wc-hs-total')).toBeNull();
    expect(q('.wc-hs-noxp')?.textContent).toBe('No XP data.');
    expect(q('.wc-hs-ruler')).toBeNull();
  });

  it('shows a read error in the danger colour', async () => {
    await mount(session(), async () => {
      throw new Error('the run data is damaged');
    });
    const note = q('.wc-hs-note')!;
    expect(note.textContent).toBe('Could not read the session: the run data is damaged');
    expect(note.classList.contains('wc-lk-bad')).toBe(true);
    expect(note.getAttribute('role')).toBe('alert');
  });

  it('moves the focus with Tab / Shift+Tab, a press, and sorts by a head', async () => {
    await mount(session(), async () => EVENTS);
    expect(focused()).toBe('kills');
    await key('Tab');
    expect(focused()).toBe('pvps');
    await key('Tab');
    expect(focused()).toBe('allies');
    await key('Tab', true);
    expect(focused()).toBe('pvps');
    await key('Tab', true);
    await key('Tab', true);
    expect(focused()).toBe('achievements');
    await act(async () => {
      q('[data-sec="allies"]')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(focused()).toBe('allies');

    // A click on Kills sorts by name ▴ and focuses the table; again flips it.
    await act(async () => q('[data-tbl="kills"] .wc-lk-th[data-key="name"]')!.click());
    expect(focused()).toBe('kills');
    expect(q('[data-tbl="kills"] .wc-lk-th[data-key="name"]')?.dataset.dir).toBe('1');
    expect(killNames()).toEqual(['a huge black spider', 'a stone troll', 'an orc scout']);
    await act(async () => q('[data-tbl="kills"] .wc-lk-th[data-key="name"]')!.click());
    expect(killNames()).toEqual(['an orc scout', 'a stone troll', 'a huge black spider']);
    // A number column starts high to low.
    await act(async () => q('[data-tbl="kills"] .wc-lk-th[data-key="n"]')!.click());
    expect(q('[data-tbl="kills"] .wc-lk-th[data-key="n"]')?.dataset.dir).toBe('-1');
    expect(killNames()[0]).toBe('a stone troll');
  });

  it('scrolls the focused table, or the body when the table does not scroll; Esc goes back', async () => {
    await mount(session(), async () => EVENTS);
    const rows = q('[data-tbl="kills"] .wc-lk-tbody')!;
    const body = q('.wc-hs-body')!;
    Object.defineProperty(rows, 'scrollHeight', { configurable: true, value: 600 });
    Object.defineProperty(rows, 'clientHeight', { configurable: true, value: 190 });
    await key('ArrowDown');
    expect(rows.scrollTop).toBeGreaterThan(0);
    await key('Home');
    expect(rows.scrollTop).toBe(0);
    await key('PageDown');
    expect(rows.scrollTop).toBeGreaterThan(100);
    // PvPs does not overflow: the body scrolls.
    await key('Tab');
    expect(focused()).toBe('pvps');
    Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 2000 });
    Object.defineProperty(body, 'clientHeight', { configurable: true, value: 500 });
    await key('ArrowDown');
    expect(body.scrollTop).toBeGreaterThan(0);

    await key('Escape');
    expect(popped).toBe(1);
  });
});
