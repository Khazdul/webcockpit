// Take B of the film (video/manuscript.md; owner rounds 1 and 2): the rest
// of part 3, parts 4 and 5, music from beat 155 (1:55.24) to the end.
//
//   part 3   into the inn (the cut from take A): the barman looks up, offers
//            the quest, Gittan nods; his monologue goes on behind the Profile
//            window (caption first, the pointer slowly to the icon, its
//            tooltip, then the click; alias fk → kill wolf on the Lite form,
//            the Editor, the found line held about 5 s) and the Scripts window
//            (the same way; three rows, slowly, ending on Almanac)
//   part 4   Exit on beat 199; the start page a moment; History, the Bree
//            session's log player (small text, a narrower right dock);
//            Spotlights, the wall a while, Play all until the first
//            spotlight's moment, Back to the wall, Back to the start page
//   part 5   Credits held, Back; the start page under the end card
//
// Off camera the game is brought to the inn as take A left it: the run
// played fast from its start to 155.5 s, Map docked, Group (unlabelled NPCs,
// Fight card) and Timers floating, the weather effects on and following the
// game (night by then, indoors).
import type { Locator } from '@playwright/test';
import { type Step, play, sleep } from '../../../scripts/lib/mume-feed.ts';
import { beatS } from '../../src/beats.ts';
import { arrival } from '../../feeds/arrival.ts';
import { BREE_RUN, FILM_BACKUP, noPonyLabel } from '../../feeds/film.ts';
import { FILM_PAGE, freshStart, prepareFilm } from '../lib/film-state.ts';
import { Pointer, seeded } from '../lib/mouse.ts';
import { type LoginMock, mockMumeLogin } from '../lib/mume-login.ts';
import { excerptFeed, loadBackup } from '../lib/run-feed.ts';
import type { Scene } from '../lib/scene.ts';

/** The take's camera rolls at this music time (s); the film cuts to it on beat 155 (1:55.24). */
export const TAKE_B_FROM = beatS(155) - 1.0;
export const TAKE_B_END = beatS(262);

const SEED = 20261109;
const b = beatS;

export const takeB: Scene = {
  mode: 'intel-1.2-png',
  page: FILM_PAGE,

  async setup(page) {
    // (film-state keeps MUME's clock the film's: the run's GMCP would turn the start page to its evening)
    await prepareFilm(page);
    await page.evaluate(() => {
      type D = {
        weather: { enabled: boolean };
        panes: Record<string, { on: boolean }>;
        profile: string;
        windows: Record<string, unknown>;
        group: { npcMode: string; fight: boolean };
        timers: { layout: string; cols: number | string; style: string; groups: Record<string, { enabled: boolean }> };
      };
      const wc = (window as unknown as { __wc: { settings: { update(fn: (d: D) => void): void } } }).__wc;
      wc.settings.update((d) => {
        d.weather.enabled = true;
        d.panes.map!.on = true;
        d.panes.group!.on = true;
        d.panes.timers!.on = true;
        // as take A left them
        d.profile = 'khazdul';
        d.group.npcMode = 'all';
        d.group.fight = true;
        d.timers.groups.herb!.enabled = false;
        d.timers.layout = 'grid';
        d.timers.cols = 2;
        d.timers.style = 'bars';
        // the windows a little shorter than their default, so the lower thirds sit below them (cells)
        d.windows = { ...d.windows, profile: { x: 12, y: 4, w: 142, h: 37 }, scripts: { x: 12, y: 4, w: 142, h: 37 } };
      });
    });
    await page.waitForTimeout(600);
    const login = await mockMumeLogin(page);
    await freshStart(page);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => /^login/.test(document.querySelector('.wc-app')?.getAttribute('data-status') ?? ''));
    await sleep(1500);
    await page.locator('.wc-input-field').focus();
    await page.keyboard.type('Gittan\n', { delay: 30 });
    await sleep(400);
    await page.keyboard.type('starlight\n', { delay: 30 });
    await sleep(500);
    const server = login.server()!;
    const a = arrival();
    server.send('out' in a.arrive ? a.arrive.out : Buffer.alloc(0));
    // The run fast, to just before the inn (the pony never labelled, as in take A).
    const runs = loadBackup(FILM_BACKUP);
    const before = excerptFeed(runs, { run: BREE_RUN, from: 0.5, to: 155.5, primeFrom: 0.5, dropCmds: [/^change width/, /^label pony/], rewrite: noPonyLabel });
    await play(page, server, before.steps.map(({ at: _at, ...s }) => s as Step));
    await page.locator('.wc-input-field').fill('');
    // the barman looks up, offers, Gittan nods (music 104.3 to 109.3); then his monologue behind the windows
    const inn = excerptFeed(runs, { run: BREE_RUN, from: 155.5, to: 172.6, primeFrom: 155.5, speed: 3.2, rewrite: noPonyLabel });
    const talk = excerptFeed(runs, { run: BREE_RUN, from: 172.6, to: 248, primeFrom: 172.6, speed: 3.2, rewrite: noPonyLabel });
    await sleep(2500);
    await page.mouse.move(1500, 860);
    return { login, server, inn: inn.steps, talk: talk.steps };
  },

  async run({ page, marks }, state) {
    const server = (state.login as LoginMock).server()!;
    const t0 = Date.now();
    marks.mark('active', 'the take');
    // music time of the take's start
    const music0 = t0 - TAKE_B_FROM * 1000;
    // music 0:00 lies before the take: the composition reads the take's music time from this marker's label
    marks.markAt(t0, 'musicfrom', String(TAKE_B_FROM));
    const T = (s: number): number => music0 + s * 1000;
    const B = (n: number): number => T(b(n));
    const until = async (ms: number): Promise<void> => {
      const w = ms - Date.now();
      if (w > 0) await sleep(w);
    };
    const pointer = new Pointer(page, SEED, { x: 1500, y: 860 });

    const game = (async () => {
      await until(T(113.4));
      marks.mark('segment', 'inn');
      await play(page, server, state.inn as Step[], { typeDelay: 90, onStep: (s) => ('cmd' in s ? marks.mark('cmd', s.cmd) : undefined) });
      await until(T(119.0));
      marks.mark('segment', 'monologue');
      await play(page, server, state.talk as Step[]);
    })();

    const ui = async (): Promise<void> => {
      const mb = (id: string) => page.locator(`.wc-mb[data-mb="${id}"]`);
      /** The caption is up first; the pointer goes slowly to a menu-bar icon, waits for its tooltip, holds it, clicks. */
      const iconClick = async (id: string, arrive: number, press: number): Promise<number> => {
        await pointer.hoverAt(mb(id), T(arrive), { slow: true });
        await page.locator('.wc-mb-tip').waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
        marks.mark('tooltip', id);
        // the tooltip held at least a second
        return pointer.pressAt(Math.max(T(press), Date.now() + 1000));
      };
      /** A calm press: the pointer onto it, a short hover so the eye finds it, then the press. */
      const calm = async (el: Locator, at: number, hover = 0.7): Promise<number> => {
        await pointer.hoverAt(el, T(at - hover));
        return pointer.pressAt(T(at));
      };
      // Profile: a new alias on the Lite form, then the Editor
      marks.markAt(await iconClick('profile', 121.6, 122.9), 'profile', 'the Profile window');
      const pe = page.locator('.wc-win[data-win="profile"] .wc-frame:not([hidden]) .wc-pe');
      await pointer.clickAt(pe.locator('.wc-pe-rit[data-rail="alias"]'), T(124.2));
      marks.markAt(await pointer.clickAt(pe.locator('[data-btn="NEW"]'), T(125.0)), 'alias-new', 'New entry');
      const rnd = seeded(SEED + 1);
      const type = async (text: string): Promise<void> => {
        for (const ch of text) {
          await page.keyboard.type(ch);
          await sleep(60 + rnd() * 80);
        }
      };
      await sleep(250);
      await type('fk');
      await sleep(200);
      await page.keyboard.press('Tab');
      await sleep(150);
      await type('kill wolf');
      await sleep(350);
      await page.keyboard.press('Escape');
      marks.mark('alias', 'fk → kill wolf');
      marks.markAt(await pointer.clickAt(pe.locator('.wc-pe-views [data-opt="editor"]'), T(128.2)), 'editor', 'the Editor view');
      await sleep(700);
      // The new line in view: khazdul is long, so the editor's Find goes to it.
      const line = pe.locator('.cm-line', { hasText: '#alias {fk} {kill wolf}' });
      if (!(await line.count())) {
        await page.keyboard.press('Control+f');
        await sleep(300);
        await type('{fk}');
        await page.keyboard.press('Enter');
        marks.mark('find', 'Find {fk}');
      }
      // the found line held about five seconds (owner round 2)
      await sleep(5000);
      marks.mark('profile-closed', 'the Profile window closes');
      await page.locator('.wc-win[data-win="profile"] .wc-win-x').click().catch(() => page.keyboard.press('Escape'));
      // Scripts: a few rows, slowly, ending on Almanac (its settings and help)
      marks.mark('scripts-caption', 'the Scripts caption');
      const scriptsAt = (Date.now() - music0) / 1000;
      marks.markAt(await iconClick('scripts', scriptsAt + 1.8, scriptsAt + 3.0), 'scripts', 'the Scripts window');
      const sw = page.locator('.wc-win[data-win="scripts"]');
      const s0 = (Date.now() - music0) / 1000;
      for (const [i, n] of ['mapsearch', 'coinlooter', 'almanac'].entries()) {
        marks.markAt(await pointer.clickAt(sw.locator(`.wc-scr-row[data-name="${n}"] .wc-scr-name`).first(), T(s0 + 1.3 + i * 1.4)), 'script', n);
      }
      await until(Math.max(T(b(199)) - 3000, Date.now() + 2500));
      await page.keyboard.press('Escape');
      marks.mark('scripts-closed', 'the Scripts window closes');
      // Exit to the start page on beat 199 (2:27.83), a downbeat
      marks.markAt(await pointer.clickAt(mb('exit'), T(b(199)) - 1300), 'exit-icon', 'the Exit icon');
      marks.markAt(await pointer.clickAt(page.locator('.wc-pop-exit [data-act="exit"]'), B(199), { quick: true }), 'exit', 'Exit to the start page');
      // The start page a moment, then History: the Bree session (12:07, under this take's own run), its log player
      const menu = (key: string) => page.locator(`.wc-start .wc-sm-item[data-key="${key}"] .wc-sm-label`).first();
      marks.markAt(await pointer.clickAt(menu('history'), B(199) + 2200), 'history', 'History');
      const hist = page.locator('.wc-start .wc-frame:not([hidden]) .wc-hist');
      await hist.locator('.wc-lk-tr').first().waitFor();
      const bree = hist.locator('.wc-lk-tr', { hasText: '12:07' }).first();
      await pointer.clickAt((await bree.count()) ? bree : hist.locator('.wc-lk-tr').nth(1), B(199) + 3800);
      marks.markAt(await pointer.clickAt(hist.locator('.wc-lk-btn[data-btn="RUN LOG"]'), B(199) + 5200), 'runlog', 'the log player');
      const engine = 'window.__wc.shell.playerHost.engine';
      await page.waitForFunction(`window.__wc.shell.playerHost?.engine?.duration > 0`, undefined, { timeout: 15_000 });
      // The player: small text; its right dock about 20 % narrower, its columns equally wide (owner round 2)
      await page.evaluate(() => {
        type Lane = { size: number };
        const h = (window as unknown as { __wc: { shell: { playerHost: { app: { settings: { get(): { layout: { docks: { right: { lanes: Lane[] } } } } } }; setViewer(o: unknown): void; viewerOverrides: Record<string, unknown> } } } }).__wc.shell.playerHost;
        const layout = JSON.parse(JSON.stringify(h.app.settings.get().layout)) as { docks: { right: { lanes: Lane[] } } };
        const lanes = layout.docks.right.lanes;
        if (lanes.length) {
          const w = Math.round((lanes.reduce((a, l) => a + l.size, 0) / lanes.length) * 0.8);
          for (const l of lanes) l.size = w;
        }
        h.setViewer({ ...h.viewerOverrides, font: 'small', layout });
      });
      marks.mark('player-small', 'small text, narrower panes');
      // into the wolf fight, and play
      await page.evaluate(`${engine}.seek(Math.min(${engine}.duration * 0.18, 122e6))`).catch(() => {});
      await until(B(199) + 10000);
      await page.keyboard.press('Escape');
      await sleep(400);
      await page.keyboard.press('Escape');
      marks.mark('history-closed', 'back on the start page');
      // Spotlights: the wall a while, then Play all, until the first spotlight's moment
      const sp0 = (Date.now() - music0) / 1000 + 0.6;
      marks.markAt(await pointer.clickAt(menu('spotlights'), T(sp0)), 'spotlights', 'Spotlights');
      const wall = page.locator('.wc-start .wc-frame:not([hidden]) .wc-spw');
      await wall.locator('.wc-spw-card').first().waitFor();
      marks.markAt(await calm(page.locator('.wc-start [data-btn="PLAY"]').first(), sp0 + 3.2, 0.7), 'play-all', 'Play all');
      await page
        .locator('.wc-spv .wc-output', { hasText: /death cry|last breath|is dead! R\.I\.P\.|You are dead!/i })
        .first()
        .waitFor({ timeout: 25_000 })
        .catch(() => {});
      marks.mark('moment', 'the first spotlight\'s moment');
      await sleep(1000);
      // Back, calmly: out of the player, then out of Spotlights
      const m1 = (Date.now() - music0) / 1000;
      // the box's Back: out of the player to the wall (Back to the wall shows only at the reel's end)
      marks.markAt(await calm(page.locator('.wc-start button[aria-label="Back (Esc)"]').first(), m1 + 1.2, 0.6), 'back-wall', 'Back to the wall');
      await sleep(400);
      const m2 = (Date.now() - music0) / 1000;
      marks.markAt(await calm(page.locator('.wc-start button[aria-label="Back (Esc)"]').first(), m2 + 1.2, 0.6), 'back-start', 'Back to the start page');
      // Credits: the book held, no page turned; Back
      const c0 = (Date.now() - music0) / 1000 + 0.8;
      marks.markAt(await pointer.clickAt(menu('credits'), T(c0)), 'credits', 'Credits');
      marks.markAt(await calm(page.locator('.wc-start button[aria-label="Back (Esc)"]').first(), c0 + 4.9, 0.6), 'credits-back', 'Back from Credits');
      marks.mark('start-again', 'the start page');
      // The quote fades as the end card comes in; the hand has left the mouse
      await sleep(400);
      await page.addStyleTag({ content: '.wc-start .wc-sm-quote { transition: opacity 0.8s ease !important; opacity: 0 !important; }' });
      marks.mark('quote-hidden', 'the quote fades for the end card');
    };

    await Promise.all([game, ui()]);
    // the end card holds over the start page, then the Film fades (it reads the time from `start-again`)
    await until(Math.max(T(TAKE_B_END), Date.now() + 10_000));
    marks.mark('active-end', 'the take');
  },
};
