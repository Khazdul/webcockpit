// @vitest-environment happy-dom
// A pinch on the lens's glass (src/phone/lens.ts, ADR 0156): two fingers
// step the zoom levels by the change in their distance, a second finger
// ends a move that was on (as a drop), and the pinch's release is no tap.
import { describe, expect, it } from 'vitest';
import { LENS_PINCH_RATIO, LensView } from '../../src/phone/lens';

function build() {
  const drops: (string | null)[] = [];
  const levels: string[] = [];
  const view = new LensView(document, {
    drag: { arm: () => {}, drag: () => {}, drop: (kind) => void drops.push(kind) },
    onLevel: (l) => void levels.push(l),
    fullscreen: null,
    panes: () => {},
    comm: () => {},
  });
  document.body.append(view.el);
  const glass = view.el.querySelector<HTMLButtonElement>('.wc-ph-lens-glass')!;
  const pointer = (type: string, id: number, x: number, y = 50): void => {
    const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperty(e, 'pointerId', { value: id });
    Object.defineProperty(e, 'pointerType', { value: 'touch' });
    glass.dispatchEvent(e);
  };
  const click = (detail: number): boolean => glass.dispatchEvent(new MouseEvent('click', { bubbles: true, detail }));
  return { view, pointer, click, drops, levels };
}

describe('a pinch on the glass', () => {
  it('together steps further, apart nearer, one level per ratio; the release steps nothing', () => {
    const { view, pointer, click, levels } = build();
    pointer('pointerdown', 1, 0);
    pointer('pointerdown', 2, 100);
    // Just short of the ratio: nothing yet.
    pointer('pointermove', 2, 100 / LENS_PINCH_RATIO + 2);
    expect(view.zoomLevel).toBe('z1');
    pointer('pointermove', 2, 100 / LENS_PINCH_RATIO - 1);
    expect(view.zoomLevel).toBe('z2');
    pointer('pointermove', 2, 30);
    expect(view.zoomLevel).toBe('z4');
    pointer('pointermove', 2, 30 * LENS_PINCH_RATIO + 1);
    expect(view.zoomLevel).toBe('z3');
    expect(levels).toEqual(['z2', 'z3', 'z4', 'z3']);
    pointer('pointerup', 2, 41);
    pointer('pointerup', 1, 0);
    click(1);
    expect(view.zoomLevel).toBe('z3');
    // The next tap is one again.
    pointer('pointerdown', 3, 50);
    pointer('pointerup', 3, 50);
    expect(view.zoomLevel).toBe('z4');
  });

  it('a second finger ends a move as a drop and pinches from there', () => {
    const { view, pointer, drops } = build();
    pointer('pointerdown', 1, 50);
    pointer('pointermove', 1, 80);
    pointer('pointerdown', 2, 180);
    expect(drops).toEqual(['move']);
    pointer('pointermove', 2, 380);
    expect(view.zoomLevel).toBe('z1');
    pointer('pointermove', 2, 100);
    expect(view.zoomLevel).not.toBe('z1');
    pointer('pointerup', 1, 80);
    expect(drops).toEqual(['move']);
  });
});
