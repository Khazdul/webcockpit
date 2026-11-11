// @vitest-environment happy-dom
// Stage 52d: the `?vv=1` readout.
import { afterEach, describe, expect, it } from 'vitest';
import { installViewportReadout, viewportReadoutText } from '../../src/layout/phone-viewport-debug';

describe('the phone viewport readout', () => {
  afterEach(() => {
    delete (navigator as { virtualKeyboard?: unknown }).virtualKeyboard;
    document.documentElement.style.removeProperty('--wc-vv-h');
    document.body.replaceChildren();
  });

  it('says "no VK" without the API and shows the published height', () => {
    document.documentElement.style.setProperty('--wc-vv-h', '456px');
    const text = viewportReadoutText(window);
    expect(text).toContain(`inner ${window.innerHeight}`);
    expect(text).toContain('fs 0');
    expect(text).toContain('no VK');
    expect(text).toContain('--wc-vv-h 456px');
  });

  it('is one fixed line that lets touches through, redrawn on a geometry change, gone when stopped', () => {
    const vk = Object.assign(new EventTarget(), { overlaysContent: true, boundingRect: { top: 456.26, height: 344 } });
    Object.defineProperty(navigator, 'virtualKeyboard', { value: vk, configurable: true });
    const stop = installViewportReadout(window);
    const el = document.querySelector<HTMLElement>('.wc-vv-readout')!;
    expect(el.style.position).toBe('fixed');
    expect(el.style.pointerEvents).toBe('none');
    expect(el.textContent).toContain('vk top 456.3 h 344 oc 1');
    vk.boundingRect = { top: 0, height: 0 };
    vk.dispatchEvent(new Event('geometrychange'));
    expect(el.textContent).toContain('vk top 0 h 0 oc 1');
    stop();
    expect(document.querySelector('.wc-vv-readout')).toBeNull();
  });
});
