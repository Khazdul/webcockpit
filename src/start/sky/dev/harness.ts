// The start page sky harness (dev only, see harness.html).

import { startGameMinutes } from '../../clock';
import { type StartSkyHandle, mountStartSky } from '../index';
import * as look from '../look';
import { pageSkyParams } from '../params';

declare global {
  interface Window {
    __sky?: StartSkyHandle;
    __skyLook?: typeof look;
    /** How long mountStartSky took (ms). */
    __skyMountMs?: number;
  }
}

const q = new URLSearchParams(location.search);
const host = document.getElementById('host')!;
window.__skyLook = look;

if (q.has('firstpaint')) {
  const l = look.skyLookAt(startGameMinutes(), { view: { w: innerWidth, h: innerHeight }, weather: pageSkyParams().weather ?? null });
  host.style.background = look.skyCss(l).all;
  host.dataset['skyReady'] = '1';
} else {
  const t0 = performance.now();
  window.__sky = mountStartSky(host);
  window.__skyMountMs = performance.now() - t0;
}

if (q.has('text')) {
  const el = document.createElement('div');
  el.id = 'quote';
  el.textContent = 'Not all those who wander are lost.';
  document.body.append(el);
  const set = (l: look.SkyLook): void => {
    const ink = el.classList.contains('ink');
    if (!ink && l.textBackLuminance > 0.54) el.classList.add('ink');
    else if (ink && l.textBackLuminance < 0.46) el.classList.remove('ink');
    el.dataset['luma'] = l.textBackLuminance.toFixed(3);
  };
  if (window.__sky) {
    set(window.__sky.look());
    window.__sky.onLook(set);
  }
}
