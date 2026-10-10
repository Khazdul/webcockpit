// Excluded state folding (ADR 0019 addendum "Excluded state folding"): the
// records an excluded range keeps are cut down to the few that leave the
// player in the same state, and the replay plays as before.
import { describe, expect, it } from 'vitest';
import { formatInbound, formatPaneRecord, formatRecord } from '../../src/capture/format';
import { Bus } from '../../src/core/bus';
import { CharModel } from '../../src/gmcp/char';
import { GroupModel } from '../../src/gmcp/group';
import { GroupTable } from '../../src/map/group';
import { Tracker } from '../../src/map/tracking';
import { ReplayClock } from '../../src/player/clock';
import { buildTimeline, logUsAt, playAtLogUs } from '../../src/player/timeline';
import { type RunEvent, RunEventDeriver } from '../../src/runs/events';
import { defaultSettings } from '../../src/settings';
import { captureEntries } from '../../src/share/capture';
import { type ExcludeRange, defaultExportDoc } from '../../src/share/edits';
import { type FoldStats, GUARD_US, PACE_JSON, foldExcludedState } from '../../src/share/fold';
import { buildReplayPayload, editRunText, payloadEdits } from '../../src/share/payload';
import { logEvents } from './map-helpers';
import { gridMap } from './map-grid';
import { BASE_US, type LogItem, makeLog, meta } from './player-helpers';

const us = (s: number) => BASE_US + Math.round(s * 1e6);
const doc = (excludes: ExcludeRange[]) => ({ ...defaultExportDoc('R/a'), excludes });

/** Today's payload text (no fold) and the folded one, for one run. */
function both(text: string, excludes: ExcludeRange[], stats?: FoldStats): { plain: string; folded: string } {
  const plain = editRunText(text, doc(excludes));
  return { plain, folded: foldExcludedState([plain], excludes, stats)[0]! };
}

/** A seeded PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random Group.* and Char.Vitals traffic (ids 1–6, labels of every kind, partial vitals, fight fields). */
function traffic(r: () => number, n: number, at0: number, step: number): LogItem[] {
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const id = () => 1 + Math.floor(r() * 6);
  const type = () => pick(['ally', 'npc', 'npc', 'you', 'ally']);
  const label = () => pick<unknown>(['MERC', 'ORC', 0, '', '  ', null, 'Bob']);
  const name = () => pick(['Bob', 'an orc', 'a citizen mercenary (MERC)', 'Éowyn', '']);
  const word = () => pick(['healthy', 'fine', 'hurt', 'wounded', 'bad', 'awful', 'dying']);
  const vitals = (o: Record<string, unknown>) => {
    if (r() < 0.6) o.hp = Math.floor(r() * 100);
    if (r() < 0.5) o['hp-string'] = word();
    if (r() < 0.4) o.maxhp = 100;
    if (r() < 0.3) o.mana = Math.floor(r() * 50);
    if (r() < 0.3) o['mp-string'] = word();
    return o;
  };
  const member = () => vitals({ id: id(), type: type(), name: name(), ...(r() < 0.8 ? { label: label() } : {}), ...(r() < 0.5 ? { mapid: 1000 + Math.floor(r() * 30) } : {}) });
  const out: LogItem[] = [];
  let xp = 1_000_000;
  for (let i = 0; i < n; i++) {
    const at = at0 + i * step;
    const k = r();
    if (k < 0.12) out.push({ at, gmcp: 'Group.Add', json: member() });
    else if (k < 0.45) {
      const u: Record<string, unknown> = { id: id() };
      if (r() < 0.15) u.type = type();
      if (r() < 0.2) u.name = name();
      if (r() < 0.25) u.label = label();
      if (r() < 0.2) u.mapid = 1000 + Math.floor(r() * 30);
      out.push({ at, gmcp: 'Group.Update', json: vitals(u) });
    } else if (k < 0.55) out.push({ at, gmcp: 'Group.Remove', json: r() < 0.8 ? id() : { id: id() } });
    else if (k < 0.58) out.push({ at, gmcp: 'Group.Set', json: Array.from({ length: Math.floor(r() * 4) }, member) });
    else {
      const v: Record<string, unknown> = {};
      if (r() < 0.6) v.hp = Math.floor(r() * 300);
      if (r() < 0.5) v.xp = xp += Math.floor(r() * 2000) - 600;
      if (r() < 0.3) v.tp = 5000 + Math.floor(r() * 50);
      if (r() < 0.15) v.buffer = pick(['Bob', 'an orc', 'Éowyn', '', null]);
      if (r() < 0.15) v.opponent = pick(['an orc (ORC)', 'MERC', 'Bob', '']);
      if (r() < 0.3) v['buffer-hits'] = word();
      if (r() < 0.3) v['opponent-hits'] = word();
      if (r() < 0.1) v.mood = pick(['brave', 'wimpy']);
      out.push({ at, gmcp: 'Char.Vitals', json: v });
    }
  }
  return out;
}

/** The models a player App feeds from GMCP, after `text`. */
function modelsAfter(text: string): string {
  const char = new CharModel();
  const group = new GroupModel();
  const table = new GroupTable();
  for (const e of captureEntries(text)) {
    if (e.kind !== 'gmcp') continue;
    const sp = e.body.indexOf(' ');
    const pkg = e.body.slice(0, sp < 0 ? undefined : sp);
    const data = sp < 0 ? undefined : (JSON.parse(e.body.slice(sp + 1)) as unknown);
    const key = pkg.toLowerCase();
    if (key.startsWith('char.')) {
      char.apply(pkg, data);
      if (key === 'char.vitals') group.apply(pkg, data);
    } else if (key.startsWith('group.')) {
      group.apply(pkg, data);
      table.apply(pkg, data);
    }
  }
  const g = group as unknown as { buffer: unknown; opponent: unknown };
  return JSON.stringify({
    vitals: [...char.vitals].sort(),
    anchors: [char.anchorXp, char.anchorTp],
    view: char.view(),
    list: group.list(),
    unlabeled: group.unlabeled(),
    fight: [g.buffer, g.opponent],
    table: table.entries(),
    colors: table.colorState(),
  });
}

/** The ◆ KILL xp after `text`: a death line after the range, then more xp. */
function killXp(text: string, deathAt: number): RunEvent[] {
  const bus = new Bus();
  const clock = new ReplayClock(BASE_US);
  const d = new RunEventDeriver({ now: () => clock.now(), scheduler: clock }).attach(bus);
  bus.emit('conn.state', { state: 'playing', prev: 'login' } as never);
  for (const e of captureEntries(text)) {
    clock.advanceTo(e.ts);
    if (e.kind === 'in' && e.ts === deathAt) d.onLine('An orc is dead! R.I.P.', e.ts);
    if (e.kind !== 'gmcp') continue;
    const sp = e.body.indexOf(' ');
    const pkg = e.body.slice(0, sp < 0 ? undefined : sp);
    const data = sp < 0 ? undefined : (JSON.parse(e.body.slice(sp + 1)) as unknown);
    bus.emit('gmcp.raw', { pkg, json: '', ts: e.ts });
    bus.emit('gmcp', { pkg, key: pkg.toLowerCase(), data });
  }
  clock.advanceTo(clock.nowUs() + 5e6);
  return d.events.filter((e) => e.type === 'kill');
}

/** When a 1 s periodic timer fires on a replay clock moved to each entry of `texts` (the timers hub's tick). */
function fires(texts: readonly string[]): number[] {
  const out: number[] = [];
  let clock: ReplayClock | null = null;
  const tick = (): void => {
    out.push(clock!.nowUs());
    clock!.set(tick, 1000);
  };
  for (const t of texts) {
    for (const e of captureEntries(t)) {
      if (!clock) {
        clock = new ReplayClock(e.ts);
        clock.set(tick, 1000);
      }
      clock.advanceTo(e.ts);
    }
  }
  return out;
}

describe('foldExcludedState', () => {
  it('leaves Group.*, Char.Vitals and the kill xp where the records left them (seeded fuzz)', () => {
    const stats: FoldStats = { segments: 0, fallbacks: 0, paces: 0 };
    let shrunk = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed);
      const items: LogItem[] = [
        { at: 0, gmcp: 'Char.Name', json: { name: 'Rasta' } },
        ...traffic(r, 20, 0.5, 0.1),
        { at: 3, in: 'Before the cut.' },
        ...traffic(r, 60, 5, 0.5),
        { at: 40, in: 'An orc is dead! R.I.P.' },
        { at: 40.2, gmcp: 'Char.Vitals', json: { xp: 2_000_000 } },
        ...traffic(r, 10, 41, 0.1),
      ];
      const text = makeLog(BASE_US, items);
      const { plain, folded } = both(text, [[us(4), us(39)]], stats);
      expect(modelsAfter(folded), `seed ${seed}`).toBe(modelsAfter(plain));
      // The state at the cut's end too, not only at the end.
      const cut = (t: string) => [...captureEntries(t)].filter((e) => e.ts < us(40)).map((e) => e.line).join('');
      expect(modelsAfter(cut(folded)), `seed ${seed}`).toBe(modelsAfter(cut(plain)));
      expect(killXp(folded, us(40)), `seed ${seed}`).toEqual(killXp(plain, us(40)));
      if (folded.length < plain.length) shrunk++;
    }
    // The check rarely has to keep a segment as it is.
    // The check rarely keeps a segment as it is (when GroupModel and the
    // map's table disagree on a name, one Group.Update cannot set both).
    expect(stats.segments).toBe(300);
    expect(stats.fallbacks).toBeLessThan(15);
    expect(shrunk).toBeGreaterThan(280);
  });

  it('keeps a session anchor and the lowest xp the run events saw', () => {
    const text = makeLog(BASE_US, [
      { at: 0, gmcp: 'Char.Name', json: { name: 'Rasta' } },
      { at: 1, in: 'Hello.' },
      { at: 5, gmcp: 'Char.Vitals', json: { xp: 1000, tp: 50, hp: 10 } },
      { at: 6, gmcp: 'Char.Vitals', json: { xp: 900 } },
      { at: 7, gmcp: 'Char.Vitals', json: { xp: 1200, tp: 55, hp: null } },
      { at: 20, in: 'Back.' },
    ]);
    const { plain, folded } = both(text, [[us(2), us(19)]]);
    const vitals = [...captureEntries(folded)].filter((e) => e.pkg === 'Char.Vitals').map((e) => e.body);
    expect(vitals).toEqual(['Char.Vitals {"xp":1000,"tp":50}', 'Char.Vitals {"xp":900}', 'Char.Vitals {"xp":1200,"tp":55,"hp":null}']);
    expect(modelsAfter(folded)).toBe(modelsAfter(plain));
  });

  it('keeps barriers verbatim and in place, drops what nothing reads', () => {
    const items: LogItem[] = [
      { at: 0, gmcp: 'Char.Name', json: { name: 'Rasta' } },
      { at: 1, in: 'Hello.' },
      { at: 5, gmcp: 'Char.Vitals', json: { hp: 1 } },
      { at: 6, gmcp: 'Room.Chars.Add', json: { id: 1, name: 'x' } },
      { at: 7, view: { appearance: { size: 13 } } },
      { at: 8, gmcp: 'Char.Vitals', json: { hp: 2 } },
      { at: 9, gmcp: 'Event.Sun', json: { what: 'rise' } },
      { at: 10, gmcp: 'Char.Vitals', json: { hp: 3 } },
      { at: 11, gmcp: 'Some.Unknown', json: { a: 1 } },
      { at: 12, gmcp: 'Char.Name', json: { name: 'Other' } },
      { at: 13, gmcp: 'Event.Achieved', json: { what: 'x' } },
      { at: 14, size: { cols: 80, rows: 24 } },
      { at: 15, gmcp: 'Char.Vitals', json: { hp: 4 } },
      { at: 15.5, gmcp: 'Char.Vitals', json: { hp: 5 } },
      { at: 16, gmcp: 'Core.Goodbye', json: 'bye' },
      { at: 30, in: 'Back.' },
    ];
    let text = makeLog(BASE_US, items);
    text = text.replace('{"hp":4}', '{"hp":4');
    const { folded } = both(text, [[us(2), us(29)]]);
    const bodies = [...captureEntries(folded)].map((e) => `${(e.ts - BASE_US) / 1e6} ${e.kind === 'size' ? 'SIZE' : e.kind === 'view' ? 'VIEW' : e.body}`);
    expect(bodies).toEqual([
      '0 Char.Name {"name":"Rasta"}',
      '1 Hello.',
      // Room.Chars.Add goes; the vitals fold to the segment's last entry's time.
      '6 Char.Vitals {"hp":1}',
      '7 VIEW',
      '8 Char.Vitals {"hp":2}',
      '9 Event.Sun {"what":"rise"}',
      '10 Char.Vitals {"hp":3}',
      '11 Some.Unknown {"a":1}',
      '12 Char.Name {"name":"Other"}',
      '13 Event.Achieved {"what":"x"}',
      // The SIZE goes: a pacing record keeps its time (the segment's last).
      '14 SIZE',
      // Bad JSON prints a line: kept as it is.
      '15 Char.Vitals {"hp":4',
      '15.5 Char.Vitals {"hp":5}',
      '16 Core.Goodbye "bye"',
      '30 Back.',
    ]);
    // The pacing record is a SIZE the player ignores.
    expect(folded).toContain(formatRecord(us(14), 'SIZE', PACE_JSON));
  });

  it('keeps everything within GUARD_US of a kept entry as it is', () => {
    expect(GUARD_US).toBe(1_000_000);
    const text = makeLog(BASE_US, [
      { at: 0, gmcp: 'Char.Name', json: { name: 'Rasta' } },
      { at: 1, in: 'Exits: north.' },
      { at: 1.5, gmcp: 'Room.Info', json: { id: 1001, name: 'A' } },
      { at: 1.9, gmcp: 'Char.Vitals', json: { xp: 5 } },
      { at: 5, gmcp: 'Room.Info', json: { id: 1002, name: 'B' } },
      { at: 6, gmcp: 'Room.Info', json: { id: 1003, name: 'C' } },
      { at: 9.2, gmcp: 'Room.Info', json: { id: 1004, name: 'D' } },
      { at: 10, in: 'Exits: south.' },
    ]);
    const { folded } = both(text, [[us(1.2), us(10)]]);
    const rooms = [...captureEntries(folded)].filter((e) => e.pkg === 'Room.Info').map((e) => [(e.ts - BASE_US) / 1e6, JSON.parse(e.body.slice(10)).id]);
    // 1.5 and 9.2 are guards; of 5 and 6 only the last stays, at its own time.
    expect(rooms).toEqual([
      [1.5, 1001],
      [6, 1003],
      [9.2, 1004],
    ]);
  });

  it('keeps Room.Info and Event.Moved as they are while kept moves may be queued', () => {
    const map = gridMap(10, 10);
    const room = (i: number) => ({ id: 1000 + i, name: `Room ${i}` });
    const text = makeLog(BASE_US, [
      { at: 0, gmcp: 'Char.Name', json: { name: 'Rasta' } },
      { at: 0.5, gmcp: 'Room.Info', json: room(0) },
      { at: 1, out: 'north' },
      { at: 1.01, out: 'north' },
      { at: 1.02, out: 'east' },
      { at: 1.5, in: 'Ok.' },
      { at: 5, gmcp: 'Event.Moved', json: { dir: 'north' } },
      { at: 5.1, gmcp: 'Room.Info', json: room(10) },
      { at: 6, gmcp: 'Event.Moved', json: { dir: 'north' } },
      { at: 6.1, gmcp: 'Room.Info', json: room(20) },
      { at: 7, gmcp: 'Event.Moved', json: { dir: 'east' } },
      { at: 7.1, gmcp: 'Room.Info', json: room(21) },
      { at: 8, gmcp: 'Event.Moved', json: { dir: 'east' } },
      { at: 8.1, gmcp: 'Room.Info', json: room(22) },
      { at: 9, gmcp: 'Event.Moved', json: { dir: 'east' } },
      { at: 9.1, gmcp: 'Room.Info', json: room(23) },
      { at: 20, in: 'Back.' },
    ]);
    const { plain, folded } = both(text, [[us(2), us(19)]]);
    const ids = [...captureEntries(folded)].filter((e) => e.pkg === 'Room.Info').map((e) => JSON.parse(e.body.slice(10)).id);
    // The first is the payload's first room (the map opens there); 10, 20
    // and 21 dequeue the kept moves; then 22 folds into 23.
    expect(ids).toEqual([1000, 1010, 1020, 1021, 1023]);
    const track = (t: string) => {
      const tr = new Tracker();
      tr.setMap(map, 'g');
      tr.apply(logEvents(t));
      return JSON.stringify([tr.status, tr.current]);
    };
    expect(track(folded)).toBe(track(plain));
  });

  it('paces the replay clock: timers fire at the same log times', () => {
    // Records every 20 s for 5 minutes inside the range, a 2 minute gap, more records.
    const items: LogItem[] = [
      { at: 0, gmcp: 'Char.Name', json: { name: 'Rasta' } },
      { at: 1, in: 'Hello.' },
    ];
    for (let t = 3; t < 300; t += 20) items.push({ at: t, gmcp: 'Char.Vitals', json: { hp: t } });
    for (let t = 420; t < 500; t += 7) items.push({ at: t, gmcp: 'Room.Chars.Add', json: { t } });
    items.push({ at: 600, in: 'Back.' });
    const text = makeLog(BASE_US, items);
    const { plain, folded } = both(text, [[us(2), us(599)]]);
    expect(folded.length).toBeLessThan(plain.length);
    expect(fires([folded])).toEqual(fires([plain]));
  });

  it('keeps the timeline: kept entries, the stretch over a cut, markers, duration', () => {
    const text = makeLog(BASE_US, [
      { at: 0, gmcp: 'Char.Name', json: { name: 'Rasta' } },
      { at: 1, in: 'One.' },
      { at: 2.5, gmcp: 'Char.Vitals', json: { hp: 1 } },
      { at: 3, gmcp: 'Room.Chars.Add', json: { a: 1 } },
      { at: 3.4, gmcp: 'Char.Vitals', json: { hp: 2 } },
      { at: 3.6, gmcp: 'Room.Chars.Remove', json: 1 },
      { at: 4, in: 'Two.' },
      { at: 30, gmcp: 'Char.Vitals', json: { hp: 3 } },
      { at: 50, gmcp: 'Char.Vitals', json: { hp: 4 } },
      { at: 52, in: 'Three.' },
    ]);
    const cuts: ExcludeRange[] = [
      [us(1.2), us(3.8)],
      [us(5), us(51)],
    ];
    const { plain, folded } = both(text, cuts);
    const tl = (t: string) => buildTimeline([{ meta: meta('R/a', BASE_US), text: t }], { cuts });
    const a = tl(plain);
    const b = tl(folded);
    expect(b.n).toBeLessThan(a.n);
    const kept = (x: typeof a) => [...x.ts].map((t, i) => [t, x.play[i]]).filter(([t]) => !cuts.some(([f, to]) => t! >= f && t! < (to ?? Infinity)));
    expect(kept(b)).toEqual(kept(a));
    expect(b.durationMs).toBe(a.durationMs);
    for (let p = 0; p <= a.durationMs; p += 25) expect(logUsAt(b, p)).toBe(logUsAt(a, p));
    for (const m of [us(1), us(3.9), us(3.95), us(51.5), us(52)]) expect(playAtLogUs(b, m)).toBe(playAtLogUs(a, m));
  });
});

describe('buildReplayPayload with folding', () => {
  it('leaves out runs entirely inside excluded ranges, carrying the VIEW parts and channels they set', () => {
    const r1 = makeLog(BASE_US, [
      { at: 0, gmcp: 'Comm.Channel.List', json: [{ name: 'tells' }] },
      { at: 0.1, view: { appearance: { size: 14 }, comm: { showHeader: true } } },
      { at: 0.2, gmcp: 'Char.Name', json: { name: 'Rasta' } },
      { at: 1, in: 'Clip one.' },
    ]);
    const r2 = makeLog(us(100), [
      { at: 0, gmcp: 'Comm.Channel.List', json: [{ name: 'tells' }, { name: 'tales' }] },
      { at: 0.1, view: { appearance: { size: 16 }, comm: { showHeader: true } } },
      { at: 0.2, gmcp: 'Char.Name', json: { name: 'Rasta' } },
      { at: 1, in: 'Excluded.' },
      { at: 2, gmcp: 'Event.Achieved', json: { what: 'x' } },
    ]);
    const r3 = makeLog(us(200), [
      { at: 0, gmcp: 'Char.Name', json: { name: 'Rasta' } },
      { at: 1, in: 'Excluded too.' },
    ]);
    const r4 = makeLog(us(300), [
      { at: 0, gmcp: 'Char.Name', json: { name: 'Rasta' } },
      { at: 1, in: 'Clip two.' },
    ]);
    const chain = [
      { meta: meta('Rasta/a', BASE_US, { summary: { startUs: BASE_US, lastEventUs: 0, level: 40, kills: 3, pkills: 0, deaths: 0 } }), text: r1 },
      { meta: meta('Rasta/b', us(100)), text: r2 },
      { meta: meta('Rasta/c', us(200)), text: r3 },
      { meta: meta('Rasta/d', us(300), { summary: { startUs: us(300), lastEventUs: 0, level: 41, kills: 0, pkills: 0, deaths: 0 } }), text: r4 },
    ];
    const d = doc([[us(2), us(300.5)]]);
    const p = buildReplayPayload(chain, [], d, defaultSettings());
    // Run b has an achievement (a UI line): it stays; run c goes.
    expect(p.runs.map((r) => r.meta.startedUs)).toEqual([BASE_US, us(100), us(300)]);
    expect(p.runs[0]!.meta).toEqual({ startedUs: BASE_US, summary: { startUs: BASE_US, level: 40 } });
    expect(p.hiddenSys).toEqual([1, 2]);
    expect(p.level).toBe(41);
    // Nothing to carry: run c set nothing.
    expect(p.runs[2]!.text).not.toContain('VIEW');
    // Without the achievement, b goes too and run d gets what b set.
    chain[1]!.text = r2.split('\n').filter((l) => !l.includes('Achieved')).join('\n');
    const q = buildReplayPayload(chain, [], d, defaultSettings());
    expect(q.runs).toHaveLength(2);
    expect(q.hiddenSys).toEqual([1]);
    const lines = q.runs[1]!.text.split('\n');
    // Pacing records on the left-out runs' times (both ends of each long gap) …
    expect(lines.slice(0, 3)).toEqual([us(100), us(100.2), us(200)].map((t) => `${t} \x1bSIZE ${PACE_JSON}`));
    // … then their state.
    const first = lines.slice(3, 5);
    expect(first).toEqual([
      formatRecord(us(300), 'VIEW', JSON.stringify({ appearance: { size: 16 } })).trimEnd(),
      `${String(us(300))} \x1bGMCP Comm.Channel.List [{"name":"tells"},{"name":"tales"}]`,
    ]);
    // It plays like the payload that keeps every run.
    const all = buildReplayPayload(chain, [], d, defaultSettings(), { dropRuns: false });
    expect(all.runs).toHaveLength(4);
    const kept = (x: typeof q) => {
      const tl = buildTimeline(x.runs, payloadEdits(x));
      return [...tl.ts].map((t, i) => [t, tl.play[i]]).filter(([t]) => !isEx(t!));
    };
    const isEx = (t: number) => t >= us(2) && t < us(300.5);
    expect(kept(q)).toEqual(kept(all));
    expect(fires(q.runs.map((r) => r.text))).toEqual(fires(all.runs.map((r) => r.text)));
    // The header comes from the first run played; everything excluded: no runs.
    const s = buildReplayPayload(chain, [], doc([[0, us(300.5)]]), defaultSettings());
    expect(s.runs).toHaveLength(1);
    expect(s.startUs).toBe(us(300));
    expect(buildReplayPayload(chain, [], doc([[0, null]]), defaultSettings()).runs).toEqual([]);
  });

  it('keeps a script pane fold and the timers record at the cut end', () => {
    const text =
      makeLog(BASE_US, [
        { at: 0, gmcp: 'Char.Name', json: { name: 'Rasta' } },
        { at: 1, in: 'Hello.' },
        { at: 5, gmcp: 'Char.Vitals', json: { hp: 1 } },
      ]) +
      formatPaneRecord(us(6), 's/a', '{"title":"A","lines":[],"links":[]}') +
      makeLog(BASE_US, [
        { at: 7, gmcp: 'Char.Vitals', json: { hp: 2 } },
        { at: 8, in: 'Secret.' },
      ]) +
      formatInbound(us(20), 'Back.');
    const chain = [{ meta: meta('Rasta/a', BASE_US), text }];
    const d = doc([[us(2), us(19)]]);
    const plain = buildReplayPayload(chain, [], d, defaultSettings(), { fold: false });
    const p = buildReplayPayload(chain, [], d, defaultSettings());
    const tail = (x: typeof p) => x.runs[0]!.text.split('\n').filter((l) => /SPANE|Timers|Back/.test(l));
    expect(tail(p)).toEqual(tail(plain));
    expect(p.runs[0]!.text).not.toContain('Secret.');
  });
});
