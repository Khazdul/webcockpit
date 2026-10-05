// Room notes in the game window (ADR 0077 §A): the map file's note for the
// room the map locates, shown after that room's exits line, as MMapper does
// (parser/abstractparser.cpp parseExits, map/Map.cpp displayRoom NOTE).
//
// App owns one RoomNotes (the live app and a log player's App alike). It
// never imports the map client or the worker, so it costs nothing at start.
//
// - Exits lines: a game line (`text.display`, not local) whose source has an
//   `exits` XML span (no `snoop`), or, outside XML mode, starts `Exits:`.
//   Its display copy is the anchor the note goes after.
// - Room.Info: every `gmcp` Room.Info. The Map pane forwards it to the
//   worker with a sequence number and, when the worker has located it,
//   calls `note(info, text)` with the bus payload of that Room.Info.
// - Pairing works for either order of GMCP and text: an exits line takes
//   the newest Room.Info that has no exits line yet (GMCP first), else it
//   waits for the next Room.Info (text first). Either side waits at most
//   PAIR_MS. MMapper shows notes only with an exits line, and so does this.
// - The worker answers a few ms after the text, usually before the output
//   pane's next frame: the rows are inserted after the anchor in its queue,
//   else after the anchor's row in the DOM (OutputPane.insertAfter). A note
//   that is known before its exits line arrives is inserted at the pairing.
// - The rows go straight to the output pane: no bus event, so no trigger,
//   action or capture ever sees them (like `#help` rows). A log player or
//   HTML replay that runs a map makes them again from its own map.

import type { Bus } from '../core/bus';
import type { BusEvents, Line } from '../core/types';
import type { StyledRow } from '../ui/output-pane';

/** Where the note rows go (the output pane). */
export interface NoteSink {
  /** Marks `line` as a possible anchor (before it is flushed). */
  watchAnchor(line: Line): void;
  /** Inserts `rows` after the row of `anchor`; false when it is gone. */
  insertAfter(anchor: Line, rows: readonly StyledRow[]): boolean;
}

/** What the Map pane sees of the notes (PaneContext.mapNotes). */
export interface MapNotesPort {
  /** Whether Room.Info should be stamped for notes (setting on, a sink attached). */
  wanted(): boolean;
  /** The worker located Room.Info `info` (the bus payload) in a room with this note. */
  note(info: object, text: string): void;
}

/** How long an exits line and a Room.Info wait for each other, ms. */
export const PAIR_MS = 1000;
/** Room.Infos remembered for their notes. */
const KEEP = 8;

type Gmcp = BusEvents['gmcp'];

interface Pair {
  info: object;
  anchor: Line | null;
  note: string | null;
  done: boolean;
}

export interface RoomNotesOptions {
  /** Whether notes are on (`settings.mapper.notes`). */
  enabled: () => boolean;
  /** Clock in ms (default performance.now). */
  now?: () => number;
  /** Defers the insertion until the output pane has the anchor (default queueMicrotask). */
  defer?: (fn: () => void) => void;
}

/** The rows of a note: `Note: text` on one line, or `Note:` and each line indented. */
export function noteRows(note: string): StyledRow[] {
  const lines = note
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l !== '');
  if (lines.length === 0) return [];
  const label = { text: 'Note:', cls: 'wc-note-label' };
  if (lines.length === 1) return [{ cls: 'wc-note', segs: [label, { text: ' ' }, { text: lines[0]!, cls: 'wc-note-text' }] }];
  return [{ cls: 'wc-note', segs: [label] }, ...lines.map((l) => ({ cls: 'wc-note', segs: [{ text: '  ' }, { text: l, cls: 'wc-note-text' }] }))];
}

/** True for the room's exits line (see the file header). */
export function isExitsLine(src: Line): boolean {
  if (src.prompt) return false;
  const tags = src.tags;
  if (tags.length > 0) {
    let exits = false;
    for (const t of tags) {
      if (t.tag === 'snoop') return false;
      if (t.tag === 'exits') exits = true;
    }
    if (exits) return true;
  }
  return src.text.startsWith('Exits:');
}

export class RoomNotes implements MapNotesPort {
  private sink: NoteSink | null = null;
  private readonly pairs: Pair[] = [];
  /** The newest Room.Info without an exits line, and when it came. */
  private lone: { pair: Pair; t: number } | null = null;
  /** An exits line waiting for its Room.Info, and when it came. */
  private waiting: { line: Line; t: number } | null = null;
  private readonly now: () => number;
  private readonly defer: (fn: () => void) => void;
  private unsubs: Array<() => void> = [];

  constructor(private readonly opts: RoomNotesOptions) {
    this.now = opts.now ?? (() => performance.now());
    this.defer = opts.defer ?? ((fn) => queueMicrotask(fn));
  }

  /** Follows `bus` and inserts into `sink`. Returns the detach. */
  attach(bus: Bus, sink: NoteSink): () => void {
    this.sink = sink;
    this.unsubs.push(
      bus.on('gmcp', (m) => this.onGmcp(m)),
      bus.on('text.display', (d) => this.onDisplay(d)),
    );
    return () => this.detach();
  }

  detach(): void {
    for (const u of this.unsubs.splice(0)) u();
    this.sink = null;
    this.pairs.length = 0;
    this.lone = null;
    this.waiting = null;
  }

  wanted(): boolean {
    return this.sink !== null && this.opts.enabled();
  }

  note(info: object, text: string): void {
    const p = this.pairs.find((x) => x.info === info);
    if (!p || p.done) return;
    p.note = text;
    this.show(p);
  }

  private onGmcp(m: Gmcp): void {
    if ((m.key ?? m.pkg.toLowerCase()) !== 'room.info' || !this.sink) return;
    const p: Pair = { info: m, anchor: null, note: null, done: false };
    this.pairs.push(p);
    if (this.pairs.length > KEEP) this.pairs.shift();
    const t = this.now();
    const w = this.waiting;
    this.waiting = null;
    if (w && t - w.t <= PAIR_MS) {
      this.lone = null;
      this.bind(p, w.line);
    } else {
      this.lone = { pair: p, t };
    }
  }

  private onDisplay(d: BusEvents['text.display']): void {
    if (d.local || !this.sink || !isExitsLine(d.source)) return;
    const t = this.now();
    const lone = this.lone;
    this.lone = null;
    if (lone && t - lone.t <= PAIR_MS) {
      this.waiting = null;
      this.bind(lone.pair, d.line);
    } else {
      this.waiting = { line: d.line, t };
    }
  }

  private bind(p: Pair, anchor: Line): void {
    p.anchor = anchor;
    this.sink?.watchAnchor(anchor);
    if (p.note !== null) this.show(p);
  }

  private show(p: Pair): void {
    if (p.done || p.anchor === null || p.note === null) return;
    p.done = true;
    if (p.note === '' || !this.opts.enabled()) return;
    const rows = noteRows(p.note);
    const anchor = p.anchor;
    if (rows.length > 0) this.defer(() => void this.sink?.insertAfter(anchor, rows));
  }
}
