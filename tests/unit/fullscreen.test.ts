// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canFullscreen, isFullscreen, resetFullscreenRefusal, toggleFullscreen } from '../../src/core/fullscreen';
import { fullscreenItem } from '../../src/chrome/kit/widgets';

const nav = { flash: vi.fn() };

describe('fullscreen', () => {
  afterEach(() => {
    delete (document.documentElement as { requestFullscreen?: unknown }).requestFullscreen;
    delete (document as { fullscreenEnabled?: boolean }).fullscreenEnabled;
    resetFullscreenRefusal();
    nav.flash.mockReset();
    vi.useRealTimers();
  });

  it('is disabled where the browser has no fullscreen for the page', () => {
    expect(canFullscreen()).toBe(false);
    expect(fullscreenItem(false, nav)).toMatchObject({ key: 'fullscreen', label: 'Fullscreen', disabled: true });
  });

  it('labels the row by the state and requests fullscreen on the page', () => {
    const req = vi.fn(() => Promise.resolve());
    Object.assign(document.documentElement, { requestFullscreen: req });
    expect(fullscreenItem(false, nav)).toMatchObject({ label: 'Fullscreen', disabled: false });
    expect(fullscreenItem(true, nav).label).toBe('Exit fullscreen');
    expect(isFullscreen()).toBe(false);
    void toggleFullscreen();
    expect(req).toHaveBeenCalledOnce();
  });

  it('is disabled when the browser turned fullscreen off', () => {
    Object.assign(document.documentElement, { requestFullscreen: vi.fn() });
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => false });
    expect(canFullscreen()).toBe(false);
  });

  it('flashes and disables the row when a request is ignored (Firefox on iPad)', async () => {
    vi.useFakeTimers();
    Object.assign(document.documentElement, { requestFullscreen: vi.fn(() => Promise.resolve()) });
    fullscreenItem(false, nav).activate!();
    await vi.advanceTimersByTimeAsync(2000);
    expect(nav.flash).toHaveBeenCalledWith('This browser does not allow fullscreen.', 'fail');
    expect(canFullscreen()).toBe(false);
    expect(fullscreenItem(false, nav).disabled).toBe(true);
  });
});
