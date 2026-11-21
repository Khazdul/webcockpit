// @vitest-environment happy-dom
// Stage 69 (ADR 0159): the balloons in the DOM: the two layers and where
// they sit (round 2: never over a pane), a kill joining the readable sign
// (and the round-2 notices never joining), the cap, frames only while a
// balloon is up, and the skins (SVG goblin, raster layers).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_BALLOONS, startBalloons } from '../../src/weather/balloons/balloons';
import { MOODS, SAMPLE_KILLS, SAMPLE_MOMENTS, signFor } from '../../src/weather/balloons/feed';
import type { LaneGeom } from '../../src/weather/balloons/flight';
import { passenger as dwarf } from '../../src/weather/balloons/passengers/dwarf';
import { PASSENGER_IDS, loadPassenger } from '../../src/weather/balloons/passenger';
import { type RigCtx, createRig } from '../../src/weather/balloons/rig';
import { RIG_SIZE, type SkinFactory } from '../../src/weather/balloons/skin';

/** The rig with the dwarf, in its still form (no life: happy-dom has no Web Animations), as a fixed skin. */
const ctx: RigCtx = { doc: document, reduced: true, skyMode: () => 'night', pace: () => 1 };
const dwarfSkin: SkinFactory = (_, init) => createRig(ctx, dwarf.spec(ctx)).make(init.sign);

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
  const input = document.createElement('div');
  input.className = 'wc-input-slot';
  const pane = document.createElement('div');
  pane.className = 'wc-pane';
  root.append(back, game, input, pane);
  document.body.append(root);
  return root;
}

describe('balloons', () => {
  it('the sky layer right after the back canvas (under the text), the front layer right after the game pane (over the text, under the input row and the panes); both gone on destroy', () => {
    const root = cockpit();
    const b = startBalloons({ root, geometry: () => GEOM, reducedMotion: () => false, skin: dwarfSkin });
    const kids = [...root.children].map((e) => e.className);
    expect(kids).toEqual(['wc-weather-layer wc-weather-back', 'wc-balloons wc-balloons-sky', 'wc-game', 'wc-balloons wc-balloons-front', 'wc-input-slot', 'wc-pane']);
    b.destroy();
    expect(root.querySelectorAll('.wc-balloons')).toHaveLength(0);
  });

  it('a kill rises in the front layer, joins while readable, then moves to the sky and is gone; no frames after', () => {
    const root = cockpit();
    const b = startBalloons({ root, geometry: () => GEOM, reducedMotion: () => false, skin: dwarfSkin, random: () => 0.3 });
    const front = root.querySelector('.wc-balloons-front')!, sky = root.querySelector('.wc-balloons-sky')!;
    b.show(SAMPLE_KILLS.good[0]!);
    expect(front.children).toHaveLength(1);
    run(2);
    b.show(SAMPLE_KILLS.superb[0]!);
    expect(b.list()).toEqual([{ phase: 'arrive', front: true, kind: 'kill', count: 2, face: 'superb', passenger: '', rest: false, reduced: false }]);
    const sign = front.querySelector('.rig-sign')!;
    expect(sign.querySelector('.rig-title')!.textContent).toBe('2 kills');
    expect(sign.querySelector('.rig-word')!.textContent).toBe('Superb');
    run(8);
    expect(b.list()[0]!.phase).toBe('read');
    run(7);
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
    const b = startBalloons({ root, geometry: () => GEOM, reducedMotion: () => false, skin: dwarfSkin });
    b.show({ name: '<img src=x onerror=alert(1)>', xp: 10, face: 'poor' });
    expect(root.querySelector('.rig-title img')).toBeNull();
    expect(root.querySelector('.rig-title')!.textContent).toBe('<img src=x onerror=alert(1)>');
    b.destroy();
  });

  it('round 2: a level up, a death and an achievement each rise alone, never joined with kills or each other; a kill joins the newest kill balloon', () => {
    const root = cockpit();
    const b = startBalloons({ root, geometry: () => GEOM, reducedMotion: () => false, skin: dwarfSkin });
    b.show(SAMPLE_KILLS.good[0]!);
    run(1);
    b.show(SAMPLE_MOMENTS.levelup);
    run(1);
    b.show(SAMPLE_KILLS.great[0]!);
    b.show(SAMPLE_MOMENTS.death);
    b.show(SAMPLE_MOMENTS.achievement);
    b.show(SAMPLE_MOMENTS.achievement);
    // the second kill joins the kill balloon, though a level up rose after it
    expect(b.list().map((f) => [f.kind, f.count, f.face])).toEqual([
      ['kill', 2, 'great'],
      ['levelup', 1, 'levelup'],
      ['death', 1, 'death'],
      ['achievement', 1, 'achievement'],
      ['achievement', 1, 'achievement'],
    ]);
    const signs = [...root.querySelectorAll('.rig-sign')];
    expect(signs[1]!.querySelector('.rig-fig')!.textContent).toBe('Level 23!');
    // an empty line is left empty (the rig hides it with :empty)
    expect(signs[1]!.querySelector('.rig-title')!.textContent).toBe('');
    expect(signs[2]!.querySelector('.rig-fig')!.textContent).toBe('You died');
    expect(signs[3]!.querySelector('.rig-tag')!.textContent).toBe('Achievement');
    expect((signs[3] as HTMLElement).dataset.kind).toBe('achievement');
    b.destroy();
  });

  it(`at most ${MAX_BALLOONS} up: the oldest fades out where it flies, beyond it goes at once`, () => {
    const root = cockpit();
    const b = startBalloons({ root, geometry: () => GEOM, reducedMotion: () => false, skin: dwarfSkin });
    for (let i = 0; i < MAX_BALLOONS + 3; i++) {
      b.show(SAMPLE_MOMENTS.levelup);
      run(0.5);
    }
    expect(b.list().length).toBeLessThanOrEqual(MAX_BALLOONS + 1);
    run(2);
    expect(b.list().length).toBeLessThanOrEqual(MAX_BALLOONS);
    b.destroy();
  });

  it('no frames while the page is hidden', () => {
    const root = cockpit();
    const b = startBalloons({ root, geometry: () => GEOM, reducedMotion: () => false, skin: dwarfSkin });
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

describe('the rig (stage 75)', () => {
  it('each passenger: the rig\'s size, one envelope per mood, the sign filled with text, its styles gone with the rig', async () => {
    for (const id of PASSENGER_IDS) {
      const { passenger } = await loadPassenger(id);
      const spec = passenger.spec(ctx), css = spec.id;
      const styles = () => document.querySelectorAll(`style[data-wc-rig="${css}"]`).length;
      const before = styles();
      const rig = createRig(ctx, spec);
      const sign = signFor([SAMPLE_KILLS.good[0]!]);
      const s = rig.make(sign);
      expect(s.size).toEqual(RIG_SIZE);
      expect(s.el.querySelector(`.rig.${css}-v`), id).not.toBeNull();
      expect(s.el.querySelector('.rig-title')!.textContent).toBe('An orc scout');
      const envs = new Set(MOODS.map((m) => {
        s.setSign({ ...sign, mood: m }, false);
        return s.el.querySelector('.rig-envl')!.innerHTML.replace(/rgv\d+-\d+/g, '').replace(/\d+(?=["')])/g, '');
      }));
      expect(envs.size, id).toBe(MOODS.length);
      // one style per id, however many rigs use it; gone with the last
      expect(styles()).toBe(1);
      s.destroy();
      rig.destroy();
      expect(styles()).toBe(before);
    }
  });
});
