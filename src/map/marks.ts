// Script map marks on the main thread (ADR 0057): App owns one hub; the
// Map pane attaches a port to it once its map is loaded, and the script
// host asks it to find and mark rooms. It never imports the map client or
// the worker, so it costs nothing at start.

import type { MarkStyle, MarkTarget, RoomQuery } from './protocol';

/** What the Map pane gives the hub: the worker's find / mark / unmark, and whether it is shown. */
export interface MapMarkPort {
  find(req: number, query: RoomQuery): void;
  mark(id: number, target: MarkTarget, style: MarkStyle, ms: number, focus: boolean): void;
  unmark(id: number): void;
  /** True while the pane is shown with its map loaded. */
  shown(): boolean;
}

export interface MarkFound {
  rooms: number[];
  total: number;
}

export interface MarkCallbacks {
  /** The mark's rooms (empty: nothing matched; `ended` follows). */
  marked(r: MarkFound): void;
  ended(): void;
}

/** The hub as the script host sees it. */
export interface ScriptMapSurface {
  /** Null when marks can be placed, else why not (`map off`). */
  unavailable(): string | null;
  find(query: RoomQuery, cb: (r: MarkFound) => void): boolean;
  mark(target: MarkTarget, style: MarkStyle, ms: number, focus: boolean, cb: MarkCallbacks): number | null;
  unmark(id: number): boolean;
}

export class MapMarkHub implements ScriptMapSurface {
  private port: MapMarkPort | null = null;
  private seq = 0;
  private readonly finds = new Map<number, (r: MarkFound) => void>();
  private readonly marks = new Map<number, MarkCallbacks>();

  /** The pane's port; the returned function detaches it (live marks end, finds answer empty). */
  attach(port: MapMarkPort): () => void {
    this.dropAll();
    this.port = port;
    return () => {
      if (this.port !== port) return;
      this.port = null;
      this.dropAll();
    };
  }

  private dropAll(): void {
    const finds = [...this.finds.values()];
    const marks = [...this.marks.values()];
    this.finds.clear();
    this.marks.clear();
    for (const f of finds) f({ rooms: [], total: 0 });
    for (const m of marks) m.ended();
  }

  unavailable(): string | null {
    return this.port && this.port.shown() ? null : 'map off';
  }

  find(query: RoomQuery, cb: (r: MarkFound) => void): boolean {
    const p = this.port;
    if (!p || !p.shown()) return false;
    const req = ++this.seq;
    this.finds.set(req, cb);
    p.find(req, query);
    return true;
  }

  mark(target: MarkTarget, style: MarkStyle, ms: number, focus: boolean, cb: MarkCallbacks): number | null {
    const p = this.port;
    if (!p || !p.shown()) return null;
    const id = ++this.seq;
    this.marks.set(id, cb);
    p.mark(id, target, style, ms, focus);
    return id;
  }

  unmark(id: number): boolean {
    if (!this.marks.has(id)) return false;
    this.port?.unmark(id);
    return true;
  }

  /** Marks the hub still waits on (tests). */
  get live(): number {
    return this.marks.size;
  }

  // ----------------------------------------------- answers from the pane

  found(req: number, rooms: number[], total: number): void {
    const cb = this.finds.get(req);
    if (!cb) return;
    this.finds.delete(req);
    cb({ rooms, total });
  }

  marked(id: number, rooms: number[], total: number): void {
    this.marks.get(id)?.marked({ rooms, total });
  }

  ended(id: number): void {
    const cb = this.marks.get(id);
    if (!cb) return;
    this.marks.delete(id);
    cb.ended();
  }
}
