// Take B of the film (video/manuscript.md draft 3): the rest of part 3,
// parts 4 and 5, music from beat 125 (1:33.02) to about 3:11.
//
//   part 3   back into the inn (the cut from take A): the barman looks up,
//            offers the quest, Gittan nods; his monologue goes on behind the
//            Profile window (alias fk → kill wolf on the Lite form, then the
//            Editor) and the Scripts window (the list flicked, Mercenaries'
//            settings and help)
//   part 4   Exit to the start page; History, the Bree session's log player;
//            Spotlights, Rasta's PvP kill in the viewer
//   part 5   Credits, a page turned; back to the start page, which holds
//            under the montage and the end card
//
// Off camera the game is brought to the inn as take A left it: the run
// played fast from its start to 153.3 s (so Group, Timers and the map
// carry its state), Map, Group and Timers on, the weather effects on and
// following the game (night by then, indoors).
import { type Step, play, sleep } from '../../../scripts/lib/mume-feed.ts';
import { beatS } from '../../src/beats.ts';
import { arrival } from '../../feeds/arrival.ts';
import { BREE_RUN, FILM_BACKUP } from '../../feeds/film.ts';
import { FILM_PAGE, freshStart, prepareFilm } from '../lib/film-state.ts';
import { Pointer, seeded } from '../lib/mouse.ts';
import { type LoginMock, mockMumeLogin } from '../lib/mume-login.ts';
import { excerptFeed, loadBackup } from '../lib/run-feed.ts';
import type { Scene } from '../lib/scene.ts';

/** The take's camera rolls at this music time (s); the film cuts to it on beat 125. */
export const TAKE_B_FROM = beatS(125) - 1.0;
export const TAKE_B_END = beatS(256);

const SEED = 20261109;

export const takeB: Scene = {
  mode: 'intel-1.2-png',
  page: FILM_PAGE,

  async setup(page) {
    await prepareFilm(page);
    await page.evaluate(() => {
      type D = { weather: { enabled: boolean }; panes: Record<string, { on: boolean }>; profile: string; windows: Record<string, unknown> };
      const wc = (window as unknown as { __wc: { settings: { update(fn: (d: D) => void): void } } }).__wc;
      wc.settings.update((d) => {
        d.weather.enabled = true;
        d.panes.map!.on = true;
        d.panes.group!.on = true;
        d.panes.timers!.on = true;
        // as part 1 left it
        d.profile = 'khazdul';
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
    // The run fast, to just before the inn.
    const runs = loadBackup(FILM_BACKUP);
    const before = excerptFeed(runs, { run: BREE_RUN, from: 0.5, to: 153.3, primeFrom: 0.5, dropCmds: [/^change width/] });
    await play(page, server, before.steps.map(({ at: _at, ...s }) => s as Step));
    await page.locator('.wc-input-field').fill('');
    // the inn and the barman (music 93.3 to about 109), then his monologue behind the windows
    const inn = excerptFeed(runs, { run: BREE_RUN, from: 153.3, to: 172.6, primeFrom: 153.3, speed: 1.17 });
    const talk = excerptFeed(runs, { run: BREE_RUN, from: 172.6, to: 248, primeFrom: 172.6, speed: 3.1 });
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
    const B = (n: number): number => T(beatS(n));
    const until = async (ms: number): Promise<void> => {
      const w = ms - Date.now();
      if (w > 0) await sleep(w);
    };
    const pointer = new Pointer(page, SEED, { x: 1500, y: 860 });

    const game = (async () => {
      await until(T(93.3));
      marks.mark('segment', 'inn');
      await play(page, server, state.inn as Step[], { typeDelay: 90, onStep: (s) => ('cmd' in s ? marks.mark('cmd', s.cmd) : undefined) });
      await until(T(109.6));
      marks.mark('segment', 'monologue');
      await play(page, server, state.talk as Step[]);
    })();

    const ui = async (): Promise<void> => {
      const mb = (id: string) => page.locator(`.wc-mb[data-mb="${id}"]`);
      // Profile: a new alias on the Lite form, then the Editor
      marks.markAt(await pointer.clickAt(mb('profile'), B(147)), 'profile', 'the Profile window');
      const pe = page.locator('.wc-win[data-win="profile"] .wc-frame:not([hidden]) .wc-pe');
      await pointer.clickAt(pe.locator('.wc-pe-rit[data-rail="alias"]'), B(149));
      marks.markAt(await pointer.clickAt(pe.locator('[data-btn="NEW"]'), B(150)), 'alias-new', 'New entry');
      const rnd = seeded(SEED + 1);
      const type = async (text: string): Promise<void> => {
        for (const ch of text) {
          await page.keyboard.type(ch);
          await sleep(80 + rnd() * 110);
        }
      };
      await sleep(350);
      await type('fk');
      await sleep(300);
      await page.keyboard.press('Tab');
      await sleep(250);
      await type('kill wolf');
      await sleep(500);
      await page.keyboard.press('Escape');
      marks.mark('alias', 'fk → kill wolf');
      marks.markAt(await pointer.clickAt(pe.locator('.wc-pe-views [data-opt="editor"]'), B(156)), 'editor', 'the Editor view');
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
      await until(B(162));
      await page.locator('.wc-win[data-win="profile"] .wc-win-x').click().catch(() => page.keyboard.press('Escape'));
      // Scripts: the list flicked on the beat, Mercenaries' settings and help
      marks.markAt(await pointer.clickAt(mb('scripts'), B(163)), 'scripts', 'the Scripts window');
      const sw = page.locator('.wc-win[data-win="scripts"]');
      for (const [i, n] of ['coinlooter', 'keymanager', 'mapsearch', 'mercenaries'].entries()) {
        marks.markAt(await pointer.clickAt(sw.locator(`.wc-scr-row[data-name="${n}"] .wc-scr-name`).first(), B(165 + i * 2)), 'script', n);
      }
      await until(B(175));
      await page.keyboard.press('Escape');
      // Exit to the start page on beat 179
      await pointer.clickAt(mb('exit'), B(177));
      marks.markAt(await pointer.clickAt(page.locator('.wc-pop-exit [data-act="exit"]'), B(179)), 'exit', 'Exit to the start page');
      // History: the Bree session (12:07, under this take's own run), its log player
      const menu = (key: string) => page.locator(`.wc-start .wc-sm-item[data-key="${key}"] .wc-sm-label`).first();
      marks.markAt(await pointer.clickAt(menu('history'), B(181)), 'history', 'History');
      const hist = page.locator('.wc-start .wc-frame:not([hidden]) .wc-hist');
      await hist.locator('.wc-lk-tr').first().waitFor();
      const bree = hist.locator('.wc-lk-tr', { hasText: '12:07' }).first();
      await pointer.clickAt((await bree.count()) ? bree : hist.locator('.wc-lk-tr').nth(1), B(183));
      marks.markAt(await pointer.clickAt(hist.locator('.wc-lk-btn[data-btn="RUN LOG"]'), B(185)), 'runlog', 'the log player');
      const engine = 'window.__wc.shell.playerHost.engine';
      await page.waitForFunction(`window.__wc.shell.playerHost?.engine?.duration > 0`, undefined, { timeout: 15_000 });
      // into the wolf fight, and play
      await page.evaluate(`${engine}.seek(Math.min(${engine}.duration * 0.18, 122e6))`).catch(() => {});
      await until(B(193));
      await page.keyboard.press('Escape');
      await sleep(400);
      await page.keyboard.press('Escape');
      // Spotlights: the wall, Rasta's PvP kill in the viewer
      marks.markAt(await pointer.clickAt(menu('spotlights'), B(195)), 'spotlights', 'Spotlights');
      const wall = page.locator('.wc-start .wc-frame:not([hidden]) .wc-spw');
      await wall.locator('.wc-spw-card').first().waitFor();
      const rasta = wall.locator('.wc-spw-card', { hasText: 'Rasta' }).first();
      await pointer.clickAt(rasta, B(198));
      // Enter opens the chosen card in the viewer
      await until(B(199));
      await page.keyboard.press('Enter');
      marks.mark('viewer', 'the Spotlight viewer');
      await until(B(209));
      await page.keyboard.press('Escape');
      await sleep(400);
      await page.keyboard.press('Escape');
      // Credits: the book, a page turned
      marks.markAt(await pointer.clickAt(menu('credits'), B(211)), 'credits', 'Credits');
      const book = page.locator('.wc-start .wc-frame:not([hidden])');
      marks.markAt(await pointer.clickAt(book.locator('[data-btn="next"]').first(), B(215)), 'page', 'a page turned');
      await until(B(221));
      // Back to the start page: it holds under the montage and the end card; the hand leaves the mouse
      await page.keyboard.press('Escape');
      marks.mark('start-again', 'the start page');
    };

    await Promise.all([game, ui()]);
    await until(T(TAKE_B_END));
    marks.mark('active-end', 'the take');
  },
};

