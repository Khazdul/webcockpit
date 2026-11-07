// @vitest-environment happy-dom
// The start page wordmark (ADR 0126): the light model, the markup and the Preact component.

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import type { SkyLook } from '../../src/start/sky/look';
import { Wordmark } from '../../src/start/wordmark';
import { COCKPIT, MUME } from '../../src/start/wordmark-glyphs';
import {
  type MarkBox,
  applyWordmarkLight,
  paintWordmark,
  parseColor,
  wordmarkLight,
  wordmarkMarkup,
} from '../../src/start/wordmark-svg';

const box: MarkBox = { cx: 500, cy: 200, vw: 1000, vh: 800 };

function look(over: Omit<Partial<SkyLook>, 'light'> & { light?: Partial<SkyLook['light']> } = {}): SkyLook {
  // Only the fields the wordmark reads matter; the rest of SkyLook is not used here.
  const base = {
    period: 'day' as const,
    season: 'summer' as const,
    dayness: 1,
    top: '#3d7fc4',
    mid: '#79acd9',
    horizon: '#c9def0',
    below: '#9cc3e6',
    textBackLuminance: 0.6,
    light: { kind: 'sun' as const, x: 0.5, y: 0.05, strength: 1, color: '#fff3d6' },
  };
  return { ...base, ...over, light: { ...base.light, ...over.light } } as unknown as SkyLook;
}

describe('wordmarkLight', () => {
  it('uses the day metal by day and the night metal at night', () => {
    expect(wordmarkLight(look({ dayness: 1 }), box).night).toBe(0);
    expect(wordmarkLight(look({ dayness: 0 }), box).night).toBe(1);
    const dusk = wordmarkLight(look({ dayness: 0.5 }), box).night;
    expect(dusk).toBeGreaterThan(0);
    expect(dusk).toBeLessThan(1);
  });

  it('dims the inlay when there is little light, never by day', () => {
    expect(wordmarkLight(look(), box).dim).toBe(0);
    const moon = wordmarkLight(look({ dayness: 0, light: { kind: 'moon', strength: 0.35 } }), box).dim;
    const none = wordmarkLight(look({ dayness: 0, light: { kind: 'none', strength: 0.35 } }), box).dim;
    expect(moon).toBeGreaterThan(0);
    expect(none).toBeGreaterThan(moon);
  });

  it('moves the glint with the light across the word', () => {
    const left = wordmarkLight(look({ light: { x: 0.1 } }), box).glintX;
    const mid = wordmarkLight(look({ light: { x: 0.5 } }), box).glintX;
    const right = wordmarkLight(look({ light: { x: 0.9 } }), box).glintX;
    expect(left).toBeLessThan(mid);
    expect(mid).toBeLessThan(right);
    expect(left).toBeGreaterThanOrEqual(MUME.x0);
    expect(right).toBeLessThanOrEqual(MUME.x1);
    expect(mid).toBeCloseTo((MUME.x0 + MUME.x1) / 2, 0);
  });

  it('turns the lit edge towards the light (screen direction, y down)', () => {
    const upLeft = wordmarkLight(look({ light: { x: 0.1, y: 0 } }), box);
    expect(upLeft.dx).toBeLessThan(0);
    expect(upLeft.dy).toBeLessThan(0);
    expect(Math.hypot(upLeft.dx, upLeft.dy)).toBeCloseTo(1, 5);
    const right = wordmarkLight(look({ light: { x: 1, y: 0.25 } }), box);
    expect(right.dx).toBeGreaterThan(0);
  });

  it('brightens the glint with the light', () => {
    const sun = wordmarkLight(look(), box).glintAlpha;
    const moon = wordmarkLight(look({ dayness: 0, light: { kind: 'moon', strength: 0.35 } }), box).glintAlpha;
    expect(sun).toBeGreaterThan(moon);
  });
});

describe('parseColor', () => {
  it('reads hex and rgb colours', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255]);
    expect(parseColor('#00d0d0')).toEqual([0, 208, 208]);
    expect(parseColor('rgba(10, 154, 156, .5)')).toEqual([10, 154, 156]);
    expect(parseColor('hsl(1 2% 3%)', [1, 2, 3])).toEqual([1, 2, 3]);
  });
});

describe('wordmarkMarkup', () => {
  it('draws paths, never text, and names itself', () => {
    const html = wordmarkMarkup('full', 'wx');
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="MUME Cockpit"');
    expect(html).not.toMatch(/<text\b/);
    expect(html).toContain(MUME.d);
    expect(html).toContain(COCKPIT.d);
    expect(html).toContain('id="wx-core"');
  });

  it('keeps every filter out of the layer the light updates', () => {
    const html = wordmarkMarkup('full', 'wx');
    const inlay = html.slice(html.indexOf('data-wcw="inlay"'));
    expect(inlay.slice(0, inlay.indexOf('</svg>'))).not.toMatch(/filter/);
  });

  it('leaves COCKPIT out of the small mark', () => {
    const html = wordmarkMarkup('small', 'wy');
    expect(html).not.toContain(COCKPIT.d);
    expect(html).toContain('wc-wordmark-small');
  });
});

describe('applyWordmarkLight', () => {
  it('sets the dynamic attributes and the rivet colours', () => {
    const host = document.createElement('div');
    paintWordmark(host, look({ dayness: 0, light: { kind: 'moon', strength: 0.3 } }), 'full', 'wz');
    expect(host.querySelector('[data-wcw="night"]')?.getAttribute('opacity')).toBe('1');
    const w = wordmarkLight(look(), box);
    applyWordmarkLight(host, w);
    expect(host.querySelector('[data-wcw="night"]')?.getAttribute('opacity')).toBe('0');
    const g = host.querySelector('[data-wcw="glint"]')!;
    expect(Number(g.getAttribute('x1'))).toBeCloseTo(w.glintX - 900, 0);
    const lit = host.querySelector('[data-wcw="lit-e"]')!;
    expect(lit.getAttribute('transform')).toMatch(/^translate\(/);
    const root = host.querySelector<HTMLElement>('.wc-wordmark')!;
    expect(root.style.getPropertyValue('--wcw-rv-mid')).toBe(w.rivet[1]);
  });
});

describe('<Wordmark>', () => {
  it('mounts once and follows the look', () => {
    const el = document.createElement('div');
    document.body.append(el);
    act(() => render(<Wordmark look={look()} run={false} />, el));
    const svg = el.querySelector('[data-wcw="iron"]');
    expect(el.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('MUME Cockpit');
    expect(el.querySelector('[data-wcw="night"]')?.getAttribute('opacity')).toBe('0');
    act(() => render(<Wordmark look={look({ dayness: 0, light: { kind: 'moon', strength: 0.3 } })} run={false} />, el));
    expect(el.querySelector('[data-wcw="iron"]')).toBe(svg);
    expect(el.querySelector('[data-wcw="night"]')?.getAttribute('opacity')).toBe('1');
    act(() => render(<Wordmark look={look()} size="small" run={false} />, el));
    expect(el.querySelector('.wc-wordmark-small')).not.toBeNull();
    act(() => render(null, el));
    el.remove();
  });
});
