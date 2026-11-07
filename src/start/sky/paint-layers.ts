// Paints the smooth sky's layers (look.ts `SkyLayer`) on a canvas: the
// same gradients the engine shows as CSS. The bodies layer uses it to put
// a copy of the sky under the sun's glow and the moon's halo, so they can
// be added to the sky ("lighter") exactly as the approved look does.

import { rgba } from './color';
import type { SkyLayer } from './look';

/**
 * Fills the rect (x, y, w, h) of `ctx` (in the layers' CSS px, under the
 * context's current transform) with `layers`, bottom first.
 */
export function paintLayers(ctx: CanvasRenderingContext2D, layers: readonly SkyLayer[], x: number, y: number, w: number, h: number): void {
  for (const l of layers) {
    if (l.kind === 'linear') {
      const g = ctx.createLinearGradient(0, l.y0, 0, l.y1);
      for (const s of l.stops) g.addColorStop(s.at, rgba(s.c, s.a));
      ctx.fillStyle = g;
      const bottom = l.band ? Math.min(y + h, l.y1) : y + h;
      if (bottom > y) ctx.fillRect(x, y, w, bottom - y);
      continue;
    }
    ctx.save();
    ctx.translate(l.cx, l.cy);
    ctx.scale(1, l.ry / l.rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, l.rx);
    for (const s of l.stops) g.addColorStop(s.at, rgba(s.c, s.a));
    ctx.fillStyle = g;
    const k = l.rx / l.ry;
    ctx.fillRect(x - l.cx, (y - l.cy) * k, w, h * k);
    ctx.restore();
  }
}
