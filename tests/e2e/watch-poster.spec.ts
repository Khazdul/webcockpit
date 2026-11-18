// Stage 73 point 11 (ADR 0162 and its round 1 addendum): a shared run opens
// under its poster, paused at the start: frosted glass over the whole
// frame, the publication's title and description at the top, a play key in
// the middle, the character, date and length and the wordmark at the foot.
// The player's control box is hidden under it and shows once the run
// plays. Keys other than Enter and Space do nothing while it is up; a
// click anywhere on it takes it away and plays the run. No CSP violation
// in the frame (it is built without style attributes or markup).
//
// Desktop projects (Chromium and Firefox), the watch page's frame. The
// phone's is phone-watch-poster.spec.ts, the exported file's replay.spec.ts.
import { type Page, expect, test } from "@playwright/test";
import { openWatch, playing, poster, replay, setUp } from "./watch-page";

/** The frame's console lines that report a CSP violation. */
function cspLog(page: Page): string[] {
  const out: string[] = [];
  page.on("console", (m) => {
    if (/Content[- ]Security[- ]Policy|Refused to/i.test(m.text()))
      out.push(m.text());
  });
  return out;
}

const frameEngine = (
  page: Page,
): Promise<{ playing: boolean; position: number }> =>
  page
    .frames()
    .find((f) => f.url().endsWith("/r/frame"))!
    .evaluate(() => {
      const e = (
        window as unknown as {
          __wcReplay: {
            host: { engine: { playing: boolean; position: number } };
          };
        }
      ).__wcReplay.host.engine;
      return { playing: e.playing, position: e.position };
    });

test("the poster covers a shared run, holds it at the start, and a click plays it", async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const csp = cspLog(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await setUp(page);
  await openWatch(page);
  await playing(page);
  const p = poster(page);
  await expect(p).toBeVisible();
  await expect(p.locator(".wc-poster-title")).toHaveText(
    "Clearing the ranger camp",
  );
  await expect(p.locator(".wc-poster-desc")).toHaveText(
    "Norsy and Kuzzim join at the ford; the rangers first, then the acolytes.",
  );
  await expect(p.locator(".wc-poster-sub span").first()).toHaveText("Rasta");
  await expect(p.locator(".wc-poster-sub")).toHaveText(
    /^Rasta\d{4}-\d\d-\d\d\d+ (s|min)$/,
  );
  await expect(p.locator(".wc-poster-play")).toHaveAttribute(
    "aria-label",
    "Play Clearing the ranger camp",
  );
  await expect(p.locator(".wc-poster-logo")).toHaveAttribute(
    "aria-label",
    "MUME Cockpit",
  );

  // It covers exactly the frame; the title at the top centre, the key in the middle, the mark at the bottom right.
  const f = (await page.locator(".wc-watch-slot iframe").boundingBox())!;
  const b = (await p.boundingBox())!;
  for (const k of ["x", "y", "width", "height"] as const)
    expect(Math.abs(b[k] - f[k])).toBeLessThan(1);
  // The player's control box does not show under it.
  await expect(replay(page).locator(".wc-player-box")).toBeHidden();
  const t = (await p.locator(".wc-poster-title").boundingBox())!;
  expect(Math.abs(t.x + t.width / 2 - (f.x + f.width / 2))).toBeLessThan(4);
  expect(t.y).toBeLessThan(f.y + f.height / 4);
  const k = (await p.locator(".wc-poster-glyph").boundingBox())!;
  expect(Math.abs(k.x + k.width / 2 - (f.x + f.width / 2))).toBeLessThan(4);
  expect(Math.abs(k.y + k.height / 2 - (f.y + f.height / 2))).toBeLessThan(
    f.height / 8,
  );
  const m = (await p.locator(".wc-poster-logo").boundingBox())!;
  expect(m.x).toBeGreaterThan(f.x + f.width * 0.7);
  expect(m.y).toBeGreaterThan(f.y + f.height * 0.7);
  // The title's face is Cinzel (registered in the frame from the page's fonts).
  await expect
    .poll(() =>
      p
        .locator(".wc-poster-title")
        .evaluate(() => document.fonts.check("700 40px Cinzel")),
    )
    .toBe(true);
  if (info.project.name === "chromium")
    await page.screenshot({ path: "docs/stages/img/73-c-desktop.png" });

  // Paused at the start; the player's keys do nothing under it.
  await replay(page).locator(".wc-poster-title").hover();
  for (const key of ["ArrowRight", "f", "3", "ArrowDown"])
    await page.keyboard.press(key);
  await page.waitForTimeout(300);
  expect(await frameEngine(page)).toEqual({ playing: false, position: 0 });
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  await expect(p).toBeVisible();

  // A click anywhere on it (here: near a corner, not on the key) plays the run.
  await page.mouse.click(f.x + 40, f.y + f.height - 40);
  await expect(p).toHaveCount(0);
  await expect.poll(async () => (await frameEngine(page)).playing).toBe(true);
  await expect(replay(page).locator(".wc-player")).toBeVisible();
  // The control box is back.
  await expect(replay(page).locator(".wc-player-box")).toBeVisible();
  // The player's keys work again: F puts the frame in fullscreen, and the run fills it.
  await page.keyboard.press("f");
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement !== null))
    .toBe(true);
  await page.keyboard.press("f");
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement))
    .toBeNull();
  expect(csp).toEqual([]);
  expect(errors).toEqual([]);
});

test("Enter on the poster plays the run", async ({ page }) => {
  await setUp(page);
  await openWatch(page);
  await playing(page);
  await expect(poster(page)).toBeVisible();
  await replay(page).locator(".wc-poster-title").hover();
  // The page gives the frame the keys once the run is in.
  await page.keyboard.press("Enter");
  await expect(poster(page)).toHaveCount(0);
  await expect.poll(async () => (await frameEngine(page)).playing).toBe(true);
});
