// Map pane (ADR 0020): a canvas the map worker draws into. The pane only
// forwards sizes and pointer input; the worker (src/map/worker/) owns
// the map, the view and all drawing.
//
// - The map client and worker are imported the first time the pane is
//   shown (never at app start, never while the pane is off).
// - Left-drag pans (pointer capture), the wheel zooms around the cursor,
//   Ctrl+wheel changes the layer. Input is coalesced to one message per
//   kind per frame. The title row grip still moves the pane (it lies over
//   the frame row, above the content). The cockpit's mouseup handler
//   returns the focus to the input line; the canvas never takes it.
// - Without OffscreenCanvas / module workers / WebGL2 the pane shows a
//   notice instead.
// - `content.dataset.mapState`: `idle` → `starting` → `ready` → `loaded`
//   (or `unsupported` / `error`); `mapRooms` is set on `loaded`;
//   `mapLocated` (`1`/`0`), `mapRoom` (room index or empty) and `mapHow`
//   follow the worker's `status` (browser tests, debugging); `mapLoad`
//   (JSON: ms and the worker's load stages) on `loaded` and `mapDrawnMs`
//   (load start → first frame with every tile and the font) on `drawn`
//   (bench/browser-bench.ts).
// - Game events (gmcp, cmd.sent, text.line, conn.state) are forwarded only
//   while the pane is shown and its map is loaded (MapEventForwarder:
//   one array push per event, one postMessage per microtask). Turned on
//   mid-session, the worker has no position until the next Room.Info.
// - Learned server ids persist (worker-side IndexedDB) only for the app's
//   own map; a pane with a `PaneContext.map` host (log player, HTML
//   replay) keeps them in memory.
// - Script map marks (ADR 0057): once its map is loaded the pane attaches a
//   port to `PaneContext.mapMarks` (finds, marks and unmarks go to the
//   worker; the answers back to the hub) and detaches on dispose.
//   `mapMarks` (dataset) counts the live marks.

import type { MapClient, MapEventForwarder } from '../map/client';
import type { MapPaneHost, WorkerToMain } from '../map/protocol';
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
  return { source: () => ({ kind: 'url', url: `${base}arda.mm2`, name: 'arda.mm2' }), assets: { kind: 'base', url: base } };
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

const NOTICE_SUFFIX = '\nThe map needs WebGL2, OffscreenCanvas and module workers\n(current Chrome, Firefox or Safari 17+).';

export class MapPane extends PaneShell {
  private readonly canvas: HTMLCanvasElement;
  private readonly notice: HTMLDivElement;
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
  private acc = { dx: 0, dy: 0, steps: 0, zx: 0, zy: 0, dz: 0 };
  private flushScheduled = false;
  private dprQuery: MediaQueryList | null = null;
  /** Detaches the mark port (ADR 0057). */
  private unmarks: (() => void) | null = null;
  private readonly liveMarks = new Set<number>();

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
    this.content.append(this.canvas, this.notice);

    this.onResize(() => this.sync());
    this.own(ctx.cells.subscribe(() => this.sync()));
    // The current map changed (Options → Mapper): load the new one.
    const unsubMap = this.host.subscribe?.(() => void this.reload());
    if (unsubMap) this.own(unsubMap);

    const c = this.canvas;
    c.addEventListener('pointerdown', this.onPointerDown);
    c.addEventListener('pointermove', this.onPointerMove);
    c.addEventListener('pointerup', this.onPointerEnd);
    c.addEventListener('pointercancel', this.onPointerEnd);
    c.addEventListener('lostpointercapture', this.onPointerEnd);
    // The canvas never takes the focus from the input line.
    c.addEventListener('mousedown', (e) => e.preventDefault());
    c.addEventListener('wheel', this.onWheel, { passive: false });
    this.own(() => {
      c.removeEventListener('wheel', this.onWheel);
      this.watchDpr(false);
    });
  }

  override dispose(): void {
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
  }

  /** Forwarding follows "shown and loaded". */
  private syncForward(): void {
    this.forward(this.visible && this.loaded && this.client !== null);
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
        this.client?.visible(false);
        this.watchDpr(false);
        this.forward(false);
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
    try {
      const { MapClient, MapEventForwarder } = await import('../map/client');
      const { w, h } = this.cssSize();
      this.client = await MapClient.create({
        canvas: this.canvas,
        width: w,
        height: h,
        dpr: this.dpr(),
        assets: this.host.assets,
        onMessage: this.onWorker,
      });
      this.forwarder = new MapEventForwarder((events) => this.client?.events(events));
      if (!this.visible) this.client.visible(false);
      this.sync();
      if (this.persistIds) this.client.persistIds(true);
      const source = await this.host.source();
      if (source) this.client?.load(source);
    } catch (err) {
      this.fail('error', `The map could not start: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.starting = false;
    }
  }

  /** Loads the host's current map again (no-op before the worker runs). */
  private async reload(): Promise<void> {
    if (!this.client) return;
    try {
      const source = await this.host.source();
      if (source) this.client?.load(source);
    } catch (err) {
      this.fail('error', `Map not loaded: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Attaches the mark port once (ADR 0057). */
  private attachMarks(): void {
    const hub = this.ctx.mapMarks;
    if (!hub || this.unmarks) return;
    this.unmarks = hub.attach({
      find: (req, query) => this.client?.find(req, query),
      mark: (id, target, style, ms, focus) => this.client?.mark(id, target, style, ms, focus),
      unmark: (id) => this.client?.unmark(id),
      shown: () => this.visible && this.loaded && this.client !== null && this.cols > 0,
    });
  }

  private fail(state: 'unsupported' | 'error', text: string): void {
    this.failed = state === 'unsupported' || this.failed;
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
        this.content.dataset.mapState = 'loaded';
        this.content.dataset.mapRooms = String(m.info.rooms);
        this.content.dataset.mapLoad = JSON.stringify({ ms: m.info.ms, ...m.info.stages });
        this.notice.hidden = true;
        this.loaded = true;
        this.syncForward();
        this.attachMarks();
        return;
      case 'found':
        this.ctx.mapMarks?.found(m.req, m.rooms, m.total);
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
        const d = this.content.dataset;
        d.mapLocated = m.located ? '1' : '0';
        d.mapRoom = m.room === null ? '' : String(m.room);
        d.mapHow = m.how ?? '';
        return;
      }
      case 'drawn':
        this.content.dataset.mapDrawnMs = String(m.ms);
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
    if (e.button !== 0 || !this.client) return;
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    this.canvas.dataset.dragging = '';
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events have no active pointer */
    }
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
  };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (!this.client || e.deltaY === 0) return;
    if (e.ctrlKey) {
      // MMapper: wheel away from the user (deltaY < 0) goes a layer down.
      this.acc.dz += e.deltaY < 0 ? -1 : 1;
    } else {
      const unit = e.deltaMode === 1 ? 3 : e.deltaMode === 2 ? 1 / 3 : 100;
      const { x, y } = this.local(e);
      this.acc.steps += -e.deltaY / unit;
      this.acc.zx = x;
      this.acc.zy = y;
    }
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
        if (a.dz !== 0) c.layer(a.dz);
      }
      this.acc = { dx: 0, dy: 0, steps: 0, zx: 0, zy: 0, dz: 0 };
    });
  }
}
