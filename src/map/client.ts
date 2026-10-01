// Main-thread side of the map (ADR 0020): starts the worker, transfers
// the pane's canvas to it and posts small messages. Loaded lazily by the
// Map pane (src/panes/map.ts) the first time it is shown, so none of this
// (nor the worker) is part of the app's cold start.
//
// Main-thread cost: one postMessage per call; map bytes are transferred,
// not copied. Nothing here parses or draws.
//
// Game events reach the worker through a MapEventForwarder: its bus
// handlers push a small MapEvent onto an array (cmd.sent: one push; gmcp:
// a case-insensitive package lookup; text.line: one precompiled regex) and
// one postMessage per microtask sends the batch.

import { type BusEvents, gmcpKey } from '../core/types';
import {
  type AssetSource,
  MAP_GMCP_PACKAGES,
  MAP_PROTOCOL_VERSION,
  type MainToWorker,
  type MapEvent,
  type MapGmcpPackage,
  type MapSource,
  type WorkerToMain,
} from './protocol';
import { spawnMapWorker } from './spawn-worker';

export interface MapClientOptions {
  canvas: HTMLCanvasElement;
  /** Canvas size in CSS px and devicePixelRatio. */
  width: number;
  height: number;
  dpr: number;
  assets: AssetSource;
  onMessage: (m: WorkerToMain) => void;
}

export class MapClient {
  private nextReq = 1;
  private disposed = false;

  private constructor(private readonly worker: Worker) {}

  /** Starts the worker and hands it the canvas (which becomes an OffscreenCanvas). */
  static async create(o: MapClientOptions): Promise<MapClient> {
    const worker = await spawnMapWorker();
    const client = new MapClient(worker);
    worker.addEventListener('message', (e: MessageEvent<WorkerToMain>) => {
      if (!client.disposed) o.onMessage(e.data);
    });
    worker.addEventListener('error', (e: ErrorEvent) => {
      if (!client.disposed) o.onMessage({ t: 'error', stage: 'init', message: e.message || 'map worker failed to start' });
    });
    const canvas = o.canvas.transferControlToOffscreen();
    client.post(
      { t: 'init', protocol: MAP_PROTOCOL_VERSION, canvas, width: o.width, height: o.height, dpr: o.dpr, assets: o.assets },
      [canvas],
    );
    return client;
  }

  private post(m: MainToWorker, transfer: Transferable[] = []): void {
    if (!this.disposed) this.worker.postMessage(m, transfer);
  }

  /** Loads a map; returns the request id echoed by `loaded` / `error`. */
  load(source: MapSource): number {
    const req = this.nextReq++;
    this.post({ t: 'load', req, source }, source.kind === 'bytes' ? [source.bytes] : []);
    return req;
  }

  resize(width: number, height: number, dpr: number): void {
    this.post({ t: 'resize', width, height, dpr });
  }

  pan(dx: number, dy: number): void {
    this.post({ t: 'pan', dx, dy });
  }

  zoom(steps: number, x: number, y: number): void {
    this.post({ t: 'zoom', steps, x, y });
  }

  layer(dz: number): void {
    this.post({ t: 'layer', dz });
  }

  visible(visible: boolean): void {
    this.post({ t: 'visible', visible });
  }

  /** Forwards a batch of game events (see MapEventForwarder). */
  events(events: MapEvent[]): void {
    if (events.length > 0) this.post({ t: 'events', events });
  }

  /** Lets the worker keep learned server ids in IndexedDB (the app's own pane only). */
  persistIds(on: boolean): void {
    this.post({ t: 'persistIds', on });
  }

  dispose(): void {
    this.disposed = true;
    this.worker.terminate();
  }
}

// ------------------------------------------------------------ forwarding

/**
 * MMapper's move-failure and death lines (parser/AbstractParser-Actions.cpp,
 * MMapper 26.06.0): its starts-with, ends-with and regex actions folded
 * into one anchored expression. Group 1 is set for "You are dead!" only.
 */
export const MOVE_FAILURE_RE =
  /^(?:(You are dead!)|You failed to climb|You need to swim to go there\.|You cannot ride there\.|You are too exhausted\.|You are too exhausted to ride\.|Your mount refuses to follow your orders!|You failed swimming there\.|You can't go into deep water!|You cannot ride into deep water!|You unsuccessfully try to break through the ice\.|Your boat cannot enter this place\.|Alas, you cannot go that way\.\.\.|No way! You are fighting for your life!|Nah\.\.\. You feel too relaxed to do that\.|Maybe you should get on your feet first\?|In your dreams, or what\?|If you still want to try, you must|ZBLAM! .+ doesn't want you riding (?:him|her|it) anymore\.$|.*(?:seems? to be closed|is too steep, you need to climb to go there|is too exhausted)\.$)/;

// `moveFailure` splits MOVE_FAILURE_RE so that most lines cost a character
// test: the anchored starts, tried only for their first letters, and the
// `.*…$` ends as `endsWith` checks (the full regex confirms a hit).
const MOVE_FAILURE_START_RE =
  /^(?:(You are dead!)|You failed to climb|You need to swim to go there\.|You cannot ride there\.|You are too exhausted\.|You are too exhausted to ride\.|Your mount refuses to follow your orders!|You failed swimming there\.|You can't go into deep water!|You cannot ride into deep water!|You unsuccessfully try to break through the ice\.|Your boat cannot enter this place\.|Alas, you cannot go that way\.\.\.|No way! You are fighting for your life!|Nah\.\.\. You feel too relaxed to do that\.|Maybe you should get on your feet first\?|In your dreams, or what\?|If you still want to try, you must|ZBLAM! .+ doesn't want you riding (?:him|her|it) anymore\.$)/;
/** First letters of the MOVE_FAILURE_START_RE alternatives. */
const MOVE_FAILURE_FIRST = new Set(Array.from('YANMIZ', (c) => c.charCodeAt(0)));
const MOVE_FAILURE_ENDS = ['seems to be closed.', 'seem to be closed.', 'is too steep, you need to climb to go there.', 'is too exhausted.'];
const MOVE_FAILURE_END_RE = /^.*(?:seems? to be closed|is too steep, you need to climb to go there|is too exhausted)\.$/;

/** Whether `text` is a move failure (`fail`), the death line (`dead`), or neither: as MOVE_FAILURE_RE. */
export function moveFailure(text: string): 'fail' | 'dead' | null {
  if (MOVE_FAILURE_FIRST.has(text.charCodeAt(0))) {
    const m = MOVE_FAILURE_START_RE.exec(text);
    if (m !== null) return m[1] === undefined ? 'fail' : 'dead';
  }
  if (text.charCodeAt(text.length - 1) !== 46) return null; // '.'
  for (const end of MOVE_FAILURE_ENDS) {
    if (text.endsWith(end)) return MOVE_FAILURE_END_RE.test(text) ? 'fail' : null;
  }
  return null;
}

/** Lower-case package name → the MAP_GMCP_PACKAGES spelling. */
const MAP_PKG = new Map<string, MapGmcpPackage>(MAP_GMCP_PACKAGES.map((p) => [p.toLowerCase(), p]));

/**
 * Collects game events for the map worker. Subscribe its handlers to the
 * bus (`onGmcp`, `onCmd`, `onLine`, `onConn`); the batch goes out once per
 * microtask through `sink`. `stop()` drops what is pending.
 */
export class MapEventForwarder {
  private buf: MapEvent[] = [];
  private scheduled = false;

  constructor(
    private readonly sink: (events: MapEvent[]) => void,
    private readonly schedule: (cb: () => void) => void = (cb) => queueMicrotask(cb),
  ) {}

  private readonly flush = (): void => {
    this.scheduled = false;
    const b = this.buf;
    if (b.length === 0) return;
    this.buf = [];
    this.sink(b);
  };

  private push(ev: MapEvent): void {
    this.buf.push(ev);
    if (!this.scheduled) {
      this.scheduled = true;
      this.schedule(this.flush);
    }
  }

  /** Forwarding (re)starts: the worker drops its stale prespam queue. */
  resync(): void {
    this.push({ k: 'resync' });
  }

  /** Drops what has not been sent yet. */
  stop(): void {
    this.buf = [];
  }

  readonly onCmd = (c: BusEvents['cmd.sent']): void => {
    if (!c.secret) this.push({ k: 'cmd', text: c.text });
  };

  readonly onGmcp = (m: BusEvents['gmcp']): void => {
    const pkg = MAP_PKG.get(gmcpKey(m));
    if (pkg !== undefined) this.push({ k: 'gmcp', pkg, data: m.data });
  };

  readonly onLine = (l: BusEvents['text.line']): void => {
    const kind = moveFailure(l.text);
    if (kind !== null) this.push({ k: 'fail', kind });
  };

  readonly onConn = (s: BusEvents['conn.state']): void => {
    this.push(s.replay ? { k: 'conn', state: s.state, replay: true } : { k: 'conn', state: s.state });
  };
}
