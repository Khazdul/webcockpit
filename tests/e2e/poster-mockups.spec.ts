// Stage 73 round 1, points 3 and 4: the poster's three looks under
// comparison (`?poster=tv|glass|cinema` on the dev watch page), shot for
// the owner on a computer, a phone in portrait and a tablet in landscape.
// Not a test of behaviour (watch-poster.spec.ts and
// phone-watch-poster.spec.ts are): it only writes the mockup screenshots,
// so it runs only when asked:
//
//   WC_POSTER_MOCKUPS=1 npx playwright test poster-mockups --project=chromium
import { devices, expect, test } from "@playwright/test";
import { fakeAccountApi } from "./cloud-account-fake";
import { demoPayload, fakePubApi } from "./cloud-pub-fake";
import { ID, SENDER, openWatch, playing, poster } from "./watch-page";

test.skip(
  !process.env.WC_POSTER_MOCKUPS,
  "writes the round 1 poster mockups only when asked",
);

const LOOKS = ["tv", "glass", "cinema"] as const;
const DESCRIPTION =
  "Norsy and Kuzzim join at the ford; the rangers first, then the acolytes.\n" +
  "Kuzzim nearly falls at the second fire. We rest in the hollow and go back for the captain at dusk.";

const { defaultBrowserType: _, ...pixel7 } = devices["Pixel 7"];

const CASES = [
  { device: "desktop", use: {}, size: { width: 1440, height: 900 } },
  { device: "phone", use: pixel7, size: { width: 412, height: 839 } },
  { device: "tablet", use: pixel7, size: { width: 1180, height: 820 } },
] as const;

for (const c of CASES) {
  test.describe(c.device, () => {
    test.use(c.use);
    for (const look of LOOKS) {
      test(`the ${look} look`, async ({ page }, info) => {
        test.skip(info.project.name !== "chromium", "Chromium only");
        test.setTimeout(60_000);
        await page.setViewportSize(c.size);
        const api = await fakeAccountApi(page);
        api.server.flags = { accounts: true, share: true };
        const pubs = await fakePubApi(page, api);
        pubs.add({
          id: ID,
          owner: SENDER,
          title: "Clearing the ranger camp",
          description: DESCRIPTION,
          character: "Rasta",
          level: 42,
          lengthS: 4500,
          views: 37,
          payload: demoPayload(),
        });
        await openWatch(page, ID, `&poster=${look}`);
        await playing(page);
        const p = poster(page);
        await expect(p).toHaveAttribute("data-look", look);
        await expect(p.locator(".wc-poster-desc")).toContainText("Kuzzim");
        await expect
          .poll(() =>
            p.evaluate(() => document.fonts.check("700 40px Cinzel")),
          )
          .toBe(true);
        await page.waitForTimeout(400);
        const path = `docs/stages/img/73-r1-poster-${look}-${c.device}.png`;
        // A phone's frame runs below the window (the band above it): the frame alone.
        if (c.device === "phone")
          await page.locator(".wc-watch-slot iframe").screenshot({ path });
        else await page.screenshot({ path });
      });
    }
  });
}
