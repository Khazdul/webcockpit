// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canFullscreen, isFullscreen, resetFullscreenRefusal, toggleFullscreen } from '../../src/core/fullscreen';
import { setDeviceForTest } from '../../src/core/device';
import { installFullscreenButton } from '../../src/ui/fullscreen-button';

const touch = (): void => setDeviceForTest({ touch: true, phone: false });

describe('fullscreen', () => {
  afterEach(() => {
    delete (document.documentElement as { requestFullscreen?: unknown }).requestFullscreen;
    delete (document as { fullscreenEnabled?: boolean }).fullscreenEnabled;
    resetFullscreenRefusal();
    setDeviceForTest({ touch: false, phone: false });
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it('has no button where the browser has no fullscreen for the page (iPhone)', () => {
    touch();
    expect(canFullscreen()).toBe(false);
    expect(installFullscreenButton()).toBeNull();
  });

  it('has no button on a desktop', () => {
    Object.assign(document.documentElement, { requestFullscreen: vi.fn(() => Promise.resolve()) });
    expect(canFullscreen()).toBe(true);
    expect(installFullscreenButton()).toBeNull();
  });

  it('puts the button in the page on touch and requests fullscreen on a tap', () => {
    touch();
    const req = vi.fn(() => Promise.resolve());
    Object.assign(document.documentElement, { requestFullscreen: req });
    const b = installFullscreenButton()!;
    expect(b.el.parentNode).toBe(document.body);
    expect(b.el.getAttribute('aria-label')).toBe('Fullscreen');
    expect(isFullscreen()).toBe(false);
    b.el.click();
    expect(req).toHaveBeenCalledOnce();
  });

  it('is disabled when the browser turned fullscreen off', () => {
    touch();
    Object.assign(document.documentElement, { requestFullscreen: vi.fn() });
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => false });
    expect(canFullscreen()).toBe(false);
    expect(installFullscreenButton()).toBeNull();
  });

  it('removes the button when a request is ignored (Firefox on iPad)', async () => {
    vi.useFakeTimers();
    touch();
    Object.assign(document.documentElement, { requestFullscreen: vi.fn(() => Promise.resolve()) });
    const b = installFullscreenButton()!;
    const ok = toggleFullscreen();
    await vi.advanceTimersByTimeAsync(2000);
    expect(await ok).toBe(false);
    expect(canFullscreen()).toBe(false);
    expect(b.el.isConnected).toBe(false);
  });
});
