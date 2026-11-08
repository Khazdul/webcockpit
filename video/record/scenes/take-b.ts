// Take B of the film (video/manuscript.md; owner round 1): the rest of
// part 3, parts 4 and 5, music from beat 140 (1:44.13) to the end.
//
//   part 3   into the inn (the cut from take A): the barman looks up, offers
//            the quest, Gittan nods; his monologue goes on behind the Profile
//            window (caption first, the pointer slowly to the icon, its
//            tooltip, then the click; alias fk → kill wolf on the Lite form,
//            the Editor) and the Scripts window (the same way; the list
//            flicked, Mercenaries' settings and help)
//   part 4   Exit on beat 179; the start page a moment; History, the Bree
//            session's log player; Spotlights, the wall a while, Rasta's PvP
//            kill in the viewer
//   part 5   Credits held, Back; the start page holds under the end card
//
// Off camera the game is brought to the inn as take A left it: the run
// played fast from its start to 155.5 s (so Group, Timers and the map carry
// its state), Map, Group (unlabelled NPCs, Fight card) and Timers on, the
// weather effects on and following the game (night by then, indoors).
import { type Step, play, sleep } from '../../../scripts/lib/mume-feed.ts';
import { beatS } from '../../src/beats.ts';
import { arrival } from '../../feeds/arrival.ts';
import { BREE_RUN, FILM_BACKUP, noPonyLabel } from '../../feeds/film.ts';
import { FILM_PAGE, freshStart, prepareFilm } from '../lib/film-state.ts';
import { Pointer, seeded } from '../lib/mouse.ts';
import { type LoginMock, mockMumeLogin } from '../lib/mume-login.ts';
import { excerptFeed, loadBackup } from '../lib/run-feed.ts';
import type { Scene } from '../lib/scene.ts';

/** The take's camera rolls at this music time (s); the film cuts to it on beat 140 (1:44.13). */
export const TAKE_B_FROM = beatS(140) - 1.0;
export const TAKE_B_END = beatS(256);

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
      await until(T(104.3));
      marks.mark('segment', 'inn');
      await play(page, server, state.inn as Step[], { typeDelay: 90, onStep: (s) => ('cmd' in s ? marks.mark('cmd', s.cmd) : undefined) });
      await until(T(109.7));
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
      // Profile: a new alias on the Lite form, then the Editor
      marks.markAt(await iconClick('profile', b(147) + 1.9, b(151)), 'profile', 'the Profile window');
      const pe = page.locator('.wc-win[data-win="profile"] .wc-frame:not([hidden]) .wc-pe');
      await pointer.clickAt(pe.locator('.wc-pe-rit[data-rail="alias"]'), B(152));
      marks.markAt(await pointer.clickAt(pe.locator('[data-btn="NEW"]'), B(153)), 'alias-new', 'New entry');
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
      marks.markAt(await pointer.clickAt(pe.locator('.wc-pe-views [data-opt="editor"]'), B(158)), 'editor', 'the Editor view');
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
      // the found line held about two seconds
      await until(Math.max(B(163) - 300, Date.now() + 2000));
      marks.mark('profile-closed', 'the Profile window closes');
      await page.locator('.wc-win[data-win="profile"] .wc-win-x').click().catch(() => page.keyboard.press('Escape'));
      // Scripts: the list flicked on the beat, Mercenaries' settings and help
      marks.markAt(await iconClick('scripts', b(165) + 1.7, b(170)), 'scripts', 'the Scripts window');
      const sw = page.locator('.wc-win[data-win="scripts"]');
      for (const [i, n] of ['coinlooter', 'keymanager', 'mapsearch', 'mercenaries'].entries()) {
        marks.markAt(await pointer.clickAt(sw.locator(`.wc-scr-row[data-name="${n}"] .wc-scr-name`).first(), B(171 + i), { quick: true }), 'script', n);
      }
      await until(T(b(176) + 0.2));
      await page.keyboard.press('Escape');
      marks.mark('scripts-closed', 'the Scripts window closes');
      // Exit to the start page on beat 179
      marks.markAt(await pointer.clickAt(mb('exit'), B(177)), 'exit-icon', 'the Exit icon');
      marks.markAt(await pointer.clickAt(page.locator('.wc-pop-exit [data-act="exit"]'), B(179), { quick: true }), 'exit', 'Exit to the start page');
      // The start page a moment, then History: the Bree session (12:07, under this take's own run), its log player
      const menu = (key: string) => page.locator(`.wc-start .wc-sm-item[data-key="${key}"] .wc-sm-label`).first();
      marks.markAt(await pointer.clickAt(menu('history'), B(183)), 'history', 'History');
      const hist = page.locator('.wc-start .wc-frame:not([hidden]) .wc-hist');
      await hist.locator('.wc-lk-tr').first().waitFor();
      const bree = hist.locator('.wc-lk-tr', { hasText: '12:07' }).first();
      await pointer.clickAt((await bree.count()) ? bree : hist.locator('.wc-lk-tr').nth(1), B(186));
      marks.markAt(await pointer.clickAt(hist.locator('.wc-lk-btn[data-btn="RUN LOG"]'), B(188)), 'runlog', 'the log player');
      const engine = 'window.__wc.shell.playerHost.engine';
      await page.waitForFunction(`window.__wc.shell.playerHost?.engine?.duration > 0`, undefined, { timeout: 15_000 });
      // into the wolf fight, and play
      await page.evaluate(`${engine}.seek(Math.min(${engine}.duration * 0.18, 122e6))`).catch(() => {});
      await until(B(199));
      await page.keyboard.press('Escape');
      await sleep(400);
      await page.keyboard.press('Escape');
      // Spotlights: the wall a while, then Rasta's PvP kill in the viewer
      marks.markAt(await pointer.clickAt(menu('spotlights'), B(202)), 'spotlights', 'Spotlights');
      const wall = page.locator('.wc-start .wc-frame:not([hidden]) .wc-spw');
      await wall.locator('.wc-spw-card').first().waitFor();
      const rasta = wall.locator('.wc-spw-card', { hasText: 'Rasta' }).first();
      await pointer.clickAt(rasta, B(206));
      // Enter opens the chosen card in the viewer
      await until(B(207));
      await page.keyboard.press('Enter');
      marks.mark('viewer', 'the Spotlight viewer');
      await until(B(216));
      await page.keyboard.press('Escape');
      await sleep(400);
      await page.keyboard.press('Escape');
      // Credits: the book held, no page turned; Back
      marks.markAt(await pointer.clickAt(menu('credits'), B(219)), 'credits', 'Credits');
      marks.markAt(await pointer.clickAt(page.locator('.wc-start button[aria-label="Back (Esc)"]').first(), B(226)), 'credits-back', 'Back from Credits');
      marks.mark('start-again', 'the start page');
      // The quote fades as the end card comes in (beat 229); the hand has left the mouse
      await until(B(228));
      await page.addStyleTag({ content: '.wc-start .wc-sm-quote { transition: opacity 0.8s ease !important; opacity: 0 !important; }' });
      marks.mark('quote-hidden', 'the quote fades for the end card');
    };

    await Promise.all([game, ui()]);
    await until(T(TAKE_B_END));
    marks.mark('active-end', 'the take');
  },
};
