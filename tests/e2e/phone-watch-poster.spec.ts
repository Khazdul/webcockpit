// Stage 73 point 11 (ADR 0162 and its round 1 addendum) on a phone and a
// tablet: the shared run opens under its poster in portrait and in
// landscape; the player's control box is hidden under it; a tap anywhere
// on it plays the run in the phone's layout. The desktop's are in
// watch-poster.spec.ts.
//
// `phone` project (Pixel 7), the watch page's frame.
import { type Page, expect, test } from "@playwright/test";
import { openWatch, playing, poster, replay, setUp } from "./watch-page";

const playingInFrame = (page: Page): Promise<boolean> =>
  page
    .frames()
    .find((f) => f.url().endsWith("/r/frame"))!
    .evaluate(
      () =>
        (
          window as unknown as {
            __wcReplay: { host: { engine: { playing: boolean } } };
          }
        ).__wcReplay.host.engine.playing,
    );

for (const [name, size] of [
  ["portrait", { width: 412, height: 839 }],
  ["landscape", { width: 839, height: 412 }],
  ["tablet-landscape", { width: 1180, height: 820 }],
] as const) {
  test(`phone ${name}: the poster covers the run; a tap plays it in the phone layout`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(size);
    await setUp(page);
    await openWatch(page);
    await playing(page);
    const p = poster(page);
    await expect(p).toBeVisible();
    await expect(p.locator(".wc-poster-title")).toHaveText(
      "Clearing the ranger camp",
    );
    const f = (await page.locator(".wc-watch-slot iframe").boundingBox())!;
    const b = (await p.boundingBox())!;
    expect(b.width).toBeGreaterThan(f.width - 2);
    expect(b.height).toBeGreaterThan(f.height - 2);
    // Everything on it fits in the frame.
    for (const sel of [
      ".wc-poster-title",
      ".wc-poster-glyph",
      ".wc-poster-logo",
    ]) {
      const e = (await p.locator(sel).boundingBox())!;
      expect(e.x).toBeGreaterThanOrEqual(f.x);
      expect(e.y).toBeGreaterThanOrEqual(f.y);
      expect(e.x + e.width).toBeLessThanOrEqual(f.x + f.width + 0.5);
      expect(e.y + e.height).toBeLessThanOrEqual(f.y + f.height + 0.5);
    }
    await expect(p.locator(".wc-poster-desc")).toBeVisible();
    await expect(replay(page).locator(".wc-player-box")).toBeHidden();
    await page.screenshot({
      path: `docs/stages/img/73-c-${name.startsWith("tablet") ? name : `phone-${name}`}.png`,
    });
    expect(await playingInFrame(page)).toBe(false);
    // A tap on the lens's place hits the poster, not the lens (the layer is on top).
    const lens = (await replay(page).locator(".wc-ph-lens").boundingBox())!;
    await page.touchscreen.tap(
      lens.x + lens.width / 2,
      lens.y + lens.height / 2,
    );
    await expect(p).toHaveCount(0);
    await expect.poll(() => playingInFrame(page)).toBe(true);
    await expect(
      replay(page).locator(".wc-cockpit[data-phone-game]"),
    ).toBeVisible();
    await expect(replay(page).locator(".wc-ph-lens")).toBeVisible();
    await expect(replay(page).locator(".wc-player-box")).toBeVisible();
    // The lens's panes key was not pressed by that tap.
    await expect(
      replay(page).locator('.wc-ph-lens .wc-ph-sat[data-sat="panes"]'),
    ).toHaveAttribute("aria-pressed", "false");
    expect(errors).toEqual([]);
  });
}
