// The start page sky engine (stage 41, ADR 0124).
//
// One host element, five layers, bottom first:
//
//   back    div, CSS gradients: base sky and the horizon glow  (look.ts skyCss)
//   bodies  canvas, device px: stars, shooting stars, sun, moon (bodies.ts)
//   clouds  canvas, ~half CSS px, upscaled by CSS              (clouds.ts)
//   air     div, CSS gradients: afterglow, twilight belt, haze, veil,
//           the plain surface below the horizon, fog, vignette  (look.ts skyCss)
//   front   canvas, device px: rain, snow, lightning            (precip.ts)
//   (grain  a static noise texture, high quality only)
//
// The smooth gradients are CSS so the first paint (ADR 0083) can paint
// the very same pixels from `skyCss` before this module loads, and so the
// browser rasterizes them off the main thread; they are rewritten twice a
// second (the sky changes over game minutes = real seconds), and with them
// the sun's and moon's glow sprites and the clouds' lit copies. Per frame
// the canvases only blit and fill small things, and at most ~30 Hz except
// rain and snow: the stars while they twinkle, else the bodies at ~10 Hz;
// the clouds in the frames between (staggered). The frame loop itself runs
// at the display's rate, so the page around the sky stays at 60 fps.
//
// Quality (high, medium, low) is chosen by measured frame times and only
// ever steps down: device pixel ratio, cloud buffer size, the share of
// stars and particles, a 30 fps cap and the grain. Reduced motion (or
// `?skyMotion=reduce`) gives a still sky repainted every two seconds;
// `?skyFreeze` one still frame. Nothing runs while paused or hidden.

import { startEpoch, startGameMinutes } from '../clock';
import { Bodies, type Parallax, glowSprite } from './bodies';
import { CLOUD_BAND, Clouds } from './clouds';
import { type SkyLook, type SkyScene, skyCss, skySceneAt } from './look';
import { type SkyParams, type SkyQuality, pageSkyParams } from './params';
import { Precip } from './precip';
import { context2d } from './sprite';
import type { SkyWeatherState } from './weather';

export type { SkyLook } from './look';
export type { SkyQuality } from './params';

export interface StartSkyOptions {
  /** Game minutes now (default: the start page clock, with the page's `sky*` overrides). */
  now?: () => number;
  /** Pin the quality tier (default: `?skyQuality`, else chosen by measured frame times). */
  quality?: SkyQuality;
  /** Pin the weather (default: `?skyWeather`, else the director). */
  weather?: SkyWeatherState | null;
  /** Paint one still frame and stop (default: `?skyFreeze`). */
  freeze?: boolean;
  /** A still sky (default: prefers-reduced-motion, or `?skyMotion`). */
  reducedMotion?: boolean;
  /**
   * Fade the sun, moon, stars, clouds, rain and snow in over the CSS sky
   * on mount (default: true unless frozen or reduced motion). The CSS
   * layers equal what the first paint shows, so the hand-over is seamless.
   */
  fadeIn?: boolean;
  /** A frame-time readout in the corner (default: `?skyStats`). */
  stats?: boolean;
  /** URL parameters to read the defaults from (default: the page's). */
  params?: SkyParams;
}

/** Frame statistics over the last ~2 s of running (all ms). */
export interface StartSkyStats {
  quality: SkyQuality;
  mode: 'run' | 'still' | 'frozen';
  frames: number;
  /** Our own work per painted frame: median, 95th percentile, max. */
  workP50: number;
  workP95: number;
  workMax: number;
  /** requestAnimationFrame intervals: median and 95th percentile. */
  intervalP50: number;
  intervalP95: number;
}

export interface StartSkyHandle {
  /** The current look; also pushed to `onLook` listeners a few times a second at most, and on change. */
  look(): SkyLook;
  onLook(cb: (look: SkyLook) => void): () => void;
  /** Stops all animation (hidden page, start page hidden, game entered). */
  setPaused(paused: boolean): void;
  dispose(): void;
  /** Frame statistics (bench, harness, the `?skyStats` readout). */
  stats(): StartSkyStats;
  /** Paints at once (tests: after changing the clock behind `now`). */
  repaint(): void;
}

interface Tier {
  dpr: number;
  cloudQ: number;
  /** Least ms between repaints: the bodies while stars move, the clouds, rain and snow (0: every frame). */
  starMs: number;
  cloudMs: number;
  precipMs: number;
  starK: number;
  particleK: number;
  /** Minimum ms between frames (0: every vsync). */
  minFrame: number;
  grain: boolean;
}

// Canvases repaint at ~30 Hz at most except rain and snow: measured on Iris Xe (Chromium, 1728 × 1000
// @2, a real window), any canvas repainted on every frame cost ~6 % dropped frames; at 30 Hz none.
// Stars, clouds and the sun move a fraction of a pixel per frame, so 30 Hz looks the same.
const TIERS: Readonly<Record<SkyQuality, Tier>> = {
  high: { dpr: 1.5, cloudQ: 0.5, starMs: 32, cloudMs: 32, precipMs: 0, starK: 1, particleK: 1, minFrame: 0, grain: true },
  medium: { dpr: 1, cloudQ: 0.4, starMs: 32, cloudMs: 48, precipMs: 32, starK: 0.8, particleK: 0.8, minFrame: 0, grain: true },
  low: { dpr: 0.75, cloudQ: 0.3, starMs: 64, cloudMs: 64, precipMs: 32, starK: 0.5, particleK: 0.5, minFrame: 30, grain: false },
};
const NEXT_DOWN: Readonly<Record<SkyQuality, SkyQuality | null>> = { high: 'medium', medium: 'low', low: null };

/** CSS gradients are rewritten at most this often (ms), unless time runs fast. */
const CSS_EVERY = 500;
/** Looks are pushed at most this often (ms). */
const LOOK_EVERY = 250;
/** Stats window (frames). */
const WINDOW = 120;
/** Quality check: ms to wait after a start or change, then a window of at least this long and 30 frames. */
const WARMUP_MS = 700;
const CHECK_MS = 1500;
/** After a steady window, look again this much later (night, snow or a busy page may come). */
const RECHECK_MS = 10_000;

const LAYER = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;';

/**
 * The mockup's film grain (grey noise in overlay blend at 6 %), as white
 * and black specks in plain blend: as faint, but no blend mode, which
 * costs a backdrop read every composite on software compositors.
 */
let grainUrl: string | null = null;
function grain(): string {
  if (grainUrl) return grainUrl;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const id = x.createImageData(128, 128);
  let s = 0x9e37;
  for (let i = 0; i < id.data.length; i += 4) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    const v = s >>> 24;
    id.data[i] = id.data[i + 1] = id.data[i + 2] = v >= 128 ? 255 : 0;
    id.data[i + 3] = Math.round((Math.abs(v - 127.5) / 127.5) * 40);
  }
  x.putImageData(id, 0, 0);
  grainUrl = c.toDataURL();
  return grainUrl;
}

const pctile = (xs: number[], p: number): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
};

function prefersReducedMotion(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

/** Fills `host` (position: relative or absolute, sized by the caller) with the sky. */
export function mountStartSky(host: HTMLElement, opts: StartSkyOptions = {}): StartSkyHandle {
  const params = opts.params ?? pageSkyParams();
  const freeze = opts.freeze ?? !!params.freeze;
  const reduced = opts.reducedMotion ?? (params.motion ? params.motion === 'reduce' : prefersReducedMotion());
  const forcedWeather = opts.weather !== undefined ? opts.weather : (params.weather ?? null);
  const pinned = opts.quality ?? params.quality ?? null;
  const fast = (params.speed ?? 1) > 20;
  let epoch = startEpoch();
  let epochAt = performance.now();
  const now =
    opts.now ??
    ((): number => {
      // the anchor is re-read now and then (a game session may have synced the clock)
      if (performance.now() - epochAt > 5000) {
        epoch = startEpoch();
        epochAt = performance.now();
      }
      return startGameMinutes(Date.now(), epoch);
    });
  const mode: StartSkyStats['mode'] = freeze ? 'frozen' : reduced ? 'still' : 'run';
  const still = mode !== 'run';

  // ------------------------------------------------------------- DOM
  const doc = host.ownerDocument;
  const root = doc.createElement('div');
  root.className = 'wc-start-sky';
  root.style.cssText = `${LAYER}overflow:hidden;contain:strict;`;
  root.setAttribute('aria-hidden', 'true');
  const back = doc.createElement('div');
  back.style.cssText = LAYER;
  const bodiesC = doc.createElement('canvas');
  bodiesC.style.cssText = LAYER;
  const cloudC = doc.createElement('canvas');
  cloudC.style.cssText = `${LAYER}height:${CLOUD_BAND * 100}%;`;
  const air = doc.createElement('div');
  air.style.cssText = LAYER;
  const frontC = doc.createElement('canvas');
  frontC.style.cssText = `${LAYER}display:none;`;
  frontC.width = frontC.height = 1;
  const grainD = doc.createElement('div');
  grainD.style.cssText = `${LAYER}opacity:.06;display:none;`;
  root.append(back, bodiesC, cloudC, air, frontC, grainD);
  let statsD: HTMLDivElement | null = null;
  if (opts.stats ?? params.stats) {
    statsD = doc.createElement('div');
    statsD.style.cssText =
      'position:absolute;left:6px;top:6px;padding:3px 6px;font:11px/1.35 ui-monospace,monospace;white-space:pre;color:#cfe;background:rgba(0,0,0,.55);border-radius:3px;z-index:1;';
    root.append(statsD);
  }
  // Everything that can fail for want of canvas memory (iOS Safari hands
  // out null contexts then) is made before the root goes into the host.
  const bctx = context2d(bodiesC);
  const cctx = context2d(cloudC);
  const fctx = context2d(frontC);

  const dot = glowSprite(64);
  const bodies = new Bodies(1);
  const clouds = new Clouds(55);
  const precip = new Precip(dot, 7);

  // ------------------------------------------------------------- state
  let quality: SkyQuality = pinned ?? 'high';
  let tier = TIERS[quality];
  let W = 0;
  let H = 0;
  let dpr = 1;
  let scene: SkyScene = skySceneAt(now(), { view: { w: 1440, h: 900 }, weather: forcedWeather });
  let lastCss = { back: '', air: '' };
  let cssAt = -Infinity;
  let lookAt = -Infinity;
  let pushed: SkyLook | null = null;
  let frame = 0;
  let raf = 0;
  let stillTimer: ReturnType<typeof setInterval> | null = null;
  let paused = false;
  let disposed = false;
  let lastT = 0;
  let lastPaint = -Infinity;
  let bodiesAt = -Infinity;
  let cloudsAt = -Infinity;
  let precipAt = -Infinity;
  let precipDt = 0;
  let cloudsPainted = false;
  const t0 = performance.now();
  const work: number[] = [];
  const intervals: number[] = [];
  let measure = { from: performance.now() + WARMUP_MS, work: [] as number[], gaps: [] as number[] };
  const subs = new Set<(look: SkyLook) => void>();
  const par: Parallax = { x: 0, y: 0 };
  const mouse = { x: 0.5, y: 0.5, sx: 0.5, sy: 0.5 };
  const onPointer = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse' || W === 0) return;
    mouse.x = e.clientX / W;
    mouse.y = e.clientY / H;
  };

  function size(): void {
    const w = Math.max(1, host.clientWidth || innerWidth);
    const h = Math.max(1, host.clientHeight || innerHeight);
    const d = Math.max(0.5, Math.min(globalThis.devicePixelRatio || 1, tier.dpr));
    if (w === W && h === H && d === dpr && cloudC.width === Math.ceil(w * tier.cloudQ)) return;
    W = w;
    H = h;
    dpr = d;
    bodiesC.width = Math.round(W * dpr);
    bodiesC.height = Math.round(H * dpr);
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // the front canvas takes memory only while it is needed (frontSize)
    if (frontC.width > 1) frontSize();
    cloudC.width = Math.max(1, Math.ceil(W * tier.cloudQ));
    cloudC.height = Math.max(1, Math.ceil(H * CLOUD_BAND * tier.cloudQ));
    precip.layout(W, H);
    grainD.style.display = tier.grain ? '' : 'none';
    // the grain texture is made after the first frames, not during the mount
    if (tier.grain && !grainD.style.background) setTimeout(() => !disposed && (grainD.style.background = `url(${grain()})`), 300);
    cssAt = -Infinity;
    bodiesAt = -Infinity;
    cloudsAt = -Infinity;
  }

  function frontSize(): void {
    const fw = Math.round(W * dpr);
    const fh = Math.round(H * dpr);
    if (frontC.width === fw && frontC.height === fh) return;
    frontC.width = fw;
    frontC.height = fh;
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function setQuality(q: SkyQuality): void {
    quality = q;
    tier = TIERS[q];
    root.dataset['skyQuality'] = q;
    W = 0; // force a resize of the canvases
    size();
    measure = { from: performance.now() + WARMUP_MS, work: [], gaps: [] };
  }

  /** Paints one frame at real time `t` (s since mount), `dt` since the last. */
  function paint(t: number, dt: number): void {
    const g = now();
    scene = skySceneAt(g, { view: { w: W, h: H }, weather: forcedWeather });
    const ms = performance.now();
    const drift = reduced && !freeze ? g * 0.05 : g;
    // the smooth layers (and what is lit by them: the glow sprites, the clouds' tint)
    if (ms - cssAt >= (fast ? 0 : CSS_EVERY)) {
      cssAt = ms;
      const css = skyCss(scene);
      if (css.back !== lastCss.back) back.style.background = css.back;
      if (css.air !== lastCss.air) air.style.background = css.air;
      lastCss = css;
      bodies.refresh(scene);
      clouds.refresh(scene, drift, tier.cloudQ);
      root.dataset['skyWeather'] = scene.weather.state;
      root.dataset['skyPeriod'] = scene.period;
    }
    // parallax: eased towards the pointer, plus a slow idle drift
    if (!still) {
      const k = 1 - Math.exp(-dt * 3);
      mouse.sx += (mouse.x - mouse.sx) * k;
      mouse.sy += (mouse.y - mouse.sy) * k;
      par.x = (mouse.sx - 0.5) * 2 + Math.sin(t * 0.05) * 0.25;
      par.y = (mouse.sy - 0.5) * 2;
    }
    // bodies (~30 Hz while stars move, else ~10 Hz: the sun creeps 2 px a second) and clouds
    // (~30 Hz), staggered so one frame repaints one of them
    bodies.update(scene, dt, !still);
    const cloudy = clouds.visible(scene);
    const free = still || fast;
    let bodiesDue = free || ms - bodiesAt >= (bodies.busy(scene) ? tier.starMs : 95) - 4;
    let cloudsDue = cloudy && (free || ms - cloudsAt >= tier.cloudMs - 4 || precip.flash > 0.02);
    if (bodiesDue && cloudsDue && !free) {
      if (ms - bodiesAt > ms - cloudsAt) cloudsDue = ms - cloudsAt > tier.cloudMs * 2;
      else bodiesDue = ms - bodiesAt > tier.starMs * 2;
    }
    if (bodiesDue) {
      bodiesAt = ms;
      bodies.clear(bctx);
      bodies.draw(bctx, scene, still ? null : t, par, tier.starK);
    }
    // build and re-light a few cloud puffs within a small budget (all at once for a still sky)
    clouds.work(still ? Infinity : 2);
    if (cloudsDue) {
      cloudsAt = ms;
      clouds.draw(cctx, scene, tier.cloudQ, drift, precip.flash);
      const op = Clouds.opacity(scene).toFixed(3);
      if (cloudC.style.opacity !== op) cloudC.style.opacity = op;
      cloudsPainted = true;
    } else if (!cloudy && cloudsPainted) {
      cctx.setTransform(1, 0, 0, 1, 0, 0);
      cctx.clearRect(0, 0, cloudC.width, cloudC.height);
      cloudsPainted = false;
    }
    // rain, snow, lightning
    precipDt += dt;
    if ((precip.active(scene) || precip.dirty || (!still && scene.weather.storm > 0.5)) && (free || ms - precipAt >= tier.precipMs - 4)) {
      precipAt = ms;
      frontSize();
      precip.draw(fctx, scene, t, precipDt, par, still, tier.particleK);
      precipDt = 0;
      const show = precip.dirty ? '' : 'none';
      if (frontC.style.display !== show) frontC.style.display = show;
      if (!precip.dirty) frontC.width = frontC.height = 1;
    }
    // the look
    if (ms - lookAt >= LOOK_EVERY) {
      lookAt = ms;
      if (!pushed || changed(pushed, scene)) {
        pushed = scene;
        for (const s of subs) s(scene);
      }
    }
    root.dataset['skyReady'] = '1';
    frame++;
  }

  function tick(nowMs: number): void {
    raf = 0;
    if (paused || disposed || doc.hidden) return;
    raf = requestAnimationFrame(tick);
    const gap = nowMs - lastPaint;
    if (tier.minFrame && gap < tier.minFrame - 2) return;
    const t = (nowMs - t0) / 1000;
    const dt = Math.min(0.05, Math.max(0, t - lastT));
    lastT = t;
    const a = performance.now();
    paint(t, dt);
    const used = performance.now() - a;
    if (Number.isFinite(lastPaint)) {
      intervals.push(gap);
      if (intervals.length > WINDOW) intervals.shift();
    }
    lastPaint = nowMs;
    work.push(used);
    if (work.length > WINDOW) work.shift();
    adapt(used, gap, nowMs);
    if (statsD && frame % 30 === 0) statsD.textContent = statsText();
  }

  /** Steps the quality down when our frames are slow or the page drops frames. */
  function adapt(used: number, gap: number, nowMs: number): void {
    if (pinned || !NEXT_DOWN[quality] || nowMs < measure.from) return;
    measure.work.push(used);
    if (Number.isFinite(gap)) measure.gaps.push(gap);
    const n = measure.work.length;
    if (n < WINDOW && (n < 30 || nowMs - measure.from < CHECK_MS)) return;
    const slowWork = pctile(measure.work, 0.5) > 6 || pctile(measure.work, 0.9) > 10;
    // dropped frames: the median frame takes longer than ~45 fps allows (the low tier's cap is wanted)
    const slowGaps = pctile(measure.gaps, 0.5) > Math.max(22, tier.minFrame * 1.3);
    if (slowWork || slowGaps) setQuality(NEXT_DOWN[quality]!);
    else measure = { from: nowMs + RECHECK_MS, work: [], gaps: [] };
  }

  function statsText(): string {
    const s = stats();
    return `sky ${s.quality} ${s.mode}  ${W}×${H}@${dpr}\nwork p50 ${s.workP50.toFixed(2)} p95 ${s.workP95.toFixed(2)} max ${s.workMax.toFixed(1)} ms\nframe p50 ${s.intervalP50.toFixed(1)} p95 ${s.intervalP95.toFixed(1)} ms\n${scene.period} ${scene.weather.state} h ${scene.hour.toFixed(2)} m ${scene.month}`;
  }

  function stats(): StartSkyStats {
    return {
      quality,
      mode,
      frames: frame,
      workP50: pctile(work, 0.5),
      workP95: pctile(work, 0.95),
      workMax: work.length ? Math.max(...work) : 0,
      intervalP50: pctile(intervals, 0.5),
      intervalP95: pctile(intervals, 0.95),
    };
  }

  function paintStill(): void {
    if (paused || disposed || doc.hidden) return;
    const a = performance.now();
    paint((a - t0) / 1000, 0);
    work.push(performance.now() - a);
    if (work.length > WINDOW) work.shift();
    if (statsD) statsD.textContent = statsText();
  }

  function start(): void {
    if (paused || disposed || doc.hidden) return;
    if (mode === 'frozen') {
      paintStill();
      return;
    }
    if (mode === 'still') {
      paintStill();
      stillTimer ??= setInterval(paintStill, 2000);
      return;
    }
    if (!raf) {
      lastT = (performance.now() - t0) / 1000;
      lastPaint = -Infinity;
      measure = { from: performance.now() + WARMUP_MS, work: [], gaps: [] };
      raf = requestAnimationFrame(tick);
    }
  }

  function stop(): void {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (stillTimer) clearInterval(stillTimer);
    stillTimer = null;
  }

  const onVisibility = (): void => {
    if (doc.hidden) stop();
    else start();
  };
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  const onResize = (): void => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      size();
      if (mode !== 'run') paintStill();
    }, 120);
  };
  let ro: ResizeObserver | null = null;

  /** Undoes everything the mount did (dispose, or a mount that failed half-way). */
  function teardown(): void {
    disposed = true;
    stop();
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = null;
    ro?.disconnect();
    ro = null;
    removeEventListener('resize', onResize);
    removeEventListener('pointermove', onPointer);
    doc.removeEventListener('visibilitychange', onVisibility);
    subs.clear();
    root.remove();
  }

  // Into the host and live. A throw from here on (a canvas the browser
  // will not size, say) must not leave a root or a listener behind: the
  // start page catches it and tries again on its next show.
  try {
    host.appendChild(root);
    root.dataset['skyQuality'] = quality;
    root.dataset['skyMode'] = mode;
    size();
    // the gradients at once (before the first frame), so nothing flashes
    scene = skySceneAt(now(), { view: { w: W, h: H }, weather: forcedWeather });
    {
      const css = skyCss(scene);
      back.style.background = css.back;
      air.style.background = css.air;
      lastCss = css;
      cssAt = performance.now();
      bodies.refresh(scene);
      clouds.refresh(scene, reduced && !freeze ? scene.g * 0.05 : scene.g, tier.cloudQ);
    }
    if ((opts.fadeIn ?? !still) && typeof bodiesC.animate === 'function') {
      // to the element's own opacity (the clouds' and the grain's are below 1)
      for (const el of [bodiesC, cloudC, frontC, grainD]) el.animate([{ opacity: 0 }, {}], { duration: 900, easing: 'ease-out' });
    }
    if (!still) addEventListener('pointermove', onPointer, { passive: true });
    doc.addEventListener('visibilitychange', onVisibility);
    ro = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
    ro?.observe(host);
    addEventListener('resize', onResize);
    start();
  } catch (e) {
    teardown();
    throw e;
  }

  return {
    look: () => scene,
    onLook(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    setPaused(p) {
      if (p === paused) return;
      paused = p;
      if (p) stop();
      else start();
    },
    dispose() {
      if (!disposed) teardown();
    },
    stats,
    repaint() {
      if (disposed) return;
      const a = performance.now();
      paint((a - t0) / 1000, 0);
    },
  };
}

/** True when `b` differs from `a` enough to tell listeners. */
function changed(a: SkyLook, b: SkyLook): boolean {
  return (
    a.period !== b.period ||
    a.weather.state !== b.weather.state ||
    a.light.kind !== b.light.kind ||
    Math.abs(a.dayness - b.dayness) > 0.002 ||
    Math.abs(a.light.x - b.light.x) > 0.0005 ||
    Math.abs(a.light.y - b.light.y) > 0.0005 ||
    Math.abs(a.light.strength - b.light.strength) > 0.005 ||
    Math.abs(a.textBackLuminance - b.textBackLuminance) > 0.005 ||
    Math.abs(a.textBack.almanac - b.textBack.almanac) > 0.005 ||
    a.view.w !== b.view.w ||
    a.view.h !== b.view.h
  );
}
