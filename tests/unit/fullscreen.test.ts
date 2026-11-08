// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canFullscreen,
  canLockEscape,
  isFullscreen,
  lockEscape,
  resetFullscreenRefusal,
  toggleFullscreen,
  unlockEscape,
} from '../../src/core/fullscreen';
import { setDeviceForTest } from '../../src/core/device';
import { installFullscreenButton } from '../../src/ui/fullscreen-button';

const touch = (): void => setDeviceForTest({ touch: true, phone: true });

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

  it('has no corner button on a tablet: the menu bar has one (ADR 0099)', () => {
    setDeviceForTest({ touch: true, phone: false });
    Object.assign(document.documentElement, { requestFullscreen: vi.fn(() => Promise.resolve()) });
    expect(canFullscreen()).toBe(true);
    expect(installFullscreenButton()).toBeNull();
  });

  it('puts the button in the page on a phone and requests fullscreen on a tap', () => {
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

  it('puts one element in fullscreen and tells it from the page (the run log player, ADR 0130)', async () => {
    Object.assign(document.documentElement, { requestFullscreen: vi.fn(() => Promise.resolve()) });
    const el = document.createElement('div');
    document.body.append(el);
    let fs: Element | null = null;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fs });
    const req = vi.fn(() => {
      fs = el;
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    });
    const exit = vi.fn(() => {
      fs = null;
      return Promise.resolve();
    });
    Object.assign(el, { requestFullscreen: req });
    Object.assign(document, { exitFullscreen: exit });
    try {
      expect(isFullscreen(document, el)).toBe(false);
      expect(await toggleFullscreen(document, el)).toBe(true);
      expect(req).toHaveBeenCalledOnce();
      expect(isFullscreen(document, el)).toBe(true);
      expect(isFullscreen(document, document.documentElement)).toBe(false);
      expect(isFullscreen()).toBe(true);
      await toggleFullscreen(document, el);
      expect(exit).toHaveBeenCalledOnce();
      expect(isFullscreen(document, el)).toBe(false);
      // The page in fullscreen: the element still asks for its own.
      fs = document.documentElement;
      await toggleFullscreen(document, el);
      expect(req).toHaveBeenCalledTimes(2);
      expect(exit).toHaveBeenCalledOnce();
    } finally {
      delete (document as { fullscreenElement?: unknown }).fullscreenElement;
      delete (document as { exitFullscreen?: unknown }).exitFullscreen;
    }
  });
});

describe('Esc in fullscreen: Keyboard Lock (ADR 0103)', () => {
  it('asks for Escape and gives it back where the API exists; rejections are ignored', async () => {
    const lock = vi.fn(() => Promise.reject(new Error('not allowed')));
    const unlock = vi.fn();
    const nav = { keyboard: { lock, unlock } } as unknown as Navigator;
    expect(canLockEscape(nav)).toBe(true);
    expect(lockEscape(nav)).toBe(true);
    expect(lock).toHaveBeenCalledWith(['Escape']);
    await Promise.resolve();
    unlockEscape(nav);
    expect(unlock).toHaveBeenCalledOnce();
  });

  it('does nothing without the API (Firefox, Safari)', () => {
    const nav = {} as Navigator;
    expect(canLockEscape(nav)).toBe(false);
    expect(lockEscape(nav)).toBe(false);
    expect(() => unlockEscape(nav)).not.toThrow();
    expect(lockEscape({ keyboard: { lock: 1 } } as unknown as Navigator)).toBe(false);
    expect(lockEscape(undefined)).toBe(false);
  });

  it('survives a lock that throws', () => {
    const nav = { keyboard: { lock: () => { throw new Error('x'); }, unlock: () => { throw new Error('y'); } } } as unknown as Navigator;
    expect(lockEscape(nav)).toBe(true);
    expect(() => unlockEscape(nav)).not.toThrow();
  });
});
