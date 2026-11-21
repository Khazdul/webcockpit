// @vitest-environment happy-dom
// Stage 75 review: the balloons' load queue and prefers-reduced-motion per
// balloon, with the real rig and the dwarf behind a stubbed passenger loader.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LaneGeom } from '../../src/weather/balloons/flight';
import { SAMPLE_MOMENTS } from '../../src/weather/balloons/feed';

/** Throws in the next balloon's envelope this many times (a broken look). */
let breakNext = 0;
vi.mock('../../src/weather/balloons/passenger', async (orig) => {
  const real = await orig<typeof import('../../src/weather/balloons/passenger')>();
  const { passenger } = await import('../../src/weather/balloons/passengers/dwarf');
  const broken = {
    passenger: {
      ...passenger,
      spec: (ctx: Parameters<typeof passenger.spec>[0]) => {
        const s = passenger.spec(ctx);
        return {
          ...s,
          envelope: (m: Parameters<typeof s.envelope>[0]) => {
            if (breakNext > 0) {
              breakNext--;
              throw new Error('boom');
            }
            return s.envelope(m);
          },
        };
      },
    },
  };
  return { ...real, loadPassenger: async () => broken };
});

const { startBalloons } = await import('../../src/weather/balloons/balloons');
const GEOM: LaneGeom = { W: 1920, H: 1080, out: { x: 0, y: 0, w: 1410, h: 1045 }, cell: { w: 9, h: 18 }, protect: { fadeTop: 970 } };
const cockpit = (): HTMLElement => {
  const root = document.createElement('div');
  const game = document.createElement('div');
  game.className = 'wc-game';
  root.append(game);
  document.body.append(root);
  return root;
};
afterEach(() => vi.restoreAllMocks());

describe('the load queue (stage 75 review)', () => {
  it('a passenger whose look throws loses that notice only, said once; the next notice rises', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const b = startBalloons({ root: cockpit(), geometry: () => GEOM, reducedMotion: () => true, passenger: () => 'dwarf' });
    breakNext = 1;
    b.show(SAMPLE_MOMENTS.levelup);
    await b.idle();
    expect(b.list()).toHaveLength(0);
    expect(err).toHaveBeenCalledTimes(1);
    expect(String(err.mock.calls[0]![1])).toContain('boom');
    b.show(SAMPLE_MOMENTS.death);
    await b.idle();
    expect(b.list().map((f) => f.kind)).toEqual(['death']);
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('could not be loaded'))).toEqual([]);
    await new Promise((r) => setTimeout(r, 0));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    b.destroy();
  });
});

describe('prefers-reduced-motion per balloon (stage 75 review)', () => {
  it('a change of the setting reaches the next balloon, its flight and its rig alike', async () => {
    let rm = false;
    const root = cockpit();
    const b = startBalloons({ root, geometry: () => GEOM, reducedMotion: () => rm, passenger: () => 'dwarf' });
    b.show(SAMPLE_MOMENTS.levelup);
    await b.idle();
    rm = true;
    b.show(SAMPLE_MOMENTS.death);
    await b.idle();
    rm = false;
    b.show(SAMPLE_MOMENTS.achievement);
    await b.idle();
    expect(b.list().map((f) => [f.kind, f.reduced])).toEqual([
      ['levelup', false],
      ['death', true],
      ['achievement', false],
    ]);
    const rigs = [...root.querySelectorAll('.wc-balloon > .rig')];
    expect(rigs.map((r) => [r.getAttribute('data-kind'), r.classList.contains('rig-rm'), r.classList.contains('rig-still')])).toEqual([
      ['levelup', false, false],
      ['death', true, true],
      ['achievement', false, false],
    ]);
    b.destroy();
  });
});
