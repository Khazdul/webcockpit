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
// Hover (ADR 0077): `roomAt` hit-tests the current view (hover.ts) and
// answers once; nothing runs between requests.
//
// Script marks (ADR 0057): `find` answers a room query (query.ts);
// `mark` resolves its target, keeps the mark until its absolute end and
// runs a frame loop while any mark lives and the pane is shown, putting
// the marks into the scene at most every MARK_TICK_MS (blink and fade).
// `focus` fits the view to the player and the marks; a pan or zoom by the
// player ends the fitting, and when the mark ends an untouched view gets
// its zoom back, centred on the player. A mark of `ms` Infinity lasts
// until `unmark` and blinks all the while; focus `'move'` fits once and
// lets go at the player's first move to another room (ADR 0077 §B).
//
// Map search (ADR 0077 §B): `ask` answers searches, paths and room
// details (search.ts); the shortest-path tree from the player's room is
// cached per map until the player's room changes.
//
// Loading progress (stage 24, ADR 0083): a load reports its phase (fetch
// with bytes read from a streaming body, unpack, parse, build) and the
// asset resolver counts the files of the current tile source; `progress`
// snapshots go out at most every PROGRESS_MS (a phase change at once).
// After an `assets` change, `tilesDrawn` follows the first frame drawn
// with the new tiles.
//
// Background (ADR 0085): `init.background` and later `background`
// messages set the renderer's clear colour (kept for a rebuilt renderer
// after a context restore) and ask for a redraw.

import { type AssetResolver, assetResolver } from '../assets';
import { hoverInfo, roomAt } from '../hover';
import { buildIndexes, type MapData } from '../model';
import { type Inflate, inflateZlib, mapHash, readMm2 } from '../mm2';
import {
  type AssetSource,
  MAP_PROTOCOL_VERSION,
  MARK_ROOMS_MAX,
  type MainToWorker,
  type MapAnswer,
  type MapAsk,
  type MapEvent,
  type MapSource,
  type MarkStyle,
  roomTints,
  streamsAsIs,
  type WorkerToMain,
} from '../protocol';
import { type MapLoadPhase, type MapProgress, countingResolver, readBody } from '../progress';
import { findRooms } from '../query';
import { roomDetails, roomPath, searchRooms } from '../search';
import type { Scene, SceneMark } from '../scene';
import { BACKGROUND, type RGBA, hexRgba } from '../render/palette';
import { type Renderer, type TileStyle, createRenderer } from '../render/renderer';
import { Tracker } from '../tracking';
import type { LearnedIdStore } from './ids';
import { type View, ZOOM_MAX, ZOOM_MIN, centreOn, defaultView, fitRooms, pan, zoomAt } from '../view';

/** Scene refresh while a mark lives, ms (15 Hz). */
export const MARK_TICK_MS = 66;
/** Least time between two `progress` messages, ms (≤ 20 per second). */
export const PROGRESS_MS = 50;
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

/** How an asset source's tiles are drawn (ADR 0088: a set's flow marks untinted, its room tints). */
function tileStyle(src: AssetSource): TileStyle {
  const tints = roomTints(src);
  return { ...(streamsAsIs(src) ? { streamsAsIs: true } : {}), ...(tints ? { tints } : {}) };
}

export interface WorkerHost {
  post(m: WorkerToMain): void;
  /** Frame scheduler (worker requestAnimationFrame, else a 16 ms timeout). */
  requestFrame(cb: () => void): void;
  fetch: typeof fetch;
  inflate?: Inflate;
  now(): number;
  /** Builds the renderer for a GL context (default `createRenderer`); `onChange` asks for a redraw; `style`: ADR 0088. */
  createRenderer?: (gl: WebGL2RenderingContext, assets: AssetResolver, onChange: () => void, style?: TileStyle) => Renderer;
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
  /** The asset source in use (null before init). */
  private assets: AssetResolver | null = null;
  /** How the asset source's tiles are drawn (ADR 0088). */
  private style: TileStyle = {};
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
  /**
   * The view fitted to a mark: its id, the zoom before, whether the player
   * moved the view since, and `move`: let go at the player's next move.
   */
  private focus: { id: number; savedZoom: number; touched: boolean; move: boolean } | null = null;
  /** Mark scene refreshes (tests, the bench). */
  markTicks = 0;
  /** Loading progress: what the next `progress` message says. */
  private readonly progress: MapProgress = { map: null, tiles: { done: 0, total: 0 } };
  private progressAt = -Infinity;
  private progressDirty = false;
  private progressTimer = false;
  /** An `assets` change waits for its first complete frame (`tilesDrawn`). */
  private assetsPending = false;
  /** The map background (ADR 0085). */
  private background: RGBA = BACKGROUND;

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
      case 'assets':
        this.setAssets(m.assets);
        return;
      case 'background':
        this.background = hexRgba(m.color);
        this.renderer?.setBackground?.(this.background);
        this.requestRender();
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
      case 'ask':
        this.host.post({ t: 'answer', req: m.req, answer: this.answer(m.ask) });
        return;
      case 'roomAt': {
        const hit = this.map ? roomAt(this.map, this.view, this.css.w, this.css.h, m.x, m.y) : null;
        if (!hit || !this.map) this.host.post({ t: 'roomAt', req: m.req, room: null });
        else this.host.post({ t: 'roomAt', req: m.req, room: hit.room, rect: hit.rect, info: hoverInfo(this.map, hit.room, m.full) });
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
    this.assets = this.counted(assetResolver(m.assets, this.host.fetch));
    this.style = tileStyle(m.assets);
    const glc = gl;
    if (m.background) this.background = hexRgba(m.background);
    const build = (): Renderer => {
      const r = make(glc, this.assets!, () => this.requestRender(), this.style);
      r.setBackground?.(this.background);
      return r;
    };
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

  /** A tileset change (ADR 0082): later renderers (context restore) use it too. */
  private setAssets(src: AssetSource): void {
    if (!this.assets) return; // before init
    this.assets = this.counted(assetResolver(src, this.host.fetch));
    this.style = tileStyle(src);
    this.assetsPending = true;
    this.renderer?.setAssets?.(this.assets, this.style);
  }

  /** `inner`, its requests counted as the current tile source's files. */
  private counted(inner: AssetResolver): AssetResolver {
    const count = { done: 0, total: 0 };
    this.progress.tiles = count;
    return countingResolver(inner, count, () => {
      if (this.progress.tiles === count) this.postProgress(count.done === count.total);
    });
  }

  /** Posts a `progress` snapshot now (`now`) or within PROGRESS_MS. */
  private postProgress(now = false): void {
    this.progressDirty = true;
    const wait = PROGRESS_MS - (this.host.now() - this.progressAt);
    if (now || wait <= 0) {
      this.sendProgress();
      return;
    }
    if (this.progressTimer) return;
    this.progressTimer = true;
    (this.host.setTimer ?? ((cb, ms) => void setTimeout(cb, ms)))(() => {
      this.progressTimer = false;
      if (this.progressDirty) this.sendProgress();
    }, wait);
  }

  private sendProgress(): void {
    this.progressDirty = false;
    this.progressAt = this.host.now();
    const p = this.progress;
    this.host.post({ t: 'progress', map: p.map && { ...p.map }, tiles: { ...p.tiles } });
  }

  /** The load `req` entered `phase` (dropped for a superseded load). */
  private phase(req: number, phase: MapLoadPhase): void {
    if (req !== this.loadReq) return;
    this.progress.map = { req, phase, bytes: 0, total: 0 };
    this.postProgress(true);
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
          this.phase(req, 'fetch');
          const res = await this.host.fetch(source.url);
          if (!res.ok) throw new Error(`HTTP ${res.status} for ${source.url}`);
          bytes = await readBody(res, (n, total) => {
            const m = this.progress.map;
            if (req !== this.loadReq || m?.req !== req) return;
            m.bytes = n;
            m.total = total;
            this.postProgress();
          }, source.size);
          name = source.name ?? decodeURIComponent(source.url.split('/').pop() ?? source.url);
        } else {
          bytes = new Uint8Array(source.bytes);
          name = source.name;
        }
        stages.fetch = now() - t0;
        const inflate = this.host.inflate ?? inflateZlib;
        const tp = now();
        this.phase(req, 'unpack');
        map = await readMm2(bytes, async (z) => {
          const ti = now();
          const out = await inflate(z);
          stages.inflate = now() - ti;
          this.phase(req, 'parse');
          return out;
        });
        stages.parse = now() - tp - stages.inflate;
        const th = now();
        hash = await mapHash(bytes);
        stages.hash = now() - th;
      }
      if (req !== this.loadReq) return;
      this.phase(req, 'build');
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
      this.progress.map = null;
      this.progressDirty = false;
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
      this.progress.map = null;
      this.progressDirty = false;
      this.host.post({ t: 'error', stage: 'load', req, message: err instanceof Error ? err.message : String(err) });
    }
  }

  /** Answers a script's map question (ADR 0077 §B). */
  private answer(q: MapAsk): MapAnswer {
    const map = this.map;
    const here = this.tracker.current.room;
    switch (q.k) {
      case 'search':
        if (!map) return { k: 'search', results: [], total: 0, here: null };
        try {
          return { k: 'search', ...searchRooms(map, q.query, here) };
        } catch (err) {
          return { k: 'search', results: [], total: 0, here: null, error: err instanceof Error ? err.message : String(err) };
        }
      case 'path': {
        const p = map ? roomPath(map, here, q.room) : null;
        return { k: 'path', dirs: p ? p.dirs : null, steps: p ? p.steps : null };
      }
      case 'room':
        return { k: 'room', room: map ? roomDetails(map, q.room) : null };
      default:
        return { k: 'room', room: null };
    }
  }

  /** Applies a batch of game events (tracking.ts). */
  private events(events: readonly MapEvent[]): void {
    const before = this.tracker.current.room;
    const r = this.tracker.apply(events);
    const map = this.map;
    const room = this.tracker.current.room;
    let draw = r.changed;
    if (r.moved && map && room !== null) {
      // While a mark holds the view, a move re-fits it instead; a `move`
      // focus lets go at a move to another room (a look keeps it).
      const fo = this.focus;
      const f = fo && !fo.touched ? this.marks.get(fo.id) : undefined;
      let v: View;
      if (f && fo!.move) {
        if (room === before) v = this.view;
        else {
          this.focus = null;
          v = centreOn({ ...this.view, zoom: fo!.savedZoom }, map.x[room]!, map.y[room]!, map.z[room]!);
        }
      } else v = f ? this.fitted(f) : centreOn(this.view, map.x[room]!, map.y[room]!, map.z[room]!);
      if (v.x !== this.view.x || v.y !== this.view.y || v.layer !== this.view.layer || v.zoom !== this.view.zoom) {
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
        rooms = m.target.rooms.filter((r) => Number.isInteger(r) && r >= 0 && r < map.roomCount).slice(0, MARK_ROOMS_MAX);
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
    // Infinity: until unmarked (ADR 0077 §B).
    const blinkEnd = now + Math.max(0, m.ms);
    const linger = Math.max(0, Math.min(LINGER_MAX_MS, (m.style.linger ?? 0) * 1000));
    const live: LiveMark = { id: m.id, rooms, style: m.style, start: now, blinkEnd, end: blinkEnd + linger, lingering: false };
    this.marks.set(m.id, live);
    if (m.focus) {
      // A later focus keeps the zoom saved by the first one.
      this.focus = { id: m.id, savedZoom: this.focus ? this.focus.savedZoom : this.view.zoom, touched: false, move: m.focus === 'move' };
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

  /** The player panned or zoomed: a focus stops fitting and does not restore (a `move` focus simply ends). */
  private touch(): void {
    if (this.focus?.move) this.focus = null;
    else if (this.focus) this.focus.touched = true;
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
        if (this.assetsPending && this.renderer.complete !== false) {
          this.assetsPending = false;
          this.host.post({ t: 'tilesDrawn' });
        }
      } catch (err) {
        this.host.post({ t: 'error', stage: 'render', message: err instanceof Error ? err.message : String(err) });
      }
    });
  }
}
