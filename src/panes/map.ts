// Map pane (ADR 0020): a canvas the map worker draws into. The pane only
// forwards sizes and pointer input; the worker (src/map/worker/) owns
// the map, the view and all drawing.
//
// - The map client and worker are imported the first time the pane is
//   shown (never at app start, never while the pane is off).
// - Left-drag pans (pointer capture); every wheel event, with or without
//   Ctrl, zooms around the cursor (ADR 0059: a trackpad pinch arrives as
//   Ctrl+wheel, and some touchpad drivers set ctrlKey on a two-finger
//   swipe; there is no manual layer change, the view follows the player's
//   layer). Input is coalesced to one message per kind per frame. The
//   title row grip still moves the pane (it lies over the frame row, above
//   the content). The cockpit's mouseup handler returns the focus to the
//   input line; the canvas never takes it.
// - Without OffscreenCanvas / module workers / WebGL2 the pane shows a
//   notice instead.
// - `content.dataset.mapState`: `idle` → `starting` → `ready` → `loaded`
//   (or `unsupported` / `error`); `mapRooms` is set on `loaded`;
//   `mapLocated` (`1`/`0`), `mapRoom` (room index or empty) and `mapHow`
//   follow the worker's `status` (browser tests, debugging); `mapLoad`
//   (JSON: ms and the worker's load stages) on `loaded` and `mapDrawnMs`
//   (load start → first frame with every tile and the font) on `drawn`
//   (bench/browser-bench.ts); `mapTileset` is the tileset drawn
//   (`default` or a set id, ADR 0082).
// - Game events (gmcp, cmd.sent, text.line, conn.state) are forwarded only
//   while the pane is shown and its map is loaded (MapEventForwarder:
//   one array push per event, one postMessage per microtask). Turned on
//   mid-session, the worker has no position until the next Room.Info.
// - Learned server ids persist (worker-side IndexedDB) only for the app's
//   own map; a pane with a `PaneContext.map` host (log player, HTML
//   replay) keeps them in memory.
// - Script map marks (ADR 0057): once its map is loaded the pane attaches a
//   port to `PaneContext.mapMarks` (finds, marks, unmarks and asks (map
//   search, ADR 0077 §B) go to the
//   worker; the answers back to the hub) and detaches on dispose.
//   `mapMarks` (dataset) counts the live marks.
// - Phone (ADR 0075 §3.3, `device().phone`): the MAP tab is hidden while
//   another tab is selected, so forwarding stays on while hidden (once the
//   map is loaded; the worker tracks but draws nothing), and the last
//   Room.Info and Char.StatusVars are kept from construction and replayed
//   after the first `resync`, so a map first opened mid-session finds the
//   player at once. Desktop keeps "shown and loaded".
// - Room notes (ADR 0077): with a `PaneContext.mapNotes` that wants them,
//   Room.Info goes to the worker with a sequence number; the worker's
//   `roomNotes` answer is handed back with that Room.Info's bus payload.
// - Hover box (ADR 0077, src/panes/map-hover.ts): the mouse resting 3 s
//   on a room (also after a click), or a long press, asks the worker
//   (`roomAt`) and shows the room's name and note (Options → Mapper "Room
//   info on hover: Full": MMapper's room preview) in a fixed box in the
//   cockpit, near the pointer (it may extend past the pane). The mouse is
//   followed on the whole pane, not only the canvas: a borderless pane's
//   title grip lies over the canvas's top row (feedback round 1). A drag,
//   wheel, leave, player move, map load, or the pane hiding or moving
//   hides it.
// - Tileset (ADR 0082, Options → Mapper): resolved here from the setting
//   and the game clock (an alternating set follows MUME's season) and
//   sent with the asset source; a change swaps the worker's tiles live.
// - Background (ADR 0085, Options → Mapper): the setting is the content's
//   `--map-bg` (the CSS background under the canvas until the first frame)
//   and goes to the worker at start and on every change; drawn live.
// - Touch (ADR 0075 §3.3, `device().touch`): every pointer is tracked; one
//   finger pans, two fingers pan by their midpoint and zoom around it by
//   the change in their distance (pinchStep, src/map/pinch.ts), through
//   the same `pan`/`zoom` messages and limits as the mouse and the wheel.
// - Loading overlay (stage 24, ADR 0083, src/panes/map-loading.ts): from
//   the start (and every map change) to the first complete frame, and
//   from a tileset change to `tilesDrawn`, a small centred progress bar fed by the
//   worker's `progress`; shown only after 200 ms, faded out at the end;
//   an error hides it and shows the notice.

import { device } from '../core/device';
import { type BusEvents, gmcpKey } from '../core/types';
import type { MapClient, MapEventForwarder } from '../map/client';
import { type PinchPoint, pinchStep } from '../map/pinch';
import { BUNDLED_MAP_BYTES } from '../map/progress';
import type { AssetSource, MapPaneHost, MapSource, WorkerToMain } from '../map/protocol';
import { mumeMonth, resolveTileset, type Tileset, tilesetOverlay } from '../map/tilesets';
import { MapHover } from './map-hover';
import { MapLoading } from './map-loading';
import { PaneShell, type PaneContext } from './pane';

/** Set to `true` by the HTML replay build (vite.config.ts `bundleReplay`). */
declare const __WC_REPLAY__: boolean | undefined;
const IN_REPLAY = typeof __WC_REPLAY__ === 'boolean' && __WC_REPLAY__;

/** The app's map: the bundled arda.mm2 and tiles under public/map/. */
export function defaultMapHost(): MapPaneHost {
  if (IN_REPLAY) {
    // P3 wires the embedded map subset and assets in (ADR 0020).
    return { source: () => null, assets: { kind: 'inline', files: {} } };
  }
  const base = `${import.meta.env.BASE_URL}map/`;
  const size = BUNDLED_MAP_BYTES > 0 ? { size: BUNDLED_MAP_BYTES } : {};
  return { source: () => ({ kind: 'url', url: `${base}arda.mm2`, name: 'arda.mm2', ...size }), assets: { kind: 'base', url: base } };
}

/** Why the map cannot run here, or null. */
export function mapUnsupported(win: (Window & typeof globalThis) | null): string | null {
  if (!win) return 'no window';
  if (typeof win.Worker !== 'function') return 'Web Workers are not available';
  if (typeof win.OffscreenCanvas !== 'function' || typeof win.HTMLCanvasElement?.prototype.transferControlToOffscreen !== 'function') {
    return 'OffscreenCanvas is not available';
  }
  return null;
}

/** How often the pane checks whether MUME's season (and so an alternating tileset) changed. */
const TILESET_CHECK_MS = 60_000;

const NOTICE_SUFFIX = '\nThe map needs WebGL2, OffscreenCanvas and module workers\n(current Chrome, Firefox or Safari 17+).';

export class MapPane extends PaneShell {
  private readonly canvas: HTMLCanvasElement;
  private readonly notice: HTMLDivElement;
  private readonly loading: MapLoading;
  private readonly host: MapPaneHost;
  private client: MapClient | null = null;
  private forwarder: MapEventForwarder | null = null;
  /** Unsubscribes the forwarder's bus handlers while forwarding. */
  private unforward: (() => void) | null = null;
  private loaded = false;
  private readonly persistIds: boolean;
  private starting = false;
  private failed = false;
  private sizeKey = '';
  private drag: { id: number; x: number; y: number } | null = null;
  /** Touch only: the pointers down on the canvas (client px), in down order. */
  private readonly touches = new Map<number, PinchPoint>();
  /** Phone only: keep forwarding while hidden (ADR 0075 §3.3). */
  private readonly forwardHidden: boolean;
  /** Phone only: the last map-relevant state messages, replayed when forwarding starts. */
  private readonly lastState = new Map<string, BusEvents['gmcp']>();
  private acc = { dx: 0, dy: 0, steps: 0, zx: 0, zy: 0 };
  private flushScheduled = false;
  private dprQuery: MediaQueryList | null = null;
  /** Detaches the mark port (ADR 0057). */
  private unmarks: (() => void) | null = null;
  private readonly liveMarks = new Set<number>();
  /** The hover box (ADR 0077). */
  private readonly hover: MapHover;
  private hoverReq = 0;
  private hoverScale = { x: 1, y: 1 };
  private placeKey = '';

  constructor(ctx: PaneContext) {
    super(ctx, 'map');
    this.host = ctx.map ?? defaultMapHost();
    this.persistIds = (ctx.map ? ctx.map.persistIds === true : true) && !IN_REPLAY;
    const doc = ctx.doc;
    this.content.classList.add('wc-map');
    this.content.dataset.mapState = 'idle';
    this.canvas = doc.createElement('canvas');
    this.canvas.className = 'wc-map-canvas';
    this.notice = doc.createElement('div');
    this.notice.className = 'wc-map-notice';
    this.notice.hidden = true;
    this.loading = new MapLoading(doc);
    this.content.append(this.canvas, this.loading.el, this.notice);
    this.hover = new MapHover({
      doc,
      host: () => this.el.parentElement,
      frame: () => this.canvas.getBoundingClientRect(),
      size: () => this.ctx.settings.get().mapper.hoverSize,
      enabled: () => this.ctx.settings.get().mapper.hover !== 'off',
      ask: (x, y) => {
        const c = this.client;
        if (!c || !this.loaded || !this.visible || this.drag || this.touches.size > 1) return null;
        // The worker's canvas size is the cell grid's; the element may be
        // stretched a little (phone): scale the point to the worker's px.
        const r = this.canvas.getBoundingClientRect();
        const { w, h } = this.cssSize();
        this.hoverScale = { x: r.width > 0 ? w / r.width : 1, y: r.height > 0 ? h / r.height : 1 };
        const req = ++this.hoverReq;
        c.roomAt(req, x * this.hoverScale.x, y * this.hoverScale.y, this.ctx.settings.get().mapper.hover === 'full');
        return req;
      },
    });

    const flags = device();
    this.forwardHidden = flags.phone;
    if (flags.phone) {
      this.own(
        ctx.bus.on('gmcp', (m) => {
          const k = gmcpKey(m);
          if (k === 'room.info' || k === 'char.statusvars') this.lastState.set(k, m);
        }),
      );
    }

    this.applyBackground();
    this.own(ctx.settings.subscribe((next, prev) => next.mapper.background !== prev.mapper.background && this.applyBackground(true)));

    this.onResize(() => this.sync());
    this.own(ctx.cells.subscribe(() => this.sync()));
    // Tileset (ADR 0082): a settings change, a clock sync or the season
    // turning (checked each minute) swaps the tiles live. Only the app's
    // own assets have sets; the HTML replay embeds what it draws.
    if (this.host.assets.kind === 'base') {
      this.content.dataset.mapTileset = this.tileset()?.id ?? 'default';
      this.own(ctx.settings.subscribe((next, prev) => next.mapper.tileset !== prev.mapper.tileset && this.syncTileset()));
      this.own(ctx.game.subscribe((part) => part === 'clock' && this.syncTileset()));
      const timer = setInterval(() => this.syncTileset(), TILESET_CHECK_MS);
      this.own(() => clearInterval(timer));
    }
    // The current map changed (Options → Mapper): load the new one.
    const unsubMap = this.host.subscribe?.(() => void this.reload());
    if (unsubMap) this.own(unsubMap);

    const c = this.canvas;
    if (flags.touch) {
      c.addEventListener('pointerdown', this.onTouchDown);
      c.addEventListener('pointermove', this.onTouchMove);
      c.addEventListener('pointerup', this.onTouchEnd);
      c.addEventListener('pointercancel', this.onTouchEnd);
      c.addEventListener('lostpointercapture', this.onTouchEnd);
      // A long press shows the hover box, not the browser's menu.
      c.addEventListener('contextmenu', (e) => e.preventDefault());
    } else {
      c.addEventListener('pointerdown', this.onPointerDown);
      c.addEventListener('pointermove', this.onPointerMove);
      c.addEventListener('pointerup', this.onPointerEnd);
      c.addEventListener('pointercancel', this.onPointerEnd);
      c.addEventListener('lostpointercapture', this.onPointerEnd);
      // The hover follows the mouse over the whole pane: a borderless pane's
      // title grip covers the canvas's top row (the grip is the pane's child,
      // so its moves bubble here; a point off the canvas cancels).
      const el = this.el;
      el.addEventListener('pointermove', this.onHoverMove);
      el.addEventListener('pointerdown', this.onHoverDown);
      el.addEventListener('pointerleave', this.onHoverLeave);
      this.own(() => {
        el.removeEventListener('pointermove', this.onHoverMove);
        el.removeEventListener('pointerdown', this.onHoverDown);
        el.removeEventListener('pointerleave', this.onHoverLeave);
      });
    }
    // The canvas never takes the focus from the input line.
    c.addEventListener('mousedown', (e) => e.preventDefault());
    c.addEventListener('wheel', this.onWheel, { passive: false });
    this.own(() => {
      c.removeEventListener('wheel', this.onWheel);
      this.watchDpr(false);
    });
  }

  /** A pane moved, resized or hidden by the layout takes the hover box with it. */
  override place(p: Parameters<PaneShell['place']>[0], cell: { w: number; h: number }): void {
    const r = p?.rect;
    const key = r ? `${r.x},${r.y},${r.w},${r.h}|${cell.w}x${cell.h}` : '';
    if (key !== this.placeKey) {
      this.placeKey = key;
      this.hover.cancel();
    }
    super.place(p, cell);
  }

  override dispose(): void {
    this.hover.dispose();
    this.loading.dispose();
    this.unmarks?.();
    this.unmarks = null;
    this.forward(false);
    super.dispose();
    this.client?.dispose();
    this.client = null;
  }

  /** Starts or stops forwarding game events to the worker. */
  private forward(on: boolean): void {
    if (on === (this.unforward !== null)) return;
    if (!on) {
      this.unforward!();
      this.unforward = null;
      this.forwarder?.stop();
      return;
    }
    const f = this.forwarder;
    if (!f) return;
    const bus = this.ctx.bus;
    const offs = [bus.on('gmcp', f.onGmcp), bus.on('cmd.sent', f.onCmd), bus.on('text.line', f.onLine), bus.on('conn.state', f.onConn)];
    this.unforward = () => {
      for (const off of offs) off();
    };
    f.resync();
    // Phone: what happened before the map ran (Char.StatusVars first, then
    // the room, located as a LOOK).
    for (const k of ['char.statusvars', 'room.info']) {
      const m = this.lastState.get(k);
      if (m) f.onGmcp(m);
    }
  }

  /** Forwarding follows "shown and loaded" (phone: "loaded"). */
  private syncForward(): void {
    this.forward((this.visible || this.forwardHidden) && this.loaded && this.client !== null);
  }

  private win(): (Window & typeof globalThis) | null {
    return (this.ctx.doc.defaultView as (Window & typeof globalThis) | null) ?? null;
  }

  private dpr(): number {
    const d = this.win()?.devicePixelRatio;
    return typeof d === 'number' && d > 0 ? d : 1;
  }

  /** Canvas size in CSS px (the content area). */
  private cssSize(): { w: number; h: number } {
    const cell = this.ctx.cells.get();
    return { w: Math.round(this.cols * cell.w), h: Math.round(this.rows * cell.h) };
  }

  /** Follows visibility and size: starts the client when first shown, forwards resizes. */
  private sync(): void {
    const { w, h } = this.cssSize();
    const shown = this.visible && w > 0 && h > 0;
    if (!shown) {
      if (this.sizeKey !== 'hidden') {
        this.sizeKey = 'hidden';
        this.hover.cancel();
        this.client?.visible(false);
        this.watchDpr(false);
        if (!this.forwardHidden) this.forward(false);
      }
      return;
    }
    const dpr = this.dpr();
    const key = `${w}x${h}@${dpr}`;
    if (key === this.sizeKey) return;
    const wasHidden = this.sizeKey === 'hidden' || this.sizeKey === '';
    this.sizeKey = key;
    this.watchDpr(true);
    if (this.client) {
      if (wasHidden) this.client.visible(true);
      this.client.resize(w, h, dpr);
      this.syncForward();
    } else {
      void this.start();
    }
  }

  /** Re-syncs when devicePixelRatio changes (browser zoom, moving to another screen). */
  private watchDpr(on: boolean): void {
    this.dprQuery?.removeEventListener('change', this.onDprChange);
    this.dprQuery = null;
    const win = this.win();
    if (!on || typeof win?.matchMedia !== 'function') return;
    this.dprQuery = win.matchMedia(`(resolution: ${this.dpr()}dppx)`);
    this.dprQuery.addEventListener('change', this.onDprChange);
  }

  private readonly onDprChange = (): void => this.sync();

  private async start(): Promise<void> {
    if (this.client || this.starting || this.failed) return;
    const why = mapUnsupported(this.win());
    if (why) {
      this.fail('unsupported', `${why}.${NOTICE_SUFFIX}`);
      return;
    }
    this.starting = true;
    this.content.dataset.mapState = 'starting';
    this.loading.begin('load');
    try {
      const { MapClient, MapEventForwarder } = await import('../map/client');
      const { w, h } = this.cssSize();
      this.client = await MapClient.create({
        canvas: this.canvas,
        width: w,
        height: h,
        dpr: this.dpr(),
        assets: this.assets(),
        background: this.ctx.settings.get().mapper.background,
        onMessage: this.onWorker,
      });
      this.forwarder = new MapEventForwarder((events) => this.client?.events(events));
      const notes = this.ctx.mapNotes;
      if (notes) this.forwarder.stampRooms = () => notes.wanted();
      if (!this.visible) this.client.visible(false);
      this.sync();
      if (this.persistIds) this.client.persistIds(true);
      this.loadSource(await this.host.source());
    } catch (err) {
      this.fail('error', `The map could not start: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.starting = false;
    }
  }

  /** The background setting on the pane (CSS) and, with `send`, to a running worker (ADR 0085). */
  private applyBackground(send = false): void {
    const bg = this.ctx.settings.get().mapper.background;
    this.content.style.setProperty('--map-bg', bg);
    this.content.dataset.mapBg = bg;
    if (send) this.client?.background(bg);
  }

  /** The set the Mapper option draws now (null: the default pixmaps). */
  private tileset(): Tileset | null {
    const month = mumeMonth(this.ctx.game.clock.state.epoch, this.ctx.now());
    return resolveTileset(this.ctx.settings.get().mapper.tileset, month);
  }

  /** The asset source with the current tileset (ADR 0082). */
  private assets(): AssetSource {
    const a = this.host.assets;
    if (a.kind !== 'base') return a;
    const overlay = tilesetOverlay(this.tileset());
    return overlay ? { ...a, tileset: overlay } : a;
  }

  /** Sends the tileset to a running worker when it changed. */
  private syncTileset(): void {
    const id = this.tileset()?.id ?? 'default';
    if (id === this.content.dataset.mapTileset) return;
    this.content.dataset.mapTileset = id;
    if (!this.client) return;
    this.loading.begin('tiles');
    this.client.assets(this.assets());
  }

  /** Loads the host's current map again (no-op before the worker runs). */
  private async reload(): Promise<void> {
    if (!this.client) return;
    this.loading.begin('load');
    try {
      this.loadSource(await this.host.source());
    } catch (err) {
      this.fail('error', `Map not loaded: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Sends `source` to the worker; none: nothing to wait for. */
  private loadSource(source: MapSource | null): void {
    if (!source || !this.client) {
      this.loading.abort();
      return;
    }
    this.loading.source(source.kind === 'url');
    this.client.load(source);
  }

  /** Attaches the mark port once (ADR 0057). */
  private attachMarks(): void {
    const hub = this.ctx.mapMarks;
    if (!hub || this.unmarks) return;
    this.unmarks = hub.attach({
      find: (req, query) => this.client?.find(req, query),
      mark: (id, target, style, ms, focus) => this.client?.mark(id, target, style, ms, focus),
      unmark: (id) => this.client?.unmark(id),
      ask: (req, q) => this.client?.ask(req, q),
      shown: () => this.visible && this.loaded && this.client !== null && this.cols > 0,
    });
  }

  private fail(state: 'unsupported' | 'error', text: string): void {
    this.failed = state === 'unsupported' || this.failed;
    this.loading.abort();
    this.content.dataset.mapState = state;
    this.notice.textContent = text;
    this.notice.hidden = false;
    this.canvas.hidden = state === 'unsupported';
  }

  private readonly onWorker = (m: WorkerToMain): void => {
    switch (m.t) {
      case 'ready':
        if (this.content.dataset.mapState === 'starting') this.content.dataset.mapState = 'ready';
        return;
      case 'loaded':
        this.hover.cancel();
        this.content.dataset.mapState = 'loaded';
        this.content.dataset.mapRooms = String(m.info.rooms);
        this.content.dataset.mapLoad = JSON.stringify({ ms: m.info.ms, ...m.info.stages });
        this.notice.hidden = true;
        this.loading.loaded();
        this.loaded = true;
        this.syncForward();
        this.attachMarks();
        return;
      case 'found':
        this.ctx.mapMarks?.found(m.req, m.rooms, m.total);
        return;
      case 'answer':
        this.ctx.mapMarks?.answered(m.req, m.answer);
        return;
      case 'roomAt':
        {
          const s = this.hoverScale;
          const r = m.rect && { x: m.rect.x / s.x, y: m.rect.y / s.y, w: m.rect.w / s.x, h: m.rect.h / s.y };
          this.hover.answer(m.req, m.room, r, m.info);
        }
        return;
      case 'roomNotes':
        for (const n of m.notes) {
          const info = this.forwarder?.takeInfo(n.seq);
          if (info) this.ctx.mapNotes?.note(info, n.note);
        }
        return;
      case 'marked':
        if (m.rooms.length > 0) this.liveMarks.add(m.id);
        this.content.dataset.mapMarks = String(this.liveMarks.size);
        this.ctx.mapMarks?.marked(m.id, m.rooms, m.total);
        return;
      case 'markEnded':
        this.liveMarks.delete(m.id);
        this.content.dataset.mapMarks = String(this.liveMarks.size);
        this.ctx.mapMarks?.ended(m.id);
        return;
      case 'status': {
        // The player moved: the view follows, the room under the pointer changes.
        this.hover.cancel();
        const d = this.content.dataset;
        d.mapLocated = m.located ? '1' : '0';
        d.mapRoom = m.room === null ? '' : String(m.room);
        d.mapHow = m.how ?? '';
        return;
      }
      case 'drawn':
        this.content.dataset.mapDrawnMs = String(m.ms);
        this.loading.end('load');
        return;
      case 'tilesDrawn':
        this.loading.end('tiles');
        return;
      case 'progress':
        this.loading.progress(m);
        return;
      case 'restored':
        // The context came back: drop the "context lost" notice.
        if (this.content.dataset.mapState === 'error' && this.loaded) {
          this.content.dataset.mapState = 'loaded';
          this.notice.hidden = true;
        }
        return;
      case 'error':
        if (m.stage === 'init') {
          this.failed = true;
          this.forward(false);
          this.client?.dispose();
          this.client = null;
          this.fail('unsupported', `${m.message}.${NOTICE_SUFFIX}`);
        } else {
          this.fail('error', m.stage === 'load' ? `Map not loaded: ${m.message}` : `Map error: ${m.message}`);
        }
        return;
      default:
        return;
    }
  };

  // ---------------------------------------------------------- pointer

  private local(e: MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.hover.cancel();
    if (e.button !== 0 || !this.client) return;
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    this.canvas.dataset.dragging = '';
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events have no active pointer */
    }
  };

  /** Mouse over the pane (canvas, or the grip over its top row): the hover rest. */
  private readonly onHoverMove = (e: PointerEvent): void => {
    if (e.pointerType === 'touch' || this.drag) return;
    const p = this.local(e);
    const { width, height } = this.canvas.getBoundingClientRect();
    if (p.x < 0 || p.y < 0 || p.x >= width || p.y >= height) this.hover.cancel();
    else this.hover.move(p.x, p.y, e.buttons);
  };

  private readonly onHoverDown = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') this.hover.cancel();
  };

  private readonly onHoverLeave = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') this.hover.cancel();
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.acc.dx += e.clientX - d.x;
    this.acc.dy += e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    this.scheduleFlush();
  };

  private readonly onPointerEnd = (e: PointerEvent): void => {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    this.drag = null;
    delete this.canvas.dataset.dragging;
    // A click (or a drag) ended with the pointer on the map: it rests here.
    if (e.type === 'pointerup') {
      const p = this.local(e);
      const { width, height } = this.canvas.getBoundingClientRect();
      if (p.x >= 0 && p.y >= 0 && p.x < width && p.y < height) this.hover.up(p.x, p.y);
    }
  };

  // Touch (ADR 0075 §3.3): one finger pans, two pan and pinch-zoom.

  private readonly onTouchDown = (e: PointerEvent): void => {
    if (!this.client) return;
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = this.local(e);
    this.hover.press(p.x, p.y, this.touches.size === 1);
    this.canvas.dataset.dragging = '';
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events have no active pointer */
    }
  };

  private readonly onTouchMove = (e: PointerEvent): void => {
    const prev = this.touches.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    const lp = this.local(e);
    this.hover.pressMove(lp.x, lp.y);
    const [a, b] = [...this.touches.keys()];
    const other = a === e.pointerId ? b : b === e.pointerId ? a : undefined;
    this.touches.set(e.pointerId, next);
    if (other === undefined) {
      // One finger (or a third one): a plain pan, as the mouse.
      if (this.touches.size === 1) {
        this.acc.dx += next.x - prev.x;
        this.acc.dy += next.y - prev.y;
        this.scheduleFlush();
      }
      return;
    }
    const o = this.touches.get(other)!;
    const s = pinchStep(prev, o, next, o);
    this.acc.dx += s.dx;
    this.acc.dy += s.dy;
    if (s.steps !== 0) {
      const r = this.canvas.getBoundingClientRect();
      this.acc.steps += s.steps;
      // Each finger's move arrives on its own: a parallel drag zooms in and
      // out by the same amount; what is left is rounding, not a zoom.
      if (Math.abs(this.acc.steps) < 1e-6) this.acc.steps = 0;
      this.acc.zx = s.mx - r.left;
      this.acc.zy = s.my - r.top;
    }
    this.scheduleFlush();
  };

  private readonly onTouchEnd = (e: PointerEvent): void => {
    if (!this.touches.delete(e.pointerId)) return;
    this.hover.release();
    if (this.touches.size === 0) delete this.canvas.dataset.dragging;
  };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.hover.cancel();
    if (!this.client || e.deltaY === 0) return;
    // A notch is 100 px, 3 lines or 1/3 page. A trackpad pinch (Ctrl, small
    // pixel deltas, about -100·ln(scale) in total) uses 40 px so that
    // spreading the fingers to 2× zooms about 1.33×; a Ctrl+mouse notch
    // (≥ 50 px) keeps the plain unit.
    const unit =
      e.deltaMode === 1 ? 3 : e.deltaMode === 2 ? 1 / 3 : e.ctrlKey && Math.abs(e.deltaY) < 50 ? 40 : 100;
    const { x, y } = this.local(e);
    this.acc.steps += -e.deltaY / unit;
    this.acc.zx = x;
    this.acc.zy = y;
    this.scheduleFlush();
  };

  private scheduleFlush(): void {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    this.ctx.requestFrame(() => {
      this.flushScheduled = false;
      const a = this.acc;
      const c = this.client;
      if (c) {
        if (a.dx !== 0 || a.dy !== 0) c.pan(a.dx, a.dy);
        if (a.steps !== 0) c.zoom(a.steps, a.zx, a.zy);
      }
      this.acc = { dx: 0, dy: 0, steps: 0, zx: 0, zy: 0 };
    });
  }
}
