// The map worker's logic (ADR 0020), apart from the worker globals so it
// runs in Node tests: map loading, the view, on-demand rendering, and
// tracking (player, prespam path, group mates; src/map/tracking.ts). The
// entry (map.worker.ts) feeds it `MainToWorker` messages.
//
// Tracking: every `events` batch goes through the Tracker. When the scene
// changed, the renderer gets it (`setScene`) and a render is requested;
// when a Room.Info was located the view re-centres on the player and
// switches to the player's layer (MMapper behaviour); `status` is posted
// when located / room / how changed. Learned server ids are saved through
// `WorkerHost.ids` when `persistIds` is on, and loaded after every load.
//
// Rendering is on demand: every change calls `requestRender()`, which
// draws once in the next animation frame (setTimeout fallback) and never
// while the pane is hidden.
//
// Script marks (ADR 0057): `find` answers a room query (query.ts);
// `mark` resolves its target, keeps the mark until its absolute end and
// runs a frame loop while any mark lives and the pane is shown, putting
// the marks into the scene at most every MARK_TICK_MS (blink and fade).
// `focus` fits the view to the player and the marks; a pan or zoom by the
// player ends the fitting, and when the mark ends an untouched view gets
// its zoom back, centred on the player.

import { type AssetResolver, assetResolver } from '../assets';
import { buildIndexes, type MapData } from '../model';
import { type Inflate, inflateZlib, mapHash, readMm2 } from '../mm2';
import { MAP_PROTOCOL_VERSION, type MainToWorker, type MapEvent, type MapSource, type MarkStyle, type WorkerToMain } from '../protocol';
import { QUERY_MAX, findRooms } from '../query';
import type { Scene, SceneMark } from '../scene';
import { type Renderer, createRenderer } from '../render/renderer';
import { Tracker } from '../tracking';
import type { LearnedIdStore } from './ids';
import { type View, ZOOM_MAX, ZOOM_MIN, centreOn, defaultView, fitRooms, pan, zoomAt } from '../view';

/** Scene refresh while a mark lives, ms (15 Hz). */
export const MARK_TICK_MS = 66;
/** Blink period, ms. */
const BLINK_MS = 1000;

/** A lingering mark's alpha: steady, a little below the blink's peak. */
export const LINGER_ALPHA = 0.75;
/** Longest linger, ms. */
export const LINGER_MAX_MS = 600_000;

interface LiveMark {
  id: number;
  rooms: number[];
  style: MarkStyle;
  start: number;
  /** End of the blink (and of a focus). */
  blinkEnd: number;
  /** End of the mark: blinkEnd + linger. */
  end: number;
  /** The blink is over: steady until `end`, no ticker. */
  lingering: boolean;
}

export interface WorkerHost {
  post(m: WorkerToMain): void;
  /** Frame scheduler (worker requestAnimationFrame, else a 16 ms timeout). */
  requestFrame(cb: () => void): void;
  fetch: typeof fetch;
  inflate?: Inflate;
  now(): number;
  /** Builds the renderer for a GL context (default `createRenderer`); `onChange` asks for a redraw. */
  createRenderer?: (gl: WebGL2RenderingContext, assets: AssetResolver, onChange: () => void) => Renderer;
  /** Where learned server ids persist (used only after `persistIds` on). */
  ids?: LearnedIdStore;
  /** A one-shot timer (default `setTimeout`): a lingering mark's end (ADR 0057). */
  setTimer?(cb: () => void, ms: number): void;
}

export class MapWorkerCore {
  map: MapData | null = null;
  view: View = defaultView();
  /** Canvas size in CSS px and the device pixel ratio. */
  private css = { w: 0, h: 0, dpr: 1 };
  private canvas: OffscreenCanvas | null = null;
  private renderer: Renderer | null = null;
  private visible = true;
  private scheduled = false;
  /** The newest load request; older results are dropped. */
  private loadReq = -1;
  /** Frames drawn (tests, debugging). */
  frames = 0;
  readonly tracker = new Tracker();
  private persistIds = false;
  private lastStatus = '';
  /** The load whose first complete frame is still to be reported (`drawn`), and its start. */
  private drawnPending: { req: number; t0: number } | null = null;
  /** Live script marks by id (ADR 0057). */
  private readonly marks = new Map<number, LiveMark>();
  private markLoop = false;
  private lastMarkTick = -Infinity;
  /** The view fitted to a mark: its id, the zoom before, and whether the player moved the view since. */
  private focus: { id: number; savedZoom: number; touched: boolean } | null = null;
  /** Mark scene refreshes (tests, the bench). */
  markTicks = 0;

  constructor(private readonly host: WorkerHost) {}

  handle(m: MainToWorker): void {
    if (this.marks.size > 0) this.expireMarks();
    switch (m.t) {
      case 'init':
        this.init(m);
        return;
      case 'load':
        void this.load(m.req, m.source);
        return;
      case 'resize':
        this.resize(m.width, m.height, m.dpr);
        return;
      case 'pan':
        this.touch();
        this.setView(pan(this.view, m.dx, m.dy));
        return;
      case 'zoom':
        this.touch();
        this.setView(zoomAt(this.view, m.steps, m.x, m.y, this.css.w, this.css.h));
        return;
      case 'visible':
        this.visible = m.visible;
        if (m.visible) {
          this.requestRender();
          this.startMarkLoop();
        }
        return;
      case 'find': {
        const r = this.map ? findRooms(this.map, m.query, this.tracker.current.room) : { rooms: [], total: 0 };
        this.host.post({ t: 'found', req: m.req, rooms: r.rooms, total: r.total });
        return;
      }
      case 'mark':
        this.mark(m);
        return;
      case 'unmark':
        this.endMark(m.id);
        return;
      case 'events':
        this.events(m.events);
        return;
      case 'persistIds':
        this.persistIds = m.on;
        if (m.on) this.loadIds();
        return;
      case 'debugScene':
        this.debugScene(m);
        return;
      default:
        // An unknown message from a newer client: ignore (protocol.ts).
        return;
    }
  }

  private init(m: Extract<MainToWorker, { t: 'init' }>): void {
    if (m.protocol !== MAP_PROTOCOL_VERSION) {
      this.host.post({ t: 'error', stage: 'init', message: `map protocol ${m.protocol}, worker speaks ${MAP_PROTOCOL_VERSION}` });
      return;
    }
    this.canvas = m.canvas;
    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = m.canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
      });
    } catch {
      gl = null;
    }
    if (!gl) {
      this.host.post({ t: 'error', stage: 'init', message: 'WebGL2 is not available' });
      return;
    }
    const make = this.host.createRenderer ?? createRenderer;
    const assets = assetResolver(m.assets, this.host.fetch);
    const glc = gl;
    const build = () => make(glc, assets, () => this.requestRender());
    this.renderer = build();
    m.canvas.addEventListener?.('webglcontextlost', (e) => {
      e.preventDefault();
      this.host.post({ t: 'error', stage: 'render', message: 'WebGL context lost' });
    });
    // Restored: everything on the GPU is gone; build the renderer again
    // and give it the map and the tracker's current scene.
    m.canvas.addEventListener?.('webglcontextrestored', () => {
      this.renderer?.dispose();
      this.renderer = build();
      this.renderer.setMap(this.map);
      if (this.map) this.renderer.setScene(this.scene());
      this.resize(this.css.w, this.css.h, this.css.dpr);
      this.host.post({ t: 'restored' });
    });
    this.resize(m.width, m.height, m.dpr);
    this.host.post({ t: 'ready' });
  }

  private resize(w: number, h: number, dpr: number): void {
    this.css = { w, h, dpr };
    const pw = Math.max(1, Math.round(w * dpr));
    const ph = Math.max(1, Math.round(h * dpr));
    if (this.canvas && (this.canvas.width !== pw || this.canvas.height !== ph)) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
    this.renderer?.resize(pw, ph, dpr);
    this.requestRender();
  }

  private setView(v: View): void {
    if (v === this.view) return;
    this.view = v;
    this.requestRender();
  }

  /** `debugScene` (development and tests): a scene, a centre and a zoom without the tracking side. */
  private debugScene(m: Extract<MainToWorker, { t: 'debugScene' }>): void {
    if (m.scene) this.renderer?.setScene(m.scene);
    let v = this.view;
    const c = m.center;
    if (c && 'room' in c) {
      const map = this.map;
      if (map && c.room >= 0 && c.room < map.roomCount) v = centreOn(v, map.x[c.room]!, map.y[c.room]!, map.z[c.room]!);
    } else if (c) {
      v = { ...v, x: c.x, y: c.y, layer: c.z };
    }
    if (m.zoom !== undefined) v = { ...v, zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, m.zoom)) };
    this.view = v;
    this.requestRender();
  }

  /** Loads a map; the previous one stays if this fails. */
  async load(req: number, source: MapSource): Promise<void> {
    this.loadReq = req;
    const now = () => this.host.now();
    const t0 = now();
    const stages = { fetch: 0, inflate: 0, parse: 0, hash: 0, meshes: 0 };
    try {
      let map: MapData;
      let hash = '';
      let name: string;
      if (source.kind === 'data') {
        const tp = now();
        map = source.map;
        buildIndexes(map);
        name = source.name;
        stages.parse = now() - tp;
      } else {
        let bytes: Uint8Array;
        if (source.kind === 'url') {
          const res = await this.host.fetch(source.url);
          if (!res.ok) throw new Error(`HTTP ${res.status} for ${source.url}`);
          bytes = new Uint8Array(await res.arrayBuffer());
          name = source.name ?? decodeURIComponent(source.url.split('/').pop() ?? source.url);
        } else {
          bytes = new Uint8Array(source.bytes);
          name = source.name;
        }
        stages.fetch = now() - t0;
        const inflate = this.host.inflate ?? inflateZlib;
        const tp = now();
        map = await readMm2(bytes, async (z) => {
          const ti = now();
          const out = await inflate(z);
          stages.inflate = now() - ti;
          return out;
        });
        stages.parse = now() - tp - stages.inflate;
        const th = now();
        hash = await mapHash(bytes);
        stages.hash = now() - th;
      }
      if (req !== this.loadReq) return;
      // Marks are room indices of the old map: gone.
      for (const id of [...this.marks.keys()]) this.endMark(id, true);
      this.map = map;
      this.view = centreOn(this.view, map.selected.x, map.selected.y, map.selected.z);
      const tm = now();
      this.renderer?.setMap(map);
      stages.meshes = now() - tm;
      this.tracker.setMap(map, hash);
      this.renderer?.setScene(this.scene());
      this.postStatus();
      this.loadIds();
      this.host.post({
        t: 'loaded',
        req,
        info: {
          name,
          rooms: map.roomCount,
          infomarks: map.infomarks.count,
          serverIds: map.byServerId.size,
          hash,
          ms: Math.round(now() - t0),
          stages: {
            fetch: Math.round(stages.fetch),
            inflate: Math.round(stages.inflate),
            parse: Math.round(stages.parse),
            hash: Math.round(stages.hash),
            meshes: Math.round(stages.meshes),
          },
        },
      });
      this.drawnPending = { req, t0 };
      this.requestRender();
    } catch (err) {
      if (req !== this.loadReq) return;
      this.host.post({ t: 'error', stage: 'load', req, message: err instanceof Error ? err.message : String(err) });
    }
  }

  /** Applies a batch of game events (tracking.ts). */
  private events(events: readonly MapEvent[]): void {
    const r = this.tracker.apply(events);
    const map = this.map;
    const room = this.tracker.current.room;
    let draw = r.changed;
    if (r.moved && map && room !== null) {
      // While a mark holds the view, a move re-fits it instead.
      const f = this.focus && !this.focus.touched ? this.marks.get(this.focus.id) : undefined;
      const v = f ? this.fitted(f) : centreOn(this.view, map.x[room]!, map.y[room]!, map.z[room]!);
      if (v.x !== this.view.x || v.y !== this.view.y || v.layer !== this.view.layer) {
        this.view = v;
        draw = true;
      }
    }
    if (r.changed) this.renderer?.setScene(this.scene());
    if (draw) this.requestRender();
    this.postStatus();
    if (r.infos.length > 0) {
      const notes = r.infos.map((i) => ({ seq: i.seq, note: map && i.room !== null ? (map.notes[i.room] ?? '') : '' }));
      this.host.post({ t: 'roomNotes', notes });
    }
    if (r.learned.length > 0 && this.persistIds && this.host.ids && this.tracker.mapHash !== '') {
      this.host.ids.save(this.tracker.mapHash, r.learned).catch(() => {});
    }
  }

  // ------------------------------------------------------------ marks

  /** The tracker's scene with the live marks (ADR 0057). */
  private scene(): Scene {
    const base = this.tracker.current;
    if (this.marks.size === 0) return base;
    const now = this.host.now();
    const marks: SceneMark[] = [];
    for (const k of this.marks.values()) {
      let alpha: number;
      if (k.lingering) alpha = LINGER_ALPHA;
      else {
        const left = (k.blinkEnd - now) / 1000;
        // With a linger the blink does not fade out: it settles into the steady mark.
        const fades = k.style.fade > 0 && k.end === k.blinkEnd;
        const env = fades && left < k.style.fade ? Math.max(0, left / k.style.fade) : 1;
        const wave = k.style.blink ? 0.55 + 0.45 * Math.cos((2 * Math.PI * (now - k.start)) / BLINK_MS) : 1;
        alpha = env * wave;
      }
      const m: SceneMark = { rooms: k.rooms, color: k.style.color, alpha, arrows: k.style.arrows };
      if (k.style.label) m.label = k.style.label;
      marks.push(m);
    }
    return { ...base, marks };
  }

  private mark(m: Extract<MainToWorker, { t: 'mark' }>): void {
    const map = this.map;
    let rooms: number[] = [];
    let total = 0;
    if (map) {
      if ('rooms' in m.target) {
        rooms = m.target.rooms.filter((r) => Number.isInteger(r) && r >= 0 && r < map.roomCount).slice(0, QUERY_MAX);
        total = rooms.length;
      } else {
        const r = findRooms(map, m.target.query, this.tracker.current.room);
        rooms = r.rooms;
        total = r.total;
      }
    }
    this.host.post({ t: 'marked', id: m.id, rooms, total });
    if (rooms.length === 0) {
      this.host.post({ t: 'markEnded', id: m.id });
      return;
    }
    const now = this.host.now();
    const blinkEnd = now + Math.max(0, m.ms);
    const linger = Math.max(0, Math.min(LINGER_MAX_MS, (m.style.linger ?? 0) * 1000));
    const live: LiveMark = { id: m.id, rooms, style: m.style, start: now, blinkEnd, end: blinkEnd + linger, lingering: false };
    this.marks.set(m.id, live);
    if (m.focus) {
      // A later focus keeps the zoom saved by the first one.
      this.focus = { id: m.id, savedZoom: this.focus ? this.focus.savedZoom : this.view.zoom, touched: false };
      this.view = this.fitted(live);
    }
    this.renderer?.setScene(this.scene());
    this.requestRender();
    this.startMarkLoop();
  }

  /** The view fitted to the player and `k`'s rooms (all when ≤ 5, else the nearest 3). */
  private fitted(k: LiveMark): View {
    const map = this.map;
    if (!map) return this.view;
    const pos = (r: number) => ({ x: map.x[r]!, y: map.y[r]!, z: map.z[r]! });
    const you = this.tracker.current.room;
    const targets = (k.rooms.length <= 5 ? k.rooms : k.rooms.slice(0, 3)).map(pos);
    return fitRooms(this.view, you !== null && you >= 0 && you < map.roomCount ? pos(you) : null, targets, this.css.w, this.css.h);
  }

  /** The player panned or zoomed: a focus stops fitting and does not restore. */
  private touch(): void {
    if (this.focus) this.focus.touched = true;
  }

  /** Ends mark `id` (`silent`: a map load, the view is left alone). */
  private endMark(id: number, silent = false): void {
    if (!this.marks.delete(id)) return;
    this.host.post({ t: 'markEnded', id });
    this.endFocus(id, silent);
    if (!silent) {
      this.renderer?.setScene(this.scene());
      this.requestRender();
    }
  }

  /** The focus of mark `id` ends: an untouched view gets its zoom back, centred on the player. */
  private endFocus(id: number, silent: boolean): void {
    const f = this.focus;
    if (f && f.id === id) {
      this.focus = null;
      const map = this.map;
      const you = this.tracker.current.room;
      if (!silent && !f.touched) {
        let v: View = { ...this.view, zoom: f.savedZoom };
        if (map && you !== null && you >= 0 && you < map.roomCount) v = centreOn(v, map.x[you]!, map.y[you]!, map.z[you]!);
        this.view = v;
      }
    }
  }

  /** Ends marks past their end, and moves marks past their blink into the linger. */
  private expireMarks(): void {
    const now = this.host.now();
    let changed = false;
    for (const k of [...this.marks.values()]) {
      if (now >= k.end) this.endMark(k.id);
      else if (!k.lingering && now >= k.blinkEnd) {
        // Linger: steady, drawn once now; a timer ends it (no ticker).
        k.lingering = true;
        changed = true;
        this.endFocus(k.id, false);
        this.lingerTimer(k);
      }
    }
    if (changed) {
      this.renderer?.setScene(this.scene());
      this.requestRender();
    }
  }

  private lingerTimer(k: LiveMark): void {
    const ms = Math.max(0, k.end - this.host.now());
    const set = this.host.setTimer ?? ((cb: () => void, t: number) => void setTimeout(cb, t));
    set(() => {
      if (this.marks.get(k.id) !== k) return;
      this.expireMarks();
      // A timer that fired a little early: again for the rest.
      if (this.marks.get(k.id) === k) this.lingerTimer(k);
    }, ms + 1);
  }

  /** Marks still blinking (the ticker runs only for them). */
  private blinking(): boolean {
    for (const k of this.marks.values()) if (!k.lingering) return true;
    return false;
  }

  private startMarkLoop(): void {
    if (this.markLoop || !this.blinking() || !this.visible) return;
    this.markLoop = true;
    this.host.requestFrame(this.onMarkFrame);
  }

  private readonly onMarkFrame = (): void => {
    this.markLoop = false;
    if (this.marks.size === 0 || !this.visible) return;
    this.expireMarks();
    if (!this.blinking()) return;
    const now = this.host.now();
    if (now - this.lastMarkTick >= MARK_TICK_MS) {
      this.lastMarkTick = now;
      this.markTicks++;
      this.renderer?.setScene(this.scene());
      this.requestRender();
    }
    this.startMarkLoop();
  };

  /** Live marks (tests). */
  get liveMarks(): number {
    return this.marks.size;
  }

  private postStatus(): void {
    const s = this.tracker.status;
    const key = `${s.located}|${s.room}|${s.how}`;
    if (key === this.lastStatus) return;
    this.lastStatus = key;
    this.host.post({ t: 'status', located: s.located, room: s.room, how: s.how });
  }

  /** Loads the stored ids of the current map (when persisting). */
  private loadIds(): void {
    const hash = this.tracker.mapHash;
    const store = this.host.ids;
    if (!this.persistIds || !store || hash === '') return;
    store.load(hash).then(
      (ids) => {
        if (this.tracker.addLearned(hash, ids)) {
          this.renderer?.setScene(this.scene());
          this.requestRender();
        }
      },
      () => {},
    );
  }

  /** Draws once in the next frame (coalesced; skipped while hidden). */
  requestRender(): void {
    if (this.scheduled || !this.renderer || !this.visible) return;
    this.scheduled = true;
    this.host.requestFrame(() => {
      this.scheduled = false;
      if (!this.renderer || !this.visible) return;
      try {
        this.renderer.render(this.view);
        this.frames++;
        const d = this.drawnPending;
        if (d && this.map && this.renderer.complete !== false) {
          this.drawnPending = null;
          this.host.post({ t: 'drawn', req: d.req, ms: Math.round(this.host.now() - d.t0) });
        }
      } catch (err) {
        this.host.post({ t: 'error', stage: 'render', message: err instanceof Error ? err.message : String(err) });
      }
    });
  }
}
