// @vitest-environment happy-dom
// The panes of a shared run (stage 65, owner's feedback 13; ADR 0155 "As
// built (stage 65, owner's feedback: W3)"): the payload carries Map,
// Timers and Group only, every pane off; the replay shows only those three,
// off at the start, and plays a payload made before this the same way.
import { describe, expect, it } from 'vitest';
import { formatGmcpRecord, formatPaneRecord, formatRecord } from '../../src/capture/format';
import { PANE_IDS } from '../../src/layout/types';
import { openReplay } from '../../src/replay/page';
import { payloadBytes, readSharedPayload } from '../../src/replay/shared';
import { validatePayload } from '../../src/replay/validate';
import { defaultSettings } from '../../src/settings';
import { defaultExportDoc } from '../../src/share/edits';
import { type ReplayPayload, buildReplayPayload } from '../../src/share/payload';
import { SHARED_PANES, needsShared, sharedPayload } from '../../src/share/shared-panes';
import { BASE_US, FakeWall, makeLog, meta } from './player-helpers';

const us = (s: number) => BASE_US + Math.round(s * 1e6);
const SNAP = JSON.stringify({ title: 'Secret pane', lines: [{ spans: [{ text: 'script text' }] }], links: [] });

/** A run with every kind of pane data: Comm GMCP, a script pane, VIEWs with Comm, Statistics and a script pane on. */
function runText(): string {
  const panes = {
    character: { on: true, color: 'black', border: true, glass: true },
    timers: { on: true, color: 'red', border: false, glass: true },
    group: { on: true, color: 'black', border: true, glass: true },
    comm: { on: true, color: 'green', border: true, glass: true },
    ui: { on: true, color: 'black', border: true, glass: true },
    map: { on: true, color: 'black', border: false, glass: false },
    statistics: { on: true, color: 'black', border: true, glass: true },
    'myscript/secret': { on: true, color: 'black', border: true, glass: true },
  };
  const layout = {
    docks: { right: { lanes: [{ size: 30, panes: [{ id: 'comm', desired: 10 }, { id: 'myscript/secret', desired: 5 }, { id: 'timers', desired: 5 }] }] } },
    floating: [{ id: 'myscript/other', x: 1, y: 1, w: 10, h: 5 }],
  };
  return (
    makeLog(BASE_US, [{ at: 0, in: 'Welcome.' }]) +
    formatRecord(us(0.5), 'VIEW', JSON.stringify({ appearance: { size: 15 }, panes, layout, comm: { filters: { tells: false } } })) +
    formatGmcpRecord(us(1), 'Comm.Channel.List', JSON.stringify([{ name: 'tells' }])) +
    formatGmcpRecord(us(1), 'Comm.Channel.Text', JSON.stringify({ channel: 'tells', talker: 'Gandalf', text: 'Gandalf tells you "psst"' })) +
    formatGmcpRecord(us(1), 'comm.channel.text', JSON.stringify({ channel: 'tells', talker: 'Saruman', text: 'lower case' })) +
    makeLog(BASE_US, [{ at: 1, in: 'Gandalf tells you "psst"' }]) +
    formatPaneRecord(us(2), 'myscript/secret', SNAP) +
    formatGmcpRecord(us(2), 'Char.Vitals', JSON.stringify({ hp: 90 })) +
    makeLog(BASE_US, [{ at: 3, in: 'The end.' }])
  );
}

function settingsWithEverything() {
  const s = defaultSettings();
  s.panes.comm.on = true;
  (s.panes as Record<string, unknown>)['myscript/secret'] = { on: true, color: 'black', border: true, glass: true };
  s.comm.filters = { tells: false, narrates: true };
  s.panes.timers.color = 'blue';
  return s;
}

const build = (allPanes = false): ReplayPayload =>
  buildReplayPayload([{ meta: meta('Rasta/a', BASE_US), text: runText() }], [], defaultExportDoc('Rasta/a'), settingsWithEverything(), { allPanes });

describe('a shared payload carries Map, Timers and Group only', () => {
  it('has no other pane’s data or settings, and every pane off', () => {
    const p = build();
    const text = p.runs.map((r) => r.text).join('');
    expect(text).not.toContain('SPANE');
    expect(text).not.toMatch(/GMCP comm\./i);
    expect(text).not.toContain('myscript');
    expect(text).not.toContain('"comm":{"filters"');
    // The game's own text stays, channel lines included; other GMCP stays.
    expect(text).toContain('Gandalf tells you "psst"');
    expect(text).toContain('Char.Vitals');
    expect(Object.keys(p.settings.panes).sort()).toEqual([...PANE_IDS].sort());
    for (const id of PANE_IDS) expect(p.settings.panes[id].on).toBe(false);
    // The shared panes keep their look; the Comm pane's options are the defaults.
    expect(p.settings.panes.timers.color).toBe('blue');
    expect(p.settings.comm).toEqual(defaultSettings().comm);
    expect(JSON.stringify(p)).not.toContain('Secret pane');
    // The VIEW record: every pane off, the look kept, no script pane in the layout, no comm part.
    const view = text.split('\n').find((l) => l.includes('\x1bVIEW'))!;
    const v = JSON.parse(view.slice(view.indexOf('{'))) as { appearance: unknown; panes: Record<string, { on: boolean; color: string }>; layout: unknown; comm?: unknown };
    expect(v.appearance).toEqual({ size: 15 });
    expect(Object.keys(v.panes).sort()).toEqual([...PANE_IDS].sort());
    for (const id of PANE_IDS) expect(v.panes[id]!.on).toBe(false);
    expect(v.panes.timers!.color).toBe('red');
    expect(v.panes.comm!.color).toBe('black');
    expect(v.comm).toBeUndefined();
    expect(JSON.stringify(v.layout)).not.toContain('myscript');
  });

  it('is still a valid schema-1 payload, and the filter changes nothing more on it', () => {
    const p = build();
    const v = validatePayload(JSON.parse(JSON.stringify(p)));
    expect(v.schema).toBe(1);
    expect(v.runs.map((r) => r.text)).toEqual(p.runs.map((r) => r.text));
    expect(sharedPayload(p)).toEqual(p);
  });
});

describe('needsShared (review fix 2 CR6: the replay filters only what needs it)', () => {
  const with_ = (p: ReplayPayload, text: string): ReplayPayload => ({ ...p, runs: [{ ...p.runs[0]!, text: p.runs[0]!.text + text }] });

  it('is false for a payload shared since W3, true for one made with every pane', () => {
    expect(needsShared(build())).toBe(false);
    expect(needsShared(sharedPayload(build(true)))).toBe(false);
    expect(needsShared(build(true))).toBe(true);
  });

  it('finds a script pane record, a Comm record (any case) and a VIEW that turns a pane on', () => {
    const p = build();
    expect(needsShared(with_(p, formatPaneRecord(us(9), 'myscript/x', SNAP)))).toBe(true);
    expect(needsShared(with_(p, formatGmcpRecord(us(9), 'Comm.Channel.Text', '{}')))).toBe(true);
    expect(needsShared(with_(p, formatGmcpRecord(us(9), 'COMM.Channel.List', '[]')))).toBe(true);
    expect(needsShared(with_(p, formatRecord(us(9), 'VIEW', JSON.stringify({ panes: { comm: { on: true } } }))))).toBe(true);
    // Other GMCP and a VIEW with every pane off are as a shared run keeps them.
    expect(needsShared(with_(p, formatGmcpRecord(us(9), 'Char.Vitals', '{"hp":1}')))).toBe(false);
    expect(needsShared(with_(p, formatRecord(us(9), 'VIEW', JSON.stringify({ panes: { comm: { on: false } }, appearance: { size: 15 } }))))).toBe(false);
  });

  it('finds a pane on, a pane missing, a script pane entry and a script pane in the layout', () => {
    const p = build();
    const settings = (f: (s: Record<string, unknown>) => void): ReplayPayload => {
      const s = JSON.parse(JSON.stringify(p.settings)) as Record<string, unknown>;
      f(s);
      return { ...p, settings: s as unknown as ReplayPayload['settings'] };
    };
    expect(needsShared(settings((s) => ((s.panes as Record<string, { on: boolean }>).map!.on = true)))).toBe(true);
    expect(needsShared(settings((s) => delete (s.panes as Record<string, unknown>).comm))).toBe(true);
    expect(needsShared(settings((s) => ((s.panes as Record<string, unknown>)['myscript/x'] = { on: false })))).toBe(true);
    expect(needsShared(settings((s) => (s.layout = { docks: { right: { lanes: [{ size: 30, panes: [{ id: 'myscript/x', desired: 5 }] }] } }, floating: [] })))).toBe(true);
    expect(needsShared(settings((s) => (s.panes = null)))).toBe(true);
  });
});

function open(p: ReplayPayload) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const wall = new FakeWall();
  const page = openReplay(document, root, p, { wall });
  const eng = page.host.engine!;
  eng.seek(eng.duration);
  wall.advance(2000);
  return page;
}

/** The player App's settings (private: read as the e2e probes do). */
const appSettings = (page: ReturnType<typeof open>) => (page.host.app as unknown as { settings: { get(): ReturnType<typeof defaultSettings> } }).settings.get();

function expectSharedLook(page: ReturnType<typeof open>) {
  const controls = page.host.viewerControls(false);
  const list = controls.panes!.list();
  expect(list.map((x) => x.id)).toEqual([...SHARED_PANES]);
  // On a computer the map is the lens, on at the start (stage 73); Timers and Group are off.
  expect(list.map((x) => `${x.id}:${x.on}`)).toEqual(['timers:false', 'group:false', 'map:true']);
  const s = appSettings(page);
  for (const id of PANE_IDS) expect(s.panes[id].on).toBe(id === 'map');
  expect(page.host.scriptPaneIds).toEqual([]);
  expect(page.host.app!.cockpit.scriptPanes()).toHaveLength(0);
  // A pane turned on shows; nothing else does.
  controls.panes!.toggle('timers');
  const after = appSettings(page);
  expect(after.panes.timers.on).toBe(true);
  for (const id of PANE_IDS) if (id !== 'timers' && id !== 'map') expect(after.panes[id].on).toBe(false);
  expect(controls.panes!.list().find((x) => x.id === 'timers')!.on).toBe(true);
  // The map (the lens) turned off.
  controls.panes!.toggle('map');
  expect(appSettings(page).panes.map.on).toBe(false);
}

describe('the replay of a shared run', () => {
  it('lists Map, Timers and Group, the map (the lens) on; one turned on shows', () => {
    const page = open(build());
    expectSharedLook(page);
    page.host.dispose();
  });

  it('plays a payload made before the filter (more panes, some on) the same way, through the frame’s path', async () => {
    const old = build(true);
    // An old payload: the script pane, Comm records and Comm on are in it.
    expect(old.runs[0]!.text).toContain('SPANE');
    expect(old.settings.panes.comm.on).toBe(true);
    const p = await readSharedPayload(await payloadBytes(old));
    const page = open(p);
    expect(page.payload.runs[0]!.text).not.toContain('SPANE');
    expectSharedLook(page);
    page.host.dispose();
  });
});
