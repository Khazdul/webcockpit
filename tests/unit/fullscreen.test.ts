// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canFullscreen, isFullscreen, toggleFullscreen } from '../../src/core/fullscreen';
import { fullscreenItem } from '../../src/chrome/kit/widgets';

describe('fullscreen', () => {
  afterEach(() => {
    delete (document.documentElement as { requestFullscreen?: unknown }).requestFullscreen;
  });

  it('is disabled where the browser has no fullscreen for the page', () => {
    expect(canFullscreen()).toBe(false);
    expect(fullscreenItem(false)).toMatchObject({ key: 'fullscreen', label: 'Fullscreen', disabled: true });
  });

  it('labels the row by the state and requests fullscreen on the page', () => {
    const req = vi.fn(() => Promise.resolve());
    Object.assign(document.documentElement, { requestFullscreen: req });
    expect(fullscreenItem(false)).toMatchObject({ label: 'Fullscreen', disabled: false });
    expect(fullscreenItem(true).label).toBe('Exit fullscreen');
    expect(isFullscreen()).toBe(false);
    toggleFullscreen();
    expect(req).toHaveBeenCalledOnce();
  });

  it('is disabled when the browser turned fullscreen off (Firefox on iPad)', () => {
    Object.assign(document.documentElement, { requestFullscreen: vi.fn() });
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => false });
    expect(canFullscreen()).toBe(false);
    delete (document as { fullscreenEnabled?: boolean }).fullscreenEnabled;
  });
});
