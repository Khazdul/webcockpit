// Film 2, act 6's phone shot (video/manuscript-2.md draft 2): right after
// the desktop made the film's account (film2-b), the same account on a
// phone. 390 × 844 CSS, mobile and touch, DPR 1.2 (the device act's phone).
//
// Off camera: the cloud fakes with the captured community and the film's
// account (record/lib/community.ts); Log in on the phone's start page,
// which reloads into the account's space; the film's runs restored there
// (the desktop moved its runs into the account as it was made: on the
// fakes, this take is a browser of its own, so the account's runs are put
// in place here); profile khazdul, as on the desktop; the start page at
// the same night as the desktop's.
//
// On camera (from `film0`, also its `sync` for the device frame): the start
// page with the owner row naming the account, a tap on History, the Bree
// session first in Sessions with its card.
import { readFileSync } from 'node:fs';
import { sleep, startMenu } from '../../../scripts/lib/mume-feed.ts';
import { PHONE_SHOT } from '../../src/devices.ts';
import { FILM_BACKUP } from '../../feeds/film.ts';
import { communityServer, serveCommunity } from '../lib/community.ts';
import { freshStart } from '../lib/film-state.ts';
import type { Scene } from '../lib/scene.ts';
import { ACT6_NIGHT, FILM_ACCOUNT, takeBPage } from './film2-b.ts';


export const film2Phone: Scene = {
  mode: 'intel-1.2-png',
  get page() {
    return { ...takeBPage(), viewport: { width: 390, height: 844 }, mobile: true };
  },

  async setup(page) {
    const c = await communityServer({ account: { ...FILM_ACCOUNT } });
    await serveCommunity(page, c);
    await page.route('**/__film/runs.jsonl.gz', (r) => r.fulfill({ body: readFileSync(FILM_BACKUP), contentType: 'application/gzip' }));
    // The film's clock guard (as prepareFilm): only the film's own writes reach `wc.clock`.
    await page.context().addInitScript(() => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
        if (k === 'wc.clock' && !(window as unknown as { __filmClockOk?: boolean }).__filmClockOk) return;
        set.call(this, k, v);
      };
    });
    await page.goto('/?cloudtest');
    await startMenu(page);
    const frame = page.locator('.wc-start .wc-frame:not([hidden])');
    await page.locator('.wc-start .wc-sm-item[data-key="owner"]').tap();
    await frame.locator('[data-field="name"] input').fill(FILM_ACCOUNT.name);
    await frame.locator('[data-field="password"] input').fill(FILM_ACCOUNT.password);
    await frame.locator('[data-btn="LOGIN"]').tap();
    await page.waitForFunction((n) => localStorage.getItem('wc.space')?.includes(`"${n}"`) === true, FILM_ACCOUNT.name, { timeout: 20_000 });
    await sleep(2500);
    await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
    await page.evaluate(async () => {
      type W = { __wc: { runs(): Promise<{ restore(b: Blob): Promise<unknown> }>; settings: { update(fn: (d: { profile: string }) => void): void } } };
      const wc = (window as unknown as W).__wc;
      const lib = await wc.runs();
      await lib.restore(await (await fetch('/__film/runs.jsonl.gz')).blob());
      wc.settings.update((d) => {
        d.profile = 'khazdul';
      });
    });
    await sleep(800);
    await freshStart(page, ACT6_NIGHT + 1, 'cloudtest');
    await page.locator('.wc-start .wc-sm-item[data-key="owner"]', { hasText: FILM_ACCOUNT.name }).waitFor({ timeout: 15_000 });
    await sleep(2500);
    return {};
  },

  async run({ page, marks }) {
    marks.mark('active', 'the take');
    const film0 = Date.now() + 600;
    marks.markAt(film0, 'film0', 'the phone shot');
    marks.markAt(film0, 'sync', 'the phone shot');
    const until = async (s: number): Promise<void> => {
      const w = film0 + s * 1000 - Date.now();
      if (w > 0) await sleep(w);
    };
    await until(PHONE_SHOT.history);
    await page.locator('.wc-start .wc-sm-item[data-key="history"]').tap();
    marks.mark('history', 'History');
    const row = page.locator('.wc-start .wc-frame:not([hidden]) .wc-hist .wc-lk-tr', { hasText: '12:07' }).first();
    await row.waitFor({ timeout: 8000 }).catch(() => console.warn('  no Bree session on the phone'));
    await until(PHONE_SHOT.end + 0.5);
    marks.mark('active-end', 'the take');
  },
};
