// @vitest-environment happy-dom
// Stage 69 (ADR 0159): the balloons in the DOM: the two layers and where
// they sit (round 2: never over a pane), a kill joining the readable sign
// (and the round-2 notices never joining), the cap, frames only while a
// balloon is up, and the skins (SVG goblin, raster layers).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HURRY_FADE, KEYS_AHEAD, KEYS_MARGIN, MAX_BALLOONS, pinBox, startBalloons } from '../../src/weather/balloons/balloons';
import { MOODS, SAMPLE_KILLS, SAMPLE_MOMENTS, signFor } from '../../src/weather/balloons/feed';
import { KEYFRAME_DT, type LaneGeom, READ_EXTEND, flightAt, flightKeys, flightTotal, flightTransform } from '../../src/weather/balloons/flight';
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

describe.each([['on the compositor (stage 79)', true], ['written per frame', false]] as const)('balloons, the flight %s', (_, compositor) => {
  it('the sky layer right after the back canvas (under the text), the front layer right after the game pane (over the text, under the input row and the panes); both gone on destroy', () => {
    const root = cockpit();
    const b = startBalloons({ root, compositor, geometry: () => GEOM, reducedMotion: () => false, skin: dwarfSkin });
    const kids = [...root.children].map((e) => e.className);
    expect(kids).toEqual(['wc-weather-layer wc-weather-back', 'wc-balloons wc-balloons-sky', 'wc-game', 'wc-balloons wc-balloons-front', 'wc-input-slot', 'wc-pane']);
    b.destroy();
    expect(root.querySelectorAll('.wc-balloons')).toHaveLength(0);
  });

  it('a kill rises in the front layer, joins while readable, then moves to the sky and is gone; no frames after', () => {
    const root = cockpit();
    const b = startBalloons({ root, compositor, geometry: () => GEOM, reducedMotion: () => false, skin: dwarfSkin, random: () => 0.3 });
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
    const b = startBalloons({ root, compositor, geometry: () => GEOM, reducedMotion: () => false, skin: dwarfSkin });
    b.show({ name: '<img src=x onerror=alert(1)>', xp: 10, face: 'poor' });
    expect(root.querySelector('.rig-title img')).toBeNull();
    expect(root.querySelector('.rig-title')!.textContent).toBe('<img src=x onerror=alert(1)>');
    b.destroy();
  });

  it('round 2: a level up, a death and an achievement each rise alone, never joined with kills or each other; a kill joins the newest kill balloon', () => {
    const root = cockpit();
    const b = startBalloons({ root, compositor, geometry: () => GEOM, reducedMotion: () => false, skin: dwarfSkin });
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
    const b = startBalloons({ root, compositor, geometry: () => GEOM, reducedMotion: () => false, skin: dwarfSkin });
    for (let i = 0; i < MAX_BALLOONS + 3; i++) {
      b.show(SAMPLE_MOMENTS.levelup);
      run(0.5);
    }
    expect(b.list().length).toBeLessThanOrEqual(MAX_BALLOONS + 1);
    run(2);
    expect(b.list().length).toBeLessThanOrEqual(MAX_BALLOONS);
    b.destroy();
  });

  it('the layers are fixed on the cockpit\'s box (Firefox software WebRender, round 3): set at the start and again on a resize, also under a containing block that is not the viewport', () => {
    const vp = { left: 0, top: 0, width: 0, height: 0 };
    // the viewport as containing block: the layer lands where its left/top say
    expect(pinBox({ left: 10, top: 40, width: 800, height: 600 }, vp, { left: 0, top: 0 })).toEqual({ left: 10, top: 40, width: 800, height: 600 });
    // an ancestor with a transform at (100, 20) as containing block
    expect(pinBox({ left: 100, top: 60, width: 800, height: 600 }, { left: 110, top: 60, width: 800, height: 600 }, { left: 10, top: 40 })).toEqual({ left: 0, top: 40, width: 800, height: 600 });
    const root = cockpit();
    let box = { left: 0, top: 32, width: 1920, height: 1048 };
    const rect = (b: typeof box): DOMRect => ({ ...b, x: b.left, y: b.top, right: b.left + b.width, bottom: b.top + b.height, toJSON: () => b }) as DOMRect;
    vi.spyOn(root, 'getBoundingClientRect').mockImplementation(() => rect(box));
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const s = this.style;
      return rect({ left: parseFloat(s.left) || 0, top: parseFloat(s.top) || 0, width: parseFloat(s.width) || 0, height: parseFloat(s.height) || 0 });
    });
    const b = startBalloons({ root, compositor, geometry: () => GEOM, reducedMotion: () => false, skin: dwarfSkin });
    const boxes = (): string[] => [...root.querySelectorAll<HTMLElement>('.wc-balloons')].map((l) => [l.style.left, l.style.top, l.style.width, l.style.height].join(' '));
    expect(boxes()).toEqual(['0px 32px 1920px 1048px', '0px 32px 1920px 1048px']);
    box = { left: 0, top: 0, width: 1280, height: 720 };
    window.dispatchEvent(new Event('resize'));
    expect(boxes()).toEqual(['0px 0px 1280px 720px', '0px 0px 1280px 720px']);
    b.destroy();
    box = { left: 0, top: 0, width: 640, height: 480 };
    window.dispatchEvent(new Event('resize'));
  });

  it('no frames while the page is hidden', () => {
    const root = cockpit();
    const b = startBalloons({ root, compositor, geometry: () => GEOM, reducedMotion: () => false, skin: dwarfSkin });
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

describe('the flight on the compositor (stage 79, ADR 0168)', () => {
  const SHAPE = /^translate3d\(-?\d+\.\d{3}px, -?\d+\.\d{3}px, 0\) scale\(\d\.\d{5}\)$/;
  const hide = (hidden: boolean): void => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  const duration = (a: Animation): number => Number((a.effect as KeyframeEffect).getTiming().duration);
  /** The animation's keyframes by their time, s (to a microsecond). */
  const frames = (a: Animation): Map<number, string> => new Map((a.effect as KeyframeEffect).getKeyframes().map((k) => [Math.round(k.offset! * duration(a) * 1000) / 1e6, String(k.transform)]));
  const grid = (i: number): number => Math.round(i * KEYFRAME_DT * 1e6) / 1e6;

  it('one animation per balloon, its keyframes the plan; the frame loop writes no transform and reads its clock from it', () => {
    const root = cockpit();
    const b = startBalloons({ root, compositor: true, geometry: () => GEOM, reducedMotion: () => false, skin: dwarfSkin, random: () => 0.3 });
    b.show(SAMPLE_KILLS.good[0]!);
    const { el, anim, plan } = b.flights()[0]!;
    expect(el.getAnimations()).toEqual([anim]);
    expect(anim!.playState).toBe('running');
    expect(duration(anim!)).toBeCloseTo(flightTotal(plan) * 1000, 6);
    const kf = (anim!.effect as KeyframeEffect).getKeyframes();
    // the first seconds of the flight, and its end
    expect(kf.length).toBe(Math.ceil(KEYS_AHEAD / KEYFRAME_DT) + 2);
    expect(kf[0]!.offset).toBe(0);
    expect(kf.at(-1)!.offset).toBe(1);
    for (const k of kf) expect(String(k.transform)).toMatch(SHAPE);
    expect(frames(anim!).get(3)).toBe(flightTransform(plan.bw, flightAt(plan, 3)));
    expect(kf.at(-1)!.transform).toBe(flightTransform(plan.bw, flightKeys(plan).keys.at(-1)!));
    run(2);
    expect(Number(anim!.currentTime)).toBeCloseTo(2000, 6);
    expect(b.flights()[0]!.t).toBeCloseTo(2, 6);
    expect(el.style.transform).toBe('');
    expect(el.style.opacity).toBe('');
    b.destroy();
    expect(anim!.playState).toBe('idle');
  });

  it('a joined kill: the same animation with the longer plan\'s keyframes, its clock untouched', () => {
    const root = cockpit();
    const b = startBalloons({ root, compositor: true, geometry: () => GEOM, reducedMotion: () => false, skin: dwarfSkin, random: () => 0.3 });
    b.show(SAMPLE_KILLS.good[0]!);
    run(3);
    const { el, anim, plan } = b.flights()[0]!;
    const d0 = duration(anim!), t0 = anim!.currentTime, before = frames(anim!);
    b.show(SAMPLE_KILLS.superb[0]!);
    expect(b.list()[0]!.count).toBe(2);
    expect(b.flights()[0]!.anim).toBe(anim);
    expect(el.getAnimations()).toEqual([anim]);
    expect(anim!.currentTime).toBe(t0);
    expect(anim!.playState).toBe('running');
    expect(duration(anim!)).toBeCloseTo(d0 + READ_EXTEND * 1000, 6);
    // round now every keyframe says what it said, at its own time (the offsets are shares of a longer flight)
    const after = frames(anim!);
    for (let i = 36; i <= 60; i++) {
      expect(after.get(grid(i)), String(i)).toBeDefined();
      expect(after.get(grid(i)), String(i)).toBe(before.get(grid(i)));
    }
    // and the flight ends when the longer plan does
    run(flightTotal(plan) - 3 - 0.2);
    expect(b.list()).toHaveLength(1);
    run(0.5);
    expect(b.list()).toHaveLength(0);
    expect(anim!.playState).toBe('idle');
    b.destroy();
  });

  it('few keyframes at a time: the animation gets the next seconds in good time, the same animation all the flight', () => {
    const root = cockpit();
    const b = startBalloons({ root, compositor: true, geometry: () => GEOM, reducedMotion: () => false, skin: dwarfSkin, random: () => 0.3 });
    b.show(SAMPLE_KILLS.good[0]!);
    const { el, anim, plan } = b.flights()[0]!;
    const total = flightTotal(plan), whole = flightKeys(plan);
    let most = 0;
    for (let t = 0.5; t < total - KEYS_AHEAD - 1; t += 0.5) {
      run(0.5);
      const now = b.flights()[0]!.t, kf = frames(anim!);
      most = Math.max(most, kf.size);
      // the flight's own keyframes from now to at least KEYS_MARGIN ahead, each where the whole flight has it
      for (let i = Math.floor(now / KEYFRAME_DT); i * KEYFRAME_DT <= now + KEYS_MARGIN; i++) {
        expect(kf.get(grid(i)), `${now} ${i}`).toBe(flightTransform(plan.bw, whole.keys[i]!));
      }
    }
    expect(most).toBeLessThanOrEqual(Math.ceil((KEYS_AHEAD + 0.1) / KEYFRAME_DT) + 4);
    expect(el.getAnimations()).toEqual([anim]);
    expect(duration(anim!)).toBeCloseTo(total * 1000, 6);
    b.destroy();
  });

  it('a hidden page pauses the clock; shown again it goes on from where it was (a finished one is not played again)', () => {
    const root = cockpit();
    const b = startBalloons({ root, compositor: true, geometry: () => GEOM, reducedMotion: () => false, skin: dwarfSkin, random: () => 0.3 });
    b.show(SAMPLE_KILLS.good[0]!);
    run(2);
    const anim = b.flights()[0]!.anim!;
    hide(true);
    expect(anim.playState).toBe('paused');
    // a balloon launched while hidden waits too
    b.show(SAMPLE_MOMENTS.levelup);
    expect(b.flights()[1]!.anim!.playState).toBe('paused');
    now += 60_000;
    expect(b.flights().map((f) => +f.t.toFixed(3))).toEqual([2, 0]);
    hide(false);
    expect(b.flights().map((f) => f.anim!.playState)).toEqual(['running', 'running']);
    run(1);
    expect(b.flights().map((f) => +f.t.toFixed(3))).toEqual([3, 1]);
    b.destroy();
  });

  it('too many up: the oldest\'s animation gets the fade folded into its opacity and ends with it', () => {
    const root = cockpit();
    const b = startBalloons({ root, compositor: true, geometry: () => GEOM, reducedMotion: () => false, skin: dwarfSkin });
    for (let i = 0; i < MAX_BALLOONS; i++) {
      b.show(SAMPLE_MOMENTS.levelup);
      run(0.5);
    }
    const old = b.flights()[0]!, t = old.t;
    const before = frames(old.anim!);
    b.show(SAMPLE_MOMENTS.levelup);
    expect(b.flights()[0]!.anim).toBe(old.anim);
    expect(Number(old.anim!.currentTime) / 1000).toBeCloseTo(t, 6);
    expect(duration(old.anim!)).toBeCloseTo((t + HURRY_FADE) * 1000, 6);
    const kf = (old.anim!.effect as KeyframeEffect).getKeyframes();
    expect(Number(kf.at(-1)!.opacity)).toBe(0);
    // the path is the same: the keyframes round now say what they said
    const next = Math.ceil(t / KEYFRAME_DT);
    for (const i of [next, next + 1, next + 6]) {
      expect(frames(old.anim!).get(grid(i)), String(i)).toBeDefined();
      expect(frames(old.anim!).get(grid(i)), String(i)).toBe(before.get(grid(i)));
    }
    run(HURRY_FADE + 0.2);
    expect(b.flights()).toHaveLength(MAX_BALLOONS);
    expect(old.anim!.playState).toBe('idle');
    b.destroy();
  });

  it('reduced motion: the same machinery, one transform and the fade', () => {
    const root = cockpit();
    const b = startBalloons({ root, compositor: true, geometry: () => GEOM, reducedMotion: () => true, skin: dwarfSkin });
    b.show(SAMPLE_KILLS.good[0]!);
    const { anim, plan } = b.flights()[0]!;
    const kf = (anim!.effect as KeyframeEffect).getKeyframes();
    expect(kf.map((k) => Number(k.opacity))).toEqual([0, 1, 1, 0]);
    expect(new Set(kf.map((k) => k.transform)).size).toBe(1);
    run(1);
    expect(b.list()[0]).toMatchObject({ phase: 'read', front: true, reduced: true });
    run(flightTotal(plan));
    expect(b.list()).toHaveLength(0);
    b.destroy();
  });

  it('without Web Animations (compositor: false): the frame loop writes the same transform, no animation', () => {
    const root = cockpit();
    const b = startBalloons({ root, compositor: false, geometry: () => GEOM, reducedMotion: () => false, skin: dwarfSkin, random: () => 0.3 });
    b.show(SAMPLE_KILLS.good[0]!);
    const { el, anim, plan } = b.flights()[0]!;
    expect(anim).toBeNull();
    expect(el.getAnimations()).toHaveLength(0);
    run(2);
    expect(b.flights()[0]!.t).toBeCloseTo(2, 6);
    expect(el.style.transform).toBe(flightTransform(plan.bw, flightAt(plan, b.flights()[0]!.t)));
    expect(el.style.opacity).toBe('1');
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
