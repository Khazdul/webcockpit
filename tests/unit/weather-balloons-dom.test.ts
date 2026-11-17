// @vitest-environment happy-dom
// Stage 69 (ADR 0159): the balloons in the DOM: the two layers and where
// they sit, a kill joining the readable sign, the cap, frames only while a
// balloon is up, and the skins (SVG goblin, raster layers).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_BALLOONS, startBalloons } from '../../src/weather/balloons/balloons';
import { SAMPLE_KILLS } from '../../src/weather/balloons/feed';
import type { LaneGeom } from '../../src/weather/balloons/flight';
import { goblinSkin } from '../../src/weather/balloons/goblin';
import { imageSkin, rasterSkinOf } from '../../src/weather/balloons/image-skin';

const GEOM: LaneGeom = { W: 1920, H: 1080, out: { x: 0, y: 0, w: 1410, h: 1045 }, cell: { w: 9, h: 18 }, protect: { fadeTop: 970 } };

let frames: Array<(t: number) => void> = [];
let now = 0;
beforeEach(() => {
  frames = [];
  now = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((fn) => {
    frames.push(fn);
    return frames.length;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  vi.spyOn(window.performance, 'now').mockImplementation(() => now);
});
afterEach(() => vi.restoreAllMocks());

/** Runs frames for `s` seconds at 50 ms. */
function run(s: number): void {
  for (let i = 0; i < s * 20; i++) {
    const q = frames.splice(0);
    if (!q.length) return;
    now += 50;
    for (const f of q) f(now);
  }
}

function cockpit(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'wc-cockpit';
  const back = document.createElement('canvas');
  back.className = 'wc-weather-layer wc-weather-back';
  const game = document.createElement('div');
  game.className = 'wc-game';
  root.append(back, game);
  document.body.append(root);
  return root;
}

describe('balloons', () => {
  it('the sky layer right after the back canvas (under the text), the front layer last; both gone on destroy', () => {
    const root = cockpit();
    const b = startBalloons({ root, geometry: () => GEOM, reducedMotion: () => false, skin: goblinSkin });
    const kids = [...root.children].map((e) => e.className);
    expect(kids).toEqual(['wc-weather-layer wc-weather-back', 'wc-balloons wc-balloons-sky', 'wc-game', 'wc-balloons wc-balloons-front']);
    b.destroy();
    expect(root.querySelectorAll('.wc-balloons')).toHaveLength(0);
  });

  it('a kill rises in the front layer, joins while readable, then moves to the sky and is gone; no frames after', () => {
    const root = cockpit();
    const b = startBalloons({ root, geometry: () => GEOM, reducedMotion: () => false, skin: goblinSkin, random: () => 0.3 });
    const front = root.querySelector('.wc-balloons-front')!, sky = root.querySelector('.wc-balloons-sky')!;
    b.show(SAMPLE_KILLS.good[0]!);
    expect(front.children).toHaveLength(1);
    run(2);
    b.show(SAMPLE_KILLS.superb[0]!);
    expect(b.list()).toEqual([{ phase: 'read', front: true, count: 2, face: 'superb' }]);
    const sign = front.querySelector('.wc-bsign')!;
    expect(sign.querySelector('.wc-bsign-who')!.textContent).toBe('2 kills');
    expect(sign.querySelector('.wc-bsign-rate')!.textContent).toBe('Superb');
    run(9);
    expect(sky.children).toHaveLength(1);
    expect(front.children).toHaveLength(0);
    expect(b.list()[0]!.front).toBe(false);
    run(90);
    expect(b.list()).toEqual([]);
    expect(sky.children).toHaveLength(0);
    expect(frames).toHaveLength(0);
    b.destroy();
  });

  it('names from the game are text, never markup', () => {
    const root = cockpit();
    const b = startBalloons({ root, geometry: () => GEOM, reducedMotion: () => false, skin: goblinSkin });
    b.show({ name: '<img src=x onerror=alert(1)>', xp: 10, face: 'poor' });
    expect(root.querySelector('.wc-bsign-who img')).toBeNull();
    expect(root.querySelector('.wc-bsign-who')!.textContent).toBe('<img src=x onerror=alert(1)>');
    b.destroy();
  });

  it(`at most ${MAX_BALLOONS} up: the oldest hurries away, beyond it goes at once`, () => {
    const root = cockpit();
    const b = startBalloons({ root, geometry: () => GEOM, reducedMotion: () => false, skin: goblinSkin });
    for (let i = 0; i < MAX_BALLOONS + 3; i++) {
      b.show(SAMPLE_KILLS.meh[0]!);
      run(8); // past the readable phase: the next kill is a new balloon
    }
    expect(b.list().length).toBeLessThanOrEqual(MAX_BALLOONS + 1);
    b.destroy();
  });

  it('no frames while the page is hidden', () => {
    const root = cockpit();
    const b = startBalloons({ root, geometry: () => GEOM, reducedMotion: () => false, skin: goblinSkin });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    frames = [];
    document.dispatchEvent(new Event('visibilitychange'));
    b.show(SAMPLE_KILLS.great[0]!);
    expect(frames).toHaveLength(0);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(frames).toHaveLength(1);
    b.destroy();
  });
});

describe('skins', () => {
  it('the goblin: one SVG per mood, redrawn only when the mood changes', () => {
    const s = goblinSkin(document);
    s.setMood('poor');
    const svg = s.el.querySelector('svg')!;
    const first = svg.innerHTML;
    s.setMood('poor');
    expect(svg.innerHTML).toBe(first);
    s.setMood('pvp');
    expect(svg.innerHTML).not.toBe(first);
    expect(s.size).toEqual({ w: 180, h: 330 });
  });

  it('a raster skin: balloon, the mood\'s passenger, the basket front over it, the HTML sign below; moods swap in place', () => {
    const dir = '/public/balloons/goblin/';
    const r = rasterSkinOf([`${dir}balloon.webp`, `${dir}basket-front.webp`, `${dir}passenger-calibrating.webp`, `${dir}passenger-good.webp`, `${dir}passenger-good-blink.webp`], 'goblin')!;
    const s = imageSkin(r)(document);
    s.setMood('good');
    const imgs = () => [...s.el.querySelectorAll('img')].filter((i) => !i.hidden).map((i) => i.getAttribute('src'));
    expect(imgs()).toEqual(['/balloons/goblin/balloon.webp', '/balloons/goblin/passenger-good.webp', '/balloons/goblin/basket-front.webp']);
    s.setMood('poor');
    expect(imgs()).toEqual(['/balloons/goblin/balloon.webp', '/balloons/goblin/passenger-calibrating.webp', '/balloons/goblin/basket-front.webp']);
    // the passenger at 50 % from (256, 900) on the 1024-wide canvas, shown 150 px wide
    const p = s.el.querySelectorAll('img')[1]!;
    expect(p.style.left).toBe('37.5px');
    expect(p.style.width).toBe('75px');
    expect(s.el.querySelector('.wc-bsign')).not.toBeNull();
    s.destroy();
  });
});
