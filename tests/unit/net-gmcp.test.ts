import { describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import type { BusEvents } from '../../src/core/types';
import { Gmcp, GmcpRegistry, parseGmcp } from '../../src/net/gmcp';

describe('parseGmcp', () => {
  it('handles every payload kind and keeps null distinct from absent', () => {
    expect(parseGmcp('Core.Ping')).toEqual({ pkg: 'Core.Ping', json: '', data: undefined });
    expect(parseGmcp('Core.Ping  ')).toEqual({ pkg: 'Core.Ping', json: '', data: undefined });
    expect(parseGmcp('X null').data).toBeNull();
    expect(parseGmcp('Group.Remove 3').data).toBe(3);
    expect(parseGmcp('Core.Goodbye "bye now"').data).toBe('bye now');
    expect(parseGmcp('A [1,"b",null]').data).toEqual([1, 'b', null]);
    expect(parseGmcp('Char.Vitals {"climb":null,"hp":5}').data).toEqual({ climb: null, hp: 5 });
    expect(parseGmcp('B true').data).toBe(true);
    const bad = parseGmcp('C {oops');
    expect(bad.data).toBeUndefined();
    expect(bad.error).toBeTruthy();
    expect(bad.json).toBe('{oops');
  });
});

describe('GmcpRegistry', () => {
  it('builds the default Core.Supports.Set list', () => {
    expect(new GmcpRegistry().supportsList()).toEqual([
      'Char 1',
      'Comm.Channel 1',
      'Event 1',
      'Core 1',
      'Group 1',
      'Room 1',
      'Room.Chars 1',
      'MUME.Client 1',
    ]);
  });

  it('adds, updates and removes modules', () => {
    const r = new GmcpRegistry([['Char', 1]]);
    expect(r.add('Char', 1)).toBe(false);
    expect(r.add('Room', 2)).toBe(true);
    expect(r.remove('Char')).toBe(true);
    expect(r.supportsList()).toEqual(['Room 2']);
  });
});

function make() {
  const bus = new Bus();
  const sent: string[] = [];
  const events: [string, unknown][] = [];
  const seen: [string, unknown][] = [];
  bus.on('gmcp.raw', (p) => events.push(['raw', p]));
  bus.on('gmcp', (p) => events.push(['gmcp', p]));
  bus.on('sys.message', (p) => events.push(['sys', p.text]));
  const g = new Gmcp({ bus, send: (p) => (sent.push(p), true), onMessage: (pkg, d) => seen.push([pkg, d]) });
  return { g, sent, events, seen };
}

describe('Gmcp', () => {
  it('sends the handshake with exactly one Core.Supports.Set', () => {
    const { g, sent } = make();
    g.onEnabled();
    expect(sent[0]).toMatch(/^Core\.Hello \{"client":"WebCockpit","version":"[^"]+"\}$/);
    expect(sent.filter((s) => s.startsWith('Core.Supports.Set'))).toEqual([
      'Core.Supports.Set ["Char 1","Comm.Channel 1","Event 1","Core 1","Group 1","Room 1","Room.Chars 1","MUME.Client 1"]',
    ]);
    expect(sent[2]).toBe('MUME.Client.XML {"enable":true,"silent":true}');
    expect(sent.length).toBe(3);
  });

  it('emits gmcp.raw then gmcp, with null vs undefined preserved', () => {
    const { g, events, seen } = make();
    g.handle('Char.Vitals {"climb":null}');
    g.handle('Core.Ping');
    g.handle('Event.Moved null');
    const gm = events.filter((e) => e[0] === 'gmcp').map((e) => e[1] as BusEvents['gmcp']);
    expect(events[0]).toEqual(['raw', { pkg: 'Char.Vitals', json: '{"climb":null}' }]);
    expect(gm[0]).toEqual({ pkg: 'Char.Vitals', key: 'char.vitals', data: { climb: null } });
    expect(gm[1]!.data).toBeUndefined();
    expect('data' in gm[1]!).toBe(true);
    expect(gm[2]!.data).toBeNull();
    expect(seen.map((s) => s[0])).toEqual(['char.vitals', 'core.ping', 'event.moved']);
  });

  it('reports bad JSON via sys.message and still emits', () => {
    const { g, events } = make();
    g.handle('Char.Name {bad');
    expect(events.map((e) => e[0])).toEqual(['raw', 'sys', 'gmcp']);
  });

  it('enables every channel from Comm.Channel.List', () => {
    const { g, sent } = make();
    g.handle(
      'Comm.Channel.List [{"name":"tells","caption":"Tells","command":"tell"},{"name":"narrates","caption":"Narrates","command":"narrate"},{"name":"songs"}]',
    );
    expect(sent).toEqual([
      'Comm.Channel.Enable "tells"',
      'Comm.Channel.Enable "narrates"',
      'Comm.Channel.Enable "songs"',
    ]);
  });

  it('matches Comm.Channel.List case-insensitively', () => {
    const { g, sent } = make();
    g.handle('comm.channel.list [{"name":"x"}]');
    expect(sent).toEqual(['Comm.Channel.Enable "x"']);
  });
});
