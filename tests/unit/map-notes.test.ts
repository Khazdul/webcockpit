// @vitest-environment happy-dom
// Room notes in the game window (ADR 0077 §A): pairing of exits lines and
// Room.Info in either order, the rows, the output pane insertion, and the
// worker side (tracker infos, forwarder stamping, core `roomNotes`).
import { beforeEach, describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import type { BusEvents, Line, XmlSpan } from '../../src/core/types';
import { MapEventForwarder } from '../../src/map/client';
import { PAIR_MS, RoomNotes, isExitsLine, noteRows } from '../../src/map/notes';
import type { MapEvent } from '../../src/map/protocol';
import { Tracker } from '../../src/map/tracking';
import { OutputPane } from '../../src/ui/output-pane';
import { gridMap } from './map-grid';

function line(text: string, tags: XmlSpan[] = []): Line {
  return { text, runs: [], tags, prompt: false, raw: text, ts: 0 };
}
const exits = (text = 'Exits: north, south.'): Line => line(text, [{ tag: 'exits', start: 0, end: text.length }]);
const roomInfo = (id = 1): BusEvents['gmcp'] => ({ pkg: 'Room.Info', key: 'room.info', data: { id } });

function setup(enabled = true) {
  const bus = new Bus();
  const root = document.createElement('div');
  document.body.appendChild(root);
  const frames: Array<() => void> = [];
  const pane = new OutputPane(bus, root, { requestFrame: (cb) => frames.push(cb) });
  let t = 0;
  const deferred: Array<() => void> = [];
  const state = { enabled };
  const notes = new RoomNotes({ enabled: () => state.enabled, now: () => t, defer: (fn) => deferred.push(fn) });
  notes.attach(bus, pane);
  const show = (l: Line) => bus.emit('text.display', { line: l, source: l });
  const settle = () => {
    while (deferred.length) deferred.shift()!();
    while (frames.length) frames.shift()!();
  };
  const rows = () => Array.from(pane.el.querySelectorAll('.wc-rows .wc-row')).map((r) => r.textContent);
  return { bus, pane, notes, show, settle, rows, state, advance: (ms: number) => void (t += ms) };
}

describe('noteRows', () => {
  it('puts a one-line note after "Note:" and indents each line of a longer one', () => {
    expect(noteRows('Herb: athelas\n')).toEqual([
      {
        cls: 'wc-note',
        segs: [{ text: 'Note:', cls: 'wc-note-label' }, { text: ' ' }, { text: 'Herb: athelas', cls: 'wc-note-text' }],
      },
    ]);
    const r = noteRows('Herb: foxglove\r\n\nHerb: belladonna\n');
    expect(r.map((x) => x.segs.map((s) => s.text).join(''))).toEqual(['Note:', '  Herb: foxglove', '  Herb: belladonna']);
    expect(r[1]!.segs[1]!.cls).toBe('wc-note-text');
    expect(noteRows('\n  \n')).toEqual([]);
  });

  it('knows the exits line by its XML span, or by its text without XML', () => {
    expect(isExitsLine(exits())).toBe(true);
    expect(isExitsLine(line('Exits: east.'))).toBe(true);
    expect(isExitsLine(line('A cat says, Exits: none'))).toBe(false);
    const snoop: XmlSpan[] = [
      { tag: 'snoop', start: 0, end: 20 },
      { tag: 'exits', start: 0, end: 20 },
    ];
    expect(isExitsLine(line('Exits: north, south.', snoop))).toBe(false);
    expect(isExitsLine({ ...exits(), prompt: true })).toBe(false);
  });
});

describe('RoomNotes', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('GMCP first: the note goes right after the exits line, before the lines that follow', () => {
    const t = setup();
    const info = roomInfo();
    t.bus.emit('gmcp', info);
    t.show(line('Old East Road'));
    t.show(exits());
    t.show(line('A fat cat is here.'));
    // The worker answers after the text, before the next frame.
    t.notes.note(info, 'Herb: athelas\n');
    t.settle();
    expect(t.rows()).toEqual(['Old East Road', 'Exits: north, south.', 'Note: Herb: athelas', 'A fat cat is here.']);
    const note = t.pane.el.querySelectorAll('.wc-note')[0]!;
    expect(note.querySelector('.wc-note-label')!.textContent).toBe('Note:');
    expect(note.querySelector('.wc-note-text')!.textContent).toBe('Herb: athelas');
  });

  it('inserts into the DOM after the anchor row when the frame was already drawn', () => {
    const t = setup();
    const info = roomInfo();
    t.bus.emit('gmcp', info);
    t.show(exits());
    t.show(line('*=>'));
    t.settle();
    t.notes.note(info, 'Quest: Wood for Vig\nHerb: thyme\n');
    t.settle();
    expect(t.rows()).toEqual(['Exits: north, south.', 'Note:', '  Quest: Wood for Vig', '  Herb: thyme', '*=>']);
  });

  it('text first: the exits line waits for the next Room.Info', () => {
    const t = setup();
    t.show(exits('Exits: east.'));
    const info = roomInfo();
    t.bus.emit('gmcp', info);
    t.notes.note(info, 'Herb: red mushroom\n');
    t.settle();
    expect(t.rows()).toEqual(['Exits: east.', 'Note: Herb: red mushroom']);
  });

  it('a note known before its exits line is shown when the line comes', () => {
    const t = setup();
    const info = roomInfo();
    t.bus.emit('gmcp', info);
    t.notes.note(info, 'Herb: thyme\n');
    t.settle();
    expect(t.rows()).toEqual([]);
    t.show(exits());
    t.settle();
    expect(t.rows()).toEqual(['Exits: north, south.', 'Note: Herb: thyme']);
  });

  it('prespam: each exits line gets the note of its own room', () => {
    const t = setup();
    const a = roomInfo(1);
    const b = roomInfo(2);
    t.bus.emit('gmcp', a);
    t.show(exits('Exits: north.'));
    t.bus.emit('gmcp', b);
    t.show(exits('Exits: south.'));
    t.notes.note(b, 'B note\n');
    t.notes.note(a, 'A note\n');
    t.settle();
    expect(t.rows()).toEqual(['Exits: north.', 'Note: A note', 'Exits: south.', 'Note: B note']);
  });

  it('shows nothing for an empty note, when off, twice, or for a stale pairing', () => {
    const t = setup();
    const a = roomInfo(1);
    t.bus.emit('gmcp', a);
    t.show(exits());
    t.notes.note(a, '');
    t.notes.note(a, 'late\n');
    t.settle();
    expect(t.rows()).toEqual(['Exits: north, south.']);

    // A Room.Info with no exits line for longer than PAIR_MS does not take a later one.
    const b = roomInfo(2);
    t.bus.emit('gmcp', b);
    t.advance(PAIR_MS + 1);
    t.show(exits('Exits: west.'));
    t.notes.note(b, 'B\n');
    t.settle();
    expect(t.rows()).toEqual(['Exits: north, south.', 'Exits: west.']);

    t.state.enabled = false;
    expect(t.notes.wanted()).toBe(false);
    const c = roomInfo(3);
    t.bus.emit('gmcp', c);
    t.show(exits('Exits: up.'));
    t.notes.note(c, 'C\n');
    t.settle();
    expect(t.rows()).toEqual(['Exits: north, south.', 'Exits: west.', 'Exits: up.']);
  });

  it('never puts the note on the bus (no trigger, action or capture sees it)', () => {
    const t = setup();
    const seen: string[] = [];
    t.bus.on('text.display', (d) => seen.push(d.line.text));
    t.bus.on('text.line', (l) => seen.push(l.text));
    const info = roomInfo();
    t.bus.emit('gmcp', info);
    t.show(exits());
    t.notes.note(info, 'Herb: thyme\n');
    t.settle();
    expect(seen).toEqual(['Exits: north, south.']);
    expect(t.rows()).toContain('Note: Herb: thyme');
  });
});

describe('room notes in the worker side', () => {
  it('the forwarder stamps Room.Info only when notes are wanted, and hands it back by seq', () => {
    const sent: MapEvent[][] = [];
    const f = new MapEventForwarder((e) => sent.push(e), (cb) => cb());
    const a = roomInfo(1);
    f.onGmcp(a);
    expect(sent[0]![0]).toEqual({ k: 'gmcp', pkg: 'Room.Info', data: { id: 1 } });
    f.stampRooms = () => true;
    const b = roomInfo(2);
    const c = roomInfo(3);
    f.onGmcp(b);
    f.onGmcp(c);
    expect(sent.flat().map((e) => (e.k === 'gmcp' ? e.seq : null))).toEqual([undefined, 1, 2]);
    expect(f.takeInfo(2)).toBe(c);
    expect(f.takeInfo(1)).toBeUndefined(); // older ones are dropped with it
  });

  it('the tracker reports the located room of each stamped Room.Info', () => {
    const map = gridMap(3, 3);
    const tr = new Tracker();
    tr.setMap(map, '');
    const ev = (sid: number, seq?: number): MapEvent =>
      seq === undefined
        ? { k: 'gmcp', pkg: 'Room.Info', data: { id: sid, name: `Room ${sid - 1000}` } }
        : { k: 'gmcp', pkg: 'Room.Info', data: { id: sid, name: `Room ${sid - 1000}` }, seq };
    expect(tr.apply([ev(1004, 7)]).infos).toEqual([{ seq: 7, room: 4 }]);
    expect(tr.apply([ev(1005)]).infos).toEqual([]);
    expect(tr.apply([{ k: 'gmcp', pkg: 'Room.Info', data: { id: 99999, name: 'Nowhere' }, seq: 8 }]).infos).toEqual([{ seq: 8, room: null }]);
  });
});
