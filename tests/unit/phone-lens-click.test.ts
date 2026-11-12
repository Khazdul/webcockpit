// @vitest-environment happy-dom
// The lens's glass and the click that follows a pointer (src/phone/lens.ts):
// the tap is taken at the pointer's release and that pointer's click is
// passed over, but a click with no pointer of its own (a screen reader's
// activation, a script's `click()`) is a tap whenever it comes, also right
// after a drag or an armed hold.
import { describe, expect, it, vi } from 'vitest';
import { LENS_HOLD_MS, LensView } from '../../src/phone/lens';

function build() {
  const drops: (string | null)[] = [];
  const view = new LensView(document, {
    drag: { arm: () => {}, drag: () => {}, drop: (kind) => void drops.push(kind) },
    onLevel: () => {},
    fullscreen: null,
    panes: () => {},
    comm: () => {},
  });
  document.body.append(view.el);
  const glass = view.el.querySelector<HTMLButtonElement>('.wc-ph-lens-glass')!;
  const pointer = (type: string, x: number, y: number): void => {
    const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperty(e, 'pointerId', { value: 7 });
    Object.defineProperty(e, 'pointerType', { value: 'touch' });
    glass.dispatchEvent(e);
  };
  /** The click a pointer makes (`detail` 1) and one made without a pointer (`detail` 0). */
  const click = (detail: number): boolean => glass.dispatchEvent(new MouseEvent('click', { bubbles: true, detail }));
  return { view, glass, pointer, click, drops };
}

describe('the click after a gesture on the glass', () => {
  it('a tap steps the zoom once: at the release, and its own click is passed over', () => {
    const { view, pointer, click } = build();
    pointer('pointerdown', 50, 50);
    pointer('pointerup', 50, 50);
    expect(view.zoomLevel).toBe('z2');
    click(1);
    expect(view.zoomLevel).toBe('z2');
    // The next pointer click with no gesture before it is a tap again (a mouse without pointer events).
    click(1);
    expect(view.zoomLevel).toBe('z3');
  });

  it('after a drag a click with no pointer of its own still steps the zoom; the pointer\'s own does not', () => {
    const { view, pointer, click, drops } = build();
    pointer('pointerdown', 50, 50);
    pointer('pointermove', 50, 120);
    pointer('pointerup', 50, 120);
    expect(drops).toEqual(['move']);
    expect(view.zoomLevel).toBe('z1');
    click(0);
    expect(view.zoomLevel).toBe('z2');
    // The drag's own click (a mouse always clicks) is still passed over after it.
    click(1);
    expect(view.zoomLevel).toBe('z2');
  });

  it('after an armed hold released in place the same', () => {
    vi.useFakeTimers();
    try {
      const { view, glass, pointer, drops } = build();
      pointer('pointerdown', 50, 50);
      vi.advanceTimersByTime(LENS_HOLD_MS + 10);
      pointer('pointerup', 50, 50);
      expect(drops).toEqual([null]);
      expect(view.zoomLevel).toBe('z1');
      glass.click();
      expect(view.zoomLevel).toBe('z2');
    } finally {
      vi.useRealTimers();
    }
  });
});
