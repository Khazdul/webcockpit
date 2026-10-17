// The weather engine inside the worker: owns the back and front
// OffscreenCanvases and one small canvas per floating pane,
// the director and the modules, and runs the frame loop (the prototype
// harness).
//
// Frame: clear the back and front canvases, run sky, weather, fog, body
// (each wrapped in save/restore), mask the prompt/input rows (not the far
// left any more: owner feedback 21), copy the back layer's pixels under each floating pane into that
// pane's own canvas, then paint the docked panes' own backgrounds
// underneath the back layer (the panes are transparent while weather is on,
// see weather.css).
//
// Layout changes: the canvases, the mask and the pane fills follow at once
// (a float that moved gets a frame at once, not at the content's rate);
// the modules' own rebuild (`resize`: sprites, star fields, pane edges) waits
// until the layout has been still for RESIZE_SETTLE_MS, so dragging a pane
// or a dock boundary does not rebuild them on every cell step.
//
// Idle: when no module has anything to show and every mix value is at rest,
// the canvases are left cleared and the loop drops to a 4 Hz tick that only
// runs the director; any message or a mix target wakes it.
//
// Rate (owner feedback 4, "Heat"): each module says how fast its content is
// (`Module.fps`: 30 while rain falls, 12 for a drifting sky or fog, 60 for a
// lightning strike); the loop runs at the fastest. A module slower than the
// loop, or with a `scale` below 1 (fog at half resolution), draws into its
// own cache canvases at its own rate, and the engine copies the caches onto
// the canvases in between. Without window focus the loop runs at FPS_SLOW.
// Content that does not move at all (a settled day sky, Module.fps
// FPS_STILL) lets the loop drop to FPS_STILL while no mix value moves; any
// message brings it back to FPS_SLOW at once.

import { Director, eventState } from '../director';
import { paneTintRects } from '../geometry';
import { themeInfo } from '../palette';
import type { FrameStats, Geometry, MainToWorker, WorkerToMain } from '../protocol';
import { bodyModule } from './body';
import { type Ctx, type Env, FPS_FAST, FPS_SLOW, FPS_STILL, type Module, ctx2d, fbm, mkCanvas, noise } from './env';
import { fogModule } from './fog';
import { skyModule } from './sky';
import { weatherModule } from './weather';

/** Frames per second cap (the screen may run at 120 Hz or more); modules ask for less (`Module.fps`). */
export const MAX_FPS = 60;
/** Longest step a frame advances the effects, s (a stall does not make rain jump). */
const DT_MAX = 0.25;
/** Tick interval while idle, ms. */
export const IDLE_MS = 250;
const N_TIMES = 600;
/** Pane-only layout changes rebuild the modules after this long without another, ms. */
export const RESIZE_SETTLE_MS = 250;

/**
 * A floating pane's own canvas (the pane's first child, main thread): the
 * back layer's pixels under the pane are copied into it. Its element's CSS
 * background (terminal background, the pane's tint in the frame box) is
 * opaque, so the game text under the pane never shows; it moves with the
 * pane in the same frame (owner feedback 13, 18).
 */
interface FloatLayer {
  pane: string;
  canvas: OffscreenCanvas;
  ctx: Ctx;
  /** The pane's box in device px of the back canvas (null: not in the geometry). */
  src: { x: number; y: number; w: number; h: number } | null;
  /** The bitmap holds something (cleared once when there is nothing to copy). */
  dirty: boolean;
}

export interface EngineHost {
  post(m: WorkerToMain): void;
  /** requestAnimationFrame when the worker has it, else a timer. */
  requestFrame(cb: (t: number) => void): void;
  setTimeout(cb: () => void, ms: number): void;
  now(): number;
}

/** A module's drawing state: its rate and, when it draws apart from the loop, its cache. */
interface Slot {
  mod: Module;
  /** Its own rate, asked after each of its frames. */
  fps: number;
  /** When it last drew (ms; 0 = never). */
  last: number;
  /** Its last frame had anything to show. */
  busy: boolean;
  cache: Cache | null;
}

/** A cached layer: a canvas context that notes whether anything was drawn on it since `drawn` was reset. */
interface Layer {
  ctx: Ctx;
  drawn: boolean;
}
interface Cache {
  back: Layer;
  front: Layer;
  scale: number;
  valid: boolean;
}

const DRAW_OPS = ['fillRect', 'strokeRect', 'fill', 'stroke', 'drawImage', 'fillText', 'strokeText', 'putImageData'] as const;

/** Wraps the drawing calls of `ctx` so that the layer knows when it holds anything (an empty cache is not copied). */
function layer(ctx: Ctx): Layer {
  const l: Layer = { ctx, drawn: false };
  const o = ctx as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const k of DRAW_OPS) {
    const f = o[k]!;
    o[k] = function (this: unknown, ...a: unknown[]) {
      l.drawn = true;
      return f.apply(ctx, a);
    };
  }
  return l;
}

export class WeatherEngine {
  private env: Env | null = null;
  private back: OffscreenCanvas | null = null;
  private front: OffscreenCanvas | null = null;
  private readonly floats = new Map<number, FloatLayer>();
  private geom: Geometry | null = null;
  private resizeGen = 0;
  private director = new Director();
  private readonly modules: Module[];
  private readonly slots: Slot[];
  /** The loop's rate: the fastest module's, FPS_SLOW without window focus. */
  private rate = FPS_FAST;
  private focused = true;
  private visible = true;
  private looping = false;
  private idle = false;
  private idleFrames = 0;
  private lastT = 0;
  private lastFrame = 0;
  private readySent = false;
  private paneBgs: { x: number; y: number; w: number; h: number; bg: string }[] = [];
  private mask: { fade: CanvasGradient }[] = [];
  private readonly times = new Float32Array(N_TIMES);
  private readonly modTimes = new Map<string, Float32Array>();
  private nTimes = 0;

  /** `modules`: the four effects in drawing order (tests pass their own). */
  constructor(
    private readonly host: EngineHost,
    modules?: Module[],
  ) {
    this.modules = modules ?? [skyModule(), weatherModule(), fogModule(), bodyModule()];
    this.slots = this.modules.map((mod) => ({ mod, fps: FPS_FAST, last: 0, busy: false, cache: null }));
  }

  handle(m: MainToWorker): void {
    switch (m.t) {
      case 'init': {
        this.back = m.back;
        this.front = m.front;
        this.director = new Director(m.state, m.cats);
        const back = ctx2d(m.back), front = ctx2d(m.front);
        this.env = {
          W: 0,
          H: 0,
          dpr: 1,
          back,
          front,
          panes: [],
          textPanes: [],
          out: { x: 0, y: 0, w: 0, h: 0 },
          protect: { solidTop: 0, fadeTop: 0, left: 0 },
          cell: { w: 8, h: 16, size: 14, font: '14px monospace' },
          raw: this.director.raw,
          settled: this.director.settled,
          mix: this.director.mix,
          cats: this.director.cats,
          theme: themeInfo(m.theme.bg),
          shared: { flash: 0, boltX: 0 },
          moonSpeed: m.moonSpeed,
          speed: this.director.speed,
          noise,
          fbm,
          now: 0,
        };
        this.applyGeometry(m.geom);
        for (const mod of this.modules) mod.init(this.env);
        for (const mod of this.modules) mod.resize(this.env);
        break;
      }
      case 'state': {
        const ch = m.instant ? this.director.jump(m.s) : this.director.set(m.s, !!m.settle);
        if (ch && this.env) this.emit('position', ch);
        break;
      }
      case 'event': {
        const s = eventState(m.name);
        if (s) this.director.set(s);
        this.emit(m.name, m.data);
        break;
      }
      case 'geom': {
        if (!this.env) break;
        const env = this.env;
        const sized = m.g.W !== env.W || m.g.H !== env.H || m.g.dpr !== env.dpr;
        const moved = this.applyGeometry(m.g);
        if (sized) {
          this.resizeGen++;
          for (const mod of this.modules) mod.resize(env);
        } else this.settleResize();
        // A moved or resized float shows the weather of its old place until the next frame: draw it now.
        if (moved) this.frameNow();
        break;
      }
      case 'float': {
        this.floats.set(m.key, { pane: m.pane, canvas: m.canvas, ctx: ctx2d(m.canvas), src: null, dirty: false });
        if (this.geom) this.placeFloats(this.geom);
        this.frameNow();
        break;
      }
      case 'floatGone':
        this.floats.delete(m.key);
        break;
      case 'theme': {
        if (!this.env) break;
        this.env.theme = themeInfo(m.theme.bg);
        for (const mod of this.modules) mod.init(this.env);
        for (const mod of this.modules) mod.resize(this.env);
        break;
      }
      case 'cats': {
        this.director.cats = { ...m.cats };
        if (this.env) this.env.cats = this.director.cats;
        break;
      }
      case 'moonSpeed':
        if (this.env) this.env.moonSpeed = m.speed;
        break;
      case 'speed':
        this.director.speed = m.speed;
        if (this.env) this.env.speed = m.speed;
        break;
      case 'visible':
        this.visible = m.on;
        break;
      case 'focus':
        this.focused = m.on;
        break;
      case 'stats':
        this.host.post({ t: 'stats', stats: this.stats() });
        return;
    }
    this.wake();
  }

  private emit(name: Parameters<NonNullable<Module['onEvent']>>[1], data?: unknown): void {
    const env = this.env;
    if (!env) return;
    for (const mod of this.modules) {
      try {
        mod.onEvent?.(env, name, data);
      } catch (e) {
        this.report(mod.id, e);
      }
    }
  }

  /** Rebuilds the modules once the layout has been still for RESIZE_SETTLE_MS. */
  private settleResize(): void {
    const g = ++this.resizeGen;
    this.host.setTimeout(() => {
      if (g !== this.resizeGen || !this.env) return;
      for (const mod of this.modules) {
        try {
          mod.resize(this.env);
        } catch (e) {
          this.report(mod.id, e);
        }
      }
      this.wake();
    }, RESIZE_SETTLE_MS);
  }

  private readonly reported = new Set<string>();
  private report(where: string, e: unknown): void {
    if (this.reported.has(where)) return; // once per module, not every frame
    this.reported.add(where);
    this.host.post({ t: 'error', message: `${where}: ${e instanceof Error ? e.message : String(e)}` });
  }

  /** Draws the next frame at the next animation frame, whatever the rate (a float moved or appeared). */
  private frameNow(): void {
    this.lastFrame = -1e9;
    this.urgent = true;
  }

  /** Each float canvas's source rect from `g` (device px of the back canvas); true when one changed. */
  private placeFloats(g: Geometry): boolean {
    const d = g.dpr;
    let changed = false;
    for (const f of this.floats.values()) {
      const p = g.panes.find((q) => q.floating && q.id === f.pane);
      let src: FloatLayer['src'] = null;
      if (p) {
        const x = Math.round(p.box.x * d), y = Math.round(p.box.y * d);
        src = { x, y, w: Math.max(1, Math.round((p.box.x + p.box.w) * d) - x), h: Math.max(1, Math.round((p.box.y + p.box.h) * d) - y) };
      }
      const o = f.src;
      if (o && src && o.x === src.x && o.y === src.y && o.w === src.w && o.h === src.h) continue;
      changed = true;
      f.src = src;
      if (src && (f.canvas.width !== src.w || f.canvas.height !== src.h)) {
        f.canvas.width = src.w;
        f.canvas.height = src.h;
        f.dirty = false;
      }
    }
    return changed;
  }

  /** Applies a layout; returns true when a float canvas moved or changed size. */
  private applyGeometry(g: Geometry): boolean {
    const env = this.env!;
    if (g.W !== env.W || g.H !== env.H || g.dpr !== env.dpr) {
      for (const [cv, c] of [
        [this.back!, env.back],
        [this.front!, env.front],
      ] as [OffscreenCanvas, Ctx][]) {
        cv.width = Math.max(1, Math.round(g.W * g.dpr));
        cv.height = Math.max(1, Math.round(g.H * g.dpr));
        c.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
      }
      for (const sl of this.slots) sl.cache = null; // re-made at the new size on use
    }
    for (const sl of this.slots) if (sl.cache) sl.cache.valid = false;
    env.W = g.W;
    env.H = g.H;
    env.dpr = g.dpr;
    env.out = g.out;
    env.protect = g.protect;
    env.cell = g.cell;
    env.textPanes = g.panes.map((p) => ({ id: p.id, x: p.x, y: p.y, w: p.w, h: p.h, border: p.border, label: p.label, floating: p.floating, plate: p.plate }));
    // A pane without a frame is no glass in the scene: no shadow, no step in
    // the rays or beams, no rain stopping on it (owner item 53).
    env.panes = env.textPanes.filter((p) => p.border > 0);
    this.geom = g;
    const moved = this.placeFloats(g);
    // The fill of a docked pane with its own background: inside the rim less
    // the nameplate (framed; as layout.css, so rim and plate show no tint) or
    // the whole pane.
    this.paneBgs = g.panes.filter((p) => p.bg && !p.floating).flatMap((p) => paneTintRects(p).map((r) => ({ ...r, bg: p.bg! })));
    const p = g.protect;
    this.mask = [env.back, env.front].map((c) => {
      const fade = c.createLinearGradient(0, p.fadeTop, 0, p.solidTop);
      fade.addColorStop(0, 'rgba(0,0,0,0)');
      fade.addColorStop(1, 'rgba(0,0,0,1)');
      // No fade along the far left (`protect.left`) any more: it darkened the sky there (owner feedback 21).
      return { fade };
    });
    return moved;
  }

  private applyMask(c: Ctx, i: number): void {
    const env = this.env!, p = env.protect, m = this.mask[i]!;
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.globalAlpha = 1;
    c.fillStyle = m.fade;
    c.fillRect(0, p.fadeTop, env.W, p.solidTop - p.fadeTop);
    c.fillStyle = '#000';
    c.fillRect(0, p.solidTop, env.W, env.H - p.solidTop + 2);
    c.restore();
  }

  private paintPaneBgs(c: Ctx): void {
    if (!this.paneBgs.length) return;
    c.save();
    c.globalCompositeOperation = 'destination-over';
    c.globalAlpha = 1;
    for (const p of this.paneBgs) {
      c.fillStyle = p.bg;
      c.fillRect(p.x, p.y, p.w, p.h);
    }
    c.restore();
  }

  /**
   * The float canvases: per floating pane, the back layer's pixels under its
   * box (a copy, not a re-render), so the see-through pane shows the weather
   * as a docked one does; its element's CSS background is under the copy.
   * One image copy each (ADR 0091: no paths or clips on the GPU canvases).
   * Each pane is its own canvas in its own stacking layer, so an upper float
   * hides a lower one's text where they overlap (owner feedback 13).
   */
  private paintFloats(): void {
    const back = this.back;
    if (!back) return;
    for (const f of this.floats.values()) {
      const c = f.ctx, s = f.src;
      if (f.dirty) c.clearRect(0, 0, f.canvas.width, f.canvas.height);
      f.dirty = false;
      if (!s) continue;
      const x = Math.max(0, s.x), y = Math.max(0, s.y);
      const w = Math.min(back.width, s.x + s.w) - x, h = Math.min(back.height, s.y + s.h) - y;
      if (w <= 0 || h <= 0) continue;
      c.drawImage(back, x, y, w, h, x - s.x, y - s.y, w, h);
      f.dirty = true;
    }
  }

  /** Starts or speeds up the loop. */
  private wake(): void {
    if (!this.env || !this.visible) return;
    const wasIdle = this.idle;
    // A message while the loop crawls at FPS_STILL (an event, a new state): back to FPS_SLOW at once.
    const still = this.rate < FPS_SLOW;
    this.idle = false;
    this.idleFrames = 0;
    if (still) this.rate = FPS_SLOW;
    const urgent = this.urgent;
    this.urgent = false;
    if (this.looping && !wasIdle && !still && !urgent) return;
    if (!this.looping) this.lastT = this.host.now();
    this.looping = true;
    this.gen++; // a pending idle tick is dropped
    this.schedule(false);
  }

  private gen = 0;
  /** The next frame is drawn at once (`frameNow`). */
  private urgent = false;
  /** The next tick: after IDLE_MS (slow), or on an animation frame, waiting on a timer first when that frame is far off (fewer wake-ups at low rates). */
  private schedule(slow: boolean, wait = 0): void {
    const g = this.gen;
    if (slow) this.host.setTimeout(() => this.tick(g), IDLE_MS);
    else if (wait > 24) this.host.setTimeout(() => g === this.gen && this.host.requestFrame(() => this.tick(g)), wait - 12);
    else this.host.requestFrame(() => this.tick(g));
  }

  private readonly tick = (g: number): void => {
    if (g !== this.gen) return;
    if (!this.env || !this.visible) {
      this.looping = false;
      return;
    }
    const now = this.host.now();
    const wait = 1000 / this.rate - 2 - (now - this.lastFrame);
    if (!this.idle && wait > 0) {
      this.schedule(false, wait);
      return;
    }
    this.lastFrame = now;
    const dt = Math.min(DT_MAX, (now - this.lastT) / 1000 || 0);
    this.lastT = now;
    this.director.tick(now, dt);
    if (this.idle) {
      if (this.director.quiet()) {
        this.schedule(true);
        return;
      }
      this.idle = false;
      this.idleFrames = 0;
    }
    const busy = this.draw(now, dt);
    if (!this.readySent) {
      this.readySent = true;
      this.host.post({ t: 'ready' });
    }
    if (!busy && this.director.quiet()) this.idleFrames++;
    else this.idleFrames = 0;
    if (this.idleFrames > 2) {
      this.idle = true;
      this.schedule(true);
    } else this.schedule(false, 1000 / this.rate - 2 - (this.host.now() - now));
  };

  /** One frame. Returns true while anything is shown or animating. */
  draw(now: number, dt: number): boolean {
    const env = this.env!;
    env.now = now;
    const t0 = performance.now();
    const { back, front } = env;
    back.clearRect(0, 0, env.W, env.H);
    front.clearRect(0, 0, env.W, env.H);
    const loop = this.rate;
    let busy = false, rate = 0;
    for (const sl of this.slots) {
      const mod = sl.mod, m0 = performance.now();
      const scale = mod.scale ?? 1;
      // Still content draws straight too: drawing it is about one image copy, less than copying a full-size cache.
      const direct = scale === 1 && (sl.fps >= loop || sl.fps <= FPS_STILL);
      const due = direct || !sl.cache?.valid || now - sl.last >= 1000 / sl.fps - 2;
      if (due) {
        const mdt = sl.last ? Math.min(DT_MAX, (now - sl.last) / 1000) : dt;
        sl.last = now;
        if (direct) {
          if (sl.cache) sl.cache.valid = false;
          sl.busy = this.runModule(mod, back, front, mdt, now);
        } else {
          const c = this.cacheOf(sl, scale);
          for (const l of [c.back, c.front]) {
            if (l.drawn) l.ctx.clearRect(0, 0, env.W, env.H);
            l.drawn = false;
          }
          env.back = c.back.ctx;
          env.front = c.front.ctx;
          try {
            sl.busy = this.runModule(mod, c.back.ctx, c.front.ctx, mdt, now);
          } finally {
            env.back = back;
            env.front = front;
          }
          c.valid = true;
        }
        try {
          sl.fps = Math.max(1, Math.min(MAX_FPS, mod.fps?.(env) ?? FPS_FAST));
        } catch (e) {
          this.report(mod.id, e);
          sl.fps = FPS_FAST;
        }
      }
      if (!direct && sl.busy && sl.cache) {
        // the cache's content at its own resolution, stretched over the canvases
        const c = sl.cache;
        if (c.back.drawn) back.drawImage(c.back.ctx.canvas, 0, 0, env.W, env.H);
        if (c.front.drawn) front.drawImage(c.front.ctx.canvas, 0, 0, env.W, env.H);
      }
      if (sl.busy) {
        busy = true;
        rate = Math.max(rate, sl.fps);
      }
      let arr = this.modTimes.get(mod.id);
      if (!arr) this.modTimes.set(mod.id, (arr = new Float32Array(N_TIMES)));
      arr[this.nTimes % N_TIMES] = performance.now() - m0;
    }
    // Below FPS_SLOW only when every busy module says its content is still and no mix value is moving.
    const floor = rate < FPS_SLOW && this.director.resting() ? FPS_STILL : FPS_SLOW;
    this.rate = Math.min(this.focused ? MAX_FPS : FPS_SLOW, Math.max(floor, rate));
    this.applyMask(back, 0);
    this.applyMask(front, 1);
    this.paintFloats();
    this.paintPaneBgs(back);
    this.times[this.nTimes % N_TIMES] = performance.now() - t0;
    this.nTimes++;
    return busy;
  }

  private runModule(mod: Module, back: Ctx, front: Ctx, dt: number, now: number): boolean {
    let busy = false;
    back.save();
    front.save();
    try {
      busy = mod.frame(this.env!, dt, now);
    } catch (e) {
      this.report(mod.id, e);
    }
    back.restore();
    front.restore();
    return busy;
  }

  /** The slot's cache canvases (back, front) at `scale` × the canvases' ratio, made on first use and after a resize. */
  private cacheOf(sl: Slot, scale: number): Cache {
    if (sl.cache && sl.cache.scale === scale) return sl.cache;
    const env = this.env!, r = env.dpr * scale;
    const mk = (): Layer => {
      const c = ctx2d(mkCanvas(Math.round(env.W * r), Math.round(env.H * r)));
      c.setTransform(r, 0, 0, r, 0, 0);
      return layer(c);
    };
    sl.cache = { back: mk(), front: mk(), scale, valid: false };
    return sl.cache;
  }

  stats(): FrameStats {
    const n = Math.min(this.nTimes, N_TIMES);
    const a = Array.from(this.times.subarray(0, n)).sort((x, y) => x - y);
    const avg = n ? a.reduce((s, v) => s + v, 0) / n : 0;
    const mods: Record<string, number> = {};
    for (const [id, arr] of this.modTimes) {
      let s = 0;
      for (let i = 0; i < n; i++) s += arr[i]!;
      mods[id] = n ? s / n : 0;
    }
    return { n, avg, p95: n ? a[Math.floor(n * 0.95)]! : 0, max: n ? a[n - 1]! : 0, mods, idle: this.idle, frames: this.nTimes, dpr: this.env?.dpr ?? 1 };
  }
}
