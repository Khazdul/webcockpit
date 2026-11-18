// Stage 73 E2 (owner, 2026-11-18; ADR 0154 addendum "Desert"): a shared
// run's map is drawn in Desert's tiles, whatever set the sender drew.
//
// - An old link's payload (here: one with Gefe & Rik's tiles, its untinted
//   flow and light tints) is retiled by the page before it goes to the
//   sandboxed frame: the frame's map worker gets Desert's files, the
//   default's for what Desert lacks, and MMapper's flow tint and room tints.
// - A new link (`prepareLinkPayload` + `sealLinkPayload`, as the share
//   dialog builds it) stores MMapper's default tiles and plays in Desert
//   all the same.
// Both through `__wc.watchFrame` (the watch page's `openFrame`, src/watch/frame-host.ts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Frame, type Page, expect, test } from '@playwright/test';
import { sharedOverlay } from '../../src/map/tilesets';

type Fingerprint = { len: number; tail: string };
type Sent = { files: Record<string, Fingerprint>; streamsAsIs: boolean; tints: unknown };

const PUBLIC = join(import.meta.dirname, '../../public/map');
const fingerprint = (s: string): Fingerprint => ({ len: s.length, tail: s.slice(-80) });
const uri = (path: string): string => `data:image/png;base64,${readFileSync(path).toString('base64')}`;

/** What a pixmap of a shared run must be: Desert's file, or the default's where Desert has none. */
function expected(key: string): Fingerprint {
  const f = key.slice('pixmaps/'.length);
  const o = sharedOverlay();
  return fingerprint(uri(o.files.includes(f) ? join(PUBLIC, o.dir, f) : join(PUBLIC, 'pixmaps', f)));
}

/** Records the asset source the map pane gives its worker, in every frame. */
async function recordAssets(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const orig = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, m: unknown, ...rest: unknown[]) {
      const a = (m as { t?: string; assets?: { kind?: string; files?: Record<string, unknown>; streamsAsIs?: boolean; tints?: unknown } } | null) ?? null;
      if ((a?.t === 'init' || a?.t === 'assets') && a.assets?.kind === 'inline') {
        const files: Record<string, { len: number; tail: string }> = {};
        for (const [k, v] of Object.entries(a.assets.files ?? {})) if (typeof v === 'string') files[k] = { len: v.length, tail: v.slice(-80) };
        (window as unknown as { __assets: unknown }).__assets = { files, streamsAsIs: a.assets.streamsAsIs === true, tints: a.assets.tints ?? null };
      }
      return (orig as (...x: unknown[]) => void).call(this, m, ...rest);
    } as typeof orig;
  });
}

async function playingFrame(page: Page): Promise<Frame> {
  const el = page.locator('#wc-dev-watch iframe');
  await expect(el).toHaveAttribute('sandbox', 'allow-scripts');
  const f = (await (await el.elementHandle())!.contentFrame())!;
  await expect(f.locator('.wc-player')).toBeVisible({ timeout: 20_000 });
  const map = f.locator('.wc-pane-map .wc-pane-content');
  await expect(map).toHaveAttribute('data-map-state', 'loaded', { timeout: 20_000 });
  await expect(map).toHaveAttribute('data-map-drawn-ms', /\d+/, { timeout: 20_000 });
  return f;
}

async function sentAssets(f: Frame): Promise<Sent> {
  await f.waitForFunction(() => (window as unknown as { __assets?: unknown }).__assets !== undefined);
  return f.evaluate(() => (window as unknown as { __assets: Sent }).__assets);
}

function expectDesert(sent: Sent): void {
  const keys = Object.keys(sent.files).filter((k) => k.startsWith('pixmaps/'));
  expect(keys.length).toBeGreaterThan(10);
  // At least one is Desert's own file (not only defaults), and every one is what Desert draws.
  expect(keys.some((k) => sharedOverlay().files.includes(k.slice('pixmaps/'.length)))).toBe(true);
  for (const k of keys) expect(sent.files[k], k).toEqual(expected(k));
  expect(sent.streamsAsIs).toBe(false);
  expect(sent.tints).toBeNull();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 820 });
  await recordAssets(page);
  await page.goto('/');
  await page.waitForFunction(() => window.__wc !== undefined);
});

test('an old link with another tileset embedded plays in Desert', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const dev = (await import('/src/replay/dev.ts' as string)) as typeof import('../../src/replay/dev');
    const { embedReplayMap } = (await import('/src/replay/map-embed.ts' as string)) as typeof import('../../src/replay/map-embed');
    const { overlayFor } = (await import('/src/map/tilesets.ts' as string)) as typeof import('../../src/map/tilesets');
    const w = window.__wc!;
    const base = await dev.devPayload(w.shell, w.settings, { logs: ['map-demo.log'], character: 'Rasta' });
    const old = await embedReplayMap(base, (await w.shell.maps.source())!, {
      assetBase: new URL('map/', location.href).href,
      tileset: overlayFor('gefe-rik', 0),
      forLink: true,
    });
    return { played: await w.watchFrame({ raw: old }), streamsAsIs: old.map!.streamsAsIs === true };
  });
  // The payload itself is Gefe & Rik's.
  expect(r.streamsAsIs).toBe(true);
  expect(r.played).toEqual({ ok: true });
  expectDesert(await sentAssets(await playingFrame(page)));
});

test('a new link stores the default tiles and plays in Desert', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { prepareLinkPayload } = (await import('/src/share/link-payload.ts' as string)) as typeof import('../../src/share/link-payload');
    const { sealLinkPayload } = (await import('/src/share/link-seal.ts' as string)) as typeof import('../../src/share/link-seal');
    const { defaultExportDoc } = (await import('/src/share/edits.ts' as string)) as typeof import('../../src/share/edits');
    const w = window.__wc!;
    const text = await (await fetch('/__fixtures/map-demo.log')).text();
    const us = Number(/^(\d{16}) /.exec(text)![1]);
    const chain = [{ meta: { runId: 'Rasta/0', character: 'Rasta', startedUs: us, endedUs: null, sealed: true, bytes: text.length, lines: 0 }, text }];
    const link = await sealLinkPayload(await prepareLinkPayload(chain, [], defaultExportDoc('Rasta/0'), w.settings.get(), await w.shell.maps.source()));
    const field = link.payload.map!.files['pixmaps/terrain-field.png']!;
    return { played: await w.watchFrame({ raw: link.payload }), field: { len: field.length, tail: field.slice(-80) } };
  });
  // Stored: the default set's file (small payloads; ADR 0154 addendum 2026-11-18).
  expect(r.field).toEqual(fingerprint(uri(join(PUBLIC, 'pixmaps', 'terrain-field.png'))));
  expect(r.played).toEqual({ ok: true });
  expectDesert(await sentAssets(await playingFrame(page)));
});
