// The start page sky's look now, without the engine (ADR 0124, ADR 0125):
// what the first paint paints (src/boot/first-paint.ts) and what the start
// surface shows until the engine (a chunk of its own) has mounted. Small and
// synchronous: the look model, the start clock and the page's `sky*`
// parameters, nothing else.

import { startGameMinutes } from './clock';
import { type SkyLook, type SkyView, skyLookAt } from './sky/look';
import { pageSkyParams } from './sky/params';

/** The sky's look for a view of `view` CSS px at game minute `g` (default: now, by the start clock). */
export function startSkyLook(view: SkyView, g: number = startGameMinutes()): SkyLook {
  return skyLookAt(g, { view: { w: Math.max(1, view.w), h: Math.max(1, view.h) }, weather: pageSkyParams().weather ?? null });
}
