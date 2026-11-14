// Stage 59 (spec §7.0, ADR 0147): the cloud client's flags, the public
// numbers, when it may call the API, and the device type and browser
// family of a beat.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BROWSERS } from '../../shared/cloud/api';
import { automated, cloudTest, fetchConfig, parseConfig } from '../../src/cloud/config';
import { browserFamily, deviceType } from '../../src/cloud/device-info';
import { fetchPublicStats, onlineText, parsePublicStats } from '../../src/cloud/online';

const answer = (status: number, body: unknown) =>
  vi.fn(async (_url: string, _init: RequestInit) => ({
    ok: status >= 200 && status < 300,
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
  }));

afterEach(() => {
  vi.useRealTimers();
});

describe('config', () => {
  it('keeps boolean flags only', () => {
    expect(parseConfig({ flags: { stats: true } })).toEqual({ flags: { stats: true } });
    expect(parseConfig({ flags: { stats: 'yes', other: false } })).toEqual({ flags: { other: false } });
    expect(parseConfig({ flags: {} })).toEqual({ flags: {} });
    expect(parseConfig(null)).toEqual({ flags: {} });
    expect(parseConfig('<!doctype html>')).toEqual({ flags: {} });
    expect(parseConfig({ flags: null })).toEqual({ flags: {} });
  });

  it('fetches /api/config without credentials; any failure is no flags', async () => {
    const ok = answer(200, { flags: { stats: true } });
    expect(await fetchConfig(ok)).toEqual({ flags: { stats: true } });
    expect(ok.mock.calls[0]![0]).toBe('/api/config');
    expect(ok.mock.calls[0]![1].credentials).toBe('omit');
    expect(await fetchConfig(answer(404, { error: 'not_found' }))).toEqual({ flags: {} });
    expect(await fetchConfig(answer(500, 'x'))).toEqual({ flags: {} });
    // The dev server without an API answers index.html: not JSON.
    expect(await fetchConfig(answer(200, '<!doctype html>'))).toEqual({ flags: {} });
    expect(await fetchConfig(vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))).toEqual({ flags: {} });
    expect(
      await fetchConfig(
        vi.fn(() => {
          throw new Error('sync');
        }),
      ),
    ).toEqual({ flags: {} });
  });

  it('gives up after its timeout', async () => {
    let signal: AbortSignal | undefined;
    const hang = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<never>((_, reject) => {
          signal = init.signal ?? undefined;
          signal?.addEventListener('abort', () => reject(signal!.reason));
        }),
    );
    const p = fetchConfig(hang);
    expect(signal).toBeDefined();
    expect(await p.then(() => 'done', () => 'rejected')).toBe('done');
    // (AbortSignal.timeout runs on the real clock; the request was given one.)
  }, 10_000);

  it('the API is off under webdriver; ?cloudtest is honoured on the dev server (and in tests)', () => {
    expect(automated({ webdriver: true })).toBe(true);
    expect(automated({ webdriver: false })).toBe(false);
    expect(automated({})).toBe(false);
    expect(cloudTest('?cloudtest')).toBe(import.meta.env.DEV === true);
    expect(cloudTest('?cloudtest=1&x')).toBe(import.meta.env.DEV === true);
    expect(cloudTest('?replay')).toBe(false);
    expect(cloudTest('')).toBe(false);
  });
});

describe('public stats', () => {
  it('takes two whole, non-negative numbers', () => {
    expect(parsePublicStats({ online: 12, playing: 3 })).toEqual({ online: 12, playing: 3 });
    expect(parsePublicStats({ online: 0, playing: 0 })).toEqual({ online: 0, playing: 0 });
    expect(parsePublicStats({ online: -1, playing: 0 })).toBeNull();
    expect(parsePublicStats({ online: 1.5, playing: 0 })).toBeNull();
    expect(parsePublicStats({ online: '3', playing: 0 })).toBeNull();
    expect(parsePublicStats({ online: 3 })).toBeNull();
    expect(parsePublicStats(null)).toBeNull();
  });

  it('fetches /api/stats/public; null on any failure', async () => {
    const ok = answer(200, { online: 7, playing: 2 });
    expect(await fetchPublicStats(ok)).toEqual({ online: 7, playing: 2 });
    expect(ok.mock.calls[0]![0]).toBe('/api/stats/public');
    expect(await fetchPublicStats(answer(404, { error: 'not_found' }))).toBeNull();
    expect(await fetchPublicStats(vi.fn(() => Promise.reject(new Error('x'))))).toBeNull();
  });

  it('the line', () => {
    expect(onlineText(1)).toBe('1 online');
    expect(onlineText(42)).toBe('42 online');
  });
});

describe('device type', () => {
  it('is the device, not its mode', () => {
    expect(deviceType({ phone: false, tablet: false, desktopSite: false })).toBe('desktop');
    expect(deviceType({ phone: true, tablet: false, desktopSite: false })).toBe('phone');
    // A tablet has the phone flag too (ADR 0140).
    expect(deviceType({ phone: true, tablet: true, desktopSite: false })).toBe('tablet');
    // A phone in "Desktop site" mode is still a phone.
    expect(deviceType({ phone: false, tablet: false, desktopSite: true })).toBe('phone');
  });
});

describe('browser family', () => {
  const UA: [string, string][] = [
    ['firefox', 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0'],
    ['firefox', 'Mozilla/5.0 (Android 14; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0'],
    ['firefox', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/140.0 Mobile/15E148 Safari/605.1.15'],
    ['chrome', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'],
    ['chrome', 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'],
    ['chrome', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1'],
    ['safari', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'],
    ['safari', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'],
    ['safari', 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'],
    ['edge', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0'],
    ['edge', 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 EdgA/141.0.0.0'],
    ['edge', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/141.0 Mobile/15E148 Safari/605.1.15'],
    ['samsung', 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36'],
    ['other', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 OPR/120.0.0.0'],
    ['other', 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36 YaBrowser/25.0'],
    ['other', 'curl/8.0'],
    ['other', ''],
  ];
  it.each(UA)('%s: %s', (want, ua) => {
    expect(browserFamily(ua)).toBe(want);
    expect(BROWSERS).toContain(browserFamily(ua));
  });
});
